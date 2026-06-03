/**
 * Full COA re-ingest (bulk + finish), run in a fresh process so the corrected
 * parser + Mongoose schema (with the assay `standard` field) are loaded clean.
 *
 *   npx tsx scripts/reingest-coas.mts
 *
 * Drops every COA document and re-creates them from the XML files in files/.
 * Other collections / file types are untouched.
 */
import fs from 'fs';
import path from 'path';
import 'dotenv/config';
import mongoose from 'mongoose';
import { detectXmlType } from '../src/lib/xmlTypeDetector';
import { parseCOAXml } from '../src/lib/coaParser';

const URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/formula-master';
const FILES_DIR = path.join(process.cwd(), 'files');

function readUtf8(file: string): string {
  // Strip BOM if present
  const buf = fs.readFileSync(file);
  let s = buf.toString('utf8');
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  return s;
}

async function main() {
  await mongoose.connect(URI);
  const coas = mongoose.connection.collection('coas');
  console.log('Connected. Dropping coas collection...');
  try { await coas.drop(); }
  catch (e: any) { if (e.codeName !== 'NamespaceNotFound') throw e; }

  const all = fs.readdirSync(FILES_DIR).filter(f => f.toLowerCase().endsWith('.xml'));
  console.log(`Scanning ${all.length} XML files in files/ ...`);

  let coaFiles = 0, created = 0, failed = 0, skippedType = 0;
  let finishCreated = 0, finishTagged = 0;
  const failures: string[] = [];

  for (const name of all) {
    const full = path.join(FILES_DIR, name);
    let content: string;
    try { content = readUtf8(full); } catch { failed++; failures.push(`${name}: read error`); continue; }

    let type: string;
    try { type = detectXmlType(content); } catch { skippedType++; continue; }
    if (type !== 'COA') { skippedType++; continue; }
    coaFiles++;

    try {
      const res = await parseCOAXml(content, name);
      if (!res.success || !res.data) { failed++; failures.push(`${name}: ${res.errors?.join(', ')}`); continue; }
      const record = res.data as any;
      // Upsert by business key (batch + stage + AR) so duplicate "copy" XMLs
      // overwrite the same doc instead of creating duplicates — matches the
      // original ingestion's dedup behavior. Raw driver write preserves the
      // assay `standard` field (no schema stripping).
      const r = await coas.updateOne(
        { batchNumber: record.batchNumber, stage: record.stage, arNumber: record.arNumber },
        { $set: { ...record, uploadedAt: new Date() } },
        { upsert: true }
      );
      if (r.upsertedCount) created++;
      if (record.stage === 'FINISH') {
        finishCreated++;
        const tagged = (record as any).finishData?.assayResults?.some((a: any) => a.standard && a.standard !== 'OTHER');
        if (tagged) finishTagged++;
      }
    } catch (e: any) {
      failed++; failures.push(`${name}: ${e.message}`);
    }

    if (coaFiles % 250 === 0) console.log(`  ...${coaFiles} COA files processed (created ${created})`);
  }

  console.log('\n' + '='.repeat(60));
  console.log(`COA XML files detected : ${coaFiles}`);
  console.log(`Created in DB          : ${created}`);
  console.log(`  of which FINISH      : ${finishCreated}`);
  console.log(`  FINISH w/ IP|USP tag : ${finishTagged}`);
  console.log(`Failed                 : ${failed}`);
  console.log(`Non-COA skipped        : ${skippedType}`);
  if (failures.length) {
    console.log('\nFirst 15 failures:');
    failures.slice(0, 15).forEach(f => console.log('  - ' + f));
  }

  await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
