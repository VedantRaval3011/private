/**
 * XML Type Detector
 * Detects file type from XML content structure
 * Does NOT rely on file name - uses only content analysis
 */

import type { XmlFileType } from '@/types/ingestion';

/**
 * Detect XML file type from content
 * Analyzes XML structure/tags to identify Batch vs Formula
 */
export function detectXmlType(xmlContent: string): XmlFileType {
  // Normalize content for reliable detection
  const content = xmlContent.toUpperCase();

  // Check for Product Master (Priority check - MUST BE FIRST)
  // Product Master uses <ITEMMASTER> root and has unique structure
  // Must check BEFORE Formula because they share some tags (ITMCODE, MCADNO, GENERICNM)
  // Definitive indicators:
  // 1. <ITEMMASTER> root element
  // 2. <LIST_G_CASEPACK> structure
  // 3. <ITMGROUP> (therapeutic category)
  // 4. <STOCOND> (storage condition)
  // 5. <LOCEXP> (local/export type)
  if (content.includes('<ITEMMASTER>') || 
      content.includes('LIST_G_CASEPACK') ||
      content.includes('G_CASEPACK') ||
      (content.includes('<ITMGROUP>') && content.includes('<STOCOND>')) ||
      (content.includes('<LOCEXP>') && content.includes('<ITMCODE>') && content.includes('<DEPARTMENT>'))) {
    return 'PRODUCT_MASTER';
  }

  // Check for Batch Creation XML (BATCHCRREGI format)
  // Look for characteristic tags
  const batchIndicators = [
    'BATCHCRREGI',
    '<G_MATCODE>',
    '<BATCHNO>',
    '<MFCDT>',        // Manufacturing date
    '<EXPDT>',        // Expiry date
    '<BATCHSIZE>',
    '<CONVRAT>',      // Conversion ratio
    '<LIST_G_MATCODE>'
  ];

  const batchMatches = batchIndicators.filter(indicator =>
    content.includes(indicator.toUpperCase())
  ).length;

  // Check for Formula Master XML (FORMULAMAST format)
  const formulaIndicators = [
    'FORMULAMAST',
    '<MCADNO>',       // Master card number
    '<ITMCODE>',      // Item code
    '<GENERICNM>',    // Generic name
    '<BATCHSIZE1>',   // Batch size
    '<G_ITMCODE1>',
    '<LIST_G_PROCESS>',
    '<MATDETAIL>',
    '<SPECIFICATION>'
  ];

  const formulaMatches = formulaIndicators.filter(indicator =>
    content.includes(indicator.toUpperCase())
  ).length;

  // Determine type based on matches
  // Require at least 2 indicator matches for confidence
  if (batchMatches >= 2 && batchMatches > formulaMatches) {
    return 'BATCH';
  }

  // Check for Requisition XML (MATREQ format) FIRST before Formula
  // MATREQ files have a unique root element and specific tags
  // They share some tags with Formula (like MCADNO) so we need to detect them first
  const requisitionIndicators = [
    '<MATREQ>',           // Unique root element - definitive
    '<LIST_G_BATCHSIZEBC>',
    '<G_BATCHSIZEBC>',
    '<MATREQNO>',         // Requisition number - unique to MATREQ
    '<MATREQDTLID>',      // Requisition detail ID - unique to MATREQ
    '<MATREQRMK>',        // Requisition remark - unique to MATREQ
    '<MATTYPE1>',         // Material type field
  ];

  const requisitionMatches = requisitionIndicators.filter(indicator =>
    content.includes(indicator.toUpperCase())
  ).length;

  // Check for MATREQ root tag explicitly - this is definitive
  if (content.includes('<MATREQ>')) {
    return 'REQUISITION';
  }

  // Fallback check with indicator count
  if (requisitionMatches >= 4 && requisitionMatches > batchMatches) {
    return 'REQUISITION';
  }

  // Now check for Formula Master XML (FORMULAMAST format)
  if (formulaMatches >= 2 && formulaMatches > batchMatches) {
    return 'FORMULA';
  }


  // Check for COA XML (FGANLCERT format)
  const coaIndicators = [
    'FGANLCERT',
    'FGANLCERTQA',
    '<FGARNO>',
    '<PROTEST1>',
    '<LIMITS1>',
    '<FGTESTNO>',
    '<ITMNAME>',
    '<LIST_G_SRNO1>'
  ];

  const coaMatches = coaIndicators.filter(indicator =>
    content.includes(indicator.toUpperCase())
  ).length;

  if (coaMatches >= 2 && coaMatches > batchMatches && coaMatches > formulaMatches) {
    return 'COA';
  }

  // Check for Raw Material COA XML (MATANLCERT format) FIRST
  // This MUST come before Inward Register because both have <MATINWNO>
  // MATANLCERT is the definitive root element for RM COA files
  if (content.includes('MATANLCERT') || content.includes('<MATANLCERT>')) {
    return 'RM_COA';
  }

  // Additional RM COA indicators check (fallback)
  const rmCoaIndicators = [
    '<ARNO>',           // AR Number - common in RM COA
    '<PROTEST>',        // Test name
    '<LIST_G_SERIAL1>', // Serial group list
    '<G_SERIAL1>',      // Serial group
    '<LIST_G_2>',       // Test list (inside G_SERIAL1)
    '<ANLDT>',          // Analysis date
    '<MAKENM>',         // Manufacturer name
  ];

  const rmCoaMatches = rmCoaIndicators.filter(indicator =>
    content.includes(indicator.toUpperCase())
  ).length;

  // If we have ARNO + PROTEST + LIST_G_SERIAL1, it's definitely RM COA
  if (rmCoaMatches >= 3 && content.includes('<ARNO>') && content.includes('<PROTEST>')) {
    return 'RM_COA';
  }

  // Check for Material Rejection XML
  // The Material Rejection report has a unique Oracle report root element: <T01201288>
  // This is distinct from Inward Register files which use <MATINWREGI> as root.
  // We CANNOT use STATUS=REJECTED because Inward Register files also contain rejected records.
  if (content.includes('<T01201288>') || content.includes('T01201288')) {
    return 'MATERIAL_REJECTION';
  }

  // Check for Inward Register XML (MATINW format)
  // Requires LIST_G_MATINWDTLID or G_MATID which are NOT in RM COA
  const inwardIndicators = [
    'LIST_G_MATINWDTLID',
    'G_MATINWDTLID',
    '<MATINWREGI>',
    '<G_MATID>',
  ];

  const inwardMatches = inwardIndicators.filter(indicator =>
    content.includes(indicator.toUpperCase())
  ).length;

  if (inwardMatches >= 1 || content.includes('LIST_G_MATINWDTLID')) {
    return 'INWARD_REGISTER';
  }

  // Check for report name in XML (secondary check)
  if (content.includes('BATCHCRREGI') || content.includes('BATCH_CREATION')) {
    return 'BATCH';
  }

  if (content.includes('FORMULAMAST') || content.includes('FORMULA_MASTER')) {
    return 'FORMULA';
  }

  // Check for Product Master (Secondary check)
  // Additional Product Master indicators if primary check missed it
  if (content.includes('ALL-PRODUCT MASTER') || 
      content.includes('<ITEMMASTER>') ||
      (content.includes('<ITMGROUP>') && content.includes('<STOCOND>') && content.includes('<LOCEXP>'))) {
    return 'PRODUCT_MASTER';
  }

  return 'UNKNOWN';
}

/**
 * Get a descriptive name for the file type
 */
export function getFileTypeName(type: XmlFileType): string {
  switch (type) {
    case 'BATCH':
      return 'Batch Creation';
    case 'RM_COA':
      return 'Raw Material COA';
    case 'FORMULA':
      return 'Formula Master';
    case 'COA':
      return 'COA (Certificate of Analysis)';
    case 'REQUISITION':
      return 'Material Requisition';
    case 'INWARD_REGISTER':
      return 'Material Inward Register';
    case 'MATERIAL_REJECTION':
      return 'Material Rejection';
    case 'PRODUCT_MASTER':
      return 'Product Master';
    default:
      return 'Unknown';
  }
}
