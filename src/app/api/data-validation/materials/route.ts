/**
 * Material Availability API
 * Checks which material codes from MFCs with 3+ batches are NOT available in Requisition
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Formula from '@/models/Formula';
import Batch from '@/models/Batch';
import Requisition from '@/models/Requisition';
import type { MaterialCategory } from '@/types/requisition';

interface MissingMaterial {
  materialCode: string;
  materialName: string;
  materialType: 'RM' | 'PM' | 'PPM';
  mfcNo: string;
  productName: string;
  batchNumber: string;
  message: string;
}

interface MaterialAvailabilityResponse {
  success: boolean;
  message: string;
  summary: {
    totalMFCs: number;
    totalBatches: number;
    totalMaterialsInMFC: number;
    totalMissingMaterials: number;
    missingByType: Record<string, number>;
  };
  missingMaterials: MissingMaterial[];
  // Group by material code to see which ones are frequently missing
  materialCodeSummary: Array<{
    materialCode: string;
    materialName: string;
    materialType: string;
    missingInBatches: number;
    batches: string[];
  }>;
}

export async function GET(request: NextRequest): Promise<NextResponse<MaterialAvailabilityResponse>> {
  try {
    await connectToDatabase();

    const { searchParams } = new URL(request.url);
    const minBatches = parseInt(searchParams.get('minBatches') || '3');
    const materialType = searchParams.get('type') as MaterialCategory | null; // Optional filter

    // Step 1: Get batch counts per itemCode
    const batchAggregation = await Batch.aggregate([
      { $unwind: "$batches" },
      { $group: { _id: "$batches.itemCode", count: { $sum: 1 } } }
    ]);

    const batchCounts: Record<string, number> = batchAggregation.reduce((acc, curr) => {
      acc[curr._id] = curr.count;
      return acc;
    }, {} as Record<string, number>);

    // Step 2: Get all batch numbers by itemCode
    const allBatches = await Batch.aggregate([
      { $unwind: "$batches" },
      { $project: { itemCode: "$batches.itemCode", batchNumber: "$batches.batchNumber" } }
    ]);

    const batchesByItemCode: Record<string, string[]> = {};
    allBatches.forEach(b => {
      if (!batchesByItemCode[b.itemCode]) batchesByItemCode[b.itemCode] = [];
      batchesByItemCode[b.itemCode].push(b.batchNumber);
    });

    // Step 3: Get all requisition materials indexed by batch + materialCode
    const requisitions = await Requisition.find({})
      .select('batches.batchNumber batches.materials.materialCode batches.materials.materialType')
      .lean();

    // Create lookup: batchNumber -> Set of materialCodes present
    const requisitionMaterials: Record<string, Set<string>> = {};
    requisitions.forEach((req: any) => {
      req.batches?.forEach((batch: any) => {
        if (!requisitionMaterials[batch.batchNumber]) {
          requisitionMaterials[batch.batchNumber] = new Set();
        }
        batch.materials?.forEach((mat: any) => {
          requisitionMaterials[batch.batchNumber].add(mat.materialCode);
        });
      });
    });

    // Step 4: Get formulas with materials
    const formulas = await Formula.find({})
      .select('masterFormulaDetails materials packingMaterials fillingDetails processes')
      .lean();

    // Step 5: Process each MFC with 3+ batches
    const missingMaterials: MissingMaterial[] = [];
    const materialCodeMap: Map<string, { code: string; name: string; type: string; batches: Set<string> }> = new Map();

    let totalMFCs = 0;
    let totalBatches = 0;
    let totalMaterialsInMFC = 0;

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
      const mfcBatchNumbers: string[] = [];

      productCodes.forEach(code => {
        const count = batchCounts[code] || 0;
        mfcBatchCount += count;
        const batches = batchesByItemCode[code] || [];
        mfcBatchNumbers.push(...batches);
      });

      // Only process MFCs with 3+ batches
      if (mfcBatchCount < minBatches) return;

      totalMFCs++;
      totalBatches += mfcBatchNumbers.length;

      // Collect all material codes from this MFC
      const mfcMaterials: Array<{ code: string; name: string; type: 'RM' | 'PM' | 'PPM' }> = [];

      // RM Materials (from materials array - MIXING)
      formula.materials?.forEach((mat: any) => {
        if (mat.materialCode) {
          mfcMaterials.push({ code: mat.materialCode, name: mat.materialName || '', type: 'RM' });
        }
      });

      // PM Materials (from packingMaterials array)
      formula.packingMaterials?.forEach((mat: any) => {
        if (mat.materialCode) {
          mfcMaterials.push({ code: mat.materialCode, name: mat.materialName || '', type: 'PM' });
        }
      });

      // PPM Materials (from fillingDetails.packingMaterials)
      formula.fillingDetails?.forEach((fd: any) => {
        fd.packingMaterials?.forEach((mat: any) => {
          if (mat.materialCode) {
            mfcMaterials.push({ code: mat.materialCode, name: mat.materialName || '', type: 'PPM' });
          }
        });
      });

      // Also check process materials
      formula.processes?.forEach((proc: any) => {
        proc.materials?.forEach((mat: any) => {
          if (mat.materialCode) {
            const type = mat.materialType === 'PM' ? 'PM' : mat.materialType === 'PPM' ? 'PPM' : 'RM';
            mfcMaterials.push({ code: mat.materialCode, name: mat.materialName || '', type: type as 'RM' | 'PM' | 'PPM' });
          }
        });

        proc.fillingProducts?.forEach((fp: any) => {
          fp.materials?.forEach((mat: any) => {
            if (mat.materialCode) {
              mfcMaterials.push({ code: mat.materialCode, name: mat.materialName || '', type: 'PPM' });
            }
          });
        });
      });

      totalMaterialsInMFC += mfcMaterials.length;

      // Check each batch for missing materials
      mfcBatchNumbers.forEach(batchNumber => {
        const requisitionCodes = requisitionMaterials[batchNumber] || new Set();

        mfcMaterials.forEach(mat => {
          // Apply type filter if provided
          if (materialType && mat.type !== materialType) return;

          // Check if material exists in requisition for this batch
          if (!requisitionCodes.has(mat.code)) {
            missingMaterials.push({
              materialCode: mat.code,
              materialName: mat.name,
              materialType: mat.type,
              mfcNo,
              productName,
              batchNumber,
              message: `Material ${mat.code} (${mat.name}) was not found in ${mat.type} requisition for batch ${batchNumber}`,
            });

            // Track for summary
            const key = `${mat.code}_${mat.type}`;
            if (!materialCodeMap.has(key)) {
              materialCodeMap.set(key, { code: mat.code, name: mat.name, type: mat.type, batches: new Set() });
            }
            materialCodeMap.get(key)!.batches.add(batchNumber);
          }
        });
      });
    });

    // Build summary by type
    const missingByType: Record<string, number> = { RM: 0, PPM: 0, PM: 0 };
    missingMaterials.forEach(m => {
      missingByType[m.materialType]++;
    });

    // Build material code summary
    const materialCodeSummary = Array.from(materialCodeMap.values())
      .map(item => ({
        materialCode: item.code,
        materialName: item.name,
        materialType: item.type,
        missingInBatches: item.batches.size,
        batches: Array.from(item.batches).slice(0, 10), // Limit to first 10 batches
      }))
      .sort((a, b) => b.missingInBatches - a.missingInBatches);

    return NextResponse.json({
      success: true,
      message: `Found ${missingMaterials.length} missing material entries across ${totalBatches} batches in ${totalMFCs} MFCs`,
      summary: {
        totalMFCs,
        totalBatches,
        totalMaterialsInMFC,
        totalMissingMaterials: missingMaterials.length,
        missingByType,
      },
      missingMaterials: missingMaterials.slice(0, 500), // Limit response size
      materialCodeSummary: materialCodeSummary.slice(0, 100), // Top 100 missing materials
    });

  } catch (error) {
    console.error('Material availability error:', error);
    return NextResponse.json({
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
      summary: { totalMFCs: 0, totalBatches: 0, totalMaterialsInMFC: 0, totalMissingMaterials: 0, missingByType: {} },
      missingMaterials: [],
      materialCodeSummary: [],
    }, { status: 500 });
  }
}
