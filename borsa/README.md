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
│   ├── kullamagi.ts   → KK TARAYICI       (breakout / episodic pivot / parabolik short)
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
- Her 5 dakikada (hafta içi UTC 11-22): **Kullamägi kurulum tarayıcısı** — kırılım /
  episodic pivot / parabolik dönüş sinyalleri ve açılış öncesi izleme listesi.

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
- `GET/PATCH /api/kk` · `POST /api/kk/run` · `GET /api/kk/analyze?symbol=` — Kullamägi tarayıcısı
- `GET /api/ftrend?symbol=GC=F&interval=1h&range=730d&mode=long` — FTREND optimizasyon + backtest

## Kullamägi kurulum tarayıcısı (KK)

Kristjan Kullamägi'nin ("Qullamaggie") üç kurulumunu likit ABD hisselerinde arar
ve bulduğunu **Telegram'a giriş/stop/hedef seviyeleriyle** yollar. Kod:
`backend/src/lib/kullamagi.ts`, arayüz: **📈 KK** sekmesi.

### 1. Breakout — sağlam konsolidasyondan çıkış

Önce büyük bir hareket (1 ayda ≥ %20 / 3 ayda ≥ %30 / 6 ayda ≥ %60), sonra
**sıkı bir baz**: 3-60 günlük konsolidasyon, derinlik en fazla 2,5 × ADR
(tavan %25), fiyat pivotun 1,5 ADR'sinden (en çok %12) yakınında ve referans
ortalamanın üstünde tutunuyor (kısa bayrak 10 EMA, orta 20 EMA, uzun baz 50 SMA).

Sıkılık ve hacim kuruması baz uzunluğuna göre farklı ölçülür — kısa bayrakta
"yarı-yarıya" kıyas 2 barı 1 bara bölmek demektir, gürültüdür:

| | Kısa bayrak (≤ 5 gün) | Uzun baz (> 5 gün) |
|---|---|---|
| Sıkılık | son 3 günün menzili ≤ 2,2 × ADR | ikinci yarı / ilk yarı menzili ≤ 1,05 |
| Hacim | baz hacmi / yükseliş bacağı hacmi ≤ 1,05 | ikinci yarı / ilk yarı hacmi ≤ 1,05 |

Tabloda ve mesajlarda görünen "sıkılık"/"hacim" değerleri o baz için **uygulanan**
ölçüdür (ikisinde de küçük = sıkı/sakin).

Tetik: **konsolidasyon tepesinin (pivot) kırılışı** — ve kırılış hacimle gelmeli
(saat eşleşmeli göreli hacim ≥ 1.5x). Pivotun bir ADR'sinden fazla uzaklaşmış
fiyat kovalanmaz (üstünden gap'leyip kaçan hisse sinyal üretmez). Stop KK'nin
sırasıyla: **günün düşüğü**, olmazsa 10/20 EMA / önceki gün düşüğü / baz dibinden
girişe en yakın olanı — 0,5 ADR'den yakın (gürültü) ve 2,5 ADR'den uzak (kötü
risk/ödül) stop alınmaz. Hedef: 3-5 günde 2-3 ADR → pozisyonun 1/3-1/2'sini sat,
kalanı ortalamayla trail et.

### 2. Episodic pivot — beklenmedik katalizör + olağanüstü hacim

Aylardır uyuyan hisse (önceki 3 ay ≤ %40) bir haberle **≥ %8 gap** açar, gap'i
gün boyu korur, hacmi normalin **≥ 3 katı** ve gün içinde ≥ $5M döner. Katalizör
haber akışından etiketlenir (bulunamazsa sinyal yine gider, "katalizör görünmüyor"
notuyla). Giriş: **açılış aralığının (ilk 5 dk) tepesi**, stop: aralığın dibi.
Fiyat giriş bölgesinin bir ADR üstündeyse mesaj "kovalama" uyarısı taşır.

### 3. Parabolik short — aşırı hareket sonrası dönüş

3 günde ≥ %35 / 5 günde ≥ %60 / 10 günde ≥ %100 yükselmiş ve **20 EMA'dan ≥ %30
uzaklaşmış** hisseler izlemeye alınır. Sinyal ancak **dönüş teyit olunca** üretilir:
önceki günün düşüğü kırılır ve gün kırmızıdır (yükselirken asla short'lanmaz).
Stop bugünün/dünün tepesinden **girişe yakın olanı**, hedef 10/20 EMA bölgesi.
Tetiğin bir ADR altına düşülmüşse "geç kalındı" sayılır ve sinyal üretilmez.
Ayrıca short'ta **risk tavanı** vardır (2,5 × ADR, en çok %30): stop ancak tepenin
üstünde olabildiği için, tavanı aşan aday uydurma stop'la sinyale çevrilmez —
atlanır. Bu kapı `force` ile de atlanmaz.

### Nasıl çalışır (bütçe mimarisi)

Cloudflare Worker istek başına ~50 alt-istek verir; kurulum taraması ise sembol
başına bir yıllık günlük mum ister. Bu yüzden iş ikiye bölünür:

1. **Derin tarama (yavaş, günlük)** — her koşuda `refresh_batch` kadar sembol
   (varsayılan 10) günlük mumlarla analiz edilir ve `kk_watch` tablosuna
   pivot/tetik seviyeleriyle yazılır. Sıra "en uzun süredir bakılmayan" sembole
   göre döner; evren likidite sırasına göre ilk 400 hisse + sıcak sembol hafızası.
2. **Tetik (hızlı, canlı)** — her koşuda tüm piyasa **tek snapshot** çağrısıyla
   alınır ve saklanan seviyelerle kıyaslanır. Yalnızca tetiklenen avuç dolusu aday
   için gün içi hacim / açılış aralığı / haber çekilir.

Ek olarak her sabah **08:00-09:25 NY** arasında günün **izleme listesi** gönderilir:
kırılım adayları pivot ve stop bölgeleriyle, parabolik izlemedekiler tetik
seviyeleriyle. Seans ve yaz saati kapıları New York saatine göre hesaplanır.

Soğuma (aynı sembol+kurulum): breakout 3 gün, episodic pivot 5 gün, parabolik 2 gün.
Mesajlarda pozisyon boyutu önerisi de var: %0,5 hesap riski ÷ stop mesafesi.

- `GET /api/kk` — yapılandırma + izlenen kurulumlar + son sinyaller
- `PATCH /api/kk` — `{enabled, min_price, min_dollar_vol, min_gap_pct, refresh_batch, universe_max}`
- `POST /api/kk/run` — manuel koşu (`?force=1` seans/veri kapılarını atlar,
  `?notify=0` Telegram'sız, `?batch=N` derin tarama adedi)
- `GET /api/kk/analyze?symbol=NVDA` — tek sembol tanısı: kurulum neden var/yok

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
- `PATCH /api/goldwatch` — `{enabled, symbol, interval (15m|30m|1h), period, mult}`
- `POST /api/goldwatch/run` — manuel koşu (test için)

Varsayılan **1h FTREND(2,3)**: 2,4 yıllık 1h verisinde örneklem dışı doğrulamayı
geçen kurulum. Aynı 60 günlük pencerede 15m tüm parametrelerde zarar ederken
(masraf + testere) 1h artıda kaldı — 15m'e geçmek isterseniz
`PATCH {"interval":"15m"}` yeter, ama veri 1h'ı destekliyor.

> ⚠️ Bu uygulama eğitim/simülasyon amaçlıdır; ürettiği sinyaller yatırım tavsiyesi değildir.
