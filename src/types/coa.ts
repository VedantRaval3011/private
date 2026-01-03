/**
 * COA Data Types
 * TypeScript interfaces for BULK and FINISH stage pharmaceutical data
 * Matches APQR (Annual Product Quality Review) format requirements
 */

// ============================================
// Common Structures
// ============================================

/**
 * QA Signature information extracted from XML footer
 */
export interface QASignature {
  preparedBy: string;
  reviewedBy: string;
  signDate: string;
}

/**
 * Generic test parameter with limits and result
 */
export interface TestParameter {
  srNo: number;
  name: string;         // PROTEST1 from XML (DESCRIPTION, PH, ASSAY, etc.)
  limits: string;       // LIMITS1 from XML
  result: string;       // RESULT from XML
  complies: boolean;    // Derived from comparing result to limits
}

/**
 * Assay result for active pharmaceutical ingredients
 */
export interface AssayResult {
  compound: string;     // e.g., DORZOLAMIDE HYDROCHLORIDE E.Q. DORZOLAMIDE
  limitMin: string;     // e.g., "95.0%"
  limitMax: string;     // e.g., "105.0%"
  specification: string; // Full specification text (may be multi-line)
  result: string;       // e.g., "103.1%"
  resultAlt?: string;   // Alternative format, e.g., "2.06 % w/v"
  complies: boolean;
}

/**
 * Identification test result
 */
export interface IdentificationTest {
  compound: string;     // e.g., CEPHALEXIN, PREDNISOLONE
  method: string;       // e.g., "TLC", "HPLC"
  specification: string;
  result: string;       // e.g., "Complies"
  complies: boolean;
}

/**
 * Critical parameter for finished product review
 */
export interface CriticalParameter {
  name: string;         // e.g., "Uniformity of Weight", "pH", "Sterility"
  limit: string;
  result: string;
  complies: boolean;
}

/**
 * Related substances/impurity data
 */
export interface RelatedSubstance {
  compound: string;     // e.g., "Dorzolamide impurity B"
  limit: string;        // e.g., "NMT 1.1%"
  result: string;       // e.g., "ND" (Not Detected)
  complies: boolean;
}

// ============================================
// BULK Stage Data (In-Process Results)
// ============================================

/**
 * Data extracted from BULK XML files
 * Represents in-process analysis at bulk manufacturing stage
 * Matches "5.3.1 In-Process Analysis Results at Bulk Stage" format
 */
export interface BulkStageData {
  // Batch Identification
  batchNumber: string;        // BATCH from XML
  arNumber: string;           // FGARNO (AR/COA Number)
  testNumber: string;         // FGTESTNO
  testDate: string;           // FGTESTDT
  
  // Product Information
  productName: string;        // ITMNAME
  productCode: string;        // ITMCODE
  genericName: string;        // GENERICNM
  description: string;        // From DESCRIPTION test parameter RESULT
  
  // Manufacturing Details
  manufacturer: string;       // MAKE (INDIANA, etc.)
  mfgLicenseNo: string;       // MFGLICNO
  batchSize: string;          // BATBATCHSIZE
  mfgDate: string;            // MFGDT
  expDate: string;            // EXPDT
  specification: string;      // SPEC (BP, USP, etc.)
  
  // Test Parameters (In-process controls)
  testParameters: TestParameter[];
  
  // Assay Results (Active ingredients)
  assayResults: AssayResult[];
  
  // Remarks
  remarks?: string;           // FGRMK
  
  // QA Information
  analystName: string;        // ANALYSTNAME
  analystDate: string;        // ANALIST_DATE
  qaData: QASignature;
  
  // Status
  status: string;             // STATUS (APPROVED, etc.)
}

// ============================================
// FINISH Stage Data (Finished Product Results)
// ============================================

/**
 * Data extracted from FINISH XML files
 * Represents finished product quality analysis
 * Matches "5.3.2 Finished Product Analysis" format
 */
