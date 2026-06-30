import { useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, formatTL, layout } from '../theme';
import Reel, { TOTAL_SPIN_MS } from '../components/Reel';
import JackpotBar from '../components/JackpotBar';
import Paytable from '../components/Paytable';
import HoldAndSpin from '../components/HoldAndSpin';
import { evaluate, spinGrid, type Grid, type SymbolWin } from '../game/slot';

const BET_STEPS = [10, 20, 50, 100, 150]; // total bet in TL
const START_BALANCE = 5000;

function emptyHighlights(): Set<number>[] {
  return Array.from({ length: layout.reels }, () => new Set<number>());
}

export default function SlotScreen() {
  const [balance, setBalance] = useState(START_BALANCE);
  const [betIndex, setBetIndex] = useState(2); // 50 TL
  const [grid, setGrid] = useState<Grid>(() => spinGrid());
  const [spinId, setSpinId] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [wins, setWins] = useState<SymbolWin[]>([]);
  const [showHighlights, setShowHighlights] = useState(false);
  const [lastWin, setLastWin] = useState(0);
  const [showPaytable, setShowPaytable] = useState(false);
  const [bonus, setBonus] = useState<{ visible: boolean; hats: number }>({
    visible: false,
    hats: 0,
  });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const bet = BET_STEPS[betIndex];
  const canSpin = !spinning && !bonus.visible && balance >= bet;

  const highlightSets = useMemo(() => {
    const sets = emptyHighlights();
    if (showHighlights) {
      for (const w of wins) for (const [reel, row] of w.cells) sets[reel].add(row);
    }
    return sets;
  }, [wins, showHighlights]);

  function spin() {
    if (!canSpin) return;

    const nextGrid = spinGrid();
    const result = evaluate(nextGrid, bet);

    setBalance((b) => b - bet);
    setGrid(nextGrid);
    setWins(result.wins);
    setShowHighlights(false);
    setLastWin(0);
    setSpinning(true);
    setSpinId((id) => id + 1);

    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setSpinning(false);
      setShowHighlights(true);
      setLastWin(result.totalWin);
      if (result.totalWin > 0) setBalance((b) => b + result.totalWin);
      if (result.bonusTriggered) {
        setTimeout(() => setBonus({ visible: true, hats: result.scatterCount }), 700);
      }
    }, TOTAL_SPIN_MS + 80);
  }

  function onBonusFinish(amount: number) {
    setBalance((b) => b + amount);
    setLastWin((w) => w + amount);
    setBonus({ visible: false, hats: 0 });
  }

  function changeBet(dir: 1 | -1) {
    if (spinning) return;
    setBetIndex((i) => Math.min(BET_STEPS.length - 1, Math.max(0, i + dir)));
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.title}>HUFF N&apos; PUFF</Text>
        <Pressable onPress={() => setShowPaytable(true)} style={styles.infoBtn}>
          <Text style={styles.infoBtnText}>i</Text>
        </Pressable>
      </View>

      <JackpotBar bet={bet} />

      <View style={styles.machine}>
        <View style={styles.reels}>
          {grid.map((col, reel) => (
            <Reel
              key={reel}
              index={reel}
              result={col}
              spinId={spinId}
              highlightRows={highlightSets[reel]}
              showHighlights={showHighlights}
            />
          ))}
        </View>
        <Text style={styles.reelWays}>243 YOL İLE KAZANÇ</Text>
        <Text style={styles.trigger}>6+ ⛑️ BARET → HOLD &amp; RE-SPIN BONUSU</Text>
      </View>

      {/* HUD */}
      <View style={styles.hud}>
        <Hud label="CASH" value={formatTL(balance)} />
        <Hud label="BET" value={formatTL(bet)} />
        <Hud
          label="WIN"
          value={formatTL(showHighlights ? lastWin : 0)}
          highlight={showHighlights && lastWin > 0}
        />
      </View>

      <View style={styles.controls}>
        <View style={styles.betGroup}>
          <Text style={styles.betLabel}>BAHİS</Text>
          <View style={styles.betRow}>
            <RoundBtn label="−" onPress={() => changeBet(-1)} disabled={spinning} />
            <Text style={styles.betValue}>{bet}</Text>
            <RoundBtn label="+" onPress={() => changeBet(1)} disabled={spinning} />
          </View>
        </View>

        <Pressable
          onPress={spin}
          disabled={!canSpin}
          style={({ pressed }) => [
            styles.spin,
            !canSpin && styles.spinDisabled,
            pressed && canSpin && styles.spinPressed,
          ]}
        >
          <Text style={styles.spinText}>{spinning ? '...' : 'ÇEVİR'}</Text>
        </Pressable>
      </View>

      {balance < bet && !spinning ? (
        <Pressable onPress={() => setBalance((b) => b + 5000)} style={styles.topUp}>
          <Text style={styles.topUpText}>Bakiye yetersiz — +5.000 TL yükle</Text>
        </Pressable>
      ) : (
        <View style={styles.topUpPlaceholder} />
      )}

      <Paytable visible={showPaytable} onClose={() => setShowPaytable(false)} />
      <HoldAndSpin
        visible={bonus.visible}
        bet={bet}
        triggerCount={bonus.hats}
        onFinish={onBonusFinish}
      />
    </SafeAreaView>
  );
}

