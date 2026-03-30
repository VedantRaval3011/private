const fs = require('fs');
const JSZip = require('jszip');

async function run() {
  const data = fs.readFileSync('templates/apqr_template.docx');
  const zip = await JSZip.loadAsync(data);
  const docXml = await zip.file('word/document.xml').async('string');
  const rels = await zip.file('word/_rels/document.xml.rels').async('string');

  // Check chart12 (rId20) context - likely Finished Stage Yield
  const rId20Pos = docXml.indexOf('"rId20"');
  console.log('rId20 at:', rId20Pos);
  const drawStart = docXml.lastIndexOf('<w:p ', rId20Pos);
  // Look at 5 preceding paragraphs for context
  let searchPos = drawStart;
  for (let j = 0; j < 8; j++) {
    const pEnd = docXml.lastIndexOf('</w:p>', searchPos - 1) + 6;
    const pStart = docXml.lastIndexOf('<w:p ', pEnd - 1);
    if (pStart === -1) break;
    const text = docXml.substring(pStart, pEnd).replace(/<[^>]+>/g, '').trim();
    if (text.length > 0) {
      console.log(`  p[-${j+1}]: "${text.substring(0, 150)}"`);
    }
    searchPos = pStart;
  }

  // Also check chart12 series
  const c12 = await zip.file('word/charts/chart12.xml').async('string');
  const series = [...c12.matchAll(/<c:ser>([\s\S]*?)<\/c:ser>/g)];
  console.log(`\nchart12 series count: ${series.length}`);
  series.forEach((m, i) => {
    const allVals = [...m[1].matchAll(/<c:v>([^<]+)<\/c:v>/g)].map(x => x[1]);
    console.log(`  Series[${i}]: ${allVals.slice(0, 8).join(' | ')}`);
  });

  // And chart11
  const rId19Pos = docXml.indexOf('"rId19"');
  console.log('\nrId19 at:', rId19Pos);
  const draw11Start = docXml.lastIndexOf('<w:p ', rId19Pos);
  let searchPos2 = draw11Start;
  for (let j = 0; j < 8; j++) {
    const pEnd = docXml.lastIndexOf('</w:p>', searchPos2 - 1) + 6;
    const pStart = docXml.lastIndexOf('<w:p ', pEnd - 1);
    if (pStart === -1) break;
    const text = docXml.substring(pStart, pEnd).replace(/<[^>]+>/g, '').trim();
    if (text.length > 0) {
      console.log(`  p[-${j+1}]: "${text.substring(0, 150)}"`);
    }
    searchPos2 = pStart;
  }
}

run().catch(console.error);
