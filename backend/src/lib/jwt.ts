import jwt from 'jsonwebtoken';

export interface AuthUser {
  id: string;
  email: string;
  username: string;
}

export function signJwt(user: AuthUser, secret: string, expiresIn: string): string {
  return jwt.sign(user, secret, { expiresIn: expiresIn as any });
}

export function verifyJwt(token: string, secret: string): AuthUser {
  const decoded = jwt.verify(token, secret) as jwt.JwtPayload;
  return { id: decoded.id, email: decoded.email, username: decoded.username };
}
