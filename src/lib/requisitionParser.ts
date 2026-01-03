/**
 * Requisition XML Parser
 * Parses Material Requisition (MATREQ) XML files
 * Extracts batch and material data with categorization (RM/PPM/PM)
 */

import { parseStringPromise } from 'xml2js';
import type {
  RequisitionParseResult,
  RequisitionBatch,
  RequisitionMaterial,
  MaterialCategory,
} from '@/types/requisition';

// ============================================
// Helper Functions
// ============================================

/**
 * Safely extract a value from XML object
 */
function safeGet(obj: unknown, path: string[], defaultValue: string = ''): string {
  let current: unknown = obj;
  
  for (const key of path) {
    if (current === null || current === undefined) {
      return defaultValue;
    }
    if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[key];
    } else {
      return defaultValue;
    }
  }
  
  // Handle arrays (common in xml2js output)
  if (Array.isArray(current)) {
    current = current[0];
  }
  
  if (current === null || current === undefined) {
    return defaultValue;
  }
  
  return String(current).trim();
}

/**
 * Parse a number from string, handling empty/invalid values
 */
function parseNumber(value: string | undefined | null): number {
  if (!value) return 0;
  const cleaned = String(value).trim().replace(/,/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

/**
 * Determine material category from MATTYPE and PROCESS field
 */
function getMaterialCategory(matType: string, processName: string = ''): MaterialCategory {
  const type = matType.toUpperCase().trim();
  const process = processName.toUpperCase().trim();
  
  if (type === 'RM') return 'RM';
  
  // If the process is Filling or Aseptic Filling, it's considered Primary Packaging (PPM)
  // even if the XML marks it as PM
  if (type === 'PPM' || process.includes('FILLING')) return 'PPM';
  
  return 'PM'; // Default to PM for packaging materials
}

/**
 * Heal malformed XML by appending missing closing tags
 */
function healXmlContent(xmlContent: string): string {
  let healed = xmlContent;
  
  // Check if XML appears truncated
  if (!healed.trim().endsWith('</MATREQ>')) {
    // Find unclosed tags and close them
    const tagStack: string[] = [];
    const tagPattern = /<\/?([A-Z_][A-Z0-9_]*)[^>]*>/gi;
    let match;
    
    while ((match = tagPattern.exec(healed)) !== null) {
      const fullTag = match[0];
      const tagName = match[1];
      
      if (fullTag.startsWith('</')) {
        // Closing tag - pop from stack
        if (tagStack.length > 0 && tagStack[tagStack.length - 1].toUpperCase() === tagName.toUpperCase()) {
          tagStack.pop();
        }
      } else if (!fullTag.endsWith('/>')) {
        // Opening tag - push to stack
        tagStack.push(tagName);
      }
    }
    
    // Close remaining open tags in reverse order
    while (tagStack.length > 0) {
      const tag = tagStack.pop();
      healed += `</${tag}>`;
    }
  }
  
  return healed;
}

// ============================================
// Main Parser Function
// ============================================

/**
 * Parse Requisition (MATREQ) XML content
 */
export async function parseRequisitionXml(xmlContent: string): Promise<RequisitionParseResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  try {
    // Heal potentially malformed XML
    const healedContent = healXmlContent(xmlContent);
    
    // Parse XML to JavaScript object
    const parsed = await parseStringPromise(healedContent, {
      explicitArray: false,
      ignoreAttrs: true,
      trim: true,
    });
    
    // Find the root MATREQ element
    const matreq = parsed.MATREQ || parsed.matreq;
    if (!matreq) {
      return {
        success: false,
        totalFound: 0,
        errors: ['No MATREQ root element found'],
        warnings: [],
      };
    }
    
    // Get the batch list
    const batchList = matreq.LIST_G_BATCHSIZEBC?.G_BATCHSIZEBC;
    if (!batchList) {
      return {
        success: false,
        totalFound: 0,
        errors: ['No batch data found in MATREQ'],
        warnings: [],
      };
    }
    
    // Ensure it's an array
    const batchArray = Array.isArray(batchList) ? batchList : [batchList];
    
    const batches: RequisitionBatch[] = [];
    const rawMaterials: RequisitionMaterial[] = [];
    const primaryPackaging: RequisitionMaterial[] = [];
    const packingMaterials: RequisitionMaterial[] = [];
    
    let locationCode = '';
    let make = '';
    
    // Process each batch
    console.log('\n📦 PARSING BATCHES...');
    let batchIndex = 0;
    for (const batchData of batchArray) {
      try {
        batchIndex++;
        const batchNumber = safeGet(batchData, ['BATCH'], '');
        const matReqId = safeGet(batchData, ['MATREQID'], '');
        
        if (!batchNumber || !matReqId) {
          console.log(`   ⚠️ [${batchIndex}/${batchArray.length}] SKIPPED - Missing batch number or ID`);
          warnings.push(`Skipping batch with missing number or ID`);
          continue;
        }
        
        // Extract location and make from first batch
        if (!locationCode) {
          locationCode = safeGet(batchData, ['LOCCODE'], '');
        }
        if (!make) {
          make = safeGet(batchData, ['MAKE'], '');
        }
        
        const matReqNo = safeGet(batchData, ['MATREQNO'], '');
        const mfcNo = safeGet(batchData, ['MCADNO'], '').trim();
        
        const batch: RequisitionBatch = {
          batchNumber,
          batchSize: parseNumber(safeGet(batchData, ['BATCHSIZEBC'], '0')),
          batchUom: safeGet(batchData, ['BATCHUOM'], 'LTR'),
          
          itemCode: safeGet(batchData, ['ITMCODE'], ''),
          itemName: safeGet(batchData, ['ITMNAME1'], ''),
          itemDetail: safeGet(batchData, ['ITMDETAIL'], ''),
          pack: safeGet(batchData, ['PACK1'], ''),
          unit: safeGet(batchData, ['UNIT'], ''),
          
          mfcNo,
          formastId: safeGet(batchData, ['FORMASTID'], ''),
          
          matReqId,
          matReqNo,
          matReqDate: safeGet(batchData, ['MATREQDT'], ''),
          matReqRemark: safeGet(batchData, ['MATREQRMK'], ''),
          
          make: safeGet(batchData, ['MAKE'], ''),
          year: safeGet(batchData, ['YEAR'], ''),
          department: safeGet(batchData, ['DEPARTMENT'], ''),
          locationCode: safeGet(batchData, ['LOCCODE'], ''),
          
          mfgDate: safeGet(batchData, ['MFGDT'], ''),
          expiryDate: safeGet(batchData, ['EXPDT'], ''),
          
          materials: [],
        };
        
        // Process materials from G_PRCNO -> G_STAGE hierarchy
        let batchRmCount = 0;
        let batchPpmCount = 0;
        let batchPmCount = 0;
        
        const prcList = batchData.LIST_G_PRCNO?.G_PRCNO;
        if (prcList) {
          const prcArray = Array.isArray(prcList) ? prcList : [prcList];
          
          for (const prcData of prcArray) {
            const processName = safeGet(prcData, ['PROCESS'], '');
            
            const stageList = prcData.LIST_G_STAGE?.G_STAGE;
            if (!stageList) continue;
            
            const stageArray = Array.isArray(stageList) ? stageList : [stageList];
            
            for (const stageData of stageArray) {
              const matReqDtlId = safeGet(stageData, ['MATREQDTLID'], '');
              if (!matReqDtlId) {
                warnings.push(`Skipping material with missing MATREQDTLID in batch ${batchNumber}`);
                continue;
              }
              
              const matType = safeGet(stageData, ['MATTYPE1'], 'PM');
              const category = getMaterialCategory(matType, processName);
              
              const material: RequisitionMaterial = {
                srNo: parseNumber(safeGet(stageData, ['SRNO'], '0')),
                materialCode: safeGet(stageData, ['MATCODE'], ''),
                materialName: safeGet(stageData, ['MATNAME'], '') || safeGet(stageData, ['MATDETAIL'], ''),
                materialType: category,
                stage: safeGet(stageData, ['STAGE'], ''),
                process: processName,
                
                quantityRequired: parseNumber(safeGet(stageData, ['REQQTY'], '') || safeGet(stageData, ['CF_REQQTY'], '')),
                quantityToIssue: parseNumber(safeGet(stageData, ['QTY'], '') || safeGet(stageData, ['CF_QTY'], '')),
                unit: safeGet(stageData, ['CUOM'], '') || safeGet(stageData, ['PUOM1'], 'NOS'),
                
                validationStatus: 'pending',
                
                matReqDtlId,
                matReqId: safeGet(stageData, ['MATREQID1'], matReqId),
                matReqNo: batch.matReqNo,
                matId: safeGet(stageData, ['MATID'], ''),
                
                binCode: safeGet(stageData, ['BINCODE'], ''),
                grNo: safeGet(stageData, ['GRNO'], ''),
                arNo: safeGet(stageData, ['ARNO'], ''),
                challanNo: safeGet(stageData, ['CHLNO'], ''),
                challanDate: safeGet(stageData, ['CHLDT'], ''),
                expiryDate: safeGet(stageData, ['EXPDT1'], ''),
                mfgDate: safeGet(stageData, ['MFGDT1'], ''),
                
                // New fields from latest requirement
                ovgPercent: parseNumber(
                  safeGet(stageData, ['OVG_P'], '') || 
                  safeGet(stageData, ['LIST_G_FORMASTID1', 'G_FORMASTID1', 'OVG_P'], '0')
                ),
                vendorCode: safeGet(stageData, ['MKMATCODE'], '') || safeGet(stageData, ['VNDCODE'], '') || safeGet(stageData, ['VENDORCODE'], ''),
                artworkNo: safeGet(stageData, ['ARTWORKNO'], '') || safeGet(stageData, ['ARTWORK_NO'], ''),
                labelClaim: safeGet(stageData, ['LIST_G_FORMASTID1', 'G_FORMASTID1', 'LCCLAIM'], '') || safeGet(stageData, ['LABEL_CLAIM'], '') || safeGet(stageData, ['LABELCLAIM'], ''),
                
                // Set parent batch info for easy access in flattened tables
                batchNumber: batch.batchNumber,
                mfcNo: batch.mfcNo,
                itemName: batch.itemName,
              };
              
              batch.materials.push(material);
              
              // Categorize into appropriate array
              switch (category) {
                case 'RM':
                  rawMaterials.push(material);
                  batchRmCount++;
                  break;
                case 'PPM':
                  primaryPackaging.push(material);
                  batchPpmCount++;
                  break;
                case 'PM':
                  packingMaterials.push(material);
                  batchPmCount++;
                  break;
              }
            }
          }
        }
        
        // Log this batch
        console.log(`   ✅ [${batchIndex}/${batchArray.length}] Batch: ${batchNumber} | ReqNo: ${matReqNo} | MFC: ${mfcNo || 'N/A'} | Materials: RM=${batchRmCount}, PPM=${batchPpmCount}, PM=${batchPmCount}`);
        
        batches.push(batch);
        
      } catch (batchError) {
        const errorMsg = batchError instanceof Error ? batchError.message : 'Unknown error';
        console.log(`   ❌ [${batchIndex}/${batchArray.length}] ERROR: ${errorMsg}`);
        warnings.push(`Error processing batch: ${errorMsg}`);
      }
    }
    
    if (batches.length === 0) {
      return {
        success: false,
        totalFound: 0,
        errors: ['No valid batches found in MATREQ XML'],
        warnings,
      };
    }
    
    return {
      success: true,
      data: {
        batches,
        rawMaterials,
        primaryPackaging,
        packingMaterials,
        locationCode,
        make,
      },
      totalFound: batches.length,
      errors: [],
      warnings,
    };
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown parsing error';
    return {
      success: false,
      totalFound: 0,
      errors: [`Parse error: ${errorMessage}`],
      warnings,
    };
  }
}

/**
 * Validate if XML content is a MATREQ file
 */
export function isRequisitionXml(xmlContent: string): boolean {
  const content = xmlContent.toUpperCase();
  const indicators = [
    '<MATREQ>',
    '<LIST_G_BATCHSIZEBC>',
    '<G_BATCHSIZEBC>',
    '<MATREQNO>',
    '<MATREQDTLID>',
  ];
  
  const matchCount = indicators.filter(ind => content.includes(ind)).length;
  return matchCount >= 3;
}
