import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { api, Reading } from '../api';
import { colors } from '../theme';

type Mode = 'photo' | 'text';
type Slot = { uri: string; b64: string } | null;

// Fal için gereken üç fotoğraf: iki fincan + bir tabak.
const PHOTO_SLOTS = [
  { label: 'Fincan 1', emoji: '☕' },
  { label: 'Fincan 2', emoji: '☕' },
  { label: 'Tabak', emoji: '🍽️' },
];

export default function HomeScreen({
  onOpenSettings,
  onOpenHistory,
  onResult,
}: {
  onOpenSettings: () => void;
  onOpenHistory: () => void;
  onResult: (reading: Reading) => void;
}) {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>('photo');
  const [photos, setPhotos] = useState<Slot[]>([null, null, null]);
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [hasKey, setHasKey] = useState<boolean | null>(null);

  useEffect(() => {
    api.settings
      .get()
      .then((s) => setHasKey(s.has_api_key))
      .catch(() => setHasKey(false));
  }, []);

  async function pickInto(index: number, source: 'camera' | 'library') {
    try {
      const perm =
        source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('İzin gerekli', 'Fotoğraf için izin vermeniz gerekiyor.');
        return;
      }
      const opts: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.5,
        base64: true,
      };
      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync(opts)
          : await ImagePicker.launchImageLibraryAsync(opts);
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      if (!asset.base64) return;
      setPhotos((prev) => {
        const next = [...prev];
        next[index] = { uri: asset.uri, b64: asset.base64! };
        return next;
      });
    } catch (e: any) {
      Alert.alert('Hata', e?.message ?? 'Fotoğraf seçilemedi');
    }
  }

  function chooseSource(index: number) {
    Alert.alert(PHOTO_SLOTS[index].label, 'Fotoğrafı nasıl eklemek istersin?', [
      { text: '📸 Kamera', onPress: () => pickInto(index, 'camera') },
      { text: '🖼️ Galeri', onPress: () => pickInto(index, 'library') },
      ...(photos[index]
        ? [{ text: 'Kaldır', style: 'destructive' as const, onPress: () => clearSlot(index) }]
        : []),
      { text: 'Vazgeç', style: 'cancel' as const },
    ]);
  }

  function clearSlot(index: number) {
    setPhotos((prev) => {
      const next = [...prev];
      next[index] = null;
      return next;
    });
  }

  const filledCount = photos.filter(Boolean).length;

  async function submit() {
    if (mode === 'photo' && filledCount < 3) {
      Alert.alert('Üç fotoğraf gerekli', 'Lütfen iki fincan ve bir tabak fotoğrafı ekleyin.');
      return;
    }
    if (mode === 'text' && !question.trim()) {
      Alert.alert('Niyet yok', 'Lütfen niyetinizi/sorunuzu yazın.');
      return;
    }
    setLoading(true);
    try {
      const reading = await api.fortune.create({
        question: question.trim() || undefined,
        images:
          mode === 'photo'
            ? PHOTO_SLOTS.map((s, i) => ({ label: s.label, base64: photos[i]!.b64 }))
            : undefined,
      });
      setPhotos([null, null, null]);
      setQuestion('');
      onResult(reading);
    } catch (e: any) {
      Alert.alert('Fal bakılamadı', e?.message ?? 'Bir hata oluştu');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={[styles.flex, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.brand}>☕ Kahve Falı</Text>
        <View style={styles.headerBtns}>
          <Pressable onPress={onOpenHistory} hitSlop={10}>
            <Text style={styles.headerIcon}>📜</Text>
          </Pressable>
          <Pressable onPress={onOpenSettings} hitSlop={10}>
            <Text style={styles.headerIcon}>⚙️</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        automaticallyAdjustKeyboardInsets
      >
        {hasKey === false && (
          <Pressable style={styles.warn} onPress={onOpenSettings}>
            <Text style={styles.warnText}>
              ⚠️ OpenAI API anahtarınız bağlı değil. Fal baktırmak için Ayarlar'a dokunun.
            </Text>
          </Pressable>
        )}

        <View style={styles.tabs}>
          <Pressable
            style={[styles.tab, mode === 'photo' && styles.tabActive]}
            onPress={() => setMode('photo')}
          >
            <Text style={[styles.tabText, mode === 'photo' && styles.tabTextActive]}>📷 Fotoğrafla</Text>
          </Pressable>
          <Pressable
            style={[styles.tab, mode === 'text' && styles.tabActive]}
            onPress={() => setMode('text')}
          >
            <Text style={[styles.tabText, mode === 'text' && styles.tabTextActive]}>✍️ Yazarak</Text>
          </Pressable>
        </View>

        {mode === 'photo' && (
          <View style={styles.card}>
            <Text style={styles.cardHint}>
              İki fincan ve bir tabak fotoğrafı ekle ({filledCount}/3)
            </Text>
            <View style={styles.slots}>
              {PHOTO_SLOTS.map((slot, i) => (
                <Pressable key={slot.label} style={styles.slot} onPress={() => chooseSource(i)}>
                  {photos[i] ? (
                    <Image source={{ uri: photos[i]!.uri }} style={styles.slotImg} resizeMode="cover" />
                  ) : (
                    <View style={styles.slotEmpty}>
                      <Text style={styles.slotEmoji}>{slot.emoji}</Text>
                      <Text style={styles.slotPlus}>+</Text>
                    </View>
                  )}
                  <Text style={styles.slotLabel}>{slot.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        <Text style={styles.label}>
          {mode === 'photo' ? 'Niyetin (opsiyonel)' : 'Niyetin / sorun'}
        </Text>
        <TextInput
          style={styles.textArea}
          placeholder={
            mode === 'photo'
              ? 'Örn: İşimle ilgili merak ettiğim bir konu var...'
              : 'Örn: Aşk hayatımda yakın zamanda ne olacak?'
          }
          placeholderTextColor={colors.sub}
          value={question}
          onChangeText={setQuestion}
          multiline
        />

        <Pressable
          style={({ pressed }) => [styles.button, (loading || pressed) && styles.buttonDim]}
          onPress={submit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={colors.primaryText} />
          ) : (
            <Text style={styles.buttonText}>🔮 Falıma Bak</Text>
          )}
        </Pressable>

        <Text style={styles.disclaimer}>
          Fallar yapay zeka tarafından eğlence amaçlı üretilir.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  brand: { color: colors.text, fontSize: 20, fontWeight: '800' },
  headerBtns: { flexDirection: 'row', gap: 18 },
  headerIcon: { fontSize: 22 },
  content: { padding: 20, paddingBottom: 40 },
  warn: {
    backgroundColor: colors.card2,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 12,
    padding: 14,
    marginBottom: 18,
  },
  warnText: { color: colors.accent, fontSize: 14, fontWeight: '600' },
  tabs: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  tab: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  tabActive: { backgroundColor: colors.card2, borderColor: colors.primary },
  tabText: { color: colors.sub, fontWeight: '700', fontSize: 15 },
  tabTextActive: { color: colors.text },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 18,
  },
  cardHint: { color: colors.sub, fontSize: 13, fontWeight: '600', marginBottom: 12, textAlign: 'center' },
  slots: { flexDirection: 'row', gap: 10 },
  slot: { flex: 1, alignItems: 'center' },
  slotImg: { width: '100%', aspectRatio: 1, borderRadius: 12, backgroundColor: colors.card2 },
  slotEmpty: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 12,
    backgroundColor: colors.card2,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotEmoji: { fontSize: 26 },
  slotPlus: { color: colors.sub, fontSize: 20, fontWeight: '800', marginTop: 2 },
  slotLabel: { color: colors.text, fontSize: 13, fontWeight: '600', marginTop: 6 },
  label: { color: colors.sub, fontSize: 13, fontWeight: '600', marginBottom: 8, textTransform: 'uppercase' },
  textArea: {
    backgroundColor: colors.card,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    minHeight: 90,
    textAlignVertical: 'top',
    marginBottom: 18,
  },
  button: { backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  buttonDim: { opacity: 0.6 },
  buttonText: { color: colors.primaryText, fontSize: 17, fontWeight: '800' },
  disclaimer: { color: colors.sub, fontSize: 12, textAlign: 'center', marginTop: 16, opacity: 0.8 },
});
