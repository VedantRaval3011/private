
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
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
        process.env.MONGODB_URI = "mongodb+srv://vedantraval3011:vedant3011@cluster0.e8fbj.mongodb.net/test?retryWrites=true&w=majority&appName=Cluster0";
    }
    
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to DB');

    const target = 'DT310G1B';
    const docs = await Batch.find({}).lean();
    console.log(`Total Documents: ${docs.length}`);

    let output = '';
    let foundAny = false;

    for (const doc of docs) {
        if (doc.batches && Array.isArray(doc.batches)) {
            for (const b of doc.batches) {
                // Check strictly
                 if (b.itemCode === target) {
                     output += `MATCH: ${b.itemCode} | Mfg: ${b.mfgDate} | Batch: ${b.batchNumber}\n`;
                     foundAny = true;
                 } else if (b.itemCode && b.itemCode.includes('DT310')) {
                     output += `PARTIAL: "${b.itemCode}" (len:${b.itemCode.length})\n`;
                 }
            }
        }
    }

    if (!foundAny) {
        output += "No strict matches found for DT310G1B.\n";
        // Dump all unique codes to see what's there
        const codes = new Set();
        docs.forEach(d => d.batches?.forEach(b => b.itemCode && codes.add(b.itemCode)));
        output += `Available Codes: ${Array.from(codes).join(', ')}\n`;
    }

    const logPath = path.join(process.cwd(), 'logs', 'debug_batches_v2.txt');
    if (!fs.existsSync(path.dirname(logPath))) fs.mkdirSync(path.dirname(logPath));
    fs.writeFileSync(logPath, output);
    console.log(`Wrote results to ${logPath}`);

  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
}

inspectData();
