import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import PagePermission from '@/models/PagePermission';
import { JWTPayload, UserRole } from '@/types/auth';
import { getAuthUser } from '@/lib/auth';

function normalizePath(pathname: string) {
  if (!pathname) return '/';
  if (pathname.length > 1 && pathname.endsWith('/')) return pathname.slice(0, -1);
  return pathname;
}

function hasAccess(args: {
  role: UserRole;
  userId: string;
  permission: { allowedRoles: UserRole[]; allowedUsers: unknown[] } | null;
}) {
  const { role, userId, permission } = args;
  if (role === 'super-admin') return true;
  if (!permission) return true;
  const allowedUsers = (permission.allowedUsers ?? []).map((u: any) => u?.toString?.() ?? String(u));
  if (allowedUsers.includes(userId)) return true;
  return (permission.allowedRoles ?? []).includes(role);
}

// GET /api/page-permissions/allowed — returns allowed pages for current user
export async function GET(request: NextRequest) {
  const payload = (await getAuthUser()) as JWTPayload | null;
  if (!payload) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await connectToDatabase();

  const permissions = await PagePermission.find({}).select('pageRoute pageName allowedRoles allowedUsers').lean();
  const userId = payload.userId;
  const role = payload.role as UserRole;

  const allowed = permissions
    .map((p: any) => ({
      pageRoute: normalizePath(p.pageRoute),
      pageName: p.pageName,
      allowedRoles: p.allowedRoles,
      allowedUsers: p.allowedUsers,
    }))
    .filter((p: any) => hasAccess({ role, userId, permission: p }))
    .sort((a: any, b: any) => a.pageName.localeCompare(b.pageName));

  return NextResponse.json({ pages: allowed });
}

