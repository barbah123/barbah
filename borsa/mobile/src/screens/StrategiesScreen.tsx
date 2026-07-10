import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import { api, Signal, Strategy } from '../api';
import { colors, fmtMoney, pnlColor } from '../theme';

const TYPE_LABELS: Record<string, string> = {
  sma_cross: 'SMA Kesişimi',
  rsi: 'RSI',
};

const SIGNAL_STATUS: Record<Signal['status'], string> = {
  new: 'Yeni',
  executed: 'İşlendi',
  skipped: 'Atlandı',
};

export default function StrategiesScreen() {
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [symbol, setSymbol] = useState('');
  const [type, setType] = useState<'sma_cross' | 'rsi'>('sma_cross');
  const [qty, setQty] = useState('1');
  const [autoExecute, setAutoExecute] = useState(true);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, g] = await Promise.all([api.strategies(), api.signals()]);
      setStrategies(s.strategies);
      setSignals(g.signals);
    } catch {
      // geçici ağ hatası: mevcut veriyi koru
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 15000);
    return () => clearInterval(timer);
  }, [load]);

  const create = async () => {
    try {
      await api.createStrategy({
        symbol: symbol.trim().toUpperCase(),
        type,
        quantity: Number(qty) || 1,
        auto_execute: autoExecute,
      });
      setSymbol('');
      load();
    } catch (e: any) {
      Alert.alert('Hata', e.message);
    }
  };

  const runNow = async () => {
    setRunning(true);
    try {
      const { summary } = await api.runStrategies();
      Alert.alert(
        'Tamamlandı',
        `${summary.evaluated} strateji değerlendirildi, ${summary.signals} sinyal üretildi, ${summary.executed} emir gerçekleşti.`
      );
      load();
    } catch (e: any) {
      Alert.alert('Hata', e.message);
    } finally {
      setRunning(false);
    }
  };

  const remove = (s: Strategy) => {
    Alert.alert('Stratejiyi sil', `${s.symbol} — ${TYPE_LABELS[s.type]} silinsin mi?`, [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          await api.deleteStrategy(s.id);
          load();
        },
      },
    ]);
  };

  return (
    <ScrollView
      style={styles.container}
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
    >
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Yeni Strateji</Text>
        <View style={styles.formRow}>
          <TextInput
            style={styles.input}
            placeholder="Sembol"
            placeholderTextColor={colors.muted}
            value={symbol}
            onChangeText={setSymbol}
            autoCapitalize="characters"
            autoCorrect={false}
          />
          <TextInput
            style={[styles.input, { width: 70 }]}
            placeholder="Adet"
            placeholderTextColor={colors.muted}
            value={qty}
            onChangeText={setQty}
            keyboardType="numeric"
          />
        </View>
        <View style={styles.formRow}>
          {(['sma_cross', 'rsi'] as const).map((t) => (
            <Pressable
              key={t}
              style={[styles.typeBtn, type === t && styles.typeBtnActive]}
              onPress={() => setType(t)}
            >
              <Text style={[styles.typeText, type === t && { color: '#0d1117' }]}>
                {TYPE_LABELS[t]}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={[styles.formRow, { alignItems: 'center' }]}>
          <Text style={styles.label}>Sinyali otomatik emre çevir</Text>
          <Switch
            value={autoExecute}
            onValueChange={setAutoExecute}
            trackColor={{ true: colors.accent, false: colors.border }}
          />
        </View>
        <View style={styles.formRow}>
          <Pressable style={styles.primaryBtn} onPress={create}>
            <Text style={styles.primaryBtnText}>Ekle</Text>
          </Pressable>
          <Pressable style={styles.ghostBtn} onPress={runNow} disabled={running}>
            <Text style={styles.ghostBtnText}>{running ? 'Çalışıyor…' : '▶ Şimdi Çalıştır'}</Text>
          </Pressable>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Stratejiler</Text>
      {strategies.length === 0 && (
        <Text style={styles.empty}>Strateji yok. Cron her 5 dakikada etkin stratejileri değerlendirir.</Text>
      )}
      {strategies.map((s) => (
        <View key={s.id} style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.symbol}>
              {s.symbol} {s.auto_execute ? '🤖' : ''}
            </Text>
            <Text style={styles.detail}>
              {TYPE_LABELS[s.type]} ·{' '}
              {Object.entries(s.params)
                .map(([k, v]) => `${k}=${v}`)
                .join(', ')}{' '}
              · {s.quantity} adet
            </Text>
          </View>
          <Switch
            value={!!s.enabled}
            onValueChange={async (v) => {
              await api.updateStrategy(s.id, { enabled: v });
              load();
            }}
            trackColor={{ true: colors.green, false: colors.border }}
          />
          <Pressable onPress={() => remove(s)} style={{ marginLeft: 10 }}>
            <Text style={{ color: colors.red }}>Sil</Text>
          </Pressable>
        </View>
      ))}

      <Text style={styles.sectionTitle}>Son Sinyaller</Text>
      {signals.length === 0 && <Text style={styles.empty}>Henüz sinyal üretilmedi.</Text>}
      {signals.slice(0, 30).map((s) => (
        <View key={s.id} style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.symbol}>
              <Text style={{ color: s.action === 'buy' ? colors.green : colors.red }}>
                {s.action === 'buy' ? 'AL' : 'SAT'}
              </Text>{' '}
              {s.symbol} @ {fmtMoney(s.price)}
            </Text>
            <Text style={styles.detail}>{s.reason}</Text>
            {s.note ? <Text style={[styles.detail, { color: colors.red }]}>{s.note}</Text> : null}
          </View>
          <Text
            style={{
              color:
                s.status === 'executed'
                  ? colors.green
                  : s.status === 'skipped'
                    ? colors.muted
                    : colors.accent,
              fontSize: 12,
            }}
          >
            {SIGNAL_STATUS[s.status]}
          </Text>
        </View>
      ))}
      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  card: {
    margin: 12,
    padding: 14,
    backgroundColor: colors.panel,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10,
  },
  cardTitle: { color: colors.text, fontWeight: '700', fontSize: 15 },
  formRow: { flexDirection: 'row', gap: 10, justifyContent: 'space-between' },
  input: {
    flex: 1,
    padding: 10,
    backgroundColor: colors.panel2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    color: colors.text,
  },
  typeBtn: {
    flex: 1,
    padding: 10,
    backgroundColor: colors.panel2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    alignItems: 'center',
  },
  typeBtnActive: { backgroundColor: colors.accent },
  typeText: { color: colors.muted, fontWeight: '600' },
  label: { color: colors.muted },
  primaryBtn: {
    flex: 1,
    padding: 12,
    backgroundColor: colors.accent,
    borderRadius: 8,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#0d1117', fontWeight: '800' },
  ghostBtn: {
    flex: 1,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    alignItems: 'center',
  },
  ghostBtnText: { color: colors.text, fontWeight: '600' },
  sectionTitle: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 15,
    marginHorizontal: 12,
    marginTop: 14,
    marginBottom: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  symbol: { color: colors.text, fontWeight: '700' },
  detail: { color: colors.muted, fontSize: 12, marginTop: 2 },
  empty: { color: colors.muted, marginHorizontal: 12, marginBottom: 8, fontSize: 13 },
});
