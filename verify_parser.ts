
import fs from 'fs';
import path from 'path';
import xml2js from 'xml2js';

// Mock findElements and findValueCaseInsensitive from xmlParser.ts
function findElements(obj: any, tagName: string): any[] {
  const results: any[] = [];
  const tagLower = tagName.toLowerCase();
  
  function search(current: any) {
    if (current === null || current === undefined) return;
    
    if (Array.isArray(current)) {
      current.forEach(item => search(item));
      return;
    }
    
    if (typeof current === 'object') {
      const record = current as Record<string, any>;
      
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
      
      Object.values(record).forEach(value => search(value));
    }
  }
  
  search(obj);
  return results;
}

function findValueCaseInsensitive(obj: any, keys: string[], defaultValue: string = ''): string {
  if (!obj || typeof obj !== 'object') return defaultValue;
  
  const record = obj as Record<string, any>;
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

async function testParser() {
  try {
    const xmlPath = path.join('c:\\Dev\\private', 'files', 'FormulaMast.xml');
    const xmlContent = fs.readFileSync(xmlPath, 'utf-8');
    
    const parser = new xml2js.Parser({ explicitArray: true });
    const result = await parser.parseStringPromise(xmlContent);
    
    console.log('XML Parsed. extracting materials...');
    
    const g2Elements = findElements(result, 'G_2');
    console.log(`Found ${g2Elements.length} G_2 elements`);
    
    const materials = [];
    
    for (const g2 of g2Elements) {
        const matCode = findValueCaseInsensitive(g2, ['MATCODE'], '');
        if (matCode === '1SODI48') {
             const subMatType = findValueCaseInsensitive(g2, ['SUBMATTYPE'], 'NOT_FOUND');
             const matType = findValueCaseInsensitive(g2, ['MATTYPE'], 'NOT_FOUND');
             const rawG2 = JSON.stringify(g2).substring(0, 200);
             console.log(`\nFound 1SODI48:`);
             console.log(`SUBMATTYPE extracted: "${subMatType}"`);
             console.log(`MATTYPE extracted: "${matType}"`);
             console.log(`Raw G2 snippet: ${rawG2}`);
        }
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

testParser();
