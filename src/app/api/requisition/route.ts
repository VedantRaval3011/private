/**
 * Requisition API - Main Route
 * GET: Retrieve all requisitions with filtering
 * DELETE: Remove all requisitions
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Requisition from '@/models/Requisition';
import type { RequisitionResponse } from '@/types/requisition';

export async function GET(request: NextRequest): Promise<NextResponse<RequisitionResponse>> {
  try {
    await connectToDatabase();
    
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    const make = searchParams.get('make');
    const locationCode = searchParams.get('locationCode');
    const materialType = searchParams.get('materialType'); // RM, PPM, PM
    const limit = parseInt(searchParams.get('limit') || '100');
    const skip = parseInt(searchParams.get('skip') || '0');
    
    // Build query
    interface QueryFilter {
      make?: string;
      locationCode?: string;
      $or?: Array<Record<string, { $regex: string; $options: string }>>;
    }
    
    const query: QueryFilter = {};
    
    if (make) {
      query.make = make;
    }
    
    if (locationCode) {
      query.locationCode = locationCode;
    }
    
    if (search) {
      query.$or = [
        { 'batches.batchNumber': { $regex: search, $options: 'i' } },
        { 'batches.itemName': { $regex: search, $options: 'i' } },
        { 'batches.mfcNo': { $regex: search, $options: 'i' } },
        { 'batches.materials.materialName': { $regex: search, $options: 'i' } },
        { 'batches.materials.materialCode': { $regex: search, $options: 'i' } },
        { 'batches.materials.vendorCode': { $regex: search, $options: 'i' } },
        { 'batches.matReqNo': { $regex: search, $options: 'i' } },
      ];
    }
    
    // Get total count
    const totalCount = await Requisition.countDocuments(query);
    
    // Get records
    const records = await Requisition.find(query)
      .sort({ uploadedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
    
    // Process records to reconstruct flat arrays for UI compatibility
    const processedRecords = records.map(record => {
      const rawMaterials: any[] = [];
      const primaryPackaging: any[] = [];
      const packingMaterials: any[] = [];
      
      // Flatten all materials from all batches
      record.batches?.forEach((batch: any) => {
        batch.materials?.forEach((material: any) => {
          if (material.materialType === 'RM') rawMaterials.push(material);
          else if (material.materialType === 'PPM') primaryPackaging.push(material);
          else if (material.materialType === 'PM') packingMaterials.push(material);
        });
      });
      
      return {
        ...record,
        rawMaterials,
        primaryPackaging,
        packingMaterials
      };
    });
    
    // Filter by material type if specified (post-query filtering for aggregated data)
    let filteredRecords = processedRecords;
    if (materialType && ['RM', 'PPM', 'PM'].includes(materialType)) {
      filteredRecords = processedRecords.map(r => {
        const filtered = { ...r };
        if (materialType === 'RM') {
          filtered.primaryPackaging = [];
          filtered.packingMaterials = [];
        } else if (materialType === 'PPM') {
          filtered.rawMaterials = [];
          filtered.packingMaterials = [];
        } else if (materialType === 'PM') {
          filtered.rawMaterials = [];
          filtered.primaryPackaging = [];
        }
        return filtered;
      });
    }
    
    return NextResponse.json({
      success: true,
      message: `Found ${totalCount} requisition records`,
      data: filteredRecords.map(r => ({
        ...r,
        _id: r._id?.toString(),
      })),
      total: totalCount,
    });
    
  } catch (error) {
    console.error('Error fetching requisitions:', error);
    return NextResponse.json({
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
      data: [],
      total: 0,
    }, { status: 500 });
  }
}

export async function DELETE(): Promise<NextResponse<{ success: boolean; message: string; deletedCount?: number }>> {
  try {
    await connectToDatabase();
    
    const result = await Requisition.deleteMany({});
    
    return NextResponse.json({
      success: true,
      message: `Deleted ${result.deletedCount} requisition records`,
      deletedCount: result.deletedCount,
    });
    
  } catch (error) {
    console.error('Error deleting requisitions:', error);
    return NextResponse.json({
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
