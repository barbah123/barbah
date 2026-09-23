// OPSİYON SİMÜLASYONU (Black-Scholes yaklaşımı)
// FTREND sinyalleriyle altın (veya herhangi bir dayanak) üzerine opsiyon
// stratejilerini geçmiş veride simüle eder. Geçmiş opsiyon fiyatı verisi
// ücretsiz bulunmadığından fiyatlar Black-Scholes ile teorik üretilir:
//   - IV tahmini: kayan pencerede gerçekleşen oynaklık × markup (IV genelde
//     RV'nin üstünde işlem görür)
//   - alım/satımda prim üzerinden spread maliyeti düşülür
//   - vade yaklaşınca pozisyon aynı yönde taze vadeye rollanır
// Bu bir YAKLAŞIMDIR: gerçek IV dinamiklerini (vol patlamaları, skew) tam
// yakalamaz; sonuçlar yön göstergesi olarak okunmalıdır.

import type { Candle } from './data';
import { computeFtrend, type FtrendParams } from './ftrend';

// ---------------------------------------------------------------------------
// Normal dağılım yardımcıları

// Abramowitz-Stegun 7.1.26 — |hata| < 1.5e-7
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 -
    (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t *
      Math.exp(-ax * ax);
  return sign * y;
}

function normCdf(x: number): number {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}

// Acklam ters normal CDF yaklaşımı
function invNorm(p: number): number {
  if (p <= 0 || p >= 1) throw new Error('invNorm: p (0,1) aralığında olmalı');
  const a = [-39.6968302866538, 220.946098424521, -275.928510446969, 138.357751867269, -30.6647980661472, 2.50662827745924];
  const b = [-54.4760987982241, 161.585836858041, -155.698979859887, 66.8013118877197, -13.2806815528857];
  const c = [-0.00778489400243029, -0.322396458041136, -2.40075827716184, -2.54973253934373, 4.37466414146497, 2.93816398269878];
  const d = [0.00778469570904146, 0.32246712907004, 2.445134137143, 3.75440866190742];
  const pLow = 0.02425;
  let q: number, r: number;
  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p <= 1 - pLow) {
    q = p - 0.5;
    r = q * q;
    return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  q = Math.sqrt(-2 * Math.log(1 - p));
  return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
    ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
}

// ---------------------------------------------------------------------------
// Black-Scholes

const YEAR_SEC = 365 * 24 * 3600;

export function bsPrice(
  S: number,
  K: number,
  T: number, // yıl cinsinden kalan vade
  sigma: number,
  r: number,
  isCall: boolean
): number {
  if (T <= 0) return Math.max(0, isCall ? S - K : K - S);
  const sqT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + (sigma * sigma) / 2) * T) / (sigma * sqT);
  const d2 = d1 - sigma * sqT;
  if (isCall) return S * normCdf(d1) - K * Math.exp(-r * T) * normCdf(d2);
  return K * Math.exp(-r * T) * normCdf(-d2) - S * normCdf(-d1);
}

// Hedef deltaya karşılık gelen kullanım fiyatı.
// Call: N(d1)=delta; Put: |delta| verilir, N(d1)=1-|delta|.
export function strikeForDelta(
  S: number,
  T: number,
  sigma: number,
  r: number,
  delta: number,
  isCall: boolean
): number {
  const d1 = invNorm(isCall ? delta : 1 - delta);
  return S / Math.exp(d1 * sigma * Math.sqrt(T) - (r + (sigma * sigma) / 2) * T);
}

// ---------------------------------------------------------------------------
// Gerçekleşen oynaklık (yıllıklandırılmış, kayan pencere)

