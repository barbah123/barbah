import { Env } from '../index';

/**
 * Dogrulama e-postasi gonderir (Resend uzerinden — resend.com).
 * RESEND_API_KEY ayarli degilse gonderemez ve false doner; bu durumda
 * auth rotasi kodu cevapta dev_code olarak dondurur (sadece gelistirme!).
 */
export async function sendVerificationEmail(env: Env, to: string, code: string): Promise<boolean> {
  if (!env.RESEND_API_KEY) return false;

  const from = env.EMAIL_FROM || 'Badaland <onboarding@resend.dev>';
  const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
      <h1 style="color:#e8843c">Badaland</h1>
      <p>Merhaba! Badaland hesabını doğrulamak için kodun:</p>
      <p style="font-size:36px;font-weight:bold;letter-spacing:8px;background:#f4ede2;
                padding:16px;text-align:center;border-radius:12px">${code}</p>
      <p>Kod 15 dakika geçerlidir. Bu kaydı sen başlatmadıysan bu e-postayı yok sayabilirsin.</p>
    </div>`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to: [to], subject: 'Badaland doğrulama kodun: ' + code, html }),
  });
  return res.ok;
}
