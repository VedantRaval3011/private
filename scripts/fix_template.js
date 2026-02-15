
const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');

const templatePath = path.join(process.cwd(), 'templates', 'apqr_template.docx');
const outputPath = path.join(process.cwd(), 'templates', 'apqr_template_dynamic.docx');

if (!fs.existsSync(templatePath)) {
  console.error('Template not found');
  process.exit(1);
}

try {
  const content = fs.readFileSync(templatePath, 'binary');
  const zip = new PizZip(content);
  let docXml = zip.file("word/document.xml").asText();

  // Replacements - Order matters! Longer matches first.
  let replacements = [
    // Longer matches first to prevent partial replacements
    { target: "SODIUM HYALURONATE EYE DROPS", replacement: "{product_name}" },
    
    // Product Code
    { target: "SY208G1H", replacement: "{product_code}" },
    
    // Dosage Form
    { target: "Ophthalmic Solution", replacement: "{dosage_form}" },
    
    // Shelf Life
    { target: "24 Months", replacement: "{shelf_life}" },
    
    // Mfg Lic No
    { target: "G/28/197", replacement: "{mfg_lic_no}" },
    
    // Therapeutic Category (Clear it out as it's not in schema)
    { target: "Artificial Tears", replacement: "{therapeutic_category}" },
    
    // Composition / Label Claim
    { target: "SODIUM HYALURONATE", replacement: "{label_claim}" },
    { target: "STABILIZED OXYCHLORO COMPLEX", replacement: "" },
    { target: "STERILE AQUEOUS BASE", replacement: "" },
    { target: "(AS PRESERVATIVE)", replacement: "" },
    
    // Clear units/specs in the composition table so they don't linger
    { target: "<w:t>BP</w:t>", replacement: "<w:t></w:t>" },
    { target: "<w:t>0.1% WV</w:t>", replacement: "<w:t></w:t>" },
    { target: "<w:t>0.005% W/V</w:t>", replacement: "<w:t></w:t>" },
    { target: "<w:t>Q. S</w:t>", replacement: "<w:t></w:t>" }
  ];

  replacements.forEach(({ target, replacement }) => {
    // Escape special regex chars in target if necessary, but here they are simple strings
    // EXCEPT for the XML tags ones.
    // For simple strings, we use split/join to replace all occurrences efficiently
    if (target.includes("<w:t>")) {
         docXml = docXml.split(target).join(replacement);
    } else {
        // We need to be careful not to break XML.
        // But since we are replacing text content which is usually inside <w:t>, 
        // passing plain string replacement is risky if the target spans multiple runs.
        // However, based on inspection, these specific values appeared to be coherent blocks.
        // We will simply replace the string text.
        docXml = docXml.split(target).join(replacement);
    }
  });

  zip.file("word/document.xml", docXml);

  const buffer = zip.generate({
      type: "nodebuffer",
      compression: "DEFLATE"
  });

  fs.writeFileSync(outputPath, buffer);
  console.log('Created dynamic template at templates/apqr_template_dynamic.docx');

} catch (e) {
  console.error('Error processing template:', e);
  process.exit(1);
}