function realizedVolSeries(candles: Candle[], window: number): (number | null)[] {
  const out: (number | null)[] = new Array(candles.length).fill(null);
  if (candles.length < 2) return out;
  const yearsSpan = (candles[candles.length - 1].t - candles[0].t) / YEAR_SEC;
  const barsPerYear = yearsSpan > 0 ? (candles.length - 1) / yearsSpan : 252 * 7;
  const rets: number[] = [0];
  for (let i = 1; i < candles.length; i++) rets.push(Math.log(candles[i].c / candles[i - 1].c));
  let sum = 0;
  let sumSq = 0;
  for (let i = 1; i < candles.length; i++) {
    sum += rets[i];
    sumSq += rets[i] * rets[i];
    if (i > window) {
      sum -= rets[i - window];
      sumSq -= rets[i - window] * rets[i - window];
    }
    const n = Math.min(i, window);
    if (n >= 20) {
      const mean = sum / n;
      const varr = Math.max(0, sumSq / n - mean * mean);
      out[i] = Math.sqrt(varr * barsPerYear);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Simülasyon

export interface OptionSimOptions {
  ftrend?: FtrendParams;
  targetDelta?: number; // 0.5 = at-the-money civarı, 0.8 = derin kârda
  dteDays?: number; // açılışta vadeye gün
  rollBelowDays?: number; // kalan vade bunun altına inince rolla
  mode?: 'calls' | 'calls_puts'; // sadece AL sinyalinde call, ya da SAT'ta put da
  allocPct?: number; // işlem başına özkaynağın yüzde kaçı prime bağlanır
  spreadPct?: number; // prim başına yön başına alım-satım maliyeti (%)
  ivMarkup?: number; // IV = RV × markup
  rate?: number; // risksiz faiz (yıllık)
  volWindow?: number; // RV penceresi (bar)
}

export interface OptionLeg {
  kind: 'call' | 'put';
  openT: number;
  closeT: number;
  strike: number;
  entryPremium: number;
  exitPremium: number;
  retPct: number; // prim üzerinden getiri (masraf sonrası)
  reason: 'flip' | 'roll' | 'end';
}

export interface OptionSimResult {
  legs: number;
  rolls: number;
  wins: number;
  winRate: number;
  avgLegRetPct: number; // prim bazında ortalama bacak getirisi
  medianLegRetPct: number;
  totalReturnPct: number; // portföy (allocPct ayrılmış) bileşik getirisi
  maxDrawdownPct: number; // bar bazında değerlenmiş portföy eğrisinden
  bestLegPct: number;
  worstLegPct: number;
  legList: OptionLeg[];
}

export function simulateFtrendOptions(
  candles: Candle[],
  opts: OptionSimOptions = {}
): OptionSimResult | null {
  const ftrendParams = opts.ftrend ?? { period: 2, mult: 3 };
  const targetDelta = opts.targetDelta ?? 0.5;
  const dteDays = opts.dteDays ?? 30;
  const rollBelowDays = opts.rollBelowDays ?? 7;
  const mode = opts.mode ?? 'calls_puts';
  const alloc = (opts.allocPct ?? 10) / 100;
  const spread = (opts.spreadPct ?? 1.5) / 100;
  const ivMarkup = opts.ivMarkup ?? 1.15;
  const rate = opts.rate ?? 0.04;
  const volWindow = opts.volWindow ?? 480; // 1h barda ~1 ay

  const points = computeFtrend(candles, ftrendParams);
  const vols = realizedVolSeries(candles, volWindow);

  interface Pos {
    kind: 'call' | 'put';
    strike: number;
    expiryT: number;
    entryPremium: number; // spread dahil ödenen
    openT: number;
  }
  let pos: Pos | null = null;
  let equity = 1;
  let peak = 1;
  let maxDD = 0;
  const legList: OptionLeg[] = [];
  let rolls = 0;

  const iv = (i: number) => Math.max(0.08, (vols[i] ?? 0.15) * ivMarkup);

  const openPos = (i: number, kind: 'call' | 'put'): Pos | null => {
    const S = candles[i].c;
    const T = (dteDays * 24 * 3600) / YEAR_SEC;
    const sigma = iv(i);
    const strike = strikeForDelta(S, T, sigma, rate, targetDelta, kind === 'call');
    const mid = bsPrice(S, strike, T, sigma, rate, kind === 'call');
    if (mid <= 0) return null;
    return {
      kind,
      strike,
      expiryT: candles[i].t + dteDays * 24 * 3600,
      entryPremium: mid * (1 + spread),
      openT: candles[i].t,
    };
  };

  const markPos = (i: number, p: Pos): number => {
    const T = Math.max(0, (p.expiryT - candles[i].t) / YEAR_SEC);
    return bsPrice(candles[i].c, p.strike, T, iv(i), rate, p.kind === 'call');
  };

  const closePos = (i: number, p: Pos, reason: OptionLeg['reason']) => {
    const exit = markPos(i, p) * (1 - spread);
    const ret = exit / p.entryPremium - 1;
    equity *= 1 + alloc * ret;
    legList.push({
      kind: p.kind,
      openT: p.openT,
      closeT: candles[i].t,
      strike: p.strike,
      entryPremium: p.entryPremium,
      exitPremium: exit,
      retPct: ret * 100,
      reason,
    });
  };

  for (let i = 0; i < candles.length; i++) {
    const pt = points[i];
    if (!pt || vols[i] == null) continue;

    // Bar bazında değerleme ile çöküş takibi (pozisyon açıkken)
    if (pos) {
      const mtm = equity * (1 + alloc * ((markPos(i, pos) * (1 - spread)) / pos.entryPremium - 1));
      if (mtm > peak) peak = mtm;
      const dd = 1 - mtm / peak;
      if (dd > maxDD) maxDD = dd;
    } else if (equity > peak) peak = equity;

    // Vade yaklaştıysa aynı yönde rolla
    if (pos && (pos.expiryT - candles[i].t) / (24 * 3600) < rollBelowDays) {
      const kind = pos.kind;
      closePos(i, pos, 'roll');
      pos = openPos(i, kind);
      rolls++;
      continue;
    }

    if (pt.flip === 'buy') {
      if (pos?.kind === 'put') {
        closePos(i, pos, 'flip');
        pos = null;
      }
      if (!pos) pos = openPos(i, 'call');
    } else if (pt.flip === 'sell') {
      if (pos?.kind === 'call') {
        closePos(i, pos, 'flip');
        pos = null;
      }
      if (!pos && mode === 'calls_puts') pos = openPos(i, 'put');
    }
  }
  if (pos) closePos(candles.length - 1, pos, 'end');

  if (!legList.length) return null;
  const rets = legList.map((l) => l.retPct).sort((a, b) => a - b);
  const wins = legList.filter((l) => l.retPct >= 0).length;
  return {
    legs: legList.length,
    rolls,
    wins,
    winRate: (wins / legList.length) * 100,
    avgLegRetPct: legList.reduce((s, l) => s + l.retPct, 0) / legList.length,
    medianLegRetPct: rets[Math.floor(rets.length / 2)],
    totalReturnPct: (equity - 1) * 100,
    maxDrawdownPct: maxDD * 100,
    bestLegPct: rets[rets.length - 1],
    worstLegPct: rets[0],
    legList,
  };
}
