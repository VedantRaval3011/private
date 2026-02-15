
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
const docXml = zip.file("word/document.xml").asText();

// Search for potential placeholders (anything inside {{ }})
const regex = /{{(.*?)}}/g;
const matches = docXml.match(regex);

if (matches) {
    console.log("Found placeholders:", [...new Set(matches)]);
} else {
    console.log("No {{...}} placeholders found in document.xml");
}

// Also check for user mentioned items to see if they are raw text
const checkList = ["SODIUM HYALURONATE", "PRODUCT_NAME", "product_name"];
checkList.forEach(item => {
    if (docXml.includes(item)) {
        console.log(`Found literal text: "${item}"`);
    } else {
        console.log(`Did not find literal text: "${item}"`);
    }
});
