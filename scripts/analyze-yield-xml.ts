import { readFileSync } from 'fs';
import { parseStringPromise } from 'xml2js';

async function analyzeXml() {
  const xml = readFileSync('./files/YIELDSTATEMENT-01-04-2025 to 09-03-2026.XML', 'utf-8');
  const parsed = await parseStringPromise(xml, { explicitArray: true });
  const gMatcodes = parsed.YIELDSTATEMENT.LIST_G_MATCODE[0].G_MATCODE;
  
  const uniqueKeys = new Set();
  const duplicateKeys = new Map();
  
  gMatcodes.forEach((item, index) => {
    const batch = item.BATCH?.[0];
    const itemCode = item.ITMCODE?.[0];
    const key = `${batch}-${itemCode}`;
    
    if (uniqueKeys.has(key)) {
      duplicateKeys.set(key, (duplicateKeys.get(key) || 1) + 1);
    } else {
      uniqueKeys.add(key);
    }
  });
  
  console.log(`Total G_MATCODE: ${gMatcodes.length}`);
  console.log(`Unique combinations: ${uniqueKeys.size}`);
  console.log(`Duplicate combinations found: ${duplicateKeys.size}`);
  
  if (duplicateKeys.size > 0) {
    console.log('Sample duplicates:');
    Array.from(duplicateKeys.entries()).slice(0, 5).forEach(([key, count]) => {
      console.log(`Key: ${key}, Count: ${count}`);
    });
  }
}

analyzeXml().catch(console.error);
