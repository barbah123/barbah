export const colors = {
  bg: '#0d1117',
  panel: '#161b22',
  panel2: '#1c2129',
  border: '#2d333b',
  text: '#e6edf3',
  muted: '#8b949e',
  green: '#3fb950',
  red: '#f85149',
  accent: '#58a6ff',
};

export const fmtMoney = (v: number) =>
  '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtPct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;

export const pnlColor = (v: number) => (v >= 0 ? colors.green : colors.red);
