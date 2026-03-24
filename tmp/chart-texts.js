const fs = require('fs');
const JSZip = require('jszip');

async function run() {
  const buf = fs.readFileSync('templates/apqr_template.docx');
  const zip = await JSZip.loadAsync(buf);
  let out = '';
  for (let i = 6; i <= 12; i++) {
    const name = `word/charts/chart${i}.xml`;
    if (!zip.file(name)) continue;
    const xml = await zip.file(name).async('string');
    const texts = [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map(m => m[1]);
    out += `\n--- ${name} ---\n` + texts.join(' | ') + '\n';
  }
  fs.writeFileSync('tmp/chart-texts.txt', out);
}

run().catch(console.error);
