/**
 * XML Parser Utility for Formula Master XML
 * Handles parsing, validation, and data extraction
 * Supports Oracle Reports XML format (FORMULAMAST)
 */

import { parseStringPromise } from 'xml2js';
import { v4 as uuidv4 } from 'uuid';
import type {
  FormulaMasterData,
  CompanyInfo,
  MasterFormulaDetails,
  BatchInfo,
  CompositionItem,
  MaterialItem,
  FillingDetail,
  SummaryTotals,
  FormulaRecord,
  BatchRecordItem,
  BatchRegistryData,
} from '@/types/formula';

// ============================================
// Helper Functions
// ============================================

/**
 * Safely extract a value from XML object
 * Handles arrays and nested structures
 */
function safeGet(obj: unknown, path: string[], defaultValue: string = ''): string {
  try {
    let current: unknown = obj;
    for (const key of path) {
      if (current === null || current === undefined) return defaultValue;
      if (typeof current === 'object' && current !== null) {
        current = (current as Record<string, unknown>)[key];
      } else {
        return defaultValue;
      }
    }
    
    // Handle xml2js array format
    if (Array.isArray(current)) {
      current = current[0];
    }
    
    // Handle nested objects with text content
    if (typeof current === 'object' && current !== null) {
      if ('_' in current) {
        return String((current as Record<string, unknown>)['_']).trim();
      }
      if ('$' in current && typeof (current as Record<string, unknown>)['$'] === 'object') {
        const attrs = (current as Record<string, unknown>)['$'] as Record<string, unknown>;
        return JSON.stringify(attrs);
      }
      return defaultValue;
    }
    
    return current !== null && current !== undefined ? String(current).trim() : defaultValue;
  } catch {
    return defaultValue;
  }
}

/**
 * Find a value by searching multiple possible paths
 */
function findValue(obj: unknown, paths: string[][], defaultValue: string = 'N/A'): string {
  for (const path of paths) {
    const value = safeGet(obj, path, '');
    if (value && value !== '') {
      return value;
    }
  }
  return defaultValue;
}

/**
 * Find a value case-insensitively in an object
 */
function findValueCaseInsensitive(obj: unknown, keys: string[], defaultValue: string = ''): string {
  if (!obj || typeof obj !== 'object') return defaultValue;
  
  const record = obj as Record<string, unknown>;
  const objKeys = Object.keys(record);
  
  for (const searchKey of keys) {
    const foundKey = objKeys.find(k => k.toLowerCase() === searchKey.toLowerCase());
    if (foundKey) {
      let value = record[foundKey];
      if (Array.isArray(value)) value = value[0];
      if (typeof value === 'string') return value.trim();
      if (typeof value === 'number') return String(value);
    }
  }
  return defaultValue;
}

/**
 * Extract all elements with a specific tag name from XML (case-insensitive)
 */
function findElements(obj: unknown, tagName: string): unknown[] {
  const results: unknown[] = [];
  const tagLower = tagName.toLowerCase();
  
  function search(current: unknown) {
    if (current === null || current === undefined) return;
    
    if (Array.isArray(current)) {
      current.forEach(item => search(item));
      return;
    }
    
    if (typeof current === 'object' && current !== null) {
      const record = current as Record<string, unknown>;
      
      for (const key of Object.keys(record)) {
        if (key.toLowerCase() === tagLower) {
          const found = record[key];
          if (Array.isArray(found)) {
            results.push(...found);
          } else {
            results.push(found);
          }
        }
      }
      
      // Search nested objects
      Object.values(record).forEach(value => search(value));
    }
  }
  
  search(obj);
  return results;
}

/**
 * Get nested data from Oracle Reports XML structure
 */
function getG1Data(data: unknown): unknown {
  if (!data || typeof data !== 'object') return null;
  
  const record = data as Record<string, unknown>;
  
  // Try different paths to find G_1 data
  const paths = [
    ['LIST_G_1', 'G_1'],
    ['list_g_1', 'g_1'],
  ];
  
  for (const path of paths) {
    let current: unknown = record;
    for (const key of path) {
      if (current && typeof current === 'object') {
        const currentRecord = current as Record<string, unknown>;
        const foundKey = Object.keys(currentRecord).find(k => k.toLowerCase() === key.toLowerCase());
        if (foundKey) {
          current = currentRecord[foundKey];
          if (Array.isArray(current)) {
            current = current[0];
          }
        } else {
          current = null;
          break;
        }
      }
    }
    if (current) return current;
  }
  
  return null;
}

