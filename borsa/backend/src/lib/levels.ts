// SEVİYE BEKÇİSİ
// Kullanıcının belirlediği fiyat seviyeleri 5 dk'lık cron'da kontrol edilir;
// seviye kırılınca tek seferlik Telegram bildirimi gider (alarm 'triggered' olur).
// Momentum sistemlerinden farkı: gün içi patlama değil, "beklenen fırsat anı"
// izler — ör. ORCL 52 haftalık dibini tutuyor mu, 160 direncini geri aldı mı?

import { getQuotes } from './data';
import { sendTelegram, telegramConfigured, type TelegramEnv } from './telegram';

export interface LevelAlert {
  id: string;
  symbol: string;
  level: number;
  direction: 'above' | 'below';
  note: string | null;
  status: 'armed' | 'triggered';
  triggered_at: string | null;
  triggered_price: number | null;
  created_at: string;
}

export async function checkLevelAlerts(
  db: D1Database,
  env: TelegramEnv
): Promise<number> {
  const { results: armed } = await db
    .prepare("SELECT * FROM level_alerts WHERE status = 'armed' LIMIT 50")
    .all<LevelAlert>();
  if (!armed.length) return 0;

  const symbols = [...new Set(armed.map((a) => a.symbol))];
  const quotes = await getQuotes(symbols);
  const priceMap = new Map(quotes.map((q) => [q.symbol, q]));

  let triggered = 0;
  for (const alert of armed) {
    const quote = priceMap.get(alert.symbol);
    if (!quote) continue;
    // Bayat fiyatla tetikleme (piyasa kapalıyken önceki kapanış seviye altında olabilir)
    if (Date.now() / 1000 - quote.time > 15 * 60) continue;

    const hit =
      alert.direction === 'below'
        ? quote.price <= alert.level
        : quote.price >= alert.level;
    if (!hit) continue;

    await db
      .prepare(
        `UPDATE level_alerts SET status = 'triggered', triggered_at = datetime('now'), triggered_price = ?
         WHERE id = ?`
      )
      .bind(quote.price, alert.id)
      .run();
    triggered++;

    if (telegramConfigured(env)) {
      const arrow = alert.direction === 'below' ? '🔻' : '🔺';
      const dirText = alert.direction === 'below' ? 'altına indi' : 'üzerine çıktı';
      await sendTelegram(
        env,
        `${arrow} <b>Seviye Alarmı: ${alert.symbol}</b>\n` +
          `Fiyat $${quote.price.toFixed(2)} — $${alert.level.toFixed(2)} ${dirText} ` +
          `(gün ${quote.changePercent >= 0 ? '+' : ''}${quote.changePercent.toFixed(2)}%)\n` +
          (alert.note ? `📝 ${alert.note}` : '')
      );
    }
  }
  return triggered;
}
