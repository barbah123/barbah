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

import { api, Order } from '../api';
import { colors, fmtMoney, pnlColor } from '../theme';

const STATUS_TR: Record<Order['status'], string> = {
  open: 'Açık',
  filled: 'Gerçekleşti',
  cancelled: 'İptal',
  rejected: 'Reddedildi',
};

const STATUS_COLOR: Record<Order['status'], string> = {
  open: colors.accent,
  filled: colors.green,
  cancelled: colors.muted,
  rejected: colors.red,
};

export default function OrdersScreen() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const { orders } = await api.orders();
      setOrders(orders);
    } catch {
      // geçici ağ hatası: mevcut listeyi koru
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 10000);
    return () => clearInterval(timer);
  }, [load]);

  const cancel = (order: Order) => {
    Alert.alert('Emri iptal et', `${order.symbol} ${order.quantity} adet limit emri iptal edilsin mi?`, [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'İptal Et',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.cancelOrder(order.id);
            load();
          } catch (e: any) {
            Alert.alert('Hata', e.message);
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={orders}
        keyExtractor={(item) => item.id}
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
        ListEmptyComponent={<Text style={styles.empty}>Henüz emir yok.</Text>}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.left}>
              <Text style={styles.symbol}>
                <Text style={{ color: item.side === 'buy' ? colors.green : colors.red }}>
                  {item.side === 'buy' ? 'AL' : 'SAT'}
                </Text>{' '}
                {item.symbol} {item.source === 'strategy' ? '🤖' : ''}
              </Text>
              <Text style={styles.detail}>
                {item.quantity} adet · {item.type === 'market' ? 'Piyasa' : `Limit ${fmtMoney(item.limit_price!)}`}
              </Text>
              {item.note ? <Text style={styles.note}>{item.note}</Text> : null}
            </View>
            <View style={styles.right}>
              <Text style={[styles.status, { color: STATUS_COLOR[item.status] }]}>
                {STATUS_TR[item.status]}
              </Text>
              {item.fill_price != null && (
                <Text style={styles.detail}>@ {fmtMoney(item.fill_price)}</Text>
              )}
              {item.realized_pnl != null && (
                <Text style={[styles.detail, { color: pnlColor(item.realized_pnl) }]}>
                  K/Z {fmtMoney(item.realized_pnl)}
                </Text>
              )}
              {item.status === 'open' && (
                <Pressable onPress={() => cancel(item)}>
                  <Text style={styles.cancel}>İptal</Text>
                </Pressable>
              )}
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  left: { flex: 1, paddingRight: 10 },
  right: { alignItems: 'flex-end' },
  symbol: { color: colors.text, fontSize: 15, fontWeight: '700' },
  detail: { color: colors.muted, fontSize: 12, marginTop: 2 },
  note: { color: colors.red, fontSize: 12, marginTop: 2 },
  status: { fontSize: 13, fontWeight: '600' },
  cancel: { color: colors.red, fontSize: 13, marginTop: 6, textDecorationLine: 'underline' },
  empty: { color: colors.muted, textAlign: 'center', marginTop: 40 },
});
