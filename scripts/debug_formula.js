
const mongoose = require('mongoose');
const fs = require('fs');
require('dotenv').config({ path: '.env.local' });

const FormulaSchema = new mongoose.Schema({
  masterFormulaDetails: {
    productCode: String,
    productName: String
  },
  fillingDetails: [{
    productCode: String
  }],
  processes: [{
    fillingProducts: [{
      productCode: String
    }]
  }]
}, { collection: 'formulas' });

const Formula = mongoose.model('Formula', FormulaSchema);

async function checkFormula() {
  try {
    if (!process.env.MONGODB_URI) {
        process.env.MONGODB_URI = "mongodb+srv://vedantraval3011:vedant3011@cluster0.e8fbj.mongodb.net/test?retryWrites=true&w=majority&appName=Cluster0";
    }
    
    await mongoose.connect(process.env.MONGODB_URI);
    
    const code = 'DT310G1B';
    const formula = await Formula.findOne({ 'masterFormulaDetails.productCode': code }).lean();
    
    if (formula) {
        console.log('Formula Found!');
        console.log('Main Code:', formula.masterFormulaDetails.productCode);
        
        const fillingCodes = formula.fillingDetails?.map(f => f.productCode) || [];
        console.log('Filling Codes:', fillingCodes);
        
        const processCodes = [];
        formula.processes?.forEach(p => {
            p.fillingProducts?.forEach(fp => {
                if (fp.productCode) processCodes.push(fp.productCode);
            });
        });
        console.log('Process Matching Codes:', processCodes);
    } else {
        console.log('Formula NOT found for', code);
    }

  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
}

checkFormula();
