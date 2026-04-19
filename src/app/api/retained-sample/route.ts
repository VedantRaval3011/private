/**
 * Retained Sample API
 *
 * GET  /api/retained-sample
 *   Aggregates data from Formula, Batch, COA, and RetainedSample collections.
 *   Returns all MFCs (from Formula) with their batches (from Batch model),
 *   0-month pH (from COA FINISH), and stored 6–36 month stability entries.
 *
 * POST /api/retained-sample
 *   Upserts a stability entry (pH + description) for a given batch + month.
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Formula from '@/models/Formula';
import Batch from '@/models/Batch';
import COA from '@/models/COA';
import RetainedSample from '@/models/RetainedSample';
import { getAuthUser } from '@/lib/auth';
import type {
  RetainedSampleResponse,
  SaveStabilityResponse,
  SaveStabilityRequest,
  MFCGroup,
  BatchStabilityRow,
  StabilityEntry,
  PhParam,
  PhValue,
  EntryActor,
} from '@/types/retained-sample';

// ─── GET ─────────────────────────────────────────────────────────────────────

export async function GET(): Promise<NextResponse<RetainedSampleResponse>> {
  try {
    await connectToDatabase();

    // 1. Fetch all formulas — include filling details and processes for full product code coverage
    const formulas = await Formula.find(
      {},
      {
        'masterFormulaDetails.masterCardNo': 1,
        'masterFormulaDetails.productCode': 1,
        'masterFormulaDetails.productName': 1,
        'masterFormulaDetails.genericName': 1,
        'masterFormulaDetails.shelfLife': 1,
        'fillingDetails.productCode': 1,
        'processes.fillingProducts.productCode': 1,
      }
    ).lean();

    if (!formulas.length) {
      return NextResponse.json({ success: true, data: { moreThan3: [], lessThan3: [] } });
    }

    // mfcKey (masterCardNo) → formula info
    type FormulaInfo = { mfcNo: string; productName: string; genericName: string; shelfLife: string; productCodes: string[] };
    const mfcInfoMap = new Map<string, FormulaInfo>();
    // productCode → mfcKey  (many-to-one: all codes for a formula point back to it)
    const codeToMfc = new Map<string, string>();

    for (const f of formulas) {
      const productName = f.masterFormulaDetails?.productName || '';
      const genericName = f.masterFormulaDetails?.genericName || '';
      const mfcNo       = f.masterFormulaDetails?.masterCardNo || '';
      const mainCode    = f.masterFormulaDetails?.productCode || '';

      if (!mfcNo || !mainCode) continue;

      const mfcKey = mfcNo;

      // Collect all product codes for this formula (same logic as formula route)
      const codes = new Set<string>();
      codes.add(mainCode);
      if (f.fillingDetails && Array.isArray(f.fillingDetails)) {
        for (const fd of f.fillingDetails) {
          if (fd.productCode && fd.productCode !== 'N/A') codes.add(fd.productCode);
        }
      }
      if (f.processes && Array.isArray(f.processes)) {
        for (const p of f.processes) {
          if (p.fillingProducts && Array.isArray(p.fillingProducts)) {
            for (const fp of p.fillingProducts) {
              if (fp.productCode) codes.add(fp.productCode);
            }
          }
        }
      }

      mfcInfoMap.set(mfcKey, {
        mfcNo,
        productName: productName || 'Unknown',
        genericName,
        shelfLife: f.masterFormulaDetails?.shelfLife || '',
        productCodes: Array.from(codes),
      });
      for (const code of codes) codeToMfc.set(code, mfcKey);
    }

    const allProductCodes = Array.from(codeToMfc.keys());

    // 2. Fetch all Batch documents for all product codes
    const batchDocs = await Batch.find(
      { 'batches.itemCode': { $in: allProductCodes } },
      {
        'batches.itemCode': 1,
        'batches.batchNumber': 1,
        'batches.mfgDate': 1,
        'batches.expiryDate': 1,
        'batches.itemName': 1,
        'batches.itemDetail': 1, // Brand/Generic name (Batch Creation data)
      }
    ).lean();

    // Batch numbers to exclude (test/dummy batches)
    const EXCLUDED_BATCH_NUMBERS = new Set<string>();

    // Build mfcKey → [{batchNumber, itemCode, mfgDate, expiryDate}]  (deduplicated by batchNumber+itemCode)
    const mfcToBatches = new Map<
      string,
      Array<{ batchNumber: string; itemCode: string; mfgDate: string; expiryDate: string; brandName?: string }>
    >();
    for (const doc of batchDocs) {
      for (const b of doc.batches || []) {
        const mfcKey = codeToMfc.get(b.itemCode);
        if (!mfcKey) continue;
        const batchNumber = (b.batchNumber || '').trim();
        if (!batchNumber) continue;
        if (EXCLUDED_BATCH_NUMBERS.has(batchNumber)) continue;
        if (!mfcToBatches.has(mfcKey)) mfcToBatches.set(mfcKey, []);
        const existing = mfcToBatches.get(mfcKey)!;
        if (!existing.some((x) => x.batchNumber === batchNumber && x.itemCode === b.itemCode)) {
          const rawBrand = typeof b.itemDetail === 'string' ? b.itemDetail.trim() : '';
          const brandName = rawBrand && rawBrand !== 'N/A' ? rawBrand : undefined;
          existing.push({
            batchNumber,
            itemCode: b.itemCode || '',
            mfgDate: b.mfgDate || '',
            expiryDate: b.expiryDate || '',
            brandName,
          });
        }
      }
    }

    // Collect all batch numbers for COA + RetainedSample lookups
    const allBatchNumbers: string[] = [];
    for (const batches of mfcToBatches.values()) {
      for (const b of batches) allBatchNumbers.push(b.batchNumber);
    }

    // 3. Fetch COA FINISH records for those batches (for 0-month pH)
    const coaMap = new Map<string, { phParams: PhParam[]; description: string }>();
    if (allBatchNumbers.length) {
      const coas = await COA.find(
        { batchNumber: { $in: allBatchNumbers }, stage: 'FINISH' },
        {
          batchNumber: 1,
          'finishData.description': 1,
          'finishData.criticalParameters': 1,
          'finishData.identificationTests': 1,
        }
      ).lean();

      for (const coa of coas) {
        const params: Array<{ name: string; result?: string; limit?: string }> =
          coa.finishData?.criticalParameters || [];

        // Collect ALL pH-related parameters
        const phRaw = params.filter(
          (p) => /^ph(\s|$)/i.test(p.name.trim()) || /^ph$/i.test(p.name.trim())
        );

        // Extract a short label from the parameter name (the part after "PH")
        const usedLabels = new Map<string, number>(); // track duplicates
        const phParams: PhParam[] = phRaw.map((p) => {
          const suffix = p.name.trim().replace(/^ph\s*/i, '').trim();
          let label = suffix;
          // If multiple params share the same label, append a disambiguator
          const count = usedLabels.get(label) ?? 0;
          if (count > 0) label = label ? `${label} ${count + 1}` : `${count + 1}`;
          usedLabels.set(suffix, count + 1);
          return { label, result: p.result || '', limit: p.limit || '' };
        });

        // Try top-level description field first, then search criticalParameters and identificationTests
        const allParams: Array<{ name: string; result?: string }> = [
          ...params,
          ...(coa.finishData?.identificationTests || []),
        ];
        const descParam = allParams.find((p) => /^description$/i.test((p.name || '').trim()));
        const description =
          coa.finishData?.description ||
          descParam?.result ||
          '';

        coaMap.set(coa.batchNumber, { phParams, description });
      }
    }

    // 4. Fetch all RetainedSample records
    const retainedDocs = await RetainedSample.find({}).lean();
    // Primary key: mfcNo|batchNumber|itemCode  (new, per-item records)
    // Legacy key:  mfcNo|batchNumber            (old records saved before itemCode was added)
    // When looking up stability entries for a batch row we try the primary key first
    // and fall back to the legacy key so existing data continues to display correctly.
    const stabilityMap = new Map<string, StabilityEntry[]>();
    for (const r of retainedDocs) {
      const mapped = r.stabilityEntries.map((e: { month: number; pH: string; phValues?: PhValue[]; description: string; recordedAt?: Date; createdAt?: Date; createdBy?: EntryActor; updatedBy?: EntryActor; editHistory?: Array<{ pH: string; phValues?: PhValue[]; description: string; recordedAt?: Date; savedBy?: EntryActor }> }) => ({
        month: e.month as 6 | 12 | 18 | 24 | 30 | 36,
        pH: e.pH,
        phValues: e.phValues || [],
        description: e.description,
        recordedAt: e.recordedAt ? String(e.recordedAt) : undefined,
        createdAt: e.createdAt ? String(e.createdAt) : undefined,
        createdBy: e.createdBy,
        updatedBy: e.updatedBy,
        editHistory: (e.editHistory || []).map((h) => ({
          pH: h.pH || '',
          phValues: h.phValues || [],
          description: h.description || '',
          recordedAt: h.recordedAt ? String(h.recordedAt) : '',
          savedBy: h.savedBy,
        })),
      }));

      const itemCode: string = (r as { itemCode?: string }).itemCode || '';
      if (itemCode) {
        // Per-item record (new format): keyed by mfcNo|batchNumber|itemCode
        stabilityMap.set(`${r.mfcNo}|${r.batchNumber}|${itemCode}`, mapped);
      } else {
        // Legacy record without itemCode: also store under the old key
        stabilityMap.set(`${r.mfcNo}|${r.batchNumber}`, mapped);
      }
    }

    // 5. Build MFCGroup for every formula, split into 3+ and <3 batches
    const moreThan3: MFCGroup[] = [];
    const lessThan3: MFCGroup[] = [];

    // MFC card numbers to exclude (test/dummy formulas)
    const EXCLUDED_MFC_NOS = new Set(['MFBATC01']);

    for (const [mfcKey, info] of mfcInfoMap.entries()) {
      if (EXCLUDED_MFC_NOS.has(info.mfcNo)) continue; // skip test MFCs
      const rawBatches = mfcToBatches.get(mfcKey) || [];
      if (rawBatches.length === 0) continue; // skip MFCs with no batches

      // Sort batches by mfgDate ascending, then batchNumber, then itemCode
      rawBatches.sort((a, b) => {
        if (a.mfgDate && b.mfgDate) {
          const cmp = a.mfgDate.localeCompare(b.mfgDate);
          if (cmp !== 0) return cmp;
        }
        const cmp2 = a.batchNumber.localeCompare(b.batchNumber);
        if (cmp2 !== 0) return cmp2;
        return a.itemCode.localeCompare(b.itemCode);
      });

      const batchRows: BatchStabilityRow[] = rawBatches.map((b) => {
        const coa = coaMap.get(b.batchNumber);
        const phParams = coa?.phParams || [];
        // Try per-item key first; fall back to legacy key for old records
        const stabilityEntries =
          stabilityMap.get(`${info.mfcNo}|${b.batchNumber}|${b.itemCode}`) ??
          stabilityMap.get(`${info.mfcNo}|${b.batchNumber}`) ??
          [];
        return {
          batchNumber: b.batchNumber,
          itemCode: b.itemCode,
          mfgDate: b.mfgDate,
          expiryDate: b.expiryDate,
          brandName: b.brandName,
          coaFound: !!coa,
          phParams,
          zeroMonthPH: phParams[0]?.result || '',   // backward compat
          zeroMonthDescription: coa?.description || '',
          stabilityEntries,
        };
      });

      const group: MFCGroup = {
        mfcNo: info.mfcNo,
        productCode: info.productCodes[0],
        productName: info.productName,
        genericName: info.genericName,
        shelfLife: info.shelfLife,
        batches: batchRows,
      };

      if (batchRows.length >= 3) moreThan3.push(group);
      else lessThan3.push(group);
    }

    // 6. Build MFCGroups for "orphan" MFCs — have RetainedSample data but are no
    //    longer present in the Formula collection (e.g. formula revised from .08 → .09).
    //    These must still appear as separate, independent entries.
    const handledMfcNos = new Set([...moreThan3, ...lessThan3].map((g) => g.mfcNo));

    // Fast lookup: batchNumber+itemCode (or batchNumber alone) → batch dates
    const batchInfoMap = new Map<string, { mfgDate: string; expiryDate: string; brandName?: string }>();
    for (const doc of batchDocs) {
      for (const b of doc.batches || []) {
        const bn = (b.batchNumber || '').trim();
        if (!bn) continue;
        const rawBrand = typeof b.itemDetail === 'string' ? b.itemDetail.trim() : '';
        const entry = {
          mfgDate: b.mfgDate || '',
          expiryDate: b.expiryDate || '',
          brandName: rawBrand && rawBrand !== 'N/A' ? rawBrand : undefined,
        };
        const keyFull = `${bn}|${b.itemCode || ''}`;
        if (!batchInfoMap.has(keyFull)) batchInfoMap.set(keyFull, entry);
        if (!batchInfoMap.has(bn))      batchInfoMap.set(bn, entry);
      }
    }

    // Group orphan retained docs by mfcNo
    type OrphanDoc = { mfcNo: string; productCode: string; productName: string; batchNumber: string; itemCode: string };
    const orphanByMfc = new Map<string, OrphanDoc[]>();
    for (const r of retainedDocs) {
      if (handledMfcNos.has(r.mfcNo)) continue;
      if (!orphanByMfc.has(r.mfcNo)) orphanByMfc.set(r.mfcNo, []);
      orphanByMfc.get(r.mfcNo)!.push({
        mfcNo: r.mfcNo,
        productCode: r.productCode,
        productName: r.productName,
        batchNumber: r.batchNumber,
        itemCode: (r as { itemCode?: string }).itemCode || '',
      });
    }

    for (const [mfcNo, docs] of orphanByMfc.entries()) {
      // Sort orphan batches the same way (mfgDate → batchNumber → itemCode)
      docs.sort((a, b) => {
        const ai = batchInfoMap.get(`${a.batchNumber}|${a.itemCode}`) ?? batchInfoMap.get(a.batchNumber);
        const bi = batchInfoMap.get(`${b.batchNumber}|${b.itemCode}`) ?? batchInfoMap.get(b.batchNumber);
        const dateCmp = (ai?.mfgDate || '').localeCompare(bi?.mfgDate || '');
        if (dateCmp !== 0) return dateCmp;
        const bnCmp = a.batchNumber.localeCompare(b.batchNumber);
        if (bnCmp !== 0) return bnCmp;
        return a.itemCode.localeCompare(b.itemCode);
      });

      const batchRows: BatchStabilityRow[] = docs.map((doc) => {
        const coa       = coaMap.get(doc.batchNumber);
        const phParams  = coa?.phParams || [];
        const stabilityEntries =
          stabilityMap.get(`${doc.mfcNo}|${doc.batchNumber}|${doc.itemCode}`) ??
          stabilityMap.get(`${doc.mfcNo}|${doc.batchNumber}`) ??
          [];
        const bInfo =
          batchInfoMap.get(`${doc.batchNumber}|${doc.itemCode}`) ??
          batchInfoMap.get(doc.batchNumber);
        return {
          batchNumber: doc.batchNumber,
          itemCode:    doc.itemCode,
          mfgDate:     bInfo?.mfgDate    || '',
          expiryDate:  bInfo?.expiryDate || '',
          brandName:   bInfo?.brandName,
          coaFound:    !!coa,
          phParams,
          zeroMonthPH:          phParams[0]?.result || '',
          zeroMonthDescription: coa?.description   || '',
          stabilityEntries,
        };
      });

      const firstDoc = docs[0];
      const group: MFCGroup = {
        mfcNo,
        productCode: firstDoc.productCode,
        productName: firstDoc.productName,
        genericName: '',
        shelfLife:   '',
        batches:     batchRows,
      };

      if (batchRows.length >= 3) moreThan3.push(group);
      else lessThan3.push(group);
    }

    // Sort each section by MFC number alphabetically (covers both formula and orphan groups)
    const sortFn = (a: MFCGroup, b: MFCGroup) => a.mfcNo.localeCompare(b.mfcNo);
    moreThan3.sort(sortFn);
    lessThan3.sort(sortFn);

    return NextResponse.json({ success: true, data: { moreThan3, lessThan3 } });
  } catch (error) {
    console.error('GET /api/retained-sample error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch retained sample data' },
      { status: 500 }
    );
  }
}

