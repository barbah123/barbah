// Borsa paper-trading API — katmanlar:
//   veri katmanı        → lib/data.ts    (Yahoo Finance: fiyat, mum, arama)
//   strateji katmanı    → lib/strategies.ts (SMA kesişimi, RSI)
//   sinyal üretimi      → lib/signals.ts (strateji → sinyal kaydı)
//   doğrulama           → lib/validation.ts (risk/bakiye/pozisyon kontrolleri)
//   aracı yürütme       → lib/broker.ts  (paper-broker: emir dolumu, portföy)

import { marketRoutes } from './routes/market';
import { portfolioRoutes } from './routes/portfolio';
import { orderRoutes } from './routes/orders';
import { watchlistRoutes } from './routes/watchlist';
import { strategyRoutes } from './routes/strategies';
import { handleOptions, error, json } from './lib/http';
import { getOrCreatePortfolio, processOpenOrders } from './lib/broker';
import { runStrategies } from './lib/signals';
import { runScan } from './lib/scanner';
import { runAllTraders, runTraderCycle, enterFromPulseAlerts } from './lib/trader';
import { runPulse, type PulseAlert } from './lib/pulse';
import { checkLevelAlerts, type LevelAlert } from './lib/levels';
import { reportTrackedPositions, getActiveTracked, type TrackedPosition } from './lib/tracker';
import { getQuote } from './lib/data';
import { setMassiveKey, massiveConfigured, massivePing } from './lib/massive';
import { botRoutes } from './routes/bot';

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  // Kendine servis bağlantısı (wrangler.toml [[services]]): tick her işi ayrı
  // alt-çağrıda, taze alt-istek bütçesiyle çalıştırsın diye
  SELF?: Fetcher;
  // İç zamanlayıcı (Durable Object alarmı) — dış cron'lara bağımlılığı kaldırır
  SCHEDULER?: DurableObjectNamespace;
  // Telegram bildirimleri (opsiyonel): wrangler secret put ile tanımlanır
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
  // Massive (api.massive.com) veri sağlayıcı anahtarı (opsiyonel). Yoksa Yahoo.
  MASSIVE_API_KEY?: string;
}

// Tarama cron'u (Telegram bildirimli): açılış sonrası, öğlen, kapanış öncesi
const SCAN_CRON = '40 13,17,19 * * 1-5';
// Otonom trader döngüsü: seans boyunca her 10 dakikada (analiz+risk+giriş/çıkış+rapor)
const TRADER_CRON = '*/10 13-20 * * 1-5';

// ---- İç zamanlayıcı (Durable Object alarmı) ----
// CF cron tetikleyicileri iki kez sessizce durdu (10 ve 17 Tem), GitHub
// schedule ise saatlerce hiç ateşlemeyebiliyor. DO alarmı Cloudflare'ın
// garantili zamanlayıcısıdır: kaçırılan alarm yeniden denenir ve her vuruş
// kendini 5 dk sonrasına yeniden kurar. Kurulum (arm) idempotenttir; sağlık
// kontrolü, tick ve her deploy sonrası otomatik kurulur.
const ALARM_INTERVAL_MS = 5 * 60 * 1000;

