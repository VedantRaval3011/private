/**
 * COA API - Main Route
 * GET: Retrieve all COAs with filtering
 * DELETE: Remove all COAs
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import COA from '@/models/COA';
import type { COAListResponse } from '@/types/coa';

export async function GET(request: NextRequest): Promise<NextResponse<COAListResponse>> {
  try {
    await connectToDatabase();
    
    const { searchParams } = new URL(request.url);
    const stage = searchParams.get('stage'); // BULK or FINISH
    const search = searchParams.get('search');
    const manufacturer = searchParams.get('manufacturer');
    const limit = parseInt(searchParams.get('limit') || '100');
    const skip = parseInt(searchParams.get('skip') || '0');
    
    // Build query
    interface QueryFilter {
      stage?: string;
      manufacturer?: string;
      $or?: Array<Record<string, { $regex: string; $options: string }>>;
    }
    
    const query: QueryFilter = {};
    
    if (stage && (stage === 'BULK' || stage === 'FINISH')) {
      query.stage = stage;
    }
    
    if (manufacturer) {
      query.manufacturer = manufacturer;
    }
    
    if (search) {
      query.$or = [
        { batchNumber: { $regex: search, $options: 'i' } },
        { productName: { $regex: search, $options: 'i' } },
        { arNumber: { $regex: search, $options: 'i' } },
      ];
    }
    
    // Get total counts
    const totalCount = await COA.countDocuments(query);
    const bulkCount = await COA.countDocuments({ ...query, stage: 'BULK' });
    const finishCount = await COA.countDocuments({ ...query, stage: 'FINISH' });
    
    // Find batches that have both BULK and FINISH records
    const linkedBatchesAgg = await COA.aggregate([
      { $match: query },
      { $group: { _id: '$batchNumber', stages: { $addToSet: '$stage' } } },
      { $match: { stages: { $size: 2 } } }, // Has both BULK and FINISH
      { $count: 'count' }
    ]);
    const linkedBatches = linkedBatchesAgg[0]?.count || 0;
    
    // Get records
    const records = await COA.find(query)
      .sort({ batchNumber: 1, stage: 1 })
      .skip(skip)
      .limit(limit)
      .lean();
    
    return NextResponse.json({
      success: true,
      data: records.map(r => ({
        ...r,
        _id: r._id.toString(),
      })),
      total: totalCount,
      bulkCount,
      finishCount,
      linkedBatches,
    });
    
  } catch (error) {
    console.error('Error fetching COAs:', error);
    return NextResponse.json({
      success: false,
      data: [],
      total: 0,
      bulkCount: 0,
      finishCount: 0,
      linkedBatches: 0,
    }, { status: 500 });
  }
}

export async function DELETE(): Promise<NextResponse<{ success: boolean; message: string; deletedCount?: number }>> {
  try {
    await connectToDatabase();
    
    const result = await COA.deleteMany({});
    
    return NextResponse.json({
      success: true,
      message: `Deleted ${result.deletedCount} COA records`,
      deletedCount: result.deletedCount,
    });
    
  } catch (error) {
    console.error('Error deleting COAs:', error);
    return NextResponse.json({
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
