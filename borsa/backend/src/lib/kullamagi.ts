// KULLAMÄGİ (Qullamaggie) KURULUM TARAYICISI
// Kristjan Kullamägi'nin işlem kurallarını ABD hisselerinde arar ve bulduğu
// kurulumları Telegram'a yollar. Üç kurulum:
//
//   1) BREAKOUT — büyük bir yükseliş yapmış hissenin SIKI konsolidasyonundan
//      (bayrak / daralan menzil, kuruyan hacim) hacimle çıkışı. Giriş
//      konsolidasyon tepesinin (pivot) kırılışı, stop günün/bazın düşüğü ya da
//      10/20 EMA; 3-5 gün içinde 2-3 ADR kâr birikince pozisyonun 1/3-1/2'si
//      satılır, kalan hareketli ortalamayla trail edilir.
//
//   2) EPISODIC PIVOT — aylardır hareketsiz/düşen bir hissenin BEKLENMEDİK bir
//      katalizörle (bilanço sürprizi, FDA, sözleşme) dev gap yapması ve
//      olağanüstü hacimle gelmesi. Giriş açılış aralığının (opening range)
//      tepesi, stop aralığın dibi.
//
//   3) PARABOLİK SHORT — birkaç günde katlanmış, 20 EMA'dan aşırı uzaklaşmış
//      hissenin dönüşü. Sinyal ancak DÖNÜŞ teyit olunca (ilk kırmızı gün /
//      önceki günün düşüğünün kırılması) üretilir; yükselirken asla short'lanmaz.
//
// BÜTÇE MİMARİSİ (Worker istek başına ~50 alt-istek):
//   • Günlük mum analizi pahalıdır (sembol başına 1 istek) → her koşuda yalnızca
//     `refresh_batch` kadar sembol derin taranır, sonuç kk_watch'a yazılır
//     (dönen tarama; en eski kontrol edilen semboller önce).
//   • Tetik kontrolü ucuzdur: canlı fiyatlar tek snapshot çağrısından gelir ve
//     kk_watch'taki pivot / dönüş seviyeleriyle kıyaslanır.
//   • Yalnızca tetiklenen avuç dolusu aday için gün içi hacim/açılış aralığı ve
//     istihbarat çekilir.

import { getCandles, type Candle } from './data';
import { massiveConfigured, massiveBroadRows } from './massive';
import { fetchSpark, getDynamicSymbols, SCAN_UNIVERSE } from './scanner';
import { getHotSymbols, markHotSymbol } from './pulse';
import { getIntel } from './intel';
import { sendTelegram, telegramConfigured, type TelegramEnv } from './telegram';

export type KKSetup = 'breakout' | 'episodic_pivot' | 'parabolic_short';

// ---- Eşikler (Kullamägi'nin anlattığı kurallara göre) ----
const MIN_DAILY_BARS = 70; // ~3.5 aylık geçmiş olmadan kurulum değerlendirilmez
const MAX_BASE_LEN = 60; // 60 günden uzun baz artık "bayrak" değil
const MIN_BASE_LEN = 3; // KK 3 günlük bayrakları da alır
const MIN_ADR_PCT = 2.5; // hareketsiz hisseyle bu oyun oynanmaz
const BREAKOUT_MIN_REL_VOL = 1.5; // pivot kırılışı hacimle gelmeli
const BREAKOUT_BUFFER = 0.001; // pivotun %0.1 üstü = kırılış sayılır
const EP_MAX_PRIOR_GAIN = 40; // EP'den önce hisse "uyuyor" olmalı (3 aylık %)
const EP_MIN_REL_VOL = 3; // gap günü hacmi normalin en az 3 katı
const EP_MIN_DOLLAR_VOL = 5_000_000; // gap gününün bugüne kadarki dolar hacmi
const EP_MIN_PRICE = 4;
const PARA_MIN_EXT_PCT = 30; // 20 EMA'dan uzama
const PARA_MIN_RUN = { d3: 35, d5: 60, d10: 100 }; // kısa vadeli patlama eşikleri
const RISK_BUDGET_PCT = 0.5; // mesajlardaki pozisyon büyüklüğü örneği (hesap riski %)

// Soğuma: aynı sembol+kurulum için tekrar sinyal aralığı (gün)
const COOLDOWN_DAYS: Record<KKSetup, number> = {
  breakout: 3,
  episodic_pivot: 5,
  parabolic_short: 2,
};

// Koşu başına tavanlar (alt-istek bütçesi)
const MAX_BREAKOUT_CONFIRM = 4; // hacim teyidi (sembol başına 1 istek)
const MAX_EP_CANDIDATES = 3; // günlük mum + gün içi mum (sembol başına 2 istek)
const MAX_EP_INTEL = 2; // istihbarat (sembol başına ~4 istek)
const MAX_PARA_SIGNALS = 3;
const YAHOO_LIVE_CAP = 30; // Massive yoksa canlı fiyat çekilen sembol tavanı
const REFRESH_TTL_HOURS = 20; // aynı sembolü günde bir kez derin tara
const WATCH_STALE_DAYS = 5; // bu kadar gün tazelenmemiş kurulum listelenmez
// Tetik için ayrı, daha sıkı tazelik: seviyeler günlük mumlardan hesaplanır,
// aradan seans geçtiyse baz çoktan bozulmuş olabilir. 3 gün hafta sonunu
// tolere eder (Cuma kapanışında hesaplanan seviye Pazartesi açılışında geçerli)
// ama atlanmış seansları etmez.
const TRIGGER_MAX_AGE_DAYS = 3;

// ---- Zaman yardımcıları (New York seansı, DST dahil) ----

/** Verilen unix saniyesinin New York saatiyle gün-içi dakikası (9:30 = 570). */
export function nyMinutes(t: number = Math.floor(Date.now() / 1000)): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(new Date(t * 1000));
    const h = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
    const m = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
    return (h % 24) * 60 + m;
  } catch {
    // Intl zaman dilimi verisi yoksa yaz saatine (UTC-4) düş
    const d = new Date(t * 1000);
    return (((d.getUTCHours() - 4 + 24) % 24) * 60 + d.getUTCMinutes()) % 1440;
  }
}

/** New York takvim tarihi (YYYY-MM-DD) — günlük raporun tekilleştirme anahtarı. */
export function nyDate(t: number = Math.floor(Date.now() / 1000)): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(
      new Date(t * 1000)
    );
  } catch {
    return new Date((t - 4 * 3600) * 1000).toISOString().slice(0, 10);
  }
}

const NY_OPEN = 9 * 60 + 30;
const NY_CLOSE = 16 * 60;

function isWeekday(): boolean {
  const day = new Date().getUTCDay();
  return day >= 1 && day <= 5;
}

/** Seans içi mi (9:30-16:00 NY, hafta içi)? */
export function inNySession(min = nyMinutes()): boolean {
  return isWeekday() && min >= NY_OPEN && min < NY_CLOSE;
}

// Telegram raporlarında Türkiye saati
function fmtTsi(t: number): string {
  return (
    new Date((t + 3 * 3600) * 1000).toISOString().slice(0, 16).replace('T', ' ') + ' TSİ'
  );
}

// ---- İndikatörler ----

function mean(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

export function sma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  return mean(values.slice(-period));
}

export function ema(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let e = mean(values.slice(0, period));
  for (let i = period; i < values.length; i++) e = values[i] * k + e * (1 - k);
  return e;
}

