// Piyasa uçları (portföyden bağımsız): anlık fiyat, mum verisi, sembol arama

import { getQuotes, getCandles, searchSymbols } from '../lib/data';
import { getIntel } from '../lib/intel';
import { computeFtrend, backtestFtrend, optimizeFtrend, type TradeMode } from '../lib/ftrend';
import { json, error } from '../lib/http';

export async function marketRoutes(request: Request, url: URL): Promise<Response> {
  const path = url.pathname;

  if (path === '/api/quotes' && request.method === 'GET') {
    const symbols = (url.searchParams.get('symbols') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (!symbols.length) return error('symbols parametresi gerekli');
    return json({ quotes: await getQuotes(symbols) });
  }

  if (path === '/api/search' && request.method === 'GET') {
    const q = (url.searchParams.get('q') ?? '').trim();
    if (q.length < 1) return json({ results: [] });
    return json({ results: await searchSymbols(q) });
  }

  // İstihbarat: haber + bilanço tarihi + Reddit/Stocktwits duyarlılığı
  if (path === '/api/intel' && request.method === 'GET') {
    const symbol = (url.searchParams.get('symbol') ?? '').trim().toUpperCase();
    if (!symbol) return error('symbol parametresi gerekli');
    return json({ intel: await getIntel(symbol) });
  }

  // FTREND: geçmiş veride parametre optimizasyonu + simülasyon + güncel sinyal.
  // Örn: /api/ftrend?symbol=GC=F&interval=1h&range=730d&mode=long
  if (path === '/api/ftrend' && request.method === 'GET') {
    const symbol = (url.searchParams.get('symbol') ?? 'GC=F').trim();
    const interval = url.searchParams.get('interval') ?? '1h';
    const range = url.searchParams.get('range') ?? '730d';
    const mode = (url.searchParams.get('mode') === 'both' ? 'both' : 'long') as TradeMode;
    const feePct = Number(url.searchParams.get('fee') ?? 0.05);

    const candles = await getCandles(symbol, interval, range);
    if (candles.length < 100)
      return error(`${symbol} için yeterli geçmiş veri yok (${candles.length} mum)`);

    const opt = optimizeFtrend(candles, { mode, feePct });
    if (!opt) return error('Optimizasyon için veri yetersiz');

    // En iyi parametrelerle tüm dönemin işlem listesi + güncel durum
    const { stats, tradeList } = backtestFtrend(candles, opt.best.params, { mode, feePct });
    const points = computeFtrend(candles, opt.best.params);
    const now = points[points.length - 1]!;
    const lastFlip = [...points].reverse().find((p) => p?.flip);

    return json({
      symbol,
      interval,
      range,
      mode,
      feePct,
      optimization: {
        combosTested: opt.combos,
        trainBars: opt.trainBars,
        testBars: opt.testBars,
        best: opt.best,
        top: opt.top,
      },
      simulation: { stats, trades: tradeList.slice(-30) },
      current: {
        price: candles[candles.length - 1].c,
        time: candles[candles.length - 1].t,
        trend: now.trend === 1 ? 'up' : 'down',
        stopLine: now.stop,
        lastSignal: lastFlip
          ? { action: lastFlip.flip, time: lastFlip.t, stop: lastFlip.stop }
          : null,
      },
    });
  }

  if (path === '/api/candles' && request.method === 'GET') {
    const symbol = (url.searchParams.get('symbol') ?? '').trim();
    if (!symbol) return error('symbol parametresi gerekli');
    const interval = url.searchParams.get('interval') ?? '5m';
    const range = url.searchParams.get('range') ?? '5d';
    return json({ candles: await getCandles(symbol, interval, range) });
  }

  return error('Bulunamadı', 404);
}
