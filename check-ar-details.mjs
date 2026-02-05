import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/pharma_qc';

async function check() {
    const client = new MongoClient(uri);
    await client.connect();
    const db = client.db();

    // Find the record with AR Number IWVIPPM2500022
    const record = await db.collection('inward_registers').findOne({
        $or: [
            { arNumber: 'IWVIPPM2500022' },
            { inwardNumber: 'IWVIPPM2500022' }
        ]
    });

    if (record) {
        console.log('Found Record:');
        console.log('AR Number:', record.arNumber);
        console.log('Inward Number:', record.inwardNumber);
        console.log('Material Code:', record.materialCode);
        console.log('Material Name:', record.materialName);
        console.log('Vendor:', record.vendorName);
        console.log('Batch:', record.batchNumber);
        console.log('');

        // Check if this material code exists in requisitions
        const reqWithMaterial = await db.collection('requisitions').findOne({
            'batches.materials.materialCode': record.materialCode
        });

        console.log('Material code found in Requisitions:', reqWithMaterial ? 'YES' : 'NO');

        if (reqWithMaterial) {
            // Find which batches use this material
            const batchesUsingMaterial = await db.collection('requisitions').aggregate([
                { $unwind: '$batches' },
                { $unwind: '$batches.materials' },
                { $match: { 'batches.materials.materialCode': record.materialCode } },
                { $group: { _id: '$batches.batchNumber', type: { $first: '$batches.materials.materialType' } } },
                { $limit: 5 }
            ]).toArray();

            console.log('\nBatches using this material code:');
            batchesUsingMaterial.forEach(b => {
                console.log(`  - Batch: ${b._id}, Type: ${b.type}`);
            });
        }
    } else {
        console.log('Record NOT found!');
    }

    await client.close();
}

check().catch(console.error);
