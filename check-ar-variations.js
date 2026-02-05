/**
 * Check AR number variations
 */

async function checkArVariations() {
    try {
        console.log('🔍 Checking AR number variations...\n');

        // Search for base AR number
        const baseAr = 'IWAAJPM2400231';
        const response = await fetch(`http://localhost:3000/api/inward?page=1&limit=50&search=${baseAr}`);
        const data = await response.json();

        console.log(`Search for "${baseAr}":`);
        console.log(`  Total matches: ${data.total}\n`);

        if (data.data.length > 0) {
            console.log(`Found AR number variations:`);
            const arNumbers = new Set();
            data.data.forEach(record => {
                if (record.arNumber) {
                    arNumbers.add(record.arNumber);
                }
            });

            Array.from(arNumbers).forEach(ar => {
                console.log(`  - "${ar}"`);
            });

            console.log(`\n💡 Issue Identified:`);
            console.log(`  Database has: "${Array.from(arNumbers)[0]}"`);
            console.log(`  Requisition has: "${baseAr}"`);
            console.log(`  These don't match exactly!`);
            console.log(`\n  Solution: Need to match AR numbers with or without version suffixes (.1, .2, etc.)`);
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

checkArVariations();
