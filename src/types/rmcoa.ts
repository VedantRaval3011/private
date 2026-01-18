/**
 * RM COA (Raw Material Certificate of Analysis) Types
 * TypeScript interfaces for Raw Material test data
 */

/**
 * Test parameter for RM COA
 */
export interface RMTestParameter {
    name: string;          // Test name (e.g., "ASSAY", "MOISTURE")
    limits: string;        // Specification limits
    result: string;        // Test result
    complies: boolean;     // Whether result complies with limits
}

/**
 * RM COA Record stored in database
 */
export interface RMCOARecord {
    _id?: string;

    // Core identification
    arNo: string;              // AR Number (primary identifier)
    materialCode: string;      // Raw Material Code
    materialName: string;      // Material Name

    // Optional batch linkage
    batchNumber?: string;      // Batch number this RM is used in

    // Test information
    testDate?: string;         // Date of COA test
    testNumber?: string;       // Test number
    status?: string;           // APPROVED, REJECTED, PENDING

    // Additional fields
    manufacturer?: string;     // Material manufacturer
    supplier?: string;         // Material supplier
    lotNumber?: string;        // Raw material lot number

    // Test parameters (if parsed from XML)
    testParameters?: RMTestParameter[];

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
export interface RMCOAListResponse {
    success: boolean;
    data: RMCOARecord[];
    total: number;
    uniqueArNumbers: number;
    uniqueMaterials: number;
}

export interface RMCOAUploadResponse {
    success: boolean;
    message: string;
    processed: number;
    failed: number;
    records: RMCOARecord[];
    errors?: string[];
}