/**
 * Get company data from Oracle Reports XML structure
 */
function getCompanyData(data: unknown): unknown {
  if (!data || typeof data !== 'object') return null;
  
  const record = data as Record<string, unknown>;
  
  // Try different paths to find company data
  const paths = [
    ['LIST_G_CMPNM', 'G_CMPNM'],
    ['list_g_cmpnm', 'g_cmpnm'],
  ];
  
  for (const path of paths) {
    let current: unknown = record;
    for (const key of path) {
      if (current && typeof current === 'object') {
        const currentRecord = current as Record<string, unknown>;
        const foundKey = Object.keys(currentRecord).find(k => k.toLowerCase() === key.toLowerCase());
        if (foundKey) {
          current = currentRecord[foundKey];
          if (Array.isArray(current)) {
            current = current[0];
          }
        } else {
          current = null;
          break;
        }
      }
    }
    if (current) return current;
  }
  
  return null;
}

// ============================================
// Extraction Functions for Oracle Reports XML
// ============================================

function extractCompanyInfo(data: unknown, rootData: unknown): CompanyInfo {
  // Try to get company info from G_CMPNM section
  const companyData = getCompanyData(rootData);
  
  const companyName = companyData 
    ? findValueCaseInsensitive(companyData, ['CMPNM', 'COMPANYNAME', 'COMPANY_NAME'], '')
    : '';
    
  const companyAddress = companyData
    ? findValueCaseInsensitive(companyData, ['CMPADD', 'COMPANYADDRESS', 'COMPANY_ADDRESS'], '')
    : '';

  return {
    companyName: companyName || findValue(data, [
      ['CMPNM'],
      ['COMPANYNAME'],
      ['COMPANY_NAME'],
      ['HEADER', 'COMPANY_NAME'],
    ]),
    companyAddress: companyAddress || findValue(data, [
      ['CMPADD'],
      ['COMPANYADDRESS'],
      ['COMPANY_ADDRESS'],
      ['HEADER', 'COMPANY_ADDRESS'],
    ]),
    documentTitle: 'Master Formula',
    pageNumber: findValue(data, [
      ['PAGE_NUMBER'],
      ['PAGENO'],
    ], undefined as unknown as string),
  };
}

function extractMasterFormulaDetails(data: unknown): MasterFormulaDetails {
  const g1 = data as Record<string, unknown>;
  
  return {
    masterCardNo: findValueCaseInsensitive(g1, ['MCADNO', 'MASTERCARDNO', 'MASTER_CARD_NO'], 'N/A'),
    productCode: findValueCaseInsensitive(g1, ['ITMCODE', 'PRODUCTCODE', 'PRODUCT_CODE', 'ITEMCODE'], 'N/A'),
    productName: findValueCaseInsensitive(g1, ['ITMNAME1', 'ITMDETAIL1', 'PRODUCTNAME', 'PRODUCT_NAME', 'ITEMNAME'], 'N/A'),
    genericName: findValueCaseInsensitive(g1, ['GENERICNM', 'GENERICNAME', 'GENERIC_NAME'], 'N/A'),
    specification: findValueCaseInsensitive(g1, ['SPEC1', 'SPECIFICATION', 'SPEC'], 'N/A'),
    manufacturingLicenseNo: findValueCaseInsensitive(g1, ['MFGLICNO', 'MFG_LICENSE_NO', 'MANUFACTURINGLICENSENO'], 'N/A'),
    manufacturingLocation: findValueCaseInsensitive(g1, ['LOCCODE1', 'LOCATION', 'MFG_LOCATION', 'MANUFACTURINGLOCATION'], 'N/A'),
    reasonForChange: findValueCaseInsensitive(g1, ['REVRMK', 'REASON_FOR_CHANGE', 'REASONFORCHANGE'], undefined as unknown as string),
    revisionNo: findValueCaseInsensitive(g1, ['REVNO', 'REVISION_NO', 'REVISIONNO'], undefined as unknown as string),
    manufacturer: findValueCaseInsensitive(g1, ['MAKE', 'MANUFACTURER', 'MANUFACTURER_NAME'], 'N/A'),
    shelfLife: findValueCaseInsensitive(g1, ['LIVEMONTH', 'SHELF_LIFE', 'SHELFLIFE'], 'N/A'),
    effectiveBatchNo: findValueCaseInsensitive(g1, ['EFFBATCH', 'EFFBATCH1', 'EFFECTIVE_BATCH_NO', 'EFFECTIVEBATCHNO'], undefined as unknown as string),
    date: findValueCaseInsensitive(g1, ['PERMRENDATE', 'DATE', 'EFFECTIVE_DATE'], undefined as unknown as string),
  };
}

