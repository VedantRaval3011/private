/**
 * Inward Register MongoDB Model
 * Stores Material Inward Register data from XML files
 */

import mongoose, { Schema, Document } from 'mongoose';
import type { InwardRegisterRecord } from '@/types/inward';

export interface IInwardRegister extends Omit<InwardRegisterRecord, '_id'>, Document { }

const InwardRegisterSchema = new Schema<IInwardRegister>({
    // Core Data
    inwardNumber: { type: String, required: true, index: true },
    inwardDate: { type: String },
    vendorName: { type: String, required: true, index: true },
    arNumber: { type: String, index: true },

    // Material Details
    materialName: { type: String, required: true },
    materialCode: { type: String },
    batchNumber: { type: String },
    challanNumber: { type: String },
    challanDate: { type: String },

    // Quantities
    receivedQuantity: { type: Number },
    acceptedQuantity: { type: Number },
    rejectedQuantity: { type: Number },
    unit: { type: String },

    // Metadata
    sourceFile: { type: String, required: true },
    uploadedAt: { type: Date, default: Date.now },
    manufacturedBy: { type: String },
    contentHash: { type: String, index: true },
    parsingStatus: {
        type: String,
        enum: ['success', 'partial', 'failed'],
        default: 'success'
    },
    parsingWarnings: [{ type: String }],
}, {
    timestamps: true,
    collection: 'inward_registers'
});

// Compound unique index to prevent duplicate entries if needed
// (Inward No + Item Code + Batch Number might be unique)
InwardRegisterSchema.index({ inwardNumber: 1, materialCode: 1, batchNumber: 1 }, { unique: false }); // Making unique false for safety for now

// Index for common searches
InwardRegisterSchema.index({ vendorName: 1 });
InwardRegisterSchema.index({ arNumber: 1 });
InwardRegisterSchema.index({ sourceFile: 1 });

export const InwardRegister = mongoose.models.InwardRegister ||
    mongoose.model<IInwardRegister>('InwardRegister', InwardRegisterSchema);

export default InwardRegister;
