// TELEGRAM BİLDİRİM KATMANI
// Kurulum: @BotFather'dan bot oluşturup token alın, botla bir kez konuşup
// chat id'nizi öğrenin; sonra:
//   wrangler secret put TELEGRAM_BOT_TOKEN
//   wrangler secret put TELEGRAM_CHAT_ID
// Token tanımlı değilse bildirimler sessizce atlanır (uygulama çalışmaya devam eder).

export interface TelegramEnv {
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
}

export function telegramConfigured(env: TelegramEnv): boolean {
  return Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID);
}

export async function sendTelegram(env: TelegramEnv, text: string): Promise<boolean> {
  if (!telegramConfigured(env)) return false;
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: env.TELEGRAM_CHAT_ID,
          text,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        }),
      }
    );
    if (!res.ok) {
      console.error('Telegram hatası:', res.status, await res.text());
      return false;
    }
    return true;
  } catch (e) {
    console.error('Telegram gönderilemedi:', e);
    return false;
  }
}
