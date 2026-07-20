// TARAMA KATMANI (günlük trade adayı bulucu)
// Likit ABD hisselerinden oluşan evreni tek toplu istekle tarar (Yahoo spark),
// gap / günlük değişim / son 30 dk momentum / gün içi oynaklığa göre puanlar,
// en iyi adaylar için göreli hacmi hesaplar ve Telegram bildirimi gönderir.

import { getCandles } from './data';
import { sendTelegram, telegramConfigured, type TelegramEnv } from './telegram';
import { massiveConfigured, massiveMovers, massiveSeriesFor, massiveBroadRows } from './massive';

const YAHOO = 'https://query1.finance.yahoo.com';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// Day trade evreni: mega-cap + yüksek betalı popüler hisseler.
// Değiştirmek için bu listeyi düzenlemek yeterli.
export const SCAN_UNIVERSE = [
  'AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA', 'AVGO', 'NFLX', 'AMD',
  'INTC', 'MU', 'QCOM', 'ARM', 'SMCI', 'TSM', 'PLTR', 'CRWD', 'PANW', 'NET',
  'SNOW', 'DDOG', 'MDB', 'ORCL', 'CRM', 'ADBE', 'SHOP', 'SQ', 'PYPL', 'AFRM',
  'UPST', 'HOOD', 'COIN', 'MSTR', 'MARA', 'RIOT', 'CLSK', 'SOFI', 'NIO', 'XPEV',
  'LI', 'RIVN', 'LCID', 'F', 'GM', 'BA', 'DIS', 'UBER', 'ABNB', 'DKNG',
  'RBLX', 'U', 'SPOT', 'SNAP', 'ROKU', 'ZM', 'GME', 'AMC', 'CVNA', 'AI',
  'IONQ', 'RGTI', 'BABA', 'JD', 'PDD', 'JPM', 'BAC', 'GS', 'XOM', 'CVX',
  'WMT', 'KO', 'PFE', 'MRNA', 'UNH', 'LLY', 'CAT', 'GE', 'VZ', 'T',
];

export interface ScanCandidate {
  symbol: string;
  price: number;
  dayChangePercent: number; // önceki kapanışa göre
  gapPercent: number; // açılış vs önceki kapanış
  momentumPercent: number; // son ~30 dk değişim
  rangePercent: number; // gün içi (yüksek-düşük)/önceki kapanış
  relativeVolume: number | null; // bugünkü bar hacmi / önceki günlerin bar hacmi
  direction: 'long' | 'short';
  score: number;
}

export interface SparkSeries {
  previousClose: number;
  close: number[];
  lastTime: number; // son barın unix zamanı
}

// Yahoo'nun toplu "spark" ucu Cloudflare Worker IP'lerinden engelleniyor (13 Tem);
// oysa tekil "chart" ucu Worker'dan sorunsuz çalışıyor. Bu yüzden veri, sembol
// başına chart ile toplanır. Worker alt-istek bütçesine sığmak için tavan var;
// çağıranlar hareketli hisseleri (dinamik + sıcak) listenin başına koyar.
// Massive güvenilir ve hızlı olduğu için tavan yükseltildi (13→90). Alt-istek
// bütçesi aşılırsa massiveAggregates hata fırlatmadan boş döner (kademeli
// kısıtlama), yani yüksek tavan çökme riski taşımaz — sadece bütçe elverdiğince
// sembol taranır.
const MAX_SPARK_SYMBOLS = 90;
const SPARK_CONCURRENCY = 12;

