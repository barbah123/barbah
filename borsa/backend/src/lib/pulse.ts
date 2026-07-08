// NABIZ DEDEKTÖRÜ (erken momentum yakalayıcı)
// Amaç: SLBT tipi hareketleri gün sonunda değil, BAŞLARKEN yakalamak.
// 5 dakikada bir (cron) tüm evren + sıcak semboller taranır:
//   tetik  → son ~15 dk'da hızlı yükseliş VE gün henüz erken safhada
//   teyit  → son barların hacmi normal bar hacminin katbekat üstünde
//   çıktı  → anında Telegram alarmı + pulse_alerts kaydı + sembol sıcak listeye
// Sıcak listedeki semboller sonraki günlerde de izlenir (tekrar pump riski).

import { fetchSpark, getDynamicSymbols, SCAN_UNIVERSE, type SparkSeries } from './scanner';
import { getCandles } from './data';
import { getIntel } from './intel';
import { sendTelegram, telegramConfigured, type TelegramEnv } from './telegram';

// Tetik eşikleri
const BURST_WINDOW_BARS = 3; // ~15 dk (3 x 5dk bar)
const MIN_BURST_PCT = 2.0; // son 15 dk'da en az +%2
const MIN_DAY_PCT = 0.5; // gün en az hafif artıda (düşen bıçak değil)
const MAX_DAY_PCT = 15; // gün +%15'i geçtiyse "erken" değildir, kovalamayız
const MIN_PRICE = 3; // penny hisse eleme
const MIN_REL_VOLUME = 2.5; // son barlar normalin en az 2.5 katı hacimli olmalı
const MIN_AVG_DOLLAR_VOL = 300_000; // günlük ortalama dolar hacmi tabanı (likidite)
const DATA_FRESH_SECONDS = 15 * 60;
const REALERT_COOLDOWN_MINUTES = 120; // aynı sembole 2 saat içinde ikinci alarm yok
const MAX_CONFIRM_PER_CYCLE = 6; // hacim teyidi (sembol başına 1 istek) tavanı
const HOT_LOOKBACK_DAYS = 3;
// ABD seansı (UTC): alarmlar yalnızca seans içinde üretilir
// (6 Tem: kapanıştan sonra 23:05 TSİ'de işlem yapılamayan AAMI alarmı geldi)
const SESSION_OPEN_MIN = 13 * 60 + 30;
const SESSION_CLOSE_MIN = 20 * 60;

function inSession(): boolean {
  const d = new Date();
  const day = d.getUTCDay();
  const minutes = d.getUTCHours() * 60 + d.getUTCMinutes();
  return day >= 1 && day <= 5 && minutes >= SESSION_OPEN_MIN && minutes < SESSION_CLOSE_MIN;
}

export interface PulseAlert {
  id: string;
  symbol: string;
  price: number;
  change_15m: number;
  day_change: number;
  rel_volume: number | null;
  note: string | null;
  created_at: string;
}

export interface PulseResult {
  ran: boolean;
  skippedReason?: string;
  scannedCount: number;
  triggered: string[]; // tetiklenen semboller (teyit öncesi)
  alerts: PulseAlert[];
  notified: number;
}

/** Sıcak sembol hafızası: son günlerde alarm/tarama listesine girenler. */
export async function getHotSymbols(db: D1Database): Promise<string[]> {
  const { results } = await db
    .prepare(
      `SELECT DISTINCT symbol FROM hot_symbols WHERE day >= date('now', ?) LIMIT 60`
    )
    .bind(`-${HOT_LOOKBACK_DAYS} days`)
    .all<{ symbol: string }>();
  return results.map((r) => r.symbol);
}

