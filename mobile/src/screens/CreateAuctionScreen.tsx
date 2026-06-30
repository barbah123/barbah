import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { api } from '../api';
import { colors } from '../theme';

const DURATIONS = [
  { label: '6 saat', h: 6 },
  { label: '12 saat', h: 12 },
  { label: '1 gün', h: 24 },
  { label: '3 gün', h: 72 },
  { label: '7 gün', h: 168 },
];

export default function CreateAuctionScreen({ onDone }: { onDone: () => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startingPrice, setStartingPrice] = useState('');
  const [minIncrement, setMinIncrement] = useState('');
  const [durationHours, setDurationHours] = useState(24);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pickImage() {
    setError(null);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError('Galeri izni gerekli.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [3, 4],
      quality: 0.7,
    });
    if (!result.canceled) {
      setImageUri(result.assets[0].uri);
    }
  }

  async function submit() {
    setError(null);
    const sp = Number(startingPrice);
    const mi = Number(minIncrement);
    const dh = Number(durationHours);
    if (!title.trim()) {
      setError('Başlık gerekli.');
      return;
    }
    if (!sp || sp <= 0 || !mi || mi <= 0 || !dh || dh <= 0) {
      setError('Fiyat, artış ve süre pozitif sayı olmalı.');
      return;
    }

    setBusy(true);
    try {
      let cardImageKey = 'none';
      if (imageUri) {
        cardImageKey = await api.images.upload(imageUri);
      }
      await api.auctions.create({
        title: title.trim(),
        description: description.trim(),
        card_image_key: cardImageKey,
        starting_price: sp,
        min_bid_increment: mi,
        duration_hours: dh,
      });
      onDone();
    } catch (e: any) {
      setError(e?.message ?? 'Oluşturulamadı');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={onDone} hitSlop={8}>
          <Text style={styles.back}>← İptal</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Yeni İlan</Text>
        <View style={{ width: 52 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <Pressable style={styles.imagePicker} onPress={pickImage}>
            {imageUri ? (
              <Image source={{ uri: imageUri }} style={styles.preview} />
            ) : (
              <View style={styles.previewPlaceholder}>
                <Text style={{ fontSize: 40 }}>🃏</Text>
                <Text style={styles.pickHint}>Kart fotoğrafı seç</Text>
              </View>
            )}
          </Pressable>

          <TextInput style={styles.input} placeholder="Başlık (ör. Charizard 1st Ed)" placeholderTextColor={colors.sub} value={title} onChangeText={setTitle} />
          <TextInput style={[styles.input, styles.multiline]} placeholder="Açıklama (opsiyonel)" placeholderTextColor={colors.sub} value={description} onChangeText={setDescription} multiline />

          <View style={styles.row}>
            <TextInput style={[styles.input, styles.half]} placeholder="Başlangıç ₺" placeholderTextColor={colors.sub} keyboardType="numeric" value={startingPrice} onChangeText={setStartingPrice} />
            <TextInput style={[styles.input, styles.half]} placeholder="Min. artış ₺" placeholderTextColor={colors.sub} keyboardType="numeric" value={minIncrement} onChangeText={setMinIncrement} />
          </View>
          <Text style={styles.label}>Açık artırma süresi</Text>
          <View style={styles.chips}>
            {DURATIONS.map((d) => (
              <Pressable
                key={d.h}
                style={[styles.chip, durationHours === d.h && styles.chipActive]}
                onPress={() => setDurationHours(d.h)}
              >
                <Text style={[styles.chipText, durationHours === d.h && styles.chipTextActive]}>{d.label}</Text>
              </Pressable>
            ))}
          </View>

          {error && <Text style={styles.error}>{error}</Text>}

          <Pressable style={({ pressed }) => [styles.button, (busy || pressed) && { opacity: 0.6 }]} onPress={submit} disabled={busy}>
            {busy ? <ActivityIndicator color={colors.primaryText} /> : <Text style={styles.buttonText}>İlanı Oluştur</Text>}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  back: { color: colors.primary, fontSize: 16, fontWeight: '700', width: 52 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
  imagePicker: { alignItems: 'center', marginBottom: 16 },
  preview: { width: 150, height: 200, borderRadius: 14, backgroundColor: colors.card2 },
  previewPlaceholder: {
    width: 150,
    height: 200,
    borderRadius: 14,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickHint: { color: colors.sub, marginTop: 8, fontSize: 13 },
  input: {
    backgroundColor: colors.card,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 16,
    marginBottom: 12,
  },
  multiline: { height: 80, textAlignVertical: 'top' },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  half: { width: '48%' },
  label: { color: colors.sub, fontSize: 13, fontWeight: '600', marginBottom: 8, marginTop: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 8,
    marginBottom: 8,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.sub, fontSize: 14, fontWeight: '600' },
  chipTextActive: { color: colors.primaryText },
  button: { backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 4 },
  buttonText: { color: colors.primaryText, fontSize: 16, fontWeight: '700' },
  error: { color: colors.danger, textAlign: 'center', marginBottom: 8 },
});
