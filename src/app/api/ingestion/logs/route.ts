/**
 * Processing Logs API Route
 * Retrieve processing history with pagination
 * Clean up orphaned logs
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import ProcessingLog from '@/models/ProcessingLog';
import Batch from '@/models/Batch';
import Formula from '@/models/Formula';
import type { ProcessingLogsResponse } from '@/types/ingestion';

/**
 * GET /api/ingestion/logs
 * Get processing log history with pagination
 */
export async function GET(request: NextRequest): Promise<NextResponse<ProcessingLogsResponse>> {
  try {
    await connectToDatabase();
    
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const status = searchParams.get('status'); // Optional filter
    const fileType = searchParams.get('fileType'); // Optional filter
    
    const skip = (page - 1) * limit;
    
    // Build query
    interface QueryFilter {
      status?: string;
      fileType?: string;
    }
    const query: QueryFilter = {};
    if (status) query.status = status;
    if (fileType) query.fileType = fileType;
    
    const [logs, total] = await Promise.all([
      ProcessingLog.find(query)
        .sort({ processedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      ProcessingLog.countDocuments(query),
    ]);
    
    return NextResponse.json({
      success: true,
      data: logs.map(log => ({
        ...log,
        _id: log._id?.toString(),
      })),
      total,
      page,
      limit,
    });
    
  } catch (error) {
    console.error('Processing logs error:', error);
    return NextResponse.json(
      {
        success: false,
        data: [],
        total: 0,
        page: 1,
        limit: 20,
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/ingestion/logs
 * Clean up orphaned processing logs (logs where the actual data has been deleted)
 * This allows re-ingestion of previously processed and then deleted files
 * 
 * Query params:
 * - deleteAll=true: Delete ALL processing logs (full reset)
 * - (default): Delete only orphaned logs
 */
export async function DELETE(request: NextRequest): Promise<NextResponse<{ success: boolean; message?: string; deletedCount?: number; error?: string }>> {
  try {
    await connectToDatabase();
    
    const { searchParams } = new URL(request.url);
    const deleteAll = searchParams.get('deleteAll') === 'true';
    
    // If deleteAll flag is set, delete ALL logs
    if (deleteAll) {
      const result = await ProcessingLog.deleteMany({});
      return NextResponse.json({
        success: true,
        message: `Deleted all ${result.deletedCount} processing log(s)`,
        deletedCount: result.deletedCount || 0,
      });
    }
    
    // Otherwise, clean up only orphaned logs
    // Get all processing logs with SUCCESS or DUPLICATE status (both can become orphaned)
    const logs = await ProcessingLog.find({ 
      status: { $in: ['SUCCESS', 'DUPLICATE'] } 
    }).lean();
    
    const orphanedLogIds: string[] = [];
    
    for (const log of logs) {
      const contentHash = log.contentHash;
      const fileName = log.fileName;
      const fileType = log.fileType;
      
      // Check if the corresponding record still exists
      // Try to find by contentHash first, then by fileName as fallback
      let recordExists = false;
      
      if (fileType === 'BATCH') {
        // Check by contentHash OR fileName
        const batch = await Batch.findOne({
          $or: [
            ...(contentHash ? [{ contentHash }] : []),
            ...(fileName ? [{ fileName }] : [])
          ]
        }).lean();
        recordExists = !!batch;
      } else if (fileType === 'FORMULA') {
        // Check by contentHash OR fileName
        const formula = await Formula.findOne({
          $or: [
            ...(contentHash ? [{ contentHash }] : []),
            ...(fileName ? [{ fileName }] : [])
          ]
        }).lean();
        recordExists = !!formula;
      }
      
      // If record doesn't exist, mark log as orphaned
      if (!recordExists && log._id) {
        orphanedLogIds.push(log._id.toString());
      }
    }
    
    // Delete orphaned logs
    let deletedCount = 0;
    if (orphanedLogIds.length > 0) {
      const result = await ProcessingLog.deleteMany({ 
        _id: { $in: orphanedLogIds } 
      });
      deletedCount = result.deletedCount || 0;
    }
    
    return NextResponse.json({
      success: true,
      message: `Cleaned up ${deletedCount} orphaned processing log(s)`,
      deletedCount,
    });
    
  } catch (error) {
    console.error('Cleanup processing logs error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

