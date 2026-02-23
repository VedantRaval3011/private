import path from 'path';
import fs from 'fs';
import connectToDatabase from '@/lib/mongodb';
import { generateApqrDocx } from '@/lib/apqr-utils';

async function test() {
  try {
    await connectToDatabase();
    console.log('Starting APQR generation test...');
    
    const productCode = 'NC150G1H';
    const year = 2025; 

    console.log(`Generating APQR for ${productCode} - ${year}`);
    const buffer = await generateApqrDocx(productCode, year);

    const outputPath = path.join(process.cwd(), 'test_apqr_output.docx');
    fs.writeFileSync(outputPath, buffer);
    
    console.log(`\n✅ Successfully generated DOCX at: ${outputPath}`);
    console.log(`   File size: ${(buffer.length / 1024).toFixed(2)} KB`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Error generating APQR:', error);
    process.exit(1);
  }
}

test();
