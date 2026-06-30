import { memo } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { colors, layout } from '../theme';
import { SYMBOLS, type SymbolId } from '../game/symbols';

interface Props {
  symbol: SymbolId;
  highlighted?: boolean;
  dim?: boolean;
}

// One cell of a reel. Renders the symbol's image if present, otherwise its emoji
// placeholder. Swapping placeholders for real art is just adding `image` to the
// symbol definition in game/symbols.ts.
function SymbolCell({ symbol, highlighted, dim }: Props) {
  const def = SYMBOLS[symbol];
  return (
    <View
      style={[
        styles.cell,
        highlighted && styles.highlight,
        dim && styles.dim,
      ]}
    >
      {def.image ? (
        <Image source={def.image} style={styles.image} resizeMode="contain" />
      ) : (
        <Text style={styles.glyph}>{def.glyph}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  cell: {
    width: layout.cell,
    height: layout.cell,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.reelCell,
    borderRadius: 12,
    marginVertical: layout.gap / 2,
  },
  highlight: {
    backgroundColor: '#2c2150',
    borderWidth: 2,
    borderColor: colors.gold,
  },
  dim: {
    opacity: 0.35,
  },
  glyph: {
    fontSize: layout.cell * 0.55,
  },
  image: {
    width: layout.cell * 0.78,
    height: layout.cell * 0.78,
  },
});

export default memo(SymbolCell);
