import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Speech from 'expo-speech';
import { Reading } from '../api';
import { colors, formatDateTime } from '../theme';

export default function ReadingScreen({
  reading,
  onBack,
}: {
  reading: Reading;
  onBack: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [speaking, setSpeaking] = useState(false);

  // Ekrandan çıkarken sesi durdur.
  useEffect(() => {
    return () => {
      Speech.stop();
    };
  }, []);

  function toggleSpeak() {
    if (speaking) {
      Speech.stop();
      setSpeaking(false);
      return;
    }
    setSpeaking(true);
    Speech.speak(reading.result, {
      language: 'tr-TR',
      rate: 0.98,
      pitch: 1.0,
      onDone: () => setSpeaking(false),
      onStopped: () => setSpeaking(false),
      onError: () => setSpeaking(false),
    });
  }

  return (
    <View style={[styles.flex, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={10}>
          <Text style={styles.back}>‹ Geri</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Falın</Text>
        <View style={{ width: 54 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.cup}>🔮</Text>
        {reading.question ? (
          <View style={styles.questionBox}>
            <Text style={styles.questionLabel}>Niyetin</Text>
            <Text style={styles.questionText}>{reading.question}</Text>
          </View>
        ) : null}

        <Pressable
          style={[styles.speakBtn, speaking && styles.speakBtnActive]}
          onPress={toggleSpeak}
        >
          <Text style={[styles.speakText, speaking && styles.speakTextActive]}>
            {speaking ? '⏹  Durdur' : '🔊  Sesli Dinle'}
          </Text>
        </Pressable>

        <View style={styles.card}>
          <Text style={styles.result}>{reading.result}</Text>
        </View>

        <Text style={styles.meta}>
          {reading.type === 'photo' ? '📷 Fotoğraflı' : '✍️ Yazılı'} · {reading.model} ·{' '}
          {formatDateTime(reading.created_at)}
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
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  back: { color: colors.accent, fontSize: 16, fontWeight: '700', width: 54 },
  headerTitle: { color: colors.text, fontSize: 18, fontWeight: '800' },
  content: { padding: 20, paddingBottom: 48 },
  cup: { fontSize: 52, textAlign: 'center', marginBottom: 12 },
  questionBox: {
    backgroundColor: colors.card2,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  questionLabel: { color: colors.sub, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', marginBottom: 4 },
  questionText: { color: colors.text, fontSize: 15, fontStyle: 'italic' },
  speakBtn: {
    backgroundColor: colors.card2,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    marginBottom: 16,
  },
  speakBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  speakText: { color: colors.accent, fontSize: 16, fontWeight: '800' },
  speakTextActive: { color: colors.primaryText },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  result: { color: colors.text, fontSize: 16, lineHeight: 26 },
  meta: { color: colors.sub, fontSize: 12, textAlign: 'center', marginTop: 18 },
});
