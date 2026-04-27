import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Requisition from '@/models/Requisition';
import RMCOA from '@/models/RMCOA';
import Batch from '@/models/Batch';

function normalizeBatchNo(b: string | null | undefined): string {
  return (b || '').trim().toUpperCase();
}

function normalizeCode(c: string | null | undefined): string {
  return (c || '').trim().toUpperCase();
}

function normalizeAr(ar: string | null | undefined): string {
  return (ar || '')
    .toString()
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, '')
    .trim()
    .toUpperCase();
}

function baseAr(ar: string): string {
  const s = normalizeAr(ar);
  return s.split('.')[0] || s;
}

function isRmCoaCandidateAr(arNo: string): boolean {
  return arNo.length > 0 && !arNo.includes('PRM');
}

function splitArTokens(raw: unknown): string[] {
  const s = (raw ?? '').toString();
  if (!s) return [];
  return s
    .split(/[,\\n\\r]+/)
    .map(t => normalizeAr(t))
    .filter(Boolean);
}

function arMatches(lineArRaw: string | undefined, coaArNorm: string): boolean {
  const lineArs = splitArTokens(lineArRaw);
  if (lineArs.length === 0 || !coaArNorm) return false;
  const coaAr = normalizeAr(coaArNorm);
  if (!coaAr) return false;
  const coaBase = baseAr(coaAr);
  for (const lineAr of lineArs) {
    if (!isRmCoaCandidateAr(lineAr)) continue;
    if (lineAr === coaAr) return true;
    if (baseAr(lineAr) === coaBase) return true;
  }
  return false;
}

function yearFromMfgDate(mfgDate: string | null | undefined): string | null {
  const parts = (mfgDate || '').split('-');
  if (parts.length !== 3) return null;
  const yy = parseInt(parts[2], 10);
  if (Number.isNaN(yy)) return null;
  return (yy < 50 ? 2000 + yy : 1900 + yy).toString();
}

function effectiveBatchYear(batch: { year?: string; mfgDate?: string }): string | null {
  const raw = (batch.year ?? '').toString().trim();
  if (/^\d{4}$/.test(raw)) return raw;
  if (/^\d{2}$/.test(raw)) {
    const n = parseInt(raw, 10);
    if (!Number.isNaN(n)) return (n < 50 ? 2000 + n : 1900 + n).toString();
  }
  return yearFromMfgDate(batch.mfgDate);
}

export type DrillMode =
  | 'total_batches'
  | 'requisition_found'
  | 'requisition_missing'
  | 'rm_coa_found'
  | 'rm_coa_missing';

export interface VerificationTableRow {
  id: string;
  matReqNo: string;
  materialName: string;
  materialCode: string;
  arNo?: string;
  batchNumber: string;
  batchStatus: string;
  coaStatus: string;
  coaMessage: string;
}

export interface RmCoaVerificationResponse {
  success: boolean;
  message?: string;
  year: string | null;
  drill: DrillMode | null;
  availableYears: string[];
  summary: {
    totalBatchesCreation: number;
    requisitionBatchesFound: number;
    requisitionBatchesMissing: number;
    rmCoaFoundBatches: number;
    rmCoaMissingBatches: number;
  };
  rows: VerificationTableRow[];
}

function collectYearsFromRequisitions(
  requisitions: { batches?: { year?: string; mfgDate?: string }[] }[]
): Set<string> {
  const years = new Set<string>();
  for (const rec of requisitions) {
    for (const batch of rec.batches || []) {
      const y = effectiveBatchYear(batch);
      if (y) years.add(y);
    }
  }
  return years;
}

function collectYearsFromBatchRegistry(
  batchDocs: { batches?: { year?: string; mfgDate?: string }[] }[]
): Set<string> {
  const years = new Set<string>();
  for (const doc of batchDocs) {
    for (const b of doc.batches || []) {
      const y = effectiveBatchYear(b);
      if (y) years.add(y);
    }
  }
  return years;
}

const DRILL_MODES: DrillMode[] = [
  'total_batches',
  'requisition_found',
  'requisition_missing',
  'rm_coa_found',
  'rm_coa_missing',
];

function parseDrill(raw: string | null): DrillMode | null {
  if (!raw) return null;
  const t = raw.trim() as DrillMode;
  return DRILL_MODES.includes(t) ? t : null;
}

