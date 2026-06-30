# Huff N' Puff — Slot (test projesi)

Light & Wonder'ın **Huff N' Puff** slotunun kurallarını birebir uygulayan,
Expo + React Native (TypeScript) ile yazılmış bir prototip. Semboller
`react-native-svg` ile çizilmiş **özgün vektör görsellerdir** (domuz patron,
işçi domuz, baret, daire testere, şerit metre, kurt, kart figürleri) — telif
içeren orijinal oyun çizimlerinin kopyası değildir, her boyutta net ölçeklenir.

## Oyun kuralları (referans alınan mekanik)

- **5×3 makara, 243 yön** (Reel Ways) ile kazanç. Soldan sağa ardışık
  makaralarda eşleşen semboller öder; kazanç = `çarpan × yön sayısı × bahis`.
- **Büyük Kötü Kurt = WILD** — baret hariç tüm sembollerin yerine geçer.
- **Baret (Hard Hat) = BONUS** — bir spinde **3+ baret** gelirse
  **Bonus Çarkı** döner (referans kabindeki "WHEEL FEATURE").
- **Bonus Çarkı:** GRAND / MAJOR / MINI / MINOR jackpot dilimleri, **SUPER BUZZ
  SAW** ve **KREDİ** (kredi ödülü), **UPGRADE** (tekrar çevirir) ve **BONUS**
  dilimi. BONUS dilimi **Hold & Re-spin** turunu açar.
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

## Görselleri değiştirme / PNG bağlama

Semboller `src/components/Sprites.tsx` içinde SVG olarak çizilidir; düzenlemek
için ilgili bileşeni (örn. `BossPig`, `HardHat`, `BuzzSaw`) güncelle.

PNG/JPG kullanmak istersen `SymbolCell`'i `Image` render edecek şekilde değiştir
ve görseli `slot-game/assets/` içine koy:
```tsx
// SymbolCell.tsx
<Image source={require('../../assets/boss.png')} style={{ width: size, height: size }} />
```

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
    Sprites.tsx            SVG vektör semboller
    SymbolCell.tsx         tek hücre (sprite render)
    Reel.tsx               animasyonlu makara
    JackpotBar.tsx         jackpot merdiveni çubuğu
    BonusWheel.tsx         bonus çarkı (SVG dilimli, dönen)
    HoldAndSpin.tsx        bonus ekranı (kilit + respin + kurt)
    Paytable.tsx           ödeme tablosu
  screens/
    SlotScreen.tsx         ana oyun ekranı / HUD
```
