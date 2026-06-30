// Hold & Re-spin ("Money Re-spin") bonus logic for Huff N' Puff.
//
// Trigger: 6+ hard hats. Hats lock onto the 5x3 grid (15 positions). Each hat
// holds a credit value or a jackpot token. Three re-spins; any new hat resets
// them to three. Filling all 15 positions builds the Mansion and reveals the
// Grand. When re-spins run out the Big Bad Wolf huffs & puffs to reveal totals.

import { TIER_BY_ID, type TierId } from './jackpots';

export const GRID_SIZE = 15; // 5 reels x 3 rows
export const START_RESPINS = 3;

export type PrizeKind = 'credit' | TierId;

export interface Prize {
  kind: PrizeKind;
  value: number; // resolved TL amount
}

// House ladder, gated by how many positions are filled.
export type HouseId = 'straw' | 'stick' | 'brick' | 'mansion';

export interface House {
  id: HouseId;
  label: string;
  glyph: string;
  minFilled: number;
}

export const HOUSES: House[] = [
  { id: 'straw', label: 'SAMAN', glyph: '🌾', minFilled: 0 },
  { id: 'stick', label: 'ÇUBUK', glyph: '🪵', minFilled: 6 },
  { id: 'brick', label: 'TUĞLA', glyph: '🧱', minFilled: 9 },
  { id: 'mansion', label: 'MALİKÂNE', glyph: '🏰', minFilled: 12 },
];

export function houseFor(filled: number): House {
  let current = HOUSES[0];
  for (const h of HOUSES) if (filled >= h.minFilled) current = h;
  return current;
}

// Credit values expressed as multiples of the total bet, weighted toward small.
const CREDIT_TABLE: { mult: number; weight: number }[] = [
  { mult: 1, weight: 30 },
  { mult: 2, weight: 24 },
  { mult: 3, weight: 18 },
  { mult: 5, weight: 12 },
  { mult: 8, weight: 8 },
  { mult: 10, weight: 5 },
  { mult: 15, weight: 2 },
  { mult: 25, weight: 1 },
];

function weightedCredit(bet: number): Prize {
  const total = CREDIT_TABLE.reduce((s, c) => s + c.weight, 0);
  let r = Math.random() * total;
  for (const c of CREDIT_TABLE) {
    r -= c.weight;
    if (r <= 0) return { kind: 'credit', value: c.mult * bet };
  }
  return { kind: 'credit', value: bet };
}

// Assign the prize sitting under a newly-locked hat. `filledAfter` is the number
// of filled positions once this hat is placed — it gates the higher tiers so
// Major/Grand only surface in better houses, matching the real game.
export function assignPrize(bet: number, filledAfter: number): Prize {
  // Board complete -> the Mansion always reveals the Grand.
  if (filledAfter >= GRID_SIZE) {
    return { kind: 'grand', value: TIER_BY_ID.grand.mult * bet };
  }

  const roll = Math.random();
  if (filledAfter >= TIER_BY_ID.major.minFilled && roll < 0.015) {
    return { kind: 'major', value: TIER_BY_ID.major.mult * bet };
  }
  if (roll < 0.04) return { kind: 'minor', value: TIER_BY_ID.minor.mult * bet };
  if (roll < 0.12) return { kind: 'mini', value: TIER_BY_ID.mini.mult * bet };
  return weightedCredit(bet);
}

// Probability that a given empty position lands a hat on a re-spin. Eases down
// as the board fills so completion stays rare and exciting.
export function hatChance(filled: number): number {
  const remaining = GRID_SIZE - filled;
  if (remaining <= 0) return 0;
  return 0.08 + 0.03 * (remaining / GRID_SIZE);
}
