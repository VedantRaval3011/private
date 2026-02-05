/**
 * Inward Register API
 * GET: Fetch Inward Register records with pagination and search
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import InwardRegister from '@/models/InwardRegister';
import type { InwardRegisterListResponse } from '@/types/inward';

export async function GET(request: NextRequest): Promise<NextResponse<InwardRegisterListResponse>> {
    try {
        await connectToDatabase();

        const searchParams = request.nextUrl.searchParams;
        const page = parseInt(searchParams.get('page') || '1');
        const limit = parseInt(searchParams.get('limit') || '10');
        const search = (searchParams.get('search') || '').trim(); // Trim whitespace
        const sortBy = searchParams.get('sortBy') || 'uploadedAt';
        const sortOrder = searchParams.get('sortOrder') === 'asc' ? 1 : -1;

        const skip = (page - 1) * limit;

        // Build query
        const query: any = {};

        if (search) {
            const searchRegex = { $regex: search, $options: 'i' };
            query.$or = [
                { vendorName: searchRegex },
                { inwardNumber: searchRegex },
                { arNumber: searchRegex },
                { materialName: searchRegex },
                { batchNumber: searchRegex },
                { challanNumber: searchRegex },
                // Allow searching by source file name as well
                { sourceFile: searchRegex }
            ];
        }

        // Sorting configuration
        const sortConfig: any = {};
        // Add secondary sort by inwardDate if not primary
        if (sortBy !== 'inwardDate') {
            sortConfig[sortBy] = sortOrder;
            sortConfig['inwardDate'] = -1;
        } else {
            sortConfig[sortBy] = sortOrder;
        }

        // Execute query
        const [data, total] = await Promise.all([
            InwardRegister.find(query)
                // Use robust sort
                .sort(sortConfig)
                .skip(skip)
                .limit(limit)
                .lean(),
            InwardRegister.countDocuments(query)
        ]);

        // Transform _id to string
        const formattedData = data.map(record => ({
            ...record,
            _id: (record._id as any).toString(),
        }));

        return NextResponse.json({
            success: true,
            data: formattedData as any,
            total,
            page,
            limit
        });

    } catch (error) {
        console.error('Error fetching inward registers:', error);
        return NextResponse.json({
            success: false,
            data: [],
            total: 0,
            page: 1,
            limit: 10,
        }, { status: 500 });
    }
}
