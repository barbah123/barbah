export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Device-Id',
};

export function handleOptions(): Response {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export function error(message: string, status = 400): Response {
  return json({ error: message }, status);
}

// DIŞ VERİ ÇAĞRILARI İÇİN ZAMAN AŞIMI
// Cloudflare fetch'i kendi başına süresiz bekler: sağlayıcı HATA vermek yerine
// ASILI KALIRSA (11 Eyl 14:27-16:10, Massive) çağıran iş de asılı kalır. Yedek
// kaynağa düşme mantığı ancak çağrı BİTERSE (hata/boş) devreye girdiğinden,
// asılı kalan sağlayıcı tüm tarayıcıyı sessizce kör eder: sinyal üretimi durur
// ama kalp atışı (iş başlarken damgalanır) sağlıklı görünür.
// Bu yüzden dış çağrılar zaman aşımıyla sarılır; süre dolunca fetch iptal edilir
// ve hata olarak yükselir, böylece mevcut fail-open/yedek yolları çalışır.
export const EXTERNAL_FETCH_TIMEOUT_MS = 10_000;

export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = EXTERNAL_FETCH_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (e) {
    // AbortError'ı anlaşılır bir hataya çevir (loglarda "neden" görünsün)
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error(`Veri kaynağı zaman aşımı (${timeoutMs} ms): ${url.split('?')[0]}`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
