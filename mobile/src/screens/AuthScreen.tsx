import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { api } from '../api';

export default function AuthScreen({ onAuthed }: { onAuthed: () => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isRegister = mode === 'register';

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
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Text style={styles.title}>Pokémon Açık Artırma</Text>
      <Text style={styles.subtitle}>{isRegister ? 'Hesap oluştur' : 'Giriş yap'}</Text>

      <TextInput
        style={styles.input}
        placeholder="E-posta"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      {isRegister && (
        <TextInput
          style={styles.input}
          placeholder="Kullanıcı adı"
          autoCapitalize="none"
          value={username}
          onChangeText={setUsername}
        />
      )}
      <TextInput
        style={styles.input}
        placeholder="Parola"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={submit}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>{isRegister ? 'Kayıt ol' : 'Giriş yap'}</Text>
        )}
      </Pressable>

      <Pressable onPress={() => { setError(null); setMode(isRegister ? 'login' : 'register'); }}>
        <Text style={styles.switchText}>
          {isRegister ? 'Zaten hesabın var mı? Giriş yap' : 'Hesabın yok mu? Kayıt ol'}
        </Text>
      </Pressable>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#fff' },
  title: { fontSize: 26, fontWeight: '700', textAlign: 'center', color: '#1f2937' },
  subtitle: { fontSize: 16, textAlign: 'center', color: '#6b7280', marginTop: 4, marginBottom: 24 },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 12,
  },
  button: {
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  switchText: { color: '#2563eb', textAlign: 'center', marginTop: 16, fontSize: 14 },
  error: { color: '#dc2626', textAlign: 'center', marginBottom: 12 },
});
