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
  | 'pm_coa_found'
  | 'pm_coa_missing';

export interface VerificationTableRow {
  id: string;
  matReqNo: string;
  materialName: string;
  materialCode: string;
  arNo?: string;
  batchNumber: string;
  requisitionStatus: 'Requisition Found' | 'Requisition Missing';
  pmCoaStatus: 'PM COA Found' | 'PM COA Missing' | '-';
}

export interface PmVerificationResponse {
  success: boolean;
  message?: string;
  year: string | null;
  drill: DrillMode | null;
  availableYears: string[];
  summary: {
    totalBatchesCreation: number;
    requisitionFoundBatches: number;
    requisitionMissingBatches: number;
    pmCoaFoundBatches: number;
    pmCoaMissingBatches: number;
  };
  rows: VerificationTableRow[];
}

const DRILL_MODES: DrillMode[] = [
  'total_batches',
  'requisition_found',
  'requisition_missing',
  'pm_coa_found',
  'pm_coa_missing',
];
function parseDrill(raw: string | null): DrillMode | null {
  if (!raw) return null;
  const t = raw.trim() as DrillMode;
  return DRILL_MODES.includes(t) ? t : null;
}

function shouldScopeAllYears(scopeRaw: string | null): boolean {
  return (scopeRaw || '').trim().toLowerCase() === 'all';
}

type PmLine = {
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
  pmCoaFoundBatches: 0,
  pmCoaMissingBatches: 0,
};