export interface FinishStageData {
  // Batch Identification
  batchNumber: string;        // BATCH or BATCH1 from XML
  arNumber: string;           // FGARNO
  testNumber: string;         // FGTESTNO
  testDate: string;           // FGTESTDT
  
  // Product Information
  productName: string;        // ITMNAME
  productCode: string;        // ITMCODE
  genericName: string;        // GENERICNM
  description: string;        // From DESCRIPTION test parameter
  
  // Manufacturing Details
  manufacturer: string;       // MAKE
  mfgLicenseNo: string;       // MFGLICNO
  batchSize: string;          // ACTUALBATCHSIZE or BATCHSIZE
  mfgDate: string;            // MFGDT
  expDate: string;            // EXPDT
  specification: string;      // SPEC
  packSize: string;           // PACK or PACK1
  releaseQty: string;         // RELESEQTY with RELEASEUOM
  
  // Critical Parameters
  criticalParameters: CriticalParameter[];
  
  // Identification Tests
  identificationTests: IdentificationTest[];
  
  // Related Substances / Impurities
  relatedSubstances: RelatedSubstance[];
  
  // Assay Results
  assayResults: AssayResult[];
  
  // Additional Tests
  sterility?: TestParameter;
  uniformityOfVolume?: TestParameter;
  capping?: TestParameter;
  
  // Remarks
  remarks?: string;
  
  // QA Information
  analystName: string;
  analystDate: string;
  qaData: QASignature;
  
  // Status
  status: string;
}

// ============================================
// Combined COA Record
// ============================================

export type COAStage = 'BULK' | 'FINISH';

/**
 * Complete COA record stored in database
 */
export interface COARecord {
  _id?: string;
  
  // Core identification
  batchNumber: string;
  stage: COAStage;
  arNumber: string;
  
  // Product info (common)
  productName: string;
  productCode: string;
  genericName: string;
  manufacturer: string;
  
  // Stage-specific data (one will be populated based on stage)
  bulkData?: BulkStageData;
  finishData?: FinishStageData;
  
  // Metadata
  sourceFile: string;
  uploadedAt: Date;
  contentHash: string;
  parsingStatus: 'success' | 'partial' | 'failed';
  parsingWarnings?: string[];
}

// ============================================
// API Response Types
// ============================================

export interface COAUploadResponse {
  success: boolean;
  message: string;
  processed: number;
  failed: number;
  records: COARecord[];
  errors?: string[];
}

export interface COAListResponse {
  success: boolean;
  data: COARecord[];
  total: number;
  bulkCount: number;
  finishCount: number;
  linkedBatches: number; // Batches with both BULK and FINISH
}

export interface BatchCOAResponse {
  success: boolean;
  batchNumber: string;
  bulk?: COARecord;
  finish?: COARecord;
  isComplete: boolean; // true if both BULK and FINISH exist
}

// ============================================
// APQR Summary Types (for report generation)
// ============================================

/**
 * Single row in APQR Bulk Stage Summary table
 * Matches Image 3 format
 */
export interface APQRBulkRow {
  batchNumber: string;
  arNumber: string;
  description: string; // e.g., "Creamy oily homogeneous ointment"
}

/**
 * Single row in APQR Finished Product Summary table
 * Matches Image 1 and Image 2 format
 */
export interface APQRFinishRow {
  batchNumber: string;
  arNumber: string;
  uniformityOfWeight?: string;
  cephalexinAssay?: string;
  prednisoloneAssay?: string;
  neomycinAssay?: string;
  cephalexinIdentification?: string;
  prednisoloneIdentification?: string;
  description?: string;
}

/**
 * Complete APQR Summary for a product
 */
export interface APQRSummary {
  productName: string;
  specification: string;
  reviewPeriod: string;
  
  bulkStageResults: APQRBulkRow[];
  finishedProductResults: APQRFinishRow[];
  
  remarks: {
    bulk?: string;
    finish?: string;
  };
  
  preparedByQA: string;
  reviewedByQA: string;
  signDate: string;
}
