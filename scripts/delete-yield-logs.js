require('dotenv').config({ path: '.env.local' });
const mongoose = require('mongoose');

async function main() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to DB');

    const yieldColl = mongoose.connection.collection('yields');
    const logColl = mongoose.connection.collection('processinglogs');

    const yieldCount = await yieldColl.countDocuments();
    const yieldDocs = await yieldColl.find({}).limit(1).toArray();
    console.log('Yields in DB:', yieldCount);
    if (yieldDocs.length > 0) {
      console.log('Sample Yield:', yieldDocs[0]);
    }

    const logCount = await logColl.countDocuments({ fileType: 'YIELD' });
    console.log('Yield logs in DB:', logCount);

    const logDocs = await logColl.find({ fileType: 'YIELD' }).toArray();
    if (logDocs.length > 0) {
      console.log('Sample Log Item Stats:', logDocs[0].itemStats);
    }

    const result = await logColl.deleteMany({ fileType: 'YIELD' });
    console.log('Deleted Yield logs:', result.deletedCount);

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

main();
