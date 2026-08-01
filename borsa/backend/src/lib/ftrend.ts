// FTREND İNDİKATÖRÜ + BACKTEST + OPTİMİZASYON
// Foreks'teki FTREND(periyot, çarpan) trend takip indikatörünün eşleniği:
// ATR tabanlı iz süren stop (SuperTrend ailesi). Yükseliş trendinde fiyatın
// altında basamaklanan destek çizgisi (FTREND-1), düşüş trendinde fiyatın
// üstünde basamaklanan direnç çizgisi (FTREND-2). Fiyat çizgiyi kapanışla
// kırınca trend döner → al/sat sinyali.

import type { Candle } from './data';

export interface FtrendParams {
  period: number; // ATR periyodu
  mult: number; // ATR çarpanı
}

export interface FtrendPoint {
  t: number; // unix saniye (mumun zamanı)
  trend: 1 | -1; // 1 = yükseliş (çizgi altta), -1 = düşüş (çizgi üstte)
  stop: number; // aktif çizgi seviyesi (trend yönüne göre alt veya üst band)
  flip: 'buy' | 'sell' | null; // bu mumda trend döndüyse sinyal
}

// Wilder yumuşatmalı ATR. İlk (period) mum için null döner.
function atrSeries(candles: Candle[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(candles.length).fill(null);
  if (candles.length <= period) return out;
  let sum = 0;
  for (let i = 1; i <= period; i++) {
    sum += trueRange(candles[i], candles[i - 1]);
  }
  let atr = sum / period;
  out[period] = atr;
  for (let i = period + 1; i < candles.length; i++) {
    atr = (atr * (period - 1) + trueRange(candles[i], candles[i - 1])) / period;
    out[i] = atr;
  }
  return out;
}

function trueRange(c: Candle, prev: Candle): number {
  return Math.max(c.h - c.l, Math.abs(c.h - prev.c), Math.abs(c.l - prev.c));
}

// FTREND serisini hesaplar. Yeterli veri oluşana kadar null.
export function computeFtrend(
  candles: Candle[],
  params: FtrendParams
): (FtrendPoint | null)[] {
  const { period, mult } = params;
  const out: (FtrendPoint | null)[] = new Array(candles.length).fill(null);
  const atr = atrSeries(candles, period);

  let trend: 1 | -1 = 1;
  let upper = Infinity; // düşüş trendi çizgisi (kısa stop)
  let lower = -Infinity; // yükseliş trendi çizgisi (uzun stop)
  let started = false;

  for (let i = 0; i < candles.length; i++) {
    const a = atr[i];
    if (a == null) continue;
    const c = candles[i];
    const mid = (c.h + c.l) / 2;
    const basicUpper = mid + mult * a;
    const basicLower = mid - mult * a;

    if (!started) {
      started = true;
      trend = 1;
      upper = basicUpper;
      lower = basicLower;
      out[i] = { t: c.t, trend, stop: lower, flip: null };
      continue;
    }

    const prevClose = candles[i - 1].c;
    // Bandlar yalnızca trend lehine hareket eder (basamaklama/ratchet);
    // fiyat bandın dışına kapatmışsa band yeniden konumlanır.
    lower = basicLower > lower || prevClose < lower ? basicLower : lower;
    upper = basicUpper < upper || prevClose > upper ? basicUpper : upper;

    let flip: 'buy' | 'sell' | null = null;
    if (trend === 1 && c.c < lower) {
      trend = -1;
      upper = basicUpper;
      flip = 'sell';
    } else if (trend === -1 && c.c > upper) {
      trend = 1;
      lower = basicLower;
      flip = 'buy';
    }

    out[i] = { t: c.t, trend, stop: trend === 1 ? lower : upper, flip };
  }
  return out;
}

// ---------------------------------------------------------------------------
// BACKTEST

export type TradeMode = 'long' | 'both'; // long: sadece alış; both: al-sat döner (long/short)

export interface FtrendTrade {
  side: 'long' | 'short';
  entryT: number;
  entryPrice: number;
  exitT: number | null; // null = pozisyon hâlâ açık
  exitPrice: number;
  pnlPct: number; // masraf sonrası, yüzde
  bars: number;
}

export interface BacktestStats {
  trades: number;
  wins: number;
  winRate: number; // %
  totalReturnPct: number; // bileşik, masraf sonrası
  buyHoldPct: number; // aynı dönemde al-tut getirisi (kıyas)
  profitFactor: number; // brüt kazanç / brüt kayıp
  maxDrawdownPct: number; // işlem bazlı bileşik eğri üzerinden
  avgTradePct: number;
  bars: number; // test edilen mum sayısı
}

export interface BacktestResult {
  stats: BacktestStats;
  tradeList: FtrendTrade[];
}

// Sinyal mumunun kapanışında işlem açar/kapatır; her yönde feePct masraf düşer
// (komisyon + kayma payı). 'both' modunda sat sinyali long'u kapatıp short açar.
export function backtestFtrend(
  candles: Candle[],
  params: FtrendParams,
  opts: { mode?: TradeMode; feePct?: number } = {}
): BacktestResult {
  const mode = opts.mode ?? 'long';
  const fee = (opts.feePct ?? 0.05) / 100; // %0.05 varsayılan (yön başına)
  const points = computeFtrend(candles, params);

  const tradeList: FtrendTrade[] = [];
  let open: { side: 'long' | 'short'; entryT: number; entryPrice: number; entryIdx: number } | null =
    null;

  const closeTrade = (i: number, exitPrice: number, final: boolean) => {
    if (!open) return;
    const raw =
      open.side === 'long'
        ? exitPrice / open.entryPrice - 1
        : open.entryPrice / exitPrice - 1;
    const pnl = (1 + raw) * (1 - fee) * (1 - fee) - 1;
    tradeList.push({
      side: open.side,
      entryT: open.entryT,
      entryPrice: open.entryPrice,
      exitT: final ? null : candles[i].t,
      exitPrice,
      pnlPct: pnl * 100,
      bars: i - open.entryIdx,
    });
    open = null;
  };

  let firstIdx = -1;
  for (let i = 0; i < candles.length; i++) {
    const p = points[i];
    if (!p) continue;
    if (firstIdx < 0) firstIdx = i;
    const price = candles[i].c;

    if (p.flip === 'buy') {
      if (open?.side === 'short') closeTrade(i, price, false);
      if (!open) open = { side: 'long', entryT: p.t, entryPrice: price, entryIdx: i };
    } else if (p.flip === 'sell') {
      if (open?.side === 'long') closeTrade(i, price, false);
      if (!open && mode === 'both')
        open = { side: 'short', entryT: p.t, entryPrice: price, entryIdx: i };
    }
  }
  // Açık pozisyonu son kapanışla değerle (listede exitT=null olarak işaretli)
  if (open) closeTrade(candles.length - 1, candles[candles.length - 1].c, true);

  // İstatistikler
  let equity = 1;
  let peak = 1;
  let maxDD = 0;
  let grossWin = 0;
  let grossLoss = 0;
  let wins = 0;
  for (const tr of tradeList) {
    const r = tr.pnlPct / 100;
    equity *= 1 + r;
    if (equity > peak) peak = equity;
    const dd = 1 - equity / peak;
    if (dd > maxDD) maxDD = dd;
    if (r >= 0) {
      wins++;
      grossWin += r;
    } else grossLoss -= r;
  }
  const buyHold =
    firstIdx >= 0 && candles.length > firstIdx
      ? (candles[candles.length - 1].c / candles[firstIdx].c - 1) * 100
      : 0;

  return {
    stats: {
      trades: tradeList.length,
      wins,
      winRate: tradeList.length ? (wins / tradeList.length) * 100 : 0,
      totalReturnPct: (equity - 1) * 100,
      buyHoldPct: buyHold,
      profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0,
      maxDrawdownPct: maxDD * 100,
      avgTradePct: tradeList.length
        ? tradeList.reduce((s, t) => s + t.pnlPct, 0) / tradeList.length
        : 0,
      bars: firstIdx >= 0 ? candles.length - firstIdx : 0,
    },
    tradeList,
  };
}

// ---------------------------------------------------------------------------
// OPTİMİZASYON (grid taraması + örneklem dışı doğrulama)

export interface OptimizeOptions {
  periods?: number[];
  mults?: number[];
  mode?: TradeMode;
  feePct?: number;
  trainRatio?: number; // verinin bu kadarında optimize et, kalanında doğrula
  minTrades?: number; // eğitim diliminde bundan az işlem üreten kombinasyon elenir
}

export interface OptimizeEntry {
  params: FtrendParams;
  train: BacktestStats;
  test: BacktestStats;
  full: BacktestStats;
}

export interface OptimizeResult {
  best: OptimizeEntry;
  top: OptimizeEntry[]; // eğitim skoruna göre ilk 5
  combos: number;
  trainBars: number;
  testBars: number;
}

const DEFAULT_PERIODS = [2, 3, 4, 5, 6, 7, 8, 10, 12, 14];
const DEFAULT_MULTS = [1, 1.5, 2, 2.5, 3, 3.5, 4, 5];

export function optimizeFtrend(
  candles: Candle[],
  opts: OptimizeOptions = {}
): OptimizeResult | null {
  const periods = opts.periods ?? DEFAULT_PERIODS;
  const mults = opts.mults ?? DEFAULT_MULTS;
  const trainRatio = opts.trainRatio ?? 0.7;
  const minTrades = opts.minTrades ?? 6;
  const btOpts = { mode: opts.mode, feePct: opts.feePct };

  const split = Math.floor(candles.length * trainRatio);
  if (split < 50 || candles.length - split < 20) return null; // veri yetersiz
  const trainC = candles.slice(0, split);
  const testC = candles.slice(split);

  const entries: OptimizeEntry[] = [];
  for (const period of periods) {
    for (const mult of mults) {
      const params = { period, mult };
      const train = backtestFtrend(trainC, params, btOpts).stats;
      if (train.trades < minTrades) continue;
      const test = backtestFtrend(testC, params, btOpts).stats;
      const full = backtestFtrend(candles, params, btOpts).stats;
      entries.push({ params, train, test, full });
    }
  }
  if (!entries.length) return null;

  // Skor: eğitim getirisi; berabere yakınsa kâr faktörü kazanır
  entries.sort(
    (a, b) =>
      b.train.totalReturnPct - a.train.totalReturnPct ||
      b.train.profitFactor - a.train.profitFactor
  );

  return {
    best: entries[0],
    top: entries.slice(0, 5),
    combos: entries.length,
    trainBars: split,
    testBars: candles.length - split,
  };
}
