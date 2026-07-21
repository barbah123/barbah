// OTONOM TRADER MOTORU
// Her döngüde sırasıyla:
//   1. Piyasa analizi   → scanner.scanMarket() (genişlik + momentum adayları)
//   2. Risk yönetimi    → açık pozisyonlarda stop-loss / hedef / iz süren stop / gün sonu kapama
//   3. Giriş kararları  → momentum adaylarına, pozisyon büyüklüğü hesabıyla giriş
//   4. İşlem incelemesi → kapanan işlemlerden kazanç oranı / kâr faktörü istatistikleri
//   5. Rapor            → her şey Telegram'a (10 dk'da bir cron)
// Tüm emirler mevcut doğrulama + aracı yürütme katmanlarından geçer (source='bot').

import { scanMarket, type ScanCandidate } from './scanner';
import { getQuotes } from './data';
import { placeOrder } from './broker';
import { sendTelegram, telegramConfigured, type TelegramEnv } from './telegram';
import { getIntel, getRedditBuzzMap } from './intel';
import { getHotSymbols } from './pulse';

export interface BotConfig {
  portfolio_id: string;
  enabled: number;
  risk_per_trade_pct: number;
  stop_loss_pct: number;
  take_profit_pct: number;
  trailing_stop_pct: number;
  max_positions: number;
  max_position_pct: number;
  flatten_eod: number;
}

export interface BotTrade {
  id: string;
  portfolio_id: string;
  symbol: string;
  quantity: number;
  entry_price: number;
  stop_loss: number;
  take_profit: number;
  high_water: number;
  status: 'open' | 'closed';
  exit_price: number | null;
  pnl: number | null;
  entry_reason: string | null;
  exit_reason: string | null;
  opened_at: string;
  closed_at: string | null;
}

export const DEFAULT_BOT_CONFIG = {
  enabled: 0,
  risk_per_trade_pct: 1.0,
  stop_loss_pct: 2.0,
  take_profit_pct: 3.0,
  trailing_stop_pct: 0,
  max_positions: 3,
  max_position_pct: 20.0,
  flatten_eod: 1,
};

// ABD seansı (UTC): 13:30 açılış, 20:00 kapanış; kapanıştan 10 dk önce yeni giriş yok
const SESSION_OPEN_MIN = 13 * 60 + 30;
const SESSION_CLOSE_MIN = 20 * 60;
const FLATTEN_BEFORE_MIN = 10;
// Veri tazeliği: tarama katmanıyla aynı eşik (30 dk). Massive anlık görüntüsünün
// dakika barı (min.t) tarifeye göre ~15 dk gecikmeli gelebiliyor; 15 dk'lık dar
// pencere bu gecikmeli beslemeyi "bayat" sayıp her döngüde raporu sessizce
// atlıyordu (14 Tem: 17:37'den sonra rapor kesildi). Tarama 30 dk'yı taze kabul
// ediyor — trader de aynı tanımı kullansın ki gecikmeli besleme engel olmasın.
const DATA_FRESH_SECONDS = 30 * 60;
// Giriş için gün tavanı: gün +%8'i geçmiş hisse "erken" değildir — tepeden alma
// (6 Tem seansı: +%17 AXTI, +%14 CRDO, +%12 BE tepeden alınıp hepsi ekside sallandı)
const MAX_ENTRY_DAY_PCT = 8;
// Günlük zarar freni: gün içi gerçekleşen zarar özkaynağın bu yüzdesini aşarsa
// o gün yeni pozisyon açılmaz (çıkış/stop yönetimi çalışmaya devam eder).
// 6 Tem dersi: bot her stop sonrası slotu hemen doldurup kanamayı büyüttü.
const DAILY_LOSS_LIMIT_PCT = 1.5;
// ABD öğle yatayı (18:30-21:00 TSİ = 15:30-18:00 UTC): momentum güvenilmez,
// bu saatlerde yalnızca hacim teyitli nabız girişine izin verilir.
const CHOP_START_MIN = 15 * 60 + 30;
const CHOP_END_MIN = 18 * 60;
// Zaman stopu: girişten bu kadar saat sonra pozisyon hâlâ kârda değilse kapatılır.
// (9 Tem: AFRM 5,5 saat ekside süründü, stopa değmeden -$319'a kanadı;
// çalışmayan pozisyon sermayeyi çalışacak fırsattan alıkoyar.)
const TIME_STOP_HOURS = 3;

