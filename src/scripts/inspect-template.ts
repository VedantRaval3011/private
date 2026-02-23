import JSZip from 'jszip';
import fs from 'fs';
import path from 'path';

async function inspectTemplate() {
  const templatePath = path.join(process.cwd(), 'templates', 'apqr_template.docx');
  const buffer = fs.readFileSync(templatePath);
  const zip = await JSZip.loadAsync(buffer);
  const docXml = await zip.file('word/document.xml')!.async('string');
  
  const lines: string[] = [];
  
  // Find Monthly Grid table (contains "January")
  const janIdx = docXml.indexOf('January');
  if (janIdx !== -1) {
    lines.push('=== MONTHLY GRID TABLE ===');
    const beforeJan = docXml.substring(Math.max(0, janIdx - 2000), janIdx);
    const tblStart = beforeJan.lastIndexOf('<w:tbl>');
    const gridStart = tblStart !== -1 ? Math.max(0, janIdx - 2000) + tblStart : janIdx - 200;
    
    const afterJan = docXml.substring(janIdx);
    const tblEnd = afterJan.indexOf('</w:tbl>');
    const gridEnd = tblEnd !== -1 ? janIdx + tblEnd + 8 : janIdx + 3000;
    
    const gridXml = docXml.substring(gridStart, gridEnd);
    
    const rows = gridXml.match(/<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/g);
    lines.push(`Number of rows: ${rows?.length}`);
    
    if (rows) {
      rows.forEach((row, i) => {
        const rowTexts: string[] = [];
        row.replace(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g, (_, text) => {
          rowTexts.push(text.trim());
          return _;
        });
        lines.push(`  Row ${i}: [${rowTexts.join(' | ')}]`);
      });
    }
  }
  
  // Find Batch Details table (contains "Batch Number")
  const batchNumIdx = docXml.indexOf('Batch Number');
  if (batchNumIdx !== -1) {
    lines.push('\n=== BATCH DETAILS TABLE ===');
    const beforeBN = docXml.substring(Math.max(0, batchNumIdx - 2000), batchNumIdx);
    const tblStart = beforeBN.lastIndexOf('<w:tbl>');
    const detailStart = tblStart !== -1 ? Math.max(0, batchNumIdx - 2000) + tblStart : batchNumIdx - 200;
    
    const afterBN = docXml.substring(batchNumIdx);
    const tblEnd = afterBN.indexOf('</w:tbl>');
    const detailEnd = tblEnd !== -1 ? batchNumIdx + tblEnd + 8 : batchNumIdx + 5000;
    
    const detailXml = docXml.substring(detailStart, detailEnd);
    
    const rows = detailXml.match(/<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/g);
    lines.push(`Number of rows: ${rows?.length}`);
    
    if (rows) {
      rows.forEach((row, i) => {
        const rowTexts: string[] = [];
        row.replace(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g, (_, text) => {
          rowTexts.push(text.trim());
          return _;
        });
        lines.push(`  Row ${i}: [${rowTexts.join(' | ')}]`);

        // Count cells in row
        const cells = row.match(/<w:tc\b[^>]*>[\s\S]*?<\/w:tc>/g);
        lines.push(`    Cells: ${cells?.length}`);
      });
    }
  }
  
  // Find all "Total Batches Manufactured" occurrences
  lines.push('\n=== TOTAL BATCHES MANUFACTURED ===');
  let searchIdx = 0;
  let count = 0;
  while (true) {
    const found = docXml.indexOf('Total Batches Manufactured', searchIdx);
    if (found === -1) break;
    count++;
    const surrounding: string[] = [];
    docXml.substring(found - 100, found + 300).replace(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g, (_, text) => {
      surrounding.push(text.trim());
      return _;
    });
    lines.push(`  Occurrence ${count}: "${surrounding.join('')}"`);
    searchIdx = found + 1;
  }
  lines.push(`  Total: ${count} occurrences`);
  
  // Find Remark section  
  const remarkIdx = docXml.indexOf('Remark');
  if (remarkIdx !== -1) {
    lines.push('\n=== REMARK SECTION ===');
    const surrounding: string[] = [];
    docXml.substring(remarkIdx - 50, remarkIdx + 500).replace(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g, (_, text) => {
      surrounding.push(text.trim());
      return _;
    });
    lines.push(`  Text: "${surrounding.join(' | ')}"`);
  }
  
  // Write to file
  fs.writeFileSync('template-structure.txt', lines.join('\n'), 'utf8');
  console.log('Done! Written to template-structure.txt');
  process.exit(0);
}

inspectTemplate();
