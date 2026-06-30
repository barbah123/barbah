import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, Reading } from '../api';
import { colors, timeAgo } from '../theme';

export default function HistoryScreen({
  onBack,
  onOpen,
}: {
  onBack: () => void;
  onOpen: (reading: Reading) => void;
}) {
  const insets = useSafeAreaInsets();
  const [readings, setReadings] = useState<Reading[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    try {
      setReadings(await api.readings.list());
    } catch {
      setReadings([]);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  return (
    <View style={[styles.flex, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={10}>
          <Text style={styles.back}>‹ Geri</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Geçmiş Fallar</Text>
        <View style={{ width: 54 }} />
      </View>

      {readings === null ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={readings}
          keyExtractor={(r) => r.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyEmoji}>☕</Text>
              <Text style={styles.empty}>Henüz fal baktırmadın.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable style={styles.item} onPress={() => onOpen(item)}>
              <View style={styles.itemTop}>
                <Text style={styles.itemType}>{item.type === 'photo' ? '📷' : '✍️'}</Text>
                <Text style={styles.itemTime}>{timeAgo(item.created_at)}</Text>
              </View>
              {item.question ? <Text style={styles.itemQuestion} numberOfLines={1}>{item.question}</Text> : null}
              <Text style={styles.itemPreview} numberOfLines={2}>
                {item.result}
              </Text>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  back: { color: colors.accent, fontSize: 16, fontWeight: '700', width: 54 },
  headerTitle: { color: colors.text, fontSize: 18, fontWeight: '800' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  empty: { color: colors.sub, fontSize: 16 },
  list: { padding: 16, gap: 12 },
  item: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  itemTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  itemType: { fontSize: 16 },
  itemTime: { color: colors.sub, fontSize: 12 },
  itemQuestion: { color: colors.accent, fontSize: 14, fontStyle: 'italic', marginBottom: 4 },
  itemPreview: { color: colors.text, fontSize: 15, lineHeight: 21 },
});
