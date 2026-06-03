/**
 * APQR sections 9–19: populate review tables from /excel when batch data exists, else NIL.
 * Sections without a mapped Excel file are left unchanged (template text).
 */

import type { ReviewExcelCatalog } from '@/lib/review-excel';
import { filterReviewRowsForBatches } from '@/lib/review-excel';

export type ApqrReviewSectionApplyResult = {
  section: number;
  title: string;
  reviewName: string;
  fileName: string;
  status: 'filled' | 'nil' | 'no-excel-file' | 'table-not-found';
  rowCount?: number;
};

/** Sections backed by review Excel files (batch-filtered). */
export const APQR_EXCEL_REVIEW_SECTIONS = [
  { section: 9, title: 'Review of Deviations', anchor: 'REVIEW OF DEVIATIONS', reviewName: 'Deviations', fileName: 'Review of Deviations.xlsx' },
  { section: 10, title: 'Review of Change Controls', anchor: 'REVIEW OF CHANGE CONTROLS', reviewName: 'Change Controls', fileName: 'Review of Change Controls.xlsx' },
  { section: 11, title: 'Review of Market Complaints', anchor: 'MARKET COMPLAINTS', reviewName: 'Market Complaints', fileName: 'Review of Market Complaints.xlsx' },
  { section: 12, title: 'Review of Incidents', anchor: 'INCIDENTS', reviewName: 'Incidents', fileName: 'Review of Incidents.xlsx' },
  { section: 13, title: 'Review of Batch Rejection', anchor: 'REVIEW OF BATCH REJECTION', reviewName: 'Batch Rejection', fileName: 'Review of Batch Rejection.xlsx' },
  { section: 14, title: 'Review of Product Recalls', anchor: 'PRODUCT RECALLS', reviewName: 'Product Recall', fileName: 'Review of Product Recall.xlsx' },
  { section: 15, title: 'Review of Returned Goods', anchor: 'RETURNED GOODS', reviewName: 'Returned Goods', fileName: 'Review of Returned Goods.xlsx' },
  { section: 16, title: 'Review of Product Failures', anchor: 'PRODUCT FAILURES', reviewName: 'Product Failures', fileName: 'Review of Product Failures.xlsx' },
  { section: 17, title: 'Review of Out of Specification (OOS)', anchor: 'OUT OF SPECIFICATION', reviewName: 'Out Of Specification', fileName: 'Review of Out Of Specification.xlsx' },
  { section: 18, title: 'Review of Product Nonconformance', anchor: 'NONCONFORMANCE', reviewName: 'Non-conformance', fileName: 'Review of Product Non-conformance.xlsx' },
  { section: 19, title: 'Review of CAPA', anchor: 'CORRECTIVE AND PREVENTIVE ACTION', reviewName: 'Corrective and Preventive Action', fileName: 'Review of Corrective and Preventive Action.xlsx' },
] as const;

/** No Excel mapping — template content is preserved. */
export const APQR_TEMPLATE_ONLY_REVIEW_SECTIONS = [
  { section: 20, title: 'Review of Preventive Maintenance of Equipments/ Instruments' },
  { section: 21, title: 'Review of Supply Chain Traceability of Active Substances' },
  { section: 22, title: 'Review of Supply Chain Traceability of Finished Products' },
  { section: 23, title: 'Review of Purified Water Trend' },
  { section: 24, title: 'Review of Environmental Monitoring Trend' },
  { section: 25, title: 'Review of Marketing Authorization Variations Including Post Marketing Commitments' },
  { section: 26, title: 'Review of Dossier Variation Submitted' },
  { section: 27, title: 'Review of Qualification Status of Critical Equipments and Utilities' },
  { section: 28, title: 'Review of Calibration Status of Quality Control Instruments' },
  { section: 30, title: 'Review of Technical Agreements/ Contractual Agreements' },
  { section: 31, title: 'Review of Critical Product Quality Parameters from Previous APQR' },
] as const;

function normalizeCol(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function extractRowCellTexts(rowXml: string): string[] {
  const cells = [...rowXml.matchAll(/<w:tc[\s>][\s\S]*?<\/w:tc>/g)];
  return cells.map((cell) =>
    [...cell[0].matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)]
      .map((m) =>
        m[1]
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .trim(),
      )
      .filter(Boolean)
      .join(' '),
  );
}

function rowIsNil(rowXml: string): boolean {
  const t = extractRowCellTexts(rowXml).join(' ').trim().toUpperCase();
  return t === 'NIL' || t === 'NA';
}

function rowIsRemarkBoilerplate(rowXml: string): boolean {
  const t = extractRowCellTexts(rowXml).join(' ').toLowerCase();
  return t.includes('remark:') && t.includes('during the review period');
}

function rowIsSignature(rowXml: string): boolean {
  const t = extractRowCellTexts(rowXml).join(' ').toLowerCase();
  return t.includes('prepared') && t.includes('sign/date');
}

