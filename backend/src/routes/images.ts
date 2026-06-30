import { Env } from '../index';
import { json, corsHeaders } from '../middleware/cors';
import { getUser } from '../lib/jwt';

export async function imageRoutes(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  // POST /images/upload — returns a pre-signed key after upload
  if (path === '/images/upload' && request.method === 'POST') {
    const user = await getUser(request, env.JWT_SECRET).catch(() => null);
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const contentType = request.headers.get('Content-Type') ?? 'image/jpeg';
    const key = `cards/${user.id}/${crypto.randomUUID()}`;

    const body = await request.arrayBuffer();
    if (body.byteLength > 5 * 1024 * 1024) return json({ error: 'File too large (max 5MB)' }, 400);

    await env.BUCKET.put(key, body, { httpMetadata: { contentType } });
    return json({ key });
  }

  // GET /images/:key — serve image
  if (path.startsWith('/images/') && request.method === 'GET') {
    const key = path.replace('/images/', '');
    const obj = await env.BUCKET.get(key);
    if (!obj) return json({ error: 'Not found' }, 404);

    return new Response(obj.body, {
      headers: {
        ...corsHeaders,
        'Content-Type': obj.httpMetadata?.contentType ?? 'image/jpeg',
        'Cache-Control': 'public, max-age=31536000',
      },
    });
  }

  return json({ error: 'Not found' }, 404);
}
