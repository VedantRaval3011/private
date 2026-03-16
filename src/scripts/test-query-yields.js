// test-query-yields.js
const mongoose = require('mongoose');

async function main() {
  await mongoose.connect('mongodb://localhost:27017/private');

  const db = mongoose.connection.db;
  
  // Directly query the raw collection
  const yieldsCount = await db.collection('yields').countDocuments();
  console.log('Total yields in database:', yieldsCount);
  
  // Show a few
  if (yieldsCount > 0) {
    const samples = await db.collection('yields').find({}).limit(2).toArray();
    console.log('Sample yields:', JSON.stringify(samples, null, 2));
  } else {
      // maybe check ProcessingLogs to see if it was processed
      const logs = await db.collection('processinglogs').find({ fileType: 'YIELD' }).toArray();
      console.log('Yield processing logs:', JSON.stringify(logs, null, 2));
  }
  
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