function shouldScopeAllYears(scopeRaw: string | null): boolean {
  return (scopeRaw || '').trim().toLowerCase() === 'all';
}

type ReqLine = {
  id: string;
  matReqNo: string;
  materialName: string;
  materialCode: string;
  batchNorm: string;
  arNo: string;
};

function buildCoaBatchSet(
  coaDocs: { batchNumber?: string; lotNumber?: string; arNo?: string; materialCode?: string }[],
  reqLines: ReqLine[],
  reqBatchSet: Set<string>
): Set<string> {
  const coaBatchSet = new Set<string>();
  for (const c of coaDocs) {
    const doc = c as { batchNumber?: string; lotNumber?: string; arNo?: string; materialCode?: string };
    const batchTok = normalizeBatchNo(doc.batchNumber);
    const lotTok = normalizeBatchNo(doc.lotNumber);
    let matched = false;
    for (const token of [batchTok, lotTok]) {
      if (token && reqBatchSet.has(token)) {
        coaBatchSet.add(token);
        matched = true;
      }
    }
    if (matched) continue;

    const coaAr = normalizeAr(doc.arNo);
    const coaCode = normalizeCode(doc.materialCode);
    if (!coaAr || !coaCode || coaAr === 'UNKNOWN' || coaCode === 'UNKNOWN') continue;
    if (!isRmCoaCandidateAr(coaAr)) continue;

    for (const line of reqLines) {
      if (normalizeCode(line.materialCode) !== coaCode) continue;
      if (!arMatches(line.arNo, coaAr)) continue;
      coaBatchSet.add(line.batchNorm);
    }
  }
  return coaBatchSet;
}

function buildDrillRows(
  drill: DrillMode,
  creationBatchSet: Set<string>,
  creationBatchMeta: Map<string, { itemName: string; itemCode: string }>,
  creationBatchNormByRaw: Map<string, string>,
  reqBatchSet: Set<string>,
  intersection: Set<string>,
  reqLines: ReqLine[],
  coaBatchSet: Set<string>
): VerificationTableRow[] {
  const rows: VerificationTableRow[] = [];
  const firstReqLineByBatch = new Map<string, ReqLine>();
  for (const line of reqLines) {
    if (!firstReqLineByBatch.has(line.batchNorm)) firstReqLineByBatch.set(line.batchNorm, line);
  }

  const linesForBatch = (bn: string) => reqLines.filter(l => l.batchNorm === bn);

  const coaMsgMissing = 'This batch COA was not found.';

  if (drill === 'total_batches') {
    for (const bn of [...creationBatchSet].sort()) {
      const meta = creationBatchMeta.get(bn) || { itemName: '-', itemCode: '-' };
      const bnNorm = creationBatchNormByRaw.get(bn) || normalizeBatchNo(bn);
      const inReq = intersection.has(bn);
      const first = firstReqLineByBatch.get(bnNorm);
      rows.push({
        id: `total|${bn}`,
        matReqNo: first?.matReqNo || '-',
        materialName: first?.materialName || meta.itemName,
        materialCode: first?.materialCode || meta.itemCode,
        batchNumber: bn,
        batchStatus: inReq ? 'Requisition Found' : 'Requisition Missing',
        coaStatus: inReq ? (coaBatchSet.has(bnNorm) ? 'COA Found' : 'COA Missing') : '-',
        coaMessage: inReq && !coaBatchSet.has(bnNorm) ? coaMsgMissing : '',
      });
    }
    return rows;
  }

  if (drill === 'requisition_found') {
    for (const bn of [...intersection].sort()) {
      const bnNorm = creationBatchNormByRaw.get(bn) || normalizeBatchNo(bn);
      for (const line of linesForBatch(bnNorm)) {
        rows.push({
          id: `reqf|${line.id}`,
          matReqNo: line.matReqNo,
          materialName: line.materialName,
          materialCode: line.materialCode,
          arNo: line.arNo,
          batchNumber: bn,
          batchStatus: 'Requisition Found',
          coaStatus: coaBatchSet.has(bnNorm) ? 'COA Found' : 'COA Missing',
          coaMessage: coaBatchSet.has(bnNorm) ? '' : coaMsgMissing,
        });
      }
    }
    return rows;
  }

  if (drill === 'requisition_missing') {
    for (const bn of [...creationBatchSet].sort()) {
      if (intersection.has(bn)) continue;
      const meta = creationBatchMeta.get(bn) || { itemName: '-', itemCode: '-' };
      rows.push({
        id: `reqm|${bn}`,
        matReqNo: '-',
        materialName: meta.itemName,
        materialCode: meta.itemCode,
        batchNumber: bn,
        batchStatus: 'Requisition Missing',
        coaStatus: '-',
        coaMessage: '',
      });
    }
    return rows;
  }

  if (drill === 'rm_coa_found') {
    for (const bn of [...intersection].sort()) {
      const bnNorm = creationBatchNormByRaw.get(bn) || normalizeBatchNo(bn);
      if (!coaBatchSet.has(bnNorm)) continue;
      for (const line of linesForBatch(bnNorm)) {
        rows.push({
          id: `coaf|${line.id}`,
          matReqNo: line.matReqNo,
          materialName: line.materialName,
          materialCode: line.materialCode,
          arNo: line.arNo,
          batchNumber: bn,
          batchStatus: 'Requisition Found',
          coaStatus: 'COA Found',
          coaMessage: '',
        });
      }
    }
    return rows;
  }

  if (drill === 'rm_coa_missing') {
    for (const bn of [...intersection].sort()) {
      const bnNorm = creationBatchNormByRaw.get(bn) || normalizeBatchNo(bn);
      if (coaBatchSet.has(bnNorm)) continue;
      for (const line of linesForBatch(bnNorm)) {
        rows.push({
          id: `coam|${line.id}`,
          matReqNo: line.matReqNo,
          materialName: line.materialName,
          materialCode: line.materialCode,
          arNo: line.arNo,
          batchNumber: bn,
          batchStatus: 'Requisition Found',
          coaStatus: 'COA Missing',
          coaMessage: coaMsgMissing,
        });
      }
    }
    return rows;
  }

  return rows;
}

