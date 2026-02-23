/**
 * RM COA Upload API
 * POST: Upload and parse RM COA XML files
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import RMCOA from '@/models/RMCOA';
import type { RMCOAResponse, RMCOARecord } from '@/types/rmcoa';
import { parseRmCoaXml } from '@/lib/rmCoaParser';

export async function POST(request: NextRequest): Promise<NextResponse<RMCOAResponse>> {
    try {
        await connectToDatabase();

        const formData = await request.formData();
        const files = formData.getAll('files') as File[];

        if (!files || files.length === 0) {
            return NextResponse.json({
                success: false,
                message: 'No files provided',
                data: [],
                errors: ['No files were uploaded'],
            }, { status: 400 });
        }

        const allRecords: RMCOARecord[] = [];
        const errors: string[] = [];
        let processed = 0;
        let failed = 0;

        for (const file of files) {
            try {
                const content = await file.text();
                // Use the shared parser
                const record = await parseRmCoaXml(content, file.name);

                if (record) {
                    // Upsert record
                    try {
                        await RMCOA.findOneAndUpdate(
                            { arNo: record.arNo, materialCode: record.materialCode },
                            { $set: record },
                            { upsert: true, new: true }
                        );
                        allRecords.push(record);
                        processed++;
                    } catch (dbError) {
                        const errorMessage = dbError instanceof Error ? dbError.message : 'Database error';
                        errors.push(`${file.name}: ${errorMessage}`);
                    }
                } else {
                    errors.push(`${file.name}: No RM COA data found - XML structure may not match expected format`);
                    failed++;
                }
            } catch (fileError) {
                const errorMessage = fileError instanceof Error ? fileError.message : 'Unknown error';
                errors.push(`${file.name}: ${errorMessage}`);
                failed++;
            }
        }

        return NextResponse.json({
            success: processed > 0,
            message: processed > 0
                ? `Successfully processed ${processed} files with ${allRecords.length} records`
                : 'No files were successfully processed',
            data: allRecords,
            errors: errors.length > 0 ? errors : undefined,
        });

    } catch (error) {
        console.error('Error uploading RM COAs:', error);
        return NextResponse.json({
            success: false,
            message: error instanceof Error ? error.message : 'Unknown error',
            data: [],
            errors: [error instanceof Error ? error.message : 'Unknown error'],
        }, { status: 500 });
    }
}

