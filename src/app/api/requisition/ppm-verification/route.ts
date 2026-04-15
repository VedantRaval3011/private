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

    // Batch Creation unique batch numbers (raw for counts, norm for matching)
    const creationBatchSet = new Set<string>();
    const creationBatchNormByRaw = new Map<string, string>();
    const creationBatchMeta = new Map<string, { itemName: string; itemCode: string }>();
    const creationYearByNorm = new Map<string, string>();

    for (const doc of batchDocs as any[]) {
      for (const b of doc.batches || []) {
        const y = effectiveBatchYear(b);
        if (!isAllYearsRequest && y !== yearParam) continue;
        const bnRaw = (b.batchNumber || '').toString();
        if (!bnRaw) continue;
        creationBatchSet.add(bnRaw);
        if (!creationBatchNormByRaw.has(bnRaw)) creationBatchNormByRaw.set(bnRaw, normalizeBatchNo(bnRaw));
        if (!creationBatchMeta.has(bnRaw)) {
          creationBatchMeta.set(bnRaw, {
            itemName: (b.itemName || '').toString().trim() || '-',
            itemCode: (b.itemCode || '').toString().trim() || '-',
          });
        }

        const bnNorm = creationBatchNormByRaw.get(bnRaw) || normalizeBatchNo(bnRaw);
        if (bnNorm && y && !creationYearByNorm.has(bnNorm)) creationYearByNorm.set(bnNorm, y);
      }
    }

    const ppmLines: PpmLine[] = [];
    const ppmBatchSet = new Set<string>(); // normalized
    const arByBatchNorm = new Map<string, Set<string>>();

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

    // Requisition found batches = creation batches that exist in PPM requisition (by normalized token)
    const requisitionFoundRaw = new Set<string>();
    for (const bRaw of creationBatchSet) {
      const bnNorm = creationBatchNormByRaw.get(bRaw) || normalizeBatchNo(bRaw);
      if (ppmBatchSet.has(bnNorm)) requisitionFoundRaw.add(bRaw);
    }

    // Map normalized batch -> stable raw batch (for UI)
    const creationRawByNorm = new Map<string, string>();
    for (const bRaw of creationBatchSet) {
      const bnNorm = creationBatchNormByRaw.get(bRaw) || normalizeBatchNo(bRaw);
      if (bnNorm && !creationRawByNorm.has(bnNorm)) creationRawByNorm.set(bnNorm, bRaw);
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

    const ppmCoaFoundRaw = new Set<string>();
    for (const bRaw of requisitionFoundRaw) {
      const bnNorm = creationBatchNormByRaw.get(bRaw) || normalizeBatchNo(bRaw);
      if (ppmCoaBatchSet.has(bnNorm)) ppmCoaFoundRaw.add(bRaw);
    }

    const totalBatchesCreation = creationBatchSet.size;
    const requisitionFoundBatches = requisitionFoundRaw.size;
    const requisitionMissingBatches = Math.max(0, totalBatchesCreation - requisitionFoundBatches);
    const ppmCoaFoundBatches = ppmCoaFoundRaw.size;
    const ppmCoaMissingBatches = Math.max(0, requisitionFoundBatches - ppmCoaFoundBatches);

    let rows: VerificationTableRow[] = [];
    if (drill === 'total_batches') {
      rows = [...creationBatchSet].sort().map(bnRaw => {
        const bnNorm = creationBatchNormByRaw.get(bnRaw) || normalizeBatchNo(bnRaw);
        const meta = creationBatchMeta.get(bnRaw) || { itemName: '-', itemCode: '-' };
        const found = ppmBatchSet.has(bnNorm);
        const coaFound = found && ppmCoaBatchSet.has(bnNorm);
        const firstLine = ppmLines.find(l => l.batchNorm === bnNorm);
        return {
          id: `total|${bnRaw}`,
          matReqNo: firstLine?.matReqNo || '-',
          materialName: firstLine?.materialName || meta.itemName,
          materialCode: firstLine?.materialCode || meta.itemCode,
          arNo: firstLine?.arNo || '',
          batchNumber: bnRaw,
          requisitionStatus: found ? 'Requisition Found' : 'Requisition Missing',
          ppmCoaStatus: found ? (coaFound ? 'PPM COA Found' : 'PPM COA Missing') : '-',
        };
      });
    } else if (drill === 'requisition_found') {
      rows = [...requisitionFoundRaw].sort().map(bnRaw => {
        const bnNorm = creationBatchNormByRaw.get(bnRaw) || normalizeBatchNo(bnRaw);
        const meta = creationBatchMeta.get(bnRaw) || { itemName: '-', itemCode: '-' };
        const firstLine = ppmLines.find(l => l.batchNorm === bnNorm);
        const coaFound = ppmCoaBatchSet.has(bnNorm);
        return {
          id: `reqf|${bnRaw}`,
          matReqNo: firstLine?.matReqNo || '-',
          materialName: firstLine?.materialName || meta.itemName,
          materialCode: firstLine?.materialCode || meta.itemCode,
          arNo: firstLine?.arNo || '',
          batchNumber: bnRaw,
          requisitionStatus: 'Requisition Found',
          ppmCoaStatus: coaFound ? 'PPM COA Found' : 'PPM COA Missing',
        };
      });
    } else if (drill === 'requisition_missing') {
      rows = [...creationBatchSet]
        .sort()
        .filter(bnRaw => !requisitionFoundRaw.has(bnRaw))
        .map(bnRaw => {
          const meta = creationBatchMeta.get(bnRaw) || { itemName: '-', itemCode: '-' };
          return {
            id: `reqm|${bnRaw}`,
            matReqNo: '-',
            materialName: meta.itemName,
            materialCode: meta.itemCode,
            arNo: '',
            batchNumber: bnRaw,
            requisitionStatus: 'Requisition Missing',
            ppmCoaStatus: '-',
          };
        });
    } else if (drill === 'ppm_coa_found') {
      rows = [...ppmCoaFoundRaw].sort().map(bnRaw => {
        const bnNorm = creationBatchNormByRaw.get(bnRaw) || normalizeBatchNo(bnRaw);
        const meta = creationBatchMeta.get(bnRaw) || { itemName: '-', itemCode: '-' };
        const firstLine = ppmLines.find(l => l.batchNorm === bnNorm);
        return {
          id: `ppmcaf|${bnRaw}`,
          matReqNo: firstLine?.matReqNo || '-',
          materialName: firstLine?.materialName || meta.itemName,
          materialCode: firstLine?.materialCode || meta.itemCode,
          arNo: firstLine?.arNo || '',
          batchNumber: bnRaw,
          requisitionStatus: 'Requisition Found',
          ppmCoaStatus: 'PPM COA Found',
        };
      });
    } else if (drill === 'ppm_coa_missing') {
      rows = [...requisitionFoundRaw]
        .sort()
        .filter(bnRaw => !ppmCoaFoundRaw.has(bnRaw))
        .map(bnRaw => {
          const bnNorm = creationBatchNormByRaw.get(bnRaw) || normalizeBatchNo(bnRaw);
          const meta = creationBatchMeta.get(bnRaw) || { itemName: '-', itemCode: '-' };
          const firstLine = ppmLines.find(l => l.batchNorm === bnNorm);
          return {
            id: `ppmcami|${bnRaw}`,
            matReqNo: firstLine?.matReqNo || '-',
            materialName: firstLine?.materialName || meta.itemName,
            materialCode: firstLine?.materialCode || meta.itemCode,
            arNo: firstLine?.arNo || '',
            batchNumber: bnRaw,
            requisitionStatus: 'Requisition Found',
            ppmCoaStatus: 'PPM COA Missing',
          };
        });
    }

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