export async function getBotConfig(db: D1Database, portfolioId: string): Promise<BotConfig> {
  const existing = await db
    .prepare('SELECT * FROM bot_config WHERE portfolio_id = ?')
    .bind(portfolioId)
    .first<BotConfig>();
  if (existing) return existing;
  await db
    .prepare(
      `INSERT INTO bot_config (portfolio_id, enabled, risk_per_trade_pct, stop_loss_pct, take_profit_pct,
         trailing_stop_pct, max_positions, max_position_pct, flatten_eod)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      portfolioId,
      DEFAULT_BOT_CONFIG.enabled,
      DEFAULT_BOT_CONFIG.risk_per_trade_pct,
      DEFAULT_BOT_CONFIG.stop_loss_pct,
      DEFAULT_BOT_CONFIG.take_profit_pct,
      DEFAULT_BOT_CONFIG.trailing_stop_pct,
      DEFAULT_BOT_CONFIG.max_positions,
      DEFAULT_BOT_CONFIG.max_position_pct,
      DEFAULT_BOT_CONFIG.flatten_eod
    )
    .run();
  return (await db
    .prepare('SELECT * FROM bot_config WHERE portfolio_id = ?')
    .bind(portfolioId)
    .first<BotConfig>())!;
}

interface CycleAction {
  text: string; // rapora giren tek satırlık eylem özeti
}

export interface TradeStats {
  closedToday: number;
  wins: number;
  losses: number;
  winRate: number | null;
  totalPnl: number;
  profitFactor: number | null;
  best: BotTrade | null;
  worst: BotTrade | null;
}

export interface CycleResult {
  ran: boolean;
  skippedReason?: string;
  actions: string[];
  openTrades: BotTrade[];
  stats: TradeStats | null;
  reported: boolean;
  report?: string; // Telegram'a giden (veya gidecek) rapor metni
}

function nowMinutesUtc(): number {
  const d = new Date();
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

function isWeekday(): boolean {
  const day = new Date().getUTCDay();
  return day >= 1 && day <= 5;
}

/** Günlük zarar freni kontrolü: bugün gerçekleşen K/Z limiti aştı mı? */
async function dailyLossBrake(
  db: D1Database,
  portfolioId: string
): Promise<{ tripped: boolean; realized: number; limit: number }> {
  const [row, portfolio] = await Promise.all([
    db
      .prepare(
        `SELECT COALESCE(SUM(pnl), 0) AS pnl FROM bot_trades
         WHERE portfolio_id = ? AND status = 'closed' AND closed_at >= date('now')`
      )
      .bind(portfolioId)
      .first<{ pnl: number }>(),
    db
      .prepare('SELECT starting_cash FROM portfolios WHERE id = ?')
      .bind(portfolioId)
      .first<{ starting_cash: number }>(),
  ]);
  const realized = row?.pnl ?? 0;
  const limit = ((portfolio?.starting_cash ?? 100000) * DAILY_LOSS_LIMIT_PCT) / 100;
  return { tripped: realized <= -limit, realized, limit };
}

/** Kapanan işlemlerden performans istatistikleri (işlem incelemesi katmanı). */
export async function computeStats(db: D1Database, portfolioId: string): Promise<TradeStats> {
  const { results: closed } = await db
    .prepare(
      `SELECT * FROM bot_trades WHERE portfolio_id = ? AND status = 'closed'
       AND closed_at > datetime('now', '-1 day') ORDER BY closed_at DESC LIMIT 100`
    )
    .bind(portfolioId)
    .all<BotTrade>();

  const wins = closed.filter((t) => (t.pnl ?? 0) > 0);
  const losses = closed.filter((t) => (t.pnl ?? 0) <= 0);
  const grossWin = wins.reduce((s, t) => s + (t.pnl ?? 0), 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + (t.pnl ?? 0), 0));
  const sorted = [...closed].sort((a, b) => (b.pnl ?? 0) - (a.pnl ?? 0));

  return {
    closedToday: closed.length,
    wins: wins.length,
    losses: losses.length,
    winRate: closed.length ? (wins.length / closed.length) * 100 : null,
    totalPnl: grossWin - grossLoss,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : null,
    best: sorted[0] ?? null,
    worst: sorted[sorted.length - 1] ?? null,
  };
}

async function closeTrade(
  db: D1Database,
  trade: BotTrade,
  reason: string
): Promise<CycleAction | null> {
  const result = await placeOrder(db, trade.portfolio_id, {
    symbol: trade.symbol,
    side: 'sell',
    type: 'market',
    quantity: trade.quantity,
    source: 'bot',
    note: reason,
  });
  if ('error' in result) {
    // Pozisyon manuel satılmış olabilir: işlemi defterde kapat, sebebi not düş
    await db
      .prepare(
        `UPDATE bot_trades SET status = 'closed', exit_reason = ?, closed_at = datetime('now') WHERE id = ?`
      )
      .bind(`Kapatılamadı (${result.error}) — ${reason}`, trade.id)
      .run();
    return { text: `⚠️ ${trade.symbol} kapatılamadı: ${result.error}` };
  }
  const fillPrice = result.order.fill_price ?? trade.entry_price;
  const pnl = result.order.realized_pnl ?? (fillPrice - trade.entry_price) * trade.quantity;
  await db
    .prepare(
      `UPDATE bot_trades SET status = 'closed', exit_price = ?, pnl = ?, exit_reason = ?, closed_at = datetime('now')
       WHERE id = ?`
    )
    .bind(fillPrice, pnl, reason, trade.id)
    .run();
  const emoji = pnl >= 0 ? '🟢' : '🔴';
  return {
    text: `${emoji} ÇIKIŞ ${trade.symbol} ${trade.quantity} adet @ $${fillPrice.toFixed(2)} → K/Z $${pnl.toFixed(2)} (${reason})`,
  };
}

/** 2. adım: risk yönetimi — stop / hedef / iz süren stop / gün sonu kapama. */
export async function manageOpenTrades(
  db: D1Database,
  portfolioId: string,
  config: BotConfig,
  options: { flattenAll?: boolean } = {}
): Promise<CycleAction[]> {
  const { results: open } = await db
    .prepare("SELECT * FROM bot_trades WHERE portfolio_id = ? AND status = 'open'")
    .bind(portfolioId)
    .all<BotTrade>();
  if (!open.length) return [];

  const quotes = await getQuotes(open.map((t) => t.symbol));
  const priceMap = new Map(quotes.map((q) => [q.symbol, q.price]));
  const actions: CycleAction[] = [];

  for (const trade of open) {
    const price = priceMap.get(trade.symbol);
    if (price == null) continue;

    // İz süren stop: zirve güncellenir, stop zirveden trailing_stop_pct aşağı taşınır
    let stopLoss = trade.stop_loss;
    if (config.trailing_stop_pct > 0 && price > trade.high_water) {
      const trailed = price * (1 - config.trailing_stop_pct / 100);
      stopLoss = Math.max(stopLoss, trailed);
      await db
        .prepare('UPDATE bot_trades SET high_water = ?, stop_loss = ? WHERE id = ?')
        .bind(price, stopLoss, trade.id)
        .run();
    }

    // Başabaş koruması: hedefe yarı yol alındıysa stop en az giriş seviyesine çekilir.
    // (7 Tem dersi: IRON +$472'ye gitti, stop girişte kaldı, kâr +$186'ya eridi.)
    const halfwayToTarget =
      trade.entry_price + (trade.take_profit - trade.entry_price) / 2;
    if (price >= halfwayToTarget && stopLoss < trade.entry_price) {
      stopLoss = trade.entry_price;
      await db
        .prepare('UPDATE bot_trades SET stop_loss = ? WHERE id = ?')
        .bind(stopLoss, trade.id)
        .run();
      actions.push({
        text: `🛡️ ${trade.symbol} hedefe yarı yol alındı — stop başabaşa çekildi ($${stopLoss.toFixed(2)})`,
      });
    }

    let exitReason: string | null = null;
    if (options.flattenAll) exitReason = 'gün sonu kapanışı';
    else if (price <= stopLoss) exitReason = `stop-loss ($${stopLoss.toFixed(2)})`;
    else if (price >= trade.take_profit) exitReason = `hedef ($${trade.take_profit.toFixed(2)})`;
    else if (price <= trade.entry_price) {
      // Zaman stopu: uzun süredir kârda olmayan pozisyonu bırak
      const openedMs = new Date(trade.opened_at.replace(' ', 'T') + 'Z').getTime();
      const ageHours = (Date.now() - openedMs) / 3_600_000;
      if (Number.isFinite(ageHours) && ageHours >= TIME_STOP_HOURS) {
        exitReason = `zaman stopu (${TIME_STOP_HOURS} saatte kâra geçemedi)`;
      }
    }

    if (exitReason) {
      const action = await closeTrade(db, { ...trade, stop_loss: stopLoss }, exitReason);
      if (action) actions.push(action);
    }
  }
  return actions;
}

/** 3. adım: giriş kararları + pozisyon büyüklüğü. */
async function findEntries(
  db: D1Database,
  portfolioId: string,
  config: BotConfig,
  candidates: ScanCandidate[],
  openTrades: BotTrade[]
): Promise<CycleAction[]> {
  const slots = config.max_positions - openTrades.length;
  if (slots <= 0) return [];

  // Günlük zarar freni
  const brake = await dailyLossBrake(db, portfolioId);
  if (brake.tripped) {
    return [
      {
        text: `🛑 Günlük zarar freni: bugün gerçekleşen K/Z -$${Math.abs(brake.realized).toFixed(0)} (limit -$${brake.limit.toFixed(0)}) — bugün yeni giriş yok`,
      },
    ];
  }

  // Öğle yatayı: bu saatlerde düzenli döngü girişleri kapalı (nabız girişleri açık).
  // Raporda görünür olsun — "neden işlem önerilmiyor" sorusu cevapsız kalmasın.
  const nowMin = nowMinutesUtc();
  if (nowMin >= CHOP_START_MIN && nowMin < CHOP_END_MIN) {
    return [{ text: '🌤 Öğle yatayı (18:30–21:00 TSİ): yeni giriş aranmıyor, nabız girişleri açık' }];
  }

  const portfolio = await db
    .prepare('SELECT cash FROM portfolios WHERE id = ?')
    .bind(portfolioId)
    .first<{ cash: number }>();
  if (!portfolio) return [];

  const { results: positions } = await db
    .prepare('SELECT symbol, quantity, avg_cost FROM positions WHERE portfolio_id = ?')
    .bind(portfolioId)
    .all<{ symbol: string; quantity: number; avg_cost: number }>();
  const equity =
    portfolio.cash + positions.reduce((s, p) => s + p.quantity * p.avg_cost, 0);

  // Soğuma: son 1 saat içinde kapanan işlemin sembolüne yeniden girme
  // (stop yiyip hemen geri girmeyi — "revenge trading" — engeller)
  const { results: recentlyClosed } = await db
    .prepare(
      `SELECT DISTINCT symbol FROM bot_trades WHERE portfolio_id = ?
       AND status = 'closed' AND closed_at > datetime('now', '-60 minutes')`
    )
    .bind(portfolioId)
    .all<{ symbol: string }>();

  const held = new Set([
    ...openTrades.map((t) => t.symbol),
    ...positions.map((p) => p.symbol),
    ...recentlyClosed.map((r) => r.symbol),
  ]);

  // Strateji: pozitif momentum + yükseliş yönü + anlamlı ama ERKEN günlük hareket.
  // Momentum tavanı %4/30dk: dikey fırlamış hisseye tepeden binme (30 günlük
  // backtest: tavan getiriyi +%6.5'ten +%8.1'e çıkardı, kâr faktörü 1.25→1.30).
  // Gün tavanı %8: hareketin çoğu bitmiş hisseye girme (tepe avcılığı önlemi).
  // Sıralama: ham "score" gün değişimini ödüllendirip tepeleri seçiyordu;
  // entryRank taze momentumu ödüllendirir, %4 üstü her gün-puanını cezalandırır.
  const entryRank = (c: ScanCandidate) =>
    c.momentumPercent * 2 - Math.max(0, c.dayChangePercent - 4);
  // Momentum tabanı %1.5: %0.5'lik "cansız" sinyaller (7 Tem: WMT %0.73, UBER
  // %1.03 → ikisi de zarar) gürültüden ayrışmıyor; gerçek hareket isteriz.
  const shortlist = candidates
    .filter(
      (c) =>
        c.direction === 'long' &&
        c.momentumPercent >= 1.5 &&
        c.momentumPercent <= 4 &&
        c.dayChangePercent >= 1.5 &&
        c.dayChangePercent <= MAX_ENTRY_DAY_PCT &&
        !held.has(c.symbol)
    )
    .sort((a, b) => entryRank(b) - entryRank(a))
    .slice(0, slots * 2); // istihbarat elemesi için genişçe kısa liste

  const actions: CycleAction[] = [];

  // İstihbarat katmanı: haber + bilanço + Reddit + Stocktwits
  // (Reddit haritası tek istekte gelir, sembol başına ekstra maliyeti yok)
  const redditMap = await getRedditBuzzMap();
  const intelList = await Promise.all(
    shortlist.map((c) => getIntel(c.symbol, redditMap))
  );

  const cleared: { pick: ScanCandidate; intelNotes: string[]; boost: number }[] = [];
  for (let i = 0; i < shortlist.length; i++) {
    const intel = intelList[i];
    if (intel.blockEntry) {
      actions.push({
        text: `🛡️ GİRİŞ ENGELLENDİ ${shortlist[i].symbol}: ${intel.blockReason}`,
      });
      continue;
    }
    // Olumlu istihbarat puana küçük katkı yapar (sıralamayı etkiler, kararı değil)
    let boost = 0;
    if (intel.newsScore != null && intel.newsScore >= 0.3) boost += 1.5;
    if (intel.reddit?.trending) boost += 2;
    if (intel.stocktwits?.score != null && intel.stocktwits.score >= 0.5) boost += 1;
    cleared.push({ pick: shortlist[i], intelNotes: intel.notes, boost });
  }

  cleared.sort((a, b) => entryRank(b.pick) + b.boost - (entryRank(a.pick) + a.boost));
  const picks = cleared.slice(0, slots);

  for (const { pick, intelNotes } of picks) {
    const res = await executeEntry(db, portfolioId, config, equity, portfolio.cash, {
      symbol: pick.symbol,
      price: pick.price,
      momentumPercent: pick.momentumPercent,
      dayChangePercent: pick.dayChangePercent,
    }, intelNotes);
    if (res.action) actions.push(res.action);
    portfolio.cash -= res.spent;
  }

  // Huni şeffaflığı: hiç aday kalmadıysa raporda NEDENİ görünsün (20 Tem:
  // "hiç işlem önermedi" — kaç aday hangi filtrede elendi bilinmiyordu).
  if (!picks.length) {
    const band = candidates.filter(
      (c) =>
        c.direction === 'long' &&
        c.dayChangePercent >= 1.5 &&
        c.dayChangePercent <= MAX_ENTRY_DAY_PCT &&
        !held.has(c.symbol)
    );
    const withData = band.filter((c) => c.relativeVolume != null);
    actions.push({
      text:
        `🔍 Giriş taraması: gün bandında (%1.5–8) ${band.length} aday, ` +
        `momentum verili ${withData.length}, momentum bandını (%1.5–4) geçen ${shortlist.length} — koşul oluşmadı`,
    });
  }
  return actions;
}

export interface EntryPick {
  symbol: string;
  price: number;
  momentumPercent: number;
  dayChangePercent: number;
}

/** Pozisyon büyüklüğü + emir + bot defteri kaydı: hem 10 dk döngüsü hem nabız girişi kullanır. */
async function executeEntry(
  db: D1Database,
  portfolioId: string,
  config: BotConfig,
  equity: number,
  availableCash: number,
  pick: EntryPick,
  intelNotes: string[],
  momentumWindow = '30dk'
): Promise<{ action: CycleAction | null; spent: number }> {
  // Pozisyon büyüklüğü: riske edilen tutar = özkaynak × risk%; stop mesafesine bölünür
  const riskAmount = equity * (config.risk_per_trade_pct / 100);
  const stopDistance = pick.price * (config.stop_loss_pct / 100);
  let qty = Math.floor(riskAmount / stopDistance);
  // Tavanlar: tek pozisyon özkaynağın max_position_pct'sini ve nakdi aşamaz
  qty = Math.min(
    qty,
    Math.floor((equity * (config.max_position_pct / 100)) / pick.price),
    Math.floor(availableCash / pick.price)
  );
  if (qty < 1) return { action: null, spent: 0 };

  const reason =
    `momentum ${pick.momentumPercent >= 0 ? '+' : ''}${pick.momentumPercent.toFixed(2)}%/${momentumWindow}, ` +
    `gün ${pick.dayChangePercent >= 0 ? '+' : ''}${pick.dayChangePercent.toFixed(2)}%` +
    (intelNotes.length ? ` | ${intelNotes.join(', ')}` : '');
  const result = await placeOrder(db, portfolioId, {
    symbol: pick.symbol,
    side: 'buy',
    type: 'market',
    quantity: qty,
    source: 'bot',
    note: reason,
  });
  if ('error' in result) {
    return {
      action: { text: `⚠️ ${pick.symbol} girişi doğrulamadan döndü: ${result.error}` },
      spent: 0,
    };
  }
  const entry = result.order.fill_price ?? pick.price;
  const stopLoss = entry * (1 - config.stop_loss_pct / 100);
  const takeProfit = entry * (1 + config.take_profit_pct / 100);
  await db
    .prepare(
      `INSERT INTO bot_trades (id, portfolio_id, symbol, quantity, entry_price, stop_loss, take_profit, high_water, entry_reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      crypto.randomUUID(),
      portfolioId,
      pick.symbol,
      qty,
      entry,
      stopLoss,
      takeProfit,
      entry,
      reason
    )
    .run();
  return {
    action: {
      text:
        `🟢 GİRİŞ ${pick.symbol} ${qty} adet @ $${entry.toFixed(2)} ` +
        `(stop $${stopLoss.toFixed(2)}, hedef $${takeProfit.toFixed(2)}) — ${reason}`,
    },
    spent: qty * entry,
  };
}

/**
 * Nabız alarmı → anında giriş denemesi (10 dk döngüsünü beklemeden).
 * 6 Tem dersi: IQMX alarmı 17:30'da $14.35'ten geldi, bot 18:30'da $14.93'ten girdi.
 * Sadece hâlâ erken safhadaki (gün ≤ %8) alarmlar işleme dönüşür; istihbarat
 * elemesi ve tüm pozisyon tavanları aynen uygulanır.
 */
export async function enterFromPulseAlerts(
  db: D1Database,
  telegram: TelegramEnv,
  alerts: { symbol: string; price: number; change_15m: number; day_change: number }[]
): Promise<number> {
  const viable = alerts.filter((a) => a.day_change <= MAX_ENTRY_DAY_PCT);
  if (!viable.length) return 0;

  // Seans dışında veya kapanışa yakın giriş yok
  const minutes = nowMinutesUtc();
  const canEnter =
    isWeekday() &&
    minutes >= SESSION_OPEN_MIN &&
    minutes < SESSION_CLOSE_MIN - FLATTEN_BEFORE_MIN;
  if (!canEnter) return 0;

  const { results: configs } = await db
    .prepare('SELECT * FROM bot_config WHERE enabled = 1')
    .all<BotConfig>();

  let entered = 0;
  for (const config of configs) {
    const portfolioId = config.portfolio_id;
    const brake = await dailyLossBrake(db, portfolioId);
    if (brake.tripped) continue; // günlük zarar freni: nabız girişi de yok
    const { results: openTrades } = await db
      .prepare("SELECT symbol FROM bot_trades WHERE portfolio_id = ? AND status = 'open'")
      .bind(portfolioId)
      .all<{ symbol: string }>();
    let slots = config.max_positions - openTrades.length;
    if (slots <= 0) continue;

    const { results: positions } = await db
      .prepare('SELECT symbol, quantity, avg_cost FROM positions WHERE portfolio_id = ?')
      .bind(portfolioId)
      .all<{ symbol: string; quantity: number; avg_cost: number }>();
    const { results: recentlyClosed } = await db
      .prepare(
        `SELECT DISTINCT symbol FROM bot_trades WHERE portfolio_id = ?
         AND status = 'closed' AND closed_at > datetime('now', '-60 minutes')`
      )
      .bind(portfolioId)
      .all<{ symbol: string }>();
    const held = new Set([
      ...openTrades.map((t) => t.symbol),
      ...positions.map((p) => p.symbol),
      ...recentlyClosed.map((r) => r.symbol),
    ]);

    const portfolio = await db
      .prepare('SELECT cash FROM portfolios WHERE id = ?')
      .bind(portfolioId)
      .first<{ cash: number }>();
    if (!portfolio) continue;
    let cash = portfolio.cash;
    const equity = cash + positions.reduce((s, p) => s + p.quantity * p.avg_cost, 0);

    for (const alert of viable) {
      if (slots <= 0) break;
      if (held.has(alert.symbol)) continue;

      const intel = await getIntel(alert.symbol).catch(() => null);
      if (intel?.blockEntry) continue;
      // Katalizör şartı: haberli isimler kazandı (BCRX/RBC), habersizler öğütüldü
      // (BEAM -$411). Katalizörsüz alarm bilgilendirme olarak kalır, işleme dönmez.
      const hasCatalyst =
        intel != null &&
        intel.news.length > 0 &&
        (intel.newsScore == null || intel.newsScore >= 0);
      if (!hasCatalyst) continue;

      const res = await executeEntry(
        db,
        portfolioId,
        config,
        equity,
        cash,
        {
          symbol: alert.symbol,
          price: alert.price,
          momentumPercent: alert.change_15m,
          dayChangePercent: alert.day_change,
        },
        ['⚡ nabız girişi', ...(intel?.notes ?? [])],
        '15dk'
      );
      if (res.action && res.spent > 0) {
        entered++;
        slots--;
        held.add(alert.symbol);
        cash -= res.spent;
        await sendTelegram(telegram, `🤖 <b>Nabız Girişi</b>\n${res.action.text}`);
      }
    }
  }
  return entered;
}

function formatReport(
  equity: number,
  cash: number,
  totalPnl: number,
  breadth: { advancers: number; decliners: number; scannedCount: number; dynamicCount: number },
  actions: string[],
  openTrades: BotTrade[],
  priceMap: Map<string, number>,
  stats: TradeStats,
  closedToday: BotTrade[] = []
): string {
  const money = (v: number) => `$${v.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  const sign = (v: number) => (v >= 0 ? '+' : '-');

  const lines: string[] = [];
  lines.push(`🤖 <b>Trader Botu Raporu</b>`);
  lines.push(
    `💼 Özkaynak ${money(equity)} | Nakit ${money(cash)} | Toplam K/Z ${sign(totalPnl)}${money(Math.abs(totalPnl))}`
  );
  lines.push(
    `📊 Piyasa: ${breadth.advancers}▲ / ${breadth.decliners}▼ (${breadth.scannedCount} hisse, ${breadth.dynamicCount} dinamik)`
  );

  lines.push('', `<b>Bu döngüdeki işlemler:</b>`);
  lines.push(...(actions.length ? actions : ['— işlem yok (koşul oluşmadı)']));

  lines.push('', `<b>Açık pozisyonlar (${openTrades.length}):</b>`);
  if (openTrades.length) {
    for (const t of openTrades) {
      const price = priceMap.get(t.symbol) ?? t.entry_price;
      const pnl = (price - t.entry_price) * t.quantity;
      lines.push(
        `• ${t.symbol} ${t.quantity} adet @ $${t.entry_price.toFixed(2)} → $${price.toFixed(2)} ` +
          `(${sign(pnl)}$${Math.abs(pnl).toFixed(2)}) | stop $${t.stop_loss.toFixed(2)} hedef $${t.take_profit.toFixed(2)}`
      );
    }
  } else {
    lines.push('— açık pozisyon yok');
  }

  // Bugün kapananlar: toplam K/Z'nin nereden geldiği raporda görünsün
  if (closedToday.length) {
    lines.push('', `<b>Bugün kapanan işlemler (${closedToday.length}):</b>`);
    for (const t of closedToday) {
      const pnl = t.pnl ?? 0;
      lines.push(
        `• ${t.symbol} ${t.quantity} adet $${t.entry_price.toFixed(2)}→$${(t.exit_price ?? 0).toFixed(2)} ` +
          `${sign(pnl)}$${Math.abs(pnl).toFixed(2)} (${t.exit_reason ?? '—'})`
      );
    }
  }

  if (stats.closedToday > 0) {
    lines.push(
      '',
      `<b>İşlem incelemesi (son 24s):</b> ${stats.closedToday} işlem, ` +
        `kazanç oranı ${stats.winRate!.toFixed(0)}%, K/Z ${sign(stats.totalPnl)}$${Math.abs(stats.totalPnl).toFixed(2)}` +
        (stats.profitFactor != null ? `, kâr faktörü ${stats.profitFactor.toFixed(2)}` : '')
    );
    if (stats.winRate != null && stats.winRate < 40 && stats.closedToday >= 5) {
      lines.push(`🔧 Öneri: kazanç oranı düşük — stop mesafesini genişletmeyi veya giriş eşiğini yükseltmeyi değerlendirin.`);
    }
  }

  return lines.join('\n');
}

/** Tam döngü: analiz → risk → giriş → inceleme → rapor. */
export async function runTraderCycle(
  db: D1Database,
  env: TelegramEnv,
  portfolioId: string,
  options: { report?: boolean; force?: boolean } = {}
): Promise<CycleResult> {
  const config = await getBotConfig(db, portfolioId);
  const empty: CycleResult = { ran: false, actions: [], openTrades: [], stats: null, reported: false };

  if (!config.enabled && !options.force) {
    return { ...empty, skippedReason: 'Bot devre dışı (ayarlardan etkinleştirin)' };
  }

  const minutes = nowMinutesUtc();
  const inSession = isWeekday() && minutes >= SESSION_OPEN_MIN && minutes < SESSION_CLOSE_MIN;
  if (!inSession && !options.force) {
    return { ...empty, skippedReason: 'Piyasa kapalı (ABD seansı dışı)' };
  }

  // Başlangıç izi (id=5): koşum yarıda kesilirse bile "denendi" kaydı kalır.
  // trader_attempt > trader_report ise koşumlar rapora ulaşamadan ölüyor demektir
  // (21 Tem: cron bağlamındaki koşumlar iz bırakmadan kesildi — teşhis için).
  if (options.report) {
    await db
      .prepare("INSERT OR REPLACE INTO cron_heartbeat (id, cron, at) VALUES (5, 'start', datetime('now'))")
      .run()
      .catch(() => {});
  }

  // 1. Piyasa analizi (sıcak semboller — son günlerin hareketlileri — dahil)
  const hotSymbols = await getHotSymbols(db).catch(() => [] as string[]);
  const snapshot = await scanMarket(hotSymbols);
  // Bayat veri İŞLEMİ engeller ama RAPORU engellemez: eskiden burada erken
  // dönüyorduk ve kaynak gecikmesi yaşandığı sürece raporlar tamamen susuyordu
  // (20 Tem: seans ortasında 2 döngü sessiz geçti). Portföy durumu raporu
  // bayat fiyatla da anlamlıdır; sadece alım-satım kararları taze veri ister.
  const dataFresh =
    Date.now() / 1000 - snapshot.lastBarTime < DATA_FRESH_SECONDS || Boolean(options.force);

  const actions: string[] = [];
  if (!dataFresh) {
    actions.push('⚠️ Veri bayat (kaynak gecikmesi/kesinti) — bu döngüde işlem yapılmadı');
  }

  // 2. Risk yönetimi (+ gün sonu kapama) — bayat fiyatla stop/hedef tetiklemek
  // yanlış çıkışlara yol açar; veri tazeyken çalışır
  const nearClose =
    inSession && minutes >= SESSION_CLOSE_MIN - FLATTEN_BEFORE_MIN && config.flatten_eod === 1;
  if (dataFresh) {
    const exitActions = await manageOpenTrades(db, portfolioId, config, {
      flattenAll: nearClose,
    });
    actions.push(...exitActions.map((a) => a.text));
  }

  // 3. Girişler (kapanışa yakınsa veya veri bayatsa yeni pozisyon açma)
  const { results: openAfterExits } = await db
    .prepare("SELECT * FROM bot_trades WHERE portfolio_id = ? AND status = 'open'")
    .bind(portfolioId)
    .all<BotTrade>();
  if (!nearClose && dataFresh) {
    // Giriş analizi (istihbarat + zenginleştirme) alt-istek bütçesini zorlayabilir;
    // hata verse bile rapor gönderimi engellenmemeli — bu yüzden izole edilir.
    try {
      const entryActions = await findEntries(
        db,
        portfolioId,
        config,
        snapshot.all,
        openAfterExits
      );
      actions.push(...entryActions.map((a) => a.text));
    } catch (e) {
      console.error('Giriş analizi hatası (rapor yine gönderilecek):', e);
    }
  }

  // 4. İşlem incelemesi
  const stats = await computeStats(db, portfolioId);

  // Güncel açık pozisyonlar + rapor için canlı fiyatlar
  const { results: openTrades } = await db
    .prepare("SELECT * FROM bot_trades WHERE portfolio_id = ? AND status = 'open'")
    .bind(portfolioId)
    .all<BotTrade>();
  // Özkaynak tüm pozisyonlar üzerinden (manuel alınanlar dahil)
  const { results: allPositions } = await db
    .prepare('SELECT symbol, quantity, avg_cost FROM positions WHERE portfolio_id = ?')
    .bind(portfolioId)
    .all<{ symbol: string; quantity: number; avg_cost: number }>();
  const symbols = [...new Set([...openTrades.map((t) => t.symbol), ...allPositions.map((p) => p.symbol)])];
  const quotes = symbols.length ? await getQuotes(symbols) : [];
  const priceMap = new Map(quotes.map((q) => [q.symbol, q.price]));

  const fresh = await db
    .prepare('SELECT cash, starting_cash FROM portfolios WHERE id = ?')
    .bind(portfolioId)
    .first<{ cash: number; starting_cash: number }>();
  const positionValue = allPositions.reduce(
    (s, p) => s + (priceMap.get(p.symbol) ?? p.avg_cost) * p.quantity,
    0
  );
  const equity = (fresh?.cash ?? 0) + positionValue;

  // 5. Rapor
  let reported = false;
  let report: string | undefined;
  if (options.report) {
    // Bugün (UTC) kapanan işlemler raporda listelensin — "Toplam K/Z nereden
    // geldi?" sorusu rapordan cevaplanabilsin (16 Tem kullanıcı geri bildirimi).
    const { results: closedToday } = await db
      .prepare(
        `SELECT * FROM bot_trades WHERE portfolio_id = ? AND status = 'closed'
         AND closed_at >= date('now') ORDER BY closed_at ASC LIMIT 20`
      )
      .bind(portfolioId)
      .all<BotTrade>();
    report = formatReport(
      equity,
      fresh?.cash ?? 0,
      equity - (fresh?.starting_cash ?? equity),
      snapshot,
      actions,
      openTrades,
      priceMap,
      stats,
      closedToday
    );
    if (telegramConfigured(env)) {
      reported = await sendTelegram(env, report);
      // Tek yeniden deneme: geçici ağ/limit hatasında raporu sessizce yutma
      if (!reported) reported = await sendTelegram(env, report);
    }
    // Gözlemlenebilirlik: son rapor denemesinin sonucu kalp atışına yazılır
    // (id=4 → /api/health'te trader_report olarak görünür). Hangi döngülerin
    // rapor üretip gönderemediğini teşhis etmek için.
    try {
      await db
        .prepare(
          "INSERT OR REPLACE INTO cron_heartbeat (id, cron, at) VALUES (4, ?, datetime('now'))"
        )
        .bind(reported ? 'ok' : 'fail')
        .run();
    } catch {
      // tanı kaydı asıl akışı engellemesin
    }
  }

  return { ran: true, actions, openTrades, stats, reported, report };
}

/** Cron için: botu etkin olan tüm portföylerde döngüyü çalıştır. */
export async function runAllTraders(
  db: D1Database,
  env: TelegramEnv,
  options: { report?: boolean } = {}
): Promise<number> {
  const { results } = await db
    .prepare('SELECT portfolio_id FROM bot_config WHERE enabled = 1')
    .all<{ portfolio_id: string }>();
  for (const row of results) {
    try {
      await runTraderCycle(db, env, row.portfolio_id, options);
    } catch (e) {
      console.error(`Bot döngüsü hatası (${row.portfolio_id}):`, e);
      // Sessiz kaybolma yok: rapor denemesine ulaşamayan döngü de iz bıraksın
      // (/api/health → trader_report: error)
      if (options.report) {
        await db
          .prepare(
            "INSERT OR REPLACE INTO cron_heartbeat (id, cron, at) VALUES (4, 'error', datetime('now'))"
          )
          .run()
          .catch(() => {});
      }
    }
  }
  return results.length;
}
