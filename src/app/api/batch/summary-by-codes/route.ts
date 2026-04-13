/**
 * Batch API - Summary by product codes
 * Returns per-item batchCount and manufactured years (derived from mfgDate/year)
 */
import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Batch from '@/models/Batch';

type BatchSummary = {
  batchCount: number;
  years: string[];
  minMfgDate?: string;
};

type ResponseBody =
  | { success: true; data: Record<string, BatchSummary> }
  | { success: false; message: string };

function inferYear(mfgDateRaw: unknown, yearRaw: unknown): string | null {
  const yearStr = typeof yearRaw === 'string' ? yearRaw.trim() : '';
  if (/^\d{4}$/.test(yearStr)) return yearStr;

  const mfgDateStr = typeof mfgDateRaw === 'string' ? mfgDateRaw.trim() : '';
  if (!mfgDateStr) return null;

  // Common formats in this project: ISO, dd/mm/yyyy, dd-mm-yyyy.
  const isoTry = new Date(mfgDateStr);
  if (!Number.isNaN(isoTry.getTime())) return String(isoTry.getFullYear());

  const m = mfgDateStr.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (m) return m[3];

  return null;
}

function toComparableDate(mfgDateRaw: unknown): number | null {
  const s = typeof mfgDateRaw === 'string' ? mfgDateRaw.trim() : '';
  if (!s) return null;
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.getTime();
  const m = s.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    const year = Number(m[3]);
    if (Number.isFinite(day) && Number.isFinite(month) && Number.isFinite(year)) {
      const dd = new Date(year, month - 1, day);
      if (!Number.isNaN(dd.getTime())) return dd.getTime();
    }
  }
  return null;
}

/**
 * POST /api/batch/summary-by-codes
 * Body: { productCodes: string[] }
 */
export async function POST(request: NextRequest): Promise<NextResponse<ResponseBody>> {
  try {
    await connectToDatabase();

    const body = await request.json().catch(() => null);
    const productCodes = body?.productCodes as unknown;

    if (!Array.isArray(productCodes) || productCodes.length === 0) {
      return NextResponse.json({ success: false, message: 'productCodes[] is required' }, { status: 400 });
    }

    const codes = [...new Set(productCodes.map(String).map(s => s.trim()).filter(Boolean))];
    if (codes.length === 0) {
      return NextResponse.json({ success: false, message: 'productCodes[] is empty after normalization' }, { status: 400 });
    }

    // Fetch only fields needed for summary.
    const docs = await Batch.find({ 'batches.itemCode': { $in: codes } })
      .select('batches.itemCode batches.mfgDate batches.year')
      .lean();

    const map: Record<string, { batchCount: number; years: Set<string>; minMfg?: { t: number; raw: string } }> = {};
    codes.forEach(c => {
      map[c] = { batchCount: 0, years: new Set<string>() };
    });

    for (const doc of docs) {
      const batches = (doc as any)?.batches;
      if (!Array.isArray(batches)) continue;
      for (const b of batches) {
        const code = typeof b?.itemCode === 'string' ? b.itemCode.trim() : '';
        if (!code || !(code in map)) continue;

        map[code].batchCount += 1;
        const y = inferYear(b?.mfgDate, b?.year);
        if (y) map[code].years.add(y);

        const t = toComparableDate(b?.mfgDate);
        if (t !== null) {
          const raw = typeof b?.mfgDate === 'string' ? b.mfgDate : '';
          const cur = map[code].minMfg;
          if (!cur || t < cur.t) map[code].minMfg = { t, raw };
        }
      }
    }

    const out: Record<string, BatchSummary> = {};
    for (const code of codes) {
      const v = map[code];
      out[code] = {
        batchCount: v?.batchCount ?? 0,
        years: [...(v?.years ?? new Set<string>())].sort((a, b) => b.localeCompare(a)),
        minMfgDate: v?.minMfg?.raw || undefined,
      };
    }

    return NextResponse.json({ success: true, data: out });
  } catch (error) {
    console.error('Error building batch summary-by-codes:', error);
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : 'Unknown error occurred' },
      { status: 500 }
    );
  }
}

