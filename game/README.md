# BADALAND 🦊🐰

**It Takes Two** tarzı, iki kişilik online co-op mobil oyun. Karakterler
sevimli hayvanlar (tilki, tavşan, baykuş, penguen...); hareket ve kontroller
**PK XD** tarzında: sanal joystick, zıplama, sürüklenerek dönen kamera ve
PK XD tarzı **kıyafet/stil marketi**.

Bu klasör iki parçadan oluşur:

- `game/` (bu klasör) → **Unity (C#)** oyun projesi
- `game/backend/` → **Cloudflare Workers** API (e-posta doğrulamalı hesap,
  market, bölüm ilerlemesi)

## Özellikler (v0.2)

- **Hesap sistemi:** e-posta + parola ile kayıt, **6 haneli e-posta doğrulama
  kodu**, giriş, misafir modu. Oturum 30 gün hatırlanır.
- **Ana menü akışı:** Giriş/Kayıt → Ana Menü → Bölümler → Birlikte Oyna.
- **12 hayvan karakter** (referans görsellerden): Tilki ve Tavşan ücretsiz,
  diğerleri (Baykuş, Penguen, Domuzcuk, Sincap, Kirpi, Kurt, Kartal, Flamingo,
  Aksolotl, Geyik) markette altınla satılır. Gerçek 3D modeller gelene kadar
  her hayvanın kulak/kuyruk/gaga/renk kombinasyonlu yer tutucu gövdesi var.
- **Market (PK XD tarzı):** karakterler + şapka/gözlük/sırt aksesuarları.
  Satın al, tak/çıkar — hepsi hesaba kaydedilir ve **oyunda iki oyuncu da
  birbirinin kıyafetini görür** (ağ üzerinden senkronlanır).
- **Online co-op (2 oyuncu):** Unity Relay ile oda kodu üzerinden eşleşme.
- **Bölüm 1 — Kapı Bulmacası:** iki basma plakası aynı anda basılınca kapı
  açılır; iki oyuncu **birlikte** hedef alanına ulaşınca bölüm tamamlanır,
  altın ödülü hesaba işlenir (ilk bitirme bonuslu). Bölüm 2-3 "yakında".
- **PK XD tarzı kontroller:** joystick + zıplama (çift zıplama) + dokunmatik
  kamera. Editörde WASD + Space + sağ fare ile test edilir.

## Kurulum — Unity

1. **Unity Hub** ile **Unity 6 LTS (6000.0.x)** kur (Android Build Support ile).
2. Unity Hub → **Add** → bu `game/` klasörünü aç (paketler otomatik iner).
3. Menüden **Badaland > Oyun Sahnesini Kur** çalıştır → `Assets/Game/Scenes/Main.unity` oluşur.
4. **Play** — giriş ekranı gelir. Backend deploy edilmediyse **Misafir Olarak
   Oyna** ile menüye geçebilirsin.

> Arayüz panelleri çalışma zamanında kodla kurulur (`MenuFlow` + `UiFactory`);
> menüde değişiklik yapınca sahneyi yeniden kurmak gerekmez.

## Kurulum — Backend (hesap + market)

```bash
cd game/backend
npm install
npx wrangler d1 create badaland-db        # cikan database_id'yi wrangler.toml'a yaz
npx wrangler d1 migrations apply badaland-db --remote
npx wrangler secret put JWT_SECRET        # uzun rastgele bir metin gir
npx wrangler secret put RESEND_API_KEY    # e-posta icin (resend.com) — opsiyonel
npx wrangler deploy                       # cikan URL'i not al
```

Sonra Unity'de `Assets/Scripts/Runtime/Api/ApiClient.cs` içindeki
`BaseUrl` değerini kendi `https://badaland-api.....workers.dev` adresinle değiştir.

> **E-posta gönderimi:** `RESEND_API_KEY` ayarlıysa doğrulama kodları gerçek
> e-posta ile gider. Ayarlı değilse kod API cevabında `dev_code` olarak döner
> ve oyun bunu otomatik doldurur — **sadece geliştirme için**; yayına çıkmadan
> önce mutlaka anahtarı ayarla.

## Online Oyun İçin (bir kere yapılır)

1. [cloud.unity.com](https://cloud.unity.com) → ücretsiz hesap + proje.
2. Unity'de **Edit > Project Settings > Services** → projeyi bağla.
3. Unity Cloud panelinden **Relay** servisini etkinleştir.

## İki Telefonda Test

1. **File > Build Settings** → Android → Switch Platform → Build → APK'yı iki telefona kur.
2. İkisi de kayıt olup giriş yapsın (veya misafir).
3. Birinci: **Bölümler → Bölüm 1 → ODA KUR** → kodu arkadaşına gönder.
4. İkinci: kodu girip **KATIL** → aynı dünyada buluşun, plakalara birlikte
   basın, kapının ardındaki altın alana **birlikte** ulaşın!

## Klasör Yapısı

```
game/
├── Assets/Scripts/
│   ├── Runtime/
│   │   ├── Api/         → ApiClient, Models, PlayerSession (hesap/oturum)
│   │   ├── Characters/  → CharacterCatalog, CosmeticCatalog, CharacterAppearance
│   │   ├── Player/      → PlayerController, PlayerAvatar, ClientNetworkTransform
│   │   ├── Camera/      → OrbitCamera
│   │   ├── Input/       → VirtualJoystick, JumpButton, MobileControls
│   │   ├── Net/         → ConnectionManager (Relay oda kur/katıl)
│   │   ├── UI/          → MenuFlow, AuthUI, HomeUI, LevelsUI, PlayUI,
│   │   │                  MarketUI, CharacterSelectUI, HudUI, UiFactory
│   │   └── Gameplay/    → CoopPressurePlate, CoopDoor, LevelGoal, LevelEvents
│   └── Editor/          → GameSceneBuilder (Badaland > Oyun Sahnesini Kur)
└── backend/             → Cloudflare Workers API (auth + market + progress)
    ├── migrations/      → D1 şeması
    └── src/routes/      → auth, me, market, progress
```

> Karakter/eşya ID'leri Unity (`CharacterCatalog`, `CosmeticCatalog`) ile
> backend (`src/catalog.ts`) arasında birebir aynı tutulmalıdır.

## Yol Haritası

- [ ] Bölüm 2 ve 3 tasarımları (yeni co-op mekanikleri: fırlatma, taşıma, kaldıraç)
- [ ] Gerçek 3D hayvan modelleri ve animasyonlar (It Takes Two kalite hedefi)
- [ ] Daha fazla kıyafet + emote sistemi
- [ ] Ses ve müzik
- [ ] Arkadaş listesi / davet sistemi
