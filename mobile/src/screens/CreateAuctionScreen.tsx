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

const CONDITIONS = ['Mint', 'Near Mint', 'Excellent', 'Good', 'Played'];
const MAX_IMAGES = 6;

export default function CreateAuctionScreen({ onDone }: { onDone: () => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [condition, setCondition] = useState('Near Mint');
  const [startingPrice, setStartingPrice] = useState('');
  const [minIncrement, setMinIncrement] = useState('');
  const [durationHours, setDurationHours] = useState(24);
  const [imageUris, setImageUris] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pickImages() {
    setError(null);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError('Galeri izni gerekli.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: MAX_IMAGES,
      quality: 0.7,
    });
    if (!result.canceled) {
      setImageUris((prev) => [...prev, ...result.assets.map((a) => a.uri)].slice(0, MAX_IMAGES));
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
      const keys: string[] = [];
      for (const uri of imageUris) keys.push(await api.images.upload(uri));
      await api.auctions.create({
        title: title.trim(),
        description: description.trim(),
        condition,
        card_image_key: keys[0] ?? 'none',
        image_keys: keys,
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
          <Text style={styles.label}>Fotoğraflar ({imageUris.length}/{MAX_IMAGES})</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.thumbRow}>
            {imageUris.map((uri, i) => (
              <View key={i} style={styles.thumbWrap}>
                <Image source={{ uri }} style={styles.thumbImg} />
                {i === 0 && (
                  <View style={styles.coverTag}>
                    <Text style={styles.coverText}>Kapak</Text>
                  </View>
                )}
                <Pressable style={styles.removeBtn} onPress={() => setImageUris((u) => u.filter((_, j) => j !== i))}>
                  <Text style={styles.removeText}>✕</Text>
                </Pressable>
              </View>
            ))}
            {imageUris.length < MAX_IMAGES && (
              <Pressable style={styles.addTile} onPress={pickImages}>
                <Text style={{ fontSize: 30, color: colors.sub }}>＋</Text>
                <Text style={styles.pickHint}>Foto ekle</Text>
              </Pressable>
            )}
          </ScrollView>

          <TextInput style={styles.input} placeholder="Başlık (ör. Charizard 1st Ed)" placeholderTextColor={colors.sub} value={title} onChangeText={setTitle} />
          <TextInput style={[styles.input, styles.multiline]} placeholder="Açıklama (opsiyonel)" placeholderTextColor={colors.sub} value={description} onChangeText={setDescription} multiline />

          <Text style={styles.label}>Kart durumu</Text>
          <View style={styles.chips}>
            {CONDITIONS.map((c) => (
              <Pressable key={c} style={[styles.chip, condition === c && styles.chipActive]} onPress={() => setCondition(c)}>
                <Text style={[styles.chipText, condition === c && styles.chipTextActive]}>{c}</Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.row}>
            <TextInput style={[styles.input, styles.half]} placeholder="Başlangıç ₺" placeholderTextColor={colors.sub} keyboardType="numeric" value={startingPrice} onChangeText={setStartingPrice} />
            <TextInput style={[styles.input, styles.half]} placeholder="Min. artış ₺" placeholderTextColor={colors.sub} keyboardType="numeric" value={minIncrement} onChangeText={setMinIncrement} />
          </View>

          <Text style={styles.label}>Açık artırma süresi</Text>
          <View style={styles.chips}>
            {DURATIONS.map((d) => (
              <Pressable key={d.h} style={[styles.chip, durationHours === d.h && styles.chipActive]} onPress={() => setDurationHours(d.h)}>
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
  thumbRow: { marginBottom: 12 },
  thumbWrap: { marginRight: 10, position: 'relative' },
  thumbImg: { width: 110, height: 150, borderRadius: 12, backgroundColor: colors.card2 },
  coverTag: { position: 'absolute', bottom: 6, left: 6, backgroundColor: 'rgba(99,102,241,0.9)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  coverText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  removeBtn: { position: 'absolute', top: -6, right: -6, width: 24, height: 24, borderRadius: 12, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center' },
  removeText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  addTile: {
    width: 110,
    height: 150,
    borderRadius: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickHint: { color: colors.sub, marginTop: 6, fontSize: 12 },
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
