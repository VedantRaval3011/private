import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { JWTPayload } from '@/types/auth';
import { cookies } from 'next/headers';

const JWT_SECRET = process.env.JWT_SECRET || 'formula-master-secret-change-in-production';
export const COOKIE_NAME = 'auth-token';
const JWT_SECRET_KEY = new TextEncoder().encode(JWT_SECRET);

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function signToken(payload: JWTPayload): Promise<string> {
  return new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(JWT_SECRET_KEY);
}

export async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET_KEY, {
      algorithms: ['HS256'],
    });
    return payload as unknown as JWTPayload;
  } catch {
    return null;
  }
}

export function isAdminRole(role: string | null): boolean {
  return role === 'admin' || role === 'super-admin';
}

export function getRequestContext(request: { headers: { get: (key: string) => string | null } }) {
  return {
    role: (request.headers.get('x-user-role') ?? '') as import('@/types/auth').UserRole,
    userId: request.headers.get('x-user-id') ?? '',
    username: request.headers.get('x-user-username') ?? '',
    name: request.headers.get('x-user-name') ?? '',
  };
}

export async function getAuthUser(): Promise<JWTPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return await verifyToken(token);
}
