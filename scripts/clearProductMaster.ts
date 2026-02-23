
import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import { ProductMaster } from '../src/models/ProductMaster';

dotenv.config({ path: '.env.local' });

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('Please define the MONGODB_URI environment variable inside .env.local');
  process.exit(1);
}

async function clearProductMaster() {
  try {
    await mongoose.connect(MONGODB_URI as string);
    console.log('Connected to MongoDB');

    const result = await ProductMaster.deleteMany({});
    console.log(`Deleted ${result.deletedCount} documents from ProductMaster collection.`);

  } catch (error) {
    console.error('Error clearing ProductMaster collection:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

clearProductMaster();
