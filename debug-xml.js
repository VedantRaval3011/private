
const PizZip = require('pizzip');
const fs = require('fs');
const path = require('path');

const content = fs.readFileSync(path.join(process.cwd(), 'templates', 'apqr_template.docx'), 'binary');
const zip = new PizZip(content);
const docXml = zip.file('word/document.xml').asText();

// Simple search
const search = 'April';
const idx = docXml.indexOf(search);
if (idx > -1) {
    const start = Math.max(0, idx - 200);
    const end = Math.min(docXml.length, idx + 200);
    console.log(JSON.stringify(docXml.substring(start, end)));
} else {
    console.log('April not found');
}
