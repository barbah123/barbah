export const colors = {
  bg: '#0d2a12', // lucky-green felt
  bgDeep: '#06180a',
  panel: '#123a1c',
  panelBorder: '#3ecf5b',
  reelBg: '#0a210f',
  reelCell: '#0f2e17',
  gold: '#ffcc33',
  goldDeep: '#e6a817',
  text: '#f3ffe9',
  textDim: '#8fc79a',
  win: '#ffd94a',
  danger: '#ff5c7a',
  primary: '#3ecf5b',
  // jackpot tiers
  grand: '#ff3b3b',
  major: '#ffd23b',
  mini: '#c45bff',
  minor: '#3ecf5b',
};

export const layout = {
  cell: 58,
  rows: 3,
  reels: 5,
  gap: 6,
};

// Turkish Lira formatting: 1234.5 -> "1.234,50 TL"
export function formatTL(value: number): string {
  const fixed = value.toFixed(2);
  const [intPart, dec] = fixed.split('.');
  const withSep = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${withSep},${dec} TL`;
}
