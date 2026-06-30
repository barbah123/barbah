import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { api, Reading } from './src/api';
import { colors } from './src/theme';
import AuthScreen from './src/screens/AuthScreen';
import HomeScreen from './src/screens/HomeScreen';
import ReadingScreen from './src/screens/ReadingScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import SettingsScreen from './src/screens/SettingsScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    api.auth.hasSession().then(setSignedIn).catch(() => setSignedIn(false));
  }, []);

  if (signedIn === null) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  async function handleLogout() {
    await api.auth.logout();
    setSignedIn(false);
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          {signedIn ? (
            <>
              <Stack.Screen name="Home">
                {({ navigation }) => (
                  <HomeScreen
                    onOpenSettings={() => navigation.navigate('Settings')}
                    onOpenHistory={() => navigation.navigate('History')}
                    onResult={(reading: Reading) => navigation.navigate('Reading', { reading })}
                  />
                )}
              </Stack.Screen>
              <Stack.Screen name="Reading">
                {({ route, navigation }) => (
                  <ReadingScreen
                    reading={(route.params as { reading: Reading }).reading}
                    onBack={() => navigation.goBack()}
                  />
                )}
              </Stack.Screen>
              <Stack.Screen name="History">
                {({ navigation }) => (
                  <HistoryScreen
                    onBack={() => navigation.goBack()}
                    onOpen={(reading: Reading) => navigation.navigate('Reading', { reading })}
                  />
                )}
              </Stack.Screen>
              <Stack.Screen name="Settings">
                {({ navigation }) => (
                  <SettingsScreen
                    onBack={() => navigation.goBack()}
                    onLogout={handleLogout}
                  />
                )}
              </Stack.Screen>
            </>
          ) : (
            <Stack.Screen name="Auth">
              {() => <AuthScreen onAuthed={() => setSignedIn(true)} />}
            </Stack.Screen>
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
