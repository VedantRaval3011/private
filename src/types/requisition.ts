/**
 * Requisition Types - TypeScript Interfaces
 * Defines types for Material Requisition (MATREQ) XML processing
 */

// ============================================
// Material Types
// ============================================
export type MaterialCategory = 'RM' | 'PPM' | 'PM';
export type ValidationStatus = 'matched' | 'mismatch' | 'pending';

// ============================================
// Requisition Material Item
// ============================================
export interface RequisitionMaterial {
  srNo: number;
  materialCode: string;
  materialName: string;
  materialType: MaterialCategory;
  stage: string;
  process: string;
  
  // Quantity fields
  quantityRequired: number;     // REQQTY from XML (or CF_REQQTY)
  quantityToIssue: number;      // QTY from XML (or CF_QTY)
  unit: string;
  
  // Validation against Master Formula
  masterFormulaQty?: number;    // From Master Formula lookup
  validationStatus: ValidationStatus;
  variancePercent?: number;     // Difference percentage
  
  // Identifiers for duplicate detection
  matReqDtlId: string;          // Unique line item ID
  matReqId: string;             // Parent requisition ID
  matReqNo: string;             // Requisition number
  matId: string;                // Material ID
  
  // Additional details
  binCode?: string;
  grNo?: string;                // GR number
  arNo?: string;                // AR number
  challanNo?: string;
  challanDate?: string;
  expiryDate?: string;
  mfgDate?: string;
  
  // New fields from latest requirement
  ovgPercent?: number;          // OVG % from XML
  vendorCode?: string;          // Vendor Code from XML
  artworkNo?: string;           // Art Work No from XML
  labelClaim?: string;          // Label Claim from XML
  
  // Parent Batch Info (for display in flattened tables)
  batchNumber?: string;
  mfcNo?: string;
  itemName?: string;            // Product Name
}

// ============================================
// Requisition Batch Header
// ============================================
export interface RequisitionBatch {
  batchNumber: string;
  batchSize: number;
  batchUom: string;
  
  // Product details
  itemCode: string;
  itemName: string;
  itemDetail: string;
  pack: string;
  unit: string;
  
  // MFC reference for Master Formula lookup
  mfcNo: string;                // MCADNO - Master Card Number
  formastId: string;            // Formula Master ID
  
  // Requisition info
  matReqId: string;
  matReqNo: string;
  matReqDate: string;
  matReqRemark: string;
  
  // Manufacturer info
  make: string;
  year: string;
  department: string;
  locationCode: string;
  
  // Dates
  mfgDate: string;
  expiryDate: string;
  
  // Materials under this batch
  materials: RequisitionMaterial[];
}

// ============================================
// Requisition Record (Database)
// ============================================
export interface RequisitionRecord {
  _id?: string;
  uniqueIdentifier: string;
  
  // File metadata
  uploadedAt: Date;
  fileName: string;
  fileSize: number;
  rawXmlContent?: string;
  contentHash: string;
  
  // Parsing status
  parsingStatus: 'success' | 'partial' | 'failed';
  parsingErrors: string[];
  
  // Batches with materials
  batches: RequisitionBatch[];
  
  // Aggregated materials by category (for quick access)
  rawMaterials: RequisitionMaterial[];      // RM
  primaryPackaging: RequisitionMaterial[];  // PPM
  packingMaterials: RequisitionMaterial[];  // PM
  
  // Summary
  totalBatches: number;
  totalMaterials: number;
  validatedCount: number;
  mismatchCount: number;
  
  // Source info
  locationCode: string;
  make: string;
}

// ============================================
// Parse Result
// ============================================
export interface RequisitionParseResult {
  success: boolean;
  data?: {
    batches: RequisitionBatch[];
    rawMaterials: RequisitionMaterial[];
    primaryPackaging: RequisitionMaterial[];
    packingMaterials: RequisitionMaterial[];
    locationCode: string;
    make: string;
  };
  totalFound: number;
  errors: string[];
  warnings: string[];
}

// ============================================
// Validation Result (for Master Formula comparison)
// ============================================
export interface MaterialValidationResult {
  materialCode: string;
  materialName: string;
  category: MaterialCategory;
  
  // Quantities
  formulaQtyRequired: number;   // From Master Formula
  totalQtyIssued: number;       // Sum of all requisitions
  difference: number;
  variancePercent: number;
  
  // Status
  isMatched: boolean;
  
  // Details
  requisitionItems: {
    matReqNo: string;
    batchNumber: string;
    qtyIssued: number;
  }[];
}

export interface BatchValidationSummary {
  batchNumber: string;
  mfcNo: string;
  productName: string;
  
  totalMaterials: number;
  matchedCount: number;
  mismatchCount: number;
  pendingCount: number;
  
  validationResults: MaterialValidationResult[];
}

// ============================================
// API Response Types
// ============================================
export interface RequisitionResponse {
  success: boolean;
  message: string;
  data?: RequisitionRecord[];
  total?: number;
}

export interface RequisitionValidationResponse {
  success: boolean;
  message: string;
  data?: BatchValidationSummary[];
}

// ============================================
// Item-Level Duplicate Statistics
// ============================================
export interface RequisitionItemStats {
  totalItems: number;
  newItems: number;
  duplicateItems: number;
  duplicateDetails: {
    matReqDtlId: string;
    materialCode: string;
    materialName: string;
    batchNumber: string;
    reason: string;
    existingFileName: string;
  }[];
}
