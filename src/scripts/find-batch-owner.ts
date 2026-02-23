import mongoose from 'mongoose';
import { Batch } from '@/models/Batch';
import { Formula } from '@/models/Formula';
import connectToDatabase from '@/lib/mongodb';

async function findBatchOwner() {
  try {
    await connectToDatabase();
    
    // Batch numbers from the screenshot
    const batchNumbers = ['D25D21', 'D25E40', 'D25H28', 'D25K08'];
    
    console.log('🔍 FINDING WHICH PRODUCT OWNS THESE BATCHES\n');
    console.log('='.repeat(80));
    console.log('Batch numbers to search:', batchNumbers.join(', '));
    console.log('='.repeat(80) + '\n');
    
    for (const batchNum of batchNumbers) {
      console.log(`\n📦 Searching for batch: ${batchNum}`);
      
      const result = await Batch.aggregate([
        { $unwind: '$batches' },
        { $match: { 'batches.batchNumber': batchNum } },
        { $project: {
            batchNumber: '$batches.batchNumber',
            itemCode: '$batches.itemCode',
            itemName: '$batches.itemName',
            mfgDate: '$batches.mfgDate',
            batchSize: '$batches.batchSize',
            unit: '$batches.unit',
            sourceFile: '$fileName'
          }
        }
      ]);
      
      if (result.length > 0) {
        const batch = result[0];
        console.log(`   ✅ FOUND`);
        console.log(`   Item Code: ${batch.itemCode}`);
        console.log(`   Item Name: ${batch.itemName}`);
        console.log(`   Mfg Date: ${batch.mfgDate}`);
        console.log(`   Batch Size: ${batch.batchSize} ${batch.unit}`);
        console.log(`   Source File: ${batch.sourceFile}`);
        
        // Find formula for this product code
        const formula = await Formula.findOne({
          'masterFormulaDetails.productCode': batch.itemCode
        }).lean();
        
        if (formula) {
          console.log(`   MFC Number: ${formula.masterFormulaDetails?.masterCardNo || 'N/A'}`);
          console.log(`   Product Name: ${formula.masterFormulaDetails?.productName || 'N/A'}`);
        }
      } else {
        console.log(`   ❌ NOT FOUND in database`);
      }
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('\n📊 SUMMARY: Unique Product Codes Found');
    console.log('='.repeat(80));
    
    const allResults = await Batch.aggregate([
      { $unwind: '$batches' },
      { $match: { 'batches.batchNumber': { $in: batchNumbers } } },
      { $group: {
          _id: '$batches.itemCode',
          batches: { $push: '$batches.batchNumber' },
          count: { $sum: 1 }
        }
      }
    ]);
    
    for (const item of allResults) {
      console.log(`\nProduct Code: ${item._id}`);
      console.log(`   Batches: ${item.batches.join(', ')}`);
      console.log(`   Count: ${item.count}`);
      
      const formula = await Formula.findOne({
        'masterFormulaDetails.productCode': item._id
      }).lean();
      
      if (formula) {
        console.log(`   MFC Number: ${formula.masterFormulaDetails?.masterCardNo || 'N/A'}`);
      }
    }
    
    console.log('\n' + '='.repeat(80));
    
    await mongoose.disconnect();
    process.exit(0);
    
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

findBatchOwner();
