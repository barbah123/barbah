export async function signJWT(payload: object, secret: string): Promise<string> {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = btoa(JSON.stringify(payload));
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
  return JSON.parse(atob(body));
}

export async function getUser(request: Request, secret: string): Promise<{ id: string; email: string }> {
  const auth = request.headers.get('Authorization') ?? '';
  const token = auth.replace('Bearer ', '');
  if (!token) throw new Error('Unauthorized');
  return verifyJWT(token, secret);
}
