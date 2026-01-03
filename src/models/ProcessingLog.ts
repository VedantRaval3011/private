/**
 * Processing Log MongoDB Model
 * Tracks all processed XML files for duplicate prevention
 */

import mongoose, { Schema, Document } from 'mongoose';
import type { ProcessingLogRecord } from '@/types/ingestion';

export interface IProcessingLog extends Omit<ProcessingLogRecord, '_id'>, Document {}

const ProcessingLogSchema = new Schema<IProcessingLog>({
  contentHash: { 
    type: String, 
    required: true, 
    unique: true,
    index: true 
  },
  fileName: { type: String, required: true },
  fileType: { 
    type: String, 
    enum: ['BATCH', 'FORMULA', 'COA', 'UNKNOWN'],
    required: true 
  },
  status: { 
    type: String, 
    enum: ['SUCCESS', 'DUPLICATE', 'ERROR'],
    required: true 
  },
  businessKey: { type: String, index: true },
  errorMessage: { type: String },
  processedAt: { type: Date, default: Date.now },
  fileSize: { type: Number, required: true },
  // Item-level duplicate statistics
  itemStats: {
    type: {
      totalItems: { type: Number },
      newItems: { type: Number },
      duplicateItems: { type: Number },
      duplicateDetails: [{
        batchNumber: { type: String },
        itemCode: { type: String },
        itemName: { type: String },
        type: { type: String },
        mfgDate: { type: String },
        expiryDate: { type: String },
        reason: { type: String },
        existingFileName: { type: String }
      }],
      successfulDetails: [{
        batchNumber: { type: String },
        itemCode: { type: String },
        itemName: { type: String },
        type: { type: String },
        mfgDate: { type: String },
        expiryDate: { type: String }
      }]
    },
    required: false
  },
  // Formula-level duplicate statistics
  formulaStats: {
    type: {
      totalFormulas: { type: Number },
      newFormulas: { type: Number },
      duplicateFormulas: { type: Number },
      duplicateDetails: [{
        productCode: { type: String },
        productName: { type: String },
        revisionNo: { type: String },
        genericName: { type: String },
        manufacturer: { type: String },
        reason: { type: String },
        existingFileName: { type: String }
      }],
      successfulDetails: [{
        productCode: { type: String },
        productName: { type: String },
        revisionNo: { type: String },
        genericName: { type: String },
        manufacturer: { type: String }
      }]
    },
    required: false
  }
}, {
  timestamps: true,
  collection: 'processing_logs'
});

// Indexes for efficient queries
ProcessingLogSchema.index({ processedAt: -1 });
ProcessingLogSchema.index({ status: 1 });
ProcessingLogSchema.index({ fileType: 1 });

export const ProcessingLog = mongoose.models.ProcessingLog || 
  mongoose.model<IProcessingLog>('ProcessingLog', ProcessingLogSchema);

export default ProcessingLog;
