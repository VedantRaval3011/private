/**
 * Duplicate Batches Report API
 * Finds and exports duplicate batch numbers per MFC
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Batch from '@/models/Batch';
import Formula from '@/models/Formula';
import * as XLSX from 'xlsx';

interface DuplicateBatchInfo {
    batchNumber: string;
    occurrences: number;
    batches: {
        itemCode: string;
        itemName: string;
        mfgDate: string;
        expiryDate: string;
        batchSize: string;
        unit: string;
        type: string;
        mfgLicNo: string;
        pack: string;
        fileName: string;
    }[];
}

interface MFCDuplicateReport {
    mfcNumber: string;
    productName: string;
    productCodes: string[];
    totalBatches: number;
    duplicateBatchCount: number;
    duplicates: DuplicateBatchInfo[];
}

/**
 * GET /api/reports/duplicate-batches
 * Returns JSON report of duplicate batches per MFC
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
    try {
        await connectToDatabase();
        
        const { searchParams } = new URL(request.url);
        const format = searchParams.get('format') || 'json'; // 'json' or 'excel'
        
        // Step 1: Get all formulas with their product codes
        const formulas = await Formula.find({})
            .select('masterFormulaDetails fillingDetails processes')
            .lean();
        
        // Step 2: Build a map of MFC -> product codes
        const mfcProductCodes: Map<string, { 
            mfcNumber: string; 
            productName: string; 
            codes: Set<string> 
        }> = new Map();
        
        formulas.forEach((f: any) => {
            const mfcNo = f.masterFormulaDetails?.masterCardNo?.trim() || 'Unknown';
            const productName = f.masterFormulaDetails?.productName || 'Unknown';
            
            if (!mfcProductCodes.has(mfcNo)) {
                mfcProductCodes.set(mfcNo, { 
                    mfcNumber: mfcNo, 
                    productName, 
                    codes: new Set() 
                });
            }
            
            const entry = mfcProductCodes.get(mfcNo)!;
            
            // Add main product code
            const mainCode = f.masterFormulaDetails?.productCode;
            if (mainCode && mainCode !== 'N/A') {
                entry.codes.add(mainCode);
            }
            
            // Add filling details codes
            if (f.fillingDetails && Array.isArray(f.fillingDetails)) {
                f.fillingDetails.forEach((fd: any) => {
                    if (fd.productCode && fd.productCode !== 'N/A') {
                        entry.codes.add(fd.productCode);
                    }
                });
            }
            
            // Add process filling product codes
            if (f.processes && Array.isArray(f.processes)) {
                f.processes.forEach((p: any) => {
                    if (p.fillingProducts && Array.isArray(p.fillingProducts)) {
                        p.fillingProducts.forEach((fp: any) => {
                            if (fp.productCode && fp.productCode !== 'N/A') {
                                entry.codes.add(fp.productCode);
                            }
                        });
                    }
                });
            }
        });
        
        // Step 3: Get all batches
        const batchDocs = await Batch.find({})
            .select('batches fileName')
            .lean();
        
        // Flatten batches with file info
        interface FlatBatch {
            batchNumber: string;
            itemCode: string;
            itemName: string;
            mfgDate: string;
            expiryDate: string;
            batchSize: string;
            unit: string;
            type: string;
            mfgLicNo: string;
            pack: string;
            fileName: string;
        }
        
        const allBatches: FlatBatch[] = [];
        batchDocs.forEach((doc: any) => {
            if (doc.batches && Array.isArray(doc.batches)) {
                doc.batches.forEach((b: any) => {
                    allBatches.push({
                        batchNumber: b.batchNumber || 'N/A',
                        itemCode: b.itemCode || 'N/A',
                        itemName: b.itemName || 'N/A',
                        mfgDate: b.mfgDate || 'N/A',
                        expiryDate: b.expiryDate || 'N/A',
                        batchSize: b.batchSize || 'N/A',
                        unit: b.unit || 'N/A',
                        type: b.type || 'N/A',
                        mfgLicNo: b.mfgLicNo || 'N/A',
                        pack: b.pack || 'N/A',
                        fileName: doc.fileName || 'N/A',
                    });
                });
            }
        });
        
        // Step 4: For each MFC, find batches and detect duplicates
        const reports: MFCDuplicateReport[] = [];
        
        mfcProductCodes.forEach((mfcData, mfcNo) => {
            const productCodes = Array.from(mfcData.codes);
            
            // Get batches for this MFC's product codes
            const mfcBatches = allBatches.filter(b => productCodes.includes(b.itemCode));
            
            if (mfcBatches.length === 0) return;
            
            // Group by batch number to find duplicates
            const batchGroups: Map<string, FlatBatch[]> = new Map();
            mfcBatches.forEach(b => {
                if (!batchGroups.has(b.batchNumber)) {
                    batchGroups.set(b.batchNumber, []);
                }
                batchGroups.get(b.batchNumber)!.push(b);
            });
            
            // Find duplicates (batch numbers appearing more than once)
            const duplicates: DuplicateBatchInfo[] = [];
            batchGroups.forEach((batches, batchNumber) => {
                if (batches.length > 1) {
                    duplicates.push({
                        batchNumber,
                        occurrences: batches.length,
                        batches: batches.map(b => ({
                            itemCode: b.itemCode,
                            itemName: b.itemName,
                            mfgDate: b.mfgDate,
                            expiryDate: b.expiryDate,
                            batchSize: b.batchSize,
                            unit: b.unit,
                            type: b.type,
                            mfgLicNo: b.mfgLicNo,
                            pack: b.pack,
                            fileName: b.fileName,
                        })),
                    });
                }
            });
            
            // Only include MFCs that have duplicates
            if (duplicates.length > 0) {
                reports.push({
                    mfcNumber: mfcNo,
                    productName: mfcData.productName,
                    productCodes,
                    totalBatches: mfcBatches.length,
                    duplicateBatchCount: duplicates.length,
                    duplicates: duplicates.sort((a, b) => b.occurrences - a.occurrences),
                });
            }
        });
        
        // Sort by duplicate count (most duplicates first)
        reports.sort((a, b) => b.duplicateBatchCount - a.duplicateBatchCount);
        
        // Return based on format
        if (format === 'excel') {
            // Create Excel workbook
            const workbook = XLSX.utils.book_new();
            
            // Sheet 1: Summary
            const summaryData = reports.map(r => ({
                'MFC Number': r.mfcNumber,
                'Product Name': r.productName,
                'Product Codes': r.productCodes.join(', '),
                'Total Batches': r.totalBatches,
                'Duplicate Batch Numbers': r.duplicateBatchCount,
                'Total Duplicate Records': r.duplicates.reduce((sum, d) => sum + d.occurrences, 0),
            }));
            
            const summarySheet = XLSX.utils.json_to_sheet(summaryData);
            XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');
            
            // Sheet 2: Detailed Duplicates
            const detailsData: any[] = [];
            reports.forEach(r => {
                r.duplicates.forEach(dup => {
                    dup.batches.forEach((b, idx) => {
                        detailsData.push({
                            'MFC Number': r.mfcNumber,
                            'Product Name': r.productName,
                            'Batch Number': dup.batchNumber,
                            'Occurrence #': idx + 1,
                            'Total Occurrences': dup.occurrences,
                            'Item Code': b.itemCode,
                            'Item Name': b.itemName,
                            'Mfg Date': b.mfgDate,
                            'Expiry Date': b.expiryDate,
                            'Batch Size': b.batchSize,
                            'Unit': b.unit,
                            'Type': b.type,
                            'Mfg Lic No': b.mfgLicNo,
                            'Pack': b.pack,
                            'Source File': b.fileName,
                        });
                    });
                });
            });
            
            const detailsSheet = XLSX.utils.json_to_sheet(detailsData);
            XLSX.utils.book_append_sheet(workbook, detailsSheet, 'Duplicate Details');
            
            // Generate buffer
            const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
            
            // Return as downloadable file
            return new NextResponse(excelBuffer, {
                headers: {
                    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    'Content-Disposition': `attachment; filename="duplicate_batches_report_${new Date().toISOString().split('T')[0]}.xlsx"`,
                },
            });
        }
        
        // Default: JSON response
        return NextResponse.json({
            success: true,
            generatedAt: new Date().toISOString(),
            totalMFCsWithDuplicates: reports.length,
            totalDuplicateBatchNumbers: reports.reduce((sum, r) => sum + r.duplicateBatchCount, 0),
            reports,
        });
        
    } catch (error) {
        console.error('Error generating duplicate batches report:', error);
        return NextResponse.json(
            { 
                success: false, 
                message: error instanceof Error ? error.message : 'Unknown error occurred'
            },
            { status: 500 }
        );
    }
}
