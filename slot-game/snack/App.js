// Huff N' Puff — tek dosyalık Snack sürümü (telefonda Expo Go ile test için).
// Vektör (SVG) semboller + Bonus Çarkı + Hold & Re-spin. Tek harici kütüphane:
// react-native-svg (Snack otomatik yükler).
//
// Kurallar:
//  - 5x3, 243 yön. Kurt = WILD, Baret = bonus.
//  - 3+ baret -> Bonus Çarkı döner (GRAND/MAJOR/MINI/MINOR/SUPER/UPGRADE/BONUS).
//  - "BONUS" dilimi -> Hold & Re-spin (baretler kilitlenir, 3 respin, evler
//    Saman->Çubuk->Tuğla->Malikâne, sonunda Kurt üfler).

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, {
  Circle,
  Ellipse,
  G,
  Path,
  Polygon,
  Rect,
  Text as SvgText,
} from 'react-native-svg';

/* ----------------------------- theme & layout ---------------------------- */

const C = {
  bg: '#0d2a12', bgDeep: '#06180a', panel: '#123a1c', panelBorder: '#3ecf5b',
  reelBg: '#0a210f', reelCell: '#0f2e17', gold: '#ffcc33', goldDeep: '#e6a817',
  text: '#f3ffe9', textDim: '#8fc79a', win: '#ffd94a', danger: '#ff5c7a',
  primary: '#3ecf5b', grand: '#ff3b3b', major: '#ffd23b', mini: '#c45bff', minor: '#3ecf5b',
};

const W = Dimensions.get('window').width;
const REELS = 5;
const ROWS = 3;
const GAP = 6;
const CELL = Math.max(46, Math.min(64, Math.floor((W - 48 - GAP * REELS) / REELS)));
const UNIT = CELL + GAP;

