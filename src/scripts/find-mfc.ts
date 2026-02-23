import mongoose from 'mongoose';
import { Formula } from '@/models/Formula';
import connectToDatabase from '@/lib/mongodb';

async function findMFC() {
  try {
    await connectToDatabase();
    
    const mfcNumber = 'MFC/H/DNC150.06';
    
    console.log(`Searching for MFC: ${mfcNumber}\n`);
    
    // Try different field paths
    const queries = [
      { 'masterFormulaDetails.mfcNumber': mfcNumber },
      { 'mfcNumber': mfcNumber },
      { 'batchInfo.mfcNumber': mfcNumber },
      { 'masterFormulaDetails.productCode': mfcNumber }
    ];
    
    for (const query of queries) {
const queryStr = JSON.stringify(query);
      console.log(`Trying: ${queryStr}`);
      const result = await Formula.findOne(query).lean();
      if (result) {
        console.log(`✅ FOUND with query: ${queryStr}`);
        console.log(`   Product Code: ${result.masterFormulaDetails?.productCode}`);
        console.log(`   Product Name: ${result.masterFormulaDetails?.productName}`);
        console.log(`   MFC Number: ${result.masterFormulaDetails?.mfcNumber || result.mfcNumber || 'N/A'}`);
        await mongoose.disconnect();
        process.exit(0);
      }
    }
    
    // If not found, search for any formula and show structure
    console.log('\n❌ Not found. Showing sample formula structure...\n');
    const sample = await Formula.findOne({}).lean();
    if (sample) {
      console.log('Sample formula keys:', Object.keys(sample));
      console.log('masterFormulaDetails:', sample.masterFormulaDetails);
    }
    
    await mongoose.disconnect();
    process.exit(1);
    
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

findMFC();
