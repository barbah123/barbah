// ALTIN FTREND BEKÇİSİ
// Zamanlayıcı her vuruşta çağırır (altın Pzt-Cum neredeyse 24 saat işlem görür,
// bu yüzden ABD seans penceresine bağlı değildir). Kapanmış son mumda FTREND
// trendi döndüyse Telegram'a anında AL/SAT sinyali gönderir; ayrıca 6 saatte
// bir durum raporu atar. Piyasa kapalıyken (bayat veri) sessizce geçer.
//
// Yapılandırma D1'deki tek satırlık `goldwatch` tablosundadır ve
// GET/PATCH /api/goldwatch ile okunur/değiştirilir. Varsayılan GC=F 1h
// FTREND(2,3): 2,4 yıllık 1h verisinde örneklem dışı doğrulamayı geçen kurulum.
// 15 dakikalık mum da desteklenir (interval='15m') ama aynı 60 günlük pencerede
// 15m her parametrede zarar etti, 1h artıdaydı — varsayılan bilinçli olarak 1h.

import { getCandles } from './data';
import { computeFtrend, backtestFtrend } from './ftrend';
import { sendTelegram, telegramConfigured, type TelegramEnv } from './telegram';

export interface GoldWatchRow {
  id: number;
  enabled: number;
  symbol: string;
  interval: string;
  period: number;
  mult: number;
  last_flip_t: number;
  last_status_at: string | null;
  last_trend: string | null;
}

// Desteklenen mum aralıkları ve saniye karşılıkları
export const GOLDWATCH_INTERVALS: Record<string, number> = {
  '15m': 900,
  '30m': 1800,
  '1h': 3600,
};

// FTREND ısınması + performans özeti için yeterli geçmiş
const RANGE_FOR: Record<string, string> = { '15m': '1mo', '30m': '2mo', '1h': '3mo' };

const STATUS_EVERY_HOURS = 6;
const FEE_PCT = 0.05;

export async function getGoldWatch(db: D1Database): Promise<GoldWatchRow | null> {
  return db.prepare('SELECT * FROM goldwatch WHERE id = 1').first<GoldWatchRow>();
}

