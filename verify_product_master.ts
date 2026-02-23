
import fs from 'fs';
import path from 'path';
import { parseProductMasterXml } from './src/lib/productMasterParser';

async function verify() {
  const filePath = path.join(process.cwd(), 'files', 'All-Product master-Wadhwan.XML');
  
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    return;
  }

  console.log(`Reading file: ${filePath}`);
  // Try reading without encoding to check buffer or force utf8
  const content = fs.readFileSync(filePath, 'utf8');
  console.log('First 100 chars of content:', content.substring(0, 100));
  console.log('Hex dump of first 20 bytes:', Buffer.from(content.substring(0, 20)).toString('hex'));
  
  console.log('Parsing XML...');
  try {
    const products = await parseProductMasterXml(content);
    console.log(`Successfully parsed ${products.length} products.`);
    
    if (products.length > 0) {
      console.log('First 3 products:');
      console.log(JSON.stringify(products.slice(0, 3), null, 2));
      
      // Check specific fields
      const first = products[0];
      const requiredFields = ['productCode', 'productName', 'department', 'masterCardNo', 'storageCondition', 'productType', 'therapeuticCategory'];
      const missing = requiredFields.filter(f => !first[f as keyof typeof first] || first[f as keyof typeof first] === 'N/A');
      
      if (missing.length > 0) {
        console.warn('⚠️ Some fields might be missing or N/A in the first record:', missing.join(', '));
      } else {
        console.log('✅ First record has all required fields populated (or at least present).');
      }
    } else {
      console.error('❌ No products found!');
    }
  } catch (error: any) {
    console.error('Error parsing XML:', error);
    fs.writeFileSync('c:\\Dev\\private\\error_log.txt', error.toString() + '\\n' + (error.stack || ''));
  }
}

verify();
