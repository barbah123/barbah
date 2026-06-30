# ☕ Kahve Falı

Basit bir kahve falı uygulaması. Kullanıcı giriş yapar, **Ayarlar** bölümünden kendi
**OpenAI (ChatGPT) API anahtarını** bağlar ve fincan fotoğrafı yükleyerek ya da niyetini
yazarak yapay zeka destekli fal baktırır.

Bu proje, repodaki açık artırma uygulamasından **tamamen bağımsızdır**; kendi klasörlerinde
yaşar (`kahve-fali/backend` ve `kahve-fali/mobile`).

## Özellikler

- 🔐 E-posta + parola ile kayıt / giriş (JWT, PBKDF2 ile parola hash'leme)
- ⚙️ Kullanıcı kendi OpenAI API anahtarını bağlar — anahtar veritabanında **AES-GCM ile
  şifreli** saklanır ve istemciye asla geri gönderilmez (yalnızca son 4 hane gösterilir)
- 📷 Üç fotoğraf yükleyerek (iki fincan + bir tabak, GPT-4o vision) veya ✍️ metinle fal baktırma
- 📜 Geçmiş fallar (her okuma kaydedilir; fotoğraf kalıcı saklanmaz)
- 🔌 Bağlantı testi (anahtarın OpenAI'da geçerli olduğunu doğrular)

## Mimari

```
kahve-fali/
├─ backend/   Cloudflare Workers + D1 (SQLite) — REST API
└─ mobile/    Expo / React Native — istemci uygulaması
```

### Backend uç noktaları

| Method | Yol                    | Açıklama                                          |
|--------|------------------------|--------------------------------------------------|
| POST   | `/auth/register`       | Kayıt ol                                          |
| POST   | `/auth/login`          | Giriş yap                                         |
| GET    | `/me`                  | Profil                                            |
| GET    | `/me/settings`         | Anahtar bağlı mı + model (anahtar dönmez)         |
| PUT    | `/me/settings`         | API anahtarını ve/veya modeli kaydet              |
| POST   | `/me/settings/test`    | Verilen anahtarı OpenAI'a karşı doğrula           |
| POST   | `/fortune`             | Fal üret (`question` ve/veya `image_base64`)      |
| GET    | `/me/readings`         | Geçmiş fallar                                     |
| GET    | `/me/readings/:id`     | Tek bir fal                                       |

## Kurulum

### Backend (Cloudflare Workers)

```bash
cd kahve-fali/backend
npm install

# Yerel ortam sırları
cp .dev.vars.example .dev.vars   # JWT_SECRET ve ENCRYPTION_KEY değerlerini doldurun

# D1 veritabanı oluştur ve şemayı uygula
npx wrangler d1 create kahve-fali-db
#   -> dönen database_id değerini wrangler.toml içine yazın
npx wrangler d1 execute kahve-fali-db --local --file=./migrations/0001_init.sql

npm run dev        # http://localhost:8787
```

Üretim için sırları ayarlayın:

```bash
npx wrangler secret put JWT_SECRET
npx wrangler secret put ENCRYPTION_KEY
npx wrangler d1 execute kahve-fali-db --remote --file=./migrations/0001_init.sql
npm run deploy
```

> **ENCRYPTION_KEY** kullanıcıların API anahtarlarını şifreler. Değiştirir veya
> kaybederseniz kayıtlı anahtarlar çözülemez; kullanıcıların yeniden girmesi gerekir.

### Mobile (Expo)

```bash
cd kahve-fali/mobile
npm install

# Backend adresini ayarlayın (LAN IP veya dağıtılmış Worker)
cp .env.example .env   # EXPO_PUBLIC_API_URL değerini düzenleyin

npm start          # Expo Go ile QR okutun
```

## Kullanım

1. Uygulamada kayıt olun / giriş yapın.
2. **⚙️ Ayarlar** → OpenAI API anahtarınızı girin (`sk-...`), isterseniz **Bağlantıyı Test Et**,
   sonra **Kaydet**. Anahtarı [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
   adresinden alabilirsiniz. Adım adım rehber: [docs/OPENAI_API_ANAHTARI_REHBERI.md](docs/OPENAI_API_ANAHTARI_REHBERI.md)
   (aynı rehber uygulamada **Ayarlar → 📘 Adım adım rehber** düğmesindedir).
3. Ana ekranda **📷 Fotoğrafla** sekmesinden üç fotoğraf ekleyin (iki fincan + bir tabak)
   veya **✍️ Yazarak** sekmesinden niyetinizi yazın, **🔮 Falıma Bak**'a dokunun.
4. Geçmiş fallarınıza **📜** simgesinden ulaşın.

## Notlar

- Fal okumaları yapay zeka tarafından **eğlence amaçlı** üretilir.
- Fal istekleri her kullanıcının **kendi OpenAI hesabı/kotası** üzerinden ücretlendirilir.
- Fincan fotoğrafları yalnızca o anki istek için OpenAI'a iletilir; sunucuda **kalıcı olarak
  saklanmaz** (yalnızca üretilen fal metni kaydedilir).
