/**
 * Delete specific processing log by timestamp
 */

const { MongoClient } = require('mongodb');
require('dotenv').config({ path: '.env.local' });

async function deleteByTimestamp() {
  const uri = process.env.MONGODB_URI;
  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log('✅ Connected to MongoDB\n');

    const db = client.db('formula-master');
    const logsCollection = db.collection('processinglogs');
    
    // The exact timestamp from the error
    const targetDate = new Date('2026-02-15T10:41:43.571Z');
    
    console.log('🔍 Looking for log with timestamp:', targetDate.toISOString());
    
    // Find the exact log entry
    const logEntry = await logsCollection.findOne({
      processedAt: targetDate
    });
    
    if (logEntry) {
      console.log('\n📌 Found log entry:');
      console.log(`   File: ${logEntry.fileName}`);
      console.log(`   Type: ${logEntry.fileType}`);
      console.log(`   Status: ${logEntry.status}`);
      console.log(`   Business Key: ${logEntry.businessKey}`);
      console.log(`   Content Hash: ${logEntry.contentHash?.substring(0, 30)}...`);
      
      // Delete it
      console.log('\n🗑️  Deleting this entry...');
      const result = await logsCollection.deleteOne({ _id: logEntry._id });
      console.log(`   ✅ Deleted ${result.deletedCount} entry`);
      
      // Also delete any formula records with this filename
      if (logEntry.fileType === 'FORMULA') {
        console.log('\n🧪 Checking for incorrectly stored formula records...');
        const formulasCollection = db.collection('formulas');
        const formulaResult = await formulasCollection.deleteMany({ 
          fileName: logEntry.fileName 
        });
        console.log(`   ✅ Deleted ${formulaResult.deletedCount} formula records`);
      }
      
    } else {
      console.log('❌ No log entry found with that timestamp');
      
      // List all logs to see what's there
      console.log('\n📋 All processing logs:');
      const allLogs = await logsCollection.find({}).sort({ processedAt: -1 }).toArray();
      console.log(`   Total: ${allLogs.length} entries`);
      allLogs.forEach((log, i) => {
        console.log(`   ${i+1}. ${log.fileName} - ${log.fileType} - ${log.processedAt?.toISOString()}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.close();
    console.log('\n👋 Done');
  }
}

deleteByTimestamp();
