'use client';

/**
 * Product Master Page
 * Displays all product master data from the database
 * Two views: MFC-wise and Product Code-wise with Excel export
 */

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import * as XLSX from 'xlsx-js-style';

interface ProductMaster {
  _id: string;
  productCode: string;
  productName: string;
  department: string;
  masterCardNo: string;
  storageCondition: string;
  productType: string;
  therapeuticCategory: string;
  sourceFile: string;
  genericName?: string;
  specification?: string;
  effectiveBatchNo?: string;
  effectiveDate?: string;
  revisionNo?: string;
  workStatus?: string;
  mfgLicenseNo?: string;
  liveMonth?: string;
  batchSize?: string;
  batchUom?: string;
  locationCode?: string;
}

interface MissingProduct {
  itemCode: string;
  itemName: string;
  department: string;
  productType: string;
  batchCount: number;
  sampleBatchNumbers: string[];
}

type ViewMode = 'mfc' | 'product' | 'effective-batch' | 'batch';
type SortField = 'therapeuticCategory' | 'productName' | 'productCode' | 'genericName' | 'department' | 'masterCardNo' | 'storageCondition' | 'productType' | 'specification' | 'effectiveBatchNo' | 'srNo' | 'status';

function isPlaceboOrMediafillProductName(name: string | null | undefined): boolean {
  const n = (name ?? '').trim();
  if (!n) return false;
  return /\b(placebo|media\s*fill|mediafill)\b/i.test(n);
}
type SortDirection = 'asc' | 'desc' | null;

type MfgStatusFilter = 'manufactured' | 'non-manufactured' | 'all';
type YearFilter = 'all' | string;
type ErrorPrimaryFilter = 'none' | 'all' | 'missing' | 'mismatch';
type MismatchSubtypeFilter = null | 'storage' | 'therapeutic' | 'effective-batch';

type BatchSummary = { batchCount: number; years: string[]; minMfgDate?: string };

// Helper to check if a field has missing/invalid data
const MISSING_VALUES = new Set(['n/a', 'na', 'nil', 'null', 'none', '-', '--', 'n.a.', 'n.a', '0', 'undefined', 'not available', 'not applicable']);
const isMissingData = (value: string | undefined | null): boolean => {
  if (value === null || value === undefined) return true;
  const trimmed = value.trim();
  if (trimmed === '') return true;
  if (MISSING_VALUES.has(trimmed.toLowerCase())) return true;
  // Flag values composed entirely of non-word characters (symbols like ©, °, • etc.)
  // Any real field value must contain at least one letter or digit
  if (!/\w/.test(trimmed)) return true;
  return false;
};

// Separate validity check for Effective Batch — '0' is the root of the hierarchy and must NOT
// be treated as missing. All other N/A-like placeholders are still invalid.
const EFF_BATCH_MISSING_VALUES = new Set(['n/a', 'na', 'nil', 'null', 'none', '-', '--', 'n.a.', 'n.a', 'undefined', 'not available', 'not applicable']);
const isValidEffBatch = (value: string | undefined | null): boolean => {
  if (value === null || value === undefined) return false;
  const trimmed = value.trim();
  if (trimmed === '') return false;
  if (EFF_BATCH_MISSING_VALUES.has(trimmed.toLowerCase())) return false;
  if (!/\w/.test(trimmed)) return false;
  return true;
};

// Dynamic column config — all table fields to be checked for missing data.
// Adding a new field here is the ONLY change needed to include it in the Missing filter.
// Provide an optional `check` function to override the default isMissingData logic for a field.
const TABLE_FIELD_CONFIG: Array<{
  key: keyof ProductMaster;
  label: string;
  check?: (val: string | undefined | null) => boolean;
}> = [
  { key: 'productCode',         label: 'Product Code' },
  { key: 'genericName',         label: 'Generic Name' },
  { key: 'masterCardNo',        label: 'Master Card No' },
  { key: 'therapeuticCategory', label: 'Therapeutic Category' },
  { key: 'productName',         label: 'Product Name' },
  { key: 'department',          label: 'Department' },
  { key: 'storageCondition',    label: 'Storage Condition' },
  { key: 'productType',         label: 'Product Type' },
  { key: 'specification',       label: 'Specification' },
  // '0' is a valid root-level eff. batch — use isValidEffBatch instead of isMissingData
  { key: 'effectiveBatchNo',    label: 'Effective Batch No', check: v => !isValidEffBatch(v) },
  { key: 'mfgLicenseNo',        label: 'Mfg License No' },
];

// Dynamic: returns all fields in TABLE_FIELD_CONFIG that have missing/invalid data.
// Uses each field's custom `check` function if provided, otherwise falls back to isMissingData.
const getMissingFields = (item: ProductMaster): string[] =>
  TABLE_FIELD_CONFIG
    .filter(({ key, check }) => {
      const val = item[key] as string | undefined | null;
      return check ? check(val) : isMissingData(val);
    })
    .map(({ label }) => label);

const normalizeForCompare = (value: string | undefined | null): string => {
  if (value === null || value === undefined) return '';
  return String(value).trim().toLowerCase();
};

const normalizeEffBatch = (value: string | undefined | null): string => {
  const s = value === null || value === undefined ? '' : String(value).trim();
  return s;
};

const effBatchConnected = (aRaw: string | undefined | null, bRaw: string | undefined | null): boolean => {
  const a = normalizeEffBatch(aRaw);
  const b = normalizeEffBatch(bRaw);
  if (!a || !b) return false;
  if (a === b) return true;
  return a.startsWith(b) || b.startsWith(a);
};

const compareEffBatchForParent = (aRaw: string | undefined | null, bRaw: string | undefined | null): number => {
  const a = normalizeEffBatch(aRaw);
  const b = normalizeEffBatch(bRaw);
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  const ai = Number.parseInt(a, 10);
  const bi = Number.parseInt(b, 10);
  const aNumOk = Number.isFinite(ai);
  const bNumOk = Number.isFinite(bi);
  if (aNumOk && bNumOk && ai !== bi) return ai - bi;
  if (a.length !== b.length) return a.length - b.length;
  return a.localeCompare(b);
};

function computeMismatchMap(items: ProductMaster[]) {
  // Returns per-productCode mismatch flags + group membership.
  //
  // Storage Condition & Therapeutic Category:  majority-vote within each MFC group.
  //   - Products whose value differs from the majority are flagged (wrong).
  //   - Products whose value matches the majority are NOT flagged (correct/green).
  //   - All products in a group with any mismatch get inStorageGroup / inTherapeuticGroup
  //     so they can be shown in context (correct ones in green, wrong ones in amber).
  //
  // Effective Batch: parent-based hierarchy connectivity check.
  //   - Parent = product with the smallest effectiveBatch, then lexicographically first code.
  //   - Any product whose effectiveBatch is not "connected" to the parent's is flagged.
  //
  // Only products with a valid (non-N/A) masterCardNo are grouped.

  const byMfc = new Map<string, ProductMaster[]>();
  for (const it of items) {
    const mfc = (it.masterCardNo || '').trim();
    if (!mfc || isMissingData(mfc)) continue;
    if (!byMfc.has(mfc)) byMfc.set(mfc, []);
    byMfc.get(mfc)!.push(it);
  }

  const mismatchByCode = new Map<string, {
    any: boolean;
    storage: boolean;
    therapeutic: boolean;
    effectiveBatch: boolean;
    inStorageGroup: boolean;
    inTherapeuticGroup: boolean;
    inEffBatchGroup: boolean;
  }>();

  const ensure = (code: string) => {
    if (!mismatchByCode.has(code)) {
      mismatchByCode.set(code, {
        any: false, storage: false, therapeutic: false, effectiveBatch: false,
        inStorageGroup: false, inTherapeuticGroup: false, inEffBatchGroup: false,
      });
    }
    return mismatchByCode.get(code)!;
  };

  // Returns the most frequent value from an array of normalised strings.
  const getMajority = (values: string[]): string | null => {
    if (values.length === 0) return null;
    const counts = new Map<string, number>();
    for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
    let max = 0;
    let majority: string | null = null;
    for (const [v, c] of counts) { if (c > max) { max = c; majority = v; } }
    return majority;
  };

  for (const [, group] of byMfc) {
    if (group.length < 2) continue;

    // ── Storage Condition ─────────────────────────────────────────────────────
    const validStorages = group
      .filter(g => !isMissingData(g.storageCondition))
      .map(g => normalizeForCompare(g.storageCondition));
    const hasStorageMismatch = new Set(validStorages).size > 1;
    const majorityStorage = hasStorageMismatch ? getMajority(validStorages) : null;

    // ── Therapeutic Category ──────────────────────────────────────────────────
    const validTheras = group
      .filter(g => !isMissingData(g.therapeuticCategory))
      .map(g => normalizeForCompare(g.therapeuticCategory));
    const hasTherapeuticMismatch = new Set(validTheras).size > 1;
    const majorityThera = hasTherapeuticMismatch ? getMajority(validTheras) : null;

    // ── Effective Batch: parent-based ─────────────────────────────────────────
    let smallest = group[0].effectiveBatchNo;
    for (const g of group) {
      if (compareEffBatchForParent(g.effectiveBatchNo, smallest) < 0) smallest = g.effectiveBatchNo;
    }
    const smallestSet = group.filter(g => compareEffBatchForParent(g.effectiveBatchNo, smallest) === 0);
    smallestSet.sort((a, b) => (a.productCode || '').localeCompare(b.productCode || ''));
    const parent = smallestSet[0];
    const pEffOk = isValidEffBatch(parent.effectiveBatchNo);
    const pEff   = normalizeEffBatch(parent.effectiveBatchNo);

    let hasEffBatchMismatch = false;
    for (const g of group) {
      if (pEffOk && isValidEffBatch(g.effectiveBatchNo)) {
        if (!effBatchConnected(normalizeEffBatch(g.effectiveBatchNo), pEff)) {
          hasEffBatchMismatch = true;
          break;
        }
      }
    }

    // ── Flag every product in the group ──────────────────────────────────────
    for (const g of group) {
      const code = (g.productCode || '').trim();
      if (!code) continue;
      const entry = ensure(code);

      if (hasStorageMismatch) {
        entry.inStorageGroup = true;
        if (!isMissingData(g.storageCondition)) {
          if (normalizeForCompare(g.storageCondition) !== majorityStorage) {
            entry.storage = true;
            entry.any = true;
          }
        }
      }

      if (hasTherapeuticMismatch) {
        entry.inTherapeuticGroup = true;
        if (!isMissingData(g.therapeuticCategory)) {
          if (normalizeForCompare(g.therapeuticCategory) !== majorityThera) {
            entry.therapeutic = true;
            entry.any = true;
          }
        }
      }

      if (hasEffBatchMismatch) {
        entry.inEffBatchGroup = true;
        if (pEffOk && isValidEffBatch(g.effectiveBatchNo)) {
          if (!effBatchConnected(normalizeEffBatch(g.effectiveBatchNo), pEff)) {
            entry.effectiveBatch = true;
            entry.any = true;
          }
        }
      }
    }
  }

  return mismatchByCode;
}

