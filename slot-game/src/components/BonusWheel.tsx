import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { G, Path, Circle, Text as SvgText } from 'react-native-svg';
import { colors, formatTL } from '../theme';
import { TIER_BY_ID } from '../game/jackpots';

export type WheelAward =
  | { type: 'jackpot' | 'credit'; amount: number; label: string; color: string }
  | { type: 'bonus'; amount: 0; label: string; color: string };

interface Seg {
  key: string;
  label: string;
  color: string;
  weight: number;
}

// Wheel face mirroring the reference cabinet (GRAND JACKPOT, SUPER BUZZ SAW,
// MINI / MINOR BONUS, UPGRADE, plus a BONUS slice that drops into Hold & Re-spin).
const SEGS: Seg[] = [
  { key: 'minor', label: 'MINOR', color: '#3ecf5b', weight: 16 },
  { key: 'super', label: 'SUPER', color: '#2f6fd0', weight: 10 },
  { key: 'mini', label: 'MINI', color: '#c45bff', weight: 12 },
  { key: 'upgrade', label: 'UPGRADE', color: '#ffcc33', weight: 14 },
  { key: 'major', label: 'MAJOR', color: '#ffd23b', weight: 5 },
  { key: 'bonus', label: 'BONUS', color: '#f4920a', weight: 12 },
  { key: 'grand', label: 'GRAND', color: '#ff3b3b', weight: 2 },
  { key: 'credit', label: 'KREDİ', color: '#2bb3a3', weight: 20 },
];

const N = SEGS.length;
const SEG = 360 / N;
const SIZE = 290;
const CX = SIZE / 2;
const CY = SIZE / 2;
const R = SIZE / 2 - 6;

function pt(thetaDeg: number, radius: number): [number, number] {
  const t = (thetaDeg * Math.PI) / 180;
  return [CX + radius * Math.sin(t), CY - radius * Math.cos(t)];
}

function sectorPath(i: number): string {
  const [x0, y0] = pt(i * SEG, R);
  const [x1, y1] = pt((i + 1) * SEG, R);
  return `M${CX},${CY} L${x0},${y0} A${R},${R} 0 0 1 ${x1},${y1} Z`;
}

function pickIndex(exclude: Set<string>): number {
  const pool = SEGS.map((s, i) => ({ i, w: exclude.has(s.key) ? 0 : s.weight }));
  const total = pool.reduce((a, p) => a + p.w, 0);
  let r = Math.random() * total;
  for (const p of pool) {
    r -= p.w;
    if (r <= 0) return p.i;
  }
  return pool.findIndex((p) => p.w > 0);
}

function resolve(seg: Seg, bet: number): WheelAward {
  switch (seg.key) {
    case 'grand':
    case 'major':
    case 'minor':
    case 'mini': {
      const t = TIER_BY_ID[seg.key as 'grand' | 'major' | 'minor' | 'mini'];
      return { type: 'jackpot', amount: t.mult * bet, label: t.label, color: seg.color };
    }
    case 'super':
      return { type: 'credit', amount: 50 * bet, label: 'SUPER BUZZ SAW', color: seg.color };
    case 'credit':
      return { type: 'credit', amount: 20 * bet, label: 'KREDİ', color: seg.color };
    default:
      return { type: 'bonus', amount: 0, label: 'BONUS', color: seg.color };
  }
}

interface Props {
  visible: boolean;
  bet: number;
  onCollect: (award: WheelAward) => void;
}