async function fetchChartSeries(symbol: string): Promise<SparkSeries | null> {
  try {
    const res = await fetch(
      `${YAHOO}/v8/finance/chart/${encodeURIComponent(symbol)}?interval=5m&range=1d`,
      { headers: { 'User-Agent': UA, Accept: 'application/json' } }
    );
    if (!res.ok) return null;
    const data: any = await res.json();
    const result = data?.chart?.result?.[0];
    const meta = result?.meta;
    const prev = meta?.chartPreviousClose ?? meta?.previousClose;
    if (typeof prev !== 'number') return null;
    const ts: number[] = result?.timestamp ?? [];
    const rawCloses: (number | null)[] = result?.indicators?.quote?.[0]?.close ?? [];
    const closes = rawCloses.filter((c): c is number => c != null);
    if (closes.length < 8) {
      // Gün başı: intraday bar henüz az; en azından anlık fiyatla tek nokta kur
      if (typeof meta?.regularMarketPrice === 'number') {
        return {
          previousClose: prev,
          close: [meta.regularMarketPrice],
          lastTime: meta?.regularMarketTime ?? 0,
        };
      }
      return null;
    }
    return {
      previousClose: prev,
      close: closes,
      lastTime: ts.length ? ts[ts.length - 1] : meta?.regularMarketTime ?? 0,
    };
  } catch {
    return null;
  }
}

export async function fetchSpark(symbols: string[]): Promise<Map<string, SparkSeries>> {
  if (massiveConfigured()) {
    return massiveSeriesFor(symbols, MAX_SPARK_SYMBOLS);
  }
  const out = new Map<string, SparkSeries>();
  const targets = [...new Set(symbols)].slice(0, MAX_SPARK_SYMBOLS);
  for (let i = 0; i < targets.length; i += SPARK_CONCURRENCY) {
    const batch = targets.slice(i, i + SPARK_CONCURRENCY);
    const series = await Promise.all(batch.map((s) => fetchChartSeries(s)));
    batch.forEach((sym, idx) => {
      const s = series[idx];
      if (s) out.set(sym, s);
    });
  }
  return out;
}

function analyze(symbol: string, s: SparkSeries): ScanCandidate {
  const prev = s.previousClose;
  const first = s.close[0];
  const last = s.close[s.close.length - 1];
  const momIndex = Math.max(0, s.close.length - 7); // ~30 dk önce (6 x 5dk bar)
  const momBase = s.close[momIndex];
  const high = Math.max(...s.close);
  const low = Math.min(...s.close);

  const dayChangePercent = ((last - prev) / prev) * 100;
  const gapPercent = ((first - prev) / prev) * 100;
  const momentumPercent = momBase ? ((last - momBase) / momBase) * 100 : 0;
  const rangePercent = ((high - low) / prev) * 100;

  // Puan: momentum en değerli (devam eden hareket), sonra günlük değişim ve oynaklık
  const score =
    Math.abs(momentumPercent) * 2 + Math.abs(dayChangePercent) + rangePercent * 0.5;

  return {
    symbol,
    price: last,
    dayChangePercent,
    gapPercent,
    momentumPercent,
    rangePercent,
    relativeVolume: null,
    direction: dayChangePercent >= 0 ? 'long' : 'short',
    score,
  };
}

/** Adayın bugünkü ortalama bar hacmini önceki günlerinkiyle karşılaştırır. */
async function computeRelativeVolume(symbol: string): Promise<number | null> {
  try {
    const candles = await getCandles(symbol, '5m', '5d');
    if (candles.length < 50) return null;
    const todayKey = Math.floor(candles[candles.length - 1].t / 86400);
    const today = candles.filter((c) => Math.floor(c.t / 86400) === todayKey);
    const before = candles.filter((c) => Math.floor(c.t / 86400) !== todayKey);
    if (today.length < 3 || before.length < 20) return null;
    const avg = (arr: typeof candles) =>
      arr.reduce((sum, c) => sum + c.v, 0) / arr.length;
    const prevAvg = avg(before);
    return prevAvg > 0 ? avg(today) / prevAvg : null;
  } catch {
    return null;
  }
}

