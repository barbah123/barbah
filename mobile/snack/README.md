# Snack (telefonda hızlı önizleme)

`App.js` — tek dosyalık, kütüphane gerektirmeyen sürüm (auth + liste + detay/teklif).
Canlı backend'e (`pokemon-auction-api.barbah.workers.dev`) bağlanır.

## Tek sabit link (yapıştırmaya gerek yok)

Snack, `sourceUrl` ile bu dosyayı doğrudan GitHub'dan çeker. Aşağıdaki linki
telefonda aç → Expo Go ile "My Device" üzerinden önizle. Kod güncellenince
linki yeniden aç, en yeni sürüm gelir (GitHub/Snack önbelleği nedeniyle birkaç
dakika gecikebilir).

```
https://snack.expo.dev/?platform=mydevice&theme=dark&name=Pokemon%20Auction&sourceUrl=https%3A%2F%2Fraw.githubusercontent.com%2Fbarbah123%2Fbarbah%2Fmain%2Fmobile%2Fsnack%2FApp.js
```

> Not: Bu sürüm token'ı bellekte tutar (yenileyince yeniden giriş gerekir) ve
> sadece hızlı test içindir. Tam uygulama `mobile/` altında (SecureStore +
> react-navigation) yaşar.
