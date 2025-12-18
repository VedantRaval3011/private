/**
 * Batch API Route
 * Handles Batch XML file upload, parsing, and data retrieval
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Batch from '@/models/Batch';
import { parseBatchRegistryXml, validateXmlContent } from '@/lib/xmlParser';
import type { BatchRegistryRecord } from '@/types/formula';

// Maximum file size: 10MB
const MAX_FILE_SIZE = 10 * 1024 * 1024;

// Response types
interface BatchUploadResponse {
  success: boolean;
  message: string;
  data?: BatchRegistryRecord;
  errors?: string[];
}

interface BatchListResponse {
  success: boolean;
  data: BatchRegistryRecord[];
  total: number;
  page: number;
  limit: number;
}

/**
 * POST /api/batch
 * Upload and parse a Batch XML file
 */
export async function POST(request: NextRequest): Promise<NextResponse<BatchUploadResponse>> {
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
    const parseResult = await parseBatchRegistryXml(xmlContent);
    
    if (!parseResult.success || !parseResult.data) {
      return NextResponse.json(
        { 
          success: false, 
          message: 'Failed to parse Batch XML', 
          errors: parseResult.errors 
        },
        { status: 400 }
      );
    }
    
    // Create batch record
    const batchRecord = {
      ...parseResult.data,
      fileName: file.name,
      fileSize: file.size,
      rawXmlContent: xmlContent,
      uploadedAt: new Date(),
      parsingStatus: parseResult.warnings.length > 0 ? 'partial' : 'success',
      parsingErrors: parseResult.warnings,
    };
    
    // Save to database
    const batch = new Batch(batchRecord);
    await batch.save();
    
    // Return success response
    return NextResponse.json({
      success: true,
      message: parseResult.warnings.length > 0 
        ? 'Batch data uploaded with warnings' 
        : 'Batch data uploaded successfully',
      data: {
        ...batchRecord,
        _id: batch._id.toString(),
        rawXmlContent: undefined, // Don't return raw XML in response
      } as BatchRegistryRecord,
      errors: parseResult.warnings.length > 0 ? parseResult.warnings : undefined,
    });
    
  } catch (error) {
    console.error('Batch upload error:', error);
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
 * GET /api/batch
 * Retrieve list of batch records with pagination
 */
export async function GET(request: NextRequest): Promise<NextResponse<BatchListResponse>> {
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
        { companyName: { $regex: search, $options: 'i' } },
        { 'batches.itemCode': { $regex: search, $options: 'i' } },
        { 'batches.itemName': { $regex: search, $options: 'i' } },
        { 'batches.batchNumber': { $regex: search, $options: 'i' } },
      ];
    }
    
    // Fetch batches
    const [batches, total] = await Promise.all([
      Batch.find(query)
        .select('-rawXmlContent') // Exclude raw XML for list view
        .sort({ uploadedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Batch.countDocuments(query),
    ]);
    
    return NextResponse.json({
      success: true,
      data: batches.map(b => ({
        ...b,
        _id: b._id.toString(),
      })) as BatchRegistryRecord[],
      total,
      page,
      limit,
    });
    
  } catch (error) {
    console.error('Batch list error:', error);
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
