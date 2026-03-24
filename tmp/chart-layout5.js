const fs = require('fs');
const JSZip = require('jszip');
async function run() {
  const buf = fs.readFileSync('templates/apqr_template.docx');
  const zip = await JSZip.loadAsync(buf);
  const docXml = await zip.file('word/document.xml').async('string');
  const matches = [...docXml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)];
  let out = '';
  let inSection = false;
  for (let m of matches) {
    const p = m[0];
    const text = (p.match(/<w:t(?:.*?)>([\s\S]*?)<\/w:t>/g) || []).map(t => t.replace(/<[^>]+>/g, '')).join('');
    if (text.includes('5.3.2')) inSection = true;
    if (text.includes('5.3.3')) inSection = false;
    
    if (inSection) {
      const hasDrawing = p.includes('<w:drawing>');
      if (hasDrawing || text.toLowerCase().includes('trend')) {
        let rIdMatch = p.match(/r:id="(rId\d+)"/);
        out += 'TEXT: ' + text + ' | DRAW: ' + hasDrawing + ' | rId: ' + (rIdMatch ? rIdMatch[1] : 'none') + '\n';
      }
    }
  }
  fs.writeFileSync('tmp/chart-layout5.txt', out);
}
run();
