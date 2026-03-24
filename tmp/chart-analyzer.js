const fs = require('fs');
const JSZip = require('jszip');

async function run() {
  const buf = fs.readFileSync('templates/apqr_template.docx');
  const zip = await JSZip.loadAsync(buf);
  const charts = Object.keys(zip.files).filter(f => f.startsWith('word/charts/chart') && f.endsWith('.xml'));
  
  let out = `Found ${charts.length} charts:\n`;
  for (let c of charts) {
    const xml = await zip.file(c).async('string');
    // More robust title match
    let title = 'No title';
    const titleMatch = xml.match(/<c:title>.*?<a:t>(.*?)<\/a:t>.*?<\/c:title>/);
    if (titleMatch) title = titleMatch[1];
    else {
      // try to extract any texts that look like a title
      const texts = xml.match(/<a:t>(.*?)<\/a:t>/g);
      if (texts && texts.length > 0) {
        title = texts[0].replace(/<\/?a:t>/g, '');
      }
    }
    out += `${c} -> Title: ${title}\n`;
  }
  fs.writeFileSync('tmp/charts-analysis.txt', out);
}

run().catch(console.error);
