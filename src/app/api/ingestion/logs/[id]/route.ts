/**
 * Individual Processing Log API Route
 * Delete a single processing log by ID
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import ProcessingLog from '@/models/ProcessingLog';
import mongoose from 'mongoose';

/**
 * DELETE /api/ingestion/logs/[id]
 * Delete a single processing log by its MongoDB _id
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<{ success: boolean; message?: string; error?: string }>> {
  try {
    await connectToDatabase();

    const { id } = await params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid log ID' },
        { status: 400 }
      );
    }

    const result = await ProcessingLog.deleteOne({ _id: id });

    if (result.deletedCount === 0) {
      return NextResponse.json(
        { success: false, error: 'Log not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Processing log deleted successfully',
    });
  } catch (error) {
    console.error('Delete single processing log error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
