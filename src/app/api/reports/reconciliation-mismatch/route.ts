/**
 * Reconciliation Mismatch Report API
 * Generates Excel report with:
 * 1. Orphaned Batches (no matching MFC)
 * 2. License Number Mismatches
 * 3. Complete batch and formula details
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Batch from '@/models/Batch';
import Formula from '@/models/Formula';
import * as XLSX from 'xlsx';

interface BatchDetail {
    batchNumber: string;
    itemCode: string;
    itemName: string;
    itemDetail: string;
    mfgDate: string;
    expiryDate: string;
    batchSize: string;
    unit: string;
    type: string;
    mfgLicNo: string;
    department: string;
    pack: string;
    year: string;
    make: string;
    locationId: string;
    fileName: string;
}

interface FormulaInfo {
    mfcNumber: string;
    productCode: string;
    productName: string;
    genericName: string;
    manufacturer: string;
    manufacturingLicenseNo: string;
    manufacturingLocation: string;
    specification: string;
    shelfLife: string;
    revisionNo: string;
    batchSize: string;
}

interface MismatchRecord {
    batch: BatchDetail;
    formula?: FormulaInfo;
    mismatchType: string;
    mismatchDetails: string;
    severity: 'CRITICAL' | 'WARNING' | 'INFO';
}

/**
 * GET /api/reports/reconciliation-mismatch
 * Returns Excel report of all reconciliation mismatches
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
    try {
        await connectToDatabase();
        
        const { searchParams } = new URL(request.url);
        const format = searchParams.get('format') || 'excel';
        
        // Step 1: Get all formulas and build product code -> formula map
        const formulas = await Formula.find({})
            .select('masterFormulaDetails fillingDetails processes batchInfo')
            .lean();
        
        // Build map of product code -> formula info
        const productCodeToFormula: Map<string, FormulaInfo & { allCodes: string[] }> = new Map();
        
        formulas.forEach((f: any) => {
            const formulaInfo: FormulaInfo & { allCodes: string[] } = {
                mfcNumber: f.masterFormulaDetails?.masterCardNo?.trim() || 'N/A',
                productCode: f.masterFormulaDetails?.productCode || 'N/A',
                productName: f.masterFormulaDetails?.productName || 'N/A',
                genericName: f.masterFormulaDetails?.genericName || 'N/A',
                manufacturer: f.masterFormulaDetails?.manufacturer || 'N/A',
                manufacturingLicenseNo: f.masterFormulaDetails?.manufacturingLicenseNo || 'N/A',
                manufacturingLocation: f.masterFormulaDetails?.manufacturingLocation || 'N/A',
                specification: f.masterFormulaDetails?.specification || 'N/A',
                shelfLife: f.masterFormulaDetails?.shelfLife || 'N/A',
                revisionNo: f.masterFormulaDetails?.revisionNo || '0',
                batchSize: f.batchInfo?.batchSize || 'N/A',
                allCodes: [],
            };
            
            // Collect all product codes for this formula
            const allCodes: string[] = [];
            
            // Main product code
            const mainCode = f.masterFormulaDetails?.productCode;
            if (mainCode && mainCode !== 'N/A') {
                allCodes.push(mainCode);
            }
            
            // Filling details codes
            if (f.fillingDetails && Array.isArray(f.fillingDetails)) {
                f.fillingDetails.forEach((fd: any) => {
                    if (fd.productCode && fd.productCode !== 'N/A' && !allCodes.includes(fd.productCode)) {
                        allCodes.push(fd.productCode);
                    }
                });
            }
            
            // Process filling product codes
            if (f.processes && Array.isArray(f.processes)) {
                f.processes.forEach((p: any) => {
                    if (p.fillingProducts && Array.isArray(p.fillingProducts)) {
                        p.fillingProducts.forEach((fp: any) => {
                            if (fp.productCode && fp.productCode !== 'N/A' && !allCodes.includes(fp.productCode)) {
                                allCodes.push(fp.productCode);
                            }
                        });
                    }
                });
            }
            
            formulaInfo.allCodes = allCodes;
            
            // Map each code to this formula
            allCodes.forEach(code => {
                productCodeToFormula.set(code, formulaInfo);
            });
        });
        
        // Step 2: Get all batches
        const batchDocs = await Batch.find({})
            .select('batches fileName companyName companyAddress')
            .lean();
        
        // Flatten all batches
        const allBatches: BatchDetail[] = [];
        batchDocs.forEach((doc: any) => {
            if (doc.batches && Array.isArray(doc.batches)) {
                doc.batches.forEach((b: any) => {
                    allBatches.push({
                        batchNumber: b.batchNumber || 'N/A',
                        itemCode: b.itemCode || 'N/A',
                        itemName: b.itemName || 'N/A',
                        itemDetail: b.itemDetail || 'N/A',
                        mfgDate: b.mfgDate || 'N/A',
                        expiryDate: b.expiryDate || 'N/A',
                        batchSize: b.batchSize || 'N/A',
                        unit: b.unit || 'N/A',
                        type: b.type || 'N/A',
                        mfgLicNo: b.mfgLicNo || 'N/A',
                        department: b.department || 'N/A',
                        pack: b.pack || 'N/A',
                        year: b.year || 'N/A',
                        make: b.make || 'N/A',
                        locationId: b.locationId || 'N/A',
                        fileName: doc.fileName || 'N/A',
                    });
                });
            }
        });
        
        // Step 3: Identify mismatches
        const orphanedBatches: MismatchRecord[] = [];
        const licenseMismatches: MismatchRecord[] = [];
        const matchedBatches: MismatchRecord[] = [];
        
        allBatches.forEach(batch => {
            const formula = productCodeToFormula.get(batch.itemCode);
            
            if (!formula) {
                // Orphaned batch - no matching MFC
                orphanedBatches.push({
                    batch,
                    mismatchType: 'ORPHANED_BATCH',
                    mismatchDetails: `Batch item code "${batch.itemCode}" not found in any Master Formula Card`,
                    severity: 'CRITICAL',
                });
            } else {
                // Check for license mismatch
                const batchLicense = batch.mfgLicNo?.trim() || '';
                const formulaLicense = formula.manufacturingLicenseNo?.trim() || '';
                
                // Normalize licenses for comparison (handle format variations)
                const normalizedBatchLic = batchLicense.replace(/\s+/g, '').toUpperCase();
                const normalizedFormulaLic = formulaLicense.replace(/\s+/g, '').toUpperCase();
                
                if (normalizedBatchLic && normalizedFormulaLic && 
                    normalizedBatchLic !== 'N/A' && normalizedFormulaLic !== 'N/A' &&
                    normalizedBatchLic !== normalizedFormulaLic) {
                    licenseMismatches.push({
                        batch,
                        formula,
                        mismatchType: 'LICENSE_MISMATCH',
                        mismatchDetails: `Batch License: "${batchLicense}" ≠ Formula License: "${formulaLicense}"`,
                        severity: 'CRITICAL',
                    });
                } else {
                    // Matched batch
                    matchedBatches.push({
                        batch,
                        formula,
                        mismatchType: 'MATCHED',
                        mismatchDetails: 'Batch matches MFC',
                        severity: 'INFO',
                    });
                }
            }
        });
        
        // Step 4: Get MFCs without any batches
        const formulasWithoutBatches: FormulaInfo[] = [];
        formulas.forEach((f: any) => {
            const formulaInfo: FormulaInfo = {
                mfcNumber: f.masterFormulaDetails?.masterCardNo?.trim() || 'N/A',
                productCode: f.masterFormulaDetails?.productCode || 'N/A',
                productName: f.masterFormulaDetails?.productName || 'N/A',
                genericName: f.masterFormulaDetails?.genericName || 'N/A',
                manufacturer: f.masterFormulaDetails?.manufacturer || 'N/A',
                manufacturingLicenseNo: f.masterFormulaDetails?.manufacturingLicenseNo || 'N/A',
                manufacturingLocation: f.masterFormulaDetails?.manufacturingLocation || 'N/A',
                specification: f.masterFormulaDetails?.specification || 'N/A',
                shelfLife: f.masterFormulaDetails?.shelfLife || 'N/A',
                revisionNo: f.masterFormulaDetails?.revisionNo || '0',
                batchSize: f.batchInfo?.batchSize || 'N/A',
            };
            
            // Check if any product code from this formula has batches
            const allCodes: string[] = [];
            const mainCode = f.masterFormulaDetails?.productCode;
            if (mainCode && mainCode !== 'N/A') allCodes.push(mainCode);
            
            if (f.fillingDetails && Array.isArray(f.fillingDetails)) {
                f.fillingDetails.forEach((fd: any) => {
                    if (fd.productCode && fd.productCode !== 'N/A') allCodes.push(fd.productCode);
                });
            }
            
            if (f.processes && Array.isArray(f.processes)) {
                f.processes.forEach((p: any) => {
                    if (p.fillingProducts && Array.isArray(p.fillingProducts)) {
                        p.fillingProducts.forEach((fp: any) => {
                            if (fp.productCode && fp.productCode !== 'N/A') allCodes.push(fp.productCode);
                        });
                    }
                });
            }
            
            const hasBatches = allCodes.some(code => 
                allBatches.some(b => b.itemCode === code)
            );
            
            if (!hasBatches) {
                formulasWithoutBatches.push(formulaInfo);
            }
        });
        
        // Generate Excel
        if (format === 'excel') {
            const workbook = XLSX.utils.book_new();
            
            // Sheet 1: Summary
            const summaryData = [
                { 'Metric': 'Total Batches in System', 'Count': allBatches.length },
                { 'Metric': 'Matched Batches (Valid)', 'Count': matchedBatches.length },
                { 'Metric': 'Orphaned Batches (No MFC)', 'Count': orphanedBatches.length },
                { 'Metric': 'License Mismatches', 'Count': licenseMismatches.length },
                { 'Metric': 'Total MFCs in System', 'Count': formulas.length },
                { 'Metric': 'MFCs Without Batches', 'Count': formulasWithoutBatches.length },
                { 'Metric': 'Reconciliation Rate', 'Count': `${((matchedBatches.length / allBatches.length) * 100).toFixed(2)}%` },
            ];
            const summarySheet = XLSX.utils.json_to_sheet(summaryData);
            XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');
            
            // Sheet 2: Orphaned Batches (No MFC Found)
            const orphanedData = orphanedBatches.map(record => ({
                'Batch Number': record.batch.batchNumber,
                'Item Code': record.batch.itemCode,
                'Item Name': record.batch.itemName,
                'Item Detail': record.batch.itemDetail,
                'Mfg Date': record.batch.mfgDate,
                'Expiry Date': record.batch.expiryDate,
                'Batch Size': record.batch.batchSize,
                'Unit': record.batch.unit,
                'Type': record.batch.type,
                'Mfg License (Batch)': record.batch.mfgLicNo,
                'Department': record.batch.department,
                'Pack': record.batch.pack,
                'Year': record.batch.year,
                'Make': record.batch.make,
                'Location ID': record.batch.locationId,
                'Source File': record.batch.fileName,
                'Mismatch Type': record.mismatchType,
                'Mismatch Details': record.mismatchDetails,
                'Severity': record.severity,
            }));
            const orphanedSheet = XLSX.utils.json_to_sheet(orphanedData);
            XLSX.utils.book_append_sheet(workbook, orphanedSheet, 'Orphaned Batches');
            
            // Sheet 3: License Mismatches
            const licenseData = licenseMismatches.map(record => ({
                'Batch Number': record.batch.batchNumber,
                'Item Code': record.batch.itemCode,
                'Item Name': record.batch.itemName,
                'MFC Number': record.formula?.mfcNumber || 'N/A',
                'Product Name (MFC)': record.formula?.productName || 'N/A',
                'Mfg Date': record.batch.mfgDate,
                'Expiry Date': record.batch.expiryDate,
                'Batch Size': record.batch.batchSize,
                'Type': record.batch.type,
                'Batch Mfg License': record.batch.mfgLicNo,
                'Formula Mfg License': record.formula?.manufacturingLicenseNo || 'N/A',
                'Department': record.batch.department,
                'Make': record.batch.make,
                'Manufacturer (MFC)': record.formula?.manufacturer || 'N/A',
                'Mfg Location (MFC)': record.formula?.manufacturingLocation || 'N/A',
                'Source File': record.batch.fileName,
                'Mismatch Details': record.mismatchDetails,
                'Severity': record.severity,
            }));
            const licenseSheet = XLSX.utils.json_to_sheet(licenseData);
            XLSX.utils.book_append_sheet(workbook, licenseSheet, 'License Mismatches');
            
            // Sheet 4: MFCs Without Batches
            const noBatchMfcData = formulasWithoutBatches.map(f => ({
                'MFC Number': f.mfcNumber,
                'Product Code': f.productCode,
                'Product Name': f.productName,
                'Generic Name': f.genericName,
                'Manufacturer': f.manufacturer,
                'Mfg License': f.manufacturingLicenseNo,
                'Mfg Location': f.manufacturingLocation,
                'Specification': f.specification,
                'Shelf Life': f.shelfLife,
                'Revision No': f.revisionNo,
                'Standard Batch Size': f.batchSize,
                'Status': 'NO PRODUCTION BATCHES',
            }));
            const noBatchSheet = XLSX.utils.json_to_sheet(noBatchMfcData);
            XLSX.utils.book_append_sheet(workbook, noBatchSheet, 'MFCs Without Batches');
            
            // Sheet 5: All Matched Batches (for complete audit)
            const matchedData = matchedBatches.map(record => ({
                'Batch Number': record.batch.batchNumber,
                'Item Code': record.batch.itemCode,
                'Item Name': record.batch.itemName,
                'MFC Number': record.formula?.mfcNumber || 'N/A',
                'Product Name (MFC)': record.formula?.productName || 'N/A',
                'Generic Name': record.formula?.genericName || 'N/A',
                'Mfg Date': record.batch.mfgDate,
                'Expiry Date': record.batch.expiryDate,
                'Batch Size': record.batch.batchSize,
                'Unit': record.batch.unit,
                'Type': record.batch.type,
                'Batch Mfg License': record.batch.mfgLicNo,
                'Formula Mfg License': record.formula?.manufacturingLicenseNo || 'N/A',
                'Department': record.batch.department,
                'Pack': record.batch.pack,
                'Make': record.batch.make,
                'Manufacturer (MFC)': record.formula?.manufacturer || 'N/A',
                'Mfg Location': record.formula?.manufacturingLocation || 'N/A',
                'Specification': record.formula?.specification || 'N/A',
                'Shelf Life': record.formula?.shelfLife || 'N/A',
                'Revision No': record.formula?.revisionNo || 'N/A',
                'Source File': record.batch.fileName,
                'Status': 'MATCHED',
            }));
            const matchedSheet = XLSX.utils.json_to_sheet(matchedData);
            XLSX.utils.book_append_sheet(workbook, matchedSheet, 'Matched Batches');
            
            // Generate buffer
            const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
            
            return new NextResponse(excelBuffer, {
                headers: {
                    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    'Content-Disposition': `attachment; filename="reconciliation_mismatch_report_${new Date().toISOString().split('T')[0]}.xlsx"`,
                },
            });
        }
        
        // JSON response
        return NextResponse.json({
            success: true,
            generatedAt: new Date().toISOString(),
            summary: {
                totalBatches: allBatches.length,
                matchedBatches: matchedBatches.length,
                orphanedBatches: orphanedBatches.length,
                licenseMismatches: licenseMismatches.length,
                totalMFCs: formulas.length,
                mfcsWithoutBatches: formulasWithoutBatches.length,
                reconciliationRate: `${((matchedBatches.length / allBatches.length) * 100).toFixed(2)}%`,
            },
            orphanedBatches: orphanedBatches.slice(0, 100), // Limit for JSON
            licenseMismatches: licenseMismatches.slice(0, 100),
            mfcsWithoutBatches: formulasWithoutBatches.slice(0, 100),
        });
        
    } catch (error) {
        console.error('Error generating reconciliation mismatch report:', error);
        return NextResponse.json(
            { 
                success: false, 
                message: error instanceof Error ? error.message : 'Unknown error occurred'
            },
            { status: 500 }
        );
    }
}
