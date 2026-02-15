
const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');

const templatePath = path.join(process.cwd(), 'templates', 'apqr_template.docx');

if (!fs.existsSync(templatePath)) {
  console.log('Template not found');
  process.exit(1);
}

const content = fs.readFileSync(templatePath, 'binary');
const zip = new PizZip(content);
let docXml = "";
try {
    docXml = zip.file("word/document.xml").asText();
} catch (e) {
    console.log("Error reading document.xml:", e.message);
    process.exit(1);
}

// Search for potential placeholders (anything inside { })
const matchSingle = docXml.match(/{[^{}]+}/g);

if (matchSingle) {
    console.log("Found single brace placeholders:", [...new Set(matchSingle)]);
} else {
    console.log("No single brace placeholders found.");
}

// Additional check for specific strings
const searchTerms = [
    "SODIUM HYALURONATE",
    "PRODUCT_NAME",
    "product_name",
    "Product Name"
];

searchTerms.forEach(term => {
    if (docXml.indexOf(term) !== -1) {
        console.log(`Found literal: "${term}"`);
    } else {
        console.log(`Not found: "${term}"`);
    }
});