// DİNAMİK EVREN: Yahoo'nun hazır tarayıcılarından (günün en çok yükselenleri +
// en hacimlileri) sembol çekilir ve sabit evrene eklenir. Böylece "bugün kim
// oynuyorsa" tarafımızdan taranır. Uç erişilemezse sabit 80 ile devam (fail-open).
const DYNAMIC_MAX = 90; // tüm piyasadan seçilen hareketli sembol tavanı (Massive)
const SYMBOL_RE = /^[A-Z]{1,5}$/; // ABD hissesi; birim/varant/OTC uzantılarını eler

let dynamicCache: { at: number; symbols: string[] } | null = null;
const DYNAMIC_TTL_MS = 10 * 60 * 1000;

export async function getDynamicSymbols(): Promise<string[]> {
  if (dynamicCache && Date.now() - dynamicCache.at < DYNAMIC_TTL_MS) {
    return dynamicCache.symbols;
  }
  if (massiveConfigured()) {
    try {
      const movers = await massiveMovers(DYNAMIC_MAX);
      if (movers.length) {
        dynamicCache = { at: Date.now(), symbols: movers };
        return movers;
      }
    } catch {
      // Massive erişilemedi: Yahoo screener'a düş
    }
  }
  const found: string[] = [];
  for (const scrId of ['day_gainers', 'most_actives']) {
    try {
      const res = await fetch(
        `${YAHOO}/v1/finance/screener/predefined/saved?scrIds=${scrId}&count=50`,
        { headers: { 'User-Agent': UA, Accept: 'application/json' } }
      );
      if (!res.ok) continue;
      const data: any = await res.json();
      for (const q of data?.finance?.result?.[0]?.quotes ?? []) {
        const symbol = String(q.symbol ?? '').toUpperCase();
        // Sadece likit, penny olmayan ABD hisseleri
        if (!SYMBOL_RE.test(symbol)) continue;
        if (q.quoteType && q.quoteType !== 'EQUITY') continue;
        if (typeof q.regularMarketPrice === 'number' && q.regularMarketPrice < 3) continue;
        found.push(symbol);
      }
    } catch {
      // tarayıcı erişilemedi: kalan kaynaklarla devam
    }
  }
  const symbols = [...new Set(found)].slice(0, DYNAMIC_MAX);
  dynamicCache = { at: Date.now(), symbols };
  return symbols;
}

export interface MarketSnapshot {
  all: ScanCandidate[];
  scannedCount: number;
  dynamicCount: number; // dinamik evrenden gelen (sabit listede olmayan) sembol sayısı
  advancers: number; // önceki kapanışa göre artıda olan hisse sayısı
  decliners: number;
  lastBarTime: number; // en güncel bar zamanı (veri tazeliği kontrolü için)
}

/** Tüm evreni tarar; manuel tarama, otonom bot ve nabız dedektörü bu görüntüyü kullanır.
 *  extraSymbols: sıcak sembol hafızası (son günlerin kazananları / nabız alarmları)
 *  gibi kaynaklardan gelen ek izleme sembolleri. */
// Momentum zenginleştirmesi için en iyi kaç aday aggregates ile çekilsin.
// Cloudflare ücretsiz plan istek başına ~50 alt-istek verir; trader döngüsü
// aynı çağrıda istihbarat + fiyat de yaptığından bu düşük tutulur (bütçe payı).
const ENRICH_TOP = 15;

