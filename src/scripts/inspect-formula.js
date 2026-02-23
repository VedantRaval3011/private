
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/formula-master';

const FormulaSchema = new mongoose.Schema({
  masterFormulaDetails: { productCode: String },
  processes: [{ processName: String, materials: [] }]
}, { strict: false, collection: 'formulas' });

const Formula = mongoose.models.Formula || mongoose.model('Formula', FormulaSchema);

async function inspect() {
  await mongoose.connect(MONGODB_URI);
  const formula = await Formula.findOne({ 'masterFormulaDetails.productCode': 'NZ251G1H' }).lean();
  
  if (formula) {
    console.log('Formula found:', formula.masterFormulaDetails.productCode);
    if (formula.processes) {
      console.log('Processes:', formula.processes.map(p => p.processName));
      const mixing = formula.processes.find(p => p.processName === 'MIXING');
      if (mixing) {
        console.log('MIXING Materials:', mixing.materials.map(m => m.materialName));
      }
    } else {
      console.log('No processes found.');
    }
  } else {
    console.log('Formula not found.');
  }
  process.exit(0);
}

inspect().catch(console.error);
