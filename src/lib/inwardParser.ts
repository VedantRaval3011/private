/**
 * Inward Register XML Parser
 * Parses Material Inward Register XML files
 * Structure: MATINWREGI -> LIST_G_MATID -> G_MATID (Header) -> LIST_G_MATINWDTLID -> G_MATINWDTLID (Item)
 */

import type { InwardRegisterRecord } from '@/types/inward';
import { generateNormalizedHash } from './contentHash';

export interface ParseInwardResult {
    success: boolean;
    data?: {
        records: InwardRegisterRecord[];
        totalRecords: number;
        companyName?: string;
    };
    errors: string[];
    warnings: string[];
}

/**
 * Helper to decode HTML entities
 */
function decodeHtml(text: string): string {
    if (!text) return text;
    return text
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
}

/**
 * Helper to extract tag value
 */
function extractTag(content: string, tagName: string): string {
    // Try exact match first
    const regex = new RegExp(`<${tagName}>([^<]*)<\/${tagName}>`, 'i');
    const match = content.match(regex);
    if (match) return decodeHtml(match[1].trim());
    return '';
}

/**
 * Parse Inward Register XML content
 * FIXED: Extract MATINWNO from item block (G_MATINWDTLID) as well as header block
 */
export async function parseInwardRegisterXml(xmlContent: string, fileName: string = 'Unknown'): Promise<ParseInwardResult> {
    const warnings: string[] = [];
    const errors: string[] = [];
    const records: InwardRegisterRecord[] = [];

    // Stats for logging
    let successCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    const failedItems: { header: number; item: number; reason: string }[] = [];

    try {
        console.log('\n========================================');
        console.log('📦 INWARD REGISTER PARSING STARTED');
        console.log('========================================');
        console.log(`📄 File: ${fileName}`);
        console.log(`📊 XML Content Length: ${xmlContent.length} characters`);

        // 1. Identify Header blocks (G_MATID)
        // The file seems to have multiple G_MATID blocks, each containing Vendor/Inward info
        // and a list of items (G_MATINWDTLID)

        // Use CASE INSENSTIVE split
        const headerBlocks = xmlContent.split(/<G_MATID>/i);

        // Skip the first chunk as it's the file preamble
        if (headerBlocks.length <= 1) {
            console.log('❌ No <G_MATID> tags found.');
            return {
                success: false,
                errors: ['No Inward Register headers found (missing <G_MATID> tags)'],
                warnings: []
            };
        }

        console.log(`\n📋 Found ${headerBlocks.length - 1} header groups (G_MATID). Processing...\n`);

        let processedHeaders = 0;
        let totalItemCount = 0;

        // Process each Header block
        for (let i = 1; i < headerBlocks.length; i++) {
            const headerBlock = headerBlocks[i];

            // Extract Header Info (these can be at header level OR item level)
            const headerVendorName = extractTag(headerBlock, 'ACNAME');
            const headerInwardNumber = extractTag(headerBlock, 'MATINWNO'); // May be at header level
            const headerInwardDate = extractTag(headerBlock, 'MATINWDATE');
            const headerChallanNumber = extractTag(headerBlock, 'CHLNO');
            const headerChallanDate = extractTag(headerBlock, 'CHLDT');

            // Header level fallbacks
            const headerBatch = extractTag(headerBlock, 'RBATCH') || extractTag(headerBlock, 'BATCHNO') || extractTag(headerBlock, 'LOTNO');
            const headerArNo = extractTag(headerBlock, 'ARNO');

            // Now find items within this header
            const itemBlocks = headerBlock.split(/<G_MATINWDTLID>/i);

            // Skip the first part of the split (it's the header fields)
            const itemCount = itemBlocks.length - 1;
            totalItemCount += itemCount;

            if (itemCount > 0 && i <= 5) { // Log first 5 headers for visibility
                console.log(`   [Header ${i}] Found ${itemCount} items | Vendor: ${headerVendorName?.substring(0, 30) || 'N/A'}...`);
            }

            for (let j = 1; j < itemBlocks.length; j++) {
                const itemBlock = itemBlocks[j];

                try {
                    // Cleanup end tag if present - CASE INSENSITIVE
                    const cleanBlock = itemBlock.split(/<\/G_MATINWDTLID>/i)[0];

                    // FIXED: Extract MATINWNO from item block FIRST, fallback to header
                    const itemInwardNumber = extractTag(cleanBlock, 'MATINWNO');
                    const inwardNumber = itemInwardNumber || headerInwardNumber;

                    // FIXED: AR Number Logic (Smart Heuristic)
                    // 1. Use explicit item-level ARNO if present
                    // 2. Else check Header ARNO:
                    //    - If it contains '.' (e.g. IW2...70.1), it's a specific report -> KEEP IT
                    //    - If prefix differs from Inward No (e.g. IW2 vs IWA), it's different series -> KEEP IT
                    // 3. Otherwise (if header AR is similar/sequential to Inward No), use Inward No as AR
                    const itemArNo = extractTag(cleanBlock, 'ARNO');
                    let arNumber = inwardNumber; // Default fallback

                    if (itemArNo) {
                        arNumber = itemArNo;
                    } else if (headerArNo) {
                        const hasDot = headerArNo.includes('.');
                        const prefixDiffers = inwardNumber && headerArNo.substring(0, 3) !== inwardNumber.substring(0, 3);

                        if (hasDot || prefixDiffers) {
                            arNumber = headerArNo;
                        } else {
                            arNumber = inwardNumber;
                        }
                    }
                    const materialName = extractTag(cleanBlock, 'MATNAME');
                    const materialCode = extractTag(cleanBlock, 'MATCODE') || extractTag(cleanBlock, 'MKMATCODE'); // Added fallback for code

                    // Batch tag might be RBATCH, BATCHNO, LOTNO or just BATCH
                    const batchNumber = extractTag(cleanBlock, 'RBATCH') ||
                        extractTag(cleanBlock, 'BATCHNO') ||
                        extractTag(cleanBlock, 'LOTNO') ||
                        extractTag(cleanBlock, 'BATCH') ||
                        headerBatch;

                    // Quantity - Prioritize Actual Received Qty (ACTRECQTY/INQTY/BALQTY) over Challan Qty
                    const qtyStr = extractTag(cleanBlock, 'ACTRECQTY') ||
                        extractTag(cleanBlock, 'INQTY') ||
                        extractTag(cleanBlock, 'BALQTY') ||
                        extractTag(cleanBlock, 'CHLQTY') || '0';
                    const receivedQuantity = parseFloat(qtyStr) || 0;

                    const unit = extractTag(cleanBlock, 'PUOM') || extractTag(cleanBlock, 'CUOM');

                    // Vendor name can also be at item level
                    const vendorName = extractTag(cleanBlock, 'ACNAME') || headerVendorName;

                    // Manufactured by (Mfg. By) — MATMAKE tag
                    const manufacturedBy = extractTag(cleanBlock, 'MATMAKE') ||
                                           extractTag(headerBlock, 'MATMAKE');

                    // Make (brand) — MAKE tag, stored separately
                    const make = extractTag(cleanBlock, 'MAKE') ||
                                 extractTag(headerBlock, 'MAKE');

                    // Inward date from item or header
                    const inwardDate = extractTag(cleanBlock, 'MATINWDATE') || headerInwardDate;

                    // Challan info from item or header
                    const challanNumber = extractTag(cleanBlock, 'CHLNO') || headerChallanNumber;
                    const challanDate = extractTag(cleanBlock, 'CHLDT') || headerChallanDate;

                    // Validation - expect at least an AR Number or Material Name or Inward Number
                    if (arNumber || materialName || materialCode || inwardNumber) {
                        records.push({
                            vendorName: vendorName || 'Unknown Vendor',
                            manufacturedBy,
                            make,
                            inwardNumber: inwardNumber || 'Unknown Inward No',
                            inwardDate,
                            arNumber: arNumber || 'N/A',
                            materialName: materialName || 'Unknown Material',
                            materialCode,
                            batchNumber,
                            challanNumber,
                            challanDate,
                            receivedQuantity,
                            unit,
                            sourceFile: fileName,
                            uploadedAt: new Date(),
                            contentHash: generateNormalizedHash(cleanBlock + inwardNumber), // Hash of item + context
                            parsingStatus: 'success'
                        });
                        successCount++;

                        // Log occasionally to show progress
                        if (successCount % 1000 === 0) {
                            console.log(`   ✅ Processed ${successCount} items...`);
                        }
                    } else {
                        skippedCount++;
                        const reason = 'Missing all key fields (AR, Material Name, Material Code, Inward No)';
                        failedItems.push({ header: i, item: j, reason });
                        if (skippedCount <= 10) { // Only log first 10 skipped
                            console.warn(`   ⚠️ Skipped item ${j} in header ${i}: ${reason}`);
                        }
                    }
                } catch (itemError) {
                    errorCount++;
                    const errorMsg = itemError instanceof Error ? itemError.message : 'Unknown error';
                    failedItems.push({ header: i, item: j, reason: errorMsg });
                    console.error(`   ❌ Error Parsing Item ${j} in Header ${i}: ${errorMsg}`);
                    errors.push(`Failed to parse item ${j} in header ${i}: ${errorMsg}`);
                    // Continue to next item
                }
            }
            processedHeaders++;

            // Log progress every 100 headers
            if (processedHeaders % 100 === 0) {
                console.log(`   📊 Processed ${processedHeaders}/${headerBlocks.length - 1} headers...`);
            }
        }

        // Final Summary
        console.log('\n========================================');
        console.log('📊 PARSING SUMMARY');
        console.log('========================================');
        console.log(`   📁 File: ${fileName}`);
        console.log(`   📋 Total Header Groups: ${processedHeaders}`);
        console.log(`   📦 Total Items Found: ${totalItemCount}`);
        console.log(`   ✅ Successfully Parsed: ${successCount}`);
        console.log(`   ⚠️ Skipped (validation): ${skippedCount}`);
        console.log(`   ❌ Errors: ${errorCount}`);

        if (failedItems.length > 0 && failedItems.length <= 20) {
            console.log('\n   📝 Failed Items Detail:');
            failedItems.forEach((f, idx) => {
                console.log(`      ${idx + 1}. Header ${f.header}, Item ${f.item}: ${f.reason}`);
            });
        } else if (failedItems.length > 20) {
            console.log(`\n   📝 First 20 failed items (${failedItems.length} total):`);
            failedItems.slice(0, 20).forEach((f, idx) => {
                console.log(`      ${idx + 1}. Header ${f.header}, Item ${f.item}: ${f.reason}`);
            });
        }

        console.log('========================================\n');

        // Add warnings for skipped/error items
        if (skippedCount > 0) {
            warnings.push(`${skippedCount} items were skipped due to missing key fields`);
        }
        if (errorCount > 0) {
            warnings.push(`${errorCount} items had parsing errors`);
        }

        return {
            success: true,
            data: {
                records,
                totalRecords: records.length
            },
            errors,
            warnings
        };

    } catch (error) {
        console.error('❌ [Parser] Critical Error:', error);
        return {
            success: false,
            errors: [error instanceof Error ? error.message : 'Unknown parsing error'],
            warnings
        };
    }
}