/** ADR% — KK'nin oynaklık ölçüsü: son N günün ortalama (yüksek/düşük - 1). */
export function adrPct(bars: Candle[], period = 20): number {
  const part = bars.slice(-period).filter((b) => b.l > 0 && b.h > 0);
  if (!part.length) return 0;
  return mean(part.map((b) => b.h / b.l - 1)) * 100;
}

/** N gün önceki kapanışa göre değişim %. */
function gainPct(bars: Candle[], days: number): number | null {
  if (bars.length <= days) return null;
  const past = bars[bars.length - 1 - days].c;
  const now = bars[bars.length - 1].c;
  return past > 0 ? ((now - past) / past) * 100 : null;
}

function sameUtcDay(a: number, b: number): boolean {
  return Math.floor(a / 86400) === Math.floor(b / 86400);
}

/** Bugünün (henüz oluşan) barını ayırır: kurulum analizi yalnızca kapanmış barlarla yapılır. */
function splitToday(bars: Candle[]): { closed: Candle[]; today: Candle | null } {
  if (!bars.length) return { closed: [], today: null };
  const last = bars[bars.length - 1];
  if (sameUtcDay(last.t, Math.floor(Date.now() / 1000))) {
    return { closed: bars.slice(0, -1), today: last };
  }
  return { closed: bars, today: null };
}

// ---- Kurulum analizi (günlük mumlar) ----

export interface KKBase {
  pivot: number; // konsolidasyon tepesi = giriş tetiği
  low: number; // konsolidasyon dibi
  len: number; // gün sayısı
  depthPct: number; // tepeden dibe geri çekilme
  tightness: number; // ikinci yarı menzili / ilk yarı menzili (<1 = daralıyor)
  volDryUp: number; // ikinci yarı hacmi / ilk yarı hacmi (<1 = hacim kuruyor)
  maRef: '10ema' | '20ema' | '50sma';
  maLevel: number;
  distPct: number; // fiyatın pivota uzaklığı %
}

export interface KKParabolic {
  extPct: number; // 20 EMA'dan uzama %
  run3: number | null;
  run5: number | null;
  run10: number | null;
  upDays: number; // üst üste yükselen gün
  triggerBelow: number; // son kapanmış günün düşüğü — kırılırsa dönüş
  high: number; // son kapanmış günün tepesi — short stop referansı
}

export interface KKAnalysis {
  symbol: string;
  price: number; // son KAPANMIŞ günün kapanışı
  adrPct: number;
  avgDollarVol: number;
  gain1m: number | null;
  gain3m: number | null;
  gain6m: number | null;
  ema10: number | null;
  ema20: number | null;
  sma50: number | null;
  lastLow: number;
  lastHigh: number;
  setup: 'breakout' | 'parabolic_watch' | 'none';
  base: KKBase | null;
  parabolic: KKParabolic | null;
  score: number;
  note: string;
}

/**
 * Bir sembolün günlük mumlarından KK kurulumunu çıkarır.
 * Likidite/fiyat filtresine takılan ya da kurulumu olmayan semboller de
 * `setup: 'none'` ile döner — dönen tarama onları damgalayıp geçsin diye.
 */
