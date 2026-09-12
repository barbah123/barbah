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

import { getCandles, getQuote } from './data';
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
  // Sanal TL portföyü (0011): AL'de tüm nakit altına, SAT'ta TL'ye döner
  trading: number;
  cash_tl: number;
  gold_grams: number;
  start_tl: number;
  start_gram_tl: number | null;
  started_at: string | null;
}

const GRAMS_PER_OZ = 31.1034768;
const TRADE_FEE_PCT = 0.05; // yön başına (%): backtest'le tutarlı likit-piyasa varsayımı

function fmtTl(v: number): string {
  const neg = v < 0;
  const s = Math.round(Math.abs(v)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${neg ? '-' : ''}₺${s}`;
}

// USD/ons altın + USDTRY kurundan gram TL fiyatı. Kur alınamazsa null.
async function gramPriceTl(usdGold: number): Promise<{ gramTl: number; usdtry: number } | null> {
  const fx = await getQuote('TRY=X');
  if (!fx || !Number.isFinite(fx.price) || fx.price <= 0) return null;
  return { gramTl: (usdGold * fx.price) / GRAMS_PER_OZ, usdtry: fx.price };
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

// Sanal TL portföyünde işlem: AL → tüm nakit gram altına, SAT → tümü TL'ye.
// Telegram mesajına eklenecek işlem satırını döner (işlem yoksa boş).
async function executeTrade(
  db: D1Database,
  cfg: GoldWatchRow,
  side: 'buy' | 'sell',
  usdGold: number
): Promise<string> {
  const px = await gramPriceTl(usdGold);
  if (!px) return '\n⚠️ USDTRY kuru alınamadı, sanal işlem atlandı';
  const { gramTl, usdtry } = px;
  const fee = TRADE_FEE_PCT / 100;

  if (side === 'buy') {
    if (cfg.cash_tl <= 0) return ''; // zaten altındayız
    const spend = cfg.cash_tl;
    const feeTl = spend * fee;
    const grams = (spend - feeTl) / gramTl;
    const equity = grams * gramTl;
    await db
      .prepare(
        `UPDATE goldwatch SET cash_tl = 0, gold_grams = ?,
           start_gram_tl = COALESCE(start_gram_tl, ?),
           started_at = COALESCE(started_at, datetime('now')) WHERE id = 1`
      )
      .bind(grams, gramTl)
      .run();
    await db
      .prepare(
        `INSERT INTO gold_trades (id, side, grams, gram_price_tl, usd_gold, usdtry, tl_amount, fee_tl, pnl_tl, equity_tl)
         VALUES (?, 'buy', ?, ?, ?, ?, ?, ?, NULL, ?)`
      )
      .bind(crypto.randomUUID(), grams, gramTl, usdGold, usdtry, spend, feeTl, equity)
      .run();
    cfg.cash_tl = 0;
    cfg.gold_grams = grams;
    return `\n💰 Sanal işlem: ${fmtTl(spend)} → <b>${grams.toFixed(2)} gr altın</b> @ ${fmtTl(gramTl)}/gr`;
  }

  if (cfg.gold_grams <= 0) return ''; // zaten nakitteyiz
  const gross = cfg.gold_grams * gramTl;
  const feeTl = gross * fee;
  const cash = gross - feeTl;
  const lastBuy = await db
    .prepare("SELECT tl_amount FROM gold_trades WHERE side = 'buy' ORDER BY at DESC LIMIT 1")
    .first<{ tl_amount: number }>();
  const pnl = lastBuy ? cash - lastBuy.tl_amount : null;
  await db
    .prepare('UPDATE goldwatch SET cash_tl = ?, gold_grams = 0 WHERE id = 1')
    .bind(cash)
    .run();
  await db
    .prepare(
      `INSERT INTO gold_trades (id, side, grams, gram_price_tl, usd_gold, usdtry, tl_amount, fee_tl, pnl_tl, equity_tl)
       VALUES (?, 'sell', ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(crypto.randomUUID(), cfg.gold_grams, gramTl, usdGold, usdtry, cash, feeTl, pnl, cash)
    .run();
  const sold = cfg.gold_grams;
  cfg.gold_grams = 0;
  cfg.cash_tl = cash;
  return (
    `\n💰 Sanal işlem: ${sold.toFixed(2)} gr satıldı → <b>${fmtTl(cash)}</b>` +
    (pnl != null ? ` (işlem K/Z: ${pnl >= 0 ? '+' : ''}${fmtTl(pnl)})` : '')
  );
}

// Durum raporundaki portföy/performans bloğu
async function portfolioBlock(
  db: D1Database,
  cfg: GoldWatchRow,
  usdGold: number
): Promise<string> {
  if (!cfg.trading) return '';
  const px = await gramPriceTl(usdGold);
  if (!px) return '';
  const equity = cfg.cash_tl + cfg.gold_grams * px.gramTl;
  const retPct = (equity / cfg.start_tl - 1) * 100;
  const bhPct =
    cfg.start_gram_tl != null ? (px.gramTl / cfg.start_gram_tl - 1) * 100 : null;
  const stats = await db
    .prepare(
      "SELECT COUNT(*) AS n, SUM(CASE WHEN pnl_tl >= 0 THEN 1 ELSE 0 END) AS w FROM gold_trades WHERE side = 'sell'"
    )
    .first<{ n: number; w: number | null }>();
  const pos =
    cfg.gold_grams > 0
      ? `${cfg.gold_grams.toFixed(2)} gr altın`
      : 'nakitte';
  let s = `\n💼 Portföy: <b>${fmtTl(equity)}</b> (${pos}) | başlangıçtan: ${retPct >= 0 ? '+' : ''}%${retPct.toFixed(2)}`;
  if (bhPct != null)
    s += `\n📊 Gram altın al-tut aynı dönemde: ${bhPct >= 0 ? '+' : ''}%${bhPct.toFixed(2)}`;
  if (stats?.n)
    s += `\n📒 Kapanan işlem: ${stats.n}, kazanç oranı %${(((stats.w ?? 0) / stats.n) * 100).toFixed(0)}`;
  return s;
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

  // Ölçüm başlangıcını damgala: al-tut kıyası ilk işlemden değil kurulumdan başlar
  if (cfg.trading && cfg.started_at == null) {
    const px = await gramPriceTl(lastBar.c);
    if (px) {
      await db
        .prepare(
          "UPDATE goldwatch SET started_at = datetime('now'), start_gram_tl = COALESCE(start_gram_tl, ?) WHERE id = 1"
        )
        .bind(px.gramTl)
        .run();
      cfg.started_at = new Date().toISOString();
      cfg.start_gram_tl = cfg.start_gram_tl ?? px.gramTl;
    }
  }

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
      // Sanal TL portföyünde işlem (taze sinyalde, güncel kapanış fiyatından)
      const tradeLine = cfg.trading
        ? await executeTrade(db, cfg, lastFlip.flip, lastBar.c)
        : '';
      ok = await sendTelegram(
        env,
        `🥇 <b>ALTIN — ${label}</b>\n` +
          `${dir} sinyali @ $${flipClose.toFixed(1)} (şu an $${lastBar.c.toFixed(1)})\n` +
          `Trend çizgisi: $${lastFlip.stop.toFixed(1)} (yeni ${lastFlip.flip === 'buy' ? 'destek' : 'direnç'})\n` +
          `Mum kapanışı: ${fmtTime(lastFlip.t)}` +
          tradeLine
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
        `%${stats.winRate.toFixed(0)} kazanç, maxDD %${stats.maxDrawdownPct.toFixed(1)}` +
        (await portfolioBlock(db, cfg, lastBar.c)) +
        `\n<i>Trend dönerse anında sinyal gelir; yatırım tavsiyesi değildir.</i>`
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
