import { readFileSync } from 'fs';
import { parseStringPromise } from 'xml2js';

async function findMissingQty() {
  const xml = readFileSync('./files/YIELDSTATEMENT-01-04-2025 to 09-03-2026.XML', 'utf-8');
  const parsed = await parseStringPromise(xml, { explicitArray: true });
  
  const gMatcodes = parsed.YIELDSTATEMENT.LIST_G_MATCODE[0].G_MATCODE;
  for (const item of gMatcodes) {
    const listGProdQty = item.LIST_G_PRODQTY?.[0];
    if (listGProdQty) {
      const gProdQtys = listGProdQty.G_PRODQTY || [];
      gProdQtys.forEach((prodQty, index) => {
        const packQty = prodQty.PACKQTY?.[0];
        const cQty = prodQty.CQTY?.[0];
        const pack = prodQty.PACK?.[0];
        
        const qtyStr = packQty ? String(packQty).trim() : (cQty ? String(cQty).trim() : "");
        
        if (!qtyStr) {
          console.log(`Found issue in Batch: ${item.BATCH?.[0]}, Index: ${index}`);
          console.log('Fields available in G_PRODQTY:', Object.keys(prodQty));
          console.log('Values:', JSON.stringify(prodQty, null, 2));
        }
      });
    }
  }
}

findMissingQty().catch(console.error);
