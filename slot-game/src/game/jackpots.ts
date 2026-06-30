import { colors } from '../theme';

export type TierId = 'grand' | 'major' | 'minor' | 'mini';

export interface Tier {
  id: TierId;
  label: string;
  mult: number; // multiplier of total bet (Light & Wonder seed values)
  color: string;
  // Minimum number of filled bonus positions before this tier can appear as a
  // token. Mirrors "Major/Grand only found in better houses".
  minFilled: number;
}

// Four-tier progressive ladder. Seed multipliers follow the commonly cited
// Huff N' Puff values (Mini 100x, Minor 500x, Major 1,500x, Grand 15,000x).
export const TIERS: Tier[] = [
  { id: 'grand', label: 'GRAND', mult: 15000, color: colors.grand, minFilled: 15 },
  { id: 'major', label: 'MAJOR', mult: 1500, color: colors.major, minFilled: 12 },
  { id: 'minor', label: 'MINOR', mult: 500, color: colors.mini, minFilled: 6 },
  { id: 'mini', label: 'MINI', mult: 100, color: colors.minor, minFilled: 6 },
];

export const TIER_BY_ID: Record<TierId, Tier> = TIERS.reduce(
  (acc, t) => ({ ...acc, [t.id]: t }),
  {} as Record<TierId, Tier>,
);

export function tierValue(id: TierId, bet: number): number {
  return TIER_BY_ID[id].mult * bet;
}
