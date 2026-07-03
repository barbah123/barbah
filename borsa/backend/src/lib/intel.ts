// İSTİHBARAT KATMANI (haber + bilanço takvimi + sosyal medya dedikodusu)
// Giriş kararlarını fiyat davranışının ötesinde besler:
//   - Haberler:   Yahoo Finance haber akışı + basit başlık duygu skoru
//   - Bilanço:    Yahoo calendarEvents — bilanço 2 gün içindeyse giriş engellenir
//   - Reddit:     ApeWisdom (r/wallstreetbets mention sayısı ve trend sırası)
//   - Stocktwits: son mesajlardaki Bullish/Bearish etiket oranı
// Tüm kaynaklar "fail-open" çalışır: kaynak erişilemezse işlemi durdurmaz,
// yalnızca kesin OLUMSUZ istihbarat girişi engeller.

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

export interface NewsItem {
  title: string;
  publisher: string;
  time: number; // unix saniye
}

export interface RedditBuzz {
  mentions: number;
  upvotes: number;
  rank: number;
  rank24hAgo: number | null;
  trending: boolean; // sırası son 24 saatte yükseldi
}

export interface SocialSentiment {
  bullish: number;
  bearish: number;
  total: number; // etiketli mesaj sayısı
  score: number | null; // -1..1, en az 3 etiketli mesaj varsa
}

export interface SymbolIntel {
  symbol: string;
  news: NewsItem[];
  newsScore: number | null; // -1..1 başlık duygu skoru (haber yoksa null)
  earningsDate: string | null; // ISO tarih
  earningsInDays: number | null;
  reddit: RedditBuzz | null;
  stocktwits: SocialSentiment | null;
  notes: string[]; // rapora/giriş gerekçesine eklenecek kısa notlar
  blockEntry: boolean; // kesin olumsuz istihbarat: girişe engel
  blockReason: string | null;
}

// Bilanço bu kadar gün içindeyse yeni pozisyon açma (ikili olay riski)
const EARNINGS_BLOCK_DAYS = 2;
const NEWS_MAX_AGE_HOURS = 48;

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

// --- Haberler (Yahoo) ---

// Başlık duygu skoru için kaba anahtar kelime listeleri (İngilizce haber başlıkları)
const POSITIVE_WORDS = [
  'beat', 'beats', 'surge', 'surges', 'soar', 'soars', 'rally', 'rallies', 'upgrade',
  'upgraded', 'record', 'jump', 'jumps', 'strong', 'growth', 'wins', 'approval',
  'breakthrough', 'raises guidance', 'buyback', 'outperform', 'bullish', 'tops',
];
const NEGATIVE_WORDS = [
  'miss', 'misses', 'plunge', 'plunges', 'sink', 'sinks', 'crash', 'downgrade',
  'downgraded', 'lawsuit', 'probe', 'investigation', 'recall', 'fraud', 'layoff',
  'layoffs', 'cuts guidance', 'warning', 'warns', 'bankrupt', 'sell-off', 'selloff',
  'underperform', 'bearish', 'slump', 'slumps', 'tumbles', 'halted', 'sec charges',
];

function scoreTitle(title: string): number {
  const t = title.toLowerCase();
  let score = 0;
  for (const w of POSITIVE_WORDS) if (t.includes(w)) score += 1;
  for (const w of NEGATIVE_WORDS) if (t.includes(w)) score -= 1;
  return Math.max(-1, Math.min(1, score));
}

export async function getNews(symbol: string): Promise<NewsItem[]> {
  try {
    const data = await fetchJson(
      `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(symbol)}&quotesCount=0&newsCount=8`
    );
    const cutoff = Date.now() / 1000 - NEWS_MAX_AGE_HOURS * 3600;
    return (data?.news ?? [])
      .filter((n: any) => n.title && (n.providerPublishTime ?? 0) > cutoff)
      .map((n: any) => ({
        title: n.title,
        publisher: n.publisher ?? '',
        time: n.providerPublishTime ?? 0,
      }));
  } catch {
    return [];
  }
}

// --- Bilanço takvimi (Yahoo) ---

export async function getEarningsDate(symbol: string): Promise<string | null> {
  // query2 ve query1 sırayla denenir; ikisi de crumb isterse null döner (fail-open)
  for (const host of ['query2', 'query1']) {
    try {
      const data = await fetchJson(
        `https://${host}.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=calendarEvents`
      );
      const raw =
        data?.quoteSummary?.result?.[0]?.calendarEvents?.earnings?.earningsDate?.[0]?.raw;
      if (typeof raw === 'number') return new Date(raw * 1000).toISOString().slice(0, 10);
      return null;
    } catch {
      // sıradaki host
    }
  }
  return null;
}