function mapExcelRowToHeaders(
  headers: string[],
  excelRow: Record<string, unknown>,
): string[] {
  const excelEntries = Object.entries(excelRow).map(([k, v]) => ({
    norm: normalizeCol(k),
    raw: k,
    value: String(v ?? '').trim(),
  }));

  return headers.map((header) => {
    const nh = normalizeCol(header);
    if (!nh || nh === 'srno' || nh === 'srnumber' || /^sr\.?no/.test(header.trim().toLowerCase())) {
      return '';
    }

    let match = excelEntries.find((e) => e.norm === nh);
    if (!match) {
      match = excelEntries.find(
        (e) => e.norm.includes(nh) || nh.includes(e.norm),
      );
    }
    if (!match && nh.includes('batch')) {
      match = excelEntries.find((e) => e.norm.includes('batch'));
    }
    if (!match && nh.includes('description')) {
      match = excelEntries.find((e) => e.norm.includes('description') || e.norm.includes('detail'));
    }
    if (!match && nh.includes('status')) {
      match = excelEntries.find((e) => e.norm.includes('status'));
    }
    if (!match && nh.includes('capa')) {
      match = excelEntries.find((e) => e.norm.includes('capa'));
    }
    if (!match && nh.includes('date')) {
      match = excelEntries.find((e) => e.norm.includes('date'));
    }
    if (!match && nh.includes('quantity')) {
      match = excelEntries.find((e) => e.norm.includes('quantity') || e.norm.includes('qty'));
    }
    if (!match && nh.includes('reason')) {
      match = excelEntries.find((e) => e.norm.includes('reason'));
    }
    if (!match && nh.includes('investigation')) {
      match = excelEntries.find((e) => e.norm.includes('investigation'));
    }
    if (!match && nh.includes('complaint')) {
      match = excelEntries.find((e) => e.norm.includes('complaint'));
    }
    if (!match && nh.includes('oos')) {
      match = excelEntries.find((e) => e.norm.includes('oos'));
    }
    if (!match && nh.includes('incident')) {
      match = excelEntries.find((e) => e.norm.includes('incident'));
    }
    if (!match && nh.includes('deviation')) {
      match = excelEntries.find((e) => e.norm.includes('deviation'));
    }
    if (!match && nh.includes('change')) {
      match = excelEntries.find((e) => e.norm.includes('change'));
    }
    if (!match && nh.includes('product') && nh.includes('name')) {
      match = excelEntries.find((e) => e.norm.includes('product') && e.norm.includes('name'));
    }
    if (!match && nh.includes('nonconformance')) {
      match = excelEntries.find((e) => e.norm.includes('nonconformance') || e.norm.includes('nonconform'));
    }

    return match?.value || '';
  });
}

function buildReviewDataCell(text: string, xmlEscape: (s: string) => string): string {
  return '<w:tc><w:tcPr><w:vAlign w:val="center"/></w:tcPr>'
    + '<w:p><w:pPr><w:spacing w:before="0"/><w:jc w:val="center"/>'
    + '<w:rPr><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:pPr>'
    + `<w:r><w:rPr><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>`
    + `<w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r></w:p></w:tc>`;
}

function buildNilRow(colCount: number, nilRowTemplate: string, xmlEscape: (s: string) => string): string {
  if (nilRowTemplate && rowIsNil(nilRowTemplate)) {
    return nilRowTemplate.replace(/<w:t[^>]*>[\s\S]*?<\/w:t>/, '<w:t>NIL</w:t>');
  }
  const cells = Array.from({ length: colCount }, () => buildReviewDataCell('NIL', xmlEscape)).join('');
  return `<w:tr><w:trPr><w:jc w:val="center"/></w:trPr>${cells}</w:tr>`;
}

function buildDataRow(
  headers: string[],
  excelRow: Record<string, unknown>,
  srNo: number,
  xmlEscape: (s: string) => string,
): string {
  const values = mapExcelRowToHeaders(headers, excelRow);
  const cells = values.map((val, idx) => {
    const nh = normalizeCol(headers[idx] || '');
    if (nh === 'srno' || nh === 'srnumber' || /^sr\.?no/.test((headers[idx] || '').trim().toLowerCase())) {
      return buildReviewDataCell(String(srNo), xmlEscape);
    }
    return buildReviewDataCell(val, xmlEscape);
  });
  return `<w:tr><w:trPr><w:jc w:val="center"/></w:trPr>${cells.join('')}</w:tr>`;
}

function extractTableAfterAnchor(
  docXml: string,
  anchor: string,
  searchFrom = 500000,
): { start: number; end: number; tableXml: string } | null {
  const anchorPos = docXml.indexOf(anchor, searchFrom);
  if (anchorPos === -1) return null;

  const tblStart = docXml.indexOf('<w:tbl>', anchorPos);
  if (tblStart === -1 || tblStart - anchorPos > 12000) return null;

  let depth = 0;
  let tblEnd = -1;
  for (let i = tblStart; i < docXml.length; i++) {
    if (docXml.startsWith('<w:tbl>', i)) depth++;
    if (docXml.startsWith('</w:tbl>', i)) {
      depth--;
      if (depth === 0) {
        tblEnd = i + 8;
        break;
      }
    }
  }
  if (tblEnd === -1) return null;

  return { start: tblStart, end: tblEnd, tableXml: docXml.substring(tblStart, tblEnd) };
}

