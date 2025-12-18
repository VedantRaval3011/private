/**
 * Batch Registry MongoDB Model
 * Stores parsed Batch Creation XML data
 */

import mongoose, { Schema, Document } from 'mongoose';
import type { BatchRegistryRecord } from '@/types/formula';

export interface IBatch extends Omit<BatchRegistryRecord, '_id'>, Document {}

// Sub-schema for batch record items
const BatchRecordItemSchema = new Schema({
  srNo: { type: Number, required: true },
  batchUom: { type: String, default: 'N/A' },
  itemCode: { type: String, required: true },
  mfgLicNo: { type: String, default: 'N/A' },
  department: { type: String, default: 'N/A' },
  pack: { type: String, default: 'N/A' },
  itemDetail: { type: String, default: 'N/A' },
  itemName: { type: String, default: 'N/A' },
  mfgDate: { type: String, default: 'N/A' },
  locationId: { type: String, default: 'N/A' },
  mrpValue: { type: String, default: null },
  type: { 
    type: String, 
    enum: ['Export', 'Import'],
    required: true 
  },
  batchNumber: { type: String, required: true },
  year: { type: String, default: 'N/A' },
  make: { type: String, default: 'N/A' },
  expiryDate: { type: String, default: 'N/A' },
  batchSize: { type: String, default: 'N/A' },
  unit: { type: String, default: 'N/A' },
  conversionRatio: { type: String, default: 'N/A' },
  batchCompletionDate: { type: String },
}, { _id: false });

// Main Batch Schema
const BatchSchema = new Schema<IBatch>({
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
  
  // Company Information
  companyName: { type: String, default: 'N/A' },
  companyAddress: { type: String, default: 'N/A' },
  
  // Batch records array
  batches: [BatchRecordItemSchema],
  
  // Summary counts
  totalBatches: { type: Number, default: 0 },
  exportCount: { type: Number, default: 0 },
  importCount: { type: Number, default: 0 },
}, {
  timestamps: true,
  collection: 'batches'
});

// Indexes for better query performance
BatchSchema.index({ uploadedAt: -1 });
BatchSchema.index({ companyName: 1 });
BatchSchema.index({ 'batches.itemCode': 1 });
BatchSchema.index({ 'batches.batchNumber': 1 });

// Virtual for summary display
BatchSchema.virtual('displaySummary').get(function() {
  return `${this.totalBatches} batches (${this.exportCount} Export, ${this.importCount} Import)`;
});

// Export the model
export const Batch = mongoose.models.Batch || mongoose.model<IBatch>('Batch', BatchSchema);

export default Batch;
