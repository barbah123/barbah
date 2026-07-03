import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { Text } from 'react-native';

import MarketsScreen from './src/screens/MarketsScreen';
import StockDetailScreen from './src/screens/StockDetailScreen';
import PortfolioScreen from './src/screens/PortfolioScreen';
import OrdersScreen from './src/screens/OrdersScreen';
import StrategiesScreen from './src/screens/StrategiesScreen';
import { colors } from './src/theme';

export type MarketsStackParamList = {
  Markets: undefined;
  StockDetail: { symbol: string };
};

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator<MarketsStackParamList>();

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.bg,
    card: colors.panel,
    border: colors.border,
    text: colors.text,
    primary: colors.accent,
  },
};

const screenOptions = {
  headerStyle: { backgroundColor: colors.panel },
  headerTintColor: colors.text,
  contentStyle: { backgroundColor: colors.bg },
};

function MarketsStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="Markets" component={MarketsScreen} options={{ title: 'Piyasa' }} />
      <Stack.Screen
        name="StockDetail"
        component={StockDetailScreen}
        options={({ route }) => ({ title: route.params.symbol })}
      />
    </Stack.Navigator>
  );
}

function tabIcon(emoji: string) {
  return ({ focused }: { focused: boolean }) => (
    <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.5 }}>{emoji}</Text>
  );
}

export default function App() {
  return (
    <NavigationContainer theme={navTheme}>
      <StatusBar style="light" />
      <Tab.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: colors.panel },
          headerTintColor: colors.text,
          tabBarStyle: { backgroundColor: colors.panel, borderTopColor: colors.border },
          tabBarActiveTintColor: colors.accent,
          tabBarInactiveTintColor: colors.muted,
        }}
      >
        <Tab.Screen
          name="PiyasaTab"
          component={MarketsStack}
          options={{ headerShown: false, title: 'Piyasa', tabBarIcon: tabIcon('📈') }}
        />
        <Tab.Screen
          name="Portföy"
          component={PortfolioScreen}
          options={{ tabBarIcon: tabIcon('💼') }}
        />
        <Tab.Screen
          name="Emirler"
          component={OrdersScreen}
          options={{ tabBarIcon: tabIcon('🧾') }}
        />
        <Tab.Screen
          name="Strateji"
          component={StrategiesScreen}
          options={{ tabBarIcon: tabIcon('🤖') }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
