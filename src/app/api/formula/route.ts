/**
 * Formula API Route
 * Handles XML file upload, parsing, and data retrieval
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Formula from '@/models/Formula';
import { parseFormulaXml, validateXmlContent, createFormulaRecord } from '@/lib/xmlParser';
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
    
    // Check for duplicate (same product code and revision)
    const productCode = parseResult.data.masterFormulaDetails.productCode;
    const revisionNo = parseResult.data.masterFormulaDetails.revisionNo || '1';
    
    const existing = await Formula.findOne({
      'masterFormulaDetails.productCode': productCode,
      'masterFormulaDetails.revisionNo': revisionNo,
    });
    
    if (existing) {
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
    const formula = new Formula(formulaRecord);
    await formula.save();
    
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
export async function GET(request: NextRequest): Promise<NextResponse<FormulasListResponse>> {
  try {
    await connectToDatabase();
    
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const search = searchParams.get('search') || '';
    
    const skip = (page - 1) * limit;
    
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
    
    // Fetch formulas
    const [formulas, total] = await Promise.all([
      Formula.find(query)
        .select('-rawXmlContent') // Exclude raw XML for list view
        .sort({ uploadedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Formula.countDocuments(query),
    ]);
    
    return NextResponse.json({
      success: true,
      data: formulas.map(f => ({
        ...f,
        _id: f._id.toString(),
      })),
      total,
      page,
      limit,
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
