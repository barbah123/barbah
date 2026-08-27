// MASSIVE (api.massive.com) VERİ SAĞLAYICI ADAPTÖRÜ — Polygon.io şablonu
// Anahtar tanımlıysa piyasa verisi buradan gelir (Yahoo'nun Worker-IP engeli yok,
// tek çağrıda tüm ABD piyasası snapshot'ı). Anahtar yoksa uygulama Yahoo'ya düşer.
// Anahtar KODA YAZILMAZ — Cloudflare secret (MASSIVE_API_KEY) olarak set edilir ve
// her istek/cron girişinde setMassiveKey() ile bu modüle aktarılır.

import type { Quote, Candle } from './data';
import type { SparkSeries } from './scanner';

const BASE = 'https://api.massive.com';

let API_KEY: string | undefined;
export function setMassiveKey(key?: string): void {
  API_KEY = key && key.trim() ? key.trim() : undefined;
}
export function massiveConfigured(): boolean {
  return !!API_KEY;
}

async function mFetch(path: string): Promise<any> {
  if (!API_KEY) throw new Error('MASSIVE_API_KEY tanımlı değil');
  const sep = path.includes('?') ? '&' : '?';
  const res = await fetch(`${BASE}${path}${sep}apiKey=${encodeURIComponent(API_KEY)}`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Massive ${res.status}`);
  return res.json();
}

interface SnapTicker {
  ticker: string;
  todaysChangePerc?: number;
  lastTrade?: { p?: number };
  prevDay?: { c?: number; v?: number };
  day?: { o?: number; h?: number; l?: number; c?: number; v?: number };
  min?: { o?: number; h?: number; l?: number; c?: number; v?: number; t?: number };
}

/** Sağlayıcı sağlık kontrolü: tek snapshot çağrısı kaç ticker döndürüyor? */
export async function massivePing(): Promise<{ ok: boolean; count: number; error?: string }> {
  try {
    const data = await mFetch('/v2/snapshot/locale/us/markets/stocks/tickers');
    return { ok: true, count: (data?.tickers ?? []).length };
  } catch (e: any) {
    return { ok: false, count: 0, error: String(e?.message ?? e) };
  }
}

/** Tüm ABD piyasası snapshot'ı — tek çağrı. Anlık fiyat + günlük değişim + gün OHLC. */
export async function massiveSnapshotAll(): Promise<SnapTicker[]> {
  const data = await mFetch('/v2/snapshot/locale/us/markets/stocks/tickers');
  return (data?.tickers ?? []) as SnapTicker[];
}

// Kısa ömürlü snapshot önbelleği: aynı cron döngüsünde getDynamicSymbols + fetchSpark
// tek snapshot çağrısını paylaşsın (alt-istek bütçesi + hız).
let snapCache: { at: number; map: Map<string, SnapTicker> } | null = null;
const SNAP_TTL_MS = 8000;

export async function massiveSnapshotMap(): Promise<Map<string, SnapTicker>> {
  if (snapCache && Date.now() - snapCache.at < SNAP_TTL_MS) return snapCache.map;
  const all = await massiveSnapshotAll();
  const map = new Map<string, SnapTicker>();
  for (const t of all) if (t.ticker) map.set(t.ticker.toUpperCase(), t);
  snapCache = { at: Date.now(), map };
  return map;
}

const SYMBOL_RE = /^[A-Z]{1,5}$/;

export interface MassiveBroadRow {
  symbol: string;
  price: number;
  dayChangePercent: number;
  gapPercent: number;
  rangePercent: number;
  // Günün düşüğü/tepesi (pre-market'te 0 gelebilir → null). Stop referansı:
  // KK kırılım stop'u "günün düşüğü", short stop'u "günün tepesi"dir.
  dayLow: number | null;
  dayHigh: number | null;
  liquidity: number; // gün hacmi (pre-market'te önceki gün hacmi)
  lastTime: number; // unix saniye
}

/**
 * Tüm piyasayı tek snapshot'tan aday satırlarına çevirir (per-symbol çağrı YOK).
 * Momentum burada yok (snapshot gün içi pencere vermez) — çağıran, en iyi adayları
 * aggregates ile zenginleştirir. Böylece geniş kapsama alt-istek bütçesine takılmaz.
 */
export async function massiveBroadRows(): Promise<MassiveBroadRow[]> {
  const map = await massiveSnapshotMap();
  const rows: MassiveBroadRow[] = [];
  const firstPos = (...vals: (number | undefined)[]) =>
    vals.find((v) => typeof v === 'number' && v > 0);
  for (const t of map.values()) {
    // Pre-market'te day.* alanları 0 gelir (null değil) — bu yüzden sıfır-olmayan seç
    const price = firstPos(t.lastTrade?.p, t.min?.c, t.day?.c);
    const prev = t.prevDay?.c;
    if (!SYMBOL_RE.test(t.ticker)) continue;
    if (typeof price !== 'number' || price < 3) continue;
    if (typeof prev !== 'number' || prev <= 0) continue;
    if (typeof t.todaysChangePerc !== 'number') continue;
    // Likidite: gün hacmi yoksa (pre-market) önceki gün hacmine düş
    const liqVol = t.day?.v && t.day.v > 0 ? t.day.v : t.prevDay?.v ?? 0;
    if (liqVol < 100_000) continue;
    // Gün OHLC yoksa (pre-market) gap/range hesaplama — 0 bırak
    const hasDay = (t.day?.o ?? 0) > 0;
    const gapPercent = hasDay ? ((t.day!.o! - prev) / prev) * 100 : 0;
    const rangePercent = hasDay ? ((t.day!.h! - t.day!.l!) / prev) * 100 : 0;
    rows.push({
      symbol: t.ticker.toUpperCase(),
      price,
      dayChangePercent: t.todaysChangePerc,
      gapPercent,
      rangePercent,
      dayLow: (t.day?.l ?? 0) > 0 ? t.day!.l! : null,
      dayHigh: (t.day?.h ?? 0) > 0 ? t.day!.h! : null,
      liquidity: liqVol,
      lastTime: t.min?.t ? Math.floor(t.min.t / 1000) : Math.floor(Date.now() / 1000),
    });
  }
  return rows;
}

/** Tüm piyasadan hareketli sembolleri seç (dinamik evren): |günlük değişim| + likidite. */
export async function massiveMovers(limit: number): Promise<string[]> {
  const map = await massiveSnapshotMap();
  const rows = [...map.values()]
    .filter((t) => {
      const price = t.lastTrade?.p ?? t.day?.c ?? t.min?.c;
      const vol = t.day?.v ?? 0;
      return (
        SYMBOL_RE.test(t.ticker) &&
        typeof price === 'number' &&
        price >= 3 &&
        vol >= 100_000 && // likidite tabanı
        typeof t.todaysChangePerc === 'number'
      );
    })
    .sort((a, b) => Math.abs(b.todaysChangePerc!) - Math.abs(a.todaysChangePerc!));
  return rows.slice(0, limit).map((t) => t.ticker.toUpperCase());
}

/** Tekil ticker snapshot'ı — portföy/izleme/seviye için anlık fiyat. */
export async function massiveQuote(symbol: string): Promise<Quote | null> {
  try {
    const key = symbol.toUpperCase();
    const data = await mFetch(
      `/v2/snapshot/locale/us/markets/stocks/tickers/${encodeURIComponent(key)}`
    );
    const t: SnapTicker | undefined = data?.ticker ?? data?.results;
    if (!t) return null;
    // Pre-market'te day.c = 0 gelir (null değil); sıfır-olmayan ilk fiyatı seç
    const price = [t.lastTrade?.p, t.min?.c, t.day?.c].find(
      (v) => typeof v === 'number' && v > 0
    );
    const prev = t.prevDay?.c;
    if (typeof price !== 'number' || typeof prev !== 'number') return null;
    return {
      symbol: key,
      name: null, // snapshot isim vermez; arayüz zaten sembolü gösteriyor
      price,
      previousClose: prev,
      change: price - prev,
      changePercent: prev ? ((price - prev) / prev) * 100 : 0,
      currency: 'USD',
      time: t.min?.t ? Math.floor(t.min.t / 1000) : Math.floor(Date.now() / 1000),
    };
  } catch {
    return null;
  }
}

/** Aggregates → gün içi/çok günlü OHLCV mumları. timespan: 'minute'|'day'. */
export async function massiveAggregates(
  symbol: string,
  multiplier: number,
  timespan: 'minute' | 'day',
  fromMs: number,
  toMs: number
): Promise<Candle[]> {
  try {
    const data = await mFetch(
      `/v2/aggs/ticker/${encodeURIComponent(symbol.toUpperCase())}/range/${multiplier}/${timespan}/${fromMs}/${toMs}?adjusted=true&sort=asc&limit=50000`
    );
    const results: any[] = data?.results ?? [];
    return results.map((r) => ({
      t: Math.floor(r.t / 1000),
      o: r.o,
      h: r.h,
      l: r.l,
      c: r.c,
      v: r.v ?? 0,
    }));
  } catch {
    return [];
  }
}

/**
 * Verilen semboller için SparkSeries (scanner/pulse'ın beklediği gün içi kapanış
 * serisi). Önceki kapanış tek snapshot'tan; gün içi seri sembol başına aggregates'ten.
 * Alt-istek bütçesi için `cap` ile sınırlanır; sınırlı eşzamanlılıkla çekilir.
 */
export async function massiveSeriesFor(
  symbols: string[],
  cap: number
): Promise<Map<string, SparkSeries>> {
  const out = new Map<string, SparkSeries>();
  const snap = await massiveSnapshotMap();
  const targets = [...new Set(symbols.map((s) => s.toUpperCase()))].slice(0, cap);
  const now = Date.now();
  const fromMs = now - 24 * 60 * 60 * 1000;
  const CONCURRENCY = 10;
  for (let i = 0; i < targets.length; i += CONCURRENCY) {
    const batch = targets.slice(i, i + CONCURRENCY);
    const series = await Promise.all(
      batch.map(async (sym) => {
        const prev = snap.get(sym)?.prevDay?.c;
        if (typeof prev !== 'number') return null;
        const candles = await massiveAggregates(sym, 5, 'minute', fromMs, now);
        if (!candles.length) return null;
        const todayKey = Math.floor(candles[candles.length - 1].t / 86400);
        const today = candles.filter((c) => Math.floor(c.t / 86400) === todayKey);
        if (!today.length) return null;
        return {
          previousClose: prev,
          close: today.map((c) => c.c),
          lastTime: today[today.length - 1].t,
        } as SparkSeries;
      })
    );
    batch.forEach((sym, idx) => {
      if (series[idx]) out.set(sym, series[idx]!);
    });
  }
  return out;
}
