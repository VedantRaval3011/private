// Direct MongoDB cleanup script - no external dependencies
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

// Read .env.local manually
const envPath = path.join(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
const mongoLine = envContent.split('\n').find(line => line.startsWith('MONGODB_URI='));
const MONGODB_URI = mongoLine ? mongoLine.split('=').slice(1).join('=').trim() : null;

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found in .env.local');
  process.exit(1);
}

async function deleteAllFormulas() {
  try {
    console.log('Connecting to MongoDB Atlas...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected!\n');
    
    // Delete all from formulas collection
    const formulaResult = await mongoose.connection.db.collection('formulas').deleteMany({});
    console.log(`✅ Deleted ${formulaResult.deletedCount} formula records`);
    
    // Also clear processing logs for formula files
    const logResult = await mongoose.connection.db.collection('processinglogs').deleteMany({ fileType: 'FORMULA' });
    console.log(`✅ Deleted ${logResult.deletedCount} processing log records`);
    
    console.log('\n🎉 All formula data has been cleared! You can now re-upload your XML files.');
    
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

deleteAllFormulas();
