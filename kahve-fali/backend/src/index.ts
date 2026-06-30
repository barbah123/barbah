import { authRoutes } from './routes/auth';
import { meRoutes } from './routes/me';
import { fortuneRoutes } from './routes/fortune';
import { corsHeaders, handleOptions } from './middleware/cors';

export interface Env {
  DB: D1Database;
  JWT_SECRET: string;
  ENCRYPTION_KEY: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') return handleOptions();

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === '/' || path === '/health') {
        return new Response(JSON.stringify({ ok: true, service: 'kahve-fali-api' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (path.startsWith('/auth')) return authRoutes(request, env);
      if (path === '/fortune') return fortuneRoutes(request, env);
      if (path === '/me' || path.startsWith('/me/')) return meRoutes(request, env);

      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (e: any) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  },
};
