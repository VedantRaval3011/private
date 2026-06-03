/**
 * Re-ingest COA XML files into MongoDB with the current parser logic.
 *
 * Section 5.3.2 is built from the stored COA records, so after changing the
 * parser (e.g. adding pharmacopoeial `standard` tags) the existing records must
 * be re-parsed for the change to take effect. This mirrors the /api/coa/upload
 * route: re-parse each file and update the matching record (batch+stage+AR), or
 * create it if missing.
 *
 * Usage:
 *   npx tsx scripts/reingest-coa.mts "files/281. D25E14.XML" "files/1218. D25K11.XML"
 *   npx tsx scripts/reingest-coa.mts --dir files          (all *.XML in a folder)
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { connectToDatabase } from '../src/lib/mongodb';
import { COA } from '../src/models/COA';
import { parseCOAXml } from '../src/lib/coaParser';

async function main() {
  const args = process.argv.slice(2);
  let files: string[] = [];

  const dirIdx = args.indexOf('--dir');
  if (dirIdx !== -1) {
    const dir = args[dirIdx + 1];
    files = fs.readdirSync(dir)
      .filter(n => n.toUpperCase().endsWith('.XML'))
      .map(n => path.join(dir, n));
  } else {
    files = args;
  }

  if (files.length === 0) {
    console.error('No files given. Pass file paths, or --dir <folder>.');
    process.exit(1);
  }

  await connectToDatabase();

  let processed = 0, created = 0, updated = 0, failed = 0;
  for (const f of files) {
    const name = path.basename(f);
    try {
      const content = fs.readFileSync(f, 'utf-8');
      const r = await parseCOAXml(content, name);
      if (!r.success || !r.data) {
        console.warn(`✗ ${name}: ${r.errors.join(', ')}`);
        failed++;
        continue;
      }
      const rec = r.data;
      const existing = await COA.findOne({
        batchNumber: rec.batchNumber,
        stage: rec.stage,
        arNumber: rec.arNumber,
      });
      if (existing) {
        await COA.updateOne({ _id: existing._id }, { $set: rec });
        updated++;
        console.log(`↻ ${name} → ${rec.stage} ${rec.batchNumber}/${rec.arNumber} (spec ${rec.finishData?.specification || rec.bulkData?.specification || '-'})`);
      } else {
        await COA.create(rec);
        created++;
        console.log(`＋ ${name} → ${rec.stage} ${rec.batchNumber}/${rec.arNumber}`);
      }
      processed++;
    } catch (e) {
      console.warn(`✗ ${name}: ${e instanceof Error ? e.message : e}`);
      failed++;
    }
  }

  console.log(`\nDone. processed=${processed} (updated=${updated}, created=${created}) failed=${failed}`);
  process.exit(0);
}

main();
