
import mongoose from 'mongoose';
import { Formula } from '../models/Formula';
import connectToDatabase from '../lib/mongodb';

async function listFormulas() {
  await connectToDatabase();
  const formulas = await Formula.find({}, 'masterFormulaDetails.productCode masterFormulaDetails.productName').lean();
  
  console.log('--- Formulas ---');
  formulas.forEach((f: any) => {
    console.log(`${f.masterFormulaDetails?.productCode} - ${f.masterFormulaDetails?.productName}`);
  });
  console.log('----------------');
  process.exit(0);
}

listFormulas().catch(err => {
  console.error(err);
  process.exit(1);
});
