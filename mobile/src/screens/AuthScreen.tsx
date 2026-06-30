import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
} from 'react-native';
import { api } from '../api';
import { colors, APP_VERSION } from '../theme';

export default function AuthScreen({ onAuthed }: { onAuthed: () => void }) {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (!email || !password || (isRegister && !username)) {
      setError('Lütfen tüm alanları doldurun.');
      return;
    }
    setLoading(true);
    try {
      if (isRegister) {
        await api.auth.register(email.trim(), username.trim(), password);
      } else {
        await api.auth.login(email.trim(), password);
      }
      onAuthed();
    } catch (e: any) {
      setError(e?.message ?? 'Bir hata oluştu');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.logo}>⚡</Text>
      <Text style={styles.title}>Pokémon Açık Artırma</Text>
      <Text style={styles.subtitle}>{isRegister ? 'Hesap oluştur' : 'Tekrar hoş geldin'}</Text>

      <TextInput
        style={styles.input}
        placeholder="E-posta"
        placeholderTextColor={colors.sub}
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      {isRegister && (
        <TextInput
          style={styles.input}
          placeholder="Kullanıcı adı"
          placeholderTextColor={colors.sub}
          autoCapitalize="none"
          value={username}
          onChangeText={setUsername}
        />
      )}
      <TextInput
        style={styles.input}
        placeholder="Parola"
        placeholderTextColor={colors.sub}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable
        style={({ pressed }) => [styles.button, (loading || pressed) && styles.buttonDim]}
        onPress={submit}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color={colors.primaryText} />
        ) : (
          <Text style={styles.buttonText}>{isRegister ? 'Kayıt ol' : 'Giriş yap'}</Text>
        )}
      </Pressable>

      <Pressable onPress={() => { setError(null); setIsRegister(!isRegister); }}>
        <Text style={styles.switchText}>
          {isRegister ? 'Zaten hesabın var mı? Giriş yap' : 'Hesabın yok mu? Kayıt ol'}
        </Text>
      </Pressable>

        <Text style={styles.version}>{APP_VERSION}</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  content: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  logo: { fontSize: 56, textAlign: 'center' },
  title: { fontSize: 26, fontWeight: '800', textAlign: 'center', color: colors.text, marginTop: 8 },
  subtitle: { fontSize: 15, textAlign: 'center', color: colors.sub, marginTop: 4, marginBottom: 24 },
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
  button: { backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 4 },
  buttonDim: { opacity: 0.6 },
  buttonText: { color: colors.primaryText, fontSize: 16, fontWeight: '700' },
  switchText: { color: colors.primary, textAlign: 'center', marginTop: 18, fontSize: 14, fontWeight: '600' },
  error: { color: colors.danger, textAlign: 'center', marginBottom: 8 },
  version: { color: colors.sub, textAlign: 'center', marginTop: 28, fontSize: 12, opacity: 0.7 },
});
