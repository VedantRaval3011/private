/**
 * PPM COA (Primary Packing Material Certificate of Analysis) Types
 * TypeScript interfaces for Primary Packing Material test data
 */

/**
 * Test parameter for PPM COA
 */
export interface PPMTestParameter {
    name: string;          // Test name
    limits: string;        // Specification limits
    result: string;        // Test result
    complies: boolean;     // Whether result complies with limits
}

/**
 * PPM COA Record stored in database
 */
export interface PPMCOARecord {
    _id?: string;

    // Core identification
    arNo: string;              // AR Number (primary identifier)
    materialCode: string;      // Primary Packing Material Code
    materialName: string;      // Material Name

    // Optional batch linkage
    batchNumber?: string;      // Batch number this PPM is used in

    // Test information
    testDate?: string;         // Date of COA test
    testNumber?: string;       // Test number
    status?: string;           // APPROVED, REJECTED, PENDING

    // Additional fields
    manufacturer?: string;     // Material manufacturer
    supplier?: string;         // Material supplier
    lotNumber?: string;        // Primary packing material lot number

    // Test parameters (if parsed from XML)
    testParameters?: PPMTestParameter[];

    // Metadata
    sourceFile: string;        // Original XML filename
    uploadedAt: Date;          // Upload timestamp
    contentHash?: string;      // For duplicate detection
    parsingStatus: 'success' | 'partial' | 'failed';
    parsingWarnings?: string[];
}

/**
 * API Response types
 */
export interface PPMCOAListResponse {
    success: boolean;
    data: PPMCOARecord[];
    total: number;
    uniqueArNumbers: number;
    uniqueMaterials: number;
}

export interface PPMCOAUploadResponse {
    success: boolean;
    message: string;
    processed: number;
    failed: number;
    records: PPMCOARecord[];
    errors?: string[];
}
