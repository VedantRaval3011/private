import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/pharma_qc';

async function check() {
    const client = new MongoClient(uri);
    await client.connect();
    const db = client.db();

    const total = await db.collection('inward_registers').countDocuments();
    console.log('Total records:', total);

    const found = await db.collection('inward_registers').findOne({
        $or: [
            { arNumber: 'IWVIPPM2500022' },
            { inwardNumber: 'IWVIPPM2500022' }
        ]
    });

    console.log('IWVIPPM2500022 found:', found ? 'YES' : 'NO');

    if (!found) {
        const similar = await db.collection('inward_registers').find({
            $or: [
                { arNumber: /IWVIPPM2500/ },
                { inwardNumber: /IWVIPPM2500/ }
            ]
        }).limit(10).toArray();

        console.log('\nSimilar records:');
        similar.forEach(r => console.log(`  AR: ${r.arNumber}, Inward: ${r.inwardNumber}, Material: ${r.materialName}`));
    }

    await client.close();
}

check().catch(console.error);
