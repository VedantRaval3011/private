/**
 * Matched Batches API - Get all batches matched to formulas
 * Returns MFC-wise grouped batch information
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Formula from '@/models/Formula';
import Batch from '@/models/Batch';

interface BatchInfo {
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
}

interface ProductCodeGroup {
    productCode: string;
    productName: string;
    batches: BatchInfo[];
    batchCount: number;
}

interface MFCGroup {
    masterCardNo: string;
    productName: string;
    genericName: string;
    manufacturer: string;
    revisionNo: string;
    shelfLife: string;
    productCodes: ProductCodeGroup[];
    totalBatches: number;
}

interface MatchedBatchesResponse {
    success: boolean;
    data: MFCGroup[];
    total: number;
    totalBatches: number;
    message?: string;
}

/**
 * GET /api/batch/matched-batches
 * Get all batches grouped by MFC and product codes
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
                totalBatches: 0,
                message: 'No matched product codes found'
            });
        }

        // Find all batch documents that contain any of the matched product codes
        const batchDocuments = await Batch.find({
            'batches.itemCode': { $in: matchedProductCodes }
        })
            .select('batches companyName companyAddress fileName uploadedAt')
            .lean();

        // Group batches by MFC
        const mfcGroups = new Map<string, MFCGroup>();
        let totalBatchCount = 0;

        batchDocuments.forEach(doc => {
            if (doc.batches && Array.isArray(doc.batches)) {
                doc.batches.forEach((batch: any) => {
                    // Only include batches that have matching formulas
                    const formula = productCodeToFormula.get(batch.itemCode);
                    if (formula) {
                        const mfcNo = formula.masterFormulaDetails?.masterCardNo || 'N/A';

                        // Initialize MFC group if not exists
                        if (!mfcGroups.has(mfcNo)) {
                            mfcGroups.set(mfcNo, {
                                masterCardNo: mfcNo,
                                productName: formula.masterFormulaDetails?.productName || 'N/A',
                                genericName: formula.masterFormulaDetails?.genericName || 'N/A',
                                manufacturer: formula.masterFormulaDetails?.manufacturer || 'N/A',
                                revisionNo: formula.masterFormulaDetails?.revisionNo || 'N/A',
                                shelfLife: formula.masterFormulaDetails?.shelfLife || 'N/A',
                                productCodes: [],
                                totalBatches: 0
                            });
                        }

                        const mfcGroup = mfcGroups.get(mfcNo)!;

                        // Find or create product code group within this MFC
                        let productCodeGroup = mfcGroup.productCodes.find(pc => pc.productCode === batch.itemCode);
                        if (!productCodeGroup) {
                            productCodeGroup = {
                                productCode: batch.itemCode,
                                productName: batch.itemName || 'N/A',
                                batches: [],
                                batchCount: 0
                            };
                            mfcGroup.productCodes.push(productCodeGroup);
                        }

                        // Add batch to product code group
                        productCodeGroup.batches.push({
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
                        });

                        productCodeGroup.batchCount++;
                        mfcGroup.totalBatches++;
                        totalBatchCount++;
                    }
                });
            }
        });

        // Convert map to array and sort by MFC number
        const mfcGroupsArray = Array.from(mfcGroups.values()).sort((a, b) => {
            return a.masterCardNo.localeCompare(b.masterCardNo, undefined, { numeric: true, sensitivity: 'base' });
        });

        return NextResponse.json({
            success: true,
            data: mfcGroupsArray,
            total: mfcGroupsArray.length,
            totalBatches: totalBatchCount,
        });

    } catch (error) {
        console.error('Error fetching matched batches:', error);
        return NextResponse.json(
            {
                success: false,
                data: [],
                total: 0,
                totalBatches: 0,
                message: error instanceof Error ? error.message : 'Unknown error occurred'
            },
            { status: 500 }
        );
    }
}
