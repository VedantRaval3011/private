/**
 * Product Master MongoDB Model
 * Stores parsed Product Master XML data
 */

import mongoose, { Schema, Document } from 'mongoose';

export interface IProductMaster extends Document {
  productCode: string;
  productName: string;
  department: string;
  masterCardNo: string;
  storageCondition: string;
  productType: string;
  therapeuticCategory: string;
  genericName?: string;
  synonym?: string;
  genericBranded?: string;
  mfg?: string; // Manufacturer
  pack?: string;
  hsnCode?: string;
  tariff?: string;
  storageBin?: string;
  displayFormat?: string;
  actualFilling?: string;
  exciseDutyGroup?: string;
  exciseNotification?: string;
  // Specification & batch fields
  specification?: string;
  effectiveBatchNo?: string;
  effectiveDate?: string;
  revisionNo?: string;
  revisionRemark?: string;
  workStatus?: string;
  formulaMasterId?: string;
  mfgLicenseNo?: string;
  liveMonth?: string;
  batchSize?: string;
  batchUom?: string;
  locationCode?: string;
  isNonActive?: string;
  sourceFile: string;
  processedAt: Date;
}

const ProductMasterSchema = new Schema<IProductMaster>({
  productCode: { type: String, required: true, index: true },
  productName: { type: String, required: true },
  department: { type: String, default: 'N/A' },
  masterCardNo: { type: String, default: 'N/A' },
  storageCondition: { type: String, default: 'N/A' },
  productType: { type: String, default: 'N/A' },
  therapeuticCategory: { type: String, default: 'N/A' },
  
  // New fields
  genericName: { type: String, default: '' },
  synonym: { type: String, default: '' },
  genericBranded: { type: String, default: '' },
  mfg: { type: String, default: '' },
  pack: { type: String, default: '' },
  hsnCode: { type: String, default: '' },
  tariff: { type: String, default: '' },
  storageBin: { type: String, default: '' },
  displayFormat: { type: String, default: '' },
  actualFilling: { type: String, default: '' },
  exciseDutyGroup: { type: String, default: '' },
  exciseNotification: { type: String, default: '' },

  // Specification & batch fields
  specification: { type: String, default: '' },
  effectiveBatchNo: { type: String, default: '' },
  effectiveDate: { type: String, default: '' },
  revisionNo: { type: String, default: '' },
  revisionRemark: { type: String, default: '' },
  workStatus: { type: String, default: '' },
  formulaMasterId: { type: String, default: '' },
  mfgLicenseNo: { type: String, default: '' },
  liveMonth: { type: String, default: '' },
  batchSize: { type: String, default: '' },
  batchUom: { type: String, default: '' },
  locationCode: { type: String, default: '' },
  isNonActive: { type: String, default: '' },

  sourceFile: { type: String, required: true },
  processedAt: { type: Date, default: Date.now },
}, {
  timestamps: true,
  collection: 'productmasters'
});

// Indexes
ProductMasterSchema.index({ productCode: 1 });
ProductMasterSchema.index({ productName: 1 });
ProductMasterSchema.index({ masterCardNo: 1 });

export const ProductMaster = mongoose.models.ProductMaster || mongoose.model<IProductMaster>('ProductMaster', ProductMasterSchema);

export default ProductMaster;
