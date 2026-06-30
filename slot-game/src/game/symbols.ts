// Symbol catalogue for the "Lucky Pigs" construction-themed slot
// (modeled on the reference photo: pig-in-a-suit, hard hat, buzz saw,
// tape measure, royal cards, on a lucky-green clover field).
//
// `glyph` is the placeholder emoji shown until real artwork arrives. When the
// example art is ready, drop the files into ../../assets and add an
// `image: require('../../assets/<file>.png')` field to each symbol — SymbolCell
// renders `image` in preference to `glyph`, so swapping is one line per symbol.
//
// `weight` controls reel frequency (higher = more common). `pays` maps a
// match-count (3/4/5 reels, left to right) to a base multiplier. The game uses
// ways-pay, so the multiplier is further multiplied by the number of ways.
//
// `role`:
//   'normal'  — pays normally
//   'wild'    — the buzz saw; substitutes for any paying symbol (not scatter)
//   'scatter' — the hard hat; 3+ anywhere triggers the bonus wheel

import type { ImageSourcePropType } from 'react-native';

export type SymbolId =
  | 'boss' // pig in a suit (top symbol)
  | 'pig' // worker pig
  | 'saw' // buzz saw (high symbol)
  | 'tape' // tape measure
  | 'ace' // A
  | 'king' // K
  | 'queen' // Q
  | 'jack' // J
  | 'wolf' // Big Bad Wolf — WILD
  | 'hat'; // hard hat — BONUS trigger (6+ launches Hold &amp; Re-spin)

export type SymbolRole = 'normal' | 'wild' | 'scatter';

export interface SymbolDef {
  id: SymbolId;
  label: string;
  glyph: string;
  image?: ImageSourcePropType;
  weight: number;
  role: SymbolRole;
  pays: { 3: number; 4: number; 5: number };
}

export const SYMBOLS: Record<SymbolId, SymbolDef> = {
  boss: { id: 'boss', label: 'Patron Domuz', glyph: '🐷', weight: 10, role: 'normal', pays: { 3: 10, 4: 30, 5: 100 } },
  pig: { id: 'pig', label: 'İşçi Domuz', glyph: '🐽', weight: 14, role: 'normal', pays: { 3: 5, 4: 15, 5: 50 } },
  saw: { id: 'saw', label: 'Daire Testere', glyph: '🪚', weight: 16, role: 'normal', pays: { 3: 4, 4: 12, 5: 40 } },
  tape: { id: 'tape', label: 'Şerit Metre', glyph: '📏', weight: 18, role: 'normal', pays: { 3: 4, 4: 10, 5: 30 } },
  ace: { id: 'ace', label: 'As', glyph: '🅰️', weight: 20, role: 'normal', pays: { 3: 2, 4: 6, 5: 20 } },
  king: { id: 'king', label: 'Papaz', glyph: '🇰', weight: 22, role: 'normal', pays: { 3: 2, 4: 5, 5: 16 } },
  queen: { id: 'queen', label: 'Kız', glyph: '🇶', weight: 22, role: 'normal', pays: { 3: 1, 4: 4, 5: 12 } },
  jack: { id: 'jack', label: 'Vale', glyph: '🇯', weight: 24, role: 'normal', pays: { 3: 1, 4: 3, 5: 10 } },
  wolf: { id: 'wolf', label: 'Büyük Kötü Kurt (WILD)', glyph: '🐺', weight: 6, role: 'wild', pays: { 3: 0, 4: 0, 5: 0 } },
  hat: { id: 'hat', label: 'Baret (BONUS)', glyph: '⛑️', weight: 11, role: 'scatter', pays: { 3: 0, 4: 0, 5: 0 } },
};

export const SYMBOL_IDS = Object.keys(SYMBOLS) as SymbolId[];

export const WILD: SymbolId = 'wolf';
export const SCATTER: SymbolId = 'hat';

// Number of hard hats on a single spin needed to launch the Wheel Feature.
export const BONUS_TRIGGER = 3;

// Weighted pool used by every reel when picking random symbols.
const WEIGHTED_POOL: SymbolId[] = SYMBOL_IDS.flatMap((id) =>
  Array<SymbolId>(SYMBOLS[id].weight).fill(id),
);

export function randomSymbol(): SymbolId {
  return WEIGHTED_POOL[Math.floor(Math.random() * WEIGHTED_POOL.length)];
}
