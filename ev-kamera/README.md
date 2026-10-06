# 📷 Ev Kamerası (iPad)

Eski ya da boşta duran bir iPad'i **ön kamerasıyla** ev güvenlik kamerasına çeviren, sadece
kendi cihazına kurduğun bir uygulama. App Store'a gerekmez, hiçbir buluta görüntü gitmez:
görüntü doğrudan iPad'den senin tarayıcına akar.

Bu proje repodaki diğer uygulamalardan bağımsızdır (`ev-kamera/`).

## Özellikler

- 🎥 Ön kameradan canlı görüntü (720p, ~8 kare/sn, MJPEG). Ek uygulama gerekmez; her tarayıcıda açılır
- 📶 iPad'de çalışan dahili web sunucusu (port **8080**). Aynı Wi‑Fi'deki telefon veya bilgisayardan izlenir
- 🌍 Evin dışından erişim: **Tailscale** ile (port yönlendirme yok, uçtan uca şifreli)
- 🔐 Şifre koruması (HTTP Basic Auth, kullanıcı `admin`). İlk açılışta rastgele 12 karakterlik şifre üretilir.
  Art arda 10 hatalı denemede o IP 15 dakika kilitlenir
- 🚶 Hareket algılama: hareket anının fotoğrafı iPad'e kaydedilir (son 300 kayıt), web sayfasında listelenir
- 📲 İsteğe bağlı **Telegram** bildirimi: hareket fotoğrafı, "uygulama kapandı" ve "şarj azaldı" uyarıları
- 🌙 Ekran karartma: kamera çalışırken ekran tamamen kararır, dokununca geri gelir
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

## Kurulum

Uygulama bir **Swift Playgrounds uygulama paketi** (`EvKamera.swiftpm`). İki yoldan biriyle kurulur.

### Yol A: Mac yok, sadece iPad (Swift Playgrounds)

1. iPad'e App Store'dan ücretsiz **Swift Playgrounds** uygulamasını kur.
2. Bu repoyu iPad'de ZIP olarak indir (GitHub → Code → Download ZIP) ve **Dosyalar** uygulamasında aç.
3. `ev-kamera/EvKamera.swiftpm` klasörüne dokun. Swift Playgrounds'ta açılır.
4. ▶︎ **Çalıştır**'a bas. İlk açılışta **Kamera** ve **Yerel Ağ** izinlerine **İzin Ver** de.

> Bu yolda uygulama Playgrounds'un içinde çalışır; Playgrounds açık ve ön planda kalmalı.

### Yol B: Mac + Xcode ile iPad'e ayrı uygulama olarak kur (önerilen)

1. Mac'te Xcode 15+ ile `ev-kamera/EvKamera.swiftpm` klasörünü aç.
2. Sol üstte proje → **Signing & Capabilities** → **Team** olarak kendi Apple ID'ni seç
   (ücretsiz "Personal Team" yeterli).
3. iPad'i kabloyla bağla, hedef olarak iPad'i seç, ▶︎ Run.
4. iPad'de: **Ayarlar › Genel › VPN ve Cihaz Yönetimi** → geliştirici profiline **Güven**.

> Ücretsiz Apple ID ile imzalanan uygulama **7 gün** çalışır; sonra Xcode'dan tekrar Run etmen gerekir.
> Ücretli geliştirici hesabıyla (yıllık) bu süre 1 yıldır. Uygulama yalnızca senin cihazına kurulur.

## Kullanım

1. iPad'i **şarja tak**, ön kamera odayı görecek şekilde bir standa yerleştir.
2. Uygulamayı aç. İzleme otomatik başlar. Sağdaki panelde şunlar görünür:
   - **Wi‑Fi adresi**: ör. `http://192.168.1.23:8080`
   - **Kullanıcı adı**: `admin`, **Şifre**: göz ikonuna basınca görünür
3. Telefonda/bilgisayarda bu adresi tarayıcıda aç, kullanıcı adı ve şifreyi gir.
4. iPad'de **Ekranı karart**'a bas.

Web sayfasında canlı görüntü, pil durumu, izleyen sayısı ve hareket kayıtları (tıklayınca büyür) var.

> 💡 Modemde iPad'e **sabit IP** (DHCP rezervasyonu) verirsen adres hiç değişmez.

### Rehberli Erişim (uygulamaya kilitleme)

**Ayarlar › Erişilebilirlik › Rehberli Erişim**'i aç, bir kod belirle. Uygulama açıkken yan
(veya ana ekran) tuşuna 3 kez bas → **Başlat**. Artık kodu bilmeyen kimse uygulamadan çıkamaz.
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