function extractBatchInfo(data: unknown): BatchInfo {
  const g1 = data as Record<string, unknown>;
  
  return {
    batchSize: findValueCaseInsensitive(g1, ['BATCHSIZE1', 'BATCH_SIZE', 'BATCHSIZE', 'STD_BATCH_SIZE'], 'N/A') + 
               ' ' + findValueCaseInsensitive(g1, ['BATCHUOM1', 'BATCH_UOM', 'BATCHUOM'], ''),
    labelClaim: findValueCaseInsensitive(g1, ['LABELCLAIM', 'LABEL_CLAIM', 'LBLCLAIM1'], 'N/A'),
    marketedBy: findValueCaseInsensitive(g1, ['MKTBY', 'MARKETED_BY', 'MARKETEDBY'], undefined as unknown as string),
    volume: findValueCaseInsensitive(g1, ['PACK1', 'VOLUME', 'VOL'], undefined as unknown as string),
  };
}

function extractComposition(data: unknown): CompositionItem[] {
  const compositions: CompositionItem[] = [];
  const g1 = data as Record<string, unknown>;
  
  // Parse label claim text to extract composition items
  const labelClaim = findValueCaseInsensitive(g1, ['LABELCLAIM', 'LABEL_CLAIM'], '');
  
  if (labelClaim && labelClaim !== 'N/A') {
    // Try to parse structured label claim
    const lines = labelClaim.split(/[;\n]/);
    for (const line of lines) {
      const match = line.match(/([A-Za-z\s\(\)\.]+)[\.]*\s*([\d\.]+)\s*(MG|GM|G|ML|MCG|IU)?/i);
      if (match) {
        compositions.push({
          activeIngredientName: match[1].trim(),
          strengthPerUnit: match[2] + (match[3] ? ' ' + match[3].toUpperCase() : ''),
          form: findValueCaseInsensitive(g1, ['PACKC', 'FORM', 'TYPE'], 'N/A'),
          equivalentBase: undefined,
        });
      }
    }
  }
  
  return compositions;
}

function extractMaterials(data: unknown): MaterialItem[] {
  const materials: MaterialItem[] = [];
  
  // Find all G_2 elements (materials) within G_PROCESS
  const g2Elements = findElements(data, 'G_2');
  
  for (const element of g2Elements) {
    if (element && typeof element === 'object') {
      const g2 = element as Record<string, unknown>;
      
      const matCode = findValueCaseInsensitive(g2, ['MATCODE', 'MATERIAL_CODE', 'MATERIALCODE'], '');
      const matDetail = findValueCaseInsensitive(g2, ['MATDETAIL', 'MATERIAL_NAME', 'MATERIALNAME', 'MAT_NAME'], '');
      const subMatType = findValueCaseInsensitive(g2, ['SUBMATTYPE', 'MATTYPE', 'MATERIAL_TYPE'], '');
      
      // Filter for raw materials (ACTIVE, INACTIVE in SUBMATTYPE or RM in MATTYPE)
      const matType = findValueCaseInsensitive(g2, ['MATTYPE'], '');
      const isRawMaterial = matType.toUpperCase() === 'RM' || 
                           subMatType.toLowerCase() === 'active' || 
                           subMatType.toLowerCase() === 'inactive';
      
      if ((matCode || matDetail) && isRawMaterial) {
        const srNoValue = findValueCaseInsensitive(g2, ['SRNO', 'SR_NO', 'SERIAL_NO'], '0');
        
        materials.push({
          srNo: parseInt(srNoValue) || materials.length + 1,
          materialCode: matCode,
          materialName: matDetail,
          potencyCorrection: findValueCaseInsensitive(g2, ['POTENCOR', 'POTENCY_CORRECTION', 'POT_CORR'], 'N'),
          requiredQuantity: findValueCaseInsensitive(g2, ['REQQTY', 'CF_REQQTY', 'REQUIRED_QTY', 'REQUIRED_QUANTITY'], 'N/A'),
          overages: findValueCaseInsensitive(g2, ['OVG_P', 'OVERAGES', 'OVERAGE'], undefined as unknown as string),
          quantityPerUnit: findValueCaseInsensitive(g2, ['PERUNIT', 'QUANTITY_PER_UNIT', 'QTY_PER_UNIT'], 'N/A'),
          requiredQuantityStandardBatch: findValueCaseInsensitive(g2, ['BATCHQTY', 'REQUIRED_QTY_STD_BATCH', 'STD_BATCH_QTY'], 'N/A'),
          equivalentMaterial: findValueCaseInsensitive(g2, ['SYNONYMS', 'EQUIVALENT_MATERIAL', 'EQUIV_MAT'], undefined as unknown as string),
          conversionFactor: findValueCaseInsensitive(g2, ['EQFACT', 'CONVERSION_FACTOR', 'CONV_FACTOR'], undefined as unknown as string),
        });
      }
    }
  }
  
  // Remove duplicates based on material code and stage
  const uniqueMaterials = materials.filter((material, index, self) => {
    const firstIndex = self.findIndex(m => 
      m.materialCode === material.materialCode && 
      m.srNo === material.srNo
    );
    return index === firstIndex;
  });
  
  return uniqueMaterials;
}

