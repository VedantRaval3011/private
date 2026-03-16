const fs = require('fs');
const path = require('path');
const { detectXmlType } = require('./lib/xmlTypeDetector');

// Polyfill for Next.js requirements that might be loaded
require('dotenv').config();

// Since the project is TS / Next.js, importing directly might fail.
// So let's just make a simple raw fetch to the local API instead.
// To do that, we'll write a node script that calls the API.

async function main() {
  const filePath = path.join(__dirname, '../../files/YIELDSTATEMENT-01-04-2025 to 09-03-2026.XML');
  const xmlContent = fs.readFileSync(filePath, 'utf-8');
  const content = xmlContent.toUpperCase();
  
  // Checking logic exactly as it's defined:
  if (content.includes('<YIELDSTATEMENT>') || content.includes('YIELDSTATEMENT') || 
      (content.includes('LIST_G_MATCODE') && content.includes('STANDARDYIELD') && content.includes('ACTFILLING'))) {
    console.log('Type is: YIELD');
  } else {
    console.log('Type not matched for YIELD. Matched:', '???');
    
    // Check other types
    if (content.includes('<ITEMMASTER>')) console.log('Matches PRODUCT_MASTER');
    if (content.includes('BATCHCRREGI')) console.log('Matches BATCH');
    if (content.includes('MATANLCERT')) console.log('Matches RM_COA');
    if (content.includes('LIST_G_MATINWDTLID') || content.includes('<G_MATID>')) console.log('Matches INWARD_REGISTER');
  }
}
main();
