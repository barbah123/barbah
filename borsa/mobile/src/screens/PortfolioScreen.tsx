import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { api, PortfolioSummary } from '../api';
import { colors, fmtMoney, fmtPct, pnlColor } from '../theme';

export default function PortfolioScreen() {
  const [data, setData] = useState<PortfolioSummary | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api.portfolio());
    } catch {
      // geçici ağ hatası: mevcut veriyi koru
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [load]);

  const reset = () => {
    Alert.alert(
      'Portföyü sıfırla',
      'Tüm pozisyonlar, emirler ve sinyaller silinip bakiye $100.000 olacak. Emin misiniz?',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Sıfırla',
          style: 'destructive',
          onPress: async () => {
            await api.resetPortfolio();
            load();
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      {data && (
        <View style={styles.summary}>
          <View style={styles.summaryRow}>
            <Stat label="Toplam Değer" value={fmtMoney(data.equity)} />
            <Stat label="Nakit" value={fmtMoney(data.cash)} />
          </View>
          <View style={styles.summaryRow}>
            <Stat
              label="Toplam K/Z"
              value={`${fmtMoney(data.total_pnl)} (${fmtPct(data.total_pnl_percent)})`}
              color={pnlColor(data.total_pnl)}
            />
            <Pressable onPress={reset}>
              <Text style={styles.reset}>Sıfırla</Text>
            </Pressable>
          </View>
        </View>
      )}
      <FlatList
        data={data?.positions ?? []}
        keyExtractor={(item) => item.symbol}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
            tintColor={colors.muted}
          />
        }
        ListEmptyComponent={
          <Text style={styles.empty}>
            Henüz pozisyon yok. Piyasa sekmesinden bir hisse seçip alım yapın.
          </Text>
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <Text style={styles.symbol}>{item.symbol}</Text>
              <Text style={styles.detail}>
                {item.quantity} adet @ {fmtMoney(item.avg_cost)}
              </Text>
            </View>
            <View style={styles.rowRight}>
              <Text style={styles.value}>{fmtMoney(item.value)}</Text>
              <Text style={[styles.detail, { color: pnlColor(item.unrealized_pnl) }]}>
                {fmtMoney(item.unrealized_pnl)} ({fmtPct(item.unrealized_pnl_percent)})
              </Text>
            </View>
          </View>
        )}
      />
    </View>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  summary: {
    backgroundColor: colors.panel,
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 10,
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  statLabel: { color: colors.muted, fontSize: 12 },
  statValue: { color: colors.text, fontSize: 17, fontWeight: '700', fontVariant: ['tabular-nums'] },
  reset: { color: colors.muted, textDecorationLine: 'underline', fontSize: 13 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowLeft: {},
  rowRight: { alignItems: 'flex-end' },
  symbol: { color: colors.text, fontSize: 16, fontWeight: '700' },
  value: { color: colors.text, fontSize: 16, fontVariant: ['tabular-nums'] },
  detail: { color: colors.muted, fontSize: 12, marginTop: 2 },
  empty: { color: colors.muted, textAlign: 'center', marginTop: 40, paddingHorizontal: 24 },
});
