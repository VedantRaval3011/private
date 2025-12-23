/**
 * Ingestion Types - TypeScript Interfaces
 * Defines types for the XML ingestion system
 */

// ============================================
// XML File Type Detection
// ============================================
export type XmlFileType = 'BATCH' | 'FORMULA' | 'UNKNOWN';

// ============================================
// Item-Level Duplicate Statistics
// ============================================
export interface DuplicateItemDetail {
  batchNumber: string;
  itemCode: string;
  itemName: string;
  type: string;                // e.g., "Export" or "Import"
  mfgDate?: string;
  expiryDate?: string;
  reason: string;              // e.g., "Already exists in file: BatchCrRegi-Jan-25.XML"
  existingFileName: string;    // The file where this item already exists
}

export interface SuccessfulItemDetail {
  batchNumber: string;
  itemCode: string;
  itemName: string;
  type: string;                // e.g., "Export" or "Import"
  mfgDate?: string;
  expiryDate?: string;
}

export interface ItemLevelStats {
  totalItems: number;
  newItems: number;
  duplicateItems: number;
  duplicateDetails: DuplicateItemDetail[];
  successfulDetails: SuccessfulItemDetail[];  // Items that were successfully stored
}

// ============================================
// Processing Log Record
// ============================================
export interface ProcessingLogRecord {
  _id?: string;
  contentHash: string;          // SHA-256 hash of XML content
  fileName: string;             // Original file name
  fileType: XmlFileType;        // Detected XML type
  status: 'SUCCESS' | 'DUPLICATE' | 'ERROR';
  businessKey?: string;         // BatchNo+ProductCode or FormulaCode+Version
  errorMessage?: string;        // Error details if status is ERROR
  processedAt: Date;
  fileSize: number;
  itemStats?: ItemLevelStats;   // Item-level duplicate statistics
}

// ============================================
// Ingestion Result (per file)
// ============================================
export interface IngestionResult {
  fileName: string;
  fileType: XmlFileType;
  status: 'SUCCESS' | 'DUPLICATE' | 'ERROR';
  message: string;
  businessKey?: string;
  recordId?: string;            // MongoDB _id of stored record
  itemStats?: ItemLevelStats;   // Item-level duplicate statistics
}

// ============================================
// Ingestion Status (overall)
// ============================================
export interface IngestionStatus {
  isProcessing: boolean;
  totalFiles: number;
  processed: number;
  successful: number;
  duplicates: number;
  errors: number;
  results: IngestionResult[];
}

// ============================================
// File Info from folder scan
// ============================================
export interface XmlFileInfo {
  fileName: string;
  filePath: string;
  fileSize: number;
  content: string;
}

// ============================================
// API Response Types
// ============================================
export interface IngestionResponse {
  success: boolean;
  message: string;
  status: IngestionStatus;
}

export interface ProcessingLogsResponse {
  success: boolean;
  data: ProcessingLogRecord[];
  total: number;
  page: number;
  limit: number;
}
