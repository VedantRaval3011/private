
import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { ProductMaster } from '../src/models/ProductMaster';
import { ProcessingLog } from '../src/models/ProcessingLog';
import { parseProductMasterXml } from '../src/lib/productMasterParser';

dotenv.config({ path: '.env.local' });

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('Please define the MONGODB_URI environment variable inside .env.local');
  process.exit(1);
}

const FILE_PATH = 'c:\\Dev\\private\\files\\All-Product master-Wadhwan.XML';

async function manualIngest() {
  try {
    await mongoose.connect(MONGODB_URI as string);
    console.log('Connected to MongoDB');

    // 1. Clear Processing Log for this file
    await ProcessingLog.deleteMany({ 
       $or: [
           { fileType: 'PRODUCT_MASTER' },
           { fileName: { $regex: /All-Product master-Wadhwan/i } }
       ]
    });
    console.log('Cleared processing logs.');

    // 2. Clear Product Collection
    await ProductMaster.deleteMany({});
    console.log('Cleared ProductMaster collection.');

    // 3. Read and Parse XML
    console.log(`Reading file: ${FILE_PATH}`);
    const xmlContent = fs.readFileSync(FILE_PATH, 'utf-8');
    
    console.log('Parsing XML...');
    const products = await parseProductMasterXml(xmlContent);
    console.log(`Parsed ${products.length} products.`);
    
    if (products.length > 0) {
        console.log('Sample product data (first item):');
        console.log(JSON.stringify(products[0], null, 2));
    }

    // 4. Insert into DB
    console.log('Inserting into database...');
    // Use bulkWrite for better performance if possible, or simple loop
    // Using loop as in ingestionService for simplicity and matching logic
    let entryCount = 0;
    const batchSize = 100;
    
    for (let i = 0; i < products.length; i += batchSize) {
        const batch = products.slice(i, i + batchSize);
        const operations = batch.map(product => ({
            updateOne: {
                filter: { productCode: product.productCode },
                update: { 
                    $set: {
                        ...product,
                        sourceFile: 'All-Product master-Wadhwan.XML',
                        processedAt: new Date()
                    }
                },
                upsert: true
            }
        }));
        
        await ProductMaster.bulkWrite(operations);
        entryCount += batch.length;
        process.stdout.write(`\rInserted ${entryCount}/${products.length} products...`);
    }
    
    console.log('\nIngestion complete.');

    // 5. Create Success Log
    // (Optional, but good for consistency so app doesn't try to re-ingest automatically if logic triggers)
    // Actually, leave it strictly cleaned so user *can* re-ingest if they want, 
    // OR create the log so it shows "Success" in UI.
    // Let's NOT create the log for now, simpler.

  } catch (error) {
    console.error('Error during manual ingestion:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

manualIngest();
