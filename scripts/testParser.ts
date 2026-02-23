
import { parseProductMasterXml } from '../src/lib/productMasterParser';
import * as fs from 'fs';
import * as path from 'path';

async function testParser() {
  try {
    const xmlContent = fs.readFileSync('c:\\Dev\\private\\files\\snippet.txt', 'utf-8');
    const parsedData = await parseProductMasterXml(xmlContent);
    
    console.log('Successfully parsed ' + parsedData.length + ' products.');
    if (parsedData.length > 0) {
      console.log('First product details:');
      console.log(JSON.stringify(parsedData[0], null, 2));
    }
    
    if (parsedData.length > 1) {
        console.log('Second product details:');
        console.log(JSON.stringify(parsedData[1], null, 2));
    }

  } catch (error) {
    console.error('Error testing parser:', error);
  }
}

testParser();
