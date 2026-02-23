/**
 * Check Processing Logs for Product Master file
 */

const { MongoClient } = require('mongodb');
require('dotenv').config({ path: '.env.local' });

async function checkLogs() {
  const uri = process.env.MONGODB_URI;
  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log('✅ Connected to MongoDB\n');

    const db = client.db('formula-master');
    const logsCollection = db.collection('processinglogs');
    
    // Search for any log entries containing "Product" or "master" in filename
    console.log('🔍 Searching for processing logs...\n');
    
    const logs = await logsCollection.find({
      fileName: { $regex: /product|master/i }
    }).sort({ processedAt: -1 }).limit(10).toArray();
    
    console.log(`Found ${logs.length} log entries:\n`);
    
    logs.forEach((log, index) => {
      console.log(`${index + 1}. File: ${log.fileName}`);
      console.log(`   Type: ${log.fileType}`);
      console.log(`   Status: ${log.status}`);
      console.log(`   Processed: ${log.processedAt}`);
      console.log(`   Business Key: ${log.businessKey}`);
      console.log(`   Content Hash: ${log.contentHash?.substring(0, 20)}...`);
      console.log('');
    });
    
    // Also check the exact filename
    const exactLog = await logsCollection.findOne({
      fileName: 'All-Product master-Wadhwan.XML'
    });
    
    if (exactLog) {
      console.log('📌 Exact match found for "All-Product master-Wadhwan.XML":');
      console.log(JSON.stringify(exactLog, null, 2));
    } else {
      console.log('ℹ️  No exact match for "All-Product master-Wadhwan.XML"');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.close();
  }
}

checkLogs();
