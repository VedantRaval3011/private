/**
 * Batch Availability Validation Types
 * Types for validating batch data across Bulk, Finish, RM, PPM, PM sections
 */

// ============================================
// Validation Status Types
// ============================================
export type SectionType = 'Bulk' | 'Finish' | 'RM' | 'PPM' | 'PM';

export interface SectionStatus {
  available: boolean;
  itemCount: number;
  missingMaterials?: string[];
}

export interface BatchSectionData {
  bulk: SectionStatus;
  finish: SectionStatus;
  rm: SectionStatus;
  ppm: SectionStatus;
  pm: SectionStatus;
}

// ============================================
// Validation Issue (Missing Data Report)
// ============================================
export interface ValidationIssue {
  batchNumber: string;
  mfcNo: string;
  productName: string;
  section: SectionType;
  message: string;
  details?: string;
}

// ============================================
// Batch Validation Result
// ============================================
export interface BatchValidationResult {
  batchNumber: string;
  mfcNo: string;
  productCode: string;
  productName: string;
  mfgDate: string;
  sections: BatchSectionData;
  issues: ValidationIssue[];
  isComplete: boolean; // true if all 5 sections available
}

// ============================================
// MFC Validation Summary
// ============================================
export interface MFCValidationSummary {
  mfcNo: string;
  productCode: string;
  productName: string;
  totalBatches: number;
  completeBatches: number;
  incompleteBatches: number;
  batches: BatchValidationResult[];
  issues: ValidationIssue[];
}

// ============================================
// API Response
// ============================================
export interface ValidationResponse {
  success: boolean;
  message: string;
  summary: {
    totalMFCs: number;
    totalBatches: number;
    completeBatches: number;
    incompleteBatches: number;
    issuesBySection: Record<SectionType, number>;
  };
  mfcs: MFCValidationSummary[];
  allIssues: ValidationIssue[];
}
