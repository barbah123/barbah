# 📷 Ev Kamerası – Android

Android 8+ cihazları (tablet, telefon, stantlı dokunmatik ekran / "StanbyME" tipi ekranlar)
güvenlik kamerasına çeviren, **arka planda çalışan** uygulama. iPad sürümüyle aynı web
izleme sayfasını kullanır (`../README.md`).

## iPad sürümünden farkı: gerçekten arka planda çalışır

Android, "kamera türünde ön plan servisi" ile kameranın arka planda çalışmasına izin verir:

- ✅ Ekran kapalıyken (uyku modunda) çalışır
- ✅ Cihazda başka uygulama (YouTube, Netflix, tarayıcı) kullanılırken çalışır
- ✅ Cihaz yeniden açılınca kendiliğinden başlar
- ✅ Kamera başka bir uygulamaya geçerse (görüntülü arama vb.) serbest kalınca geri bağlanır
- ℹ️ Bildirim çubuğunda **"Ev Kamerası çalışıyor"** bildirimi ve ekranın köşesinde Android'in
  yeşil kamera noktası görünür. Bunları Android zorunlu tutar, gizlenemez.

## Kurulum

1. Cihazda tarayıcıyı (Chrome) aç, GitHub'a giriş yap ve şu adresi aç:
   **https://github.com/barbah123/barbah/releases/download/ev-kamera-android/EvKamera.apk**
2. İndirme bitince dosyaya dokun. Android "bilinmeyen uygulamalar" uyarısı verirse
   **Ayarlar** → **Bu kaynaktan izin ver** de, geri dön, **Yükle**.
   ("Play Protect" uyarısında **Yine de yükle** de. Uygulama mağaza dışı olduğu için uyarır.)
3. **Ev Kamerası**'nı aç → **Kamera** ve **Bildirim** izinlerine **İzin ver**.
4. Ayarlar ekranındaki iki düğmeye bas:
   - **Otomatik başlatma iznini ver** → listede Ev Kamerası → **İzin ver**
     (Android buna "Diğer uygulamaların üzerinde göster" der. Cihaz açılınca kameranın
     kendiliğinden başlaması için gerekli.)
   - **Pil kısıtlamasını kaldır** → **İzin ver** (Android'in servisi kapatmasını engeller.)
5. **Kameranın üstündeki kapağı aç** (fiziksel kaydırmalı kapak). Önizlemede görüntü gelmeli.

Güncelleme: aynı bağlantıdan yeni APK'yı indirip kur. Ayarlar ve kayıtlar silinmez.

## Kullanım

- Ayarlar ekranındaki **Wi‑Fi adresini** (ör. `http://192.168.1.40:8080`) telefonda/bilgisayarda
  aç. Kullanıcı adı `admin`, şifre ekranda ("Göster" düğmesi).
- **Uygulama kilidi** ile 4–8 haneli bir şifre belirlersen ayarlar ekranı (ve kamerayı durdurma)
  şifre ister. Yanlış girenin fotoğrafı çekilip Telegram'a gönderilir.
- **Kilitle ve arka plana al** ile ekrandan çık. Kamera arkada çalışmaya devam eder.
- Evin dışından izleme, Telegram bildirimleri, güvenlik notları: `../README.md` ile aynı.
  Tailscale'i bu cihaza da kurarsan ayarlar ekranında Tailscale adresi görünür.

## Sorun giderme

| Sorun | Çözüm |
|---|---|
| Önizleme siyah / "Kamera bulunamadı" | Kameranın fiziksel kapağını aç. Cihazı yeniden başlat |
| "Kamera başka bir uygulamada" | Görüntülü arama vb. bitince kendiliğinden döner |
| Görüntü yan / ters | **Görüntüyü 90° döndür**'e doğru olana kadar bas |
| Cihaz açılınca başlamadı | Otomatik başlatma izni verilmemiş olabilir: bildirime dokun veya uygulamayı bir kez aç |
| Bir süre sonra duruyor | **Pil kısıtlamasını kaldır**. Cihazın kendi "uygulama uyutma / RAM temizleme" ayarı varsa Ev Kamerası'nı muaf tut |
| Telefonda sayfa açılmıyor | Aynı Wi‑Fi'de mi? Cihazda bildirim duruyor mu? Adres değiştiyse modemden sabit IP ver |

## Derleme

Her değişiklikte `.github/workflows/ev-kamera-apk.yml` APK'yı GitHub'da derleyip yukarıdaki
sabit bağlantıya koyar. Yerelde: Android SDK + `gradle assembleRelease`.

APK, `keystore/evkamera.jks` ile imzalanır. Anahtar repoda durur ki her derleme aynı imzayla
çıksın ve güncellemeler eskisinin üstüne kurulabilsin. Bu kişisel, mağaza dışı kurulum içindir.

| Dosya | Görev |
|---|---|
| `CameraService.kt` | Arka plan (ön plan) servisi, bildirim, uyanık tutma, pil takibi |
| `CameraController.kt` | Camera2: ön/harici kamera, YUV→JPEG, hareket algılama, yeniden bağlanma |
| `WebServer.kt` | HTTP sunucusu, MJPEG yayını, Basic Auth, kaba kuvvet kilidi |
| `BootReceiver.kt` | Açılışta otomatik başlatma |
| `MainActivity.kt` | Ayarlar ekranı ve uygulama kilidi |
| `assets/index.html` | Tarayıcıdaki izleme sayfası |
