/**
 * Inward AR Numbers API
 * GET: Fetch all unique AR numbers from Inward Register (for PM/PPM COA matching)
 */

import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import InwardRegister from '@/models/InwardRegister';

export async function GET() {
    try {
        await connectToDatabase();

        // Use MongoDB distinct to get all unique AR numbers efficiently
        // This is much faster than fetching all records
        const arNumbers = await InwardRegister.distinct('arNumber');

        // Filter out null, undefined, and empty strings
        const validArNumbers = arNumbers.filter((ar: string) => ar && ar.trim() !== '');

        return NextResponse.json({
            success: true,
            arNumbers: validArNumbers,
            total: validArNumbers.length
        });

    } catch (error) {
        console.error('Error fetching AR numbers:', error);
        return NextResponse.json({
            success: false,
            arNumbers: [],
            total: 0,
            message: 'Failed to fetch AR numbers'
        }, { status: 500 });
    }
}
