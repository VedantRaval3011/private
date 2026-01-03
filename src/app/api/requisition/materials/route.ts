/**
 * Requisition Materials API - Load one section at a time
 * GET: Retrieve materials by type (RM, PPM, or PM) for faster loading
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Requisition from '@/models/Requisition';
import type { RequisitionMaterial, MaterialCategory } from '@/types/requisition';

interface MaterialResponse {
  success: boolean;
  message: string;
  materialType: MaterialCategory;
  materials: RequisitionMaterial[];
  stats: {
    totalBatches: number;
    totalMaterials: number;
    totalQtyRequired: number;
    totalQtyToIssue: number;
    mismatchCount: number;
  };
}

export async function GET(request: NextRequest): Promise<NextResponse<MaterialResponse>> {
  try {
    await connectToDatabase();

    const { searchParams } = new URL(request.url);
    const materialType = searchParams.get('type') as MaterialCategory;
    const search = searchParams.get('search') || '';
    const make = searchParams.get('make') || '';
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '100');

    // Validate material type
    if (!materialType || !['RM', 'PPM', 'PM'].includes(materialType)) {
      return NextResponse.json({
        success: false,
        message: 'Invalid material type. Must be RM, PPM, or PM',
        materialType: materialType || 'RM',
        materials: [],
        stats: { totalBatches: 0, totalMaterials: 0, totalQtyRequired: 0, totalQtyToIssue: 0, mismatchCount: 0 },
      }, { status: 400 });
    }

    // Build query - only select required fields for performance
    interface QueryFilter {
      make?: string;
      $or?: Array<Record<string, { $regex: string; $options: string }>>;
    }

    const query: QueryFilter = {};
    if (make && make !== 'ALL') {
      query.make = make;
    }

    if (search) {
      query.$or = [
        { 'batches.batchNumber': { $regex: search, $options: 'i' } },
        { 'batches.itemName': { $regex: search, $options: 'i' } },
        { 'batches.mfcNo': { $regex: search, $options: 'i' } },
        { 'batches.materials.materialName': { $regex: search, $options: 'i' } },
        { 'batches.materials.materialCode': { $regex: search, $options: 'i' } },
      ];
    }

    // Fetch records with only required fields for this material type
    const records = await Requisition.find(query)
      .select('batches make locationCode')
      .sort({ uploadedAt: -1 })
      .lean();

    // Extract only materials of the requested type
    const allMaterials: RequisitionMaterial[] = [];
    const batchesSet = new Set<string>();

    records.forEach((record: any) => {
      record.batches?.forEach((batch: any) => {
        batch.materials?.forEach((material: any) => {
          if (material.materialType === materialType) {
            // Include batch context info
            allMaterials.push({
              ...material,
              batchNumber: batch.batchNumber || material.batchNumber,
              mfcNo: batch.mfcNo || material.mfcNo,
              itemName: batch.itemName || material.itemName,
            });
            batchesSet.add(batch.batchNumber);
          }
        });
      });
    });

    // Calculate stats
    const totalQtyRequired = allMaterials.reduce((sum, m) => sum + (m.quantityRequired || 0), 0);
    const totalQtyToIssue = allMaterials.reduce((sum, m) => sum + (m.quantityToIssue || 0), 0);
    const mismatchCount = allMaterials.filter(m => m.validationStatus === 'mismatch').length;

    // Apply pagination
    const startIndex = (page - 1) * pageSize;
    const paginatedMaterials = allMaterials.slice(startIndex, startIndex + pageSize);

    return NextResponse.json({
      success: true,
      message: `Found ${allMaterials.length} ${materialType} materials across ${batchesSet.size} batches`,
      materialType,
      materials: paginatedMaterials,
      stats: {
        totalBatches: batchesSet.size,
        totalMaterials: allMaterials.length,
        totalQtyRequired,
        totalQtyToIssue,
        mismatchCount,
      },
    });

  } catch (error) {
    console.error('Error fetching materials:', error);
    return NextResponse.json({
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
      materialType: 'RM',
      materials: [],
      stats: { totalBatches: 0, totalMaterials: 0, totalQtyRequired: 0, totalQtyToIssue: 0, mismatchCount: 0 },
    }, { status: 500 });
  }
}
