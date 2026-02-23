/**
 * Material Rejection XML Parser
 * Parses Material Rejection XML files (LIST_G_MATINWDTLID structure with STATUS=REJECTED)
 * Extracts: AR Number, Material Code, Material Name, Vendor Name, Received Qty, Dates
 */

export interface MaterialRejectionRecord {
    arNumber: string;
    arDate: string;
    grDate: string;
    materialCode: string;
    materialName: string;
    vendorName: string;
    receivedQty: number;
    unit: string;
    status: string;
}

export interface MaterialRejectionParseResult {
    success: boolean;
    records: MaterialRejectionRecord[];
    errors: string[];
    warnings: string[];
}

/**
 * Extract text content from an XML tag
 */
function extractTag(xml: string, tag: string): string {
    const regex = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i');
    const match = xml.match(regex);
    return match ? match[1].trim() : '';
}

/**
 * Parse Material Rejection XML content
 */
export function parseMaterialRejectionXml(xmlContent: string): MaterialRejectionParseResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const records: MaterialRejectionRecord[] = [];

    try {
        // Extract all G_MATINWDTLID blocks
        const blockRegex = /<G_MATINWDTLID>([\s\S]*?)<\/G_MATINWDTLID>/gi;
        let match;

        while ((match = blockRegex.exec(xmlContent)) !== null) {
            const block = match[1];

            const status = extractTag(block, 'STATUS');

            // Only process REJECTED records
            if (status !== 'REJECTED') {
                continue;
            }

            const arNumber = extractTag(block, 'ARNO') || extractTag(block, 'MATINWNO');
            const arDate = extractTag(block, 'ARDATE');
            const grDate = extractTag(block, 'GRDT1');
            const materialCode = extractTag(block, 'MATCODE');
            const materialName = extractTag(block, 'MATNAME') || extractTag(block, 'MATNAME1');
            const vendorName = extractTag(block, 'ACNAME1') || extractTag(block, 'MATMAKE');
            const receivedQtyStr = extractTag(block, 'INQTY') || extractTag(block, 'CF_RECQTY');
            const unit = extractTag(block, 'PUOM') || extractTag(block, 'CUOM') || 'NOS';

            if (!arNumber) {
                warnings.push(`Skipped record with missing AR Number`);
                continue;
            }

            const receivedQty = parseFloat(receivedQtyStr) || 0;

            records.push({
                arNumber,
                arDate,
                grDate,
                materialCode,
                materialName: materialName.replace(/\s+/g, ' ').trim(),
                vendorName: vendorName.replace(/\s+/g, ' ').trim(),
                receivedQty,
                unit,
                status: 'REJECTED',
            });
        }

        if (records.length === 0) {
            warnings.push('No REJECTED records found in the XML file');
        }

        return { success: true, records, errors, warnings };

    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown parse error';
        errors.push(errorMsg);
        return { success: false, records: [], errors, warnings };
    }
}
