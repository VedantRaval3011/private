const JSZip = require('jszip');
const fs = require('fs');

(async () => {
  const z = await JSZip.loadAsync(fs.readFileSync('templates/apqr_template.docx'));
  let xml = await z.file('word/document.xml').async('string');

  // Check if <w:tbl> has attributes
  const tblTags = [...xml.matchAll(/<w:tbl\b[^>]*>/g)].slice(0, 5);
  const result = {};
  result.firstTblTags = tblTags.map(m => m[0].substring(0, 80));

  // Check around Table 28 (idx 850649)
  result.aroundT28 = xml.substring(850620, 850720);

  // Try <w:tbl vs <w:tbl>
  result.countExactTbl = [...xml.matchAll(/<w:tbl>/g)].length;
  result.countAnyTbl = [...xml.matchAll(/<w:tbl\b/g)].length;

  fs.writeFileSync('debug_tbl.json', JSON.stringify(result, null, 2));
  console.log('done');
})();
