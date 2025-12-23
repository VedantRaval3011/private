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
  
  if (formulaMatches >= 2 && formulaMatches > batchMatches) {
    return 'FORMULA';
  }
  
  // Check for report name in XML (secondary check)
  if (content.includes('BATCHCRREGI') || content.includes('BATCH_CREATION')) {
    return 'BATCH';
  }
  
  if (content.includes('FORMULAMAST') || content.includes('FORMULA_MASTER')) {
    return 'FORMULA';
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
    case 'FORMULA':
      return 'Formula Master';
    default:
      return 'Unknown';
  }
}
