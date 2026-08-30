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
│   ├── intel.ts       → İSTİHBARAT        (haber + bilanço takvimi + Reddit/Stocktwits)
│   ├── trader.ts      → OTONOM TRADER     (analiz→risk→giriş/çıkış→inceleme→rapor)
│   └── telegram.ts    → BİLDİRİM          (sinyal + tarama + bot raporları Telegram'a)
├── routes/            → REST API uçları
└── index.ts           → yönlendirme + cron tetikleyicileri
```

Akış: **veri → strateji → sinyal → doğrulama → yürütme**. Doğrulamayı geçemeyen sinyal `skipped` olarak kaydedilir, geçen sinyal paper-broker'da emre dönüşür. Her adım `signals` ve `orders` tablolarında izlenebilir.

## Anlık veri nereden geliyor?

- **Yahoo Finance** (varsayılan): API anahtarı gerektirmez, ABD hisselerinde neredeyse anlık. Tarayıcı `User-Agent` başlığı zorunludur (kodda hazır).
- **TradingView**: yalnızca grafik widget'ı olarak gömülüdür — TradingView halka açık veri API'si sunmaz.
- Yükseltme yolu (tüm NASDAQ gerçek zamanlı isterseniz): **Alpaca** Algo Trader Plus (~$99/ay, tüm ABD borsaları SIP verisi + broker API) veya **Polygon.io** Advanced (~$199/ay, tick seviyesi). Ara adım: **Finnhub** (ücretsiz anahtarla gerçek zamanlıya yakın WebSocket). Tek dokunulacak dosya `lib/data.ts`.

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

### Otonom trader botu

Web arayüzündeki **🤖 Bot** sekmesinden (veya `PATCH /api/bot` ile) etkinleştirilir. Her 10 dakikada bir tam döngü çalışır ve **Telegram'a rapor gönderir**:

1. **Piyasa analizi** — 80 hisselik evren taranır (yükselen/düşen genişliği + momentum adayları)
2. **Risk yönetimi** — açık pozisyonlarda stop-loss / kâr hedefi / iz süren stop / gün sonu kapama
3. **Giriş kararları** — pozitif momentum + günlük trend filtresi (long-only), ardından **istihbarat elemesi**:
   - 🛡️ **Bilanço 2 gün içindeyse giriş engellenir** (ikili olay riski)
   - 🛡️ **Haber akışı belirgin olumsuzsa engellenir** (başlık duygu skoru)
   - 🛡️ **Stocktwits duyarlılığı ağır bearish ise engellenir**
   - ➕ Olumlu haber, Reddit/WSB trendi ve bullish Stocktwits sıralamayı yükseltir; gerekçe emre işlenir
   - Kaynaklar: Yahoo haber, Yahoo bilanço takvimi, ApeWisdom (Reddit), Stocktwits — hepsi fail-open: kaynak çökmüşse işlem durmaz, yalnızca kesin olumsuz istihbarat engeller
4. **Pozisyon büyüklüğü** — `riske edilen tutar = özkaynak × risk%`, stop mesafesine bölünür; tek pozisyon ve nakit tavanlarıyla sınırlanır
5. **İşlem incelemesi** — kazanç oranı, kâr faktörü, en iyi/kötü işlem; düşük performansta optimizasyon önerisi

Korumalar: piyasa kapaliysa veya veri bayatsa işlem yapmaz; stop yenen sembole 1 saat yeniden girmez (soğuma); kapanışa 10 dk kala yeni giriş açmaz ve `flatten_eod` açıksa tüm pozisyonları kapatır (day-trade disiplini).

### Zamanlanmış görevler (cron)

- `*/5 13-21 * * 1-5` — 5 dakikada bir: açık limit emirlerini doldur + etkin stratejileri çalıştır (sinyaller Telegram'a gider).
- `40 13,17,19 * * 1-5` — günde 3 kez (açılış sonrası ~16:40 TSİ, öğlen, kapanışa doğru): **day-trade taraması** → en iyi 5 aday Telegram'a.
- `*/10 13-20 * * 1-5` — her 10 dakikada: **otonom trader döngüsü + Telegram raporu**.

Manuel tarama: `POST /api/scan` (Telegram'a da gönderir), `GET /api/scan` (sadece sonucu döner).
Manuel bot döngüsü: `POST /api/bot/run` (`?force=1` piyasa kapalıyken test için).

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
- `GET /api/ftrend?symbol=GC=F&interval=1h&range=730d&mode=long` — FTREND optimizasyon + backtest

## FTREND stratejisi (altın / trend takibi)

Foreks'teki **FTREND(periyot, çarpan)** indikatörünün eşleniği: ATR tabanlı iz süren
stop (SuperTrend ailesi). Yükseliş trendinde fiyatın altında basamaklanan destek,
düşüş trendinde fiyatın üstünde basamaklanan direnç çizer; kapanış çizgiyi kırınca
trend döner → **AL/SAT sinyali**.

- **Canlı sinyal**: Stratejiler sekmesinden sembole (örn. altın için `GC=F`) FTREND
  stratejisi eklenir; cron 1 saatlik mumlarla değerlendirir, sinyaller Telegram'a gider.
- **Backtest + optimizasyon**: `/api/ftrend` ucu, geçmiş veride (periyot × çarpan)
  ızgarasını tarar; verinin ilk %70'inde optimize eder, kalan %30'da doğrular
  (örneklem dışı test) ve işlem listesi + güncel trend durumunu döner.
  İşlem başına %0,05 masraf/kayma varsayılır (`fee` parametresiyle değiştirilebilir).

### Altın bekçisi (Telegram raporlu)

Zamanlayıcı **7/24** çalışır (altın Pzt-Cum ~24 saat işlem görür): her vuruşta
GC=F mumlarını çekip FTREND'i hesaplar. **Trend dönünce anında Telegram'a AL/SAT
sinyali**, ayrıca **6 saatte bir durum raporu** (fiyat, trend, çizgi seviyesi,
pencere performansı) gönderir. Sinyaller mum kapanışında kesinleşir; piyasa
kapalıyken sessizdir.

- `GET /api/goldwatch` — durum ve yapılandırma
- `PATCH /api/goldwatch` — `{enabled, trading, symbol, interval (15m|30m|1h), period, mult}`
- `POST /api/goldwatch/run` — manuel koşu (test için)
- `GET /api/goldwatch/trades` — sanal işlem defteri
- `POST /api/goldwatch/reset` — portföyü sıfırla (`{amount}` opsiyonel, varsayılan 1M ₺)

**Sanal TL portföyü:** 1.000.000 ₺ başlangıç. AL sinyalinde tüm nakit gram
altına döner (GC=F ons × USDTRY / 31,1035, yön başına %0,05 masraf), SAT
sinyalinde TL'ye geçer. Her işlem Telegram sinyal mesajında görünür; 6 saatlik
durum raporu portföy değeri, başlangıçtan getiri, gram-altın al-tut kıyası ve
kazanç oranını içerir. TL bazlı sonuç kur (USDTRY) hareketini de içerir —
Türkiye'den altın alan birinin gerçek deneyimiyle aynıdır.

Varsayılan **1h FTREND(2,3)**: 2,4 yıllık 1h verisinde örneklem dışı doğrulamayı
geçen kurulum. Aynı 60 günlük pencerede 15m tüm parametrelerde zarar ederken
(masraf + testere) 1h artıda kaldı — 15m'e geçmek isterseniz
`PATCH {"interval":"15m"}` yeter, ama veri 1h'ı destekliyor.

### Opsiyon simülasyonu (`lib/optionsim.ts`)

FTREND sinyalleriyle opsiyon stratejilerini Black-Scholes yaklaşımıyla simüle
eder (geçmiş opsiyon fiyatı verisi ücretsiz yok: IV = gerçekleşen oynaklık ×
1,15; prim başına yön başına %1,5 spread; vade < 7 günde roll). 2,4 yıllık GC=F
1h verisinde bulgular:

| Yapı (%10 prim tahsisi) | Tüm dönem | Örneklem dışı (son %30, yatay) |
|---|---|---|
| 0.5Δ sadece call, 30 gün | **+%106** (maxDD %29) | **−%6** |
| 0.8Δ sadece call | +%50 (maxDD %21) | −%4 |
| 0.5Δ call+put | +%0,4 (maxDD %56) | −%5 |
| Dayanakta FTREND (tam sermaye) | +%62 (maxDD %9,7) | **+%9,9** |

Sonuç: uzun opsiyon yalnızca güçlü trend dönemlerinde öder; yatay piyasada
theta + spread, dayanağın kendisinde çalışan stratejiyi bile zarara çevirir.
Call+put simetrisi boğa piyasasında put bacağı yüzünden çöker. Canlı opsiyon
emri entegrasyonu bu bulgular ışığında bilinçli olarak eklenmedi.

> ⚠️ Bu uygulama eğitim/simülasyon amaçlıdır; ürettiği sinyaller yatırım tavsiyesi değildir.
