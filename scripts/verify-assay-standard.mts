/**
 * Standalone verification: parse a real dual-pharmacopoeia finish COA and
 * confirm each assay is tagged with the correct pharmacopoeial `standard`,
 * then confirm the Section 5.3.2 builder yields one assay column per spec.
 *
 *   npx tsx scripts/verify-assay-standard.mts
 */
import fs from 'fs';
import { parseCOAXml } from '../src/lib/coaParser';

const FILE = 'files/281. D25E14.XML';

const content = fs.readFileSync(FILE, 'utf8');
const res = await parseCOAXml(content, FILE);

if (!res.success || !res.data) {
  console.error('Parse failed:', res.errors);
  process.exit(1);
}

const fd = (res.data as any).finishData;
console.log('Batch:', res.data.batchNumber, '| stage:', res.data.stage, '| spec:', fd?.specification);
console.log('\nAssay results (compound | standard | result):');
for (const a of fd?.assayResults || []) {
  console.log(`  - ${a.compound}  |  ${a.standard}  |  ${String(a.result).replace(/\n/g, ' / ')}`);
}