export function analyzeDaily(
  symbol: string,
  bars: Candle[],
  opts: { minPrice: number; minDollarVol: number }
): KKAnalysis | null {
  const { closed } = splitToday(bars);
  if (closed.length < MIN_DAILY_BARS) return null;

  const closes = closed.map((b) => b.c);
  const last = closed[closed.length - 1];
  const price = last.c;
  const adr = adrPct(closed);
  const recent = closed.slice(-20);
  const avgDollarVol = mean(recent.map((b) => b.v * b.c));

  const base_: KKAnalysis = {
    symbol,
    price,
    adrPct: adr,
    avgDollarVol,
    gain1m: gainPct(closed, 21),
    gain3m: gainPct(closed, 63),
    gain6m: gainPct(closed, 126),
    ema10: ema(closes, 10),
    ema20: ema(closes, 20),
    sma50: sma(closes, 50),
    lastLow: last.l,
    lastHigh: last.h,
    setup: 'none',
    base: null,
    parabolic: null,
    score: 0,
    note: '',
  };

  // Likidite ve fiyat tabanı: KK bu filtrenin altındaki hisselere girmez
  // (spread ve slipaj kurulumun matematiğini bozar).
  if (price < opts.minPrice) return { ...base_, note: `fiyat < $${opts.minPrice}` };
  if (avgDollarVol < opts.minDollarVol) return { ...base_, note: 'likidite yetersiz' };

  const g1 = base_.gain1m ?? 0;
  const g3 = base_.gain3m ?? 0;
  const g6 = base_.gain6m ?? 0;
  // KK yalnızca "piyasanın en çok hareket edenleriyle" ilgilenir: önce büyük
  // bir hareket olacak ki konsolidasyonu anlamlı olsun.
  const momentumOk = g1 >= 20 || g3 >= 30 || g6 >= 60;

  // 1) KONSOLİDASYON (bayrak) arayışı
  const window = closed.slice(-Math.min(MAX_BASE_LEN + 1, closed.length));
  let pivotIdx = 0;
  for (let i = 1; i < window.length; i++) if (window[i].h > window[pivotIdx].h) pivotIdx = i;
  const baseBars = window.slice(pivotIdx); // tepe günü + sonrası
  const baseLen = baseBars.length - 1;

  if (momentumOk && adr >= MIN_ADR_PCT && baseLen >= MIN_BASE_LEN) {
    const pivot = baseBars[0].h;
    const after = baseBars.slice(1); // tepe gününden sonraki günler
    const low = Math.min(...after.map((b) => b.l));
    const depthPct = ((pivot - low) / pivot) * 100;
    const half = Math.ceil(after.length / 2);
    const firstHalf = after.slice(0, half);
    const secondHalf = after.slice(half).length ? after.slice(half) : after.slice(-1);
    const rangePct = (part: Candle[]) => {
      const hi = Math.max(...part.map((b) => b.h));
      const lo = Math.min(...part.map((b) => b.l));
      const ref = mean(part.map((b) => b.c));
      return ref > 0 ? ((hi - lo) / ref) * 100 : 0;
    };
    const r1 = rangePct(firstHalf);
    const r2 = rangePct(secondHalf);
    const tightness = r1 > 0 ? r2 / r1 : 1;
    const v1 = mean(firstHalf.map((b) => b.v));
    const v2 = mean(secondHalf.map((b) => b.v));
    const halfDryUp = v1 > 0 ? v2 / v1 : 1;

    // KISA BAYRAK (≤5 gün) ÖLÇÜMÜ: yarı-yarıya kıyas burada 2 barı 1 bara
    // bölmek demektir — gürültü. Onun yerine mutlak ölçüler kullanılır:
    //   sıkılık → son günlerin toplam menzili ADR'nin kaç katı
    //   hacim   → bazın hacmi, yükseliş bacağının hacminin kaç katı
    // (KK'nin bazda aradığı da budur: koşuya göre sakinleşen hacim.)
    const shortBase = baseLen <= 5;
    const lastRangePct = rangePct(after.slice(-3));
    const runLeg = window.slice(Math.max(0, pivotIdx - 10), pivotIdx);
    const runVol = mean(runLeg.map((b) => b.v));
    const baseVol = mean(after.map((b) => b.v));
    const volVsRun = runVol > 0 ? baseVol / runVol : 1;
    // Kaydedilen ölçüler, o baz için gerçekten UYGULANAN ölçülerdir: aksi halde
    // tabloda kullanılmayan bir orana bakıp "bu neden kabul edilmiş?" denir.
    // İkisinde de küçük = sıkı/sakin.
    const volDryUp = shortBase ? volVsRun : halfDryUp;
    const tightMeasure = shortBase && adr > 0 ? lastRangePct / adr : tightness;

    // Baz uzadıkça referans ortalama yavaşlar (KK: kısa bayrak 10 EMA,
    // orta 20 EMA, uzun baz 50 SMA ile takip edilir).
    const maRef: KKBase['maRef'] = baseLen <= 12 ? '10ema' : baseLen <= 30 ? '20ema' : '50sma';
    const maLevel =
      (maRef === '10ema' ? base_.ema10 : maRef === '20ema' ? base_.ema20 : base_.sma50) ?? 0;
    const distPct = ((pivot - price) / price) * 100;

    // Derinlik toleransı oynaklığa göre: ADR'si yüksek hisse doğal olarak daha
    // derin nefes alır, ama 2,5 ADR'yi (ve %25'i) geçen geri çekilme bayrak
    // değil düzeltmedir. ADR ölçekli tolerans ÜSTTEN de sınırlanır: 27 Ağu'da
    // canlı taramada ADR %11 olan MRNA, pivotunun %18 altındayken ve %27
    // derinlikle "konsolidasyon" sayılıyordu.
    const maxDepth = Math.min(25, Math.max(8, adr * 2.5));
    const structureOk =
      depthPct <= maxDepth &&
      // menzil daralıyor / sıkı (genişleyen baz kurulum değil)
      (shortBase ? lastRangePct <= adr * 2.2 : tightness <= 1.05) &&
      volDryUp <= 1.05 && // hacim kuruyor — KK'nin bazda aradığı asıl teyit
      maLevel > 0 &&
      price >= maLevel * 0.97 && // ortalamanın üstünde tutunuyor
      // Bayrak zirvenin dibinde olur: fiyat pivotun 1,5 ADR'sinden (en çok %12)
      // uzaktaysa kurulum henüz olgunlaşmamıştır.
      distPct <= Math.min(12, Math.max(4, adr * 1.5));

    if (structureOk) {
      base_.setup = 'breakout';
      base_.base = {
        pivot,
        low,
        len: baseLen,
        depthPct,
        tightness: tightMeasure,
        volDryUp,
        maRef,
        maLevel,
        distPct,
      };
      // Sıkılık puanı ölçüye göre normalize edilir: kısa bazda ölçek 0-2,2
      // (menzil/ADR), uzun bazda 0-1,2 (yarı oranı). Aynı formülü ikisine
      // uygulamak kısa bayrakları haksız yere cezalandırırdı.
      const tightScore = shortBase
        ? Math.max(0, Math.min(25, (2.2 - tightMeasure) * 12))
        : Math.max(0, Math.min(25, (1.2 - tightMeasure) * 25));
      base_.score =
        Math.min(60, Math.max(g1, g3 / 2, g6 / 4)) + // momentum lideri mi
        tightScore + // daralma / sıkılık
        Math.max(0, Math.min(20, (1.1 - volDryUp) * 20)) + // hacim kuruması
        Math.min(15, adr * 2) - // oynaklık (hareket potansiyeli)
        distPct; // pivota uzaklık cezası
      base_.note =
        `${baseLen} günlük baz, derinlik %${depthPct.toFixed(1)}, ` +
        (shortBase ? 'sıkılık = son 3 gün menzili / ADR' : 'sıkılık = ikinci yarı / ilk yarı menzili');
      return base_;
    }
  }

  // 2) PARABOLİK (short adayı) — konsolidasyon yok, dikey hareket var
  const ema20 = base_.ema20 ?? 0;
  const extPct = ema20 > 0 ? ((price - ema20) / ema20) * 100 : 0;
  const run3 = gainPct(closed, 3);
  const run5 = gainPct(closed, 5);
  const run10 = gainPct(closed, 10);
  let upDays = 0;
  for (let i = closed.length - 1; i > 0; i--) {
    if (closed[i].c > closed[i - 1].c) upDays++;
    else break;
  }
  const runOk =
    (run3 ?? 0) >= PARA_MIN_RUN.d3 ||
    (run5 ?? 0) >= PARA_MIN_RUN.d5 ||
    (run10 ?? 0) >= PARA_MIN_RUN.d10;
  if (extPct >= PARA_MIN_EXT_PCT && runOk) {
    base_.setup = 'parabolic_watch';
    base_.parabolic = {
      extPct,
      run3,
      run5,
      run10,
      upDays,
      triggerBelow: last.l, // son kapanmış günün düşüğü kırılırsa dönüş teyit
      high: last.h,
    };
    base_.score = extPct + Math.max(run3 ?? 0, run5 ?? 0, run10 ?? 0) / 2;
    base_.note = `20 EMA'dan %${extPct.toFixed(0)} uzak, ${upDays} gün üst üste yükseliş`;
    return base_;
  }

  base_.note = momentumOk ? 'kurulum yok (baz olgunlaşmamış)' : 'momentum yetersiz';
  return base_;
}

// ---- D1 katmanı ----

export interface KKState {
  id: number;
  enabled: number;
  min_price: number;
  min_dollar_vol: number;
  min_gap_pct: number;
  refresh_batch: number;
  universe_max: number;
  last_watchlist_day: string | null;
  updated_at: string;
}

export interface KKWatchRow {
  symbol: string;
  setup: string;
  price: number | null;
  adr_pct: number | null;
  dollar_vol: number | null;
  gain_1m: number | null;
  gain_3m: number | null;
  gain_6m: number | null;
  pivot: number | null;
  base_low: number | null;
  base_len: number | null;
  depth_pct: number | null;
  tightness: number | null;
  vol_dryup: number | null;
  ma_ref: string | null;
  ma_level: number | null;
  last_low: number | null;
  last_high: number | null;
  trigger_below: number | null;
  ext_pct: number | null;
  score: number | null;
  note: string | null;
  checked_at: string;
}

export interface KKSignalRow {
  id: string;
  symbol: string;
  setup: KKSetup;
  side: 'long' | 'short';
  price: number;
  entry: number;
  stop: number;
  target: number | null;
  risk_pct: number;
  rel_volume: number | null;
  adr_pct: number | null;
  score: number | null;
  detail: string | null;
  notified: number;
  created_at: string;
}

export async function getKKState(db: D1Database): Promise<KKState | null> {
  return db.prepare('SELECT * FROM kk_state WHERE id = 1').first<KKState>();
}

export async function getKKWatch(db: D1Database, limit = 50): Promise<KKWatchRow[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM kk_watch WHERE setup != 'none' AND checked_at >= datetime('now', ?)
       ORDER BY score DESC LIMIT ?`
    )
    .bind(`-${WATCH_STALE_DAYS} days`, limit)
    .all<KKWatchRow>();
  return results;
}

export async function getKKSignals(db: D1Database, limit = 30): Promise<KKSignalRow[]> {
  const { results } = await db
    .prepare('SELECT * FROM kk_signals ORDER BY created_at DESC LIMIT ?')
    .bind(limit)
    .all<KKSignalRow>();
  return results;
}

async function inCooldown(db: D1Database, symbol: string, setup: KKSetup): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT id FROM kk_signals WHERE symbol = ? AND setup = ? AND created_at > datetime('now', ?) LIMIT 1`
    )
    .bind(symbol, setup, `-${COOLDOWN_DAYS[setup]} days`)
    .first();
  return !!row;
}

