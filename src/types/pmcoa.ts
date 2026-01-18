/**
 * PM COA (Packing Material Certificate of Analysis) Types
 * TypeScript interfaces for Packing Material test data
 */

/**
 * Test parameter for PM COA
 */
export interface PMTestParameter {
    name: string;          // Test name
    limits: string;        // Specification limits
    result: string;        // Test result
    complies: boolean;     // Whether result complies with limits
}

/**
 * PM COA Record stored in database
 */
export interface PMCOARecord {
    _id?: string;

    // Core identification
    arNo: string;              // AR Number (primary identifier)
    materialCode: string;      // Packing Material Code
    materialName: string;      // Material Name

    // Optional batch linkage
    batchNumber?: string;      // Batch number this PM is used in

    // Test information
    testDate?: string;         // Date of COA test
    testNumber?: string;       // Test number
    status?: string;           // APPROVED, REJECTED, PENDING

    // Additional fields
    manufacturer?: string;     // Material manufacturer
    supplier?: string;         // Material supplier
    lotNumber?: string;        // Packing material lot number

    // Test parameters (if parsed from XML)
    testParameters?: PMTestParameter[];

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
export interface PMCOAListResponse {
    success: boolean;
    data: PMCOARecord[];
    total: number;
    uniqueArNumbers: number;
    uniqueMaterials: number;
}

export interface PMCOAUploadResponse {
    success: boolean;
    message: string;
    processed: number;
    failed: number;
    records: PMCOARecord[];
    errors?: string[];
}
