import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Requisition from '@/models/Requisition';
import Batch from '@/models/Batch';
import InwardRegister from '@/models/InwardRegister';

function normalizeBatchNo(b: string | null | undefined): string {
  return (b || '').trim().toUpperCase();
}

function normalizeAr(ar: string | null | undefined): string {
  return (ar || '').trim().toUpperCase();
}

function baseAr(ar: string): string {
  return ar.split('.')[0] || ar;
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
  | 'ppm_coa_found'
  | 'ppm_coa_missing';

export interface VerificationTableRow {
  id: string;
  matReqNo: string;
  materialName: string;
  materialCode: string;
  arNo?: string;
  batchNumber: string;
  requisitionStatus: 'Requisition Found' | 'Requisition Missing';
  ppmCoaStatus: 'PPM COA Found' | 'PPM COA Missing' | '-';
}

export interface PpmVerificationResponse {
  success: boolean;
  message?: string;
  year: string | null;
  drill: DrillMode | null;
  availableYears: string[];
  summary: {
    totalBatchesCreation: number;
    requisitionFoundBatches: number;
    requisitionMissingBatches: number;
    ppmCoaFoundBatches: number;
    ppmCoaMissingBatches: number;
  };
  rows: VerificationTableRow[];
}

const DRILL_MODES: DrillMode[] = [
  'total_batches',
  'requisition_found',
  'requisition_missing',
  'ppm_coa_found',
  'ppm_coa_missing',
];
function parseDrill(raw: string | null): DrillMode | null {
  if (!raw) return null;
  const t = raw.trim() as DrillMode;
  return DRILL_MODES.includes(t) ? t : null;
}

function shouldScopeAllYears(scopeRaw: string | null): boolean {
  return (scopeRaw || '').trim().toLowerCase() === 'all';
}

type PpmLine = {
  id: string;
  matReqNo: string;
  materialName: string;
  materialCode: string;
  arNo: string;
  batchNorm: string;
};

const ZERO_SUMMARY = {
  totalBatchesCreation: 0,
  requisitionFoundBatches: 0,
  requisitionMissingBatches: 0,
  ppmCoaFoundBatches: 0,
  ppmCoaMissingBatches: 0,
};

export async function GET(request: NextRequest): Promise<NextResponse<PpmVerificationResponse>> {
  try {
    await connectToDatabase();
    const { searchParams } = new URL(request.url);
    const yearParam = (searchParams.get('year') || '').trim();
    const drill = parseDrill(searchParams.get('drill')) || 'total_batches';
    const scopeAllYears = shouldScopeAllYears(searchParams.get('scope'));
    const isAllYearsRequest = !yearParam && scopeAllYears;

    const [requisitions, batchDocs, inwardArNumbers] = await Promise.all([
      Requisition.find({}).select('batches').lean().exec(),
      Batch.find({}).select('batches').lean().exec(),
      InwardRegister.distinct('arNumber'),
    ]);

    // Available years (union from both sources)
    const yearSet = new Set<string>();
    for (const rec of requisitions as any[]) {
      for (const b of rec.batches || []) {
        const y = effectiveBatchYear(b);
        if (y) yearSet.add(y);
      }
    }
    for (const doc of batchDocs as any[]) {
      for (const b of doc.batches || []) {
        const y = effectiveBatchYear(b);
        if (y) yearSet.add(y);
      }
    }
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

    // Batch Creation records (do NOT dedupe by batch number)
    type CreationRecord = {
      recordId: string;
      batchNumberRaw: string;
      batchNorm: string;
      itemName: string;
      itemCode: string;
    };
    const creationRecords: CreationRecord[] = [];

    for (const doc of batchDocs as any[]) {
      const docId = doc?._id?.toString?.() ?? '';
      const batches = Array.isArray(doc?.batches) ? doc.batches : [];
      for (let i = 0; i < batches.length; i++) {
        const b = batches[i];
        const y = effectiveBatchYear(b);
        if (!isAllYearsRequest && y !== yearParam) continue;
        const bnRaw = (b?.batchNumber || '').toString();
        if (!bnRaw) continue;
        const bnNorm = normalizeBatchNo(bnRaw);
        if (!bnNorm) continue;
        const recordId = [docId || 'batchdoc', b?.srNo ?? i, b?.itemCode ?? '', bnRaw].join('|');
        creationRecords.push({
          recordId,
          batchNumberRaw: bnRaw,
          batchNorm: bnNorm,
          itemName: (b?.itemName || '').toString().trim() || '-',
          itemCode: (b?.itemCode || '').toString().trim() || '-',
        });
      }
    }

    const ppmLines: PpmLine[] = [];
    const ppmBatchSet = new Set<string>(); // normalized
    const arByBatchNorm = new Map<string, Set<string>>(); // includes base variants for inward matching
    const allArsByBatchNorm = new Map<string, Set<string>>(); // original AR numbers only (for display)

    for (const rec of requisitions as any[]) {
      const rid = rec._id?.toString?.() ?? '';
      for (const batch of rec.batches || []) {
        const batchYear = effectiveBatchYear(batch);
        if (!isAllYearsRequest && batchYear !== yearParam) continue;
        const batchNorm = normalizeBatchNo(batch.batchNumber);
        if (!batchNorm) continue;

        const headerMatReqNo = (batch.matReqNo || batch.materials?.[0]?.matReqNo || '').toString();

        for (const m of batch.materials || []) {
          if (m.materialType !== 'PPM') continue;
          ppmBatchSet.add(batchNorm);
          const arNo = (m.arNo || '').toString().trim();
          if (arNo) {
            const norm = normalizeAr(arNo);
            if (norm) {
              if (!arByBatchNorm.has(batchNorm)) arByBatchNorm.set(batchNorm, new Set());
              arByBatchNorm.get(batchNorm)!.add(norm);
              const base = baseAr(norm);
              if (base && base !== norm) arByBatchNorm.get(batchNorm)!.add(base);
              // Track original normalised AR for display
              if (!allArsByBatchNorm.has(batchNorm)) allArsByBatchNorm.set(batchNorm, new Set());
              allArsByBatchNorm.get(batchNorm)!.add(norm);
            }
          }
          ppmLines.push({
            id: [rid, m.matReqDtlId || '', batchNorm, m.materialCode || ''].join('|'),
            matReqNo: (m.matReqNo || headerMatReqNo || '-').toString().trim() || '-',
            materialName: (m.materialName || '-').toString().trim() || '-',
            materialCode: (m.materialCode || '-').toString().trim() || '-',
            arNo,
            batchNorm,
          });
        }
      }
    }

    // PPM COA presence is verified via Inward Register AR numbers.
    // For each requisition-found batch: if its AR number exists in inward register => PPM COA Found.
    const inwardArSet = new Set<string>();
    for (const ar of (inwardArNumbers as any[]) || []) {
      const norm = normalizeAr(ar);
      if (!norm) continue;
      inwardArSet.add(norm);
      const base = baseAr(norm);
      if (base && base !== norm) inwardArSet.add(base);
    }

    const ppmCoaBatchSet = new Set<string>(); // normalized batches with inward-backed AR
    for (const bnNorm of ppmBatchSet) {
      const ars = arByBatchNorm.get(bnNorm);
      if (!ars || ars.size === 0) continue;
      let ok = false;
      for (const ar of ars) {
        if (inwardArSet.has(ar)) {
          ok = true;
          break;
        }
      }
      if (ok) ppmCoaBatchSet.add(bnNorm);
    }

    let rows: VerificationTableRow[] = [];
    const all = [...creationRecords].sort((a, b) => a.batchNumberRaw.localeCompare(b.batchNumberRaw, undefined, { numeric: true, sensitivity: 'base' }));
    const isReqFound = (r: CreationRecord) => ppmBatchSet.has(r.batchNorm);
    const isCoaFound = (r: CreationRecord) => isReqFound(r) && ppmCoaBatchSet.has(r.batchNorm);

    const scoped =
      drill === 'total_batches'
        ? all
        : drill === 'requisition_found'
          ? all.filter(isReqFound)
          : drill === 'requisition_missing'
            ? all.filter(r => !isReqFound(r))
            : drill === 'ppm_coa_found'
              ? all.filter(isCoaFound)
              : all.filter(r => isReqFound(r) && !isCoaFound(r));

    rows = scoped.map(rec => {
      const firstLine = ppmLines.find(l => l.batchNorm === rec.batchNorm);
      const found = isReqFound(rec);
      const coaFound = isCoaFound(rec);
      // Collect ALL AR numbers for this batch (comma-separated) so the frontend
      // can count them correctly with splitArNumbers().
      const allArs = Array.from(allArsByBatchNorm.get(rec.batchNorm) ?? []);
      const arNo = allArs.length > 0 ? allArs.join(', ') : (firstLine?.arNo || '');
      return {
        id: `${drill}|${rec.recordId}`,
        matReqNo: firstLine?.matReqNo || '-',
        materialName: firstLine?.materialName || rec.itemName,
        materialCode: firstLine?.materialCode || rec.itemCode,
        arNo,
        batchNumber: rec.batchNumberRaw,
        requisitionStatus: found ? 'Requisition Found' : 'Requisition Missing',
        ppmCoaStatus: found ? (coaFound ? 'PPM COA Found' : 'PPM COA Missing') : '-',
      };
    });

    const totalBatchesCreation = all.length;
    const requisitionFoundBatches = all.filter(isReqFound).length;
    const requisitionMissingBatches = totalBatchesCreation - requisitionFoundBatches;
    const ppmCoaFoundBatches = all.filter(isCoaFound).length;
    const ppmCoaMissingBatches = requisitionFoundBatches - ppmCoaFoundBatches;

    return NextResponse.json({
      success: true,
      year: isAllYearsRequest ? null : yearParam,
      drill,
      availableYears,
      summary: {
        totalBatchesCreation,
        requisitionFoundBatches,
        requisitionMissingBatches,
        ppmCoaFoundBatches,
        ppmCoaMissingBatches,
      },
      rows,
    });
  } catch (error) {
    console.error('[ppm-verification]', error);
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
