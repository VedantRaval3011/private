/**
 * Reconciliation Types
 * Defines the structure for Formula Master vs Batch Creation reconciliation
 */

// ============================================
// Individual Batch Validation Result
// ============================================
export interface BatchValidationResult {
  batchNumber: string;
  itemCode: string;
  itemName: string;
  mfgDate: string;
  expiryDate: string;
  batchSize: string;
  department: string;
  type: 'Export' | 'Import';
  
  // Validation Status
  isValid: boolean;
  
  // Specific Validation Flags
  formulaExists: boolean;
  revisionMatch: 'valid' | 'old_revision' | 'invalid_revision' | 'unknown';
  mfcMatch: boolean;
  materialMatch: boolean;
  obsoleteFormulaUsed: boolean;
  
  // Mismatch Details
  mismatches: {
    type: 'formula_missing' | 'revision_mismatch' | 'mfc_mismatch' | 'material_missing' | 'material_extra' | 'obsolete_formula';
    description: string;
    severity: 'critical' | 'warning' | 'info';
  }[];
}

// ============================================
// Formula-wise Reconciliation Summary
// ============================================
export interface FormulaReconciliationResult {
  // Formula Master Details
  formulaId: string;
  masterCardNo: string;
  productCode: string;
  productName: string;
  revisionNo: string;
  manufacturer: string;
  status: 'active' | 'obsolete' | 'unknown';
  
  // Batch Statistics
  stats: {
    totalBatches: number;
    batchesInUse: number;       // Non-cancelled, non-rejected
    cancelledBatches: number;
    rejectedBatches: number;
    reconciledBatches: number;
    mismatchedBatches: number;
  };
  
  // Mismatch Summary
  mismatchSummary: {
    oldRevisionBatches: number;
    invalidRevisionBatches: number;
    formulaMissingBatches: number;  // Edge case: batch references non-existent formula
    mfcMismatches: number;
    materialMismatches: number;
    obsoleteFormulaUsed: number;
  };
  
  // Reconciliation Status
  reconciliationStatus: 'fully_reconciled' | 'partially_reconciled' | 'not_reconciled' | 'no_batches';
  
  // Linked Filling Product Codes
  linkedProductCodes: string[];
  
  // Individual Batch Results (for drill-down)
  batchDetails: BatchValidationResult[];
  
  // Compliance Notes
  complianceNotes: string[];
}

// ============================================
// Orphan Batch (No Formula Master)
// ============================================
export interface OrphanBatchResult {
  itemCode: string;
  itemName: string;
  batchCount: number;
  batches: {
    batchNumber: string;
    mfgDate: string;
    batchSize: string;
  }[];
  complianceRisk: 'high' | 'medium';
  reason: string;
}

// ============================================
// Overall Reconciliation Report
// ============================================
export interface ReconciliationReport {
  // Report Metadata
  generatedAt: Date;
  reportId: string;
  
  // Data Source Summary
  dataSources: {
    formulaMasterCount: number;
    totalBatchRecords: number;
    uniqueProductCodes: number;
  };
  
  // Batch Reconciliation Summary (Key Metric)
  batchReconciliation: {
    totalBatchesInSystem: number;          // Total batches from Batch Creation
    batchesMatchedToFormula: number;       // Batches that found a Formula Master
    batchesNotMatchedToFormula: number;    // Orphan batches (no formula)
    allBatchesAccountedFor: boolean;       // true if matched + notMatched = total
    reconciledBatchCount: number;          // Batches with no mismatches
    mismatchedBatchCount: number;          // Batches with mismatches
    reconciliationPercentage: number;      // % of batches fully reconciled
  };
  
  // Formula-wise Results
  formulaResults: FormulaReconciliationResult[];
  
  // Orphan Batches (no formula master)
  orphanBatches: OrphanBatchResult[];
  
  // Overall Statistics
  overallStats: {
    fullyReconciledFormulas: number;
    partiallyReconciledFormulas: number;
    notReconciledFormulas: number;
    formulasWithNoBatches: number;
    totalOrphanBatches: number;
    totalMismatches: number;
    complianceScore: number;  // 0-100%
  };
  
  // Priority Recommendations
  recommendations: {
    type: 'revision_update' | 'formula_cleanup' | 'mfc_correction' | 'urgent_review' | 'obsolete_review';
    formulaId?: string;
    masterCardNo?: string;
    description: string;
    priority: 'high' | 'medium' | 'low';
  }[];
}

// ============================================
// API Response Types
// ============================================
export interface ReconciliationApiResponse {
  success: boolean;
  message: string;
  data?: ReconciliationReport;
  errors?: string[];
}
