/**
 * Batch API Route - Single Record Operations
 * GET /api/batch/[id] - Get a single batch record
 * DELETE /api/batch/[id] - Delete a batch record
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Batch from '@/models/Batch';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/batch/[id]
 * Retrieve a single batch record by ID
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    await connectToDatabase();
    const { id } = await params;
    
    const batch = await Batch.findById(id).select('-rawXmlContent').lean();
    
    if (!batch) {
      return NextResponse.json(
        { success: false, error: 'Batch record not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({
      success: true,
      data: {
        ...batch,
        _id: batch._id.toString(),
      },
    });
    
  } catch (error) {
    console.error('Get batch error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to retrieve batch record' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/batch/[id]
 * Delete a batch record by ID
 */
export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    await connectToDatabase();
    const { id } = await params;
    
    const result = await Batch.findByIdAndDelete(id);
    
    if (!result) {
      return NextResponse.json(
        { success: false, error: 'Batch record not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({
      success: true,
      message: 'Batch record deleted successfully',
    });
    
  } catch (error) {
    console.error('Delete batch error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete batch record' },
      { status: 500 }
    );
  }
}
