/**
 * Retained Sample MongoDB Model
 * Stores stability data (pH + description) for each batch across 6–36 month intervals
 */

import mongoose, { Schema, Document } from 'mongoose';
import type { RetainedSampleRecord } from '@/types/retained-sample';

export interface IRetainedSample extends Omit<RetainedSampleRecord, '_id'>, Document {}

const PhValueSchema = new Schema({
  label: { type: String, default: '' },   // e.g. 'IP', 'USP', '' for unlabelled
  value: { type: String, default: '' },
}, { _id: false });

const ActorSchema = new Schema({
  name: { type: String, default: '' },
  username: { type: String, default: '' },
}, { _id: false });

const EditHistoryEntrySchema = new Schema({
  pH: { type: String, default: '' },
  phValues: { type: [PhValueSchema], default: [] },
  description: { type: String, default: '' },
  recordedAt: { type: Date },
  savedBy: { type: ActorSchema },
}, { _id: false });

const StabilityEntrySchema = new Schema({
  month: {
    type: Number,
    required: true,
    enum: [6, 12, 18, 24, 30, 36],
  },
  pH: { type: String, default: '' },          // legacy single-pH (backward compat)
  phValues: { type: [PhValueSchema], default: [] }, // multi-pH (preferred)
  description: { type: String, default: '' },
  recordedAt: { type: Date, default: Date.now },
  createdAt: { type: Date },
  createdBy: { type: ActorSchema },
  updatedBy: { type: ActorSchema },
  editHistory: { type: [EditHistoryEntrySchema], default: [] },
}, { _id: false });

const RetainedSampleSchema = new Schema<IRetainedSample>({
  mfcNo: { type: String, required: true, index: true },
  productCode: { type: String, required: true, index: true },
  productName: { type: String, required: true },
  batchNumber: { type: String, required: true, index: true },
  stabilityEntries: [StabilityEntrySchema],
}, {
  timestamps: true,
  collection: 'retained_samples',
});

// One record per batch (one batch belongs to one MFC)
RetainedSampleSchema.index({ batchNumber: 1, mfcNo: 1 }, { unique: true });
RetainedSampleSchema.index({ productCode: 1 });

export const RetainedSample = mongoose.models.RetainedSample ||
  mongoose.model<IRetainedSample>('RetainedSample', RetainedSampleSchema);

export default RetainedSample;
