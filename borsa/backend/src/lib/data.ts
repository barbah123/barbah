// VERİ KATMANI
// Anlık fiyat, mum (OHLCV) ve sembol arama. Kaynak: Yahoo Finance
// (anahtar gerektirmez; tarayıcı User-Agent başlığı zorunludur, yoksa 429 döner).

import { massiveConfigured, massiveQuote, massiveAggregates } from './massive';

const YAHOO = 'https://query1.finance.yahoo.com';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

export interface Quote {
  symbol: string;
  name: string | null;
  price: number;
  previousClose: number;
  change: number;
  changePercent: number;
  currency: string;
  time: number; // unix saniye
}

export interface Candle {
  t: number; // unix saniye
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

// Aynı isolate içinde kısa süreli önbellek: watchlist + portföy + strateji
// aynı sembolü art arda sorduğunda Yahoo'ya tek istek gitsin.
const quoteCache = new Map<string, { quote: Quote; at: number }>();
const QUOTE_TTL_MS = 5000;

async function yahooFetch(path: string): Promise<any> {
  const res = await fetch(`${YAHOO}${path}`, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Veri kaynağı hatası (${res.status})`);
  return res.json();
}

export async function getQuote(symbol: string): Promise<Quote | null> {
  const key = symbol.toUpperCase();
  const cached = quoteCache.get(key);
  if (cached && Date.now() - cached.at < QUOTE_TTL_MS) return cached.quote;

  if (massiveConfigured()) {
    const mq = await massiveQuote(key);
    if (mq) {
      quoteCache.set(key, { quote: mq, at: Date.now() });
      return mq;
    }
    // Massive başarısızsa Yahoo'ya düş (aşağı devam)
  }

  let data: any;
  try {
    data = await yahooFetch(
      `/v8/finance/chart/${encodeURIComponent(key)}?interval=1m&range=1d`
    );
  } catch {
    return null;
  }
  const meta = data?.chart?.result?.[0]?.meta;
  if (!meta || typeof meta.regularMarketPrice !== 'number') return null;

  const price = meta.regularMarketPrice;
  const prev =
    typeof meta.chartPreviousClose === 'number' ? meta.chartPreviousClose : price;
  const quote: Quote = {
    symbol: key,
    name: meta.longName ?? meta.shortName ?? null,
    price,
    previousClose: prev,
    change: price - prev,
    changePercent: prev ? ((price - prev) / prev) * 100 : 0,
    currency: meta.currency ?? 'USD',
    time: meta.regularMarketTime ?? Math.floor(Date.now() / 1000),
  };
  quoteCache.set(key, { quote, at: Date.now() });
  return quote;
}

export async function getQuotes(symbols: string[]): Promise<Quote[]> {
  const unique = [...new Set(symbols.map((s) => s.toUpperCase()))].slice(0, 30);
  const results = await Promise.all(unique.map((s) => getQuote(s)));
  return results.filter((q): q is Quote => q !== null);
}

// '5d' / '1mo' gibi Yahoo aralık kodunu gün sayısına çevirir (Massive from/to için)
function rangeToDays(range: string): number {
  const m = range.match(/^(\d+)(d|mo|y)$/);
  if (!m) return 5;
  const n = Number(m[1]);
  return m[2] === 'd' ? n : m[2] === 'mo' ? n * 31 : n * 366;
}

export async function getCandles(
  symbol: string,
  interval = '5m',
  range = '5d'
): Promise<Candle[]> {
  if (massiveConfigured()) {
    const now = Date.now();
    const fromMs = now - rangeToDays(range) * 24 * 60 * 60 * 1000;
    const mult = interval === '1d' ? 1 : parseInt(interval, 10) || 5;
    const timespan = interval === '1d' ? 'day' : 'minute';
    const candles = await massiveAggregates(symbol, mult, timespan as 'minute' | 'day', fromMs, now);
    if (candles.length) return candles;
    // Massive boş döndüyse Yahoo'ya düş
  }
  const data = await yahooFetch(
    `/v8/finance/chart/${encodeURIComponent(symbol.toUpperCase())}` +
      `?interval=${encodeURIComponent(interval)}&range=${encodeURIComponent(range)}`
  );
  const result = data?.chart?.result?.[0];
  const ts: number[] = result?.timestamp ?? [];
  const q = result?.indicators?.quote?.[0];
  if (!q) return [];

  const candles: Candle[] = [];
  for (let i = 0; i < ts.length; i++) {
    if (q.close?.[i] == null) continue; // boş dakikaları atla
    candles.push({
      t: ts[i],
      o: q.open[i],
      h: q.high[i],
      l: q.low[i],
      c: q.close[i],
      v: q.volume?.[i] ?? 0,
    });
  }
  return candles;
}

export interface SearchResult {
  symbol: string;
  name: string;
  exchange: string;
  type: string;
}

export async function searchSymbols(query: string): Promise<SearchResult[]> {
  const data = await yahooFetch(
    `/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=10&newsCount=0`
  );
  const quotes: any[] = data?.quotes ?? [];
  return quotes
    .filter((q) => q.symbol && (q.quoteType === 'EQUITY' || q.quoteType === 'ETF'))
    .map((q) => ({
      symbol: q.symbol,
      name: q.longname ?? q.shortname ?? q.symbol,
      exchange: q.exchDisp ?? q.exchange ?? '',
      type: q.quoteType,
    }));
}
