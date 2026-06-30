// Kahve Falı — Expo Snack tek-dosya sürümü (auth + ayarlar + foto/metin fal + geçmiş)
// snack.expo.dev → App.js içeriğini bununla değiştir → Expo Go ile telefonda aç.
// Ekstra kütüphane gerekmez; canlı backend'e bağlanır.

import { useEffect, useState, useCallback } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Image, KeyboardAvoidingView, Linking, Modal, Platform,
  Pressable, RefreshControl, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';

const BASE_URL = 'https://kahve-fali-api.barbah.workers.dev';
const APP_VERSION = 'v1.1.0';

const C = {
  bg: '#1a120b', card: '#2a1d12', card2: '#3a2a1a', text: '#f5ece2', sub: '#b89b82',
  primary: '#c08a4e', primaryText: '#1a120b', accent: '#e0b878', danger: '#e07a5f',
  good: '#81b29a', border: '#4a3a2a',
};

const MODELS = ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4.1'];

const GUIDE_STEPS = [
  { title: 'OpenAI hesabına giriş yap', body: 'platform.openai.com adresine git ve ChatGPT hesabınla giriş yap. Hesabın yoksa ücretsiz kayıt ol — ChatGPT girişinle aynısıdır.' },
  { title: 'Ödeme yöntemi ekle', body: 'Settings → Billing → "Add payment method". API kullanımı ChatGPT Plus aboneliğinden ayrı ve kullandıkça-öde mantığıyladır. Genellikle 5$ kredi uzun süre yeter.' },
  { title: 'API anahtarları sayfasını aç', body: 'platform.openai.com/api-keys adresine git (sağ üst menüden "API keys"). Aşağıdaki "Anahtar sayfasını aç" düğmesi de seni buraya götürür.' },
  { title: 'Yeni anahtar oluştur', body: '"Create new secret key" düğmesine bas, anahtara bir isim ver (ör. "Kahve Falı") ve "Create" de.' },
  { title: 'Anahtarı kopyala', body: 'Oluşan ve "sk-" ile başlayan anahtarı hemen kopyala. ⚠️ Bu anahtar yalnızca bir kez gösterilir; pencereyi kapatınca tekrar göremezsin.' },
  { title: 'Buraya yapıştır ve kaydet', body: 'Bu ekrandaki "OpenAI API Anahtarı" alanına yapıştır → "Bağlantıyı Test Et" (yeşil ✅) → "Kaydet". Hepsi bu!' },
];

let TOKEN = null;

async function api(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'İstek başarısız');
  return data;
}

