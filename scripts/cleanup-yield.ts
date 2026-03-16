import { connectToDatabase } from '../src/lib/mongodb';
import Yield from '../src/models/Yield';
import ProcessingLog from '../src/models/ProcessingLog';

async function cleanup() {
  try {
    await connectToDatabase();
    const yieldResult = await Yield.deleteMany({});
    const logResult = await ProcessingLog.deleteMany({ fileType: 'YIELD' });
    console.log(`Deleted ${yieldResult.deletedCount} yield records.`);
    console.log(`Deleted ${logResult.deletedCount} yield processing logs.`);
    process.exit(0);
  } catch (error) {
    console.error('Cleanup failed:', error);
    process.exit(1);
  }
}

cleanup();