function extractFillingDetails(data: unknown): FillingDetail[] {
  const fillingDetails: FillingDetail[] = [];
  
  // Find G_ITMCODE1 elements within G_PROCESS (Aseptic Filling process)
  const processElements = findElements(data, 'G_PROCESS');
  
  for (const process of processElements) {
    if (process && typeof process === 'object') {
      const processData = process as Record<string, unknown>;
      const processName = findValueCaseInsensitive(processData, ['PROCESS'], '').toLowerCase();
      
      // Only get filling details from filling process
      if (processName.includes('filling')) {
        const itmcode1Elements = findElements(process, 'G_ITMCODE1');
        
        for (const element of itmcode1Elements) {
          if (element && typeof element === 'object') {
            const itm = element as Record<string, unknown>;
            
            const itmCode = findValueCaseInsensitive(itm, ['ITMCODE1', 'ITEM_CODE'], '');
            const itmDetail = findValueCaseInsensitive(itm, ['ITMDETAIL', 'ITEM_NAME'], '');
            
            if (itmCode || itmDetail) {
              fillingDetails.push({
                productCode: itmCode,
                productName: itmDetail,
                packingSize: findValueCaseInsensitive(itm, ['ITMPACK', 'PACKING_SIZE', 'PACKINGSIZE', 'PACK_SIZE'], 'N/A'),
                actualFillingQuantity: findValueCaseInsensitive(itm, ['ACTFILLING1', 'ACTFILLING2', 'ACTUAL_FILLING_QTY', 'FILLING_QTY'], 'N/A'),
                numberOfSyringes: findValueCaseInsensitive(itm, ['CF_CONVERSION', 'SUM_PMREQQTY', 'NO_OF_SYRINGES', 'SYRINGE_COUNT'], 'N/A'),
                syringeType: findValueCaseInsensitive(itm, ['UNIT', 'SYRINGE_TYPE', 'CONTAINER_TYPE'], undefined as unknown as string),
              });
            }
          }
        }
      }
    }
  }
  
  return fillingDetails;
}

function extractSummary(data: unknown): SummaryTotals {
  const g1 = data as Record<string, unknown>;
  
  return {
    totalUnitsProduced: findValueCaseInsensitive(g1, ['ACTFILLING3', 'TOTAL_UNITS', 'TOTALUNITS'], undefined as unknown as string),
    totalFillingQuantity: findValueCaseInsensitive(g1, ['CF_UOM', 'TOTAL_FILLING_QTY'], undefined as unknown as string),
    standardBatchSizeCompliance: findValueCaseInsensitive(g1, ['NONACTIVE', 'BATCH_COMPLIANCE'], undefined as unknown as string),
  };
}

// ============================================
// Main Parser Function
// ============================================

export interface ParseResult {
  success: boolean;
  data?: FormulaMasterData;
  errors: string[];
  warnings: string[];
}

