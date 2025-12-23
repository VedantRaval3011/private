/**
 * Formula Detail API Route
 * Retrieve specific formula by ID
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Formula from '@/models/Formula';
import ProcessingLog from '@/models/ProcessingLog';
import { generateNormalizedHash } from '@/lib/contentHash';
import type { FormulaDetailResponse } from '@/types/formula';

/**
 * GET /api/formula/[id]
 * Retrieve a specific formula by ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<FormulaDetailResponse>> {
  try {
    await connectToDatabase();
    
    const { id } = await params;
    
    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Formula ID is required' },
        { status: 400 }
      );
    }
    
    const formula = await Formula.findById(id).select('-rawXmlContent').lean();
    
    if (!formula) {
      return NextResponse.json(
        { success: false, error: 'Formula not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({
      success: true,
      data: {
        ...formula,
        _id: formula._id.toString(),
      },
    });
    
  } catch (error) {
    console.error('Formula detail error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/formula/[id]
 * Delete a specific formula
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<{ success: boolean; message?: string; error?: string }>> {
  try {
    await connectToDatabase();
    
    const { id } = await params;
    
    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Formula ID is required' },
        { status: 400 }
      );
    }
    
    // Find first to get contentHash
    const formula = await Formula.findById(id);
    
    if (!formula) {
      return NextResponse.json(
        { success: false, error: 'Formula not found' },
        { status: 404 }
      );
    }

    const contentHash = formula.contentHash || (formula.rawXmlContent ? generateNormalizedHash(formula.rawXmlContent) : null);
    const fileName = formula.fileName;

    // Delete the record
    await Formula.findByIdAndDelete(id);
    
    // Delete ALL processing log entries for this file so it can be re-ingested
    // This removes both SUCCESS and DUPLICATE logs that reference this file
    const deleteConditions = [];
    if (contentHash) {
      deleteConditions.push({ contentHash });
    }
    if (fileName) {
      // Delete by fileName regardless of fileType or status
      deleteConditions.push({ fileName });
    }
    
    if (deleteConditions.length > 0) {
      const deleteResult = await ProcessingLog.deleteMany({ $or: deleteConditions });
      console.log(`Deleted ${deleteResult.deletedCount} processing log(s) for formula: ${fileName}`);
    }
    
    return NextResponse.json({
      success: true,
      message: 'Formula deleted successfully',
    });
    
  } catch (error) {
    console.error('Formula delete error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
