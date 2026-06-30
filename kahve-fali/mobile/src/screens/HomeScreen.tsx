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
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [hasKey, setHasKey] = useState<boolean | null>(null);

  useEffect(() => {
    api.settings
      .get()
      .then((s) => setHasKey(s.has_api_key))
      .catch(() => setHasKey(false));
  }, []);

  async function pickFrom(source: 'camera' | 'library') {
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
      setImageUri(asset.uri);
      setImageBase64(asset.base64 ?? null);
    } catch (e: any) {
      Alert.alert('Hata', e?.message ?? 'Fotoğraf seçilemedi');
    }
  }

  async function submit() {
    if (mode === 'photo' && !imageBase64) {
      Alert.alert('Fotoğraf yok', 'Önce bir fincan fotoğrafı seçin veya çekin.');
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
        image_base64: mode === 'photo' ? imageBase64 ?? undefined : undefined,
      });
      // formu temizle
      setImageUri(null);
      setImageBase64(null);
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
            {imageUri ? (
              <Image source={{ uri: imageUri }} style={styles.preview} resizeMode="cover" />
            ) : (
              <View style={[styles.preview, styles.previewEmpty]}>
                <Text style={styles.previewEmptyText}>Fincan / tabak fotoğrafı</Text>
              </View>
            )}
            <View style={styles.row}>
              <Pressable style={styles.secondary} onPress={() => pickFrom('camera')}>
                <Text style={styles.secondaryText}>📸 Çek</Text>
              </Pressable>
              <Pressable style={styles.secondary} onPress={() => pickFrom('library')}>
                <Text style={styles.secondaryText}>🖼️ Galeri</Text>
              </Pressable>
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
  preview: { width: '100%', height: 220, borderRadius: 12, backgroundColor: colors.card2 },
  previewEmpty: { alignItems: 'center', justifyContent: 'center' },
  previewEmptyText: { color: colors.sub, fontSize: 15 },
  row: { flexDirection: 'row', gap: 10, marginTop: 12 },
  secondary: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: colors.card2,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryText: { color: colors.text, fontWeight: '700', fontSize: 15 },
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