function applyExcelToReviewTable(
  tableXml: string,
  matchingRows: Record<string, unknown>[],
  xmlEscape: (s: string) => string,
): string {
  const rowMatches = [...tableXml.matchAll(/<w:tr[\s>][\s\S]*?<\/w:tr>/g)];
  if (rowMatches.length < 2) return tableXml;

  const rows = rowMatches.map((m) => m[0]);
  const headerRow = rows[0];
  const headers = extractRowCellTexts(headerRow);

  let nilIdx = rows.findIndex((r, i) => i > 0 && rowIsNil(r));
  if (nilIdx === -1) nilIdx = 1;

  const nilTemplate = rows[nilIdx];
  const colCount = headers.length;

  let dataRowsXml: string;
  if (matchingRows.length === 0) {
    dataRowsXml = buildNilRow(colCount, nilTemplate, xmlEscape);
  } else {
    dataRowsXml = matchingRows
      .map((row, i) => buildDataRow(headers, row, i + 1, xmlEscape))
      .join('');
  }

  const keptTail: string[] = [];
  for (let i = nilIdx + 1; i < rows.length; i++) {
    if (matchingRows.length > 0 && rowIsRemarkBoilerplate(rows[i])) continue;
    keptTail.push(rows[i]);
  }

  const newRows = [headerRow, dataRowsXml, ...keptTail].join('');
  const tblPr = tableXml.match(/<w:tblPr>[\s\S]*?<\/w:tblPr>/)?.[0] || '';
  const tblGrid = tableXml.match(/<w:tblGrid>[\s\S]*?<\/w:tblGrid>/)?.[0] || '';
  return `<w:tbl>${tblPr}${tblGrid}${newRows}</w:tbl>`;
}

export function applyApqrExcelReviewSections(
  docXml: string,
  batchNumbers: string[],
  catalog: ReviewExcelCatalog,
  xmlEscape: (s: string) => string,
): { docXml: string; results: ApqrReviewSectionApplyResult[] } {
  const batchSet = new Set(batchNumbers.map((b) => b.trim().toUpperCase()));
  const results: ApqrReviewSectionApplyResult[] = [];
  let xml = docXml;

  for (const sec of APQR_EXCEL_REVIEW_SECTIONS) {
    const fileMeta = catalog.files.find((f) => f.fileName === sec.fileName);
    if (!fileMeta?.exists) {
      results.push({
        section: sec.section,
        title: sec.title,
        reviewName: sec.reviewName,
        fileName: sec.fileName,
        status: 'no-excel-file',
      });
      continue;
    }

    const tableLoc = extractTableAfterAnchor(xml, sec.anchor);
    if (!tableLoc) {
      results.push({
        section: sec.section,
        title: sec.title,
        reviewName: sec.reviewName,
        fileName: sec.fileName,
        status: 'table-not-found',
      });
      continue;
    }

    const allRows = catalog.allRowsByReview[sec.reviewName] || [];
    const matchingRows = filterReviewRowsForBatches(allRows, batchSet);
    const newTable = applyExcelToReviewTable(tableLoc.tableXml, matchingRows, xmlEscape);
    xml = xml.substring(0, tableLoc.start) + newTable + xml.substring(tableLoc.end);

    results.push({
      section: sec.section,
      title: sec.title,
      reviewName: sec.reviewName,
      fileName: sec.fileName,
      status: matchingRows.length > 0 ? 'filled' : 'nil',
      rowCount: matchingRows.length,
    });
  }

  return { docXml: xml, results };
}

export function logApqrReviewSectionReport(
  excelResults: ApqrReviewSectionApplyResult[],
): void {
  console.log('\n📋 APQR Review Sections (Excel-backed):');
  for (const r of excelResults) {
    if (r.status === 'filled') {
      console.log(`  ✅ §${r.section} ${r.title}: ${r.rowCount} row(s) from ${r.fileName}`);
    } else if (r.status === 'nil') {
      console.log(`  ○ §${r.section} ${r.title}: NIL (no matching batch rows in ${r.fileName})`);
    } else if (r.status === 'no-excel-file') {
      console.log(`  — §${r.section} ${r.title}: template unchanged (${r.fileName} not found)`);
    } else {
      console.log(`  ⚠️ §${r.section} ${r.title}: table not found in template`);
    }
  }

  console.log('\n📋 APQR Review Sections (template unchanged — no Excel source):');
  for (const s of APQR_TEMPLATE_ONLY_REVIEW_SECTIONS) {
    console.log(`  · §${s.section} ${s.title}`);
  }
}
