const fs = require('fs');
const JSZip = require('jszip');

async function run() {
  const buf = fs.readFileSync('templates/apqr_template.docx');
  const zip = await JSZip.loadAsync(buf);
  const docXml = await zip.file('word/document.xml').async('string');
  
  const matches = [...docXml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)];
  let out = '';
  
  for (let i = 0; i < matches.length; i++) {
    const p = matches[i][0];
    const text = (p.match(/<w:t(?:.*?)>([\s\S]*?)<\/w:t>/g) || []).map(t => t.replace(/<[^>]+>/g, '')).join('');
    
    if (text.includes('Trend Analysis') && text.includes('Finished Stage:')) {
      const pIndex = matches[i].index;
      const pEnd = pIndex + p.length;
      
      out += `\n--- Header: ${text} ---\n`;
      out += `Head Paragraph [${pIndex} - ${pEnd}]\n`;
      
      // Look at the next few paragraphs to find the drawing
      let drawFound = false;
      for (let j = 1; j <= 3 && (i + j) < matches.length; j++) {
        const nextP = matches[i + j][0];
        if (nextP.includes('<w:drawing>')) {
           const matchId = nextP.match(/r:id="(rId\d+)"/);
           const rId = matchId ? matchId[1] : 'none';
           out += `Drawing Paragraph (+${j}) [${matches[i+j].index} - ${matches[i+j].index + nextP.length}], rId: ${rId}\n`;
           drawFound = true;
           break;
        }
      }
      if (!drawFound) out += `Drawing not found in next 3 paragraphs.\n`;
    }
  }
  
  fs.writeFileSync('tmp/chart-blocks2.txt', out);
}

run().catch(console.error);
