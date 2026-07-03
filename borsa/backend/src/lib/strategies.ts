// STRATEJİ KATMANI
// Mum verisi üzerinden al/sat/bekle kararı üreten saf fonksiyonlar.
// Yeni strateji eklemek için: tip tanımına ekle, evaluate'e case yaz.

import type { Candle } from './data';

export type StrategyType = 'sma_cross' | 'rsi';

export interface StrategyResult {
  action: 'buy' | 'sell' | 'hold';
  reason: string;
}

export const STRATEGY_INFO: Record<
  StrategyType,
  { label: string; defaults: Record<string, number> }
> = {
  sma_cross: { label: 'SMA Kesişimi', defaults: { fast: 9, slow: 21 } },
  rsi: { label: 'RSI', defaults: { period: 14, buyBelow: 30, sellAbove: 70 } },
};

function sma(values: number[], period: number, endIndex: number): number | null {
  if (endIndex + 1 < period) return null;
  let sum = 0;
  for (let i = endIndex - period + 1; i <= endIndex; i++) sum += values[i];
  return sum / period;
}

function rsi(closes: number[], period: number): number | null {
  if (closes.length < period + 1) return null;
  // Wilder yumuşatması
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gain += diff;
    else loss -= diff;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(0, diff)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(0, -diff)) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export function evaluate(
  type: StrategyType,
  params: Record<string, number>,
  candles: Candle[]
): StrategyResult {
  const closes = candles.map((c) => c.c);

  if (type === 'sma_cross') {
    const fast = params.fast ?? STRATEGY_INFO.sma_cross.defaults.fast;
    const slow = params.slow ?? STRATEGY_INFO.sma_cross.defaults.slow;
    const last = closes.length - 1;
    const fastNow = sma(closes, fast, last);
    const slowNow = sma(closes, slow, last);
    const fastPrev = sma(closes, fast, last - 1);
    const slowPrev = sma(closes, slow, last - 1);
    if (fastNow == null || slowNow == null || fastPrev == null || slowPrev == null) {
      return { action: 'hold', reason: 'Yeterli mum verisi yok' };
    }
    if (fastPrev <= slowPrev && fastNow > slowNow) {
      return {
        action: 'buy',
        reason: `SMA${fast} (${fastNow.toFixed(2)}) SMA${slow} (${slowNow.toFixed(2)}) üzerine çıktı (golden cross)`,
      };
    }
    if (fastPrev >= slowPrev && fastNow < slowNow) {
      return {
        action: 'sell',
        reason: `SMA${fast} (${fastNow.toFixed(2)}) SMA${slow} (${slowNow.toFixed(2)}) altına indi (death cross)`,
      };
    }
    return {
      action: 'hold',
      reason: `Kesişim yok (SMA${fast}=${fastNow.toFixed(2)}, SMA${slow}=${slowNow.toFixed(2)})`,
    };
  }

  if (type === 'rsi') {
    const period = params.period ?? STRATEGY_INFO.rsi.defaults.period;
    const buyBelow = params.buyBelow ?? STRATEGY_INFO.rsi.defaults.buyBelow;
    const sellAbove = params.sellAbove ?? STRATEGY_INFO.rsi.defaults.sellAbove;
    const value = rsi(closes, period);
    if (value == null) return { action: 'hold', reason: 'Yeterli mum verisi yok' };
    if (value <= buyBelow) {
      return { action: 'buy', reason: `RSI${period} = ${value.toFixed(1)} (aşırı satım, eşik ${buyBelow})` };
    }
    if (value >= sellAbove) {
      return { action: 'sell', reason: `RSI${period} = ${value.toFixed(1)} (aşırı alım, eşik ${sellAbove})` };
    }
    return { action: 'hold', reason: `RSI${period} = ${value.toFixed(1)} nötr bölgede` };
  }

  return { action: 'hold', reason: 'Bilinmeyen strateji' };
}
