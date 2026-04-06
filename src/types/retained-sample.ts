/**
 * Retained Sample Type Definitions
 */

/** A single pH parameter extracted from a COA (e.g. IP, USP, or unlabelled) */
export interface PhParam {
  label: string;   // e.g. 'IP', 'USP', '' (empty = no standard suffix in parameter name)
  result: string;  // COA 0-month measured value
  limit: string;   // specification / acceptance criteria
}

export interface PhValue {
  label: string;   // matches PhParam.label
  value: string;   // entered stability value
}

export interface EntryActor {
  name: string;
  username: string;
}

export interface EditHistoryEntry {
  pH: string;
  phValues: PhValue[];
  description: string;
  recordedAt: string;
  savedBy?: EntryActor;
}

export interface StabilityEntry {
  month: 6 | 12 | 18 | 24 | 30 | 36;
  pH: string;              // legacy single-pH (kept for backward compat)
  phValues: PhValue[];     // multi-pH (preferred); empty = fall back to pH
  description: string;
  recordedAt?: string;
  createdAt?: string;
  createdBy?: EntryActor;
  updatedBy?: EntryActor;
  editHistory?: EditHistoryEntry[];
}

export interface RetainedSampleRecord {
  _id?: string;
  mfcNo: string;
  productCode: string;
  productName: string;
  batchNumber: string;
  stabilityEntries: StabilityEntry[];
  createdAt?: string;
  updatedAt?: string;
}

export interface BatchStabilityRow {
  batchNumber: string;
  itemCode: string;
  mfgDate: string;
  expiryDate: string;
  // 0-month data from COA (auto-populated)
  coaFound: boolean;
  phParams: PhParam[];          // all pH parameters found in COA (dynamic count)
  zeroMonthPH: string;          // backward compat: first phParam.result (or '')
  zeroMonthDescription: string;
  // 6–36 month data from RetainedSample collection
  stabilityEntries: StabilityEntry[];
}

export interface MFCGroup {
  mfcNo: string;
  productCode: string;
  productName: string;
  genericName: string;
  shelfLife: string;
  batches: BatchStabilityRow[];
}

export interface RetainedSamplePageData {
  moreThan3: MFCGroup[];
  lessThan3: MFCGroup[];
}

export interface RetainedSampleResponse {
  success: boolean;
  data?: RetainedSamplePageData;
  error?: string;
}

export interface SaveStabilityRequest {
  mfcNo: string;
  productCode: string;
  productName: string;
  batchNumber: string;
  month: 6 | 12 | 18 | 24 | 30 | 36;
  pH: string;             // legacy (single pH, kept for backward compat)
  phValues: PhValue[];    // preferred multi-pH values
  description: string;
}

export interface SaveStabilityResponse {
  success: boolean;
  message?: string;
  error?: string;
  recordedAt?: string;
  createdAt?: string;
}
