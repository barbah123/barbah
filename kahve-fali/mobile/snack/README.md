# Snack (telefonda hızlı önizleme)

`App.js` — tek dosyalık, ekstra kütüphane gerektirmeyen sürüm (auth + ayarlar +
foto/metin fal + geçmiş). Canlı backend'e (`kahve-fali-api.barbah.workers.dev`) bağlanır.

## Kalıcı link (barbah hesabında kayıtlı)

```
https://snack.expo.dev/@barbah/kahve-fali
```

Telefonda aç → **Expo Go** ile "My Device" üzerinden önizle. Snack hesaba kayıtlı;
`App.js` içeriği yayında gömülüdür. Kod değişince `publish.js` yeniden çalıştırılarak
güncellenir. Giriş ekranındaki sürüm etiketi (`v1.x.y`) en yeni kodun gelip gelmediğini gösterir.

### Test akışı
1. Linki telefonda Expo Go ile aç.
2. Kayıt ol / giriş yap.
3. **⚙️ Ayarlar** → kendi OpenAI API anahtarını gir (`sk-...`), istersen **Bağlantıyı Test Et**, **Kaydet**.
4. Ana ekran → 📷 fincan fotoğrafı veya ✍️ niyet → **🔮 Falıma Bak**.

### Yeniden yayınlama (kod değişince)
```
npm i snack-sdk undici            # bir kez
EXPO_TOKEN=<token> node publish.js # expo.dev → Account Settings → Access Tokens
```

## Alternatif: tek seferlik sourceUrl linki (hesapsız)
```
https://snack.expo.dev/?platform=mydevice&theme=dark&name=Kahve%20Fali&sourceUrl=https%3A%2F%2Fraw.githubusercontent.com%2Fbarbah123%2Fbarbah%2Fmain%2Fkahve-fali%2Fmobile%2Fsnack%2FApp.js
```

> Not: Tam uygulama `kahve-fali/mobile/` altında (SecureStore + react-navigation) yaşar;
> bu Snack yalnızca hızlı telefon testi içindir.
