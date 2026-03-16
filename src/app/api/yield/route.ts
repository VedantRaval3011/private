import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Yield from '@/models/Yield';

export async function GET(request: Request) {
  try {
    await connectToDatabase();

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const search = searchParams.get('search') || '';

    const skip = (page - 1) * limit;

    // Build query
    const query: any = {};
    if (search) {
      query.$or = [
        { productCode: { $regex: search, $options: 'i' } },
        { productName: { $regex: search, $options: 'i' } },
        { batchNo: { $regex: search, $options: 'i' } },
      ];
    }

    const [data, total] = await Promise.all([
      Yield.find(query)
        .sort({ uploadedAt: -1, mfgDate: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Yield.countDocuments(query),
    ]);

    return NextResponse.json({
      success: true,
      data,
      total,
      page,
      limit,
    });
  } catch (error) {
    console.error('Error fetching yields:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch yield data' },
      { status: 500 }
    );
  }
}
