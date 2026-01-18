/**
 * RM COA API - Main Route
 * GET: Retrieve all RM COA records with filtering
 * DELETE: Remove all RM COA records
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import RMCOA from '@/models/RMCOA';
import type { RMCOAListResponse } from '@/types/rmcoa';

export async function GET(request: NextRequest): Promise<NextResponse<RMCOAListResponse>> {
    try {
        await connectToDatabase();

        const { searchParams } = new URL(request.url);
        const search = searchParams.get('search');
        const materialCode = searchParams.get('materialCode');
        const arNo = searchParams.get('arNo');
        const limit = parseInt(searchParams.get('limit') || '1000');
        const skip = parseInt(searchParams.get('skip') || '0');

        // Build query
        interface QueryFilter {
            materialCode?: string | { $regex: string; $options: string };
            arNo?: string | { $regex: string; $options: string };
            $or?: Array<Record<string, { $regex: string; $options: string }>>;
        }

        const query: QueryFilter = {};

        if (materialCode) {
            query.materialCode = { $regex: materialCode, $options: 'i' };
        }

        if (arNo) {
            query.arNo = { $regex: arNo, $options: 'i' };
        }

        if (search) {
            query.$or = [
                { arNo: { $regex: search, $options: 'i' } },
                { materialCode: { $regex: search, $options: 'i' } },
                { materialName: { $regex: search, $options: 'i' } },
            ];
        }

        // Get total counts
        const totalCount = await RMCOA.countDocuments(query);

        // Get unique AR numbers
        const uniqueArNumbers = await RMCOA.distinct('arNo', query);

        // Get unique material codes
        const uniqueMaterials = await RMCOA.distinct('materialCode', query);

        // Get records
        const records = await RMCOA.find(query)
            .sort({ arNo: 1, materialCode: 1 })
            .skip(skip)
            .limit(limit)
            .lean();

        return NextResponse.json({
            success: true,
            data: records.map(r => ({
                ...r,
                _id: r._id.toString(),
            })),
            total: totalCount,
            uniqueArNumbers: uniqueArNumbers.length,
            uniqueMaterials: uniqueMaterials.length,
        });

    } catch (error) {
        console.error('Error fetching RM COAs:', error);
        return NextResponse.json({
            success: false,
            data: [],
            total: 0,
            uniqueArNumbers: 0,
            uniqueMaterials: 0,
        }, { status: 500 });
    }
}

export async function DELETE(): Promise<NextResponse<{ success: boolean; message: string; deletedCount?: number }>> {
    try {
        await connectToDatabase();

        const result = await RMCOA.deleteMany({});

        return NextResponse.json({
            success: true,
            message: `Deleted ${result.deletedCount} RM COA records`,
            deletedCount: result.deletedCount,
        });

    } catch (error) {
        console.error('Error deleting RM COAs:', error);
        return NextResponse.json({
            success: false,
            message: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}
