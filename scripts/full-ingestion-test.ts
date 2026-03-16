import { connectToDatabase } from '../src/lib/mongodb';
import { processXmlFile } from '../src/lib/ingestionService';
import { readFileSync } from 'fs';
import path from 'path';
import Yield from '../src/models/Yield';
import ProcessingLog from '../src/models/ProcessingLog';

async function fullIngestionTest() {
  try {
    await connectToDatabase();
    
    // Clear everything first
    await Yield.deleteMany({});
    await ProcessingLog.deleteMany({ fileType: 'YIELD' });
    console.log('Cleanup done.');

    const filePath = path.join(__dirname, '../files/YIELDSTATEMENT-01-04-2025 to 09-03-2026.XML');
    const content = readFileSync(filePath, 'utf-8');
    
    console.log('Starting ingestion...');
    const result = await processXmlFile({
      fileName: 'YIELD-TEST.XML',
      filePath,
      fileSize: Buffer.byteLength(content),
      content: content
    });
    
    console.log('Ingestion result status:', result.status);
    console.log('Ingestion result message:', result.message);
    if (result.itemStats) {
      console.log('Item Stats:', {
        totalItems: result.itemStats.totalItems,
        newItems: result.itemStats.newItems,
        duplicateItems: result.itemStats.duplicateItems
      });
    }

    const finalCount = await Yield.countDocuments({});
    console.log('Final Yield count in DB:', finalCount);
    
    process.exit(0);
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

fullIngestionTest();