async function upsertWatch(db: D1Database, a: KKAnalysis): Promise<void> {
  await db
    .prepare(
      `INSERT INTO kk_watch (symbol, setup, price, adr_pct, dollar_vol, gain_1m, gain_3m, gain_6m,
         pivot, base_low, base_len, depth_pct, tightness, vol_dryup, ma_ref, ma_level,
         last_low, last_high, trigger_below, ext_pct, score, note, checked_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(symbol) DO UPDATE SET
         setup = excluded.setup, price = excluded.price, adr_pct = excluded.adr_pct,
         dollar_vol = excluded.dollar_vol, gain_1m = excluded.gain_1m, gain_3m = excluded.gain_3m,
         gain_6m = excluded.gain_6m, pivot = excluded.pivot, base_low = excluded.base_low,
         base_len = excluded.base_len, depth_pct = excluded.depth_pct, tightness = excluded.tightness,
         vol_dryup = excluded.vol_dryup, ma_ref = excluded.ma_ref, ma_level = excluded.ma_level,
         last_low = excluded.last_low, last_high = excluded.last_high,
         trigger_below = excluded.trigger_below, ext_pct = excluded.ext_pct,
         score = excluded.score, note = excluded.note, checked_at = datetime('now')`
    )
    .bind(
      a.symbol,
      a.setup,
      a.price,
      a.adrPct,
      a.avgDollarVol,
      a.gain1m,
      a.gain3m,
      a.gain6m,
      a.base?.pivot ?? null,
      a.base?.low ?? null,
      a.base?.len ?? null,
      a.base?.depthPct ?? null,
      a.base?.tightness ?? null,
      a.base?.volDryUp ?? null,
      // Parabolik satırlarda baz yoktur; kapama hedefi 20 EMA olduğu için onu sakla
      a.base?.maRef ?? (a.setup === 'parabolic_watch' ? '20ema' : null),
      a.base?.maLevel ?? (a.setup === 'parabolic_watch' ? a.ema20 : null),
      a.lastLow,
      a.lastHigh,
      a.parabolic?.triggerBelow ?? null,
      a.parabolic?.extPct ?? null,
      a.score,
      a.note || null
    )
    .run();
}

// ---- Canlı fiyat katmanı ----

interface LiveRow {
  symbol: string;
  price: number;
  dayChangePercent: number;
  gapPercent: number;
  dollarVolToday: number | null;
  // KK'nin stop referansları: kırılımda günün düşüğü, short'ta günün tepesi
  dayLow: number | null;
  dayHigh: number | null;
  lastTime: number;
}

/**
 * Canlı piyasa görüntüsü. Massive varsa tüm ABD piyasası TEK çağrıda gelir;
 * yoksa Yahoo'ya düşülür ve sembol başına istek gerektiği için `priority`
 * (tetik bekleyen kk_watch sembolleri) öne alınarak tavanla sınırlanır.
 */
async function liveMarket(
  cfg: KKState,
  priority: string[]
): Promise<{ map: Map<string, LiveRow>; universe: string[]; source: 'massive' | 'yahoo' }> {
  const map = new Map<string, LiveRow>();
  if (massiveConfigured()) {
    const rows = await massiveBroadRows().catch(() => []);
    if (rows.length) {
      for (const r of rows) {
        map.set(r.symbol, {
          symbol: r.symbol,
          price: r.price,
          dayChangePercent: r.dayChangePercent,
          gapPercent: r.gapPercent,
          dollarVolToday: r.liquidity * r.price,
          dayLow: r.dayLow,
          dayHigh: r.dayHigh,
          lastTime: r.lastTime,
        });
      }
      // Dönen taramanın evreni: likidite sırasına göre en iyi N sembol
      const universe = [...map.values()]
        .filter((r) => r.price >= cfg.min_price && (r.dollarVolToday ?? 0) >= cfg.min_dollar_vol)
        .sort((a, b) => (b.dollarVolToday ?? 0) - (a.dollarVolToday ?? 0))
        .slice(0, cfg.universe_max)
        .map((r) => r.symbol);
      return { map, universe, source: 'massive' };
    }
  }

  // Yahoo yolu: sembol başına 1 istek → tetik bekleyenler + günün hareketlileri
  const dynamic = await getDynamicSymbols().catch(() => [] as string[]);
  const wanted = [...new Set([...priority, ...dynamic, ...SCAN_UNIVERSE])].slice(0, YAHOO_LIVE_CAP);
  const spark = await fetchSpark(wanted);
  for (const [symbol, s] of spark) {
    const price = s.close[s.close.length - 1];
    const first = s.close[0];
    if (!price || !s.previousClose) continue;
    map.set(symbol, {
      symbol,
      price,
      dayChangePercent: ((price - s.previousClose) / s.previousClose) * 100,
      gapPercent: first ? ((first - s.previousClose) / s.previousClose) * 100 : 0,
      dollarVolToday: null,
      // Yahoo yolunda yalnızca kapanış serisi var: gün düşüğü/tepesi yaklaşık
      // (bar içi uçları göremez, bu yüzden gerçek düşükten biraz yüksektir)
      dayLow: Math.min(...s.close),
      dayHigh: Math.max(...s.close),
      lastTime: s.lastTime,
    });
  }
  return { map, universe: [...map.keys()], source: 'yahoo' };
}

/**
 * Gün içi bağlam — TEK istekle (5 günlük 5dk mum) üç şey verir:
 *   • relVolume: bugünün birikimli hacmi / önceki günlerin AYNI SAATE kadarki
 *     ortalaması. Saat eşleşmesi şart: gün ortasında kısmi hacmi tam gün
 *     ortalamasına bölmek göreli hacmi sistematik olarak küçük gösterir ve
 *     tam da EP'nin yakalanması gereken ilk saatte kurulumu eler.
 *   • orHigh/orLow: açılış aralığı (ilk 5 dk) — EP girişinin referansı.
 *   • dollarVolToday: bugün seansta dönen yaklaşık dolar hacmi.
 */
interface IntradayContext {
  relVolume: number | null;
  orHigh: number | null;
  orLow: number | null;
  dollarVolToday: number | null;
}

export async function intradayContext(symbol: string): Promise<IntradayContext> {
  const empty: IntradayContext = { relVolume: null, orHigh: null, orLow: null, dollarVolToday: null };
  try {
    const candles = await getCandles(symbol, '5m', '5d');
    if (candles.length < 20) return empty;
    const nowMin = nyMinutes();
    const byDay = new Map<number, Candle[]>();
    for (const c of candles) {
      const m = nyMinutes(c.t);
      if (m < NY_OPEN || m >= NY_CLOSE) continue; // seans dışı barları at
      if (m > nowMin) continue; // önceki günleri bugünün saatiyle eşitle
      const day = Math.floor(c.t / 86400);
      const arr = byDay.get(day) ?? [];
      arr.push(c);
      byDay.set(day, arr);
    }
    const days = [...byDay.keys()].sort((a, b) => a - b);
    if (!days.length) return empty;
    const todayBars = byDay.get(days[days.length - 1]) ?? [];
    const todayVol = todayBars.reduce((s, c) => s + c.v, 0);
    const prevVols = days
      .slice(0, -1)
      .map((d) => (byDay.get(d) ?? []).reduce((s, c) => s + c.v, 0))
      .filter((v) => v > 0);
    const first = todayBars[0];
    return {
      relVolume: prevVols.length && todayVol > 0 ? todayVol / mean(prevVols) : null,
      orHigh: first ? first.h : null,
      orLow: first ? first.l : null,
      dollarVolToday: todayBars.reduce((s, c) => s + c.v * c.c, 0) || null,
    };
  } catch {
    return empty;
  }
}

