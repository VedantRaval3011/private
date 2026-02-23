
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

async function inspect() {
  const templatePath = path.join(process.cwd(), 'templates', 'apqr_template.docx');
  const buffer = fs.readFileSync(templatePath);
  const zip = await JSZip.loadAsync(buffer);
  const docXml = await zip.file('word/document.xml').async('string');

  const idx = docXml.indexOf('Material Code');
  if (idx === -1) {
    console.log('"Material Code" NOT FOUND in XML string directly.');
    // Try finding "Material"
    const idx2 = docXml.indexOf('Material');
    console.log('Context around "Material":');
    console.log(docXml.substring(idx2 - 100, idx2 + 300));
  } else {
    fs.writeFileSync('template_snippet.xml', docXml.substring(idx - 500, idx + 1000));
    console.log('Wrote snippet to template_snippet.xml');
  }
}

inspect().catch(console.error);
