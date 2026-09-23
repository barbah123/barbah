// İÇERİDEN KÜME ALIMLARI (OpenInsider)
// Aynı hissede birden fazla içeriden kişinin (yönetici, direktör, %10 sahip)
// açık piyasa alımıdır. Bu katman OpenInsider'ın "latest cluster buys"
// listesini çeker, her yeni kaydı 0-100 arası puanlar ve eşiği geçenleri
// Telegram'a gönderir. İŞLEM YAPMAZ — yalnızca bildirim.
//
// PUANLAMA (her kural `reasons` içinde gerekçesiyle döner):
//   ANA SİNYAL
//   CEO + CFO       kümede ikisi birlikte aldıysa +50 (tek başına bildirim eşiğini geçer)
//   İKİNCİL (yarım ağırlık — 2025 backtestinde tek başına ayrışmadı)
//   Alıcı sayısı    2 kişi +5, 3-4 kişi +10, 5+ kişi +15
//   Toplam tutar    ≥$100K +3, ≥$500K +5, ≥$1M +8, ≥$5M +12
//   Pozisyon artışı yeni pozisyon veya ≥%20 +8, ≥%10 +5, ≥%5 +3
//   Tazelik         işlem ≤7 gün önce +5, ≤30 gün önce +3
//   Kuruş hisse     fiyat < $1  -5
//   Rutin alım      kümedeki herkes rutin -12, bir kısmı -5, kimse +3
//   İkincil faktörlerin toplamı en fazla ~42 olduğundan 40 eşiğini pratikte
//   yalnızca CEO+CFO kümeleri geçer. $5 altı fiyat puanı değiştirmez; mesajda uyarılır.
//
// NEDEN (2025 backtesti, 1.343 küme, IWM'e göre 6 aylık fark, uçlar %5 kırpılmış):
//   • Eski puan (tüm faktörler tam ağırlık) getiriyi sıralamadı; eşiği geçenler
//     geçmeyenlerden −4,4 puan KÖTÜ gitti.
//   • CEO ve CFO'nun birlikte aldığı kümeler diğerlerini +7,6 puan geçti
//     [%95: +2,1; +13,2]; yılın iki yarısında da aynı yönde (+5,6 / +9,2).
//     Yalnızca birinin (CEO veya CFO) katılması fark yaratmadı.
//   • Bu şemayla bildirim alanlar (yılda ~268) diğerlerini +6,8 puan geçti [+1,4; +12,5].
//   • $5 altı hisseler piyango gibi: ortalama IWM'i yener, medyan −17 puan.
//
// RUTİN ALICI: bilgi taşımayan planlı alımlar. İki şekilde tanınır:
//   • Yıllık (Cohen-Malloy-Pomorski): önceki 3 yılın her birinde aynı ayda almış.
//   • Sık: önceki 6 takvim ayının en az 4'ünde almış (aylık planlar; OpenInsider'da
//     çok yıllık geçmişi olmayan şirketlerde de yakalanır — ör. TSM, Eyl 2026).
//
// OPENINSIDER TUZAKLARI (canlı sayfalarla doğrulandı, 23 Eyl 2026):
//   • Küme sayfası ve screener AYNI tablo yapısını ama FARKLI sütunları kullanır
//     (Company/Industry/Ins ↔ Insider Name/Title) → sütunlar başlık adıyla eşlenir.
//   • Screener'da fd=0 ZORUNLU: verilmezse yalnızca son günlerin dosyalamaları
//     döner (JPM için hiç tablo yok) ve rutin kontrolü sessizce hep "fırsatçı" der.
//   • Sonuç yoksa screener tablo DÖNDÜRMEZ → boş liste.
//   • Küme satırındaki işlem tarihi kümenin İLK işlemidir; diğer üyeler sonraki
//     günlerde alıp birlikte dosyalar → üyeler dosyalama tarihine kadar aranır.
//   • HTTPS bağlantıyı kesiyor; site yalnızca HTTP'den servis ediliyor.
//
// BÜTÇE (Worker alt-çağrısı başına ~50 alt-istek):
//   1 küme sayfası + en fazla HISTORY_BATCH hisse geçmişi + 1-2 Telegram.
//   Kalan yeni kayıtlar bir sonraki koşuya kalır (insider_seen'e yazılmadıkları
//   için tekrar ele alınırlar).

