
export interface RMTestParameter {
  name: string;
  limits: string;
  result: string;
  complies?: boolean;
}

export interface RMCOARecord {
  _id?: string;
  // Core identification
  arNo: string;
  materialCode: string;
  materialName: string;

  // Optional batch linkage
  batchNumber?: string;

  // Test information
  testDate?: string;
  testNumber?: string;
  status: string;

  // Additional fields
  manufacturer?: string;
  supplier?: string;
  lotNumber?: string;
  quantity?: string;
  uom?: string;
  mfgDate?: string;
  expDate?: string;

  // Test parameters
  testParameters: RMTestParameter[];

  // Metadata
  sourceFile: string;
  uploadedAt?: Date;
  contentHash?: string;
  parsingStatus?: 'success' | 'partial' | 'failed';
  parsingWarnings?: string[];
}

export interface RMCOAResponse {
    success: boolean;
    data: RMCOARecord[];
    errors?: string[];
}
