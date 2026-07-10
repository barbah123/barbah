import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { api, Quote } from '../api';
import { colors, fmtMoney, fmtPct, pnlColor } from '../theme';
import type { MarketsStackParamList } from '../../App';

type Props = NativeStackScreenProps<MarketsStackParamList, 'Markets'>;

interface Row {
  symbol: string;
  quote: Quote | null;
}

export default function MarketsScreen({ navigation }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ symbol: string; name: string; exchange: string }[]>([]);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      const { watchlist } = await api.watchlist();
      setRows(watchlist);
    } catch {
      // ağ hatasında mevcut listeyi koru
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [load]);

  const onSearch = (text: string) => {
    setQuery(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (text.trim().length < 2) {
      setResults([]);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      try {
        const { results } = await api.search(text.trim());
        setResults(results);
      } catch {
        setResults([]);
      }
    }, 300);
  };

  const addSymbol = async (symbol: string) => {
    setQuery('');
    setResults([]);
    try {
      await api.addToWatchlist(symbol);
      await load();
      navigation.navigate('StockDetail', { symbol });
    } catch (e: any) {
      Alert.alert('Hata', e.message);
    }
  };

  const removeSymbol = (symbol: string) => {
    Alert.alert('Listeden çıkar', `${symbol} izleme listesinden çıkarılsın mı?`, [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Çıkar',
        style: 'destructive',
        onPress: async () => {
          await api.removeFromWatchlist(symbol);
          load();
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.search}
        placeholder="Sembol ara (örn. AAPL, Tesla)…"
        placeholderTextColor={colors.muted}
        value={query}
        onChangeText={onSearch}
        autoCapitalize="characters"
        autoCorrect={false}
      />
      {results.length > 0 && (
        <View style={styles.results}>
          {results.slice(0, 6).map((r) => (
            <Pressable key={r.symbol} style={styles.resultItem} onPress={() => addSymbol(r.symbol)}>
              <Text style={styles.resultSymbol}>{r.symbol}</Text>
              <Text style={styles.resultName} numberOfLines={1}>
                {r.name} · {r.exchange}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
      <FlatList
        data={rows}
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
          <Text style={styles.empty}>İzleme listesi boş. Yukarıdan sembol arayıp ekleyin.</Text>
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.row}
            onPress={() => navigation.navigate('StockDetail', { symbol: item.symbol })}
            onLongPress={() => removeSymbol(item.symbol)}
          >
            <View>
              <Text style={styles.symbol}>{item.symbol}</Text>
              {item.quote?.name ? (
                <Text style={styles.name} numberOfLines={1}>
                  {item.quote.name}
                </Text>
              ) : null}
            </View>
            <View style={styles.quoteCol}>
              <Text style={styles.price}>{item.quote ? fmtMoney(item.quote.price) : '—'}</Text>
              {item.quote ? (
                <Text style={[styles.change, { color: pnlColor(item.quote.changePercent) }]}>
                  {fmtPct(item.quote.changePercent)}
                </Text>
              ) : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  search: {
    margin: 12,
    padding: 10,
    backgroundColor: colors.panel2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
  },
  results: {
    marginHorizontal: 12,
    marginBottom: 8,
    backgroundColor: colors.panel2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  resultItem: {
    padding: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  resultSymbol: { color: colors.text, fontWeight: '700' },
  resultName: { color: colors.muted, fontSize: 12 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  symbol: { color: colors.text, fontSize: 16, fontWeight: '700' },
  name: { color: colors.muted, fontSize: 12, maxWidth: 200 },
  quoteCol: { alignItems: 'flex-end' },
  price: { color: colors.text, fontSize: 16, fontVariant: ['tabular-nums'] },
  change: { fontSize: 13 },
  empty: { color: colors.muted, textAlign: 'center', marginTop: 40, paddingHorizontal: 24 },
});
