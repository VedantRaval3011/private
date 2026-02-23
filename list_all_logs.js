/**
 * List All Processing Logs
 */

const { MongoClient } = require('mongodb');
require('dotenv').config({ path: '.env.local' });

async function listAllLogs() {
  const uri = process.env.MONGODB_URI;
  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log('✅ Connected to MongoDB\n');

    const db = client.db('formula-master');
    const logsCollection = db.collection('processinglogs');
    
    const totalLogs = await logsCollection.countDocuments();
    console.log(`📊 Total processing logs: ${totalLogs}\n`);
    
    if (totalLogs === 0) {
      console.log('ℹ️  No processing logs found in database');
      return;
    }
    
    // Get recent logs
    const logs = await logsCollection.find({})
      .sort({ processedAt: -1 })
      .limit(20)
      .toArray();
    
    console.log('📋 Most recent 20 logs:\n');
    
    logs.forEach((log, index) => {
      console.log(`${index + 1}. ${log.fileName}`);
      console.log(`   Type: ${log.fileType} | Status: ${log.status}`);
      console.log(`   Date: ${log.processedAt}`);
      if (log.message) console.log(`   Message: ${log.message}`);
      console.log('');
    });
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.close();
  }
}

listAllLogs();
