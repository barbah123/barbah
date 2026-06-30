# Huff N' Puff — Slot (test projesi)

Light & Wonder'ın **Huff N' Puff** slotunun kurallarını birebir uygulayan,
Expo + React Native (TypeScript) ile yazılmış bir prototip. Semboller şu an
emoji placeholder; gerçek görseller gelince tek noktadan değiştirilebilir.

## Oyun kuralları (referans alınan mekanik)

- **5×3 makara, 243 yön** (Reel Ways) ile kazanç. Soldan sağa ardışık
  makaralarda eşleşen semboller öder; kazanç = `çarpan × yön sayısı × bahis`.
- **Büyük Kötü Kurt = WILD** — baret hariç tüm sembollerin yerine geçer.
- **Baret (Hard Hat) = BONUS** — bir spinde **6+ baret** gelirse
  **Hold & Re-spin** bonusu açılır.
- **Hold & Re-spin bonusu:**
  - Tetikleyen baretler 5×3 (15 hücre) ızgarasına **kilitlenir**.
  - **3 respin** hakkı verilir; **yeni baret geldikçe respin 3'e sıfırlanır**.
  - Her baret bir **kredi değeri** ya da **jackpot jetonu** (MINI/MINOR/MAJOR/
    GRAND) taşır.
  - Izgara doldukça evler yükselir: **Saman → Çubuk → Tuğla → Malikâne**.
    MAJOR yalnızca daha iyi evlerde, **GRAND ise tüm 15 hücre dolunca
    (Malikâne)** çıkar.
  - Respinler bitince **Kurt gelir, üfler (huff & puff)**, evleri yıkıp toplam
    ödülü açar.
- **Dört kademeli jackpot** (toplam bahsin katı): MINI 100×, MINOR 500×,
  MAJOR 1.500×, GRAND 15.000×.

## Çalıştırma

```bash
cd slot-game
npm install
npm start        # Expo — ardından i (iOS) / a (Android) / w (web)
```

> Web için: `npx expo install react-dom react-native-web` gerekir.

## Gerçek görselleri bağlama

Placeholder emoji'leri gerçek sanat ile değiştirmek için:

1. Görselleri `slot-game/assets/` içine koy.
2. `src/game/symbols.ts` içinde ilgili sembole `image` alanı ekle:
   ```ts
   boss: { id: 'boss', /* ... */, image: require('../../assets/boss.png') },
   ```
   `SymbolCell`, `image` varsa onu, yoksa `glyph` emoji'sini render eder.

## Dosya düzeni

```
src/
  theme.ts                 renkler, ölçüler, TL biçimlendirme
  game/
    symbols.ts             sembol tanımları, ağırlıklar, ödemeler
    slot.ts                243 yön değerlendirmesi + bonus tetikleme
    jackpots.ts            dört kademeli jackpot merdiveni
    bonus.ts               Hold & Re-spin ödül/ev mantığı
  components/
    SymbolCell.tsx         tek hücre (emoji veya görsel)
    Reel.tsx               animasyonlu makara
    JackpotBar.tsx         jackpot merdiveni çubuğu
    HoldAndSpin.tsx        bonus ekranı (kilit + respin + kurt)
    Paytable.tsx           ödeme tablosu
  screens/
    SlotScreen.tsx         ana oyun ekranı / HUD
```
