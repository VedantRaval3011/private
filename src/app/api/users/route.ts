import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import User from '@/models/User';
import { hashPassword, isAdminRole } from '@/lib/auth';
import { UserRole } from '@/types/auth';

// GET /api/users — list all users (admin, super-admin only)
export async function GET(request: NextRequest) {
  if (!isAdminRole(request.headers.get('x-user-role'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await connectToDatabase();
  const users = await User.find({}).select('-password').sort({ createdAt: -1 });
  return NextResponse.json({ users });
}

// POST /api/users — create user (admin, super-admin only)
export async function POST(request: NextRequest) {
  const callerRole = request.headers.get('x-user-role') as UserRole;
  if (!isAdminRole(callerRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { name, username, password, role } = await request.json();

    if (!name || !username || !password || !role) {
      return NextResponse.json(
        { error: 'All fields are required' },
        { status: 400 }
      );
    }

    // admin can only create employees; super-admin can create any role
    if (callerRole === 'admin' && role !== 'employee') {
      return NextResponse.json(
        { error: 'Admins can only create employee accounts' },
        { status: 403 }
      );
    }

    await connectToDatabase();

    const existing = await User.findOne({ username: username.toLowerCase().trim() });
    if (existing) {
      return NextResponse.json(
        { error: 'A user with this username already exists' },
        { status: 409 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 }
      );
    }

    const hashed = await hashPassword(password);
    const user = await User.create({
      name: name.trim(),
      username: username.toLowerCase().trim(),
      password: hashed,
      role,
      isActive: true,
    });

    return NextResponse.json(
      {
        user: {
          _id: user._id.toString(),
          name: user.name,
          username: user.username,
          role: user.role,
          isActive: user.isActive,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('[Users POST]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
