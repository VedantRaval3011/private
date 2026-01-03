/**
 * Batches by Item Code API Route
 * GET /api/batch/by-item/[itemCode] - Fetch all batches for a given item code
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Batch from '@/models/Batch';

interface BatchItem {
    batchNumber: string;
    itemCode: string;
    itemName: string;
    mfgDate: string;
    expiryDate: string;
    batchSize: string;
    unit: string;
    type: string;
    mfgLicNo: string;
    department: string;
    pack: string;
}

interface BatchListResponse {
    success: boolean;
    data?: BatchItem[];
    total?: number;
    message?: string;
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ itemCode: string }> }
): Promise<NextResponse<BatchListResponse>> {
    try {
        await connectToDatabase();
        
        const { itemCode } = await params;
        
        if (!itemCode) {
            return NextResponse.json(
                { success: false, message: 'Item code is required' },
                { status: 400 }
            );
        }

        // Find all batches with this item code
        const batches = await Batch.aggregate([
            { $unwind: '$batches' },
            { 
                $match: { 
                    'batches.itemCode': itemCode 
                } 
            },
            {
                $project: {
                    batchNumber: '$batches.batchNumber',
                    itemCode: '$batches.itemCode',
                    itemName: '$batches.itemName',
                    mfgDate: '$batches.mfgDate',
                    expiryDate: '$batches.expiryDate',
                    batchSize: '$batches.batchSize',
                    unit: '$batches.unit',
                    type: '$batches.type',
                    mfgLicNo: '$batches.mfgLicNo',
                    department: '$batches.department',
                    pack: '$batches.pack',
                }
            },
            { $sort: { mfgDate: -1 } } // Most recent first
        ]);

        return NextResponse.json({
            success: true,
            data: batches,
            total: batches.length
        });
        
    } catch (error) {
        console.error('Batch list by item code error:', error);
        return NextResponse.json(
            { success: false, message: 'Failed to fetch batches' },
            { status: 500 }
        );
    }
}
