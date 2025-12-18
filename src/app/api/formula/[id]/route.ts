/**
 * Formula Detail API Route
 * Retrieve specific formula by ID
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Formula from '@/models/Formula';
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
    
    const result = await Formula.findByIdAndDelete(id);
    
    if (!result) {
      return NextResponse.json(
        { success: false, error: 'Formula not found' },
        { status: 404 }
      );
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
