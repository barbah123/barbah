// Pokémon Açık Artırma — Expo Snack tek-dosya sürümü (auth + liste + detay/teklif)
// snack.expo.dev → App.js içeriğini bununla değiştir → Expo Go ile telefonda aç.
// Ekstra kütüphane gerekmez; canlı backend'e bağlanır.

import { useEffect, useState, useCallback } from 'react';
import {
  ActivityIndicator, FlatList, Image, KeyboardAvoidingView, Platform, Pressable,
  RefreshControl, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TextInput, View,
} from 'react-native';

// react-native's SafeAreaView only insets on iOS; pad the status bar on Android.
const ANDROID_TOP = Platform.OS === 'android' ? StatusBar.currentHeight || 0 : 0;
import * as ImagePicker from 'expo-image-picker';

const BASE_URL = 'https://pokemon-auction-api.barbah.workers.dev';
const C = {
  bg: '#0f172a', card: '#1e293b', card2: '#273449', text: '#f1f5f9', sub: '#94a3b8',
  primary: '#6366f1', primaryText: '#fff', accent: '#fbbf24', danger: '#f87171',
  good: '#34d399', border: '#334155',
};

const APP_VERSION = 'v0.15.0';

const MONTHS_TR = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
function endDateLabel(endsAt) {
  const d = new Date(endsAt * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return d.getDate() + ' ' + MONTHS_TR[d.getMonth()] + ', ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

const DURATIONS = [
  { label: '6 saat', h: 6 },
  { label: '12 saat', h: 12 },
  { label: '1 gün', h: 24 },
  { label: '3 gün', h: 72 },
  { label: '7 gün', h: 168 },
];

let TOKEN = null;

async function request(path, options = {}) {
  const res = await fetch(BASE_URL + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(TOKEN ? { Authorization: 'Bearer ' + TOKEN } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'İstek başarısız');
  return data;
}

const api = {
  register: async (email, username, password) => {
    const d = await request('/auth/register', { method: 'POST', body: JSON.stringify({ email, username, password }) });
    TOKEN = d.token; return d;
  },
  login: async (email, password) => {
    const d = await request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    TOKEN = d.token; return d;
  },
  resetPassword: async (email, username, password) => {
    const d = await request('/auth/reset', { method: 'POST', body: JSON.stringify({ email, username, password }) });
    TOKEN = d.token; return d;
  },
  logout: () => { TOKEN = null; },
  listAuctions: () => request('/auctions?status=active'),
  getAuction: (id) => request('/auctions/' + id),
  bid: (id, amount) => request('/auctions/' + id + '/bid', { method: 'POST', body: JSON.stringify({ amount }) }),
  create: (data) => request('/auctions', { method: 'POST', body: JSON.stringify(data) }),
  uploadImage: async (uri) => {
    const blob = await fetch(uri).then((r) => r.blob());
    const res = await fetch(BASE_URL + '/images/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'image/jpeg', ...(TOKEN ? { Authorization: 'Bearer ' + TOKEN } : {}) },
      body: blob,
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || 'Yükleme başarısız');
    return d.key;
  },
  currentUser: () => {
    if (!TOKEN) return null;
    try {
      const bin = atob(TOKEN.split('.')[1]);
      const json = decodeURIComponent(bin.split('').map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
      return JSON.parse(json);
    } catch (e) { return null; }
  },
  myAuctions: () => request('/me/auctions'),
  myBids: () => request('/me/bids'),
  myFavorites: () => request('/me/favorites'),
  favorite: (id) => request('/auctions/' + id + '/favorite', { method: 'POST' }),
  unfavorite: (id) => request('/auctions/' + id + '/favorite', { method: 'DELETE' }),
  notifications: () => request('/me/notifications'),
  markRead: () => request('/me/notifications/read', { method: 'POST' }),
};

function fmtCountdown(endsAt, now) {
  let s = Math.floor(endsAt - now);
  if (s <= 0) return 'Bitti';
  const pad = (n) => String(n).padStart(2, '0');
  const d = Math.floor(s / 86400); s -= d * 86400;
  const h = Math.floor(s / 3600); s -= h * 3600;
  const m = Math.floor(s / 60); const sec = s - m * 60;
  return d > 0 ? d + 'g ' + pad(h) + ':' + pad(m) + ':' + pad(sec) : pad(h) + ':' + pad(m) + ':' + pad(sec);
}

function Countdown({ endsAt, prefix = '', style }) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);
  return <Text style={style}>{prefix}{fmtCountdown(endsAt, now)}</Text>;
}

function Thumb({ imageKey, size }) {
  const dim = { width: size, height: size, borderRadius: 12 };
  if (imageKey && imageKey !== 'none') {
    return <Image source={{ uri: BASE_URL + '/images/' + imageKey }} style={[dim, { backgroundColor: C.card2 }]} />;
  }
  return (
    <View style={[dim, st.thumbPlaceholder]}>
      <Text style={{ fontSize: size * 0.45 }}>🃏</Text>
    </View>
  );
}

// ---------- Auth ----------
function AuthScreen({ onAuthed }) {
  const [mode, setMode] = useState('login'); // 'login' | 'register' | 'reset'
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const needsUsername = mode === 'register' || mode === 'reset';
  function go(next) { setError(null); setPassword(''); setMode(next); }

  async function submit() {
    setError(null);
    if (!email || !password || (needsUsername && !username)) { setError('Lütfen tüm alanları doldurun.'); return; }
    setLoading(true);
    try {
      if (mode === 'register') await api.register(email.trim(), username.trim(), password);
      else if (mode === 'reset') await api.resetPassword(email.trim(), username.trim(), password);
      else await api.login(email.trim(), password);
      onAuthed();
    } catch (e) { setError(e.message || 'Bir hata oluştu'); }
    finally { setLoading(false); }
  }

  const title = mode === 'register' ? 'Hesap oluştur' : mode === 'reset' ? 'Şifreyi sıfırla' : 'Tekrar hoş geldin';
  const cta = mode === 'register' ? 'Kayıt ol' : mode === 'reset' ? 'Şifreyi sıfırla' : 'Giriş yap';

  return (
    <ScrollView style={st.flex} contentContainerStyle={st.authContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} automaticallyAdjustKeyboardInsets>
      <Text style={st.logo}>⚡</Text>
      <Text style={st.title}>Pokémon Açık Artırma</Text>
      <Text style={st.subtitle}>{title}</Text>
      {mode === 'reset' && <Text style={st.hint}>E-posta ve kullanıcı adını doğrula, yeni parolanı belirle.</Text>}
      <TextInput style={st.input} placeholderTextColor={C.sub} placeholder="E-posta" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
      {needsUsername && <TextInput style={st.input} placeholderTextColor={C.sub} placeholder="Kullanıcı adı" autoCapitalize="none" value={username} onChangeText={setUsername} />}
      <TextInput style={st.input} placeholderTextColor={C.sub} placeholder={mode === 'reset' ? 'Yeni parola' : 'Parola'} secureTextEntry value={password} onChangeText={setPassword} />
      {error && <Text style={st.error}>{error}</Text>}
      <Pressable style={({ pressed }) => [st.button, (loading || pressed) && st.buttonDim]} onPress={submit} disabled={loading}>
        {loading ? <ActivityIndicator color={C.primaryText} /> : <Text style={st.buttonText}>{cta}</Text>}
      </Pressable>
      {mode === 'login' && (
        <>
          <Pressable onPress={() => go('reset')}><Text style={st.linkMuted}>Şifremi unuttum</Text></Pressable>
          <Pressable onPress={() => go('register')}><Text style={st.switchText}>Hesabın yok mu? Kayıt ol</Text></Pressable>
        </>
      )}
      {mode === 'register' && <Pressable onPress={() => go('login')}><Text style={st.switchText}>Zaten hesabın var mı? Giriş yap</Text></Pressable>}
      {mode === 'reset' && <Pressable onPress={() => go('login')}><Text style={st.switchText}>← Girişe dön</Text></Pressable>}
      <Text style={st.version}>{APP_VERSION}</Text>
    </ScrollView>
  );
}

// ---------- List ----------
function AuctionsScreen({ onProfile, onOpen, onCreate, onNotifications }) {
  const [auctions, setAuctions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [a, n] = await Promise.all([api.listAuctions(), api.notifications()]);
      setAuctions(a); setUnread((n && n.unread) || 0);
    } catch (e) { setError(e.message || 'Liste yüklenemedi'); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (loading) return <View style={st.center}><ActivityIndicator size="large" color={C.primary} /></View>;

  return (
    <View style={st.screen}>
      <View style={st.header}>
        <View>
          <Text style={st.headerTitle}>Açık Artırmalar</Text>
          <Text style={st.headerSub}>{auctions.length} aktif ilan</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Pressable onPress={onCreate} hitSlop={8} style={st.createBtn}><Text style={st.createText}>+ Yeni</Text></Pressable>
          <Pressable onPress={onNotifications} hitSlop={8} style={st.iconBtn}>
            <Text style={st.profileText}>🔔</Text>
            {unread > 0 && <View style={st.nbadge}><Text style={st.nbadgeText}>{unread > 9 ? '9+' : unread}</Text></View>}
          </Pressable>
          <Pressable onPress={onProfile} hitSlop={8} style={st.profileBtn}><Text style={st.profileText}>👤</Text></Pressable>
        </View>
      </View>
      {error && <Text style={st.error}>{error}</Text>}
      <FlatList
        data={auctions}
        keyExtractor={(i) => i.id}
        contentContainerStyle={auctions.length === 0 ? st.emptyWrap : { padding: 16 }}
        refreshControl={<RefreshControl tintColor={C.sub} refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        ListEmptyComponent={<Text style={st.empty}>Henüz aktif açık artırma yok.{'\n'}Aşağı çekerek yenileyin.</Text>}
        renderItem={({ item }) => (
          <Pressable style={({ pressed }) => [st.card, pressed && { opacity: 0.85 }]} onPress={() => onOpen(item.id)}>
            <Thumb imageKey={item.card_image_key} size={64} />
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={st.cardTitle} numberOfLines={1}>{item.title}</Text>
              <Text style={st.seller}>@{item.seller_username}</Text>
              <View style={st.cardRow}>
                <Text style={st.price}>{item.current_price} ₺</Text>
                <View style={st.pill}><Countdown endsAt={item.ends_at} prefix="⏱ " style={st.pillText} /></View>
              </View>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

// ---------- Detail + Bid ----------
function DetailScreen({ id, onBack }) {
  const [auction, setAuction] = useState(null);
  const [loading, setLoading] = useState(true);
  const [bidAmount, setBidAmount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [msg, setMsg] = useState(null);
  const [expired, setExpired] = useState(false);
  const [fav, setFav] = useState(false);

  const load = useCallback(async () => {
    try { setAuction(await api.getAuction(id)); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!auction) return;
    const msLeft = auction.ends_at * 1000 - Date.now();
    if (msLeft <= 0) { setExpired(true); return; }
    const t = setTimeout(() => setExpired(true), msLeft);
    return () => clearTimeout(t);
  }, [auction]);

  const minBid = auction ? auction.current_price + auction.min_bid_increment : 0;
  const step = auction ? auction.min_bid_increment : 1;

  useEffect(() => {
    if (auction) setBidAmount(auction.current_price + auction.min_bid_increment);
  }, [auction && auction.current_price, auction && auction.min_bid_increment]);

  useEffect(() => { if (auction) setFav(!!auction.favorited); }, [auction && auction.favorited]);
  async function toggleFav() {
    const next = !fav; setFav(next);
    try { if (next) await api.favorite(id); else await api.unfavorite(id); }
    catch (e) { setFav(!next); }
  }

  async function placeBid() {
    setError(null); setMsg(null);
    if (bidAmount < minBid) { setError('En az ' + minBid + ' ₺ teklif vermelisin.'); return; }
    setBusy(true);
    try {
      await api.bid(id, bidAmount);
      setMsg('Teklifin alındı! 🎉');
      await load();
    } catch (e) { setError(e.message || 'Teklif verilemedi'); }
    finally { setBusy(false); }
  }

  if (loading) return <View style={st.center}><ActivityIndicator size="large" color={C.primary} /></View>;
  if (!auction) return (
    <View style={st.center}><Text style={st.error}>{error || 'Bulunamadı'}</Text>
      <Pressable onPress={onBack}><Text style={st.switchText}>← Geri</Text></Pressable></View>
  );

  const ended = expired || auction.ends_at * 1000 <= Date.now() || auction.status !== 'active';

  return (
    <View style={st.screen}>
      <View style={st.header}>
        <Pressable onPress={onBack} hitSlop={8}><Text style={st.back}>← Geri</Text></Pressable>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={[st.badge, ended ? st.badgeEnded : st.badgeLive]}>
            <Text style={st.badgeText}>{ended ? 'Bitti' : '● Canlı'}</Text>
          </View>
          <Pressable onPress={toggleFav} hitSlop={8} style={{ marginLeft: 12 }}>
            <Text style={[st.heart, fav && { color: C.danger }]}>{fav ? '♥' : '♡'}</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <View style={st.heroWrap}><Thumb imageKey={auction.card_image_key} size={220} /></View>
        <Text style={st.detailTitle}>{auction.title}</Text>
        <View style={st.metaRow}>
          <Text style={st.seller}>@{auction.seller_username}</Text>
          <Text style={st.watchers}>👁 {auction.watchers || 0} izliyor</Text>
        </View>

        <View style={st.bidCard}>
          <Text style={st.bidCardLabel}>{ended ? 'Kazanan teklif' : 'Güncel teklif'}</Text>
          <View style={st.bidPriceRow}>
            <Text style={st.bidPrice}>{auction.current_price} ₺</Text>
            <Text style={st.bidCount}>{auction.bids ? auction.bids.length : 0} teklif</Text>
          </View>
          <View style={st.cardDivider} />
          {ended ? (
            <Text style={st.endedText}>Açık artırma sona erdi · {endDateLabel(auction.ends_at)}</Text>
          ) : (
            <View style={st.timeRow}>
              <Countdown endsAt={auction.ends_at} prefix="⏱ " style={st.timeLeft} />
              <Text style={st.endsAt}>Bitiş: {endDateLabel(auction.ends_at)}</Text>
            </View>
          )}
        </View>

        {!!auction.description && (
          <>
            <Text style={st.sectionTitle}>Açıklama</Text>
            <Text style={st.detailDesc}>{auction.description}</Text>
          </>
        )}

        <Text style={st.sectionTitle}>Teklif geçmişi ({auction.bids ? auction.bids.length : 0})</Text>
        {auction.bids && auction.bids.length > 0 ? auction.bids.map((b, i) => (
          <View key={i} style={st.bidRow}>
            <Text style={st.bidUser}>@{b.username}</Text>
            <Text style={st.bidAmount}>{b.amount} ₺</Text>
          </View>
        )) : <Text style={st.sub}>Henüz teklif yok. İlk teklifi sen ver!</Text>}
      </ScrollView>

      {!ended && (
        <View style={st.bidBar}>
          {error && <Text style={st.error}>{error}</Text>}
          {msg && <Text style={st.success}>{msg}</Text>}
          <Text style={st.minHint}>En düşük teklif: {minBid} ₺</Text>
          <View style={st.stepperRow}>
            <Pressable
              style={({ pressed }) => [st.stepBtn, (bidAmount <= minBid || pressed) && { opacity: 0.4 }]}
              onPress={() => setBidAmount((a) => Math.max(minBid, a - step))}
              disabled={bidAmount <= minBid}
            >
              <Text style={st.stepText}>−</Text>
            </Pressable>
            <View style={st.amountBox}><Text style={st.amountText}>{bidAmount} ₺</Text></View>
            <Pressable style={({ pressed }) => [st.stepBtn, pressed && { opacity: 0.6 }]} onPress={() => setBidAmount((a) => a + step)}>
              <Text style={st.stepText}>+</Text>
            </Pressable>
          </View>
          <Pressable style={({ pressed }) => [st.bidBtnFull, (busy || pressed) && st.buttonDim]} onPress={placeBid} disabled={busy}>
            {busy ? <ActivityIndicator color={C.primaryText} /> : <Text style={st.buttonText}>{bidAmount} ₺ Teklif Ver</Text>}
          </Pressable>
        </View>
      )}
    </View>
  );
}

// ---------- Create ----------
function CreateScreen({ onDone }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startingPrice, setStartingPrice] = useState('');
  const [minIncrement, setMinIncrement] = useState('');
  const [durationHours, setDurationHours] = useState(24);
  const [imageUri, setImageUri] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function pickImage() {
    setError(null);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { setError('Galeri izni gerekli.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [3, 4], quality: 0.7 });
    if (!result.canceled) setImageUri(result.assets[0].uri);
  }

  async function submit() {
    setError(null);
    const sp = Number(startingPrice), mi = Number(minIncrement), dh = Number(durationHours);
    if (!title.trim()) { setError('Başlık gerekli.'); return; }
    if (!sp || sp <= 0 || !mi || mi <= 0 || !dh || dh <= 0) { setError('Fiyat, artış ve süre pozitif sayı olmalı.'); return; }
    setBusy(true);
    try {
      let key = 'none';
      if (imageUri) key = await api.uploadImage(imageUri);
      await api.create({ title: title.trim(), description: description.trim(), card_image_key: key, starting_price: sp, min_bid_increment: mi, duration_hours: dh });
      onDone();
    } catch (e) { setError(e.message || 'Oluşturulamadı'); }
    finally { setBusy(false); }
  }

  return (
    <View style={st.screen}>
      <View style={st.header}>
        <Pressable onPress={onDone} hitSlop={8}><Text style={st.back}>← İptal</Text></Pressable>
        <Text style={st.headerTitle}>Yeni İlan</Text>
        <View style={{ width: 52 }} />
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <Pressable style={st.imagePicker} onPress={pickImage}>
            {imageUri
              ? <Image source={{ uri: imageUri }} style={st.preview} />
              : <View style={st.previewPlaceholder}><Text style={{ fontSize: 40 }}>🃏</Text><Text style={st.pickHint}>Kart fotoğrafı seç</Text></View>}
          </Pressable>
          <TextInput style={st.input} placeholderTextColor={C.sub} placeholder="Başlık (ör. Charizard 1st Ed)" value={title} onChangeText={setTitle} />
          <TextInput style={[st.input, st.multiline]} placeholderTextColor={C.sub} placeholder="Açıklama (opsiyonel)" value={description} onChangeText={setDescription} multiline />
          <View style={st.formRow}>
            <TextInput style={[st.input, st.half]} placeholderTextColor={C.sub} placeholder="Başlangıç ₺" keyboardType="numeric" value={startingPrice} onChangeText={setStartingPrice} />
            <TextInput style={[st.input, st.half]} placeholderTextColor={C.sub} placeholder="Min. artış ₺" keyboardType="numeric" value={minIncrement} onChangeText={setMinIncrement} />
          </View>
          <Text style={st.fieldLabel}>Açık artırma süresi</Text>
          <View style={st.chips}>
            {DURATIONS.map((d) => (
              <Pressable key={d.h} style={[st.chip, durationHours === d.h && st.chipActive]} onPress={() => setDurationHours(d.h)}>
                <Text style={[st.chipText, durationHours === d.h && st.chipTextActive]}>{d.label}</Text>
              </Pressable>
            ))}
          </View>
          {error && <Text style={st.error}>{error}</Text>}
          <Pressable style={({ pressed }) => [st.button, (busy || pressed) && st.buttonDim]} onPress={submit} disabled={busy}>
            {busy ? <ActivityIndicator color={C.primaryText} /> : <Text style={st.buttonText}>İlanı Oluştur</Text>}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// ---------- Notifications ----------
function notifAgo(ts) {
  const s = Math.floor(Date.now() / 1000 - ts);
  if (s < 60) return 'az önce';
  if (s < 3600) return Math.floor(s / 60) + ' dk önce';
  if (s < 86400) return Math.floor(s / 3600) + ' sa önce';
  return Math.floor(s / 86400) + ' g önce';
}

function NotificationsScreen({ onBack, onOpen }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      try { const d = await api.notifications(); setItems(d.items); await api.markRead(); }
      catch (e) {} finally { setLoading(false); }
    })();
  }, []);
  return (
    <View style={st.screen}>
      <View style={st.header}>
        <Pressable onPress={onBack} hitSlop={8}><Text style={st.back}>← Geri</Text></Pressable>
        <Text style={st.headerTitle}>Bildirimler</Text>
        <View style={{ width: 52 }} />
      </View>
      {loading ? (
        <View style={st.center}><ActivityIndicator size="large" color={C.primary} /></View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          contentContainerStyle={items.length === 0 ? st.emptyWrap : { padding: 16 }}
          ListEmptyComponent={<Text style={st.empty}>Henüz bildirim yok.</Text>}
          renderItem={({ item }) => (
            <Pressable style={({ pressed }) => [st.notifRow, !item.read && st.notifUnread, pressed && { opacity: 0.85 }]} disabled={!item.auction_id} onPress={() => item.auction_id && onOpen(item.auction_id)}>
              <Text style={st.notifIcon}>🔔</Text>
              <View style={{ flex: 1 }}>
                <Text style={st.notifMsg}>{item.message}</Text>
                <Text style={st.notifTime}>{notifAgo(item.created_at)}</Text>
              </View>
              {!item.read && <View style={st.notifDot} />}
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

// ---------- Profile ----------
function ProfileScreen({ onBack, onLogout, onOpen }) {
  const [user] = useState(() => api.currentUser());
  const [tab, setTab] = useState('selling');
  const [selling, setSelling] = useState([]);
  const [bids, setBids] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, b, f] = await Promise.all([api.myAuctions(), api.myBids(), api.myFavorites()]);
      setSelling(s); setBids(b); setFavorites(f);
    } catch (e) {}
    finally { setLoading(false); setRefreshing(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const initial = user && user.username ? user.username[0].toUpperCase() : '?';
  const data = tab === 'selling' ? selling : tab === 'bids' ? bids : favorites;

  function bidStatus(item) {
    const ended = item.status !== 'active' || item.ends_at * 1000 <= Date.now();
    if (ended) return item.winning ? { t: 'Kazandın 🏆', c: C.good } : { t: 'Kaybettin', c: C.sub };
    return item.winning ? { t: 'Önde 🟢', c: C.good } : { t: 'Geçildin 🔴', c: C.danger };
  }

  return (
    <View style={st.screen}>
      <View style={st.header}>
        <Pressable onPress={onBack} hitSlop={8}><Text style={st.back}>← Geri</Text></Pressable>
        <Text style={st.headerTitle}>Hesabım</Text>
        <Pressable onPress={onLogout} hitSlop={8}><Text style={st.logout}>Çıkış</Text></Pressable>
      </View>
      <View style={st.profile}>
        <View style={st.avatar}><Text style={st.avatarText}>{initial}</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={st.username}>{user ? user.username : '...'}</Text>
          <Text style={st.email}>{user ? user.email : ''}</Text>
        </View>
      </View>
      <View style={st.tabs}>
        <Pressable style={[st.tab, tab === 'selling' && st.tabActive]} onPress={() => setTab('selling')}>
          <Text style={[st.tabText, tab === 'selling' && st.tabTextActive]}>Sattıklarım ({selling.length})</Text>
        </Pressable>
        <Pressable style={[st.tab, tab === 'bids' && st.tabActive]} onPress={() => setTab('bids')}>
          <Text style={[st.tabText, tab === 'bids' && st.tabTextActive]}>Tekliflerim ({bids.length})</Text>
        </Pressable>
        <Pressable style={[st.tab, tab === 'favorites' && st.tabActive]} onPress={() => setTab('favorites')}>
          <Text style={[st.tabText, tab === 'favorites' && st.tabTextActive]}>Favoriler ({favorites.length})</Text>
        </Pressable>
      </View>
      {loading ? (
        <View style={st.center}><ActivityIndicator size="large" color={C.primary} /></View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item) => item.id}
          contentContainerStyle={data.length === 0 ? st.emptyWrap : { padding: 16 }}
          refreshControl={<RefreshControl tintColor={C.sub} refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          ListEmptyComponent={<Text style={st.empty}>{tab === 'selling' ? 'Henüz ilan oluşturmadın.' : tab === 'bids' ? 'Henüz teklif vermedin.' : 'Henüz favori eklemedin.'}</Text>}
          renderItem={({ item }) => {
            const ended = item.status !== 'active' || item.ends_at * 1000 <= Date.now();
            return (
              <Pressable style={({ pressed }) => [st.card, pressed && { opacity: 0.85 }]} onPress={() => onOpen(item.id)}>
                <Thumb imageKey={item.card_image_key} size={56} />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={st.cardTitle} numberOfLines={1}>{item.title}</Text>
                  {tab === 'bids' ? (
                    <View style={st.profRow}>
                      <Text style={st.profSub}>Teklifin: <Text style={st.profBid}>{item.my_bid} ₺</Text></Text>
                      <Text style={[st.profBadge, { color: bidStatus(item).c }]}>{bidStatus(item).t}</Text>
                    </View>
                  ) : (
                    <View style={st.profRow}>
                      <Text style={st.price}>{item.current_price} ₺</Text>
                      <Text style={[st.profBadge, { color: ended ? C.sub : C.good }]}>{ended ? 'Bitti' : 'Aktif'}</Text>
                    </View>
                  )}
                  {!ended && <Countdown endsAt={item.ends_at} prefix="⏱ " style={st.profTime} />}
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

// ---------- Root ----------
export default function App() {
  const [signedIn, setSignedIn] = useState(false);
  const [detailId, setDetailId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [profile, setProfile] = useState(false);
  const [notif, setNotif] = useState(false);

  let body;
  if (!signedIn) body = <AuthScreen onAuthed={() => setSignedIn(true)} />;
  else if (notif) body = <NotificationsScreen onBack={() => setNotif(false)} onOpen={(id) => { setNotif(false); setDetailId(id); }} />;
  else if (profile) body = <ProfileScreen onBack={() => setProfile(false)} onLogout={() => { api.logout(); setProfile(false); setSignedIn(false); }} onOpen={(id) => { setProfile(false); setDetailId(id); }} />;
  else if (creating) body = <CreateScreen onDone={() => setCreating(false)} />;
  else if (detailId) body = <DetailScreen id={detailId} onBack={() => setDetailId(null)} />;
  else body = <AuctionsScreen onProfile={() => setProfile(true)} onOpen={setDetailId} onCreate={() => setCreating(true)} onNotifications={() => setNotif(true)} />;

  return <SafeAreaView style={{ flex: 1, backgroundColor: C.bg, paddingTop: ANDROID_TOP }}>{body}</SafeAreaView>;
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg },
  flex: { flex: 1, backgroundColor: C.bg },
  authContent: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  logo: { fontSize: 56, textAlign: 'center' },
  title: { fontSize: 26, fontWeight: '800', textAlign: 'center', color: C.text, marginTop: 8 },
  subtitle: { fontSize: 15, textAlign: 'center', color: C.sub, marginTop: 4, marginBottom: 24 },
  input: { backgroundColor: C.card, color: C.text, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 16, marginBottom: 12 },
  button: { backgroundColor: C.primary, borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 4 },
  buttonDim: { opacity: 0.6 },
  buttonText: { color: C.primaryText, fontSize: 16, fontWeight: '700' },
  switchText: { color: C.primary, textAlign: 'center', marginTop: 16, fontSize: 14, fontWeight: '600' },
  linkMuted: { color: C.sub, textAlign: 'center', marginTop: 16, fontSize: 14, fontWeight: '600' },
  hint: { fontSize: 13, textAlign: 'center', color: C.sub, marginBottom: 16 },
  version: { color: C.sub, textAlign: 'center', marginTop: 28, fontSize: 12, opacity: 0.7 },
  error: { color: C.danger, textAlign: 'center', marginBottom: 8 },
  success: { color: C.good, textAlign: 'center', marginBottom: 8, fontWeight: '600' },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  headerTitle: { fontSize: 20, fontWeight: '800', color: C.text },
  headerSub: { fontSize: 12, color: C.sub, marginTop: 2 },
  logoutBtn: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: C.card, borderRadius: 8 },
  logout: { color: C.danger, fontSize: 14, fontWeight: '700' },
  createBtn: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: C.primary, borderRadius: 8, marginRight: 8 },
  createText: { color: C.primaryText, fontSize: 14, fontWeight: '700' },
  profileBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border },
  iconBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border, marginRight: 8 },
  profileText: { fontSize: 18 },
  nbadge: { position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: C.danger, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  nbadgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  heart: { fontSize: 24, color: C.sub },
  notifRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: C.border },
  notifUnread: { backgroundColor: C.card2 },
  notifIcon: { fontSize: 20, marginRight: 12 },
  notifMsg: { color: C.text, fontSize: 14, lineHeight: 19 },
  notifTime: { color: C.sub, fontSize: 12, marginTop: 4 },
  notifDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.primary, marginLeft: 8 },
  profile: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  avatarText: { color: C.primaryText, fontSize: 24, fontWeight: '800' },
  username: { fontSize: 18, fontWeight: '800', color: C.text },
  email: { fontSize: 13, color: C.sub, marginTop: 2 },
  tabs: { flexDirection: 'row', paddingHorizontal: 16, marginBottom: 4 },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: C.primary },
  tabText: { color: C.sub, fontSize: 14, fontWeight: '700' },
  tabTextActive: { color: C.text },
  profRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
  profSub: { color: C.sub, fontSize: 13 },
  profBid: { color: C.accent, fontWeight: '700' },
  profBadge: { fontSize: 13, fontWeight: '700' },
  profTime: { color: C.sub, fontSize: 12, marginTop: 6 },
  imagePicker: { alignItems: 'center', marginBottom: 16 },
  preview: { width: 150, height: 200, borderRadius: 14, backgroundColor: C.card2 },
  previewPlaceholder: { width: 150, height: 200, borderRadius: 14, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  pickHint: { color: C.sub, marginTop: 8, fontSize: 13 },
  multiline: { height: 80, textAlignVertical: 'top' },
  formRow: { flexDirection: 'row', justifyContent: 'space-between' },
  half: { width: '48%' },
  fieldLabel: { color: C.sub, fontSize: 13, fontWeight: '600', marginBottom: 8, marginTop: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, marginRight: 8, marginBottom: 8 },
  chipActive: { backgroundColor: C.primary, borderColor: C.primary },
  chipText: { color: C.sub, fontSize: 14, fontWeight: '600' },
  chipTextActive: { color: C.primaryText },
  back: { color: C.primary, fontSize: 16, fontWeight: '700' },

  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 16, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: C.border },
  cardTitle: { fontSize: 16, fontWeight: '700', color: C.text },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  price: { fontSize: 18, fontWeight: '800', color: C.accent },
  seller: { fontSize: 13, color: C.sub, marginTop: 2 },
  pill: { backgroundColor: C.card2, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  pillText: { color: C.sub, fontSize: 12, fontWeight: '600' },
  thumbPlaceholder: { backgroundColor: C.card2, alignItems: 'center', justifyContent: 'center' },
  empty: { textAlign: 'center', color: C.sub, fontSize: 15, lineHeight: 22 },
  emptyWrap: { flexGrow: 1, justifyContent: 'center', padding: 24 },

  heroWrap: { alignItems: 'center', marginBottom: 16, backgroundColor: C.card, borderRadius: 16, paddingVertical: 20, borderWidth: 1, borderColor: C.border },
  detailTitle: { fontSize: 22, fontWeight: '800', color: C.text },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
  watchers: { fontSize: 13, color: C.sub },
  detailDesc: { fontSize: 15, color: C.sub, marginTop: 8, lineHeight: 21 },
  bidCard: { backgroundColor: C.card, borderRadius: 16, padding: 16, marginTop: 16, borderWidth: 1, borderColor: C.border },
  bidCardLabel: { fontSize: 13, color: C.sub },
  bidPriceRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 4 },
  bidPrice: { fontSize: 32, fontWeight: '800', color: C.accent },
  bidCount: { fontSize: 14, color: C.sub, fontWeight: '600' },
  cardDivider: { height: 1, backgroundColor: C.border, marginVertical: 14 },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  timeLeft: { fontSize: 17, fontWeight: '700', color: C.text },
  endsAt: { fontSize: 13, color: C.sub },
  endedText: { fontSize: 14, color: C.sub },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: C.text, marginTop: 24, marginBottom: 8 },
  sub: { color: C.sub, fontSize: 14 },
  bidRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  bidUser: { color: C.text, fontSize: 14 },
  bidAmount: { color: C.accent, fontSize: 14, fontWeight: '700' },

  badge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999 },
  badgeLive: { backgroundColor: 'rgba(52,211,153,0.15)' },
  badgeEnded: { backgroundColor: C.card2 },
  badgeText: { color: C.good, fontSize: 12, fontWeight: '700' },

  bidBar: { padding: 16, borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.bg },
  minHint: { color: C.sub, fontSize: 13, textAlign: 'center', marginBottom: 10 },
  stepperRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  stepBtn: { width: 52, height: 52, borderRadius: 26, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  stepText: { color: C.text, fontSize: 28, fontWeight: '700', lineHeight: 30 },
  amountBox: { minWidth: 130, alignItems: 'center', marginHorizontal: 16 },
  amountText: { color: C.accent, fontSize: 26, fontWeight: '800' },
  bidBtnFull: { backgroundColor: C.primary, borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
});
