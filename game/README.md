# Barbah Co-op (Çalışma Adı)

**It Takes Two** tarzı, iki kişilik online co-op mobil oyun. Karakter
kontrolü ve hareket hissi **PK XD** tarzında: sanal joystick, zıplama
(+ çift zıplama), parmakla sürüklenerek dönen takip kamerası.

Bu klasör bir **Unity (C#)** projesidir — deponun geri kalanındaki
`mobile/` ve `backend/` uygulamalarından tamamen bağımsızdır.

## Şu An Neler Var (v0.1 — Temel)

- **PK XD tarzı kontrol:** sol altta joystick, sağ altta zıplama butonu,
  ekranın boş bir yerinden sürükleyince dönen kamera. Editörde test için
  WASD + Space + sağ fare tuşu da çalışır.
- **Online co-op (2 oyuncu):** "Oda Kur" → 6 haneli kod üretilir →
  arkadaş kodu girip "Katıl" der. Unity Relay kullanıldığı için modem/port
  ayarı gerekmez, iki telefon internet üzerinden buluşur.
- **Örnek co-op bulmaca:** iki basma plakası **aynı anda** basılıysa kapı
  açılır — tek kişi açamaz, It Takes Two ruhu.
- **Tek tıkla sahne kurulumu:** Unity menüsünden `Barbah > Oyun Sahnesini Kur`
  dersen oyuncu prefab'ı, test dünyası, ağ yöneticisi ve tüm UI otomatik kurulur.

## Kurulum

1. **Unity Hub** ile **Unity 6 LTS (6000.0.x)** sürümünü kur
   (Android Build Support modülüyle birlikte).
2. Unity Hub → **Add** → bu `game/` klasörünü seç ve aç.
   İlk açılışta paketler (Netcode for GameObjects, Relay, Authentication)
   otomatik iner.
3. Üst menüden **Barbah > Oyun Sahnesini Kur** çalıştır.
   `Assets/Game/Scenes/Main.unity` sahnesi oluşur ve açılır.
4. **Play**'e bas — menü gelir, editörde klavyeyle oynayabilirsin.

## Online Oyun İçin (bir kere yapılır)

Relay servisi Unity'nin ücretsiz eşleşme altyapısıdır (aylık kotası hobi
projeler için fazlasıyla yeter). Etkinleştirmek için:

1. [cloud.unity.com](https://cloud.unity.com) üzerinden ücretsiz hesap aç,
   bir proje oluştur.
2. Unity'de **Edit > Project Settings > Services** → hesabına giriş yap ve
   projeyi bağla.
3. Unity Cloud panelinden **Relay** servisini etkinleştir
   (Authentication anonim giriş otomatik çalışır).

## İki Telefonda Test

1. **File > Build Settings** → Android → Switch Platform → Build.
2. APK'yı iki telefona kur.
3. Birinci telefon: **ODA KUR** → ekranda çıkan kodu arkadaşına gönder.
4. İkinci telefon: kodu yaz → **KATIL**. İki karakter aynı dünyada buluşur.

Tek cihazda hızlı test: editörde Play (oda kur) + telefona kurulu
uygulamadan katıl da olur.

## Klasör Yapısı

```
game/
├── Assets/Scripts/
│   ├── Runtime/
│   │   ├── Player/     → PlayerController (hareket/zıplama), ClientNetworkTransform
│   │   ├── Camera/     → OrbitCamera (PK XD tarzı takip kamerası)
│   │   ├── Input/      → VirtualJoystick, JumpButton, MobileControls
│   │   ├── Net/        → ConnectionManager (Relay ile oda kur/katıl)
│   │   ├── UI/         → MainMenuUI (menü + HUD akışı)
│   │   └── Gameplay/   → CoopPressurePlate, CoopDoor (örnek co-op bulmaca)
│   └── Editor/         → GameSceneBuilder (tek tıkla sahne kurulumu)
├── Packages/manifest.json
└── ProjectSettings/
```

## Yol Haritası (detaylar geldikçe)

- [ ] Oyun teması, hikâye ve bölüm tasarımları
- [ ] Gerçek karakter modelleri ve animasyonlar (koşma/zıplama/emote)
- [ ] Daha fazla co-op mekaniği (birbirini fırlatma, kaldıraç, taşıma...)
- [ ] Bölüm ilerlemesi ve kayıt sistemi
- [ ] Ses ve müzik
