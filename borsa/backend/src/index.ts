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
import { runAllTraders, enterFromPulseAlerts } from './lib/trader';
import { runPulse, type PulseAlert } from './lib/pulse';
import { botRoutes } from './routes/bot';

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  // Telegram bildirimleri (opsiyonel): wrangler secret put ile tanımlanır
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
}

// Tarama cron'u (Telegram bildirimli): açılış sonrası, öğlen, kapanış öncesi
const SCAN_CRON = '40 13,17,19 * * 1-5';
// Otonom trader döngüsü: seans boyunca her 10 dakikada (analiz+risk+giriş/çıkış+rapor)
const TRADER_CRON = '*/10 13-20 * * 1-5';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') return handleOptions();

    const url = new URL(request.url);
    const path = url.pathname;

    // API dışındaki her şey web arayüzü (public/)
    if (!path.startsWith('/api/')) return env.ASSETS.fetch(request);

    try {
      // Portföyden bağımsız piyasa uçları
      if (
        path === '/api/quotes' ||
        path === '/api/search' ||
        path === '/api/candles' ||
        path === '/api/intel'
      ) {
        return await marketRoutes(request, url);
      }

      // Tarama katmanı: günlük trade adaylarını bul (POST + notify → Telegram'a da gönder)
      if (path === '/api/scan' && (request.method === 'GET' || request.method === 'POST')) {
        const notify = request.method === 'POST' && url.searchParams.get('notify') !== '0';
        const result = await runScan(env, { notify, db: env.DB });
        return json(result);
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
    ctx.waitUntil(
      (async () => {
        if (event.cron === SCAN_CRON) {
          const result = await runScan(env, { notify: true, db: env.DB });
          console.log(
            `Tarama: ${result.scannedCount} hisse, ${result.candidates.length} aday, Telegram: ${result.notified}`
          );
          return;
        }
        if (event.cron === TRADER_CRON) {
          const count = await runAllTraders(env.DB, env, { report: true });
          console.log(`Trader döngüsü: ${count} bot çalıştı`);
          return;
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
        console.log(
          `Cron: ${filled} limit emri doldu; strateji: ${JSON.stringify(summary)}; nabız: ${pulseInfo}`
        );
      })()
    );
  },
};
