
const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');

const templatePath = path.join(process.cwd(), 'templates', 'apqr_template.docx');
const outputPath = path.join(process.cwd(), 'templates', 'document.xml');

if (!fs.existsSync(templatePath)) {
  console.log('Template not found');
  process.exit(1);
}

const content = fs.readFileSync(templatePath, 'binary');
const zip = new PizZip(content);
const docXml = zip.file("word/document.xml").asText();

fs.writeFileSync(outputPath, docXml);
console.log('Extracted document.xml to templates/document.xml');
