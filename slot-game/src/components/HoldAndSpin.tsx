import { useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors, formatTL } from '../theme';
import { TIER_BY_ID, type TierId } from '../game/jackpots';
import {
  GRID_SIZE,
  HOUSES,
  START_RESPINS,
  assignPrize,
  houseFor,
  hatChance,
  type Prize,
} from '../game/bonus';
import { layout } from '../theme';
import { Sprite } from './Sprites';

type Phase = 'respin' | 'wolf' | 'done';

interface Game {
  prizes: (Prize | null)[];
  respinsLeft: number;
  filled: number;
  total: number;
  phase: Phase;
  lastNew: number[];
}

interface Props {
  visible: boolean;
  bet: number;
  triggerCount: number; // hats that triggered the bonus (>= 6)
  onFinish: (amount: number) => void;
}

function emptyGame(): Game {
  return {
    prizes: Array<Prize | null>(GRID_SIZE).fill(null),
    respinsLeft: START_RESPINS,
    filled: 0,
    total: 0,
    phase: 'respin',
    lastNew: [],
  };
}

function shuffledIndices(): number[] {
  const a = Array.from({ length: GRID_SIZE }, (_, i) => i);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function sumPrizes(prizes: (Prize | null)[]): number {
  return prizes.reduce((s, p) => s + (p ? p.value : 0), 0);
}

function compact(n: number): string {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export default function HoldAndSpin({ visible, bet, triggerCount, onFinish }: Props) {
  const gRef = useRef<Game>(emptyGame());
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const startedRef = useRef(false);
  const [, setVersion] = useState(0);

  const bump = () => setVersion((v) => v + 1);

  function clearTimers() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }
  function schedule(fn: () => void, ms: number) {
    timers.current.push(setTimeout(fn, ms));
  }

  // --- lifecycle driven by `visible` ---
  if (visible && !startedRef.current) {
    startedRef.current = true;
    const g = emptyGame();
    const cells = shuffledIndices().slice(0, Math.min(triggerCount, GRID_SIZE));
    for (const idx of cells) {
      g.filled += 1;
      g.prizes[idx] = assignPrize(bet, g.filled);
    }
    g.lastNew = cells;
    g.total = sumPrizes(g.prizes);
    gRef.current = g;
    schedule(runStep, 1200);
  }
  if (!visible && startedRef.current) {
    startedRef.current = false;
    clearTimers();
  }

  function runStep() {
    const g = gRef.current;
    if (g.phase !== 'respin') return;

    const newIdx: number[] = [];
    for (let i = 0; i < GRID_SIZE; i++) {
      if (g.prizes[i]) continue;
      if (Math.random() < hatChance(g.filled + newIdx.length)) newIdx.push(i);
    }
    for (const i of newIdx) {
      g.filled += 1;
      g.prizes[i] = assignPrize(bet, g.filled);
    }
    g.lastNew = newIdx;
    g.respinsLeft = newIdx.length > 0 ? START_RESPINS : g.respinsLeft - 1;
    g.total = sumPrizes(g.prizes);
    bump();

    if (g.filled >= GRID_SIZE || g.respinsLeft <= 0) {
      schedule(toWolf, 1100);
    } else {
      schedule(runStep, 950);
    }
  }

  function toWolf() {
    const g = gRef.current;
    g.phase = 'wolf';
    g.lastNew = [];
    bump();
    schedule(() => {
      g.phase = 'done';
      bump();
    }, 1900);
  }

  const g = gRef.current;
  const house = houseFor(g.filled);

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.backdrop}>
        <Text style={styles.header}>HOLD &amp; RE-SPIN</Text>

        {/* House ladder */}
        <View style={styles.houses}>
          {HOUSES.map((h) => {
            const active = h.id === house.id;
            const reached = g.filled >= h.minFilled;
            return (
              <View
                key={h.id}
                style={[styles.house, active && styles.houseActive, !reached && styles.houseDim]}
              >
                <Text style={styles.houseGlyph}>{h.glyph}</Text>
                <Text style={[styles.houseLabel, active && styles.houseLabelActive]}>
                  {h.label}
                </Text>
              </View>
            );
          })}
        </View>

        {/* Grid */}
        <View style={styles.grid}>
          {Array.from({ length: layout.rows }, (_, row) => (
            <View key={row} style={styles.gridRow}>
              {Array.from({ length: layout.reels }, (_, reel) => {
                const idx = reel * layout.rows + row;
                const prize = g.prizes[idx];
                const isNew = g.lastNew.includes(idx);
                return (
                  <BonusCell key={idx} prize={prize} isNew={isNew} />
                );
              })}
            </View>
          ))}
        </View>

        {/* Status */}
        {g.phase === 'respin' ? (
          <View style={styles.statusRow}>
            <Status label="RESPIN" value={`${g.respinsLeft}`} />
            <Status label="DOLU" value={`${g.filled}/${GRID_SIZE}`} />
            <Status label="TOPLAM" value={formatTL(g.total)} wide />
          </View>
        ) : g.phase === 'wolf' ? (
          <View style={styles.wolfBox}>
            <Text style={styles.wolfGlyph}>🐺💨</Text>
            <Text style={styles.wolfText}>KURT ÜFLÜYOR — EVLERİ YIKIYOR!</Text>
          </View>
        ) : (
          <View style={styles.doneBox}>
            <Text style={styles.doneLabel}>TOPLAM KAZANÇ</Text>
            <Text style={styles.doneValue}>{formatTL(g.total)}</Text>
            <Pressable style={styles.collect} onPress={() => onFinish(g.total)}>
              <Text style={styles.collectText}>TOPLA</Text>
            </Pressable>
          </View>
        )}
      </View>
    </Modal>
  );
}

