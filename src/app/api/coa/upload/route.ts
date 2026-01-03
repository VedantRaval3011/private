/**
 * COA API - Upload Route
 * Handles XML file upload and parsing for BULK/FINISH COA data
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import COA from '@/models/COA';
import { parseCOAXml } from '@/lib/coaParser';
import type { COAUploadResponse, COARecord } from '@/types/coa';

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

export async function POST(request: NextRequest): Promise<NextResponse<COAUploadResponse>> {
  try {
    await connectToDatabase();
    
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];
    
    if (!files || files.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'No files provided',
        processed: 0,
        failed: 0,
        records: [],
        errors: ['No files were uploaded'],
      }, { status: 400 });
    }
    
    const records: COARecord[] = [];
    const errors: string[] = [];
    let processed = 0;
    let failed = 0;
    
    for (const file of files) {
      // Validate file size
      if (file.size > MAX_FILE_SIZE) {
        errors.push(`${file.name}: File too large (max 100MB)`);
        failed++;
        continue;
      }
      
      // Validate file type
      if (!file.name.toLowerCase().endsWith('.xml')) {
        errors.push(`${file.name}: Only XML files are accepted`);
        failed++;
        continue;
      }
      
      try {
        // Read file content
        let content: string;
        try {
          // Use file.text() which is optimized and avoids manual Buffer handling issues
          // This avoids the "offset out of range" error seen with Buffer.from(arrayBuffer)
          content = await file.text();
          if (file.size > 10 * 1024 * 1024) {
             console.log(`✅ Large COA file read successfully (${(content.length / 1024 / 1024).toFixed(1)}MB content)`);
          }
        } catch (readError) {
          console.error(`Error reading file ${file.name}:`, readError);
          throw new Error(`Failed to read file content: ${readError instanceof Error ? readError.message : 'Unknown error'}`);
        }
        const parseResult = await parseCOAXml(content, file.name);
        
        if (!parseResult.success || !parseResult.data) {
          errors.push(`${file.name}: ${parseResult.errors.join(', ')}`);
          failed++;
          continue;
        }
        
        const record = parseResult.data;
        
        // Check for existing record with same batch+stage
        const existingRecord = await COA.findOne({
          batchNumber: record.batchNumber,
          stage: record.stage,
        });
        
        if (existingRecord) {
          // Update existing record with new data (always update to allow re-parsing if logic changed)
          await COA.updateOne(
            { _id: existingRecord._id },
            { $set: record }
          );
          records.push({
            ...record,
            _id: existingRecord._id.toString(),
          });
          processed++;
          continue;
        }
        
        // Create new record
        const savedRecord = await COA.create(record);
        records.push({
          ...record,
          _id: savedRecord._id.toString(),
        });
        processed++;
        
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        errors.push(`${file.name}: ${message}`);
        failed++;
      }
    }
    
    return NextResponse.json({
      success: failed === 0,
      message: `Processed ${processed} files, ${failed} failed`,
      processed,
      failed,
      records,
      errors: errors.length > 0 ? errors : undefined,
    });
    
  } catch (error) {
    console.error('COA upload error:', error);
    return NextResponse.json({
      success: false,
      message: 'Server error during upload',
      processed: 0,
      failed: 0,
      records: [],
      errors: [error instanceof Error ? error.message : 'Unknown server error'],
    }, { status: 500 });
  }
}
