import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import User from '@/models/User';
import { hashPassword } from '@/lib/auth';

// POST /api/seed — creates the initial super-admin (only if no users exist)
export async function POST() {
  try {
    await connectToDatabase();

    const count = await User.countDocuments();
    if (count > 0) {
      return NextResponse.json(
        { error: 'Seed already done. Users already exist.' },
        { status: 400 }
      );
    }

    const password = 'admin1234';
    const hashed = await hashPassword(password);

    const user = await User.create({
      name: 'Admin',
      username: 'admin',
      password: hashed,
      role: 'super-admin',
      isActive: true,
    });

    return NextResponse.json({
      message: 'Admin created successfully',
      credentials: {
        username: user.username,
        password,
        note: 'Change this password immediately after first login.',
      },
    });
  } catch (error) {
    console.error('[Seed]', error);
    return NextResponse.json({ error: 'Seed failed' }, { status: 500 });
  }
}
