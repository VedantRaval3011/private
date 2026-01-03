/**
 * COA API - Single Batch Route
 * GET: Retrieve both BULK and FINISH data for a specific batch
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import COA from '@/models/COA';
import type { BatchCOAResponse } from '@/types/coa';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ batchNumber: string }> }
): Promise<NextResponse<BatchCOAResponse>> {
  try {
    await connectToDatabase();
    
    const { batchNumber } = await params;
    
    if (!batchNumber) {
      return NextResponse.json({
        success: false,
        batchNumber: '',
        isComplete: false,
      }, { status: 400 });
    }
    
    // Find both BULK and FINISH records for this batch
    const records = await COA.find({ batchNumber }).lean();
    
    const bulk = records.find(r => r.stage === 'BULK');
    const finish = records.find(r => r.stage === 'FINISH');
    
    return NextResponse.json({
      success: true,
      batchNumber,
      bulk: bulk ? { ...bulk, _id: bulk._id.toString() } : undefined,
      finish: finish ? { ...finish, _id: finish._id.toString() } : undefined,
      isComplete: !!(bulk && finish),
    });
    
  } catch (error) {
    console.error('Error fetching batch COA:', error);
    return NextResponse.json({
      success: false,
      batchNumber: '',
      isComplete: false,
    }, { status: 500 });
  }
}