function formatTL(v) {
  const fixed = Number(v).toFixed(2);
  const [i, d] = fixed.split('.');
  return i.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + d + ' TL';
}
function compact(n) {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/* -------------------------------- symbols -------------------------------- */

const SYMBOLS = {
  boss: { id: 'boss', label: 'Patron Domuz', weight: 10, role: 'normal', pays: { 3: 10, 4: 30, 5: 100 } },
  pig: { id: 'pig', label: 'İşçi Domuz', weight: 14, role: 'normal', pays: { 3: 5, 4: 15, 5: 50 } },
  saw: { id: 'saw', label: 'Daire Testere', weight: 16, role: 'normal', pays: { 3: 4, 4: 12, 5: 40 } },
  tape: { id: 'tape', label: 'Şerit Metre', weight: 18, role: 'normal', pays: { 3: 4, 4: 10, 5: 30 } },
  ace: { id: 'ace', label: 'As (A)', weight: 20, role: 'normal', pays: { 3: 2, 4: 6, 5: 20 } },
  king: { id: 'king', label: 'Papaz (K)', weight: 22, role: 'normal', pays: { 3: 2, 4: 5, 5: 16 } },
  queen: { id: 'queen', label: 'Kız (Q)', weight: 22, role: 'normal', pays: { 3: 1, 4: 4, 5: 12 } },
  jack: { id: 'jack', label: 'Vale (J)', weight: 24, role: 'normal', pays: { 3: 1, 4: 3, 5: 10 } },
  wolf: { id: 'wolf', label: 'Büyük Kötü Kurt (WILD)', weight: 6, role: 'wild', pays: { 3: 0, 4: 0, 5: 0 } },
  hat: { id: 'hat', label: 'Baret (BONUS)', weight: 11, role: 'scatter', pays: { 3: 0, 4: 0, 5: 0 } },
};
const SYMBOL_IDS = Object.keys(SYMBOLS);
const WILD = 'wolf';
const SCATTER = 'hat';
const BONUS_TRIGGER = 3;
const POOL = SYMBOL_IDS.flatMap((id) => Array(SYMBOLS[id].weight).fill(id));
function randomSymbol() {
  return POOL[Math.floor(Math.random() * POOL.length)];
}

/* --------------------------- SVG vector sprites -------------------------- */

const PINK = '#f4a7c2', PINK_DK = '#d97ba3', SNOUT = '#f8c0d6', EYE = '#2a2230';

function PigFace() {
  return (
    <G>
      <Path d="M30,30 L18,8 L42,24 Z" fill={PINK} stroke={PINK_DK} strokeWidth={2} />
      <Path d="M70,30 L82,8 L58,24 Z" fill={PINK} stroke={PINK_DK} strokeWidth={2} />
      <Ellipse cx={50} cy={52} rx={34} ry={30} fill={PINK} stroke={PINK_DK} strokeWidth={2} />
      <Ellipse cx={50} cy={61} rx={17} ry={12} fill={SNOUT} stroke={PINK_DK} strokeWidth={2} />
      <Ellipse cx={43} cy={61} rx={2.6} ry={4.2} fill={PINK_DK} />
      <Ellipse cx={57} cy={61} rx={2.6} ry={4.2} fill={PINK_DK} />
      <Circle cx={38} cy={43} r={4.4} fill={EYE} />
      <Circle cx={62} cy={43} r={4.4} fill={EYE} />
      <Circle cx={39.4} cy={41.6} r={1.4} fill="#fff" />
      <Circle cx={63.4} cy={41.6} r={1.4} fill="#fff" />
    </G>
  );
}
function BossPig({ size }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Path d="M12,100 C18,80 36,74 50,74 C64,74 82,80 88,100 Z" fill="#27324d" />
      <Path d="M50,74 L40,86 L50,93 Z" fill="#f4f0ea" />
      <Path d="M50,74 L60,86 L50,93 Z" fill="#f4f0ea" />
      <Path d="M50,80 L46,90 L50,100 L54,90 Z" fill="#c8324b" />
      <Path d="M42,22 Q50,12 58,22 Q50,18 42,22 Z" fill="#5b3a2a" />
      <PigFace />
    </Svg>
  );
}
function WorkerPig({ size }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <PigFace />
      <Ellipse cx={28} cy={56} rx={5} ry={3.4} fill="#f08bb0" opacity={0.7} />
      <Ellipse cx={72} cy={56} rx={5} ry={3.4} fill="#f08bb0" opacity={0.7} />
    </Svg>
  );
}
function HardHat({ size }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Path d="M10,70 Q50,84 90,70 L90,76 Q50,90 10,76 Z" fill="#d97e08" />
      <Path d="M22,70 Q22,30 50,28 Q78,30 78,70 Z" fill="#f4920a" stroke="#d97e08" strokeWidth={2} />
      <Path d="M44,70 L44,30 Q50,28 56,30 L56,70 Z" fill="#ffb340" opacity={0.6} />
      <Circle cx={50} cy={56} r={11} fill="#fff3da" stroke="#d97e08" strokeWidth={2} />
      <Ellipse cx={50} cy={58} rx={6} ry={4.5} fill={PINK} />
      <Ellipse cx={47.5} cy={58} rx={1.3} ry={2} fill={PINK_DK} />
      <Ellipse cx={52.5} cy={58} rx={1.3} ry={2} fill={PINK_DK} />
      <Circle cx={46} cy={52} r={1.6} fill={EYE} />
      <Circle cx={54} cy={52} r={1.6} fill={EYE} />
    </Svg>
  );
}
function BuzzSaw({ size }) {
  const cx = 50, cy = 50, outer = 40, inner = 32, teeth = 16;
  let pts = '';
  for (let i = 0; i < teeth * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI / teeth) * i - Math.PI / 2;
    pts += (cx + r * Math.cos(a)) + ',' + (cy + r * Math.sin(a)) + ' ';
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Polygon points={pts.trim()} fill="#c9ced6" stroke="#9aa1ab" strokeWidth={1.5} />
      <Circle cx={cx} cy={cy} r={20} fill="#e7eaef" />
      <Circle cx={cx} cy={cy} r={13} fill="#e03b3b" />
      <Circle cx={cx} cy={cy} r={4} fill="#7a1f1f" />
      <Rect x={8} y={47} width={84} height={6} rx={3} fill="#2a2a2a" opacity={0.85} />
    </Svg>
  );
}
function TapeMeasure({ size }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Path d="M64,64 L92,72 L92,82 L62,76 Z" fill="#ffd23b" stroke="#d9a200" strokeWidth={1.5} />
      <Rect x={16} y={36} width={52} height={42} rx={10} fill="#f4920a" stroke="#c66f06" strokeWidth={2} />
      <Circle cx={42} cy={56} r={13} fill="#fff3da" />
      <Ellipse cx={42} cy={58} rx={7} ry={5} fill={PINK} />
      <Ellipse cx={39} cy={58} rx={1.4} ry={2.2} fill={PINK_DK} />
      <Ellipse cx={45} cy={58} rx={1.4} ry={2.2} fill={PINK_DK} />
      <Circle cx={38} cy={51} r={1.8} fill={EYE} />
      <Circle cx={46} cy={51} r={1.8} fill={EYE} />
    </Svg>
  );
}
function Wolf({ size }) {
  const GRAY = '#8a93a0', GRAY_DK = '#5f6772', SNOUTG = '#c2c9d2';
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Path d="M24,34 L14,8 L40,26 Z" fill={GRAY} stroke={GRAY_DK} strokeWidth={2} />
      <Path d="M76,34 L86,8 L60,26 Z" fill={GRAY} stroke={GRAY_DK} strokeWidth={2} />
      <Path d="M22,46 Q22,24 50,24 Q78,24 78,46 Q78,70 50,84 Q22,70 22,46 Z" fill={GRAY} stroke={GRAY_DK} strokeWidth={2} />
      <Path d="M38,62 Q50,58 62,62 Q60,76 50,82 Q40,76 38,62 Z" fill={SNOUTG} />
      <Ellipse cx={50} cy={64} rx={5} ry={3.5} fill={EYE} />
      <Path d="M30,46 L44,44 L40,52 Z" fill="#ffd23b" />
      <Path d="M70,46 L56,44 L60,52 Z" fill="#ffd23b" />
      <Circle cx={38} cy={48} r={2} fill={EYE} />
      <Circle cx={62} cy={48} r={2} fill={EYE} />
      <Polygon points="44,74 47,82 50,74" fill="#fff" />
      <Polygon points="56,74 53,82 50,74" fill="#fff" />
    </Svg>
  );
}
const ROYAL = {
  ace: { bg: '#c8324b', bg2: '#8f1f33', letter: 'A' },
  king: { bg: '#2f6fd0', bg2: '#1d4a93', letter: 'K' },
  queen: { bg: '#9a4bd0', bg2: '#6c2f96', letter: 'Q' },
  jack: { bg: '#2fa35a', bg2: '#1d703d', letter: 'J' },
};
function Royal({ id, size }) {
  const r = ROYAL[id];
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Rect x={18} y={12} width={64} height={76} rx={12} fill={r.bg} stroke={r.bg2} strokeWidth={3} />
      <Rect x={18} y={12} width={64} height={20} rx={12} fill="#ffffff" opacity={0.12} />
      <Path d="M36,26 L42,20 L50,26 L58,20 L64,26 L62,32 L38,32 Z" fill="#ffd23b" />
      <SvgText x={50} y={72} fontSize={42} fontWeight="bold" fill="#fff" stroke={r.bg2} strokeWidth={1} textAnchor="middle">
        {r.letter}
      </SvgText>
    </Svg>
  );
}
function Sprite({ symbol, size }) {
  switch (symbol) {
    case 'boss': return <BossPig size={size} />;
    case 'pig': return <WorkerPig size={size} />;
    case 'hat': return <HardHat size={size} />;
    case 'saw': return <BuzzSaw size={size} />;
    case 'tape': return <TapeMeasure size={size} />;
    case 'wolf': return <Wolf size={size} />;
    case 'ace': case 'king': case 'queen': case 'jack': return <Royal id={symbol} size={size} />;
    default: return null;
  }
}

