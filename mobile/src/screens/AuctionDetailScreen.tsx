import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { api } from '../api';
import { colors } from '../theme';
import Thumb from '../components/Thumb';
import Countdown from '../components/Countdown';

type Bid = { amount: number; created_at: number; username: string };
type AuctionDetail = {
  id: string;
  title: string;
  description: string;
  current_price: number;
  min_bid_increment: number;
  card_image_key: string;
  status: string;
  ends_at: number;
  seller_username: string;
  bids: Bid[];
};

export default function AuctionDetailScreen({ id, onBack }: { id: string; onBack: () => void }) {
  const [auction, setAuction] = useState<AuctionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);

  const load = useCallback(async () => {
    try {
      setAuction((await api.auctions.get(id)) as AuctionDetail);
    } catch (e: any) {
      setError(e?.message ?? 'Yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Flip to "ended" exactly when the auction's time runs out (no per-second re-render).
  useEffect(() => {
    if (!auction) return;
    const msLeft = auction.ends_at * 1000 - Date.now();
    if (msLeft <= 0) {
      setExpired(true);
      return;
    }
    const id = setTimeout(() => setExpired(true), msLeft);
    return () => clearTimeout(id);
  }, [auction]);

  const minBid = auction ? auction.current_price + auction.min_bid_increment : 0;

  async function placeBid() {
    setError(null);
    setMsg(null);
    const val = Number(amount);
    if (!val || val < minBid) {
      setError(`En az ${minBid} ₺ teklif vermelisin.`);
      return;
    }
    setBusy(true);
    try {
      await api.auctions.bid(id, val);
      setMsg('Teklifin alındı! 🎉');
      setAmount('');
      await load();
    } catch (e: any) {
      setError(e?.message ?? 'Teklif verilemedi');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!auction) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error ?? 'Bulunamadı'}</Text>
        <Pressable onPress={onBack}>
          <Text style={styles.back}>← Geri</Text>
        </Pressable>
      </View>
    );
  }

  const ended = expired || auction.ends_at * 1000 <= Date.now() || auction.status !== 'active';

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={8}>
          <Text style={styles.back}>← Geri</Text>
        </Pressable>
        <View style={[styles.badge, ended ? styles.badgeEnded : styles.badgeLive]}>
          <Text style={[styles.badgeText, ended && { color: colors.sub }]}>
            {ended ? 'Bitti' : '● Canlı'}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <View style={styles.heroWrap}>
          <Thumb imageKey={auction.card_image_key} size={140} />
        </View>
        <Text style={styles.detailTitle}>{auction.title}</Text>
        <Text style={styles.seller}>@{auction.seller_username}</Text>
        {!!auction.description && <Text style={styles.detailDesc}>{auction.description}</Text>}

        <View style={styles.priceBox}>
          <View>
            <Text style={styles.priceLabel}>Güncel fiyat</Text>
            <Text style={styles.priceBig}>{auction.current_price} ₺</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.priceLabel}>Kalan süre</Text>
            <Countdown endsAt={auction.ends_at} prefix="⏱ " style={styles.timeBig} />
          </View>
        </View>

        <Text style={styles.sectionTitle}>Teklifler ({auction.bids?.length ?? 0})</Text>
        {auction.bids && auction.bids.length > 0 ? (
          auction.bids.map((b, i) => (
            <View key={i} style={styles.bidRow}>
              <Text style={styles.bidUser}>@{b.username}</Text>
              <Text style={styles.bidAmount}>{b.amount} ₺</Text>
            </View>
          ))
        ) : (
          <Text style={styles.sub}>Henüz teklif yok. İlk teklifi sen ver!</Text>
        )}
      </ScrollView>

      {!ended && (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.bidBar}>
            {error && <Text style={styles.error}>{error}</Text>}
            {msg && <Text style={styles.success}>{msg}</Text>}
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <TextInput
                style={styles.bidInput}
                placeholderTextColor={colors.sub}
                placeholder={`min ${minBid} ₺`}
                keyboardType="numeric"
                value={amount}
                onChangeText={setAmount}
              />
              <Pressable
                style={({ pressed }) => [styles.bidBtn, (busy || pressed) && { opacity: 0.6 }]}
                onPress={placeBid}
                disabled={busy}
              >
                {busy ? (
                  <ActivityIndicator color={colors.primaryText} />
                ) : (
                  <Text style={styles.buttonText}>Teklif ver</Text>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      )}
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
  back: { color: colors.primary, fontSize: 16, fontWeight: '700' },
  badge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999 },
  badgeLive: { backgroundColor: 'rgba(52,211,153,0.15)' },
  badgeEnded: { backgroundColor: colors.card2 },
  badgeText: { color: colors.good, fontSize: 12, fontWeight: '700' },
  heroWrap: { alignItems: 'center', marginBottom: 16 },
  detailTitle: { fontSize: 24, fontWeight: '800', color: colors.text, textAlign: 'center' },
  seller: { fontSize: 13, color: colors.sub, marginTop: 2, textAlign: 'center' },
  detailDesc: { fontSize: 15, color: colors.sub, marginTop: 12, lineHeight: 21 },
  priceBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  priceLabel: { fontSize: 12, color: colors.sub },
  priceBig: { fontSize: 28, fontWeight: '800', color: colors.accent, marginTop: 2 },
  timeBig: { fontSize: 18, fontWeight: '700', color: colors.text, marginTop: 2 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginTop: 24, marginBottom: 8 },
  sub: { color: colors.sub, fontSize: 14 },
  bidRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  bidUser: { color: colors.text, fontSize: 14 },
  bidAmount: { color: colors.accent, fontSize: 14, fontWeight: '700' },
  bidBar: { padding: 16, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bg },
  bidInput: {
    flex: 1,
    backgroundColor: colors.card,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 16,
    marginRight: 10,
  },
  bidBtn: { backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 20, alignItems: 'center' },
  buttonText: { color: colors.primaryText, fontSize: 16, fontWeight: '700' },
  error: { color: colors.danger, textAlign: 'center', marginBottom: 8 },
  success: { color: colors.good, textAlign: 'center', marginBottom: 8, fontWeight: '600' },
});
