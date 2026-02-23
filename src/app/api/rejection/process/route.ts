/**
 * Material Rejection Process API
 * POST: Scan files folder and process Material Rejection XML files.
 *
 * This route handles its own duplicate detection INTERNALLY via MongoDB upsert
 * (keyed on arNumber + materialCode). It does NOT use ProcessingLog so that
 * rejection files never appear on the home-page ingestion results.
 */

import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { scanFilesFolder } from '@/lib/ingestionService';
import { detectXmlType } from '@/lib/xmlTypeDetector';
import { parseMaterialRejectionXml } from '@/lib/materialRejectionParser';
import MaterialRejection from '@/models/MaterialRejection';
import { generateNormalizedHash } from '@/lib/contentHash';

export async function POST() {
    try {
        await connectToDatabase();

        // Scan files folder for all XML files
        const files = await scanFilesFolder();

        // Keep only Material Rejection files
        const rejectionFiles = files.filter(f => detectXmlType(f.content) === 'MATERIAL_REJECTION');

        if (rejectionFiles.length === 0) {
            return NextResponse.json({
                success: true,
                message: 'No Material Rejection XML files found in the files folder',
                totalFiles: 0,
                totalRecords: 0,
                newRecords: 0,
                duplicateRecords: 0,
                results: [],
            });
        }

        let totalRecords = 0;
        let newRecords = 0;
        let duplicateRecords = 0;
        const results: { fileName: string; records: number; new: number; duplicates: number }[] = [];

        for (const file of rejectionFiles) {
            const parseResult = parseMaterialRejectionXml(file.content);

            if (!parseResult.success || parseResult.records.length === 0) {
                results.push({ fileName: file.fileName, records: 0, new: 0, duplicates: 0 });
                continue;
            }

            const contentHash = generateNormalizedHash(file.content);
            let fileNew = 0;
            let fileDup = 0;

            for (const record of parseResult.records) {
                try {
                    // Check if this exact record already exists
                    const existing = await MaterialRejection.findOne({
                        arNumber: record.arNumber,
                        materialCode: record.materialCode,
                    });

                    if (existing) {
                        // Record already exists — update silently (no error, no duplicate flag to caller)
                        await MaterialRejection.findOneAndUpdate(
                            { arNumber: record.arNumber, materialCode: record.materialCode },
                            {
                                ...record,
                                sourceFile: file.fileName,
                                contentHash,
                                uploadedAt: new Date(),
                            },
                            { new: true }
                        );
                        fileDup++;
                    } else {
                        // New record — insert
                        await MaterialRejection.create({
                            ...record,
                            sourceFile: file.fileName,
                            contentHash,
                            uploadedAt: new Date(),
                        });
                        fileNew++;
                    }
                } catch (e: any) {
                    if (e.code === 11000) {
                        // Race condition duplicate — treat as existing
                        fileDup++;
                    } else {
                        throw e;
                    }
                }
            }

            totalRecords += parseResult.records.length;
            newRecords += fileNew;
            duplicateRecords += fileDup;
            results.push({
                fileName: file.fileName,
                records: parseResult.records.length,
                new: fileNew,
                duplicates: fileDup,
            });
        }

        const message = newRecords > 0
            ? `Imported ${newRecords} new record${newRecords !== 1 ? 's' : ''} from ${rejectionFiles.length} file${rejectionFiles.length !== 1 ? 's' : ''}`
            : `All ${totalRecords} records already up to date`;

        return NextResponse.json({
            success: true,
            message,
            totalFiles: rejectionFiles.length,
            totalRecords,
            newRecords,
            duplicateRecords,
            results,
        });

    } catch (error) {
        console.error('Error processing rejection files:', error);
        return NextResponse.json({
            success: false,
            message: error instanceof Error ? error.message : 'Unknown error',
            totalFiles: 0,
            totalRecords: 0,
            newRecords: 0,
            duplicateRecords: 0,
            results: [],
        }, { status: 500 });
    }
}
