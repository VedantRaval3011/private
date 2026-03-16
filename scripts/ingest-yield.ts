import { connectToDatabase } from '../src/lib/mongodb';
import { processXmlFile } from '../src/lib/ingestionService';
import { readFileSync } from 'fs';
import path from 'path';

async function main() {
  await connectToDatabase();
  const filePath = path.join(__dirname, '../files/YIELDSTATEMENT-01-04-2025 to 09-03-2026.XML');
  const buffer = readFileSync(filePath);
  const content = buffer.toString('utf-8');
  const result = await processXmlFile({
    fileName: 'YIELDSTATEMENT-01-04-2025 to 09-03-2026.XML',
    filePath,
    fileSize: buffer.length,
    content: content
  });
  console.log(JSON.stringify(result, null, 2));
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