const ZERO_SUMMARY = {
  totalBatchesCreation: 0,
  requisitionBatchesFound: 0,
  requisitionBatchesMissing: 0,
  rmCoaFoundBatches: 0,
  rmCoaMissingBatches: 0,
};

export async function GET(request: NextRequest): Promise<NextResponse<RmCoaVerificationResponse>> {
  try {
    await connectToDatabase();
    const { searchParams } = new URL(request.url);
    const yearParam = (searchParams.get('year') || '').trim();
    const drill = parseDrill(searchParams.get('drill'));
    const scopeAllYears = shouldScopeAllYears(searchParams.get('scope'));
    const isAllYearsRequest = !yearParam && scopeAllYears;

    const [requisitions, batchDocs] = await Promise.all([
      Requisition.find({}).select('batches').lean().exec(),
      Batch.find({}).select('batches').lean().exec(),
    ]);

    const yearSet = new Set<string>();
    collectYearsFromRequisitions(requisitions as { batches?: { year?: string; mfgDate?: string }[] }[]).forEach(y =>
      yearSet.add(y)
    );
    collectYearsFromBatchRegistry(batchDocs as { batches?: { year?: string; mfgDate?: string }[] }[]).forEach(y =>
      yearSet.add(y)
    );
    const availableYears = Array.from(yearSet).sort((a, b) => Number(b) - Number(a));

    if (!yearParam && !isAllYearsRequest) {
      return NextResponse.json({
        success: true,
        year: null,
        drill: null,
        availableYears,
        summary: { ...ZERO_SUMMARY },
        rows: [],
      });
    }

    // Keep raw batchNumber for counts (match Formula Data unique batches),
    // and a normalized token for cross-system matching (requisition/COA).
    const creationBatchSet = new Set<string>();
    const creationBatchNormByRaw = new Map<string, string>();
    const creationBatchMeta = new Map<string, { itemName: string; itemCode: string }>();

    for (const doc of batchDocs) {
      for (const b of doc.batches || []) {
        const y = effectiveBatchYear(b as { year?: string; mfgDate?: string });
        if (!isAllYearsRequest && y !== yearParam) continue;
        const bn = ((b as { batchNumber?: string }).batchNumber || '').toString();
        if (!bn) continue;
        creationBatchSet.add(bn);
        if (!creationBatchNormByRaw.has(bn)) {
          creationBatchNormByRaw.set(bn, normalizeBatchNo(bn));
        }
        if (!creationBatchMeta.has(bn)) {
          creationBatchMeta.set(bn, {
            itemName: ((b as { itemName?: string }).itemName || '').trim() || '-',
            itemCode: ((b as { itemCode?: string }).itemCode || '').trim() || '-',
          });
        }
      }
    }

    const reqLines: ReqLine[] = [];
    const reqBatchSet = new Set<string>();

    for (const rec of requisitions) {
      const rid = (rec as { _id?: { toString(): string } })._id?.toString?.() ?? '';
      for (const batch of rec.batches || []) {
        const batchYear = effectiveBatchYear(batch as { year?: string; mfgDate?: string });
        if (!isAllYearsRequest && batchYear !== yearParam) continue;
        const batchNumber = (batch as { batchNumber?: string }).batchNumber || '';
        const batchNorm = normalizeBatchNo(batchNumber);
        if (!batchNorm) continue;

        const headerMatReqNo =
          (batch as { matReqNo?: string }).matReqNo ||
          (batch as { materials?: { matReqNo?: string }[] }).materials?.[0]?.matReqNo ||
          '';

        for (const m of (batch as { materials?: Record<string, unknown>[] }).materials || []) {
          const material = m as {
            materialType?: string;
            matReqDtlId?: string;
            matReqNo?: string;
            materialName?: string;
            materialCode?: string;
            arNo?: string;
          };
          if (material.materialType !== 'RM') continue;

          const materialName = (material.materialName || '').trim() || '-';
          const materialCode = (material.materialCode || '').trim() || '-';
          const lineMatReqNo = (material.matReqNo || headerMatReqNo || '').trim() || '-';
          const arNoRaw = (material.arNo || '').trim();
          const arTokens = splitArTokens(arNoRaw);

          reqBatchSet.add(batchNorm);
          // Keep ALL AR occurrences (do not dedupe). If a single requisition line
          // has multiple AR tokens, create one ReqLine per token.
          if (arTokens.length === 0) {
            reqLines.push({
              id: [rid, material.matReqDtlId || '', batchNorm, materialCode].join('|'),
              matReqNo: lineMatReqNo,
              materialName,
              materialCode,
              batchNorm,
              arNo: arNoRaw,
            });
          } else {
            arTokens.forEach((tok, idx) => {
              reqLines.push({
                id: [rid, material.matReqDtlId || '', batchNorm, materialCode, idx].join('|'),
                matReqNo: lineMatReqNo,
                materialName,
                materialCode,
                batchNorm,
                arNo: tok,
              });
            });
          }
        }
      }
    }

    const intersection = new Set<string>();
    for (const bRaw of creationBatchSet) {
      const bNorm = creationBatchNormByRaw.get(bRaw) || normalizeBatchNo(bRaw);
      if (reqBatchSet.has(bNorm)) intersection.add(bRaw);
    }

    const coaDocs = await RMCOA.find({})
      .select('batchNumber lotNumber arNo materialCode')
      .lean()
      .exec();

    const coaBatchSet = buildCoaBatchSet(
      coaDocs as { batchNumber?: string; lotNumber?: string; arNo?: string; materialCode?: string }[],
      reqLines,
      reqBatchSet
    );

    const totalBatchesCreation = creationBatchSet.size;
    const requisitionBatchesFound = intersection.size;
    const requisitionBatchesMissing = totalBatchesCreation - requisitionBatchesFound;

    let rmCoaFoundBatches = 0;
    for (const bRaw of intersection) {
      const bNorm = creationBatchNormByRaw.get(bRaw) || normalizeBatchNo(bRaw);
      if (coaBatchSet.has(bNorm)) rmCoaFoundBatches++;
    }
    const rmCoaMissingBatches = requisitionBatchesFound - rmCoaFoundBatches;

    const rows =
      drill !== null
        ? buildDrillRows(
            drill,
            creationBatchSet,
            creationBatchMeta,
            creationBatchNormByRaw,
            reqBatchSet,
            intersection,
            reqLines,
            coaBatchSet
          )
        : [];

    return NextResponse.json({
      success: true,
      year: isAllYearsRequest ? null : yearParam,
      drill,
      availableYears,
      summary: {
        totalBatchesCreation,
        requisitionBatchesFound,
        requisitionBatchesMissing,
        rmCoaFoundBatches,
        rmCoaMissingBatches,
      },
      rows,
    });
  } catch (error) {
    console.error('[rm-coa-verification]', error);
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
        year: null,
        drill: null,
        availableYears: [],
        summary: { ...ZERO_SUMMARY },
        rows: [],
      },
      { status: 500 }
    );
  }
}
