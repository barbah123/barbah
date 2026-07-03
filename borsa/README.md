# Borsa — Paper Trading Uygulaması

ABD hisseleri için anlık verili, TradingView grafikli **paper trading** (sanal $100.000 bakiye) uygulaması. Web + mobil arayüz, otomatik stratejiler ve Telegram bildirimli günlük trade taraması içerir.

## Mimari: 5 katman + tarama

```
borsa/backend/src/
├── lib/
│   ├── data.ts        → VERİ KATMANI      (Yahoo Finance: anlık fiyat, mum, arama)
│   ├── strategies.ts  → STRATEJİ KATMANI  (SMA kesişimi, RSI — saf fonksiyonlar)
│   ├── signals.ts     → SİNYAL ÜRETİMİ    (strateji → al/sat sinyali + Telegram)
│   ├── validation.ts  → DOĞRULAMA         (bakiye, pozisyon, adet, fiyat kontrolleri)
│   ├── broker.ts      → ARACI YÜRÜTME     (paper-broker: emir dolumu, portföy)
│   ├── scanner.ts     → TARAMA            (80 hisselik evrende day-trade adayları)
│   └── telegram.ts    → BİLDİRİM          (sinyal + tarama sonuçları Telegram'a)
├── routes/            → REST API uçları
└── index.ts           → yönlendirme + cron tetikleyicileri
```

Akış: **veri → strateji → sinyal → doğrulama → yürütme**. Doğrulamayı geçemeyen sinyal `skipped` olarak kaydedilir, geçen sinyal paper-broker'da emre dönüşür. Her adım `signals` ve `orders` tablolarında izlenebilir.

## Anlık veri nereden geliyor?

- **Yahoo Finance** (varsayılan): API anahtarı gerektirmez, ABD hisselerinde neredeyse anlık. Tarayıcı `User-Agent` başlığı zorunludur (kodda hazır).
- **TradingView**: yalnızca grafik widget'ı olarak gömülüdür — TradingView halka açık veri API'si sunmaz.
- Yükseltme yolu: gerçek zamanlı WebSocket isterseniz **Finnhub** (ücretsiz anahtar) veya **Alpaca** eklenebilir; tek dokunulacak dosya `lib/data.ts`.

## Bileşenler

| Dizin | Nedir | Teknoloji |
|---|---|---|
| `backend/` | API + cron + web arayüzü | Cloudflare Workers + D1 |
| `backend/public/` | Web dashboard (Worker servis eder) | Vanilla JS + TradingView widget |
| `mobile/` | Mobil uygulama | Expo 56 / React Native |

## Kurulum

### Backend (Cloudflare Workers)

```bash
cd borsa/backend
npm install
npx wrangler d1 create borsa-paper-db      # çıkan database_id'yi wrangler.toml'a yazın
npx wrangler d1 migrations apply borsa-paper-db --remote
npx wrangler deploy
```

Yerel geliştirme: `npx wrangler d1 migrations apply borsa-paper-db --local && npm run dev`

### Telegram bildirimleri

1. Telegram'da **@BotFather**'a `/newbot` yazıp bot oluşturun, **token**'ı alın.
2. Botunuza herhangi bir mesaj gönderin, sonra tarayıcıda açın:
   `https://api.telegram.org/bot<TOKEN>/getUpdates` → `chat.id` değerini not edin.
3. Sırları tanımlayın:
   ```bash
   npx wrangler secret put TELEGRAM_BOT_TOKEN
   npx wrangler secret put TELEGRAM_CHAT_ID
   ```
   (Yerel test için `backend/.dev.vars` dosyasına `TELEGRAM_BOT_TOKEN=...` ve `TELEGRAM_CHAT_ID=...` yazabilirsiniz.)

Token tanımlı değilse uygulama normal çalışır, sadece bildirim atlanır.

### Zamanlanmış görevler (cron)

- `*/5 13-21 * * 1-5` — 5 dakikada bir: açık limit emirlerini doldur + etkin stratejileri çalıştır (sinyaller Telegram'a gider).
- `40 13,17,19 * * 1-5` — günde 3 kez (açılış sonrası ~16:40 TSİ, öğlen, kapanışa doğru): **day-trade taraması** → en iyi 5 aday Telegram'a.

Manuel tarama: `POST /api/scan` (Telegram'a da gönderir), `GET /api/scan` (sadece sonucu döner).

### Mobil (Expo)

```bash
cd borsa/mobile
npm install
EXPO_PUBLIC_API_URL=https://<worker-adresiniz>.workers.dev npx expo start
```

## API özeti

Tüm portföy uçları `X-Device-Id` başlığı ister (istemciler otomatik üretir; her cihaz $100.000 ile başlar).

- `GET /api/quotes?symbols=AAPL,MSFT` · `GET /api/search?q=` · `GET /api/candles?symbol=`
- `GET /api/portfolio` · `POST /api/portfolio/reset`
- `GET/POST /api/orders` · `POST /api/orders/:id/cancel` (piyasa + limit, alış/satış)
- `GET/POST/DELETE /api/watchlist`
- `GET/POST/PATCH/DELETE /api/strategies` · `POST /api/strategies/run` · `GET /api/signals`
- `GET|POST /api/scan` — day-trade adayı taraması

> ⚠️ Bu uygulama eğitim/simülasyon amaçlıdır; ürettiği sinyaller yatırım tavsiyesi değildir.
