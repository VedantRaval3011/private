import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/pharma_qc';

async function diagnose() {
    const client = new MongoClient(uri);
    await client.connect();
    const db = client.db();

    console.log('='.repeat(60));
    console.log('DIAGNOSTIC REPORT FOR AR NUMBER: IWVIPPM2500022');
    console.log('='.repeat(60));

    // 1. Check Inward Register
    const inwardRecord = await db.collection('inward_registers').findOne({
        $or: [
            { arNumber: 'IWVIPPM2500022' },
            { inwardNumber: 'IWVIPPM2500022' }
        ]
    });

    console.log('\n1. INWARD REGISTER STATUS:');
    if (inwardRecord) {
        console.log('   ✅ FOUND in Inward Register');
        console.log(`   - AR Number: ${inwardRecord.arNumber}`);
        console.log(`   - Inward Number: ${inwardRecord.inwardNumber}`);
        console.log(`   - Material Code: ${inwardRecord.materialCode || 'N/A'}`);
        console.log(`   - Material Name: ${inwardRecord.materialName}`);
        console.log(`   - Vendor: ${inwardRecord.vendorName}`);
        console.log(`   - Batch: ${inwardRecord.batchNumber || 'N/A'}`);
        console.log(`   - Quantity: ${inwardRecord.receivedQuantity || 0} ${inwardRecord.unit || ''}`);
    } else {
        console.log('   ❌ NOT FOUND in Inward Register');
    }

    // 2. Check Requisitions
    const materialCode = inwardRecord?.materialCode;
    if (materialCode) {
        console.log('\n2. REQUISITION STATUS:');

        const reqsWithMaterial = await db.collection('requisitions').aggregate([
            { $unwind: '$batches' },
            { $unwind: '$batches.materials' },
            { $match: { 'batches.materials.materialCode': materialCode } },
            {
                $group: {
                    _id: '$batches.materials.materialType',
                    count: { $sum: 1 },
                    batches: { $addToSet: '$batches.batchNumber' }
                }
            }
        ]).toArray();

        if (reqsWithMaterial.length > 0) {
            console.log(`   ✅ Material Code "${materialCode}" FOUND in Requisitions`);
            reqsWithMaterial.forEach(r => {
                console.log(`   - Type: ${r._id}, Count: ${r.count}, Batches: ${r.batches.length}`);
                console.log(`     Sample Batches: ${r.batches.slice(0, 3).join(', ')}`);
            });
        } else {
            console.log(`   ❌ Material Code "${materialCode}" NOT FOUND in Requisitions`);
        }
    }

    // 3. Check PM COA
    console.log('\n3. PM COA STATUS:');
    const pmCoaRecords = await db.collection('pmcoas').find({
        $or: [
            { arNo: 'IWVIPPM2500022' },
            { materialCode: materialCode }
        ]
    }).toArray();

    if (pmCoaRecords.length > 0) {
        console.log(`   ✅ FOUND ${pmCoaRecords.length} PM COA record(s)`);
        pmCoaRecords.forEach((r, i) => {
            console.log(`   Record ${i + 1}:`);
            console.log(`     - AR No: ${r.arNo}`);
            console.log(`     - Material: ${r.materialName}`);
            console.log(`     - Code: ${r.materialCode}`);
        });
    } else {
        console.log('   ❌ NOT FOUND in PM COA');
    }

    // 4. Check PPM COA
    console.log('\n4. PPM COA STATUS:');
    const ppmCoaRecords = await db.collection('ppmcoas').find({
        $or: [
            { arNo: 'IWVIPPM2500022' },
            { materialCode: materialCode }
        ]
    }).toArray();

    if (ppmCoaRecords.length > 0) {
        console.log(`   ✅ FOUND ${ppmCoaRecords.length} PPM COA record(s)`);
        ppmCoaRecords.forEach((r, i) => {
            console.log(`   Record ${i + 1}:`);
            console.log(`     - AR No: ${r.arNo}`);
            console.log(`     - Material: ${r.materialName}`);
            console.log(`     - Code: ${r.materialCode}`);
        });
    } else {
        console.log('   ❌ NOT FOUND in PPM COA');
    }

    // 5. Summary
    console.log('\n' + '='.repeat(60));
    console.log('SUMMARY:');
    console.log('='.repeat(60));

    if (inwardRecord) {
        console.log('✅ Data IS properly fetched and stored in Inward Register');

        if (materialCode) {
            const reqType = reqsWithMaterial.length > 0 ? reqsWithMaterial[0]._id : 'Unknown';
            console.log(`✅ Material is classified as: ${reqType}`);

            if (reqType === 'PM') {
                console.log('ℹ️  This is a PM (Packing Material), not PPM');
                console.log('ℹ️  Check the PM COA modal instead of PPM COA modal');
            } else if (reqType === 'PPM') {
                console.log('ℹ️  This is a PPM (Primary Packing Material)');
                console.log('ℹ️  Check the PPM COA modal');
            }
        }
    } else {
        console.log('❌ Data is NOT in the Inward Register');
        console.log('⚠️  This indicates a parsing or ingestion issue');
    }

    console.log('='.repeat(60));

    await client.close();
}

diagnose().catch(console.error);
