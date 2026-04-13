import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';

type PreviewResponse =
  | {
      file: string;
      sheets: string[];
      activeSheet: string;
      columns: string[];
      rows: Array<Record<string, unknown> & { __rowId: number }>;
    }
  | { error: string };

function isSafeExcelBasename(file: string): boolean {
  const f = file.trim();
  if (!f) return false;
  // prevent traversal and path separators
  if (f.includes('..') || f.includes('/') || f.includes('\\')) return false;
  if (!f.toLowerCase().endsWith('.xlsx')) return false;
  return true;
}

function normalizeHeader(v: unknown): string {
  const s = (v ?? '').toString().trim();
  return s;
}

export async function GET(req: NextRequest): Promise<NextResponse<PreviewResponse>> {
  try {
    const url = new URL(req.url);
    const file = url.searchParams.get('file') ?? '';
    const sheetParam = url.searchParams.get('sheet') ?? '';

    if (!isSafeExcelBasename(file)) {
      return NextResponse.json({ error: 'Invalid file name' }, { status: 400 });
    }

    const excelDir = path.join(process.cwd(), 'excel');
    const fullPath = path.join(excelDir, file);

    // Read workbook
    const buf = await fs.readFile(fullPath);
    const wb = XLSX.read(buf, { type: 'buffer' });
    const sheets = wb.SheetNames ?? [];
    if (!sheets.length) {
      return NextResponse.json({ error: 'Workbook has no sheets' }, { status: 400 });
    }

    const activeSheet = sheets.includes(sheetParam) ? sheetParam : sheets[0];
    const ws = wb.Sheets[activeSheet];
    if (!ws) {
      return NextResponse.json({ error: 'Sheet not found' }, { status: 400 });
    }

    // Use AOA to reliably get header row and preserve blank cells.
    const aoa = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      defval: '',
      blankrows: false,
      raw: true,
    }) as unknown[][];

    if (aoa.length === 0) {
      return NextResponse.json({ file, sheets, activeSheet, columns: [], rows: [] });
    }

    const headerRow = (aoa[0] ?? []).map(normalizeHeader);
    const seen = new Map<string, number>();

    const columns = headerRow.map((h, idx) => {
      const base = h || `Column_${idx + 1}`;
      const n = (seen.get(base) ?? 0) + 1;
      seen.set(base, n);
      return n === 1 ? base : `${base}_${n}`;
    });

    const rows = aoa.slice(1).map((row, i) => {
      const obj: Record<string, unknown> & { __rowId: number } = { __rowId: i + 1 };
      for (let c = 0; c < columns.length; c++) {
        obj[columns[c]] = row?.[c] ?? '';
      }
      return obj;
    });

    return NextResponse.json({ file, sheets, activeSheet, columns, rows });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to read excel file';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

