import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { api, Gender, MaritalStatus, Settings, SettingsUpdate } from '../api';
import { colors } from '../theme';

// Pano içeriği bir OpenAI anahtarına benziyor mu? (sk-... ve sk-proj-...)
const KEY_RE = /^sk-[A-Za-z0-9_-]{20,}$/;

const GENDERS: { v: Gender; l: string }[] = [
  { v: 'kadin', l: 'Kadın' },
  { v: 'erkek', l: 'Erkek' },
  { v: 'diger', l: 'Belirtmek istemiyorum' },
];
const MARITALS: { v: MaritalStatus; l: string }[] = [
  { v: 'bekar', l: 'Bekâr' },
  { v: 'evli', l: 'Evli' },
  { v: 'iliskisi_var', l: 'İlişkim var' },
  { v: 'diger', l: 'Belirtmek istemiyorum' },
];

// Rakamları YYYY-AA-GG biçimine sokar (kullanıcı yazarken tireleri otomatik ekler).
function formatBirthInput(s: string): string {
  const d = s.replace(/\D/g, '').slice(0, 8);
  let out = d.slice(0, 4);
  if (d.length > 4) out += '-' + d.slice(4, 6);
  if (d.length > 6) out += '-' + d.slice(6, 8);
  return out;
}

const MODELS = ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4.1'];

// Ayarlar'daki "Adım adım rehber" içeriği — OpenAI API anahtarı nasıl alınıp girilir.
const GUIDE_STEPS: { title: string; body: string }[] = [
  {
    title: 'OpenAI hesabına giriş yap',
    body: 'platform.openai.com adresine git ve ChatGPT hesabınla giriş yap. Hesabın yoksa ücretsiz kayıt ol — ChatGPT girişinle aynısıdır.',
  },
  {
    title: 'Ödeme yöntemi ekle',
    body: 'Settings → Billing → "Add payment method". API kullanımı, ChatGPT Plus aboneliğinden ayrı ve kullandıkça-öde mantığıyla ücretlendirilir. Genellikle 5$ kredi yüklemek uzun süre yeter.',
  },
  {
    title: 'API anahtarları sayfasını aç',
    body: 'platform.openai.com/api-keys adresine git (sağ üst menüden "API keys"). Bu uygulamadaki "API anahtarını nereden alırım? →" bağlantısı da seni buraya götürür.',
  },
  {
    title: 'Yeni anahtar oluştur',
    body: '"Create new secret key" düğmesine bas, anahtara bir isim ver (ör. "Kahve Falı") ve "Create" de.',
  },
  {
    title: 'Anahtarı kopyala',
    body: 'Oluşan ve "sk-" ile başlayan anahtarı hemen kopyala. ⚠️ Bu anahtar yalnızca bir kez gösterilir; pencereyi kapatınca tekrar göremezsin.',
  },
  {
    title: 'Buraya yapıştır ve kaydet',
    body: 'Bu ekrandaki "OpenAI API Anahtarı" alanına yapıştır → "Bağlantıyı Test Et" (yeşil ✅ görmelisin) → "Kaydet". Hepsi bu!',
  },
];

