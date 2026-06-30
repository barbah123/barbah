import * as SecureStore from 'expo-secure-store';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://pokemon-auction-api.barbah.workers.dev';

const TOKEN_KEY = 'auth_token';

async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

function decodeToken(token: string): { id: string; email: string; username: string } | null {
  try {
    const bin = atob(token.split('.')[1]);
    const json = decodeURIComponent(
      bin.split('').map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

async function request(path: string, options: RequestInit = {}) {
  const token = await getToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Request failed');
  return data;
}

export const api = {
  auth: {
    register: async (email: string, username: string, password: string) => {
      const data = await request('/auth/register', { method: 'POST', body: JSON.stringify({ email, username, password }) });
      await SecureStore.setItemAsync(TOKEN_KEY, data.token);
      return data;
    },
    login: async (email: string, password: string) => {
      const data = await request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      await SecureStore.setItemAsync(TOKEN_KEY, data.token);
      return data;
    },
    logout: () => SecureStore.deleteItemAsync(TOKEN_KEY),
    hasSession: async () => !!(await SecureStore.getItemAsync(TOKEN_KEY)),
    currentUser: async () => {
      const t = await getToken();
      return t ? decodeToken(t) : null;
    },
  },
  me: {
    auctions: () => request('/me/auctions'),
    bids: () => request('/me/bids'),
  },
  auctions: {
    list: (status = 'active') => request(`/auctions?status=${status}`),
    get: (id: string) => request(`/auctions/${id}`),
    create: (data: {
      title: string;
      description?: string;
      card_image_key: string;
      starting_price: number;
      min_bid_increment: number;
      duration_hours: number;
    }) => request('/auctions', { method: 'POST', body: JSON.stringify(data) }),
    bid: (id: string, amount: number) =>
      request(`/auctions/${id}/bid`, { method: 'POST', body: JSON.stringify({ amount }) }),
  },
  images: {
    upload: async (uri: string): Promise<string> => {
      const token = await getToken();
      const formData = new FormData();
      formData.append('file', { uri, name: 'card.jpg', type: 'image/jpeg' } as any);

      const blob = await fetch(uri).then(r => r.blob());
      const res = await fetch(`${BASE_URL}/images/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'image/jpeg',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: blob,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      return data.key;
    },
    url: (key: string) => `${BASE_URL}/images/${key}`,
  },
};