/* ------------------------------- jackpots -------------------------------- */

const TIERS = [
  { id: 'grand', label: 'GRAND', mult: 15000, color: C.grand },
  { id: 'major', label: 'MAJOR', mult: 1500, color: C.major },
  { id: 'minor', label: 'MINOR', mult: 500, color: C.mini },
  { id: 'mini', label: 'MINI', mult: 100, color: C.minor },
];
const TIER_BY_ID = TIERS.reduce((a, t) => ({ ...a, [t.id]: t }), {});

/* ---------------------------- 243-ways engine ---------------------------- */

function spinGrid() {
  const g = [];
  for (let r = 0; r < REELS; r++) {
    const col = [];
    for (let row = 0; row < ROWS; row++) col.push(randomSymbol());
    g.push(col);
  }
  return g;
}
function isMatch(symbol, cell) { return cell === symbol || cell === WILD; }
function evaluate(grid, bet) {
  const wins = [];
  for (const def of Object.values(SYMBOLS)) {
    if (def.role !== 'normal') continue;
    const perReel = [];
    for (let reel = 0; reel < REELS; reel++) {
      const hits = [];
      for (let row = 0; row < ROWS; row++) if (isMatch(def.id, grid[reel][row])) hits.push([reel, row]);
      if (hits.length === 0) break;
      perReel.push(hits);
    }
    const count = perReel.length;
    if (count < 3) continue;
    const ways = perReel.reduce((a, h) => a * h.length, 1);
    const mult = def.pays[count];
    if (!mult) continue;
    const amount = Math.round(((mult * ways * bet) / 50) * 100) / 100;
    if (amount <= 0) continue;
    wins.push({ symbol: def.id, count, ways, amount, cells: perReel.flat() });
  }
  let scatterCount = 0;
  for (let reel = 0; reel < REELS; reel++)
    for (let row = 0; row < ROWS; row++) if (grid[reel][row] === SCATTER) scatterCount++;
  const totalWin = Math.round(wins.reduce((s, w) => s + w.amount, 0) * 100) / 100;
  wins.sort((a, b) => b.amount - a.amount);
  return { grid, wins, totalWin, scatterCount, bonusTriggered: scatterCount >= BONUS_TRIGGER };
}

/* --------------------------- hold & spin logic --------------------------- */

const GRID_SIZE = 15;
const START_RESPINS = 3;
const HOUSES = [
  { id: 'straw', label: 'SAMAN', glyph: '🌾', minFilled: 0 },
  { id: 'stick', label: 'ÇUBUK', glyph: '🪵', minFilled: 6 },
  { id: 'brick', label: 'TUĞLA', glyph: '🧱', minFilled: 9 },
  { id: 'mansion', label: 'MALİKÂNE', glyph: '🏰', minFilled: 12 },
];
function houseFor(filled) { let c = HOUSES[0]; for (const h of HOUSES) if (filled >= h.minFilled) c = h; return c; }
const CREDIT_TABLE = [
  { mult: 1, weight: 30 }, { mult: 2, weight: 24 }, { mult: 3, weight: 18 }, { mult: 5, weight: 12 },
  { mult: 8, weight: 8 }, { mult: 10, weight: 5 }, { mult: 15, weight: 2 }, { mult: 25, weight: 1 },
];
function weightedCredit(bet) {
  const total = CREDIT_TABLE.reduce((s, c) => s + c.weight, 0);
  let r = Math.random() * total;
  for (const c of CREDIT_TABLE) { r -= c.weight; if (r <= 0) return { kind: 'credit', value: c.mult * bet }; }
  return { kind: 'credit', value: bet };
}
function assignPrize(bet, filledAfter) {
  if (filledAfter >= GRID_SIZE) return { kind: 'grand', value: TIER_BY_ID.grand.mult * bet };
  const roll = Math.random();
  if (filledAfter >= 12 && roll < 0.015) return { kind: 'major', value: TIER_BY_ID.major.mult * bet };
  if (roll < 0.04) return { kind: 'minor', value: TIER_BY_ID.minor.mult * bet };
  if (roll < 0.12) return { kind: 'mini', value: TIER_BY_ID.mini.mult * bet };
  return weightedCredit(bet);
}
function hatChance(filled) { const rem = GRID_SIZE - filled; return rem <= 0 ? 0 : 0.08 + 0.03 * (rem / GRID_SIZE); }

/* ------------------------------ reel & cells ----------------------------- */

function SymbolCell({ symbol, highlighted, dim }) {
  return (
    <View style={[s.cell, highlighted && s.cellHi, dim && s.cellDim]}>
      <Sprite symbol={symbol} size={CELL * 0.86} />
    </View>
  );
}

const REEL_STAGGER = 180, REEL_SPIN_MS = 720, FILLERS = 16;
const TOTAL_SPIN_MS = (REELS - 1) * REEL_STAGGER + REEL_SPIN_MS;

