// Original cartoon vector art (react-native-svg) in the construction-pig genre.
// These are hand-drawn primitives — not copies of any proprietary game art —
// so each symbol scales crisply at any size.

import React from 'react';
import Svg, {
  Circle,
  Ellipse,
  G,
  Path,
  Polygon,
  Rect,
  Text as SvgText,
} from 'react-native-svg';
import type { SymbolId } from '../game/symbols';

const PINK = '#f4a7c2';
const PINK_DK = '#d97ba3';
const SNOUT = '#f8c0d6';
const EYE = '#2a2230';

function PigFace() {
  return (
    <G>
      {/* ears */}
      <Path d="M30,30 L18,8 L42,24 Z" fill={PINK} stroke={PINK_DK} strokeWidth={2} />
      <Path d="M70,30 L82,8 L58,24 Z" fill={PINK} stroke={PINK_DK} strokeWidth={2} />
      {/* head */}
      <Ellipse cx={50} cy={52} rx={34} ry={30} fill={PINK} stroke={PINK_DK} strokeWidth={2} />
      {/* snout */}
      <Ellipse cx={50} cy={61} rx={17} ry={12} fill={SNOUT} stroke={PINK_DK} strokeWidth={2} />
      <Ellipse cx={43} cy={61} rx={2.6} ry={4.2} fill={PINK_DK} />
      <Ellipse cx={57} cy={61} rx={2.6} ry={4.2} fill={PINK_DK} />
      {/* eyes */}
      <Circle cx={38} cy={43} r={4.4} fill={EYE} />
      <Circle cx={62} cy={43} r={4.4} fill={EYE} />
      <Circle cx={39.4} cy={41.6} r={1.4} fill="#fff" />
      <Circle cx={63.4} cy={41.6} r={1.4} fill="#fff" />
    </G>
  );
}

function BossPig({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      {/* suit */}
      <Path d="M12,100 C18,80 36,74 50,74 C64,74 82,80 88,100 Z" fill="#27324d" />
      <Path d="M50,74 L40,86 L50,93 Z" fill="#f4f0ea" />
      <Path d="M50,74 L60,86 L50,93 Z" fill="#f4f0ea" />
      <Path d="M50,80 L46,90 L50,100 L54,90 Z" fill="#c8324b" />
      {/* slick hair tuft */}
      <Path d="M42,22 Q50,12 58,22 Q50,18 42,22 Z" fill="#5b3a2a" />
      <PigFace />
    </Svg>
  );
}

function WorkerPig({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <PigFace />
      {/* rosy cheeks */}
      <Ellipse cx={28} cy={56} rx={5} ry={3.4} fill="#f08bb0" opacity={0.7} />
      <Ellipse cx={72} cy={56} rx={5} ry={3.4} fill="#f08bb0" opacity={0.7} />
    </Svg>
  );
}

function HardHat({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      {/* brim */}
      <Path d="M10,70 Q50,84 90,70 L90,76 Q50,90 10,76 Z" fill="#d97e08" />
      {/* dome */}
      <Path d="M22,70 Q22,30 50,28 Q78,30 78,70 Z" fill="#f4920a" stroke="#d97e08" strokeWidth={2} />
      <Path d="M44,70 L44,30 Q50,28 56,30 L56,70 Z" fill="#ffb340" opacity={0.6} />
      {/* little pig badge */}
      <Circle cx={50} cy={56} r={11} fill="#fff3da" stroke="#d97e08" strokeWidth={2} />
      <Ellipse cx={50} cy={58} rx={6} ry={4.5} fill={PINK} />
      <Ellipse cx={47.5} cy={58} rx={1.3} ry={2} fill={PINK_DK} />
      <Ellipse cx={52.5} cy={58} rx={1.3} ry={2} fill={PINK_DK} />
      <Circle cx={46} cy={52} r={1.6} fill={EYE} />
      <Circle cx={54} cy={52} r={1.6} fill={EYE} />
    </Svg>
  );
}

function BuzzSaw({ size }: { size: number }) {
  // 16-tooth blade as a star polygon.
  const cx = 50;
  const cy = 50;
  const outer = 40;
  const inner = 32;
  const teeth = 16;
  let pts = '';
  for (let i = 0; i < teeth * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI / teeth) * i - Math.PI / 2;
    pts += `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)} `;
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Polygon points={pts.trim()} fill="#c9ced6" stroke="#9aa1ab" strokeWidth={1.5} />
      <Circle cx={cx} cy={cy} r={20} fill="#e7eaef" />
      <Circle cx={cx} cy={cy} r={13} fill="#e03b3b" />
      <Circle cx={cx} cy={cy} r={4} fill="#7a1f1f" />
      {/* handle bar */}
      <Rect x={8} y={47} width={84} height={6} rx={3} fill="#2a2a2a" opacity={0.85} />
    </Svg>
  );
}