function timeAgo(sec) {
  const m = Math.floor((Date.now() - sec * 1000) / 60000);
  if (m < 1) return 'az önce';
  if (m < 60) return `${m} dk önce`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} sa önce`;
  return `${Math.floor(h / 24)} gün önce`;
}

export default function App() {
  const [screen, setScreen] = useState('auth'); // auth | home | settings | reading | history
  const [reading, setReading] = useState(null);

  if (screen === 'auth') {
    return <Auth onAuthed={() => setScreen('home')} />;
  }
  if (screen === 'settings') {
    return <Settings onBack={() => setScreen('home')} onLogout={() => { TOKEN = null; setScreen('auth'); }} />;
  }
  if (screen === 'reading') {
    return <Reading reading={reading} onBack={() => setScreen('home')} />;
  }
  if (screen === 'history') {
    return (
      <History
        onBack={() => setScreen('home')}
        onOpen={(r) => { setReading(r); setScreen('reading'); }}
      />
    );
  }
  return (
    <Home
      onSettings={() => setScreen('settings')}
      onHistory={() => setScreen('history')}
      onResult={(r) => { setReading(r); setScreen('reading'); }}
    />
  );
}

function Auth({ onAuthed }) {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function submit() {
    setError(null);
    if (!email || !password || (isRegister && !username)) {
      setError('Lütfen tüm alanları doldurun.');
      return;
    }
    setLoading(true);
    try {
      const body = isRegister
        ? { email: email.trim(), username: username.trim(), password }
        : { email: email.trim(), password };
      const data = await api(isRegister ? '/auth/register' : '/auth/login', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      TOKEN = data.token;
      onAuthed();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.flex}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.authContent} keyboardShouldPersistTaps="handled">
          <Text style={styles.logo}>☕</Text>
          <Text style={styles.title}>Kahve Falı</Text>
          <Text style={styles.subtitle}>{isRegister ? 'Hesap oluştur' : 'Tekrar hoş geldin'}</Text>

          <TextInput style={styles.input} placeholder="E-posta" placeholderTextColor={C.sub}
            autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
          {isRegister && (
            <TextInput style={styles.input} placeholder="Kullanıcı adı" placeholderTextColor={C.sub}
              autoCapitalize="none" value={username} onChangeText={setUsername} />
          )}
          <TextInput style={styles.input} placeholder="Parola" placeholderTextColor={C.sub}
            secureTextEntry value={password} onChangeText={setPassword} />

          {error && <Text style={styles.error}>{error}</Text>}

          <Pressable style={({ pressed }) => [styles.button, (loading || pressed) && styles.dim]} onPress={submit} disabled={loading}>
            {loading ? <ActivityIndicator color={C.primaryText} /> : <Text style={styles.buttonText}>{isRegister ? 'Kayıt ol' : 'Giriş yap'}</Text>}
          </Pressable>

          <Pressable onPress={() => { setError(null); setIsRegister(!isRegister); }}>
            <Text style={styles.switch}>{isRegister ? 'Zaten hesabın var mı? Giriş yap' : 'Hesabın yok mu? Kayıt ol'}</Text>
          </Pressable>
          <Text style={styles.version}>{APP_VERSION}</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Home({ onSettings, onHistory, onResult }) {
  const [mode, setMode] = useState('photo');
  const [imageUri, setImageUri] = useState(null);
  const [imageB64, setImageB64] = useState(null);
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [hasKey, setHasKey] = useState(null);

  useEffect(() => {
    api('/me/settings').then((s) => setHasKey(s.has_api_key)).catch(() => setHasKey(false));
  }, []);

  async function pick(source) {
    try {
      const perm = source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { Alert.alert('İzin gerekli', 'Fotoğraf için izin verin.'); return; }
      const opts = { mediaTypes: ['images'], allowsEditing: true, quality: 0.5, base64: true };
      const result = source === 'camera'
        ? await ImagePicker.launchCameraAsync(opts)
        : await ImagePicker.launchImageLibraryAsync(opts);
      if (result.canceled || !result.assets || !result.assets.length) return;
      setImageUri(result.assets[0].uri);
      setImageB64(result.assets[0].base64 || null);
    } catch (e) {
      Alert.alert('Hata', e.message || 'Fotoğraf seçilemedi');
    }
  }

  async function submit() {
    if (mode === 'photo' && !imageB64) { Alert.alert('Fotoğraf yok', 'Önce fincan fotoğrafı seçin/çekin.'); return; }
    if (mode === 'text' && !question.trim()) { Alert.alert('Niyet yok', 'Lütfen niyetinizi yazın.'); return; }
    setLoading(true);
    try {
      const r = await api('/fortune', {
        method: 'POST',
        body: JSON.stringify({
          question: question.trim() || undefined,
          image_base64: mode === 'photo' ? imageB64 : undefined,
        }),
      });
      setImageUri(null); setImageB64(null); setQuestion('');
      onResult(r);
    } catch (e) {
      Alert.alert('Fal bakılamadı', e.message || 'Bir hata oluştu');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.flex}>
      <View style={styles.header}>
        <Text style={styles.brand}>☕ Kahve Falı</Text>
        <View style={{ flexDirection: 'row', gap: 18 }}>
          <Pressable onPress={onHistory} hitSlop={10}><Text style={styles.hIcon}>📜</Text></Pressable>
          <Pressable onPress={onSettings} hitSlop={10}><Text style={styles.hIcon}>⚙️</Text></Pressable>
        </View>
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {hasKey === false && (
            <Pressable style={styles.warn} onPress={onSettings}>
              <Text style={styles.warnText}>⚠️ OpenAI API anahtarın bağlı değil. Ayarlar'a dokun.</Text>
            </Pressable>
          )}

          <View style={styles.tabs}>
            <Pressable style={[styles.tab, mode === 'photo' && styles.tabActive]} onPress={() => setMode('photo')}>
              <Text style={[styles.tabText, mode === 'photo' && styles.tabTextActive]}>📷 Fotoğrafla</Text>
            </Pressable>
            <Pressable style={[styles.tab, mode === 'text' && styles.tabActive]} onPress={() => setMode('text')}>
              <Text style={[styles.tabText, mode === 'text' && styles.tabTextActive]}>✍️ Yazarak</Text>
            </Pressable>
          </View>

          {mode === 'photo' && (
            <View style={styles.card}>
              {imageUri
                ? <Image source={{ uri: imageUri }} style={styles.preview} resizeMode="cover" />
                : <View style={[styles.preview, styles.previewEmpty]}><Text style={{ color: C.sub }}>Fincan / tabak fotoğrafı</Text></View>}
              <View style={styles.row}>
                <Pressable style={styles.secondary} onPress={() => pick('camera')}><Text style={styles.secondaryText}>📸 Çek</Text></Pressable>
                <Pressable style={styles.secondary} onPress={() => pick('library')}><Text style={styles.secondaryText}>🖼️ Galeri</Text></Pressable>
              </View>
            </View>
          )}

          <Text style={styles.label}>{mode === 'photo' ? 'Niyetin (opsiyonel)' : 'Niyetin / sorun'}</Text>
          <TextInput
            style={styles.textArea}
            placeholder={mode === 'photo' ? 'Örn: İşimle ilgili merak ettiğim bir konu...' : 'Örn: Aşk hayatımda yakında ne olacak?'}
            placeholderTextColor={C.sub} value={question} onChangeText={setQuestion} multiline />

          <Pressable style={({ pressed }) => [styles.button, (loading || pressed) && styles.dim]} onPress={submit} disabled={loading}>
            {loading ? <ActivityIndicator color={C.primaryText} /> : <Text style={styles.buttonText}>🔮 Falıma Bak</Text>}
          </Pressable>
          <Text style={styles.disclaimer}>Fallar yapay zeka tarafından eğlence amaçlı üretilir.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Reading({ reading, onBack }) {
  return (
    <SafeAreaView style={styles.flex}>
      <TopBar title="Falın" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={{ fontSize: 52, textAlign: 'center', marginBottom: 12 }}>🔮</Text>
        {reading.question ? (
          <View style={styles.qBox}>
            <Text style={styles.qLabel}>NİYETİN</Text>
            <Text style={styles.qText}>{reading.question}</Text>
          </View>
        ) : null}
        <View style={styles.resultCard}><Text style={styles.result}>{reading.result}</Text></View>
        <Text style={styles.meta}>
          {reading.type === 'photo' ? '📷 Fotoğraflı' : '✍️ Yazılı'} · {reading.model} · {timeAgo(reading.created_at)}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function History({ onBack, onOpen }) {
  const [items, setItems] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { setItems(await api('/me/readings')); } catch { setItems([]); }
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <SafeAreaView style={styles.flex}>
      <TopBar title="Geçmiş Fallar" onBack={onBack} />
      {items === null ? (
        <View style={styles.center}><ActivityIndicator size="large" color={C.primary} /></View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{ padding: 16, gap: 12 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={C.primary} />}
          ListEmptyComponent={<View style={styles.center}><Text style={{ fontSize: 48, marginBottom: 12 }}>☕</Text><Text style={{ color: C.sub }}>Henüz fal baktırmadın.</Text></View>}
          renderItem={({ item }) => (
            <Pressable style={styles.item} onPress={() => onOpen(item)}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                <Text>{item.type === 'photo' ? '📷' : '✍️'}</Text>
                <Text style={{ color: C.sub, fontSize: 12 }}>{timeAgo(item.created_at)}</Text>
              </View>
              {item.question ? <Text style={{ color: C.accent, fontStyle: 'italic', marginBottom: 4 }} numberOfLines={1}>{item.question}</Text> : null}
              <Text style={{ color: C.text, lineHeight: 21 }} numberOfLines={2}>{item.result}</Text>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

function Settings({ onBack, onLogout }) {
  const [s, setS] = useState(null);
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('gpt-4o-mini');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);

  useEffect(() => {
    api('/me/settings').then((d) => { setS(d); setModel(d.model); })
      .catch(() => setS({ has_api_key: false, key_last4: null, model: 'gpt-4o-mini' }));
  }, []);

  async function test() {
    if (!apiKey.trim()) { Alert.alert('Anahtar gerekli', 'Önce API anahtarını gir.'); return; }
    setTesting(true);
    try {
      const { valid } = await api('/me/settings/test', { method: 'POST', body: JSON.stringify({ openai_api_key: apiKey.trim() }) });
      Alert.alert(valid ? '✅ Geçerli' : '❌ Geçersiz', valid ? 'API anahtarı çalışıyor.' : 'Bu anahtar kabul edilmedi.');
    } catch (e) { Alert.alert('Hata', e.message); } finally { setTesting(false); }
  }

  async function save() {
    setSaving(true);
    try {
      const payload = { model };
      if (apiKey.trim()) payload.openai_api_key = apiKey.trim();
      const updated = await api('/me/settings', { method: 'PUT', body: JSON.stringify(payload) });
      setS(updated); setApiKey('');
      Alert.alert('Kaydedildi', 'Ayarların güncellendi.');
    } catch (e) { Alert.alert('Hata', e.message); } finally { setSaving(false); }
  }

  return (
    <SafeAreaView style={styles.flex}>
      <TopBar title="Ayarlar" onBack={onBack} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {s === null ? <ActivityIndicator color={C.primary} style={{ marginTop: 40 }} /> : (
            <>
              <Text style={styles.section}>ChatGPT (OpenAI) Bağlantısı</Text>
              <View style={styles.statusBox}>
                <Text style={{ color: C.text, fontWeight: '600' }}>
                  {s.has_api_key ? `✅ Bağlı · anahtar •••• ${s.key_last4 || ''}` : '⚠️ API anahtarı bağlı değil'}
                </Text>
              </View>

              <Text style={styles.label}>OpenAI API Anahtarı</Text>
              <TextInput style={styles.input} placeholder={s.has_api_key ? 'Yeni anahtar girerek değiştir' : 'sk-...'}
                placeholderTextColor={C.sub} autoCapitalize="none" autoCorrect={false} secureTextEntry
                value={apiKey} onChangeText={setApiKey} />
              <Pressable onPress={() => Linking.openURL('https://platform.openai.com/api-keys')}>
                <Text style={styles.link}>API anahtarını nereden alırım? →</Text>
              </Pressable>
              <Pressable style={styles.guideBtn} onPress={() => setGuideOpen(true)}>
                <Text style={styles.guideBtnText}>📘 Adım adım rehber: API anahtarı nasıl alınır?</Text>
              </Pressable>

              <Pressable style={[styles.secondary, { marginTop: 14 }, testing && styles.dim]} onPress={test} disabled={testing}>
                {testing ? <ActivityIndicator color={C.text} /> : <Text style={styles.secondaryText}>Bağlantıyı Test Et</Text>}
              </Pressable>

              <Text style={[styles.section, { marginTop: 28 }]}>Model</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {MODELS.map((m) => (
                  <Pressable key={m} style={[styles.chip, model === m && styles.chipActive]} onPress={() => setModel(m)}>
                    <Text style={[styles.chipText, model === m && styles.chipTextActive]}>{m}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={{ color: C.sub, fontSize: 13, marginTop: 10, lineHeight: 19 }}>
                Fotoğraflı fal için görsel destekli bir model gerekir (gpt-4o-mini önerilir).
              </Text>

              <Pressable style={({ pressed }) => [styles.button, { marginTop: 28 }, (saving || pressed) && styles.dim]} onPress={save} disabled={saving}>
                {saving ? <ActivityIndicator color={C.primaryText} /> : <Text style={styles.buttonText}>Kaydet</Text>}
              </Pressable>

              <View style={{ height: 1, backgroundColor: C.border, marginVertical: 24 }} />
              <Pressable style={{ paddingVertical: 14, alignItems: 'center' }} onPress={onLogout}>
                <Text style={{ color: C.sub, fontWeight: '700' }}>Çıkış Yap</Text>
              </Pressable>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={guideOpen} animationType="slide" transparent onRequestClose={() => setGuideOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>OpenAI API Anahtarı Alma Rehberi</Text>
            <ScrollView style={{ maxHeight: 460 }} showsVerticalScrollIndicator={false}>
              {GUIDE_STEPS.map((st, i) => (
                <View key={i} style={styles.stepRow}>
                  <View style={styles.stepNum}><Text style={styles.stepNumText}>{i + 1}</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.stepTitle}>{st.title}</Text>
                    <Text style={styles.stepBody}>{st.body}</Text>
                  </View>
                </View>
              ))}
              <Text style={styles.guideNote}>
                💡 ChatGPT Plus aboneliği API kredisi sağlamaz; API ayrı ücretlendirilir. gpt-4o-mini ile bir fal yalnızca birkaç kuruştur. Anahtarını kimseyle paylaşma; sızarsa API keys sayfasından "Revoke" et.
              </Text>
            </ScrollView>
            <View style={styles.modalBtns}>
              <Pressable style={styles.modalSecondary} onPress={() => Linking.openURL('https://platform.openai.com/api-keys')}>
                <Text style={styles.modalSecondaryText}>Anahtar sayfasını aç</Text>
              </Pressable>
              <Pressable style={styles.modalPrimary} onPress={() => setGuideOpen(false)}>
                <Text style={styles.modalPrimaryText}>Anladım</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function TopBar({ title, onBack }) {
  return (
    <View style={styles.header}>
      <Pressable onPress={onBack} hitSlop={10}><Text style={styles.back}>‹ Geri</Text></Pressable>
      <Text style={styles.brand}>{title}</Text>
      <View style={{ width: 54 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: C.bg },
  authContent: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  logo: { fontSize: 64, textAlign: 'center' },
  title: { fontSize: 28, fontWeight: '800', textAlign: 'center', color: C.text, marginTop: 8 },
  subtitle: { fontSize: 15, textAlign: 'center', color: C.sub, marginTop: 4, marginBottom: 24 },
  input: { backgroundColor: C.card, color: C.text, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 16, marginBottom: 12 },
  button: { backgroundColor: C.primary, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  dim: { opacity: 0.6 },
  buttonText: { color: C.primaryText, fontSize: 17, fontWeight: '800' },
  switch: { color: C.accent, textAlign: 'center', marginTop: 18, fontWeight: '600' },
  error: { color: C.danger, textAlign: 'center', marginBottom: 8 },
  version: { color: C.sub, textAlign: 'center', marginTop: 28, fontSize: 12, opacity: 0.7 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  brand: { color: C.text, fontSize: 19, fontWeight: '800' },
  back: { color: C.accent, fontSize: 16, fontWeight: '700', width: 54 },
  hIcon: { fontSize: 22 },
  content: { padding: 20, paddingBottom: 44 },
  warn: { backgroundColor: C.card2, borderWidth: 1, borderColor: C.accent, borderRadius: 12, padding: 14, marginBottom: 18 },
  warnText: { color: C.accent, fontWeight: '600' },
  tabs: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  tab: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, alignItems: 'center' },
  tabActive: { backgroundColor: C.card2, borderColor: C.primary },
  tabText: { color: C.sub, fontWeight: '700', fontSize: 15 },
  tabTextActive: { color: C.text },
  card: { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 14, marginBottom: 18 },
  preview: { width: '100%', height: 220, borderRadius: 12, backgroundColor: C.card2 },
  previewEmpty: { alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', gap: 10, marginTop: 12 },
  secondary: { flex: 1, paddingVertical: 13, borderRadius: 10, backgroundColor: C.card2, alignItems: 'center', borderWidth: 1, borderColor: C.border },
  secondaryText: { color: C.text, fontWeight: '700', fontSize: 15 },
  label: { color: C.sub, fontSize: 13, fontWeight: '600', marginBottom: 8, textTransform: 'uppercase' },
  textArea: { backgroundColor: C.card, color: C.text, borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 14, fontSize: 16, minHeight: 90, textAlignVertical: 'top', marginBottom: 18 },
  disclaimer: { color: C.sub, fontSize: 12, textAlign: 'center', marginTop: 16, opacity: 0.8 },
  qBox: { backgroundColor: C.card2, borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: C.border },
  qLabel: { color: C.sub, fontSize: 12, fontWeight: '700', marginBottom: 4 },
  qText: { color: C.text, fontSize: 15, fontStyle: 'italic' },
  resultCard: { backgroundColor: C.card, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: C.border },
  result: { color: C.text, fontSize: 16, lineHeight: 26 },
  meta: { color: C.sub, fontSize: 12, textAlign: 'center', marginTop: 18 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  item: { backgroundColor: C.card, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: C.border },
  section: { color: C.text, fontSize: 17, fontWeight: '800', marginBottom: 12 },
  statusBox: { backgroundColor: C.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: C.border, marginBottom: 20 },
  link: { color: C.accent, fontWeight: '600', marginTop: 10 },
  guideBtn: { marginTop: 14, backgroundColor: C.card2, borderWidth: 1, borderColor: C.primary, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 14, alignItems: 'center' },
  guideBtnText: { color: C.accent, fontSize: 14, fontWeight: '700' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: C.bg, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 1, borderColor: C.border, padding: 20, paddingBottom: 28 },
  modalHandle: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: C.border, marginBottom: 14 },
  modalTitle: { color: C.text, fontSize: 19, fontWeight: '800', marginBottom: 16, textAlign: 'center' },
  stepRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  stepNum: { width: 28, height: 28, borderRadius: 14, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  stepNumText: { color: C.primaryText, fontWeight: '800', fontSize: 14 },
  stepTitle: { color: C.text, fontSize: 15, fontWeight: '700', marginBottom: 3 },
  stepBody: { color: C.sub, fontSize: 14, lineHeight: 20 },
  guideNote: { color: C.accent, fontSize: 13, lineHeight: 20, marginTop: 4, marginBottom: 8 },
  modalBtns: { flexDirection: 'row', gap: 10, marginTop: 12 },
  modalSecondary: { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: C.card2, borderWidth: 1, borderColor: C.border, alignItems: 'center' },
  modalSecondaryText: { color: C.text, fontWeight: '700', fontSize: 15 },
  modalPrimary: { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: C.primary, alignItems: 'center' },
  modalPrimaryText: { color: C.primaryText, fontWeight: '800', fontSize: 15 },
  chip: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
  chipActive: { backgroundColor: C.card2, borderColor: C.primary },
  chipText: { color: C.sub, fontWeight: '700', fontSize: 14 },
  chipTextActive: { color: C.text },
});
