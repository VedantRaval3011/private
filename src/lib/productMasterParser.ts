/**
 * Product Master XML Parser
 * Handles parsing and extraction of Product Master data
 */

import { parseStringPromise } from 'xml2js';
import { IProductMaster } from '@/models/ProductMaster';
import { healXmlContent } from './xmlParser';

interface ParsedProductMaster {
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
  mfg?: string;
  pack?: string;
  hsnCode?: string;
  tariff?: string;
  storageBin?: string;
  displayFormat?: string;
  actualFilling?: string;
  exciseDutyGroup?: string;
  exciseNotification?: string;
  // Specification & batch fields from XML
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
}

// ... existing helper functions (safeGet, findValue) ...

/**
 * Safely extract deep values and handle arrays
 */
function safeGet(obj: any, keys: string[]): string {
  if (!obj) return '';

  for (const key of keys) {
    if (obj[key] !== undefined) {
      const val = obj[key];
      if (Array.isArray(val)) {
        return val[0]?.toString().trim() || '';
      }
      return val?.toString().trim() || '';
    }
    
    // Check case-insensitive
    const foundKey = Object.keys(obj).find(k => k.toUpperCase() === key.toUpperCase());
    if (foundKey) {
      const val = obj[foundKey];
      if (Array.isArray(val)) {
        return val[0]?.toString().trim() || '';
      }
      return val?.toString().trim() || '';
    }
  }
  return '';
}

/**
 * Find value by searching multiple possible keys in an object
 */
function findValue(obj: any, possibleKeys: string[]): string {
  return safeGet(obj, possibleKeys);
}


/**
 * Parse Product Master XML content
 */
