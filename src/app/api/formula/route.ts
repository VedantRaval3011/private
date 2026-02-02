/**
 * Formula API Route
 * Handles XML file upload, parsing, and data retrieval
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Batch from '@/models/Batch';
import Formula from '@/models/Formula';
import Requisition from '@/models/Requisition';
import RMCOA from '@/models/RMCOA';
import PMCOA from '@/models/PMCOA';
import PPMCOA from '@/models/PPMCOA';
import COA from '@/models/COA';
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
          batchNumbers: { $addToSet: "$batches.batchNumber" },  // Unique batch numbers
          allBatchNumbers: { $push: "$batches.batchNumber" }    // ALL batch numbers (with duplicates)
        }
      }
    ]);

    const batchCounts: Record<string, number> = batchAggregation.reduce((acc, curr) => {
      acc[curr._id] = curr.count;
      return acc;
    }, {});

    // Map: itemCode -> array of UNIQUE batch numbers (for RM matching)
    const batchNumbersByItemCode: Record<string, string[]> = batchAggregation.reduce((acc, curr) => {
      acc[curr._id] = curr.batchNumbers || [];
      return acc;
    }, {} as Record<string, string[]>);

    // Map: itemCode -> array of ALL batch numbers with duplicates (for Finish COA total batch calculation)
    const allBatchNumbersByItemCode: Record<string, string[]> = batchAggregation.reduce((acc, curr) => {
      acc[curr._id] = curr.allBatchNumbers || [];
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

    // Step 2.6: Get batch numbers that have PPM (Primary Packing Material) requisition data
    const batchesWithPPMData = await Requisition.aggregate([
      { $unwind: "$batches" },
      { $unwind: "$batches.materials" },
      { $match: { "batches.materials.materialType": "PPM" } },
      { $group: { _id: "$batches.batchNumber" } }
    ]);
    const ppmBatchNumbers = new Set<string>(batchesWithPPMData.map((b: { _id: string }) => b._id));

    // Step 2.7: Get batch numbers that have PM (Packing Material) requisition data
    const batchesWithPMData = await Requisition.aggregate([
      { $unwind: "$batches" },
      { $unwind: "$batches.materials" },
      { $match: { "batches.materials.materialType": "PM" } },
      { $group: { _id: "$batches.batchNumber" } }
    ]);
    const pmBatchNumbers = new Set<string>(batchesWithPMData.map((b: { _id: string }) => b._id));

    // Step 2.8: Get material codes that have RM COA data
    // This is for material qualification - comparing Formula Master materials against RM COA data
    // Green = materials with RM COA, Red = materials without RM COA
    const rmCoaMaterialCodes = await RMCOA.distinct('materialCode');
    const rmCoaMaterialCodeSet = new Set<string>(rmCoaMaterialCodes);

    // Also get all RM COA data for detailed view (material code -> AR numbers)
    const rmCoaData = await RMCOA.find({}).select('materialCode materialName arNo').lean();
    const rmCoaByMaterialCode: Record<string, { arNo: string; materialName: string }[]> = {};
    // Collect unique AR numbers for footer display
    const uniqueArNumbers = new Set<string>();
    rmCoaData.forEach((coa: any) => {
      if (!rmCoaByMaterialCode[coa.materialCode]) {
        rmCoaByMaterialCode[coa.materialCode] = [];
      }
      rmCoaByMaterialCode[coa.materialCode].push({ arNo: coa.arNo, materialName: coa.materialName });
      // Track unique AR numbers
      if (coa.arNo) {
        uniqueArNumbers.add(coa.arNo);
      }
    });

    // Step 2.9: Get material codes that have PM COA data
    const pmCoaMaterialCodes = await PMCOA.distinct('materialCode');
    const pmCoaMaterialCodeSet = new Set<string>(pmCoaMaterialCodes);

    // Step 2.10: Get material codes that have PPM COA data
    const ppmCoaMaterialCodes = await PPMCOA.distinct('materialCode');
    const ppmCoaMaterialCodeSet = new Set<string>(ppmCoaMaterialCodes);

    // Step 2.11: Get batch numbers that have Bulk COA data (stage='BULK')
    // This is for the Bulk COA capsule - checking if batches have Bulk stage COA records
    const bulkCoaBatchNumbers = await COA.distinct('batchNumber', { stage: 'BULK' });
    const bulkCoaBatchSet = new Set<string>(bulkCoaBatchNumbers);

    // Step 2.12: Get batch numbers that have Finish COA data (stage='FINISH')
    // This is for the Finish COA capsule - checking if batches have Finish stage COA records
    const finishCoaBatchNumbers = await COA.distinct('batchNumber', { stage: 'FINISH' });
    const finishCoaBatchSet = new Set<string>(finishCoaBatchNumbers);


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

      // Step 3.6: Calculate PPM Data matching for this formula (based on total batches, not unique)
      // For PPM and PM, we count all batch records, not just unique batches
      const ppmDataMatched = allBatchNumbers.filter(bn => ppmBatchNumbers.has(bn)).length;
      const ppmDataUnmatched = allBatchNumbers.filter(bn => !ppmBatchNumbers.has(bn)).length;

      // Step 3.7: Calculate PM Data matching for this formula (based on total batches, not unique)
      const pmDataMatched = allBatchNumbers.filter(bn => pmBatchNumbers.has(bn)).length;
      const pmDataUnmatched = allBatchNumbers.filter(bn => !pmBatchNumbers.has(bn)).length;

      // Step 3.8: Calculate Material Qualification for this formula
      // Extract all material codes defined in the Formula Master
      const formulaMaterialCodes = new Set<string>();

      // From main materials
      if (f.materials && Array.isArray(f.materials)) {
        f.materials.forEach((m: any) => {
          if (m.materialCode && m.materialCode !== 'N/A') {
            formulaMaterialCodes.add(m.materialCode);
          }
        });
      }

      // From filling details packing materials
      if (f.fillingDetails && Array.isArray(f.fillingDetails)) {
        f.fillingDetails.forEach((fd: any) => {
          if (fd.packingMaterials && Array.isArray(fd.packingMaterials)) {
            fd.packingMaterials.forEach((pm: any) => {
              if (pm.materialCode && pm.materialCode !== 'N/A') {
                formulaMaterialCodes.add(pm.materialCode);
              }
            });
          }
        });
      }

      // From processes materials
      if (f.processes && Array.isArray(f.processes)) {
        f.processes.forEach((p: any) => {
          if (p.materials && Array.isArray(p.materials)) {
            p.materials.forEach((m: any) => {
              if (m.materialCode && m.materialCode !== 'N/A') {
                formulaMaterialCodes.add(m.materialCode);
              }
            });
          }
          // From aseptic filling products materials
          if (p.fillingProducts && Array.isArray(p.fillingProducts)) {
            p.fillingProducts.forEach((fp: any) => {
              if (fp.materials && Array.isArray(fp.materials)) {
                fp.materials.forEach((m: any) => {
                  if (m.materialCode && m.materialCode !== 'N/A') {
                    formulaMaterialCodes.add(m.materialCode);
                  }
                });
              }
            });
          }
        });
      }

      // From packing materials
      if (f.packingMaterials && Array.isArray(f.packingMaterials)) {
        f.packingMaterials.forEach((pm: any) => {
          if (pm.materialCode && pm.materialCode !== 'N/A') {
            formulaMaterialCodes.add(pm.materialCode);
          }
        });
      }

      // For each batch, check if ALL Formula Master material codes have RM COA data
      // materialQualified = batches where ALL formula materials have RM COA
      // materialUnqualified = batches where some formula materials are missing RM COA
      let materialQualified = 0;
      let materialUnqualified = 0;

      // Count materials with and without RM COA
      const materialsWithRmCoa = [...formulaMaterialCodes].filter(code => rmCoaMaterialCodeSet.has(code)).length;
      const materialsWithoutRmCoa = formulaMaterialCodes.size - materialsWithRmCoa;

      // Calculate PM COA qualification (similar to RM COA)
      const materialsWithPmCoa = [...formulaMaterialCodes].filter(code => pmCoaMaterialCodeSet.has(code)).length;
      const materialsWithoutPmCoa = formulaMaterialCodes.size - materialsWithPmCoa;

      // Calculate PPM COA qualification (similar to RM COA)
      const materialsWithPpmCoa = [...formulaMaterialCodes].filter(code => ppmCoaMaterialCodeSet.has(code)).length;
      const materialsWithoutPpmCoa = formulaMaterialCodes.size - materialsWithPpmCoa;

      // Count batches based on COA qualification (similar to RM COA)
      let pmCoaQualified = 0;
      let pmCoaUnqualified = 0;
      let ppmCoaQualified = 0;
      let ppmCoaUnqualified = 0;

      if (formulaMaterialCodes.size > 0) {
        // Check each unique batch
        uniqueBatchNumbers.forEach(() => {
          // RM COA: If ALL formula materials have RM COA, batch is qualified
          if (materialsWithoutRmCoa === 0 && materialsWithRmCoa > 0) {
            materialQualified++;
          } else {
            materialUnqualified++;
          }

          // PM COA: If ALL formula materials have PM COA, batch is qualified
          if (materialsWithoutPmCoa === 0 && materialsWithPmCoa > 0) {
            pmCoaQualified++;
          } else {
            pmCoaUnqualified++;
          }

          // PPM COA: If ALL formula materials have PPM COA, batch is qualified
          if (materialsWithoutPpmCoa === 0 && materialsWithPpmCoa > 0) {
            ppmCoaQualified++;
          } else {
            ppmCoaUnqualified++;
          }
        });
      }


      return {
        ...f,
        hasBatch,
        totalBatchCount,
        rmDataMatched,
        rmDataUnmatched,
        ppmDataMatched,
        ppmDataUnmatched,
        pmDataMatched,
        pmDataUnmatched,
        materialQualified,
        materialUnqualified,
        pmCoaQualified,
        pmCoaUnqualified,
        ppmCoaQualified,
        ppmCoaUnqualified,
        formulaMaterialCount: formulaMaterialCodes.size,
        uniqueBatchNumbers,
        allBatchNumbers, // Total batches (with duplicates)
        finishCoaQualified: allBatchNumbers.filter(bn => finishCoaBatchSet.has(bn)).length,
        finishCoaUnqualified: allBatchNumbers.filter(bn => !finishCoaBatchSet.has(bn)).length,
        bulkCoaQualified: uniqueBatchNumbers.filter(bn => bulkCoaBatchSet.has(bn)).length,
        bulkCoaUnqualified: uniqueBatchNumbers.filter(bn => !bulkCoaBatchSet.has(bn)).length
      };

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
    // IMPORTANT: Collect all unique batch numbers across ALL formulas first (deduplicated)
    // This prevents double-counting when the same batch appears in multiple MFCs
    const allGlobalUniqueBatchNumbers = new Set<string>();
    enhancedFormulas.forEach(f => {
      (f.uniqueBatchNumbers || []).forEach((bn: string) => allGlobalUniqueBatchNumbers.add(bn));
    });

    // Calculate global RM counts from the deduplicated set
    const globalRmDataMatched = [...allGlobalUniqueBatchNumbers].filter(bn => rmBatchNumbers.has(bn)).length;
    const globalRmDataUnmatched = [...allGlobalUniqueBatchNumbers].filter(bn => !rmBatchNumbers.has(bn)).length;

    // Step 7.5: Calculate Material Qualification based on RM COA coverage
    // A batch is "qualified" if ALL its required formula materials have RM COA data
    const batchMaterialRequirements = new Map<string, Set<string>>();

    enhancedFormulas.forEach((f: any) => {
      // Extract all material codes from this formula
      const formulaMaterialCodes = new Set<string>();

      if (f.materials && Array.isArray(f.materials)) {
        f.materials.forEach((m: any) => {
          if (m.materialCode && m.materialCode !== 'N/A') {
            formulaMaterialCodes.add(m.materialCode);
          }
        });
      }
      if (f.fillingDetails && Array.isArray(f.fillingDetails)) {
        f.fillingDetails.forEach((fd: any) => {
          if (fd.packingMaterials && Array.isArray(fd.packingMaterials)) {
            fd.packingMaterials.forEach((pm: any) => {
              if (pm.materialCode && pm.materialCode !== 'N/A') {
                formulaMaterialCodes.add(pm.materialCode);
              }
            });
          }
        });
      }
      if (f.processes && Array.isArray(f.processes)) {
        f.processes.forEach((p: any) => {
          if (p.materials && Array.isArray(p.materials)) {
            p.materials.forEach((m: any) => {
              if (m.materialCode && m.materialCode !== 'N/A') {
                formulaMaterialCodes.add(m.materialCode);
              }
            });
          }
          if (p.fillingProducts && Array.isArray(p.fillingProducts)) {
            p.fillingProducts.forEach((fp: any) => {
              if (fp.materials && Array.isArray(fp.materials)) {
                fp.materials.forEach((m: any) => {
                  if (m.materialCode && m.materialCode !== 'N/A') {
                    formulaMaterialCodes.add(m.materialCode);
                  }
                });
              }
            });
          }
        });
      }
      if (f.packingMaterials && Array.isArray(f.packingMaterials)) {
        f.packingMaterials.forEach((pm: any) => {
          if (pm.materialCode && pm.materialCode !== 'N/A') {
            formulaMaterialCodes.add(pm.materialCode);
          }
        });
      }

      // Assign these material requirements to each batch of this formula
      if (formulaMaterialCodes.size > 0) {
        (f.uniqueBatchNumbers || []).forEach((bn: string) => {
          if (!batchMaterialRequirements.has(bn)) {
            batchMaterialRequirements.set(bn, new Set());
          }
          // Merge material requirements (a batch may be in multiple formulas)
          formulaMaterialCodes.forEach(code => batchMaterialRequirements.get(bn)!.add(code));
        });
      }
    });

    // Check each unique batch against RM COA material codes (not requisition)
    // A batch is qualified if ALL its required materials have RM COA data
    const materialQualifiedBatchNumbers = new Set<string>();
    batchMaterialRequirements.forEach((requiredMaterials, batchNum) => {
      // Check if ALL required materials have RM COA data
      let allFound = true;
      requiredMaterials.forEach(code => {
        if (!rmCoaMaterialCodeSet.has(code)) {
          allFound = false;
        }
      });

      // Batch is qualified only if ALL materials have RM COA and there is at least one RM COA
      if (allFound && rmCoaMaterialCodeSet.size > 0) {
        materialQualifiedBatchNumbers.add(batchNum);
      }
    });

    // Calculate global material qualification totals
    const globalMaterialQualified = materialQualifiedBatchNumbers.size;
    const globalMaterialUnqualified = allGlobalUniqueBatchNumbers.size - globalMaterialQualified;

    // DEBUG: Log batch set sizes
    console.log('BULK COA DEBUG:', {
      allGlobalUniqueBatchNumbers: allGlobalUniqueBatchNumbers.size,
      batchMaterialRequirements: batchMaterialRequirements.size,
      bulkCoaBatchSet: bulkCoaBatchSet.size,
      materialQualifiedBatchNumbers: materialQualifiedBatchNumbers.size,
    });

    return NextResponse.json({
      success: true,
      data: paginatedFormulas.map(f => {
        const { hasBatch, ...rest } = f;
        return {
          ...rest,
          _id: f._id.toString(),
          totalBatchCount: f.totalBatchCount,
          rmDataMatched: f.rmDataMatched || 0,
          rmDataUnmatched: f.rmDataUnmatched || 0,
          ppmDataMatched: f.ppmDataMatched || 0,
          ppmDataUnmatched: f.ppmDataUnmatched || 0,
          pmDataMatched: f.pmDataMatched || 0,
          pmDataUnmatched: f.pmDataUnmatched || 0,
          materialQualified: f.materialQualified || 0,
          materialUnqualified: f.materialUnqualified || 0,
          pmCoaQualified: f.pmCoaQualified || 0,
          pmCoaUnqualified: f.pmCoaUnqualified || 0,
          ppmCoaQualified: f.ppmCoaQualified || 0,
          ppmCoaUnqualified: f.ppmCoaUnqualified || 0,
          bulkCoaQualified: f.bulkCoaQualified || 0,
          bulkCoaUnqualified: f.bulkCoaUnqualified || 0,
          formulaMaterialCount: f.formulaMaterialCount || 0,
        };
      }),
      total: formulas.length,
      page,
      limit,
      batchCounts,
      unmatchedBatches,
      globalRmDataMatched,
      globalRmDataUnmatched,
      totalRmBatchesInSystem: rmBatchNumbers.size,
      rmBatchNumbersList: [...rmBatchNumbers],
      ppmBatchNumbersList: [...ppmBatchNumbers],
      pmBatchNumbersList: [...pmBatchNumbers],
      // Material Qualification batch numbers list (like rmBatchNumbersList but for material qualification)
      materialQualifiedBatchNumbersList: [...materialQualifiedBatchNumbers],
      // Global Material Qualification counts
      globalMaterialQualified,
      globalMaterialUnqualified,
      // Global PM COA counts (sum across all formulas)
      globalPmCoaQualified: enhancedFormulas.reduce((sum, f) => sum + (f.pmCoaQualified || 0), 0),
      globalPmCoaUnqualified: enhancedFormulas.reduce((sum, f) => sum + (f.pmCoaUnqualified || 0), 0),
      // Global PPM COA counts (sum across all formulas)
      globalPpmCoaQualified: enhancedFormulas.reduce((sum, f) => sum + (f.ppmCoaQualified || 0), 0),
      globalPpmCoaUnqualified: enhancedFormulas.reduce((sum, f) => sum + (f.ppmCoaUnqualified || 0), 0),
      // Global Bulk COA counts (based on batches WITH material requirements - same subset as RM COA)
      // batchMaterialRequirements.size should be 1286, not allGlobalUniqueBatchNumbers.size (1436+)
      globalBulkCoaQualified: [...batchMaterialRequirements.keys()].filter(bn => bulkCoaBatchSet.has(bn)).length,
      globalBulkCoaUnqualified: [...batchMaterialRequirements.keys()].filter(bn => !bulkCoaBatchSet.has(bn)).length,
      // List of batch numbers with Bulk COA data (for frontend section-specific calculation)
      bulkCoaQualifiedBatchNumbersList: [...batchMaterialRequirements.keys()].filter(bn => bulkCoaBatchSet.has(bn)),
      // Global Finish COA counts - calculated against TOTAL batches (not unique)
      // This ensures: globalFinishCoaQualified + globalFinishCoaUnqualified = total batch count
      // We use allBatchNumbersByItemCode which has ALL occurrences (with duplicates)
      globalFinishCoaQualified: (() => {
        let count = 0;
        // For each product code in formula, check EACH batch occurrence against finishCoaBatchSet
        formulaProductCodes.forEach(itemCode => {
          const batches = allBatchNumbersByItemCode[itemCode] || [];
          batches.forEach(bn => {
            if (finishCoaBatchSet.has(bn)) {
              count++;
            }
          });
        });
        return count;
      })(),
      globalFinishCoaUnqualified: (() => {
        let count = 0;
        // For each product code in formula, check EACH batch occurrence against finishCoaBatchSet
        formulaProductCodes.forEach(itemCode => {
          const batches = allBatchNumbersByItemCode[itemCode] || [];
          batches.forEach(bn => {
            if (!finishCoaBatchSet.has(bn)) {
              count++;
            }
          });
        });
        return count;
      })(),
      // Total batch count (for verification: qualified + unqualified should equal this)
      totalBatchCount: (() => {
        let total = 0;
        formulaProductCodes.forEach(itemCode => {
          total += batchCounts[itemCode] || 0;
        });
        return total;
      })(),
      // List of batch numbers with Finish COA data (for frontend section-specific calculation)
      finishCoaQualifiedBatchNumbersList: [...batchMaterialRequirements.keys()].filter(bn => finishCoaBatchSet.has(bn)),
      // All batch numbers list for frontend modal (with duplicates for total count matching)
      allBatchNumbersList: (() => {
        const allBatches: string[] = [];
        formulaProductCodes.forEach(itemCode => {
          const batches = allBatchNumbersByItemCode[itemCode] || [];
          allBatches.push(...batches);
        });
        return allBatches;
      })(),
      // RM COA material codes for frontend reference
      rmCoaMaterialCodes: [...rmCoaMaterialCodeSet],
      // Unique AR numbers count for RM COA footer display
      // Found: count of unique AR numbers available in RM COA collection
      // Missing: count of formula material codes that don't have RM COA coverage
      globalRmCoaUniqueArNumbersFound: uniqueArNumbers.size,
      // Calculate missing: get all formula material codes that don't have RM COA
      globalRmCoaUniqueArNumbersMissing: (() => {
        // Collect all unique material codes from all formulas
        const allFormulaMaterialCodes = new Set<string>();
        enhancedFormulas.forEach((f: any) => {
          if (f.materials && Array.isArray(f.materials)) {
            f.materials.forEach((m: any) => {
              if (m.materialCode && m.materialCode !== 'N/A') {
                allFormulaMaterialCodes.add(m.materialCode);
              }
            });
          }
          if (f.fillingDetails && Array.isArray(f.fillingDetails)) {
            f.fillingDetails.forEach((fd: any) => {
              if (fd.packingMaterials && Array.isArray(fd.packingMaterials)) {
                fd.packingMaterials.forEach((pm: any) => {
                  if (pm.materialCode && pm.materialCode !== 'N/A') {
                    allFormulaMaterialCodes.add(pm.materialCode);
                  }
                });
              }
            });
          }
          if (f.processes && Array.isArray(f.processes)) {
            f.processes.forEach((p: any) => {
              if (p.materials && Array.isArray(p.materials)) {
                p.materials.forEach((m: any) => {
                  if (m.materialCode && m.materialCode !== 'N/A') {
                    allFormulaMaterialCodes.add(m.materialCode);
                  }
                });
              }
              if (p.fillingProducts && Array.isArray(p.fillingProducts)) {
                p.fillingProducts.forEach((fp: any) => {
                  if (fp.materials && Array.isArray(fp.materials)) {
                    fp.materials.forEach((m: any) => {
                      if (m.materialCode && m.materialCode !== 'N/A') {
                        allFormulaMaterialCodes.add(m.materialCode);
                      }
                    });
                  }
                });
              }
            });
          }
          if (f.packingMaterials && Array.isArray(f.packingMaterials)) {
            f.packingMaterials.forEach((pm: any) => {
              if (pm.materialCode && pm.materialCode !== 'N/A') {
                allFormulaMaterialCodes.add(pm.materialCode);
              }
            });
          }
        });
        // Count how many formula material codes DON'T have RM COA
        let missingCount = 0;
        allFormulaMaterialCodes.forEach(code => {
          if (!rmCoaMaterialCodeSet.has(code)) {
            missingCount++;
          }
        });
        return missingCount;
      })(),
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
