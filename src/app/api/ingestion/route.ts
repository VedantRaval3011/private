/**
 * Ingestion API Route
 * Handles triggering ingestion and returning status
 */

import { NextRequest, NextResponse } from 'next/server';
import { runIngestion, scanFilesFolder } from '@/lib/ingestionService';
import { connectToDatabase } from '@/lib/mongodb';
import ProcessingLog from '@/models/ProcessingLog';
import type { IngestionResponse, IngestionStatus } from '@/types/ingestion';

/**
 * GET /api/ingestion
 * Get current ingestion status and file list
 */
export async function GET(): Promise<NextResponse<IngestionResponse>> {
  try {
    await connectToDatabase();
    
    // Get files in folder
    const files = await scanFilesFolder();
    
    // Get recent processing stats
    const [successCount, duplicateCount, errorCount] = await Promise.all([
      ProcessingLog.countDocuments({ status: 'SUCCESS' }),
      ProcessingLog.countDocuments({ status: 'DUPLICATE' }),
      ProcessingLog.countDocuments({ status: 'ERROR' }),
    ]);
    
    const status: IngestionStatus = {
      isProcessing: false,
      totalFiles: files.length,
      processed: successCount + duplicateCount + errorCount,
      successful: successCount,
      duplicates: duplicateCount,
      errors: errorCount,
      results: files.map(f => ({
        fileName: f.fileName,
        fileType: 'UNKNOWN',
        status: 'SUCCESS',
        message: `File pending: ${f.fileName}`,
      })),
    };
    
    return NextResponse.json({
      success: true,
      message: `Found ${files.length} XML files in /files folder`,
      status,
    });
    
  } catch (error) {
    console.error('Ingestion status error:', error);
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
        status: {
          isProcessing: false,
          totalFiles: 0,
          processed: 0,
          successful: 0,
          duplicates: 0,
          errors: 0,
          results: [],
        },
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/ingestion
 * Trigger ingestion of files from /files folder
 */
export async function POST(): Promise<NextResponse<IngestionResponse>> {
  try {
    // Run full ingestion
    const status = await runIngestion();
    
    return NextResponse.json({
      success: true,
      message: `Processed ${status.processed} files: ${status.successful} successful, ${status.duplicates} duplicates, ${status.errors} errors`,
      status,
    });
    
  } catch (error) {
    console.error('Ingestion error:', error);
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
        status: {
          isProcessing: false,
          totalFiles: 0,
          processed: 0,
          successful: 0,
          duplicates: 0,
          errors: 0,
          results: [],
        },
      },
      { status: 500 }
    );
  }
}