export async function markHotSymbol(
  db: D1Database,
  symbol: string,
  source: string,
  score: number | null
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO hot_symbols (symbol, day, source, score) VALUES (?, date('now'), ?, ?)
       ON CONFLICT (symbol, day) DO UPDATE SET score = MAX(COALESCE(hot_symbols.score, 0), COALESCE(excluded.score, 0))`
    )
    .bind(symbol, source, score)
    .run();
}

interface Trigger {
  symbol: string;
  price: number;
  burstPct: number;
  dayPct: number;
}

function detectBurst(symbol: string, s: SparkSeries, minBurst: number): Trigger | null {
  const closes = s.close;
  if (closes.length < BURST_WINDOW_BARS + 2) return null;
  const last = closes[closes.length - 1];
  const base = closes[closes.length - 1 - BURST_WINDOW_BARS];
  if (last < MIN_PRICE || !base) return null;

  const burstPct = ((last - base) / base) * 100;
  const dayPct = ((last - s.previousClose) / s.previousClose) * 100;

  if (burstPct < minBurst) return null;
  if (dayPct < MIN_DAY_PCT || dayPct > MAX_DAY_PCT) return null;
  return { symbol, price: last, burstPct, dayPct };
}

/** Hacim teyidi: son ~15 dk bar hacmi, önceki günlerin normal bar hacmine oranı. */
async function confirmVolume(
  symbol: string
): Promise<{ relVolume: number; avgDollarVol: number } | null> {
  try {
    const candles = await getCandles(symbol, '5m', '5d');
    if (candles.length < 60) return null;
    const todayKey = Math.floor(candles[candles.length - 1].t / 86400);
    const before = candles.filter((c) => Math.floor(c.t / 86400) !== todayKey);
    if (before.length < 30) return null;

    const normalBarVol = before.reduce((s, c) => s + c.v, 0) / before.length;
    const lastBars = candles.slice(-BURST_WINDOW_BARS);
    const burstBarVol = lastBars.reduce((s, c) => s + c.v, 0) / lastBars.length;
    if (normalBarVol <= 0) return null;

    const avgPrice = before.reduce((s, c) => s + c.c, 0) / before.length;
    // gün başına ~78 adet 5dk bar
    const avgDollarVol = normalBarVol * 78 * avgPrice;

    return { relVolume: burstBarVol / normalBarVol, avgDollarVol };
  } catch {
    return null;
  }
}

export async function runPulse(
  db: D1Database,
  env: TelegramEnv,
  options: { force?: boolean; minBurst?: number; notify?: boolean } = {}
): Promise<PulseResult> {
  const minBurst = options.minBurst ?? MIN_BURST_PCT;
  const notify = options.notify ?? true;

  const [dynamic, hot] = await Promise.all([getDynamicSymbols(), getHotSymbols(db)]);
  const universe = [...new Set([...SCAN_UNIVERSE, ...dynamic, ...hot])];
  const spark = await fetchSpark(universe);

  const empty: PulseResult = {
    ran: false,
    scannedCount: spark.size,
    triggered: [],
    alerts: [],
    notified: 0,
  };
  if (!spark.size) return { ...empty, skippedReason: 'Veri alınamadı' };

  if (!inSession() && !options.force) {
    return { ...empty, skippedReason: 'Seans dışı' };
  }
  const lastBarTime = Math.max(0, ...[...spark.values()].map((s) => s.lastTime));
  if (Date.now() / 1000 - lastBarTime > DATA_FRESH_SECONDS && !options.force) {
    return { ...empty, skippedReason: 'Veri bayat (piyasa kapalı olabilir)' };
  }

  // 1. Fiyat patlaması tetiği
  const triggers: Trigger[] = [];
  for (const [symbol, series] of spark) {
    const t = detectBurst(symbol, series, minBurst);
    if (t) triggers.push(t);
  }
  triggers.sort((a, b) => b.burstPct - a.burstPct);

  // 2. Soğuma: yakın zamanda alarm verilmiş sembolleri ele
  const fresh: Trigger[] = [];
  for (const t of triggers) {
    const recent = await db
      .prepare(
        `SELECT id FROM pulse_alerts WHERE symbol = ? AND created_at > datetime('now', ?) LIMIT 1`
      )
      .bind(t.symbol, `-${REALERT_COOLDOWN_MINUTES} minutes`)
      .first();
    if (!recent) fresh.push(t);
    if (fresh.length >= MAX_CONFIRM_PER_CYCLE) break;
  }

  // 3. Hacim teyidi + alarm
  const alerts: PulseAlert[] = [];
  let notifiedCount = 0;
  for (const t of fresh) {
    const vol = await confirmVolume(t.symbol);
    if (!options.force) {
      if (!vol) continue;
      if (vol.relVolume < MIN_REL_VOLUME) continue;
      if (vol.avgDollarVol < MIN_AVG_DOLLAR_VOL) continue;
    }

    // Katalizör kontrolü: haber varsa alarm "işlenebilir", yoksa "sadece izle"
    // (kaynak çökerse etiketsiz devam — alarm engellenmez)
    let catalystText: string | null = null;
    try {
      const intel = await getIntel(t.symbol);
      if (intel.news.length > 0 && (intel.newsScore == null || intel.newsScore >= 0)) {
        catalystText = `📰 Katalizör: ${intel.news[0].title.slice(0, 80)}`;
      } else if (intel.news.length === 0) {
        catalystText = '📰 Katalizör yok — bot girmez, sadece izleme';
      }
    } catch {
      // istihbarat alınamadı: etiketsiz devam
    }

    const id = crypto.randomUUID();
    const noteParts: string[] = [];
    if (vol && vol.avgDollarVol < 2_000_000) {
      noteParts.push('düşük likidite — geniş spread riskine dikkat');
    }
    if (catalystText) noteParts.push(catalystText);
    const note = noteParts.length ? noteParts.join(' | ') : null;
    await db
      .prepare(
        `INSERT INTO pulse_alerts (id, symbol, price, change_15m, day_change, rel_volume, note)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(id, t.symbol, t.price, t.burstPct, t.dayPct, vol?.relVolume ?? null, note)
      .run();
    await markHotSymbol(db, t.symbol, 'pulse', t.burstPct);

    const alert = (await db
      .prepare('SELECT * FROM pulse_alerts WHERE id = ?')
      .bind(id)
      .first<PulseAlert>())!;
    alerts.push(alert);

    if (notify && telegramConfigured(env)) {
      const volText = vol ? ` | hacim ${vol.relVolume.toFixed(1)}x` : '';
      const noteText = note ? `\n⚠️ ${note}` : '';
      const sent = await sendTelegram(
        env,
        `⚡ <b>Erken Momentum: ${t.symbol}</b> — $${t.price.toFixed(2)}\n` +
          `son 15dk <b>+${t.burstPct.toFixed(2)}%</b> | gün +${t.dayPct.toFixed(2)}%${volText}\n` +
          `Hareket henüz başlangıç safhasında (gün &lt;%${MAX_DAY_PCT}). Grafiği açıp teyit edin.${noteText}`
      );
      if (sent) notifiedCount++;
    }
  }

  return {
    ran: true,
    scannedCount: spark.size,
    triggered: triggers.map((t) => t.symbol),
    alerts,
    notified: notifiedCount,
  };
}
