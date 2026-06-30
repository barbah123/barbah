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
import { colors } from '../theme';
import Thumb from '../components/Thumb';
import Countdown from '../components/Countdown';

type Selling = {
  id: string;
  title: string;
  card_image_key: string;
  current_price: number;
  status: string;
  ends_at: number;
};
type MyBid = {
  id: string;
  title: string;
  card_image_key: string;
  current_price: number;
  status: string;
  ends_at: number;
  my_bid: number;
  winning: number;
};

type Tab = 'selling' | 'bids' | 'favorites';

export default function ProfileScreen({
  onBack,
  onLogout,
  onOpen,
}: {
  onBack: () => void;
  onLogout: () => void;
  onOpen: (id: string) => void;
}) {
  const [user, setUser] = useState<{ username: string; email: string } | null>(null);
  const [tab, setTab] = useState<Tab>('selling');
  const [selling, setSelling] = useState<Selling[]>([]);
  const [bids, setBids] = useState<MyBid[]>([]);
  const [favorites, setFavorites] = useState<Selling[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [u, s, b, f] = await Promise.all([
        api.auth.currentUser(),
        api.me.auctions(),
        api.me.bids(),
        api.me.favorites(),
      ]);
      setUser(u as any);
      setSelling(s as Selling[]);
      setBids(b as MyBid[]);
      setFavorites(f as Selling[]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const initial = user?.username?.[0]?.toUpperCase() ?? '?';

  function bidStatus(item: MyBid) {
    const ended = item.status !== 'active' || item.ends_at * 1000 <= Date.now();
    if (ended) return item.winning ? { t: 'Kazandın 🏆', c: colors.good } : { t: 'Kaybettin', c: colors.sub };
    return item.winning ? { t: 'Önde 🟢', c: colors.good } : { t: 'Geçildin 🔴', c: colors.danger };
  }

  const data = tab === 'selling' ? selling : tab === 'bids' ? bids : favorites;

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={8}>
          <Text style={styles.back}>← Geri</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Hesabım</Text>
        <Pressable onPress={onLogout} hitSlop={8}>
          <Text style={styles.logout}>Çıkış</Text>
        </Pressable>
      </View>

      <View style={styles.profile}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.username}>{user?.username ?? '...'}</Text>
          <Text style={styles.email}>{user?.email ?? ''}</Text>
        </View>
      </View>

      <View style={styles.tabs}>
        <Pressable style={[styles.tab, tab === 'selling' && styles.tabActive]} onPress={() => setTab('selling')}>
          <Text style={[styles.tabText, tab === 'selling' && styles.tabTextActive]}>Sattıklarım ({selling.length})</Text>
        </Pressable>
        <Pressable style={[styles.tab, tab === 'bids' && styles.tabActive]} onPress={() => setTab('bids')}>
          <Text style={[styles.tabText, tab === 'bids' && styles.tabTextActive]}>Tekliflerim ({bids.length})</Text>
        </Pressable>
        <Pressable style={[styles.tab, tab === 'favorites' && styles.tabActive]} onPress={() => setTab('favorites')}>
          <Text style={[styles.tabText, tab === 'favorites' && styles.tabTextActive]}>Favoriler ({favorites.length})</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={data as any[]}
          keyExtractor={(item) => item.id}
          contentContainerStyle={data.length === 0 ? styles.emptyWrap : { padding: 16 }}
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
            <Text style={styles.empty}>
              {tab === 'selling'
                ? 'Henüz ilan oluşturmadın.'
                : tab === 'bids'
                ? 'Henüz teklif vermedin.'
                : 'Henüz favori eklemedin.'}
            </Text>
          }
          renderItem={({ item }) => {
            const ended = item.status !== 'active' || item.ends_at * 1000 <= Date.now();
            return (
              <Pressable
                style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
                onPress={() => onOpen(item.id)}
              >
                <Thumb imageKey={item.card_image_key} size={56} />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
                  {tab === 'bids' ? (
                    <View style={styles.row}>
                      <Text style={styles.sub}>Teklifin: <Text style={styles.bid}>{(item as MyBid).my_bid} ₺</Text></Text>
                      <Text style={[styles.badgeText, { color: bidStatus(item as MyBid).c }]}>{bidStatus(item as MyBid).t}</Text>
                    </View>
                  ) : (
                    <View style={styles.row}>
                      <Text style={styles.price}>{item.current_price} ₺</Text>
                      <Text style={[styles.badgeText, { color: ended ? colors.sub : colors.good }]}>
                        {ended ? 'Bitti' : 'Aktif'}
                      </Text>
                    </View>
                  )}
                  {!ended && <Countdown endsAt={item.ends_at} prefix="⏱ " style={styles.time} />}
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  back: { color: colors.primary, fontSize: 16, fontWeight: '700' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
  logout: { color: colors.danger, fontSize: 14, fontWeight: '700' },
  profile: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  avatarText: { color: colors.primaryText, fontSize: 24, fontWeight: '800' },
  username: { fontSize: 18, fontWeight: '800', color: colors.text },
  email: { fontSize: 13, color: colors.sub, marginTop: 2 },
  tabs: { flexDirection: 'row', paddingHorizontal: 16, marginBottom: 4 },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: colors.primary },
  tabText: { color: colors.sub, fontSize: 14, fontWeight: '700' },
  tabTextActive: { color: colors.text },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
  sub: { color: colors.sub, fontSize: 13 },
  bid: { color: colors.accent, fontWeight: '700' },
  price: { color: colors.accent, fontSize: 16, fontWeight: '800' },
  badgeText: { fontSize: 13, fontWeight: '700' },
  time: { color: colors.sub, fontSize: 12, marginTop: 6 },
  empty: { textAlign: 'center', color: colors.sub, fontSize: 15 },
  emptyWrap: { flexGrow: 1, justifyContent: 'center', padding: 24 },
});
