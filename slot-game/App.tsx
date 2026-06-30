import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import SlotScreen from './src/screens/SlotScreen';

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <SlotScreen />
    </SafeAreaProvider>
  );
}
