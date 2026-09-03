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

// Son gönderim hatası (yalnızca bu izolasyon örneği içinde geçerli). Worker'da
// console.error kalıcı değil; çağıran bu metni D1 kalp atışına yazarak
// /api/health üzerinden görünür kılar (3 Eyl: art arda 'fail' ama neden yok).
let lastError: string | null = null;
// 429 yanıtındaki retry_after saniyesi — çağıranın beklemeli yeniden denemesi için
let lastRetryAfterSec = 0;

export function getTelegramLastError(): string | null {
  return lastError;
}
export function getTelegramRetryAfterSec(): number {
  return lastRetryAfterSec;
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
      const body = await res.text();
      lastError = `${res.status} ${body}`.slice(0, 200);
      let retryAfter = 0;
      try {
        retryAfter = Number(JSON.parse(body)?.parameters?.retry_after) || 0;
      } catch {
        // gövde JSON değilse retry_after yok say
      }
      lastRetryAfterSec = retryAfter;
      console.error('Telegram hatası:', res.status, body);
      return false;
    }
    lastError = null;
    lastRetryAfterSec = 0;
    return true;
  } catch (e) {
    lastError = String((e as any)?.message ?? e).slice(0, 200);
    lastRetryAfterSec = 0;
    console.error('Telegram gönderilemedi:', e);
    return false;
  }
}
