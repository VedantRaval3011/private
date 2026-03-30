import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { JWTPayload } from '@/types/auth';
import { cookies } from 'next/headers';

const JWT_SECRET = process.env.JWT_SECRET || 'formula-master-secret-change-in-production';
export const COOKIE_NAME = 'auth-token';

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload;
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
  return verifyToken(token);
}
