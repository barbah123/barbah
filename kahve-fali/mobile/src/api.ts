import * as SecureStore from 'expo-secure-store';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://kahve-fali-api.barbah.workers.dev';

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
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any).error ?? 'İstek başarısız');
  return data;
}

export interface Reading {
  id: string;
  type: 'photo' | 'text';
  question: string | null;
  result: string;
  model: string;
  created_at: number;
}

export type Gender = 'kadin' | 'erkek' | 'diger';
export type MaritalStatus = 'bekar' | 'evli' | 'iliskisi_var' | 'diger';

export interface Settings {
  has_api_key: boolean;
  key_last4: string | null;
  model: string;
  birth_date: string | null;
  gender: Gender | null;
  marital_status: MaritalStatus | null;
}

export interface SettingsUpdate {
  openai_api_key?: string;
  model?: string;
  birth_date?: string | null;
  gender?: Gender | null;
  marital_status?: MaritalStatus | null;
}

export const api = {
  auth: {
    register: async (email: string, username: string, password: string) => {
      const data = await request('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, username, password }),
      });
      await SecureStore.setItemAsync(TOKEN_KEY, (data as any).token);
      return data;
    },
    login: async (email: string, password: string) => {
      const data = await request('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      await SecureStore.setItemAsync(TOKEN_KEY, (data as any).token);
      return data;
    },
    logout: () => SecureStore.deleteItemAsync(TOKEN_KEY),
    hasSession: async () => !!(await SecureStore.getItemAsync(TOKEN_KEY)),
    currentUser: async () => {
      const t = await getToken();
      return t ? decodeToken(t) : null;
    },
  },
  settings: {
    get: (): Promise<Settings> => request('/me/settings'),
    update: (data: SettingsUpdate): Promise<Settings> =>
      request('/me/settings', { method: 'PUT', body: JSON.stringify(data) }),
    test: (openai_api_key: string): Promise<{ valid: boolean }> =>
      request('/me/settings/test', { method: 'POST', body: JSON.stringify({ openai_api_key }) }),
  },
  readings: {
    list: (): Promise<Reading[]> => request('/me/readings'),
    get: (id: string): Promise<Reading> => request(`/me/readings/${id}`),
  },
  fortune: {
    create: (data: { question?: string; image_base64?: string }): Promise<Reading> =>
      request('/fortune', { method: 'POST', body: JSON.stringify(data) }),
  },
};
