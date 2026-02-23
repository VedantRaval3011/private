/**
 * Cleanup Script for Product Master
 * This script removes the incorrectly processed "All-Product master-Wadhwan.XML" 
 * from the processing logs and formula collection so it can be re-processed correctly
 */

const { MongoClient } = require('mongodb');
require('dotenv').config({ path: '.env.local' });

async function cleanup() {
  const uri = process.env.MONGODB_URI;
  
  if (!uri) {
    console.error('❌ MONGODB_URI not found in environment variables');
    process.exit(1);
  }

  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');

    const db = client.db('formula-master');
    
    const fileName = 'All-Product master-Wadhwan.XML';
    
    // 1. Delete from processing logs
    console.log('\n📋 Checking processing logs...');
    const logsCollection = db.collection('processinglogs');
    const logResult = await logsCollection.deleteMany({ fileName: fileName });
    console.log(`   Deleted ${logResult.deletedCount} processing log entries for "${fileName}"`);
    
    // 2. Delete from formulas collection (if incorrectly stored there)
    console.log('\n🧪 Checking formulas collection...');
    const formulasCollection = db.collection('formulas');
    const formulaResult = await formulasCollection.deleteMany({ 
      fileName: fileName 
    });
    console.log(`   Deleted ${formulaResult.deletedCount} formula records from "${fileName}"`);
    
    // 3. Check if any product master data exists
    console.log('\n📦 Checking productmasters collection...');
    const productMastersCollection = db.collection('productmasters');
    const productCount = await productMastersCollection.countDocuments({ 
      sourceFile: fileName 
    });
    console.log(`   Found ${productCount} product master records from "${fileName}"`);
    
    if (productCount > 0) {
      console.log('   ℹ️  Product master data already exists. Delete it if you want to re-import:');
      console.log('   Run: db.productmasters.deleteMany({ sourceFile: "All-Product master-Wadhwan.XML" })');
    }
    
    console.log('\n✅ Cleanup complete!');
    console.log('\n📝 Next steps:');
    console.log('   1. Go to your application home page');
    console.log('   2. Click "Scan & Process Files"');
    console.log('   3. The file will now be detected as PRODUCT_MASTER');
    console.log('   4. Products will be imported to the productmasters collection');
    
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
  } finally {
    await client.close();
    console.log('\n👋 Disconnected from MongoDB');
  }
}

cleanup();