import { fetchWithTimeout } from './http';
import { bumpSubreq } from './subreq';
import { sendTelegram, telegramConfigured, type TelegramEnv } from './telegram';

const BASE_URL = 'http://openinsider.com';
export const CLUSTER_URL = `${BASE_URL}/latest-cluster-buys`;
export function screenerUrl(ticker: string): string {
  return `${BASE_URL}/screener?s=${encodeURIComponent(ticker.toUpperCase())}&xp=1&fd=0&td=0&cnt=1000&page=1`;
}
const USER_AGENT = 'Mozilla/5.0 (compatible; borsa-paper-api/1.0)';
// OpenInsider yavaş yanıt verebiliyor (23 Eyl 2026: küme sayfası ~9,7 sn) —
// genel 10 sn sınırı taramayı düşürürdü; bu kaynak için daha uzun süre tanınır.
const OPENINSIDER_TIMEOUT_MS = 20_000;

export const MIN_SCORE = 40; // bildirim eşiği (B notu ve üstü)
const HISTORY_BATCH = 12; // koşu başına çekilen hisse geçmişi
const FRESH_DAYS = 3; // bundan eski dosyalamalar puanlanmadan "görüldü" sayılır
const ROUTINE_YEARS = 3;
const FREQUENT_LOOKBACK_MONTHS = 6;
const FREQUENT_MIN_MONTHS = 4;
const CLUSTER_WINDOW_DAYS = 30;
const CEO_CFO_BONUS = 50;
const LOW_PRICE = 5; // bunun altı: mesajda "piyango dağılımı" uyarısı

// Form 4 unvanları serbest metin: "Pres, CEO", "EVP, CFO", "COB, CEO, 10%" …
const CEO_RE = /\bCEO\b|chief executive/i;
const CFO_RE = /\bCFO\b|chief financial/i;

export interface InsiderRow {
  ticker: string;
  filingDate: string | null; // YYYY-MM-DD
  tradeDate: string | null;
  company?: string;
  industry?: string;
  insiders?: number | null; // küme sayfası: alıcı sayısı
  insider?: string; // screener: kişi adı
  title?: string;
  tradeType: string;
  price: number | null;
  qty: number | null;
  owned: number | null;
  deltaOwn: number | null; // %; yeni pozisyon = Infinity
  value: number | null;
}

export interface Assessment {
  ticker: string;
  score: number;
  grade: 'A' | 'B' | 'C' | 'D';
  reasons: string[];
  members: string[];
  routine: string[];
  ceo: boolean; // kümede CEO aldı
  cfo: boolean; // kümede CFO aldı
  lowPrice: boolean; // fiyat < $5
}

// ---- Ayrıştırma ----

const COLUMN_KEYS: Record<string, string> = {
  'filing date': 'filingDate',
  'trade date': 'tradeDate',
  ticker: 'ticker',
  'company name': 'company',
  industry: 'industry',
  ins: 'insiders',
  'insider name': 'insider',
  title: 'title',
  'trade type': 'tradeType',
  price: 'price',
  qty: 'qty',
  owned: 'owned',
  'δown': 'deltaOwn',
  value: 'value',
};

