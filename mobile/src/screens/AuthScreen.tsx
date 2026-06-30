import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
} from 'react-native';
import { api } from '../api';
import { colors, APP_VERSION } from '../theme';

type Mode = 'login' | 'register' | 'reset';

export default function AuthScreen({ onAuthed }: { onAuthed: () => void }) {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsUsername = mode === 'register' || mode === 'reset';

  function go(next: Mode) {
    setError(null);
    setPassword('');
    setMode(next);
  }

  async function submit() {
    setError(null);
    if (!email || !password || (needsUsername && !username)) {
      setError('Lütfen tüm alanları doldurun.');
      return;
    }
    setLoading(true);
    try {
      if (mode === 'register') await api.auth.register(email.trim(), username.trim(), password);
      else if (mode === 'reset') await api.auth.resetPassword(email.trim(), username.trim(), password);
      else await api.auth.login(email.trim(), password);
      onAuthed();
    } catch (e: any) {
      setError(e?.message ?? 'Bir hata oluştu');
    } finally {
      setLoading(false);
    }
  }

  const title =
    mode === 'register' ? 'Hesap oluştur' : mode === 'reset' ? 'Şifreyi sıfırla' : 'Tekrar hoş geldin';
  const cta = mode === 'register' ? 'Kayıt ol' : mode === 'reset' ? 'Şifreyi sıfırla' : 'Giriş yap';

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      automaticallyAdjustKeyboardInsets
    >
      <Text style={styles.logo}>⚡</Text>
      <Text style={styles.title}>Pokémon Açık Artırma</Text>
      <Text style={styles.subtitle}>{title}</Text>

      {mode === 'reset' && (
        <Text style={styles.hint}>
          E-posta ve kullanıcı adını doğrula, yeni parolanı belirle.
        </Text>
      )}

      <TextInput
        style={styles.input}
        placeholder="E-posta"
        placeholderTextColor={colors.sub}
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      {needsUsername && (
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
        placeholder={mode === 'reset' ? 'Yeni parola' : 'Parola'}
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
        {loading ? <ActivityIndicator color={colors.primaryText} /> : <Text style={styles.buttonText}>{cta}</Text>}
      </Pressable>

      {mode === 'login' && (
        <>
          <Pressable onPress={() => go('reset')}>
            <Text style={styles.linkMuted}>Şifremi unuttum</Text>
          </Pressable>
          <Pressable onPress={() => go('register')}>
            <Text style={styles.switchText}>Hesabın yok mu? Kayıt ol</Text>
          </Pressable>
        </>
      )}
      {mode === 'register' && (
        <Pressable onPress={() => go('login')}>
          <Text style={styles.switchText}>Zaten hesabın var mı? Giriş yap</Text>
        </Pressable>
      )}
      {mode === 'reset' && (
        <Pressable onPress={() => go('login')}>
          <Text style={styles.switchText}>← Girişe dön</Text>
        </Pressable>
      )}

      <Text style={styles.version}>{APP_VERSION}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  content: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  logo: { fontSize: 56, textAlign: 'center' },
  title: { fontSize: 26, fontWeight: '800', textAlign: 'center', color: colors.text, marginTop: 8 },
  subtitle: { fontSize: 15, textAlign: 'center', color: colors.sub, marginTop: 4, marginBottom: 24 },
  hint: { fontSize: 13, textAlign: 'center', color: colors.sub, marginBottom: 16 },
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
  switchText: { color: colors.primary, textAlign: 'center', marginTop: 16, fontSize: 14, fontWeight: '600' },
  linkMuted: { color: colors.sub, textAlign: 'center', marginTop: 16, fontSize: 14, fontWeight: '600' },
  error: { color: colors.danger, textAlign: 'center', marginBottom: 8 },
  version: { color: colors.sub, textAlign: 'center', marginTop: 28, fontSize: 12, opacity: 0.7 },
});
