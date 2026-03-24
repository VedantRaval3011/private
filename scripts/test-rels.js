const fs = require('fs');
const JSZip = require('jszip');

async function run() {
  const data = fs.readFileSync('templates/apqr_template.docx');
  const zip = await JSZip.loadAsync(data);
  const rels = await zip.file('word/_rels/document.xml.rels').async('string');
  const docXml = await zip.file('word/document.xml').async('string');

  const chartRelIds = {};
  for (let i = 6; i <= 10; i++) {
    const rx = new RegExp(`Id="([^"]+)"[^>]*Target="charts/chart${i}\\.xml"`);
    const m = rels.match(rx);
    if (m) {
      chartRelIds[i] = m[1];
      console.log(`chart${i}.xml -> ${m[1]}`);

      // Find in docXml
      const chartNodeStr = `<c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="${m[1]}"/>`;
      const idx = docXml.indexOf(`"${m[1]}"`);
      if (idx !== -1) {
        console.log(`  Found rId ${m[1]} in document.xml at ${idx}`);
        // Find p wrapper
        const pStart = docXml.lastIndexOf('<w:p ', idx);
        const pEnd = docXml.indexOf('</w:p>', idx) + 6;
        console.log(`  Paragraph: [${pStart} - ${pEnd}]`);
        // Find preceding header 
        const hStart = docXml.lastIndexOf('<w:p ', pStart - 1);
        const hEnd = docXml.indexOf('</w:p>', hStart) + 6;
        const headerFrag = docXml.substring(hStart, hEnd).replace(/<[^>]+>/g, '');
        console.log(`  Preceding Header Text: ${headerFrag}`);
      } else {
        console.log(`  rId ${m[1]} not found in document.xml`);
      }
    }
  }
}

run().catch(console.error);
