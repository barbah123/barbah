import { Image, StyleSheet, Text, View } from 'react-native';
import { api } from '../api';
import { colors } from '../theme';

export default function Thumb({ imageKey, size }: { imageKey?: string; size: number }) {
  const dim = { width: size, height: size, borderRadius: 12 };
  if (imageKey && imageKey !== 'none') {
    return <Image source={{ uri: api.images.url(imageKey) }} style={[dim, { backgroundColor: colors.card2 }]} />;
  }
  return (
    <View style={[dim, styles.placeholder]}>
      <Text style={{ fontSize: size * 0.45 }}>🃏</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: { backgroundColor: colors.card2, alignItems: 'center', justifyContent: 'center' },
});
