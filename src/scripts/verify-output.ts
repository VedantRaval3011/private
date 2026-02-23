import JSZip from 'jszip';
import fs from 'fs';
import path from 'path';

async function verifyOutput() {
  const outputPath = path.join(process.cwd(), 'test_apqr_output.docx');
  const buffer = fs.readFileSync(outputPath);
  const zip = await JSZip.loadAsync(buffer);
  const docXml = await zip.file('word/document.xml')!.async('string');
  
  const lines: string[] = [];
  
  // Check Monthly Grid
  const janIdx = docXml.indexOf('January');
  if (janIdx !== -1) {
    lines.push('=== MONTHLY GRID (OUTPUT) ===');
    const beforeJan = docXml.substring(Math.max(0, janIdx - 3000), janIdx);
    const tblStart = beforeJan.lastIndexOf('<w:tbl>');
    const gridStart = tblStart !== -1 ? Math.max(0, janIdx - 3000) + tblStart : janIdx - 200;
    const afterJan = docXml.substring(janIdx);
    const tblEnd = afterJan.indexOf('</w:tbl>');
    const gridEnd = tblEnd !== -1 ? janIdx + tblEnd + 8 : janIdx + 3000;
    const gridXml = docXml.substring(gridStart, gridEnd);
    
    const rows = gridXml.match(/<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/g);
    lines.push(`Rows: ${rows?.length}`);
    if (rows) {
      rows.forEach((row, i) => {
        const texts: string[] = [];
        row.replace(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g, (_, t) => { texts.push(t.trim()); return _; });
        lines.push(`  Row ${i}: [${texts.join(' | ')}]`);
      });
    }
  }
  
  // Check Batch Details Table
  const batchNumIdx = docXml.indexOf('Batch Number');
  if (batchNumIdx !== -1) {
    lines.push('\n=== BATCH DETAILS (OUTPUT) ===');
    const beforeBN = docXml.substring(Math.max(0, batchNumIdx - 3000), batchNumIdx);
    const tblStart = beforeBN.lastIndexOf('<w:tbl>');
    const detailStart = tblStart !== -1 ? Math.max(0, batchNumIdx - 3000) + tblStart : batchNumIdx - 200;
    const afterBN = docXml.substring(batchNumIdx);
    const tblEnd = afterBN.indexOf('</w:tbl>');
    const detailEnd = tblEnd !== -1 ? batchNumIdx + tblEnd + 8 : batchNumIdx + 5000;
    const detailXml = docXml.substring(detailStart, detailEnd);
    
    const rows = detailXml.match(/<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/g);
    lines.push(`Rows: ${rows?.length}`);
    if (rows) {
      rows.forEach((row, i) => {
        const texts: string[] = [];
        row.replace(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g, (_, t) => { texts.push(t.trim()); return _; });
        lines.push(`  Row ${i}: [${texts.join(' | ')}]`);
      });
    }
  }
  
  // Check Remark
  const remarkIdx = docXml.indexOf('Remark');
  if (remarkIdx !== -1) {
    lines.push('\n=== REMARK (OUTPUT) ===');
    const texts: string[] = [];
    docXml.substring(remarkIdx - 100, remarkIdx + 500).replace(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g, (_, t) => { texts.push(t.trim()); return _; });
    lines.push(`  Text: "${texts.join(' | ')}"`);
  }
  
  // Check if old template data still exists
  lines.push('\n=== OLD TEMPLATE DATA CHECK ===');
  lines.push(`  D25D21 present: ${docXml.includes('D25D21')}`);
  lines.push(`  D25E40 present: ${docXml.includes('D25E40')}`);
  lines.push(`  D25H28 present: ${docXml.includes('D25H28')}`);
  lines.push(`  D25K08 present: ${docXml.includes('D25K08')}`);
  
  fs.writeFileSync('output-verify.txt', lines.join('\n'), 'utf8');
  console.log('Done! Written to output-verify.txt');
  process.exit(0);
}

verifyOutput();
