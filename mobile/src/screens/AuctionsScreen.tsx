import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { api } from '../api';

type Auction = {
  id: string;
  title: string;
  description: string;
  current_price: number;
  starting_price: number;
  status: string;
  ends_at: number;
  seller_username: string;
};

function formatEnds(endsAt: number): string {
  const ms = endsAt * 1000 - Date.now();
  if (ms <= 0) return 'Bitti';
  const hours = Math.floor(ms / 3_600_000);
  const mins = Math.floor((ms % 3_600_000) / 60_000);
  if (hours >= 24) return `${Math.floor(hours / 24)}g ${hours % 24}s kaldı`;
  return `${hours}s ${mins}d kaldı`;
}

export default function AuctionsScreen({ onLogout }: { onLogout: () => void }) {
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await api.auctions.list('active');
      setAuctions(data as Auction[]);
    } catch (e: any) {
      setError(e?.message ?? 'Liste yüklenemedi');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Aktif Açık Artırmalar</Text>
        <Pressable onPress={onLogout} hitSlop={8}>
          <Text style={styles.logout}>Çıkış</Text>
        </Pressable>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <FlatList
        data={auctions}
        keyExtractor={(item) => item.id}
        contentContainerStyle={auctions.length === 0 ? styles.emptyWrap : undefined}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <Text style={styles.empty}>Henüz aktif açık artırma yok.{'\n'}Aşağı çekerek yenileyin.</Text>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{item.title}</Text>
            {!!item.description && <Text style={styles.cardDesc}>{item.description}</Text>}
            <View style={styles.cardRow}>
              <Text style={styles.price}>{item.current_price} ₺</Text>
              <Text style={styles.meta}>{formatEnds(item.ends_at)}</Text>
            </View>
            <Text style={styles.seller}>Satıcı: {item.seller_username}</Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f3f4f6' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#1f2937' },
  logout: { color: '#dc2626', fontSize: 14, fontWeight: '600' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginTop: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  cardDesc: { fontSize: 14, color: '#6b7280', marginTop: 4 },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
  price: { fontSize: 18, fontWeight: '700', color: '#2563eb' },
  meta: { fontSize: 13, color: '#6b7280' },
  seller: { fontSize: 12, color: '#9ca3af', marginTop: 8 },
  empty: { textAlign: 'center', color: '#6b7280', fontSize: 15, lineHeight: 22 },
  emptyWrap: { flexGrow: 1, justifyContent: 'center' },
  error: { color: '#dc2626', textAlign: 'center', padding: 12 },
});
