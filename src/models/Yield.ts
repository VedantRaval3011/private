import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IPackingDetail {
  itemCode: string;    // ITEM
  batchSize: string;   // BATSIZE
  batchUom: string;    // BATUOM
  prodQty: number;     // PRODQTY
  packing: string;     // PACK
  packQty: string;     // PACKQTY
  cQty: string;        // CQTY
}

export interface IYieldItem {
  srNo: number;
  productName: string;
  productCode: string;
  batchNo: string;
  mfgDate: Date;
  expDate: Date;
  batchSizeLtrOrKg: string;
  batchSizeAddReReq?: string;
  packingDetails: IPackingDetail[];
  totalProducedQty: number;
  companyName?: string;
  plantAddress?: string;
  period?: string;
  testingQty: number;
  retainQty: number;
  mfgLossQty: number;
  residueSFG?: string;
  actualYield: number;
  standardYield: number;
  startDate: Date;
  completeDate: Date;
  totalDays: number;
  varianceDays: number;
}

export interface IYieldDocument extends IYieldItem, Document {
  contentHash?: string;
  sourceFile?: string;
  uploadedAt: Date;
}

const PackingDetailSchema = new Schema<IPackingDetail>({
  itemCode: { type: String, default: '' },
  batchSize: { type: String, default: '' },
  batchUom: { type: String, default: '' },
  prodQty: { type: Number, default: 0 },
  packing: { type: String, default: '' },
  packQty: { type: String, default: '' },
  cQty: { type: String, default: '' },
}, { _id: false });

const YieldItemSchema = new Schema<IYieldDocument>({
  srNo: { type: Number, required: true },
  productName: { type: String, required: true },
  productCode: { type: String, required: true },
  batchNo: { type: String, required: true },
  mfgDate: { type: Date, required: true },
  expDate: { type: Date, required: true },
  batchSizeLtrOrKg: { type: String, required: true },
  batchSizeAddReReq: { type: String },
  packingDetails: { type: [PackingDetailSchema], default: [] },
  totalProducedQty: { type: Number, required: true },
  companyName: { type: String },
  plantAddress: { type: String },
  period: { type: String },
  testingQty: { type: Number, required: true },
  retainQty: { type: Number, required: true },
  mfgLossQty: { type: Number, required: true },
  residueSFG: { type: String },
  actualYield: { type: Number, required: true },
  standardYield: { type: Number, required: true },
  startDate: { type: Date, required: true },
  completeDate: { type: Date, required: true },
  totalDays: { type: Number, required: true },
  varianceDays: { type: Number, required: true },
  
  contentHash: { type: String },
  sourceFile: { type: String },
  uploadedAt: { type: Date, default: Date.now }
}, {
  timestamps: true,
  collection: 'yields'
});

// Index for duplicate prevention and fast querying
YieldItemSchema.index({ batchNo: 1, productCode: 1 }, { unique: true });
YieldItemSchema.index({ productName: 1 });
YieldItemSchema.index({ uploadedAt: -1 });

// Prevent mongoose model overwrite warning
const Yield: Model<IYieldDocument> = mongoose.models.Yield || mongoose.model<IYieldDocument>('Yield', YieldItemSchema);

export default Yield;
