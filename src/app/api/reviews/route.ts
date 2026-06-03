import { NextResponse } from 'next/server';
import { loadReviewExcelCatalog } from '@/lib/review-excel';

export async function GET() {
  try {
    const { files, batchReviews, batchRowData } = await loadReviewExcelCatalog();

    return NextResponse.json({
      success: true,
      files,
      batchReviews,
      batchRowData,
    });
  } catch (error) {
    console.error('Error processing reviews:', error);
    return NextResponse.json(
      { success: false, message: 'Server error', files: [], batchReviews: {}, batchRowData: {} },
      { status: 500 },
    );
  }
}
