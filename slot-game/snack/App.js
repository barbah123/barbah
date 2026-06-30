// Huff N' Puff — tek dosyalık Snack sürümü (telefonda Expo Go ile test için).
// Harici kütüphane YOK; yalnızca react + react-native çekirdeği.
//
// Kurallar (Light & Wonder "Huff N' Puff"):
//  - 5x3, 243 yön ile kazanç. Kurt = WILD, Baret = bonus.
//  - 6+ baret -> Hold & Re-spin: baretler kilitlenir, 3 respin, yeni baret
//    gelince 3'e sıfırlanır. Her baret kredi ya da jackpot jetonu taşır.
//  - Evler: Saman -> Çubuk -> Tuğla -> Malikâne. MAJOR/GRAND üst evlerde.
//  - Respin bitince Kurt üfler, toplam ödülü açar.

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

/* ----------------------------- theme & layout ---------------------------- */

const C = {
  bg: '#0d2a12',
  bgDeep: '#06180a',
  panel: '#123a1c',
  panelBorder: '#3ecf5b',
  reelBg: '#0a210f',
  reelCell: '#0f2e17',
  gold: '#ffcc33',
  goldDeep: '#e6a817',
  text: '#f3ffe9',
  textDim: '#8fc79a',
  win: '#ffd94a',
  danger: '#ff5c7a',
  primary: '#3ecf5b',
  grand: '#ff3b3b',
  major: '#ffd23b',
  mini: '#c45bff',
  minor: '#3ecf5b',
};

const W = Dimensions.get('window').width;
const REELS = 5;
const ROWS = 3;
const GAP = 6;
const CELL = Math.max(46, Math.min(64, Math.floor((W - 48 - GAP * REELS) / REELS)));
const UNIT = CELL + GAP;

