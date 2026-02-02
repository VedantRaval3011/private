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
 */
export async function parseInwardRegisterXml(xmlContent: string, fileName: string = 'Unknown'): Promise<ParseInwardResult> {
    const warnings: string[] = [];
    const errors: string[] = [];
    const records: InwardRegisterRecord[] = [];

    try {
        console.log(`[Parser] Starting extraction for ${fileName}...`);
        console.log(`[Parser] XML Content Length: ${xmlContent.length}`);

        // 1. Identify Header blocks (G_MATID)
        // The file seems to have multiple G_MATID blocks, each containing Vendor/Inward info
        // and a list of items (G_MATINWDTLID)

        // Use CASE INSENSTIVE split
        const headerBlocks = xmlContent.split(/<G_MATID>/i);

        // Skip the first chunk as it's the file preamble
        if (headerBlocks.length <= 1) {
            console.log('[Parser] No <G_MATID> tags found.');
            return {
                success: false,
                errors: ['No Inward Register headers found (missing <G_MATID> tags)'],
                warnings: []
            };
        }

        console.log(`[Parser] Found ${headerBlocks.length - 1} header groups. Processing...`);

        let processedHeaders = 0;

        // Process each Header block
        for (let i = 1; i < headerBlocks.length; i++) {
            const headerBlock = headerBlocks[i];

            // Extract Header Info
            const vendorName = extractTag(headerBlock, 'ACNAME');
            // MATINWNO seems to be the tag based on grep
            const inwardNumber = extractTag(headerBlock, 'MATINWNO');
            const inwardDate = extractTag(headerBlock, 'MATINWDATE');
            const challanNumber = extractTag(headerBlock, 'CHLNO');
            const challanDate = extractTag(headerBlock, 'CHLDT');

            // Now find items within this header
            const itemBlocks = headerBlock.split(/<G_MATINWDTLID>/i);

            // Skip the first part of the split (it's the header fields)

            if (itemBlocks.length > 1) {
                console.log(`   [Header ${i}] Found ${itemBlocks.length - 1} items for ${vendorName} (${inwardNumber})`);
            }

            for (let j = 1; j < itemBlocks.length; j++) {
                const itemBlock = itemBlocks[j];

                // Cleanup end tag if present
                const cleanBlock = itemBlock.split('</G_MATINWDTLID>')[0];

                // Extract Item Info
                const arNumber = extractTag(cleanBlock, 'ARNO'); // Removed TSTNO fallback
                const materialName = extractTag(cleanBlock, 'MATNAME');
                const materialCode = extractTag(cleanBlock, 'MATCODE') || extractTag(cleanBlock, 'MKMATCODE'); // Added fallback for code

                // Batch tag might be RBATCH, BATCHNO, LOTNO or just BATCH
                const batchNumber = extractTag(cleanBlock, 'RBATCH') ||
                    extractTag(cleanBlock, 'BATCHNO') ||
                    extractTag(cleanBlock, 'LOTNO') ||
                    extractTag(cleanBlock, 'BATCH');

                // Quantity - Prioritize Actual Received Qty (ACTRECQTY/INQTY/BALQTY) over Challan Qty
                const qtyStr = extractTag(cleanBlock, 'ACTRECQTY') ||
                    extractTag(cleanBlock, 'INQTY') ||
                    extractTag(cleanBlock, 'BALQTY') ||
                    extractTag(cleanBlock, 'CHLQTY') || '0';
                const receivedQuantity = parseFloat(qtyStr) || 0;

                const unit = extractTag(cleanBlock, 'PUOM') || extractTag(cleanBlock, 'CUOM');

                // Validation - expect at least an AR Number or Material Name
                if (arNumber || materialName || materialCode) {
                    records.push({
                        vendorName: vendorName || 'Unknown Vendor',
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
                }
            }
            processedHeaders++;
        }

        console.log(`[Parser] Extraction complete. Found ${records.length} total item records.`);

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
        console.error('[Parser] Critical Error:', error);
        return {
            success: false,
            errors: [error instanceof Error ? error.message : 'Unknown parsing error'],
            warnings
        };
    }
}
