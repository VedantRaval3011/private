
const fs = require('fs');
const { parseStringPromise } = require('xml2js');

async function run() {
    console.log('Starting test...');
    
    // 1. Check if file exists
    const filePath = 'c:\\Dev\\private\\files\\Vet-MatReq-01-04-2025 to 31-12-2025.XML';
    if (!fs.existsSync(filePath)) {
        console.error(`File not found: ${filePath}`);
        return;
    }
    console.log(`File exists: ${filePath}`);
    
    try {
        // 2. Read file
        const content = fs.readFileSync(filePath, 'utf-8');
        console.log(`Read ${content.length} characters.`);
        
        // 3. Check indicators
        const indicators = ['<MATREQ', '<LIST_G_BATCHSIZEBC>', '<G_BATCHSIZEBC>'];
        const matchCount = indicators.filter(ind => content.toUpperCase().includes(ind)).length;
        console.log(`Indicators match count: ${matchCount}`);

        // 4. Parse
        console.log('Parsing XML...');
        const parsed = await parseStringPromise(content, {
            explicitArray: false,
            ignoreAttrs: true,
            trim: true,
        });
        console.log('XML parsed successfully.');
        
        // 5. Check root
        const keys = Object.keys(parsed);
        console.log('Root keys:', keys);
        
        const rootKey = keys.find(key => 
            key.toUpperCase().startsWith('MATREQ') || 
            key.toLowerCase() === 'matreq'
        );
        
        if (rootKey) {
            console.log(`SUCCESS: Found root key "${rootKey}"`);
            const batchList = parsed[rootKey].LIST_G_BATCHSIZEBC?.G_BATCHSIZEBC;
            if (batchList) {
                 const count = Array.isArray(batchList) ? batchList.length : 1;
                 console.log(`Found ${count} batches.`);
            } else {
                console.log('No batches found under root.');
            }
        } else {
            console.error('FAILURE: No MATREQ root found.');
        }

    } catch (err) {
        console.error('ERROR:', err);
    }
}

run();
