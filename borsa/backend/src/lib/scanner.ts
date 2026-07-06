// TARAMA KATMANI (günlük trade adayı bulucu)
// Likit ABD hisselerinden oluşan evreni tek toplu istekle tarar (Yahoo spark),
// gap / günlük değişim / son 30 dk momentum / gün içi oynaklığa göre puanlar,
// en iyi adaylar için göreli hacmi hesaplar ve Telegram bildirimi gönderir.

import { getCandles } from './data';
import { sendTelegram, telegramConfigured, type TelegramEnv } from './telegram';

const YAHOO = 'https://query1.finance.yahoo.com';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// Day trade evreni: mega-cap + yüksek betalı popüler hisseler.
// Değiştirmek için bu listeyi düzenlemek yeterli.
export const SCAN_UNIVERSE = [
  'AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA', 'AVGO', 'NFLX', 'AMD',
  'INTC', 'MU', 'QCOM', 'ARM', 'SMCI', 'TSM', 'PLTR', 'CRWD', 'PANW', 'NET',
  'SNOW', 'DDOG', 'MDB', 'ORCL', 'CRM', 'ADBE', 'SHOP', 'SQ', 'PYPL', 'AFRM',
  'UPST', 'HOOD', 'COIN', 'MSTR', 'MARA', 'RIOT', 'CLSK', 'SOFI', 'NIO', 'XPEV',
  'LI', 'RIVN', 'LCID', 'F', 'GM', 'BA', 'DIS', 'UBER', 'ABNB', 'DKNG',
  'RBLX', 'U', 'SPOT', 'SNAP', 'ROKU', 'ZM', 'GME', 'AMC', 'CVNA', 'AI',
  'IONQ', 'RGTI', 'BABA', 'JD', 'PDD', 'JPM', 'BAC', 'GS', 'XOM', 'CVX',
  'WMT', 'KO', 'PFE', 'MRNA', 'UNH', 'LLY', 'CAT', 'GE', 'VZ', 'T',
];

export interface ScanCandidate {
  symbol: string;
  price: number;
  dayChangePercent: number; // önceki kapanışa göre
  gapPercent: number; // açılış vs önceki kapanış
  momentumPercent: number; // son ~30 dk değişim
  rangePercent: number; // gün içi (yüksek-düşük)/önceki kapanış
  relativeVolume: number | null; // bugünkü bar hacmi / önceki günlerin bar hacmi
  direction: 'long' | 'short';
  score: number;
}

interface SparkSeries {
  previousClose: number;
  close: number[];
  lastTime: number; // son barın unix zamanı
}

async function fetchSpark(symbols: string[]): Promise<Map<string, SparkSeries>> {
  const out = new Map<string, SparkSeries>();
  // Yahoo spark istek başına en fazla 20 sembol kabul eder → 80'lik evren 4 istek
  for (let i = 0; i < symbols.length; i += 20) {
    const chunk = symbols.slice(i, i + 20);
    const res = await fetch(
      `${YAHOO}/v8/finance/spark?symbols=${chunk.join(',')}&range=1d&interval=5m`,
      { headers: { 'User-Agent': UA, Accept: 'application/json' } }
    );
    if (!res.ok) continue;
    const data: any = await res.json();
    for (const symbol of chunk) {
      const s = data?.[symbol];
      const closes = (s?.close ?? []).filter((c: number | null) => c != null);
      if (!s || typeof s.previousClose !== 'number' || closes.length < 8) continue;
      const timestamps: number[] = s.timestamp ?? [];
      out.set(symbol, {
        previousClose: s.previousClose,
        close: closes,
        lastTime: timestamps.length ? timestamps[timestamps.length - 1] : 0,
      });
    }
  }
  return out;
}

