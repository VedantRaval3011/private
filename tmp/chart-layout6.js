const fs = require('fs');
const JSZip = require('jszip');
async function run() {
  const buf = fs.readFileSync('templates/apqr_template.docx');
  const zip = await JSZip.loadAsync(buf);
  const docXml = await zip.file('word/document.xml').async('string');
  
  // Find the anchor for Finished Product
  const startSearch = docXml.lastIndexOf('Finished Product Analysis');
  const nextSectionHeading = docXml.indexOf('Process Capability &amp; Performance parameters', startSearch);
  
  if (nextSectionHeading === -1) {
    fs.writeFileSync('tmp/chart-layout6.txt', 'Heading not found');
    return;
  }
  
  const sectionContent = docXml.substring(nextSectionHeading, nextSectionHeading + 80000);
  const matches = [...sectionContent.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)];
  let out = `START: ${nextSectionHeading}\n`;
  for (let m of matches) {
    const p = m[0];
    const text = (p.match(/<w:t(?:.*?)>([\s\S]*?)<\/w:t>/g) || []).map(t => t.replace(/<[^>]+>/g, '')).join('');
    const hasDrawing = p.includes('<w:drawing>');
    if (hasDrawing || text.includes('Trend') || text.includes('Process')) {
      let rIdMatch = p.match(/r:id="(rId\d+)"/);
      out += 'TEXT: ' + text + ' | DRAW: ' + hasDrawing + ' | rId: ' + (rIdMatch ? rIdMatch[1] : 'none') + '\n';
    }
  }
  fs.writeFileSync('tmp/chart-layout6.txt', out);
}
run();
