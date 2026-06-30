import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { api } from './src/api';
import { colors } from './src/theme';
import AuthScreen from './src/screens/AuthScreen';
import AuctionsScreen from './src/screens/AuctionsScreen';
import AuctionDetailScreen from './src/screens/AuctionDetailScreen';

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
              <Stack.Screen name="Auctions">
                {({ navigation }) => (
                  <AuctionsScreen
                    onLogout={handleLogout}
                    onOpen={(id) => navigation.navigate('AuctionDetail', { id })}
                  />
                )}
              </Stack.Screen>
              <Stack.Screen name="AuctionDetail">
                {({ route, navigation }) => (
                  <AuctionDetailScreen
                    id={(route.params as { id: string }).id}
                    onBack={() => navigation.goBack()}
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
