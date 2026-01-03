/**
 * Batch Details by Batch Number API Route
 * GET /api/batch/details/[batchNumber] - Fetch batch details by batch number
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Batch from '@/models/Batch';

interface BatchDetail {
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
    // Parent file info
    companyName: string;
    companyAddress: string;
    fileName: string;
    uploadedAt: Date;
}

interface BatchDetailResponse {
    success: boolean;
    data?: BatchDetail[];
    message?: string;
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ batchNumber: string }> }
): Promise<NextResponse<BatchDetailResponse>> {
    try {
        await connectToDatabase();
        
        const { batchNumber } = await params;
        
        if (!batchNumber) {
            return NextResponse.json(
                { success: false, message: 'Batch number is required' },
                { status: 400 }
            );
        }

        // Decode the batch number (in case it has special characters)
        const decodedBatchNumber = decodeURIComponent(batchNumber);

        // Find all batches with this batch number using aggregation
        const batches = await Batch.aggregate([
            { $unwind: '$batches' },
            { 
                $match: { 
                    'batches.batchNumber': decodedBatchNumber
                } 
            },
            {
                $project: {
                    batchNumber: '$batches.batchNumber',
                    itemCode: '$batches.itemCode',
                    itemName: '$batches.itemName',
                    itemDetail: '$batches.itemDetail',
                    mfgDate: '$batches.mfgDate',
                    expiryDate: '$batches.expiryDate',
                    batchSize: '$batches.batchSize',
                    unit: '$batches.unit',
                    mfgLicNo: '$batches.mfgLicNo',
                    department: '$batches.department',
                    pack: '$batches.pack',
                    type: '$batches.type',
                    year: '$batches.year',
                    make: '$batches.make',
                    locationId: '$batches.locationId',
                    mrpValue: '$batches.mrpValue',
                    conversionRatio: '$batches.conversionRatio',
                    batchCompletionDate: '$batches.batchCompletionDate',
                    companyName: 1,
                    companyAddress: 1,
                    fileName: 1,
                    uploadedAt: 1
                }
            }
        ]);

        if (batches.length === 0) {
            // Try case-insensitive search
            const flexibleBatches = await Batch.aggregate([
                { $unwind: '$batches' },
                { 
                    $match: { 
                        'batches.batchNumber': { 
                            $regex: `^${decodedBatchNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 
                            $options: 'i' 
                        } 
                    } 
                },
                {
                    $project: {
                        batchNumber: '$batches.batchNumber',
                        itemCode: '$batches.itemCode',
                        itemName: '$batches.itemName',
                        itemDetail: '$batches.itemDetail',
                        mfgDate: '$batches.mfgDate',
                        expiryDate: '$batches.expiryDate',
                        batchSize: '$batches.batchSize',
                        unit: '$batches.unit',
                        mfgLicNo: '$batches.mfgLicNo',
                        department: '$batches.department',
                        pack: '$batches.pack',
                        type: '$batches.type',
                        year: '$batches.year',
                        make: '$batches.make',
                        locationId: '$batches.locationId',
                        mrpValue: '$batches.mrpValue',
                        conversionRatio: '$batches.conversionRatio',
                        batchCompletionDate: '$batches.batchCompletionDate',
                        companyName: 1,
                        companyAddress: 1,
                        fileName: 1,
                        uploadedAt: 1
                    }
                }
            ]);

            if (flexibleBatches.length === 0) {
                return NextResponse.json(
                    { success: false, message: `Batch "${decodedBatchNumber}" not found` },
                    { status: 404 }
                );
            }

            return NextResponse.json({ success: true, data: flexibleBatches });
        }

        return NextResponse.json({ success: true, data: batches });
        
    } catch (error) {
        console.error('Batch detail fetch error:', error);
        return NextResponse.json(
            { success: false, message: 'Failed to fetch batch details' },
            { status: 500 }
        );
    }
}
