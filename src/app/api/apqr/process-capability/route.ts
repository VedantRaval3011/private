import { NextRequest, NextResponse } from 'next/server';
import { getProcessCapabilitySummariesForProducts } from '@/lib/apqr-utils';

/**
 * POST /api/apqr/process-capability
 * Returns bulk/finish Cpk & Ppk per product code (same logic as APQR Sections 5.3.1–5.3.2).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { productCodes, year } = body;

    if (!Array.isArray(productCodes) || productCodes.length === 0) {
      return NextResponse.json(
        { error: 'productCodes array is required' },
        { status: 400 },
      );
    }

    const yearParsed = year === null || year === undefined || year === ''
      ? new Date().getFullYear()
      : (typeof year === 'string' ? parseInt(year, 10) : year);

    if (isNaN(yearParsed) || yearParsed < 2000 || yearParsed > 2100) {
      return NextResponse.json(
        { error: 'Invalid year' },
        { status: 400 },
      );
    }

    const summaries = await getProcessCapabilitySummariesForProducts(productCodes, yearParsed);

    return NextResponse.json({
      success: true,
      year: yearParsed,
      summaries,
    });
  } catch (error: any) {
    console.error('Error fetching process capability summaries:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch process capability data' },
      { status: 500 },
    );
  }
}