function Reel({ index, result, spinId, highlightRows, showHighlights }) {
  const translateY = useRef(new Animated.Value(0)).current;
  const strip = useMemo(() => {
    const fillers = Array.from({ length: FILLERS }, () => randomSymbol());
    return fillers.concat(result);
  }, [spinId, result.join(',')]);
  const restY = -(strip.length - ROWS) * UNIT;
  useEffect(() => {
    if (spinId === 0) { translateY.setValue(restY); return; }
    translateY.setValue(0);
    Animated.timing(translateY, {
      toValue: restY, duration: REEL_SPIN_MS, delay: index * REEL_STAGGER,
      easing: Easing.out(Easing.cubic), useNativeDriver: true,
    }).start();
  }, [spinId]);
  const firstResult = strip.length - ROWS;
  return (
    <View style={s.reelWindow}>
      <Animated.View style={{ transform: [{ translateY }] }}>
        {strip.map((sym, i) => {
          const row = i - firstResult;
          const isResult = row >= 0;
          const hi = showHighlights && isResult && highlightRows.has(row);
          const dim = showHighlights && highlightRows.size > 0 && isResult && !hi;
          return <SymbolCell key={i} symbol={sym} highlighted={hi} dim={dim} />;
        })}
      </Animated.View>
    </View>
  );
}

function JackpotBar({ bet }) {
  return (
    <View style={s.jpRow}>
      {TIERS.map((t) => (
        <View key={t.id} style={[s.jpPill, { borderColor: t.color }]}>
          <Text style={[s.jpLabel, { color: t.color }]}>{t.label}</Text>
          <Text style={s.jpValue} numberOfLines={1}>{formatTL(t.mult * bet)}</Text>
        </View>
      ))}
    </View>
  );
}

/* ------------------------------ bonus wheel ------------------------------ */

const SEGS = [
  { key: 'minor', label: 'MINOR', color: '#3ecf5b', weight: 16 },
  { key: 'super', label: 'SUPER', color: '#2f6fd0', weight: 10 },
  { key: 'mini', label: 'MINI', color: '#c45bff', weight: 12 },
  { key: 'upgrade', label: 'UPGRADE', color: '#ffcc33', weight: 14 },
  { key: 'major', label: 'MAJOR', color: '#ffd23b', weight: 5 },
  { key: 'bonus', label: 'BONUS', color: '#f4920a', weight: 12 },
  { key: 'grand', label: 'GRAND', color: '#ff3b3b', weight: 2 },
  { key: 'credit', label: 'KREDİ', color: '#2bb3a3', weight: 20 },
];
const WN = SEGS.length, WSEG = 360 / WN;
const WSIZE = Math.min(300, W - 40);
const WCX = WSIZE / 2, WCY = WSIZE / 2, WR = WSIZE / 2 - 6;
function wpt(deg, radius) {
  const t = (deg * Math.PI) / 180;
  return [WCX + radius * Math.sin(t), WCY - radius * Math.cos(t)];
}
function sectorPath(i) {
  const [x0, y0] = wpt(i * WSEG, WR);
  const [x1, y1] = wpt((i + 1) * WSEG, WR);
  return 'M' + WCX + ',' + WCY + ' L' + x0 + ',' + y0 + ' A' + WR + ',' + WR + ' 0 0 1 ' + x1 + ',' + y1 + ' Z';
}
function pickIndex(exclude) {
  const pool = SEGS.map((sg, i) => ({ i, w: exclude.has(sg.key) ? 0 : sg.weight }));
  const total = pool.reduce((a, p) => a + p.w, 0);
  let r = Math.random() * total;
  for (const p of pool) { r -= p.w; if (r <= 0) return p.i; }
  return pool.findIndex((p) => p.w > 0);
}
function resolveWheel(seg, bet) {
  if (seg.key === 'grand' || seg.key === 'major' || seg.key === 'minor' || seg.key === 'mini') {
    const t = TIER_BY_ID[seg.key];
    return { type: 'jackpot', amount: t.mult * bet, label: t.label, color: seg.color };
  }
  if (seg.key === 'super') return { type: 'credit', amount: 50 * bet, label: 'SUPER BUZZ SAW', color: seg.color };
  if (seg.key === 'credit') return { type: 'credit', amount: 20 * bet, label: 'KREDİ', color: seg.color };
  return { type: 'bonus', amount: 0, label: 'BONUS', color: seg.color };
}

