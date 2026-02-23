import mongoose from 'mongoose';
import { Batch } from '@/models/Batch';
import { Formula } from '@/models/Formula';
import connectToDatabase from '@/lib/mongodb';
import { parseBatchDate, formatMonthYear } from '@/lib/apqr-utils';

async function verifyBatchData() {
  try {
    await connectToDatabase();
    
    const mfcNumber = 'MFC/H/DNC150.06';
    const year = 2025;
    
    console.log('='.repeat(80));
    console.log(`🔍 BATCH DATA VERIFICATION FOR: ${mfcNumber}`);
    console.log('='.repeat(80));
    
    // Step 1: Find Formula and Product Code
    console.log('\n📌 STEP 1: Finding Formula and Product Code');
    const formula = await Formula.findOne({
      'masterFormulaDetails.masterCardNo': mfcNumber
    }).lean();
    
    if (!formula) {
      console.error(`❌ No formula found for MFC: ${mfcNumber}`);
      console.log('   Trying alternative search...');
      
      // Try searching by product code pattern
      const altFormula = await Formula.findOne({
        'masterFormulaDetails.productCode': { $regex: 'DNC150', $options: 'i' }
      }).lean();
      
      if (altFormula) {
        console.log(`   Found alternative: ${altFormula.masterFormulaDetails?.masterCardNo}`);
        console.log(`   Product Code: ${altFormula.masterFormulaDetails?.productCode}`);
      }
      
      process.exit(1);
    }
    
    const productCode = formula.masterFormulaDetails?.productCode;
    console.log(`   MFC Number: ${mfcNumber}`);
    console.log(`   Product Code: ${productCode}`);
    console.log(`   Product Name: ${formula.masterFormulaDetails?.productName}`);
    
    // Step 2: Query all batches for this product code
    console.log('\n📌 STEP 2: Querying Batch Registry Collection');
    console.log(`   Query: { 'batches.itemCode': '${productCode}' }`);
    
    const batchDocs = await Batch.find({
      'batches.itemCode': productCode
    }).lean();
    
    console.log(`   Found ${batchDocs.length} batch document(s) containing this product code`);
    
    // Step 3: Extract and show all batches
    const allBatches: any[] = [];
    for (const doc of batchDocs) {
      if (!doc.batches) continue;
      for (const batch of doc.batches) {
        if (batch.itemCode === productCode) {
          allBatches.push({
            ...batch,
            sourceFile: doc.fileName
          });
        }
      }
    }
    
    console.log(`   Total batch records for ${productCode}: ${allBatches.length}`);
    
    // Step 4: Show all batches with dates
    console.log('\n📌 STEP 3: All Batches Found (Before Year Filter)');
    console.log('-'.repeat(120));
    console.log('Batch Number'.padEnd(15), 'Item Code'.padEnd(12), 'Mfg Date'.padEnd(12), 'Completion Date'.padEnd(17), 'Batch Size'.padEnd(15), 'Source File');
    console.log('-'.repeat(120));
    
    for (const batch of allBatches) {
      const mfgDate = parseBatchDate(batch.mfgDate);
      const completionDate = batch.batchCompletionDate ? parseBatchDate(batch.batchCompletionDate) : null;
      
      console.log(
        (batch.batchNumber || 'N/A').padEnd(15),
        (batch.itemCode || 'N/A').padEnd(12),
        (mfgDate ? mfgDate.toISOString().split('T')[0] : batch.mfgDate || 'N/A').padEnd(12),
        (completionDate ? completionDate.toISOString().split('T')[0] : batch.batchCompletionDate || 'N/A').padEnd(17),
        (`${batch.batchSize || 'N/A'} ${batch.unit || ''}`).trim().padEnd(15),
        (batch.sourceFile || 'N/A').substring(0, 40)
      );
    }
    
    // Step 5: Filter by year
    console.log(`\n📌 STEP 4: Filtering by Year ${year}`);
    console.log('-'.repeat(120));
    
    const yearBatches = [];
    const uniqueBatches = new Map();
    
    for (const batch of allBatches) {
      // Try mfgDate first
      let mfgDate = parseBatchDate(batch.mfgDate);
      let dateSource = 'mfgDate';
      
      // Fallback to batchCompletionDate
      if (!mfgDate && batch.batchCompletionDate) {
        mfgDate = parseBatchDate(batch.batchCompletionDate);
        dateSource = 'batchCompletionDate';
      }
      
      if (!mfgDate) {
        console.log(`   ⚠️  Skipping ${batch.batchNumber}: No valid date found`);
        continue;
      }
      
      if (mfgDate.getFullYear() === year) {
        const key = `${batch.batchNumber}_${batch.itemCode}`;
        if (!uniqueBatches.has(key)) {
          const processedBatch = {
            ...batch,
            parsedMfgDate: mfgDate,
            dateSource,
            formattedMfgDate: formatMonthYear(mfgDate),
            formattedExpDate: batch.expiryDate ? formatMonthYear(parseBatchDate(batch.expiryDate) || new Date()) : 'N/A'
          };
          uniqueBatches.set(key, processedBatch);
          yearBatches.push(processedBatch);
        } else {
          console.log(`   ⚠️  Duplicate: ${batch.batchNumber} (already included)`);
        }
      } else {
        console.log(`   ❌ Excluded ${batch.batchNumber}: Year ${mfgDate.getFullYear()} (not ${year})`);
      }
    }
    
    // Sort by date
    yearBatches.sort((a, b) => a.parsedMfgDate.getTime() - b.parsedMfgDate.getTime());
    
    console.log(`\n✅ Batches matching ${year}: ${yearBatches.length}`);
    
    // Step 6: Show filtered batches
    console.log('\n📌 STEP 5: Final Filtered Batches (For APQR)');
    console.log('-'.repeat(120));
    console.log('Month'.padEnd(12), 'Batch Number'.padEnd(15), 'Batch Size'.padEnd(15), 'Mfg. Date'.padEnd(12), 'Exp. Date'.padEnd(12), 'Date Source');
    console.log('-'.repeat(120));
    
    for (const batch of yearBatches) {
      const monthName = batch.parsedMfgDate.toLocaleString('en-US', { month: 'long' });
      console.log(
        monthName.padEnd(12),
        (batch.batchNumber || 'N/A').padEnd(15),
        (`${batch.batchSize || 'N/A'} ${batch.unit || ''}`).trim().padEnd(15),
        (batch.formattedMfgDate || 'N/A').padEnd(12),
        (batch.formattedExpDate || 'N/A').padEnd(12),
        batch.dateSource || 'N/A'
      );
    }
    
    // Step 7: Monthly Summary
    console.log('\n📌 STEP 6: Monthly Summary Grid');
    console.log('-'.repeat(80));
    
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthlyCount = Array(12).fill(0);
    
    yearBatches.forEach(batch => {
      const monthIdx = batch.parsedMfgDate.getMonth();
      monthlyCount[monthIdx]++;
    });
    
    // Print grid
    for (let i = 0; i < 12; i += 6) {
      const row1 = MONTHS.slice(i, i + 6).map(m => m.padEnd(10)).join('');
      const row2 = monthlyCount.slice(i, i + 6).map(c => (c > 0 ? c.toString().padStart(2, '0') : '--').padEnd(10)).join('');
      console.log(row1);
      console.log(row2);
      if (i === 0) console.log('-'.repeat(80));
    }
    
    console.log(`\nTotal Batches Manufactured: ${yearBatches.length.toString().padStart(2, '0')} Batches`);
    
    console.log('\n' + '='.repeat(80));
    console.log('✅ VERIFICATION COMPLETE');
    console.log('='.repeat(80));
    
    await mongoose.disconnect();
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

verifyBatchData();
