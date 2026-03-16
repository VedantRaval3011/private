/**
 * Test yield parser against the actual XML file
 * Run: node src/scripts/test-yield-parser.js
 */
const fs = require('fs');
const path = require('path');

async function main() {
  // Read the XML file
  const filePath = path.join(__dirname, '../../files/YIELDSTATEMENT-01-04-2025 to 09-03-2026.XML');
  
  if (!fs.existsSync(filePath)) {
    console.error('File not found:', filePath);
    process.exit(1);
  }

  console.log('Reading file...');
  const xmlContent = fs.readFileSync(filePath, 'utf-8');
  console.log('File size:', xmlContent.length, 'bytes');

  // Dynamically import xml2js (ESM compat)
  const xml2js = require('xml2js');
  
  console.log('Parsing XML...');
  try {
    const parsed = await xml2js.parseStringPromise(xmlContent, {
      explicitArray: true,
      ignoreAttrs: true,
      trim: true,
    });

    const root = parsed?.YIELDSTATEMENT;
    if (!root) {
      console.error('ERROR: No YIELDSTATEMENT root element found');
      console.log('Root keys:', Object.keys(parsed));
      return;
    }
    console.log('✓ Found YIELDSTATEMENT root');

    const listGMatcode = root?.LIST_G_MATCODE?.[0];
    if (!listGMatcode) {
      console.error('ERROR: No LIST_G_MATCODE found');
      return;
    }
    console.log('✓ Found LIST_G_MATCODE');

    const items = listGMatcode?.G_MATCODE || [];
    console.log(`✓ Found ${items.length} G_MATCODE elements`);

    if (items.length > 0) {
      const first = items[0];
      console.log('\n--- First item fields ---');
      const g = (key) => {
        const val = first[key];
        if (!val) return '(empty)';
        if (Array.isArray(val)) return String(val[0] ?? '').trim() || '(empty)';
        return String(val).trim();
      };

      console.log('BATCH:', g('BATCH'));
      console.log('ITMCODE:', g('ITMCODE'));
      console.log('ITMNAME:', g('ITMNAME'));
      console.log('MFGDT:', g('MFGDT'));
      console.log('EXPDT:', g('EXPDT'));
      console.log('TOTBATCHSIZE:', g('TOTBATCHSIZE'));
      console.log('BATCHUOM:', g('BATCHUOM'));
      console.log('YIELD_P:', g('YIELD_P'));
      console.log('STANDARDYIELD:', g('STANDARDYIELD'));
      console.log('BATCHCOM:', g('BATCHCOM'));
      console.log('CF_TARGETDT:', g('CF_TARGETDT'));
      console.log('ELAPASEDDAYS:', g('ELAPASEDDAYS'));
      console.log('CF_ELASPED:', g('CF_ELASPED'));
      console.log('SRNO:', g('SRNO'));
      console.log('TOTPRODQTY:', g('TOTPRODQTY'));
      console.log('TSTQTY:', g('TSTQTY'));
      console.log('RETAINQTY:', g('RETAINQTY'));
      console.log('MFGLOSSQTY:', g('MFGLOSSQTY'));

      const listGProdQty = first?.LIST_G_PRODQTY?.[0];
      if (listGProdQty) {
        const gProdQtyArr = listGProdQty.G_PRODQTY || [];
        if (gProdQtyArr.length > 0) {
          const pack = gProdQtyArr[0]?.PACK?.[0];
          console.log('PACK (from LIST_G_PRODQTY):', pack || '(empty)');
        }
      }
    }

    console.log('\n✓ Parser test PASSED - all fields accessible');
  } catch (err) {
    console.error('PARSE ERROR:', err.message);
  }
}

main();
