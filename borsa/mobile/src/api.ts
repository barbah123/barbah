import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';

const BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ?? 'https://borsa-paper-api.barbah.workers.dev';

const DEVICE_KEY = 'borsa_device_id';

let cachedDeviceId: string | null = null;

async function getDeviceId(): Promise<string> {
  if (cachedDeviceId) return cachedDeviceId;
  let id = await SecureStore.getItemAsync(DEVICE_KEY);
  if (!id) {
    id = Crypto.randomUUID();
    await SecureStore.setItemAsync(DEVICE_KEY, id);
  }
  cachedDeviceId = id;
  return id;
}

async function request(path: string, options: RequestInit = {}) {
  const deviceId = await getDeviceId();
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Device-Id': deviceId,
      ...options.headers,
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'İstek başarısız');
  return data;
}

export interface Quote {
  symbol: string;
  name: string | null;
  price: number;
  previousClose: number;
  change: number;
  changePercent: number;
  currency: string;
  time: number;
}

export interface Position {
  symbol: string;
  name: string | null;
  quantity: number;
  avg_cost: number;
  price: number;
  value: number;
  unrealized_pnl: number;
  unrealized_pnl_percent: number;
  day_change_percent: number;
}

export interface PortfolioSummary {
  cash: number;
  market_value: number;
  equity: number;
  starting_cash: number;
  total_pnl: number;
  total_pnl_percent: number;
  positions: Position[];
}

export interface Order {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  type: 'market' | 'limit';
  quantity: number;
  limit_price: number | null;
  status: 'open' | 'filled' | 'cancelled' | 'rejected';
  fill_price: number | null;
  realized_pnl: number | null;
  source: string;
  note: string | null;
  created_at: string;
}

export interface Strategy {
  id: string;
  symbol: string;
  type: 'sma_cross' | 'rsi';
  params: Record<string, number>;
  quantity: number;
  auto_execute: number;
  enabled: number;
}

export interface Signal {
  id: string;
  symbol: string;
  action: 'buy' | 'sell';
  price: number;
  reason: string;
  status: 'new' | 'executed' | 'skipped';
  note: string | null;
  created_at: string;
}

export const api = {
  quotes: (symbols: string[]): Promise<{ quotes: Quote[] }> =>
    request(`/api/quotes?symbols=${symbols.join(',')}`),
  search: (q: string): Promise<{ results: { symbol: string; name: string; exchange: string }[] }> =>
    request(`/api/search?q=${encodeURIComponent(q)}`),
  portfolio: (): Promise<PortfolioSummary> => request('/api/portfolio'),
  resetPortfolio: () => request('/api/portfolio/reset', { method: 'POST' }),
  watchlist: (): Promise<{ watchlist: { symbol: string; quote: Quote | null }[] }> =>
    request('/api/watchlist'),
  addToWatchlist: (symbol: string) =>
    request('/api/watchlist', { method: 'POST', body: JSON.stringify({ symbol }) }),
  removeFromWatchlist: (symbol: string) =>
    request(`/api/watchlist/${encodeURIComponent(symbol)}`, { method: 'DELETE' }),
  orders: (): Promise<{ orders: Order[] }> => request('/api/orders'),
  placeOrder: (order: {
    symbol: string;
    side: 'buy' | 'sell';
    type: 'market' | 'limit';
    quantity: number;
    limit_price?: number;
  }): Promise<{ order: Order }> =>
    request('/api/orders', { method: 'POST', body: JSON.stringify(order) }),
  cancelOrder: (id: string) => request(`/api/orders/${id}/cancel`, { method: 'POST' }),
  strategies: (): Promise<{ strategies: Strategy[] }> => request('/api/strategies'),
  createStrategy: (s: {
    symbol: string;
    type: string;
    quantity: number;
    auto_execute: boolean;
  }): Promise<{ strategy: Strategy }> =>
    request('/api/strategies', { method: 'POST', body: JSON.stringify(s) }),
  updateStrategy: (id: string, patch: Record<string, unknown>) =>
    request(`/api/strategies/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteStrategy: (id: string) => request(`/api/strategies/${id}`, { method: 'DELETE' }),
  runStrategies: (): Promise<{ ok: boolean; summary: { evaluated: number; signals: number; executed: number } }> =>
    request('/api/strategies/run', { method: 'POST' }),
  signals: (): Promise<{ signals: Signal[] }> => request('/api/signals'),
};