function BonusWheel({ visible, bet, onCollect }) {
  const rotation = useRef(new Animated.Value(0)).current;
  const angle = useRef(0);
  const [spinning, setSpinning] = useState(false);
  const [award, setAward] = useState(null);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!visible) return;
    rotation.setValue(0); angle.current = 0;
    setSpinning(false); setAward(null); setNote('');
    const timers = [setTimeout(() => spin(new Set(), timers), 600)];
    return () => timers.forEach(clearTimeout);
  }, [visible]);

  function spin(exclude, timers) {
    setSpinning(true); setNote('');
    const index = pickIndex(exclude);
    const segCenter = index * WSEG + WSEG / 2;
    const base = angle.current;
    const targetMod = (360 - (segCenter % 360)) % 360;
    const currentMod = ((base % 360) + 360) % 360;
    let delta = targetMod - currentMod;
    if (delta < 0) delta += 360;
    const target = base + 360 * 5 + delta;
    angle.current = target;
    Animated.timing(rotation, {
      toValue: target, duration: 3400, easing: Easing.out(Easing.cubic), useNativeDriver: true,
    }).start(() => {
      setSpinning(false);
      const seg = SEGS[index];
      if (seg.key === 'upgrade') {
        setNote('UPGRADE! TEKRAR ÇEVİRİYORUZ');
        const t = setTimeout(() => spin(new Set(['upgrade', 'credit']), timers), 900);
        if (timers) timers.push(t);
      } else {
        setAward(resolveWheel(seg, bet));
      }
    });
  }

  const spinDeg = rotation.interpolate({ inputRange: [0, 360], outputRange: ['0deg', '360deg'] });

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={s.wBackdrop}>
        <Text style={s.wHeader}>BONUS ÇARKI</Text>
        <View style={{ width: WSIZE, height: WSIZE + 16, alignItems: 'center', justifyContent: 'flex-end' }}>
          <View style={s.wPointer} />
          <Animated.View style={{ transform: [{ rotate: spinDeg }] }}>
            <Svg width={WSIZE} height={WSIZE}>
              {SEGS.map((sg, i) => (
                <Path key={sg.key} d={sectorPath(i)} fill={sg.color} stroke="#06180a" strokeWidth={2} />
              ))}
              {SEGS.map((sg, i) => {
                const mid = i * WSEG + WSEG / 2;
                return (
                  <G key={'t' + sg.key} transform={'rotate(' + mid + ', ' + WCX + ', ' + WCY + ')'}>
                    <SvgText x={WCX} y={WCY - WR * 0.6} fill="#0c0c0c" fontSize={13} fontWeight="bold" textAnchor="middle">
                      {sg.label}
                    </SvgText>
                  </G>
                );
              })}
              <Circle cx={WCX} cy={WCY} r={26} fill={C.gold} stroke={C.goldDeep} strokeWidth={4} />
            </Svg>
          </Animated.View>
        </View>
        {note ? <Text style={s.wNote}>{note}</Text> : null}
        {award ? (
          <View style={{ alignItems: 'center', marginTop: 14 }}>
            <Text style={s.wResultLabel}>KAZANDIN</Text>
            <Text style={[s.wResultValue, { color: award.color }]}>
              {award.type === 'bonus' ? 'HOLD & RE-SPIN!' : award.label + ' • ' + formatTL(award.amount)}
            </Text>
            <Pressable style={s.collect} onPress={() => onCollect(award)}>
              <Text style={s.collectText}>{award.type === 'bonus' ? 'DEVAM' : 'TOPLA'}</Text>
            </Pressable>
          </View>
        ) : (
          <Text style={s.wSpinning}>{spinning ? 'DÖNÜYOR...' : ''}</Text>
        )}
      </View>
    </Modal>
  );
}

/* ----------------------------- hold & re-spin ---------------------------- */

const BCELL = Math.max(44, Math.min(58, Math.floor((W - 80) / 5)));
function BonusCell({ prize, isNew }) {
  if (!prize) return <View style={[s.bCell, s.bCellEmpty]}><Text style={{ fontSize: 20, opacity: 0.25 }}>🧱</Text></View>;
  const isTier = prize.kind !== 'credit';
  const tier = isTier ? TIER_BY_ID[prize.kind] : null;
  return (
    <View style={[s.bCell, s.bCellFilled, isNew && s.bCellNew, tier && { borderColor: tier.color }]}>
      <Sprite symbol="hat" size={22} />
      {tier ? <Text style={[s.bTier, { color: tier.color }]}>{tier.label}</Text>
            : <Text style={s.bValue}>{compact(prize.value)}</Text>}
    </View>
  );
}
function Stat({ label, value, wide }) {
  return (
    <View style={[s.stat, wide && { flex: 1.4 }]}>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={s.statValue}>{value}</Text>
    </View>
  );
}
function HoldAndSpin({ visible, bet, triggerCount, onFinish }) {
  const gRef = useRef(null);
  const [, setV] = useState(0);
  const bump = () => setV((x) => x + 1);
  useEffect(() => {
    if (!visible) return;
    const timers = [];
    const sched = (fn, ms) => timers.push(setTimeout(fn, ms));
    const sum = (p) => p.reduce((a, x) => a + (x ? x.value : 0), 0);
    const idxs = Array.from({ length: GRID_SIZE }, (_, i) => i);
    for (let i = idxs.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = idxs[i]; idxs[i] = idxs[j]; idxs[j] = t; }
    const g = { prizes: Array(GRID_SIZE).fill(null), respinsLeft: START_RESPINS, filled: 0, total: 0, phase: 'respin', lastNew: [] };
    const seed = idxs.slice(0, Math.min(triggerCount, GRID_SIZE));
    for (const i of seed) { g.filled++; g.prizes[i] = assignPrize(bet, g.filled); }
    g.lastNew = seed; g.total = sum(g.prizes); gRef.current = g; bump();
    function step() {
      if (g.phase !== 'respin') return;
      const newIdx = [];
      for (let i = 0; i < GRID_SIZE; i++) { if (g.prizes[i]) continue; if (Math.random() < hatChance(g.filled + newIdx.length)) newIdx.push(i); }
      for (const i of newIdx) { g.filled++; g.prizes[i] = assignPrize(bet, g.filled); }
      g.lastNew = newIdx;
      g.respinsLeft = newIdx.length > 0 ? START_RESPINS : g.respinsLeft - 1;
      g.total = sum(g.prizes); bump();
      if (g.filled >= GRID_SIZE || g.respinsLeft <= 0) sched(toWolf, 1100);
      else sched(step, 950);
    }
    function toWolf() { g.phase = 'wolf'; g.lastNew = []; bump(); sched(() => { g.phase = 'done'; bump(); }, 1900); }
    sched(step, 1200);
    return () => timers.forEach(clearTimeout);
  }, [visible]);

  if (!visible || !gRef.current) return <Modal visible={visible} transparent />;
  const g = gRef.current;
  const house = houseFor(g.filled);
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={s.bBackdrop}>
        <Text style={s.bHeader}>HOLD & RE-SPIN</Text>
        <View style={s.bHouses}>
          {HOUSES.map((h) => {
            const active = h.id === house.id;
            const reached = g.filled >= h.minFilled;
            return (
              <View key={h.id} style={[s.house, active && s.houseActive, !reached && s.houseDim]}>
                <Text style={{ fontSize: 18 }}>{h.glyph}</Text>
                <Text style={[s.houseLabel, active && { color: C.gold }]}>{h.label}</Text>
              </View>
            );
          })}
        </View>
        <View style={s.bGrid}>
          {Array.from({ length: ROWS }, (_, row) => (
            <View key={row} style={{ flexDirection: 'row' }}>
              {Array.from({ length: REELS }, (_, reel) => {
                const idx = reel * ROWS + row;
                return <BonusCell key={idx} prize={g.prizes[idx]} isNew={g.lastNew.includes(idx)} />;
              })}
            </View>
          ))}
        </View>
        {g.phase === 'respin' ? (
          <View style={s.bStatusRow}>
            <Stat label="RESPIN" value={String(g.respinsLeft)} />
            <Stat label="DOLU" value={g.filled + '/' + GRID_SIZE} />
            <Stat label="TOPLAM" value={formatTL(g.total)} wide />
          </View>
        ) : g.phase === 'wolf' ? (
          <View style={{ alignItems: 'center', marginTop: 22 }}>
            <Wolf size={64} />
            <Text style={s.wolfText}>KURT ÜFLÜYOR — EVLERİ YIKIYOR!</Text>
          </View>
        ) : (
          <View style={{ alignItems: 'center', marginTop: 20 }}>
            <Text style={s.doneLabel}>TOPLAM KAZANÇ</Text>
            <Text style={s.doneValue}>{formatTL(g.total)}</Text>
            <Pressable style={s.collect} onPress={() => onFinish(g.total)}>
              <Text style={s.collectText}>TOPLA</Text>
            </Pressable>
          </View>
        )}
      </View>
    </Modal>
  );
}