export default function BonusWheel({ visible, bet, onCollect }: Props) {
  const rotation = useRef(new Animated.Value(0)).current;
  const angle = useRef(0);
  const [spinning, setSpinning] = useState(false);
  const [award, setAward] = useState<WheelAward | null>(null);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!visible) return;
    rotation.setValue(0);
    angle.current = 0;
    setSpinning(false);
    setAward(null);
    setNote('');
    const t = setTimeout(() => spin(new Set()), 600);
    return () => clearTimeout(t);
  }, [visible]);

  function spin(exclude: Set<string>) {
    setSpinning(true);
    setNote('');
    const index = pickIndex(exclude);
    const segCenter = index * SEG + SEG / 2;
    // land segCenter at the top pointer; spin several extra turns
    const base = angle.current;
    const targetMod = (360 - (segCenter % 360)) % 360;
    const currentMod = ((base % 360) + 360) % 360;
    let delta = targetMod - currentMod;
    if (delta < 0) delta += 360;
    const target = base + 360 * 5 + delta;
    angle.current = target;

    Animated.timing(rotation, {
      toValue: target,
      duration: 3400,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      setSpinning(false);
      const seg = SEGS[index];
      if (seg.key === 'upgrade') {
        setNote('UPGRADE! TEKRAR ÇEVİRİYORUZ');
        setTimeout(() => spin(new Set(['upgrade', 'credit'])), 900);
      } else {
        setAward(resolve(seg, bet));
      }
    });
  }

  const spinDeg = rotation.interpolate({
    inputRange: [0, 360],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.backdrop}>
        <Text style={styles.header}>BONUS ÇARKI</Text>

        <View style={{ width: SIZE, height: SIZE + 16, alignItems: 'center', justifyContent: 'flex-end' }}>
          <View style={styles.pointer} />
          <Animated.View style={{ transform: [{ rotate: spinDeg }] }}>
            <Svg width={SIZE} height={SIZE}>
              {SEGS.map((s, i) => (
                <Path key={s.key} d={sectorPath(i)} fill={s.color} stroke="#06180a" strokeWidth={2} />
              ))}
              {SEGS.map((s, i) => {
                const mid = i * SEG + SEG / 2;
                return (
                  <G key={`t${s.key}`} transform={`rotate(${mid}, ${CX}, ${CY})`}>
                    <SvgText
                      x={CX}
                      y={CY - R * 0.6}
                      fill="#0c0c0c"
                      fontSize={13}
                      fontWeight="bold"
                      textAnchor="middle"
                    >
                      {s.label}
                    </SvgText>
                  </G>
                );
              })}
              <Circle cx={CX} cy={CY} r={26} fill={colors.gold} stroke={colors.goldDeep} strokeWidth={4} />
            </Svg>
          </Animated.View>
        </View>

        {note ? <Text style={styles.note}>{note}</Text> : null}

        {award ? (
          <View style={styles.resultBox}>
            <Text style={styles.resultLabel}>
              {award.type === 'bonus' ? 'KAZANDIN' : 'KAZANDIN'}
            </Text>
            <Text style={[styles.resultValue, { color: award.color }]}>
              {award.type === 'bonus' ? 'HOLD & RE-SPIN!' : `${award.label} • ${formatTL(award.amount)}`}
            </Text>
            <Pressable style={styles.collect} onPress={() => onCollect(award)}>
              <Text style={styles.collectText}>{award.type === 'bonus' ? 'DEVAM' : 'TOPLA'}</Text>
            </Pressable>
          </View>
        ) : (
          <Text style={styles.spinning}>{spinning ? 'DÖNÜYOR...' : ''}</Text>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(3,12,6,0.94)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  header: { color: colors.gold, fontSize: 28, fontWeight: '900', letterSpacing: 2, marginBottom: 14 },
  pointer: {
    position: 'absolute',
    top: 0,
    zIndex: 5,
    width: 0,
    height: 0,
    borderLeftWidth: 15,
    borderRightWidth: 15,
    borderTopWidth: 26,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: colors.gold,
  },
  note: { color: colors.gold, fontSize: 15, fontWeight: '800', marginTop: 14 },
  spinning: { color: colors.textDim, fontSize: 15, fontWeight: '700', marginTop: 18, height: 20 },
  resultBox: { alignItems: 'center', marginTop: 14 },
  resultLabel: { color: colors.text, fontSize: 14, fontWeight: '700' },
  resultValue: { fontSize: 22, fontWeight: '900', marginTop: 4 },
  collect: {
    marginTop: 16,
    backgroundColor: colors.gold,
    paddingHorizontal: 48,
    paddingVertical: 13,
    borderRadius: 28,
    borderWidth: 4,
    borderColor: colors.goldDeep,
  },
  collectText: { color: colors.bgDeep, fontSize: 18, fontWeight: '900', letterSpacing: 1 },
});
