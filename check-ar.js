/**
 * Check if AR number exists in Inward Register
 * Run with: node check-ar.js IWAAJPM2400231
 */

const arNumber = process.argv[2] || 'IWAAJPM2400231';

async function checkArNumber() {
    try {
        const response = await fetch(`http://localhost:3000/api/inward?page=1&limit=100000`);
        const data = await response.json();

        if (!data.success) {
            console.log('❌ Failed to fetch inward data');
            return;
        }

        console.log(`\n🔍 Searching for AR Number: ${arNumber}`);
        console.log(`📊 Total Inward Records: ${data.total}\n`);

        // Search for the AR number
        const found = data.data.filter(record =>
            record.arNumber && record.arNumber.trim() === arNumber.trim()
        );

        if (found.length > 0) {
            console.log(`✅ FOUND ${found.length} record(s) with AR Number: ${arNumber}\n`);
            found.forEach((record, index) => {
                console.log(`Record ${index + 1}:`);
                console.log(`  - Material: ${record.materialName}`);
                console.log(`  - Material Code: ${record.materialCode || 'N/A'}`);
                console.log(`  - Inward Number: ${record.inwardNumber}`);
                console.log(`  - Vendor: ${record.vendorName}`);
                console.log(`  - Batch: ${record.batchNumber || 'N/A'}`);
                console.log(`  - Source File: ${record.sourceFile}`);
                console.log('');
            });
        } else {
            console.log(`❌ NOT FOUND in Inward Register database`);
            console.log(`\n💡 This AR number exists in XML but was not imported to database`);
            console.log(`   Possible reasons:`);
            console.log(`   1. The XML file containing this AR was not uploaded`);
            console.log(`   2. There was a parsing error during import`);
            console.log(`   3. The AR number field was not correctly extracted`);
        }

        // Also check all AR numbers to see similar ones
        const allArNumbers = new Set();
        data.data.forEach(record => {
            if (record.arNumber && record.arNumber.trim()) {
                allArNumbers.add(record.arNumber.trim());
            }
        });

        console.log(`\n📋 Total Unique AR Numbers in Database: ${allArNumbers.size}`);

        // Find similar AR numbers
        const similar = Array.from(allArNumbers).filter(ar =>
            ar.includes('IWAAJPM') || ar.includes('2400231')
        );

        if (similar.length > 0) {
            console.log(`\n🔎 Similar AR Numbers found:`);
            similar.slice(0, 10).forEach(ar => console.log(`   - ${ar}`));
            if (similar.length > 10) {
                console.log(`   ... and ${similar.length - 10} more`);
            }
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

checkArNumber();
