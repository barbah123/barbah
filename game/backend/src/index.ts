import { authRoutes } from './routes/auth';
import { meRoutes } from './routes/me';
import { marketRoutes } from './routes/market';
import { progressRoutes } from './routes/progress';
import { corsHeaders, handleOptions, json } from './middleware/cors';

export interface Env {
  DB: D1Database;
  JWT_SECRET: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') return handleOptions();

    const path = new URL(request.url).pathname;

    try {
      if (path === '/') return json({ name: 'Badaland API', ok: true });
      if (path.startsWith('/auth')) return authRoutes(request, env);
      if (path === '/me' || path.startsWith('/me/')) return meRoutes(request, env);
      if (path.startsWith('/market')) return marketRoutes(request, env);
      if (path.startsWith('/progress')) return progressRoutes(request, env);

      return new Response(JSON.stringify({ error: 'Bulunamadı' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch {
      return new Response(JSON.stringify({ error: 'Sunucu hatası, lütfen tekrar deneyin' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  },
};
