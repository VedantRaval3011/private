/**
 * PM COA (Packing Material Certificate of Analysis) MongoDB Model
 * Stores Packing Material test data with AR numbers
 */

import mongoose, { Schema, Document } from 'mongoose';
import type { PMCOARecord } from '@/types/pmcoa';

export interface IPMCOA extends Omit<PMCOARecord, '_id'>, Document { }

// Sub-schema for Test Parameters
const PMTestParameterSchema = new Schema({
    name: { type: String, required: true },
    limits: { type: String, default: '' },
    result: { type: String, default: '' },
    complies: { type: Boolean, default: true },
}, { _id: false });

// Main PM COA Schema
const PMCOASchema = new Schema<IPMCOA>({
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
    testParameters: [PMTestParameterSchema],

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
    collection: 'pmcoas'
});

// Compound unique index to prevent duplicate AR + material combinations
PMCOASchema.index({ arNo: 1, materialCode: 1 }, { unique: true });

// Index for filtering by material code
PMCOASchema.index({ materialCode: 1, uploadedAt: -1 });

// Export the model
export const PMCOA = mongoose.models.PMCOA ||
    mongoose.model<IPMCOA>('PMCOA', PMCOASchema);

export default PMCOA;
