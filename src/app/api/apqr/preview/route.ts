
import { NextRequest, NextResponse } from 'next/server';
import { getApqrData } from '@/lib/apqr-utils';

/**
 * POST /api/apqr/preview
 * Fetches the APQR data for preview data mapping (before generating file).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { productCode, year } = body;

    if (!productCode || !year) {
      return NextResponse.json(
        { error: 'Product code and year are required' },
        { status: 400 }
      );
    }
    
    // Get fetched and mapped data from utils
    const data = await getApqrData(productCode, year);
    
    return NextResponse.json(data);
    
  } catch (error: any) {
    console.error('Error fetching APQR preview data:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch APQR data' },
      { status: 500 }
    );
  }
}
