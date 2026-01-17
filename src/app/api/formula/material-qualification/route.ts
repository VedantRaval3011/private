/**
 * Material Qualification API - Fetch materials for qualified/unqualified batches
 * GET: Retrieve requisition materials for batches, grouped by AR Number
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Requisition from '@/models/Requisition';

interface MaterialQualItem {
  arNo: string;
  batchNumber: string;
  materialCode: string;
  materialName: string;
  materialType: string;
  quantityRequired: number;
  quantityToIssue: number;
  uom: string;
  mfcNo: string;
  itemName: string;
  make: string;
}

interface MaterialQualResponse {
  success: boolean;
  message: string;
  type: 'qualified' | 'unqualified';
  materials: MaterialQualItem[];
  stats: {
    totalArNumbers: number;
    totalBatches: number;
    totalMaterials: number;
  };
  groupedByArNo: Record<string, MaterialQualItem[]>;
}

export async function GET(request: NextRequest): Promise<NextResponse<MaterialQualResponse>> {
  try {
    await connectToDatabase();

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') as 'qualified' | 'unqualified';
    const batchNumbers = searchParams.get('batchNumbers'); // Comma-separated batch numbers

    if (!type || !['qualified', 'unqualified'].includes(type)) {
      return NextResponse.json({
        success: false,
        message: 'Invalid type. Must be qualified or unqualified',
        type: 'qualified',
        materials: [],
        stats: { totalArNumbers: 0, totalBatches: 0, totalMaterials: 0 },
        groupedByArNo: {},
      }, { status: 400 });
    }

    if (!batchNumbers) {
      return NextResponse.json({
        success: false,
        message: 'batchNumbers parameter is required',
        type,
        materials: [],
        stats: { totalArNumbers: 0, totalBatches: 0, totalMaterials: 0 },
        groupedByArNo: {},
      }, { status: 400 });
    }

    // Parse batch numbers
    const batchNumberList = batchNumbers.split(',').map(bn => bn.trim()).filter(bn => bn);
    
    if (batchNumberList.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No batch numbers provided',
        type,
        materials: [],
        stats: { totalArNumbers: 0, totalBatches: 0, totalMaterials: 0 },
        groupedByArNo: {},
      });
    }

    // Fetch requisition records that have these batch numbers
    const records = await Requisition.find({
      'batches.batchNumber': { $in: batchNumberList }
    })
      .select('batches make arNo locationCode')
      .lean();

    // Extract materials from matching batches
    const allMaterials: MaterialQualItem[] = [];
    const arNumbersSet = new Set<string>();
    const batchesSet = new Set<string>();

    records.forEach((record: any) => {
      const recordArNo = record.arNo || 'N/A';
      
      record.batches?.forEach((batch: any) => {
        // Only include batches that are in our list
        if (batch.batchNumber && batchNumberList.includes(batch.batchNumber)) {
          batchesSet.add(batch.batchNumber);
          
          batch.materials?.forEach((material: any) => {
            const arNo = material.arNo || batch.arNo || recordArNo;
            arNumbersSet.add(arNo);
            
            allMaterials.push({
              arNo,
              batchNumber: batch.batchNumber,
              materialCode: material.materialCode || 'N/A',
              materialName: material.materialName || 'N/A',
              materialType: material.materialType || 'RM',
              quantityRequired: material.quantityRequired || 0,
              quantityToIssue: material.quantityToIssue || 0,
              uom: material.uom || 'N/A',
              mfcNo: batch.mfcNo || material.mfcNo || 'N/A',
              itemName: batch.itemName || 'N/A',
              make: record.make || 'N/A',
            });
          });
        }
      });
    });

    // Sort by AR Number first, then by batch number
    allMaterials.sort((a, b) => {
      const arCompare = a.arNo.localeCompare(b.arNo);
      if (arCompare !== 0) return arCompare;
      return a.batchNumber.localeCompare(b.batchNumber);
    });

    // Group by AR Number
    const groupedByArNo: Record<string, MaterialQualItem[]> = {};
    allMaterials.forEach(material => {
      if (!groupedByArNo[material.arNo]) {
        groupedByArNo[material.arNo] = [];
      }
      groupedByArNo[material.arNo].push(material);
    });

    return NextResponse.json({
      success: true,
      message: `Found ${allMaterials.length} materials across ${batchesSet.size} batches for ${type} status`,
      type,
      materials: allMaterials,
      stats: {
        totalArNumbers: arNumbersSet.size,
        totalBatches: batchesSet.size,
        totalMaterials: allMaterials.length,
      },
      groupedByArNo,
    });

  } catch (error) {
    console.error('Error fetching material qualification data:', error);
    return NextResponse.json({
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
      type: 'qualified',
      materials: [],
      stats: { totalArNumbers: 0, totalBatches: 0, totalMaterials: 0 },
      groupedByArNo: {},
    }, { status: 500 });
  }
}
