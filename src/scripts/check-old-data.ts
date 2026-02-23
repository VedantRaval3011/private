import JSZip from 'jszip';
import fs from 'fs';
import path from 'path';

async function findBatchRemark() {
  const buffer = fs.readFileSync(path.join(process.cwd(), 'test_apqr_output.docx'));
  const zip = await JSZip.loadAsync(buffer);
  const docXml = await zip.file('word/document.xml')!.async('string');
  
  const lines: string[] = [];
  
  // Find "Details of Product" - this is the batch table header
  const detailsIdx = docXml.indexOf('Details of Product');
  lines.push(`"Details of Product" at index: ${detailsIdx}`);
  
  // Find the first "Prepared By" after the batch table area
  const preparedByIdx = docXml.indexOf('Prepared By', detailsIdx + 1);
  lines.push(`First "Prepared By" after batch table: ${preparedByIdx}`);
  
  // The Remark should be between these two
  lines.push(`\nSearching for "Remark" between ${detailsIdx} and ${preparedByIdx}:`);
  
  let searchIdx = detailsIdx;
  while (true) {
    const found = docXml.indexOf('Remark', searchIdx);
    if (found === -1 || found > preparedByIdx) break;
    
    // Get texts near this Remark
    const texts: string[] = [];
    docXml.substring(found - 100, Math.min(found + 2000, docXml.length))
      .replace(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g, (_, t) => {
        if (t.trim()) texts.push(t.trim());
        return _;
      });
    lines.push(`  Remark at ${found}: [${texts.join(' | ')}]`);
    searchIdx = found + 1;
  }
  
  // Find "review period" between Details and PreparedBy
  lines.push('\nSearching for "review period":');
  searchIdx = detailsIdx;
  while (true) {
    const found = docXml.indexOf('review period', searchIdx);
    if (found === -1 || found > preparedByIdx + 5000) break;
    lines.push(`  "review period" at ${found}`);
    searchIdx = found + 1;
  }
  
  // Check "Total Batches Manufactured" in the batch area
  lines.push('\nChecking "Total Batches Manufactured":');
  searchIdx = detailsIdx;
  while (true) {
    const found = docXml.indexOf('Total Batches Manufactured', searchIdx); 
    if (found === -1 || found > preparedByIdx + 5000) break;
    const texts: string[] = [];
    docXml.substring(found - 50, found + 200).replace(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g, (_, t) => {
      texts.push(t.trim());
      return _;
    });
    lines.push(`  At ${found}: [${texts.join(' | ')}]`);
    searchIdx = found + 1;
  }
  
  fs.writeFileSync('remark-find.txt', lines.join('\n'), 'utf8');
  console.log('Done');
  process.exit(0);
}

findBatchRemark();
