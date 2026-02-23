import mongoose from 'mongoose';
import { Batch } from '@/models/Batch';
import connectToDatabase from '@/lib/mongodb';

async function showAvailableBatches() {
  try {
    await connectToDatabase();
    
    console.log('📊 AVAILABLE PRODUCT CODES IN BATCH REGISTRY\n');
    console.log('='.repeat(80));
    
    const result = await Batch.aggregate([
      { $unwind: '$batches' },
      { $group: {
          _id: '$batches.itemCode',
          batchCount: { $sum: 1 },
          sampleBatches: { $push: '$batches.batchNumber' }
        }
      },
      { $project: {
          productCode: '$_id',
          batchCount: 1,
          sampleBatches: { $slice: ['$sampleBatches', 5] }
        }
      },
      { $sort: { batchCount: -1 } }
    ]);
    
    console.log('Product Code'.padEnd(15), 'Batch Count'.padEnd(15), 'Sample Batch Numbers');
    console.log('-'.repeat(80));
    
    for (const item of result) {
      console.log(
        (item.productCode || 'N/A').padEnd(15),
        item.batchCount.toString().padEnd(15),
        item.sampleBatches.slice(0, 3).join(', ')
      );
    }
    
    console.log('\n' + '='.repeat(80));
    console.log(`Total unique product codes: ${result.length}`);
    console.log('='.repeat(80));
    
    await mongoose.disconnect();
    process.exit(0);
    
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

showAvailableBatches();
