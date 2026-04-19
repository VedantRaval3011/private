/**
 * TrialBatch model
 * Tracks batch numbers that have been manually designated as "trial batches"
 * from the Batch Registry in the formula data page.
 */

import mongoose, { Schema, Document } from 'mongoose';

export interface ITrialBatch extends Document {
  batchNumber: string;
  itemCode: string;
  markedAt: Date;
}

const TrialBatchSchema = new Schema<ITrialBatch>({
  batchNumber: { type: String, required: true },
  itemCode:    { type: String, default: '' },
  markedAt:    { type: Date, default: Date.now },
}, {
  collection: 'trial_batches',
});

TrialBatchSchema.index({ batchNumber: 1, itemCode: 1 }, { unique: true });

export const TrialBatch =
  mongoose.models.TrialBatch ||
  mongoose.model<ITrialBatch>('TrialBatch', TrialBatchSchema);

export default TrialBatch;