// ─── POST ─────────────────────────────────────────────────────────────────────

export async function POST(
  request: NextRequest
): Promise<NextResponse<SaveStabilityResponse>> {
  try {
    await connectToDatabase();

    const body: SaveStabilityRequest = await request.json();
    const { mfcNo, productCode, productName, batchNumber, itemCode, month, pH, phValues, description } = body;

    if (!mfcNo || !productCode || !batchNumber || !month) {
      return NextResponse.json(
        { success: false, error: 'mfcNo, productCode, batchNumber, and month are required' },
        { status: 400 }
      );
    }

    const now = new Date();
    const authUser = await getAuthUser();
    const actor: EntryActor | undefined = authUser
      ? { name: authUser.name, username: authUser.username }
      : undefined;

    const entryData = {
      month,
      pH: pH || '',
      phValues: phValues || [],
      description,
      recordedAt: now,
    };

    let recordedAtStr = now.toISOString();
    let createdAtStr = now.toISOString();

    // Look up by itemCode when provided (new records), fall back to legacy records
    // that were saved before itemCode was introduced.
    const query = itemCode
      ? { batchNumber, mfcNo, itemCode }
      : { batchNumber, mfcNo, $or: [{ itemCode: '' }, { itemCode: { $exists: false } }] };
    const existing = await RetainedSample.findOne(query);

    if (existing) {
      const idx = existing.stabilityEntries.findIndex(
        (e: { month: number }) => e.month === month
      );
      if (idx >= 0) {
        const old = existing.stabilityEntries[idx];
        // Preserve original createdAt
        const originalCreatedAt: Date = old.createdAt || old.recordedAt || now;
        createdAtStr = originalCreatedAt instanceof Date
          ? originalCreatedAt.toISOString()
          : String(originalCreatedAt);
        // Push old values (with who saved them) to edit history before overwriting
        if (!existing.stabilityEntries[idx].editHistory) {
          existing.stabilityEntries[idx].editHistory = [];
        }
        existing.stabilityEntries[idx].editHistory.push({
          pH: old.pH || '',
          phValues: old.phValues || [],
          description: old.description || '',
          recordedAt: old.recordedAt || now,
          savedBy: old.updatedBy || old.createdBy,
        });
        existing.stabilityEntries[idx].pH = entryData.pH;
        existing.stabilityEntries[idx].phValues = entryData.phValues;
        existing.stabilityEntries[idx].description = entryData.description;
        existing.stabilityEntries[idx].recordedAt = entryData.recordedAt;
        existing.stabilityEntries[idx].updatedBy = actor;
        // createdAt and createdBy stay unchanged — do not overwrite
      } else {
        existing.stabilityEntries.push({ ...entryData, createdAt: now, createdBy: actor, editHistory: [] });
      }
      await existing.save();
    } else {
      await RetainedSample.create({
        mfcNo,
        productCode,
        productName,
        batchNumber,
        itemCode: itemCode || '',
        stabilityEntries: [{ ...entryData, createdAt: now, createdBy: actor, editHistory: [] }],
      });
    }

    return NextResponse.json({ success: true, message: 'Stability entry saved', recordedAt: recordedAtStr, createdAt: createdAtStr });
  } catch (error) {
    console.error('POST /api/retained-sample error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to save stability entry' },
      { status: 500 }
    );
  }
}
