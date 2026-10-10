# 📷 Ev Kamerası (iPad)

Eski ya da boşta duran bir iPad'i **ön kamerasıyla** ev güvenlik kamerasına çeviren, sadece
kendi cihazına kurduğun bir uygulama. App Store'a gerekmez, hiçbir buluta görüntü gitmez:
görüntü doğrudan iPad'den senin tarayıcına akar.

Bu proje repodaki diğer uygulamalardan bağımsızdır (`ev-kamera/`).

> 🤖 **Android cihaz için** (arka planda, ekran kapalıyken de çalışan sürüm): [`android/README.md`](android/README.md)

## Özellikler

- 🎥 Ön kameradan canlı görüntü (720p, ~8 kare/sn, MJPEG). Ek uygulama gerekmez; her tarayıcıda açılır
- 📶 iPad'de çalışan dahili web sunucusu (port **8080**). Aynı Wi‑Fi'deki telefon veya bilgisayardan izlenir
- 🌍 Evin dışından erişim: **Tailscale** ile (port yönlendirme yok, uçtan uca şifreli)
- 🔐 Şifre koruması (HTTP Basic Auth, kullanıcı `admin`). İlk açılışta rastgele 12 karakterlik şifre üretilir.
  Art arda 10 hatalı denemede o IP 15 dakika kilitlenir
- 🚶 Hareket algılama: hareket anının fotoğrafı iPad'e kaydedilir (son 300 kayıt), web sayfasında listelenir
- 📲 İsteğe bağlı **Telegram** bildirimi: hareket fotoğrafı, "uygulama kapandı" ve "şarj azaldı" uyarıları
- 🌙 Ekran karartma: kamera çalışırken ekran tamamen kararır
- 🔒 Sahte kilit ekranı: karanlık ekrana dokununca iPad kilit ekranına benzeyen bir ekran (saat, tarih,
  "açmak için yukarı kaydırın") çıkar. Uygulamaya dönmek için kendi belirlediğin 4–8 haneli şifre
  gerekir. Yanlış girenin fotoğrafı ön kameradan çekilir, kaydedilir ve Telegram'a gönderilir
- 🔄 Ekran otomatik kilitlenmez. Kamera kesilirse (ör. FaceTime) sonra kendiliğinden devam eder
- 🪟 iPadOS 16+ Split View / Slide Over / Stage Manager'da da kamera çalışmaya devam eder
  (cihaz destekliyorsa)

## ⚠️ "Arka planda çalışma" hakkında dürüst not

**iOS/iPadOS hiçbir uygulamanın arka planda veya ekran kilitliyken kamerayı kullanmasına izin vermez.**
Bu Apple'ın gizlilik kuralı ve bir uygulamanın aşabileceği bir şey değil. Ana ekrana dönüldüğünde
kamera durur. Pratikteki çözüm şu:

| İstediğin | Bu uygulamada nasıl |
|---|---|
| Ekran açık kalıp pil/göz yormasın | **Ekranı karart** butonu (parlaklık 0, siyah ekran; kamera ve sunucu çalışır) |
| iPad kilitlenmesin | Uygulama açıkken otomatik kilit devre dışı |
| Biri uygulamadan çıkamasın | **Rehberli Erişim** (aşağıda) |
| iPad'i başka işte de kullanmak | Split View / Slide Over'da yan yana açık bırak |
| Kamera durursa haberim olsun | Telegram'a "arka plana alındı" mesajı gelir; web sayfası "Kamera durdu" gösterir |

## Kurulum (Mac gerekmez)

Hedef: uygulamanın iPad'de **kendi simgesiyle, bağımsız** kurulu olması (Swift Playgrounds'un
açık durmasına gerek kalmadan). İki yol var:

