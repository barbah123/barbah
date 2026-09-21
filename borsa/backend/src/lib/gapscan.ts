// AÇILIŞ ÖNCESİ GAP TARAMASI (18 Eyl, kullanıcı onayı)
// Gece/açılış öncesi hareketlenen likit hisseleri açılıştan ~30 dk önce tespit
// eder: (1) Telegram'a "bugün izlenecekler" listesi gönderir, (2) sembolleri
// sıcak listeye yazar ki açılışta nabız dedektörü ve zenginleştirme onları ilk
// sıradan tarasın. İŞLEM YAPMAZ — gece seansında veri ~15 dk gecikmeli ve
// likidite ince olduğundan kağıt dolgular gerçekçi olmaz; işlemler yine seans
// içinde (açılış lideri kuralı dahil) gerçekleşir.
// Bütçe: 1 snapshot + 1 Telegram + ~10 D1 yazımı — tek çağrılık iş.

import { massiveBroadRows } from './massive';
import { markHotSymbol } from './pulse';
import { sendTelegram, telegramConfigured, type TelegramEnv } from './telegram';

const MIN_GAP_PCT = 4; // bundan azı "lider" değil, gürültü
const MAX_GAP_PCT = 60; // aşırısı genelde ters split/halka arz artefaktı
const MIN_DOLLAR_VOL = 2_000_000; // önceki gün dolar hacmi tabanı (ince kağıt eleme)
const TOP_N = 10;

export async function runGapScan(db: D1Database, env: TelegramEnv): Promise<string> {
  // Pre-market'te broadRows fiyatı lastTrade/min'den, hacmi önceki günden alır
  const rows = await massiveBroadRows().catch(() => [] as Awaited<ReturnType<typeof massiveBroadRows>>);
  if (!rows.length) return 'veri yok';

  const leaders = rows
    .filter(
      (r) =>
        r.dayChangePercent >= MIN_GAP_PCT &&
        r.dayChangePercent <= MAX_GAP_PCT &&
        r.price * r.liquidity >= MIN_DOLLAR_VOL
    )
    .sort((a, b) => b.dayChangePercent - a.dayChangePercent)
    .slice(0, TOP_N);
  if (!leaders.length) return 'gap adayı yok';

  // Sıcak listeye yaz: açılışta nabız/zenginleştirme bu sembolleri öne alır
  for (const l of leaders) {
    await markHotSymbol(db, l.symbol, 'gapscan', l.dayChangePercent).catch(() => {});
  }

  let notified = false;
  if (telegramConfigured(env)) {
    const lines = leaders.map((l) => {
      // 🎯 = açılış lideri bandı (%5-15): açılışta hacimle teyit gelirse bot
      // yarım riskle girebilir (bkz. trader.ts OPENING_LEADER_*)
      const badge =
        l.dayChangePercent >= 5 && l.dayChangePercent <= 15 ? ' 🎯' : '';
      const dolVol = (l.price * l.liquidity) / 1e6;
      return (
        `• <b>${l.symbol}</b> $${l.price.toFixed(2)} — açılış öncesi ` +
        `+${l.dayChangePercent.toFixed(1)}% (hacim ~$${dolVol.toFixed(1)}M)${badge}`
      );
    });
    notified = await sendTelegram(
      env,
      [
        '🌅 <b>Açılış Öncesi İzleme Listesi</b> (gap taraması)',
        ...lines,
        '',
        '🎯 = açılış lideri bandı (%5-15) — açılışta hacim teyidi gelirse bot yarım riskle girebilir.',
        'Bu bir işlem değil hazırlık listesidir; girişler seans içinde kurallara göre yapılır.',
      ].join('\n')
    );
  }
  return `${leaders.length} aday${notified ? ', Telegram gönderildi' : ''}`;
}