function BonusCell({ prize, isNew }: { prize: Prize | null; isNew: boolean }) {
  if (!prize) {
    return (
      <View style={[styles.cell, styles.cellEmpty]}>
        <Text style={styles.cellEmptyGlyph}>🧱</Text>
      </View>
    );
  }
  const isTier = prize.kind !== 'credit';
  const tier = isTier ? TIER_BY_ID[prize.kind as TierId] : null;
  return (
    <View
      style={[
        styles.cell,
        styles.cellFilled,
        isNew && styles.cellNew,
        tier && { borderColor: tier.color },
      ]}
    >
      <Sprite symbol="hat" size={22} />
      {tier ? (
        <Text style={[styles.cellTier, { color: tier.color }]}>{tier.label}</Text>
      ) : (
        <Text style={styles.cellValue}>{compact(prize.value)}</Text>
      )}
    </View>
  );
}

function Status({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <View style={[styles.status, wide && { flex: 1.4 }]}>
      <Text style={styles.statusLabel}>{label}</Text>
      <Text style={styles.statusValue}>{value}</Text>
    </View>
  );
}

const CELL = 56;

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(3,12,6,0.94)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  header: {
    color: colors.gold,
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: 1.5,
    marginBottom: 12,
  },
  houses: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  house: {
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.panelBorder,
    backgroundColor: colors.panel,
    minWidth: 64,
  },
  houseActive: { borderColor: colors.gold, backgroundColor: '#1c4a26' },
  houseDim: { opacity: 0.4 },
  houseGlyph: { fontSize: 20 },
  houseLabel: { color: colors.textDim, fontSize: 10, fontWeight: '800', marginTop: 2 },
  houseLabelActive: { color: colors.gold },
  grid: {
    backgroundColor: colors.bgDeep,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.panelBorder,
    padding: 8,
  },
  gridRow: { flexDirection: 'row' },
  cell: {
    width: CELL,
    height: CELL,
    margin: 3,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  cellEmpty: { backgroundColor: colors.reelCell, borderColor: 'transparent' },
  cellEmptyGlyph: { fontSize: 22, opacity: 0.25 },
  cellFilled: { backgroundColor: '#2a1c08', borderColor: colors.gold },
  cellNew: { backgroundColor: '#4a3410' },
  cellHat: { fontSize: 20 },
  cellValue: { color: colors.text, fontSize: 12, fontWeight: '800', marginTop: 1 },
  cellTier: { fontSize: 10, fontWeight: '900', marginTop: 1 },
  statusRow: { flexDirection: 'row', gap: 8, marginTop: 16, alignSelf: 'stretch' },
  status: {
    flex: 1,
    backgroundColor: colors.panel,
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.panelBorder,
  },
  statusLabel: { color: colors.textDim, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  statusValue: { color: colors.text, fontSize: 15, fontWeight: '900', marginTop: 2 },
  wolfBox: { alignItems: 'center', marginTop: 22 },
  wolfGlyph: { fontSize: 44 },
  wolfText: { color: colors.gold, fontSize: 15, fontWeight: '800', marginTop: 8 },
  doneBox: { alignItems: 'center', marginTop: 20 },
  doneLabel: { color: colors.textDim, fontSize: 13, fontWeight: '700', letterSpacing: 1 },
  doneValue: { color: colors.win, fontSize: 30, fontWeight: '900', marginTop: 4 },
  collect: {
    marginTop: 18,
    backgroundColor: colors.gold,
    paddingHorizontal: 50,
    paddingVertical: 13,
    borderRadius: 28,
    borderWidth: 4,
    borderColor: colors.goldDeep,
  },
  collectText: { color: colors.bgDeep, fontSize: 18, fontWeight: '900', letterSpacing: 1 },
});