// ---- Sinyal üretimi ----

interface SignalDraft {
  symbol: string;
  setup: KKSetup;
  side: 'long' | 'short';
  price: number;
  entry: number;
  stop: number;
  target: number | null;
  relVolume: number | null;
  adrPct: number | null;
  score: number | null;
  detail: string;
  message: string;
}

const pct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
const pct0 = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(0)}%`; // aylık getiriler
const usd = (v: number) => `$${v >= 100 ? v.toFixed(1) : v.toFixed(2)}`;
const money = (v: number) =>
  v >= 1e9 ? `$${(v / 1e9).toFixed(1)}B` : `$${(v / 1e6).toFixed(0)}M`;

/** Risk mesafesinden pozisyon büyüklüğü önerisi (KK: sabit hesap riski). */
function sizingLine(riskPct: number): string {
  if (riskPct <= 0) return '';
  const sizePct = (RISK_BUDGET_PCT / riskPct) * 100;
  return (
    `📐 Boyut: %${RISK_BUDGET_PCT} hesap riski → pozisyon ≈ hesabın %${sizePct.toFixed(0)}'i ` +
    `(risk mesafesi %${riskPct.toFixed(2)})`
  );
}

const DISCLAIMER = '<i>Yatırım tavsiyesi değildir; kurulum tarayıcı çıktısıdır.</i>';

