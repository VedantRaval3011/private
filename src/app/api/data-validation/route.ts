/**
 * Data Validation API - Batch Availability Validation
 * Validates batch data availability per section (Bulk, Finish, RM, PPM, PM)
 * Focuses on MFCs with 3+ batches
 * Supports loading one section at a time for better performance
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Formula from '@/models/Formula';
import Batch from '@/models/Batch';
import COA from '@/models/COA';
import Requisition from '@/models/Requisition';
import type {
  ValidationIssue,
  SectionType,
} from '@/types/validation';

interface SectionValidationResponse {
  success: boolean;
  message: string;
  section: SectionType;
  summary: {
    totalMFCs: number;
    totalBatches: number;
    batchesWithData: number;
    batchesMissingData: number;
  };
  issues: ValidationIssue[];
  batches: Array<{
    batchNumber: string;
    mfcNo: string;
    productName: string;
    hasData: boolean;
  }>;
}

/**
 * GET /api/data-validation
 * Validate batch availability for a specific section
 * Query params:
 *   - section: 'Bulk' | 'Finish' | 'RM' | 'PPM' | 'PM' (required)
 *   - minBatches: minimum batches per MFC (default: 3)
 */
export async function GET(request: NextRequest): Promise<NextResponse<SectionValidationResponse>> {
  try {
    await connectToDatabase();

    const { searchParams } = new URL(request.url);
    const section = searchParams.get('section') as SectionType;
    const minBatches = parseInt(searchParams.get('minBatches') || '3');

    // Validate section parameter
    const validSections: SectionType[] = ['Bulk', 'Finish', 'RM', 'PPM', 'PM'];
    if (!section || !validSections.includes(section)) {
      return NextResponse.json({
        success: false,
        message: `Invalid section. Must be one of: ${validSections.join(', ')}`,
        section: section || 'Bulk',
        summary: { totalMFCs: 0, totalBatches: 0, batchesWithData: 0, batchesMissingData: 0 },
        issues: [],
        batches: [],
      }, { status: 400 });
    }

    // Step 1: Get all formulas
    const formulas = await Formula.find({})
      .select('masterFormulaDetails.masterCardNo masterFormulaDetails.productCode masterFormulaDetails.productName fillingDetails.productCode processes.fillingProducts.productCode')
      .lean();

    // Step 2: Get batch counts per itemCode
    const batchAggregation = await Batch.aggregate([
      { $unwind: "$batches" },
      { $group: { _id: "$batches.itemCode", count: { $sum: 1 } } }
    ]);

    const batchCounts: Record<string, number> = batchAggregation.reduce((acc, curr) => {
      acc[curr._id] = curr.count;
      return acc;
    }, {} as Record<string, number>);

    // Step 3: Get all batch details
    const allBatches = await Batch.aggregate([
      { $unwind: "$batches" },
      { $project: {
        itemCode: "$batches.itemCode",
        batchNumber: "$batches.batchNumber",
        itemName: "$batches.itemName",
      }}
    ]);

    const batchesByItemCode: Record<string, Array<{ batchNumber: string; itemName: string }>> = {};
    allBatches.forEach(b => {
      if (!batchesByItemCode[b.itemCode]) batchesByItemCode[b.itemCode] = [];
      batchesByItemCode[b.itemCode].push({ batchNumber: b.batchNumber, itemName: b.itemName });
    });

    // Step 4: Get section-specific data
    let sectionDataByBatch: Record<string, boolean> = {};

    if (section === 'Bulk' || section === 'Finish') {
      // Query COA for Bulk/Finish
      const stage = section === 'Bulk' ? 'BULK' : 'FINISH';
      const coaRecords = await COA.find({ stage }).select('batchNumber').lean();
      coaRecords.forEach((coa: any) => {
        sectionDataByBatch[coa.batchNumber] = true;
      });
    } else {
      // Query Requisition for RM/PPM/PM
      const requisitions = await Requisition.find({})
        .select('batches.batchNumber batches.materials.materialType')
        .lean();
      
      requisitions.forEach((req: any) => {
        req.batches?.forEach((batch: any) => {
          const hasSection = batch.materials?.some((mat: any) => mat.materialType === section);
          if (hasSection) {
            sectionDataByBatch[batch.batchNumber] = true;
          }
        });
      });
    }

    // Step 5: Process MFCs with 3+ batches and generate issues
    const issues: ValidationIssue[] = [];
    const batchResults: Array<{ batchNumber: string; mfcNo: string; productName: string; hasData: boolean }> = [];
    let totalMFCs = 0;
    let totalBatches = 0;
    let batchesWithData = 0;
    let batchesMissingData = 0;

    formulas.forEach((formula: any) => {
      const mfcNo = formula.masterFormulaDetails?.masterCardNo || 'N/A';
      const productCode = formula.masterFormulaDetails?.productCode || '';
      const productName = formula.masterFormulaDetails?.productName || 'Unknown';

      // Collect all product codes for this MFC
      const productCodes: string[] = [];
      if (productCode) productCodes.push(productCode);

      formula.fillingDetails?.forEach((fd: any) => {
        if (fd.productCode && fd.productCode !== 'N/A' && !productCodes.includes(fd.productCode)) {
          productCodes.push(fd.productCode);
        }
      });

      formula.processes?.forEach((p: any) => {
        p.fillingProducts?.forEach((fp: any) => {
          if (fp.productCode && !productCodes.includes(fp.productCode)) {
            productCodes.push(fp.productCode);
          }
        });
      });

      // Calculate total batch count for this MFC
      let mfcBatchCount = 0;
      const mfcBatches: Array<{ batchNumber: string; itemName: string }> = [];

      productCodes.forEach(code => {
        const count = batchCounts[code] || 0;
        mfcBatchCount += count;
        const batches = batchesByItemCode[code] || [];
        mfcBatches.push(...batches);
      });

      // Only process MFCs with 3+ batches
      if (mfcBatchCount < minBatches) return;
      
      totalMFCs++;

      // Check each batch for this section
      mfcBatches.forEach(batch => {
        totalBatches++;
        const hasData = sectionDataByBatch[batch.batchNumber] || false;
        
        batchResults.push({
          batchNumber: batch.batchNumber,
          mfcNo,
          productName: batch.itemName || productName,
          hasData,
        });

        if (hasData) {
          batchesWithData++;
        } else {
          batchesMissingData++;
          
          // Generate issue message based on section
          let message = '';
          switch (section) {
            case 'Bulk':
              message = `With batch ${batch.batchNumber}, Bulk data was not available.`;
              break;
            case 'Finish':
              message = `With batch ${batch.batchNumber}, Finished Product data was missing.`;
              break;
            case 'RM':
              message = `With batch ${batch.batchNumber}, RM data was not found in the requisition.`;
              break;
            case 'PPM':
              message = `With batch ${batch.batchNumber}, PPM details were missing.`;
              break;
            case 'PM':
              message = `With batch ${batch.batchNumber}, PM data was not present.`;
              break;
          }

          issues.push({
            batchNumber: batch.batchNumber,
            mfcNo,
            productName: batch.itemName || productName,
            section,
            message,
          });
        }
      });
    });

    return NextResponse.json({
      success: true,
      message: `Validated ${section} data for ${totalBatches} batches across ${totalMFCs} MFCs`,
      section,
      summary: {
        totalMFCs,
        totalBatches,
        batchesWithData,
        batchesMissingData,
      },
      issues,
      batches: batchResults,
    });

  } catch (error) {
    console.error('Data validation error:', error);
    return NextResponse.json({
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
      section: 'Bulk',
      summary: { totalMFCs: 0, totalBatches: 0, batchesWithData: 0, batchesMissingData: 0 },
      issues: [],
      batches: [],
    }, { status: 500 });
  }
}
