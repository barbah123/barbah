import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';
import { SYMBOLS, type SymbolDef } from '../game/symbols';
import SymbolCell from './SymbolCell';

interface Props {
  visible: boolean;
  onClose: () => void;
}

const ORDER = Object.values(SYMBOLS);

function PayRow({ def }: { def: SymbolDef }) {
  return (
    <View style={styles.row}>
      <View style={styles.cellWrap}>
        <SymbolCell symbol={def.id} />
      </View>
      <View style={styles.info}>
        <Text style={styles.name}>{def.label}</Text>
        {def.role === 'wild' ? (
          <Text style={styles.note}>Baret hariç tüm sembollerin yerine geçer.</Text>
        ) : def.role === 'scatter' ? (
          <Text style={styles.note}>3+ baret Bonus Çarkını döndürür.</Text>
        ) : (
          <Text style={styles.pays}>
            x5: {def.pays[5]}   x4: {def.pays[4]}   x3: {def.pays[3]}
          </Text>
        )}
      </View>
    </View>
  );
}

export default function Paytable({ visible, onClose }: Props) {
  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>ÖDEME TABLOSU</Text>
            <Pressable onPress={onClose} style={styles.close}>
              <Text style={styles.closeText}>✕</Text>
            </Pressable>
          </View>
          <Text style={styles.subtitle}>
            243 yön ile kazanç • soldan sağa ardışık makaralarda eşleşme
          </Text>
          <ScrollView contentContainerStyle={styles.list}>
            {ORDER.map((def) => (
              <PayRow key={def.id} def={def} />
            ))}
            <Text style={styles.footer}>
              Kazançlar çizgi başına çarpan × yön sayısı × bahis ile hesaplanır.
            </Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(3,12,6,0.85)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 28,
    maxHeight: '85%',
    borderWidth: 2,
    borderColor: colors.panelBorder,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: { color: colors.gold, fontSize: 22, fontWeight: '900', letterSpacing: 1 },
  close: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.panel,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: { color: colors.text, fontSize: 16, fontWeight: '800' },
  subtitle: { color: colors.textDim, fontSize: 12, marginTop: 6, marginBottom: 10 },
  list: { paddingBottom: 20 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(62,207,91,0.15)',
  },
  cellWrap: { marginRight: 14 },
  info: { flex: 1 },
  name: { color: colors.text, fontSize: 15, fontWeight: '800' },
  pays: { color: colors.gold, fontSize: 14, fontWeight: '700', marginTop: 2 },
  note: { color: colors.textDim, fontSize: 13, marginTop: 2 },
  footer: { color: colors.textDim, fontSize: 12, marginTop: 16, fontStyle: 'italic' },
});
