import { StyleSheet, Text, View } from 'react-native';
import { colors, formatTL } from '../theme';
import { TIERS } from '../game/jackpots';

// The four-tier jackpot ladder shown above the reels. Values scale with the
// current total bet (e.g. GRAND = 15,000x bet).
export default function JackpotBar({ bet }: { bet: number }) {
  return (
    <View style={styles.row}>
      {TIERS.map((t) => (
        <View key={t.id} style={[styles.pill, { borderColor: t.color }]}>
          <Text style={[styles.label, { color: t.color }]}>{t.label}</Text>
          <Text style={styles.value}>{formatTL(t.mult * bet)}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 5,
  },
  pill: {
    flex: 1,
    backgroundColor: colors.bgDeep,
    borderRadius: 10,
    borderWidth: 1.5,
    paddingVertical: 6,
    alignItems: 'center',
  },
  label: { fontSize: 11, fontWeight: '900', letterSpacing: 0.5 },
  value: { color: colors.text, fontSize: 8.5, fontWeight: '700', marginTop: 1 },
});