// Etiketleri tırnaklı öznitelikleri atlayarak sil: ticker hücresindeki
// onmouseover="Tip('<img ...>')" içindeki '>' saf <[^>]*> ile metne sızar.
function stripTags(s: string): string {
  return s.replace(/<(?:[^>"']|"[^"]*"|'[^']*')*>/g, '');
}

function decode(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&Delta;/g, 'Δ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

const cellText = (html: string) => decode(stripTags(html));

export function parseNumber(text: string): number | null {
  const t = text.replace(/[$,+]/g, '').trim();
  if (!t || t === '-') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function parsePercent(text: string): number | null {
  const t = text.trim();
  if (t.toLowerCase() === 'new') return Infinity;
  return parseNumber(t.replace(/[%<>]/g, ''));
}

function parseDate(text: string): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(text.trim());
  return m ? m[1] : null;
}

/** OpenInsider `tinytable` tablosunu başlık adlarına göre ayrıştırır; tablo yoksa []. */
export function parseTable(html: string): InsiderRow[] {
  const start = html.search(/<table[^>]*class="tinytable"/);
  if (start < 0) return [];
  const end = html.indexOf('</table>', start);
  const table = html.slice(start, end < 0 ? undefined : end);

  const keys = [...table.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((m) => {
    const h = cellText(m[1]).toLowerCase();
    return COLUMN_KEYS[h] ?? h;
  });
  if (!keys.includes('ticker')) throw new Error(`Beklenmeyen OpenInsider başlıkları: ${keys.join(', ')}`);

  const bodyStart = table.indexOf('<tbody');
  const body = bodyStart >= 0 ? table.slice(bodyStart) : table;
  const rows: InsiderRow[] = [];
  for (const tr of body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const cells = [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => cellText(m[1]));
    if (cells.length !== keys.length) continue;
    const raw: Record<string, string> = {};
    keys.forEach((k, i) => (raw[k] = cells[i]));
    rows.push({
      ticker: (raw.ticker ?? '').toUpperCase(),
      filingDate: parseDate(raw.filingDate ?? ''),
      tradeDate: parseDate(raw.tradeDate ?? ''),
      company: raw.company,
      industry: raw.industry,
      insiders: raw.insiders !== undefined ? parseNumber(raw.insiders) : undefined,
      insider: raw.insider,
      title: raw.title,
      tradeType: raw.tradeType ?? '',
      price: parseNumber(raw.price ?? ''),
      qty: parseNumber(raw.qty ?? ''),
      owned: parseNumber(raw.owned ?? ''),
      deltaOwn: parsePercent(raw.deltaOwn ?? ''),
      value: parseNumber(raw.value ?? ''),
    });
  }
  return rows;
}

async function getHtml(url: string): Promise<string> {
  bumpSubreq();
  const res = await fetchWithTimeout(url, { headers: { 'User-Agent': USER_AGENT } }, OPENINSIDER_TIMEOUT_MS);
  if (!res.ok) throw new Error(`OpenInsider ${res.status}: ${url.split('?')[0]}`);
  return res.text();
}

export async function fetchClusterBuys(): Promise<InsiderRow[]> {
  return parseTable(await getHtml(CLUSTER_URL));
}

/** Hissenin tüm geçmiş açık piyasa alımları (kişi bazında, yeniden eskiye). */
export async function fetchPurchaseHistory(ticker: string): Promise<InsiderRow[]> {
  const rows = parseTable(await getHtml(screenerUrl(ticker)));
  return rows.filter((r) => r.tradeType.startsWith('P'));
}

// ---- Puanlama ----

const dayNum = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 86_400_000;
const monthIdx = (d: string) => +d.slice(0, 4) * 12 + (+d.slice(5, 7) - 1);

/** `insider` yıllık ya da sık (aylık) rutinle mi alıyor? */
export function isRoutine(insider: string, tradeDate: string, history: InsiderRow[]): boolean {
  const months = new Set(
    history.filter((r) => r.insider === insider && r.tradeDate).map((r) => monthIdx(r.tradeDate!))
  );
  const idx = monthIdx(tradeDate);
  let yearly = true;
  for (let k = 1; k <= ROUTINE_YEARS; k++) if (!months.has(idx - 12 * k)) yearly = false;
  let recent = 0;
  for (let k = 1; k <= FREQUENT_LOOKBACK_MONTHS; k++) if (months.has(idx - k)) recent++;
  return yearly || recent >= FREQUENT_MIN_MONTHS;
}

/** Küme kaydının arkasındaki kişiler: işlemden 30 gün önce → dosyalama tarihi. */
export function clusterMembers(
  rec: Pick<InsiderRow, 'tradeDate' | 'filingDate'>,
  history: InsiderRow[]
): string[] {
  if (!rec.tradeDate) return [];
  const start = dayNum(rec.tradeDate) - CLUSTER_WINDOW_DAYS;
  const end = Math.max(dayNum(rec.tradeDate), rec.filingDate ? dayNum(rec.filingDate) : 0);
  const names: string[] = [];
  for (const r of history) {
    if (!r.tradeDate || !r.insider) continue;
    const d = dayNum(r.tradeDate);
    if (d >= start && d <= end && !names.includes(r.insider)) names.push(r.insider);
  }
  return names;
}

/**
 * Küme üyelerinin unvanlarında CEO ve CFO var mı? Yalnızca kümenin kendi
 * alım satırlarına bakılır: yıllar önce CEO olup bugün direktör olan biri
 * eski satırındaki unvanla CEO sayılmasın.
 */
export function clusterRoles(
  rec: Pick<InsiderRow, 'tradeDate' | 'filingDate'>,
  history: InsiderRow[],
  members: string[]
): { ceo: boolean; cfo: boolean } {
  if (!rec.tradeDate) return { ceo: false, cfo: false };
  const set = new Set(members);
  const start = dayNum(rec.tradeDate) - CLUSTER_WINDOW_DAYS;
  const end = Math.max(dayNum(rec.tradeDate), rec.filingDate ? dayNum(rec.filingDate) : 0);
  const titles = history
    .filter((r) => r.insider && set.has(r.insider) && r.tradeDate && dayNum(r.tradeDate) >= start && dayNum(r.tradeDate) <= end)
    .map((r) => r.title ?? '');
  return { ceo: titles.some((t) => CEO_RE.test(t)), cfo: titles.some((t) => CFO_RE.test(t)) };
}

function grade(score: number): Assessment['grade'] {
  return score >= 60 ? 'A' : score >= 40 ? 'B' : score >= 20 ? 'C' : 'D';
}

/** Küme kaydını puanlar. `history` verilmezse rutin kontrolü atlanır. */
export function assess(rec: InsiderRow, history?: InsiderRow[], today = new Date()): Assessment {
  let score = 0;
  const reasons: string[] = [];

  const n = rec.insiders ?? 0;
  const nPts = n >= 5 ? 15 : n >= 3 ? 10 : n >= 2 ? 5 : 0;
  if (nPts) {
    score += nPts;
    reasons.push(`${n} içeriden alıcı (+${nPts})`);
  }

  const value = rec.value ?? 0;
  for (const [limit, pts, label] of [
    [5e6, 12, '$5M'],
    [1e6, 8, '$1M'],
    [5e5, 5, '$500K'],
    [1e5, 3, '$100K'],
  ] as const) {
    if (value >= limit) {
      score += pts;
      reasons.push(`tutar ≥${label} (+${pts})`);
      break;
    }
  }

  const d = rec.deltaOwn;
  if (d != null) {
    const pts = d >= 20 ? 8 : d >= 10 ? 5 : d >= 5 ? 3 : 0;
    if (pts) {
      score += pts;
      reasons.push(`${d === Infinity ? 'yeni pozisyon' : `pozisyon +%${d.toFixed(0)}`} (+${pts})`);
    }
  }

  if (rec.tradeDate) {
    const todayNum = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()) / 86_400_000;
    const age = todayNum - dayNum(rec.tradeDate);
    if (age <= 7) {
      score += 5;
      reasons.push(`${age} gün önce (+5)`);
    } else if (age <= 30) {
      score += 3;
      reasons.push(`${age} gün önce (+3)`);
    }
  }

  if (rec.price != null && rec.price < 1) {
    score -= 5;
    reasons.push('kuruş hisse (-5)');
  }

  let members: string[] = [];
  let routine: string[] = [];
  let roles = { ceo: false, cfo: false };
  if (history?.length && rec.tradeDate) {
    members = clusterMembers(rec, history);
    routine = members.filter((m) => isRoutine(m, rec.tradeDate!, history));
    if (members.length && routine.length === members.length) {
      score -= 12;
      reasons.push('tüm alıcılar rutin (-12)');
    } else if (routine.length) {
      score -= 5;
      reasons.push(`${routine.length}/${members.length} alıcı rutin (-5)`);
    } else if (members.length) {
      score += 3;
      reasons.push('fırsatçı alım, rutin yok (+3)');
    }
    roles = clusterRoles(rec, history, members);
    if (roles.ceo && roles.cfo) {
      score += CEO_CFO_BONUS;
      reasons.unshift(`CEO ve CFO birlikte aldı (+${CEO_CFO_BONUS})`);
    }
  }

  score = Math.max(0, Math.min(100, score));
  const lowPrice = rec.price != null && rec.price < LOW_PRICE;
  return { ticker: rec.ticker, score, grade: grade(score), reasons, members, routine, ...roles, lowPrice };
}

// ---- Biçimlendirme ----

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function money(v: number | null): string {
  const x = v ?? 0;
  return x >= 1e6 ? `$${(x / 1e6).toFixed(1)}M` : `$${Math.round(x / 1e3)}K`;
}

export function formatAlert(rec: InsiderRow, a: Assessment): string {
  const routine = a.members.length ? ` · rutin ${a.routine.length}/${a.members.length}` : '';
  const badge = a.ceo && a.cfo ? ' 👔 CEO+CFO' : '';
  const warn = a.lowPrice
    ? `⚠️ $${LOW_PRICE} altı: bu grupta ortalama yüksek ama medyan kötü (piyango dağılımı)\n`
    : '';
  return (
    `<b>${esc(rec.ticker)}</b> ${esc(rec.company ?? '')} — puan <b>${a.score}</b> (${a.grade})${badge}\n` +
    `${rec.insiders ?? '?'} kişi · ${money(rec.value)} · $${(rec.price ?? 0).toFixed(2)} · ` +
    `işlem ${rec.tradeDate ?? '?'}${routine}\n` +
    warn +
    `<i>${esc(a.reasons.join(', '))}</i>\n` +
    `http://openinsider.com/${encodeURIComponent(rec.ticker)}`
  );
}

// ---- Zamanlanmış tarama ----

export const recordKey = (r: InsiderRow) => `${r.ticker}|${r.filingDate ?? ''}`;

export interface InsiderScanResult {
  clusters: number;
  fresh: number;
  scored: number;
  alerts: number;
  deferred: number;
  notified: boolean;
}

export async function runInsiderScan(
  db: D1Database,
  env: TelegramEnv,
  opts: { notify?: boolean; today?: Date } = {}
): Promise<InsiderScanResult> {
  const notify = opts.notify ?? true;
  const today = opts.today ?? new Date();
  const records = await fetchClusterBuys();
  const result: InsiderScanResult = { clusters: records.length, fresh: 0, scored: 0, alerts: 0, deferred: 0, notified: false };
  if (!records.length) return result;

  const { results: seenRows } = await db
    .prepare('SELECT key FROM insider_seen WHERE key IN (SELECT value FROM json_each(?))')
    .bind(JSON.stringify(records.map(recordKey)))
    .all<{ key: string }>();
  const seen = new Set(seenRows.map((r) => r.key));
  const unseen = records.filter((r) => !seen.has(recordKey(r)));

  const todayNum = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()) / 86_400_000;
  const isFresh = (r: InsiderRow) => r.filingDate != null && todayNum - dayNum(r.filingDate) <= FRESH_DAYS;
  const stale = unseen.filter((r) => !isFresh(r));
  // Yeni kayıtlar ön puana göre: bütçe yetmezse güçlüler önce ele alınır
  const fresh = unseen
    .filter(isFresh)
    .sort((a, b) => assess(b, undefined, today).score - assess(a, undefined, today).score);
  result.fresh = fresh.length;

  const batch = fresh.slice(0, HISTORY_BATCH);
  result.deferred = fresh.length - batch.length;
  const histories = new Map<string, InsiderRow[]>();
  for (const rec of batch) {
    if (histories.has(rec.ticker)) continue;
    try {
      histories.set(rec.ticker, await fetchPurchaseHistory(rec.ticker));
    } catch (e) {
      console.error(`OpenInsider geçmişi alınamadı (${rec.ticker}):`, e);
      histories.set(rec.ticker, []);
    }
  }

  const scored = batch.map((rec) => ({ rec, a: assess(rec, histories.get(rec.ticker), today) }));
  result.scored = scored.length;
  const alerts = scored.filter((s) => s.a.score >= MIN_SCORE).sort((x, y) => y.a.score - x.a.score);
  result.alerts = alerts.length;

  let sent = true;
  if (alerts.length && notify && telegramConfigured(env)) {
    sent = await sendChunked(env, [
      `🕵️ <b>İçeriden Küme Alımları</b> (${alerts.length} yeni, puan ≥${MIN_SCORE})`,
      ...alerts.map((s) => formatAlert(s.rec, s.a)),
      'Bilgi amaçlıdır, işlem açılmaz.',
    ]);
    result.notified = sent;
  }

  // Gönderim düştüyse bildirilecek kayıtlar yazılmaz → sonraki koşuda yeniden denenir
  const alertKeys = new Set(alerts.map((s) => recordKey(s.rec)));
  const insert = db.prepare(
    `INSERT OR IGNORE INTO insider_seen
       (key, ticker, filing_date, trade_date, insiders, value, score, grade, routine, notified)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const stmts = [
    ...stale.map((r) =>
      insert.bind(recordKey(r), r.ticker, r.filingDate ?? '', r.tradeDate, r.insiders ?? null, r.value, null, null, null, 0)
    ),
    ...scored
      .filter((s) => sent || !alertKeys.has(recordKey(s.rec)))
      .map(({ rec, a }) =>
        insert.bind(
          recordKey(rec),
          rec.ticker,
          rec.filingDate ?? '',
          rec.tradeDate,
          rec.insiders ?? null,
          rec.value,
          a.score,
          a.grade,
          a.members.length ? `${a.routine.length}/${a.members.length}` : null,
          alertKeys.has(recordKey(rec)) && result.notified ? 1 : 0
        )
      ),
  ];
  if (stmts.length) await db.batch(stmts);
  return result;
}

// Telegram 4096 karakter sınırı: blokları bölmeden birleştirerek gönder
async function sendChunked(env: TelegramEnv, blocks: string[]): Promise<boolean> {
  let chunk = '';
  let ok = true;
  for (const b of blocks) {
    if (chunk && chunk.length + b.length + 2 > 4000) {
      ok = (await sendTelegram(env, chunk)) && ok;
      chunk = '';
    }
    chunk += (chunk ? '\n\n' : '') + b;
  }
  if (chunk) ok = (await sendTelegram(env, chunk)) && ok;
  return ok;
}

/** Önizleme (bildirim/DB yok): en güçlü n küme kaydını geçmişle puanlar. */
export async function previewInsider(n = 10): Promise<Array<InsiderRow & { assessment: Assessment }>> {
  const records = await fetchClusterBuys();
  const top = records
    .map((r) => ({ r, pre: assess(r).score }))
    .sort((a, b) => b.pre - a.pre)
    .slice(0, Math.min(n, HISTORY_BATCH))
    .map((x) => x.r);
  const out: Array<InsiderRow & { assessment: Assessment }> = [];
  const histories = new Map<string, InsiderRow[]>();
  for (const r of top) {
    if (!histories.has(r.ticker)) histories.set(r.ticker, await fetchPurchaseHistory(r.ticker).catch(() => []));
    out.push({ ...r, assessment: assess(r, histories.get(r.ticker)) });
  }
  return out.sort((a, b) => b.assessment.score - a.assessment.score);
}
