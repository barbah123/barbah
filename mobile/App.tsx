import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StatusBar as RNStatusBar, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { api } from './src/api';
import { colors } from './src/theme';
import AuthScreen from './src/screens/AuthScreen';
import AuctionsScreen from './src/screens/AuctionsScreen';
import AuctionDetailScreen from './src/screens/AuctionDetailScreen';
import CreateAuctionScreen from './src/screens/CreateAuctionScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import NotificationsScreen from './src/screens/NotificationsScreen';

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
        <Stack.Navigator
          screenOptions={{
            headerShown: false,
            contentStyle: {
              backgroundColor: colors.bg,
              paddingTop: Platform.OS === 'android' ? RNStatusBar.currentHeight ?? 0 : 0,
            },
          }}
        >
          {signedIn ? (
            <>
              <Stack.Screen name="Auctions">
                {({ navigation }) => (
                  <AuctionsScreen
                    onProfile={() => navigation.navigate('Profile')}
                    onOpen={(id) => navigation.navigate('AuctionDetail', { id })}
                    onCreate={() => navigation.navigate('CreateAuction')}
                    onNotifications={() => navigation.navigate('Notifications')}
                  />
                )}
              </Stack.Screen>
              <Stack.Screen name="Notifications">
                {({ navigation }) => (
                  <NotificationsScreen
                    onBack={() => navigation.goBack()}
                    onOpen={(id) => navigation.navigate('AuctionDetail', { id })}
                  />
                )}
              </Stack.Screen>
              <Stack.Screen name="Profile">
                {({ navigation }) => (
                  <ProfileScreen
                    onBack={() => navigation.goBack()}
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
              <Stack.Screen name="CreateAuction">
                {({ navigation }) => <CreateAuctionScreen onDone={() => navigation.goBack()} />}
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