function Hud({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View style={styles.hudCell}>
      <Text style={styles.hudLabel}>{label}</Text>
      <Text style={[styles.hudValue, highlight && styles.hudWin]}>{value}</Text>
    </View>
  );
}

function RoundBtn({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.round,
        disabled && styles.roundDisabled,
        pressed && !disabled && styles.roundPressed,
      ]}
    >
      <Text style={styles.roundText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 14 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
    marginBottom: 8,
  },
  title: { color: colors.gold, fontSize: 26, fontWeight: '900', letterSpacing: 2 },
  infoBtn: {
    position: 'absolute',
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoBtnText: { color: colors.gold, fontSize: 17, fontWeight: '800', fontStyle: 'italic' },
  machine: { flex: 1, justifyContent: 'center' },
  reelWays: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'center',
    marginTop: 10,
    letterSpacing: 2,
  },
  reels: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.bgDeep,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderWidth: 2,
    borderColor: colors.panelBorder,
  },
  trigger: {
    color: colors.textDim,
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 10,
    letterSpacing: 0.5,
  },
  hud: {
    flexDirection: 'row',
    backgroundColor: colors.panel,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.panelBorder,
    paddingVertical: 8,
    marginBottom: 12,
  },
  hudCell: { flex: 1, alignItems: 'center' },
  hudLabel: { color: colors.primary, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  hudValue: { color: colors.text, fontSize: 15, fontWeight: '800', marginTop: 2 },
  hudWin: { color: colors.win },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  betGroup: { alignItems: 'flex-start' },
  betLabel: {
    color: colors.textDim,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 4,
  },
  betRow: { flexDirection: 'row', alignItems: 'center' },
  betValue: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
    minWidth: 52,
    textAlign: 'center',
  },
  round: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.panelBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundDisabled: { opacity: 0.4 },
  roundPressed: { backgroundColor: colors.primary },
  roundText: { color: colors.text, fontSize: 24, fontWeight: '800' },
  spin: {
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 5,
    borderColor: colors.goldDeep,
    shadowColor: colors.gold,
    shadowOpacity: 0.6,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  spinPressed: { transform: [{ scale: 0.94 }] },
  spinDisabled: { backgroundColor: '#5a4a2a', borderColor: '#3a2f1a' },
  spinText: { color: colors.bgDeep, fontSize: 22, fontWeight: '900', letterSpacing: 1 },
  topUp: {
    marginTop: 12,
    alignItems: 'center',
    paddingVertical: 10,
    backgroundColor: colors.danger,
    borderRadius: 12,
  },
  topUpText: { color: '#fff', fontWeight: '800' },
  topUpPlaceholder: { height: 42, marginTop: 12 },
});
