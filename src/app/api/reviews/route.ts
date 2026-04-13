import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';

const REVIEW_FILES = [
  { id: 'batchRejection', name: 'Batch Rejection', fileName: 'Review of Batch Rejection.xlsx' },
  { id: 'changeControl', name: 'Change Controls', fileName: 'Review of Change Controls.xlsx' },
  { id: 'capa', name: 'Corrective and Preventive Action', fileName: 'Review of Corrective and Preventive Action.xlsx' },
  { id: 'deviation', name: 'Deviations', fileName: 'Review of Deviations.xlsx' },
  { id: 'incident', name: 'Incidents', fileName: 'Review of Incidents.xlsx' },
  { id: 'complaint', name: 'Market Complaints', fileName: 'Review of Market Complaints.xlsx' },
  { id: 'oos', name: 'Out Of Specification', fileName: 'Review of Out Of Specification.xlsx' },
  { id: 'productFailure', name: 'Product Failures', fileName: 'Review of Product Failures.xlsx' },
  { id: 'nonConformance', name: 'Non-conformance', fileName: 'Review of Product Non-conformance.xlsx' },
  { id: 'recall', name: 'Product Recall', fileName: 'Review of Product Recall.xlsx' },
  { id: 'returnedGoods', name: 'Returned Goods', fileName: 'Review of Returned Goods.xlsx' }
];

function normalizeHeader(v: unknown): string {
  const s = (v ?? '').toString().trim().toLowerCase();
  return s.replace(/[^a-z0-9]/g, '');
}

// MFR and MFC are the same prefix in different Excel sources; normalize to MFC
function normalizeBatchNo(batchStr: string): string {
  return batchStr.replace(/^MFR\b/i, 'MFC');
}

export async function GET(request: NextRequest) {
  try {
    const excelDir = path.join(process.cwd(), 'excel');

    const fileStatuses: { id: string; name: string; fileName: string; exists: boolean }[] = [];
    const batchReviews: Record<string, string[]> = {};
    // batchRowData: batchNo -> reviewName -> array of row objects (col: value)
    const batchRowData: Record<string, Record<string, Record<string, unknown>[]>> = {};

    for (const reviewDef of REVIEW_FILES) {
      const fullPath = path.join(excelDir, reviewDef.fileName);
      let exists = false;

      try {
        await fs.access(fullPath);
        exists = true;
      } catch {
        // File does not exist
      }

      fileStatuses.push({ id: reviewDef.id, name: reviewDef.name, fileName: reviewDef.fileName, exists });

      if (exists) {
        try {
          const buf = await fs.readFile(fullPath);
          const wb = XLSX.read(buf, { type: 'buffer' });
          const sheets = wb.SheetNames ?? [];

          if (sheets.length > 0) {
            const ws = wb.Sheets[sheets[0]];
            const aoa = XLSX.utils.sheet_to_json(ws, {
              header: 1,
              defval: '',
              blankrows: false,
              raw: false, // format cells as strings for display
            }) as unknown[][];

            if (aoa.length > 1) {
              // Keep original headers for readable display
              const originalHeaders = (aoa[0] as unknown[]).map(h => String(h ?? '').trim());
              const normalizedHeaders = originalHeaders.map(normalizeHeader);

              // Use the LAST matching batch column — sheets often have an early descriptive
              // "Batch No." column (free text) followed by a clean one at the end.
              const batchColIdx = normalizedHeaders.reduce<number>((last, h, i) =>
                (h.includes('batchno') || h.includes('batchnumber') || h === 'batch') ? i : last,
                -1
              );

              if (batchColIdx !== -1) {
                for (let i = 1; i < aoa.length; i++) {
                  const row = aoa[i] as unknown[];
                  const batchRaw = row[batchColIdx];
                  if (!batchRaw) continue;

                  // A single cell may contain multiple batch numbers separated by commas/newlines
                  // e.g. "N25B10,\r\nN25B11,\r\n N25B28"
                  const batchTokens = String(batchRaw)
                    .split(/[\r\n,]+/)
                    .map(t => normalizeBatchNo(t.trim()))
                    .filter(t => t && t !== 'N/A' && t !== 'NA' && t !== 'NIL' && t !== '-');

                  // Build full row object once per row using original headers as keys
                  const rowObj: Record<string, unknown> = {};
                  originalHeaders.forEach((header, colIdx) => {
                    if (header) rowObj[header] = row[colIdx] ?? '';
                  });

                  for (const batchStr of batchTokens) {
                    if (!batchReviews[batchStr]) batchReviews[batchStr] = [];
                    if (!batchReviews[batchStr].includes(reviewDef.name)) {
                      batchReviews[batchStr].push(reviewDef.name);
                    }

                    if (!batchRowData[batchStr]) batchRowData[batchStr] = {};
                    if (!batchRowData[batchStr][reviewDef.name]) {
                      batchRowData[batchStr][reviewDef.name] = [];
                    }
                    batchRowData[batchStr][reviewDef.name].push(rowObj);
                  }
                }
              }
            }
          }
        } catch (readErr) {
          console.error(`Failed to read or parse Excel for ${reviewDef.fileName}`, readErr);
        }
      }
    }

    return NextResponse.json({
      success: true,
      files: fileStatuses,
      batchReviews,
      batchRowData,
    });

  } catch (error) {
    console.error('Error processing reviews:', error);
    return NextResponse.json(
      { success: false, message: 'Server error', files: [], batchReviews: {}, batchRowData: {} },
      { status: 500 }
    );
  }
}
