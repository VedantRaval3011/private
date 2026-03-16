import { NextRequest, NextResponse } from 'next/server';
import { getApqrData } from '@/lib/apqr-utils';

/**
 * POST /api/apqr/finish-calc
 * Returns finish in-process data and columns for the Finish Calculation page.
 * Reuses getApqrData — no changes to apqr-utils.ts.
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

    const data = await getApqrData(productCode, year);

    return NextResponse.json({
      success: true,
      productCode,
      year,
      productName: data.product_name,
      genericName: data.generic_name,
      totalBatches: data.total_batches,
      batchSize: data.batch_size,
      finishInProcessData: data.finishInProcessData,
      finishInProcessColumns: data.finishInProcessColumns,
    });
  } catch (error: any) {
    console.error('Error fetching finish calc data:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch finish calculation data' },
      { status: 500 }
    );
  }
}
