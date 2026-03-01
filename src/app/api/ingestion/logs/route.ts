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
import { COA } from '@/models/COA';
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
    const status = searchParams.get('status');
    const fileType = searchParams.get('fileType');

    const skip = (page - 1) * limit;

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
      { success: false, data: [], total: 0, page: 1, limit: 20 },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/ingestion/logs
 * Clean up processing logs to allow re-ingestion.
 *
 * Query params:
 * - deleteAll=true  : Delete ALL processing logs (full reset)
 * - fileType=COA    : Delete only logs of the given fileType (e.g. "COA", "BATCH", "FORMULA")
 * - (default)       : Delete only orphaned logs (data no longer exists in DB)
 */
export async function DELETE(
  request: NextRequest
): Promise<NextResponse<{ success: boolean; message?: string; deletedCount?: number; error?: string }>> {
  try {
    await connectToDatabase();

    const { searchParams } = new URL(request.url);
    const deleteAll = searchParams.get('deleteAll') === 'true';
    const fileTypeFilter = searchParams.get('fileType'); // e.g. "COA"

    // Delete ALL logs
    if (deleteAll) {
      const result = await ProcessingLog.deleteMany({});
      return NextResponse.json({
        success: true,
        message: `Deleted all ${result.deletedCount} processing log(s)`,
        deletedCount: result.deletedCount || 0,
      });
    }

    // Delete logs of a specific fileType (e.g. COA)
    if (fileTypeFilter) {
      const result = await ProcessingLog.deleteMany({ fileType: fileTypeFilter });
      return NextResponse.json({
        success: true,
        message: `Deleted ${result.deletedCount} ${fileTypeFilter} processing log(s)`,
        deletedCount: result.deletedCount || 0,
      });
    }

    // Default: delete only orphaned logs (where the actual data was removed from DB)
    const logs = await ProcessingLog.find({
      status: { $in: ['SUCCESS', 'DUPLICATE'] },
    }).lean();

    const orphanedLogIds: string[] = [];

    for (const log of logs) {
      const contentHash = log.contentHash;
      const fileName = log.fileName;
      const fileType = log.fileType;

      let recordExists = false;

      if (fileType === 'BATCH') {
        const batch = await Batch.findOne({
          $or: [
            ...(contentHash ? [{ contentHash }] : []),
            ...(fileName ? [{ fileName }] : []),
          ],
        }).lean();
        recordExists = !!batch;
      } else if (fileType === 'FORMULA') {
        const formula = await Formula.findOne({
          $or: [
            ...(contentHash ? [{ contentHash }] : []),
            ...(fileName ? [{ fileName }] : []),
          ],
        }).lean();
        recordExists = !!formula;
      } else if (fileType === 'COA') {
        // Check if the COA document (identified by contentHash) still exists
        const coa = contentHash
          ? await COA.findOne({ contentHash }).lean()
          : null;
        recordExists = !!coa;
      } else {
        // For RM_COA, REQUISITION, INWARD_REGISTER, etc. — keep the log unless explicitly deleted
        recordExists = true;
      }

      if (!recordExists && log._id) {
        orphanedLogIds.push(log._id.toString());
      }
    }

    let deletedCount = 0;
    if (orphanedLogIds.length > 0) {
      const result = await ProcessingLog.deleteMany({ _id: { $in: orphanedLogIds } });
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
