/**
 * RM COA (Raw Material Certificate of Analysis) MongoDB Model
 * Stores Raw Material test data with AR numbers
 */

import mongoose, { Schema, Document } from 'mongoose';
import type { RMCOARecord } from '@/types/rmcoa';

export interface IRMCOA extends Omit<RMCOARecord, '_id'>, Document { }

// Sub-schema for Test Parameters
const RMTestParameterSchema = new Schema({
    name: { type: String, required: true },
    limits: { type: String, default: '' },
    result: { type: String, default: '' },
    complies: { type: Boolean, default: true },
}, { _id: false });

// Main RM COA Schema
const RMCOASchema = new Schema<IRMCOA>({
    // Core identification
    arNo: { type: String, required: true, index: true },
    materialCode: { type: String, required: true, index: true },
    materialName: { type: String, required: true },

    // Optional batch linkage
    batchNumber: { type: String, index: true },

    // Test information
    testDate: { type: String },
    testNumber: { type: String },
    status: { type: String, default: 'PENDING' },

    // Additional fields
    manufacturer: { type: String },
    supplier: { type: String },
    lotNumber: { type: String },

    // Test parameters
    testParameters: [RMTestParameterSchema],

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
    collection: 'rmcoas'
});

// Compound unique index to prevent duplicate AR + material combinations
RMCOASchema.index({ arNo: 1, materialCode: 1 }, { unique: true });

// Index for filtering by material code
RMCOASchema.index({ materialCode: 1, uploadedAt: -1 });

// Export the model
export const RMCOA = mongoose.models.RMCOA ||
    mongoose.model<IRMCOA>('RMCOA', RMCOASchema);

export default RMCOA;
