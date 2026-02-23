/**
 * Material Rejection MongoDB Model
 * Stores rejected material records from Material Rejection XML files
 */

import mongoose, { Schema, Document } from 'mongoose';

export interface IMaterialRejection extends Document {
    arNumber: string;
    arDate: string;
    grDate: string;
    materialCode: string;
    materialName: string;
    vendorName: string;
    receivedQty: number;
    unit: string;
    status: string;
    sourceFile: string;
    contentHash: string;
    uploadedAt: Date;
}

const MaterialRejectionSchema = new Schema<IMaterialRejection>({
    arNumber: { type: String, required: true, index: true },
    arDate: { type: String },
    grDate: { type: String },
    materialCode: { type: String, index: true },
    materialName: { type: String, required: true },
    vendorName: { type: String, index: true },
    receivedQty: { type: Number },
    unit: { type: String },
    status: { type: String, default: 'REJECTED' },
    sourceFile: { type: String, required: true },
    contentHash: { type: String, index: true },
    uploadedAt: { type: Date, default: Date.now },
}, {
    timestamps: true,
    collection: 'material_rejections'
});

// Compound index for deduplication
MaterialRejectionSchema.index({ arNumber: 1, materialCode: 1 }, { unique: true });

// Indexes for search
MaterialRejectionSchema.index({ vendorName: 1 });
MaterialRejectionSchema.index({ materialName: 1 });

export const MaterialRejection = mongoose.models.MaterialRejection ||
    mongoose.model<IMaterialRejection>('MaterialRejection', MaterialRejectionSchema);

export default MaterialRejection;
