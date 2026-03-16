import { parseCOAXml } from '../src/lib/coaParser';
import fs from 'fs';

async function test() {
  const fileContent = fs.readFileSync('c:/Dev/private/files/165. D25D21.XML', 'utf8');
  const result = await parseCOAXml(fileContent, '165. D25D21.XML');
  
  if (result.success && result.data && result.data.finishData) {
    const fd = result.data.finishData;
    console.log("IDENTIFICATION:", fd.identificationTests);
    console.log("ASSAY:", fd.assayResults);
    console.log("CRITICAL:", fd.criticalParameters);
  } else {
    console.log("Parser failed:", result.errors);
  }
}

test().catch(console.error);
