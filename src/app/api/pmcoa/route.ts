/**
 * PM COA API Route
 * Handles PM COA data retrieval and deletion
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import PMCOA from '@/models/PMCOA';

/**
 * GET /api/pmcoa
 * Retrieve all PM COA records
 */
export async function GET(): Promise<NextResponse> {
    try {
        await connectToDatabase();

        const pmCoaRecords = await PMCOA.find({})
            .select('-contentHash -rawXmlContent')
            .sort({ uploadedAt: -1 })
            .lean();

        // Count unique AR numbers and materials
        const uniqueArNumbers = new Set(pmCoaRecords.map((r: any) => r.arNo)).size;
        const uniqueMaterials = new Set(pmCoaRecords.map((r: any) => r.materialCode)).size;

        return NextResponse.json({
            success: true,
            data: pmCoaRecords,
            total: pmCoaRecords.length,
            uniqueArNumbers,
            uniqueMaterials,
        });
    } catch (error) {
        console.error('PM COA list error:', error);
        return NextResponse.json(
            { success: false, message: 'Failed to fetch PM COA data', data: [] },
            { status: 500 }
        );
    }
}

/**
 * DELETE /api/pmcoa
 * Delete all PM COA records
 */
export async function DELETE(): Promise<NextResponse> {
    try {
        await connectToDatabase();

        const result = await PMCOA.deleteMany({});

        return NextResponse.json({
            success: true,
            message: `Deleted ${result.deletedCount} PM COA records`,
            deletedCount: result.deletedCount,
        });
    } catch (error) {
        console.error('PM COA delete error:', error);
        return NextResponse.json(
            { success: false, message: 'Failed to delete PM COA data' },
            { status: 500 }
        );
    }
}