function analyze(symbol: string, s: SparkSeries): ScanCandidate {
  const prev = s.previousClose;
  const first = s.close[0];
  const last = s.close[s.close.length - 1];
  const momIndex = Math.max(0, s.close.length - 7); // ~30 dk önce (6 x 5dk bar)
  const momBase = s.close[momIndex];
  const high = Math.max(...s.close);
  const low = Math.min(...s.close);

  const dayChangePercent = ((last - prev) / prev) * 100;
  const gapPercent = ((first - prev) / prev) * 100;
  const momentumPercent = momBase ? ((last - momBase) / momBase) * 100 : 0;
  const rangePercent = ((high - low) / prev) * 100;

  // Puan: momentum en değerli (devam eden hareket), sonra günlük değişim ve oynaklık
  const score =
    Math.abs(momentumPercent) * 2 + Math.abs(dayChangePercent) + rangePercent * 0.5;

  return {
    symbol,
    price: last,
    dayChangePercent,
    gapPercent,
    momentumPercent,
    rangePercent,
    relativeVolume: null,
    direction: dayChangePercent >= 0 ? 'long' : 'short',
    score,
  };
}

/** Adayın bugünkü ortalama bar hacmini önceki günlerinkiyle karşılaştırır. */
async function computeRelativeVolume(symbol: string): Promise<number | null> {
  try {
    const candles = await getCandles(symbol, '5m', '5d');
    if (candles.length < 50) return null;
    const todayKey = Math.floor(candles[candles.length - 1].t / 86400);
    const today = candles.filter((c) => Math.floor(c.t / 86400) === todayKey);
    const before = candles.filter((c) => Math.floor(c.t / 86400) !== todayKey);
    if (today.length < 3 || before.length < 20) return null;
    const avg = (arr: typeof candles) =>
      arr.reduce((sum, c) => sum + c.v, 0) / arr.length;
    const prevAvg = avg(before);
    return prevAvg > 0 ? avg(today) / prevAvg : null;
  } catch {
    return null;
  }
}

// DİNAMİK EVREN: Yahoo'nun hazır tarayıcılarından (günün en çok yükselenleri +
// en hacimlileri) sembol çekilir ve sabit evrene eklenir. Böylece "bugün kim
// oynuyorsa" tarafımızdan taranır. Uç erişilemezse sabit 80 ile devam (fail-open).
const DYNAMIC_MAX = 60; // Workers istek bütçesi için tavan (evren toplamı ≤ 140)
const SYMBOL_RE = /^[A-Z]{1,5}$/; // ABD hissesi; birim/varant/OTC uzantılarını eler

let dynamicCache: { at: number; symbols: string[] } | null = null;
const DYNAMIC_TTL_MS = 10 * 60 * 1000;

async function getDynamicSymbols(): Promise<string[]> {
  if (dynamicCache && Date.now() - dynamicCache.at < DYNAMIC_TTL_MS) {
    return dynamicCache.symbols;
  }
  const found: string[] = [];
  for (const scrId of ['day_gainers', 'most_actives']) {
    try {
      const res = await fetch(
        `${YAHOO}/v1/finance/screener/predefined/saved?scrIds=${scrId}&count=50`,
        { headers: { 'User-Agent': UA, Accept: 'application/json' } }
      );
      if (!res.ok) continue;
      const data: any = await res.json();
      for (const q of data?.finance?.result?.[0]?.quotes ?? []) {
        const symbol = String(q.symbol ?? '').toUpperCase();
        // Sadece likit, penny olmayan ABD hisseleri
        if (!SYMBOL_RE.test(symbol)) continue;
        if (q.quoteType && q.quoteType !== 'EQUITY') continue;
        if (typeof q.regularMarketPrice === 'number' && q.regularMarketPrice < 3) continue;
        found.push(symbol);
      }
    } catch {
      // tarayıcı erişilemedi: kalan kaynaklarla devam
    }
  }
  const symbols = [...new Set(found)].slice(0, DYNAMIC_MAX);
  dynamicCache = { at: Date.now(), symbols };
  return symbols;
}

export interface MarketSnapshot {
  all: ScanCandidate[];
  scannedCount: number;
  dynamicCount: number; // dinamik evrenden gelen (sabit listede olmayan) sembol sayısı
  advancers: number; // önceki kapanışa göre artıda olan hisse sayısı
  decliners: number;
  lastBarTime: number; // en güncel bar zamanı (veri tazeliği kontrolü için)
}