export default function SettingsScreen({
  onBack,
  onLogout,
}: {
  onBack: () => void;
  onLogout: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('gpt-4o-mini');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [clipKey, setClipKey] = useState<string | null>(null);
  const [birthDate, setBirthDate] = useState('');
  const [gender, setGender] = useState<Gender | null>(null);
  const [marital, setMarital] = useState<MaritalStatus | null>(null);

  // Pano'da sk-... ile başlayan bir anahtar varsa tek dokunuşla yapıştırma öner.
  // Kullanıcı OpenAI sayfasından kopyalayıp uygulamaya dönünce yakalanır.
  const checkClipboard = useCallback(async () => {
    try {
      const t = (await Clipboard.getStringAsync()).trim();
      setClipKey(KEY_RE.test(t) ? t : null);
    } catch {
      /* pano okunamadı */
    }
  }, []);

  useEffect(() => {
    checkClipboard();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') checkClipboard();
    });
    return () => sub.remove();
  }, [checkClipboard]);

  useEffect(() => {
    api.settings
      .get()
      .then((s) => {
        setSettings(s);
        setModel(s.model);
        setBirthDate(s.birth_date ?? '');
        setGender(s.gender);
        setMarital(s.marital_status);
      })
      .catch(() =>
        setSettings({ has_api_key: false, key_last4: null, model: 'gpt-4o-mini', birth_date: null, gender: null, marital_status: null })
      );
  }, []);

  async function testKey() {
    const key = apiKey.trim();
    if (!key && !settings?.has_api_key) {
      Alert.alert('Anahtar gerekli', 'Test için önce API anahtarınızı girin.');
      return;
    }
    setTesting(true);
    try {
      // Kutu boşsa kayıtlı anahtar test edilir (key undefined gönderilir).
      const { valid } = await api.settings.test(key || undefined);
      Alert.alert(valid ? '✅ Geçerli' : '❌ Geçersiz', valid ? 'API anahtarı çalışıyor.' : 'Bu anahtar kabul edilmedi.');
    } catch (e: any) {
      Alert.alert('Hata', e?.message ?? 'Test başarısız');
    } finally {
      setTesting(false);
    }
  }

  async function save() {
    setSaving(true);
    try {
      const payload: SettingsUpdate = {
        model,
        birth_date: birthDate.trim() || null,
        gender,
        marital_status: marital,
      };
      if (apiKey.trim()) payload.openai_api_key = apiKey.trim();
      const updated = await api.settings.update(payload);
      setSettings(updated);
      setApiKey('');
      Alert.alert('Kaydedildi', 'Ayarların güncellendi.');
    } catch (e: any) {
      Alert.alert('Hata', e?.message ?? 'Kaydedilemedi');
    } finally {
      setSaving(false);
    }
  }

  async function removeKey() {
    Alert.alert('Anahtarı kaldır', 'Kayıtlı OpenAI API anahtarın silinsin mi?', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Kaldır',
        style: 'destructive',
        onPress: async () => {
          try {
            const updated = await api.settings.update({ openai_api_key: '', model });
            setSettings(updated);
            setApiKey('');
          } catch (e: any) {
            Alert.alert('Hata', e?.message ?? 'Kaldırılamadı');
          }
        },
      },
    ]);
  }

  return (
    <View style={[styles.flex, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={10}>
          <Text style={styles.back}>‹ Geri</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Ayarlar</Text>
        <View style={{ width: 54 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        automaticallyAdjustKeyboardInsets
      >
        {settings === null ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : (
          <>
            <Text style={styles.section}>ChatGPT (OpenAI) Bağlantısı</Text>
            <View style={styles.statusBox}>
              <Text style={styles.statusText}>
                {settings.has_api_key
                  ? `✅ Bağlı · anahtar •••• ${settings.key_last4 ?? ''}`
                  : '⚠️ API anahtarı bağlı değil'}
              </Text>
            </View>

            <Text style={styles.label}>OpenAI API Anahtarı</Text>

            {clipKey && clipKey !== apiKey && (
              <Pressable
                style={styles.pasteBanner}
                onPress={() => { setApiKey(clipKey); setClipKey(null); }}
              >
                <Text style={styles.pasteBannerText}>📋 Panodaki anahtarı yapıştır</Text>
                <Text style={styles.pasteBannerSub}>sk-…{clipKey.slice(-4)} · dokun</Text>
              </Pressable>
            )}

            <TextInput
              style={styles.input}
              placeholder={settings.has_api_key ? 'Yeni anahtar girerek değiştir' : 'sk-...'}
              placeholderTextColor={colors.sub}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              value={apiKey}
              onChangeText={setApiKey}
            />

            <Pressable onPress={() => Linking.openURL('https://platform.openai.com/api-keys')}>
              <Text style={styles.link}>API anahtarını nereden alırım? →</Text>
            </Pressable>

            <Pressable style={styles.guideBtn} onPress={() => setGuideOpen(true)}>
              <Text style={styles.guideBtnText}>📘 Adım adım rehber: API anahtarı nasıl alınır?</Text>
            </Pressable>

            <View style={styles.row}>
              <Pressable
                style={[styles.secondary, testing && styles.dim]}
                onPress={testKey}
                disabled={testing}
              >
                {testing ? (
                  <ActivityIndicator color={colors.text} />
                ) : (
                  <Text style={styles.secondaryText}>Bağlantıyı Test Et</Text>
                )}
              </Pressable>
            </View>

            <Text style={[styles.section, { marginTop: 28 }]}>Model</Text>
            <View style={styles.chips}>
              {MODELS.map((m) => (
                <Pressable
                  key={m}
                  style={[styles.chip, model === m && styles.chipActive]}
                  onPress={() => setModel(m)}
                >
                  <Text style={[styles.chipText, model === m && styles.chipTextActive]}>{m}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.hint}>
              Fotoğraflı fal için görsel destekli bir model gerekir (gpt-4o-mini önerilir).
            </Text>

            <Text style={[styles.section, { marginTop: 28 }]}>Profil (opsiyonel)</Text>
            <Text style={styles.hint}>
              Doldurursan falın sana göre kişiselleştirilir (burç, medeni durum vb.). İstersen boş bırak.
            </Text>

            <Text style={[styles.label, { marginTop: 14 }]}>Doğum tarihi</Text>
            <TextInput
              style={styles.input}
              placeholder="YYYY-AA-GG (örn. 1990-05-21)"
              placeholderTextColor={colors.sub}
              keyboardType="number-pad"
              value={birthDate}
              onChangeText={(t) => setBirthDate(formatBirthInput(t))}
              maxLength={10}
            />

            <Text style={[styles.label, { marginTop: 14 }]}>Cinsiyet</Text>
            <View style={styles.chips}>
              {GENDERS.map((g) => (
                <Pressable
                  key={g.v}
                  style={[styles.chip, gender === g.v && styles.chipActive]}
                  onPress={() => setGender(gender === g.v ? null : g.v)}
                >
                  <Text style={[styles.chipText, gender === g.v && styles.chipTextActive]}>{g.l}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.label, { marginTop: 14 }]}>Medeni durum</Text>
            <View style={styles.chips}>
              {MARITALS.map((m) => (
                <Pressable
                  key={m.v}
                  style={[styles.chip, marital === m.v && styles.chipActive]}
                  onPress={() => setMarital(marital === m.v ? null : m.v)}
                >
                  <Text style={[styles.chipText, marital === m.v && styles.chipTextActive]}>{m.l}</Text>
                </Pressable>
              ))}
            </View>

            <Pressable
              style={({ pressed }) => [styles.button, (saving || pressed) && styles.dim]}
              onPress={save}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color={colors.primaryText} />
              ) : (
                <Text style={styles.buttonText}>Kaydet</Text>
              )}
            </Pressable>

            {settings.has_api_key && (
              <Pressable style={styles.removeBtn} onPress={removeKey}>
                <Text style={styles.removeText}>Anahtarı Kaldır</Text>
              </Pressable>
            )}

            <View style={styles.divider} />

            <Pressable style={styles.logoutBtn} onPress={onLogout}>
              <Text style={styles.logoutText}>Çıkış Yap</Text>
            </Pressable>
          </>
        )}
      </ScrollView>

      <Modal visible={guideOpen} animationType="slide" transparent onRequestClose={() => setGuideOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>OpenAI API Anahtarı Alma Rehberi</Text>
            <ScrollView style={{ maxHeight: 460 }} showsVerticalScrollIndicator={false}>
              {GUIDE_STEPS.map((s, i) => (
                <View key={i} style={styles.stepRow}>
                  <View style={styles.stepNum}>
                    <Text style={styles.stepNumText}>{i + 1}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.stepTitle}>{s.title}</Text>
                    <Text style={styles.stepBody}>{s.body}</Text>
                  </View>
                </View>
              ))}
              <Text style={styles.guideNote}>
                💡 ChatGPT Plus aboneliği API kredisi sağlamaz; API ayrı ücretlendirilir. gpt-4o-mini ile bir fal yalnızca birkaç kuruştur. Anahtarını kimseyle paylaşma; sızarsa API keys sayfasından "Revoke" et.
              </Text>
            </ScrollView>
            <View style={styles.modalBtns}>
              <Pressable
                style={styles.modalSecondary}
                onPress={() => Linking.openURL('https://platform.openai.com/api-keys')}
              >
                <Text style={styles.modalSecondaryText}>Anahtar sayfasını aç</Text>
              </Pressable>
              <Pressable style={styles.modalPrimary} onPress={() => setGuideOpen(false)}>
                <Text style={styles.modalPrimaryText}>Anladım</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
  content: { padding: 20, paddingBottom: 48 },
  section: { color: colors.text, fontSize: 17, fontWeight: '800', marginBottom: 12 },
  statusBox: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 20,
  },
  statusText: { color: colors.text, fontSize: 15, fontWeight: '600' },
  label: { color: colors.sub, fontSize: 13, fontWeight: '600', marginBottom: 8, textTransform: 'uppercase' },
  input: {
    backgroundColor: colors.card,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 16,
  },
  link: { color: colors.accent, fontSize: 14, fontWeight: '600', marginTop: 10 },
  pasteBanner: {
    backgroundColor: colors.card2,
    borderWidth: 1,
    borderColor: colors.good,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pasteBannerText: { color: colors.good, fontSize: 15, fontWeight: '700' },
  pasteBannerSub: { color: colors.sub, fontSize: 13, fontWeight: '600' },
  guideBtn: {
    marginTop: 14,
    backgroundColor: colors.card2,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  guideBtnText: { color: colors.accent, fontSize: 14, fontWeight: '700' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
  },
  modalHandle: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: colors.border, marginBottom: 14 },
  modalTitle: { color: colors.text, fontSize: 19, fontWeight: '800', marginBottom: 16, textAlign: 'center' },
  stepRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  stepNum: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  stepNumText: { color: colors.primaryText, fontWeight: '800', fontSize: 14 },
  stepTitle: { color: colors.text, fontSize: 15, fontWeight: '700', marginBottom: 3 },
  stepBody: { color: colors.sub, fontSize: 14, lineHeight: 20 },
  guideNote: { color: colors.accent, fontSize: 13, lineHeight: 20, marginTop: 4, marginBottom: 8 },
  modalBtns: { flexDirection: 'row', gap: 10, marginTop: 12 },
  modalSecondary: { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: colors.card2, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  modalSecondaryText: { color: colors.text, fontWeight: '700', fontSize: 15 },
  modalPrimary: { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center' },
  modalPrimaryText: { color: colors.primaryText, fontWeight: '800', fontSize: 15 },
  row: { flexDirection: 'row', gap: 10, marginTop: 14 },
  secondary: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 10,
    backgroundColor: colors.card2,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryText: { color: colors.text, fontWeight: '700', fontSize: 15 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.card2, borderColor: colors.primary },
  chipText: { color: colors.sub, fontWeight: '700', fontSize: 14 },
  chipTextActive: { color: colors.text },
  hint: { color: colors.sub, fontSize: 13, marginTop: 10, lineHeight: 19 },
  button: { backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 28 },
  dim: { opacity: 0.6 },
  buttonText: { color: colors.primaryText, fontSize: 17, fontWeight: '800' },
  removeBtn: { paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  removeText: { color: colors.danger, fontSize: 15, fontWeight: '700' },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 24 },
  logoutBtn: { paddingVertical: 14, alignItems: 'center' },
  logoutText: { color: colors.sub, fontSize: 15, fontWeight: '700' },
});
