import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import ProductMaster from '@/models/ProductMaster';

export async function GET(request: Request) {
  try {
    await connectToDatabase();
    
    // Get query parameters for potential filtering/pagination
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const search = searchParams.get('search') || '';
    
    const skip = (page - 1) * limit;
    
    let query: any = {};
    if (search) {
      const searchRegex = new RegExp(search, 'i');
      query = {
        $or: [
          { productCode: searchRegex },
          { productName: searchRegex },
          { masterCardNo: searchRegex },
          { therapeuticCategory: searchRegex },
          { department: searchRegex }
        ]
      };
    }
    
    const [data, total] = await Promise.all([
      ProductMaster.find(query)
        .sort({ productName: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      ProductMaster.countDocuments(query)
    ]);
    
    return NextResponse.json({
      success: true,
      data,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    });
    
  } catch (error) {
    console.error('Error fetching Product Master data:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch data' },
      { status: 500 }
    );
  }
}
