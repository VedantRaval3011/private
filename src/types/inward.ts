/**
 * Inward Register Types
 * Defines the structure for Material Inward Register data
 */

export interface InwardRegisterRecord {
    _id?: string;

    // Core Data
    inwardNumber: string;
    inwardDate?: string;
    vendorName: string;
    arNumber: string;

    // Material Details
    materialName: string;
    materialCode?: string;
    batchNumber?: string;
    challanNumber?: string;
    challanDate?: string;

    // Quantities
    receivedQuantity?: number;
    acceptedQuantity?: number;
    rejectedQuantity?: number;
    unit?: string;

    // Metadata
    sourceFile: string;
    uploadedAt: Date;
    manufacturedBy?: string;
    contentHash?: string;
    parsingStatus?: 'success' | 'partial' | 'failed';
    parsingWarnings?: string[];
}

export interface InwardRegisterUploadResponse {
    success: boolean;
    message: string;
    processed: number;
    failed: number;
    records: InwardRegisterRecord[];
    errors?: string[];
}

export interface InwardRegisterListResponse {
    success: boolean;
    data: InwardRegisterRecord[];
    total: number;
    page: number;
    limit: number;
}
