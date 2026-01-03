/**
 * Batch API - Get batches by multiple product codes
 * Returns all batches matching any of the provided product codes
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Batch from '@/models/Batch';

interface BatchItem {
  batchNumber: string;
  itemCode: string;
  itemName: string;
  itemDetail: string;
  mfgDate: string;
  expiryDate: string;
  batchSize: string;
  unit: string;
  mfgLicNo: string;
  department: string;
  pack: string;
  type: string;
  year: string;
  make: string;
  locationId: string;
  mrpValue: string | null;
  conversionRatio: string;
  batchCompletionDate?: string;
  companyName: string;
  companyAddress: string;
  fileName: string;
  uploadedAt: Date;
}

interface BatchListResponse {
  success: boolean;
  data: BatchItem[];
  total: number;
  message?: string;
}

/**
 * POST /api/batch/by-codes
 * Get all batches for multiple product codes
 */
export async function POST(request: NextRequest): Promise<NextResponse<BatchListResponse>> {
  try {
    await connectToDatabase();
    
    const body = await request.json();
    const { productCodes } = body;
    
    if (!productCodes || !Array.isArray(productCodes) || productCodes.length === 0) {
      return NextResponse.json(
        { 
          success: false, 
          data: [], 
          total: 0,
          message: 'Product codes array is required' 
        },
        { status: 400 }
      );
    }
    
    // Find all batch documents that contain any of the product codes
    const batchDocuments = await Batch.find({
      'batches.itemCode': { $in: productCodes }
    })
    .select('batches companyName companyAddress fileName uploadedAt')
    .lean();
    
    // Extract and flatten all matching batch items
    const allBatches: BatchItem[] = [];
    
    batchDocuments.forEach(doc => {
      if (doc.batches && Array.isArray(doc.batches)) {
        doc.batches.forEach((batch: any) => {
          // Only include batches that match one of the requested product codes
          if (productCodes.includes(batch.itemCode)) {
            allBatches.push({
              batchNumber: batch.batchNumber || 'N/A',
              itemCode: batch.itemCode || 'N/A',
              itemName: batch.itemName || 'N/A',
              itemDetail: batch.itemDetail || 'N/A',
              mfgDate: batch.mfgDate || 'N/A',
              expiryDate: batch.expiryDate || 'N/A',
              batchSize: batch.batchSize || 'N/A',
              unit: batch.unit || 'N/A',
              mfgLicNo: batch.mfgLicNo || 'N/A',
              department: batch.department || 'N/A',
              pack: batch.pack || 'N/A',
              type: batch.type || 'N/A',
              year: batch.year || 'N/A',
              make: batch.make || 'N/A',
              locationId: batch.locationId || 'N/A',
              mrpValue: batch.mrpValue || null,
              conversionRatio: batch.conversionRatio || 'N/A',
              batchCompletionDate: batch.batchCompletionDate,
              companyName: doc.companyName || 'N/A',
              companyAddress: doc.companyAddress || 'N/A',
              fileName: doc.fileName || 'N/A',
              uploadedAt: doc.uploadedAt || new Date(),
            });
          }
        });
      }
    });
    
    // Sort by manufacturing date (newest first)
    allBatches.sort((a, b) => {
      const dateA = new Date(a.mfgDate);
      const dateB = new Date(b.mfgDate);
      return dateB.getTime() - dateA.getTime();
    });
    
    return NextResponse.json({
      success: true,
      data: allBatches,
      total: allBatches.length,
    });
    
  } catch (error) {
    console.error('Error fetching batches by codes:', error);
    return NextResponse.json(
      { 
        success: false, 
        data: [], 
        total: 0,
        message: error instanceof Error ? error.message : 'Unknown error occurred'
      },
      { status: 500 }
    );
  }
}
