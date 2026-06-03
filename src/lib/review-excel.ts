/**
 * Shared loader for review Excel files under /excel.
 * Used by /api/reviews and APQR DOCX generation.
 */

import { promises as fs } from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';

export const REVIEW_EXCEL_DEFINITIONS = [
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
  { id: 'returnedGoods', name: 'Returned Goods', fileName: 'Review of Returned Goods.xlsx' },
] as const;

export type ReviewExcelId = (typeof REVIEW_EXCEL_DEFINITIONS)[number]['id'];

export function normalizeReviewHeader(v: unknown): string {
  return String(v ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** MFR and MFC are the same prefix in different Excel sources; normalize to MFC. */
export function normalizeReviewBatchNo(batchStr: string): string {
  return batchStr.replace(/^MFR\b/i, 'MFC').trim().toUpperCase();
}

export type ReviewExcelFileStatus = {
  id: string;
  name: string;
  fileName: string;
  exists: boolean;
};

export type ReviewExcelCatalog = {
  files: ReviewExcelFileStatus[];
  /** batchNo → review name → row objects */
  batchReviews: Record<string, string[]>;
  batchRowData: Record<string, Record<string, Record<string, unknown>[]>>;
  /** review name → all rows in file (deduped) */
  allRowsByReview: Record<string, Record<string, unknown>[]>;
};

export async function loadReviewExcelCatalog(excelDir?: string): Promise<ReviewExcelCatalog> {
  const dir = excelDir || path.join(process.cwd(), 'excel');
  const files: ReviewExcelFileStatus[] = [];
  const batchReviews: Record<string, string[]> = {};
  const batchRowData: Record<string, Record<string, Record<string, unknown>[]>> = {};
  const allRowsByReview: Record<string, Record<string, unknown>[]> = {};
  const seenRowKeysByReview: Record<string, Set<string>> = {};

  for (const reviewDef of REVIEW_EXCEL_DEFINITIONS) {
    const fullPath = path.join(dir, reviewDef.fileName);
    let exists = false;

    try {
      await fs.access(fullPath);
      exists = true;
    } catch {
      // missing file
    }

    files.push({
      id: reviewDef.id,
      name: reviewDef.name,
      fileName: reviewDef.fileName,
      exists,
    });

    if (!exists) continue;

    if (!allRowsByReview[reviewDef.name]) {
      allRowsByReview[reviewDef.name] = [];
      seenRowKeysByReview[reviewDef.name] = new Set();
    }

    try {
      const buf = await fs.readFile(fullPath);
      const wb = XLSX.read(buf, { type: 'buffer' });
      const sheets = wb.SheetNames ?? [];
      if (sheets.length === 0) continue;

      const ws = wb.Sheets[sheets[0]];
      const aoa = XLSX.utils.sheet_to_json(ws, {
        header: 1,
        defval: '',
        blankrows: false,
        raw: false,
      }) as unknown[][];

      if (aoa.length < 2) continue;

      const originalHeaders = (aoa[0] as unknown[]).map((h) => String(h ?? '').trim());
      const normalizedHeaders = originalHeaders.map(normalizeReviewHeader);

      const batchColIdx = normalizedHeaders.reduce<number>((last, h, i) =>
        (h.includes('batchno') || h.includes('batchnumber') || h === 'batch') ? i : last,
        -1,
      );

      if (batchColIdx === -1) continue;

      for (let i = 1; i < aoa.length; i++) {
        const row = aoa[i] as unknown[];
        const batchRaw = row[batchColIdx];
        if (!batchRaw) continue;

        const rowObj: Record<string, unknown> = {};
        originalHeaders.forEach((header, colIdx) => {
          if (header) rowObj[header] = row[colIdx] ?? '';
        });

        const rowKey = JSON.stringify(rowObj);
        if (!seenRowKeysByReview[reviewDef.name].has(rowKey)) {
          seenRowKeysByReview[reviewDef.name].add(rowKey);
          allRowsByReview[reviewDef.name].push(rowObj);
        }

        const batchTokens = String(batchRaw)
          .split(/[\r\n,]+/)
          .map((t) => normalizeReviewBatchNo(t.trim()))
          .filter((t) => t && !['N/A', 'NA', 'NIL', '-'].includes(t));

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
    } catch (readErr) {
      console.error(`Failed to read or parse Excel for ${reviewDef.fileName}`, readErr);
    }
  }

  return { files, batchReviews, batchRowData, allRowsByReview };
}

/** Rows from a review Excel whose batch column intersects the APQR batch set. */
export function filterReviewRowsForBatches(
  rows: Record<string, unknown>[],
  batchSet: Set<string>,
): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    let matched = false;
    for (const [key, val] of Object.entries(row)) {
      const nk = normalizeReviewHeader(key);
      if (!nk.includes('batch')) continue;
      const tokens = String(val ?? '')
        .split(/[\r\n,]+/)
        .map((t) => normalizeReviewBatchNo(t.trim()))
        .filter((t) => t && !['N/A', 'NA', 'NIL', '-'].includes(t));
      if (tokens.some((t) => batchSet.has(t))) {
        matched = true;
        break;
      }
    }
    if (!matched) continue;
    const rowKey = JSON.stringify(row);
    if (seen.has(rowKey)) continue;
    seen.add(rowKey);
    out.push(row);
  }

  return out;
}
