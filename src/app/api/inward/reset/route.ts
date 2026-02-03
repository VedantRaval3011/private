/**
 * Inward Register Reset API
 * DELETE: Clear all Inward Register records to allow re-import
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import InwardRegister from '@/models/InwardRegister';

export async function DELETE(request: NextRequest): Promise<NextResponse> {
    try {
        await connectToDatabase();

        // Get count before deletion for logging
        const countBefore = await InwardRegister.countDocuments();

        console.log('\n========================================');
        console.log('🗑️ INWARD REGISTER RESET INITIATED');
        console.log('========================================');
        console.log(`   📋 Records to delete: ${countBefore}`);

        // Delete all inward register records
        const result = await InwardRegister.deleteMany({});

        console.log(`   ✅ Deleted: ${result.deletedCount} records`);
        console.log('========================================\n');

        return NextResponse.json({
            success: true,
            message: `Successfully deleted ${result.deletedCount} inward register records`,
            deletedCount: result.deletedCount
        });

    } catch (error) {
        console.error('Error resetting inward register:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred'
        }, { status: 500 });
    }
}
