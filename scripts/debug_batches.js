
const mongoose = require('mongoose');
require('dotenv').config({ path: '.env.local' });

// Define minimal Schema to fetch data
const BatchSchema = new mongoose.Schema({
  batches: [{
    itemCode: String,
    batchNumber: String,
    mfgDate: String,
    expiryDate: String,
    type: String
  }]
}, { collection: 'batches' });

const Batch = mongoose.model('Batch', BatchSchema);

async function inspectData() {
  try {
    if (!process.env.MONGODB_URI) {
        // Fallback for local testing if env not loaded usually
        process.env.MONGODB_URI = "mongodb+srv://vedantraval3011:vedant3011@cluster0.e8fbj.mongodb.net/test?retryWrites=true&w=majority&appName=Cluster0";
    }
    
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to DB');

    const productCode = 'DT310G1B'; // From screenshot
    const target = 'DT310G1B'; // Moved target definition up for logging

    // 1. Fetch ALL docs ensuring we don't miss any due to top-level filtering issues
    const docs = await Batch.find({}).lean();
    console.log(`Total Batch Documents found: ${docs.length}`);

    if (!fs.existsSync('logs')) fs.mkdirSync('logs');
    const logFile = 'logs/debug_batches.txt';
    let output = '';
    
    output += `Total Batch Documents found: ${docs.length}\n`;
    
    docs.forEach((doc) => {
        if (doc.batches && Array.isArray(doc.batches)) {
            doc.batches.forEach(b => {
                if (b.itemCode && b.itemCode.includes('DT310')) {
                    output += `---------------------------------\n`;
                    output += `Candidate: "${b.itemCode}" (Length: ${b.itemCode.length})\n`;
                    output += `Target:    "${target}" (Length: ${target.length})\n`;
                    
                    if (b.itemCode === target) {
                         output += '✅ STRICT MATCH\n';
                         output += `Date: ${b.mfgDate}\n`;
                    } else {
                         output += '❌ MISMATCH\n';
                         output += `Stored Codes: ${JSON.stringify(b.itemCode.split('').map(c => c.charCodeAt(0)))}\n`;
                    }
                }
            });
        }
    });

    fs.writeFileSync(logFile, output);
    console.log('Results written to logs/debug_batches.txt');
    
    const allCodes = new Set();
    
    docs.forEach((doc, i) => {
        if (doc.batches && Array.isArray(doc.batches)) {
            doc.batches.forEach(b => {
                if (b.itemCode) allCodes.add(b.itemCode);
            });
        }
    });
    
    console.log('Unique Item Codes found:', Array.from(allCodes).sort());
    
    // The original target definition is now redundant as it was moved up
    // const target = 'DT310G1B'; 
    
    docs.forEach((doc) => {
        if (doc.batches && Array.isArray(doc.batches)) {
            doc.batches.forEach(b => {
                if (b.itemCode && b.itemCode.includes('DT310')) {
                    console.log(`Found candidate: "${b.itemCode}" (Length: ${b.itemCode.length})`);
                    console.log(`Target:        "${target}" (Length: ${target.length})`);
                    if (b.itemCode === target) {
                        console.log('✅ STRICT EQUALITY MATCH!');
                    } else {
                        console.log('❌ NO MATCH - Char codes:');
                        console.log('Stored:', b.itemCode.split('').map(c => c.charCodeAt(0)));
                        console.log('Target:', target.split('').map(c => c.charCodeAt(0)));
                    }
                }
            });
        }
    });
    let rawDates = [];
    let matchCount = 0; // Initialize matchCount
    
    docs.forEach((doc, i) => {
        if (doc.batches && Array.isArray(doc.batches)) {
            doc.batches.forEach(b => {
                if (b.itemCode === productCode) {
                    matchCount++;
                    rawDates.push(b.mfgDate);
                    if (matchCount <= 5) {
                         console.log('Match found:', JSON.stringify(b, null, 2));
                    }
                }
            });
        }
    });
    
    console.log(`Total strict matches for ${productCode}: ${matchCount}`);
    console.log('Sample mfgDates:', rawDates.slice(0, 10));

  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
}

inspectData();