export async function parseFormulaXml(xmlContent: string): Promise<ParseResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  try {
    // Parse XML string to JavaScript object
    const result = await parseStringPromise(xmlContent, {
      explicitArray: false,
      ignoreAttrs: false,
      trim: true,
      normalize: true,
      // Don't normalize tags to preserve case for Oracle Reports XML
      normalizeTags: false,
    });
    
    if (!result) {
      return {
        success: false,
        errors: ['Failed to parse XML: Empty result'],
        warnings,
      };
    }
    
    // Find the root element (could be named differently)
    const rootKey = Object.keys(result)[0];
    const rootData = result[rootKey] || result;
    
    // For Oracle Reports XML, get the G_1 data
    const g1Data = getG1Data(rootData) || rootData;
    
    // Extract all sections
    const companyInfo = extractCompanyInfo(g1Data, rootData);
    const masterFormulaDetails = extractMasterFormulaDetails(g1Data);
    const batchInfo = extractBatchInfo(g1Data);
    const composition = extractComposition(g1Data);
    const materials = extractMaterials(g1Data);
    const fillingDetails = extractFillingDetails(g1Data);
    const summary = extractSummary(g1Data);
    
    // Validate required fields
    if (masterFormulaDetails.productCode === 'N/A') {
      warnings.push('Product code not found in XML');
    }
    if (masterFormulaDetails.productName === 'N/A') {
      warnings.push('Product name not found in XML');
    }
    if (materials.length === 0) {
      warnings.push('No materials found in XML');
    }
    
    console.log('Parsed Formula Data:', {
      companyInfo,
      masterFormulaDetails,
      batchInfo,
      compositionCount: composition.length,
      materialsCount: materials.length,
      fillingDetailsCount: fillingDetails.length,
    });
    
    return {
      success: true,
      data: {
        companyInfo,
        masterFormulaDetails,
        batchInfo,
        composition,
        materials,
        fillingDetails,
        summary,
      },
      errors,
      warnings,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown parsing error';
    return {
      success: false,
      errors: [`XML parsing failed: ${errorMessage}`],
      warnings,
    };
  }
}

// ============================================
// Validation Functions
// ============================================

export function validateXmlContent(xmlContent: string): { valid: boolean; error?: string } {
  if (!xmlContent || xmlContent.trim() === '') {
    return { valid: false, error: 'XML content is empty' };
  }
  
  // Basic XML structure check
  const trimmed = xmlContent.trim();
  if (!trimmed.startsWith('<?xml') && !trimmed.startsWith('<')) {
    return { valid: false, error: 'Invalid XML format: Document must start with XML declaration or root element' };
  }
  
  return { valid: true };
}
// ============================================
// Create Formula Record
// ============================================

export function createFormulaRecord(
  parsedData: FormulaMasterData,
  fileName: string,
  fileSize: number,
  rawXml?: string,
  parsingWarnings: string[] = []
): Omit<FormulaRecord, '_id'> {
  const productCode = parsedData.masterFormulaDetails.productCode || 'UNKNOWN';
  const revisionNo = parsedData.masterFormulaDetails.revisionNo || '1';
  
  return {
    uniqueIdentifier: `${productCode}-REV${revisionNo}-${uuidv4().slice(0, 8)}`,
    uploadedAt: new Date(),
    fileName,
    fileSize,
    rawXmlContent: rawXml,
    parsingStatus: parsingWarnings.length > 0 ? 'partial' : 'success',
    parsingErrors: parsingWarnings,
    ...parsedData,
  };
}

// ============================================
// Batch Registry XML Parser (BATCHCRREGI)
// ============================================

export interface BatchRegistryParseResult {
  success: boolean;
  data?: BatchRegistryData;
  errors: string[];
  warnings: string[];
}

/**
 * Parse Batch Registry XML (BATCHCRREGI format)
 * Extracts batch information from Oracle Reports XML
 */