| | Yol 1: TestFlight | Yol 2: SideStore |
|---|---|---|
| Bilgisayar | **Hiç gerekmez** (her şey iPad'de) | Kurulumda **bir kez** Windows/Linux bilgisayar (arkadaşınınki olur) |
| Ücret | Apple Developer Programı (yıllık ücretli) | Ücretsiz Apple ID |
| Yenileme | Her 90 günde bir Playgrounds'tan yeniden yükle | 7 günde bir, iPad'de tek dokunuş (otomatik de yapılabilir) |

### Yol 1: Swift Playgrounds → TestFlight (bilgisayarsız)

1. [developer.apple.com](https://developer.apple.com/programs/) üzerinden Apple Developer
   Programı'na katıl (iPad'deki "Apple Developer" uygulamasından da olur).
2. iPad'e **Swift Playgrounds** ve **TestFlight** uygulamalarını kur.
3. Repoyu iPad'de ZIP olarak indir (GitHub → Code → Download ZIP), Dosyalar'da aç,
   `ev-kamera/EvKamera.swiftpm`'e dokun. Playgrounds'ta açılır.
4. Playgrounds'ta **Uygulama Ayarları** → **Takım**'dan geliştirici hesabını seç.
5. **App Store Connect'e Yükle**'ye bas. Gerekirse paket kimliğini (`com.barbah.evkamera`)
   kendine özgü bir şeyle değiştir.
6. Safari'de [appstoreconnect.apple.com](https://appstoreconnect.apple.com) → uygulama →
   **TestFlight** → **Dahili Test** grubuna kendini ekle. Dahili testte Apple incelemesi yoktur
   ve uygulama sadece senin hesabındaki cihazlara kurulur.
7. iPad'de TestFlight'ı aç → **Ev Kamerası** → **Yükle**. Artık ana ekranda kendi simgesiyle durur.

### Yol 2: SideStore ile ücretsiz kurulum (hazır .ipa)

Repo, her değişiklikte uygulamayı GitHub'ın Mac sunucularında otomatik derleyip
`EvKamera.ipa` üretir (`.github/workflows/ev-kamera-ipa.yml`). Senin Mac'e ihtiyacın yok.

1. **SideStore**'u iPad'e bir kez kur: [docs.sidestore.io](https://docs.sidestore.io) adresindeki
   adımlarla (Windows/Linux bilgisayarda bir kerelik işlem). Ardından SideStore tamamen
   iPad'de çalışır.
2. iPad'de Safari ile GitHub'a giriş yap → repo → **Actions** → **Ev Kamerası .ipa** → en son
   yeşil çalışma → **Artifacts** bölümünden `EvKamera-ipa`'yı indir.
3. Dosyalar'da ZIP'e dokunup aç → `EvKamera.ipa` → **Paylaş** → **SideStore**
   (veya SideStore'da **My Apps** → **+** → dosyayı seç).
4. SideStore, uygulamayı ücretsiz Apple ID'nle imzalayıp kurar.
   **Ayarlar › Genel › VPN ve Cihaz Yönetimi**'nde geliştiriciye **Güven** de.
5. Her 7 günde bir SideStore'u açıp **Refresh All**'a bas, ya da Kestirmeler'le otomatikleştir.

> İlk açılışta **Kamera** ve **Yerel Ağ** izinlerine **İzin Ver** de.

### (Alternatif) Mac varsa

Xcode 15+ ile `EvKamera.swiftpm`'i aç → Signing'de kendi Apple ID'ni seç → iPad'e Run.

## Kullanım

1. iPad'i **şarja tak**, ön kamera odayı görecek şekilde bir standa yerleştir.
2. Uygulamayı aç. İzleme otomatik başlar. Sağdaki panelde şunlar görünür:
   - **Wi‑Fi adresi**: ör. `http://192.168.1.23:8080`
   - **Kullanıcı adı**: `admin`, **Şifre**: göz ikonuna basınca görünür
3. Telefonda/bilgisayarda bu adresi tarayıcıda aç, kullanıcı adı ve şifreyi gir.
4. iPad'de **Ekranı karart**'a bas.

Web sayfasında canlı görüntü, pil durumu, izleyen sayısı ve hareket kayıtları (tıklayınca büyür) var.

> 💡 Modemde iPad'e **sabit IP** (DHCP rezervasyonu) verirsen adres hiç değişmez.

### Kilit ekranı şifresi

Paneldeki **Kilit ekranı** bölümünden 4–8 haneli bir şifre belirle. Bundan sonra:

- **Ekranı karart ve kilitle** ile ekran simsiyah olur. Kamera ve yayın çalışmaya devam eder.
- Ekrana dokunulunca iPad kilit ekranına benzeyen ekran açılır. Yukarı kaydırınca (veya dokununca)
  şifre tuş takımı gelir. 20 saniye dokunulmazsa ekran tekrar kararır.
- Yanlış şifrede ön kameradan fotoğraf çekilip hareket kayıtlarına eklenir, Telegram ayarlıysa
  sana gönderilir. 5 yanlış denemede tuş takımı 1 dakika kilitlenir.
- Uygulama her açılışta karanlık ve kilitli başlar. Biri uygulamayı kapatıp açsa bile ayarlara ulaşamaz.
- Şifreyi unutursan: uygulamayı silip yeniden kurman gerekir (kayıtlar ve ayarlar da silinir).

> Bu ekran uygulamanın içindedir. Gerçek iPad kilidi değildir. Birinin ana ekran hareketiyle
> uygulamadan çıkmasını engellemek için aşağıdaki **Rehberli Erişim**'i de aç.

### Rehberli Erişim (uygulamaya kilitleme)

**Ayarlar › Erişilebilirlik › Rehberli Erişim**'i aç, bir kod belirle. Uygulama açıkken yan
(veya ana ekran) tuşuna 3 kez bas → **Seçenekler**'de **Uyut/Uyandır Tuşu**'nu kapat → **Başlat**.
Artık kodu bilmeyen kimse uygulamadan çıkamaz ve yan tuşla iPad'i kilitleyip kamerayı durduramaz.
Aynı menüde **Ekran Otomatik Kilidi: Hiçbir Zaman** seç.

## Evin dışından erişim (Tailscale)

Modemde **port yönlendirme yapma**. Kameranı tüm internete açar.
Bunun yerine ücretsiz [Tailscale](https://tailscale.com) kullan:

1. iPad'e ve telefonuna **Tailscale** uygulamasını kur, ikisinde de aynı hesapla giriş yap.
2. iPad'de Tailscale'i **açık** bırak (VPN olarak çalışır).
3. Ev Kamerası panelinde **"Tailscale (dışarıdan erişim)"** başlıklı `http://100.x.y.z:8080`
   adresi çıkar. Telefonda Tailscale açıkken bu adresi her yerden (4G/5G dahil) açabilirsin.

Tailscale bağlantısı WireGuard ile uçtan uca şifrelidir ve sadece senin cihazların erişebilir.

## Telegram bildirimi (isteğe bağlı)

1. Telegram'da **@BotFather** → `/newbot` → bir isim ver → verdiği **token**'ı kopyala.
2. Yeni botuna bir mesaj at (ör. "merhaba").
3. Tarayıcıda `https://api.telegram.org/bot<TOKEN>/getUpdates` aç; `"chat":{"id": 123456789` içindeki
   sayı senin **Chat ID**'n.
4. Uygulamada token ve Chat ID'yi gir → **Test fotoğrafı gönder**.

Artık hareket olunca fotoğraf, uygulama arka plana alınınca ve şarj %20'nin altına düşünce mesaj gelir.

## Güvenlik notları

- Şifreyi değiştirmek istersen panelden **Yeni rastgele şifre üret**'e bas; en az 6 karakter zorunlu.
- Bağlantı ev ağında düz HTTP'dir. Güvendiğin Wi‑Fi'de kullan. Dışarıdan erişim için mutlaka
  Tailscale kullan (o tünel şifreli).
- Hareket fotoğrafları yalnızca iPad'de (`Documents/Olaylar`) durur. Telegram'ı açarsan ayrıca
  kendi botuna gönderilir. Panelden tek dokunuşla silinebilir.
- Kayıt yapılan ortamdaki kişileri bilgilendir; başkalarının özel alanını (komşu, ortak alan)
  çekmeyecek şekilde konumlandır.

## Dosya yapısı

```
ev-kamera/EvKamera.swiftpm/
├── Package.swift        # Uygulama tanımı (izinler: kamera, yerel ağ)
├── EvKameraApp.swift    # Giriş noktası
├── AppModel.swift       # Kamera + sunucu + kayıtları bağlar, yaşam döngüsü, pil, karartma
├── ContentView.swift    # iPad arayüzü (önizleme + ayarlar)
├── LockScreenView.swift # Sahte kilit ekranı + şifre tuş takımı
├── CameraManager.swift  # AVFoundation ön kamera, JPEG kodlama, hareket algılama
├── WebServer.swift      # Network.framework HTTP sunucusu, MJPEG yayını, Basic Auth
├── WebPage.swift        # Tarayıcıda açılan izleme sayfası
├── EventStore.swift     # Hareket fotoğraflarının saklanması
├── Telegram.swift       # Bildirimler
├── FrameStore.swift     # Son kare (iş parçacıkları arası)
├── NetworkInfo.swift    # iPad'in IP adresleri
└── AppSettings.swift    # Ayarlar
```

## Sorun giderme

| Sorun | Çözüm |
|---|---|
| Tarayıcıda sayfa açılmıyor | iPad ve telefon aynı Wi‑Fi'de mi? iPad'de uygulama ön planda mı? **Ayarlar › Gizlilik › Yerel Ağ**'da izin açık mı? |
| "Kamera durdu" yazıyor | iPad'de uygulamayı tekrar öne getir. Başka uygulama kamerayı kullanıyor olabilir |
| Çok fazla yanlış alarm | Hassasiyeti düşür. Perde/ışık değişimi gören açılardan kaçın |
| Görüntü takılıyor | Wi‑Fi sinyali zayıf olabilir. Web sayfasında **Yeniden bağlan** |
| iPad ısınıyor | Doğrudan güneş almayan, hava alan bir yere koy. Kılıfı çıkar |
