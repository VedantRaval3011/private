
const mongoose = require('mongoose');

// Define minimal schema to avoid importing the model file directly (which uses aliases)
const FormulaSchema = new mongoose.Schema({
  masterFormulaDetails: {
    productCode: String,
    productName: String,
  }
}, { strict: false, collection: 'formulas' });

const Formula = mongoose.models.Formula || mongoose.model('Formula', FormulaSchema);

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/formula-master'; // Updated to match lib/mongodb.ts default

async function listFormulas() {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(MONGODB_URI);
  }

  const formulas = await Formula.find({
    'masterFormulaDetails.productName': { $regex: 'NAPH', $options: 'i' }
  }, 'masterFormulaDetails.productCode masterFormulaDetails.productName').lean();
  
  console.log('--- Formulas ---');
  formulas.forEach((f) => {
    console.log(`${f.masterFormulaDetails?.productCode} - ${f.masterFormulaDetails?.productName}`);
  });
  console.log('----------------');
  process.exit(0);
}

listFormulas().catch(err => {
  console.error(err);
  process.exit(1);
});