/* -------------------------------- paytable ------------------------------- */

function Paytable({ visible, onClose }) {
  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={s.sheetBackdrop}>
        <View style={s.sheet}>
          <View style={s.sheetHead}>
            <Text style={s.sheetTitle}>ÖDEME TABLOSU</Text>
            <Pressable onPress={onClose} style={s.close}><Text style={s.closeX}>✕</Text></Pressable>
          </View>
          <Text style={s.sheetSub}>243 yön • soldan sağa ardışık makaralarda eşleşme</Text>
          <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
            {Object.values(SYMBOLS).map((def) => (
              <View key={def.id} style={s.payRow}>
                <View style={{ width: 44, height: 44, marginRight: 12, alignItems: 'center', justifyContent: 'center' }}>
                  <Sprite symbol={def.id} size={40} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.payName}>{def.label}</Text>
                  {def.role === 'wild' ? <Text style={s.payNote}>Baret hariç tüm sembollerin yerine geçer.</Text>
                    : def.role === 'scatter' ? <Text style={s.payNote}>3+ baret Bonus Çarkını döndürür.</Text>
                    : <Text style={s.payPays}>x5: {def.pays[5]}   x4: {def.pays[4]}   x3: {def.pays[3]}</Text>}
                </View>
              </View>
            ))}
            <Text style={s.payFooter}>Kazanç = çarpan × yön sayısı × bahis.</Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/* --------------------------------- app ----------------------------------- */

const BET_STEPS = [10, 20, 50, 100, 150];
const START_BALANCE = 5000;

