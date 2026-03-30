import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import User from '@/models/User';
import { isAdminRole, getRequestContext } from '@/lib/auth';
import { UserRole } from '@/types/auth';

// GET /api/users/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { role: callerRole, userId: callerId } = getRequestContext(request);
  const { id } = await params;

  if (!isAdminRole(callerRole) && callerId !== id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await connectToDatabase();
  const user = await User.findById(id).select('-password');
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  return NextResponse.json({ user });
}

// PUT /api/users/[id] — update name, username, role, isActive
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
    const body = await request.json();
    const { name, username, role, isActive } = body;

    await connectToDatabase();
    const target = await User.findById(id);
    if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    // Only super-admin can change roles or activate/deactivate
    if ((role !== undefined || isActive !== undefined) && callerRole !== 'super-admin') {
      if (callerRole === 'admin') {
        if (target.role !== 'employee') {
          return NextResponse.json(
            { error: 'Admins can only manage employee accounts' },
            { status: 403 }
          );
        }
        if (role !== undefined && role !== target.role) {
          return NextResponse.json(
            { error: 'Admins cannot change user roles' },
            { status: 403 }
          );
        }
      } else {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    if (name) target.name = name.trim();
    if (username) {
      const conflict = await User.findOne({
        username: username.toLowerCase().trim(),
        _id: { $ne: id },
      });
      if (conflict) {
        return NextResponse.json(
          { error: 'Username already in use' },
          { status: 409 }
        );
      }
      target.username = username.toLowerCase().trim();
    }
    if (role !== undefined && callerRole === 'super-admin') target.role = role;
    if (isActive !== undefined && isAdmin) target.isActive = isActive;

    await target.save();

    return NextResponse.json({
      user: {
        _id: target._id.toString(),
        name: target.name,
        username: target.username,
        role: target.role,
        isActive: target.isActive,
        createdAt: target.createdAt,
        updatedAt: target.updatedAt,
      },
    });
  } catch (error) {
    console.error('[Users PUT]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/users/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { role: callerRole, userId: callerId } = getRequestContext(request);
  const { id } = await params;

  if (!isAdminRole(callerRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (callerId === id) {
    return NextResponse.json(
      { error: 'You cannot delete your own account' },
      { status: 400 }
    );
  }

  await connectToDatabase();
  const target = await User.findById(id);
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  // admin can only delete employees
  if (callerRole === 'admin' && target.role !== 'employee') {
    return NextResponse.json(
      { error: 'Admins can only delete employee accounts' },
      { status: 403 }
    );
  }

  await User.findByIdAndDelete(id);
  return NextResponse.json({ success: true });
}
