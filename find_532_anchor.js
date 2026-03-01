const JSZip = require('jszip');
const fs = require('fs');

(async () => {
  const z = await JSZip.loadAsync(fs.readFileSync('templates/apqr_template.docx'));
  const xml = await z.file('word/document.xml').async('string');
  
  const result = {};
  
  // Table 27 ends where?
  const tbl27End = xml.indexOf('</w:tbl>', 833681) + 8;
  const between = xml.substring(tbl27End, 850649);
  const textsBetween = [...between.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(m => m[1]).filter(t => t.trim());
  result.textBetweenT27andT28 = textsBetween;
  
  // Table 28 first 20 texts
  const tbl28End = xml.indexOf('</w:tbl>', 850649) + 8;
  const tbl28Content = xml.substring(850649, tbl28End);
  const tbl28Texts = [...tbl28Content.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(m => m[1]).filter(t => t.trim());
  result.table28Texts = tbl28Texts.slice(0, 30);
  
  // Table 30 (remark after 5.3.2?) first 20 texts
  const tbl30Content = xml.substring(914331, xml.indexOf('</w:tbl>', 914331) + 8);
  const tbl30Texts = [...tbl30Content.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(m => m[1]).filter(t => t.trim());
  result.table30Texts = tbl30Texts.slice(0, 20);
  
  // Table 29 first 20 texts  
  const tbl29Content = xml.substring(880925, xml.indexOf('</w:tbl>', 880925) + 8);
  const tbl29Texts = [...tbl29Content.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(m => m[1]).filter(t => t.trim());
  result.table29Texts = tbl29Texts.slice(0, 30);
  
  // Where is "Finished Product Analysis" 
  let allFP = [];
  let idx2 = 0;
  while ((idx2 = xml.indexOf('Finished Product', idx2)) !== -1) {
    allFP.push(idx2);
    idx2 += 16;
  }
  result.allFinishedProductPositions = allFP;
  
  // Where is "5.3.2"
  let all532 = [];
  idx2 = 0;
  while ((idx2 = xml.indexOf('5.3.2', idx2)) !== -1) {
    all532.push(idx2);
    idx2 += 5;
  }
  result.all532Positions = all532;
  
  fs.writeFileSync('tbl_detail.json', JSON.stringify(result, null, 2));
  console.log('done');
})();
