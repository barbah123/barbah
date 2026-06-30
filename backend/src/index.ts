import { authRoutes } from './routes/auth';
import { auctionRoutes } from './routes/auctions';
import { imageRoutes } from './routes/images';
import { meRoutes } from './routes/me';
import { corsHeaders, handleOptions } from './middleware/cors';

export interface Env {
  DB: D1Database;
  BUCKET: R2Bucket;
  JWT_SECRET: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') return handleOptions();

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path.startsWith('/auth')) return authRoutes(request, env);
      if (path === '/me' || path.startsWith('/me/')) return meRoutes(request, env);
      if (path.startsWith('/auctions')) return auctionRoutes(request, env);
      if (path.startsWith('/images')) return imageRoutes(request, env);

      return new Response(JSON.stringify({ error: 'Bulunamadı' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (e: any) {
      return new Response(JSON.stringify({ error: 'Sunucu hatası, lütfen tekrar deneyin' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  },
};
