/**
 * Matched Batches API - Get all batches matched to formulas
 * Returns complete batch information for all batches that have matching formulas
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Formula from '@/models/Formula';
import Batch from '@/models/Batch';

interface MatchedBatchItem {
    batchNumber: string;
    itemCode: string;
    itemName: string;
    itemDetail: string;
    mfgDate: string;
    expiryDate: string;
    batchSize: string;
    unit: string;
    mfgLicNo: string;
    department: string;
    pack: string;
    type: string;
    year: string;
    make: string;
    locationId: string;
    mrpValue: string | null;
    conversionRatio: string;
    batchCompletionDate?: string;
    companyName: string;
    companyAddress: string;
    fileName: string;
    uploadedAt: Date;
    // Formula information
    masterCardNo: string;
    productCode: string;
    productName: string;
    genericName: string;
    manufacturer: string;
    revisionNo: string;
    shelfLife: string;
}

interface MatchedBatchesResponse {
    success: boolean;
    data: MatchedBatchItem[];
    total: number;
    message?: string;
}

/**
 * GET /api/batch/matched-batches
 * Get all batches that are matched to formulas
 */
export async function GET(request: NextRequest): Promise<NextResponse<MatchedBatchesResponse>> {
    try {
        await connectToDatabase();

        // Get all Formula Master records
        const formulas = await Formula.find({})
            .select('masterFormulaDetails fillingDetails processes')
            .lean();

        // Build product code to formula mapping
        const productCodeToFormula = new Map<string, any>();

        formulas.forEach((f: any) => {
            // Main product code
            const mainCode = f.masterFormulaDetails?.productCode;
            if (mainCode && mainCode !== 'N/A') {
                productCodeToFormula.set(mainCode, f);
            }

            // Filling product codes
            if (f.fillingDetails && Array.isArray(f.fillingDetails)) {
                f.fillingDetails.forEach((fd: any) => {
                    const fdCode = fd.productCode;
                    if (fdCode && fdCode !== 'N/A' && !productCodeToFormula.has(fdCode)) {
                        productCodeToFormula.set(fdCode, f);
                    }
                });
            }

            // Process filling products
            if (f.processes && Array.isArray(f.processes)) {
                f.processes.forEach((p: any) => {
                    if (p.fillingProducts && Array.isArray(p.fillingProducts)) {
                        p.fillingProducts.forEach((fp: any) => {
                            const fpCode = fp.productCode;
                            if (fpCode && !productCodeToFormula.has(fpCode)) {
                                productCodeToFormula.set(fpCode, f);
                            }
                        });
                    }
                });
            }
        });

        // Get all product codes that have formulas
        const matchedProductCodes = Array.from(productCodeToFormula.keys());

        if (matchedProductCodes.length === 0) {
            return NextResponse.json({
                success: true,
                data: [],
                total: 0,
                message: 'No matched product codes found'
            });
        }

        // Find all batch documents that contain any of the matched product codes
        const batchDocuments = await Batch.find({
            'batches.itemCode': { $in: matchedProductCodes }
        })
            .select('batches companyName companyAddress fileName uploadedAt')
            .lean();

        // Extract and flatten all matching batch items with formula information
        const matchedBatches: MatchedBatchItem[] = [];

        batchDocuments.forEach(doc => {
            if (doc.batches && Array.isArray(doc.batches)) {
                doc.batches.forEach((batch: any) => {
                    // Only include batches that have matching formulas
                    const formula = productCodeToFormula.get(batch.itemCode);
                    if (formula) {
                        matchedBatches.push({
                            // Batch information
                            batchNumber: batch.batchNumber || 'N/A',
                            itemCode: batch.itemCode || 'N/A',
                            itemName: batch.itemName || 'N/A',
                            itemDetail: batch.itemDetail || 'N/A',
                            mfgDate: batch.mfgDate || 'N/A',
                            expiryDate: batch.expiryDate || 'N/A',
                            batchSize: batch.batchSize || 'N/A',
                            unit: batch.unit || 'N/A',
                            mfgLicNo: batch.mfgLicNo || 'N/A',
                            department: batch.department || 'N/A',
                            pack: batch.pack || 'N/A',
                            type: batch.type || 'N/A',
                            year: batch.year || 'N/A',
                            make: batch.make || 'N/A',
                            locationId: batch.locationId || 'N/A',
                            mrpValue: batch.mrpValue || null,
                            conversionRatio: batch.conversionRatio || 'N/A',
                            batchCompletionDate: batch.batchCompletionDate,
                            companyName: doc.companyName || 'N/A',
                            companyAddress: doc.companyAddress || 'N/A',
                            fileName: doc.fileName || 'N/A',
                            uploadedAt: doc.uploadedAt || new Date(),
                            // Formula information
                            masterCardNo: formula.masterFormulaDetails?.masterCardNo || 'N/A',
                            productCode: formula.masterFormulaDetails?.productCode || 'N/A',
                            productName: formula.masterFormulaDetails?.productName || 'N/A',
                            genericName: formula.masterFormulaDetails?.genericName || 'N/A',
                            manufacturer: formula.masterFormulaDetails?.manufacturer || 'N/A',
                            revisionNo: formula.masterFormulaDetails?.revisionNo || 'N/A',
                            shelfLife: formula.masterFormulaDetails?.shelfLife || 'N/A',
                        });
                    }
                });
            }
        });

        // Sort by manufacturing date (newest first)
        matchedBatches.sort((a, b) => {
            const dateA = new Date(a.mfgDate);
            const dateB = new Date(b.mfgDate);
            return dateB.getTime() - dateA.getTime();
        });

        return NextResponse.json({
            success: true,
            data: matchedBatches,
            total: matchedBatches.length,
        });

    } catch (error) {
        console.error('Error fetching matched batches:', error);
        return NextResponse.json(
            {
                success: false,
                data: [],
                total: 0,
                message: error instanceof Error ? error.message : 'Unknown error occurred'
            },
            { status: 500 }
        );
    }
}
