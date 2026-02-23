/**
 * Calculate content hash and find log entry
 */

const { MongoClient } = require('mongodb');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

async function findByHash() {
  const uri = process.env.MONGODB_URI;
  const client = new MongoClient(uri);

  try {
    // Read the file and calculate its hash
    const filePath = path.join(process.cwd(), 'files', 'All-Product master-Wadhwan.XML');
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const contentHash = crypto.createHash('sha256').update(fileContent).digest('hex');
    
    console.log('📄 File: All-Product master-Wadhwan.XML');
    console.log('🔐 Content Hash:', contentHash);
    console.log('📏 File size:', fileContent.length, 'bytes\n');

    await client.connect();
    console.log('✅ Connected to MongoDB');
    console.log('🗄️  Database:', uri.split('/').pop().split('?')[0], '\n');

    const db = client.db(); // Use default DB from connection string
    
    // List all collections
    const collections = await db.listCollections().toArray();
    console.log('📚 Collections in database:');
    collections.forEach(col => console.log(`   - ${col.name}`));
    console.log('');

    // Check processinglogs collection
    const logsCollection = db.collection('processinglogs');
    const logByHash = await logsCollection.findOne({ contentHash });
    
    if (logByHash) {
      console.log('🎯 Found log entry by content hash:');
      console.log(JSON.stringify(logByHash, null, 2));
      
      console.log('\n🗑️  Deleting this entry...');
      const result = await logsCollection.deleteOne({ _id: logByHash._id });
      console.log(`   ✅ Deleted ${result.deletedCount} entry\n`);
      
      // Also check for any incorrectly stored data
      if (logByHash.fileType === 'FORMULA') {
        const formulasCollection = db.collection('formulas');
        const formulas = await formulasCollection.find({ 
          fileName: 'All-Product master-Wadhwan.XML' 
        }).toArray();
        console.log(`📋 Found ${formulas.length} formula records to delete`);
        if (formulas.length > 0) {
          const delResult = await formulasCollection.deleteMany({ 
            fileName: 'All-Product master-Wadhwan.XML' 
          });
          console.log(`   ✅ Deleted ${delResult.deletedCount} formula records\n`);
        }
      }
      
    } else {
      console.log('❌ No log entry found with this content hash\n');
      
      // Show all logs
      const allLogs = await logsCollection.find({}).toArray();
      console.log(`📊 Total logs in database: ${allLogs.length}`);
      if (allLogs.length > 0) {
        console.log('\nAll logs:');
        allLogs.forEach((log, i) => {
          console.log(`${i+1}. ${log.fileName}`);
          console.log(`   Hash: ${log.contentHash?.substring(0, 30)}...`);
          console.log(`   Type: ${log.fileType}`);
          console.log(`   Date: ${log.processedAt?.toISOString()}`);
        });
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.close();
    console.log('\n✅ Cleanup complete! You can now run "Scan & Process Files" again.');
  }
}

findByHash();
