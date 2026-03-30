import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import User from '@/models/User';
import { hashPassword, verifyPassword, isAdminRole, getRequestContext } from '@/lib/auth';

// PUT /api/users/[id]/password
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { role: callerRole, userId: callerId } = getRequestContext(request);
  const { id } = await params;

  const isAdmin = isAdminRole(callerRole);
  const isSelf = callerId === id;

  if (!isAdmin && !isSelf) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { currentPassword, newPassword, confirmPassword } = await request.json();

    if (!newPassword || !confirmPassword) {
      return NextResponse.json(
        { error: 'New password and confirmation are required' },
        { status: 400 }
      );
    }

    if (newPassword !== confirmPassword) {
      return NextResponse.json(
        { error: 'Passwords do not match' },
        { status: 400 }
      );
    }

    if (newPassword.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 }
      );
    }

    await connectToDatabase();
    const target = await User.findById(id);
    if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    if (isAdmin && !isSelf) {
      if (callerRole === 'admin' && target.role !== 'employee') {
        return NextResponse.json(
          { error: 'Admins can only reset employee passwords' },
          { status: 403 }
        );
      }
    } else {
      if (!currentPassword) {
        return NextResponse.json(
          { error: 'Current password is required' },
          { status: 400 }
        );
      }
      const valid = await verifyPassword(currentPassword, target.password);
      if (!valid) {
        return NextResponse.json(
          { error: 'Current password is incorrect' },
          { status: 400 }
        );
      }
    }

    target.password = await hashPassword(newPassword);
    await target.save();

    return NextResponse.json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    console.error('[Password PUT]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
