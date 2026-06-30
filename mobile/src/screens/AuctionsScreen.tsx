import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api';
import { colors, timeLeft } from '../theme';
import Thumb from '../components/Thumb';

type Auction = {
  id: string;
  title: string;
  description: string;
  current_price: number;
  card_image_key: string;
  status: string;
  ends_at: number;
  seller_username: string;
};

export default function AuctionsScreen({
  onLogout,
  onOpen,
  onCreate,
}: {
  onLogout: () => void;
  onOpen: (id: string) => void;
  onCreate: () => void;
}) {
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setAuctions((await api.auctions.list('active')) as Auction[]);
    } catch (e: any) {
      setError(e?.message ?? 'Liste yüklenemedi');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Açık Artırmalar</Text>
          <Text style={styles.headerSub}>{auctions.length} aktif ilan</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Pressable onPress={onCreate} hitSlop={8} style={styles.createBtn}>
            <Text style={styles.createText}>+ Yeni</Text>
          </Pressable>
          <Pressable onPress={onLogout} hitSlop={8} style={styles.logoutBtn}>
            <Text style={styles.logout}>Çıkış</Text>
          </Pressable>
        </View>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <FlatList
        data={auctions}
        keyExtractor={(item) => item.id}
        contentContainerStyle={auctions.length === 0 ? styles.emptyWrap : { padding: 16 }}
        refreshControl={
          <RefreshControl
            tintColor={colors.sub}
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
          />
        }
        ListEmptyComponent={
          <Text style={styles.empty}>Henüz aktif açık artırma yok.{'\n'}Aşağı çekerek yenileyin.</Text>
        }
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
            onPress={() => onOpen(item.id)}
          >
            <Thumb imageKey={item.card_image_key} size={64} />
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
              <Text style={styles.seller}>@{item.seller_username}</Text>
              <View style={styles.cardRow}>
                <Text style={styles.price}>{item.current_price} ₺</Text>
                <View style={styles.pill}>
                  <Text style={styles.pillText}>⏱ {timeLeft(item.ends_at)}</Text>
                </View>
              </View>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: colors.text },
  headerSub: { fontSize: 12, color: colors.sub, marginTop: 2 },
  createBtn: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: colors.primary, borderRadius: 8, marginRight: 8 },
  createText: { color: colors.primaryText, fontSize: 14, fontWeight: '700' },
  logoutBtn: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: colors.card, borderRadius: 8 },
  logout: { color: colors.danger, fontSize: 14, fontWeight: '700' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  seller: { fontSize: 13, color: colors.sub, marginTop: 2 },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  price: { fontSize: 18, fontWeight: '800', color: colors.accent },
  pill: { backgroundColor: colors.card2, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  pillText: { color: colors.sub, fontSize: 12, fontWeight: '600' },
  empty: { textAlign: 'center', color: colors.sub, fontSize: 15, lineHeight: 22 },
  emptyWrap: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  error: { color: colors.danger, textAlign: 'center', padding: 12 },
});
