import mongoose from 'mongoose';
import { getApqrData } from './src/lib/apqr-utils';
import fs from 'fs';

async function run() {
    await mongoose.connect('mongodb://127.0.0.1:27017/private');
    console.log('Connected to DB');
    
    // Find formulas with batches or known test product codes
    // Based on user image, Batch Number is D25E40, D25D21, D25H28.
    const batchDocs = await mongoose.connection.collection('batches').find({ 'batches.batchNumber': 'D25E40' }).toArray();
    let productCode = '';
    
    if (batchDocs.length > 0) {
        productCode = batchDocs[0].batches.find((b: any) => b.batchNumber === 'D25E40')?.itemCode;
        console.log('Found product code from batch:', productCode);
    } else {
        console.log('Batch D25E40 not found. Fetching any formula.');
        const f = await mongoose.connection.collection('formulas').findOne({ 'masterFormulaDetails.productCode': { $ne: null } });
        productCode = f?.masterFormulaDetails?.productCode;
        console.log('Using fallback product code:', productCode);
    }
    
    if (!productCode) {
        console.error('No product code to test.');
        process.exit(1);
    }
    
    try {
        const data = await getApqrData(productCode, 2025);
        fs.writeFileSync('apqr-debug.json', JSON.stringify({
            columns: data.finishInProcessColumns,
            dataPreview: data.finishInProcessData.slice(0, 3)
        }, null, 2));
        console.log('Wrote output to apqr-debug.json');
    } catch (e) {
        console.error('Error in getApqrData:', e);
    }
    
    process.exit(0);
}

run();
