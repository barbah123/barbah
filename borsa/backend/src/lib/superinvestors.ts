// SÜPER YATIRIMCI BAĞLAMI (Dataroma)
// İçeriden alım bildirimine "bu hisseyi hangi büyük yatırımcılar tutuyor"
// satırını ekler. YALNIZCA BAĞLAMDIR — puanı etkilemez.
//
// Neden sinyal değil: 83 yatırımcının Q4 2024 – Q1 2026 13F işlemleri
// (16.843 işlem) backtest edildi. Yeni alımlar 6 ayda eşit ağırlıklı S&P
// 500'ün (RSP) −1,2 puan gerisinde kaldı; "3+ yatırımcı aynı çeyrekte aldı"
// uzlaşısı ek getiri sağlamadı (−0,7 [−2,9; +1,3]); yatırımcı becerisi
// yarıyıldan yarıyıla kalıcı değildi. 13F en geç 45 gün sonra yayımlandığı
// için bilgi çoktan fiyatlanmış oluyor.
//
// DATAROMA TUZAKLARI (23 Eyl 2026):
//   • Kısa User-Agent (ör. "Mozilla/5.0") mod_security'ye takılır → 406
//     "Not Acceptable". Tam tarayıcı UA'sı gerekir.
//   • Sahiplik tablosu `table#grid`; son işlem sütunu "Buy", "Add 45.24%",
//     "Reduce 5.83%" ya da boş.

import { fetchWithTimeout } from './http';
import { bumpSubreq } from './subreq';

const STOCK_URL = 'https://www.dataroma.com/m/stock.php?sym=';
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const TOP_N = 3;

export interface SuperHolding {
  manager: string; // "Warren Buffett - Berkshire Hathaway"
  pct: number | null; // yatırımcının portföyündeki payı (%)
  activity: string; // "Buy" | "Add 45.24%" | "Reduce 5.83%" | ""
}

export interface SuperContext {
  ticker: string;
  count: number; // hisseyi tutan süper yatırımcı sayısı
  holders: SuperHolding[]; // portföy payına göre azalan
}

const strip = (s: string) =>
  s
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Dataroma hisse sayfasını ayrıştırır; sayfa beklenen yapıda değilse null. */
export function parseDataromaStock(ticker: string, html: string): SuperContext | null {
  const m = /Ownership count:<\/td><td><b>(\d+)<\/b>/.exec(html);
  if (!m) return null;
  const holders: SuperHolding[] = [];
  const start = html.indexOf('<table id="grid">');
  if (start >= 0) {
    const table = html.slice(start, html.indexOf('</table>', start));
    for (const tr of table.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
      const cells = [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => strip(c[1]));
      if (cells.length < 4 || !/class="firm"><a/.test(tr[1])) continue;
      const pct = Number(cells[2]);
      holders.push({ manager: cells[1], pct: Number.isFinite(pct) ? pct : null, activity: cells[3] });
    }
  }
  holders.sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0));
  return { ticker: ticker.toUpperCase(), count: Number(m[1]), holders };
}

export async function fetchSuperContext(ticker: string): Promise<SuperContext | null> {
  bumpSubreq();
  const res = await fetchWithTimeout(STOCK_URL + encodeURIComponent(ticker.toUpperCase()), {
    headers: { 'User-Agent': BROWSER_UA },
  });
  const html = await res.text();
  if (!res.ok) throw new Error(`Dataroma ${res.status}: ${snippet(html)}`);
  // İzlenmeyen hisse de Dataroma'nın kendi sayfasıyla ("not found") gelir → null.
  // Başlığı Dataroma olmayan 200 yanıtı (engel/doğrulama sayfası) ise hatadır;
  // aksi hâlde engel sessizce "kimse tutmuyor" gibi görünür.
  if (!/<title>[^<]*DATAROMA/i.test(html)) throw new Error(`Dataroma beklenmeyen yanıt ${res.status}: ${snippet(html)}`);
  return parseDataromaStock(ticker, html);
}

// Hata mesajı için yanıtın başlığı + ilk metni (tanı; tam gövde loglanmaz)
function snippet(html: string): string {
  const title = /<title>([^<]*)<\/title>/i.exec(html)?.[1]?.trim() ?? '';
  const text = strip(html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')).slice(0, 160);
  return `${title ? `[${title}] ` : ''}${text}`;
}

// "Warren Buffett - Berkshire Hathaway" → "Warren Buffett"; firma adıysa olduğu gibi
function shortName(manager: string): string {
  const i = manager.indexOf(' - ');
  return i > 0 ? manager.slice(0, i) : manager;
}

function activityMark(activity: string): string {
  if (activity.startsWith('Buy')) return ' (yeni)';
  if (activity.startsWith('Add')) return ' ↑';
  if (activity.startsWith('Reduce')) return ' ↓';
  return '';
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Portföy payı; çok küçükse "%<0,1". Telegram HTML modunda çıplak '<' etiket
// sanılır ve tüm mesaj reddedilir → &lt; olarak kaçırılır.
function pctText(pct: number | null): string {
  if (pct == null) return '';
  return pct < 0.1 ? ' %&lt;0,1' : ` %${pct.toFixed(1).replace('.', ',')}`;
}

/** Bildirim satırı; hisseyi tutan yoksa boş dize (gürültü üretmesin). */
export function formatSuperContext(ctx: SuperContext | null): string {
  if (!ctx || ctx.count === 0) return '';
  const top = ctx.holders
    .slice(0, TOP_N)
    .map((h) => `${esc(shortName(h.manager))}${pctText(h.pct)}${activityMark(h.activity)}`);
  return `🏦 Süper yatırımcılar: ${ctx.count}${top.length ? ' · ' + top.join(' · ') : ''}\n`;
}
