import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, layout } from '../theme';
import type { SymbolId } from '../game/symbols';
import { Sprite } from './Sprites';

interface Props {
  symbol: SymbolId;
  highlighted?: boolean;
  dim?: boolean;
  size?: number;
}

// One cell of a reel. Renders the symbol's vector sprite (Sprites.tsx).
function SymbolCell({ symbol, highlighted, dim, size = layout.cell }: Props) {
  return (
    <View
      style={[
        { width: size, height: size, marginVertical: layout.gap / 2 },
        styles.cell,
        highlighted && styles.highlight,
        dim && styles.dim,
      ]}
    >
      <Sprite symbol={symbol} size={size * 0.86} />
    </View>
  );
}

const styles = StyleSheet.create({
  cell: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.reelCell,
    borderRadius: 12,
  },
  highlight: {
    backgroundColor: '#22401f',
    borderWidth: 2,
    borderColor: colors.gold,
  },
  dim: {
    opacity: 0.35,
  },
});

export default memo(SymbolCell);
