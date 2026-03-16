import { generateApqrDocx } from '../src/lib/apqr-utils';
import mongoose from 'mongoose';

async function run() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/private');
  console.log('Connected to DB');
  try {
    const buffer = await generateApqrDocx('D25D21', 2025);
    console.log('Doc generated with size:', buffer.length);
  } finally {
    await mongoose.disconnect();
  }
}

run().catch(console.error);
