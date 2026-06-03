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
  // Pharmacopoeial section this assay was parsed under, derived from
  // "[... AS PER IP]"/"[... AS PER USP]" markers. 'OTHER' when the COA has no
  // section markers (single-pharmacopoeia). Used to keep APQR Section 5.3.2
  // assay columns confined to the correct pharmacopoeia table.
  standard?: TestStandard;
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
  // Pharmacopoeial section this test was parsed under (IP/USP). Keeps APQR
  // Section 5.3.2 identification columns confined to the correct pharmacopoeia
  // table (e.g. "IDENTIFICATION B" is USP-only). 'OTHER' for single-pharmacopoeia
  // COAs with no section markers.
  standard?: TestStandard;
}

/**
 * Critical parameter for finished product review
 */
export interface CriticalParameter {
  name: string;         // e.g., "Uniformity of Weight", "pH", "Sterility"
  limit: string;
  result: string;
  complies: boolean;
  // Pharmacopoeial section this parameter was parsed under (IP/USP). Lets APQR
  // Section 5.3.2 pick the correct per-pharmacopoeia limit (e.g. IP pH "6.3 to
  // 7.3" vs USP pH "6.3 to 7.9"). 'OTHER' for single-pharmacopoeia COAs.
  standard?: TestStandard;
}

/**
 * Related substances/impurity data.
 * `group` identifies the test sub-group the entry was parsed from
 * (e.g. "RELATED SUBSTANCE BY HPLC", "EARLY-ELUTING RELATED COMPOUNDS").
 * `groupLimit` preserves the full LIMITS1 text for that sub-group so the
 * complete multi-line limits block can be rendered in APQR tables.
 */
export interface RelatedSubstance {
  compound: string;       // e.g., "Any secondary peak", "Specified unknown impurity 1"
  group?: string;         // parent test name, e.g. "EARLY-ELUTING RELATED COMPOUNDS"
  groupLimit?: string;    // full LIMITS1 text for the parent test (may be multi-line)
  limit: string;          // individual compound limit, e.g., "NMT 1.1%"
  result: string;         // e.g., "ND" or "0.030 %"
  complies: boolean;
  // Pharmacopoeial section this substance was parsed under (IP/USP). Keeps
  // IP-only "Related Substance by HPLC" out of the USP table and USP-only
  // "Early/Late-Eluting Related Compounds" out of the IP table. 'OTHER' for
  // single-pharmacopoeia COAs.
  standard?: TestStandard;
}

// ============================================
// COA (Certificate) Test Table (Finish COA rendering)
// ============================================

export type TestStandard = 'IP' | 'USP' | 'OTHER';

/**
 * One row from the COA "Test | Result | Specification" table.
 *
 * This intentionally supports:
 * - Duplicate test names across different standards (IP vs USP)
 * - A parent/child hierarchy (e.g., RELATED SUBSTANCES → EARLY/LATE ELUTING…)
 * - Stable ordering (via `sortOrder`)
 */
export interface COATestItem {
  id: string;
  parentId?: string | null;
  standard: TestStandard;
  test: string;
  result: string;
  specification: string;
  sortOrder: number;
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
  specification: string;      // SPEC (pharmacopeia ref, e.g. "IH", "USP")
  specDocNo: string;          // ITMSPEC (spec document number, e.g. "SPFHY208B1D")
  packSize: string;           // PACK or PACK1
  releaseQty: string;         // RELESEQTY with RELEASEUOM
  
  // Critical Parameters
  criticalParameters: CriticalParameter[];
  
  // Identification Tests
  identificationTests: IdentificationTest[];
  
  // Related Substances / Impurities
  relatedSubstances: RelatedSubstance[];

  /**
   * Full COA table rows for FINISH COA "View COA" rendering.
   * This preserves IP/USP grouping markers and the table hierarchy.
   */
  coaTests?: COATestItem[];
  
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

// ============================================
// Section 5.3.2 — Finished Product Analysis
// ============================================

/**
 * One column in a Section 5.3.2 dynamic table.
 */
export interface Finish532Column {
  name: string;        // e.g., "Description", "Identification", "Related Substance"
  subHeader: string;   // compound name shown on the sub-header row, may be empty
  limitText: string;   // full limit text (may be multi-line) shown in the Limit → row
}

/**
 * One data row in a Section 5.3.2 table.
 */
export interface Finish532Row {
  batchNumber: string;
  arNumber: string;
  values: string[];    // one value per column; multi-line values use '\n'
}

/**
 * A single rendered table for Section 5.3.2.
 *
 * Each table is preceded by an optional specification heading paragraph
 * ("AS PER IP:", "AS PER USP:", etc.).
 *
 * Header structure (3 rows + 1 limit data row):
 *   Row 0: Batch Number [vMerge] | AR. Number [vMerge] | critParamsTitle [span=N]
 *   Row 1: [cont] | [cont] | (hasGroupRow → groupLabel [span=N]) | (else → col.name each)
 *   Row 2: [cont] | [cont] | (hasGroupRow → col.name each) | (else → col.subHeader each)
 *   Limit row (data): "Limit →" [span=2] | col.limitText each
 *   Data rows: batchNumber | arNumber | values…
 */
export interface Finish532Table {
  specificationLabel: string;  // "AS PER IP:", "AS PER USP:", "" for org. impurities
  critParamsTitle: string;     // "Critical Parameters (Limit) (As per IP)"
  hasGroupRow: boolean;        // true → organic impurities table layout
  groupLabel: string;          // "Organic Impurities" (when hasGroupRow is true)
  columns: Finish532Column[];
  dataRows: Finish532Row[];
}

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
