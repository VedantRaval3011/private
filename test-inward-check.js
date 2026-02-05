/**
 * Test script to check for IWVIPPM2500022 in the database
 */

const { MongoClient } = require('mongodb');

async function test() {
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/pharma_qc';
    console.log('Connecting to MongoDB...');

    const client = new MongoClient(uri);
    await client.connect();
    const db = client.db();

    console.log('\n=== INWARD REGISTER ANALYSIS ===\n');

    // Total count
    const count = await db.collection('inward_registers').countDocuments();
    console.log('Total Inward Records:', count);

    // Search for the specific AR Number
    const record = await db.collection('inward_registers').findOne({
        $or: [
            { arNumber: 'IWVIPPM2500022' },
            { inwardNumber: 'IWVIPPM2500022' }
        ]
    });

    console.log('\nFound record with IWVIPPM2500022:', record ? 'YES' : 'NO');

    if (record) {
        console.log('\nRecord Details:');
        console.log(JSON.stringify(record, null, 2));
    } else {
        // Try a partial/regex search
        const likeAR = await db.collection('inward_registers').find({
            arNumber: { $regex: 'IWVIPPM', $options: 'i' }
        }).limit(5).toArray();

        console.log('\nSample AR Numbers starting with IWVIPPM:');
        likeAR.forEach((r, i) => {
            console.log(`  ${i + 1}. AR: ${r.arNumber}, Inward: ${r.inwardNumber}`);
        });

        // Try inward number instead
        const likeInward = await db.collection('inward_registers').find({
            inwardNumber: { $regex: 'IWVIPPM', $options: 'i' }
        }).limit(5).toArray();

        console.log('\nSample Inward Numbers starting with IWVIPPM:');
        likeInward.forEach((r, i) => {
            console.log(`  ${i + 1}. Inward: ${r.inwardNumber}, AR: ${r.arNumber}`);
        });
    }

    await client.close();
}

test().catch(console.error);