export async function scanMarket(extraSymbols: string[] = []): Promise<MarketSnapshot> {
  // MASSIVE: tüm piyasa tek snapshot'tan; momentum yalnızca en iyi adaylarda
  // aggregates ile zenginleştirilir (geniş kapsama + bütçe dostu).
  if (massiveConfigured()) {
    const rows = await massiveBroadRows().catch(() => [] as Awaited<ReturnType<typeof massiveBroadRows>>);
    if (rows.length) {
      const all: ScanCandidate[] = rows.map((r) => ({
        symbol: r.symbol,
        price: r.price,
        dayChangePercent: r.dayChangePercent,
        gapPercent: r.gapPercent,
        momentumPercent: 0, // broad pass: momentum yok
        rangePercent: r.rangePercent,
        relativeVolume: null,
        direction: r.dayChangePercent >= 0 ? 'long' : 'short',
        score: Math.abs(r.dayChangePercent) + r.rangePercent * 0.5,
      }));
      const byId = new Map(all.map((c) => [c.symbol, c]));

      // Zenginleştirme bütçesi ikiye bölünür (20 Tem dersi: bütçenin tamamı ham
      // skora gidince hep +%30..%200'lük dev hareketliler seçiliyordu; bunlar
      // giriş tavanını (%8) zaten aşar. Giriş bandındaki (%1.5-8) adaylar ise
      // momentum verisi alamayıp filtrede eleniyordu → bot HİÇ giriş bulamıyordu):
      // 1) En yüksek skorlular (tarama mesajı/kısa yön için)
      // 2) Giriş bandındaki en likit adaylar (botun gerçekten alabilecekleri)
      const SCORE_TOP = 6;
      const top = [...all].sort((a, b) => b.score - a.score).slice(0, SCORE_TOP);
      const topSet = new Set(top.map((c) => c.symbol));
      const entryBand = rows
        .filter((r) => r.dayChangePercent >= 1.5 && r.dayChangePercent <= 8 && !topSet.has(r.symbol))
        .sort((a, b) => b.liquidity - a.liquidity)
        .slice(0, ENRICH_TOP - top.length);
      const enrichSyms = [
        ...new Set([
          ...top.map((c) => c.symbol),
          ...entryBand.map((r) => r.symbol),
          ...extraSymbols.map((s) => s.toUpperCase()),
        ]),
      ];
      const series = await fetchSpark(enrichSyms);
      for (const [sym, s] of series) {
        const en = analyze(sym, s);
        const existing = byId.get(sym);
        if (existing) {
          existing.momentumPercent = en.momentumPercent;
          existing.price = en.price;
          existing.score = en.score;
        } else {
          byId.set(sym, en);
          all.push(en);
        }
      }
      const lastBarTime = Math.max(
        0,
        ...rows.map((r) => r.lastTime),
        ...[...series.values()].map((s) => s.lastTime)
      );
      return {
        all,
        scannedCount: all.length, // tüm piyasa
        dynamicCount: rows.length,
        advancers: all.filter((c) => c.dayChangePercent > 0).length,
        decliners: all.filter((c) => c.dayChangePercent < 0).length,
        lastBarTime,
      };
    }
    // Massive snapshot boş döndüyse Yahoo akışına düş
  }

  const dynamic = await getDynamicSymbols();
  // Hareketliler (dinamik + sıcak) önce: chart tavanı altında en değerli semboller
  const universe = [...new Set([...dynamic, ...extraSymbols, ...SCAN_UNIVERSE])];
  const dynamicCount = new Set(dynamic).size;
  const spark = await fetchSpark(universe);
  const all = [...spark.entries()].map(([symbol, s]) => analyze(symbol, s));
  return {
    all,
    scannedCount: spark.size,
    dynamicCount,
    advancers: all.filter((c) => c.dayChangePercent > 0).length,
    decliners: all.filter((c) => c.dayChangePercent < 0).length,
    lastBarTime: Math.max(0, ...[...spark.values()].map((s) => s.lastTime)),
  };
}

export interface ScanResult {
  candidates: ScanCandidate[];
  stale?: boolean; // veri 30 dk'dan eski (piyasa kapalı) — bildirim gönderilmez
  scannedCount: number;
  dynamicCount: number;
  notified: boolean;
}

