/**
 * Formula Master XML - TypeScript Interfaces
 * Defines the complete structure for parsed XML data
 */

// ============================================
// 1. Header / Company Information
// ============================================
export interface CompanyInfo {
  companyName: string;
  companyAddress: string;
  documentTitle: string;
  pageNumber?: string;
}

// ============================================
// 2. Master Formula Details
// ============================================
export interface MasterFormulaDetails {
  masterCardNo: string;
  productCode: string;
  productName: string;
  genericName: string;
  specification: string;
  manufacturingLicenseNo: string;
  manufacturingLocation: string;
  reasonForChange?: string;
  revisionNo?: string;
  manufacturer: string;
  shelfLife: string;
  effectiveBatchNo?: string;
  date?: string;
}

// ============================================
// 3. Batch Information
// ============================================
export interface BatchInfo {
  batchSize: string;
  labelClaim: string;
  marketedBy?: string;
  volume?: string;
}

// ============================================
// 4. Composition / Label Claim (Per Unit)
// ============================================
export interface CompositionItem {
  activeIngredientName: string;
  strengthPerUnit: string;
  form: string;
  equivalentBase?: string;
}

// ============================================
// 5. Aseptic Mixing - Material Table
// ============================================
export interface MaterialItem {
  srNo: number;
  materialCode: string;
  materialName: string;
  potencyCorrection: 'Y' | 'N' | string;
  requiredQuantity: string;
  overages?: string;
  quantityPerUnit: string;
  requiredQuantityStandardBatch: string;
  equivalentMaterial?: string;
  conversionFactor?: string;
}

// ============================================
// 6. Excipients
// ============================================
export interface ExcipientItem {
  name: string;
  type: 'preservative' | 'oil' | 'stabilizer' | 'antioxidant' | 'other';
  quantity: string;
  unit: string;
}

// ============================================
// 7. Aseptic Filling Details
// ============================================
export interface FillingDetail {
  productCode: string;
  productName: string;
  packingSize: string;
  actualFillingQuantity: string;
  numberOfSyringes: string;
  syringeType?: string;
}

// ============================================
// 8. Summary / Totals
// ============================================
export interface SummaryTotals {
  totalUnitsProduced?: string;
  totalFillingQuantity?: string;
  standardBatchSizeCompliance?: string;
}

// ============================================
// Complete Formula Master Data Structure
// ============================================
export interface FormulaMasterData {
  // Header Information
  companyInfo: CompanyInfo;
  
  // Master Formula Details
  masterFormulaDetails: MasterFormulaDetails;
  
  // Batch Information
  batchInfo: BatchInfo;
  
  // Composition / Label Claim
  composition: CompositionItem[];
  
  // Aseptic Mixing Materials
  materials: MaterialItem[];
  
  // Excipients
  excipients?: ExcipientItem[];
  
  // Aseptic Filling Details
  fillingDetails: FillingDetail[];
  
  // Summary / Totals
  summary: SummaryTotals;
}

// ============================================
// Database Record Structure
// ============================================
export interface FormulaRecord extends FormulaMasterData {
  _id?: string;
  uniqueIdentifier: string; // Combination of productCode + revisionNo
  uploadedAt: Date;
  fileName: string;
  fileSize: number;
  rawXmlContent?: string;
  contentHash?: string;
  parsingStatus: 'success' | 'partial' | 'failed';
  parsingErrors?: string[];
}

// ============================================
// API Response Types
// ============================================
export interface UploadResponse {
  success: boolean;
  message: string;
  data?: FormulaRecord;
  errors?: string[];
}

export interface FormulasListResponse {
  success: boolean;
  data: FormulaRecord[];
  total: number;
  page: number;
  limit: number;
}

export interface FormulaDetailResponse {
  success: boolean;
  data?: FormulaRecord;
  error?: string;
}

// ============================================
// Batch Registry Data Structure (BATCHCRREGI)
// ============================================
export interface BatchRecordItem {
  // Serial Number
  srNo: number;
  
  // Batch UOM (LTR/KG)
  batchUom: string;
  
  // Item/Product Code
  itemCode: string;
  
  // Manufacturing License Number
  mfgLicNo: string;
  
  // Department
  department: string;
  
  // Pack Size (e.g., "10ML", "5 GM")
  pack: string;
  
  // Item Detail (Generic/Brand name)
  itemDetail: string;
  
  // Item Name
  itemName: string;
  
  // Manufacturing Date
  mfgDate: string;
  
  // Location ID (Building)
  locationId: string;
  
  // MRP Value (null if empty)
  mrpValue: string | null;
  
  // Type: "Export" if MRP is empty, "Import" if MRP has value
  type: 'Export' | 'Import';
  
  // Batch Number
  batchNumber: string;
  
  // Year (e.g., "202425")
  year: string;
  
  // Make/Manufacturer (e.g., "INDIANA", "AJANTA")
  make: string;
  
  // Expiry Date
  expiryDate: string;
  
  // Batch Size
  batchSize: string;
  
  // Unit (e.g., "BOT", "TUBE", "SYRIN")
  unit: string;
  
  // Conversion Ratio (e.g., "20098 BOT")
  conversionRatio: string;
  
  // Batch Completion Date
  batchCompletionDate?: string;
}

export interface BatchRegistryData {
  // Company Information
  companyName: string;
  companyAddress: string;
  
  // All batch records
  batches: BatchRecordItem[];
  
  // Summary counts
  totalBatches: number;
  exportCount: number;
  importCount: number;
}

export interface BatchRegistryRecord extends BatchRegistryData {
  _id?: string;
  uploadedAt: Date;
  fileName: string;
  fileSize: number;
  rawXmlContent?: string;
  contentHash?: string;
  parsingStatus: 'success' | 'partial' | 'failed';
  parsingErrors?: string[];
}

// ============================================
// Batch API Response Types
// ============================================
export interface BatchUploadResponse {
  success: boolean;
  message: string;
  data?: BatchRegistryRecord;
  errors?: string[];
}

export interface BatchListResponse {
  success: boolean;
  data: BatchRegistryRecord[];
  total: number;
  page: number;
  limit: number;
}