export default function App() {
  const [balance, setBalance] = useState(START_BALANCE);
  const [betIndex, setBetIndex] = useState(2);
  const [grid, setGrid] = useState(() => spinGrid());
  const [spinId, setSpinId] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [wins, setWins] = useState([]);
  const [showHi, setShowHi] = useState(false);
  const [lastWin, setLastWin] = useState(0);
  const [showPay, setShowPay] = useState(false);
  const [wheel, setWheel] = useState(false);
  const [bonus, setBonus] = useState({ visible: false, hats: 0 });
  const timer = useRef(null);

  const bet = BET_STEPS[betIndex];
  const canSpin = !spinning && !wheel && !bonus.visible && balance >= bet;

  const hiSets = useMemo(() => {
    const sets = Array.from({ length: REELS }, () => new Set());
    if (showHi) for (const w of wins) for (const c of w.cells) sets[c[0]].add(c[1]);
    return sets;
  }, [wins, showHi]);

  function spin() {
    if (!canSpin) return;
    const ng = spinGrid();
    const res = evaluate(ng, bet);
    setBalance((b) => b - bet);
    setGrid(ng); setWins(res.wins); setShowHi(false); setLastWin(0);
    setSpinning(true); setSpinId((id) => id + 1);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setSpinning(false); setShowHi(true); setLastWin(res.totalWin);
      if (res.totalWin > 0) setBalance((b) => b + res.totalWin);
      if (res.bonusTriggered) setTimeout(() => setWheel(true), 700);
    }, TOTAL_SPIN_MS + 80);
  }
  function onWheelCollect(award) {
    setWheel(false);
    if (award.type === 'bonus') setTimeout(() => setBonus({ visible: true, hats: 6 }), 250);
    else { setBalance((b) => b + award.amount); setLastWin((w) => w + award.amount); }
  }
  function onBonusFinish(amount) {
    setBalance((b) => b + amount); setLastWin((w) => w + amount);
    setBonus({ visible: false, hats: 0 });
  }
  function changeBet(dir) {
    if (spinning) return;
    setBetIndex((i) => Math.min(BET_STEPS.length - 1, Math.max(0, i + dir)));
  }

  return (
    <View style={s.safe}>
      <View style={s.header}>
        <Pressable onPress={() => !spinning && !bonus.visible && setWheel(true)} style={s.testBtn}>
          <Text style={s.testBtnText}>🎡 BONUS</Text>
        </Pressable>
        <Text style={s.title}>HUFF N&apos; PUFF</Text>
        <Pressable onPress={() => setShowPay(true)} style={s.infoBtn}><Text style={s.infoX}>i</Text></Pressable>
      </View>
      <JackpotBar bet={bet} />
      <View style={s.machine}>
        <View style={s.reels}>
          {grid.map((col, reel) => (
            <Reel key={reel} index={reel} result={col} spinId={spinId} highlightRows={hiSets[reel]} showHighlights={showHi} />
          ))}
        </View>
        <Text style={s.ways}>243 YOL İLE KAZANÇ</Text>
        <Text style={s.trigger}>3+ ⛑️ BARET → BONUS ÇARKINI DÖNDÜRÜR</Text>
      </View>
      <View style={s.hud}>
        <Hud label="CASH" value={formatTL(balance)} />
        <Hud label="BET" value={formatTL(bet)} />
        <Hud label="WIN" value={formatTL(showHi ? lastWin : 0)} hi={showHi && lastWin > 0} />
      </View>
      <View style={s.controls}>
        <View>
          <Text style={s.betLabel}>BAHİS</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Round label="−" onPress={() => changeBet(-1)} disabled={spinning} />
            <Text style={s.betValue}>{bet}</Text>
            <Round label="+" onPress={() => changeBet(1)} disabled={spinning} />
          </View>
        </View>
        <Pressable onPress={spin} disabled={!canSpin}
          style={({ pressed }) => [s.spin, !canSpin && s.spinOff, pressed && canSpin && { transform: [{ scale: 0.94 }] }]}>
          <Text style={s.spinText}>{spinning ? '...' : 'ÇEVİR'}</Text>
        </Pressable>
      </View>
      {balance < bet && !spinning ? (
        <Pressable onPress={() => setBalance((b) => b + 5000)} style={s.topUp}>
          <Text style={s.topUpText}>Bakiye yetersiz — +5.000 TL yükle</Text>
        </Pressable>
      ) : (
        <View style={{ height: 42, marginTop: 12 }} />
      )}
      <Paytable visible={showPay} onClose={() => setShowPay(false)} />
      <BonusWheel visible={wheel} bet={bet} onCollect={onWheelCollect} />
      <HoldAndSpin visible={bonus.visible} bet={bet} triggerCount={bonus.hats} onFinish={onBonusFinish} />
    </View>
  );
}