// Bekçi koşusu; log için kısa bir özet döner.
export async function runGoldWatch(db: D1Database, env: TelegramEnv): Promise<string> {
  const cfg = await getGoldWatch(db);
  if (!cfg || !cfg.enabled) return 'kapalı';

  const intervalSec = GOLDWATCH_INTERVALS[cfg.interval] ?? 3600;
  let candles;
  try {
    candles = await getCandles(cfg.symbol, cfg.interval, RANGE_FOR[cfg.interval] ?? '3mo');
  } catch {
    return 'veri alınamadı';
  }
  if (candles.length < 50) return `veri yetersiz (${candles.length} mum)`;

  const nowSec = Math.floor(Date.now() / 1000);
  // Kapanmamış (hâlâ oluşan) son mumu at: sinyal yalnızca mum kapanışında kesinleşir
  const closed =
    candles[candles.length - 1].t + intervalSec > nowSec ? candles.slice(0, -1) : candles;
  if (closed.length < 50) return 'veri yetersiz';
  const lastBar = closed[closed.length - 1];
  // Son kapanmış mum 3 aralıktan eskiyse piyasa kapalı demektir
  if (nowSec - lastBar.t > intervalSec * 3) return 'piyasa kapalı';

  const params = { period: cfg.period, mult: cfg.mult };
  const points = computeFtrend(closed, params);
  const now = points[points.length - 1];
  if (!now) return 'hesaplanamadı';

  const label = `FTREND(${cfg.period},${cfg.mult}) ${cfg.interval}`;
  const trendText = now.trend === 1 ? 'YÜKSELİŞ 🟢' : 'DÜŞÜŞ 🔴';

  // 1) Trend dönüşü: henüz bildirilmemiş son flip'i bul (zamanlayıcı birkaç
  // vuruş kaçırdıysa sinyal son mumdan eski olabilir). 6 aralıktan eski flip
  // artık aksiyon alınamayacak kadar bayat: bildirmeden damgala (ilk koşuda
  // tüm geçmişi spamlemeyi de önler).
  const lastFlip = [...points].reverse().find((p) => p?.flip);
  if (lastFlip?.flip && lastFlip.t > cfg.last_flip_t) {
    const fresh = nowSec - lastFlip.t <= intervalSec * 6;
    let ok = false;
    if (fresh) {
      const dir = lastFlip.flip === 'buy' ? '🟢 AL' : '🔴 SAT';
      const flipIdx = points.findIndex((p) => p === lastFlip);
      const flipClose = closed[flipIdx].c;
      ok = await sendTelegram(
        env,
        `🥇 <b>ALTIN — ${label}</b>\n` +
          `${dir} sinyali @ $${flipClose.toFixed(1)} (şu an $${lastBar.c.toFixed(1)})\n` +
          `Trend çizgisi: $${lastFlip.stop.toFixed(1)} (yeni ${lastFlip.flip === 'buy' ? 'destek' : 'direnç'})\n` +
          `Mum kapanışı: ${fmtTime(lastFlip.t)}`
      );
    }
    await db
      .prepare(
        "UPDATE goldwatch SET last_flip_t = ?, last_trend = ?, last_status_at = datetime('now') WHERE id = 1"
      )
      .bind(lastFlip.t, now.trend === 1 ? 'up' : 'down')
      .run();
    return fresh ? `sinyal: ${lastFlip.flip} (telegram: ${ok})` : 'bayat flip damgalandı';
  }

  // 2) Periyodik durum raporu
  const due =
    !cfg.last_status_at ||
    nowSec - Math.floor(Date.parse(cfg.last_status_at + 'Z') / 1000) >
      STATUS_EVERY_HOURS * 3600;
  if (due && telegramConfigured(env)) {
    const distPct = ((lastBar.c - now.stop) / lastBar.c) * 100;
    const { stats } = backtestFtrend(closed, params, { mode: 'long', feePct: FEE_PCT });
    await sendTelegram(
      env,
      `🥇 <b>ALTIN DURUM — ${label}</b>\n` +
        `Fiyat: $${lastBar.c.toFixed(1)} | Trend: ${trendText}\n` +
        `Trend çizgisi: $${now.stop.toFixed(1)} (uzaklık %${Math.abs(distPct).toFixed(2)})\n` +
        (lastFlip
          ? `Son sinyal: ${lastFlip.flip === 'buy' ? '🟢 AL' : '🔴 SAT'} — ${fmtTime(lastFlip.t)} @ $${lastFlip.stop.toFixed(1)}\n`
          : '') +
        `Pencere performansı (${RANGE_FOR[cfg.interval] ?? '3mo'}, long): ` +
        `%${stats.totalReturnPct.toFixed(1)} getiri, ${stats.trades} işlem, ` +
        `%${stats.winRate.toFixed(0)} kazanç, maxDD %${stats.maxDrawdownPct.toFixed(1)}\n` +
        `<i>Trend dönerse anında sinyal gelir; yatırım tavsiyesi değildir.</i>`
    );
    await db
      .prepare(
        "UPDATE goldwatch SET last_status_at = datetime('now'), last_trend = ? WHERE id = 1"
      )
      .bind(now.trend === 1 ? 'up' : 'down')
      .run();
    return 'durum raporu gönderildi';
  }

  return `sessiz (trend ${now.trend === 1 ? 'up' : 'down'}, çizgi ${now.stop.toFixed(1)})`;
}

function fmtTime(t: number): string {
  // Telegram raporlarında Türkiye saati (UTC+3)
  return (
    new Date((t + 3 * 3600) * 1000).toISOString().slice(0, 16).replace('T', ' ') + ' TSİ'
  );
}
