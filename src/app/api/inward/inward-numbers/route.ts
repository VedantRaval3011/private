/**
 * Inward Numbers API
 * GET: Fetch all unique Inward Numbers from Inward Register
 * (Used as fallback AR numbers for PM/PPM COA matching)
 */

import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import InwardRegister from '@/models/InwardRegister';

export async function GET() {
    try {
        await connectToDatabase();

        // Use MongoDB distinct to get all unique Inward Numbers efficiently
        const inwardNumbers = await InwardRegister.distinct('inwardNumber');

        // Filter out null, undefined, and empty strings
        const validInwardNumbers = inwardNumbers.filter((num: string) => num && num.trim() !== '');

        return NextResponse.json({
            success: true,
            inwardNumbers: validInwardNumbers,
            total: validInwardNumbers.length
        });

    } catch (error) {
        console.error('Error fetching Inward Numbers:', error);
        return NextResponse.json({
            success: false,
            inwardNumbers: [],
            total: 0,
            message: 'Failed to fetch Inward Numbers'
        }, { status: 500 });
    }
}