export async function runScan(
  env: TelegramEnv,
  options: { top?: number; notify?: boolean; db?: D1Database } = {}
): Promise<ScanResult> {
  const top = options.top ?? 5;
  const { all, scannedCount, dynamicCount, lastBarTime } = await scanMarket();
  // Anlamlı hareket filtresi: en az %1.5 günlük değişim veya güçlü momentum
  const interesting = all.filter(
    (c) => Math.abs(c.dayChangePercent) >= 1.5 || Math.abs(c.momentumPercent) >= 1
  );
  interesting.sort((a, b) => b.score - a.score);
  const candidates = interesting.slice(0, top);

  // Sadece kısa listeye hacim analizi (sembol başına 1 istek)
  await Promise.all(
    candidates.map(async (c) => {
      c.relativeVolume = await computeRelativeVolume(c.symbol);
    })
  );

  // Bayat veri koruması: son bar 30 dk'dan eskiyse (tatil/kesinti) bildirim gönderme.
  // Aksi halde tatil günlerinde önceki seansın kapanış fiyatları "canlı aday" gibi
  // mesajlanıyor ve o fiyatlarla işlem yapılamıyor.
  const dataAgeSeconds = Date.now() / 1000 - lastBarTime;
  const stale = dataAgeSeconds > 30 * 60;

  // Sıcak sembol hafızası: bugünün adayları sonraki günlerde de izlensin
  if (options.db && !stale) {
    for (const c of candidates) {
      try {
        await options.db
          .prepare(
            `INSERT INTO hot_symbols (symbol, day, source, score) VALUES (?, date('now'), 'scan', ?)
             ON CONFLICT (symbol, day) DO UPDATE SET score = MAX(COALESCE(hot_symbols.score, 0), COALESCE(excluded.score, 0))`
          )
          .bind(c.symbol, c.score)
          .run();
      } catch {
        // hafıza yazılamazsa tarama yine de sürer
      }
    }
  }

  let notified = false;
  if (options.notify && candidates.length && !stale && telegramConfigured(env)) {
    notified = await sendTelegram(env, formatScanMessage(candidates, scannedCount, lastBarTime));
  }
  if (options.notify && stale) {
    console.log(`Tarama bildirimi atlandı: veri ${Math.round(dataAgeSeconds / 60)} dk eski (piyasa kapalı olabilir)`);
  }

  return { candidates, scannedCount, dynamicCount, notified, stale };
}

function formatScanMessage(candidates: ScanCandidate[], scanned: number, lastBarTime: number): string {
  const pct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
  const lines = candidates.map((c, i) => {
    const dir = c.direction === 'long' ? '🟢 LONG' : '🔴 SHORT';
    const vol =
      c.relativeVolume != null ? ` | hacim ${c.relativeVolume.toFixed(1)}x` : '';
    // Kapanışa doğru momentumu ters dönmüş "günün kazananı" = geç kalınmış hareket
    const cooling = c.direction === 'long' && c.momentumPercent < -1 ? ' 🔻soğuyor' : '';
    return (
      `${i + 1}. <b>${c.symbol}</b> ${dir} — $${c.price.toFixed(2)}\n` +
      `   gün ${pct(c.dayChangePercent)} | gap ${pct(c.gapPercent)} | 30dk ${pct(c.momentumPercent)}${vol}${cooling}`
    );
  });
  // Veri zaman damgası (TSİ) — kullanıcı fiyatların hangi ana ait olduğunu görsün
  const asOf = new Date((lastBarTime + 3 * 3600) * 1000)
    .toISOString()
    .replace('T', ' ')
    .slice(0, 16);
  return (
    `📊 <b>Günlük Trade Taraması</b> (${scanned} hisse tarandı)\n` +
    `🕐 Veri zamanı: ${asOf} TSİ\n\n` +
    lines.join('\n') +
    `\n\n⚠️ Fiyatlar veri zamanına aittir; emir anındaki fiyat farklı olabilir.\n` +
    `⚠️ Bunlar yatırım tavsiyesi değil, paper trading adaylarıdır.`
  );
}
