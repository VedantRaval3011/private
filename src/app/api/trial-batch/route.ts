/**
 * Trial Batch API
 *
 * GET    /api/trial-batch          — return all trial batch records
 * POST   /api/trial-batch          — mark a batch as trial   { batchNumber, itemCode }
 * DELETE /api/trial-batch          — unmark a batch          { batchNumber, itemCode }
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import TrialBatch from '@/models/TrialBatch';

export async function GET() {
  try {
    await connectToDatabase();
    const records = await TrialBatch.find({}, { batchNumber: 1, itemCode: 1, markedAt: 1, _id: 0 }).lean();
    return NextResponse.json({ success: true, data: records });
  } catch (error) {
    console.error('GET /api/trial-batch error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch trial batches' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await connectToDatabase();
    const { batchNumber, itemCode = '' } = await request.json();
    if (!batchNumber) {
      return NextResponse.json({ success: false, error: 'batchNumber is required' }, { status: 400 });
    }
    await TrialBatch.findOneAndUpdate(
      { batchNumber, itemCode },
      { $setOnInsert: { batchNumber, itemCode, markedAt: new Date() } },
      { upsert: true, new: true }
    );
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('POST /api/trial-batch error:', error);
    return NextResponse.json({ success: false, error: 'Failed to mark trial batch' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await connectToDatabase();
    const { batchNumber, itemCode = '' } = await request.json();
    if (!batchNumber) {
      return NextResponse.json({ success: false, error: 'batchNumber is required' }, { status: 400 });
    }
    await TrialBatch.deleteOne({ batchNumber, itemCode });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/trial-batch error:', error);
    return NextResponse.json({ success: false, error: 'Failed to unmark trial batch' }, { status: 500 });
  }
}
