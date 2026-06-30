# OpenAI (ChatGPT) API Anahtarı Nasıl Alınır ve Uygulamaya Nasıl Girilir?

Kahve Falı uygulaması, fal okumalarını **senin kendi OpenAI hesabın** üzerinden üretir.
Bunun için bir kez API anahtarı oluşturup uygulamadaki **Ayarlar** bölümüne yapıştırman yeterli.
Bu rehber adım adım anlatır. (Aynı adımlar uygulama içinde **Ayarlar → "📘 Adım adım rehber"**
düğmesinde de mevcuttur.)

---

## Adım adım

### 1. OpenAI hesabına giriş yap
[platform.openai.com](https://platform.openai.com) adresine git ve **ChatGPT hesabınla** giriş yap.
Hesabın yoksa ücretsiz kayıt ol — ChatGPT'ye giriş yaptığın bilgilerle aynıdır.

### 2. Ödeme yöntemi ekle (API kredisi)
Sol/üst menüden **Settings → Billing → "Add payment method"** ile bir kart ekle.

> ⚠️ **Önemli:** API kullanımı, **ChatGPT Plus aboneliğinden ayrıdır**. Plus üyeliğin olsa bile
> API ayrı, "kullandıkça öde" mantığıyla ücretlendirilir. Genellikle **5 $** kredi yüklemek
> uzun süre yeterlidir.

### 3. API anahtarları sayfasını aç
[platform.openai.com/api-keys](https://platform.openai.com/api-keys) adresine git
(sağ üst menüde **"API keys"**).

### 4. Yeni anahtar oluştur
**"Create new secret key"** düğmesine bas → anahtara bir isim ver (ör. `Kahve Falı`) → **"Create"**.

### 5. Anahtarı kopyala
Oluşan ve **`sk-`** ile başlayan uzun metni hemen kopyala.

> ⚠️ Bu anahtar **yalnızca bir kez** gösterilir. Pencereyi kapatınca tekrar göremezsin;
> kaybedersen yenisini oluşturman gerekir.

### 6. Uygulamaya gir
Kahve Falı uygulamasında:
1. **⚙️ Ayarlar** ekranını aç.
2. **"OpenAI API Anahtarı"** alanına anahtarı yapıştır.
3. **"Bağlantıyı Test Et"** → yeşil **✅ Geçerli** görmelisin.
4. **"Kaydet"**. Artık fal baktırabilirsin. ☕

---

## Sık sorulanlar

**ChatGPT Plus ödüyorum, yine de ödeme eklemem gerekir mi?**
Evet. Plus aboneliği yalnızca chat.openai.com içindir; API erişimi ayrı krediyle çalışır.

**Maliyeti ne kadar?**
Varsayılan model **gpt-4o-mini** çok ucuzdur — bir fal genellikle birkaç kuruş tutar.
Daha güçlü sonuç için Ayarlar'dan `gpt-4o` seçebilirsin (biraz daha pahalı).

**Anahtarım güvende mi?**
Uygulama anahtarını sunucuda **şifreli (AES-GCM)** saklar ve hiçbir zaman geri göstermez
(yalnızca son 4 hanesini). Yine de anahtarını kimseyle paylaşma. Sızdığını düşünürsen
[API keys](https://platform.openai.com/api-keys) sayfasından **"Revoke"** ile iptal et,
yenisini oluşturup tekrar kaydet.

**"Geçersiz" / 401 hatası alıyorum.**
Anahtarı eksik kopyalamış olabilirsin ya da hesabında kredi/ödeme yöntemi yoktur.
2. ve 5. adımları kontrol et.
