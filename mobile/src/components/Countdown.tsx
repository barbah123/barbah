import { useEffect, useState } from 'react';
import { Text, TextStyle, StyleProp } from 'react-native';

function format(endsAt: number, now: number): string {
  let s = Math.floor(endsAt - now);
  if (s <= 0) return 'Bitti';
  const pad = (n: number) => String(n).padStart(2, '0');
  const d = Math.floor(s / 86400);
  s -= d * 86400;
  const h = Math.floor(s / 3600);
  s -= h * 3600;
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  return d > 0 ? `${d}g ${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

export default function Countdown({
  endsAt,
  prefix = '',
  style,
}: {
  endsAt: number;
  prefix?: string;
  style?: StyleProp<TextStyle>;
}) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  return <Text style={style}>{prefix}{format(endsAt, now)}</Text>;
}
