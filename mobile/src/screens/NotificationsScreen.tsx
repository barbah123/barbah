import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { api } from '../api';
import { colors } from '../theme';

type Notif = {
  id: string;
  auction_id: string | null;
  message: string;
  read: number;
  created_at: number;
};

function ago(ts: number): string {
  const s = Math.floor(Date.now() / 1000 - ts);
  if (s < 60) return 'az önce';
  if (s < 3600) return `${Math.floor(s / 60)} dk önce`;
  if (s < 86400) return `${Math.floor(s / 3600)} sa önce`;
  return `${Math.floor(s / 86400)} g önce`;
}

export default function NotificationsScreen({
  onBack,
  onOpen,
}: {
  onBack: () => void;
  onOpen: (id: string) => void;
}) {
  const [items, setItems] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.me.notifications();
        setItems((data as any).items as Notif[]);
        await api.me.markNotificationsRead();
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={8}>
          <Text style={styles.back}>← Geri</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Bildirimler</Text>
        <View style={{ width: 52 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={items.length === 0 ? styles.emptyWrap : { padding: 16 }}
          ListEmptyComponent={<Text style={styles.empty}>Henüz bildirim yok.</Text>}
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [styles.row, !item.read && styles.unread, pressed && { opacity: 0.85 }]}
              disabled={!item.auction_id}
              onPress={() => item.auction_id && onOpen(item.auction_id)}
            >
              <Text style={styles.icon}>🔔</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.message}>{item.message}</Text>
                <Text style={styles.time}>{ago(item.created_at)}</Text>
              </View>
              {!item.read && <View style={styles.dot} />}
            </Pressable>
          )}
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
  back: { color: colors.primary, fontSize: 16, fontWeight: '700', width: 52 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  unread: { backgroundColor: colors.card2 },
  icon: { fontSize: 20, marginRight: 12 },
  message: { color: colors.text, fontSize: 14, lineHeight: 19 },
  time: { color: colors.sub, fontSize: 12, marginTop: 4 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary, marginLeft: 8 },
  empty: { textAlign: 'center', color: colors.sub, fontSize: 15 },
  emptyWrap: { flexGrow: 1, justifyContent: 'center', padding: 24 },
});
