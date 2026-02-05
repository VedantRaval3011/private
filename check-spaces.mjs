import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/pharma_qc';

async function checkAndClean() {
    const client = new MongoClient(uri);
    await client.connect();
    const db = client.db();

    console.log('Checking for AR numbers with trailing spaces...\n');

    // Find records where AR number has leading/trailing spaces
    const recordsWithSpaces = await db.collection('inward_registers').find({
        arNumber: { $regex: /^\s+|\s+$/ }
    }).limit(10).toArray();

    console.log(`Found ${recordsWithSpaces.length} records with leading/trailing spaces (showing first 10)`);

    if (recordsWithSpaces.length > 0) {
        console.log('\nSample records:');
        recordsWithSpaces.forEach((r, i) => {
            console.log(`${i + 1}. AR: "${r.arNumber}" (length: ${r.arNumber?.length})`);
            console.log(`   Trimmed: "${r.arNumber?.trim()}" (length: ${r.arNumber?.trim().length})`);
        });

        // Count total records with spaces
        const totalWithSpaces = await db.collection('inward_registers').countDocuments({
            arNumber: { $regex: /^\s+|\s+$/ }
        });

        console.log(`\nTotal records with spaces: ${totalWithSpaces}`);

        // Ask if we should clean them
        console.log('\nTo clean these records, run the cleanup script.');
    } else {
        console.log('✅ No records with leading/trailing spaces found!');
    }

    // Also check for the specific AR number with potential spaces
    const variants = [
        'IWVIPPM2500022',
        ' IWVIPPM2500022',
        'IWVIPPM2500022 ',
        ' IWVIPPM2500022 ',
    ];

    console.log('\n\nChecking variants of IWVIPPM2500022:');
    for (const variant of variants) {
        const count = await db.collection('inward_registers').countDocuments({
            arNumber: variant
        });
        if (count > 0) {
            console.log(`  "${variant}" (length: ${variant.length}): ${count} record(s)`);
        }
    }

    await client.close();
}

checkAndClean().catch(console.error);
