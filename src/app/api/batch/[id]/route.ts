/**
 * Batch API Route - Single Record Operations
 * GET /api/batch/[id] - Get a single batch record
 * DELETE /api/batch/[id] - Delete a batch record
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Batch from '@/models/Batch';
import ProcessingLog from '@/models/ProcessingLog';
import { generateNormalizedHash } from '@/lib/contentHash';

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
    
    // Find the record first to get its contentHash
    const batch = await Batch.findById(id);
    
    if (!batch) {
      return NextResponse.json(
        { success: false, error: 'Batch record not found' },
        { status: 404 }
      );
    }

    const contentHash = batch.contentHash || (batch.rawXmlContent ? generateNormalizedHash(batch.rawXmlContent) : null);
    const fileName = batch.fileName;

    // Delete the record
    await Batch.findByIdAndDelete(id);
    
    // Delete ALL processing log entries for this file so it can be re-ingested
    // This removes both SUCCESS and DUPLICATE logs that reference this file
    const deleteConditions = [];
    if (contentHash) {
      deleteConditions.push({ contentHash });
    }
    if (fileName) {
      // Delete by fileName regardless of fileType or status
      deleteConditions.push({ fileName });
    }
    
    if (deleteConditions.length > 0) {
      const deleteResult = await ProcessingLog.deleteMany({ $or: deleteConditions });
      console.log(`Deleted ${deleteResult.deletedCount} processing log(s) for batch: ${fileName}`);
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
