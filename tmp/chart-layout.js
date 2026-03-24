const fs = require('fs');
const JSZip = require('jszip');

async function run() {
  const buf = fs.readFileSync('templates/apqr_template.docx');
  const zip = await JSZip.loadAsync(buf);
  const docXml = await zip.file('word/document.xml').async('string');
  
  // Find "Process Capability &amp; Performance parameters"
  const startIdx = docXml.indexOf('Process Capability &amp; Performance parameters');
  const sectionContent = docXml.substring(startIdx, startIdx + 20000);
  
  // Extract all paragraphs with text and drawing
  const matches = [...sectionContent.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)];
  let out = '';
  for (let m of matches) {
    const p = m[0];
    const text = (p.match(/<w:t(?:.*?)>([\s\S]*?)<\/w:t>/g) || []).map(t => t.replace(/<[^>]+>/g, '')).join('');
    const hasDrawing = p.includes('<w:drawing>');
    if (text || hasDrawing) {
      let rIdMatch = p.match(/r:id="(rId\d+)"/);
      let rId = rIdMatch ? rIdMatch[1] : '';
      out += `TEXT: "${text}" | DRAWING: ${hasDrawing} | rId: ${rId}\n`;
    }
  }
  
  fs.writeFileSync('tmp/chart-layout.txt', out);
}

run().catch(console.error);