/** Tüm evreni tarar; hem manuel tarama hem otonom bot bu görüntüyü kullanır. */
export async function scanMarket(): Promise<MarketSnapshot> {
  const dynamic = await getDynamicSymbols();
  const universe = [...new Set([...SCAN_UNIVERSE, ...dynamic])];
  const dynamicCount = universe.length - SCAN_UNIVERSE.length;
  const spark = await fetchSpark(universe);
  const all = [...spark.entries()].map(([symbol, s]) => analyze(symbol, s));
  return {
    all,
    scannedCount: spark.size,
    dynamicCount,
    advancers: all.filter((c) => c.dayChangePercent > 0).length,
    decliners: all.filter((c) => c.dayChangePercent < 0).length,
    lastBarTime: Math.max(0, ...[...spark.values()].map((s) => s.lastTime)),
  };
}

export interface ScanResult {
  candidates: ScanCandidate[];
  stale?: boolean; // veri 30 dk'dan eski (piyasa kapalı) — bildirim gönderilmez
  scannedCount: number;
  dynamicCount: number;
  notified: boolean;
}

export async function runScan(
  env: TelegramEnv,
  options: { top?: number; notify?: boolean } = {}
): Promise<ScanResult> {
  const top = options.top ?? 5;
  const { all, scannedCount, dynamicCount, lastBarTime } = await scanMarket();
  // Anlamlı hareket filtresi: en az %1.5 günlük değişim veya güçlü momentum
  const interesting = all.filter(
    (c) => Math.abs(c.dayChangePercent) >= 1.5 || Math.abs(c.momentumPercent) >= 1
  );
  interesting.sort((a, b) => b.score - a.score);
  const candidates = interesting.slice(0, top);

  // Sadece kısa listeye hacim analizi (sembol başına 1 istek)
  await Promise.all(
    candidates.map(async (c) => {
      c.relativeVolume = await computeRelativeVolume(c.symbol);
    })
  );

  // Bayat veri koruması: son bar 30 dk'dan eskiyse (tatil/kesinti) bildirim gönderme.
  // Aksi halde tatil günlerinde önceki seansın kapanış fiyatları "canlı aday" gibi
  // mesajlanıyor ve o fiyatlarla işlem yapılamıyor.
  const dataAgeSeconds = Date.now() / 1000 - lastBarTime;
  const stale = dataAgeSeconds > 30 * 60;

  let notified = false;
  if (options.notify && candidates.length && !stale && telegramConfigured(env)) {
    notified = await sendTelegram(env, formatScanMessage(candidates, scannedCount, lastBarTime));
  }
  if (options.notify && stale) {
    console.log(`Tarama bildirimi atlandı: veri ${Math.round(dataAgeSeconds / 60)} dk eski (piyasa kapalı olabilir)`);
  }

  return { candidates, scannedCount, dynamicCount, notified, stale };
}

function formatScanMessage(candidates: ScanCandidate[], scanned: number, lastBarTime: number): string {
  const pct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
  const lines = candidates.map((c, i) => {
    const dir = c.direction === 'long' ? '🟢 LONG' : '🔴 SHORT';
    const vol =
      c.relativeVolume != null ? ` | hacim ${c.relativeVolume.toFixed(1)}x` : '';
    return (
      `${i + 1}. <b>${c.symbol}</b> ${dir} — $${c.price.toFixed(2)}\n` +
      `   gün ${pct(c.dayChangePercent)} | gap ${pct(c.gapPercent)} | 30dk ${pct(c.momentumPercent)}${vol}`
    );
  });
  // Veri zaman damgası (TSİ) — kullanıcı fiyatların hangi ana ait olduğunu görsün
  const asOf = new Date((lastBarTime + 3 * 3600) * 1000)
    .toISOString()
    .replace('T', ' ')
    .slice(0, 16);
  return (
    `📊 <b>Günlük Trade Taraması</b> (${scanned} hisse tarandı)\n` +
    `🕐 Veri zamanı: ${asOf} TSİ\n\n` +
    lines.join('\n') +
    `\n\n⚠️ Fiyatlar veri zamanına aittir; emir anındaki fiyat farklı olabilir.\n` +
    `⚠️ Bunlar yatırım tavsiyesi değil, paper trading adaylarıdır.`
  );
}
