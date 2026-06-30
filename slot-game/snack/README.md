# Snack — Huff N' Puff (telefonda hızlı test)

`App.js` — **tek dosyalık**, kütüphane gerektirmeyen tam oyun (243 yön +
Hold & Re-spin bonusu + jackpotlar). Sadece `react` / `react-native`
çekirdeğini kullanır, backend'e bağlanmaz.

Bu sürüm `slot-game/` Expo projesinden **bağımsızdır** — diğer projelerle
(mobile, kahve-fali) karışmaz; ayrı klasör, ayrı uygulama.

## Telefonda açma (hesapsız, en hızlı)

1. Telefona **Expo Go** uygulamasını kur.
2. Aşağıdaki `sourceUrl` linkini telefonda aç → Snack açılır → **"My Device"**
   ile önizle. (Linki sohbet mesajında güncel commit SHA'sı ile paylaşıyorum;
   slug yerine SHA kullanmak slash içeren branch adıyla en güvenli yöntemdir.)

```
https://snack.expo.dev/?platform=mydevice&theme=dark&name=Huff%20N%20Puff&sourceUrl=<RAW_APP_JS_URL>
```

`<RAW_APP_JS_URL>` =
`https://raw.githubusercontent.com/barbah123/barbah/<COMMIT_SHA>/slot-game/snack/App.js`
(URL-encode edilmiş hali linke gömülür.)

## Kalıcı link (isteğe bağlı, Expo hesabı ile)

`publish.js`, `App.js` içeriğini barbah hesabındaki bir Snack'e kaydeder:

```
EXPO_TOKEN=<token> node slot-game/snack/publish.js
# Deps: npm i snack-sdk undici   (undici sadece HTTPS proxy arkasında gerekir)
```

Kaydedilince kalıcı bir `https://snack.expo.dev/@barbah/...` linki verir; kod
değişince yeniden çalıştırılır.

## Tam Expo projesi

Bonus animasyon/asset'lerin tamamı ve modüler kaynak `slot-game/` altında
(`npm install && npm start`). Snack sürümü yalnızca hızlı telefon önizlemesi
içindir; oyun mantığı iki yerde aynıdır.
