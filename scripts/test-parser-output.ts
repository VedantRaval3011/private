import { readFileSync } from 'fs';
import { parseYieldXml } from '../src/lib/yieldParser';

async function testParser() {
  const xml = readFileSync('./files/YIELDSTATEMENT-01-04-2025 to 09-03-2026.XML', 'utf-8');
  const result = await parseYieldXml(xml);
  
  if (result.success) {
    console.log(`Parser success: ${result.data.length} items parsed.`);
    if (result.errors.length > 0) {
      console.log(`Errors found: ${result.errors.length}`);
      console.log('Sample error:', result.errors[0]);
    }
  } else {
    console.log('Parser failed:', result.errors);
  }
}

testParser().catch(console.error);
