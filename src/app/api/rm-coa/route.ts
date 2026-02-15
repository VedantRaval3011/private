
import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import RMCOA from '@/models/RMCOA';
import type { RMCOAResponse } from '@/types/rmcoa';

/**
 * GET /api/rm-coa
 * Fetch RM COA records with optional filtering
 */
export async function GET(request: NextRequest): Promise<NextResponse<RMCOAResponse>> {
    try {
        await connectToDatabase();

        const searchParams = request.nextUrl.searchParams;
        const search = searchParams.get('search');
        
        // Build query
        const query: any = {};
        
        if (search) {
            const searchRegex = { $regex: search, $options: 'i' };
            query.$or = [
                { arNo: searchRegex },
                { materialCode: searchRegex },
                { materialName: searchRegex },
                { batchNumber: searchRegex },
                { sourceFile: searchRegex }
            ];
        }

        const records = await RMCOA.find(query)
            .sort({ uploadedAt: -1 })
            .lean();

        return NextResponse.json({
            success: true,
            data: records as any[],
        });
        
    } catch (error) {
        console.error('Error fetching RM COA data:', error);
        return NextResponse.json(
            { 
                success: false, 
                data: [], 
                errors: [error instanceof Error ? error.message : 'Unknown error'] 
            },
            { status: 500 }
        );
    }
}