export async function parseProductMasterXml(xmlContent: string): Promise<ParsedProductMaster[]> {
  try {
    // Heal XML before parsing because the file might be truncated
    const healedXml = healXmlContent(xmlContent);
    const result = await parseStringPromise(healedXml);
    const products: ParsedProductMaster[] = [];

    // Navigate to the list of products
    // The XML structure is: ITEMMASTER > LIST_G_CASEPACK > G_CASEPACK[]
    
    let root = result;
    
    // Find the array of products by traversing
    function findArray(obj: any): any[] {
        if (!obj) return [];
        for (const key in obj) {
            if (Array.isArray(obj[key]) && obj[key].length > 0) {
                 // Check if it looks like a product record (has relevant fields)
                 const firstItem = obj[key][0];
                 if (typeof firstItem === 'object' && firstItem !== null) {
                    const itemKeys = Object.keys(firstItem).join(' ').toUpperCase();
                    if (itemKeys.includes('ITMCODE') || itemKeys.includes('ITMNAME') || 
                        itemKeys.includes('MCADNO') || itemKeys.includes('DEPARTMENT')) {
                        return obj[key];
                    }
                 }
                 // Continue searching if not found
                 const deepResult = findArray(obj[key][0]);
                 if (deepResult.length > 0) return deepResult;
            } else if (typeof obj[key] === 'object') {
                const deepResult = findArray(obj[key]);
                if (deepResult.length > 0) return deepResult;
            }
        }
        return [];
    }
    
    const productList = findArray(root);
    
    if (!productList || productList.length === 0) {
        throw new Error("Could not find product list in XML");
    }

    for (const item of productList) {
      // Map XML fields to Product Master fields based on actual XML structure
      const productCode = findValue(item, ['ITMCODE', 'PRODUCT_CODE', 'PRODUCTCODE', 'CODE', 'ITEM_CODE']);
      const productName = findValue(item, ['ITMNAME', 'ITMDETAIL', 'PRODUCT_NAME', 'PRODUCTNAME', 'NAME', 'ITEM_NAME']);
      
      if (!productCode && !productName) continue; // Skip invalid records

      products.push({
        productCode: productCode || 'N/A',
        productName: productName || 'N/A',
        department: findValue(item, ['DEPARTMENT', 'DEPT', 'DPT_NAME']) || 'N/A',
        masterCardNo: findValue(item, ['MCADNO', 'MASTERCARDNO', 'MASTER_CARD_NO', 'MC_NO']) || 'N/A',
        storageCondition: findValue(item, ['STOCOND', 'STORAGECONDITION', 'STORAGE_CONDITION', 'STORAGE', 'STORE_AT']) || 'N/A',
        productType: findValue(item, ['LOCEXP', 'PRODUCTTYPE', 'PRODUCT_TYPE', 'TYPE', 'CAT', 'CATEGORY']) || 'N/A',
        therapeuticCategory: findValue(item, ['ITMGROUP', 'THERAPEUTICCATE', 'THERAPEUTIC_CATEGORY', 'THERAP_CAT', 'CATEGORY', 'THERAPEUTIC']) || 'N/A',
        
        // New fields mapping
        genericName: findValue(item, ['GENERICNM', 'GENERIC_NAME', 'GENERIC']) || '',
        synonym: findValue(item, ['SYNONYM', 'SYN']) || '',
        genericBranded: findValue(item, ['BRAND', 'GENERIC_BRANDED', 'BRANDED']) || '',
        mfg: findValue(item, ['MAKE', 'MFG', 'MANUFACTURER']) || '',
        pack: findValue(item, ['STDPACK', 'PACK_SIZE', 'PACKSIZE']) || '', 
        hsnCode: findValue(item, ['HSNCODE', 'HSN_CODE', 'HSN']) || '',
        tariff: findValue(item, ['TARRIF', 'TARIFF', 'TARIFF_NO']) || '',
        storageBin: findValue(item, ['BINDESC', 'BIN', 'STORAGE_BIN']) || '',
        displayFormat: findValue(item, ['PACK', 'DISPLAY_FORMAT', 'DISPLAYFORMAT']) || '',
        actualFilling: findValue(item, ['ACTFILLING', 'ACTUAL_FILLING', 'FILLING']) || '',
        exciseDutyGroup: findValue(item, ['EXDGROUP', 'EXCISE_DUTY_GROUP', 'EXCISE_GROUP']) || '',
        exciseNotification: findValue(item, ['NOTIFICATION', 'NOTIF', 'EXCISE_NOTIFICATION']) || '',

        // Specification & effective batch fields
        specification: findValue(item, ['SPEC1', 'SPEC', 'SPECIFICATION']) || '',
        // PRIZEEFF is the "Effective Batch No" field in the product master XML (price-effective batch)
        effectiveBatchNo: findValue(item, ['PRIZEEFF', 'EFFBATCH1', 'EFFBATCH', 'EFF_BATCH', 'EFFECTIVE_BATCH']) || '',
        effectiveDate: findValue(item, ['EFDATE', 'EFDATE1', 'EFF_DATE', 'EFFECTIVE_DATE']) || '',
        revisionNo: findValue(item, ['REVNO', 'REV_NO', 'REVISION_NO']) || '',
        revisionRemark: findValue(item, ['REVRMK', 'REV_RMK', 'REVISION_REMARK']) || '',
        workStatus: findValue(item, ['WRKSTATUS', 'WORK_STATUS', 'STATUS']) || '',
        formulaMasterId: findValue(item, ['FORMASTID', 'FORMULA_MAST_ID', 'FORMAST_ID']) || '',
        mfgLicenseNo: findValue(item, ['MFGLICNO', 'MFG_LIC_NO', 'MFG_LICENSE']) || '',
        liveMonth: findValue(item, ['LIVEMONTH', 'LIVE_MONTH', 'SHELF_LIFE_MONTHS']) || '',
        batchSize: findValue(item, ['BATCHSIZE1', 'BATCHSIZE', 'BATCH_SIZE']) || '',
        batchUom: findValue(item, ['BATCHUOM1', 'BATCHUOM', 'BATCH_UOM']) || '',
        locationCode: findValue(item, ['LOCCODE1', 'LOCCODE', 'LOC_CODE', 'LOCATION_CODE']) || '',
        isNonActive: findValue(item, ['NONACTIVE', 'NON_ACTIVE', 'INACTIVE']) || '',
      });
    }

    return products;
  } catch (error) {
    console.error("Error parsing Product Master XML:", error);
    throw error; // Re-throw to be handled by caller
  }
}
