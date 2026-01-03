/**
 * COA MongoDB Model
 * Stores BULK and FINISH stage pharmaceutical test data
 */

import mongoose, { Schema, Document } from 'mongoose';
import type { COARecord } from '@/types/coa';

export interface ICOA extends Omit<COARecord, '_id'>, Document {}

// Sub-schema for QA Signature
const QASignatureSchema = new Schema({
  preparedBy: { type: String, default: '' },
  reviewedBy: { type: String, default: '' },
  signDate: { type: String, default: '' },
}, { _id: false });

// Sub-schema for Test Parameters
const TestParameterSchema = new Schema({
  srNo: { type: Number, required: true },
  name: { type: String, required: true },
  limits: { type: String, default: '' },
  result: { type: String, default: '' },
  complies: { type: Boolean, default: true },
}, { _id: false });

// Sub-schema for Assay Results
const AssayResultSchema = new Schema({
  compound: { type: String, required: true },
  limitMin: { type: String, default: '' },
  limitMax: { type: String, default: '' },
  specification: { type: String, default: '' }, // Full specification (may be multi-line)
  result: { type: String, default: '' },
  resultAlt: { type: String },
  complies: { type: Boolean, default: true },
}, { _id: false });

// Sub-schema for Identification Tests
const IdentificationTestSchema = new Schema({
  compound: { type: String, required: true },
  method: { type: String, default: '' },
  specification: { type: String, default: '' },
  result: { type: String, default: '' },
  complies: { type: Boolean, default: true },
}, { _id: false });

// Sub-schema for Critical Parameters
const CriticalParameterSchema = new Schema({
  name: { type: String, required: true },
  limit: { type: String, default: '' },
  result: { type: String, default: '' },
  complies: { type: Boolean, default: true },
}, { _id: false });

// Sub-schema for Related Substances
const RelatedSubstanceSchema = new Schema({
  compound: { type: String, required: true },
  limit: { type: String, default: '' },
  result: { type: String, default: '' },
  complies: { type: Boolean, default: true },
}, { _id: false });

// Sub-schema for BULK Stage Data
const BulkStageDataSchema = new Schema({
  batchNumber: { type: String, required: true },
  arNumber: { type: String, default: '' },
  testNumber: { type: String, default: '' },
  testDate: { type: String, default: '' },
  productName: { type: String, default: '' },
  productCode: { type: String, default: '' },
  genericName: { type: String, default: '' },
  description: { type: String, default: '' },
  manufacturer: { type: String, default: '' },
  mfgLicenseNo: { type: String, default: '' },
  batchSize: { type: String, default: '' },
  mfgDate: { type: String, default: '' },
  expDate: { type: String, default: '' },
  specification: { type: String, default: '' },
  testParameters: [TestParameterSchema],
  assayResults: [AssayResultSchema],
  remarks: { type: String, default: '' },
  analystName: { type: String, default: '' },
  analystDate: { type: String, default: '' },
  qaData: QASignatureSchema,
  status: { type: String, default: '' },
}, { _id: false });

// Sub-schema for FINISH Stage Data
const FinishStageDataSchema = new Schema({
  batchNumber: { type: String, required: true },
  arNumber: { type: String, default: '' },
  testNumber: { type: String, default: '' },
  testDate: { type: String, default: '' },
  productName: { type: String, default: '' },
  productCode: { type: String, default: '' },
  genericName: { type: String, default: '' },
  description: { type: String, default: '' },
  manufacturer: { type: String, default: '' },
  mfgLicenseNo: { type: String, default: '' },
  batchSize: { type: String, default: '' },
  mfgDate: { type: String, default: '' },
  expDate: { type: String, default: '' },
  specification: { type: String, default: '' },
  packSize: { type: String, default: '' },
  releaseQty: { type: String, default: '' },
  criticalParameters: [CriticalParameterSchema],
  identificationTests: [IdentificationTestSchema],
  relatedSubstances: [RelatedSubstanceSchema],
  assayResults: [AssayResultSchema],
  sterility: TestParameterSchema,
  uniformityOfVolume: TestParameterSchema,
  capping: TestParameterSchema,
  remarks: { type: String, default: '' },
  analystName: { type: String, default: '' },
  analystDate: { type: String, default: '' },
  qaData: QASignatureSchema,
  status: { type: String, default: '' },
}, { _id: false });

// Main COA Schema
const COASchema = new Schema<ICOA>({
  // Core identification
  batchNumber: { type: String, required: true, index: true },
  stage: { 
    type: String, 
    enum: ['BULK', 'FINISH'],
    required: true 
  },
  arNumber: { type: String, index: true },
  
  // Product info
  productName: { type: String, default: '' },
  productCode: { type: String, index: true },
  genericName: { type: String, default: '' },
  manufacturer: { type: String, default: '' },
  
  // Stage-specific data
  bulkData: BulkStageDataSchema,
  finishData: FinishStageDataSchema,
  
  // Metadata
  sourceFile: { type: String, required: true },
  uploadedAt: { type: Date, default: Date.now },
  contentHash: { type: String, index: true },
  parsingStatus: { 
    type: String, 
    enum: ['success', 'partial', 'failed'],
    default: 'success'
  },
  parsingWarnings: [{ type: String }],
}, {
  timestamps: true,
  collection: 'coas'
});

// Compound unique index to prevent duplicate batch+stage combinations
COASchema.index({ batchNumber: 1, stage: 1 }, { unique: true });

// Index for finding linked batches (same batch, both stages)
COASchema.index({ batchNumber: 1, uploadedAt: -1 });

// Index for filtering by manufacturer and product
COASchema.index({ manufacturer: 1, productName: 1 });

// Virtual to check if batch has both BULK and FINISH
COASchema.virtual('displaySummary').get(function() {
  return `${this.batchNumber} - ${this.stage} (${this.productName})`;
});

// Export the model
export const COA = mongoose.models.COA || 
  mongoose.model<ICOA>('COA', COASchema);

export default COA;
