/**
 * Debug script to check AR numbers API
 */

async function debugArNumbers() {
    try {
        console.log('🔍 Fetching AR numbers from new API endpoint...\n');

        const response = await fetch('http://localhost:3000/api/inward/ar-numbers');
        const data = await response.json();

        if (!data.success) {
            console.log('❌ API call failed');
            console.log('Response:', data);
            return;
        }

        console.log(`✅ API Success`);
        console.log(`📊 Total AR Numbers: ${data.total}`);
        console.log(`📋 AR Numbers Array Length: ${data.arNumbers.length}\n`);

        // Check if IWAAJPM2400231 is in the list
        const targetAr = 'IWAAJPM2400231';
        const found = data.arNumbers.includes(targetAr);

        if (found) {
            console.log(`✅ ${targetAr} FOUND in AR numbers list`);
        } else {
            console.log(`❌ ${targetAr} NOT FOUND in AR numbers list`);

            // Check for similar AR numbers
            const similar = data.arNumbers.filter(ar =>
                ar.includes('IWAAJPM') || ar.includes('2400231')
            );

            if (similar.length > 0) {
                console.log(`\n🔎 Similar AR numbers found:`);
                similar.slice(0, 10).forEach(ar => console.log(`   - ${ar}`));
                if (similar.length > 10) {
                    console.log(`   ... and ${similar.length - 10} more`);
                }
            }
        }

        // Sample some AR numbers
        console.log(`\n📝 Sample AR numbers from API:`);
        data.arNumbers.slice(0, 10).forEach(ar => console.log(`   - ${ar}`));

    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

debugArNumbers();