export class Scheduler {
  private state: DurableObjectState;
  private env: Env;
  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }
  // Her çağrı alarmı garanti eder; kuruluysa dokunmaz (idempotent)
  async fetch(_req: Request): Promise<Response> {
    let next = await this.state.storage.getAlarm();
    if (next == null) {
      next = Date.now() + 10_000;
      await this.state.storage.setAlarm(next);
    }
    return new Response(JSON.stringify({ armed: true, nextAlarmInSeconds: Math.round((next - Date.now()) / 1000) }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
  async alarm(): Promise<void> {
    // Önce yeniden kur: iş hata verse bile zincir kopmaz
    await this.state.storage.setAlarm(Date.now() + ALARM_INTERVAL_MS);
    const d = new Date();
    const day = d.getUTCDay();
    const hour = d.getUTCHours();
    // Yalnızca ABD seansı civarı (hafta içi 13-21 UTC); gece boşa vurmasın
    if (day === 0 || day === 6 || hour < 13 || hour > 21) return;
    // Tick, işleri SELF üzerinden ayrı alt-çağrılarda (taze bütçeyle) dağıtır;
    // atomik kilit CF cron'u geri gelirse bile çift çalışmayı önler.
    if (this.env.SELF) {
      await this.env.SELF.fetch('https://internal/api/cron/tick', {
        method: 'POST',
        headers: { 'X-Tick-Source': 'alarm' },
      });
    }
  }
}

// Alarmın kurulu olduğunu garanti et (arka planda, yanıtı geciktirmeden)
function armScheduler(env: Env): Promise<Response> | null {
  if (!env.SCHEDULER) return null;
  try {
    return env.SCHEDULER.get(env.SCHEDULER.idFromName('main')).fetch('https://internal/arm');
  } catch {
    return null;
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method === 'OPTIONS') return handleOptions();
    setMassiveKey(env.MASSIVE_API_KEY);

    const url = new URL(request.url);
    const path = url.pathname;

    // API dışındaki her şey web arayüzü (public/)
    if (!path.startsWith('/api/')) return env.ASSETS.fetch(request);

    // Sağlık kontrolü ve tick her uğradığında iç zamanlayıcı garanti kurulur
    if (path === '/api/health' || path === '/api/cron/tick') {
      const armed = armScheduler(env);
      if (armed) ctx.waitUntil(armed);
    }

    // İç zamanlayıcı tanısı/kurulumu: alarm durumunu döndürür
    if (path === '/api/cron/arm' && (request.method === 'POST' || request.method === 'GET')) {
      const armed = armScheduler(env);
      if (!armed) return json({ armed: false, reason: 'SCHEDULER bağlantısı yok' });
      return new Response(await (await armed).text(), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    try {
      // Portföyden bağımsız piyasa uçları
      if (
        path === '/api/quotes' ||
        path === '/api/search' ||
        path === '/api/candles' ||
        path === '/api/intel' ||
        path === '/api/ftrend'
      ) {
        return await marketRoutes(request, url);
      }

      // Sağlık: iş türü bazında kalp atışları
      if (path === '/api/health' && request.method === 'GET') {
        const { results } = await env.DB
          .prepare('SELECT id, cron, at FROM cron_heartbeat')
          .all<{ id: number; cron: string; at: string }>();
        const names: Record<number, string> = { 1: 'cycle', 2: 'trader', 3: 'scan', 4: 'trader_report', 5: 'trader_attempt' };
        const jobs: Record<string, unknown> = {};
        let newestAge: number | null = null;
        for (const r of results) {
          const age = Math.round(
            Date.now() / 1000 - new Date(r.at.replace(' ', 'T') + 'Z').getTime() / 1000
          );
          jobs[names[r.id] ?? String(r.id)] = { at: r.at, ageSeconds: age, source: r.cron };
          if (newestAge == null || age < newestAge) newestAge = age;
        }
        return json({
          ok: true,
          jobs,
          cronHealthy: newestAge != null && newestAge < 900,
        });
      }

      // Veri sağlayıcı tanısı: hangi kaynak aktif + Massive testi (anahtar sızdırmaz)
      if (path === '/api/datasource' && request.method === 'GET') {
        const provider = massiveConfigured() ? 'massive' : 'yahoo';
        const ping = massiveConfigured() ? await massivePing() : null;
        return json({ provider, massiveConfigured: massiveConfigured(), ping });
      }

      // Yönetici tanısı: hangi portföylerde bot etkin ve hangi bakiyede.
      // Duplicate/hayalet rapor ayıklamak için — cihaz kimliği maskeli döner.
      if (path === '/api/admin/state' && request.method === 'GET') {
        const { results } = await env.DB
          .prepare(
            `SELECT p.id, p.device_id, p.cash, p.starting_cash, p.created_at,
                    COALESCE(b.enabled, 0) AS enabled,
                    (SELECT COUNT(*) FROM bot_trades t
                       WHERE t.portfolio_id = p.id AND t.status = 'open') AS open_trades
             FROM portfolios p
             LEFT JOIN bot_config b ON b.portfolio_id = p.id
             ORDER BY enabled DESC, p.created_at ASC`
          )
          .all<{
            id: string;
            device_id: string;
            cash: number;
            starting_cash: number;
            created_at: string;
            enabled: number;
            open_trades: number;
          }>();
        const portfolios = results.map((r) => ({
          portfolio_id: r.id,
          device: r.device_id.length > 8 ? `${r.device_id.slice(0, 4)}…${r.device_id.slice(-4)}` : r.device_id,
          cash: r.cash,
          starting_cash: r.starting_cash,
          enabled: r.enabled === 1,
          open_trades: r.open_trades,
          created_at: r.created_at,
        }));
        return json({ portfolios, enabledCount: portfolios.filter((p) => p.enabled).length });
      }

      // Yönetici: belirli bir portföyün botunu etkinleştir/devre dışı bırak.
      // Hayalet test portföyünü susturmak için (body: {device_id, enabled}).
      if (path === '/api/admin/bot' && request.method === 'POST') {
        let body: any;
        try {
          body = await request.json();
        } catch {
          return error('Geçersiz istek gövdesi');
        }
        const deviceId = String(body.device_id ?? '').trim();
        const enabled = body.enabled ? 1 : 0;
        if (!deviceId) return error('device_id gerekli');
        const pf = await env.DB
          .prepare('SELECT id FROM portfolios WHERE device_id = ?')
          .bind(deviceId)
          .first<{ id: string }>();
        if (!pf) return error('Portföy bulunamadı', 404);
        await env.DB
          .prepare(
            `INSERT INTO bot_config (portfolio_id, enabled) VALUES (?, ?)
             ON CONFLICT(portfolio_id) DO UPDATE SET enabled = excluded.enabled, updated_at = datetime('now')`
          )
          .bind(pf.id, enabled)
          .run();
        return json({ ok: true, portfolio_id: pf.id, enabled: enabled === 1 });
      }

      // Yönetici tanısı: etkin botların döngüsünü çalıştırıp NEDEN rapor
      // gitmediğini gör (ran/reported/skippedReason). ?force=1 seans/veri
      // kapılarını atlar, ?report=1 gerçekten Telegram'a gönderir.
      if (path === '/api/admin/bot-cycle' && request.method === 'POST') {
        const force = url.searchParams.get('force') === '1';
        const report = url.searchParams.get('report') === '1';
        const { results } = await env.DB
          .prepare('SELECT portfolio_id FROM bot_config WHERE enabled = 1')
          .all<{ portfolio_id: string }>();
        const out: unknown[] = [];
        for (const row of results) {
          try {
            const r = await runTraderCycle(env.DB, env, row.portfolio_id, { force, report });
            out.push({
              portfolio_id: row.portfolio_id,
              ran: r.ran,
              reported: r.reported,
              skippedReason: r.skippedReason ?? null,
              actions: r.actions,
              openTrades: r.openTrades.length,
            });
          } catch (e) {
            out.push({ portfolio_id: row.portfolio_id, error: String(e) });
          }
        }
        return json({ enabledBots: results.length, results: out });
      }

      // Yönetici tanısı: son bot işlemleri (kapanan + açık) — raporda görünmeyen
      // gün içi işlem geçmişini incelemek için. ?hours=48 ile pencere ayarlanır.
      if (path === '/api/admin/trades' && request.method === 'GET') {
        const hours = Math.min(720, Math.max(1, Number(url.searchParams.get('hours')) || 48));
        const { results } = await env.DB
          .prepare(
            `SELECT symbol, quantity, entry_price, exit_price, pnl, status,
                    entry_reason, exit_reason, opened_at, closed_at
             FROM bot_trades
             WHERE opened_at >= datetime('now', ?)
             ORDER BY opened_at DESC LIMIT 100`
          )
          .bind(`-${hours} hours`)
          .all();
        return json({ hours, trades: results });
      }

      // Yedek tetikleyici: CF cron'ları durursa dışarıdan çağrılır.
      // Tür bazlı asgari aralık korumaları çift çalışmayı ve kötüye kullanımı sınırlar.
      // Her iş SELF üzerinden ayrı alt-çağrıda koşar: her alt-çağrı kendi 50
      // alt-istek bütçesini alır. Aynı istekte cycle+trader koşmak bütçeyi
      // tüketip Telegram gönderimini düşürüyordu (17 Tem: trader_report=fail).
      if (path === '/api/cron/tick' && request.method === 'POST') {
        // Kaynak izi: iç alarm mı, dış dürtü (GitHub/manuel) mü — health'te görünür
        const source = request.headers.get('X-Tick-Source') === 'alarm' ? 'alarm' : 'tick';
        const d = new Date();
        const inScanWindow =
          [13, 17, 19].includes(d.getUTCHours()) && d.getUTCMinutes() >= 40 && d.getUTCMinutes() < 45;
        const kinds: JobKind[] = inScanWindow
          ? ['scan', 'trader', 'cycle']
          : ['trader', 'cycle'];
        const ran: string[] = [];
        for (const kind of kinds) {
          if (env.SELF) {
            try {
              const res = await env.SELF.fetch(
                `https://internal/api/cron/run-one?kind=${kind}&source=${source}`,
                { method: 'POST' }
              );
              const body = (await res.json()) as { ran?: boolean };
              if (body.ran) ran.push(kind);
              continue;
            } catch (e) {
              console.error(`SELF alt-çağrısı düştü (${kind}), yerinde çalıştırılıyor:`, e);
            }
          }
          // Bağlantı yoksa/düştüyse eski davranış: aynı istekte çalıştır
          if (await runScheduledJob(env, kind, source)) ran.push(kind);
        }
        return json({ ok: true, ran });
      }

      // İç uç: tek bir zamanlanmış işi çalıştır (tick'in SELF alt-çağrısı).
      // runScheduledJob'daki atomik kilit çift çalışmayı burada da önler.
      if (path === '/api/cron/run-one' && request.method === 'POST') {
        const kind = url.searchParams.get('kind') as JobKind | null;
        if (!kind || !(kind in JOB_IDS)) return error('Geçersiz iş türü');
        const sp = url.searchParams.get('source');
        const source = sp === 'alarm' || sp === 'cron' ? sp : 'tick';
        const ran = await runScheduledJob(env, kind, source);
        return json({ ok: true, ran });
      }

      // Tarama katmanı: günlük trade adaylarını bul (POST + notify → Telegram'a da gönder)
      if (path === '/api/scan' && (request.method === 'GET' || request.method === 'POST')) {
        const notify = request.method === 'POST' && url.searchParams.get('notify') !== '0';
        const result = await runScan(env, { notify, db: env.DB });
        return json(result);
      }

      // Seviye alarmları: listeleme, ekleme, silme
      if (path === '/api/levels' && request.method === 'GET') {
        const { results } = await env.DB
          .prepare('SELECT * FROM level_alerts ORDER BY created_at DESC LIMIT 100')
          .all<LevelAlert>();
        return json({ levels: results });
      }
      if (path === '/api/levels' && request.method === 'POST') {
        let body: any;
        try {
          body = await request.json();
        } catch {
          return error('Geçersiz istek gövdesi');
        }
        const symbol = String(body.symbol ?? '').toUpperCase().trim();
        const level = Number(body.level);
        const direction = body.direction;
        if (!symbol) return error('Sembol gerekli');
        if (!Number.isFinite(level) || level <= 0) return error('Geçerli bir seviye girin');
        if (direction !== 'above' && direction !== 'below') {
          return error('direction "above" veya "below" olmalı');
        }
        const id = crypto.randomUUID();
        await env.DB
          .prepare(
            'INSERT INTO level_alerts (id, symbol, level, direction, note) VALUES (?, ?, ?, ?, ?)'
          )
          .bind(id, symbol, level, direction, body.note ?? null)
          .run();
        const row = await env.DB
          .prepare('SELECT * FROM level_alerts WHERE id = ?')
          .bind(id)
          .first<LevelAlert>();
        return json({ level: row }, 201);
      }
      const levelDelete = path.match(/^\/api\/levels\/([\w-]+)$/);
      if (levelDelete && request.method === 'DELETE') {
        await env.DB
          .prepare('DELETE FROM level_alerts WHERE id = ?')
          .bind(levelDelete[1])
          .run();
        return json({ ok: true });
      }

      // Manuel pozisyon takibi: listeleme, ekleme, kapatma
      if (path === '/api/tracked' && request.method === 'GET') {
        const { results } = await env.DB
          .prepare('SELECT * FROM tracked_positions ORDER BY created_at DESC LIMIT 100')
          .all<TrackedPosition>();
        return json({ tracked: results });
      }
      if (path === '/api/tracked' && request.method === 'POST') {
        let body: any;
        try {
          body = await request.json();
        } catch {
          return error('Geçersiz istek gövdesi');
        }
        const symbol = String(body.symbol ?? '').toUpperCase().trim();
        const quantity = Number(body.quantity);
        const entryPrice = Number(body.entry_price);
        if (!symbol) return error('Sembol gerekli');
        if (!Number.isFinite(quantity) || quantity <= 0) return error('Geçerli adet girin');
        if (!Number.isFinite(entryPrice) || entryPrice <= 0) return error('Geçerli giriş fiyatı girin');
        const id = crypto.randomUUID();
        await env.DB
          .prepare(
            'INSERT INTO tracked_positions (id, symbol, quantity, entry_price, note) VALUES (?, ?, ?, ?, ?)'
          )
          .bind(id, symbol, quantity, entryPrice, body.note ?? null)
          .run();
        const row = await env.DB
          .prepare('SELECT * FROM tracked_positions WHERE id = ?')
          .bind(id)
          .first<TrackedPosition>();
        return json({ tracked: row }, 201);
      }
      const trackedClose = path.match(/^\/api\/tracked\/([\w-]+)\/close$/);
      if (trackedClose && request.method === 'POST') {
        let body: any = {};
        try {
          body = await request.json();
        } catch {
          // gövde opsiyonel: verilmezse güncel fiyattan kapat
        }
        const row = await env.DB
          .prepare("SELECT * FROM tracked_positions WHERE id = ? AND status = 'active'")
          .bind(trackedClose[1])
          .first<TrackedPosition>();
        if (!row) return error('Aktif takip pozisyonu bulunamadı', 404);
        let exitPrice = Number(body.exit_price);
        if (!Number.isFinite(exitPrice) || exitPrice <= 0) {
          const quote = await getQuote(row.symbol);
          if (!quote) return error('Güncel fiyat alınamadı, exit_price gönderin');
          exitPrice = quote.price;
        }
        const pnl = (exitPrice - row.entry_price) * row.quantity;
        await env.DB
          .prepare(
            `UPDATE tracked_positions SET status = 'closed', exit_price = ?, pnl = ?, closed_at = datetime('now') WHERE id = ?`
          )
          .bind(exitPrice, pnl, row.id)
          .run();
        return json({ ok: true, exit_price: exitPrice, pnl });
      }
      const trackedDelete = path.match(/^\/api\/tracked\/([\w-]+)$/);
      if (trackedDelete && request.method === 'DELETE') {
        await env.DB
          .prepare('DELETE FROM tracked_positions WHERE id = ?')
          .bind(trackedDelete[1])
          .run();
        return json({ ok: true });
      }
      if (path === '/api/tracked/report' && request.method === 'POST') {
        const sent = await reportTrackedPositions(env.DB, env, {
          force: url.searchParams.get('force') === '1',
        });
        return json({ ok: true, sent });
      }

      // Nabız dedektörü: son alarmlar + manuel tetikleme
      if (path === '/api/pulse' && request.method === 'GET') {
        const { results } = await env.DB
          .prepare('SELECT * FROM pulse_alerts ORDER BY created_at DESC LIMIT 50')
          .all<PulseAlert>();
        return json({ alerts: results });
      }
      if (path === '/api/pulse/run' && request.method === 'POST') {
        const force = url.searchParams.get('force') === '1';
        const minBurstParam = Number(url.searchParams.get('minBurst'));
        const result = await runPulse(env.DB, env, {
          force,
          minBurst: Number.isFinite(minBurstParam) && minBurstParam > 0 ? minBurstParam : undefined,
          notify: url.searchParams.get('notify') !== '0',
        });
        return json(result);
      }

      // Kalan uçlar cihaz kimliğine bağlı bir portföy gerektirir
      const deviceId = request.headers.get('X-Device-Id')?.trim();
      if (!deviceId || deviceId.length < 8) {
        return error('X-Device-Id başlığı gerekli', 401);
      }
      const portfolio = await getOrCreatePortfolio(env.DB, deviceId);

      if (path.startsWith('/api/portfolio')) {
        return await portfolioRoutes(request, url, env.DB, portfolio);
      }
      if (path.startsWith('/api/orders')) {
        return await orderRoutes(request, url, env.DB, portfolio);
      }
      if (path.startsWith('/api/watchlist')) {
        return await watchlistRoutes(request, url, env.DB, portfolio);
      }
      if (path.startsWith('/api/strategies') || path === '/api/signals') {
        return await strategyRoutes(request, url, env.DB, portfolio, env);
      }
      if (path.startsWith('/api/bot')) {
        return await botRoutes(request, url, env.DB, portfolio, env);
      }

      return error('Bulunamadı', 404);
    } catch (e) {
      console.error('API hatası:', e);
      return error('Sunucu hatası, lütfen tekrar deneyin', 500);
    }
  },

  // Cron'lar:
  //  - 5 dk'lık: açık limit emirlerini doldur + etkin stratejileri çalıştır (sinyal → Telegram)
  //  - tarama: günlük trade adaylarını bul → Telegram bildirimi
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    setMassiveKey(env.MASSIVE_API_KEY);
    const armed = armScheduler(env);
    if (armed) ctx.waitUntil(armed);
    ctx.waitUntil(
      (async () => {
        const kind: JobKind =
          event.cron === SCAN_CRON ? 'scan' : event.cron === TRADER_CRON ? 'trader' : 'cycle';
        // TRADER cron'dan koşmaz: cron (scheduled) bağlamının ~30 sn'lik ömrü,
        // uzun süren trader döngüsünü hata bile fırlatamadan kesiyor (21 Tem:
        // 22:20-22:50 TSİ koşumları öldü, gün sonu kapanışı yarım kaldı, TSLL
        // gecede açık kaldı). Trader'ı sabırlı tetikleyiciler çalıştırır: DO
        // alarmı (15 dk'ya kadar bekleyebilir) ve GitHub tick'i. Cron burada
        // yalnızca alarmın kurulu olduğunu garantiler (yukarıda armScheduler) —
        // alarm zinciri kopmuşsa en geç 5 dk içinde yeniden kurulur.
        if (kind === 'trader') return;
        // Kısa işler (cycle/scan) SELF üzerinden taze bütçeyle koşar
        if (env.SELF) {
          try {
            await env.SELF.fetch(`https://internal/api/cron/run-one?kind=${kind}&source=cron`, {
              method: 'POST',
            });
            return;
          } catch (e) {
            console.error(`SELF alt-çağrısı düştü (cron ${kind}), yerinde çalıştırılıyor:`, e);
          }
        }
        await runScheduledJob(env, kind, `cron:${event.cron}`);
      })()
    );
  },
};

// ---- Zamanlanmış iş çalıştırıcı ----
// Hem Cloudflare cron'u hem /api/cron/tick (yedek tetikleyici) bu fonksiyonu
// kullanır. Tür bazlı kalp atışı + asgari aralık koruması çift çalışmayı önler
// (10 Tem: CF cron'ları kayıtlı olduğu halde sessizce durdu).

type JobKind = 'cycle' | 'trader' | 'scan';
const JOB_IDS: Record<JobKind, number> = { cycle: 1, trader: 2, scan: 3 };
const JOB_MIN_INTERVAL_S: Record<JobKind, number> = { cycle: 240, trader: 540, scan: 10800 };

// İş yuvasını atomik olarak sahiplen. Tek bir koşullu UPDATE ile hem "vakti
// geldi mi" kontrolünü hem de damgalamayı yapar; böylece CF cron'u ile
// /api/cron/tick yedeği aynı anda geçip çift çalışamaz (14 Tem: aynı dakikada
// iki rapor yarış durumu). meta.changes === 1 ise bu çağrı işi sahiplendi.
async function claimJob(db: D1Database, kind: JobKind, source: string): Promise<boolean> {
  // Satır yoksa oluştur; varsa dokunma (eski damgayı korur ki ilk UPDATE geçebilsin).
  await db
    .prepare(
      "INSERT OR IGNORE INTO cron_heartbeat (id, cron, at) VALUES (?, ?, datetime('now', ?))"
    )
    .bind(JOB_IDS[kind], source, `-${JOB_MIN_INTERVAL_S[kind]} seconds`)
    .run();
  // Yalnızca asgari aralık dolduysa damgayı ilerlet. Bunu ilk yapan sahiplenir.
  const res = await db
    .prepare(
      "UPDATE cron_heartbeat SET cron = ?, at = datetime('now') WHERE id = ? AND at <= datetime('now', ?)"
    )
    .bind(source, JOB_IDS[kind], `-${JOB_MIN_INTERVAL_S[kind]} seconds`)
    .run();
  return (res.meta?.changes ?? 0) > 0;
}

export async function runScheduledJob(
  env: Env,
  kind: JobKind,
  source: string
): Promise<boolean> {
  try {
    if (!(await claimJob(env.DB, kind, source))) return false;

    if (kind === 'scan') {
      const result = await runScan(env, { notify: true, db: env.DB });
      console.log(
        `Tarama: ${result.scannedCount} hisse, ${result.candidates.length} aday, Telegram: ${result.notified}`
      );
      return true;
    }
    if (kind === 'trader') {
      const count = await runAllTraders(env.DB, env, { report: true });
      console.log(`Trader döngüsü: ${count} bot çalıştı`);
      return true;
    }
    const filled = await processOpenOrders(env.DB);
        const summary = await runStrategies(env.DB, undefined, env);
        // Nabız dedektörü: erken momentum patlamalarını yakala → anında Telegram
        let pulseInfo = 'atlandı';
        try {
          const pulse = await runPulse(env.DB, env);
          pulseInfo = pulse.ran
            ? `${pulse.alerts.length} alarm (${pulse.triggered.length} tetik)`
            : pulse.skippedReason ?? 'atlandı';
          // Erken yakalanan hareket, 10 dk döngüsünü beklemeden işleme dönsün
          if (pulse.alerts.length) {
            const entered = await enterFromPulseAlerts(env.DB, env, pulse.alerts);
            if (entered) pulseInfo += `, ${entered} anında giriş`;
          }
        } catch (e) {
          console.error('Nabız hatası:', e);
        }
        // Seviye bekçisi: kullanıcı tanımlı fiyat seviyeleri
        let levelInfo = 0;
        try {
          levelInfo = await checkLevelAlerts(env.DB, env);
        } catch (e) {
          console.error('Seviye alarmı hatası:', e);
        }
        // Manuel pozisyon takibi: 15 dakikada bir rapor (5 dk'lık cron'un her 3. vuruşu)
        try {
          if (new Date().getUTCMinutes() % 15 === 0 && (await getActiveTracked(env.DB)).length) {
            await reportTrackedPositions(env.DB, env);
          }
        } catch (e) {
          console.error('Takip raporu hatası:', e);
        }
    console.log(
      `Cron: ${filled} limit emri doldu; strateji: ${JSON.stringify(summary)}; nabız: ${pulseInfo}; seviye: ${levelInfo}`
    );
    return true;
  } catch (e) {
    console.error(`Zamanlanmış iş hatası (${kind}):`, e);
    return true; // damga atıldı; hata logda
  }
}
