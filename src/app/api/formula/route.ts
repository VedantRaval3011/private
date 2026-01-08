/**
 * Formula API Route
 * Handles XML file upload, parsing, and data retrieval
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Batch from '@/models/Batch';
import Formula from '@/models/Formula';
import Requisition from '@/models/Requisition';
import ProcessingLog from '@/models/ProcessingLog';
import { parseFormulaXml, validateXmlContent, createFormulaRecord } from '@/lib/xmlParser';
import { generateNormalizedHash } from '@/lib/contentHash';
import type { UploadResponse, FormulasListResponse } from '@/types/formula';

// Maximum file size: 10MB
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * POST /api/formula
 * Upload and parse an XML file
 */
export async function POST(request: NextRequest): Promise<NextResponse<UploadResponse>> {
  try {
    await connectToDatabase();

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    // Validate file presence
    if (!file) {
      return NextResponse.json(
        { success: false, message: 'No file uploaded', errors: ['Please select a file to upload'] },
        { status: 400 }
      );
    }

    // Validate file type
    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith('.xml')) {
      return NextResponse.json(
        { success: false, message: 'Invalid file type', errors: ['Only XML files are allowed'] },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, message: 'File too large', errors: ['Maximum file size is 10MB'] },
        { status: 400 }
      );
    }

    // Read file content
    const xmlContent = await file.text();

    // Validate XML structure
    const validation = validateXmlContent(xmlContent);
    if (!validation.valid) {
      return NextResponse.json(
        { success: false, message: 'Invalid XML', errors: [validation.error || 'XML validation failed'] },
        { status: 400 }
      );
    }

    // Parse XML content
    const parseResult = await parseFormulaXml(xmlContent);

    // Generate content hash for duplicate detection
    const contentHash = generateNormalizedHash(xmlContent);

    // Check if duplicate file (by hash)
    const existingLog = await ProcessingLog.findOne({ contentHash });
    if (existingLog) {
      return NextResponse.json(
        {
          success: false,
          message: 'This file has already been processed',
          errors: [`File "${file.name}" was already processed on ${existingLog.processedAt.toLocaleDateString()}`]
        },
        { status: 409 }
      );
    }

    if (!parseResult.success || !parseResult.data) {
      return NextResponse.json(
        {
          success: false,
          message: 'Failed to parse XML',
          errors: parseResult.errors
        },
        { status: 400 }
      );
    }

    // Create formula record
    const formulaRecord = createFormulaRecord(
      parseResult.data,
      file.name,
      file.size,
      xmlContent,
      parseResult.warnings
    );

    // Check for duplicate using masterCardNo (MFC number) which is the true unique identifier
    const masterCardNo = parseResult.data.masterFormulaDetails.masterCardNo?.trim();
    const productCode = parseResult.data.masterFormulaDetails.productCode;
    const revisionNo = parseResult.data.masterFormulaDetails.revisionNo || '0';

    // Primary check: By Master Card Number (MFC number)
    if (masterCardNo && masterCardNo !== 'N/A') {
      const existingByMfc = await Formula.findOne({
        'masterFormulaDetails.masterCardNo': masterCardNo,
      });

      if (existingByMfc) {
        return NextResponse.json(
          {
            success: false,
            message: 'Duplicate formula',
            errors: [`Formula with MFC number "${masterCardNo}" already exists`]
          },
          { status: 409 }
        );
      }
    }

    // Secondary check: By product code + revision (fallback)
    const existingByCode = await Formula.findOne({
      'masterFormulaDetails.productCode': productCode,
      'masterFormulaDetails.revisionNo': revisionNo,
    });

    if (existingByCode) {
      return NextResponse.json(
        {
          success: false,
          message: 'Duplicate formula',
          errors: [`Formula with product code "${productCode}" and revision "${revisionNo}" already exists`]
        },
        { status: 409 }
      );
    }

    // Save to database
    const formula = new Formula({
      ...formulaRecord,
      contentHash
    });
    await formula.save();

    // Create a processing log entry
    await ProcessingLog.create({
      contentHash,
      fileName: file.name,
      fileType: 'FORMULA',
      status: 'SUCCESS',
      fileSize: file.size
    });

    // Return success response
    return NextResponse.json({
      success: true,
      message: parseResult.warnings.length > 0
        ? 'Formula uploaded with warnings'
        : 'Formula uploaded successfully',
      data: {
        ...formulaRecord,
        _id: formula._id.toString(),
        rawXmlContent: undefined, // Don't return raw XML in response
      },
      errors: parseResult.warnings.length > 0 ? parseResult.warnings : undefined,
    });

  } catch (error) {
    console.error('Formula upload error:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'Server error',
        errors: [error instanceof Error ? error.message : 'Unknown error occurred']
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/formula
 * Retrieve list of formulas with pagination
 */
/**
 * GET /api/formula
 * Retrieve list of formulas with pagination
 * Features:
 * 1. Global Aggregation of Batch Counts
 * 2. Unmatched Batch Identification
 * 3. Sorting: Linked MFCs first, then recently uploaded
 */
export async function GET(request: NextRequest): Promise<NextResponse<FormulasListResponse>> {
  try {
    await connectToDatabase();

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const search = searchParams.get('search') || '';

    // Build query
    interface QueryFilter {
      $or?: Array<Record<string, { $regex: string; $options: string }>>;
    }
    const query: QueryFilter = {};
    if (search) {
      query.$or = [
        { 'masterFormulaDetails.productName': { $regex: search, $options: 'i' } },
        { 'masterFormulaDetails.productCode': { $regex: search, $options: 'i' } },
        { 'masterFormulaDetails.genericName': { $regex: search, $options: 'i' } },
      ];
    }

    // Step 1: Fetch ALL relevant formulas (lean) to perform efficient in-memory sorting
    // Note: If dataset grows > 10k, we must migrate to specific Aggregation Pipeline
    const formulas = await Formula.find(query)
      .select('-rawXmlContent')
      .lean();

    // Step 2: Global Batch Aggregation
    // Get ALL batch counts grouped by itemCode, also collect batch numbers
    const batchAggregation = await Batch.aggregate([
      { $unwind: "$batches" },
      {
        $group: {
          _id: "$batches.itemCode",
          count: { $sum: 1 },
          batchNumbers: { $addToSet: "$batches.batchNumber" }
        }
      }
    ]);

    const batchCounts: Record<string, number> = batchAggregation.reduce((acc, curr) => {
      acc[curr._id] = curr.count;
      return acc;
    }, {});

    // Map: itemCode -> array of batch numbers (for RM matching)
    const batchNumbersByItemCode: Record<string, string[]> = batchAggregation.reduce((acc, curr) => {
      acc[curr._id] = curr.batchNumbers || [];
      return acc;
    }, {} as Record<string, string[]>);

    // Step 2.5: Get batch numbers that have RM (Raw Material) requisition data
    // This is for the capsule indicator showing matched/unmatched RM data
    const batchesWithRMData = await Requisition.aggregate([
      { $unwind: "$batches" },
      { $unwind: "$batches.materials" },
      { $match: { "batches.materials.materialType": "RM" } },
      { $group: { _id: "$batches.batchNumber" } }
    ]);
    const rmBatchNumbers = new Set<string>(batchesWithRMData.map((b: { _id: string }) => b._id));

    // Step 3: Collect Formula Product Codes (Main + Filling) and calculate total batch counts
    const formulaProductCodes = new Set<string>();

    const enhancedFormulas = formulas.map((f: any) => {
      let hasBatch = false;
      let totalBatchCount = 0;
      const matchedCodes: string[] = [];
      const allBatchNumbers: string[] = []; // Collect all batch numbers for this formula

      // Check Main Product Code
      const mainCode = f.masterFormulaDetails?.productCode;
      if (mainCode) {
        formulaProductCodes.add(mainCode);
        if (batchCounts[mainCode] > 0) {
          hasBatch = true;
          totalBatchCount += batchCounts[mainCode];
          matchedCodes.push(mainCode);
          // Add batch numbers for this item code
          allBatchNumbers.push(...(batchNumbersByItemCode[mainCode] || []));
        }
      }

      // Check Filling Details Product Codes (Aseptic Filling + Labelling & Packing)
      if (f.fillingDetails && Array.isArray(f.fillingDetails)) {
        f.fillingDetails.forEach((fd: any) => {
          const fdCode = fd.productCode;
          if (fdCode && fdCode !== 'N/A' && !matchedCodes.includes(fdCode)) {
            formulaProductCodes.add(fdCode);
            if (batchCounts[fdCode] > 0) {
              hasBatch = true;
              totalBatchCount += batchCounts[fdCode];
              matchedCodes.push(fdCode);
              allBatchNumbers.push(...(batchNumbersByItemCode[fdCode] || []));
            }
          }
        });
      }

      // Check Filling Product Codes (processes)
      if (f.processes && Array.isArray(f.processes)) {
        f.processes.forEach((p: any) => {
          if (p.fillingProducts && Array.isArray(p.fillingProducts)) {
            p.fillingProducts.forEach((fp: any) => {
              const fpCode = fp.productCode;
              if (fpCode && !matchedCodes.includes(fpCode)) {
                formulaProductCodes.add(fpCode);
                if (batchCounts[fpCode] > 0) {
                  hasBatch = true;
                  totalBatchCount += batchCounts[fpCode];
                  matchedCodes.push(fpCode);
                  allBatchNumbers.push(...(batchNumbersByItemCode[fpCode] || []));
                }
              }
            });
          }
        });
      }

      // Step 3.5: Calculate RM Data matching for this formula
      // rmDataMatched = batch numbers that have RM requisition data
      // rmDataUnmatched = batch numbers that DON'T have RM requisition data
      const uniqueBatchNumbers = [...new Set(allBatchNumbers)];
      const rmDataMatched = uniqueBatchNumbers.filter(bn => rmBatchNumbers.has(bn)).length;
      const rmDataUnmatched = uniqueBatchNumbers.filter(bn => !rmBatchNumbers.has(bn)).length;

      return { ...f, hasBatch, totalBatchCount, rmDataMatched, rmDataUnmatched };

    });

    // Step 4: Identify Unmatched Batches
    // (Batches that exist but are NOT in the Formula Master list)
    const unmatchedBatches = batchAggregation
      .filter(b => !formulaProductCodes.has(b._id))
      .map(b => ({ itemCode: b._id, count: b.count }))
      .sort((a, b) => b.count - a.count); // Sort unmatched by count descending

    // Step 5: Sort Formulas
    // Priority 1: Total Batch Count (Higher = Better)
    // Priority 2: Has Any Batch
    // Priority 3: Uploaded At (Newest First)
    enhancedFormulas.sort((a, b) => {
      // Primary: Total Batch Count (Desc)
      if (a.totalBatchCount !== b.totalBatchCount) {
        return b.totalBatchCount - a.totalBatchCount;
      }

      // Secondary: Has Batch (Desc)
      if (a.hasBatch && !b.hasBatch) return -1;
      if (!a.hasBatch && b.hasBatch) return 1;

      // Tertiary: Uploaded Date (Desc)
      const dateA = new Date(a.uploadedAt).getTime();
      const dateB = new Date(b.uploadedAt).getTime();
      return dateB - dateA;
    });

    // Step 6: Pagination (Slice)
    const startIndex = (page - 1) * limit;
    const paginatedFormulas = enhancedFormulas.slice(startIndex, startIndex + limit);

    // Step 7: Calculate global RM matching totals for section headers
    const globalRmDataMatched = enhancedFormulas.reduce((sum, f) => sum + (f.rmDataMatched || 0), 0);
    const globalRmDataUnmatched = enhancedFormulas.reduce((sum, f) => sum + (f.rmDataUnmatched || 0), 0);

    return NextResponse.json({
      success: true,
      data: paginatedFormulas.map(f => {
        const { hasBatch, ...rest } = f;
        return {
          ...rest,
          _id: f._id.toString(),
          totalBatchCount: f.totalBatchCount,
          rmDataMatched: f.rmDataMatched || 0,     // Batches with RM requisition data
          rmDataUnmatched: f.rmDataUnmatched || 0, // Batches without RM requisition data
        };
      }),
      total: formulas.length,
      page,
      limit,
      batchCounts,
      unmatchedBatches,
      // Global RM data matching for section headers
      globalRmDataMatched,
      globalRmDataUnmatched,
      totalRmBatchesInSystem: rmBatchNumbers.size, // Total batches that have any RM requisition data
    });

  } catch (error) {
    console.error('Formula list error:', error);
    return NextResponse.json(
      {
        success: false,
        data: [],
        total: 0,
        page: 1,
        limit: 10
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/formula
 * Delete all formula records (for re-ingestion)
 */
export async function DELETE(): Promise<NextResponse<{ success: boolean; message: string; deletedCount?: number }>> {
  try {
    await connectToDatabase();

    // Delete all formula records
    const result = await Formula.deleteMany({});

    // Also clear processing logs for formula files
    await ProcessingLog.deleteMany({ fileType: 'FORMULA' });

    return NextResponse.json({
      success: true,
      message: `Deleted ${result.deletedCount} formula records. You can now re-ingest the XML file.`,
      deletedCount: result.deletedCount,
    });

  } catch (error) {
    console.error('Formula delete all error:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'Failed to delete formulas',
      },
      { status: 500 }
    );
  }
}
