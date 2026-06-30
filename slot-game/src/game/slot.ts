import { layout } from '../theme';
import {
  SYMBOLS,
  WILD,
  SCATTER,
  BONUS_TRIGGER,
  randomSymbol,
  type SymbolId,
} from './symbols';

const REELS = layout.reels; // 5
const ROWS = layout.rows; // 3

// A grid is indexed [reel][row]; each reel shows ROWS symbols.
export type Grid = SymbolId[][];

export interface SymbolWin {
  symbol: SymbolId;
  count: number; // consecutive reels from the left (3..5)
  ways: number; // number of winning ways
  amount: number;
  cells: [number, number][]; // [reel, row] cells to highlight
}

export interface SpinResult {
  grid: Grid;
  wins: SymbolWin[];
  totalWin: number;
  scatterCount: number;
  bonusTriggered: boolean;
}

export function spinGrid(): Grid {
  const grid: Grid = [];
  for (let r = 0; r < REELS; r++) {
    const col: SymbolId[] = [];
    for (let row = 0; row < ROWS; row++) col.push(randomSymbol());
    grid.push(col);
  }
  return grid;
}

function isMatch(symbol: SymbolId, cell: SymbolId): boolean {
  return cell === symbol || cell === WILD;
}

// Ways-pay evaluation (243 ways on a 5x3 grid). For each paying symbol we look
// for it (or a wild) on consecutive reels starting from the leftmost reel; the
// number of ways is the product of the per-reel match counts.
export function evaluate(grid: Grid, bet: number): SpinResult {
  const wins: SymbolWin[] = [];

  for (const def of Object.values(SYMBOLS)) {
    if (def.role !== 'normal') continue;
    const symbol = def.id;

    const perReelCells: [number, number][][] = [];
    for (let reel = 0; reel < REELS; reel++) {
      const hits: [number, number][] = [];
      for (let row = 0; row < ROWS; row++) {
        if (isMatch(symbol, grid[reel][row])) hits.push([reel, row]);
      }
      if (hits.length === 0) break;
      perReelCells.push(hits);
    }

    const count = perReelCells.length;
    if (count < 3) continue;

    const ways = perReelCells.reduce((acc, hits) => acc * hits.length, 1);
    const mult = def.pays[count as 3 | 4 | 5];
    if (mult <= 0) continue;

    const amount = Math.round(((mult * ways * bet) / 50) * 100) / 100;
    if (amount <= 0) continue;

    wins.push({
      symbol,
      count,
      ways,
      amount,
      cells: perReelCells.flat(),
    });
  }

  // Scatter (hard hat) — counted anywhere on the grid.
  let scatterCount = 0;
  for (let reel = 0; reel < REELS; reel++) {
    for (let row = 0; row < ROWS; row++) {
      if (grid[reel][row] === SCATTER) scatterCount++;
    }
  }

  const totalWin = wins.reduce((s, w) => s + w.amount, 0);
  wins.sort((a, b) => b.amount - a.amount);

  return {
    grid,
    wins,
    totalWin: Math.round(totalWin * 100) / 100,
    scatterCount,
    bonusTriggered: scatterCount >= BONUS_TRIGGER,
  };
}
