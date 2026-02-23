/**
 * Check BOTH processinglogs collections
 */

const { MongoClient } = require('mongodb');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

async function checkBothCollections() {
  const uri = process.env.MONGODB_URI;
  const client = new MongoClient(uri);

  try {
    // Read file and calculate hash
    const filePath = path.join(process.cwd(), 'files', 'All-Product master-Wadhwan.XML');
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const contentHash = crypto.createHash('sha256').update(fileContent).digest('hex');
    
    console.log('📄 File: All-Product master-Wadhwan.XML');
    console.log('🔐 Content Hash:', contentHash.substring(0, 40) + '...\n');

    await client.connect();
    const db = client.db();

    // Check collection 1: processinglogs (no underscore)
    console.log('1️⃣  Checking "processinglogs" collection...');
    const logsCollection1 = db.collection('processinglogs');
    const count1 = await logsCollection1.countDocuments();
    const log1 = await logsCollection1.findOne({ contentHash });
    console.log(`   Total documents: ${count1}`);
    console.log(`   Found by hash: ${log1 ? 'YES ✅' : 'NO ❌'}\n`);
    
    if (log1) {
      console.log('   📌 Log entry:');
      console.log(`      File: ${log1.fileName}`);
      console.log(`      Type: ${log1.fileType}`);
      console.log(`      Date: ${log1.processedAt?.toISOString()}`);
      
      console.log('\n   🗑️  Deleting...');
      await logsCollection1.deleteOne({ _id: log1._id });
      console.log('   ✅ Deleted from processinglogs\n');
    }

    // Check collection 2: processing_logs (with underscore)
    console.log('2️⃣  Checking "processing_logs" collection...');
    const logsCollection2 = db.collection('processing_logs');
    const count2 = await logsCollection2.countDocuments();
    const log2 = await logsCollection2.findOne({ contentHash });
    console.log(`   Total documents: ${count2}`);
    console.log(`   Found by hash: ${log2 ? 'YES ✅' : 'NO ❌'}\n`);
    
    if (log2) {
      console.log('   📌 Log entry:');
      console.log(`      File: ${log2.fileName}`);
      console.log(`      Type: ${log2.fileType}`);
      console.log(`      Date: ${log2.processedAt?.toISOString()}`);
      
      console.log('\n   🗑️  Deleting...');
      await logsCollection2.deleteOne({ _id: log2._id });
      console.log('   ✅ Deleted from processing_logs\n');
    }
    
    // Also check by filename
    console.log('3️⃣  Checking by filename in both collections...');
    const byName1 = await logsCollection1.findOne({ fileName: 'All-Product master-Wadhwan.XML' });
    const byName2 = await logsCollection2.findOne({ fileName: 'All-Product master-Wadhwan.XML' });
    
    if (byName1) {
      console.log('   Found in processinglogs by filename - deleting...');
      await logsCollection1.deleteOne({ _id: byName1._id });
      console.log('   ✅ Deleted\n');
    }
    
    if (byName2) {
      console.log('   Found in processing_logs by filename - deleting...');
      await logsCollection2.deleteOne({ _id: byName2._id });
      console.log('   ✅ Deleted\n');
    }
    
    if (!log1 && !log2 && !byName1 && !byName2) {
      console.log('   ℹ️  No entries found in either collection\n');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.close();
    console.log('✅ Done! Now try "Scan & Process Files" again.');
  }
}

checkBothCollections();