function TapeMeasure({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      {/* yellow tape sticking out */}
      <Path d="M64,64 L92,72 L92,82 L62,76 Z" fill="#ffd23b" stroke="#d9a200" strokeWidth={1.5} />
      {/* case */}
      <Rect x={16} y={36} width={52} height={42} rx={10} fill="#f4920a" stroke="#c66f06" strokeWidth={2} />
      <Circle cx={42} cy={56} r={13} fill="#fff3da" />
      {/* pig peek */}
      <Ellipse cx={42} cy={58} rx={7} ry={5} fill={PINK} />
      <Ellipse cx={39} cy={58} rx={1.4} ry={2.2} fill={PINK_DK} />
      <Ellipse cx={45} cy={58} rx={1.4} ry={2.2} fill={PINK_DK} />
      <Circle cx={38} cy={51} r={1.8} fill={EYE} />
      <Circle cx={46} cy={51} r={1.8} fill={EYE} />
    </Svg>
  );
}

function Wolf({ size }: { size: number }) {
  const GRAY = '#8a93a0';
  const GRAY_DK = '#5f6772';
  const SNOUTG = '#c2c9d2';
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      {/* ears */}
      <Path d="M24,34 L14,8 L40,26 Z" fill={GRAY} stroke={GRAY_DK} strokeWidth={2} />
      <Path d="M76,34 L86,8 L60,26 Z" fill={GRAY} stroke={GRAY_DK} strokeWidth={2} />
      {/* head */}
      <Path d="M22,46 Q22,24 50,24 Q78,24 78,46 Q78,70 50,84 Q22,70 22,46 Z" fill={GRAY} stroke={GRAY_DK} strokeWidth={2} />
      {/* snout */}
      <Path d="M38,62 Q50,58 62,62 Q60,76 50,82 Q40,76 38,62 Z" fill={SNOUTG} />
      <Ellipse cx={50} cy={64} rx={5} ry={3.5} fill={EYE} />
      {/* eyes */}
      <Path d="M30,46 L44,44 L40,52 Z" fill="#ffd23b" />
      <Path d="M70,46 L56,44 L60,52 Z" fill="#ffd23b" />
      <Circle cx={38} cy={48} r={2} fill={EYE} />
      <Circle cx={62} cy={48} r={2} fill={EYE} />
      {/* fangs */}
      <Polygon points="44,74 47,82 50,74" fill="#fff" />
      <Polygon points="56,74 53,82 50,74" fill="#fff" />
    </Svg>
  );
}

const ROYAL: Record<string, { bg: string; bg2: string; letter: string; ink: string }> = {
  ace: { bg: '#c8324b', bg2: '#8f1f33', letter: 'A', ink: '#fff' },
  king: { bg: '#2f6fd0', bg2: '#1d4a93', letter: 'K', ink: '#fff' },
  queen: { bg: '#9a4bd0', bg2: '#6c2f96', letter: 'Q', ink: '#fff' },
  jack: { bg: '#2fa35a', bg2: '#1d703d', letter: 'J', ink: '#fff' },
};

function Royal({ id, size }: { id: string; size: number }) {
  const r = ROYAL[id];
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Rect x={18} y={12} width={64} height={76} rx={12} fill={r.bg} stroke={r.bg2} strokeWidth={3} />
      <Rect x={18} y={12} width={64} height={20} rx={12} fill="#ffffff" opacity={0.12} />
      {/* little crown accent */}
      <Path d="M36,26 L42,20 L50,26 L58,20 L64,26 L62,32 L38,32 Z" fill="#ffd23b" />
      <SvgText
        x={50}
        y={72}
        fontSize={42}
        fontWeight="bold"
        fill={r.ink}
        stroke={r.bg2}
        strokeWidth={1}
        textAnchor="middle"
      >
        {r.letter}
      </SvgText>
    </Svg>
  );
}

export function Sprite({ symbol, size }: { symbol: SymbolId; size: number }) {
  switch (symbol) {
    case 'boss':
      return <BossPig size={size} />;
    case 'pig':
      return <WorkerPig size={size} />;
    case 'hat':
      return <HardHat size={size} />;
    case 'saw':
      return <BuzzSaw size={size} />;
    case 'tape':
      return <TapeMeasure size={size} />;
    case 'wolf':
      return <Wolf size={size} />;
    case 'ace':
    case 'king':
    case 'queen':
    case 'jack':
      return <Royal id={symbol} size={size} />;
    default:
      return null;
  }
}
