import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, isAdminRole, COOKIE_NAME } from '@/lib/auth';

const PUBLIC_PATHS = [
  '/login',
  '/api/auth/login',
  '/api/seed',
];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow Next.js internals and static files
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // Allow public paths
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const token = request.cookies.get(COOKIE_NAME)?.value;

  if (!token) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const payload = verifyToken(token);

  if (!payload) {
    if (pathname.startsWith('/api/')) {
      const res = NextResponse.json({ error: 'Invalid session' }, { status: 401 });
      res.cookies.delete('auth-token');
      return res;
    }
    const res = NextResponse.redirect(new URL('/login', request.url));
    res.cookies.delete('auth-token');
    return res;
  }

  // Only super-admin can access page-permissions management
  if (
    pathname.startsWith('/admin/page-permissions') &&
    payload.role !== 'super-admin'
  ) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  // Only admin and super-admin can access admin area
  if (pathname.startsWith('/admin') && !isAdminRole(payload.role)) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  // Forward user identity to API routes via headers
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-user-id', payload.userId);
  requestHeaders.set('x-user-role', payload.role);
  requestHeaders.set('x-user-username', payload.username);
  requestHeaders.set('x-user-name', payload.name);

  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