function Hud({ label, value, hi }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={s.hudLabel}>{label}</Text>
      <Text style={[s.hudValue, hi && { color: C.win }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}
function Round({ label, onPress, disabled }) {
  return (
    <Pressable onPress={onPress} disabled={disabled}
      style={({ pressed }) => [s.round, disabled && { opacity: 0.4 }, pressed && !disabled && { backgroundColor: C.primary }]}>
      <Text style={s.roundText}>{label}</Text>
    </Pressable>
  );
}

/* -------------------------------- styles --------------------------------- */

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg, paddingHorizontal: 14, paddingTop: 44, paddingBottom: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  title: { color: C.gold, fontSize: 26, fontWeight: '900', letterSpacing: 2 },
  infoBtn: { position: 'absolute', right: 0, width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: C.gold, alignItems: 'center', justifyContent: 'center' },
  infoX: { color: C.gold, fontSize: 17, fontWeight: '800', fontStyle: 'italic' },
  testBtn: { position: 'absolute', left: 0, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, borderWidth: 1.5, borderColor: C.gold, backgroundColor: C.panel },
  testBtnText: { color: C.gold, fontSize: 12, fontWeight: '900' },
  jpRow: { flexDirection: 'row', justifyContent: 'space-between' },
  jpPill: { flex: 1, marginHorizontal: 2.5, backgroundColor: C.bgDeep, borderRadius: 10, borderWidth: 1.5, paddingVertical: 6, alignItems: 'center' },
  jpLabel: { fontSize: 11, fontWeight: '900' },
  jpValue: { color: C.text, fontSize: 8.5, fontWeight: '700', marginTop: 1 },
  machine: { flex: 1, justifyContent: 'center' },
  reels: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', backgroundColor: C.bgDeep, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 6, borderWidth: 2, borderColor: C.panelBorder },
  reelWindow: { width: CELL, height: ROWS * UNIT, overflow: 'hidden', backgroundColor: C.reelBg, borderRadius: 12, marginHorizontal: GAP / 2 },
  ways: { color: C.primary, fontSize: 12, fontWeight: '900', textAlign: 'center', marginTop: 10, letterSpacing: 2 },
  trigger: { color: C.textDim, fontSize: 11, fontWeight: '700', textAlign: 'center', marginTop: 6 },
  cell: { width: CELL, height: CELL, alignItems: 'center', justifyContent: 'center', backgroundColor: C.reelCell, borderRadius: 12, marginVertical: GAP / 2 },
  cellHi: { backgroundColor: '#22401f', borderWidth: 2, borderColor: C.gold },
  cellDim: { opacity: 0.35 },
  hud: { flexDirection: 'row', backgroundColor: C.panel, borderRadius: 12, borderWidth: 1, borderColor: C.panelBorder, paddingVertical: 8, marginBottom: 12, marginTop: 4 },
  hudLabel: { color: C.primary, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  hudValue: { color: C.text, fontSize: 14, fontWeight: '800', marginTop: 2 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  betLabel: { color: C.textDim, fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 4 },
  betValue: { color: C.text, fontSize: 22, fontWeight: '800', minWidth: 52, textAlign: 'center' },
  round: { width: 42, height: 42, borderRadius: 21, backgroundColor: C.panel, borderWidth: 1, borderColor: C.panelBorder, alignItems: 'center', justifyContent: 'center' },
  roundText: { color: C.text, fontSize: 24, fontWeight: '800' },
  spin: { width: 110, height: 110, borderRadius: 55, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center', borderWidth: 5, borderColor: C.goldDeep },
  spinOff: { backgroundColor: '#5a4a2a', borderColor: '#3a2f1a' },
  spinText: { color: C.bgDeep, fontSize: 22, fontWeight: '900', letterSpacing: 1 },
  topUp: { marginTop: 12, alignItems: 'center', paddingVertical: 10, backgroundColor: C.danger, borderRadius: 12 },
  topUpText: { color: '#fff', fontWeight: '800' },

  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(3,12,6,0.85)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 18, paddingTop: 16, paddingBottom: 28, maxHeight: '85%', borderWidth: 2, borderColor: C.panelBorder },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { color: C.gold, fontSize: 22, fontWeight: '900', letterSpacing: 1 },
  close: { width: 34, height: 34, borderRadius: 17, backgroundColor: C.panel, alignItems: 'center', justifyContent: 'center' },
  closeX: { color: C.text, fontSize: 16, fontWeight: '800' },
  sheetSub: { color: C.textDim, fontSize: 12, marginTop: 6, marginBottom: 10 },
  payRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: 'rgba(62,207,91,0.15)' },
  payName: { color: C.text, fontSize: 15, fontWeight: '800' },
  payPays: { color: C.gold, fontSize: 14, fontWeight: '700', marginTop: 2 },
  payNote: { color: C.textDim, fontSize: 13, marginTop: 2 },
  payFooter: { color: C.textDim, fontSize: 12, marginTop: 16, fontStyle: 'italic' },

  wBackdrop: { flex: 1, backgroundColor: 'rgba(3,12,6,0.94)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  wHeader: { color: C.gold, fontSize: 28, fontWeight: '900', letterSpacing: 2, marginBottom: 14 },
  wPointer: { position: 'absolute', top: 0, zIndex: 5, width: 0, height: 0, borderLeftWidth: 15, borderRightWidth: 15, borderTopWidth: 26, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: C.gold },
  wNote: { color: C.gold, fontSize: 15, fontWeight: '800', marginTop: 14 },
  wSpinning: { color: C.textDim, fontSize: 15, fontWeight: '700', marginTop: 18, height: 20 },
  wResultLabel: { color: C.text, fontSize: 14, fontWeight: '700' },
  wResultValue: { fontSize: 22, fontWeight: '900', marginTop: 4 },
  collect: { marginTop: 16, backgroundColor: C.gold, paddingHorizontal: 48, paddingVertical: 13, borderRadius: 28, borderWidth: 4, borderColor: C.goldDeep },
  collectText: { color: C.bgDeep, fontSize: 18, fontWeight: '900', letterSpacing: 1 },

  bBackdrop: { flex: 1, backgroundColor: 'rgba(3,12,6,0.94)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  bHeader: { color: C.gold, fontSize: 26, fontWeight: '900', letterSpacing: 1.5, marginBottom: 12 },
  bHouses: { flexDirection: 'row', marginBottom: 14 },
  house: { alignItems: 'center', marginHorizontal: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, borderWidth: 1.5, borderColor: C.panelBorder, backgroundColor: C.panel, minWidth: 62 },
  houseActive: { borderColor: C.gold, backgroundColor: '#1c4a26' },
  houseDim: { opacity: 0.4 },
  houseLabel: { color: C.textDim, fontSize: 10, fontWeight: '800', marginTop: 2 },
  bGrid: { backgroundColor: C.bgDeep, borderRadius: 14, borderWidth: 2, borderColor: C.panelBorder, padding: 8 },
  bCell: { width: BCELL, height: BCELL, margin: 3, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  bCellEmpty: { backgroundColor: C.reelCell, borderColor: 'transparent' },
  bCellFilled: { backgroundColor: '#2a1c08', borderColor: C.gold },
  bCellNew: { backgroundColor: '#4a3410' },
  bValue: { color: C.text, fontSize: 12, fontWeight: '800', marginTop: 1 },
  bTier: { fontSize: 10, fontWeight: '900', marginTop: 1 },
  bStatusRow: { flexDirection: 'row', marginTop: 16, alignSelf: 'stretch' },
  stat: { flex: 1, marginHorizontal: 4, backgroundColor: C.panel, borderRadius: 10, paddingVertical: 8, alignItems: 'center', borderWidth: 1, borderColor: C.panelBorder },
  statLabel: { color: C.textDim, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  statValue: { color: C.text, fontSize: 15, fontWeight: '900', marginTop: 2 },
  wolfText: { color: C.gold, fontSize: 15, fontWeight: '800', marginTop: 8 },
  doneLabel: { color: C.textDim, fontSize: 13, fontWeight: '700', letterSpacing: 1 },
  doneValue: { color: C.win, fontSize: 30, fontWeight: '900', marginTop: 4 },
});
