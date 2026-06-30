// Pokémon Açık Artırma — Expo Snack tek-dosya sürümü (auth + liste + detay/teklif)
// snack.expo.dev → App.js içeriğini bununla değiştir → Expo Go ile telefonda aç.
// Ekstra kütüphane gerekmez; canlı backend'e bağlanır.

import { useEffect, useState, useCallback } from 'react';
import {
  ActivityIndicator, FlatList, Image, KeyboardAvoidingView, Platform, Pressable,
  RefreshControl, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';

const BASE_URL = 'https://pokemon-auction-api.barbah.workers.dev';
const C = {
  bg: '#0f172a', card: '#1e293b', card2: '#273449', text: '#f1f5f9', sub: '#94a3b8',
  primary: '#6366f1', primaryText: '#fff', accent: '#fbbf24', danger: '#f87171',
  good: '#34d399', border: '#334155',
};

const APP_VERSION = 'v0.10.0';

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
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function submit() {
    setError(null);
    if (!email || !password || (isRegister && !username)) { setError('Lütfen tüm alanları doldurun.'); return; }
    setLoading(true);
    try {
      if (isRegister) await api.register(email.trim(), username.trim(), password);
      else await api.login(email.trim(), password);
      onAuthed();
    } catch (e) { setError(e.message || 'Bir hata oluştu'); }
    finally { setLoading(false); }
  }

  return (
    <ScrollView style={st.flex} contentContainerStyle={st.authContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} automaticallyAdjustKeyboardInsets>
      <Text style={st.logo}>⚡</Text>
      <Text style={st.title}>Pokémon Açık Artırma</Text>
      <Text style={st.subtitle}>{isRegister ? 'Hesap oluştur' : 'Tekrar hoş geldin'}</Text>
      <TextInput style={st.input} placeholderTextColor={C.sub} placeholder="E-posta" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
      {isRegister && <TextInput style={st.input} placeholderTextColor={C.sub} placeholder="Kullanıcı adı" autoCapitalize="none" value={username} onChangeText={setUsername} />}
      <TextInput style={st.input} placeholderTextColor={C.sub} placeholder="Parola" secureTextEntry value={password} onChangeText={setPassword} />
      {error && <Text style={st.error}>{error}</Text>}
      <Pressable style={({ pressed }) => [st.button, (loading || pressed) && st.buttonDim]} onPress={submit} disabled={loading}>
        {loading ? <ActivityIndicator color={C.primaryText} /> : <Text style={st.buttonText}>{isRegister ? 'Kayıt ol' : 'Giriş yap'}</Text>}
      </Pressable>
      <Pressable onPress={() => { setError(null); setIsRegister(!isRegister); }}>
        <Text style={st.switchText}>{isRegister ? 'Zaten hesabın var mı? Giriş yap' : 'Hesabın yok mu? Kayıt ol'}</Text>
      </Pressable>
      <Text style={st.version}>{APP_VERSION}</Text>
    </ScrollView>
  );
}

// ---------- List ----------
function AuctionsScreen({ onProfile, onOpen, onCreate }) {
  const [auctions, setAuctions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try { setAuctions(await api.listAuctions()); }
    catch (e) { setError(e.message || 'Liste yüklenemedi'); }
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
        <View style={[st.badge, ended ? st.badgeEnded : st.badgeLive]}>
          <Text style={st.badgeText}>{ended ? 'Bitti' : '● Canlı'}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <View style={st.heroWrap}><Thumb imageKey={auction.card_image_key} size={140} /></View>
        <Text style={st.detailTitle}>{auction.title}</Text>
        <Text style={st.seller}>@{auction.seller_username}</Text>
        {!!auction.description && <Text style={st.detailDesc}>{auction.description}</Text>}

        <View style={st.priceBox}>
          <View>
            <Text style={st.priceLabel}>Güncel fiyat</Text>
            <Text style={st.priceBig}>{auction.current_price} ₺</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={st.priceLabel}>Kalan süre</Text>
            <Countdown endsAt={auction.ends_at} prefix="⏱ " style={st.timeBig} />
          </View>
        </View>

        <Text style={st.sectionTitle}>Teklifler ({auction.bids ? auction.bids.length : 0})</Text>
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
  const [durationHours, setDurationHours] = useState('24');
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
          <TextInput style={st.input} placeholderTextColor={C.sub} placeholder="Süre (saat)" keyboardType="numeric" value={durationHours} onChangeText={setDurationHours} />
          {error && <Text style={st.error}>{error}</Text>}
          <Pressable style={({ pressed }) => [st.button, (busy || pressed) && st.buttonDim]} onPress={submit} disabled={busy}>
            {busy ? <ActivityIndicator color={C.primaryText} /> : <Text style={st.buttonText}>İlanı Oluştur</Text>}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// ---------- Profile ----------
function ProfileScreen({ onBack, onLogout, onOpen }) {
  const [user] = useState(() => api.currentUser());
  const [tab, setTab] = useState('selling');
  const [selling, setSelling] = useState([]);
  const [bids, setBids] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, b] = await Promise.all([api.myAuctions(), api.myBids()]);
      setSelling(s); setBids(b);
    } catch (e) {}
    finally { setLoading(false); setRefreshing(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const initial = user && user.username ? user.username[0].toUpperCase() : '?';
  const data = tab === 'selling' ? selling : bids;

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
      </View>
      {loading ? (
        <View style={st.center}><ActivityIndicator size="large" color={C.primary} /></View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item) => item.id}
          contentContainerStyle={data.length === 0 ? st.emptyWrap : { padding: 16 }}
          refreshControl={<RefreshControl tintColor={C.sub} refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          ListEmptyComponent={<Text style={st.empty}>{tab === 'selling' ? 'Henüz ilan oluşturmadın.' : 'Henüz teklif vermedin.'}</Text>}
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

  let body;
  if (!signedIn) body = <AuthScreen onAuthed={() => setSignedIn(true)} />;
  else if (profile) body = <ProfileScreen onBack={() => setProfile(false)} onLogout={() => { api.logout(); setProfile(false); setSignedIn(false); }} onOpen={(id) => { setProfile(false); setDetailId(id); }} />;
  else if (creating) body = <CreateScreen onDone={() => setCreating(false)} />;
  else if (detailId) body = <DetailScreen id={detailId} onBack={() => setDetailId(null)} />;
  else body = <AuctionsScreen onProfile={() => setProfile(true)} onOpen={setDetailId} onCreate={() => setCreating(true)} />;

  return <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>{body}</SafeAreaView>;
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
  switchText: { color: C.primary, textAlign: 'center', marginTop: 18, fontSize: 14, fontWeight: '600' },
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
  profileText: { fontSize: 18 },
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

  heroWrap: { alignItems: 'center', marginBottom: 16 },
  detailTitle: { fontSize: 24, fontWeight: '800', color: C.text, textAlign: 'center' },
  detailDesc: { fontSize: 15, color: C.sub, marginTop: 12, lineHeight: 21 },
  priceBox: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: C.card, borderRadius: 16, padding: 16, marginTop: 16, borderWidth: 1, borderColor: C.border },
  priceLabel: { fontSize: 12, color: C.sub },
  priceBig: { fontSize: 28, fontWeight: '800', color: C.accent, marginTop: 2 },
  timeBig: { fontSize: 18, fontWeight: '700', color: C.text, marginTop: 2 },
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
