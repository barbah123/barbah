import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { api, Position, Quote } from '../api';
import { colors, fmtMoney, fmtPct, pnlColor } from '../theme';
import type { MarketsStackParamList } from '../../App';

type Props = NativeStackScreenProps<MarketsStackParamList, 'StockDetail'>;

// TradingView gelişmiş grafik widget'ı WebView içinde gömülür
function chartHtml(symbol: string): string {
  return `<!DOCTYPE html><html><head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>html,body,#tv{margin:0;height:100%;background:#0d1117}</style>
  </head><body>
    <div id="tv"></div>
    <script src="https://s3.tradingview.com/tv.js"></script>
    <script>
      new TradingView.widget({
        container_id: 'tv',
        symbol: ${JSON.stringify(symbol)},
        interval: '5',
        timezone: 'Europe/Istanbul',
        theme: 'dark',
        style: '1',
        locale: 'tr',
        autosize: true,
        hide_side_toolbar: true,
        allow_symbol_change: false
      });
    </script>
  </body></html>`;
}

export default function StockDetailScreen({ route }: Props) {
  const { symbol } = route.params;
  const [quote, setQuote] = useState<Quote | null>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [type, setType] = useState<'market' | 'limit'>('market');
  const [qty, setQty] = useState('1');
  const [limitPrice, setLimitPrice] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [{ quotes }, portfolio] = await Promise.all([api.quotes([symbol]), api.portfolio()]);
      setQuote(quotes[0] ?? null);
      setPosition(portfolio.positions.find((p) => p.symbol === symbol) ?? null);
    } catch {
      // geçici ağ hatası: mevcut veriyi koru
    }
  }, [symbol]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [load]);

  const submit = async () => {
    const quantity = Number(qty);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      Alert.alert('Hata', 'Geçerli bir adet girin');
      return;
    }
    setBusy(true);
    try {
      const { order } = await api.placeOrder({
        symbol,
        side,
        type,
        quantity,
        ...(type === 'limit' ? { limit_price: Number(limitPrice) } : {}),
      });
      Alert.alert(
        'Emir alındı',
        order.status === 'filled'
          ? `${side === 'buy' ? 'ALIŞ' : 'SATIŞ'} ${quantity} ${symbol} @ ${fmtMoney(order.fill_price!)}`
          : `Limit emri açıldı: ${quantity} ${symbol} @ ${fmtMoney(order.limit_price!)}`
      );
      load();
    } catch (e: any) {
      Alert.alert('Emir reddedildi', e.message);
    } finally {
      setBusy(false);
    }
  };

  const estUnit = type === 'limit' ? Number(limitPrice) || 0 : quote?.price ?? 0;
  const estCost = estUnit * (Number(qty) || 0);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.chart}>
        <WebView
          source={{ html: chartHtml(symbol), baseUrl: 'https://www.tradingview.com' }}
          style={{ backgroundColor: colors.bg }}
          javaScriptEnabled
          domStorageEnabled
        />
      </View>
      <ScrollView style={styles.panel} keyboardShouldPersistTaps="handled">
        <View style={styles.headerRow}>
          <Text style={styles.price}>{quote ? fmtMoney(quote.price) : '—'}</Text>
          {quote ? (
            <Text style={[styles.changeText, { color: pnlColor(quote.changePercent) }]}>
              {fmtPct(quote.changePercent)}
            </Text>
          ) : null}
        </View>
        {position ? (
          <Text style={styles.position}>
            Pozisyon: {position.quantity} adet @ {fmtMoney(position.avg_cost)} · K/Z{' '}
            <Text style={{ color: pnlColor(position.unrealized_pnl) }}>
              {fmtMoney(position.unrealized_pnl)}
            </Text>
          </Text>
        ) : (
          <Text style={styles.position}>Bu hissede pozisyon yok</Text>
        )}

        <View style={styles.segRow}>
          <Seg
            options={[
              { value: 'buy', label: 'AL', activeColor: colors.green },
              { value: 'sell', label: 'SAT', activeColor: colors.red },
            ]}
            value={side}
            onChange={(v) => setSide(v as 'buy' | 'sell')}
          />
          <Seg
            options={[
              { value: 'market', label: 'Piyasa', activeColor: colors.accent },
              { value: 'limit', label: 'Limit', activeColor: colors.accent },
            ]}
            value={type}
            onChange={(v) => setType(v as 'market' | 'limit')}
          />
        </View>

        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={qty}
            onChangeText={setQty}
            keyboardType="numeric"
            placeholder="Adet"
            placeholderTextColor={colors.muted}
          />
          {type === 'limit' && (
            <TextInput
              style={styles.input}
              value={limitPrice}
              onChangeText={setLimitPrice}
              keyboardType="numeric"
              placeholder="Limit fiyat"
              placeholderTextColor={colors.muted}
            />
          )}
          <Text style={styles.est}>{estCost > 0 ? `≈ ${fmtMoney(estCost)}` : ''}</Text>
        </View>

        <Pressable
          style={[
            styles.submit,
            { backgroundColor: side === 'buy' ? colors.green : colors.red, opacity: busy ? 0.6 : 1 },
          ]}
          onPress={submit}
          disabled={busy}
        >
          <Text style={styles.submitText}>
            {busy ? 'Gönderiliyor…' : side === 'buy' ? `${symbol} AL` : `${symbol} SAT`}
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Seg({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string; activeColor: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <View style={styles.seg}>
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <Pressable
            key={opt.value}
            style={[styles.segBtn, active && { backgroundColor: opt.activeColor }]}
            onPress={() => onChange(opt.value)}
          >
            <Text style={[styles.segText, active && { color: '#0d1117' }]}>{opt.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  chart: { flex: 1, minHeight: 280 },
  panel: {
    backgroundColor: colors.panel,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: 14,
    maxHeight: 300,
  },
  headerRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  price: { color: colors.text, fontSize: 22, fontWeight: '700', fontVariant: ['tabular-nums'] },
  changeText: { fontSize: 15 },
  position: { color: colors.muted, marginTop: 4, marginBottom: 12, fontSize: 13 },
  segRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  seg: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    overflow: 'hidden',
  },
  segBtn: { paddingVertical: 8, paddingHorizontal: 16, backgroundColor: colors.panel2 },
  segText: { color: colors.muted, fontWeight: '700' },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  input: {
    width: 110,
    padding: 10,
    backgroundColor: colors.panel2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    color: colors.text,
  },
  est: { color: colors.muted, fontSize: 13 },
  submit: { padding: 14, borderRadius: 8, alignItems: 'center' },
  submitText: { color: '#0d1117', fontWeight: '800', fontSize: 16 },
});
