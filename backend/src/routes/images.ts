import { Env } from '../index';
import { json, corsHeaders } from '../middleware/cors';
import { getUser } from '../lib/jwt';

export async function imageRoutes(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  // POST /images/upload — returns a pre-signed key after upload
  if (path === '/images/upload' && request.method === 'POST') {
    const user = await getUser(request, env.JWT_SECRET).catch(() => null);
    if (!user) return json({ error: 'Oturum açmanız gerekiyor' }, 401);

    // Only accept real image types — never store/serve client-controlled HTML/JS
    // from our own origin (stored-XSS / file-hosting abuse).
    const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    const contentType = (request.headers.get('Content-Type') ?? '').split(';')[0].trim().toLowerCase();
    if (!ALLOWED_TYPES.includes(contentType)) {
      return json({ error: 'Desteklenmeyen dosya türü (jpeg, png, webp, gif olmalı)' }, 415);
    }

    const key = `cards/${user.id}/${crypto.randomUUID()}`;

    const body = await request.arrayBuffer();
    if (body.byteLength > 5 * 1024 * 1024) return json({ error: 'Dosya çok büyük (en fazla 5MB)' }, 400);

    await env.BUCKET.put(key, body, { httpMetadata: { contentType } });
    return json({ key });
  }

  // GET /images/:key — serve image
  if (path.startsWith('/images/') && request.method === 'GET') {
    const key = path.replace('/images/', '');
    const obj = await env.BUCKET.get(key);
    if (!obj) return json({ error: 'Bulunamadı' }, 404);

    return new Response(obj.body, {
      headers: {
        ...corsHeaders,
        'Content-Type': obj.httpMetadata?.contentType ?? 'image/jpeg',
        'Cache-Control': 'public, max-age=31536000',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  }

  return json({ error: 'Bulunamadı' }, 404);
}
