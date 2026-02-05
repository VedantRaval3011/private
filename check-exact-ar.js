/**
 * Check exact AR number in database
 */

async function checkExactAr() {
    try {
        const targetAr = 'IWAAJPM2400231';

        console.log(`🔍 Searching for: "${targetAr}"\n`);

        // Try exact search
        const response1 = await fetch(`http://localhost:3000/api/inward?page=1&limit=10&search=${targetAr}`);
        const data1 = await response1.json();

        console.log(`Search Results:`);
        console.log(`  Total: ${data1.total}`);
        console.log(`  Records: ${data1.data.length}\n`);

        if (data1.data.length > 0) {
            console.log(`✅ Found ${data1.data.length} record(s):\n`);
            data1.data.forEach((record, i) => {
                console.log(`Record ${i + 1}:`);
                console.log(`  AR Number: "${record.arNumber}"`);
                console.log(`  AR Number (trimmed): "${record.arNumber?.trim()}"`);
                console.log(`  AR Number length: ${record.arNumber?.length}`);
                console.log(`  Material: ${record.materialName}`);
                console.log(`  Inward No: ${record.inwardNumber}`);
                console.log('');

                // Check for hidden characters
                if (record.arNumber) {
                    const bytes = [];
                    for (let i = 0; i < record.arNumber.length; i++) {
                        bytes.push(record.arNumber.charCodeAt(i));
                    }
                    console.log(`  Byte codes: ${bytes.join(', ')}`);
                }
            });
        } else {
            console.log(`❌ No records found with AR number: ${targetAr}`);
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

checkExactAr();
