/**
 * Requisition MongoDB Model
 * Stores parsed Material Requisition (MATREQ) XML data
 */

import mongoose, { Schema, Document } from 'mongoose';
import type { RequisitionRecord } from '@/types/requisition';

export interface IRequisition extends Omit<RequisitionRecord, '_id'>, Document {}

// Sub-schema for requisition material items
const RequisitionMaterialSchema = new Schema({
  srNo: { type: Number, required: true },
  materialCode: { type: String, required: true },
  materialName: { type: String, required: true },
  materialType: { 
    type: String, 
    enum: ['RM', 'PPM', 'PM'],
    required: true 
  },
  stage: { type: String, default: '' },
  process: { type: String, default: '' },
  
  // Quantity fields
  quantityRequired: { type: Number, default: 0 },
  quantityToIssue: { type: Number, default: 0 },
  unit: { type: String, default: 'NOS' },
  
  // Validation against Master Formula
  masterFormulaQty: { type: Number },
  validationStatus: { 
    type: String, 
    enum: ['matched', 'mismatch', 'pending'],
    default: 'pending'
  },
  variancePercent: { type: Number },
  
  // Identifiers for duplicate detection
  matReqDtlId: { type: String, required: true },
  matReqId: { type: String, required: true },
  matReqNo: { type: String, default: '' },
  matId: { type: String, default: '' },
  
  // Additional details
  binCode: { type: String },
  grNo: { type: String },
  arNo: { type: String },
  challanNo: { type: String },
  challanDate: { type: String },
  expiryDate: { type: String },
  mfgDate: { type: String },
  
  // New fields from latest requirement
  ovgPercent: { type: Number },
  vendorCode: { type: String },
  artworkNo: { type: String },
  labelClaim: { type: String },
  
  // Parent Batch Info
  batchNumber: { type: String },
  mfcNo: { type: String },
  itemName: { type: String },
}, { _id: false });

// Sub-schema for requisition batch
const RequisitionBatchSchema = new Schema({
  batchNumber: { type: String, required: true },
  batchSize: { type: Number, default: 0 },
  batchUom: { type: String, default: 'LTR' },
  
  // Product details
  itemCode: { type: String, default: '' },
  itemName: { type: String, default: '' },
  itemDetail: { type: String, default: '' },
  pack: { type: String, default: '' },
  unit: { type: String, default: '' },
  
  // MFC reference
  mfcNo: { type: String, default: '' },
  formastId: { type: String, default: '' },
  
  // Requisition info
  matReqId: { type: String, required: true },
  matReqNo: { type: String, default: '' },
  matReqDate: { type: String, default: '' },
  matReqRemark: { type: String, default: '' },
  
  // Manufacturer info
  make: { type: String, default: '' },
  year: { type: String, default: '' },
  department: { type: String, default: '' },
  locationCode: { type: String, default: '' },
  
  // Dates
  mfgDate: { type: String, default: '' },
  expiryDate: { type: String, default: '' },
  
  // Materials under this batch
  materials: [RequisitionMaterialSchema],
}, { _id: false });

// Main Requisition Schema
const RequisitionSchema = new Schema<IRequisition>({
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
  contentHash: { type: String, index: true },
  
  parsingStatus: { 
    type: String, 
    enum: ['success', 'partial', 'failed'],
    default: 'success'
  },
  parsingErrors: [{ type: String }],
  
  // Batches with materials (contains ALL material data)
  batches: [RequisitionBatchSchema],
  
  // Summary
  totalBatches: { type: Number, default: 0 },
  totalMaterials: { type: Number, default: 0 },
  validatedCount: { type: Number, default: 0 },
  mismatchCount: { type: Number, default: 0 },
  
  // Source info
  locationCode: { type: String, default: '' },
  make: { type: String, default: '' },
}, {
  timestamps: true,
  collection: 'requisitions'
});

// Indexes for better query performance
RequisitionSchema.index({ uploadedAt: -1 });
RequisitionSchema.index({ 'batches.batchNumber': 1 });
RequisitionSchema.index({ 'batches.mfcNo': 1 });
RequisitionSchema.index({ locationCode: 1 });
RequisitionSchema.index({ make: 1 });

// Compound index for material-level duplicate detection (within batches)
RequisitionSchema.index({ 'batches.materials.matReqDtlId': 1 });

// Virtual for summary display
RequisitionSchema.virtual('displaySummary').get(function() {
  return `${this.totalBatches} batches, ${this.totalMaterials} materials (${this.mismatchCount} mismatches)`;
});

// Export the model
export const Requisition = mongoose.models.Requisition || mongoose.model<IRequisition>('Requisition', RequisitionSchema);

export default Requisition;