export async function parseBatchRegistryXml(xmlContent: string): Promise<BatchRegistryParseResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  try {
    // Parse XML string to JavaScript object
    const result = await parseStringPromise(xmlContent, {
      explicitArray: false,
      ignoreAttrs: false,
      trim: true,
      normalize: true,
      normalizeTags: false,
    });
    
    if (!result) {
      return {
        success: false,
        errors: ['Failed to parse XML: Empty result'],
        warnings,
      };
    }
    
    // Find the root element (BATCHCRREGI)
    const rootKey = Object.keys(result)[0];
    const rootData = result[rootKey] || result;
    
    // Extract company information from LIST_G_CMPNM
    let companyName = '';
    let companyAddress = '';
    
    const companySection = rootData?.LIST_G_CMPNM?.G_CMPNM;
    if (companySection) {
      const companyData = Array.isArray(companySection) ? companySection[0] : companySection;
      companyName = getTextValue(companyData?.CMPNM) || '';
      companyAddress = getTextValue(companyData?.CMPADD1) || '';
    }
    
    // Find all G_MATCODE elements (batch records)
    const matCodeSection = rootData?.LIST_G_MATCODE?.G_MATCODE;
    
    if (!matCodeSection) {
      return {
        success: false,
        errors: ['No batch records found in XML (LIST_G_MATCODE/G_MATCODE not found)'],
        warnings,
      };
    }
    
    // Ensure matCodeSection is an array
    const matCodeElements = Array.isArray(matCodeSection) ? matCodeSection : [matCodeSection];
    
    const batches: BatchRecordItem[] = [];
    let exportCount = 0;
    let importCount = 0;
    
    for (const element of matCodeElements) {
      if (!element || typeof element !== 'object') continue;
      
      const record = element as Record<string, unknown>;
      
      // Get MRP value - if empty or just whitespace, it's Export, otherwise Import
      const mrpRaw = getTextValue(record.MRP);
      const mrpValue = mrpRaw && mrpRaw.trim() !== '' ? mrpRaw.trim() : null;
      const type: 'Export' | 'Import' = mrpValue === null ? 'Export' : 'Import';
      
      if (type === 'Export') {
        exportCount++;
      } else {
        importCount++;
      }
      
      // Get serial number, default to batches.length + 1
      const srNoRaw = getTextValue(record.SRNO);
      const srNo = srNoRaw ? parseInt(srNoRaw) || batches.length + 1 : batches.length + 1;
      
      const batchRecord: BatchRecordItem = {
        srNo,
        batchUom: getTextValue(record.BATCHUOM) || 'N/A',
        itemCode: getTextValue(record.ITMCODE)?.trim() || 'N/A',
        mfgLicNo: getTextValue(record.MFGLICNO) || 'N/A',
        department: getTextValue(record.DEPARTMENT) || 'N/A',
        pack: getTextValue(record.PACK) || 'N/A',
        itemDetail: getTextValue(record.ITMDETAIL)?.trim() || 'N/A',
        itemName: getTextValue(record.ITMNAME) || 'N/A',
        mfgDate: getTextValue(record.MFGDT) || 'N/A',
        locationId: getTextValue(record.LOCID) || 'N/A',
        mrpValue,
        type,
        batchNumber: getTextValue(record.BATCH) || 'N/A',
        year: getTextValue(record.YEAR) || 'N/A',
        make: getTextValue(record.MAKE1) || 'N/A',
        expiryDate: getTextValue(record.EXPDT) || 'N/A',
        batchSize: getTextValue(record.BATCHSIZE) || 'N/A',
        unit: getTextValue(record.UNIT) || 'N/A',
        conversionRatio: getTextValue(record.CF_CONVIRSON) || 'N/A',
        batchCompletionDate: getTextValue(record.BATCHCOMPDT) || undefined,
      };
      
      batches.push(batchRecord);
    }
    
    if (batches.length === 0) {
      warnings.push('No valid batch records could be extracted');
    }
    
    console.log('Parsed Batch Registry Data:', {
      companyName,
      totalBatches: batches.length,
      exportCount,
      importCount,
    });
    
    return {
      success: true,
      data: {
        companyName,
        companyAddress,
        batches,
        totalBatches: batches.length,
        exportCount,
        importCount,
      },
      errors,
      warnings,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown parsing error';
    return {
      success: false,
      errors: [`Batch Registry XML parsing failed: ${errorMessage}`],
      warnings,
    };
  }
}

/**
 * Helper function to safely get text value from XML node
 * Handles both simple strings and complex objects from xml2js
 */
function getTextValue(node: unknown): string | null {
  if (node === null || node === undefined) return null;
  
  // Handle simple string
  if (typeof node === 'string') {
    return node.trim() || null;
  }
  
  // Handle number
  if (typeof node === 'number') {
    return String(node);
  }
  
  // Handle array (xml2js sometimes wraps values in arrays)
  if (Array.isArray(node)) {
    return node.length > 0 ? getTextValue(node[0]) : null;
  }
  
  // Handle object with _ property (text content in xml2js)
  if (typeof node === 'object' && node !== null) {
    const obj = node as Record<string, unknown>;
    if ('_' in obj) {
      return String(obj._).trim() || null;
    }
    // Empty object means empty tag
    if (Object.keys(obj).length === 0) {
      return null;
    }
  }
  
  return null;
}
