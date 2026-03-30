import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import PagePermission from '@/models/PagePermission';
import { isAdminRole } from '@/lib/auth';
import { UserRole } from '@/types/auth';
import mongoose from 'mongoose';

export const ALL_PAGES = [
  { pageRoute: '/', pageName: 'Dashboard' },
  { pageRoute: '/batch-data', pageName: 'Batch Data' },
  { pageRoute: '/batches', pageName: 'Batches' },
  { pageRoute: '/bulk-calculation', pageName: 'Bulk Calculation' },
  { pageRoute: '/coa', pageName: 'COA Management' },
  { pageRoute: '/data-validation', pageName: 'Data Validation' },
  { pageRoute: '/finish-calculation', pageName: 'Finish Calculation' },
  { pageRoute: '/formula-data', pageName: 'Formula Data' },
  { pageRoute: '/inward-register', pageName: 'Inward Register' },
  { pageRoute: '/material-availability', pageName: 'Material Availability' },
  { pageRoute: '/processing-logs', pageName: 'Processing Logs' },
  { pageRoute: '/product-master', pageName: 'Product Master' },
  { pageRoute: '/reconciliation', pageName: 'Reconciliation' },
  { pageRoute: '/rejected-data', pageName: 'Rejected Data' },
  { pageRoute: '/requisition', pageName: 'Requisition' },
  { pageRoute: '/retained-sample', pageName: 'Retained Sample' },
  { pageRoute: '/rm-data', pageName: 'RM Data' },
  { pageRoute: '/skipped-duplicates', pageName: 'Skipped Duplicates' },
  { pageRoute: '/yield', pageName: 'Yield Management' },
  { pageRoute: '/admin/users', pageName: 'User Management (Admin)' },
];

// GET /api/page-permissions — returns all page permissions
export async function GET(request: NextRequest) {
  if (!isAdminRole(request.headers.get('x-user-role'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await connectToDatabase();

  // Seed missing page records only when the count doesn't match
  const count = await PagePermission.countDocuments();
  if (count < ALL_PAGES.length) {
    const ops = ALL_PAGES.map((page) => ({
      updateOne: {
        filter: { pageRoute: page.pageRoute },
        update: {
          $setOnInsert: {
            ...page,
            allowedRoles: ['super-admin', 'admin', 'employee'] as UserRole[],
            allowedUsers: [],
          },
        },
        upsert: true,
      },
    }));
    await PagePermission.bulkWrite(ops);
  }

  const permissions = await PagePermission.find({});
  return NextResponse.json({ permissions });
}

// PUT /api/page-permissions — update permissions (super-admin only)
export async function PUT(request: NextRequest) {
  const callerRole = request.headers.get('x-user-role') as UserRole;
  if (callerRole !== 'super-admin') {
    return NextResponse.json({ error: 'Forbidden — super-admin only' }, { status: 403 });
  }

  try {
    const { permissions } = await request.json();
    if (!Array.isArray(permissions)) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    await connectToDatabase();

    const ops = permissions.map(
      (p: { pageRoute: string; allowedRoles: UserRole[]; allowedUsers?: string[] }) => ({
        updateOne: {
          filter: { pageRoute: p.pageRoute },
          update: {
            $set: {
              allowedRoles: p.allowedRoles,
              allowedUsers: (p.allowedUsers ?? []).map((id) => new mongoose.Types.ObjectId(id)),
            },
          },
          upsert: true,
        },
      })
    );

    await PagePermission.bulkWrite(ops);
    const updated = await PagePermission.find({});
    return NextResponse.json({ permissions: updated });
  } catch (error) {
    console.error('[PagePermissions PUT]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
