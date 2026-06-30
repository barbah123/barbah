const DEFAULT_EXPIRY_SECONDS = 7 * 24 * 3600; // 7 gün

export interface UserClaims {
  id: string;
  email: string;
  username: string;
}

export async function signJWT(
  payload: object,
  secret: string,
  expiresInSeconds: number = DEFAULT_EXPIRY_SECONDS
): Promise<string> {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const body = btoa(JSON.stringify({ ...payload, exp }));
  const data = `${header}.${body}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return `${data}.${sigB64}`;
}

export async function verifyJWT(token: string, secret: string): Promise<any> {
  const [header, body, sig] = token.split('.');
  if (!header || !body || !sig) throw new Error('Malformed token');

  // İmzaladığımız algoritma dışındaki her şeyi reddet (alg confusion önlemi).
  const decodedHeader = JSON.parse(atob(header));
  if (decodedHeader.alg !== 'HS256') throw new Error('Unexpected token algorithm');

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );
  const sigBytes = Uint8Array.from(atob(sig), c => c.charCodeAt(0));
  const valid = await crypto.subtle.verify('HMAC', key, sigBytes, new TextEncoder().encode(`${header}.${body}`));
  if (!valid) throw new Error('Invalid token');

  const payload = JSON.parse(atob(body));
  if (typeof payload.exp !== 'number' || Math.floor(Date.now() / 1000) >= payload.exp) {
    throw new Error('Token expired');
  }
  return payload;
}

export async function getUser(request: Request, secret: string): Promise<UserClaims> {
  const auth = request.headers.get('Authorization') ?? '';
  const token = auth.replace('Bearer ', '');
  if (!token) throw new Error('Unauthorized');
  return verifyJWT(token, secret);
}
