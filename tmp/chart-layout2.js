const fs = require('fs');
const JSZip = require('jszip');
async function run() {
  const buf = fs.readFileSync('templates/apqr_template.docx');
  const zip = await JSZip.loadAsync(buf);
  const docXml = await zip.file('word/document.xml').async('string');
  const startIdx = docXml.indexOf('Process Capability &amp; Performance parameters');
  const sectionContent = docXml.substring(startIdx, startIdx + 150000);
  const matches = [...sectionContent.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)];
  let out = '';
  for (let m of matches) {
    const p = m[0];
    const text = (p.match(/<w:t(?:.*?)>([\s\S]*?)<\/w:t>/g) || []).map(t => t.replace(/<[^>]+>/g, '')).join('');
    const hasDrawing = p.includes('<w:drawing>');
    if (hasDrawing || text.includes('Trend')) {
      let rIdMatch = p.match(/r:id="(rId\d+)"/);
      out += 'TEXT: ' + text + ' | DRAW: ' + hasDrawing + ' | rId: ' + (rIdMatch ? rIdMatch[1] : '') + '\n';
    }
  }
  fs.writeFileSync('tmp/chart-layout.txt', out);
}
run();
