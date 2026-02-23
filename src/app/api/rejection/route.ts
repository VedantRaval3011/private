/**
 * Material Rejection API
 * GET: Fetch rejection records with pagination and search
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import MaterialRejection from '@/models/MaterialRejection';

export async function GET(request: NextRequest) {
    try {
        await connectToDatabase();

        const searchParams = request.nextUrl.searchParams;
        const page = parseInt(searchParams.get('page') || '1');
        const limit = parseInt(searchParams.get('limit') || '20');
        const search = (searchParams.get('search') || '').trim();
        const sortBy = searchParams.get('sortBy') || 'arDate';
        const sortOrder = searchParams.get('sortOrder') === 'asc' ? 1 : -1;

        const skip = (page - 1) * limit;

        // Build query
        const query: any = {};

        if (search) {
            const searchRegex = { $regex: search, $options: 'i' };
            query.$or = [
                { arNumber: searchRegex },
                { materialCode: searchRegex },
                { materialName: searchRegex },
                { vendorName: searchRegex },
            ];
        }

        const sortConfig: any = { [sortBy]: sortOrder };

        const [data, total] = await Promise.all([
            MaterialRejection.find(query)
                .sort(sortConfig)
                .skip(skip)
                .limit(limit)
                .lean(),
            MaterialRejection.countDocuments(query),
        ]);

        const formattedData = data.map(record => ({
            ...record,
            _id: (record._id as any).toString(),
        }));

        return NextResponse.json({
            success: true,
            data: formattedData,
            total,
            page,
            limit,
        });

    } catch (error) {
        console.error('Error fetching rejection records:', error);
        return NextResponse.json({
            success: false,
            data: [],
            total: 0,
            page: 1,
            limit: 20,
        }, { status: 500 });
    }
}
