/**
 * API Route: Get all batch items from database
 * Returns all successfully stored batch items for data verification
 */

import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Batch from '@/models/Batch';

export async function GET() {
  try {
    await connectToDatabase();
    
    // Get all batch documents with their items
    const batches = await Batch.find({})
      .select('fileName batches uploadedAt')
      .lean();
    
    // Flatten all batch items with their source file info
    const allItems: {
      batchNumber: string;
      itemCode: string;
      itemName: string;
      type: string;
      mfgDate: string;
      expiryDate: string;
      sourceFileName: string;
      processedAt: string;
    }[] = [];
    
    batches.forEach((batch: any) => {
      if (batch.batches && Array.isArray(batch.batches)) {
        batch.batches.forEach((item: any) => {
          allItems.push({
            batchNumber: item.batchNumber || 'N/A',
            itemCode: item.itemCode || 'N/A',
            itemName: item.itemName || 'N/A',
            type: item.type || 'Unknown',
            mfgDate: item.mfgDate || 'N/A',
            expiryDate: item.expiryDate || 'N/A',
            sourceFileName: batch.fileName,
            processedAt: batch.uploadedAt?.toISOString() || new Date().toISOString(),
          });
        });
      }
    });
    
    return NextResponse.json({
      success: true,
      data: allItems,
      total: allItems.length,
    });
  } catch (error) {
    console.error('Error fetching batch items:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch batch items' },
      { status: 500 }
    );
  }
}
