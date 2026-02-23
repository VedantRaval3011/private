/**
 * Test XML Type Detector for Product Master
 * Run this to verify Product Master files are correctly detected
 */

import { detectXmlType } from './src/lib/xmlTypeDetector';
import fs from 'fs';
import path from 'path';

// Test Product Master XML detection
const testProductMaster = () => {
  console.log('\n=== Testing Product Master XML Detection ===\n');

  const filePath = path.join(process.cwd(), 'files', 'All-Product master-Wadhwan.XML');
  
  if (!fs.existsSync(filePath)) {
    console.error('❌ Test file not found:', filePath);
    return;
  }

  try {
    const xmlContent = fs.readFileSync(filePath, 'utf-8');
    const detectedType = detectXmlType(xmlContent);
    
    console.log('File:', 'All-Product master-Wadhwan.XML');
    console.log('Detected Type:', detectedType);
    
    if (detectedType === 'PRODUCT_MASTER') {
      console.log('✅ SUCCESS: File correctly detected as PRODUCT_MASTER');
    } else {
      console.log('❌ FAILED: Expected PRODUCT_MASTER but got', detectedType);
    }
    
    // Show key indicators found
    const content = xmlContent.toUpperCase();
    console.log('\nKey indicators found:');
    console.log('  <ITEMMASTER>:', content.includes('<ITEMMASTER>'));
    console.log('  LIST_G_CASEPACK:', content.includes('LIST_G_CASEPACK'));
    console.log('  G_CASEPACK:', content.includes('G_CASEPACK'));
    console.log('  <ITMGROUP>:', content.includes('<ITMGROUP>'));
    console.log('  <STOCOND>:', content.includes('<STOCOND>'));
    console.log('  <LOCEXP>:', content.includes('<LOCEXP>'));
    console.log('  <DEPARTMENT>:', content.includes('<DEPARTMENT>'));
    
  } catch (error) {
    console.error('❌ Error reading/detecting file:', error);
  }
};

// Run test
testProductMaster();
