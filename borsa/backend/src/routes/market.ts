// Piyasa uçları (portföyden bağımsız): anlık fiyat, mum verisi, sembol arama

import { getQuotes, getCandles, searchSymbols } from '../lib/data';
import { getIntel } from '../lib/intel';
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

  if (path === '/api/candles' && request.method === 'GET') {
    const symbol = (url.searchParams.get('symbol') ?? '').trim();
    if (!symbol) return error('symbol parametresi gerekli');
    const interval = url.searchParams.get('interval') ?? '5m';
    const range = url.searchParams.get('range') ?? '5d';
    return json({ candles: await getCandles(symbol, interval, range) });
  }

  return error('Bulunamadı', 404);
}
