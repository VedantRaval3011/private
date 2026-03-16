import { connectToDatabase } from '../src/lib/mongodb';
import ProcessingLog from '../src/models/ProcessingLog';

async function run() {
  await connectToDatabase();
  const del = await ProcessingLog.deleteMany({ fileType: { $regex: /yield/i } });
  console.log(`Deleted ${del.deletedCount} yield logs.`);
  process.exit(0);
}

run();
