import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import PagePermission from '@/models/PagePermission';
import { UserRole } from '@/types/auth';

function isAllowed(args: {
  userId: string;
  role: UserRole;
  route: string;
  permission: { allowedRoles: UserRole[]; allowedUsers: unknown[] } | null;
}) {
  const { userId, role, route, permission } = args;

  // Always allow super-admin
  if (role === 'super-admin') return true;

  // If no permission record exists for this route, default allow
  if (!permission) return true;

  const allowedUsers = (permission.allowedUsers ?? []).map((u: any) => u?.toString?.() ?? String(u));
  if (allowedUsers.includes(userId)) return true;

  return (permission.allowedRoles ?? []).includes(role);
}

function normalizePath(pathname: string) {
  if (!pathname) return '/';
  if (pathname.length > 1 && pathname.endsWith('/')) return pathname.slice(0, -1);
  return pathname;
}

// GET /api/page-permissions/check?path=/retained-sample
export async function GET(request: NextRequest) {
  const role = (request.headers.get('x-user-role') || '') as UserRole;
  const userId = request.headers.get('x-user-id') || '';
  if (!role || !userId) {
    return NextResponse.json({ allowed: false, error: 'Unauthorized' }, { status: 401 });
  }

  const requested = normalizePath(request.nextUrl.searchParams.get('path') || request.nextUrl.pathname || '/');

  // Don’t gate auth/admin plumbing here
  if (
    requested.startsWith('/api/auth/') ||
    requested.startsWith('/admin') ||
    requested === '/login'
  ) {
    return NextResponse.json({ allowed: true });
  }

  await connectToDatabase();

  // Longest-prefix match so permission on `/retained-sample` also applies to `/retained-sample/xyz`
  const all = await PagePermission.find({}).select('pageRoute allowedRoles allowedUsers').lean();
  const normalized = all.map((p: any) => ({ ...p, pageRoute: normalizePath(p.pageRoute) }));
  const match = normalized
    .filter((p: any) => requested === p.pageRoute || requested.startsWith(p.pageRoute + '/'))
    .sort((a: any, b: any) => b.pageRoute.length - a.pageRoute.length)[0] ?? null;

  const allowed = isAllowed({
    userId,
    role,
    route: requested,
    permission: match ? { allowedRoles: match.allowedRoles, allowedUsers: match.allowedUsers } : null,
  });

  return NextResponse.json({ allowed });
}

