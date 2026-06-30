# Snack (telefonda hızlı önizleme)

`App.js` — tek dosyalık, kütüphane gerektirmeyen sürüm (auth + liste + detay/teklif).
Canlı backend'e (`pokemon-auction-api.barbah.workers.dev`) bağlanır.

## Kalıcı link (barbah hesabında kayıtlı)

```
https://snack.expo.dev/@barbah/pokemon-auction
```

Telefonda aç → Expo Go ile "My Device" üzerinden önizle. Snack hesaba kayıtlı
ve kodu GitHub raw'dan (`App.js`) çeker; güncelleme sonrası `publish.js` yeniden
çalıştırılarak tazelenir.

### Yeniden yayınlama (kod değişince)
```
node mobile/snack/publish.js   # EXPO_TOKEN env gerekir; kodu GitHub raw'dan alır
```

## Alternatif: tek seferlik sourceUrl linki (hesapsız)
```
https://snack.expo.dev/?platform=mydevice&theme=dark&name=Pokemon%20Auction&sourceUrl=https%3A%2F%2Fraw.githubusercontent.com%2Fbarbah123%2Fbarbah%2Fmain%2Fmobile%2Fsnack%2FApp.js
```

> Not: Bu sürüm token'ı bellekte tutar (yenileyince yeniden giriş gerekir) ve
> sadece hızlı test içindir. Tam uygulama `mobile/` altında (SecureStore +
> react-navigation) yaşar.