// --- Reddit (ApeWisdom: r/wallstreetbets mention özeti) ---

let redditCache: { at: number; map: Map<string, RedditBuzz> } | null = null;
const REDDIT_TTL_MS = 10 * 60 * 1000;

export async function getRedditBuzzMap(): Promise<Map<string, RedditBuzz>> {
  if (redditCache && Date.now() - redditCache.at < REDDIT_TTL_MS) return redditCache.map;
  const map = new Map<string, RedditBuzz>();
  try {
    const data = await fetchJson('https://apewisdom.io/api/v1.0/filter/wallstreetbets/page/1');
    for (const r of data?.results ?? []) {
      const rank = Number(r.rank);
      const rankPrev = r.rank_24h_ago != null ? Number(r.rank_24h_ago) : null;
      map.set(String(r.ticker).toUpperCase(), {
        mentions: Number(r.mentions) || 0,
        upvotes: Number(r.upvotes) || 0,
        rank,
        rank24hAgo: rankPrev,
        trending: rankPrev != null && rank < rankPrev,
      });
    }
    redditCache = { at: Date.now(), map };
  } catch {
    // erişilemedi: boş harita (fail-open)
  }
  return map;
}

// --- Stocktwits (yatırımcı duyarlılığı) ---

export async function getStocktwitsSentiment(symbol: string): Promise<SocialSentiment | null> {
  try {
    const data = await fetchJson(
      `https://api.stocktwits.com/api/2/streams/symbol/${encodeURIComponent(symbol)}.json?limit=30`
    );
    let bullish = 0;
    let bearish = 0;
    for (const m of data?.messages ?? []) {
      const basic = m?.entities?.sentiment?.basic;
      if (basic === 'Bullish') bullish++;
      else if (basic === 'Bearish') bearish++;
    }
    const total = bullish + bearish;
    return {
      bullish,
      bearish,
      total,
      score: total >= 3 ? (bullish - bearish) / total : null,
    };
  } catch {
    return null;
  }
}

// --- Birleşik istihbarat ---

export async function getIntel(
  symbol: string,
  redditMap?: Map<string, RedditBuzz>
): Promise<SymbolIntel> {
  const [news, earningsDate, stocktwits, reddit] = await Promise.all([
    getNews(symbol),
    getEarningsDate(symbol),
    getStocktwitsSentiment(symbol),
    redditMap
      ? Promise.resolve(redditMap.get(symbol) ?? null)
      : getRedditBuzzMap().then((m) => m.get(symbol) ?? null),
  ]);

  const newsScore = news.length
    ? news.reduce((s, n) => s + scoreTitle(n.title), 0) / news.length
    : null;

  let earningsInDays: number | null = null;
  if (earningsDate) {
    earningsInDays = Math.ceil(
      (new Date(earningsDate + 'T00:00:00Z').getTime() - Date.now()) / 86400000
    );
  }

  const notes: string[] = [];
  let blockEntry = false;
  let blockReason: string | null = null;

  if (earningsInDays != null && earningsInDays >= 0 && earningsInDays <= EARNINGS_BLOCK_DAYS) {
    blockEntry = true;
    blockReason = `bilanço ${earningsInDays === 0 ? 'bugün' : earningsInDays + ' gün içinde'} (${earningsDate})`;
  }
  if (!blockEntry && newsScore != null && newsScore <= -0.4) {
    blockEntry = true;
    blockReason = `olumsuz haber akışı (skor ${newsScore.toFixed(2)}: "${news[0]?.title.slice(0, 60)}")`;
  }
  if (!blockEntry && stocktwits?.score != null && stocktwits.score <= -0.5 && stocktwits.total >= 5) {
    blockEntry = true;
    blockReason = `sosyal duyarlılık negatif (${stocktwits.bearish}🐻/${stocktwits.bullish}🐂)`;
  }

  if (newsScore != null && newsScore >= 0.3) notes.push('haber akışı olumlu');
  if (reddit?.trending) notes.push(`Reddit'te yükseliyor (#${reddit.rank}, ${reddit.mentions} mention)`);
  else if (reddit && reddit.rank <= 10) notes.push(`Reddit gündeminde (#${reddit.rank})`);
  if (stocktwits?.score != null && stocktwits.score >= 0.5) {
    notes.push(`Stocktwits ${stocktwits.bullish}🐂/${stocktwits.bearish}🐻`);
  }
  if (earningsInDays != null && earningsInDays > EARNINGS_BLOCK_DAYS && earningsInDays <= 7) {
    notes.push(`bilanço ${earningsInDays} gün sonra`);
  }

  return {
    symbol,
    news,
    newsScore,
    earningsDate,
    earningsInDays,
    reddit,
    stocktwits,
    notes,
    blockEntry,
    blockReason,
  };
}