function formatTL(v) {
  const fixed = Number(v).toFixed(2);
  const [intPart, dec] = fixed.split('.');
  const sep = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return sep + ',' + dec + ' TL';
}
function compact(n) {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/* -------------------------------- symbols -------------------------------- */

const SYMBOLS = {
  boss: { id: 'boss', label: 'Patron Domuz', glyph: '🐷', weight: 10, role: 'normal', pays: { 3: 10, 4: 30, 5: 100 } },
  pig: { id: 'pig', label: 'İşçi Domuz', glyph: '🐽', weight: 14, role: 'normal', pays: { 3: 5, 4: 15, 5: 50 } },
  saw: { id: 'saw', label: 'Daire Testere', glyph: '🪚', weight: 16, role: 'normal', pays: { 3: 4, 4: 12, 5: 40 } },
  tape: { id: 'tape', label: 'Şerit Metre', glyph: '📏', weight: 18, role: 'normal', pays: { 3: 4, 4: 10, 5: 30 } },
  ace: { id: 'ace', label: 'As', glyph: '🅰️', weight: 20, role: 'normal', pays: { 3: 2, 4: 6, 5: 20 } },
  king: { id: 'king', label: 'Papaz', glyph: '👑', weight: 22, role: 'normal', pays: { 3: 2, 4: 5, 5: 16 } },
  queen: { id: 'queen', label: 'Kız', glyph: '💍', weight: 22, role: 'normal', pays: { 3: 1, 4: 4, 5: 12 } },
  jack: { id: 'jack', label: 'Vale', glyph: '🎴', weight: 24, role: 'normal', pays: { 3: 1, 4: 3, 5: 10 } },
  wolf: { id: 'wolf', label: 'Büyük Kötü Kurt (WILD)', glyph: '🐺', weight: 6, role: 'wild', pays: { 3: 0, 4: 0, 5: 0 } },
  hat: { id: 'hat', label: 'Baret (BONUS)', glyph: '⛑️', weight: 7, role: 'scatter', pays: { 3: 0, 4: 0, 5: 0 } },
};
const SYMBOL_IDS = Object.keys(SYMBOLS);
const WILD = 'wolf';
const SCATTER = 'hat';
const BONUS_TRIGGER = 6;

const POOL = SYMBOL_IDS.flatMap((id) => Array(SYMBOLS[id].weight).fill(id));
function randomSymbol() {
  return POOL[Math.floor(Math.random() * POOL.length)];
}

/* ------------------------------- jackpots -------------------------------- */

const TIERS = [
  { id: 'grand', label: 'GRAND', mult: 15000, color: C.grand, minFilled: 15 },
  { id: 'major', label: 'MAJOR', mult: 1500, color: C.major, minFilled: 12 },
  { id: 'minor', label: 'MINOR', mult: 500, color: C.mini, minFilled: 6 },
  { id: 'mini', label: 'MINI', mult: 100, color: C.minor, minFilled: 6 },
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
function isMatch(symbol, cell) {
  return cell === symbol || cell === WILD;
}
function evaluate(grid, bet) {
  const wins = [];
  for (const def of Object.values(SYMBOLS)) {
    if (def.role !== 'normal') continue;
    const perReel = [];
    for (let reel = 0; reel < REELS; reel++) {
      const hits = [];
      for (let row = 0; row < ROWS; row++) {
        if (isMatch(def.id, grid[reel][row])) hits.push([reel, row]);
      }
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
    for (let row = 0; row < ROWS; row++)
      if (grid[reel][row] === SCATTER) scatterCount++;
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
function houseFor(filled) {
  let cur = HOUSES[0];
  for (const h of HOUSES) if (filled >= h.minFilled) cur = h;
  return cur;
}
const CREDIT_TABLE = [
  { mult: 1, weight: 30 }, { mult: 2, weight: 24 }, { mult: 3, weight: 18 },
  { mult: 5, weight: 12 }, { mult: 8, weight: 8 }, { mult: 10, weight: 5 },
  { mult: 15, weight: 2 }, { mult: 25, weight: 1 },
];
function weightedCredit(bet) {
  const total = CREDIT_TABLE.reduce((s, c) => s + c.weight, 0);
  let r = Math.random() * total;
  for (const c of CREDIT_TABLE) {
    r -= c.weight;
    if (r <= 0) return { kind: 'credit', value: c.mult * bet };
  }
  return { kind: 'credit', value: bet };
}
function assignPrize(bet, filledAfter) {
  if (filledAfter >= GRID_SIZE) return { kind: 'grand', value: TIER_BY_ID.grand.mult * bet };
  const roll = Math.random();
  if (filledAfter >= TIER_BY_ID.major.minFilled && roll < 0.015)
    return { kind: 'major', value: TIER_BY_ID.major.mult * bet };
  if (roll < 0.04) return { kind: 'minor', value: TIER_BY_ID.minor.mult * bet };
  if (roll < 0.12) return { kind: 'mini', value: TIER_BY_ID.mini.mult * bet };
  return weightedCredit(bet);
}
function hatChance(filled) {
  const remaining = GRID_SIZE - filled;
  if (remaining <= 0) return 0;
  return 0.08 + 0.03 * (remaining / GRID_SIZE);
}

/* ------------------------------ components ------------------------------- */

function SymbolCell({ symbol, highlighted, dim }) {
  return (
    <View style={[s.cell, highlighted && s.cellHi, dim && s.cellDim]}>
      <Text style={{ fontSize: CELL * 0.55 }}>{SYMBOLS[symbol].glyph}</Text>
    </View>
  );
}

const REEL_STAGGER = 180;
const REEL_SPIN_MS = 720;
const TOTAL_SPIN_MS = (REELS - 1) * REEL_STAGGER + REEL_SPIN_MS;
const FILLERS = 16;

function Reel({ index, result, spinId, highlightRows, showHighlights }) {
  const translateY = useRef(new Animated.Value(0)).current;
  const strip = useMemo(() => {
    const fillers = Array.from({ length: FILLERS }, () => randomSymbol());
    return fillers.concat(result);
  }, [spinId, result.join(',')]);
  const restY = -(strip.length - ROWS) * UNIT;

  useEffect(() => {
    if (spinId === 0) {
      translateY.setValue(restY);
      return;
    }
    translateY.setValue(0);
    Animated.timing(translateY, {
      toValue: restY,
      duration: REEL_SPIN_MS,
      delay: index * REEL_STAGGER,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
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
                <Text style={{ fontSize: 30, marginRight: 12 }}>{def.glyph}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.payName}>{def.label}</Text>
                  {def.role === 'wild' ? (
                    <Text style={s.payNote}>Baret hariç tüm sembollerin yerine geçer.</Text>
                  ) : def.role === 'scatter' ? (
                    <Text style={s.payNote}>6+ baret Hold &amp; Re-spin bonusunu başlatır.</Text>
                  ) : (
                    <Text style={s.payPays}>x5: {def.pays[5]}   x4: {def.pays[4]}   x3: {def.pays[3]}</Text>
                  )}
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

const BCELL = Math.max(44, Math.min(58, Math.floor((W - 80) / 5)));

function BonusCell({ prize, isNew }) {
  if (!prize) {
    return <View style={[s.bCell, s.bCellEmpty]}><Text style={{ fontSize: 20, opacity: 0.25 }}>🧱</Text></View>;
  }
  const isTier = prize.kind !== 'credit';
  const tier = isTier ? TIER_BY_ID[prize.kind] : null;
  return (
    <View style={[s.bCell, s.bCellFilled, isNew && s.bCellNew, tier && { borderColor: tier.color }]}>
      <Text style={{ fontSize: 18 }}>⛑️</Text>
      {tier ? (
        <Text style={[s.bTier, { color: tier.color }]}>{tier.label}</Text>
      ) : (
        <Text style={s.bValue}>{compact(prize.value)}</Text>
      )}
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
    for (let i = idxs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [idxs[i], idxs[j]] = [idxs[j], idxs[i]];
    }
    const g = {
      prizes: Array(GRID_SIZE).fill(null),
      respinsLeft: START_RESPINS,
      filled: 0,
      total: 0,
      phase: 'respin',
      lastNew: [],
    };
    const seed = idxs.slice(0, Math.min(triggerCount, GRID_SIZE));
    for (const i of seed) {
      g.filled++;
      g.prizes[i] = assignPrize(bet, g.filled);
    }
    g.lastNew = seed;
    g.total = sum(g.prizes);
    gRef.current = g;
    bump();

    function step() {
      if (g.phase !== 'respin') return;
      const newIdx = [];
      for (let i = 0; i < GRID_SIZE; i++) {
        if (g.prizes[i]) continue;
        if (Math.random() < hatChance(g.filled + newIdx.length)) newIdx.push(i);
      }
      for (const i of newIdx) {
        g.filled++;
        g.prizes[i] = assignPrize(bet, g.filled);
      }
      g.lastNew = newIdx;
      g.respinsLeft = newIdx.length > 0 ? START_RESPINS : g.respinsLeft - 1;
      g.total = sum(g.prizes);
      bump();
      if (g.filled >= GRID_SIZE || g.respinsLeft <= 0) sched(toWolf, 1100);
      else sched(step, 950);
    }
    function toWolf() {
      g.phase = 'wolf';
      g.lastNew = [];
      bump();
      sched(() => { g.phase = 'done'; bump(); }, 1900);
    }
    sched(step, 1200);
    return () => timers.forEach(clearTimeout);
  }, [visible]);

  if (!visible || !gRef.current) return <Modal visible={visible} transparent />;
  const g = gRef.current;
  const house = houseFor(g.filled);

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={s.bBackdrop}>
        <Text style={s.bHeader}>HOLD &amp; RE-SPIN</Text>
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
            <Text style={{ fontSize: 44 }}>🐺💨</Text>
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

function Stat({ label, value, wide }) {
  return (
    <View style={[s.stat, wide && { flex: 1.4 }]}>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={s.statValue}>{value}</Text>
    </View>
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
  const [bonus, setBonus] = useState({ visible: false, hats: 0 });
  const timer = useRef(null);

  const bet = BET_STEPS[betIndex];
  const canSpin = !spinning && !bonus.visible && balance >= bet;

  const hiSets = useMemo(() => {
    const sets = Array.from({ length: REELS }, () => new Set());
    if (showHi) for (const w of wins) for (const [r, row] of w.cells) sets[r].add(row);
    return sets;
  }, [wins, showHi]);

  function spin() {
    if (!canSpin) return;
    const ng = spinGrid();
    const res = evaluate(ng, bet);
    setBalance((b) => b - bet);
    setGrid(ng);
    setWins(res.wins);
    setShowHi(false);
    setLastWin(0);
    setSpinning(true);
    setSpinId((id) => id + 1);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setSpinning(false);
      setShowHi(true);
      setLastWin(res.totalWin);
      if (res.totalWin > 0) setBalance((b) => b + res.totalWin);
      if (res.bonusTriggered) setTimeout(() => setBonus({ visible: true, hats: res.scatterCount }), 700);
    }, TOTAL_SPIN_MS + 80);
  }
  function onBonusFinish(amount) {
    setBalance((b) => b + amount);
    setLastWin((w) => w + amount);
    setBonus({ visible: false, hats: 0 });
  }
  function changeBet(dir) {
    if (spinning) return;
    setBetIndex((i) => Math.min(BET_STEPS.length - 1, Math.max(0, i + dir)));
  }

  return (
    <View style={s.safe}>
      <View style={s.header}>
        <Text style={s.title}>HUFF N&apos; PUFF</Text>
        <Pressable onPress={() => setShowPay(true)} style={s.infoBtn}>
          <Text style={s.infoX}>i</Text>
        </Pressable>
      </View>

      <JackpotBar bet={bet} />

      <View style={s.machine}>
        <View style={s.reels}>
          {grid.map((col, reel) => (
            <Reel key={reel} index={reel} result={col} spinId={spinId}
              highlightRows={hiSets[reel]} showHighlights={showHi} />
          ))}
        </View>
        <Text style={s.ways}>243 YOL İLE KAZANÇ</Text>
        <Text style={s.trigger}>6+ ⛑️ BARET → HOLD &amp; RE-SPIN BONUSU</Text>
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
  collect: { marginTop: 18, backgroundColor: C.gold, paddingHorizontal: 50, paddingVertical: 13, borderRadius: 28, borderWidth: 4, borderColor: C.goldDeep },
  collectText: { color: C.bgDeep, fontSize: 18, fontWeight: '900', letterSpacing: 1 },
});
