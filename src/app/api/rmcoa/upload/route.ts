/**
 * RM COA Upload API
 * POST: Upload and parse RM COA XML files
 * 
 * Note: This is a placeholder parser. When sample XML files are available,
 * the parsing logic should be updated to match the actual XML structure.
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import RMCOA from '@/models/RMCOA';
import type { RMCOAUploadResponse, RMCOARecord } from '@/types/rmcoa';
import crypto from 'crypto';

// Placeholder XML parser - to be updated when sample XML is available
async function parseRMCOAXml(xmlContent: string, fileName: string): Promise<RMCOARecord[]> {
    const records: RMCOARecord[] = [];

    // TODO: Implement actual XML parsing when sample files are available
    // For now, this is a basic placeholder that looks for common patterns

    // Simple regex-based extraction (placeholder)
    // Expected structure might include: ARNO, MATERIALCODE, MATERIALNAME, etc.
    const arNoMatch = xmlContent.match(/<ARNO?>([^<]+)<\/ARNO?>/gi);
    const materialCodeMatch = xmlContent.match(/<(?:MATERIAL_?CODE|ITEMCODE)>([^<]+)<\/(?:MATERIAL_?CODE|ITEMCODE)>/gi);
    const materialNameMatch = xmlContent.match(/<(?:MATERIAL_?NAME|ITEMNAME)>([^<]+)<\/(?:MATERIAL_?NAME|ITEMNAME)>/gi);

    // If we found matching data, create a record
    if (arNoMatch && materialCodeMatch && materialNameMatch) {
        const contentHash = crypto.createHash('md5').update(xmlContent).digest('hex');

        // Extract values
        const arNo = arNoMatch[0]?.replace(/<[^>]+>/g, '').trim() || '';
        const materialCode = materialCodeMatch[0]?.replace(/<[^>]+>/g, '').trim() || '';
        const materialName = materialNameMatch[0]?.replace(/<[^>]+>/g, '').trim() || '';

        if (arNo && materialCode) {
            records.push({
                arNo,
                materialCode,
                materialName: materialName || 'Unknown',
                sourceFile: fileName,
                uploadedAt: new Date(),
                contentHash,
                parsingStatus: 'partial',
                parsingWarnings: ['Placeholder parser - XML structure needs to be configured']
            });
        }
    }

    return records;
}

export async function POST(request: NextRequest): Promise<NextResponse<RMCOAUploadResponse>> {
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

        const allRecords: RMCOARecord[] = [];
        const errors: string[] = [];
        let processed = 0;
        let failed = 0;

        for (const file of files) {
            try {
                const content = await file.text();
                const records = await parseRMCOAXml(content, file.name);

                if (records.length > 0) {
                    // Upsert records (update if exists, insert if new)
                    for (const record of records) {
                        try {
                            await RMCOA.findOneAndUpdate(
                                { arNo: record.arNo, materialCode: record.materialCode },
                                { $set: record },
                                { upsert: true, new: true }
                            );
                            allRecords.push(record);
                        } catch (dbError) {
                            const errorMessage = dbError instanceof Error ? dbError.message : 'Database error';
                            errors.push(`${file.name}: ${errorMessage}`);
                        }
                    }
                    processed++;
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
            processed,
            failed,
            records: allRecords,
            errors: errors.length > 0 ? errors : undefined,
        });

    } catch (error) {
        console.error('Error uploading RM COAs:', error);
        return NextResponse.json({
            success: false,
            message: error instanceof Error ? error.message : 'Unknown error',
            processed: 0,
            failed: 0,
            records: [],
            errors: [error instanceof Error ? error.message : 'Unknown error'],
        }, { status: 500 });
    }
}
