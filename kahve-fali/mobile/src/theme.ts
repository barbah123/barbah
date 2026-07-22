export const APP_VERSION = 'v1.6.1';

// Kahve temalı koyu palet
export const colors = {
  bg: '#1a120b',
  card: '#2a1d12',
  card2: '#3a2a1a',
  text: '#f5ece2',
  sub: '#b89b82',
  primary: '#c08a4e',
  primaryText: '#1a120b',
  accent: '#e0b878',
  danger: '#e07a5f',
  good: '#81b29a',
  border: '#4a3a2a',
};

export function timeAgo(unixSeconds: number): string {
  const ms = Date.now() - unixSeconds * 1000;
  const m = Math.floor(ms / 60_000);
  if (m < 1) return 'az önce';
  if (m < 60) return `${m} dk önce`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} sa önce`;
  const d = Math.floor(h / 24);
  return `${d} gün önce`;
}

const TR_MONTHS = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];
const TR_DAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];

// "30 Haziran 2026, 22:15" (cihazın yerel saatiyle)
export function formatDateTime(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getDate()} ${TR_MONTHS[d.getMonth()]} ${d.getFullYear()}, ${hh}:${mm}`;
}

// Bugünün modele gönderilecek etiketi: "30 Haziran 2026 Salı"
export function todayLabel(): string {
  const d = new Date();
  return `${d.getDate()} ${TR_MONTHS[d.getMonth()]} ${d.getFullYear()} ${TR_DAYS[d.getDay()]}`;
}