// Helper to export to Excel
const exportToExcel = (
  data: ProductMaster[],
  viewMode: ViewMode,
  totalCount: number,
  filters: {
    searchTerm: string;
    mfgStatus: MfgStatusFilter;
    year: YearFilter;
    errorPrimary: ErrorPrimaryFilter;
    errorDetail: string | null;
    mismatchSubtype: MismatchSubtypeFilter;
  },
  mismatchMap?: ReturnType<typeof computeMismatchMap>
) => {
  if (data.length === 0) {
    alert('No data to export');
    return;
  }

  const viewLabel: Record<ViewMode, string> = {
    product: 'Product Code-Wise',
    mfc: 'MFC-Wise',
    'effective-batch': 'Effective Batch-Wise',
    batch: 'Batch-Wise',
  };

  const errorFilterLabels: Record<string, string> = {
    'mfg-missing': 'MFG Missing',
    'has-errors': 'Has Field Errors',
  };
  // Dynamically resolve field-key error detail labels from TABLE_FIELD_CONFIG
  const getErrorDetailLabel = (detail: string | null): string => {
    if (!detail) return '';
    if (errorFilterLabels[detail]) return errorFilterLabels[detail];
    const field = TABLE_FIELD_CONFIG.find(f => f.key === detail);
    return field ? `Missing ${field.label}` : detail;
  };

  const activeFilters: string[] = [];
  if (filters.searchTerm) activeFilters.push(`Search: "${filters.searchTerm}"`);
  if (filters.mfgStatus !== 'manufactured') activeFilters.push(`Manufacturing Status: ${filters.mfgStatus}`);
  if (filters.year !== 'all') activeFilters.push(`Manufacturing Year: ${filters.year}`);
  if (filters.errorPrimary !== 'none') activeFilters.push(`Error Type: ${filters.errorPrimary}`);
  if (filters.errorDetail) activeFilters.push(`Error Detail: ${getErrorDetailLabel(filters.errorDetail)}`);
  if (filters.mismatchSubtype) activeFilters.push(`Mismatch Detail: ${filters.mismatchSubtype}`);
  const q = (s: string) => `"${String(s).replace(/"/g, '""')}"`;

  const headers = [
    'SR No',
    'Product Code',
    'Generic Name',
    'Master Card No',
    'Therapeutic Category',
    'Product Name',
    'Department',
    'Storage Condition',
    'Product Type',
    'Specification',
    'Effective Batch No',
    'Errors'
  ];

  const rows = data.map((item, index) => {
    const errors = getMissingFields(item);
    const notMfg = item.sourceFile === 'added-from-batch-data';
    const code = (item.productCode || '').trim();
    const m = mismatchMap?.get(code);
    const mismatches: string[] = [];
    if (m?.storage) mismatches.push('Storage Condition');
    if (m?.therapeutic) mismatches.push('Therapeutic Category');
    if (m?.effectiveBatch) mismatches.push('Effective Batch');
    const statusParts: string[] = [];
    if (notMfg) statusParts.push('MFG MISSING');
    if (errors.length > 0) statusParts.push(`MISSING: ${errors.join(', ')}`);
    if (mismatches.length > 0) statusParts.push(`MISMATCH: ${mismatches.join(', ')}`);
    if (statusParts.length === 0) statusParts.push('OK');

    return [
      index + 1,
      item.productCode || 'N/A',
      item.genericName || '',
      item.masterCardNo || 'N/A',
      item.therapeuticCategory || 'N/A',
      item.productName || 'N/A',
      item.department || 'N/A',
      item.storageCondition || 'N/A',
      item.productType || 'N/A',
      item.specification || '',
      item.effectiveBatchNo || '',
      statusParts.join(' | ')
    ];
  });

  // Export only the table (no summary block)
  const csvContent = [
    headers.map(h => q(h)).join(','),
    ...rows.map(row => row.map(cell => q(String(cell))).join(','))
  ].join('\n');

  // Build a concise filename that reflects active filters
  const filterSuffix = activeFilters.length > 0
    ? '_' + activeFilters
        .map(f => f.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, ''))
        .join('-')
        .slice(0, 60)
    : '';

  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `Product_Master_${viewLabel[viewMode].replace(/\s+/g, '_')}${filterSuffix}_${new Date().toISOString().split('T')[0]}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

// Export Effective Batch view as a real .xlsx file with one sheet per batch group
const exportEffectiveBatchToExcel = (
  data: ProductMaster[],
  errorsOnly: boolean,
  mismatchMap?: ReturnType<typeof computeMismatchMap>
) => {
  if (data.length === 0) {
    alert('No data to export');
    return;
  }

  // Build groups (same logic as render)
  const groupMap = new Map<string, ProductMaster[]>();
  data.forEach(item => {
    const raw = item.effectiveBatchNo;
    const normalized = (raw !== null && raw !== undefined) ? String(raw).trim() : '';
    const key = normalized === '' ? '__null__' : normalized;
    if (!groupMap.has(key)) groupMap.set(key, []);
    groupMap.get(key)!.push(item);
  });

  const isBottomKey = (k: string) => k === '0' || k === '__null__';
  const sortedKeys = Array.from(groupMap.keys()).sort((a, b) => {
    const aBottom = isBottomKey(a);
    const bBottom = isBottomKey(b);
    if (aBottom && bBottom) {
      if (a === '__null__' && b !== '__null__') return 1;
      if (b === '__null__' && a !== '__null__') return -1;
      return 0;
    }
    if (aBottom) return 1;
    if (bBottom) return -1;
    const aNum = parseFloat(a);
    const bNum = parseFloat(b);
    if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
    return a.localeCompare(b);
  });

  const headers = [
    'SR No', 'Product Code', 'Generic Name', 'Master Card No',
    'Therapeutic Category', 'Product Name', 'Department',
    'Storage Condition', 'Product Type', 'Specification',
    'Effective Batch No', 'Errors',
  ];

  const wb = XLSX.utils.book_new();

  // ARGB colors (xlsx-js-style uses 'AARRGGBB' format)
  const CLR = {
    red:        'FFEF4444',
    amber:      'FFD97706',
    green:      'FF059669',
    bgRed:      'FFFEF2F2',
    bgAmber:    'FFFEF3C7',
    bgGreen:    'FFF0FDF4',
    bgWhite:    'FFFFFFFF',
    bgAlt:      'FFF8FAFC',
    headerBg:   'FF1E293B',
    headerFg:   'FFFFFFFF',
    border:     'FFE2E8F0',
  };

  const baseFont = { name: 'Calibri', sz: 10 };
  const baseBorder = {
    top:    { style: 'thin', color: { rgb: CLR.border } },
    bottom: { style: 'thin', color: { rgb: CLR.border } },
    left:   { style: 'thin', color: { rgb: CLR.border } },
    right:  { style: 'thin', color: { rgb: CLR.border } },
  };

  sortedKeys.forEach(key => {
    const products = groupMap.get(key)!;
    const filtered = errorsOnly
      ? products.filter(p => {
          const code = (p.productCode || '').trim();
          const m = mismatchMap?.get(code);
          return getMissingFields(p).length > 0 || p.sourceFile === 'added-from-batch-data' || Boolean(m?.any);
        })
      : products;

    if (filtered.length === 0) return; // skip empty sheets when errors-only

    // Build per-row metadata for styling
    type RowMeta = {
      notMfg: boolean; hasMissing: boolean; hasMismatch: boolean;
      storMismatch: boolean; theraMismatch: boolean; effMismatch: boolean;
      missingFields: string[];
    };
    const rowMeta: RowMeta[] = [];

    const rows = filtered.map((item, idx) => {
      const errors = getMissingFields(item);
      const notMfg = item.sourceFile === 'added-from-batch-data';
      const code = (item.productCode || '').trim();
      const m = mismatchMap?.get(code);
      const mismatches: string[] = [];
      if (m?.storage) mismatches.push('Storage Condition');
      if (m?.therapeutic) mismatches.push('Therapeutic Category');
      if (m?.effectiveBatch) mismatches.push('Effective Batch');
      rowMeta.push({
        notMfg, hasMissing: errors.length > 0, hasMismatch: mismatches.length > 0,
        storMismatch: Boolean(m?.storage), theraMismatch: Boolean(m?.therapeutic),
        effMismatch: Boolean(m?.effectiveBatch), missingFields: errors,
      });
      const statusParts: string[] = [];
      if (notMfg) statusParts.push('MFG MISSING');
      if (errors.length > 0) statusParts.push(`MISSING: ${errors.join(', ')}`);
      if (mismatches.length > 0) statusParts.push(`MISMATCH: ${mismatches.join(', ')}`);
      if (statusParts.length === 0) statusParts.push('OK');
      return [
        idx + 1,
        item.productCode || 'N/A',
        item.genericName || '',
        item.masterCardNo || 'N/A',
        item.therapeuticCategory || 'N/A',
        item.productName || 'N/A',
        item.department || 'N/A',
        item.storageCondition || 'N/A',
        item.productType || 'N/A',
        item.specification || '',
        item.effectiveBatchNo || '',
        statusParts.join(' | '),
      ];
    });

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

    // ── Apply cell styles ───────────────────────────────────
    // Header row
    for (let c = 0; c < headers.length; c++) {
      const ref = XLSX.utils.encode_cell({ r: 0, c });
      if (!ws[ref]) continue;
      ws[ref].s = {
        font: { ...baseFont, bold: true, color: { rgb: CLR.headerFg } },
        fill: { patternType: 'solid', fgColor: { rgb: CLR.headerBg } },
        alignment: { horizontal: 'center', wrapText: false },
        border: baseBorder,
      };
    }

    // Data rows
    filtered.forEach((item, idx) => {
      const meta = rowMeta[idx];
      const r = idx + 1;

      // Row background
      let rowBg = idx % 2 === 0 ? CLR.bgWhite : CLR.bgAlt;
      if (meta.hasMissing || meta.notMfg) rowBg = CLR.bgRed;
      else if (meta.hasMismatch) rowBg = CLR.bgAmber;

      for (let c = 0; c < headers.length; c++) {
        const ref = XLSX.utils.encode_cell({ r, c });
        if (!ws[ref]) ws[ref] = { t: 's', v: '' };

        const cellFill = { patternType: 'solid', fgColor: { rgb: rowBg } };
        let fontColor = ''; // empty = default (dark)
        let cellOverrideFill: typeof cellFill | null = null;

        // Column-specific overrides
        if (c === 1 && isMissingData(item.productCode))   fontColor = CLR.red;
        if (c === 3 && isMissingData(item.masterCardNo))  fontColor = CLR.red;
        if (c === 5 && isMissingData(item.productName))   fontColor = CLR.red;
        if (c === 6 && isMissingData(item.department))    fontColor = CLR.red;

        // Therapeutic Category (col 4)
        if (c === 4) {
          if (isMissingData(item.therapeuticCategory)) { fontColor = CLR.red; }
          else if (meta.theraMismatch) { fontColor = CLR.amber; cellOverrideFill = { patternType: 'solid', fgColor: { rgb: CLR.bgAmber } }; }
        }
        // Storage Condition (col 7)
        if (c === 7) {
          if (isMissingData(item.storageCondition)) { fontColor = CLR.red; }
          else if (meta.storMismatch) { fontColor = CLR.amber; cellOverrideFill = { patternType: 'solid', fgColor: { rgb: CLR.bgAmber } }; }
        }
        // Effective Batch No (col 10)
        if (c === 10) {
          if (meta.effMismatch) { fontColor = CLR.amber; cellOverrideFill = { patternType: 'solid', fgColor: { rgb: CLR.bgAmber } }; }
        }

        // Status cell (col 11)
        if (c === 11) {
          const statusVal = String(ws[ref].v || '');
          if (statusVal === 'OK') {
            fontColor = CLR.green;
            cellOverrideFill = { patternType: 'solid', fgColor: { rgb: CLR.bgGreen } };
          } else if (statusVal.includes('MISSING')) {
            fontColor = CLR.red;
          } else if (statusVal.includes('MISMATCH')) {
            fontColor = CLR.amber;
          }
        }

        ws[ref].s = {
          font: { ...baseFont, ...(fontColor ? { color: { rgb: fontColor }, bold: c === 11 } : {}) },
          fill: cellOverrideFill ?? cellFill,
          border: baseBorder,
          alignment: c === 0 ? { horizontal: 'center' } : {},
        };
      }
    });

    // Column widths
    ws['!cols'] = [
      { wch: 6 }, { wch: 14 }, { wch: 20 }, { wch: 16 },
      { wch: 22 }, { wch: 28 }, { wch: 14 }, { wch: 18 },
      { wch: 14 }, { wch: 12 }, { wch: 16 }, { wch: 40 },
    ];

    const sheetName = key === '__null__'
      ? 'No Eff Batch'
      : key === '0'
        ? 'Eff Batch 0'
        : `Eff Batch ${key}`;

    XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31)); // Excel max 31 chars
  });

  if (wb.SheetNames.length === 0) {
    alert('No records with errors found.');
    return;
  }

  const suffix = errorsOnly ? '_Errors_Only' : '_Full_Data';
  const dateStr = new Date().toISOString().split('T')[0];
  XLSX.writeFile(wb, `Product_Master_Effective_Batch${suffix}_${dateStr}.xlsx`);
};

export default function ProductMasterPage() {
  const [data, setData] = useState<ProductMaster[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('product');
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);

  // Export modal state (effective-batch view)
  const [showExportModal, setShowExportModal] = useState(false);

  // Manufacturing status filter (top-down hierarchy)
  const [mfgStatus, setMfgStatus] = useState<MfgStatusFilter>('manufactured');
  const [mfgYear, setMfgYear] = useState<YearFilter>('all');

  // Error filters (Missing / Mismatch)
  const [errorPrimary, setErrorPrimary] = useState<ErrorPrimaryFilter>('none');
  const [errorDetail, setErrorDetail] = useState<string | null>(null); // existing missing-detail keys
  const [mismatchSubtype, setMismatchSubtype] = useState<MismatchSubtypeFilter>(null);

  // Batch summary (per productCode)
  const [batchSummary, setBatchSummary] = useState<Record<string, BatchSummary>>({});
  const [batchSummaryLoading, setBatchSummaryLoading] = useState(false);

  const resetFiltersToDefault = () => {
    setSearchTerm('');
    setViewMode('product');
    setSortField(null);
    setSortDirection(null);
    setMfgStatus('manufactured');
    setMfgYear('all');
    setErrorPrimary('none');
    setErrorDetail(null);
    setMismatchSubtype(null);
  };

  // Effective Batch grouped view — tracks which groups are expanded
  const [expandedEffBatchGroups, setExpandedEffBatchGroups] = useState<Set<string>>(new Set());

  const toggleEffBatchGroup = (key: string) => {
    setExpandedEffBatchGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const expandAllEffBatchGroups = (keys: string[]) => setExpandedEffBatchGroups(new Set(keys));
  const collapseAllEffBatchGroups = () => setExpandedEffBatchGroups(new Set());

  // Batch-wise grouped view — tracks which batch folders are expanded
  const [expandedBatchGroups, setExpandedBatchGroups] = useState<Set<string>>(new Set());

  const toggleBatchGroup = (key: string) => {
    setExpandedBatchGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const expandAllBatchGroups = (keys: string[]) => setExpandedBatchGroups(new Set(keys));
  const collapseAllBatchGroups = () => setExpandedBatchGroups(new Set());

  // Batch-wise view data: batchNumber → productCode[]
  // fetched lazily from /api/batch/by-codes when the view is first activated
  const [batchLinkMap, setBatchLinkMap] = useState<Map<string, string[]> | null>(null);
  const [batchViewLoading, setBatchViewLoading] = useState(false);

  useEffect(() => {
    if (viewMode !== 'batch' || data.length === 0) return;
    const productCodes = [...new Set(data.map(d => d.productCode).filter(Boolean))];
    setBatchViewLoading(true);
    setBatchLinkMap(null);
    fetch('/api/batch/by-codes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productCodes }),
    })
      .then(r => r.json())
      .then(json => {
        const map = new Map<string, string[]>();
        if (json.success && Array.isArray(json.data)) {
          json.data.forEach((item: { batchNumber: string; itemCode: string }) => {
            if (!map.has(item.batchNumber)) map.set(item.batchNumber, []);
            if (!map.get(item.batchNumber)!.includes(item.itemCode)) {
              map.get(item.batchNumber)!.push(item.itemCode);
            }
          });
        }
        setBatchLinkMap(map);
      })
      .catch(err => { console.error('Failed to fetch batch link data', err); setBatchLinkMap(new Map()); })
      .finally(() => setBatchViewLoading(false));
  }, [viewMode, data]);

  // Missing products state
  const [missingProducts, setMissingProducts] = useState<MissingProduct[]>([]);
  const [showMissingPanel, setShowMissingPanel] = useState(false);
  const [checkingMissing, setCheckingMissing] = useState(false);
  const [addingProducts, setAddingProducts] = useState(false);
  const [selectedMissing, setSelectedMissing] = useState<Set<string>>(new Set());
  const [missingStats, setMissingStats] = useState<{ totalMissing: number; totalBatchProducts: number } | null>(null);
  const [addMessage, setAddMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const checkMissingProducts = async () => {
    setCheckingMissing(true);
    setAddMessage(null);
    setSelectedMissing(new Set());
    try {
      const res = await fetch('/api/product-master/missing');
      const json = await res.json();
      if (json.success) {
        setMissingProducts(json.missing);
        setMissingStats({ totalMissing: json.totalMissing, totalBatchProducts: json.totalBatchProducts });
        setShowMissingPanel(true);
      }
    } catch (err) {
      console.error('Failed to check missing products', err);
    }
    setCheckingMissing(false);
  };

  const toggleSelectMissing = (itemCode: string) => {
    setSelectedMissing(prev => {
      const next = new Set(prev);
      if (next.has(itemCode)) next.delete(itemCode);
      else next.add(itemCode);
      return next;
    });
  };

  const selectAllMissing = () => {
    setSelectedMissing(new Set(missingProducts.map(p => p.itemCode)));
  };

  const deselectAllMissing = () => {
    setSelectedMissing(new Set());
  };

  const addSelectedToMaster = async () => {
    if (selectedMissing.size === 0) return;
    setAddingProducts(true);
    setAddMessage(null);
    try {
      const toAdd = missingProducts.filter(p => selectedMissing.has(p.itemCode));
      const res = await fetch('/api/product-master/missing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ products: toAdd.map(p => ({ itemCode: p.itemCode, itemName: p.itemName, department: p.department, productType: p.productType })) }),
      });
      const json = await res.json();
      if (json.success) {
        setAddMessage({ type: 'success', text: json.message });
        // Refresh missing list and main data
        await checkMissingProducts();
        await fetchData(searchTerm);
      } else {
        setAddMessage({ type: 'error', text: json.message });
      }
    } catch (err) {
      setAddMessage({ type: 'error', text: 'Failed to add products. Please try again.' });
    }
    setAddingProducts(false);
  };

  const fetchData = async (search: string) => {
    setLoading(true);
    try {
      // Fetch ALL data without pagination
      const res = await fetch(`/api/product-master?page=1&limit=10000&search=${encodeURIComponent(search)}`);
      const json = await res.json();
      if (json.success) {
        const filtered = (json.data as ProductMaster[]).filter((item) => !isPlaceboOrMediafillProductName(item.productName));
        setData(filtered);
        setTotal(filtered.length);
      }
    } catch (err) {
      console.error('Failed to fetch data', err);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData(searchTerm);
  }, [searchTerm]);

  // Fetch per-product batch summary (batchCount + years)
  useEffect(() => {
    if (data.length === 0) {
      setBatchSummary({});
      return;
    }
    const productCodes = [...new Set(data.map(d => d.productCode).filter(Boolean))];
    if (productCodes.length === 0) {
      setBatchSummary({});
      return;
    }
    setBatchSummaryLoading(true);
    fetch('/api/batch/summary-by-codes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productCodes }),
    })
      .then(r => r.json())
      .then(json => {
        if (json?.success && json?.data && typeof json.data === 'object') {
          setBatchSummary(json.data as Record<string, BatchSummary>);
        } else {
          setBatchSummary({});
        }
      })
      .catch(err => {
        console.error('Failed to fetch batch summary', err);
        setBatchSummary({});
      })
      .finally(() => setBatchSummaryLoading(false));
  }, [data]);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  };

  // Handle column sorting
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      // Cycle through: asc -> desc -> null
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else if (sortDirection === 'desc') {
        setSortDirection(null);
        setSortField(null);
      }
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Sort data based on view mode and column sorting
  const getBatchCount = (itemCode: string | undefined | null) => {
    const code = (itemCode || '').trim();
    return code ? (batchSummary[code]?.batchCount ?? 0) : 0;
  };
  const isManufactured = (item: ProductMaster) => getBatchCount(item.productCode) > 0;
  const isNonManufactured = (item: ProductMaster) => getBatchCount(item.productCode) === 0;

  const getStatusValue = (item: ProductMaster): number => {
    // Status sort order: OK (0) > Non-manufactured (1) > Errors (2)
    if (isNonManufactured(item)) return 1;
    if (getMissingFields(item).length > 0) return 2;
    return 0;
  };

  const getSortedData = () => {
    let sorted = [...data];

    // Apply column sorting if active
    if (sortField && sortDirection) {
      sorted.sort((a, b) => {
        let comparison = 0;

        if (sortField === 'srNo') {
          // Sort by original order (index in data array)
          const aIndex = data.indexOf(a);
          const bIndex = data.indexOf(b);
          comparison = aIndex - bIndex;
        } else if (sortField === 'status') {
          // Sort by status (OK > MFG MISSING > Errors)
          const aStatus = getStatusValue(a);
          const bStatus = getStatusValue(b);
          comparison = aStatus - bStatus;
        } else if (sortField === 'effectiveBatchNo') {
          // null/missing first → shorter length first → lexicographic within same length
          const aVal = normalizeEffBatch(a.effectiveBatchNo);
          const bVal = normalizeEffBatch(b.effectiveBatchNo);
          if (!aVal && !bVal) comparison = 0;
          else if (!aVal) comparison = -1;
          else if (!bVal) comparison = 1;
          else if (aVal.length !== bVal.length) comparison = aVal.length - bVal.length;
          else comparison = aVal.localeCompare(bVal);
        } else {
          const aValue = (a[sortField as keyof ProductMaster] || 'ZZZ').toString().toLowerCase();
          const bValue = (b[sortField as keyof ProductMaster] || 'ZZZ').toString().toLowerCase();
          comparison = aValue.localeCompare(bValue);
        }

        return sortDirection === 'asc' ? comparison : -comparison;
      });
    } else {
      // Default sorting based on view mode
      if (viewMode === 'mfc') {
        // Sort by Master Card No
        sorted.sort((a, b) => {
          const mfcA = a.masterCardNo || 'ZZZ';
          const mfcB = b.masterCardNo || 'ZZZ';
          return mfcA.localeCompare(mfcB);
        });
      } else {
        // Sort by Product Code
        sorted.sort((a, b) => {
          const codeA = a.productCode || 'ZZZ';
          const codeB = b.productCode || 'ZZZ';
          return codeA.localeCompare(codeB);
        });
      }
    }

    return sorted;
  };

  const baseSorted = getSortedData();
  const tableColSpan = viewMode === 'batch' ? 11 : 12;

  // Manufacturing status counts (based on current dataset + batch summary)
  const manufacturedCount = baseSorted.filter(isManufactured).length;
  const nonManufacturedCount = baseSorted.filter(isNonManufactured).length;

  // Year counts (manufactured only)
  const yearToCount = new Map<string, number>();
  for (const it of baseSorted) {
    if (!isManufactured(it)) continue;
    const code = (it.productCode || '').trim();
    const years = batchSummary[code]?.years ?? [];
    for (const y of years) {
      yearToCount.set(y, (yearToCount.get(y) ?? 0) + 1);
    }
  }
  const availableYears = [...yearToCount.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([year, count]) => ({ year, count }));

  const mfgScoped = baseSorted.filter(item => {
    if (mfgStatus === 'manufactured') return isManufactured(item);
    if (mfgStatus === 'non-manufactured') return isNonManufactured(item);
    return true;
  });

  const yearScoped = mfgScoped.filter(item => {
    if (mfgYear === 'all') return true;
    const code = (item.productCode || '').trim();
    return (batchSummary[code]?.years ?? []).includes(mfgYear);
  });

  const mismatchMap = computeMismatchMap(yearScoped);

  // Dynamic: compute missing count per field — only fields that actually have missing records appear.
  // Uses each field's custom `check` fn if provided (e.g. effectiveBatchNo treats '0' as valid).
  const missingFieldCounts = TABLE_FIELD_CONFIG
    .map(({ key, label, check }) => ({
      key: key as string,
      label,
      count: yearScoped.filter(item => {
        const val = item[key] as string | undefined | null;
        return check ? check(val) : isMissingData(val);
      }).length,
    }))
    .filter(x => x.count > 0);
  const missingTotal = yearScoped.filter(item => getMissingFields(item).length > 0).length;

  // Mismatch counts on current scope
  let mismatchTotal = 0;
  let storageMismatchCount = 0;
  let therapeuticMismatchCount = 0;
  let effectiveBatchMismatchCount = 0;
  for (const it of yearScoped) {
    const code = (it.productCode || '').trim();
    if (!code) continue;
    const m = mismatchMap.get(code);
    if (!m?.any) continue;
    mismatchTotal += 1;
    if (m.storage) storageMismatchCount += 1;
    if (m.therapeutic) therapeuticMismatchCount += 1;
    if (m.effectiveBatch) effectiveBatchMismatchCount += 1;
  }

  const scopedFiltered = yearScoped.filter(item => {
    if (errorPrimary === 'all') {
      const code = (item.productCode || '').trim();
      const m = code ? mismatchMap.get(code) : undefined;
      return getMissingFields(item).length > 0 || Boolean(m?.any);
    }
    if (errorPrimary === 'missing') {
      if (!errorDetail || errorDetail === 'has-errors') return getMissingFields(item).length > 0;
      // Dynamic field key: use the field's custom check fn if defined, else isMissingData
      const fieldCfg = TABLE_FIELD_CONFIG.find(f => f.key === errorDetail);
      const val = item[errorDetail as keyof ProductMaster] as string | undefined | null;
      return fieldCfg?.check ? fieldCfg.check(val) : isMissingData(val);
    }
    if (errorPrimary === 'mismatch') {
      const code = (item.productCode || '').trim();
      const m = code ? mismatchMap.get(code) : undefined;
      if (!m) return false;
      // Show ALL products in the relevant mismatch group — both wrong (amber) and correct (green).
      // Counts only include wrong ones (m.any / m.storage / m.therapeutic / m.effectiveBatch).
      if (mismatchSubtype === 'storage') return Boolean(m.inStorageGroup);
      if (mismatchSubtype === 'therapeutic') return Boolean(m.inTherapeuticGroup);
      if (mismatchSubtype === 'effective-batch') return Boolean(m.inEffBatchGroup);
      return m.inStorageGroup || m.inTherapeuticGroup || m.inEffBatchGroup;
    }
    return true; // should never reach
  });

  // Calculate top-level error statistics (Missing + Mismatch) on current scope
  const errorStats = missingTotal + mismatchTotal;

  // ── Mismatch cell-style helper ──────────────────────────────────────────────
  // Returns { bg, color } for therapeutic, storage, or effectiveBatch cells.
  // When the active filter highlights that field:
  //   wrong value  → amber/yellow   (counts toward mismatch total)
  //   correct value → green         (in mismatch group but matches majority — not counted)
  // When the filter does not target that field → returns null (use default style).
  type MismatchCellField = 'storage' | 'therapeutic' | 'effBatch';
  const getMfcCellStyle = (
    item: ProductMaster,
    field: MismatchCellField,
  ): { bg: string; color: string } | null => {
    if (errorPrimary !== 'mismatch') return null;
    const fieldActive =
      mismatchSubtype === null ||
      (field === 'storage'      && mismatchSubtype === 'storage') ||
      (field === 'therapeutic'  && mismatchSubtype === 'therapeutic') ||
      (field === 'effBatch'     && mismatchSubtype === 'effective-batch');
    if (!fieldActive) return null;

    const code = (item.productCode || '').trim();
    const m = code ? mismatchMap.get(code) : undefined;
    if (!m) return null;

    const inGroup = field === 'storage'     ? m.inStorageGroup
                  : field === 'therapeutic' ? m.inTherapeuticGroup
                  : m.inEffBatchGroup;
    if (!inGroup) return null;

    const isWrong = field === 'storage'     ? m.storage
                  : field === 'therapeutic' ? m.therapeutic
                  : m.effectiveBatch;

    return isWrong
      ? { bg: 'rgba(245,158,11,0.18)', color: '#d97706' }   // wrong  → amber
      : { bg: 'rgba(16,185,129,0.12)', color: '#059669' };  // correct → green
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--background)',
    }}>
      {/* Header */}
      <header style={{
        background: 'var(--gradient-hero)',
        padding: '0.6rem 0',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Decorative bubbles */}
        <div style={{
          position: 'absolute',
          top: '-50%',
          left: '-10%',
          width: '400px',
          height: '400px',
          background: 'rgba(255, 255, 255, 0.05)',
          borderRadius: '50%',
          filter: 'blur(40px)',
        }} />
        <div style={{
          position: 'absolute',
          bottom: '-30%',
          right: '-5%',
          width: '300px',
          height: '300px',
          background: 'rgba(255, 255, 255, 0.05)',
          borderRadius: '50%',
          filter: 'blur(30px)',
        }} />

        <div style={{
          maxWidth: '1400px',
          margin: '0 auto',
          padding: '0 2rem',
          position: 'relative',
          zIndex: 1,
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem',
          }}>
            <div>
              <h1 style={{
                fontSize: 'clamp(0.9rem, 2.5vw, 1.15rem)',
                fontWeight: '700',
                color: 'white',
                marginBottom: '0.1rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                  <line x1="8" y1="21" x2="16" y2="21" />
                  <line x1="12" y1="17" x2="12" y2="21" />
                </svg>
                Product Master
              </h1>
              <p style={{
                color: 'rgba(255, 255, 255, 0.8)',
                fontSize: '0.7rem',
                margin: 0,
              }}>
                Complete Product Database - {total} Products
              </p>
            </div>

            {/* Navigation */}
            <Link
              href="/"
              style={{
                padding: '0.625rem 1.25rem',
                background: 'rgba(255, 255, 255, 0.2)',
                color: 'white',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                textDecoration: 'none',
                fontWeight: '500',
                transition: 'all var(--transition-fast)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                backdropFilter: 'blur(10px)',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
              Back to Home
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main style={{
        maxWidth: '1600px',
        margin: '0 auto',
        padding: '0.5rem 1rem',
      }}>
        {/* Search and Stats */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '0.5rem',
          flexWrap: 'wrap',
          gap: '0.5rem',
        }}>
          <div style={{ flex: '1', minWidth: '200px', maxWidth: '400px' }}>
            <input
              type="text"
              placeholder="Search by Product Name, Code, Department..."
              value={searchTerm}
              onChange={handleSearch}
              style={{
                width: '100%',
                padding: '0.45rem 0.75rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border)',
                background: 'var(--card)',
                color: 'var(--foreground)',
                fontSize: '0.8rem',
                transition: 'all var(--transition-fast)',
              }}
            />
          </div>

          {/* Stats Cards */}
          <div style={{
            display: 'flex',
            gap: '0.5rem',
            flexWrap: 'wrap',
          }}>
            <div style={{
              padding: '0.3rem 0.75rem',
              borderRadius: 'var(--radius-md)',
              background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.1) 0%, rgba(168, 85, 247, 0.1) 100%)',
              border: '1px solid rgba(139, 92, 246, 0.2)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2">
                <path d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
              </svg>
              <div>
                <div style={{ fontSize: '0.6rem', color: 'var(--muted-foreground)' }}>Total</div>
                <div style={{ fontSize: '0.9rem', fontWeight: '700', color: '#8b5cf6' }}>{total}</div>
              </div>
            </div>

            {nonManufacturedCount > 0 && (
              <div style={{
                padding: '0.3rem 0.75rem',
                borderRadius: 'var(--radius-md)',
                background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.1) 0%, rgba(251, 191, 36, 0.1) 100%)',
                border: '1px solid rgba(245, 158, 11, 0.2)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <div>
                  <div style={{ fontSize: '0.6rem', color: 'var(--muted-foreground)' }}>Non-Manufactured</div>
                  <div style={{ fontSize: '0.9rem', fontWeight: '700', color: '#f59e0b' }}>{nonManufacturedCount}</div>
                </div>
              </div>
            )}

            <div style={{
              padding: '0.3rem 0.75rem',
              borderRadius: 'var(--radius-md)',
              background: errorStats > 0
                ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.1) 0%, rgba(220, 38, 38, 0.1) 100%)'
                : 'linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(52, 211, 153, 0.1) 100%)',
              border: errorStats > 0 ? '1px solid rgba(239, 68, 68, 0.2)' : '1px solid rgba(16, 185, 129, 0.2)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={errorStats > 0 ? '#ef4444' : '#10b981'} strokeWidth="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <div>
                <div style={{ fontSize: '0.6rem', color: 'var(--muted-foreground)' }}>Errors</div>
                <div style={{ fontSize: '0.9rem', fontWeight: '700', color: errorStats > 0 ? '#ef4444' : '#10b981' }}>{errorStats}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Top-down Filter Hierarchy */}
        {data.length > 0 && (
          <div style={{
            display: 'grid',
            gap: '0.55rem',
            marginBottom: '0.7rem',
            padding: '0.65rem 0.75rem',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid rgba(148, 163, 184, 0.35)',
            background: 'linear-gradient(180deg, rgba(248, 250, 252, 0.95) 0%, rgba(241, 245, 249, 0.75) 100%)',
            boxShadow: '0 10px 28px rgba(2, 6, 23, 0.06)',
            backdropFilter: 'blur(8px)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{
                  padding: '0.25rem 0.6rem',
                  borderRadius: '9999px',
                  background: 'rgba(139, 92, 246, 0.12)',
                  border: '1px solid rgba(139, 92, 246, 0.35)',
                  color: '#8b5cf6',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                }}>
                  All ({total})
                </div>

                {/* Reset filters just after "All" */}
                <button
                  onClick={resetFiltersToDefault}
                  style={{
                    padding: '0.22rem 0.6rem',
                    background: 'rgba(2, 6, 23, 0.04)',
                    border: '1px solid rgba(148, 163, 184, 0.55)',
                    borderRadius: '9999px',
                    cursor: 'pointer',
                    fontSize: '0.68rem',
                    fontWeight: 900,
                    color: 'rgba(30, 41, 59, 0.9)',
                  }}
                  title="Clear all filters and restore defaults"
                >
                  Reset filters
                </button>

                {batchSummaryLoading && (
                  <div style={{ fontSize: '0.65rem', color: 'var(--muted-foreground)' }}>Updating manufacturing counts…</div>
                )}
              </div>
            </div>

            {/* Manufacturing Status */}
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              {([
                { key: 'manufactured', label: 'Manufactured', count: manufacturedCount, color: '#10b981', bg: 'rgba(16, 185, 129, 0.1)', border: 'rgba(16, 185, 129, 0.3)' },
                { key: 'non-manufactured', label: 'Non-Manufactured', count: nonManufacturedCount, color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.1)', border: 'rgba(245, 158, 11, 0.3)' },
              ] as const).map(({ key, label, count, color, bg, border }) => (
                <button
                  key={key}
                  onClick={() => { setMfgStatus(key); setMfgYear('all'); }}
                  style={{
                    padding: '0.3rem 0.75rem',
                    background: mfgStatus === key ? bg : 'var(--card)',
                    border: `2px solid ${mfgStatus === key ? border : 'var(--border)'}`,
                    borderRadius: 'var(--radius-md)',
                    color: mfgStatus === key ? color : 'var(--muted-foreground)',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    fontWeight: mfgStatus === key ? '700' : '600',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    transition: 'all var(--transition-fast)',
                    boxShadow: mfgStatus === key ? `0 0 0 2px ${border}` : 'none',
                  }}
                  title={`${label} product codes`}
                >
                  {label}
                  <span style={{
                    padding: '0.125rem 0.5rem',
                    background: mfgStatus === key ? color : 'var(--muted)',
                    color: mfgStatus === key ? 'white' : 'var(--muted-foreground)',
                    borderRadius: '9999px',
                    fontSize: '0.7rem',
                    fontWeight: '800',
                    minWidth: '24px',
                    textAlign: 'center',
                  }}>
                    {count}
                  </span>
                </button>
              ))}
              </div>
            </div>

            {/* Manufacturing Year (only meaningful for Manufactured) */}
            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Year:
              </span>
              <button
                onClick={() => setMfgYear('all')}
                disabled={mfgStatus !== 'manufactured'}
                style={{
                  padding: '0.15rem 0.55rem',
                  background: mfgYear === 'all' ? 'rgba(139, 92, 246, 0.12)' : 'var(--card)',
                  border: `1px solid ${mfgYear === 'all' ? 'rgba(139, 92, 246, 0.35)' : 'var(--border)'}`,
                  borderRadius: '9999px',
                  cursor: mfgStatus === 'manufactured' ? 'pointer' : 'not-allowed',
                  opacity: mfgStatus === 'manufactured' ? 1 : 0.6,
                    fontSize: '0.75rem',
                  fontWeight: 800,
                  color: mfgYear === 'all' ? '#8b5cf6' : 'var(--muted-foreground)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                }}
                title={mfgStatus !== 'manufactured' ? 'Year filter applies to Manufactured only' : 'All manufactured years'}
              >
                All ({manufacturedCount})
              </button>
              {availableYears.map(({ year, count }) => (
                <button
                  key={year}
                  onClick={() => setMfgYear(year)}
                  disabled={mfgStatus !== 'manufactured'}
                  style={{
                    padding: '0.15rem 0.55rem',
                    background: mfgYear === year ? 'rgba(16, 185, 129, 0.12)' : 'var(--card)',
                    border: `1px solid ${mfgYear === year ? 'rgba(16, 185, 129, 0.35)' : 'var(--border)'}`,
                    borderRadius: '9999px',
                    cursor: mfgStatus === 'manufactured' ? 'pointer' : 'not-allowed',
                    opacity: mfgStatus === 'manufactured' ? 1 : 0.6,
                    fontSize: '0.75rem',
                    fontWeight: mfgYear === year ? 900 : 800,
                    color: mfgYear === year ? '#10b981' : 'var(--muted-foreground)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                  }}
                  title={`Manufactured in ${year}`}
                >
                  {year} ({count})
                </button>
              ))}
            </div>

            {/* Error Filters: Missing / Mismatch */}
            <div style={{ display: 'grid', gap: '0.3rem' }}>
              {/* Primary row: All Errors / Missing / Mismatch */}
              <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Errors:
                </span>
                <button
                  onClick={() => { setErrorPrimary(errorPrimary === 'all' ? 'none' : 'all'); setErrorDetail(null); setMismatchSubtype(null); }}
                  style={{
                    padding: '0.2rem 0.6rem',
                    background: errorPrimary === 'all' ? 'rgba(239,68,68,0.15)' : 'var(--card)',
                    border: `1px solid ${errorPrimary === 'all' ? 'rgba(239,68,68,0.5)' : 'rgba(239,68,68,0.3)'}`,
                    borderRadius: '9999px',
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                    fontWeight: 900,
                    color: '#ef4444',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                  }}
                  title="Show all records with any error"
                >
                  All Errors ({errorStats})
                </button>
                <button
                  onClick={() => { setErrorPrimary('missing'); setErrorDetail(null); setMismatchSubtype(null); }}
                  style={{
                    padding: '0.2rem 0.6rem',
                    background: errorPrimary === 'missing' ? 'rgba(239,68,68,0.15)' : 'var(--card)',
                    border: `1px solid ${errorPrimary === 'missing' ? 'rgba(239,68,68,0.5)' : 'var(--border)'}`,
                    borderRadius: '9999px',
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                    fontWeight: 900,
                    color: errorPrimary === 'missing' ? '#ef4444' : 'var(--muted-foreground)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    boxShadow: errorPrimary === 'missing' ? '0 0 0 2px rgba(239,68,68,0.12)' : 'none',
                  }}
                  title="Missing field errors"
                >
                  Missing ({missingTotal})
                </button>
                <button
                  onClick={() => { setErrorPrimary('mismatch'); setErrorDetail(null); setMismatchSubtype(null); }}
                  style={{
                    padding: '0.2rem 0.6rem',
                    background: errorPrimary === 'mismatch' ? 'rgba(245,158,11,0.12)' : 'var(--card)',
                    border: `1px solid ${errorPrimary === 'mismatch' ? 'rgba(245,158,11,0.35)' : 'var(--border)'}`,
                    borderRadius: '9999px',
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                    fontWeight: 900,
                    color: errorPrimary === 'mismatch' ? '#f59e0b' : 'var(--muted-foreground)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                  }}
                  title="Mismatch errors within the same MFC"
                >
                  Mismatch ({mismatchTotal})
                </button>
              </div>

              {/* Sub-filters for "All Errors": show missing fields (red) + mismatch subtypes (amber) together */}
              {errorPrimary === 'all' && (
                <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  {missingFieldCounts.map(({ key, label, count }) => (
                    <button
                      key={key}
                      onClick={() => { setErrorPrimary('missing'); setErrorDetail(key); }}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                        padding: '0.15rem 0.5rem',
                        background: 'var(--card)',
                        border: '1px solid rgba(239,68,68,0.3)',
                        borderRadius: '9999px',
                        cursor: 'pointer',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        color: '#ef4444',
                      }}
                      title={`Filter: records missing ${label}`}
                    >
                      {label} <span style={{ fontWeight: 900 }}>({count})</span>
                    </button>
                  ))}
                  {([
                    { key: 'storage' as const, label: 'Storage Mismatch', count: storageMismatchCount },
                    { key: 'therapeutic' as const, label: 'Therapeutic Mismatch', count: therapeuticMismatchCount },
                    { key: 'effective-batch' as const, label: 'Eff. Batch Mismatch', count: effectiveBatchMismatchCount },
                  ]).filter(x => x.count > 0).map(x => (
                    <button
                      key={x.key}
                      onClick={() => { setErrorPrimary('mismatch'); setMismatchSubtype(x.key); }}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                        padding: '0.15rem 0.5rem',
                        background: 'var(--card)',
                        border: '1px solid rgba(245,158,11,0.35)',
                        borderRadius: '9999px',
                        cursor: 'pointer',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        color: '#d97706',
                      }}
                      title={`Filter: ${x.label}`}
                    >
                      {x.label} <span style={{ fontWeight: 900 }}>({x.count})</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Sub-filters for "Missing": per-field red pills */}
              {errorPrimary === 'missing' && (
                <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  {missingFieldCounts.map(({ key, label, count }) => {
                    const active = errorDetail === key;
                    return (
                      <button
                        key={key}
                        onClick={() => setErrorDetail(prev => prev === key ? null : key)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                          padding: '0.15rem 0.5rem',
                          background: active ? 'rgba(239,68,68,0.12)' : 'var(--card)',
                          border: `1px solid ${active ? 'rgba(239,68,68,0.45)' : 'rgba(239,68,68,0.25)'}`,
                          borderRadius: '9999px',
                          cursor: 'pointer',
                          fontSize: '0.7rem',
                          fontWeight: active ? '900' : '700',
                          color: active ? '#dc2626' : '#ef4444',
                          boxShadow: active ? '0 0 0 2px rgba(239,68,68,0.12)' : 'none',
                        }}
                        title={`Filter: records missing ${label}`}
                      >
                        {label} <span style={{ fontWeight: 900, opacity: 0.95 }}>({count})</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Sub-filters for "Mismatch": amber pills */}
              {errorPrimary === 'mismatch' && (
                <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  <button
                    onClick={() => setMismatchSubtype(null)}
                    style={{
                      padding: '0.15rem 0.5rem',
                      background: mismatchSubtype === null ? 'rgba(245,158,11,0.12)' : 'var(--card)',
                      border: `1px solid ${mismatchSubtype === null ? 'rgba(245,158,11,0.35)' : 'var(--border)'}`,
                      borderRadius: '9999px',
                      cursor: 'pointer',
                      fontSize: '0.7rem',
                      fontWeight: 900,
                      color: mismatchSubtype === null ? '#f59e0b' : 'var(--muted-foreground)',
                    }}
                    title="All mismatch types"
                  >
                    Mismatch ({mismatchTotal})
                  </button>
                  {([
                    { key: 'storage' as const, label: 'Storage Condition Mismatch', count: storageMismatchCount },
                    { key: 'therapeutic' as const, label: 'Therapeutic Category Mismatch', count: therapeuticMismatchCount },
                    { key: 'effective-batch' as const, label: 'Effective Batch Mismatch', count: effectiveBatchMismatchCount },
                  ]).filter(x => x.count > 0).map(x => (
                    <button
                      key={x.key}
                      onClick={() => setMismatchSubtype(prev => prev === x.key ? null : x.key)}
                      style={{
                        padding: '0.15rem 0.5rem',
                        background: mismatchSubtype === x.key ? 'rgba(245,158,11,0.12)' : 'var(--card)',
                        border: `1px solid ${mismatchSubtype === x.key ? 'rgba(245,158,11,0.35)' : 'var(--border)'}`,
                        borderRadius: '9999px',
                        cursor: 'pointer',
                        fontSize: '0.7rem',
                        fontWeight: mismatchSubtype === x.key ? 950 : 800,
                        color: mismatchSubtype === x.key ? '#f59e0b' : 'var(--muted-foreground)',
                      }}
                      title={`Filter: ${x.label}`}
                    >
                      {x.label} ({x.count})
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Active Filters */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '0.6rem',
              flexWrap: 'wrap',
              paddingTop: '0.15rem',
            }}>
              <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{
                  fontSize: '0.6rem',
                  fontWeight: 900,
                  color: 'rgba(30, 41, 59, 0.75)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                }}>
                  Active Filters
                </span>

                {/* Manufacturing status tag */}
                {mfgStatus !== 'manufactured' && (
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    padding: '0.22rem 0.55rem',
                    background: 'rgba(16, 185, 129, 0.08)',
                    border: '1px solid rgba(16, 185, 129, 0.25)',
                    borderRadius: '9999px',
                    fontSize: '0.68rem',
                    fontWeight: 800,
                    color: 'rgba(15, 23, 42, 0.85)',
                  }}>
                    Mfg status: {mfgStatus === 'non-manufactured' ? 'Non-Manufactured' : mfgStatus}
                    <button
                      onClick={() => { setMfgStatus('manufactured'); setMfgYear('all'); }}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '0.85rem',
                        lineHeight: 1,
                        color: 'rgba(15, 23, 42, 0.65)',
                        padding: 0,
                      }}
                      aria-label="Remove manufacturing status filter"
                      title="Remove"
                    >
                      ×
                    </button>
                  </span>
                )}

                {/* Year tag */}
                {mfgYear !== 'all' && (
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    padding: '0.22rem 0.55rem',
                    background: 'rgba(139, 92, 246, 0.08)',
                    border: '1px solid rgba(139, 92, 246, 0.25)',
                    borderRadius: '9999px',
                    fontSize: '0.68rem',
                    fontWeight: 800,
                    color: 'rgba(15, 23, 42, 0.85)',
                  }}>
                    Mfg year: {String(mfgYear).slice(-2)}
                    <button
                      onClick={() => setMfgYear('all')}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '0.85rem',
                        lineHeight: 1,
                        color: 'rgba(15, 23, 42, 0.65)',
                        padding: 0,
                      }}
                      aria-label="Remove manufacturing year filter"
                      title="Remove"
                    >
                      ×
                    </button>
                  </span>
                )}

                {/* Error tag(s) */}
                {(errorPrimary === 'missing' || errorPrimary === 'mismatch') && (() => {
                  // Build human-readable label for the active error filter
                  let errorLabel = errorPrimary === 'missing' ? 'Missing' : 'Mismatch';
                  if (errorDetail && errorDetail !== 'has-errors') {
                    const field = TABLE_FIELD_CONFIG.find(f => f.key === errorDetail);
                    errorLabel += ` / ${field?.label ?? errorDetail}`;
                  } else if (errorDetail === 'has-errors') {
                    errorLabel += ' / Has Field Errors';
                  }
                  if (mismatchSubtype) errorLabel += ` / ${mismatchSubtype}`;
                  return (
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      padding: '0.22rem 0.55rem',
                      background: errorPrimary === 'missing' ? 'rgba(239, 68, 68, 0.08)' : 'rgba(245, 158, 11, 0.10)',
                      border: errorPrimary === 'missing' ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(245, 158, 11, 0.25)',
                      borderRadius: '9999px',
                      fontSize: '0.68rem',
                      fontWeight: 800,
                      color: errorPrimary === 'missing' ? '#dc2626' : '#d97706',
                    }}>
                      {errorLabel}
                      <button
                        onClick={() => { setErrorPrimary('none'); setErrorDetail(null); setMismatchSubtype(null); }}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: '0.85rem',
                          lineHeight: 1,
                          color: 'rgba(15, 23, 42, 0.65)',
                          padding: 0,
                        }}
                        aria-label="Remove error filter"
                        title="Remove"
                      >
                        ×
                      </button>
                    </span>
                  );
                })()}

                {/* Search tag */}
                {searchTerm && (
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    padding: '0.22rem 0.55rem',
                    background: 'rgba(2, 132, 199, 0.08)',
                    border: '1px solid rgba(2, 132, 199, 0.25)',
                    borderRadius: '9999px',
                    fontSize: '0.68rem',
                    fontWeight: 800,
                    color: 'rgba(15, 23, 42, 0.85)',
                    maxWidth: '520px',
                  }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={searchTerm}>
                      Search: {searchTerm}
                    </span>
                    <button
                      onClick={() => setSearchTerm('')}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '0.85rem',
                        lineHeight: 1,
                        color: 'rgba(15, 23, 42, 0.65)',
                        padding: 0,
                      }}
                      aria-label="Remove search filter"
                      title="Remove"
                    >
                      ×
                    </button>
                  </span>
                )}

                {/* If nothing is active beyond defaults */}
                {mfgStatus === 'manufactured' && mfgYear === 'all' && errorPrimary === 'all' && !searchTerm && (
                  <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'rgba(30, 41, 59, 0.55)' }}>
                    None (default view)
                  </span>
                )}
              </div>

              <button
                onClick={resetFiltersToDefault}
                style={{
                  padding: '0.32rem 0.75rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid rgba(99, 102, 241, 0.35)',
                  background: 'rgba(99, 102, 241, 0.08)',
                  color: 'rgba(67, 56, 202, 0.95)',
                  cursor: 'pointer',
                  fontSize: '0.72rem',
                  fontWeight: 900,
                  whiteSpace: 'nowrap',
                }}
                title="Clear/Remove Filters"
              >
                Clear/Remove Filters
              </button>
            </div>
          </div>
        )}

        {/* View Mode Toggle and Export Buttons */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '0.4rem',
          flexWrap: 'wrap',
          gap: '0.5rem',
        }}>
          {/* View Mode Toggle */}
          <div style={{
            display: 'flex',
            gap: '0.25rem',
            background: 'var(--card)',
            padding: '0.2rem',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border)',
          }}>
            <button
              onClick={() => setViewMode('product')}
              style={{
                padding: '0.3rem 0.75rem',
                background: viewMode === 'product' ? 'var(--gradient-primary)' : 'transparent',
                color: viewMode === 'product' ? 'white' : 'var(--foreground)',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                fontWeight: '500',
                fontSize: '0.7rem',
                transition: 'all var(--transition-fast)',
              }}
            >
              Product Code
            </button>
            <button
              onClick={() => setViewMode('mfc')}
              style={{
                padding: '0.3rem 0.75rem',
                background: viewMode === 'mfc' ? 'var(--gradient-primary)' : 'transparent',
                color: viewMode === 'mfc' ? 'white' : 'var(--foreground)',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                fontWeight: '500',
                fontSize: '0.7rem',
                transition: 'all var(--transition-fast)',
              }}
            >
              MFC
            </button>
            <button
              onClick={() => setViewMode('batch')}
              style={{
                padding: '0.3rem 0.75rem',
                background: viewMode === 'batch' ? 'var(--gradient-primary)' : 'transparent',
                color: viewMode === 'batch' ? 'white' : 'var(--foreground)',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                fontWeight: '500',
                fontSize: '0.7rem',
                transition: 'all var(--transition-fast)',
              }}
            >
              Batch
            </button>
          </div>

          {/* Export Buttons Container */}
          <div style={{
            display: 'flex',
            gap: '0.5rem',
            alignItems: 'center',
          }}>
            {/* Export Button */}
            <button
            onClick={() => {
              if (viewMode === 'effective-batch') {
                setShowExportModal(true);
              } else {
                exportToExcel(scopedFiltered, viewMode, total, {
                  searchTerm,
                  mfgStatus,
                  year: mfgYear,
                  errorPrimary,
                  errorDetail,
                  mismatchSubtype,
                }, mismatchMap);
              }
            }}
            disabled={scopedFiltered.length === 0}
            style={{
              padding: '0.35rem 0.875rem',
              background: scopedFiltered.length === 0 ? 'var(--muted)' : 'linear-gradient(135deg, #10b981 0%, #34d399 100%)',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              color: scopedFiltered.length === 0 ? 'var(--muted-foreground)' : 'white',
              cursor: scopedFiltered.length === 0 ? 'not-allowed' : 'pointer',
              fontSize: '0.7rem',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              boxShadow: scopedFiltered.length === 0 ? 'none' : 'var(--shadow-lg)',
              transition: 'all var(--transition-fast)',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export to Excel
          </button>
          </div>
        </div>

        {/* Effective Batch Export Modal */}
        {showExportModal && (
          <div
            onClick={() => setShowExportModal(false)}
            style={{
              position: 'fixed', inset: 0, zIndex: 1000,
              background: 'rgba(0,0,0,0.45)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{
                background: 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-lg)',
                boxShadow: 'var(--shadow-lg)',
                padding: '1.75rem',
                width: '340px',
                display: 'flex',
                flexDirection: 'column',
                gap: '1.25rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '700', color: 'var(--foreground)' }}>
                    Export to Excel
                  </h3>
                  <p style={{ margin: '0.25rem 0 0', fontSize: '0.72rem', color: 'var(--muted-foreground)' }}>
                    One sheet per Effective Batch group
                  </p>
                </div>
                <button
                  onClick={() => setShowExportModal(false)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)', padding: '0.25rem' }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <button
                  onClick={() => { exportEffectiveBatchToExcel(scopedFiltered, false, mismatchMap); setShowExportModal(false); }}
                  style={{
                    padding: '0.75rem 1rem',
                    background: 'linear-gradient(135deg, #10b981 0%, #34d399 100%)',
                    border: 'none', borderRadius: 'var(--radius-md)',
                    color: 'white', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: '0.6rem',
                    fontSize: '0.8rem', fontWeight: '600',
                    boxShadow: 'var(--shadow-md)',
                    textAlign: 'left',
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  <div>
                    <div>Export Full Data</div>
                    <div style={{ fontSize: '0.68rem', fontWeight: '400', opacity: 0.85 }}>All records for each batch</div>
                  </div>
                </button>

                <button
                  onClick={() => { exportEffectiveBatchToExcel(scopedFiltered, true, mismatchMap); setShowExportModal(false); }}
                  style={{
                    padding: '0.75rem 1rem',
                    background: 'linear-gradient(135deg, #ef4444 0%, #f87171 100%)',
                    border: 'none', borderRadius: 'var(--radius-md)',
                    color: 'white', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: '0.6rem',
                    fontSize: '0.8rem', fontWeight: '600',
                    boxShadow: 'var(--shadow-md)',
                    textAlign: 'left',
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  <div>
                    <div>Export Errors Only</div>
                    <div style={{ fontSize: '0.68rem', fontWeight: '400', opacity: 0.85 }}>Only records with validation issues</div>
                  </div>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Missing Products Panel */}
        {showMissingPanel && (
          <div style={{
            marginBottom: '1.5rem',
            background: 'var(--card)',
            borderRadius: 'var(--radius-lg)',
            border: '2px solid rgba(245, 158, 11, 0.4)',
            boxShadow: 'var(--shadow-md)',
            overflow: 'hidden',
          }}>
            {/* Panel Header */}
            <div style={{
              padding: '1.25rem 1.5rem',
              background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.1) 0%, rgba(251, 191, 36, 0.05) 100%)',
              borderBottom: '1px solid rgba(245, 158, 11, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '1rem',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <div>
                  <h3 style={{ fontSize: '0.9rem', fontWeight: '700', color: '#f59e0b', margin: 0 }}>
                    Missing Product Master Entries
                  </h3>
                  <p style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', margin: 0 }}>
                    {missingProducts.length === 0
                      ? 'All batch products have Product Master entries'
                      : `${missingProducts.length} product(s) found in batch data but missing from Product Master`}
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                {missingProducts.length > 0 && (
                  <>
                    <button
                      onClick={selectAllMissing}
                      style={{
                        padding: '0.5rem 1rem',
                        background: 'transparent',
                        border: '1px solid rgba(245, 158, 11, 0.4)',
                        borderRadius: 'var(--radius-sm)',
                        color: '#f59e0b',
                        cursor: 'pointer',
                        fontSize: '0.75rem',
                        fontWeight: '600',
                      }}
                    >
                      Select All
                    </button>
                    <button
                      onClick={deselectAllMissing}
                      style={{
                        padding: '0.5rem 1rem',
                        background: 'transparent',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-sm)',
                        color: 'var(--muted-foreground)',
                        cursor: 'pointer',
                        fontSize: '0.75rem',
                        fontWeight: '600',
                      }}
                    >
                      Deselect All
                    </button>
                    <button
                      onClick={addSelectedToMaster}
                      disabled={selectedMissing.size === 0 || addingProducts}
                      style={{
                        padding: '0.5rem 1.25rem',
                        background: selectedMissing.size === 0 || addingProducts
                          ? 'var(--muted)'
                          : 'linear-gradient(135deg, #10b981 0%, #34d399 100%)',
                        border: 'none',
                        borderRadius: 'var(--radius-sm)',
                        color: selectedMissing.size === 0 || addingProducts ? 'var(--muted-foreground)' : 'white',
                        cursor: selectedMissing.size === 0 || addingProducts ? 'not-allowed' : 'pointer',
                        fontSize: '0.75rem',
                        fontWeight: '700',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                      }}
                    >
                      {addingProducts ? (
                        <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 12a9 9 0 11-6.219-8.56" strokeLinecap="round" />
                        </svg>
                      ) : (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                      )}
                      {addingProducts ? 'Adding...' : `Add ${selectedMissing.size > 0 ? `(${selectedMissing.size})` : ''} to Product Master`}
                    </button>
                  </>
                )}
                <button
                  onClick={() => setShowMissingPanel(false)}
                  style={{
                    padding: '0.5rem',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--muted-foreground)',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                  title="Close"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Add message */}
            {addMessage && (
              <div style={{
                padding: '0.75rem 1.5rem',
                background: addMessage.type === 'success' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                borderBottom: `1px solid ${addMessage.type === 'success' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
                color: addMessage.type === 'success' ? '#10b981' : '#ef4444',
                fontSize: '0.8rem',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}>
                {addMessage.type === 'success' ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                )}
                {addMessage.text}
              </div>
            )}

            {/* Missing Products Table */}
            {missingProducts.length === 0 ? (
              <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--muted-foreground)' }}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="1.5" style={{ display: 'inline-block', marginBottom: '0.75rem', opacity: 0.6 }}>
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <div style={{ fontSize: '0.9rem', fontWeight: '600', color: '#10b981' }}>All Good!</div>
                <div style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>Every product in batch data has a matching Product Master entry.</div>
              </div>
            ) : (
              <div style={{ overflowX: 'auto', maxHeight: '400px', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead style={{ background: 'var(--muted)', position: 'sticky', top: 0, zIndex: 1 }}>
                    <tr>
                      <th style={{ padding: '0.25rem 0.5rem', textAlign: 'center', fontSize: '0.7rem', fontWeight: '600', color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em', width: '50px', borderRight: '1px solid var(--border)' }}>
                        Select
                      </th>
                      <th style={{ padding: '0.25rem 0.5rem', textAlign: 'left', fontSize: '0.7rem', fontWeight: '600', color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em', borderRight: '1px solid var(--border)' }}>
                        Product Code
                      </th>
                      <th style={{ padding: '0.25rem 0.5rem', textAlign: 'left', fontSize: '0.7rem', fontWeight: '600', color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em', borderRight: '1px solid var(--border)' }}>
                        Product Name (from Batch)
                      </th>
                      <th style={{ padding: '0.25rem 0.5rem', textAlign: 'left', fontSize: '0.7rem', fontWeight: '600', color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em', borderRight: '1px solid var(--border)' }}>
                        Department
                      </th>
                      <th style={{ padding: '0.25rem 0.5rem', textAlign: 'left', fontSize: '0.7rem', fontWeight: '600', color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em', borderRight: '1px solid var(--border)' }}>
                        Type
                      </th>
                      <th style={{ padding: '0.25rem 0.5rem', textAlign: 'center', fontSize: '0.7rem', fontWeight: '600', color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em', borderRight: '1px solid var(--border)' }}>
                        Batch Count
                      </th>
                      <th style={{ padding: '0.25rem 0.5rem', textAlign: 'left', fontSize: '0.7rem', fontWeight: '600', color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {missingProducts.map((product) => {
                      const isSelected = selectedMissing.has(product.itemCode);
                      return (
                        <tr
                          key={product.itemCode}
                          onClick={() => toggleSelectMissing(product.itemCode)}
                          style={{
                            borderBottom: '1px solid var(--border)',
                            background: isSelected ? 'rgba(245, 158, 11, 0.08)' : 'transparent',
                            cursor: 'pointer',
                            transition: 'background var(--transition-fast)',
                            borderLeft: '3px solid #f59e0b',
                          }}
                          onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = 'rgba(245, 158, 11, 0.04)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = isSelected ? 'rgba(245, 158, 11, 0.08)' : 'transparent'; }}
                        >
                          <td style={{ padding: '0.25rem 0.5rem', textAlign: 'center', borderRight: '1px solid var(--border)' }}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelectMissing(product.itemCode)}
                              onClick={(e) => e.stopPropagation()}
                              style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#f59e0b' }}
                            />
                          </td>
                          <td style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', fontFamily: 'monospace', fontWeight: '600', color: '#f59e0b', borderRight: '1px solid var(--border)' }}>
                            {product.itemCode}
                          </td>
                          <td style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', color: 'var(--foreground)', fontWeight: '500', borderRight: '1px solid var(--border)' }}>
                            {product.itemName}
                          </td>
                          <td style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', color: 'var(--muted-foreground)', borderRight: '1px solid var(--border)' }}>
                            {product.department}
                          </td>
                          <td style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', borderRight: '1px solid var(--border)' }}>
                            <span style={{
                              padding: '0.2rem 0.5rem',
                              background: product.productType === 'Export' ? 'rgba(20, 184, 166, 0.1)' : 'rgba(139, 92, 246, 0.1)',
                              color: product.productType === 'Export' ? '#14b8a6' : '#8b5cf6',
                              borderRadius: 'var(--radius-sm)',
                              fontSize: '0.7rem',
                              fontWeight: '600',
                            }}>
                              {product.productType}
                            </span>
                          </td>
                          <td style={{ padding: '0.25rem 0.5rem', textAlign: 'center', fontSize: '0.8rem', fontWeight: '700', color: 'var(--foreground)', borderRight: '1px solid var(--border)' }}>
                            {product.batchCount}
                          </td>
                          <td style={{ padding: '0.25rem 0.5rem', borderRight: '1px solid var(--border)' }}>
                            <span style={{
                              padding: '0.25rem 0.625rem',
                              background: 'rgba(239, 68, 68, 0.1)',
                              color: '#ef4444',
                              borderRadius: 'var(--radius-sm)',
                              fontSize: '0.7rem',
                              fontWeight: '700',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                            }}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                              </svg>
                              PM MISSING
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Table Card */}
        <div style={{
          background: 'var(--card)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-md)',
          overflow: 'hidden',
        }}>
          {/* Table Header Info */}
          <div style={{
            padding: '0.4rem 0.75rem',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <h2 style={{
              fontSize: '0.8rem',
              fontWeight: '600',
              color: 'var(--foreground)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              margin: 0,
            }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="8" y1="6" x2="21" y2="6" />
                <line x1="8" y1="12" x2="21" y2="12" />
                <line x1="8" y1="18" x2="21" y2="18" />
                <line x1="3" y1="6" x2="3.01" y2="6" />
                <line x1="3" y1="12" x2="3.01" y2="12" />
                <line x1="3" y1="18" x2="3.01" y2="18" />
              </svg>
              Product Records
            </h2>
            <span style={{
              padding: '0.375rem 0.75rem',
              background: 'rgba(139, 92, 246, 0.1)',
              color: '#8b5cf6',
              borderRadius: 'var(--radius-full)',
              fontSize: '0.7rem',
              fontWeight: '600',
            }}>
              Showing {scopedFiltered.length} of {baseSorted.length} (All {total})
            </span>
          </div>

          {/* Table */}
          <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 160px)' }}>
            <table style={{
              width: '100%',
              borderCollapse: 'collapse',
              border: '1px solid var(--border)',
            }}>
              <thead style={{
                background: 'var(--muted)',
                borderBottom: '2px solid var(--border)',
                position: 'sticky',
                top: 0,
                zIndex: 2,
              }}>
                <tr>
                  {viewMode === 'mfc' ? (
                    <>
                      {([
                        { key: 'masterCardNo', label: 'Master Card No', width: '170px' },
                        { key: 'srNo', label: 'SR No', width: '52px' },
                        { key: 'productCode', label: 'Product Code', width: '120px' },
                        { key: 'genericName', label: 'Generic Name', width: '160px' },
                        { key: 'therapeuticCategory', label: 'Therapeutic Category', width: '170px' },
                        { key: 'productName', label: 'Product Name', width: '260px' },
                        { key: 'department', label: 'Department', width: '160px' },
                        { key: 'storageCondition', label: 'Storage Condition', width: '190px' },
                        { key: 'productType', label: 'Product Type', width: '120px' },
                        { key: 'specification', label: 'Spec', width: '120px' },
                        { key: 'effectiveBatchNo', label: 'Eff. Batch No', width: '110px' },
                        { key: 'status', label: 'Status', width: '220px' },
                      ] as const).map(({ key, label, width }) => (
                        <th
                          key={key}
                          onClick={() => handleSort(key as SortField)}
                          style={{
                            padding: '0.28rem 0.4rem',
                            textAlign: 'left',
                            fontSize: '0.62rem',
                            fontWeight: '800',
                            color: 'var(--muted-foreground)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                            whiteSpace: 'nowrap',
                            width,
                            borderRight: key === 'status' ? undefined : '1px solid var(--border)',
                            cursor: 'pointer',
                            userSelect: 'none',
                            transition: 'background-color var(--transition-fast)',
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.05)'}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            {label}
                            <span style={{ opacity: sortField === (key as SortField) ? 1 : 0.35 }}>
                              {sortField === (key as SortField) ? (sortDirection === 'asc' ? '↑' : '↓') : '↕'}
                            </span>
                          </div>
                        </th>
                      ))}
                    </>
                  ) : viewMode === 'batch' ? (
                    <>
                      {([
                        { key: 'batchNo', label: 'Batch No', width: '130px', sortable: false },
                        { key: 'productCode', label: 'Product Code', width: '130px', sortable: true },
                        { key: 'genericName', label: 'Generic Name', width: '180px', sortable: true },
                        { key: 'masterCardNo', label: 'MFC No', width: '180px', sortable: true },
                        { key: 'therapeuticCategory', label: 'Therapeutic Category', width: '190px', sortable: true },
                        { key: 'productName', label: 'Product Name', width: '280px', sortable: true },
                        { key: 'department', label: 'Department', width: '170px', sortable: true },
                        { key: 'storageCondition', label: 'Storage Condition', width: '220px', sortable: true },
                        { key: 'specification', label: 'Spec', width: '120px', sortable: true },
                        { key: 'effectiveBatchNo', label: 'Eff. Batch No', width: '120px', sortable: true },
                        { key: 'status', label: 'Status', width: '220px', sortable: true },
                      ] as const).map(({ key, label, width, sortable }) => (
                        <th
                          key={key}
                          onClick={sortable ? () => handleSort(key as SortField) : undefined}
                          style={{
                            padding: '0.28rem 0.4rem',
                            textAlign: 'left',
                            fontSize: '0.62rem',
                            fontWeight: '800',
                            color: sortable && sortField === key ? 'var(--foreground)' : 'var(--muted-foreground)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                            whiteSpace: 'nowrap',
                            width,
                            borderRight: key === 'status' ? undefined : '1px solid var(--border)',
                            userSelect: 'none',
                            cursor: sortable ? 'pointer' : 'default',
                          }}
                          onMouseEnter={sortable ? (e) => { e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.05)'; } : undefined}
                          onMouseLeave={sortable ? (e) => { e.currentTarget.style.backgroundColor = 'transparent'; } : undefined}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            {label}
                            {sortable && (
                              <span style={{ opacity: sortField === key ? 1 : 0.35 }}>
                                {sortField === key ? (sortDirection === 'asc' ? '↑' : '↓') : '↕'}
                              </span>
                            )}
                          </div>
                        </th>
                      ))}
                    </>
                  ) : (
                    <>
                  <th
                    onClick={() => handleSort('srNo')}
                    style={{
                      padding: '0.35rem 0.5rem',
                      textAlign: 'left',
                      fontSize: '0.65rem',
                      fontWeight: '600',
                      color: 'var(--muted-foreground)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      width: '80px',
                      borderRight: '1px solid var(--border)',
                      cursor: 'pointer',
                      userSelect: 'none',
                      transition: 'background-color var(--transition-fast)',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.05)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      SR No
                      <span style={{ opacity: sortField === 'srNo' ? 1 : 0.4 }}>
                        {sortField === 'srNo' ? (sortDirection === 'asc' ? '↑' : '↓') : '↕'}
                      </span>
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('productCode')}
                    style={{
                      padding: '0.35rem 0.5rem',
                      textAlign: 'left',
                      fontSize: '0.65rem',
                      fontWeight: '600',
                      color: 'var(--muted-foreground)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      cursor: 'pointer',
                      userSelect: 'none',
                      transition: 'background-color var(--transition-fast)',
                      borderRight: '1px solid var(--border)',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.05)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      Product Code
                      <span style={{ opacity: sortField === 'productCode' ? 1 : 0.4 }}>
                        {sortField === 'productCode' ? (sortDirection === 'asc' ? '↑' : '↓') : '↕'}
                      </span>
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('genericName')}
                    style={{
                      padding: '0.35rem 0.5rem',
                      textAlign: 'left',
                      fontSize: '0.65rem',
                      fontWeight: '600',
                      color: 'var(--muted-foreground)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      cursor: 'pointer',
                      userSelect: 'none',
                      transition: 'background-color var(--transition-fast)',
                      borderRight: '1px solid var(--border)',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.05)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      Generic Name
                      <span style={{ opacity: sortField === 'genericName' ? 1 : 0.4 }}>
                        {sortField === 'genericName' ? (sortDirection === 'asc' ? '↑' : '↓') : '↕'}
                      </span>
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('masterCardNo')}
                    style={{
                      padding: '0.35rem 0.5rem',
                      textAlign: 'left',
                      fontSize: '0.65rem',
                      fontWeight: '600',
                      color: 'var(--muted-foreground)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      cursor: 'pointer',
                      userSelect: 'none',
                      transition: 'background-color var(--transition-fast)',
                      borderRight: '1px solid var(--border)',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.05)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      Master Card No
                      <span style={{ opacity: sortField === 'masterCardNo' ? 1 : 0.4 }}>
                        {sortField === 'masterCardNo' ? (sortDirection === 'asc' ? '↑' : '↓') : '↕'}
                      </span>
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('therapeuticCategory')}
                    style={{
                      padding: '0.35rem 0.5rem',
                      textAlign: 'left',
                      fontSize: '0.65rem',
                      fontWeight: '600',
                      color: 'var(--muted-foreground)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      cursor: 'pointer',
                      userSelect: 'none',
                      transition: 'background-color var(--transition-fast)',
                      borderRight: '1px solid var(--border)',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.05)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      Therapeutic Category
                      <span style={{ opacity: sortField === 'therapeuticCategory' ? 1 : 0.4 }}>
                        {sortField === 'therapeuticCategory' ? (sortDirection === 'asc' ? '↑' : '↓') : '↕'}
                      </span>
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('productName')}
                    style={{
                      padding: '0.35rem 0.5rem',
                      textAlign: 'left',
                      fontSize: '0.65rem',
                      fontWeight: '600',
                      color: 'var(--muted-foreground)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      cursor: 'pointer',
                      userSelect: 'none',
                      transition: 'background-color var(--transition-fast)',
                      borderRight: '1px solid var(--border)',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.05)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      Product Name
                      <span style={{ opacity: sortField === 'productName' ? 1 : 0.4 }}>
                        {sortField === 'productName' ? (sortDirection === 'asc' ? '↑' : '↓') : '↕'}
                      </span>
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('department')}
                    style={{
                      padding: '0.35rem 0.5rem',
                      textAlign: 'left',
                      fontSize: '0.65rem',
                      fontWeight: '600',
                      color: 'var(--muted-foreground)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      cursor: 'pointer',
                      userSelect: 'none',
                      transition: 'background-color var(--transition-fast)',
                      borderRight: '1px solid var(--border)',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.05)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      Department
                      <span style={{ opacity: sortField === 'department' ? 1 : 0.4 }}>
                        {sortField === 'department' ? (sortDirection === 'asc' ? '↑' : '↓') : '↕'}
                      </span>
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('storageCondition')}
                    style={{
                      padding: '0.35rem 0.5rem',
                      textAlign: 'left',
                      fontSize: '0.65rem',
                      fontWeight: '600',
                      color: 'var(--muted-foreground)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      cursor: 'pointer',
                      userSelect: 'none',
                      transition: 'background-color var(--transition-fast)',
                      borderRight: '1px solid var(--border)',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.05)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      Storage Condition
                      <span style={{ opacity: sortField === 'storageCondition' ? 1 : 0.4 }}>
                        {sortField === 'storageCondition' ? (sortDirection === 'asc' ? '↑' : '↓') : '↕'}
                      </span>
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('productType')}
                    style={{
                      padding: '0.35rem 0.5rem',
                      textAlign: 'left',
                      fontSize: '0.65rem',
                      fontWeight: '600',
                      color: 'var(--muted-foreground)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      cursor: 'pointer',
                      userSelect: 'none',
                      transition: 'background-color var(--transition-fast)',
                      borderRight: '1px solid var(--border)',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.05)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      Product Type
                      <span style={{ opacity: sortField === 'productType' ? 1 : 0.4 }}>
                        {sortField === 'productType' ? (sortDirection === 'asc' ? '↑' : '↓') : '↕'}
                      </span>
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('specification')}
                    style={{
                      padding: '0.35rem 0.5rem',
                      textAlign: 'left',
                      fontSize: '0.65rem',
                      fontWeight: '600',
                      color: 'var(--muted-foreground)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      whiteSpace: 'nowrap',
                      borderRight: '1px solid var(--border)',
                      cursor: 'pointer',
                      userSelect: 'none',
                      transition: 'background-color var(--transition-fast)',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.05)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      Spec
                      <span style={{ opacity: sortField === 'specification' ? 1 : 0.4 }}>
                        {sortField === 'specification' ? (sortDirection === 'asc' ? '↑' : '↓') : '↕'}
                      </span>
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('effectiveBatchNo')}
                    style={{
                      padding: '0.35rem 0.5rem',
                      textAlign: 'left',
                      fontSize: '0.65rem',
                      fontWeight: '600',
                      color: 'var(--muted-foreground)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      whiteSpace: 'nowrap',
                      borderRight: '1px solid var(--border)',
                      cursor: 'pointer',
                      userSelect: 'none',
                      transition: 'background-color var(--transition-fast)',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.05)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      Eff. Batch No
                      <span style={{ opacity: sortField === 'effectiveBatchNo' ? 1 : 0.4 }}>
                        {sortField === 'effectiveBatchNo' ? (sortDirection === 'asc' ? '↑' : '↓') : '↕'}
                      </span>
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('status')}
                    style={{
                      padding: '0.35rem 0.5rem',
                      textAlign: 'left',
                      fontSize: '0.65rem',
                      fontWeight: '600',
                      color: 'var(--muted-foreground)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      cursor: 'pointer',
                      userSelect: 'none',
                      transition: 'background-color var(--transition-fast)',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.05)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      Status
                      <span style={{ opacity: sortField === 'status' ? 1 : 0.4 }}>
                        {sortField === 'status' ? (sortDirection === 'asc' ? '↑' : '↓') : '↕'}
                      </span>
                    </div>
                  </th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={tableColSpan} style={{
                      padding: '3rem',
                      textAlign: 'center',
                      color: 'var(--muted-foreground)',
                    }}>
                      <svg className="animate-spin" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ display: 'inline-block', marginBottom: '0.5rem' }}>
                        <path d="M21 12a9 9 0 11-6.219-8.56" strokeLinecap="round" />
                      </svg>
                      <div>Loading products...</div>
                    </td>
                  </tr>
                ) : scopedFiltered.length === 0 ? (
                  <tr>
                    <td colSpan={tableColSpan} style={{
                      padding: '3rem',
                      textAlign: 'center',
                      color: 'var(--muted-foreground)',
                    }}>
                      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ display: 'inline-block', marginBottom: '1rem', opacity: 0.3 }}>
                        <circle cx="11" cy="11" r="8" />
                        <path d="m21 21-4.35-4.35" />
                      </svg>
                      <div style={{ fontSize: '0.95rem', fontWeight: '500' }}>No products found</div>
                      <div style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>
                        {searchTerm ? 'Try a different search term' : 'Upload a Product Master XML file from the home page'}
                      </div>
                    </td>
                  </tr>
                ) : viewMode === 'mfc' ? (() => {
                  // MFC view with merged "Master Card No" (rowSpan) but ALL columns shown.
                  const groups: { mfc: string; products: ProductMaster[] }[] = [];
                  const seen = new Map<string, number>();
                  scopedFiltered.forEach(item => {
                    const mfc = item.masterCardNo || 'N/A';
                    if (!seen.has(mfc)) { seen.set(mfc, groups.length); groups.push({ mfc, products: [] }); }
                    groups[seen.get(mfc)!].products.push(item);
                  });

                  let sr = 0;
                  const cellBase: React.CSSProperties = {
                    padding: '0.2rem 0.4rem',
                    fontSize: '0.66rem',
                    borderRight: '1px solid var(--border)',
                    verticalAlign: 'top',
                  };

                  return (
                    <>
                      {groups.flatMap((group, groupIdx) =>
                        group.products.map((item, idx) => {
                          sr += 1;
                          const errors = getMissingFields(item);
                          const hasError = errors.length > 0;
                          const notMfg = isNonManufactured(item);

                          const groupZebraBg = groupIdx % 2 === 0 ? 'white' : 'rgba(0, 0, 0, 0.03)';

                          return (
                            <tr
                              key={item._id}
                              style={{
                                borderBottom: '1px solid var(--border)',
                                transition: 'background-color var(--transition-fast)',
                                background: groupZebraBg,
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--muted)'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.background = groupZebraBg; }}
                            >
                              {/* MASTER CARD NO (rowspan / merged) */}
                              {idx === 0 && (
                                <td
                                  rowSpan={group.products.length}
                                  style={{
                                    ...cellBase,
                                    width: '170px',
                                    fontFamily: 'monospace',
                                    fontWeight: 950,
                                    color: isMissingData(group.mfc) ? '#ef4444' : 'var(--foreground)',
                                    background: groupZebraBg,
                                  }}
                                >
                                  {group.mfc}
                                </td>
                              )}

                              {/* SR NO */}
                              <td style={{ ...cellBase, width: '52px', fontFamily: 'monospace', fontWeight: 800 }}>{sr}</td>

                              {/* PRODUCT CODE */}
                              <td style={{ ...cellBase, width: '120px', fontFamily: 'monospace', fontWeight: 800, color: isMissingData(item.productCode) ? '#ef4444' : 'var(--foreground)' }}>
                                {item.productCode || 'N/A'}
                              </td>

                              {/* GENERIC NAME */}
                              <td style={{ ...cellBase, width: '160px', color: 'var(--foreground)' }}>{item.genericName || '-'}</td>

                              {(() => {
                                const theraStyle = getMfcCellStyle(item, 'therapeutic');
                                const missingThera = isMissingData(item.therapeuticCategory);
                                const theraBg = missingThera ? 'rgba(239,68,68,0.12)' : theraStyle ? theraStyle.bg : 'rgba(245,158,11,0.10)';
                                const theraColor = missingThera ? '#ef4444' : theraStyle ? theraStyle.color : '#f59e0b';
                                return (
                                  <td style={{ ...cellBase, width: '170px' }}>
                                    <span style={{ padding: '0.06rem 0.3rem', background: theraBg, color: theraColor, borderRadius: '6px', fontSize: '0.62rem', fontWeight: 900 }}>
                                      {item.therapeuticCategory || 'N/A'}
                                    </span>
                                  </td>
                                );
                              })()}

                              <td style={{ ...cellBase, width: '260px', whiteSpace: 'normal' }}>
                                <span style={{ fontWeight: 800, color: isMissingData(item.productName) ? '#ef4444' : 'var(--foreground)' }}>
                                  {item.productName || 'N/A'}
                                </span>
                              </td>

                              <td style={{ ...cellBase, width: '160px', whiteSpace: 'normal', color: isMissingData(item.department) ? '#ef4444' : 'var(--foreground)' }}>
                                {item.department || 'N/A'}
                              </td>

                              {(() => {
                                const storStyle = getMfcCellStyle(item, 'storage');
                                const missingStorage = isMissingData(item.storageCondition);
                                return (
                                  <td style={{ ...cellBase, width: '190px', whiteSpace: 'normal', background: missingStorage ? 'rgba(239,68,68,0.06)' : storStyle ? storStyle.bg : undefined, color: missingStorage ? '#ef4444' : storStyle ? storStyle.color : 'var(--muted-foreground)' }}>
                                    {item.storageCondition || 'N/A'}
                                  </td>
                                );
                              })()}

                              <td style={{ ...cellBase, width: '120px' }}>
                                <span style={{
                                  padding: '0.06rem 0.3rem',
                                  background: isMissingData(item.productType)
                                    ? 'rgba(239, 68, 68, 0.12)'
                                    : item.productType === 'EXPORT' ? 'rgba(20, 184, 166, 0.12)' : 'rgba(139, 92, 246, 0.12)',
                                  color: isMissingData(item.productType)
                                    ? '#ef4444'
                                    : item.productType === 'EXPORT' ? '#14b8a6' : '#8b5cf6',
                                  borderRadius: '9999px',
                                  fontSize: '0.62rem',
                                  fontWeight: 950,
                                }}>
                                  {item.productType || 'N/A'}
                                </span>
                              </td>

                              <td style={{ ...cellBase, width: '120px' }}>
                                {item.specification ? (
                                  <span style={{ padding: '0.06rem 0.3rem', background: 'rgba(99, 102, 241, 0.10)', color: '#6366f1', borderRadius: '6px', fontSize: '0.62rem', fontWeight: 950, fontFamily: 'monospace' }}>
                                    {item.specification}
                                  </span>
                                ) : (
                                  <span style={{ color: 'var(--muted-foreground)' }}>—</span>
                                )}
                              </td>

                              {(() => {
                                const effStyle = getMfcCellStyle(item, 'effBatch');
                                return (
                                  <td style={{ ...cellBase, width: '110px', fontFamily: 'monospace', background: effStyle ? effStyle.bg : undefined, color: effStyle ? effStyle.color : item.effectiveBatchNo ? 'var(--foreground)' : 'var(--muted-foreground)' }}>
                                    {item.effectiveBatchNo || '—'}
                                  </td>
                                );
                              })()}

                              <td style={{ padding: '0.2rem 0.4rem', fontSize: '0.64rem', verticalAlign: 'top' }}>
                                {(() => {
                                  const code = (item.productCode || '').trim();
                                  const mfcMM = code ? mismatchMap.get(code) : undefined;
                                  const mismatchFields: string[] = [];
                                  if (mfcMM?.storage) mismatchFields.push('Storage Condition');
                                  if (mfcMM?.therapeutic) mismatchFields.push('Therapeutic Category');
                                  if (mfcMM?.effectiveBatch) mismatchFields.push('Effective Batch');
                                  const hasMismatchHere = mismatchFields.length > 0;
                                  if (!notMfg && !hasError && !hasMismatchHere) return <span style={{ color: '#10b981', fontWeight: 950 }}>OK</span>;
                                  return (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                                      {notMfg && <span style={{ color: '#f59e0b', fontWeight: 950 }}>MFG MISSING</span>}
                                      {hasError && <span style={{ color: '#ef4444', fontWeight: 900 }}>MISSING: {errors.join(', ')}</span>}
                                      {hasMismatchHere && (
                                        <span style={{ color: '#d97706', fontWeight: 900 }}>
                                          MISMATCH: {mismatchFields.join(', ')}
                                        </span>
                                      )}
                                    </div>
                                  );
                                })()}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </>
                  );
                })() : viewMode === 'effective-batch' ? (() => {
                  // Build groups keyed by effectiveBatchNo
                  // null/empty → '__null__' group (no batch assigned)
                  // "0" / 0   → '0' group (explicitly zero)
                  // Both go to the bottom; all other values sort ascending
                  const groupMap = new Map<string, ProductMaster[]>();
                  scopedFiltered.forEach(item => {
                    const raw = item.effectiveBatchNo;
                    const normalized = (raw !== null && raw !== undefined)
                      ? String(raw).trim()
                      : '';
                    const key = normalized === '' ? '__null__' : normalized;
                    if (!groupMap.has(key)) groupMap.set(key, []);
                    groupMap.get(key)!.push(item);
                  });

                  // Sort: __null__ first, then by string length (shorter first), then lexicographic
                  const sortedKeys = Array.from(groupMap.keys()).sort((a, b) => {
                    if (a === '__null__' && b === '__null__') return 0;
                    if (a === '__null__') return -1;
                    if (b === '__null__') return 1;
                    if (a.length !== b.length) return a.length - b.length;
                    return a.localeCompare(b);
                  });

                  const groups = sortedKeys.map(key => ({ key, products: groupMap.get(key)! }));

                  return (
                    <>
                      {/* Expand/Collapse All row */}
                      <tr>
                        <td colSpan={tableColSpan} style={{ padding: '0.25rem 0.5rem', background: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>
                          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.7rem', color: 'var(--muted-foreground)', fontWeight: '600' }}>
                              {groups.length} Effective Batch group{groups.length !== 1 ? 's' : ''}
                            </span>
                            <button onClick={() => expandAllEffBatchGroups(sortedKeys)} style={{ fontSize: '0.7rem', color: '#6366f1', background: 'none', border: 'none', cursor: 'pointer', fontWeight: '600', padding: '0.125rem 0.5rem', borderRadius: 'var(--radius-sm)' }}>
                              Expand All
                            </button>
                            <span style={{ color: 'var(--border)' }}>|</span>
                            <button onClick={() => collapseAllEffBatchGroups()} style={{ fontSize: '0.7rem', color: 'var(--muted-foreground)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: '600', padding: '0.125rem 0.5rem', borderRadius: 'var(--radius-sm)' }}>
                              Collapse All
                            </button>
                          </div>
                        </td>
                      </tr>

                      {groups.map((group) => {
                        const isOpen = expandedEffBatchGroups.has(group.key);
                        const isNullBatch = group.key === '__null__';
                        const groupIssueCount = group.products.filter(p => getMissingFields(p).length > 0 || isNonManufactured(p)).length;
                        const hasIssues = groupIssueCount > 0;

                        const headerBg = isNullBatch
                          ? 'rgba(100, 116, 139, 0.08)'
                          : hasIssues
                            ? 'rgba(239, 68, 68, 0.06)'
                            : 'rgba(99, 102, 241, 0.06)';
                        const headerAccent = isNullBatch ? '#64748b' : hasIssues ? '#ef4444' : '#6366f1';

                        const groupLabel = isNullBatch
                          ? 'No Effective Batch (—)'
                          : `Eff. Batch: ${group.key}`;

                        return (
                          <React.Fragment key={group.key}>
                            {/* Group header row */}
                            <tr
                              onClick={() => toggleEffBatchGroup(group.key)}
                              style={{
                                borderBottom: '1px solid var(--border)',
                                borderLeft: `4px solid ${headerAccent}`,
                                cursor: 'pointer',
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.opacity = '0.85'}
                              onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
                            >
                              <td style={{ padding: '0.3rem 0.5rem', width: '80px', background: headerBg, boxShadow: '0 1px 0 var(--border)' }}>
                                <svg
                                  width="16" height="16" viewBox="0 0 24 24" fill="none"
                                  stroke={headerAccent} strokeWidth="2.5"
                                  style={{ transition: 'transform 0.15s', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', display: 'block' }}
                                >
                                  <polyline points="9 18 15 12 9 6" />
                                </svg>
                              </td>
                              <td colSpan={10} style={{ padding: '0.3rem 0.5rem', background: headerBg, boxShadow: '0 1px 0 var(--border)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={headerAccent} strokeWidth="2">
                                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                                    <line x1="16" y1="2" x2="16" y2="6" />
                                    <line x1="8" y1="2" x2="8" y2="6" />
                                    <line x1="3" y1="10" x2="21" y2="10" />
                                  </svg>
                                  <span style={{ fontFamily: 'monospace', fontWeight: '700', fontSize: '0.85rem', color: isNullBatch ? '#64748b' : 'var(--foreground)' }}>
                                    {groupLabel}
                                  </span>
                                  <span style={{
                                    padding: '0.15rem 0.5rem',
                                    background: 'rgba(99,102,241,0.12)',
                                    color: '#6366f1',
                                    borderRadius: '9999px',
                                    fontSize: '0.65rem',
                                    fontWeight: '700',
                                  }}>
                                    {group.products.length} product{group.products.length !== 1 ? 's' : ''}
                                  </span>
                                  {hasIssues ? (
                                    <span style={{
                                      padding: '0.15rem 0.6rem',
                                      background: 'rgba(239,68,68,0.12)',
                                      color: '#ef4444',
                                      borderRadius: '9999px',
                                      fontSize: '0.65rem',
                                      fontWeight: '700',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '0.25rem',
                                    }}>
                                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                        <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                                      </svg>
                                      {groupIssueCount} issue{groupIssueCount !== 1 ? 's' : ''}
                                    </span>
                                  ) : !isNullBatch ? (
                                    <span style={{
                                      padding: '0.15rem 0.6rem',
                                      background: 'rgba(16,185,129,0.12)',
                                      color: '#10b981',
                                      borderRadius: '9999px',
                                      fontSize: '0.65rem',
                                      fontWeight: '700',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '0.25rem',
                                    }}>
                                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                        <polyline points="20 6 9 17 4 12" />
                                      </svg>
                                      No issue found
                                    </span>
                                  ) : null}
                                  {isNullBatch && (
                                    <span style={{ padding: '0.15rem 0.5rem', background: 'rgba(100,116,139,0.15)', color: '#64748b', borderRadius: '9999px', fontSize: '0.65rem', fontWeight: '700' }}>
                                      NO BATCH
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td style={{ padding: '0.3rem 0.5rem', textAlign: 'right', color: 'var(--muted-foreground)', fontSize: '0.7rem', background: headerBg, boxShadow: '0 1px 0 var(--border)' }}>
                                {isOpen ? 'Collapse' : 'Expand'}
                              </td>
                            </tr>

                            {/* Product rows inside group */}
                            {isOpen && group.products.map((item, idx) => {
                              const errors = getMissingFields(item);
                              const hasError = errors.length > 0;
                              const notMfg = isNonManufactured(item);
                              return (
                                <tr key={item._id} style={{
                                  borderBottom: '1px solid var(--border)',
                                  background: (notMfg && hasError) ? 'rgba(239,68,68,0.04)' : notMfg ? 'rgba(245,158,11,0.04)' : hasError ? 'rgba(239,68,68,0.04)' : idx % 2 === 0 ? 'rgba(0,0,0,0.01)' : 'transparent',
                                  borderLeft: (notMfg && hasError) ? '4px solid rgba(239,68,68,0.5)' : notMfg ? '4px solid rgba(245,158,11,0.4)' : hasError ? '4px solid rgba(239,68,68,0.3)' : '4px solid rgba(99,102,241,0.2)',
                                }}
                                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--muted)'}
                                  onMouseLeave={(e) => e.currentTarget.style.background = notMfg ? 'rgba(245,158,11,0.04)' : hasError ? 'rgba(239,68,68,0.04)' : idx % 2 === 0 ? 'rgba(0,0,0,0.01)' : 'transparent'}
                                >
                                  <td style={{ padding: '0.25rem 0.5rem', color: 'var(--muted-foreground)', fontSize: '0.7rem', fontFamily: 'monospace', borderRight: '1px solid var(--border)' }}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', paddingLeft: '0.5rem' }}>
                                      <span style={{ color: '#6366f1', opacity: 0.5 }}>{idx === group.products.length - 1 ? '└' : '├'}</span>
                                    </span>
                                  </td>
                                  <td style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', color: notMfg ? '#f59e0b' : isMissingData(item.productCode) ? '#ef4444' : 'var(--foreground)', fontFamily: 'monospace', fontWeight: '600', borderRight: '1px solid var(--border)' }}>
                                    {item.productCode || 'N/A'}
                                  </td>
                                  <td style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', color: 'var(--foreground)', borderRight: '1px solid var(--border)' }}>{item.genericName || '-'}</td>
                                  <td style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', color: isMissingData(item.masterCardNo) ? '#ef4444' : 'var(--muted-foreground)', fontFamily: 'monospace', borderRight: '1px solid var(--border)' }}>{item.masterCardNo || 'N/A'}</td>
                                  {(() => {
                                    const theraStyle2 = getMfcCellStyle(item, 'therapeutic');
                                    const missingThera2 = isMissingData(item.therapeuticCategory);
                                    return (
                                      <td style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', borderRight: '1px solid var(--border)' }}>
                                        <span style={{ padding: '0.2rem 0.5rem', background: missingThera2 ? 'rgba(239,68,68,0.1)' : theraStyle2 ? theraStyle2.bg : 'rgba(245,158,11,0.1)', color: missingThera2 ? '#ef4444' : theraStyle2 ? theraStyle2.color : '#f59e0b', borderRadius: 'var(--radius-sm)', fontSize: '0.7rem', fontWeight: '600' }}>
                                          {item.therapeuticCategory || 'N/A'}
                                        </span>
                                      </td>
                                    );
                                  })()}
                                  <td style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', fontWeight: '500', color: isMissingData(item.productName) ? '#ef4444' : 'var(--foreground)', borderRight: '1px solid var(--border)' }}>{item.productName || 'N/A'}</td>
                                  <td style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', color: isMissingData(item.department) ? '#ef4444' : 'var(--foreground)', borderRight: '1px solid var(--border)' }}>{item.department || 'N/A'}</td>
                                  {(() => {
                                    const storStyle2 = getMfcCellStyle(item, 'storage');
                                    const missingStorage2 = isMissingData(item.storageCondition);
                                    return (
                                      <td style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', maxWidth: '200px', borderRight: '1px solid var(--border)', background: missingStorage2 ? 'rgba(239,68,68,0.06)' : storStyle2 ? storStyle2.bg : undefined, color: missingStorage2 ? '#ef4444' : storStyle2 ? storStyle2.color : 'var(--muted-foreground)' }}>
                                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.storageCondition || 'N/A'}>{item.storageCondition || 'N/A'}</div>
                                      </td>
                                    );
                                  })()}
                                  <td style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', borderRight: '1px solid var(--border)' }}>
                                    <span style={{ padding: '0.2rem 0.5rem', background: isMissingData(item.productType) ? 'rgba(239,68,68,0.1)' : item.productType === 'EXPORT' ? 'rgba(20,184,166,0.1)' : 'rgba(139,92,246,0.1)', color: isMissingData(item.productType) ? '#ef4444' : item.productType === 'EXPORT' ? '#14b8a6' : '#8b5cf6', borderRadius: 'var(--radius-sm)', fontSize: '0.7rem', fontWeight: '600' }}>
                                      {item.productType || 'N/A'}
                                    </span>
                                  </td>
                                  <td style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', borderRight: '1px solid var(--border)' }}>
                                    {item.specification ? (
                                      <span style={{ padding: '0.2rem 0.5rem', background: 'rgba(99,102,241,0.1)', color: '#6366f1', borderRadius: 'var(--radius-sm)', fontSize: '0.7rem', fontWeight: '700', fontFamily: 'monospace' }}>
                                        {item.specification}
                                      </span>
                                    ) : <span style={{ color: 'var(--muted-foreground)' }}>—</span>}
                                  </td>
                                  {(() => {
                                    const effStyle2 = getMfcCellStyle(item, 'effBatch');
                                    return (
                                      <td style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', fontFamily: 'monospace', borderRight: '1px solid var(--border)', background: effStyle2 ? effStyle2.bg : undefined, color: effStyle2 ? effStyle2.color : item.effectiveBatchNo ? 'var(--foreground)' : 'var(--muted-foreground)' }}>
                                        {item.effectiveBatchNo || '—'}
                                      </td>
                                    );
                                  })()}
                                  <td style={{ padding: '0.25rem 0.5rem', fontSize: '0.7rem', verticalAlign: 'top' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                      {notMfg && (
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.2rem 0.5rem', background: 'rgba(245,158,11,0.15)', color: '#f59e0b', borderRadius: 'var(--radius-sm)', fontSize: '0.65rem', fontWeight: '700' }}>
                                          MFG MISSING
                                        </span>
                                      )}
                                      {hasError && (
                                        <div style={{ color: '#ef4444', fontWeight: '700', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                          <span>MISSING:</span>
                                          <ul style={{ paddingLeft: '1rem', margin: 0, listStyleType: 'disc' }}>
                                            {errors.map((e, i) => <li key={i}>{e}</li>)}
                                          </ul>
                                        </div>
                                      )}
                                      {!notMfg && !hasError && (
                                        <span style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
                                          OK
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </React.Fragment>
                        );
                      })}
                    </>
                  );
                })() : viewMode === 'batch' ? (() => {
                  // Batch-wise view: group products by Batch No (from Batch collection),
                  // and render as a table with Batch No shown once (rowspan).
                  if (batchViewLoading || batchLinkMap === null) {
                    return (
                      <tr>
                        <td colSpan={tableColSpan} style={{ padding: '3rem', textAlign: 'center', color: 'var(--muted-foreground)' }}>
                          <svg className="animate-spin" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ display: 'inline-block', marginBottom: '0.5rem' }}>
                            <path d="M21 12a9 9 0 11-6.219-8.56" strokeLinecap="round" />
                          </svg>
                          <div>Loading batch data...</div>
                        </td>
                      </tr>
                    );
                  }

                  // Build code → batch numbers map so we can iterate scopedFiltered in sort order
                  const codeToBatches = new Map<string, string[]>();
                  batchLinkMap.forEach((codes, batchNumber) => {
                    codes.forEach(code => {
                      if (!codeToBatches.has(code)) codeToBatches.set(code, []);
                      codeToBatches.get(code)!.push(batchNumber);
                    });
                  });

                  // Build groups preserving scopedFiltered order (respects active filters + sorting)
                  const groupMap = new Map<string, ProductMaster[]>();
                  const linkedCodes = new Set<string>();
                  batchLinkMap.forEach(codes => codes.forEach(c => linkedCodes.add(c)));

                  scopedFiltered.forEach(item => {
                    const code = item.productCode;
                    if (!code) return;
                    const batches = codeToBatches.get(code);
                    if (batches && batches.length > 0) {
                      batches.forEach(batchNo => {
                        if (!groupMap.has(batchNo)) groupMap.set(batchNo, []);
                        groupMap.get(batchNo)!.push(item);
                      });
                    }
                  });

                  // Products with no batch association (also in scopedFiltered order)
                  const unlinked = scopedFiltered.filter(item => !item.productCode || !linkedCodes.has(item.productCode));
                  if (unlinked.length > 0) groupMap.set('__no_batch__', unlinked);

                  // Sort batch groups by Batch No asc (__no_batch__ last)
                  const sortedKeys = Array.from(groupMap.keys()).sort((a, b) => {
                    if (a === '__no_batch__') return 1;
                    if (b === '__no_batch__') return -1;
                    return a.localeCompare(b);
                  });

                  const groups = sortedKeys.map(key => ({ key, products: groupMap.get(key) ?? [] }));

                  let rowKey = 0;
                  return (
                    <>
                      {groups.flatMap(group => {
                        const isNoBatch = group.key === '__no_batch__';
                        const batchLabel = isNoBatch ? 'NO BATCH' : group.key;
                        const batchBg = isNoBatch ? 'rgba(100,116,139,0.08)' : 'rgba(99,102,241,0.06)';
                        const batchColor = isNoBatch ? '#64748b' : '#4f46e5';
                        const batchBorder = isNoBatch ? 'rgba(100,116,139,0.25)' : 'rgba(79,70,229,0.25)';

                        return group.products.map((item, idx) => {
                          const errors = getMissingFields(item);
                          const hasMissing = errors.length > 0;
                          const notMfg = isNonManufactured(item);
                          const code = (item.productCode || '').trim();
                          const m = code ? mismatchMap.get(code) : undefined;
                          const hasMismatch = Boolean(m?.any);
                          const rowHasError = hasMissing || notMfg || hasMismatch;

                          return (
                            <tr key={`${group.key}-${item._id}-${rowKey++}`} style={{
                              borderBottom: '1px solid var(--border)',
                              background: rowHasError ? 'rgba(239, 68, 68, 0.035)' : idx % 2 === 0 ? 'transparent' : 'rgba(0, 0, 0, 0.015)',
                            }}>
                              {/* Batch No (rowspan) */}
                              {idx === 0 && (
                                <td
                                  rowSpan={group.products.length}
                                  style={{
                                    padding: '0.35rem 0.5rem',
                                    verticalAlign: 'top',
                                    borderRight: '1px solid var(--border)',
                                    background: batchBg,
                                    minWidth: '120px',
                                  }}
                                >
                                  <span style={{
                                    display: 'inline-flex',
                                    padding: '0.2rem 0.5rem',
                                    borderRadius: '9999px',
                                    background: 'rgba(255,255,255,0.75)',
                                    border: `1px solid ${batchBorder}`,
                                    color: batchColor,
                                    fontWeight: 800,
                                    fontSize: '0.7rem',
                                    fontFamily: 'monospace',
                                  }}>
                                    {batchLabel}
                                  </span>
                                </td>
                              )}

                              {/* Product Code */}
                              <td style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', fontFamily: 'monospace', fontWeight: 700, color: isMissingData(item.productCode) ? '#ef4444' : 'var(--foreground)', borderRight: '1px solid var(--border)' }}>
                                {item.productCode || 'N/A'}
                              </td>

                              {/* Generic Name */}
                              <td style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', color: isMissingData(item.genericName) ? '#ef4444' : 'var(--foreground)', borderRight: '1px solid var(--border)' }}>
                                {item.genericName || '—'}
                              </td>

                              {/* MFC No */}
                              <td style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', fontFamily: 'monospace', color: isMissingData(item.masterCardNo) ? '#ef4444' : 'var(--muted-foreground)', borderRight: '1px solid var(--border)' }}>
                                {item.masterCardNo || 'N/A'}
                              </td>

                              {/* Therapeutic Category (supports mismatch highlight like MFC view) */}
                              {(() => {
                                const theraStyle = getMfcCellStyle(item, 'therapeutic');
                                const missingThera = isMissingData(item.therapeuticCategory);
                                return (
                                  <td style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', borderRight: '1px solid var(--border)' }}>
                                    <span style={{
                                      padding: '0.2rem 0.5rem',
                                      background: missingThera ? 'rgba(239,68,68,0.1)' : theraStyle ? theraStyle.bg : 'rgba(245,158,11,0.1)',
                                      color: missingThera ? '#ef4444' : theraStyle ? theraStyle.color : '#f59e0b',
                                      borderRadius: 'var(--radius-sm)',
                                      fontSize: '0.7rem',
                                      fontWeight: '600',
                                    }}>
                                      {item.therapeuticCategory || 'N/A'}
                                    </span>
                                  </td>
                                );
                              })()}

                              {/* Product Name */}
                              <td style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', fontWeight: 600, color: isMissingData(item.productName) ? '#ef4444' : 'var(--foreground)', borderRight: '1px solid var(--border)' }}>
                                {item.productName || 'N/A'}
                              </td>

                              {/* Department */}
                              <td style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', color: isMissingData(item.department) ? '#ef4444' : 'var(--foreground)', borderRight: '1px solid var(--border)' }}>
                                {item.department || 'N/A'}
                              </td>

                              {/* Storage Condition (supports mismatch highlight like MFC view) */}
                              {(() => {
                                const storStyle = getMfcCellStyle(item, 'storage');
                                const missingStorage = isMissingData(item.storageCondition);
                                return (
                                  <td style={{
                                    padding: '0.25rem 0.5rem',
                                    fontSize: '0.8rem',
                                    maxWidth: '220px',
                                    borderRight: '1px solid var(--border)',
                                    background: missingStorage ? 'rgba(239,68,68,0.06)' : storStyle ? storStyle.bg : undefined,
                                    color: missingStorage ? '#ef4444' : storStyle ? storStyle.color : 'var(--muted-foreground)',
                                  }}>
                                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.storageCondition || 'N/A'}>
                                      {item.storageCondition || 'N/A'}
                                    </div>
                                  </td>
                                );
                              })()}

                              {/* Spec */}
                              <td style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', borderRight: '1px solid var(--border)' }}>
                                {item.specification ? (
                                  <span style={{ padding: '0.2rem 0.5rem', background: 'rgba(99,102,241,0.1)', color: '#6366f1', borderRadius: 'var(--radius-sm)', fontSize: '0.7rem', fontWeight: '800', fontFamily: 'monospace' }}>
                                    {item.specification}
                                  </span>
                                ) : <span style={{ color: 'var(--muted-foreground)' }}>—</span>}
                              </td>

                              {/* Effective Batch No (supports mismatch highlight like MFC view) */}
                              {(() => {
                                const effStyle = getMfcCellStyle(item, 'effBatch');
                                const effMissing = !isValidEffBatch(item.effectiveBatchNo);
                                return (
                                  <td style={{
                                    padding: '0.25rem 0.5rem',
                                    fontSize: '0.75rem',
                                    fontFamily: 'monospace',
                                    borderRight: '1px solid var(--border)',
                                    background: effMissing ? 'rgba(239,68,68,0.06)' : effStyle ? effStyle.bg : undefined,
                                    color: effMissing ? '#ef4444' : effStyle ? effStyle.color : item.effectiveBatchNo ? 'var(--foreground)' : 'var(--muted-foreground)',
                                  }}>
                                    {item.effectiveBatchNo || '—'}
                                  </td>
                                );
                              })()}

                              {/* Status */}
                              {(() => {
                                const statusParts: string[] = [];
                                if (notMfg) statusParts.push('MFG MISSING');
                                if (hasMissing) statusParts.push('MISSING');
                                if (hasMismatch) statusParts.push('MISMATCH');
                                if (statusParts.length === 0) statusParts.push('OK');
                                const status = statusParts.join(' | ');
                                const statusColor =
                                  status === 'OK' ? '#10b981'
                                  : status.includes('MISSING') ? '#ef4444'
                                  : '#f59e0b';
                                return (
                                  <td style={{ padding: '0.25rem 0.5rem', fontSize: '0.7rem', color: statusColor }}>
                                    {status}
                                  </td>
                                );
                              })()}
                            </tr>
                          );
                        });
                      })}
                    </>
                  );
                })() : (
                  scopedFiltered.map((item, index) => {
                    // Check if row has errors
                    const errors = getMissingFields(item);
                    const hasError = errors.length > 0;

                    const notMfg = isNonManufactured(item);

                    return (
                      <tr key={item._id} style={{
                        borderBottom: '1px solid var(--border)',
                        transition: 'background-color var(--transition-fast)',
                        background: (notMfg && hasError)
                          ? 'rgba(239, 68, 68, 0.05)'
                          : notMfg
                            ? 'rgba(245, 158, 11, 0.05)'
                            : hasError
                              ? 'rgba(239, 68, 68, 0.05)'
                              : index % 2 === 0 ? 'transparent' : 'rgba(0, 0, 0, 0.02)',
                        borderLeft: (notMfg && hasError) ? '3px solid #ef4444' : notMfg ? '3px solid #f59e0b' : hasError ? '3px solid #ef4444' : 'none',
                      }}
                        onMouseEnter={(e) => e.currentTarget.style.background = (notMfg && hasError) ? 'rgba(239, 68, 68, 0.1)' : notMfg ? 'rgba(245, 158, 11, 0.1)' : hasError ? 'rgba(239, 68, 68, 0.1)' : 'var(--muted)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = notMfg ? 'rgba(245, 158, 11, 0.05)' : hasError ? 'rgba(239, 68, 68, 0.05)' : index % 2 === 0 ? 'transparent' : 'rgba(0, 0, 0, 0.02)'}
                      >
                        {/* SR Number */}
                        <td style={{
                          padding: '0.25rem 0.5rem',
                          fontSize: '0.7rem',
                          fontWeight: '600',
                          color: 'var(--foreground)',
                          fontFamily: 'monospace',
                          borderRight: '1px solid var(--border)',
                        }}>
                          {index + 1}
                        </td>

                        {/* Product Code */}
                        <td style={{
                          padding: '0.25rem 0.5rem',
                          fontSize: '0.7rem',
                          color: isMissingData(item.productCode) ? '#ef4444' : 'var(--foreground)',
                          fontFamily: 'monospace',
                          fontWeight: '500',
                          borderRight: '1px solid var(--border)',
                        }}>{item.productCode || 'N/A'}</td>

                        {/* Generic Name */}
                        <td style={{
                          padding: '0.25rem 0.5rem',
                          fontSize: '0.7rem',
                          color: 'var(--foreground)',
                          borderRight: '1px solid var(--border)',
                        }}>
                          {item.genericName || '-'}
                        </td>

                        {/* Master Card No */}
                        <td style={{
                          padding: '0.25rem 0.5rem',
                          fontSize: '0.7rem',
                          color: isMissingData(item.masterCardNo) ? '#ef4444' : 'var(--foreground)',
                          fontFamily: 'monospace',
                          borderRight: '1px solid var(--border)',
                        }}>{item.masterCardNo || 'N/A'}</td>

                        {/* Therapeutic Category */}
                        {(() => {
                          const theraStyle4 = getMfcCellStyle(item, 'therapeutic');
                          const missingThera4 = isMissingData(item.therapeuticCategory);
                          return (
                            <td style={{ padding: '0.25rem 0.5rem', fontSize: '0.7rem', color: 'var(--foreground)', borderRight: '1px solid var(--border)' }}>
                              <span style={{ padding: '0.1rem 0.4rem', background: missingThera4 ? 'rgba(239,68,68,0.1)' : theraStyle4 ? theraStyle4.bg : 'rgba(245,158,11,0.1)', color: missingThera4 ? '#ef4444' : theraStyle4 ? theraStyle4.color : '#f59e0b', borderRadius: 'var(--radius-sm)', fontSize: '0.65rem', fontWeight: '600' }}>
                                {item.therapeuticCategory || 'N/A'}
                              </span>
                            </td>
                          );
                        })()}

                        {/* Product Name */}
                        <td style={{
                          padding: '0.25rem 0.5rem',
                          fontSize: '0.7rem',
                          fontWeight: '500',
                          color: isMissingData(item.productName) ? '#ef4444' : 'var(--foreground)',
                          borderRight: '1px solid var(--border)',
                        }}>{item.productName || 'N/A'}</td>

                        {/* Department */}
                        <td style={{
                          padding: '0.25rem 0.5rem',
                          fontSize: '0.7rem',
                          color: isMissingData(item.department) ? '#ef4444' : 'var(--foreground)',
                          borderRight: '1px solid var(--border)',
                        }}>{item.department || 'N/A'}</td>

                        {/* Storage Condition */}
                        {(() => {
                          const storStyle4 = getMfcCellStyle(item, 'storage');
                          const missingStorage4 = isMissingData(item.storageCondition);
                          return (
                            <td style={{ padding: '0.25rem 0.5rem', fontSize: '0.7rem', maxWidth: '200px', borderRight: '1px solid var(--border)', background: missingStorage4 ? 'rgba(239,68,68,0.06)' : storStyle4 ? storStyle4.bg : undefined, color: missingStorage4 ? '#ef4444' : storStyle4 ? storStyle4.color : 'var(--muted-foreground)' }}>
                              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.storageCondition || 'N/A'}>
                                {item.storageCondition || 'N/A'}
                              </div>
                            </td>
                          );
                        })()}

                        {/* Product Type */}
                        <td style={{
                          padding: '0.25rem 0.5rem',
                          fontSize: '0.7rem',
                          color: 'var(--foreground)',
                          borderRight: '1px solid var(--border)',
                        }}>
                          <span style={{
                            padding: '0.1rem 0.4rem',
                            background: isMissingData(item.productType)
                              ? 'rgba(239, 68, 68, 0.1)'
                              : item.productType === 'EXPORT' ? 'rgba(20, 184, 166, 0.1)' : 'rgba(139, 92, 246, 0.1)',
                            color: isMissingData(item.productType)
                              ? '#ef4444'
                              : item.productType === 'EXPORT' ? '#14b8a6' : '#8b5cf6',
                            borderRadius: 'var(--radius-sm)',
                            fontSize: '0.65rem',
                            fontWeight: '600',
                          }}>
                            {item.productType || 'N/A'}
                          </span>
                        </td>

                        {/* Specification */}
                        <td style={{ padding: '0.25rem 0.5rem', fontSize: '0.7rem', borderRight: '1px solid var(--border)' }}>
                          {item.specification ? (
                            <span style={{
                              padding: '0.1rem 0.4rem',
                              background: 'rgba(99, 102, 241, 0.1)',
                              color: '#6366f1',
                              borderRadius: 'var(--radius-sm)',
                              fontSize: '0.65rem',
                              fontWeight: '700',
                              fontFamily: 'monospace',
                            }}>
                              {item.specification}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--muted-foreground)', fontSize: '0.65rem' }}>—</span>
                          )}
                        </td>

                        {/* Effective Batch No */}
                        {(() => {
                          const effStyle4 = getMfcCellStyle(item, 'effBatch');
                          return (
                            <td style={{ padding: '0.25rem 0.5rem', fontSize: '0.7rem', fontFamily: 'monospace', borderRight: '1px solid var(--border)', background: effStyle4 ? effStyle4.bg : undefined, color: effStyle4 ? effStyle4.color : item.effectiveBatchNo ? 'var(--foreground)' : 'var(--muted-foreground)' }}>
                              {item.effectiveBatchNo || '—'}
                            </td>
                          );
                        })()}

                        {/* Status (Errors / MFG Missing / Mismatch) */}
                        {(() => {
                          const prodCode = (item.productCode || '').trim();
                          const prodMM = prodCode ? mismatchMap.get(prodCode) : undefined;
                          const mismatchFields4: string[] = [];
                          if (prodMM?.storage) mismatchFields4.push('Storage Condition');
                          if (prodMM?.therapeutic) mismatchFields4.push('Therapeutic Category');
                          if (prodMM?.effectiveBatch) mismatchFields4.push('Effective Batch');
                          const hasMismatch4 = mismatchFields4.length > 0;
                          const isOK = !notMfg && !hasError && !hasMismatch4;
                          return (
                            <td style={{
                              padding: '0.25rem 0.5rem',
                              fontSize: '0.65rem',
                              fontWeight: '600',
                              verticalAlign: 'middle',
                            }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                                {notMfg && (
                                  <span style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.3rem',
                                    padding: '0.2rem 0.5rem',
                                    background: 'rgba(245, 158, 11, 0.15)',
                                    color: '#f59e0b',
                                    borderRadius: 'var(--radius-sm)',
                                    fontSize: '0.7rem',
                                    fontWeight: '700',
                                  }}>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                      <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                                    </svg>
                                    MFG MISSING
                                  </span>
                                )}
                                {hasError && (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', color: '#ef4444' }}>
                                    <span style={{ fontWeight: '700' }}>MISSING:</span>
                                    <ul style={{ paddingLeft: '1rem', margin: 0, listStyleType: 'disc' }}>
                                      {errors.map((err: string, i: number) => (
                                        <li key={i}>{err}</li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                                {hasMismatch4 && (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                                    <span style={{ fontWeight: '700', color: '#d97706' }}>MISMATCH:</span>
                                    <ul style={{ paddingLeft: '1rem', margin: 0, listStyleType: 'disc', color: '#d97706' }}>
                                      {mismatchFields4.map((f, i) => <li key={i}>{f}</li>)}
                                    </ul>
                                  </div>
                                )}
                                {isOK && (
                                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: '#10b981' }}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                      <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                    OK
                                  </span>
                                )}
                              </div>
                            </td>
                          );
                        })()}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

      </main>
    </div>
  );
}
