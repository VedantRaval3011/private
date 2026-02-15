
const PizZip = require('pizzip');
const fs = require('fs');
const path = require('path');

try {
  const content = fs.readFileSync(path.join(process.cwd(), 'templates', 'apqr_template.docx'), 'binary');
  const zip = new PizZip(content);
  const docXml = zip.file('word/document.xml').asText();

  console.log('--- XML ANALYSIS ---');

  const targets = ['D25D21', 'April-2025', '04/2025', '03/2027'];

  targets.forEach(t => {
    const idx = docXml.indexOf(t);
    if (idx === -1) {
      console.log(`[MISSING] Target "${t}" NOT FOUND in XML`);
    } else {
      console.log(`[FOUND] Target "${t}" at index ${idx}`);
      // Show surrounding XML to see the tags clearly
      const start = Math.max(0, idx - 100);
      const end = Math.min(docXml.length, idx + 100);
      // Replace < with newline + < for readability
      const context = docXml.substring(start, end).replace(/</g, '\n<');
      console.log(context);
      console.log('--------------------------------------------------');
    }
  });
} catch (e) {
  console.error(e);
}
