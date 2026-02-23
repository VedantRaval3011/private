
import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import { ProductMaster } from '../src/models/ProductMaster';

dotenv.config({ path: '.env.local' });

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('Please define the MONGODB_URI environment variable inside .env.local');
  process.exit(1);
}

async function checkProductData() {
  try {
    await mongoose.connect(MONGODB_URI as string);
    console.log('Connected to MongoDB');

    // Find one product and log it entirely
    const product = await ProductMaster.findOne({}).lean();
    
    if (product) {
      console.log('Product Found:');
      console.log(JSON.stringify(product, null, 2));
      
      if ('genericName' in product) {
          console.log('Generic Name exists:', product.genericName);
      } else {
          console.log('Generic Name field is MISSING from the document.');
      }
    } else {
      console.log('No products found in database.');
    }

  } catch (error) {
    console.error('Error checking product data:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

checkProductData();