async function emitSignal(
  db: D1Database,
  env: TelegramEnv,
  draft: SignalDraft,
  notify: boolean
): Promise<KKSignalRow> {
  const id = crypto.randomUUID();
  const riskPct = Math.abs((draft.entry - draft.stop) / draft.entry) * 100;
  let sent = false;
  if (notify && telegramConfigured(env)) {
    sent = await sendTelegram(env, `${draft.message}\n${DISCLAIMER}`);
  }
  await db
    .prepare(
      `INSERT INTO kk_signals (id, symbol, setup, side, price, entry, stop, target, risk_pct,
         rel_volume, adr_pct, score, detail, notified)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      draft.symbol,
      draft.setup,
      draft.side,
      draft.price,
      draft.entry,
      draft.stop,
      draft.target,
      riskPct,
      draft.relVolume,
      draft.adrPct,
      draft.score,
      draft.detail,
      sent ? 1 : 0
    )
    .run();
  await markHotSymbol(db, draft.symbol, 'kk', draft.score ?? null).catch(() => {});
  return (await db.prepare('SELECT * FROM kk_signals WHERE id = ?').bind(id).first<KKSignalRow>())!;
}

// ---- 1) BREAKOUT ve 3) PARABOLİK tetikleri (kk_watch × canlı fiyat) ----

async function checkTriggers(
  db: D1Database,
  env: TelegramEnv,
  live: Map<string, LiveRow>,
  options: { notify: boolean; force: boolean }
): Promise<KKSignalRow[]> {
  const all = await getKKWatch(db, 200);
  // Bayat seviyelerle sinyal üretilmez (bkz. TRIGGER_MAX_AGE_DAYS)
  const maxAgeMs = TRIGGER_MAX_AGE_DAYS * 24 * 3600 * 1000;
  const watch = all.filter(
    (w) => Date.now() - Date.parse(w.checked_at.replace(' ', 'T') + 'Z') <= maxAgeMs
  );
  const signals: KKSignalRow[] = [];

  // --- Breakout: canlı fiyat konsolidasyon tepesini aştı mı? ---
  const breakouts = watch
    .filter((w) => w.setup === 'breakout' && w.pivot)
    .map((w) => ({ w, l: live.get(w.symbol) }))
    .filter(
      (x): x is { w: KKWatchRow; l: LiveRow } =>
        !!x.l && x.l.price >= x.w.pivot! * (1 + BREAKOUT_BUFFER) && x.l.dayChangePercent > 0
    )
    .sort((a, b) => (b.w.score ?? 0) - (a.w.score ?? 0))
    .slice(0, MAX_BREAKOUT_CONFIRM);

  for (const { w, l } of breakouts) {
    if (await inCooldown(db, w.symbol, 'breakout')) continue;
    const adr = w.adr_pct ?? 0;
    // KOVALAMA KORUMASI: KK pivotun bir ADR'sinden fazla uzaklaşmış kırılışa
    // girmez — stop mesafesi hareketin ödülüne göre saçmalaşır. Fiyat pivotun
    // çok üstündeyse (ör. üstünden gap'lediyse) sinyal üretilmez; sembol
    // izleme listesinde kalır, gerekirse EP tarafında değerlendirilir.
    const chaseLimit = w.pivot! * (1 + Math.max(0.02, Math.min(0.08, adr / 100)));
    if (!options.force && l.price > chaseLimit) continue;

    // KK: hacimsiz kırılış güvenilmez — saat eşleşmeli göreli hacimle teyit
    const relVol = (await intradayContext(w.symbol)).relVolume;
    if (!options.force && (relVol == null || relVol < BREAKOUT_MIN_REL_VOL)) continue;

    // Giriş fiili fiyattır (pivot tetiktir); stop her zaman girişin ALTINDA
    // olmalı — aksi halde risk hesabı ters döner.
    const entry = l.price;
    // Stop adayları: KK'nin ilk tercihi GÜNÜN DÜŞÜĞÜ; yoksa/çok yakınsa MA
    // seviyesi, önceki günün düşüğü ya da baz dibi. Girişe göre 2.5 ADR'den
    // geniş stop alınmaz; 0.5 ADR'den yakın stop da gürültüye yem olur.
    const maxRisk = Math.max(0.03, Math.min(0.12, (adr * 2.5) / 100));
    const minRisk = Math.max(0.005, (adr * 0.5) / 100);
    const floor = entry * (1 - maxRisk);
    const ceil = entry * (1 - minRisk);
    const candidates = [l.dayLow, w.ma_level, w.last_low, w.base_low]
      .filter((v): v is number => typeof v === 'number' && v > 0 && v < entry)
      .filter((v) => v >= floor && v <= ceil);
    const stop = candidates.length ? Math.max(...candidates) : floor;
    const stopRef = !candidates.length
      ? 'risk sınırı (2,5 ADR — yapısal seviye çok uzak)'
      : l.dayLow != null && stop === l.dayLow
        ? 'günün düşüğü'
        : `${w.ma_ref ?? 'MA'} / baz dibi`;
    const riskPct = ((entry - stop) / entry) * 100;
    const target = entry * (1 + (adr * 2.5) / 100); // 3-5 günde 2-3 ADR

    const message =
      `🚀 <b>KK BREAKOUT — ${w.symbol}</b> ${usd(l.price)} (${pct(l.dayChangePercent)})\n` +
      `Pivot ${usd(w.pivot!)} kırıldı | hacim ${relVol ? `${relVol.toFixed(1)}x` : 'teyit yok'}\n` +
      `Konsolidasyon: ${w.base_len} gün, derinlik %${(w.depth_pct ?? 0).toFixed(1)}, ` +
      `sıkılık ${(w.tightness ?? 1).toFixed(2)}, hacim kuruması ${(w.vol_dryup ?? 1).toFixed(2)}x\n` +
      `Momentum: 1a ${pct0(w.gain_1m ?? 0)} | 3a ${pct0(w.gain_3m ?? 0)} | ADR %${adr.toFixed(1)}\n` +
      `🛑 Stop ${usd(stop)} (%${riskPct.toFixed(2)}) — ${stopRef}\n` +
      `🎯 3-5 günde 2-3 ADR (≈ ${usd(target)}) → 1/3-1/2 sat, kalanı ${w.ma_ref ?? '10 EMA'} ile trail\n` +
      sizingLine(riskPct);

    signals.push(
      await emitSignal(
        db,
        env,
        {
          symbol: w.symbol,
          setup: 'breakout',
          side: 'long',
          price: l.price,
          entry,
          stop,
          target,
          relVolume: relVol,
          adrPct: adr,
          score: w.score,
          detail: `${w.base_len} günlük baz, pivot ${w.pivot!.toFixed(2)}, ${w.ma_ref ?? ''}`,
          message,
        },
        options.notify
      )
    );
  }

  // --- Parabolik short: dönüş teyidi (önceki günün düşüğü kırıldı) ---
  const paras = watch
    .filter((w) => w.setup === 'parabolic_watch' && w.trigger_below)
    .map((w) => ({ w, l: live.get(w.symbol) }))
    .filter(
      (x): x is { w: KKWatchRow; l: LiveRow } =>
        !!x.l && x.l.price < x.w.trigger_below! && x.l.dayChangePercent < 0
    )
    .sort((a, b) => (b.w.ext_pct ?? 0) - (a.w.ext_pct ?? 0))
    .slice(0, MAX_PARA_SIGNALS);

  for (const { w, l } of paras) {
    if (await inCooldown(db, w.symbol, 'parabolic_short')) continue;
    const adr = w.adr_pct ?? 0;
    // Geç kalma koruması: fiyat tetiğin bir ADR'sinden fazla altına düştüyse
    // hareketin ilk bacağı bitmiştir; KK boşluğa short atmaz.
    const lateLimit = w.trigger_below! * (1 - Math.max(0.03, adr / 100));
    if (!options.force && l.price < lateLimit) continue;

    // Giriş fiili fiyattır; tetik seviyesi ayrıca yazılır. Stop dünün/bugünün
    // tepesi — short'ta stop girişin ÜSTÜNDE olmalı.
    const entry = l.price;
    const highRefs = [l.dayHigh, w.last_high].filter(
      (v): v is number => typeof v === 'number' && v > entry
    );
    // Günün tepesi ile dünün tepesinden HANGİSİ daha yakınsa o: short stop'u
    // kırılan seviyenin hemen üstünde durur, gereksiz geniş risk alınmaz.
    if (!highRefs.length) continue;
    const stop = Math.min(...highRefs);
    // RİSK TAVANI: short'ta uydurma stop olmaz (tepenin üstü neresi ise orasıdır),
    // o yüzden tavanı aşan aday sinyal üretmez — atlanır. 27 Ağu'da CRE gün içinde
    // $8.60'tan $5.45'e çökmüştü; tetik kırılalı çok olduğu için dünün tepesine
    // göre risk %57,8 çıkıyor ve bu sinyal "işlenebilir" değil, geç kalmış demektir.
    // Not: bu kapı `force` ile de atlanmaz. force seans/veri kapılarını atlamak
    // içindir; risk tavanı ise sinyalin geçerliliğiyle ilgilidir — atlanırsa
    // manuel koşu anlamsız risk taşıyan sinyal üretir.
    const maxShortRisk = Math.min(0.3, Math.max(0.05, (adr * 2.5) / 100));
    if (stop > entry * (1 + maxShortRisk)) continue;
    const stopRef = l.dayHigh != null && stop === l.dayHigh ? 'bugünün tepesi' : 'dünün tepesi';
    const riskPct = ((stop - entry) / entry) * 100;
    const target = w.ma_level && w.ma_level < entry ? w.ma_level : entry * 0.7;

    const message =
      `⚡ <b>KK PARABOLİK SHORT — ${w.symbol}</b> ${usd(l.price)} (${pct(l.dayChangePercent)})\n` +
      `Aşırı hareket: ${w.note ?? ''}\n` +
      // "ilk kırmızı gün" her zaman doğru değil: hisse dünden de düşmüş olabilir
      // (28 Ağu MRNA sinyali böyleydi, üst üste yükseliş 0 gün). Nüansı not
      // satırı taşıyor; başlık iddiasız kalıyor.
      `Tetik: önceki gün düşüğü ${usd(w.trigger_below!)} kırıldı → dönüş teyidi\n` +
      `🛑 Stop ${usd(stop)} (%${riskPct.toFixed(2)}) — ${stopRef}\n` +
      `🎯 10/20 EMA bölgesi ≈ ${usd(target)}; günler içinde parça parça kapat\n` +
      sizingLine(riskPct) +
      `\n⚠️ Short riski asimetriktir: borç bulma maliyeti, gap ve halt riski — küçük boyut.`;

    signals.push(
      await emitSignal(
        db,
        env,
        {
          symbol: w.symbol,
          setup: 'parabolic_short',
          side: 'short',
          price: l.price,
          entry,
          stop,
          target,
          relVolume: null,
          adrPct: adr,
          score: w.score,
          detail: `${w.note ?? ''} | tetik ${w.trigger_below!.toFixed(2)}`,
          message,
        },
        options.notify
      )
    );
  }

  return signals;
}

// ---- 2) EPISODIC PIVOT (beklenmedik katalizör + dev gap + olağanüstü hacim) ----

async function scanEpisodicPivots(
  db: D1Database,
  env: TelegramEnv,
  cfg: KKState,
  rows: LiveRow[],
  options: { notify: boolean; force: boolean }
): Promise<KKSignalRow[]> {
  // Ucuz ön eleme (snapshot'tan): gap büyük, gap tutuluyor, fiyat/likidite yeterli
  const prelim = rows
    .filter((r) => {
      if (r.price < Math.max(cfg.min_price, EP_MIN_PRICE)) return false;
      if (r.gapPercent < cfg.min_gap_pct) return false;
      // Gap'i geri veren hisse EP değildir (KK: gün boyu gücünü korumalı)
      if (r.dayChangePercent < r.gapPercent * 0.5) return false;
      if (r.dollarVolToday != null && r.dollarVolToday < EP_MIN_DOLLAR_VOL) return false;
      return true;
    })
    .sort((a, b) => b.gapPercent - a.gapPercent)
    .slice(0, MAX_EP_CANDIDATES * 2);

  const signals: KKSignalRow[] = [];
  let checked = 0;
  let intelUsed = 0;

  for (const r of prelim) {
    if (checked >= MAX_EP_CANDIDATES) break;
    if (await inCooldown(db, r.symbol, 'episodic_pivot')) continue;
    checked++;

    // Pahalı teyit: günlük mumlar (1 istek) — hisse gap'ten ÖNCE uyuyor muydu?
    let bars: Candle[];
    try {
      bars = await getCandles(r.symbol, '1d', '1y');
    } catch {
      continue;
    }
    const { closed, today } = splitToday(bars);
    if (closed.length < 40) continue;
    const prior3m = gainPct(closed, 63) ?? 0;
    const adr = adrPct(closed);
    // KK: en iyi EP'ler "kimsenin bakmadığı", aylardır hareketsiz hisselerde olur.
    // Ucuz eleme pahalı istekten ÖNCE yapılır.
    if (!options.force && prior3m > EP_MAX_PRIOR_GAIN) continue;

    // Gün içi bağlam (1 istek): saat eşleşmeli göreli hacim + açılış aralığı
    const ctx = await intradayContext(r.symbol);
    const relVol = ctx.relVolume;
    const dollarVolToday = r.dollarVolToday ?? ctx.dollarVolToday ?? (today?.v ?? 0) * r.price;

    if (!options.force) {
      if (relVol == null || relVol < EP_MIN_REL_VOL) continue;
      if (dollarVolToday < EP_MIN_DOLLAR_VOL) continue;
    }

    const or = ctx.orHigh != null && ctx.orLow != null ? { high: ctx.orHigh, low: ctx.orLow } : null;
    const entry = or ? or.high : r.price;
    const stop = or ? or.low : r.price * (1 - Math.max(0.04, adr / 100));
    const riskPct = ((entry - stop) / entry) * 100;
    const target = entry * (1 + (Math.max(adr, 5) * 3) / 100);

    // Katalizör: EP'nin tanımı gereği bir haber olmalı (fail-open: kaynak
    // çökerse sinyal yine gider, sadece etiketsiz).
    let catalyst = '';
    if (intelUsed < MAX_EP_INTEL) {
      intelUsed++;
      try {
        const intel = await getIntel(r.symbol);
        if (intel.news.length) {
          catalyst = `🧨 Katalizör: “${intel.news[0].title.slice(0, 110)}” (${intel.news[0].publisher})`;
        } else {
          catalyst = '🧨 Katalizör: haber akışında görünmüyor — dikkatli ol';
        }
        if (intel.earningsInDays != null && intel.earningsInDays <= 1) {
          catalyst += `\n📅 Bilanço ${intel.earningsInDays} gün içinde`;
        }
      } catch {
        // istihbarat alınamadı
      }
    }

    const lateNote =
      r.price > entry * (1 + adr / 100)
        ? '\n⏰ Fiyat giriş bölgesinin bir ADR üstünde — kovalama, geri çekilme bekle.'
        : '';

    const message =
      `📣 <b>KK EPISODIC PIVOT — ${r.symbol}</b> ${usd(r.price)} (${pct(r.dayChangePercent)})\n` +
      `Gap ${pct(r.gapPercent)} | hacim ${relVol ? `${relVol.toFixed(1)}x normal` : 'ölçülemedi'} | ` +
      `bugün ≈ ${money(dollarVolToday)} işlem\n` +
      `Önceki 3 ay: ${pct0(prior3m)} → ` +
      (prior3m <= EP_MAX_PRIOR_GAIN ? 'hisse uyuyordu ✅' : 'zaten koşmuş ⚠️ (klasik EP değil)') +
      ` | ADR %${adr.toFixed(1)}\n` +
      (catalyst ? `${catalyst}\n` : '') +
      `📥 Giriş: açılış aralığı tepesi ${usd(entry)} kırılışı${or ? '' : ' (ORB verisi yok, anlık fiyat)'}\n` +
      `🛑 Stop ${usd(stop)} (%${riskPct.toFixed(2)}) — açılış aralığının dibi\n` +
      `🎯 İlk hedef ≈ ${usd(target)}; gücü sürerse 10/20 EMA ile günlerce taşı\n` +
      sizingLine(riskPct) +
      lateNote;

    signals.push(
      await emitSignal(
        db,
        env,
        {
          symbol: r.symbol,
          setup: 'episodic_pivot',
          side: 'long',
          price: r.price,
          entry,
          stop,
          target,
          relVolume: relVol,
          adrPct: adr,
          score: r.gapPercent + (relVol ?? 0),
          detail: `gap ${r.gapPercent.toFixed(1)}%, önceki 3 ay ${prior3m.toFixed(0)}%`,
          message,
        },
        options.notify
      )
    );
  }

  return signals;
}

// ---- Dönen derin tarama (günlük mumlar → kk_watch) ----

async function refreshWatch(
  db: D1Database,
  cfg: KKState,
  universe: string[],
  batch: number
): Promise<{ refreshed: number; setups: number }> {
  if (batch <= 0 || !universe.length) return { refreshed: 0, setups: 0 };
  const { results } = await db
    .prepare('SELECT symbol, checked_at FROM kk_watch')
    .all<{ symbol: string; checked_at: string }>();
  const seen = new Map(results.map((r) => [r.symbol, r.checked_at]));
  const cutoff = Date.now() - REFRESH_TTL_HOURS * 3600 * 1000;

  // En eski kontrol edilenler önce; hiç bakılmamışlar en önde (imleç gerekmez,
  // evren her koşuda değişse de kapsama kendini dengeler).
  const targets = universe
    .map((symbol) => {
      const at = seen.get(symbol);
      const ts = at ? Date.parse(at.replace(' ', 'T') + 'Z') : 0;
      return { symbol, ts };
    })
    .filter((t) => t.ts < cutoff)
    .sort((a, b) => a.ts - b.ts)
    .slice(0, batch);

  let setups = 0;
  const CONCURRENCY = 5;
  for (let i = 0; i < targets.length; i += CONCURRENCY) {
    const slice = targets.slice(i, i + CONCURRENCY);
    const analyses = await Promise.all(
      slice.map(async ({ symbol }) => {
        try {
          const bars = await getCandles(symbol, '1d', '1y');
          return analyzeDaily(symbol, bars, {
            minPrice: cfg.min_price,
            minDollarVol: cfg.min_dollar_vol,
          });
        } catch {
          return null;
        }
      })
    );
    for (const a of analyses) {
      if (!a) continue;
      await upsertWatch(db, a);
      if (a.setup !== 'none') setups++;
    }
  }
  return { refreshed: targets.length, setups };
}

// ---- Günlük izleme listesi raporu (açılış öncesi) ----

const WATCHLIST_WINDOW = { from: 8 * 60, to: 9 * 60 + 25 }; // 08:00-09:25 NY

async function maybeSendWatchlist(
  db: D1Database,
  env: TelegramEnv,
  cfg: KKState,
  min: number,
  day: string,
  opts: { force: boolean; resend: boolean }
): Promise<boolean> {
  // force → saat penceresini atlar (manuel koşu). resend → günlük "gönderildi"
  // damgasını da atlar: rapor Telegram'a ulaşmadıysa/kaybolduysa tekrar istenebilsin.
  const due =
    opts.force || opts.resend || (isWeekday() && min >= WATCHLIST_WINDOW.from && min < WATCHLIST_WINDOW.to);
  if (!due) return false;
  if (!opts.resend && cfg.last_watchlist_day === day) return false;
  if (!telegramConfigured(env)) return false;

  const watch = await getKKWatch(db, 60);
  const breakouts = watch.filter((w) => w.setup === 'breakout').slice(0, 8);
  const paras = watch.filter((w) => w.setup === 'parabolic_watch').slice(0, 5);
  if (!breakouts.length && !paras.length) return false;

  const lines: string[] = [];
  if (breakouts.length) {
    lines.push('<b>Konsolidasyon → kırılım adayları</b>');
    breakouts.forEach((w, i) => {
      lines.push(
        `${i + 1}. <b>${w.symbol}</b> ${usd(w.price ?? 0)} → pivot <b>${usd(w.pivot ?? 0)}</b>\n` +
          `   ${w.base_len} gün baz | derinlik %${(w.depth_pct ?? 0).toFixed(1)} | ` +
          `sıkılık ${(w.tightness ?? 1).toFixed(2)} | hacim ${(w.vol_dryup ?? 1).toFixed(2)}x | ` +
          `ADR %${(w.adr_pct ?? 0).toFixed(1)} | 3a ${pct0(w.gain_3m ?? 0)}\n` +
          `   stop bölgesi ${usd(w.base_low ?? 0)} / ${w.ma_ref ?? 'MA'} ${usd(w.ma_level ?? 0)}`
      );
    });
  }
  if (paras.length) {
    lines.push('\n<b>Parabolik — dönüş beklenenler (short izleme)</b>');
    paras.forEach((w) => {
      lines.push(
        `• <b>${w.symbol}</b> ${usd(w.price ?? 0)} | 20 EMA'dan %${(w.ext_pct ?? 0).toFixed(0)} uzak\n` +
          `   tetik: ${usd(w.trigger_below ?? 0)} altı (ilk kırmızı gün)`
      );
    });
  }

  const sent = await sendTelegram(
    env,
    `📋 <b>Kullamägi İzleme Listesi</b> — ${day}\n` +
      `Seviyeler kırılırsa anında sinyal gelir.\n\n${lines.join('\n')}\n\n${DISCLAIMER}`
  );
  if (sent) {
    await db
      .prepare("UPDATE kk_state SET last_watchlist_day = ?, updated_at = datetime('now') WHERE id = 1")
      .bind(day)
      .run();
  }
  return sent;
}

