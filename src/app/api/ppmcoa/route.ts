/**
 * PPM COA API Route
 * Handles PPM COA data retrieval and deletion
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import PPMCOA from '@/models/PPMCOA';

/**
 * GET /api/ppmcoa
 * Retrieve all PPM COA records
 */
export async function GET(): Promise<NextResponse> {
    try {
        await connectToDatabase();

        const ppmCoaRecords = await PPMCOA.find({})
            .select('-contentHash -rawXmlContent')
            .sort({ uploadedAt: -1 })
            .lean();

        // Count unique AR numbers and materials
        const uniqueArNumbers = new Set(ppmCoaRecords.map((r: any) => r.arNo)).size;
        const uniqueMaterials = new Set(ppmCoaRecords.map((r: any) => r.materialCode)).size;

        return NextResponse.json({
            success: true,
            data: ppmCoaRecords,
            total: ppmCoaRecords.length,
            uniqueArNumbers,
            uniqueMaterials,
        });
    } catch (error) {
        console.error('PPM COA list error:', error);
        return NextResponse.json(
            { success: false, message: 'Failed to fetch PPM COA data', data: [] },
            { status: 500 }
        );
    }
}

/**
 * DELETE /api/ppmcoa
 * Delete all PPM COA records
 */
export async function DELETE(): Promise<NextResponse> {
    try {
        await connectToDatabase();

        const result = await PPMCOA.deleteMany({});

        return NextResponse.json({
            success: true,
            message: `Deleted ${result.deletedCount} PPM COA records`,
            deletedCount: result.deletedCount,
        });
    } catch (error) {
        console.error('PPM COA delete error:', error);
        return NextResponse.json(
            { success: false, message: 'Failed to delete PPM COA data' },
            { status: 500 }
        );
    }
}
