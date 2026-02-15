
const fs = require('fs');
const xml2js = require('xml2js');

async function parseRequisitionXml(xmlContent) {
  try {
    const parsed = await xml2js.parseStringPromise(xmlContent, {
      explicitArray: false,
      ignoreAttrs: true,
      trim: true,
    });
    
    // Find the root MATREQ element dynamically
    const rootKey = Object.keys(parsed).find(key => 
      key.toUpperCase().startsWith('MATREQ') || 
      key.toLowerCase() === 'matreq'
    );
    
    if (rootKey) {
        console.log(`Found root key: ${rootKey}`);
        const matreq = parsed[rootKey];
        const batchList = matreq.LIST_G_BATCHSIZEBC?.G_BATCHSIZEBC;
        const batchArray = Array.isArray(batchList) ? batchList : [batchList];
        console.log(`Found ${batchArray.length} batches.`);
        return true;
    } else {
        console.error('No MATREQ root element found. Keys:', Object.keys(parsed));
        return false;
    }

  } catch (error) {
    console.error('Error parsing:', error);
    return false;
  }
}

async function test() {
    try {
        const filePath = 'c:\\Dev\\private\\files\\Vet-MatReq-01-04-2025 to 31-12-2025.XML';
        console.log(`Reading file: ${filePath}`);
        const content = fs.readFileSync(filePath, 'utf-8');
        
        // Test isRequisitionXml logic mock
        const indicators = [
            '<MATREQ', 
            '<LIST_G_BATCHSIZEBC>',
            '<G_BATCHSIZEBC>',
            '<MATREQNO>',
            '<MATREQDTLID>',
        ];
        const matchCount = indicators.filter(ind => content.toUpperCase().includes(ind)).length;
        console.log(`isRequisitionXml match count: ${matchCount}`);
        
        await parseRequisitionXml(content);
        
    } catch (e) {
        console.error(e);
    }
}

test();
