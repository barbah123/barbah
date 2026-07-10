// MANUEL POZİSYON TAKİBİ
// Kullanıcının bot dışında aldığı pozisyonlar (ör. gerçek hesabındaki alımlar).
// Seans içinde 15 dakikada bir Telegram'a K/Z raporu gönderilir; pozisyon
// /api/tracked uçlarıyla eklenir/kapatılır. Bot bu pozisyonlara dokunmaz.

import { getQuotes } from './data';
import { sendTelegram, telegramConfigured, type TelegramEnv } from './telegram';

const SESSION_OPEN_MIN = 13 * 60 + 30;
const SESSION_CLOSE_MIN = 20 * 60;

function inSession(): boolean {
  const d = new Date();
  const day = d.getUTCDay();
  const minutes = d.getUTCHours() * 60 + d.getUTCMinutes();
  return day >= 1 && day <= 5 && minutes >= SESSION_OPEN_MIN && minutes < SESSION_CLOSE_MIN;
}

export interface TrackedPosition {
  id: string;
  symbol: string;
  quantity: number;
  entry_price: number;
  note: string | null;
  status: 'active' | 'closed';
  exit_price: number | null;
  pnl: number | null;
  created_at: string;
  closed_at: string | null;
}

export async function getActiveTracked(db: D1Database): Promise<TrackedPosition[]> {
  const { results } = await db
    .prepare("SELECT * FROM tracked_positions WHERE status = 'active' ORDER BY created_at")
    .all<TrackedPosition>();
  return results;
}

/** 15 dk'lık takip raporu: aktif manuel pozisyonların canlı K/Z durumu. */
export async function reportTrackedPositions(
  db: D1Database,
  env: TelegramEnv,
  options: { force?: boolean } = {}
): Promise<boolean> {
  if (!inSession() && !options.force) return false;
  const positions = await getActiveTracked(db);
  if (!positions.length || !telegramConfigured(env)) return false;

  const quotes = await getQuotes([...new Set(positions.map((p) => p.symbol))]);
  const quoteMap = new Map(quotes.map((q) => [q.symbol, q]));

  const sign = (v: number) => (v >= 0 ? '+' : '-');
  const lines: string[] = ['📌 <b>Takip Edilen Pozisyonlar</b>'];
  let totalPnl = 0;
  let anyFresh = false;

  for (const p of positions) {
    const q = quoteMap.get(p.symbol);
    if (!q) {
      lines.push(`• ${p.symbol}: fiyat alınamadı`);
      continue;
    }
    if (Date.now() / 1000 - q.time < 15 * 60) anyFresh = true;
    const pnl = (q.price - p.entry_price) * p.quantity;
    const pnlPct = ((q.price - p.entry_price) / p.entry_price) * 100;
    totalPnl += pnl;
    const emoji = pnl >= 0 ? '🟢' : '🔴';
    lines.push(
      `${emoji} <b>${p.symbol}</b> ${p.quantity} adet @ $${p.entry_price.toFixed(2)} → $${q.price.toFixed(2)}\n` +
        `   K/Z ${sign(pnl)}$${Math.abs(pnl).toFixed(2)} (${sign(pnlPct)}${Math.abs(pnlPct).toFixed(2)}%) | gün ${q.changePercent >= 0 ? '+' : ''}${q.changePercent.toFixed(2)}%` +
        (p.note ? `\n   📝 ${p.note}` : '')
    );
  }

  // Piyasa kapalıyken donmuş fiyatlarla spam yapma
  if (!anyFresh && !options.force) return false;

  lines.push(
    '',
    `Toplam K/Z: ${sign(totalPnl)}$${Math.abs(totalPnl).toFixed(2)}`
  );
  return sendTelegram(env, lines.join('\n'));
}
