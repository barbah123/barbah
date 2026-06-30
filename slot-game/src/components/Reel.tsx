import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { colors, layout } from '../theme';
import { randomSymbol, type SymbolId } from '../game/symbols';
import SymbolCell from './SymbolCell';

const UNIT = layout.cell + layout.gap; // vertical space per cell (incl. margins)
const WINDOW_H = layout.rows * UNIT;
const FILLERS = 16; // random symbols scrolled past before the result lands

export const REEL_STAGGER = 180;
export const REEL_SPIN_MS = 720;
export const TOTAL_SPIN_MS = (layout.reels - 1) * REEL_STAGGER + REEL_SPIN_MS;

interface Props {
  index: number;
  result: SymbolId[]; // length === layout.rows, the symbols to land on
  spinId: number; // bump to trigger a spin; 0 === initial static state
  highlightRows: Set<number>; // rows participating in a win (for highlighting)
  showHighlights: boolean;
}

export default function Reel({ index, result, spinId, highlightRows, showHighlights }: Props) {
  const translateY = useRef(new Animated.Value(0)).current;

  // The strip: random fillers on top, the landing result at the bottom.
  // Rebuilt every spin so each spin scrolls through fresh symbols.
  const strip = useMemo<SymbolId[]>(() => {
    const fillers = Array.from({ length: FILLERS }, () => randomSymbol());
    return [...fillers, ...result];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinId, result.join(',')]);

  const restY = -(strip.length - layout.rows) * UNIT;

  useEffect(() => {
    if (spinId === 0) {
      // Initial render: sit on the result with no animation.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinId]);

  const firstResultIndex = strip.length - layout.rows;

  return (
    <View style={styles.window}>
      <Animated.View style={{ transform: [{ translateY }] }}>
        {strip.map((sym, i) => {
          const resultRow = i - firstResultIndex; // 0..rows-1 for landing cells
          const isResultCell = resultRow >= 0;
          const highlighted =
            showHighlights && isResultCell && highlightRows.has(resultRow);
          const dim =
            showHighlights &&
            highlightRows.size > 0 &&
            isResultCell &&
            !highlighted;
          return (
            <SymbolCell key={i} symbol={sym} highlighted={highlighted} dim={dim} />
          );
        })}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  window: {
    width: layout.cell,
    height: WINDOW_H,
    overflow: 'hidden',
    backgroundColor: colors.reelBg,
    borderRadius: 14,
    marginHorizontal: layout.gap / 2,
  },
});
