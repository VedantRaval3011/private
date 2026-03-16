import { readFileSync } from 'fs';
import path from 'path';
import { parseYieldXml } from '../src/lib/yieldParser';

async function main() {
  const filePath = path.join(__dirname, '../files/YIELDSTATEMENT-01-04-2025 to 09-03-2026.XML');
  const content = readFileSync(filePath, 'utf-8');
  
  const result = await parseYieldXml(content);
  if (!result.success) {
    console.error('Failed:', result.errors);
    return;
  }
  
  console.log(`Successfully parsed ${result.data?.length} items`);
  const sample = result.data?.find(d => d.batchNo === 'GP168');
  console.log('Sample GP168:', JSON.stringify(sample, null, 2));
}

main().catch(console.error);
