# OpenInsider küme alım botu

[OpenInsider](http://openinsider.com/latest-cluster-buys) küme alımlarını
(aynı hissede birden fazla içeriden kişinin açık piyasa alımı) çeker, 0-100
arası puanlar ve Telegram'a gönderir.

| Dosya | Görev |
|---|---|
| `scraper.py` | `fetch_cluster_buys()`, `fetch_purchase_history(ticker)`, `parse_table()` |
| `scoring.py` | `assess(record, history)` — puan, not (A-D), gerekçeler, rutin alıcılar |
| `bot.py` | Telegram botu (long polling) + `--summary` konsol raporu |
| `test_bot.py` | Çevrimdışı testler (canlı HTML'den alınmış fikstürler) |

## Kurulum

```bash
cd borsa/bot
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python test_bot.py
```

## Çalıştırma

```bash
python bot.py --summary                 # Telegram olmadan özet tablo

export TELEGRAM_BOT_TOKEN="123456:ABC..."   # @BotFather'dan
export TELEGRAM_CHAT_ID="123456789"         # isteğe bağlı: otomatik bildirim
python bot.py
```

Komutlar: `/kume [n]` en yüksek puanlı n küme alımı, `/kontrol TICKER`
hissenin son kümesindeki kişiler ve rutin olup olmadıkları.

`TELEGRAM_CHAT_ID` verilirse bot her `SCAN_MINUTES` (varsayılan 60) dakikada
bir tarar ve daha önce gönderilmemiş, puanı `MIN_SCORE` (varsayılan 40) ve
üzeri kayıtları gönderir. Gönderilenler `seen.json`'da tutulur.

## OpenInsider notları

- Küme sayfası ile screener farklı sütunlar döndürür; `parse_table` sütunları
  başlık adıyla eşler.
- Screener adresinde `fd=0` zorunlu: verilmezse yalnızca son günlerin
  dosyalamaları gelir ve rutin alım kontrolü için geçmiş boş kalır.
- Sonuç yoksa screener tablo döndürmez; `parse_table` boş liste verir.
- Küme sayfasındaki işlem tarihi kümenin **ilk** işlemidir; küme üyeleri
  dosyalama tarihine kadar aranır.
