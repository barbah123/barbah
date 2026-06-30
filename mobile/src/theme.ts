export const APP_VERSION = 'v0.13.0';

export const colors = {
  bg: '#0f172a',
  card: '#1e293b',
  card2: '#273449',
  text: '#f1f5f9',
  sub: '#94a3b8',
  primary: '#6366f1',
  primaryText: '#ffffff',
  accent: '#fbbf24',
  danger: '#f87171',
  good: '#34d399',
  border: '#334155',
};

export function timeLeft(endsAt: number): string {
  const ms = endsAt * 1000 - Date.now();
  if (ms <= 0) return 'Bitti';
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h >= 24) return `${Math.floor(h / 24)}g ${h % 24}s`;
  return `${h}s ${m}d`;
}