// ---- Ana koşu (zamanlayıcı her vuruşta çağırır) ----

export interface KKRunResult {
  ran: boolean;
  skippedReason?: string;
  source: 'massive' | 'yahoo';
  universe: number;
  refreshed: number;
  newSetups: number;
  watchCount: number;
  signals: KKSignalRow[];
  notified: number;
  watchlistSent: boolean;
  stale: boolean;
  phase: string;
}

const DATA_FRESH_SECONDS = 20 * 60;
const EP_WINDOW_END = 13 * 60; // EP avı öğleden sonra 13:00 NY'de biter

export async function runKullamagi(
  db: D1Database,
  env: TelegramEnv,
  options: {
    force?: boolean;
    notify?: boolean;
    refreshBatch?: number;
    /** Günlük damgayı yok sayıp izleme listesini yeniden gönder */
    resendWatchlist?: boolean;
  } = {}
): Promise<KKRunResult> {
  const force = options.force ?? false;
  const notify = options.notify ?? true;
  const cfg = await getKKState(db);
  const empty: KKRunResult = {
    ran: false,
    source: 'yahoo',
    universe: 0,
    refreshed: 0,
    newSetups: 0,
    watchCount: 0,
    signals: [],
    notified: 0,
    watchlistSent: false,
    stale: false,
    phase: 'kapalı',
  };
  if (!cfg) return { ...empty, skippedReason: 'kk_state yok (migration uygulanmadı mı?)' };
  if (!cfg.enabled && !force) return { ...empty, skippedReason: 'devre dışı' };

  const min = nyMinutes();
  const day = nyDate();
  const watchRows = await getKKWatch(db, 200);
  const priority = watchRows.map((w) => w.symbol);

  const { map, universe, source } = await liveMarket(cfg, priority);
  // Sıcak sembol hafızası (tarama + nabız alarmları) evrene eklenir: KK'nin
  // "günün en çok hareket edenleri" listesi bu isimlerden beslenir.
  const hot = await getHotSymbols(db).catch(() => [] as string[]);
  // İZLENEN KURULUMLAR HER ZAMAN EVRENDE: bir sembol likidite süzgecinden
  // düşünce (patlaması sönen küçük hisseler tipik) evrenden çıkıyor, dönen
  // tarama ona bir daha uğramıyor ve kk_watch'taki pivot/tetik seviyeleri
  // günlerce tazelenmeden tetiklenebilir kalıyordu (31 Ağu: en yüksek skorlu
  // beş kurulumun seviyeleri Cuma akşamındandı). Kurulumu olan semboller
  // evrene eklenir; artık kurulum taşımıyorlarsa tarama onları 'none' yapar.
  const fullUniverse = [...new Set([...universe, ...hot, ...priority])];
  const lastBarTime = Math.max(0, ...[...map.values()].map((r) => r.lastTime));
  const stale = lastBarTime > 0 && Date.now() / 1000 - lastBarTime > DATA_FRESH_SECONDS;

  // Tetikler yalnızca seans içinde ve taze veriyle üretilir. Açılışın ilk 5
  // dakikası atlanır: KK açılış aralığı oturmadan kırılım almaz.
  const tradable = force || (inNySession(min) && min >= NY_OPEN + 5 && !stale);

  let signals: KKSignalRow[] = [];
  if (tradable) {
    try {
      signals = await checkTriggers(db, env, map, { notify, force });
    } catch (e) {
      console.error('KK tetik hatası:', e);
    }
    // Episodic pivot avı sabah seansında anlamlı (gap günü ORB oyunu)
    if (force || min <= EP_WINDOW_END) {
      try {
        const eps = await scanEpisodicPivots(db, env, cfg, [...map.values()], { notify, force });
        signals = [...signals, ...eps];
      } catch (e) {
        console.error('KK episodic pivot hatası:', e);
      }
    }
  }

  // Derin tarama (günlük mumlar): piyasa kapalıyken de anlamlı — KK'nin gece
  // taraması buna denk gelir. Bütçeyi tetikler yediyse batch küçültülür.
  const batch = options.refreshBatch ?? (signals.length ? Math.ceil(cfg.refresh_batch / 2) : cfg.refresh_batch);
  let refreshed = 0;
  let newSetups = 0;
  try {
    const r = await refreshWatch(db, cfg, fullUniverse, batch);
    refreshed = r.refreshed;
    newSetups = r.setups;
  } catch (e) {
    console.error('KK derin tarama hatası:', e);
  }

  let watchlistSent = false;
  try {
    watchlistSent = await maybeSendWatchlist(db, env, cfg, min, day, {
      force: force && notify,
      resend: !!options.resendWatchlist && notify,
    });
  } catch (e) {
    console.error('KK izleme listesi hatası:', e);
  }

  const watchCount = (
    await db
      .prepare(
        `SELECT COUNT(*) AS n FROM kk_watch WHERE setup != 'none' AND checked_at >= datetime('now', ?)`
      )
      .bind(`-${WATCH_STALE_DAYS} days`)
      .first<{ n: number }>()
  )?.n ?? 0;

  return {
    ran: true,
    source,
    universe: fullUniverse.length,
    refreshed,
    newSetups,
    watchCount,
    signals,
    notified: signals.filter((s) => s.notified).length,
    watchlistSent,
    stale,
    phase: tradable ? 'seans' : stale ? 'veri bayat' : inNySession(min) ? 'seans (ısınma)' : 'seans dışı',
  };
}

/** Tek sembol tanısı: kurulum neden var/yok — /api/kk/analyze ucu kullanır. */
export async function analyzeSymbol(
  db: D1Database,
  symbol: string
): Promise<KKAnalysis | null> {
  const cfg = await getKKState(db);
  const bars = await getCandles(symbol.toUpperCase(), '1d', '1y');
  return analyzeDaily(symbol.toUpperCase(), bars, {
    minPrice: cfg?.min_price ?? 3,
    minDollarVol: cfg?.min_dollar_vol ?? 3_000_000,
  });
}
