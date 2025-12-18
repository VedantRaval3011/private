/**
 * Formula Master MongoDB Model
 * Stores parsed XML formula data with complete structure
 */

import mongoose, { Schema, Document } from 'mongoose';
import type { FormulaRecord } from '@/types/formula';

export interface IFormula extends Omit<FormulaRecord, '_id'>, Document {}

// Sub-schemas for nested objects
const CompanyInfoSchema = new Schema({
  companyName: { type: String, default: 'N/A' },
  companyAddress: { type: String, default: 'N/A' },
  documentTitle: { type: String, default: 'N/A' },
  pageNumber: { type: String },
}, { _id: false });

const MasterFormulaDetailsSchema = new Schema({
  masterCardNo: { type: String, default: 'N/A' },
  productCode: { type: String, required: true },
  productName: { type: String, required: true },
  genericName: { type: String, default: 'N/A' },
  specification: { type: String, default: 'N/A' },
  manufacturingLicenseNo: { type: String, default: 'N/A' },
  manufacturingLocation: { type: String, default: 'N/A' },
  reasonForChange: { type: String },
  revisionNo: { type: String },
  manufacturer: { type: String, default: 'N/A' },
  shelfLife: { type: String, default: 'N/A' },
  effectiveBatchNo: { type: String },
  date: { type: String },
}, { _id: false });

const BatchInfoSchema = new Schema({
  batchSize: { type: String, default: 'N/A' },
  labelClaim: { type: String, default: 'N/A' },
  marketedBy: { type: String },
  volume: { type: String },
}, { _id: false });

const CompositionItemSchema = new Schema({
  activeIngredientName: { type: String, required: true },
  strengthPerUnit: { type: String, default: 'N/A' },
  form: { type: String, default: 'N/A' },
  equivalentBase: { type: String },
}, { _id: false });

const MaterialItemSchema = new Schema({
  srNo: { type: Number, required: true },
  materialCode: { type: String, required: true },
  materialName: { type: String, required: true },
  potencyCorrection: { type: String, default: 'N' },
  requiredQuantity: { type: String, default: 'N/A' },
  overages: { type: String },
  quantityPerUnit: { type: String, default: 'N/A' },
  requiredQuantityStandardBatch: { type: String, default: 'N/A' },
  equivalentMaterial: { type: String },
  conversionFactor: { type: String },
}, { _id: false });

const ExcipientItemSchema = new Schema({
  name: { type: String, required: true },
  type: { 
    type: String, 
    enum: ['preservative', 'oil', 'stabilizer', 'antioxidant', 'other'],
    default: 'other'
  },
  quantity: { type: String, default: 'N/A' },
  unit: { type: String, default: 'N/A' },
}, { _id: false });

const FillingDetailSchema = new Schema({
  productCode: { type: String, default: 'N/A' },
  productName: { type: String, default: 'N/A' },
  packingSize: { type: String, default: 'N/A' },
  actualFillingQuantity: { type: String, default: 'N/A' },
  numberOfSyringes: { type: String, default: 'N/A' },
  syringeType: { type: String },
}, { _id: false });

const SummaryTotalsSchema = new Schema({
  totalUnitsProduced: { type: String },
  totalFillingQuantity: { type: String },
  standardBatchSizeCompliance: { type: String },
}, { _id: false });

// Main Formula Schema
const FormulaSchema = new Schema<IFormula>({
  uniqueIdentifier: { 
    type: String, 
    required: true, 
    unique: true,
    index: true
  },
  uploadedAt: { type: Date, default: Date.now },
  fileName: { type: String, required: true },
  fileSize: { type: Number, required: true },
  rawXmlContent: { type: String },
  parsingStatus: { 
    type: String, 
    enum: ['success', 'partial', 'failed'],
    default: 'success'
  },
  parsingErrors: [{ type: String }],
  
  // Nested data structures
  companyInfo: { type: CompanyInfoSchema, required: true },
  masterFormulaDetails: { type: MasterFormulaDetailsSchema, required: true },
  batchInfo: { type: BatchInfoSchema, required: true },
  composition: [CompositionItemSchema],
  materials: [MaterialItemSchema],
  excipients: [ExcipientItemSchema],
  fillingDetails: [FillingDetailSchema],
  summary: { type: SummaryTotalsSchema },
}, {
  timestamps: true,
  collection: 'formulas'
});

// Indexes for better query performance
FormulaSchema.index({ 'masterFormulaDetails.productCode': 1 });
FormulaSchema.index({ 'masterFormulaDetails.productName': 1 });
FormulaSchema.index({ uploadedAt: -1 });

// Virtual for formatted display
FormulaSchema.virtual('displayName').get(function() {
  return `${this.masterFormulaDetails?.productName || 'Unknown'} (${this.masterFormulaDetails?.productCode || 'N/A'})`;
});

// Export the model
export const Formula = mongoose.models.Formula || mongoose.model<IFormula>('Formula', FormulaSchema);

export default Formula;
