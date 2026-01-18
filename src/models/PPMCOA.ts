/**
 * PPM COA (Primary Packing Material Certificate of Analysis) MongoDB Model
 * Stores Primary Packing Material test data with AR numbers
 */

import mongoose, { Schema, Document } from 'mongoose';
import type { PPMCOARecord } from '@/types/ppmcoa';

export interface IPPMCOA extends Omit<PPMCOARecord, '_id'>, Document { }

// Sub-schema for Test Parameters
const PPMTestParameterSchema = new Schema({
    name: { type: String, required: true },
    limits: { type: String, default: '' },
    result: { type: String, default: '' },
    complies: { type: Boolean, default: true },
}, { _id: false });

// Main PPM COA Schema
const PPMCOASchema = new Schema<IPPMCOA>({
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
    testParameters: [PPMTestParameterSchema],

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
    collection: 'ppmcoas'
});

// Compound unique index to prevent duplicate AR + material combinations
PPMCOASchema.index({ arNo: 1, materialCode: 1 }, { unique: true });

// Index for filtering by material code
PPMCOASchema.index({ materialCode: 1, uploadedAt: -1 });

// Export the model
export const PPMCOA = mongoose.models.PPMCOA ||
    mongoose.model<IPPMCOA>('PPMCOA', PPMCOASchema);

export default PPMCOA;
