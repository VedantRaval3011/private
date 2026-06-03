/**
 * Maintenance script: remove FINISH-stage COA entries from `processing_logs`
 * so the corresponding XML files can be re-ingested after the COA collection
 * is dropped (re-parsing repopulates the new `standard` tag on assays).
 *
 * Run a preview first:   node scripts/cleanup-finish-coa-logs.mjs
 * Then actually delete:   node scripts/cleanup-finish-coa-logs.mjs --delete
 *
 * FINISH COA logs are identified by fileType='COA' and a businessKey of the
 * form `<batch>-<ar>-FINISH` (see processCOAXml in ingestionService.ts).
 */
import 'dotenv/config';
import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/formula-master';
const DO_DELETE = process.argv.includes('--delete');

const FINISH_FILTER = { fileType: 'COA', businessKey: { $regex: '-FINISH$' } };
const BULK_FILTER   = { fileType: 'COA', businessKey: { $regex: '-BULK$' } };

async function main() {
  await mongoose.connect(MONGODB_URI);
  const logs = mongoose.connection.collection('processing_logs');

  const totalCoa   = await logs.countDocuments({ fileType: 'COA' });
  const finishCnt  = await logs.countDocuments(FINISH_FILTER);
  const bulkCnt    = await logs.countDocuments(BULK_FILTER);
  const otherCoa   = totalCoa - finishCnt - bulkCnt;

  console.log('='.repeat(70));
  console.log('processing_logs — COA breakdown');
  console.log('='.repeat(70));
  console.log(`  Total COA logs            : ${totalCoa}`);
  console.log(`  FINISH (will be removed)  : ${finishCnt}`);
  console.log(`  BULK   (kept)             : ${bulkCnt}`);
  console.log(`  Other/no -STAGE suffix    : ${otherCoa}`);

  // Status breakdown of the FINISH set we are about to touch
  const byStatus = await logs.aggregate([
    { $match: FINISH_FILTER },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]).toArray();
  console.log('\n  FINISH set by status:');
  for (const s of byStatus) console.log(`    ${s._id}: ${s.count}`);

  const samples = await logs.find(FINISH_FILTER).limit(8)
    .project({ _id: 0, fileName: 1, businessKey: 1, status: 1 }).toArray();
  console.log('\n  Sample FINISH logs:');
  for (const s of samples) console.log(`    [${s.status}] ${s.businessKey}  (${s.fileName})`);

  if (DO_DELETE) {
    const res = await logs.deleteMany(FINISH_FILTER);
    console.log(`\n🗑️  DELETED ${res.deletedCount} FINISH COA log(s).`);
  } else {
    console.log('\n(preview only — re-run with --delete to remove these)');
  }

  await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
