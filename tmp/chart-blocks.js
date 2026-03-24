const fs = require('fs');
const JSZip = require('jszip');

async function run() {
  const buf = fs.readFileSync('templates/apqr_template.docx');
  const zip = await JSZip.loadAsync(buf);
  const docXml = await zip.file('word/document.xml').async('string');
  
  const headers = [
    'Trend Analysis of pH at Finished Stage:',
    'Trend Analysis of Uniformity of Filled Volume – 5ml at Finished Stage:',
    'Trend Analysis of Uniformity of Filled Volume – 10ml at Finished Stage:',
    'Trend Analysis of Osmolality at Finished Stage:',
    'Trend Analysis of % Assay of Sodium Hyaluronate at Finished Stage:'
  ];

  let out = '';
  for (let h of headers) {
    const startIdx = docXml.indexOf(h);
    if (startIdx === -1) {
       out += `NOT FOUND: ${h}\n`;
       continue;
    }
    // Find enclosing <w:p> for the header
    const pStartHead = docXml.lastIndexOf('<w:p', startIdx);
    const pEndHead = docXml.indexOf('</w:p>', startIdx) + 6;
    
    // Find the next <w:p> which SHOULD contain the drawing
    const pStartDraw = docXml.indexOf('<w:p', pEndHead);
    const pEndDraw = docXml.indexOf('</w:p>', pStartDraw) + 6;
    
    const headBlock = docXml.substring(pStartHead, pEndHead);
    const drawBlock = docXml.substring(pStartDraw, pEndDraw);
    
    // Check if drawBlock actually has a drawing
    const hasDrawing = drawBlock.includes('<w:drawing>');
    let rId = '';
    if (hasDrawing) {
      const match = drawBlock.match(/r:id="(rId\d+)"/);
      rId = match ? match[1] : 'none';
    }
    
    out += `\n--- Header: ${h} ---\n`;
    out += `pStartHead: ${pStartHead}, pEndDraw: ${pEndDraw}\n`;
    out += `Contains Drawing: ${hasDrawing}, rId: ${rId}\n`;
  }
  
  fs.writeFileSync('tmp/chart-blocks.txt', out);
}

run().catch(console.error);
