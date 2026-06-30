import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
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
  favorited?: boolean;
};

export default function AuctionDetailScreen({ id, onBack }: { id: string; onBack: () => void }) {
  const [auction, setAuction] = useState<AuctionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [bidAmount, setBidAmount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [fav, setFav] = useState(false);

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
  const step = auction ? auction.min_bid_increment : 1;

  // Auto-fill the bid with the minimum allowed whenever the price changes.
  useEffect(() => {
    if (auction) setBidAmount(auction.current_price + auction.min_bid_increment);
  }, [auction?.current_price, auction?.min_bid_increment]);

  useEffect(() => {
    if (auction) setFav(!!auction.favorited);
  }, [auction?.favorited]);

  async function toggleFav() {
    const next = !fav;
    setFav(next);
    try {
      if (next) await api.auctions.favorite(id);
      else await api.auctions.unfavorite(id);
    } catch {
      setFav(!next);
    }
  }

  async function placeBid() {
    setError(null);
    setMsg(null);
    if (bidAmount < minBid) {
      setError(`En az ${minBid} ₺ teklif vermelisin.`);
      return;
    }
    setBusy(true);
    try {
      await api.auctions.bid(id, bidAmount);
      setMsg('Teklifin alındı! 🎉');
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
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={[styles.badge, ended ? styles.badgeEnded : styles.badgeLive]}>
            <Text style={[styles.badgeText, ended && { color: colors.sub }]}>
              {ended ? 'Bitti' : '● Canlı'}
            </Text>
          </View>
          <Pressable onPress={toggleFav} hitSlop={8} style={{ marginLeft: 12 }}>
            <Text style={[styles.heart, fav && { color: colors.danger }]}>{fav ? '♥' : '♡'}</Text>
          </Pressable>
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
        <View style={styles.bidBar}>
          {error && <Text style={styles.error}>{error}</Text>}
          {msg && <Text style={styles.success}>{msg}</Text>}
          <Text style={styles.minHint}>En düşük teklif: {minBid} ₺</Text>
          <View style={styles.stepperRow}>
            <Pressable
              style={({ pressed }) => [styles.stepBtn, (bidAmount <= minBid || pressed) && { opacity: 0.4 }]}
              onPress={() => setBidAmount((a) => Math.max(minBid, a - step))}
              disabled={bidAmount <= minBid}
            >
              <Text style={styles.stepText}>−</Text>
            </Pressable>
            <View style={styles.amountBox}>
              <Text style={styles.amountText}>{bidAmount} ₺</Text>
            </View>
            <Pressable
              style={({ pressed }) => [styles.stepBtn, pressed && { opacity: 0.6 }]}
              onPress={() => setBidAmount((a) => a + step)}
            >
              <Text style={styles.stepText}>+</Text>
            </Pressable>
          </View>
          <Pressable
            style={({ pressed }) => [styles.bidBtnFull, (busy || pressed) && { opacity: 0.6 }]}
            onPress={placeBid}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator color={colors.primaryText} />
            ) : (
              <Text style={styles.buttonText}>{bidAmount} ₺ Teklif Ver</Text>
            )}
          </Pressable>
        </View>
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
  heart: { fontSize: 24, color: colors.sub },
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
  minHint: { color: colors.sub, fontSize: 13, textAlign: 'center', marginBottom: 10 },
  stepperRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  stepBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: { color: colors.text, fontSize: 28, fontWeight: '700', lineHeight: 30 },
  amountBox: { minWidth: 130, alignItems: 'center', marginHorizontal: 16 },
  amountText: { color: colors.accent, fontSize: 26, fontWeight: '800' },
  bidBtnFull: { backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  buttonText: { color: colors.primaryText, fontSize: 16, fontWeight: '700' },
  error: { color: colors.danger, textAlign: 'center', marginBottom: 8 },
  success: { color: colors.good, textAlign: 'center', marginBottom: 8, fontWeight: '600' },
});