export async function GET(request: NextRequest): Promise<NextResponse<PmVerificationResponse>> {
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

    // Available years (union from requisitions + batch creation)
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
      }
    }

    const pmLines: PmLine[] = [];
    const pmBatchSet = new Set<string>(); // normalized batches that have PM requisition lines
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
          if (m.materialType !== 'PM') continue;
          pmBatchSet.add(batchNorm);

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

          pmLines.push({
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

    // Requisition found batches = creation batches that exist in PM requisition (by normalized token)
    const requisitionFoundRaw = new Set<string>();
    for (const bRaw of creationBatchSet) {
      const bnNorm = creationBatchNormByRaw.get(bRaw) || normalizeBatchNo(bRaw);
      if (pmBatchSet.has(bnNorm)) requisitionFoundRaw.add(bRaw);
    }

    // Build inward AR set
    const inwardArSet = new Set<string>();
    for (const ar of (inwardArNumbers as any[]) || []) {
      const norm = normalizeAr(ar);
      if (!norm) continue;
      inwardArSet.add(norm);
      const base = baseAr(norm);
      if (base && base !== norm) inwardArSet.add(base);
    }

    // PM COA found batches among requisition-found: any requisition AR exists in inward
    const pmCoaBatchNormSet = new Set<string>(); // normalized batches with inward-backed AR
    for (const bnNorm of pmBatchSet) {
      const ars = arByBatchNorm.get(bnNorm);
      if (!ars || ars.size === 0) continue;
      let ok = false;
      for (const ar of ars) {
        if (inwardArSet.has(ar)) {
          ok = true;
          break;
        }
      }
      if (ok) pmCoaBatchNormSet.add(bnNorm);
    }

    const pmCoaFoundRaw = new Set<string>();
    for (const bRaw of requisitionFoundRaw) {
      const bnNorm = creationBatchNormByRaw.get(bRaw) || normalizeBatchNo(bRaw);
      if (pmCoaBatchNormSet.has(bnNorm)) pmCoaFoundRaw.add(bRaw);
    }

    const totalBatchesCreation = creationBatchSet.size;
    const requisitionFoundBatches = requisitionFoundRaw.size;
    const requisitionMissingBatches = Math.max(0, totalBatchesCreation - requisitionFoundBatches);
    const pmCoaFoundBatches = pmCoaFoundRaw.size;
    const pmCoaMissingBatches = Math.max(0, requisitionFoundBatches - pmCoaFoundBatches);

    let rows: VerificationTableRow[] = [];
    if (drill === 'total_batches') {
      rows = [...creationBatchSet].sort().map(bnRaw => {
        const bnNorm = creationBatchNormByRaw.get(bnRaw) || normalizeBatchNo(bnRaw);
        const meta = creationBatchMeta.get(bnRaw) || { itemName: '-', itemCode: '-' };
        const found = pmBatchSet.has(bnNorm);
        const coaFound = found && pmCoaBatchNormSet.has(bnNorm);
        const firstLine = pmLines.find(l => l.batchNorm === bnNorm);
        return {
          id: `total|${bnRaw}`,
          matReqNo: firstLine?.matReqNo || '-',
          materialName: firstLine?.materialName || meta.itemName,
          materialCode: firstLine?.materialCode || meta.itemCode,
          arNo: firstLine?.arNo || '',
          batchNumber: bnRaw,
          requisitionStatus: found ? 'Requisition Found' : 'Requisition Missing',
          pmCoaStatus: found ? (coaFound ? 'PM COA Found' : 'PM COA Missing') : '-',
        };
      });
    } else if (drill === 'requisition_found') {
      rows = [...requisitionFoundRaw].sort().map(bnRaw => {
        const bnNorm = creationBatchNormByRaw.get(bnRaw) || normalizeBatchNo(bnRaw);
        const meta = creationBatchMeta.get(bnRaw) || { itemName: '-', itemCode: '-' };
        const firstLine = pmLines.find(l => l.batchNorm === bnNorm);
        const coaFound = pmCoaBatchNormSet.has(bnNorm);
        return {
          id: `reqf|${bnRaw}`,
          matReqNo: firstLine?.matReqNo || '-',
          materialName: firstLine?.materialName || meta.itemName,
          materialCode: firstLine?.materialCode || meta.itemCode,
          arNo: firstLine?.arNo || '',
          batchNumber: bnRaw,
          requisitionStatus: 'Requisition Found',
          pmCoaStatus: coaFound ? 'PM COA Found' : 'PM COA Missing',
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
            pmCoaStatus: '-',
          };
        });
    } else if (drill === 'pm_coa_found') {
      rows = [...pmCoaFoundRaw].sort().map(bnRaw => {
        const bnNorm = creationBatchNormByRaw.get(bnRaw) || normalizeBatchNo(bnRaw);
        const meta = creationBatchMeta.get(bnRaw) || { itemName: '-', itemCode: '-' };
        const firstLine = pmLines.find(l => l.batchNorm === bnNorm);
        return {
          id: `pmcaf|${bnRaw}`,
          matReqNo: firstLine?.matReqNo || '-',
          materialName: firstLine?.materialName || meta.itemName,
          materialCode: firstLine?.materialCode || meta.itemCode,
          arNo: firstLine?.arNo || '',
          batchNumber: bnRaw,
          requisitionStatus: 'Requisition Found',
          pmCoaStatus: 'PM COA Found',
        };
      });
    } else if (drill === 'pm_coa_missing') {
      rows = [...requisitionFoundRaw]
        .sort()
        .filter(bnRaw => !pmCoaFoundRaw.has(bnRaw))
        .map(bnRaw => {
          const bnNorm = creationBatchNormByRaw.get(bnRaw) || normalizeBatchNo(bnRaw);
          const meta = creationBatchMeta.get(bnRaw) || { itemName: '-', itemCode: '-' };
          const firstLine = pmLines.find(l => l.batchNorm === bnNorm);
          return {
            id: `pmcami|${bnRaw}`,
            matReqNo: firstLine?.matReqNo || '-',
            materialName: firstLine?.materialName || meta.itemName,
            materialCode: firstLine?.materialCode || meta.itemCode,
            arNo: firstLine?.arNo || '',
            batchNumber: bnRaw,
            requisitionStatus: 'Requisition Found',
            pmCoaStatus: 'PM COA Missing',
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
        pmCoaFoundBatches,
        pmCoaMissingBatches,
      },
      rows,
    });
  } catch (error) {
    console.error('[pm-verification]', error);
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

