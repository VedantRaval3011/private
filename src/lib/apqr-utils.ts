import { Batch } from '@/models/Batch';
import { Formula } from '@/models/Formula';
import { RMCOA } from '@/models/RMCOA';
import { ProductMaster } from '@/models/ProductMaster';
import { InwardRegister } from '@/models/InwardRegister';
import { Requisition } from '@/models/Requisition';
import { MaterialRejection } from '@/models/MaterialRejection';
import { COA } from '@/models/COA';
import RetainedSample from '@/models/RetainedSample';
import Yield from '@/models/Yield';
import type { CompositionItem, ProcessData } from '@/types/formula';
import connectToDatabase from '@/lib/mongodb';
import { normalizeStorageCondition } from '@/lib/storageCondition';
import {
  applyApqrExcelReviewSections,
  logApqrReviewSectionReport,
} from '@/lib/apqr-review-sections';
import { loadReviewExcelCatalog } from '@/lib/review-excel';
import JSZip from 'jszip';
import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';



// Month names for parsing and display
const MONTHS = [
  'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
  'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'
];

const FULL_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

/**
 * Parses a date string - supports DD-MMM-YY (e.g., "15-APR-25"), ISO, and DD/MM/YYYY
 * Returns a Date object or null if invalid
 */
export function parseBatchDate(dateStr: string): Date | null {
  if (!dateStr || dateStr === 'N/A' || typeof dateStr !== 'string') return null;
  const s = dateStr.trim();
  if (!s) return null;

  // 1. DD-MMM-YY format (e.g., "15-APR-25")
  const parts = s.split('-');
  if (parts.length === 3) {
    const day = parseInt(parts[0], 10);
    const monthStr = parts[1].toUpperCase();
    const yearStr = parts[2];
    const monthIndex = MONTHS.indexOf(monthStr);
    if (monthIndex !== -1 && !isNaN(day)) {
      const y = parseInt(yearStr, 10);
      const year = y < 100 ? 2000 + y : y;
      const d = new Date(year, monthIndex, day);
      if (!isNaN(d.getTime())) return d;
    }
  }

  // 2. ISO or other format - try native Date
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d;

  // 3. DD/MM/YYYY or DD/MM/YY
  const slashParts = s.split('/');
  if (slashParts.length === 3) {
    const day = parseInt(slashParts[0], 10);
    const month = parseInt(slashParts[1], 10) - 1;
    const y = parseInt(slashParts[2], 10);
    const year = y < 100 ? 2000 + y : y;
    const d2 = new Date(year, month, day);
    if (!isNaN(d2.getTime())) return d2;
  }

  // 4. MM/YYYY or MM/YY (Default to 1st of month)
  if (slashParts.length === 2) {
    const month = parseInt(slashParts[0], 10) - 1;
    const y = parseInt(slashParts[1], 10);
    const year = y < 100 ? 2000 + y : y;
    if (month >= 0 && month <= 11) {
      const d3 = new Date(year, month, 1);
      if (!isNaN(d3.getTime())) return d3;
    }
  }

  return null;
}

/**
 * Formats a Date object to MM/YYYY string
 */
export function formatMonthYear(date: Date): string {
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${month}/${year}`;
}

/** Volume UOMs from Batch Creation (BATCHUOM field). */
const BATCH_VOLUME_UOMS = new Set(['LTR', 'L', 'ML', 'KG', 'G', 'GM', 'GMS']);

/**
 * Formats batch size the same way as Batch Creation / batches UI:
 * `${batchSize} ${batchUom}` (e.g. "30 LTR"), not pack-count unit (BOT/NOS).
 */
export function formatBatchCreationSize(batch: {
  batchSize?: string | null;
  batchUom?: string | null;
  unit?: string | null;
}): string {
  const sizeRaw = (batch.batchSize ?? '').toString().trim();
  if (!sizeRaw || sizeRaw === 'N/A') return 'N/A';

  const batchSizeNum = parseFloat(sizeRaw.replace(/,/g, ''));
  const formattedNum = !isNaN(batchSizeNum)
    ? (Number.isInteger(batchSizeNum)
      ? batchSizeNum.toString()
      : batchSizeNum.toFixed(2).replace(/\.?0+$/, ''))
    : sizeRaw;

  const batchUom = (batch.batchUom ?? '').toString().trim().toUpperCase();
  if (batchUom && batchUom !== 'N/A') {
    return `${formattedNum} ${batchUom}`;
  }

  const unit = (batch.unit ?? '').toString().trim().toUpperCase();
  if (unit && unit !== 'N/A') {
    return `${formattedNum} ${unit}`;
  }

  return formattedNum;
}

interface MaterialVendorDetail {
  srNo: number;
  materialCode: string;
  materialName: string;
  arNumbers: string[]; // Array of AR numbers to be stacked vertically
  vendor: string;
}

interface PpmVendorDetail {
  srNo: number;
  materialCode: string;
  materialName: string;
  arNumbers: string[];
  vendor: string;
}

interface SecondaryPackagingDetail {
  srNo: number;
  materialCode: string;
  materialName: string;
  arNumbers: string[];
  vendor: string;
  artworkStatus: string;
}

interface RawMaterialRow {
  srNo: number;
  materialCode: string;
  materialName: string;
  spec: string;
  theoQtyPerMl: string;
  overagePercent: string;
  actualQtyPerMl: string;
  qtyRequiredPerBatch: string;
  isCalculated: boolean;
  isPotencyEnabled?: boolean;
}

interface PackingMaterialRow {
  srNo: number;
  materialCode: string;
  materialName: string;
  qtyRequired: string;       // scaled quantity (e.g. "19803")
  excessPercent: string;      // e.g. "1 %"
  packGroup: string;          // "FOR 5 ML", "FOR 10 ML"
  isGroupHeader?: boolean;    // true for group header rows
}

interface ActiveRawMaterialDetail {
  srNo: number;
  materialCode: string;
  materialName: string;
  received: number;        // count of unique AR numbers from Inward Register in review year
  rejected: number;        // count of rejected AR numbers from MaterialRejection
  released: number;        // received - rejected
  arEntries: Array<{       // each AR with its associated batch numbers
    arNumber: string;
    batchNumbers: string[];
  }>;
  remark: string;          // auto-generated dynamic remark
}

interface PrimaryPackingMaterialDetail {
  srNo: number;
  materialCode: string;
  materialName: string;
  received: number;        // count of inward entries for this materialCode in review year
  rejected: number;        // count of rejected AR numbers from MaterialRejection
  released: number;        // received - rejected
  arEntries: Array<{       // each AR with its associated batch numbers
    arNumber: string;
    batchNumbers: string[];
  }>;
  remark: string;          // auto-generated dynamic remark
}

interface RMTestRow512 {
  arNumber: string;
  description: string;
  ph: string;
  water: string;
  assays: Record<string, string>; // keyed by spec name e.g. { "IP": "99.68", "USP": "99.60" }
}

interface RMTestMaterial512 {
  materialCode: string;
  materialName: string;
  phLimit: string;
  waterLimit: string;
  assaySpecs: { specName: string; limit: string }[];
  rows: RMTestRow512[];
  graphs?: any[];
}

interface BulkInProcessRow {
  batchNumber: string;
  batchSize: string;
  arNumber: string;
  description: string;
  ph: string;
  assay: string;           // first compound value (backward compat)
  assays: { compound: string; value: string }[];  // ALL assay compounds
}

interface SterilityTestingRow {
  batchNumber: string;
  result: string;
}

const DEFAULT_STERILITY_LIMIT =
  'Growth or turbidity should not present in the original clear media.';

/** Normalise FINISH COA sterility result text for Section 5.3.3 display. */
function normalizeSterilityResult(raw: string | undefined | null): string {
  const s = (raw ?? '').trim();
  if (!s) return 'Complies';
  if (/growth or turbidity was not present/i.test(s)) return 'Complies';
  if (/^complies?\.?$/i.test(s)) return 'Complies';
  return s;
}

/** Extract sterility result + limit from a FINISH COA finishData object. */
function extractSterilityFromFinishData(fd: any): { result: string; limit: string } | null {
  if (!fd) return null;

  for (const cp of (fd.criticalParameters || [])) {
    const name = (cp.name || '').toUpperCase();
    if (name.includes('STERILITY') || name.includes('STERILE')) {
      let limit = (cp.limit || '').trim();
      if (limit.includes('\n')) limit = limit.split('\n')[0].trim();
      return {
        result: normalizeSterilityResult(cp.result),
        limit: limit || DEFAULT_STERILITY_LIMIT,
      };
    }
  }

  if (fd.sterility?.name) {
    let limit = (fd.sterility.limits || '').trim();
    if (limit.includes('\n')) limit = limit.split('\n')[0].trim();
    return {
      result: normalizeSterilityResult(fd.sterility.result),
      limit: limit || DEFAULT_STERILITY_LIMIT,
    };
  }

  return null;
}

/**
 * Build one sterility row per manufactured batch (Section 5.3.3) from FINISH COAs.
 */
export function buildSterilityTestingData(
  finalBatches: Array<{ batchNumber: string }>,
  finishCoas: any[],
): { rows: SterilityTestingRow[]; limit: string } {
  const coasByBatch = new Map<string, any[]>();
  for (const coa of finishCoas) {
    const bn = (coa.batchNumber || '').trim();
    if (!bn) continue;
    if (!coasByBatch.has(bn)) coasByBatch.set(bn, []);
    coasByBatch.get(bn)!.push(coa);
  }

  let limit = DEFAULT_STERILITY_LIMIT;
  const rows: SterilityTestingRow[] = [];

  for (const batch of finalBatches) {
    const bn = batch.batchNumber;
    const coas = coasByBatch.get(bn) || [];
    let result = '--';

    for (const coa of coas) {
      const extracted = extractSterilityFromFinishData((coa as any).finishData);
      if (extracted) {
        result = extracted.result;
        if (extracted.limit) limit = extracted.limit;
        break;
      }
    }

    rows.push({ batchNumber: bn, result });
  }

  return { rows, limit };
}

const KNOWN_SPECS = [
  'IP/BP/USP/NF', 'IP/USP/NF', 'IP/BP/USP', 'IP/BP/NF', 'IP/BP/IH',
  'IP/USP', 'BP/NF', 'USP/NF', 'IP/NF', 'IP/BP',
  'IP', 'BP', 'USP', 'NF', 'IH', 'EP', 'JP'
];
// Run-together spec strings found in some DB records (no slashes/spaces)
const RUN_TOGETHER_SPECS: Record<string, string> = {
  'IBPBPUSPNF': 'IP/BP/USP/NF',
  'IPBPUSPNF': 'IP/BP/USP/NF',
  'IPUSPNF': 'IP/USP/NF',
  'IPBPUSP': 'IP/BP/USP',
  'IPBPNF': 'IP/BP/NF',
  'IPBPIH': 'IP/BP/IH',
  'IPUSP': 'IP/USP',
  'BPNF': 'BP/NF',
  'USPNF': 'USP/NF',
  'IPNF': 'IP/NF',
  'IPBP': 'IP/BP',
};

/**
 * Splits a material name that may contain a trailing spec token.
 * Handles three patterns:
 *   1. Spec at end:           "SODIUM CHLORIDE IP/USP"
 *   2. Spec + qualifier:      "CARBOXY METHYL CELLULOSE IP/BP/USP (STERILE)"
 *   3. Run-together spec:     "SODIUM CHLORIDE IBPBPUSPNF"
 * Also strips trailing punctuation (periods, commas) before matching.
 */
function splitMaterialNameAndSpec(fullName: string): { name: string; spec: string } {
  const trimmed = fullName.trim();
  // Strip trailing punctuation before matching (e.g. "GLYCERIN IP/NF.")
  const cleaned = trimmed.replace(/[.,;]+$/, '').trim();
  const upper = cleaned.toUpperCase();

  // Pattern 1: spec at the very end — "SODIUM CHLORIDE IP/USP"
  for (const spec of KNOWN_SPECS) {
    if (upper.endsWith(' ' + spec)) {
      return {
        name: cleaned.slice(0, cleaned.length - spec.length - 1).trim(),
        spec
      };
    }
  }

  // Pattern 2: spec followed by optional parenthetical qualifier
  // e.g. "CARBOXY METHYL CELLULOSE SODIUM IP/BP/USP (STERILE)"
  // e.g. "CARBOXY METHYL CELLULOSE SODIUM(STERILE) IP/BP/USP"
  for (const spec of KNOWN_SPECS) {
    const escapedSpec = spec.replace(/\//g, '\\/');
    const pattern = new RegExp(`^(.+?)\\s+${escapedSpec}\\s*(\\([^)]*\\))?\\s*$`);
    const m = upper.match(pattern);
    if (m) {
      const namePart = cleaned.slice(0, m[1].length).trim();
      const afterSpec = cleaned.slice(m[1].length + 1 + spec.length).trim();
      const qualifier = /^\([^)]*\)$/.test(afterSpec) ? afterSpec : '';
      return {
        name: qualifier ? `${namePart} ${qualifier}` : namePart,
        spec
      };
    }
  }

  // Pattern 3: run-together spec as last word — "SODIUM CHLORIDE IBPBPUSPNF"
  const words = upper.split(/\s+/);
  const lastWord = words[words.length - 1];
  if (lastWord && RUN_TOGETHER_SPECS[lastWord]) {
    const spec = RUN_TOGETHER_SPECS[lastWord];
    const originalWords = cleaned.split(/\s+/);
    return {
      name: originalWords.slice(0, -1).join(' ').trim(),
      spec
    };
  }

  return { name: trimmed, spec: '' };
}

/**
 * Scales a batch quantity from the formula batch size to the largest actual batch size.
 */
function scaleQuantity(
  reqAsPerStdBatch: string,
  formulaBatchSize: number,
  largestBatchSize: number,
  unit: string
): { value: string; isCalculated: boolean } {
  const raw = (reqAsPerStdBatch || '').trim();
  if (!raw || raw.toUpperCase().includes('Q.S')) {
    return { value: `Q.S. TO ${largestBatchSize} LITRES`, isCalculated: false };
  }
  const numMatch = raw.match(/[\d.]+/);
  if (!numMatch || formulaBatchSize === 0 || largestBatchSize === 0) {
    return { value: raw, isCalculated: false };
  }
  const originalQty = parseFloat(numMatch[0]);
  const scaledQty = (originalQty / formulaBatchSize) * largestBatchSize;
  const decimals = (numMatch[0].split('.')[1] || '').length;
  const formatted = scaledQty.toFixed(decimals);
  const unitStr = unit ? ` ${unit}` : '';
  return { value: `${formatted}${unitStr}`, isCalculated: true };
}

// ── Statistical & Process Capability Helpers ──
import {
  calculateProcessCapability,
  parseLimits,
  type ProcessCapabilityResults,
} from '@/lib/apqr-capability-math';

export {
  calculateProcessCapability,
  parseLimits,
  type ProcessCapabilityResults,
} from '@/lib/apqr-capability-math';

// ============================================
// Section 5.3.2 — Finished Product Table Builder
// ============================================

/** Normalise a specification string to a canonical label, e.g. "IH" → "IP". */
function normaliseSpec532(raw: string): string {
  const s = (raw || '').toUpperCase().trim();
  if (s === 'IH' || s === 'IP' || s.startsWith('IP')) return 'IP';
  if (s === 'USP' || s.startsWith('USP'))              return 'USP';
  if (s === 'BP'  || s.startsWith('BP'))               return 'BP';
  if (s === 'EP'  || s.startsWith('EP'))               return 'EP';
  return s || 'UNSPECIFIED';
}

/**
 * Returns the canonical specs a COA should appear in.
 * A COA with specification "IP/USP" appears in both IP and USP tables.
 */
function specsForCoa532(specField: string): string[] {
  const upper = (specField || '').toUpperCase().trim();
  const result: string[] = [];
  if (upper.includes('IP') || upper.includes('IH')) result.push('IP');
  if (upper.includes('USP'))                         result.push('USP');
  if (upper.includes('BP'))                          result.push('BP');
  if (upper.includes('EP'))                          result.push('EP');
  return result.length > 0 ? result : [normaliseSpec532(specField)];
}

/**
 * Whether an assay result belongs in the table for a given canonical spec.
 *
 * Assays tagged with a pharmacopoeial section (e.g. an "AS PER USP" assay)
 * appear only in that pharmacopoeia's table. Untagged assays ('OTHER' / blank
 * — i.e. a COA with no section markers) fall back to appearing in whichever
 * spec table(s) the COA itself belongs to, preserving single-pharmacopoeia COAs.
 */
function assayInSpec532(assay: any, spec: string): boolean {
  const raw = (assay?.standard || '').toUpperCase().trim();
  if (!raw || raw === 'OTHER') return true;
  return normaliseSpec532(raw) === spec;
}

/**
 * Build the array of Finish532Table objects from all FINISH stage COAs.
 *
 * Produces:
 *  • One or more "Critical Parameters" tables per pharmacopoeial specification
 *    (IP, USP, BP, …), each split at a maximum of 3 parameter columns.
 *  • One "Organic Impurities" table when Early-Eluting or Late-Eluting data
 *    exists (placed after all spec tables).
 */
export function buildFinish532Tables(finishCoas: any[], batchOrder: string[]): any[] {
  if (!finishCoas || finishCoas.length === 0) return [];

  const tables: any[] = [];

  // ── 1. Group COAs by canonical specification ──────────────────────────
  // A single COA (e.g. spec="IP/USP") may contribute to multiple spec groups.
  const coasBySpec = new Map<string, any[]>();
  for (const coa of finishCoas) {
    const specField = (coa as any).finishData?.specification || '';
    for (const spec of specsForCoa532(specField)) {
      if (!coasBySpec.has(spec)) coasBySpec.set(spec, []);
      coasBySpec.get(spec)!.push(coa);
    }
  }

  // Sort specs canonically: IP first, USP second, then alphabetical
  const specPriority = ['IP', 'USP', 'BP', 'EP'];
  const sortedSpecs = [...coasBySpec.keys()].sort((a, b) => {
    const ai = specPriority.indexOf(a); const bi = specPriority.indexOf(b);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1; if (bi !== -1) return 1;
    return a.localeCompare(b);
  });

  // ── 2. For each specification, build one or more Critical Parameters tables ──
  for (const spec of sortedSpecs) {
    const specCoas = coasBySpec.get(spec)!;

    // Reference COA: most complete data (most criticalParameters + assayResults)
    const refCoa = [...specCoas].sort((a: any, b: any) => {
      const sa = (a.finishData?.criticalParameters?.length || 0) + (a.finishData?.assayResults?.length || 0);
      const sb = (b.finishData?.criticalParameters?.length || 0) + (b.finishData?.assayResults?.length || 0);
      return sb - sa;
    })[0];
    const refFd: any = refCoa?.finishData;
    if (!refFd) continue;

    // Restrict every parameter family to the rows tagged for THIS pharmacopoeia
    // (assayInSpec532 also accepts untagged 'OTHER' rows, preserving
    // single-pharmacopoeia COAs). This keeps the "As Per IP" table from showing
    // USP-only tests (e.g. IDENTIFICATION B, early/late-eluting compounds) and
    // ensures each table uses its own limits (e.g. IP pH "6.3 to 7.3" vs USP
    // "6.3 to 7.9").
    const refCrit = ((refFd.criticalParameters || []) as any[]).filter((p: any) => assayInSpec532(p, spec));

    const getCritLimit = (pat: RegExp): string =>
      refCrit.find((p: any) => pat.test((p.name || '').toUpperCase()))?.limit || '';

    // Build parameter columns separated into qualitative and quantitative groups.
    // Sterility is intentionally excluded — it is handled in Section 5.3.3.
    // valKey: internal lookup key in the vals map (may differ from subHeader when
    // duplicate compound names exist across assay rows — keyed by index instead).
    type Col532 = { name: string; subHeader: string; limitText: string; valKey: string };

    // ── Qualitative parameters: Description, Identification, Related Substance ──
    const qualCols: Col532[] = [];

    // Description
    const descLim = getCritLimit(/^DESCRIPTION$/);
    if (refFd.description || descLim) {
      qualCols.push({ name: 'Description', subHeader: '', limitText: descLim, valKey: 'Description' });
    }

    // Identification tests (one column per compound), restricted to this
    // pharmacopoeia and de-duplicated by compound name (a dual IP/USP COA lists
    // the same compound once per section).
    const seenIdCompounds = new Set<string>();
    for (const idTest of ((refFd.identificationTests as any[]) || []).filter((id: any) => assayInSpec532(id, spec))) {
      const idKey = (idTest.compound || '').trim().toUpperCase();
      if (seenIdCompounds.has(idKey)) continue;
      seenIdCompounds.add(idKey);
      qualCols.push({
        name: 'Identification',
        subHeader: idTest.compound || '',
        limitText: idTest.specification || 'Complies',
        valKey: `Identification::${idTest.compound}`,
      });
    }

    // Related Substance by HPLC (multi-line limit text) — IP-section only on
    // dual-pharmacopoeia COAs.
    const hplcEntries: any[] = ((refFd.relatedSubstances as any[]) || []).filter(
      (rs: any) => /RELATED SUBSTANCE BY HPLC/i.test(rs.group || '') && assayInSpec532(rs, spec),
    );
    if (hplcEntries.length > 0) {
      const hplcGroupLimit = hplcEntries[0]?.groupLimit || '';
      qualCols.push({ name: 'Related Substance', subHeader: '', limitText: hplcGroupLimit, valKey: 'Related Substance' });
    }

    // ── Quantitative parameters: pH, Uniformity of Volume, Capping, Assay ──
    // (Sterility is excluded — handled separately in Section 5.3.3)
    const quantCols: Col532[] = [];

    // pH
    const phLim = getCritLimit(/\bPH\b/);
    if (phLim || refCrit.some((p: any) => /\bPH\b/.test((p.name || '').toUpperCase()))) {
      quantCols.push({ name: 'pH', subHeader: '', limitText: phLim, valKey: 'pH' });
    }

    // Uniformity of Volume — prefer the spec-tagged criticalParameters limit over
    // the single (last-write-wins, standard-agnostic) uniformityOfVolume field.
    const uniLim = getCritLimit(/UNIFORMITY/) || refFd.uniformityOfVolume?.limits;
    if (refCrit.some((p: any) => /UNIFORMITY/.test((p.name || '').toUpperCase())) || uniLim) {
      quantCols.push({ name: 'Uniformity of Volume', subHeader: '', limitText: uniLim, valKey: 'Uniformity of Volume' });
    }

    // Capping
    const capLim = getCritLimit(/CAPPING/) || refFd.capping?.limits;
    if (refCrit.some((p: any) => /CAPPING/.test((p.name || '').toUpperCase())) || capLim) {
      quantCols.push({ name: 'Capping', subHeader: '', limitText: capLim, valKey: 'Capping' });
    }

    // Osmolality (USP ophthalmic parameter, e.g. "260 to 370 mOsmol/kg")
    const osmoLim = getCritLimit(/OSMOLALITY|OSMOLARITY/);
    if (refCrit.some((p: any) => /OSMOLALITY|OSMOLARITY/.test((p.name || '').toUpperCase())) || osmoLim) {
      quantCols.push({ name: 'Osmolality', subHeader: '', limitText: osmoLim, valKey: 'Osmolality' });
    }

    // Assay — only the assays belonging to THIS pharmacopoeia. A dual-pharmacopoeia
    // COA (e.g. IP + USP) carries one assay per spec, often with identical compound
    // names; restricting to the current spec keeps the "As Per IP" table from
    // showing the USP assay column (and vice-versa). valKey is keyed by the
    // position within the spec-filtered list plus compound so per-batch values
    // align regardless of how each COA orders its assay rows.
    const refSpecAssays = (refFd.assayResults as any[] || []).filter((a: any) => assayInSpec532(a, spec));
    refSpecAssays.forEach((assay: any, i: number) => {
      const assayLim = assay.specification
        || (assay.limitMin && assay.limitMax ? `${assay.limitMin} to ${assay.limitMax}` : '');
      quantCols.push({
        name: 'Assay (%)',
        subHeader: assay.compound || '',
        limitText: assayLim,
        valKey: `Assay (%)::${i}::${(assay.compound || '').toUpperCase()}`,
      });
    });

    const allCols = [...qualCols, ...quantCols];
    if (allCols.length === 0) continue;

    // Pre-compute per-batch data values for all columns
    interface BatchValues { batchNumber: string; arNumber: string; vals: Record<string, string> }
    const batchValMap = new Map<string, BatchValues>();

    for (const coa of specCoas) {
      const fd: any = (coa as any).finishData;
      if (!fd) continue;
      const key = `${coa.batchNumber}__${fd.arNumber || ''}`;
      if (batchValMap.has(key)) continue;

      // Mirror the column filtering: only this pharmacopoeia's tagged rows.
      const crit: any[] = ((fd.criticalParameters as any[]) || []).filter((p: any) => assayInSpec532(p, spec));
      const getCrit = (pat: RegExp): string =>
        crit.find((p: any) => pat.test((p.name || '').toUpperCase()))?.result || '';

      const vals: Record<string, string> = {};
      vals['Description'] = getCrit(/^DESCRIPTION$/) || fd.description || '';

      for (const id of ((fd.identificationTests as any[]) || []).filter((x: any) => assayInSpec532(x, spec))) {
        vals[`Identification::${id.compound}`] = id.result || '';
      }

      const hplcBatch: any[] = ((fd.relatedSubstances as any[]) || []).filter(
        (rs: any) => /RELATED SUBSTANCE BY HPLC/i.test(rs.group || '') && assayInSpec532(rs, spec),
      );
      vals['Related Substance'] = hplcBatch.map((rs: any) => rs.result || 'ND').join('\n');

      vals['pH'] = getCrit(/\bPH\b/);
      vals['Uniformity of Volume'] = getCrit(/UNIFORMITY/) || fd.uniformityOfVolume?.result || '';
      vals['Capping'] = getCrit(/CAPPING/) || fd.capping?.result || '';
      vals['Osmolality'] = getCrit(/OSMOLALITY|OSMOLARITY/);
      // Sterility intentionally excluded — handled in Section 5.3.3

      // Mirror the column filtering: each batch contributes only its assays for
      // this pharmacopoeia, keyed identically to the columns above.
      (fd.assayResults as any[] || [])
        .filter((a: any) => assayInSpec532(a, spec))
        .forEach((assay: any, i: number) => {
          vals[`Assay (%)::${i}::${(assay.compound || '').toUpperCase()}`] = assay.result || '';
        });

      batchValMap.set(key, {
        batchNumber: coa.batchNumber,
        arNumber: fd.arNumber || (coa as any).arNumber || '',
        vals,
      });
    }

    // Order data rows by batchOrder
    const orderedRows: any[] = [];
    for (const bn of batchOrder) {
      for (const [, bv] of batchValMap) {
        if (bv.batchNumber === bn) orderedRows.push(bv);
      }
    }
    // Append any batches not in the official order (shouldn't happen, but safe)
    for (const [, bv] of batchValMap) {
      if (!orderedRows.some(r => r.batchNumber === bv.batchNumber && r.arNumber === bv.arNumber)) {
        orderedRows.push(bv);
      }
    }

    // Emit tables from a column group in slices of ≤ 3 columns each
    const emitColGroup = (cols: Col532[]) => {
      for (let start = 0; start < cols.length; start += 3) {
        const colGroup = cols.slice(start, start + 3);

        // Every batch that belongs to this pharmacopoeia must appear (a COA whose
        // spec contains "IP" shows in the IP table, etc.). Only drop a row when
        // the entire column group is empty for that batch — i.e. a genuine
        // phantom with no data — rather than gating on the Identification column.
        const dataRows = orderedRows
          .filter((bv: BatchValues) =>
            colGroup.some(col => (bv.vals[col.valKey] || '').trim() !== ''))
          .map((bv: BatchValues) => ({
          batchNumber: bv.batchNumber,
          arNumber: bv.arNumber,
          values: colGroup.map(col => bv.vals[col.valKey] || ''),
        }));

        tables.push({
          specificationLabel: `AS PER ${spec}:`,
          critParamsTitle:    `Critical Parameters (Limit) (As per ${spec})`,
          hasGroupRow: false,
          groupLabel:  '',
          columns:   colGroup,
          dataRows,
        });
      }
    };

    // Qualitative parameters table(s) first, then quantitative parameters table(s)
    if (qualCols.length > 0) emitColGroup(qualCols);
    if (quantCols.length > 0) emitColGroup(quantCols);
  }

  // ── 3. Organic Impurities table ────────────────────────────────────────
  const EARLY_KEY = 'EARLY-ELUTING RELATED COMPOUNDS';
  const LATE_KEY  = 'LATE-ELUTING RELATED COMPOUNDS';

  let earlyGroupLimit = '';
  let lateGroupLimit  = '';
  // Pharmacopoeia these organic impurities belong to (early/late-eluting related
  // compounds are USP). Captured from the entries so the table is labelled
  // "AS PER USP:" rather than appearing to belong to the IP section.
  let orgStandard = '';
  const orgImpRows: any[] = [];

  // Deduplicate by batchNumber+arNumber, preserve batch order
  const seenOrgKeys = new Set<string>();
  for (const bn of batchOrder) {
    for (const coa of finishCoas) {
      if ((coa as any).batchNumber !== bn) continue;
      const fd: any = (coa as any).finishData;
      if (!fd?.relatedSubstances) continue;

      const earlyEntries: any[] = ((fd.relatedSubstances as any[]) || []).filter(
        (rs: any) => (rs.group || '').toUpperCase() === EARLY_KEY,
      );
      const lateEntries: any[] = ((fd.relatedSubstances as any[]) || []).filter(
        (rs: any) => (rs.group || '').toUpperCase() === LATE_KEY,
      );

      if (earlyEntries.length === 0 && lateEntries.length === 0) continue;

      const key = `${coa.batchNumber}__${fd.arNumber || ''}`;
      if (seenOrgKeys.has(key)) continue;
      seenOrgKeys.add(key);

      if (!earlyGroupLimit && earlyEntries[0]?.groupLimit) earlyGroupLimit = earlyEntries[0].groupLimit;
      if (!lateGroupLimit  && lateEntries[0]?.groupLimit)  lateGroupLimit  = lateEntries[0].groupLimit;
      if (!orgStandard) {
        const raw = (earlyEntries[0]?.standard || lateEntries[0]?.standard || '').toUpperCase();
        if (raw === 'IP' || raw === 'USP') orgStandard = raw;
      }

      orgImpRows.push({
        batchNumber: coa.batchNumber,
        arNumber:    fd.arNumber || (coa as any).arNumber || '',
        values: [
          earlyEntries.map((rs: any) => rs.result || 'ND').join('\n'),
          lateEntries.map((rs: any) => rs.result  || 'ND').join('\n'),
        ],
      });
    }
  }

  if (orgImpRows.length > 0) {
    const orgLabel = orgStandard === 'IP' || orgStandard === 'USP' ? orgStandard : '';
    tables.push({
      specificationLabel: orgLabel ? `AS PER ${orgLabel}:` : '',
      critParamsTitle:    orgLabel ? `Critical Parameters (Limit) (As per ${orgLabel})` : 'Critical Parameters (Limit)',
      hasGroupRow: true,
      groupLabel:  'Organic Impurities',
      columns: [
        { name: 'Early-Eluting Related Compounds', subHeader: '', limitText: earlyGroupLimit },
        { name: 'Late-Eluting Related Compounds',  subHeader: '', limitText: lateGroupLimit  },
      ],
      dataRows: orgImpRows,
    });
  }

  return tables;
}

// ============================================
// Section 5.3.2 — Process Capability & Control Limits (per pharmacopoeia)
// ============================================

/** One numeric parameter column in a Section 5.3.2 capability/control-limit table. */
export interface Finish532CapColumn {
  headerLines: string[];        // header cell lines, e.g. ['pH'] or ['Assay (%)', 'Moxifloxacin…']
  limitDisplay: string;         // spec-limit cell text, e.g. '(6.3 to 7.3)'
  stats: ProcessCapabilityResults | null;
  // Trend-chart support (Section 5.3.2 finished-product graphs):
  kind: 'ph' | 'uniformity' | 'osmolality' | 'assay';
  titleParam: string;           // chart title fragment, e.g. 'pH', '% Assay of Moxifloxacin Hydrochloride'
  seriesName: string;           // actual-data series legend, e.g. 'Uniformity of Volume (ml)'
  points: { label: string; value: number }[];   // per-batch data points (Uniformity repeats a label)
}

/** Capability data for one pharmacopoeia (IP, USP, …). */
export interface Finish532SpecCapability {
  specLabel: string;            // 'AS PER IP:'
  spec: string;                 // 'IP'
  columns: Finish532CapColumn[];
}

/** Quantitative 5.3.2 columns that get a Cp/Cpk/UCL analysis (numeric only). */
const FINISH532_NUMERIC_COLS = new Set(['pH', 'Uniformity of Volume', 'Osmolality', 'Assay (%)']);

/** First signed decimal number in a string ("5.12 ml (102.4 %)" → 5.12). */
function firstNumber(s: string): number | null {
  const m = (s || '').match(/-?\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

/**
 * Labelled/nominal fill volume in ml, parsed from a Uniformity LIMITS1 sentence
 * ("…not less than the labelled amount (5.0 ml)…" / "…nominal amount (10.0 ml)…").
 */
function nominalFillMl(limitText: string): number | null {
  const m = (limitText || '').match(/(?:labell?ed|nominal)\s*amount\s*\(\s*(\d+(?:\.\d+)?)/i);
  if (m) return parseFloat(m[1]);
  return null;
}

/** Spec-limit display text for the UCL/LCL "Specification Limit" row. */
function capLimitDisplay(colName: string, limitText: string): string {
  const nums = (limitText || '').match(/\d+(?:\.\d+)?/g) || [];
  const a = nums[0], b = nums[1];
  if (colName === 'pH') return a && b ? `(${a} to ${b})` : '';
  if (colName === 'Osmolality') return a && b ? `(${a} to ${b} mOsmol/kg)` : '';
  if (colName === 'Assay (%)') return a && b ? `(${a}% to ${b}%)` : '';
  return '';
}

/**
 * Collect a column's data points across the batch rows, mirroring the table's
 * vertical-merge logic: within one batch, identical (merged) cell values count
 * once; differing values (e.g. the two Uniformity readings of a shared batch)
 * each count. This makes the capability inputs match exactly the cells shown.
 */
function gatherCapPoints(dataRows: any[], colIdx: number): { label: string; value: number }[] {
  const pts: { label: string; value: number }[] = [];
  let i = 0;
  while (i < dataRows.length) {
    let j = i + 1;
    while (j < dataRows.length && (dataRows[j].batchNumber || '') === (dataRows[i].batchNumber || '')) j++;
    const seen = new Set<string>();
    for (const r of dataRows.slice(i, j)) {
      const raw = String(r.values?.[colIdx] ?? '');
      if (seen.has(raw)) continue;
      seen.add(raw);
      const n = firstNumber(raw);
      if (n != null && !isNaN(n)) pts.push({ label: r.batchNumber || '', value: n });
    }
    i = j;
  }
  return pts;
}

/**
 * Build per-pharmacopoeia Process Capability & Control-Limit inputs from the
 * Section 5.3.2 tables. Only the numeric quantitative columns (pH, Uniformity of
 * Volume, Osmolality, Assay) are analysed; the Uniformity spec limit is derived
 * as nominal fill → nominal × 1.08 (the COA only carries the 91–109 % sentence).
 */
export function buildFinish532Capability(tables: any[]): Finish532SpecCapability[] {
  const order: string[] = [];
  const bySpec = new Map<string, any[]>();
  for (const t of tables) {
    const label: string = t.specificationLabel || '';
    if (!/^AS PER/i.test(label)) continue;     // skip the unlabelled organic-impurities table
    if (!bySpec.has(label)) { bySpec.set(label, []); order.push(label); }
    bySpec.get(label)!.push(t);
  }

  const result: Finish532SpecCapability[] = [];
  for (const specLabel of order) {
    const spec = specLabel.replace(/^AS PER\s+/i, '').replace(/:$/, '').trim();
    const columns: Finish532CapColumn[] = [];

    for (const t of bySpec.get(specLabel)!) {
      (t.columns || []).forEach((col: any, ci: number) => {
        if (!FINISH532_NUMERIC_COLS.has(col.name)) return;
        const points = gatherCapPoints(t.dataRows || [], ci);
        if (points.length === 0) return;
        const values = points.map(p => p.value);

        let limitStr = col.limitText || '';
        let limitDisplay = capLimitDisplay(col.name, col.limitText || '');
        let headerLines: string[] = [col.name];
        let kind: Finish532CapColumn['kind'] = 'ph';
        let titleParam = 'pH';
        let seriesName = 'pH';

        if (col.name === 'pH') {
          kind = 'ph'; titleParam = 'pH'; seriesName = 'pH';
        } else if (col.name === 'Uniformity of Volume') {
          const nominal = nominalFillMl(col.limitText || '');
          if (nominal != null) {
            const usl = Math.round(nominal * 1.08 * 100) / 100;
            limitStr = `${nominal} to ${usl}`;
            limitDisplay = `(${nominal.toFixed(1)} to ${usl.toFixed(1)} ml)`;
          }
          headerLines = ['Uniformity of Volume (ml)'];
          kind = 'uniformity'; titleParam = 'Uniformity of Filled Volume'; seriesName = 'Uniformity of Volume (ml)';
        } else if (col.name === 'Osmolality') {
          kind = 'osmolality'; titleParam = 'Osmolality'; seriesName = 'Osmolality (mOsmol/kg)';
        } else if (col.name === 'Assay (%)') {
          headerLines = ['Assay (%)', col.subHeader || ''];
          const compound = (col.subHeader || '').split(/E\.?\s*Q\.?/i)[0].trim() || (col.subHeader || '');
          kind = 'assay'; titleParam = `% Assay of ${compound}`; seriesName = `Assay of ${compound}`;
        }

        columns.push({
          headerLines, limitDisplay, stats: calculateProcessCapability(values, limitStr),
          kind, titleParam, seriesName, points,
        });
      });
    }

    if (columns.length > 0) result.push({ specLabel, spec, columns });
  }
  return result;
}

/** One analysed parameter column (matches APQR capability table columns). */
export interface MfcCapabilityColumn {
  label: string;
  cpk: number | null;
  ppk: number | null;
}

export interface MfcBulkCapability {
  columns: MfcCapabilityColumn[];
}

/** Finish capability for one pharmacopoeia block (AS PER IP, AS PER USP, …). */
export interface MfcFinishSpecCapability {
  specLabel: string;
  spec: string;
  columns: MfcCapabilityColumn[];
}

export interface MfcProcessCapabilitySummary {
  bulk: MfcBulkCapability;
  finish: MfcFinishSpecCapability[];
}

/** Short display label for a 5.3.2 capability column header. */
export function capabilityColumnLabel(headerLines: string[], fallback = 'Parameter'): string {
  if (!headerLines?.length) return fallback;
  const primary = (headerLines[0] || '').trim();
  if (primary === 'Assay (%)' && headerLines[1]) {
    const compound = (headerLines[1] || '').split(/E\.?\s*Q\.?/i)[0].trim();
    return compound.length > 28 ? `${compound.slice(0, 26)}…` : (compound || 'Assay (%)');
  }
  if (primary === 'Uniformity of Volume (ml)') return 'Uniformity';
  return primary || fallback;
}

/** Short label for bulk assay compound names. */
function bulkAssayColumnLabel(compound: string): string {
  const name = (compound || '').trim();
  if (!name) return 'Assay (%)';
  const short = name.split(/E\.?\s*Q\.?/i)[0].trim();
  return short.length > 28 ? `${short.slice(0, 26)}…` : (short || 'Assay (%)');
}

/** Per-column Cpk/Ppk for bulk in-process (pH + each assay column — Section 5.3.1). */
export function computeBulkCapabilityColumns(
  bulkInProcessData: BulkInProcessRow[],
  header: {
    phLimit?: string;
    assayColumns?: { compound: string; limit: string }[];
    assayLimit?: string;
  },
): MfcCapabilityColumn[] {
  const columns: MfcCapabilityColumn[] = [];

  const phValues = bulkInProcessData
    .map(r => parseFloat(r.ph))
    .filter(n => !isNaN(n));
  const phStats = calculateProcessCapability(phValues, header.phLimit || '');
  if (phStats) {
    columns.push({ label: 'pH', cpk: phStats.cpk, ppk: phStats.ppk });
  }

  const assayCols = header.assayColumns || [];
  for (let ci = 0; ci < assayCols.length; ci++) {
    const vals = bulkInProcessData
      .map(r => {
        if (r.assays?.[ci]) return parseFloat(r.assays[ci].value);
        if (ci === 0) return parseFloat(r.assay);
        return NaN;
      })
      .filter(n => !isNaN(n));
    const stats = calculateProcessCapability(vals, assayCols[ci].limit || '');
    if (stats) {
      columns.push({
        label: bulkAssayColumnLabel(assayCols[ci].compound),
        cpk: stats.cpk,
        ppk: stats.ppk,
      });
    }
  }

  return columns;
}

/** Per-column Cpk/Ppk per pharmacopoeia for finish 5.3.2 tables. */
export function computeFinishCapabilityBySpec(finish532Tables: any[]): MfcFinishSpecCapability[] {
  const capability = buildFinish532Capability(finish532Tables);
  const result: MfcFinishSpecCapability[] = [];

  for (const spec of capability) {
    const columns: MfcCapabilityColumn[] = [];
    for (const col of spec.columns) {
      if (!col.stats) continue;
      columns.push({
        label: capabilityColumnLabel(col.headerLines, col.headerLines[0] || 'Parameter'),
        cpk: col.stats.cpk,
        ppk: col.stats.ppk,
      });
    }
    if (columns.length > 0) {
      result.push({
        specLabel: spec.specLabel,
        spec: spec.spec,
        columns,
      });
    }
  }

  return result;
}

function collectFormulaProductCodes(formula: any): Set<string> {
  const codes = new Set<string>();
  const mainCode = (formula.masterFormulaDetails?.productCode || '').trim();
  if (mainCode && mainCode !== 'N/A') codes.add(mainCode);
  if (formula.fillingDetails && Array.isArray(formula.fillingDetails)) {
    formula.fillingDetails.forEach((fd: any) => {
      const code = (fd.productCode || '').trim();
      if (code && code !== 'N/A') codes.add(code);
    });
  }
  if (formula.processes && Array.isArray(formula.processes)) {
    formula.processes.forEach((p: any) => {
      (p.fillingProducts || []).forEach((fp: any) => {
        const code = (fp.productCode || '').trim();
        if (code) codes.add(code);
      });
    });
  }
  return codes;
}

/** Year-filtered unique batches for a set of product codes (same rules as getApqrData). Pass null year for all years. */
function gatherFinalBatchesForCodes(
  batchDocs: any[],
  productCodesSet: Set<string>,
  yearNum: number | null,
): any[] {
  const uniqueBatches = new Map<string, any>();

  for (const doc of batchDocs) {
    if (!doc.batches || !Array.isArray(doc.batches)) continue;
    for (const batch of doc.batches) {
      if (!productCodesSet.has(batch.itemCode)) continue;

      let mfgDate = parseBatchDate(batch.mfgDate);
      if (!mfgDate && batch.batchCompletionDate) {
        mfgDate = parseBatchDate(batch.batchCompletionDate);
      }
      if (!mfgDate) continue;
      if (yearNum !== null && mfgDate.getFullYear() !== yearNum) continue;

      const key = batch.batchNumber;
      if (uniqueBatches.has(key)) {
        const existing = uniqueBatches.get(key);
        const parseQtyUnit = (s: string): { qty: number; unit: string } => {
          const clean = (s || '').toUpperCase().trim();
          const m = clean.match(/^([\d.,]+)\s*([A-Z]+)?$/);
          if (m) return { qty: parseFloat(m[1].replace(/,/g, '')) || 0, unit: (m[2] || '').trim() };
          return { qty: 0, unit: '' };
        };
        const existingParts = (existing.batchSize || '')
          .split(',')
          .map((p: string) => p.trim())
          .filter(Boolean);
        const newPartStr = formatBatchCreationSize(batch);
        const allParts: Array<{ qty: number; unit: string }> = [
          ...existingParts.map(parseQtyUnit),
          parseQtyUnit(newPartStr),
        ].filter(p => p.qty > 0);
        const hasVolume = allParts.some(p => BATCH_VOLUME_UOMS.has(p.unit));
        if (hasVolume) {
          const volumeParts = allParts.filter(p => BATCH_VOLUME_UOMS.has(p.unit));
          const byUnit = new Map<string, number>();
          for (const p of volumeParts) {
            byUnit.set(p.unit, (byUnit.get(p.unit) || 0) + p.qty);
          }
          existing.batchSize = Array.from(byUnit.entries()).map(([u, q]) => {
            const fq = Number.isInteger(q) ? q.toString() : q.toFixed(2).replace(/\.?0+$/, '');
            return `${fq} ${u}`;
          }).join(', ');
        } else {
          const byUnit = new Map<string, number>();
          for (const p of allParts) {
            const u = p.unit || 'UNITS';
            byUnit.set(u, (byUnit.get(u) || 0) + p.qty);
          }
          existing.batchSize = Array.from(byUnit.entries()).map(([u, q]) => {
            const fq = Number.isInteger(q) ? q.toString() : q.toFixed(2).replace(/\.?0+$/, '');
            return u === 'UNITS' ? fq : `${fq} ${u}`;
          }).join(', ');
        }
      } else {
        uniqueBatches.set(key, {
          ...batch,
          batchSize: formatBatchCreationSize(batch),
          parsedMfgDate: mfgDate,
        });
      }
    }
  }

  const finalBatches = Array.from(uniqueBatches.values());
  finalBatches.sort((a, b) => a.parsedMfgDate.getTime() - b.parsedMfgDate.getTime());
  return finalBatches;
}

/** Build bulk in-process rows + header from pre-fetched BULK COAs (Section 5.3.1 logic). */
function buildBulkInProcessFromCoas(
  finalBatches: any[],
  bulkCoas: any[],
): {
  bulkInProcessData: BulkInProcessRow[];
  bulkInProcessHeader: {
    descriptionLimit: string;
    phLimit: string;
    assayCompound: string;
    assayLimit: string;
    assayColumns: { compound: string; limit: string }[];
  };
} {
  const bulkInProcessData: BulkInProcessRow[] = [];
  let bulkDescriptionLimit = '';
  let bulkPhLimit = '';
  let bulkAssayCompound = '';
  let bulkAssayLimit = '';
  let bulkAssayColumns: { compound: string; limit: string }[] = [];

  if (finalBatches.length === 0) {
    return {
      bulkInProcessData,
      bulkInProcessHeader: {
        descriptionLimit: bulkDescriptionLimit,
        phLimit: bulkPhLimit,
        assayCompound: bulkAssayCompound,
        assayLimit: bulkAssayLimit,
        assayColumns: bulkAssayColumns,
      },
    };
  }

  const coaByBatch = new Map<string, any>();
  for (const coa of bulkCoas) {
    if (!coaByBatch.has(coa.batchNumber)) coaByBatch.set(coa.batchNumber, coa);
  }

  const firstCoa = coaByBatch.values().next().value;
  const firstBd = firstCoa?.bulkData;
  if (firstBd) {
    bulkDescriptionLimit = firstBd.description || '';
    const phHeaderParam = (firstBd.testParameters || []).find((p: any) =>
      (p.name || '').toUpperCase().trim() === 'PH',
    );
    bulkPhLimit = (phHeaderParam?.limits || '').replace(/^Between\s*/i, '').trim();

    const SKIP_NAMES = ['PH', 'ASSAY', 'DESCRIPTION'];
    const compoundParams = (firstBd.testParameters || []).filter((p: any) => {
      const n = (p.name || '').toUpperCase().trim();
      return n && !SKIP_NAMES.includes(n);
    });

    if (compoundParams.length > 0) {
      for (const param of compoundParams) {
        let limit = (param.limits || '');
        if (limit.includes('\n') || limit.includes('\r')) limit = limit.split(/[\r\n]/)[0].trim();
        bulkAssayColumns.push({ compound: param.name || '', limit });
      }
      bulkAssayCompound = bulkAssayColumns[0].compound;
      bulkAssayLimit = bulkAssayColumns[0].limit;
    } else {
      const assayResultsArr = (firstBd.assayResults || []).filter((a: any) => a.compound);
      for (const a of assayResultsArr) {
        let limit = a.specification || '';
        if (limit.includes('\n')) limit = limit.split('\n')[0].trim();
        bulkAssayColumns.push({ compound: a.compound || '', limit });
      }
      if (bulkAssayColumns.length > 0) {
        bulkAssayCompound = bulkAssayColumns[0].compound;
        bulkAssayLimit = bulkAssayColumns[0].limit;
      }
    }
  }

  for (const batch of finalBatches) {
    const coa = coaByBatch.get(batch.batchNumber);
    if (!coa?.bulkData) continue;
    const bd = coa.bulkData;
    const arNumber = coa.arNumber || bd.arNumber || '';
    const description = bd.description || '';
    const phParam = (bd.testParameters || []).find((p: any) =>
      (p.name || '').toUpperCase().trim() === 'PH',
    );
    const ph = phParam?.result || '';
    const assays: { compound: string; value: string }[] = [];
    for (const col of bulkAssayColumns) {
      let result = '';
      const assayParam = (bd.testParameters || []).find((p: any) =>
        (p.name || '').toUpperCase().trim() === col.compound.toUpperCase().trim(),
      );
      result = assayParam?.result || '';
      if (!result) {
        const assayEntry = (bd.assayResults || []).find((a: any) =>
          (a.compound || '').toUpperCase().trim() === col.compound.toUpperCase().trim(),
        );
        result = assayEntry?.result || '';
      }
      if (result.includes('\n') || result.includes('\r')) {
        result = result.split(/[\r\n]/)[0].trim();
      }
      assays.push({ compound: col.compound, value: result });
    }
    const assay = assays.length > 0 ? assays[0].value : '';
    bulkInProcessData.push({
      batchNumber: batch.batchNumber,
      batchSize: batch.batchSize || 'N/A',
      arNumber,
      description,
      ph,
      assay,
      assays,
    });
  }

  return {
    bulkInProcessData,
    bulkInProcessHeader: {
      descriptionLimit: bulkDescriptionLimit,
      phLimit: bulkPhLimit,
      assayCompound: bulkAssayCompound,
      assayLimit: bulkAssayLimit,
      assayColumns: bulkAssayColumns,
    },
  };
}

/**
 * Build capability summary from getApqrData payload (identical to APQR / bulk-calculation tables).
 */
export function processCapabilitySummaryFromApqrData(data: {
  bulkInProcessData?: BulkInProcessRow[];
  bulkInProcessHeader?: {
    phLimit?: string;
    assayColumns?: { compound: string; limit: string }[];
    assayLimit?: string;
  };
  finish532Tables?: any[];
}): MfcProcessCapabilitySummary {
  return {
    bulk: {
      columns: computeBulkCapabilityColumns(
        data.bulkInProcessData ?? [],
        data.bulkInProcessHeader ?? {},
      ),
    },
    finish: computeFinishCapabilityBySpec(data.finish532Tables ?? []),
  };
}

/**
 * Batch Cpk/Ppk per product code for MFC headers.
 * Uses getApqrData so batches, COA rows, limits, and formulas match APQR exactly.
 */
export async function getProcessCapabilitySummariesForProducts(
  productCodes: string[],
  year: number | null,
): Promise<Record<string, MfcProcessCapabilitySummary>> {
  const yearNum = year === null || year === undefined || (typeof year === 'number' && isNaN(year))
    ? new Date().getFullYear()
    : (typeof year === 'string' ? parseInt(year, 10) : year);

  const uniqueCodes = [...new Set(productCodes.map(c => (c || '').trim()).filter(Boolean))];
  const emptySummary: MfcProcessCapabilitySummary = { bulk: { columns: [] }, finish: [] };
  if (uniqueCodes.length === 0) return {};

  const result: Record<string, MfcProcessCapabilitySummary> = {};
  const CONCURRENCY = 4;
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < uniqueCodes.length) {
      const code = uniqueCodes[nextIndex++];
      try {
        const data = await getApqrData(code, yearNum);
        result[code] = processCapabilitySummaryFromApqrData(data);
      } catch {
        result[code] = { ...emptySummary };
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, uniqueCodes.length) }, () => worker()),
  );

  return result;
}

/**
 * Render the Section 5.3.2 Process Capability + Control-Limit block as DOCX XML:
 *   • one "Process Capability & Performance parameters (Cp, Cpk, Pp, Ppk)" table
 *     per pharmacopoeia (under an "AS PER IP:" / "AS PER USP:" heading),
 *   • the static Cp/Cpk/Pp/Ppk interpretation ("Limit …") table,
 *   • one "Upper/Lower Control Limit" table per pharmacopoeia (UCL/LCL = mean ± 3S).
 * Returns '' when there is no capability data.
 */
export function buildFinish532CapabilityBlockXml(
  capability: Finish532SpecCapability[],
  esc: (s: string) => string,
): string {
  if (!capability || capability.length === 0) return '';

  // Widths are in fiftieths-of-a-percent (w:type="pct", 5000 = 100%) so every
  // table fills the full page width regardless of column count — otherwise a
  // 3-column (IP) table renders narrow and its headers wrap badly.
  const TOTAL = 5000;
  const fmt5 = (n?: number) => (n !== undefined && n !== null && !isNaN(n)) ? n.toFixed(5) : 'N/A';
  const fmt2 = (n?: number) => (n !== undefined && n !== null && !isNaN(n)) ? n.toFixed(2) : 'N/A';

  const border = '<w:tblBorders>'
    + ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
        .map(s => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="auto"/>`).join('')
    + '</w:tblBorders>';
  const tblPr = () =>
    `<w:tblPr><w:tblW w:w="${TOTAL}" w:type="pct"/><w:jc w:val="center"/>${border}</w:tblPr>`;
  // Proportional grid (twips act as ratios; pct tblW scales the table to 100%).
  const grid = (widths: number[]) =>
    '<w:tblGrid>' + widths.map(w => `<w:gridCol w:w="${w}"/>`).join('') + '</w:tblGrid>';

  // One cell. lines → one <w:p> each (centered). Supports span / shade / vMerge.
  const cell = (
    lines: string[],
    o: { w: number; bold?: boolean; shaded?: boolean; gridSpan?: number; vMerge?: 'restart' | 'continue' },
  ) => {
    let tcPr = `<w:tcW w:w="${o.w}" w:type="pct"/>`;
    if (o.vMerge === 'restart') tcPr += '<w:vMerge w:val="restart"/>';
    else if (o.vMerge === 'continue') tcPr += '<w:vMerge/>';
    if (o.gridSpan) tcPr += `<w:gridSpan w:val="${o.gridSpan}"/>`;
    if (o.shaded) tcPr += '<w:shd w:val="clear" w:color="auto" w:fill="D9D9D9"/>';
    tcPr += '<w:vAlign w:val="center"/>';
    const rPr = `<w:rPr>${o.bold ? '<w:b/>' : ''}<w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr>`;
    const body = (lines.length ? lines : ['']).map(ln =>
      `<w:p><w:pPr><w:spacing w:before="0" w:after="0"/><w:jc w:val="center"/>${rPr}</w:pPr>`
      + (ln ? `<w:r>${rPr}<w:t xml:space="preserve">${esc(ln)}</w:t></w:r>` : '')
      + '</w:p>').join('');
    return `<w:tc><w:tcPr>${tcPr}</w:tcPr>${body}</w:tc>`;
  };

  const headingPara = (text: string) =>
    '<w:p><w:pPr><w:spacing w:before="160" w:after="60"/>'
    + '<w:rPr><w:b/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:pPr>'
    + `<w:r><w:rPr><w:b/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr><w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`;
  const specHead = (text: string) =>
    '<w:p><w:pPr><w:spacing w:before="120" w:after="40"/>'
    + '<w:rPr><w:b/><w:u w:val="single"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:pPr>'
    + `<w:r><w:rPr><w:b/><w:u w:val="single"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr><w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`;
  const spacer = '<w:p><w:pPr><w:spacing w:before="40" w:after="40"/></w:pPr></w:p>';

  // ── Process Capability table for one pharmacopoeia ──
  const cpkTable = (sc: Finish532SpecCapability): string => {
    const cols = sc.columns;
    const N = cols.length;
    // vMerge col (narrow) + label col + N data cols, summing to 100%.
    const Wv = 300;
    const Wl = 1400;
    const Wd = Math.floor((TOTAL - Wv - Wl) / N);
    const Wlast = TOTAL - Wv - Wl - Wd * (N - 1);   // last col absorbs rounding
    const dw = (i: number) => (i === N - 1 ? Wlast : Wd);
    const v5 = (g: (s: ProcessCapabilityResults) => number) => cols.map(c => fmt5(c.stats ? g(c.stats) : undefined));
    const v2 = (g: (s: ProcessCapabilityResults) => number) => cols.map(c => fmt2(c.stats ? g(c.stats) : undefined));

    const dataCells = (vals: string[], shaded?: boolean) =>
      vals.map((v, i) => cell([v], { w: dw(i), shaded })).join('');

    // label spanning the two left columns (vMerge + label)
    const simpleRow = (label: string, vals: string[]) =>
      '<w:tr>' + cell([label], { w: Wv + Wl, gridSpan: 2, bold: true }) + dataCells(vals) + '</w:tr>';
    // row inside a stat block: continue the block's vMerge cell, then label + data
    const blockRow = (label: string, vals: string[], shaded?: boolean) =>
      '<w:tr>' + cell([''], { w: Wv, vMerge: 'continue' }) + cell([label], { w: Wl, bold: true, shaded })
      + dataCells(vals, shaded) + '</w:tr>';
    // first row of a stat block: open the vMerge cell holding the block title
    const blockHead = (title: string, label: string, vals: string[]) =>
      '<w:tr>' + cell([title], { w: Wv, vMerge: 'restart', bold: true }) + cell([label], { w: Wl, bold: true })
      + dataCells(vals) + '</w:tr>';

    const gridXml = grid([Wv, Wl, ...cols.map((_, i) => dw(i))]);

    let rows = '';
    // Title (spans everything)
    rows += '<w:tr>' + cell(['Process Capability & Performance parameters (Cp, Cpk, and Pp, Ppk)'],
      { w: TOTAL, gridSpan: 2 + N, bold: true, shaded: true }) + '</w:tr>';
    // Column headers
    rows += '<w:tr>' + cell([''], { w: Wv + Wl, gridSpan: 2, shaded: true })
      + cols.map((c, i) => cell(c.headerLines, { w: dw(i), bold: true, shaded: true })).join('') + '</w:tr>';
    // Basic statistics
    rows += simpleRow('Average', v5(s => s.average));
    rows += simpleRow('Maximum', v5(s => s.max));
    rows += simpleRow('Minimum', v5(s => s.min));
    rows += simpleRow('Upper Specification Limit – Lower Specification Limit (USL – LSL)', v5(s => s.usl - s.lsl));
    rows += simpleRow('Upper Specification Limit (USL) – Average', v5(s => s.usl - s.average));
    rows += simpleRow('Average – Lower Specification Limit (LSL)', v5(s => s.average - s.lsl));
    // Short-term (Cp, Cpk)
    rows += blockHead('Process Capability parameters Short-Term Statistics', 'Estimated Std Deviation (σ)', v5(s => s.sigmaEstimated));
    rows += blockRow('3σ = (3 X σ)', v2(s => s.sigmaEstimated * 3));
    rows += blockRow('6σ = (6 X σ)', v2(s => s.sigmaEstimated * 6));
    rows += blockRow('Cpku = (USL – Average) / 3σ', v2(s => s.cpku));
    rows += blockRow('Cpkl = (Average – LSL) / 3σ', v2(s => s.cpkl));
    rows += blockRow('Cpk Value = Min (Cpkl & Cpku)', v2(s => s.cpk), true);
    rows += blockRow('Cp Value = (USL – LSL) / 6σ', v2(s => s.cp), true);
    // Long-term (Pp, Ppk)
    rows += blockHead('Process Performance parameters (Long-Term Statistics)', 'Std Deviation (S)', v5(s => s.sigmaSample));
    rows += blockRow('3S = (3 X Std deviation)', v2(s => s.sigmaSample * 3));
    rows += blockRow('6S = (6 X Std deviation)', v2(s => s.sigmaSample * 6));
    rows += blockRow('Ppku = (USL – Average) / 3S', v2(s => s.ppku));
    rows += blockRow('Ppkl = (Average – LSL) / 3S', v2(s => s.ppkl));
    rows += blockRow('Ppk Value = Min(Ppkl & Ppku)', v2(s => s.ppk));
    rows += blockRow('Pp Value = (USL – LSL) / 6S', v2(s => s.pp));

    return `<w:tbl>${tblPr()}${gridXml}${rows}</w:tbl>`;
  };

  // ── Static Cp/Cpk interpretation table ──
  const limitTable = (): string => {
    const Wlab = 1400, Wc = Math.floor((TOTAL - Wlab) / 3);
    const Wc3 = TOTAL - Wlab - Wc * 2;
    const gridXml = grid([Wlab, Wc, Wc, Wc3]);
    let rows = '';
    rows += '<w:tr>' + cell([''], { w: Wlab }) + cell(['Cp, Cpk, and Pp, Ppk'], { w: TOTAL - Wlab, gridSpan: 3, bold: true, shaded: true }) + '</w:tr>';
    rows += '<w:tr>' + cell([''], { w: Wlab })
      + cell(['< 1'], { w: Wc, bold: true }) + cell(['Between 1 to 1.33'], { w: Wc, bold: true }) + cell(['> 1.33'], { w: Wc3, bold: true }) + '</w:tr>';
    rows += '<w:tr>' + cell(['Conclusion'], { w: Wlab, bold: true })
      + cell(['Process is not capable'], { w: Wc }) + cell(['Process is capable'], { w: Wc }) + cell(['very excellent / very capable'], { w: Wc3 }) + '</w:tr>';
    return `<w:tbl>${tblPr()}${gridXml}${rows}</w:tbl>`;
  };

  // ── Control-limit table for one pharmacopoeia (UCL/LCL = mean ± 3S) ──
  const uclTable = (sc: Finish532SpecCapability): string => {
    const cols = sc.columns;
    const N = cols.length;
    const Wlab = 1500;
    const Wd = Math.floor((TOTAL - Wlab) / N);
    const Wlast = TOTAL - Wlab - Wd * (N - 1);
    const dw = (i: number) => (i === N - 1 ? Wlast : Wd);
    const gridXml = grid([Wlab, ...cols.map((_, i) => dw(i))]);
    const row = (label: string, vals: string[], shaded?: boolean) =>
      '<w:tr>' + cell([label], { w: Wlab, bold: true, shaded }) + vals.map((v, i) => cell([v], { w: dw(i), shaded })).join('') + '</w:tr>';

    let rows = '';
    rows += '<w:tr>' + cell([''], { w: Wlab, shaded: true })
      + cols.map((c, i) => cell(c.headerLines, { w: dw(i), bold: true, shaded: true })).join('') + '</w:tr>';
    rows += row('Specification Limit', cols.map(c => c.limitDisplay), true);
    rows += row('Average', cols.map(c => fmt2(c.stats?.average)));
    rows += row('Std. Dev.', cols.map(c => fmt2(c.stats?.sigmaSample)));
    // Control limits = mean ± 3S, clamped to the specification limits (a control
    // limit never extends beyond spec — matches the reference APQR tables).
    rows += row('Upper Control Limit (UCL)', cols.map(c =>
      fmt2(c.stats ? Math.min(c.stats.average + 3 * c.stats.sigmaSample, c.stats.usl) : undefined)));
    rows += row('Lower Control Limit (LCL)', cols.map(c =>
      fmt2(c.stats ? Math.max(c.stats.average - 3 * c.stats.sigmaSample, c.stats.lsl) : undefined)));
    return `<w:tbl>${tblPr()}${gridXml}${rows}</w:tbl>`;
  };

  // ── Assemble the whole block ──
  let xml = spacer;
  for (const sc of capability) {
    xml += specHead(sc.specLabel);
    xml += cpkTable(sc);
    xml += spacer;
  }
  xml += headingPara('Limit for Process Capability & Performance parameters (Cp, Cpk, and Pp, Ppk)');
  xml += limitTable();
  xml += spacer;
  xml += headingPara('Upper Control Limits (UCL) & Lower Control Limits (LCL):-');
  for (const sc of capability) {
    xml += specHead(sc.specLabel);
    xml += uclTable(sc);
    xml += spacer;
  }

  // Give every row a minimum height so the rows aren't vertically compressed
  // (hRule="atLeast" lets multi-line header rows still grow as needed).
  xml = xml.replace(/<w:tr>/g, '<w:tr><w:trPr><w:trHeight w:val="400" w:hRule="atLeast"/></w:trPr>');
  return xml;
}

// ============================================
// Section 5.3.2 — Finished-product Trend Charts (per pharmacopoeia)
// ============================================

/**
 * Rewrite a chart's series with the given data. The first <c:ser> is replaced
 * with ALL `series`, and the remaining template series removed — so a prototype
 * with fewer series than needed (e.g. the Uniformity chart, which lacks UCL/LCL)
 * is extended by cloning, and one with more is trimmed. Cloned extra series
 * reuse the last template series' styling (line still renders; legend names
 * disambiguate).
 */
function updateFinishChartSeries(
  chartXml: string,
  series: { name: string; values: number[] }[],
  categories: string[],
  esc: (s: string) => string,
): string {
  const strCache = (vals: string[]) =>
    `<c:strCache><c:ptCount val="${vals.length}"/>`
    + vals.map((v, i) => `<c:pt idx="${i}"><c:v>${esc(v)}</c:v></c:pt>`).join('') + '</c:strCache>';
  const numCache = (vals: number[]) =>
    `<c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${vals.length}"/>`
    + vals.map((v, i) => `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`).join('') + '</c:numCache>';
  const nameCache = (name: string) =>
    `<c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>${esc(name)}</c:v></c:pt></c:strCache>`;

  const templates = (chartXml.match(/<c:ser>[\s\S]*?<\/c:ser>/g) || []);
  if (templates.length === 0) return chartXml;

  const buildSer = (i: number): string => {
    const sd = series[i];
    let u = templates[Math.min(i, templates.length - 1)];
    u = u.replace(/<c:idx val="\d+"\/>/, `<c:idx val="${i}"/>`)
         .replace(/<c:order val="\d+"\/>/, `<c:order val="${i}"/>`);
    u = u.replace(/(<c:tx>[\s\S]*?<c:strRef>[\s\S]*?)<c:strCache>[\s\S]*?<\/c:strCache>([\s\S]*?<\/c:strRef>[\s\S]*?<\/c:tx>)/,
      `$1${nameCache(sd.name)}$2`);
    u = u.replace(/(<c:cat>[\s\S]*?<c:strRef>[\s\S]*?)<c:strCache>[\s\S]*?<\/c:strCache>([\s\S]*?<\/c:strRef>[\s\S]*?<\/c:cat>)/,
      `$1${strCache(categories)}$2`);
    u = u.replace(/(<c:val>[\s\S]*?<c:numRef>[\s\S]*?)<c:numCache>[\s\S]*?<\/c:numCache>([\s\S]*?<\/c:numRef>[\s\S]*?<\/c:val>)/,
      `$1${numCache(sd.values)}$2`);
    return u;
  };

  const allSers = series.map((_, i) => buildSer(i)).join('');
  // Replace the first <c:ser> with the full rebuilt set; drop the rest.
  let done = false;
  return chartXml.replace(/<c:ser>[\s\S]*?<\/c:ser>/g, () => {
    if (done) return '';
    done = true;
    return allSers;
  });
}

/**
 * Build the per-pharmacopoeia finished-product trend charts and splice them into
 * the document, replacing the 5 stale single-spec template charts (chart6–10).
 *
 * Each numeric capability column → one native Word line chart (cloned from the
 * matching template prototype: pH→chart6, Uniformity→chart7, Osmolality→chart9,
 * Assay→chart10) with 5 series (actual + NLT/NMT/UCL/LCL), plus a title
 * paragraph and a Remark table. New chart parts are registered in
 * [Content_Types].xml and document.xml.rels.
 *
 * Returns the rewritten `document.xml` (mutating `zip` with the new parts), or
 * the input unchanged when the template's finished charts can't be located.
 */
export async function generateFinish532Charts(
  zip: JSZip,
  docXml: string,
  capability: Finish532SpecCapability[],
  productName: string,
  dataTableStart: number,
  dataTableEnd: number,
  tablesReplacement: string,
  esc: (s: string) => string,
): Promise<string> {
  if (!capability.length) return docXml;

  // ── Locate template prototype parts (by their _FINISH sheet formulas) ──
  const protoByKind: Record<string, string> = { ph: '', uniformity: '', osmolality: '', assay: '' };
  const finishParts: string[] = [];
  for (const f of Object.keys(zip.files)) {
    const m = f.match(/^word\/charts\/(chart\d+\.xml)$/);
    if (!m) continue;
    const cx = await zip.file(f)!.async('string');
    const firstF = cx.match(/<c:f>([^<]*)<\/c:f>/)?.[1] || '';
    if (!/FINISH/i.test(firstF) || /YIELD/i.test(firstF)) continue;
    finishParts.push(m[1]);
    if (/PH/i.test(firstF) && !protoByKind.ph) protoByKind.ph = m[1];
    else if (/UNIFORMITY.*5\s*ml/i.test(firstF) && !protoByKind.uniformity) protoByKind.uniformity = m[1];
    else if (/OSMOLAL/i.test(firstF) && !protoByKind.osmolality) protoByKind.osmolality = m[1];
    else if (/ASSAY/i.test(firstF) && !protoByKind.assay) protoByKind.assay = m[1];
  }
  // Fallback: any uniformity finish chart if no explicit 5ml one was found.
  if (!protoByKind.uniformity) {
    for (const f of finishParts) {
      const cx = await zip.file('word/charts/' + f)!.async('string');
      if (/UNIFORMITY/i.test(cx.match(/<c:f>([^<]*)<\/c:f>/)?.[1] || '')) { protoByKind.uniformity = f; break; }
    }
  }

  // Need a prototype for every kind we must render.
  const neededKinds = new Set<string>();
  capability.forEach(sc => sc.columns.forEach(c => neededKinds.add(c.kind)));
  for (const k of neededKinds) {
    if (!protoByKind[k]) { console.warn(`⚠️ Section 5.3.2 charts: no template prototype for "${k}" — charts skipped`); return docXml; }
  }

  // ── Map finished chart parts → their document r:id and position ──
  const relsPath = 'word/_rels/document.xml.rels';
  let relsXml = await zip.file(relsPath)!.async('string');
  const partToRid = new Map<string, string>();
  for (const m of relsXml.matchAll(/Id="([^"]+)"[^>]*Target="charts\/(chart\d+\.xml)"/g)) partToRid.set(m[2], m[1]);

  const finishPositions = finishParts
    .map(p => ({ part: p, rid: partToRid.get(p) || '', pos: partToRid.get(p) ? docXml.indexOf(`r:id="${partToRid.get(p)}"`) : -1 }))
    .filter(x => x.pos !== -1)
    .sort((a, b) => a.pos - b.pos);
  if (finishPositions.length === 0) { console.warn('⚠️ Section 5.3.2 charts: finished chart refs not found in document'); return docXml; }

  // Region end = end of the Remark table following the LAST finished chart.
  const lastPos = finishPositions[finishPositions.length - 1].pos;
  let regionEnd = docXml.indexOf('</w:p>', lastPos);
  regionEnd = regionEnd === -1 ? dataTableEnd : regionEnd + '</w:p>'.length;
  const nextTbl = docXml.indexOf('<w:tbl', regionEnd);
  if (nextTbl !== -1 && nextTbl - regionEnd < 2000) {
    // consume the remark table (depth-aware)
    let depth = 0, end = -1; const rx = /<\/?w:tbl\b[^>]*>/g; rx.lastIndex = nextTbl; let mm;
    while ((mm = rx.exec(docXml)) !== null) {
      if (mm[0].startsWith('<w:tbl')) depth++;
      else if (--depth === 0) { end = mm.index + mm[0].length; break; }
    }
    if (end !== -1) regionEnd = end;
  }

  // ── Allocate fresh chart indices, rIds and drawing ids ──
  let chartIdx = Math.max(0, ...Object.keys(zip.files)
    .map(f => +(f.match(/word\/charts\/chart(\d+)\.xml$/)?.[1] || 0)));
  let ridNum = Math.max(0, ...[...relsXml.matchAll(/Id="rId(\d+)"/g)].map(m => +m[1]));
  let docPrId = Math.max(9000, ...[...docXml.matchAll(/<wp:docPr id="(\d+)"/g)].map(m => +m[1]) ) + 1;

  const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
  const NS_C = 'http://schemas.openxmlformats.org/drawingml/2006/chart';
  const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

  const protoCache = new Map<string, string>();
  const getProto = async (part: string) => {
    if (!protoCache.has(part)) protoCache.set(part, await zip.file('word/charts/' + part)!.async('string'));
    return protoCache.get(part)!;
  };

  const fmtLim = (kind: string, v: number) =>
    kind === 'osmolality' ? v.toFixed(0) : v.toFixed(1);

  const titlePara = (text: string) =>
    '<w:p><w:pPr><w:spacing w:before="160" w:after="40"/><w:rPr><w:b/><w:i/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:pPr>'
    + `<w:r><w:rPr><w:b/><w:i/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr><w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`;

  const drawingPara = (rid: string, did: number) =>
    '<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:drawing>'
    + '<wp:inline distT="0" distB="0" distL="0" distR="0">'
    + '<wp:extent cx="6152515" cy="3771900"/><wp:effectExtent l="0" t="0" r="635" b="0"/>'
    + `<wp:docPr id="${did}" name="Chart ${did}"/><wp:cNvGraphicFramePr/>`
    + `<a:graphic xmlns:a="${NS_A}"><a:graphicData uri="${NS_C}">`
    + `<c:chart xmlns:c="${NS_C}" xmlns:r="${NS_R}" r:id="${rid}"/></a:graphicData></a:graphic>`
    + '</wp:inline></w:drawing></w:r></w:p>';

  const remarkTable = (param: string) => {
    const body = `${param} result at Finished product stage for ${productName} found (Satisfactory) within the limit as per finished product specification of ${productName} and no adverse trend observed during the review period.`;
    const bd = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
      .map(s => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="auto"/>`).join('');
    const pBold24 = (t: string) =>
      '<w:p><w:pPr><w:spacing w:before="0" w:after="0"/>'
      + '<w:rPr><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:pPr>'
      + '<w:r><w:rPr><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>'
      + `<w:t xml:space="preserve">${esc(t)}</w:t></w:r></w:p>`;
    const pNormal24 = (t: string) =>
      '<w:p><w:pPr><w:spacing w:before="0" w:after="0"/><w:jc w:val="both"/>'
      + '<w:rPr><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:pPr>'
      + '<w:r><w:rPr><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>'
      + `<w:t xml:space="preserve">${esc(t)}</w:t></w:r></w:p>`;
    const sigCell = (label: string, widthPct: string) =>
      `<w:tc><w:tcPr><w:tcW w:w="${widthPct}" w:type="pct"/>`
      + '<w:shd w:val="clear" w:color="auto" w:fill="auto"/></w:tcPr>'
      + pBold24(`${label}:`)
      + '<w:p><w:pPr><w:spacing w:before="0" w:after="0"/>'
      + '<w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:pPr>'
      + '<w:r><w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>'
      + '<w:t xml:space="preserve">(Sign/Date)</w:t></w:r></w:p>'
      + '<w:p><w:pPr><w:spacing w:before="0" w:after="0"/>'
      + '<w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:pPr></w:p>'
      + '</w:tc>';
    return '<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:jc w:val="center"/>'
      + `<w:tblBorders>${bd}</w:tblBorders>`
      + '<w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/>'
      + '</w:tblPr>'
      + '<w:tblGrid><w:gridCol w:w="4800"/><w:gridCol w:w="5105"/></w:tblGrid>'
      + '<w:tr><w:trPr><w:trHeight w:val="432"/><w:jc w:val="center"/></w:trPr>'
      + '<w:tc><w:tcPr><w:tcW w:w="5000" w:type="pct"/><w:gridSpan w:val="2"/>'
      + '<w:shd w:val="clear" w:color="auto" w:fill="D9D9D9"/></w:tcPr>'
      + pBold24('Remark:')
      + pNormal24(body)
      + '</w:tc></w:tr>'
      + '<w:tr><w:trPr><w:trHeight w:val="864"/><w:jc w:val="center"/></w:trPr>'
      + sigCell('Prepared By QA', '2423')
      + sigCell('Reviewed By QA', '2577')
      + '</w:tr></w:tbl>';
  };

  let chartsXml = '';
  const ctOverrides: string[] = [];
  const newRels: string[] = [];

  for (const sc of capability) {
    for (const col of sc.columns) {
      const s = col.stats;
      if (!s || col.points.length === 0) continue;
      const n = col.points.length;
      const fill = (v: number) => Array(n).fill(v);
      const ucl = Math.min(s.average + 3 * s.sigmaSample, s.usl);
      const lcl = Math.max(s.average - 3 * s.sigmaSample, s.lsl);
      const pct = col.kind === 'assay' ? '%' : '';
      const series = [
        { name: col.seriesName, values: col.points.map(p => p.value) },
        { name: `${col.kind === 'assay' ? 'Limit: ' : ''}NLT ${fmtLim(col.kind, s.lsl)}${pct}`, values: fill(s.lsl) },
        { name: `${col.kind === 'assay' ? 'Limit: ' : ''}NMT ${fmtLim(col.kind, s.usl)}${pct}`, values: fill(s.usl) },
        { name: `UCL (NMT ${ucl.toFixed(2)})`, values: fill(ucl) },
        { name: `LCL (NLT ${lcl.toFixed(2)})`, values: fill(lcl) },
      ];
      const categories = col.points.map(p => p.label);

      let cx = await getProto(protoByKind[col.kind]);
      cx = updateFinishChartSeries(cx, series, categories, esc);
      // Self-contain the clone: drop the external workbook link and overlay shapes.
      cx = cx.replace(/<c:externalData[\s\S]*?<\/c:externalData>/g, '').replace(/<c:userShapes[^>]*\/>/g, '');

      // Fit the value axis to this chart's own data + limit lines. The prototype
      // carries a fixed min/max (e.g. pH's 4.5) that leaves the data squashed
      // into a corner with a large empty band; replace it with a snug range.
      {
        const allVals = [...col.points.map(p => p.value), s.lsl, s.usl, ucl, lcl].filter(v => !isNaN(v));
        const vmin = Math.min(...allVals), vmax = Math.max(...allVals);
        const pad = Math.max((vmax - vmin) * 0.12, Math.abs(vmax) * 0.002, 0.05);
        const step = vmax >= 20 ? 5 : 0.1;
        const axMin = Math.floor((vmin - pad) / step) * step;
        const axMax = Math.ceil((vmax + pad) / step) * step;
        const fix = (n: number) => String(Math.round(n * 1000) / 1000);
        cx = cx.replace(
          /(<c:valAx>[\s\S]*?<c:scaling>(?:<c:logBase[^>]*\/>)?<c:orientation val="minMax"\/>)[\s\S]*?(<\/c:scaling>)/,
          `$1<c:max val="${fix(axMax)}"/><c:min val="${fix(axMin)}"/>$2`,
        );
      }

      chartIdx += 1; ridNum += 1; docPrId += 1;
      const partName = `chart${chartIdx}.xml`;
      const rid = `rId${ridNum}`;
      zip.file(`word/charts/${partName}`, cx);
      ctOverrides.push(`<Override PartName="/word/charts/${partName}" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`);
      newRels.push(`<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="charts/${partName}"/>`);

      chartsXml += titlePara(`Trend Analysis of ${col.titleParam} at Finished Stage: (As per ${sc.spec}):`);
      chartsXml += drawingPara(rid, docPrId);
      chartsXml += remarkTable(col.titleParam);
      chartsXml += '<w:p><w:pPr><w:spacing w:before="40" w:after="40"/></w:pPr></w:p>';
    }
  }

  if (!chartsXml) return docXml;

  // ── Register new parts in content types + document rels ──
  const ctPath = '[Content_Types].xml';
  let ctXml = await zip.file(ctPath)!.async('string');
  ctXml = ctXml.replace('</Types>', ctOverrides.join('') + '</Types>');
  zip.file(ctPath, ctXml);
  relsXml = relsXml.replace('</Relationships>', newRels.join('') + '</Relationships>');
  zip.file(relsPath, relsXml);

  // ── Splice: data tables + capability block + new charts replace the
  //    old data table AND the stale finished-chart region in one shot ──
  return docXml.substring(0, dataTableStart) + tablesReplacement + chartsXml + docXml.substring(regionEnd);
}

/**
 * Get APQR data for a given product code and year
 */
export async function getApqrData(productCode: string, year: number) {
  // Ensure strict year number
  const yearNum = typeof year === 'string' ? parseInt(year, 10) : year;

  await connectToDatabase();

  // Fetch Formula
  const formula = await Formula.findOne({
    'masterFormulaDetails.productCode': productCode
  }).lean();

  if (!formula) {
    throw new Error(`Formula not found for product code: ${productCode}`);
  }

  // Fetch Product Master data for correct field mapping
  const productMaster = await ProductMaster.findOne({ productCode }).lean();
  console.log('Product Master found:', !!productMaster, productMaster ? {
    productName: productMaster.productName,
    genericName: productMaster.genericName,
    therapeuticCategory: productMaster.therapeuticCategory,
    storageCondition: productMaster.storageCondition,
  } : 'N/A');

  // Collect all product codes for this formula (main + filling + process) for batch matching
  const allProductCodesSet = new Set<string>();
  const mainCode = (formula.masterFormulaDetails?.productCode || '').trim();
  if (mainCode && mainCode !== 'N/A') allProductCodesSet.add(mainCode);

  if (formula.fillingDetails && Array.isArray(formula.fillingDetails)) {
    formula.fillingDetails.forEach((fd: any) => {
      const code = (fd.productCode || '').trim();
      if (code && code !== 'N/A') allProductCodesSet.add(code);
    });
  }

  if (formula.processes && Array.isArray(formula.processes)) {
    formula.processes.forEach((p: any) => {
      (p.fillingProducts || []).forEach((fp: any) => {
        const code = (fp.productCode || '').trim();
        if (code) allProductCodesSet.add(code);
      });
    });
  }

  const allCodes = Array.from(allProductCodesSet);

  // Fetch all batches matching ANY of the codes
  const batchDocs = await Batch.find({
    'batches.itemCode': { $in: allCodes }
  }).lean();

  const uniqueBatches = new Map();

  for (const doc of batchDocs) {
    if (!doc.batches || !Array.isArray(doc.batches)) continue;

    for (const batch of doc.batches) {
      // 1. Strict Item Code Match (against SET of allowed codes)
      if (!allProductCodesSet.has(batch.itemCode)) continue;

      // 2. Extract Year from mfgDate (with fallback to batchCompletionDate)
      let mfgDate = parseBatchDate(batch.mfgDate);
      let dateSource = 'mfgDate';

      // Fallback to batchCompletionDate if mfgDate is invalid
      if (!mfgDate && batch.batchCompletionDate) {
        mfgDate = parseBatchDate(batch.batchCompletionDate);
        dateSource = 'batchCompletionDate';
      }

      if (!mfgDate) {
        console.warn(`Batch ${batch.batchNumber} (${batch.itemCode}): No valid mfgDate or batchCompletionDate`);
        continue;
      }

      if (mfgDate.getFullYear() === yearNum) {
        // 3. Deduplicate by batchNumber (Aggregating sizes for splits)
        const key = batch.batchNumber;

        if (uniqueBatches.has(key)) {
          // ── Batch already exists: aggregate batch size ──
          // Volume units (LTR, ML, KG…) take priority over count units (BOT, NOS, PCS…).
          // If any record has a volume unit, only volume records are summed and
          // count-unit records are discarded — a 30 LTR bulk batch that fills
          // into 140 bottles is still a 30 LTR batch for APQR purposes.
          const existing = uniqueBatches.get(key);

          const parseQtyUnit = (s: string): { qty: number; unit: string } => {
            const clean = (s || '').toUpperCase().trim();
            const m = clean.match(/^([\d.,]+)\s*([A-Z]+)?$/);
            if (m) return { qty: parseFloat(m[1].replace(/,/g, '')) || 0, unit: (m[2] || '').trim() };
            return { qty: 0, unit: '' };
          };

          // Collect all (qty, unit) pairs from existing + new record
          const existingParts = (existing.batchSize || '')
            .split(',')
            .map((p: string) => p.trim())
            .filter(Boolean);
          const newPartStr = formatBatchCreationSize(batch);

          const allParts: Array<{ qty: number; unit: string }> = [
            ...existingParts.map(parseQtyUnit),
            parseQtyUnit(newPartStr),
          ].filter(p => p.qty > 0);

          const hasVolume = allParts.some(p => BATCH_VOLUME_UOMS.has(p.unit));

          if (hasVolume) {
            // Sum only volume-unit parts; discard count-unit parts (BOT, NOS, etc.)
            const volumeParts = allParts.filter(p => BATCH_VOLUME_UOMS.has(p.unit));
            const byUnit = new Map<string, number>();
            for (const p of volumeParts) {
              byUnit.set(p.unit, (byUnit.get(p.unit) || 0) + p.qty);
            }
            const combined = Array.from(byUnit.entries()).map(([u, q]) => {
              const fq = Number.isInteger(q) ? q.toString() : q.toFixed(2).replace(/\.?0+$/, '');
              return `${fq} ${u}`;
            });
            existing.batchSize = combined.join(', ');
          } else {
            // No volume unit — aggregate by unit as-is (e.g. all BOT)
            const byUnit = new Map<string, number>();
            for (const p of allParts) {
              const u = p.unit || 'UNITS';
              byUnit.set(u, (byUnit.get(u) || 0) + p.qty);
            }
            const combined = Array.from(byUnit.entries()).map(([u, q]) => {
              const fq = Number.isInteger(q) ? q.toString() : q.toFixed(2).replace(/\.?0+$/, '');
              return u === 'UNITS' ? fq : `${fq} ${u}`;
            });
            existing.batchSize = combined.join(', ');
          }

          // Dates and other details are kept from the first record found
          // (split batches share the same mfgDate)

        } else {
          uniqueBatches.set(key, {
            ...batch,
            batchSize: formatBatchCreationSize(batch),
            parsedMfgDate: mfgDate,
            dateSource,
            formattedMfgDate: formatMonthYear(mfgDate),
            formattedExpDate: batch.expiryDate
              ? formatMonthYear(parseBatchDate(batch.expiryDate) || new Date())
              : 'N/A'
          });
        }
      }
    }
  }

  // Convert to array and sort by mfgDate ascending
  const finalBatches = Array.from(uniqueBatches.values());
  finalBatches.sort((a, b) => a.parsedMfgDate.getTime() - b.parsedMfgDate.getTime());

  const batchItemCodeMap = new Map<string, string>();
  for (const doc of batchDocs) {
    for (const b of doc.batches || []) {
      if (!allProductCodesSet.has(b.itemCode)) continue;
      const bn = (b.batchNumber || '').trim();
      if (!bn || batchItemCodeMap.has(bn)) continue;
      let mfgDate = parseBatchDate(b.mfgDate);
      if (!mfgDate && b.batchCompletionDate) {
        mfgDate = parseBatchDate(b.batchCompletionDate);
      }
      if (mfgDate?.getFullYear() === yearNum) {
        batchItemCodeMap.set(bn, b.itemCode || '');
      }
    }
  }

  // Set of batch numbers confirmed in the review period — used to filter AR entries
  const finalBatchNumbersSet = new Set<string>(finalBatches.map((b: any) => b.batchNumber));

  // ── Section 6: Batch Release / Reject Status ──
  const rejectedBatchSet = await loadRejectedBatchNumbersFromExcel();
  const batchReleaseStatus = computeBatchReleaseStatus(finalBatches, rejectedBatchSet);
  console.log(
    `✅ Section 6 Batch Release/Reject: manufactured=${batchReleaseStatus.manufactured}, `
    + `released=${batchReleaseStatus.released}, rejected=${batchReleaseStatus.rejected}`
  );

  // ── Compute largest batch size from actual batches in review year ──
  const parseBatchSizeNumeric = (s: string): number => {
    const m = (s || '').match(/[\d.]+/);
    return m ? parseFloat(m[0]) : 0;
  };
  const largestBatchSize = finalBatches.reduce((max, b) => {
    return Math.max(max, parseBatchSizeNumeric(b.batchSize));
  }, 0);
  console.log(`\n📐 Largest Batch Size in ${yearNum}: ${largestBatchSize} (from ${finalBatches.length} batches)`);

  // ── Build Raw Materials Data (Section 4.1) ──
  // Source: formula.materials (MaterialItem[]) — has correct per-ML fields from extractMaterials
  const rawMaterialsData: RawMaterialRow[] = [];
  const formulaBatchSizeNumeric = parseBatchSizeNumeric(formula.batchInfo?.batchSize || '0');
  console.log(`\n📐 Formula Batch Size: ${formulaBatchSizeNumeric} LTR, Largest Batch: ${largestBatchSize} LTR`);

  if (formula.materials && formula.materials.length > 0) {
    let rmSrNo = 1;
    for (const mat of formula.materials) {
      if (!mat.materialCode) continue;

      const { name: matName, spec: matSpec } = splitMaterialNameAndSpec(mat.materialName || '');

      // ── Theo Qty Per ML ──
      // requiredQuantity = PERUNIT / (1 + OVG_P/100) = per-ML theoretical qty
      const theoRaw = (mat.requiredQuantity || '').trim();

      // ── Overage % ──
      // overages = OVG_P from XML
      const ovgRaw = (mat.overages || '').trim();
      const overageDisplay = ovgRaw && ovgRaw !== '0' && ovgRaw !== '0.00' && ovgRaw !== 'N/A'
        ? `${ovgRaw}%` : '-';

      // ── Actual Qty Per ML ──
      // quantityPerUnit = PERUNIT from XML (with overage applied)
      const actualRaw = (mat.quantityPerUnit || '').trim();

      // ── Qty Required Per Batch (SCALED) ──
      // requiredQuantityStandardBatch = REQQTY + CUOM from XML (batch total for formula batch size)
      // Scale it: New Qty = Original Qty × (largestBatchSize / formulaBatchSize)
      const batchQtyField = (mat.requiredQuantityStandardBatch || '').trim();

      // Detect Q.S. materials: qty is 0, empty, or contains "Q.S"
      const batchQtyNumMatch = batchQtyField.match(/[\d.]+/);
      const batchQtyNum = batchQtyNumMatch ? parseFloat(batchQtyNumMatch[0]) : 0;
      const isQS = !batchQtyField || batchQtyField === 'N/A' || batchQtyField.toUpperCase().includes('Q.S')
        || batchQtyNum === 0;

      let scaledQtyDisplay: string;
      let isCalculated: boolean;

      if (isQS) {
        // Q.S. material (e.g. PURIFIED WATER)
        scaledQtyDisplay = `Q.S. TO ${largestBatchSize} LITRES`;
        isCalculated = false;
      } else if (formulaBatchSizeNumeric > 0 && largestBatchSize > 0) {
        // Numeric scaling: New Qty = Original Qty × (largestBatch / formulaBatch)
        const scaleFactor = largestBatchSize / formulaBatchSizeNumeric;
        const scaledQty = batchQtyNum * scaleFactor;
        // Extract unit from the batch qty field (e.g. "63 GM" → "GM")
        const unitMatch = batchQtyField.match(/[a-zA-Z]+/);
        const unitStr = unitMatch ? ` ${unitMatch[0]}` : '';
        // Preserve decimal places from original
        const decimals = (batchQtyNumMatch![0].split('.')[1] || '').length;
        scaledQtyDisplay = `${scaledQty.toFixed(decimals)}${unitStr}`;
        isCalculated = true;
      } else {
        scaledQtyDisplay = batchQtyField;
        isCalculated = false;
      }

      // Handle theo/actual display for Q.S. materials
      const theoDisplay = (!theoRaw || theoRaw === 'N/A' || theoRaw === '0') ? 'Q.S' : theoRaw;
      const actualDisplay = (!actualRaw || actualRaw === 'N/A' || actualRaw === '0')
        ? (isQS ? 'Q.S' : theoDisplay) : actualRaw;

      rawMaterialsData.push({
        srNo: rmSrNo++,
        materialCode: mat.materialCode,
        materialName: matName,
        spec: matSpec,
        theoQtyPerMl: theoDisplay,
        overagePercent: overageDisplay,
        actualQtyPerMl: actualDisplay,
        qtyRequiredPerBatch: scaledQtyDisplay,
        isCalculated,
        isPotencyEnabled: (mat as any).potencyCorrection === 'Y'
      });
    }
  }
  console.log(`✅ Raw Materials Data (Section 4.1): ${rawMaterialsData.length} rows, scaled to ${largestBatchSize} LTR`);

  // ── Build Packing Materials Data (Section 4.2) ──
  // Source: formula.fillingDetails → group by packingSize, pick product with most batches per pack
  const packingMaterialsData: PackingMaterialRow[] = [];

  if (formula.fillingDetails && Array.isArray(formula.fillingDetails) && formula.fillingDetails.length > 0) {
    // Step 1: Group filling details by packingSize
    const packGroups = new Map<string, any[]>();
    for (const fd of formula.fillingDetails) {
      const packSize = (fd.packingSize || '').trim().toUpperCase();
      if (!packSize || packSize === 'N/A') continue;
      if (!packGroups.has(packSize)) packGroups.set(packSize, []);
      packGroups.get(packSize)!.push(fd);
    }
    console.log(`\n📦 Section 4.2: Found ${packGroups.size} pack groups: ${Array.from(packGroups.keys()).join(', ')}`);

    // Step 2: Count batches per product code from finalBatches
    const batchCountByProduct = new Map<string, number>();
    for (const b of finalBatches) {
      const code = (b as any).itemCode || '';
      batchCountByProduct.set(code, (batchCountByProduct.get(code) || 0) + 1);
    }

    // Step 3: For each pack group, pick product with most batches
    let pmSrNo = 1;

    // Sort pack groups by size (smaller first: 5 ML before 10 ML)
    const sortedPackSizes = Array.from(packGroups.keys()).sort((a, b) => {
      const numA = parseFloat(a.match(/[\d.]+/)?.[0] || '0');
      const numB = parseFloat(b.match(/[\d.]+/)?.[0] || '0');
      return numA - numB;
    });

    for (const packSize of sortedPackSizes) {
      const fillingDetails = packGroups.get(packSize)!;

      // Find filling detail with most batches manufactured
      let bestFd = fillingDetails[0];
      let bestCount = 0;
      for (const fd of fillingDetails) {
        const code = (fd.productCode || '').trim();
        const count = batchCountByProduct.get(code) || 0;
        if (count > bestCount) {
          bestCount = count;
          bestFd = fd;
        }
      }

      console.log(`  Pack ${packSize}: selected ${bestFd.productCode} (${bestFd.productName}) with ${bestCount} batches`);

      // Step 4: Get packing materials and scale quantities
      const packingMats = bestFd.packingMaterials || [];
      if (packingMats.length === 0) {
        console.warn(`  ⚠️ No packing materials found for ${bestFd.productCode} (${packSize})`);
        continue;
      }

      const groupLabel = `FOR ${packSize}`;

      for (const pm of packingMats) {
        if (!pm.materialCode) continue;

        // Parse reqAsPerStdBatchSize (e.g. "5941 NOSNOS", "5941 NOS")
        const batchQtyStr = (pm.reqAsPerStdBatchSize || '').trim();
        const qtyNumMatch = batchQtyStr.match(/[\d.]+/);
        const stdBatchQty = qtyNumMatch ? parseFloat(qtyNumMatch[0]) : 0;

        // Scale: New Qty = StdBatchQty × (largestBatch / formulaBatch)
        let qtyRequired: string;
        if (stdBatchQty > 0 && formulaBatchSizeNumeric > 0 && largestBatchSize > 0) {
          const scaledQty = stdBatchQty * (largestBatchSize / formulaBatchSizeNumeric);
          qtyRequired = Math.round(scaledQty).toString();
        } else {
          qtyRequired = batchQtyStr || 'N/A';
        }

        // Extract excess % (from unit field or default "1 %")
        const excessPercent = '1 %';

        packingMaterialsData.push({
          srNo: pmSrNo++,
          materialCode: pm.materialCode,
          materialName: (pm.materialName || '').trim(),
          qtyRequired,
          excessPercent,
          packGroup: groupLabel,
        });
      }
    }
  }
  console.log(`✅ Packing Materials Data (Section 4.2): ${packingMaterialsData.length} rows, scaled to ${largestBatchSize} LTR`);

  // Log batch data source for transparency
  console.log('\n📊 BATCH DATA SUMMARY (from Batch Registry):');
  console.log(`   Product Code: ${productCode}`);
  console.log(`   Review Year: ${yearNum}`);
  console.log(`   Total Batches Found: ${finalBatches.length}`);
  console.log(`   Date Sources Used:`);
  const mfgDateCount = finalBatches.filter(b => b.dateSource === 'mfgDate').length;
  const completionDateCount = finalBatches.filter(b => b.dateSource === 'batchCompletionDate').length;
  console.log(`     - mfgDate: ${mfgDateCount}`);
  console.log(`     - batchCompletionDate (fallback): ${completionDateCount}`);
  if (finalBatches.length > 0) {
    console.log(`   First Batch: ${finalBatches[0].batchNumber} (${finalBatches[0].formattedMfgDate})`);
    console.log(`   Last Batch: ${finalBatches[finalBatches.length - 1].batchNumber} (${finalBatches[finalBatches.length - 1].formattedMfgDate})`);
  }

  // Calculate Monthly Summary
  const monthlyData = Array(12).fill(0).map((_, i) => ({
    monthName: FULL_MONTHS[i],
    monthIndex: i,
    count: 0
  }));

  finalBatches.forEach(b => {
    const monthIdx = b.parsedMfgDate.getMonth();
    if (monthlyData[monthIdx]) {
      monthlyData[monthIdx].count++;
    }
  });

  const totalBatchesCount = finalBatches.length;

  // Prepare batch table data (batch sizes from Batch Creation: batchSize + batchUom)
  const batchTable = finalBatches.map(b => ({
    b_month: FULL_MONTHS[b.parsedMfgDate.getMonth()],
    b_num: b.batchNumber || 'N/A',
    b_size: b.batchSize || 'N/A',
    b_mfg: b.formattedMfgDate,
    b_exp: b.formattedExpDate,
  }));
  // Prepare composition data
  const compositionData = formula.composition ? formula.composition.map((c: CompositionItem) => ({
    comp_name: c.activeIngredientName || '',
    comp_strength: c.strengthPerUnit || '',
    comp_spec: c.form || ''
  })) : [];

  // MFC number from the formula master (used to filter requisition records)
  const mfcNo = formula.masterFormulaDetails?.masterCardNo || '';

  // Fetch all requisition docs that contain batches with this MFC number
  // Shared by Section 3.1 (RM), Section 3.2 (PPM) and Section 3.3 (Secondary)
  const requisitionDocs = await Requisition.find({
    'batches.mfcNo': mfcNo
  }).lean();

  // --- Material Vendor Details Logic (Section 3.1 - RM Materials) ---
  const materialVendorDetails: MaterialVendorDetail[] = [];
  // Try to find ASEPTIC MIXING first, then fallback to MIXING
  let asepticMixingProcess = formula.processes?.find((p: ProcessData) => p.processName === 'ASEPTIC MIXING');
  if (!asepticMixingProcess) {
    asepticMixingProcess = formula.processes?.find((p: ProcessData) => p.processName === 'MIXING');
  }

  if (asepticMixingProcess && asepticMixingProcess.materials) {
    let srNo = 1;
    for (const mat of asepticMixingProcess.materials) {
      if (!mat.materialCode) continue;

      // 1. Collect all requisition material items for this materialCode + mfcNo + year
      const matchingItems: Array<{ arNo: string; vendorCode: string; batchNumber: string }> = [];

      for (const doc of requisitionDocs) {
        for (const batch of (doc.batches || [])) {
          // Must match MFC
          if (batch.mfcNo !== mfcNo) continue;

          // Filter by year using batch mfgDate
          const batchDate = parseBatchDate(batch.mfgDate);
          if (!batchDate || batchDate.getFullYear() !== yearNum) continue;

          for (const item of (batch.materials || [])) {
            if (item.materialCode === mat.materialCode && item.arNo) {
              matchingItems.push({
                arNo: item.arNo,
                vendorCode: item.vendorCode || '',
                batchNumber: batch.batchNumber
              });
            }
          }
        }
      }

      // Collect unique AR numbers
      const arNumbers = [...new Set(matchingItems.map(i => i.arNo).filter(ar => ar))];

      if (arNumbers.length > 0) {
        // Get vendor from InwardRegister first, then fallback to RMCOA
        let vendor = '';
        // Restrict to the review period's AR numbers; skip entries that predate manufacturedBy tracking;
        // sort ascending by arNumber so the earliest valid consignment is used.
        const inwardRecord = await InwardRegister.findOne({
          arNumber: { $in: arNumbers },
          manufacturedBy: { $exists: true, $nin: ['', null] }
        }).sort({ arNumber: 1 }).lean();
        if (inwardRecord) {
          vendor = (inwardRecord as any)?.manufacturedBy || (inwardRecord as any)?.vendorName || '';
        }

        if (!vendor) {
          // Fallback: check RMCOA for any of the AR numbers
          const rmcoas = await RMCOA.find({ arNo: { $in: arNumbers } }).lean();
          if (rmcoas && rmcoas.length > 0) {
            // supplier is the actual vendor; manufacturer is usually the testing lab
            vendor = (rmcoas[0] as any)?.supplier || (rmcoas[0] as any)?.manufacturer || '';
          }
        }

        // Create ONE row per material with all AR numbers
        materialVendorDetails.push({
          srNo: srNo,
          materialCode: mat.materialCode,
          materialName: mat.materialName,
          arNumbers: arNumbers,
          vendor: vendor
        });
        srNo++;
      } else {
        // Skip if no AR numbers found for the year in requisitions
      }
    }
  }

  // --- PPM Vendor Details Logic (Section 3.2 - Primary Packaging Materials) ---
  // Step 1: Find ASEPTIC FILLING process in Formula Master → extract PPM materials
  // Step 2: Get MFC number from formula (masterCardNo)
  // Step 3: For each material, query Requisition filtered by mfcNo + materialCode + PPM + year
  //         This ensures only AR numbers for THIS specific MFC are shown (not other products)
  const ppmVendorDetails: PpmVendorDetail[] = [];
  const asepticFillingProcess = formula.processes?.find((p: ProcessData) => p.processName === 'ASEPTIC FILLING');

  // MFC number from the formula master (used to filter requisition records)
  console.log(`\n📦 PPM Section 3.2 — MFC: ${mfcNo}`);

  if (asepticFillingProcess) {
    // Collect all materials from ASEPTIC FILLING process (direct materials)
    // and also from fillingProducts sub-materials
    const ppmMaterials: Array<{ materialCode: string; materialName: string }> = [];
    const seenCodes = new Set<string>();

    // Direct materials on the process
    if (asepticFillingProcess.materials && Array.isArray(asepticFillingProcess.materials)) {
      for (const mat of asepticFillingProcess.materials) {
        if (mat.materialCode && !seenCodes.has(mat.materialCode)) {
          seenCodes.add(mat.materialCode);
          ppmMaterials.push({ materialCode: mat.materialCode, materialName: mat.materialName });
        }
      }
    }

    // Materials nested under fillingProducts
    if (asepticFillingProcess.fillingProducts && Array.isArray(asepticFillingProcess.fillingProducts)) {
      for (const fp of asepticFillingProcess.fillingProducts) {
        if (fp.materials && Array.isArray(fp.materials)) {
          for (const mat of fp.materials) {
            if (mat.materialCode && !seenCodes.has(mat.materialCode)) {
              seenCodes.add(mat.materialCode);
              ppmMaterials.push({ materialCode: mat.materialCode, materialName: mat.materialName });
            }
          }
        }
      }
    }

    console.log(`  PPM Materials from ASEPTIC FILLING: ${ppmMaterials.length} materials`);

    // requisitionDocs is already fetched above

    let ppmSrNo = 1;
    for (const mat of ppmMaterials) {
      // Collect all requisition material items for this materialCode + mfcNo + PPM + year
      const matchingItems: Array<{ arNo: string; vendorCode: string; batchNumber: string }> = [];

      for (const doc of requisitionDocs) {
        for (const batch of (doc.batches || [])) {
          // Must match MFC
          if (batch.mfcNo !== mfcNo) continue;

          // Filter by year using batch mfgDate
          const batchDate = parseBatchDate(batch.mfgDate);
          if (!batchDate || batchDate.getFullYear() !== yearNum) continue;

          for (const item of (batch.materials || [])) {
            if (
              item.materialCode === mat.materialCode &&
              item.materialType === 'PPM' &&
              item.arNo
            ) {
              matchingItems.push({
                arNo: item.arNo,
                vendorCode: item.vendorCode || '',
                batchNumber: batch.batchNumber
              });
            }
          }
        }
      }

      // Collect unique AR numbers
      const arNumbers = [...new Set(matchingItems.map(i => i.arNo).filter(ar => ar))];

      // Get vendor name from Inward Register — restrict to review period's AR numbers,
      // skip old entries lacking manufacturedBy, pick earliest valid consignment.
      let vendor = '';
      if (arNumbers.length > 0) {
        const inwardRecord = await InwardRegister.findOne({
          arNumber: { $in: arNumbers },
          manufacturedBy: { $exists: true, $nin: ['', null] }
        }).sort({ arNumber: 1 }).lean();
        vendor = (inwardRecord as any)?.manufacturedBy || (inwardRecord as any)?.vendorName || '';
      }

      console.log(`  PPM Material ${mat.materialCode}: ${matchingItems.length} requisition items, ${arNumbers.length} unique AR numbers, vendor: ${vendor}`);

      ppmVendorDetails.push({
        srNo: ppmSrNo,
        materialCode: mat.materialCode,
        materialName: mat.materialName,
        arNumbers: arNumbers,
        vendor: vendor
      });
      ppmSrNo++;
    }

    console.log(`✅ PPM Vendor Details: ${ppmVendorDetails.length} rows`);
  } else {
    console.warn('⚠️ No ASEPTIC FILLING process found in Formula Master for PPM section');
  }

  // --- Secondary / Tertiary Packaging Details Logic (Section 3.3) ---
  // Step 1: Find PACKING process in Formula Master → extract materials
  // Step 2: Validate against Requisition (MFC + Material Code)
  // Step 3: Fetch Vendor (Inward Register) & Artwork Status (Rejection Data)
  const secondaryPackagingDetails: SecondaryPackagingDetail[] = [];

  // Find "PACKING" or "LABELLING & PACKING" process
  // The process name is usually "LABELLING & PACKING" or just contains "PACKING"
  // But strictly NOT "ASEPTIC FILLING" or "ASEPTIC MIXING"
  const packingProcess = formula.processes?.find((p: ProcessData) =>
    (p.processName || '').toUpperCase().includes('PACKING') &&
    !(p.processName || '').toUpperCase().includes('ASEPTIC')
  );

  console.log(`\n📦 Secondary/Tertiary Section 3.3 — MFC: ${mfcNo}`);

  if (packingProcess && packingProcess.materials) {
    const pmMaterials: Array<{ materialCode: string; materialName: string }> = [];
    const seenPmCodes = new Set<string>();

    for (const mat of packingProcess.materials) {
      if (mat.materialCode && !seenPmCodes.has(mat.materialCode)) {
        seenPmCodes.add(mat.materialCode);
        pmMaterials.push({ materialCode: mat.materialCode, materialName: mat.materialName });
      }
    }

    console.log(`  PM Materials from PACKING Process: ${pmMaterials.length} materials`);

    // We already have 'requisitionDocs' fetched for this MFC in previous section
    // Re-use it for filtering

    let pmSrNo = 1;
    for (const mat of pmMaterials) {
      // Collect matching requisition items for this material
      const matchingItems: Array<{ arNo: string; vendorCode: string }> = [];

      for (const doc of requisitionDocs) {
        for (const batch of (doc.batches || [])) {
          if (batch.mfcNo !== mfcNo) continue; // Should be redundant if query was correct but safe

          // Filter by user review year (using Requisition Batch Date or Mfg Date)
          // Logic mirrors 3.2: check if batch mfg date is in review year
          const batchDate = parseBatchDate(batch.mfgDate);
          if (!batchDate || batchDate.getFullYear() !== yearNum) continue;

          for (const item of (batch.materials || [])) {
            if (item.materialCode === mat.materialCode && item.arNo) {
              // Check material type? User didn't strictly specify RM/PM here, 
              // just "Formula Master -> Packing Materials"
              // But usually these are 'PM' type. We'll trust the code match.
              matchingItems.push({
                arNo: item.arNo,
                vendorCode: item.vendorCode || ''
              });
            }
          }
        }
      }

      // Data Validation Rule: "Only those material codes present in requisition for that MFC should proceed"
      if (matchingItems.length === 0) {
        console.log(`  Skipping PM Material ${mat.materialCode}: No requisition items found for MFC ${mfcNo}`);
        continue;
      }

      const arNumbers = [...new Set(matchingItems.map(i => i.arNo).filter(ar => ar))];

      // Fetch Vendor from Inward Register (using first AR)
      // Fetch Artwork Status from Rejection Data (using ANY matching AR)

      let vendor = '';
      let isRejected = false;

      if (arNumbers.length > 0) {
        // Get Manufacturer/Vendor — restrict to review period's AR numbers,
        // skip old entries lacking manufacturedBy, pick earliest valid consignment.
        const inwardRecord = await InwardRegister.findOne({
          arNumber: { $in: arNumbers },
          manufacturedBy: { $exists: true, $nin: ['', null] }
        }).sort({ arNumber: 1 }).lean();
        vendor = (inwardRecord as any)?.manufacturedBy || (inwardRecord as any)?.vendorName || '';

        // Check Rejection for Artwork
        // User Rule: "IF rejectionExists(materialCode, arNumber) -> REJECTED, ELSE APPROVED"
        // We check if ANY of the AR numbers for this material are in the rejection list

        for (const ar of arNumbers) {
          const rejection = await MaterialRejection.findOne({
            materialCode: mat.materialCode,
            arNumber: ar
          }).lean();

          if (rejection) {
            isRejected = true;
            console.log(`  PM Material ${mat.materialCode}: REJECTED (Found in Rejection Data for AR ${ar})`);
            break; // One rejection is enough? Or per batch? 
            // The table lists materials, not batches.
            // "Artwork Approved" column implies status for the material source.
            // If *any* batch was rejected for artwork, is the status 'REJECTED' or 'APPROVED/REJECTED'?
            // User says: "If match found -> Artwork Approved = REJECTED". 
            // It implies singular status. Safer to mark Rejected if ANY rejection found.
          }
        }
      }

      secondaryPackagingDetails.push({
        srNo: pmSrNo++,
        materialCode: mat.materialCode,
        materialName: mat.materialName,
        arNumbers: arNumbers,
        vendor: vendor,
        artworkStatus: isRejected ? 'REJECTED' : 'APPROVED'
      });
    }

    // Sort by vendor so identical vendors are consecutive → enables clean cell merging.
    // Items with no vendor go to the end. Within the same vendor, preserve original order.
    secondaryPackagingDetails.sort((a, b) => {
      const va = (a.vendor || '').trim();
      const vb = (b.vendor || '').trim();
      if (va === '' && vb === '') return 0;   // both empty → keep relative order
      if (va === '') return 1;                 // empty vendors go last
      if (vb === '') return -1;
      return va.localeCompare(vb);             // alphabetical within vendors
    });

    // Re-assign sequential srNo after sort
    secondaryPackagingDetails.forEach((item, idx) => { item.srNo = idx + 1; });

    console.log(`✅ Secondary/Tertiary Details: ${secondaryPackagingDetails.length} rows`);
  } else {
    console.warn('⚠️ No PACKING process found in Formula Master for Section 3.3');
  }

  // --- Section 5.1.1: Batch Wise Active Raw Material Details ---
  // Step 1: Get ACTIVE materials from ASEPTIC MIXING process
  const activeRawMaterialDetails: ActiveRawMaterialDetail[] = [];

  if (asepticMixingProcess && asepticMixingProcess.materials) {
    // Filter only ACTIVE materials (subMaterialType === 'ACTIVE')
    const activeMaterials = asepticMixingProcess.materials.filter(
      (mat: any) => (mat.subMaterialType || '').toUpperCase() === 'ACTIVE'
    );
    console.log(`\n💊 Section 5.1.1: Found ${activeMaterials.length} ACTIVE materials from ASEPTIC MIXING`);

    let armSrNo = 1;
    for (const mat of activeMaterials) {
      if (!mat.materialCode) continue;

      // Step 2: Build AR→batch map from requisition docs (MFC + review year filtered)
      // received = unique AR numbers actually used in this formula's batches in the review year
      const arToBatchMap = new Map<string, Set<string>>();
      for (const doc of requisitionDocs) {
        for (const batch of (doc.batches || [])) {
          if (batch.mfcNo !== mfcNo) continue;
          const batchDate = parseBatchDate(batch.mfgDate);
          if (!batchDate || batchDate.getFullYear() !== yearNum) continue;
          for (const item of (batch.materials || [])) {
            if (item.materialCode === mat.materialCode && item.arNo) {
              if (!arToBatchMap.has(item.arNo)) arToBatchMap.set(item.arNo, new Set());
              arToBatchMap.get(item.arNo)!.add(batch.batchNumber);
            }
          }
        }
      }

      const received = arToBatchMap.size;

      // Step 3: Query MaterialRejection — only count rejections for AR numbers used in this formula
      const rejectionRecords = await MaterialRejection.find({
        materialCode: mat.materialCode
      }).lean();

      const yearRejections = rejectionRecords.filter((rec: any) => {
        const d = parseBatchDate(rec.arDate);
        return d && d.getFullYear() === yearNum;
      });
      const rejectedArNumbers = [...new Set(
        yearRejections
          .map((rec: any) => (rec.arNumber || '').trim())
          .filter((ar: string) => ar && arToBatchMap.has(ar))
      )] as string[];
      const rejected = rejectedArNumbers.length;

      // Step 4: Released = Received - Rejected
      const released = received - rejected;

      // Build AR entries from arToBatchMap
      const arEntries = Array.from(arToBatchMap.entries())
        .map(([ar, batchSet]) => ({
          arNumber: ar,
          batchNumbers: Array.from(batchSet).filter(bn => finalBatchNumbersSet.has(bn))
        }))
        .filter(entry => entry.batchNumbers.length > 0);

      // Step 6: Generate dynamic remark
      const receivedPadded = received.toString().padStart(2, '0');
      const rejectedText = rejected > 0
        ? `${rejected.toString().padStart(2, '0')} consignment(s) were rejected`
        : 'No consignment was rejected';
      const remark = `Total ${receivedPadded} Consignments of ${mat.materialName} were received during review period. All the consignments were procured from approved vendors. ${rejectedText} during review period.`;

      activeRawMaterialDetails.push({
        srNo: armSrNo++,
        materialCode: mat.materialCode,
        materialName: mat.materialName,
        received,
        rejected,
        released,
        arEntries,
        remark
      });

      console.log(`  ${mat.materialName}: Received=${received}, Rejected=${rejected}, Released=${released}, ARs=${arToBatchMap.size}`);
    }
    console.log(`✅ Active Raw Material Details (Section 5.1.1): ${activeRawMaterialDetails.length} materials`);
  } else {
    console.warn('⚠️ No ASEPTIC MIXING process found for Section 5.1.1');
  }

  // ── Section 5.1.2 — Active Raw Material Test Details ──
  const activeRMTestDetails: RMTestMaterial512[] = [];

  // Regex to detect section headers like "[ALL SPECIFICATION BELOW ARE AS PER IP]"
  const specSectionRegex512 = /\bAS\s+PER\s+([A-Z]{2,5})\b/i;

  for (const mat of activeRawMaterialDetails) {
    const arNumbers512 = mat.arEntries.map(e => e.arNumber);
    if (arNumbers512.length === 0) continue;

    const rmcoas512 = await RMCOA.find({
      arNo: { $in: arNumbers512 }
    }).lean();

    // Normalize keys to uppercase+trim for case-insensitive lookup
    const rmcoaByAr512 = new Map<string, any>(
      rmcoas512.map((r: any) => [(r.arNo || '').toUpperCase().trim(), r])
    );
    console.log(`  Section 5.1.2 "${mat.materialName}": ${arNumbers512.length} ARs queried, ${rmcoas512.length} RMCOA records found`);

    // Clean up limit strings — remove "Between", "w/v", "OAB"
    const cleanLimit512 = (s: string) => (s || '')
      .replace(/^between\s+/i, '')
      .replace(/\s*w\/v\s*/gi, '')
      .replace(/\s+OAB\b/gi, '')
      .trim();

    // --- Scan ALL COA records to find which spec sections exist (ordered by first appearance) ---
    const specSectionsOrdered: string[] = [];
    const specSectionsSet = new Set<string>();
    for (const rmcoa of rmcoas512) {
      for (const param of (rmcoa.testParameters || [])) {
        const n = (param.name || '').toUpperCase().trim();
        const m = n.match(specSectionRegex512);
        if (m) {
          const spec = m[1].toUpperCase();
          if (!specSectionsSet.has(spec)) {
            specSectionsSet.add(spec);
            specSectionsOrdered.push(spec);
          }
        }
      }
    }

    // Extract limits from first available record, tracking current spec section
    let phLimit512 = '', waterLimit512 = '';
    const assaySpecLimits = new Map<string, string>(); // spec -> limit
    const firstRmcoa512 = rmcoas512[0];
    if (firstRmcoa512?.testParameters) {
      let currentSpec512 = '';
      for (const param of firstRmcoa512.testParameters) {
        const n = (param.name || '').toUpperCase().trim();
        const raw = cleanLimit512(param.limits || '');
        // Check if this entry is a spec section header
        const sectionMatch = n.match(specSectionRegex512);
        if (sectionMatch) {
          currentSpec512 = sectionMatch[1].toUpperCase();
          continue;
        }
        if (n === 'PH' && !phLimit512) {
          phLimit512 = raw;
        } else if ((n.includes('LOD') || n.includes('WATER') || n.includes('DRYING')) && !waterLimit512) {
          waterLimit512 = raw;
        } else if (n.includes('ASSAY')) {
          if (currentSpec512 && !assaySpecLimits.has(currentSpec512)) {
            assaySpecLimits.set(currentSpec512, raw);
          } else if (!currentSpec512) {
            // No spec section detected — assign to all discovered specs or use a generic key
            const fallbackKey = specSectionsOrdered[0] || 'ASSAY';
            if (!assaySpecLimits.has(fallbackKey)) assaySpecLimits.set(fallbackKey, raw);
          }
        }
      }
    }

    // Build assaySpecs array preserving discovery order
    // If no spec sections detected but assay limits found, create a generic single column
    const assaySpecs: { specName: string; limit: string }[] = [];
    if (specSectionsOrdered.length > 0) {
      for (const spec of specSectionsOrdered) {
        assaySpecs.push({ specName: spec, limit: assaySpecLimits.get(spec) || '' });
      }
    } else if (assaySpecLimits.size > 0) {
      for (const [spec, limit] of assaySpecLimits) {
        assaySpecs.push({ specName: spec, limit });
      }
    }

    // Build rows — extract assay per spec section from each COA, sorted by AR number ascending
    const rows512: RMTestRow512[] = [];
    for (const arEntry of mat.arEntries) {
      const rmcoa = rmcoaByAr512.get((arEntry.arNumber || '').toUpperCase().trim());
      if (!rmcoa) continue;
      let desc = '', ph = '', water = '';
      const assays: Record<string, string> = {};
      let currentSpec512 = '';
      for (const param of (rmcoa.testParameters || [])) {
        const n = (param.name || '').toUpperCase().trim();
        const res = (param.result || '').replace(/\s*%\s*$/, '').trim();
        // Check for spec section header
        const sectionMatch = n.match(specSectionRegex512);
        if (sectionMatch) {
          currentSpec512 = sectionMatch[1].toUpperCase();
          continue;
        }
        if (n === 'DESCRIPTION' && !desc) desc = param.result || '';
        else if (n === 'PH' && !ph) ph = res;
        else if ((n.includes('LOD') || n.includes('WATER') || n.includes('DRYING')) && !water) water = res;
        else if (n.includes('ASSAY')) {
          if (currentSpec512 && !assays[currentSpec512]) {
            assays[currentSpec512] = res;
          } else if (!currentSpec512) {
            // No spec section header found — assign to first known spec or a generic key
            const fallbackKey = specSectionsOrdered[0] || 'ASSAY';
            if (!assays[fallbackKey]) assays[fallbackKey] = res;
          }
        }
      }
      rows512.push({ arNumber: arEntry.arNumber, description: desc, ph, water, assays });
    }
    rows512.sort((a, b) => (a.arNumber || '').localeCompare(b.arNumber || '', undefined, { numeric: true, sensitivity: 'base' }));

    activeRMTestDetails.push({
      materialCode: mat.materialCode,
      materialName: mat.materialName,
      phLimit: phLimit512,
      waterLimit: waterLimit512,
      assaySpecs,
      rows: rows512
    });

  }
  console.log(`✅ Section 5.1.2: ${activeRMTestDetails.length} material(s), ${activeRMTestDetails.reduce((s, m) => s + m.rows.length, 0)} AR rows`);

  // --- Section 5.2.1: Batch Wise Primary Packing Material Details ---
  // Source: Formula Master → Aseptic Filling process
  const primaryPackingMaterialDetails: PrimaryPackingMaterialDetail[] = [];

  if (asepticFillingProcess) {
    // Step 1: Collect primary packing materials from ASEPTIC FILLING
    const ppmMats521: Array<{ materialCode: string; materialName: string }> = [];
    const seenCodes521 = new Set<string>();

    // Direct materials on the process
    if (asepticFillingProcess.materials && Array.isArray(asepticFillingProcess.materials)) {
      for (const mat of asepticFillingProcess.materials) {
        if (mat.materialCode && !seenCodes521.has(mat.materialCode)) {
          seenCodes521.add(mat.materialCode);
          ppmMats521.push({ materialCode: mat.materialCode, materialName: mat.materialName });
        }
      }
    }

    // Materials nested under fillingProducts
    if (asepticFillingProcess.fillingProducts && Array.isArray(asepticFillingProcess.fillingProducts)) {
      for (const fp of asepticFillingProcess.fillingProducts) {
        if (fp.materials && Array.isArray(fp.materials)) {
          for (const mat of fp.materials) {
            if (mat.materialCode && !seenCodes521.has(mat.materialCode)) {
              seenCodes521.add(mat.materialCode);
              ppmMats521.push({ materialCode: mat.materialCode, materialName: mat.materialName });
            }
          }
        }
      }
    }

    console.log(`\n📦 Section 5.2.1: Found ${ppmMats521.length} primary packing materials from ASEPTIC FILLING`);

    let ppmSrNo521 = 1;
    for (const mat of ppmMats521) {
      if (!mat.materialCode) continue;

      // Step 2a: Query InwardRegister for this PM materialCode in review year
      // received = unique AR numbers from InwardRegister (mirrors Section 5.1.1 RM approach)
      const pmInwardRecords = await InwardRegister.find({
        materialCode: mat.materialCode
      }).lean();

      // Build make map per AR from inward records (use `make` field = brand/MAKE tag)
      const makeByAr521 = new Map<string, string>();
      for (const rec of pmInwardRecords) {
        const ar = ((rec as any).arNumber || '').trim();
        const mk = ((rec as any).make || '').trim();
        if (ar && mk && !makeByAr521.has(ar)) makeByAr521.set(ar, mk);
      }

      const yearPmInward = pmInwardRecords.filter((rec: any) => {
        const d = parseBatchDate(rec.inwardDate);
        return d && d.getFullYear() === yearNum;
      });
      const allInwardArNumbers = [...new Set(
        yearPmInward
          .map((rec: any) => (rec.arNumber || '').trim())
          .filter((ar: string) => ar && ar !== 'N/A')
      )] as string[];
      // Exclude Renova make AR numbers
      const inwardArNumbers = allInwardArNumbers.filter(
        ar => !/renova/i.test(makeByAr521.get(ar) || '')
      );
      const received = inwardArNumbers.length;

      // Step 2b: Build AR→batch map from REQUISITION (MFC-filtered) for the AR entries column
      const arToBatchMap521 = new Map<string, Set<string>>();
      const mfcFilteredArNumbers = new Set<string>();

      for (const doc of requisitionDocs) {
        for (const batch of (doc.batches || [])) {
          if (batch.mfcNo !== mfcNo) continue;
          const batchDate = parseBatchDate(batch.mfgDate);
          if (!batchDate || batchDate.getFullYear() !== yearNum) continue;
          // Collect make from batch as fallback
          const batchMake = (batch.make || '').trim();
          for (const item of (batch.materials || [])) {
            if (item.materialCode === mat.materialCode && item.arNo) {
              const arNo = (item.arNo || '').trim();
              if (arNo) {
                if (batchMake && !makeByAr521.has(arNo)) makeByAr521.set(arNo, batchMake);
                // Skip Renova ARs
                if (/renova/i.test(makeByAr521.get(arNo) || '')) continue;
                mfcFilteredArNumbers.add(arNo);
                if (!arToBatchMap521.has(arNo)) arToBatchMap521.set(arNo, new Set());
                arToBatchMap521.get(arNo)!.add(batch.batchNumber);
              }
            }
          }
        }
      }

      const uniqueArNumbers = [...mfcFilteredArNumbers] as string[];

      // Step 3: Query MaterialRejection — count rejected ARs in review year
      const rejectionRecords = await MaterialRejection.find({
        materialCode: mat.materialCode
      }).lean();

      const yearRejections = rejectionRecords.filter((rec: any) => {
        const d = parseBatchDate(rec.arDate);
        return d && d.getFullYear() === yearNum;
      });
      const allRejectedArNumbers = [...new Set(
        yearRejections.map((rec: any) => (rec.arNumber || '').trim()).filter((ar: string) => ar)
      )] as string[];
      // Exclude Renova make AR numbers from rejected count
      const rejectedArNumbers = allRejectedArNumbers.filter(
        ar => !/renova/i.test(makeByAr521.get(ar) || '')
      );
      const rejected = rejectedArNumbers.length;

      // Step 4: Released = Received - Rejected
      const released = received - rejected;

      // Build AR entries — only include ARs linked to batches in the review period
      const arEntries = uniqueArNumbers
        .map(ar => ({
          arNumber: ar,
          batchNumbers: arToBatchMap521.has(ar)
            ? Array.from(arToBatchMap521.get(ar)!).filter(bn => finalBatchNumbersSet.has(bn))
              .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
            : []
        }))
        .filter(entry => entry.batchNumbers.length > 0)
        .sort((a, b) => a.arNumber.localeCompare(b.arNumber, undefined, { numeric: true, sensitivity: 'base' }));

      // Step 6: Generate dynamic remark
      const rejectedText = rejected > 0
        ? `${rejected} consignment(s) were rejected`
        : 'No consignment was rejected';
      const remark = `Total ${received} Consignments received of different primary packing materials. ${rejectedText} during the review period.`;

      primaryPackingMaterialDetails.push({
        srNo: ppmSrNo521++,
        materialCode: mat.materialCode,
        materialName: mat.materialName,
        received,
        rejected,
        released,
        arEntries,
        remark
      });

      const renovaIgnored = allInwardArNumbers.length - inwardArNumbers.length;
      console.log(`  ${mat.materialName}: InwardARs=${inwardArNumbers.length}(received, ${renovaIgnored} Renova ignored), ReqARs=${uniqueArNumbers.length}, Rejected=${rejected}, Released=${released}`);
    }
    // Sort by received consignment count ascending (42 before 58 before 91 etc.)
    primaryPackingMaterialDetails.sort((a, b) => a.received - b.received);
    // Re-assign srNo after sort
    primaryPackingMaterialDetails.forEach((m, i) => { m.srNo = i + 1; });
    console.log(`✅ Primary Packing Material Details (Section 5.2.1): ${primaryPackingMaterialDetails.length} materials`);
  } else {
    console.warn('⚠️ No ASEPTIC FILLING process found for Section 5.2.1');
  }

  // ── Section 5.3.1 — Bulk In-Process Analysis Results ──
  const bulkInProcessData: BulkInProcessRow[] = [];
  let bulkDescriptionLimit = '';
  let bulkPhLimit = '';
  let bulkAssayCompound = '';   // first compound (backward compat)
  let bulkAssayLimit = '';      // first compound limit (backward compat)
  let bulkAssayColumns: { compound: string; limit: string }[] = [];  // ALL assay compounds

  if (finalBatches.length > 0) {
    const batchNumbers = finalBatches.map((b: any) => b.batchNumber);
    console.log(`\n📋 Section 5.3.1: Fetching BULK COAs for ${batchNumbers.length} batches`);

    const bulkCoas = await COA.find({
      batchNumber: { $in: batchNumbers },
      stage: 'BULK'
    }).sort({ uploadedAt: -1 }).lean();

    // Deduplicate: keep latest COA per batch
    const coaByBatch = new Map<string, any>();
    for (const coa of bulkCoas) {
      if (!coaByBatch.has(coa.batchNumber)) {
        coaByBatch.set(coa.batchNumber, coa);
      }
    }

    // ── Extract header metadata from first available BULK COA (once per product) ──
    const firstCoa = coaByBatch.values().next().value;
    const firstBd = firstCoa?.bulkData;

    if (firstBd) {
      // Description header: from bulkData.description (top-level field)
      bulkDescriptionLimit = firstBd.description || '';

      // pH header: PH → limits (clean "Between" prefix)
      const phHeaderParam = (firstBd.testParameters || []).find((p: any) =>
        (p.name || '').toUpperCase().trim() === 'PH'
      );
      bulkPhLimit = (phHeaderParam?.limits || '').replace(/^Between\s*/i, '').trim();

      // Assay columns: find ALL compound testParameters (not PH, ASSAY, or DESCRIPTION)
      // These are the actual compound names like "DORZOLAMIDE HYDROCHLORIDE E.Q. DORZOLAMIDE"
      const SKIP_NAMES = ['PH', 'ASSAY', 'DESCRIPTION'];
      const compoundParams = (firstBd.testParameters || []).filter((p: any) => {
        const n = (p.name || '').toUpperCase().trim();
        return n && !SKIP_NAMES.includes(n);
      });

      if (compoundParams.length > 0) {
        // Build array of all assay columns from testParameters
        for (const param of compoundParams) {
          let limit = (param.limits || '');
          // Clean multi-line limits (take first line)
          if (limit.includes('\n') || limit.includes('\r')) {
            limit = limit.split(/[\r\n]/)[0].trim();
          }
          bulkAssayColumns.push({
            compound: param.name || '',
            limit: limit,
          });
        }
        // Backward compat: first compound as single values
        bulkAssayCompound = bulkAssayColumns[0].compound;
        bulkAssayLimit = bulkAssayColumns[0].limit;
      } else {
        // Fallback: try assayResults array
        const assayResultsArr = (firstBd.assayResults || []).filter((a: any) => a.compound);
        for (const a of assayResultsArr) {
          let limit = a.specification || '';
          if (limit.includes('\n')) {
            limit = limit.split('\n')[0].trim();
          }
          bulkAssayColumns.push({
            compound: a.compound || '',
            limit: limit,
          });
        }
        if (bulkAssayColumns.length > 0) {
          bulkAssayCompound = bulkAssayColumns[0].compound;
          bulkAssayLimit = bulkAssayColumns[0].limit;
        }
      }

      console.log(`  Header: Desc="${bulkDescriptionLimit.substring(0, 50)}...", pH="${bulkPhLimit}", AssayColumns=${bulkAssayColumns.length}: ${bulkAssayColumns.map(c => c.compound).join(', ')}`);
    }

    // Extract data for each batch (in same order as finalBatches)
    for (const batch of finalBatches) {
      const coa = coaByBatch.get(batch.batchNumber);
      if (!coa || !coa.bulkData) {
        console.warn(`  ⚠️ No BULK COA found for batch ${batch.batchNumber}`);
        continue;
      }

      const bd = coa.bulkData;

      // AR Number
      const arNumber = coa.arNumber || bd.arNumber || '';

      // Description: from bulkData.description (top-level field)
      const description = bd.description || '';

      // pH: find testParameter with name exactly "PH"
      const phParam = (bd.testParameters || []).find((p: any) =>
        (p.name || '').toUpperCase().trim() === 'PH'
      );
      const ph = phParam?.result || '';

      // Assays: extract result for EACH compound in bulkAssayColumns
      const assays: { compound: string; value: string }[] = [];
      for (const col of bulkAssayColumns) {
        let result = '';
        // Try testParameters first (by matching compound name)
        const assayParam = (bd.testParameters || []).find((p: any) =>
          (p.name || '').toUpperCase().trim() === col.compound.toUpperCase().trim()
        );
        result = assayParam?.result || '';

        // Fallback: try assayResults array
        if (!result) {
          const assayEntry = (bd.assayResults || []).find((a: any) =>
            (a.compound || '').toUpperCase().trim() === col.compound.toUpperCase().trim()
          );
          result = assayEntry?.result || '';
        }

        // If result is multi-line, take first line only
        if (result.includes('\n') || result.includes('\r')) {
          result = result.split(/[\r\n]/)[0].trim();
        }
        assays.push({ compound: col.compound, value: result });
      }

      // Backward compat: first assay value
      const assay = assays.length > 0 ? assays[0].value : '';

      bulkInProcessData.push({
        batchNumber: batch.batchNumber,
        batchSize: batch.batchSize || 'N/A',
        arNumber,
        description,
        ph,
        assay,
        assays
      });

      console.log(`  ${batch.batchNumber}: AR=${arNumber}, pH=${ph}, Assays=[${assays.map(a => `${a.compound}=${a.value}`).join(', ')}]`);
    }
    console.log(`✅ Section 5.3.1: ${bulkInProcessData.length} bulk in-process rows, ${bulkAssayColumns.length} assay column(s)`);
  }

  // ── Section 5.3.2 — Finished Product Analysis ──
  // Fetch all FINISH stage COAs; build spec-number heading text AND structured
  // Finish532Table[] used for generating multiple DOCX tables.
  const finishSpecNumbers: string[] = [];
  let finish532Tables: any[] = [];
  let sterilityTestingData: SterilityTestingRow[] = [];
  let sterilityTestingLimit = DEFAULT_STERILITY_LIMIT;

  if (finalBatches.length > 0) {
    const batchNumbers532 = finalBatches.map((b: any) => b.batchNumber);
    console.log(`\n📋 Section 5.3.2: Fetching FINISH COAs (${batchNumbers532.length} batches)`);

    const finishCoas532 = await COA.find({
      batchNumber: { $in: batchNumbers532 },
      stage: 'FINISH',
    }).lean();

    // Spec document numbers for the section heading
    const specDocNoSet = new Set<string>();
    for (const coa of finishCoas532) {
      const sdn = (coa as any).finishData?.specDocNo;
      if (sdn && sdn.trim()) specDocNoSet.add(sdn.trim());
    }
    finishSpecNumbers.push(...Array.from(specDocNoSet).sort());

    // Build structured tables
    const batchOrder532 = finalBatches.map((b: any) => b.batchNumber as string);
    finish532Tables = buildFinish532Tables(finishCoas532, batchOrder532);

    const sterilityBuilt = buildSterilityTestingData(finalBatches, finishCoas532);
    sterilityTestingData = sterilityBuilt.rows;
    sterilityTestingLimit = sterilityBuilt.limit;

    console.log(`✅ Section 5.3.2: ${finish532Tables.length} tables, spec numbers: ${finishSpecNumbers.join(', ') || '(none)'}`);
    console.log(`✅ Section 5.3.3: ${sterilityTestingData.length} sterility rows`);
  }

  // ── Section 5.4.1 / 5.4.2 — Yield Data (Bulk + Finished stages) ──
  const yieldRows541: YieldRow[] = [];
  const yieldRows542: YieldRow[] = [];

  if (finalBatches.length > 0) {
    const batchNumbersYield = finalBatches.map((b: any) => b.batchNumber);
    console.log(`\n📋 Section 5.4: Fetching Yield data for ${batchNumbersYield.length} batches`);

    const yieldDocs = await Yield.find({
      batchNo: { $in: batchNumbersYield },
      productCode: { $in: allCodes },
    }).lean();

    const yieldByBatch = new Map<string, any>();
    for (const yd of yieldDocs) {
      const existing = yieldByBatch.get(yd.batchNo);
      if (!existing) {
        yieldByBatch.set(yd.batchNo, yd);
      } else if (yd.productCode === mainCode && existing.productCode !== mainCode) {
        yieldByBatch.set(yd.batchNo, yd);
      }
    }

    for (const batch of finalBatches) {
      const yd = yieldByBatch.get(batch.batchNumber);
      if (!yd) {
        console.warn(`  ⚠️ No Yield record found for batch ${batch.batchNumber}`);
        continue;
      }

      const actualYield: number = typeof yd.actualYield === 'number' ? yd.actualYield : 0;

      yieldRows541.push({ batchNo: yd.batchNo, yieldPct: actualYield });
      // Finished stage: same actual yield in both %YIELD and %AVERAGE YIELD columns (per APQR format).
      yieldRows542.push({ batchNo: yd.batchNo, yieldPct: actualYield });
    }
    console.log(`✅ Section 5.4.1: ${yieldRows541.length} bulk yield rows`);
    console.log(`✅ Section 5.4.2: ${yieldRows542.length} finished yield rows`);
  }

  const mfcNoForControl = formula.masterFormulaDetails?.masterCardNo || '';
  const controlSampleData = await loadControlSampleDataForApqr(
    finalBatches,
    batchItemCodeMap,
    mfcNoForControl,
  );

  return {
    company_name: formula.companyInfo?.companyName || 'INDIANA OPHTHALMICS LLP',
    company_address: formula.companyInfo?.companyAddress || '132, 135, 136, 137, GIDC ESTATE, WADHWAN CITY',

    // From Product Master
    product_name: cleanProductName(productMaster?.productName || ''),
    product_code: productCode,
    generic_name: productMaster?.genericName || '',
    department: productMaster?.department || '',
    therapeutic_category: productMaster?.therapeuticCategory || '',
    storage_condition: normalizeStorageCondition(productMaster?.storageCondition) || '',

    // From Formula Master — support 1 or more label claims (IP, USP, etc.)
    label_claims: buildLabelClaimsText(formula.batchInfo),
    label_claim: buildLabelClaimsText(formula.batchInfo)[0] || '',
    shelf_life: formula.masterFormulaDetails?.shelfLife || '',
    mfg_lic_no: formula.masterFormulaDetails?.manufacturingLicenseNo || '',

    // We display Department (Eye Drops, etc.) in "Dosage Form" for the APQR brief description.
    dosage_form: productMaster?.department || '',
    pack_style: computePackStyle(formula.fillingDetails),

    batch_size: formula.batchInfo?.batchSize || '',
    volume: formula.batchInfo?.volume || '',

    apqr_year: yearNum.toString(),
    apqr_no: `IO/APQR/${productCode.substring(0, 4)}/${yearNum}/${totalBatchesCount.toString().padStart(3, '0')}`,
    ref_sop_no: 'QAGE110',

    total_batches: totalBatchesCount.toString().padStart(2, '0'),

    batches: batchTable,
    composition: compositionData,
    materialVendorDetails, // Added for dynamic table generation (Section 3.1 - RM)
    ppmVendorDetails,      // Added for dynamic table generation (Section 3.2 - PPM)
    secondaryPackagingDetails, // Added for dynamic table generation (Section 3.3 - PM)
    rawMaterialsData,      // Section 4.1 - Quantitative Formula: Raw Materials
    packingMaterialsData,  // Section 4.2 - Quantitative Formula: Packing Materials
    largestBatchSize,      // Largest batch manufactured in review year
    formulaBatchSize: formulaBatchSizeNumeric, // Formula Master batch size (reference)
    activeRawMaterialDetails, // Section 5.1.1 - Batch Wise Active Raw Material Details
    activeRMTestDetails,      // Section 5.1.2 - Active Raw Material Test Details
    primaryPackingMaterialDetails, // Section 5.2.1 - Batch Wise Primary Packing Material Details
    bulkInProcessData,             // Section 5.3.1 - In-Process Analysis Results at Bulk Stage
    bulkInProcessHeader: {         // Section 5.3.1 - Dynamic header from COA limits
      descriptionLimit: bulkDescriptionLimit,
      phLimit: bulkPhLimit,
      assayCompound: bulkAssayCompound,
      assayLimit: bulkAssayLimit,
      assayColumns: bulkAssayColumns,         // ALL compounds: { compound, limit }[]
    },
    finishSpecNumbers,             // Section 5.3.2 - Unique spec doc numbers (ITMSPEC) from FINISH COAs
    finish532Tables,               // Section 5.3.2 - Structured tables (spec + organic impurities)
    sterilityTestingData,          // Section 5.3.3 - Sterility Testing (one row per batch)
    sterilityTestingLimit,         // Section 5.3.3 - Sterility limit / sub-header text
    yieldData541: yieldRows541,    // Section 5.4.1 - At Bulk Stage yield data
    yieldData542: yieldRows542,    // Section 5.4.2 - At Finished Stage yield data
    batchReleaseStatus,            // Section 6 - Batch Release / Reject Status
    controlSampleData,             // Section 7 - Review of Control Sample

    // Individual month counts
    ...monthlyData.reduce((acc, m) => {
      acc[m.monthName.toLowerCase() + '_count'] = m.count > 0 ? m.count.toString().padStart(2, '0') : '--';
      return acc;
    }, {} as Record<string, string>),
  };
}

/**
 * Escape a string for safe insertion into XML text content.
 * Applied only at the point of insertion—never double-escaped.
 */
function xmlEscape(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Min / max / mean / sample SD / RSD for yield statistic rows in section 5.4 tables. */
function computeYieldStatistics(values: number[]) {
  if (values.length === 0) {
    return { min: 0, max: 0, mean: 0, stdDev: 0, rsd: 0 };
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.length > 1
    ? values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / (values.length - 1)
    : 0;
  const stdDev = Math.sqrt(variance);
  const rsd = mean !== 0 ? (stdDev / mean) * 100 : 0;
  return { min, max, mean, stdDev, rsd };
}

interface YieldChartSeries {
  name: string;
  values: number[];
}

interface YieldRow {
  batchNo: string;
  yieldPct: number;
}

interface BatchReleaseStatus {
  manufactured: number;
  released: number;
  rejected: number;
}

/** Section 7 stability intervals (0 = Initial / COA). */
const CONTROL_SAMPLE_INTERVALS = [0, 6, 12, 18, 24, 30] as const;
type ControlSampleInterval = (typeof CONTROL_SAMPLE_INTERVALS)[number];

interface ControlSamplePhParam {
  label: string;
  limit: string;
}

interface ControlSampleIntervalValues {
  description: string;
  ph: string;
}

interface ControlSampleBatchRow {
  batchNumber: string;
  intervals: Record<ControlSampleInterval, ControlSampleIntervalValues>;
}

interface ControlSampleData {
  descriptionSpec: string;
  phParams: ControlSamplePhParam[];
  batches: ControlSampleBatchRow[];
}

/** Normalize batch numbers from review Excel (MFR prefix → MFC). */
function normalizeReviewBatchNo(batchStr: string): string {
  return batchStr.replace(/^MFR\b/i, 'MFC').trim().toUpperCase();
}

/** Format batch counts for section 6 table; rejected row uses "Nil" when zero. */
function formatBatchCountForApqr(count: number, nilWhenZero = false): string {
  if (nilWhenZero && count === 0) return 'Nil';
  return count.toString().padStart(2, '0');
}

/**
 * Load all rejected batch numbers from Review of Batch Rejection.xlsx
 * (same source as /api/reviews batchRejection).
 */
async function loadRejectedBatchNumbersFromExcel(): Promise<Set<string>> {
  const rejected = new Set<string>();
  const filePath = path.join(process.cwd(), 'excel', 'Review of Batch Rejection.xlsx');

  try {
    await fs.promises.access(filePath);
  } catch {
    console.warn('  ⚠️ Review of Batch Rejection.xlsx not found — rejected batch count will be 0');
    return rejected;
  }

  try {
    const buf = await fs.promises.readFile(filePath);
    const wb = XLSX.read(buf, { type: 'buffer' });
    const sheetName = wb.SheetNames?.[0];
    if (!sheetName) return rejected;

    const aoa = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {
      header: 1,
      defval: '',
      blankrows: false,
      raw: false,
    }) as unknown[][];

    if (aoa.length < 2) return rejected;

    const normalizedHeaders = (aoa[0] as unknown[]).map((h) =>
      String(h ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '')
    );
    const batchColIdx = normalizedHeaders.reduce<number>((last, h, i) =>
      (h.includes('batchno') || h.includes('batchnumber') || h === 'batch') ? i : last,
      -1
    );

    if (batchColIdx === -1) {
      console.warn('  ⚠️ Batch Rejection Excel: no batch number column found');
      return rejected;
    }

    for (let i = 1; i < aoa.length; i++) {
      const row = aoa[i] as unknown[];
      const batchRaw = row[batchColIdx];
      if (!batchRaw) continue;

      String(batchRaw)
        .split(/[\r\n,]+/)
        .map((t) => normalizeReviewBatchNo(t.trim()))
        .filter((t) => t && !['N/A', 'NA', 'NIL', '-'].includes(t))
        .forEach((bn) => rejected.add(bn));
    }

    console.log(`  📋 Batch Rejection Excel: ${rejected.size} rejected batch number(s) loaded`);
  } catch (err) {
    console.warn('  ⚠️ Failed to read Review of Batch Rejection.xlsx:', err);
  }

  return rejected;
}

function computeBatchReleaseStatus(
  finalBatches: Array<{ batchNumber: string }>,
  rejectedBatchSet: Set<string>,
): BatchReleaseStatus {
  const manufactured = finalBatches.length;
  let rejected = 0;

  for (const batch of finalBatches) {
    const bn = normalizeReviewBatchNo(batch.batchNumber);
    if (rejectedBatchSet.has(bn)) rejected++;
  }

  return {
    manufactured,
    rejected,
    released: manufactured - rejected,
  };
}

/** Format COA pH limit text for section 7 header lines. */
function formatControlSamplePhLimit(limit: string): string {
  const s = (limit || '').trim();
  if (!s) return '';
  const between = s.match(/^between\s+(.+)$/i);
  if (between) return between[1].trim();
  return s;
}

/** Build pH table title cell lines (e.g. pH + per-pharmacopoeia limits). */
function buildControlSamplePhHeaderLines(phParams: ControlSamplePhParam[]): string[] {
  if (phParams.length === 0) return ['pH'];
  if (phParams.length === 1 && !phParams[0].label) {
    const lim = formatControlSamplePhLimit(phParams[0].limit);
    return [lim ? `pH (${lim})` : 'pH'];
  }
  const lines = ['pH'];
  for (const p of phParams) {
    const lim = formatControlSamplePhLimit(p.limit);
    if (p.label) {
      lines.push(lim ? `(As per ${p.label} - ${lim})` : `(As per ${p.label})`);
    } else if (lim) {
      lines.push(`(${lim})`);
    }
  }
  return lines;
}

function formatControlSampleDescriptionCell(raw: string): string {
  return (raw || '').trim() ? 'Complies' : '--';
}

function formatControlSamplePhCell(raw: string): string {
  const v = (raw || '').trim();
  return v || '--';
}

/** Extract pH parameters and description from a FINISH COA (same rules as retained-sample API). */
function extractFinishCoaControlSample(coa: {
  finishData?: {
    description?: string;
    criticalParameters?: Array<{ name?: string; result?: string; limit?: string }>;
    identificationTests?: Array<{ name?: string; result?: string }>;
  };
}): { phParams: ControlSamplePhParam[]; description: string } {
  const params = coa.finishData?.criticalParameters || [];
  const phRaw = params.filter(
    (p) => /^ph(\s|$)/i.test((p.name || '').trim()) || /^ph$/i.test((p.name || '').trim()),
  );
  const usedLabels = new Map<string, number>();
  const phParams: ControlSamplePhParam[] = phRaw.map((p) => {
    const suffix = (p.name || '').trim().replace(/^ph\s*/i, '').trim();
    let label = suffix;
    const count = usedLabels.get(label) ?? 0;
    if (count > 0) label = label ? `${label} ${count + 1}` : `${count + 1}`;
    usedLabels.set(suffix, count + 1);
    return { label, limit: p.limit || '' };
  });

  const allParams: Array<{ name?: string; result?: string }> = [
    ...params,
    ...(coa.finishData?.identificationTests || []),
  ];
  const descParam = allParams.find((p) => /^description$/i.test((p.name || '').trim()));
  const description =
    coa.finishData?.description ||
    descParam?.result ||
    '';

  return { phParams, description };
}

type MappedStabilityEntry = {
  month: number;
  pH: string;
  phValues: Array<{ label: string; value: string }>;
  description: string;
};

async function loadControlSampleDataForApqr(
  finalBatches: Array<{ batchNumber: string }>,
  batchItemCodeMap: Map<string, string>,
  mfcNo: string,
): Promise<ControlSampleData | null> {
  if (finalBatches.length === 0) return null;

  const batchNumbers = finalBatches.map((b) => b.batchNumber);
  const coaMap = new Map<string, { phParams: ControlSamplePhParam[]; description: string }>();

  const coas = await COA.find(
    { batchNumber: { $in: batchNumbers }, stage: 'FINISH' },
    {
      batchNumber: 1,
      'finishData.description': 1,
      'finishData.criticalParameters': 1,
      'finishData.identificationTests': 1,
    },
  ).lean();

  for (const coa of coas) {
    coaMap.set(coa.batchNumber, extractFinishCoaControlSample(coa));
  }

  const stabilityMap = new Map<string, MappedStabilityEntry[]>();
  if (mfcNo) {
    const retainedDocs = await RetainedSample.find({
      mfcNo,
      batchNumber: { $in: batchNumbers },
    }).lean();

    for (const r of retainedDocs) {
      const mapped: MappedStabilityEntry[] = (r.stabilityEntries || []).map((e: {
        month: number;
        pH?: string;
        phValues?: Array<{ label?: string; value?: string }>;
        description?: string;
      }) => ({
        month: e.month,
        pH: e.pH || '',
        phValues: (e.phValues || []).map((pv: { label?: string; value?: string }) => ({
          label: pv.label || '',
          value: pv.value || '',
        })),
        description: e.description || '',
      }));
      const itemCode = (r as { itemCode?: string }).itemCode || '';
      if (itemCode) {
        stabilityMap.set(`${r.batchNumber}|${itemCode}`, mapped);
      } else {
        stabilityMap.set(r.batchNumber, mapped);
      }
    }
  }

  const phParamsHeader: ControlSamplePhParam[] = [];
  const descriptionSpecs: string[] = [];
  const batches: ControlSampleBatchRow[] = [];

  for (const batch of finalBatches) {
    const bn = batch.batchNumber;
    const itemCode = batchItemCodeMap.get(bn) || '';
    const coa = coaMap.get(bn);
    const phParams = coa?.phParams || [];
    const zeroDesc = coa?.description || '';

    if (zeroDesc) descriptionSpecs.push(zeroDesc);
    for (const p of phParams) {
      if (!phParamsHeader.some((x) => x.label === p.label && x.limit === p.limit)) {
        phParamsHeader.push({ label: p.label, limit: p.limit });
      }
    }

    const stability =
      (itemCode ? stabilityMap.get(`${bn}|${itemCode}`) : undefined) ||
      stabilityMap.get(bn) ||
      [];

    const getEntry = (month: 6 | 12 | 18 | 24 | 30) =>
      stability.find((e) => e.month === month);

    const getPh = (month: ControlSampleInterval): string => {
      if (month === 0) {
        const coaEntry = coas.find((c) => c.batchNumber === bn);
        const phRaw = (coaEntry?.finishData?.criticalParameters || []).filter(
          (p: { name?: string }) =>
            /^ph(\s|$)/i.test((p.name || '').trim()) || /^ph$/i.test((p.name || '').trim()),
        );
        return phRaw[0]?.result || '';
      }
      const entry = getEntry(month as 6 | 12 | 18 | 24 | 30);
      if (!entry) return '';
      const primaryLabel = phParams[0]?.label ?? '';
      if (entry.phValues.length > 0) {
        const match = entry.phValues.find((pv) => pv.label === primaryLabel);
        return (match || entry.phValues[0])?.value || '';
      }
      return entry.pH || '';
    };

    const getDesc = (month: ControlSampleInterval): string => {
      if (month === 0) return zeroDesc;
      return getEntry(month as 6 | 12 | 18 | 24 | 30)?.description || '';
    };

    const intervals = {} as ControlSampleBatchRow['intervals'];
    for (const m of CONTROL_SAMPLE_INTERVALS) {
      intervals[m] = { description: getDesc(m), ph: getPh(m) };
    }
    batches.push({ batchNumber: bn, intervals });
  }

  console.log(
    `✅ Section 7 Control Sample: ${batches.length} batch(es), `
    + `${phParamsHeader.length} pH param(s), COA specs=${descriptionSpecs.length}`,
  );

  return {
    descriptionSpec: descriptionSpecs[0] || '',
    phParams: phParamsHeader,
    batches,
  };
}

/** Locate the Nth table after an anchor in document XML (0-based). */
function extractDocxTableAfterAnchor(
  docXml: string,
  anchorText: string,
  tableIndex: number,
  searchFrom = 500000,
): { start: number; end: number; tableXml: string } | null {
  const anchor = docXml.indexOf(anchorText, searchFrom);
  if (anchor === -1) return null;

  let pos = anchor;
  for (let ti = 0; ti <= tableIndex; ti++) {
    const tblStart = docXml.indexOf('<w:tbl>', pos);
    if (tblStart === -1) return null;

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

    if (ti === tableIndex) {
      return { start: tblStart, end: tblEnd, tableXml: docXml.substring(tblStart, tblEnd) };
    }
    pos = tblEnd;
  }
  return null;
}

/**
 * Update section 5.4 yield trend charts (chart11 bulk / chart12 finished).
 * Replaces embedded caches with table data, removes external Excel OLE binding,
 * and clears fixed Y-axis limits so the plot auto-scales to the batch values.
 */
function updateYieldTrendChartXml(
  chartXml: string,
  categories: string[],
  series: YieldChartSeries[],
): string {
  const buildStrCache = (vals: string[]) => {
    const pts = vals.map((v, i) => `<c:pt idx="${i}"><c:v>${xmlEscape(v)}</c:v></c:pt>`).join('');
    return `<c:strCache><c:ptCount val="${vals.length}"/>${pts}</c:strCache>`;
  };
  const buildNumCache = (vals: number[]) => {
    const pts = vals.map((v, i) => `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`).join('');
    return `<c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${vals.length}"/>${pts}</c:numCache>`;
  };
  const buildSerName = (name: string) =>
    `<c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>${xmlEscape(name)}</c:v></c:pt></c:strCache>`;

  const nCat = categories.length;
  const catFormula = nCat > 0 ? `Sheet1!$A$2:$A$${nCat + 1}` : 'Sheet1!$A$2';

  let serIdx = 0;
  let res = chartXml.replace(/<c:ser>([\s\S]*?)<\/c:ser>/g, (match, content) => {
    if (serIdx >= series.length) return match;
    const sd = series[serIdx];
    const valCol = String.fromCharCode(66 + serIdx);
    const nVal = sd.values.length;
    const valFormula = nVal > 0 ? `Sheet1!$${valCol}$2:$${valCol}$${nVal + 1}` : `Sheet1!$${valCol}$2`;
    serIdx++;

    let updated = content;
    updated = updated.replace(
      /(<c:tx>[\s\S]*?<c:strRef>[\s\S]*?)<c:strCache>[\s\S]*?<\/c:strCache>([\s\S]*?<\/c:strRef>[\s\S]*?<\/c:tx>)/,
      `$1${buildSerName(sd.name)}$2`
    );
    updated = updated.replace(
      /(<c:cat>[\s\S]*?<c:strRef>[\s\S]*?)<c:f>[^<]*<\/c:f>/,
      `$1<c:f>${catFormula}</c:f>`
    );
    updated = updated.replace(
      /(<c:cat>[\s\S]*?<c:strRef>[\s\S]*?)<c:strCache>[\s\S]*?<\/c:strCache>([\s\S]*?<\/c:strRef>[\s\S]*?<\/c:cat>)/,
      `$1${buildStrCache(categories)}$2`
    );
    updated = updated.replace(
      /(<c:val>[\s\S]*?<c:numRef>[\s\S]*?)<c:f>[^<]*<\/c:f>/,
      `$1<c:f>${valFormula}</c:f>`
    );
    updated = updated.replace(
      /(<c:val>[\s\S]*?<c:numRef>[\s\S]*?)<c:numCache>[\s\S]*?<\/c:numCache>([\s\S]*?<\/c:numRef>[\s\S]*?<\/c:val>)/,
      `$1${buildNumCache(sd.values)}$2`
    );
    return `<c:ser>${updated}</c:ser>`;
  });

  res = res.replace(/<c:externalData\b[^>]*>[\s\S]*?<\/c:externalData>/g, '');
  res = res.replace(/<c:scaling>([\s\S]*?)<\/c:scaling>/g, (_match, content) => {
    const stripped = content
      .replace(/<c:min\b[^>]*\/?>/g, '')
      .replace(/<c:max\b[^>]*\/?>/g, '');
    return `<c:scaling>${stripped}</c:scaling>`;
  });

  return res;
}

/** Remove external Excel OLE links from chart rels so Word uses embedded caches. */
function stripChartExternalOleLink(chartRelsXml: string): string {
  return chartRelsXml.replace(
    /<Relationship\b[^>]*Type="[^"]*oleObject"[^>]*\/>/g,
    ''
  );
}

async function applyYieldTrendChartUpdate(
  zip: JSZip,
  chartFileName: string,
  categories: string[],
  series: YieldChartSeries[],
): Promise<boolean> {
  const chartPath = `word/charts/${chartFileName}`;
  const chartXmlRaw = await zip.file(chartPath)?.async('string');
  if (!chartXmlRaw) return false;

  zip.file(chartPath, updateYieldTrendChartXml(chartXmlRaw, categories, series));

  const relsPath = `word/charts/_rels/${chartFileName}.rels`;
  const relsXml = await zip.file(relsPath)?.async('string');
  if (relsXml) {
    zip.file(relsPath, stripChartExternalOleLink(relsXml));
  }
  return true;
}

/**
 * Clean product name:
 * - Remove duplicate or trailing pharmacopoeia/regulatory tags (NP), (IP), (BP), (USP), (EP)
 * - Abbreviate common dosage form suffixes (EYE DROPS → ED, etc.)
 */
function cleanProductName(raw: string): string {
  if (!raw) return raw;
  // Remove ALL parenthetical pharmacopoeia/regulatory tags
  let name = raw.replace(/\s*\([A-Z]{1,5}\)/g, '');
  // Abbreviate dosage forms
  name = name.replace(/\bEYE\s+DROPS\b/gi, 'ED');
  name = name.replace(/\bEYE\s+OINTMENT\b/gi, 'EO');
  name = name.replace(/\bEAR\s+DROPS\b/gi, 'ED');
  name = name.replace(/\bNASAL\s+DROPS\b/gi, 'ND');
  return name.replace(/\s+/g, ' ').trim();
}

function toTitleCase(str: string): string {
  if (!str) return '';
  return str.split(' ').map(w => {
    if (['BP', 'IP', 'USP', 'EP', 'NF', 'IH'].includes(w.toUpperCase())) return w.toUpperCase();
    if (w.toUpperCase() === 'Q.S.') return 'q.s.';
    if (w.length === 0) return '';
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  }).join(' ');
}

function splitMultipleCompositionBlocks(raw: string): string[] {
  if (!raw || raw.trim() === 'N/A') return [raw];

  // Find start index of every "COMPOSITION" keyword (case-insensitive)
  const compRegex = /COMPOSITION\s*[:\-]?\s*/gi;
  const matches: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = compRegex.exec(raw)) !== null) {
    matches.push(m.index);
  }

  // If 0 or 1 COMPOSITION blocks, no splitting needed
  if (matches.length <= 1) return [raw];

  // Slice the string at each COMPOSITION start
  const parts: string[] = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i];
    const end = i + 1 < matches.length ? matches[i + 1] : raw.length;
    const part = raw.substring(start, end).trim();
    if (part) parts.push(part);
  }

  return parts.length > 0 ? parts : [raw];
}

/**
 * Build an array of formatted label claim strings from batchInfo.
 * Supports 1 or more label claims (e.g. IP and USP) — each as a separate string.
 */
function buildLabelClaimsText(batchInfo: { labelClaim?: string; labelClaims?: string[] } | undefined): string[] {
  if (!batchInfo) return [];

  // Prefer the labelClaims array if it has entries, fall back to single labelClaim
  const rawClaims: string[] = (batchInfo.labelClaims && batchInfo.labelClaims.length > 0)
    ? batchInfo.labelClaims
    : (batchInfo.labelClaim ? [batchInfo.labelClaim] : []);

  // For each raw claim string, check if it contains multiple COMPOSITION blocks.
  // This handles the legacy case where both IP and USP are stored in one string.
  const splitClaims: string[] = [];
  for (const raw of rawClaims) {
    const subClaims = splitMultipleCompositionBlocks(raw);
    splitClaims.push(...subClaims);
  }

  return splitClaims
    .map(c => formatLabelClaim(c))
    .filter(Boolean);
}
function formatDotLeaderClaim(trimmed: string): string {
  const hasComposition = /^COMPOSITION\s*[:\-]?\s*/i.test(trimmed);
  const body = trimmed.replace(/^COMPOSITION\s*[:\-]?\s*/i, '').trim();

  const parts = body.split(/\.{2,}/);
  if (parts.length < 2) return trimmed.toUpperCase();

  const outputLines: string[] = [];
  if (hasComposition) outputLines.push('COMPOSITION:');

  let currentName = parts[0].trim().toUpperCase();

  for (let i = 1; i < parts.length; i++) {
    const segment = parts[i].trim();

    const valueMatch = segment.match(
      /^([\d.]+\s*%\s*[A-Z/Vv]+|Q\.?\s*S\.?(?:\s+ON\s+DRIED\s+BASIS)?)\s*(\([^)]*\))?\s*([\s\S]*?)$/i
    );

    if (valueMatch) {
      const concentration = normalizeConcentration(valueMatch[1]);
      const qualifier = valueMatch[2] ? valueMatch[2].trim().toUpperCase() : '';
      const rest = valueMatch[3].trim().toUpperCase();

      // Split spec from name (last token if pharmacopoeia)
      const nameTokens = currentName.split(/\s+/);
      const specToken = extractSpecToken(nameTokens);
      let spec = '';
      let namePart = currentName;

      if (specToken) {
        spec = specToken;
        nameTokens.pop();
        while (nameTokens.length > 0 && extractSpecToken(nameTokens)) nameTokens.pop();
        namePart = nameTokens.join(' ');
      }

      // Build the formatted lines for this ingredient
      const ingredientLines = buildIngredientLines(namePart, spec, concentration, qualifier);
      outputLines.push(...ingredientLines);

      currentName = rest;
    } else {
      // Bare qualifier or continuation — attach to previous or carry forward
      if (/^\([^)]*\)$/.test(segment.trim())) {
        if (outputLines.length > 0) outputLines[outputLines.length - 1] += ' ' + segment.trim().toUpperCase();
        currentName = '';
      } else {
        if (currentName) outputLines.push(currentName);
        currentName = segment.toUpperCase();
      }
    }
  }

  if (currentName && currentName.trim()) {
    const alreadyPresent = outputLines.some(l =>
      l.toUpperCase().includes(currentName.split(/\s+/)[0])
    );
    if (!alreadyPresent) outputLines.push(currentName.trim());
  }

  return outputLines.join('\n');
}
function buildIngredientLines(
  name: string,
  spec: string,
  concentration: string,
  qualifier: string
): string[] {
  const lines: string[] = [];

  // Detect "EQ. TO" split point (case-insensitive)
  const eqToMatch = name.match(/^(.*?)\s+(EQ\.?\s+TO\s+.*)$/i);

  if (eqToMatch) {
    // Case A: split at "EQ. TO"
    const namePart1 = eqToMatch[1].trim();
    const namePart2 = eqToMatch[2].trim();

    // Line 1: first part of name + spec in col 1, nothing in col 2
    lines.push(`${namePart1}\t${spec}\t`);

    // Line 2: second part of name + concentration in col 2
    const line2Name = qualifier ? `${namePart2} ${qualifier}` : namePart2;
    lines.push(`${line2Name}\t\t${concentration}`);

  } else {
    // Case B: single-line ingredient
    const displayName = qualifier ? `${name} ${qualifier}` : name;
    lines.push(`${displayName}\t${spec}\t${concentration}`);
  }

  return lines;
}


/**
 * Format a space/newline-separated label claim to ALL CAPS tabular lines.
 * e.g. "COMPOSITION:\nSODIUM HYALURONATE BP 0.1% WV\nSTERILE AQUEOUS BASE Q.S"
 */
function formatSpaceSeparatedClaim(trimmed: string): string {
  const hasComposition = /^COMPOSITION\s*[:\-]?\s*/i.test(trimmed);
  const body = trimmed.replace(/^COMPOSITION\s*[:\-]?\s*/i, '').trim();

  const rawLines = body
    .split(/\n|\r\n|\r/)
    .map(l => l.trim())
    .filter(l => l.length > 0);

  const outputLines: string[] = [];
  if (hasComposition) outputLines.push('COMPOSITION:');

  const processLine = (rawLine: string) => {
    const parsed = parseSpaceSeparatedIngredient(rawLine);
    if (parsed) {
      const ingredientLines = buildIngredientLines(
        parsed.name.toUpperCase(),
        parsed.spec.toUpperCase(),
        normalizeConcentration(parsed.concentration),
        parsed.qualifier.toUpperCase()
      );
      outputLines.push(...ingredientLines);
    } else {
      outputLines.push(rawLine.toUpperCase());
    }
  };

  if (rawLines.length > 0) {
    rawLines.forEach(processLine);
  } else if (body.length > 0) {
    processLine(body);
  }

  return outputLines.join('\n');
}
/**
 * Parse raw label claim text and format it for DOCX display.
 *
 * Handles two input formats:
 * A) Dot-leader format: "NAME BP.....0.1%W/V NAME2....0.005%W/V (AS PRESERVATIVE) NAME3....Q.S."
 * B) Space/tab-separated format: "COMPOSITION:\nSODIUM HYALURONATE    BP    0.1% WV\nSTABILIZED OXYCHLORO COMPLEX ..."
 *
 * Output (Image 2 style — same line, no dot leaders):
 *   "COMPOSITION:\nSODIUM HYALURONATE BP 0.1% w/v\nSTABILIZED OXYCHLORO COMPLEX (AS PRESERVATIVE) 0.005% w/v\nSTERILE AQUEOUS BASE Q.S."
 */
function formatLabelClaim(raw: string): string {
  if (!raw || raw.trim() === 'N/A') return raw || '';

  const trimmed = raw.trim();
  const hasDotLeaders = /\.{2,}/.test(trimmed);

  if (hasDotLeaders) {
    return formatDotLeaderClaim(trimmed);
  } else {
    return formatSpaceSeparatedClaim(trimmed);
  }
}


/**
 * Extract a trailing pharmacopoeia spec token from a name token array.
 * Returns the token (e.g. "BP", "USP") or null.
 */
function extractSpecToken(tokens: string[]): string | null {
  if (tokens.length === 0) return null;
  const last = tokens[tokens.length - 1].toUpperCase();
  if (KNOWN_SPECS.includes(last)) return last;
  return null;
}

/**
 * Normalize a concentration string to lowercase standard form.
 * e.g. "0.1%WV" → "0.1% w/v", "Q.S" → "q.s.", "Q. S" → "q.s."
 */
function normalizeConcentration(raw: string): string {
  const s = raw.trim();

  // Q.S. variants → "Q. S"
  if (/^Q\.?\s*S\.?$/i.test(s)) return 'Q. S';
  if (/^Q\.S\.\s+ON\s+DRIED\s+BASIS$/i.test(s)) return 'Q. S ON DRIED BASIS';

  return s
    .toUpperCase()
    .replace(/%\s*W\s*V\b/g, '% W/V')
    .replace(/%\s*W\s*\/\s*V/g, '% W/V')
    .replace(/%\s*W\s*\/\s*W/g, '% W/W')
    .replace(/%\s*V\s*\/\s*V/g, '% V/V')
    .replace(/%\s*V\s*V\b/g, '% V/V')
    .replace(/%\s*W\s*W\b/g, '% W/W');
}

/**
 * Parse a single space-separated ingredient line into its components.
 *
 * Handles patterns like:
 *   "SODIUM HYALURONATE BP 0.1% WV"
 *   "STABILIZED OXYCHLORO COMPLEX (AS PRESERVATIVE) 0.005% W/V"
 *   "STERILE AQUEOUS BASE Q.S"
 *   "NAPHAZOLINE HYDROCHLORIDE USP 0.05% W/V"
 *
 * Returns null if the line doesn't match the expected pattern.
 */
function parseSpaceSeparatedIngredient(line: string): {
  name: string;
  spec: string;
  concentration: string;
  qualifier: string;
} | null {
  const match = line.match(
    /^(.*?)\s*(\([^)]*\))?\s+([\d.]+\s*%\s*[A-Za-z/]+|Q\.?\s*S\.?(?:\s+ON\s+DRIED\s+BASIS)?)$/i
  );

  if (!match) return null;

  let namePart = match[1].trim();
  const qualifier = match[2] ? match[2].trim() : '';
  const concentration = match[3].trim();

  // Check if last token of namePart is a pharmacopoeia spec
  const nameTokens = namePart.split(/\s+/);
  const specToken = extractSpecToken(nameTokens);
  let spec = '';

  if (specToken) {
    spec = specToken;
    nameTokens.pop();
    while (nameTokens.length > 0 && extractSpecToken(nameTokens)) nameTokens.pop();
    namePart = nameTokens.join(' ');
  }

  if (!namePart) return null;

  return { name: namePart, spec, concentration, qualifier };
}


/**
 * Extract unique pack sizes from fillingDetails and format them.
 * e.g. ['10 ML', '10 ML', '5 ML', '10 ML'] → "10 ml, 5 ml"
 */
function computePackStyle(fillingDetails: any[]): string {
  const seen = new Set<string>();
  const sizes: string[] = [];
  for (const fd of (fillingDetails || [])) {
    const raw = (fd.packingSize || '').trim();
    if (!raw || raw.toUpperCase() === 'N/A') continue;
    // Normalize: uppercase → lowercase, keep spacing
    const normalized = raw.replace(/\bML\b/g, 'ml').replace(/\bGM\b/g, 'g').replace(/\bKG\b/g, 'kg');
    if (!seen.has(normalized)) {
      seen.add(normalized);
      sizes.push(normalized);
    }
  }
  return sizes.join(', ');
}

/**
 * Replace text inside <w:t> elements only, preserving XML structure.
 * This does a global find-and-replace scoped to text content.
 */
function replaceTextInXml(xml: string, find: string, replace: string): string {
  // Regex to match <w:t> or <w:t xml:space="preserve"> elements
  return xml.replace(
    /(<w:t[^>]*>)([\s\S]*?)(<\/w:t>)/g,
    (full, open, text, close) => {
      if (text.includes(find)) {
        const newText = text.split(find).join(replace);
        return `${open}${newText}${close}`;
      }
      return full;
    }
  );
}

/**
 * Helper to replace text in the Nth cell (<w:tc>) of a table row (<w:tr>).
 * @param rowXml The XML string of the row.
 * @param cellIndex The 0-based index of the cell to modify.
 * @param newText The new text content.
 * @param isRawXml If true, `newText` is treated as raw XML (e.g. contains <w:br/>), otherwise it's wrapped in a <w:t>.
 */
function replaceCellText(rowXml: string, cellIndex: number, newText: string, isRawXml: boolean = false, vMergeVal?: 'restart' | 'continue'): string {
  // Regex to match <w:tc>...</w:tc> blocks
  // Note: This is a simple regex and might be brittle with nested tags, but standard Word XML tables are usually flat structure-wise for cells.
  const cellRegex = /<w:tc>[\s\S]*?<\/w:tc>/g;
  let match;
  let currentIdx = 0;

  // We need to reconstruct the string because we can't just replace the Nth match easily with replace()
  let result = '';
  let lastIndex = 0;

  while ((match = cellRegex.exec(rowXml)) !== null) {
    if (currentIdx === cellIndex) {
      // Found target cell. Replace its content.
      // We want to keep the <w:tc> and <w:tcPr>... properties, but replace the <w:p>...</w:p> content or just the text inside <w:t>.
      // A safe way is to replace EVERYTHING inside <w:tc> with a fresh paragraph containing our text.
      // But preserving cell properties (<w:tcPr>) is crucial for styling (borders, width).

      const cellContent = match[0];
      const closeTagIndex = cellContent.indexOf('</w:tc>');

      // Try to separate properties from content
      // Properties usually come first: <w:tc><w:tcPr>...</w:tcPr><w:p>...</w:p></w:tc>
      // Or just <w:tc><w:p>...</w:p></w:tc>
      const tcPrMatch = cellContent.match(/<w:tcPr>[\s\S]*?<\/w:tcPr>/);
      let tcPr = tcPrMatch ? tcPrMatch[0] : '<w:tcPr></w:tcPr>';

      if (vMergeVal) {
        // Remove any existing vMerge
        tcPr = tcPr.replace(/<w:vMerge[^>]*\/>/g, '');
        // Insert new vMerge before </w:tcPr>
        if (tcPr.includes('</w:tcPr>')) {
          const vMergeTag = vMergeVal === 'restart' ? '<w:vMerge w:val="restart"/>' : '<w:vMerge/>';
          tcPr = tcPr.replace('</w:tcPr>', `${vMergeTag}</w:tcPr>`);
        }
      }

      // Construct new cell content
      // We wrap the text in a standard paragraph structure
      let innerContent = '';
      if (isRawXml) {
        // for raw XML (like <w:br/>), we need to be careful. 
        // <w:t> does not support <w:br/> directly inside safely without breaks; <w:br/> usually sits in <w:r>.
        // If we have line breaks, we can construct multiple runs or use <w:br/> inside a run.
        const parts = newText.split('<w:br/>');
        let runInner = '';
        for (let i = 0; i < parts.length; i++) {
          if (i > 0) runInner += '<w:br/>';
          runInner += `<w:t>${xmlEscape(parts[i])}</w:t>`;
        }
        innerContent = `<w:p><w:r>${runInner}</w:r></w:p>`;
      } else {
        innerContent = `<w:p><w:r><w:t>${newText}</w:t></w:r></w:p>`;
      }

      const newCell = `<w:tc>${tcPr}${innerContent}</w:tc>`;

      result += rowXml.substring(lastIndex, match.index) + newCell;
      lastIndex = match.index + match[0].length;

      // We only replace the specific cell once.
    }
    currentIdx++;
  }

  // Append remaining XML
  result += rowXml.substring(lastIndex);

  return result;
}

/**
 * After the "Label Claim:" row has been written with the first composition,
 * clone its structure and insert one new row per extra claim (IP+USP, etc.).
 * Each extra row has an empty first cell and the composition in the second cell.
 */
function injectExtraLabelClaimRows(xml: string, extraClaims: string[]): string {
  if (!extraClaims.length) return xml;

  const labelClaimIdx = xml.indexOf('Label Claim:');
  if (labelClaimIdx === -1) return xml;

  const trStart = xml.lastIndexOf('<w:tr', labelClaimIdx);
  const trEnd = xml.indexOf('</w:tr>', labelClaimIdx) + 7;
  if (trStart === -1 || trEnd < 7) return xml;

  const labelClaimRow = xml.substring(trStart, trEnd);

  const trPrMatch = labelClaimRow.match(/<w:trPr>[\s\S]*?<\/w:trPr>/);
  const trPr = trPrMatch ? trPrMatch[0] : '';

  const cellRegex = /<w:tc\b[^>]*>[\s\S]*?<\/w:tc>/g;
  const cells: string[] = [];
  let mc: RegExpExecArray | null;
  while ((mc = cellRegex.exec(labelClaimRow)) !== null) cells.push(mc[0]);

  if (cells.length < 2) return xml;

  // Empty first cell
  const labelTcPrMatch = cells[0].match(/<w:tcPr>[\s\S]*?<\/w:tcPr>/);
  const labelTcPr = labelTcPrMatch ? labelTcPrMatch[0] : '';
  const emptyLabelCell = `<w:tc>${labelTcPr}<w:p><w:pPr></w:pPr></w:p></w:tc>`;

  // Value cell structure
  const valueTcPrMatch = cells[1].match(/<w:tcPr>[\s\S]*?<\/w:tcPr>/);
  const valueTcPr = valueTcPrMatch ? valueTcPrMatch[0] : '';

  const pPrMatch = cells[1].match(/<w:pPr>[\s\S]*?<\/w:pPr>/);
  const pPrBase = pPrMatch ? pPrMatch[0] : '<w:pPr></w:pPr>';

  const rPrMatch = cells[1].match(/<w:rPr>[\s\S]*?<\/w:rPr>/);
  let rPr = rPrMatch ? rPrMatch[0] : '';
  if (rPr) {
    rPr = rPr.replace(/<w:color\b[^>]*\/>/g, '');
    rPr = rPr.replace(/<w:color\b[^>]*>[\s\S]*?<\/w:color>/g, '');
    rPr = rPr.replace(/<w:caps\b[^>]*\/?>/g, '');
    rPr = rPr.replace(/<w:smallCaps\b[^>]*\/?>/g, '');
  }

  // Inject tab stops: col1=3400 (spec), col2=4600 (concentration)
  let pPr = pPrBase;
  if (!/<w:tabs>/.test(pPr)) {
    pPr = pPr.replace(
      '</w:pPr>',
      '<w:tabs><w:tab w:val="left" w:pos="3400"/><w:tab w:val="left" w:pos="4600"/></w:tabs></w:pPr>'
    );
  }

  const lineToRuns = (line: string): string => {
    const segments = line.split('\t');
    if (segments.length === 1) {
      return `<w:r>${rPr}<w:t xml:space="preserve">${xmlEscape(line)}</w:t></w:r>`;
    }
    return segments.map((seg, idx) => {
      const tabRun = idx < segments.length - 1 ? `<w:r>${rPr}<w:tab/></w:r>` : '';
      return `<w:r>${rPr}<w:t xml:space="preserve">${xmlEscape(seg)}</w:t></w:r>${tabRun}`;
    }).join('');
  };

  let extraRows = '';
  for (const claim of extraClaims) {
    const valueLines = claim.split('\n');
    const paras = valueLines
      .map(line => `<w:p>${pPr}${lineToRuns(line)}</w:p>`)
      .join('');
    const valueCell = `<w:tc>${valueTcPr}${paras}</w:tc>`;
    extraRows += `<w:tr>${trPr}${emptyLabelCell}${valueCell}</w:tr>`;
  }

  return xml.substring(0, trEnd) + extraRows + xml.substring(trEnd);
}




/**
 * Replace the VALUE cell in a table row identified by a LABEL in the first cell.
 * Searches for a <w:tr> containing `labelText` in its first <w:tc>, then replaces
 * ALL text content in the SECOND <w:tc> with `newValue`.
 * This is a targeted replacement that avoids polluting other cells.
 */
function replaceTableFieldValue(xml: string, labelText: string, newValue: string): string {
  // Find a row containing the label text
  const rowRegex = /<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/g;
  let rowMatch;

  while ((rowMatch = rowRegex.exec(xml)) !== null) {
    const rowXml = rowMatch[0];

    // Check if THIS row contains the label text in any <w:t> element
    const textContents: string[] = [];
    rowXml.replace(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g, (_, text) => {
      textContents.push(text);
      return _;
    });

    // Combine all text nodes to check if the label is present
    // (Word may split text across multiple <w:t> elements)
    const allText = textContents.join('');

    if (!allText.includes(labelText)) continue;

    // Found the row. Now find the cells.
    const cellRegex = /<w:tc\b[^>]*>[\s\S]*?<\/w:tc>/g;
    const cells: { start: number; end: number; content: string }[] = [];
    let cellMatch;

    while ((cellMatch = cellRegex.exec(rowXml)) !== null) {
      cells.push({
        start: cellMatch.index,
        end: cellMatch.index + cellMatch[0].length,
        content: cellMatch[0]
      });
    }

    if (cells.length < 2) continue;

    // Check that the FIRST cell contains the label (not the value cell)
    const firstCellTexts: string[] = [];
    cells[0].content.replace(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g, (_, text) => {
      firstCellTexts.push(text);
      return _;
    });

    if (!firstCellTexts.join('').includes(labelText)) continue;

    // Replace the SECOND cell's content
    const valueCell = cells[1].content;

    // Preserve <w:tcPr> (cell properties like width, borders)
    const tcPrMatch = valueCell.match(/<w:tcPr>[\s\S]*?<\/w:tcPr>/);
    let tcPr = tcPrMatch ? tcPrMatch[0] : '';

    // If there are multiple value cells, they were split in the template (e.g. Label Claim)
    // We must merge them back into a single wider cell to prevent text wrapping.
    const innerCellsCount = cells.length - 1;
    if (innerCellsCount > 1) {
      if (/<w:gridSpan\b[^>]*\/>/.test(tcPr)) {
        tcPr = tcPr.replace(/<w:gridSpan w:val="[^"]*"\/>/g, `<w:gridSpan w:val="${innerCellsCount}"/>`);
      } else {
        tcPr = tcPr.replace('</w:tcPr>', `<w:gridSpan w:val="${innerCellsCount}"/></w:tcPr>`);
      }
      // Expand width explicitly to standard 3610 pct
      tcPr = tcPr.replace(/<w:tcW\b[^>]*\/>/g, '<w:tcW w:w="3610" w:type="pct"/>');

      // Fix missing right border that was originally present on the now-deleted last cell
      if (tcPr.indexOf('<w:right w:val="nil"/>') !== -1) {
        tcPr = tcPr.replace('<w:right w:val="nil"/>', '<w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/>');
      } else if (!/<w:right\b[^>]*\/>/.test(tcPr) && /<\/w:tcBorders>/.test(tcPr)) {
        tcPr = tcPr.replace('</w:tcBorders>', '<w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/></w:tcBorders>');
      }
    }

    // Preserve <w:pPr> (paragraph properties like alignment)
    const pPrMatch = valueCell.match(/<w:pPr>[\s\S]*?<\/w:pPr>/);
    let pPr = pPrMatch ? pPrMatch[0] : '<w:pPr></w:pPr>';

    // Inject exact tab stops (3400 for Spec, 4600 for Concentration) to prevent them 
    // from jumping wildly based on ingredient name lengths.
    if (!/<w:tabs>/.test(pPr)) {
      pPr = pPr.replace('</w:pPr>', '<w:tabs><w:tab w:val="left" w:pos="3400"/><w:tab w:val="left" w:pos="4600"/></w:tabs></w:pPr>');
    }

    // Preserve <w:rPr> (run properties like font size, bold, font family)
    // but REMOVE color to avoid red placeholder text
    const rPrMatch = valueCell.match(/<w:rPr>[\s\S]*?<\/w:rPr>/);
    let rPr = rPrMatch ? rPrMatch[0] : '';

    // Remove tags forcing caps or color
    if (rPr) {
      rPr = rPr.replace(/<w:color\b[^>]*\/>/g, '');
      rPr = rPr.replace(/<w:color\b[^>]*>[\s\S]*?<\/w:color>/g, '');
      rPr = rPr.replace(/<w:caps\b[^>]*\/?>/g, '');
      rPr = rPr.replace(/<w:smallCaps\b[^>]*\/?>/g, '');
    }

    // Support multi-line values: split on \n and create one <w:p> per line
    const valueLines = newValue.split('\n');
    let newCell: string;

    /**
     * Convert a single text line (may contain \t) into Word runs.
     * \t becomes <w:tab/> so Word aligns columns using the cell's tab stops.
     */
    const lineToRuns = (line: string, rPrStr: string): string => {
      const segments = line.split('\t');
      if (segments.length === 1) {
        // No tabs — single run
        return `<w:r>${rPrStr}<w:t xml:space="preserve">${xmlEscape(line)}</w:t></w:r>`;
      }
      // Multiple segments separated by tabs
      return segments.map((seg, idx) => {
        const tabRun = idx < segments.length - 1
          ? `<w:r>${rPrStr}<w:tab/></w:r>`
          : '';
        return `<w:r>${rPrStr}<w:t xml:space="preserve">${xmlEscape(seg)}</w:t></w:r>${tabRun}`;
      }).join('');
    };

    if (valueLines.length <= 1) {
      newCell = `<w:tc>${tcPr}<w:p>${pPr}${lineToRuns(newValue, rPr)}</w:p></w:tc>`;
    } else {
      const paras = valueLines
        .map(line => `<w:p>${pPr}${lineToRuns(line, rPr)}</w:p>`)
        .join('');
      newCell = `<w:tc>${tcPr}${paras}</w:tc>`;
    }

    // Replace in the row - ensuring we consume all trailing split cells inside the template
    const lastCell = cells[cells.length - 1];
    const newRowXml = rowXml.substring(0, cells[1].start) + newCell + rowXml.substring(lastCell.end);

    // Replace in the full document
    xml = xml.substring(0, rowMatch.index) + newRowXml + xml.substring(rowMatch.index + rowXml.length);

    console.log(`Replaced field "${labelText}" with "${newValue.substring(0, 50)}"`);
    break; // Only replace the first matching row
  }

  return xml;
}

/**
 * Generates the APQR DOCX file buffer using JSZip.
 *
 * Reads the ORIGINAL template (templates/apqr_template.docx),
 * replaces known text with actual data values, and returns
 * the result as a Node Buffer — no intermediate "dynamic" template.
 */
export async function generateApqrDocx(productCode: string, year: number): Promise<Buffer> {
  const data = await getApqrData(productCode, year);

  console.log('APQR Data Summary:', {
    productCode: data.product_code,
    year: data.apqr_year,
    totalBatches: data.total_batches,
    batchesCount: data.batches?.length,
    compositionCount: data.composition?.length,
    materialVendorCount: data.materialVendorDetails?.length
  });

  // ── 1. Read the ORIGINAL template ───────────────────────────
  const templatePath = path.join(process.cwd(), 'templates', 'apqr_template.docx');
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template not found at: ${templatePath}`);
  }

  const templateBuffer = fs.readFileSync(templatePath);
  const zip = await JSZip.loadAsync(templateBuffer);

  const docXmlFile = zip.file('word/document.xml');
  if (!docXmlFile) {
    throw new Error('Template is missing word/document.xml');
  }

  let docXml = await docXmlFile.async('string');

  // ── 2a. Targeted field replacements in Brief Description table ─────
  // These replace only the VALUE cell next to the label, not globally.
  // This prevents label claim data from bleeding into Product Name / Generic Name.
  const formatShelfLife = (raw: any): string => {
    const v = (raw ?? '').toString().trim();
    if (!v) return '';
    if (/\bmonth(s)?\b/i.test(v)) return v;
    // If it looks numeric (e.g. "24"), render as "24 months"
    if (/^\d+(\.\d+)?$/.test(v)) return `${v} months`;
    return v;
  };

  const fieldReplacements: [string, string][] = [
    // BRIEF DESCRIPTION OF PRODUCT requirement:
    // Product Name and Generic Name must be the same (show Generic in Product Name).
    ['Product Name:', (data as any).generic_name || ''],
    ['Generic Name:', (data as any).generic_name || ''],
    ['Product Code:', data.product_code],
    // Show Department (Eye Drops, etc.) in Dosage Form
    ['Dosage Form:', (data as any).department || data.dosage_form || ''],
    ['Label Claim:', data.label_claim],
    ['Therapeutic Category:', data.therapeutic_category],
    ['Storage Condition:', data.storage_condition],
    ['Shelf Life:', formatShelfLife(data.shelf_life)],
    ['Mfg. Lic. No.:', data.mfg_lic_no],
    ['Packing Style:', data.pack_style],
  ];

  for (const [label, value] of fieldReplacements) {
    docXml = replaceTableFieldValue(docXml, label, value);
  }

  // ── 2b. Clean up redundant composition rows in the template ──
  // The template has multiple hardcoded composition rows under "Label Claim:".
  // We remove all <w:tr> elements located between the "Label Claim:" row and "Therapeutic Category:" row.
  const idxLabel = docXml.indexOf('Label Claim:');
  const idxTherapeutic = docXml.indexOf('Therapeutic Category:');

  if (idxLabel !== -1 && idxTherapeutic !== -1 && idxLabel < idxTherapeutic) {
    const trEndIdx = docXml.indexOf('</w:tr>', idxLabel) + 7;
    const trStartIdx = docXml.lastIndexOf('<w:tr', idxTherapeutic);

    if (trEndIdx > 0 && trStartIdx > trEndIdx) {
      const middleSection = docXml.substring(trEndIdx, trStartIdx);
      const cleanedMiddle = middleSection.replace(/<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/g, '');
      docXml = docXml.substring(0, trEndIdx) + cleanedMiddle + docXml.substring(trStartIdx);
    }
  }

  // ── 2b2. Inject extra rows for additional label claims (IP + USP, etc.) ──
  if (data.label_claims.length > 1) {
    docXml = injectExtraLabelClaimRows(docXml, data.label_claims.slice(1));
  }

  // ── 2c. Global text replacements for non-table content ────────────
  // Only for items that appear outside the Brief Description table.
  const replacements: [string, string][] = [
    // Product name in headers/titles — match full template string (with tag) first, then bare form
    ['SODIUM HYALURONATE EYE DROPS(NP)', xmlEscape(data.product_name)],
    ['SODIUM HYALURONATE EYE DROPS', xmlEscape(data.product_name)],

    // Product code in headers
    ['SY208G1H', xmlEscape(data.product_code)]
  ];

  for (const [find, replace] of replacements) {
    docXml = replaceTextInXml(docXml, find, replace);
  }

  // ── 2d. Section 5.3.2 heading — replace spec numbers with dynamic values from FINISH COAs ──
  // Heading pattern: "Finished Product Analysis (Specification No: SPFHY208B1D, ...)"
  // Source: finishSpecNumbers collected from ITMSPEC field of FINISH stage COAs
  {
    const finishSpecNums: string[] = (data as any).finishSpecNumbers || [];
    if (finishSpecNums.length > 0) {
      const newSpecStr = finishSpecNums.join(', ');
      // Replace in both TOC and body: find <w:t> elements containing "Specification No:"
      // and replace the spec number list that follows up to ")"
      docXml = docXml.replace(
        /(<w:t[^>]*>[^<]*Specification No:\s*)[^)<]+(\))/g,
        (_, prefix, suffix) => `${prefix}${xmlEscape(newSpecStr)}${suffix}`
      );
      console.log(`✅ Section 5.3.2 heading: updated spec numbers → ${newSpecStr}`);
    } else {
      console.warn('⚠️ Section 5.3.2 heading: no FINISH COA spec numbers found — heading left as-is');
    }
  }

  // ── Gap Fix: Remove empty paragraphs before BATCHES MANUFACTURED ──
  // Matches any empty paragraph (containing only properties but no text/runs, or empty runs) 
  // immediately followed by the paragraph containing "BATCHES".
  // Note: This handles standard empty paras like <w:p><w:pPr>...</w:pPr></w:p>
  // We use a regex that handles attributes.

  // Regex to match empty paragraphs: <w:p[^>]*>(?:<w:pPr>[\s\S]*?<\/w:pPr>)?\s*<\/w:p>
  // And remove them if they precede "BATCHES"
  // Since JS regex doesn't support variable length lookbehind, we might need a simpler replace or loop.
  // Actually, we can just replace specific known patterns if we saw them in snippet.
  // But a more robust way:
  // Find index of BATCHES
  const batchesIndex = docXml.indexOf('BATCHES');
  if (batchesIndex !== -1) {
    // Find the start of the paragraph containing BATCHES
    const pStartRegex = /<w:p[^>]*>/g;
    let match;
    let lastPStart = -1;
    while ((match = pStartRegex.exec(docXml)) !== null) {
      if (match.index > batchesIndex) break;
      lastPStart = match.index;
    }

    if (lastPStart !== -1) {
      // Look explicitly deeply backwards for empty paragraphs?
      // Too complex for string manipulation without full parser.
      // Let's try to remove the specific empty paragraphs seen in the snippet (ListParagraph, etc.)
      // Regex: Remove <w:p>...</w:p> that strictly do not contain <w:t> or <w:br> or <w:cr> and are before BATCHES.
      // We will do a replacement near the "BATCHES" text.

      const chunkBefore = docXml.substring(Math.max(0, lastPStart - 2000), lastPStart);
      // Regex to find empty Ps at the end of chunkBefore
      // Regex to find empty Ps at the end of chunkBefore
      // Improved: Matches <w:p> with optional properties, containing 0 or more runs.
      // Each run can have properties and optionally an empty/whitespace-only <w:t>.
      // This catches: <w:p><w:r><w:t> </w:t></w:r></w:p> and multiple empty runs.
      const emptyPRegex = /(<w:p\b[^>]*>(?:<w:pPr>[\s\S]*?<\/w:pPr>)?(?:<w:r\b[^>]*>(?:<w:rPr>[\s\S]*?<\/w:rPr>)?(?:<w:t[^>]*>[\s\u00A0]*<\/w:t>|<w:t\/>|<w:lastRenderedPageBreak\/>)?\s*<\/w:r>)*\s*<\/w:p>)+$/;

      const emptyMatch = chunkBefore.match(emptyPRegex);
      if (emptyMatch) {
        console.log('Found empty paragraphs before BATCHES. Removing...');
        const lengthToRemove = emptyMatch[0].length;
        docXml = docXml.substring(0, lastPStart - lengthToRemove) + docXml.substring(lastPStart);
      }
    }
  }

  // ── 4a. Dynamic Monthly Summary Grid ──────────────────────────
  // The monthly grid has 5 rows:
  //   Row 0: Month headers (Jan-Jun)
  //   Row 1: Count values for Jan-Jun
  //   Row 2: Month headers (Jul-Dec)
  //   Row 3: Count values for Jul-Dec
  //   Row 4: "Total Batches Manufactured: XX Batches" (merged row)
  // We need to replace the counts in rows 1 and 3, and the total in row 4.
  {
    const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];

    // Monthly counts from data object (already computed)
    const monthlyCounts: string[] = MONTH_NAMES.map(name => {
      const key = name.toLowerCase() + '_count';
      return (data as any)[key] || '--';
    });

    console.log('Monthly counts:', monthlyCounts);

    // Find the monthly grid table by locating "January"
    const janIdx = docXml.indexOf('January');
    if (janIdx !== -1) {
      // Find table boundaries
      const beforeJan = docXml.substring(Math.max(0, janIdx - 3000), janIdx);
      const tblStartOffset = beforeJan.lastIndexOf('<w:tbl>');
      const tblStart = tblStartOffset !== -1 ? Math.max(0, janIdx - 3000) + tblStartOffset : -1;

      const afterJan = docXml.substring(janIdx);
      const tblEndOffset = afterJan.indexOf('</w:tbl>');
      const tblEnd = tblEndOffset !== -1 ? janIdx + tblEndOffset + 8 : -1;

      if (tblStart !== -1 && tblEnd !== -1) {
        let gridXml = docXml.substring(tblStart, tblEnd);

        // Extract all rows
        const rowRegex = /<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/g;
        const rows: { xml: string; index: number }[] = [];
        let rowMatch;
        while ((rowMatch = rowRegex.exec(gridXml)) !== null) {
          rows.push({ xml: rowMatch[0], index: rowMatch.index });
        }

        if (rows.length >= 5) {
          // Replace count values in Row 1 (Jan-Jun counts) and Row 3 (Jul-Dec counts)
          for (const [rowIdx, startMonth] of [[1, 0], [3, 6]] as [number, number][]) {
            let rowXml = rows[rowIdx].xml;

            // Find all cells in this row  
            const cellRegex = /<w:tc\b[^>]*>[\s\S]*?<\/w:tc>/g;
            const cells: { xml: string; start: number; end: number }[] = [];
            let cellMatch;
            while ((cellMatch = cellRegex.exec(rowXml)) !== null) {
              cells.push({ xml: cellMatch[0], start: cellMatch.index, end: cellMatch.index + cellMatch[0].length });
            }

            // Replace each cell's text content (6 cells for 6 months)
            // Go in reverse to preserve indices
            for (let i = Math.min(cells.length - 1, 5); i >= 0; i--) {
              const monthIdx = startMonth + i;
              if (monthIdx >= 12) continue;
              const newValue = monthlyCounts[monthIdx];
              const cell = cells[i];

              // Preserve tcPr but replace text
              const tcPrMatch = cell.xml.match(/<w:tcPr>[\s\S]*?<\/w:tcPr>/);
              const tcPr = tcPrMatch ? tcPrMatch[0] : '';

              // Preserve pPr and rPr
              const pPrMatch = cell.xml.match(/<w:pPr>[\s\S]*?<\/w:pPr>/);
              const pPr = pPrMatch ? pPrMatch[0] : '';
              const rPrMatch = cell.xml.match(/<w:rPr>[\s\S]*?<\/w:rPr>/);
              const rPr = rPrMatch ? rPrMatch[0] : '';

              // Strip shading from tcPr — count rows must be white, not grey
              const cleanTcPr = tcPr
                .replace(/<w:shd\b[^>]*\/>/g, '')
                .replace(/<w:shd\b[^>]*>[\s\S]*?<\/w:shd>/g, '');
              const newCell = `<w:tc>${cleanTcPr}<w:p>${pPr}<w:r>${rPr}<w:t>${newValue}</w:t></w:r></w:p></w:tc>`;
              rowXml = rowXml.substring(0, cell.start) + newCell + rowXml.substring(cell.end);
            }

            // Replace row in gridXml
            gridXml = gridXml.substring(0, rows[rowIdx].index) + rowXml + gridXml.substring(rows[rowIdx].index + rows[rowIdx].xml.length);

            // Re-parse rows since indices changed
            const reRows: { xml: string; index: number }[] = [];
            const reRowRegex = /<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/g;
            let reMatch;
            while ((reMatch = reRowRegex.exec(gridXml)) !== null) {
              reRows.push({ xml: reMatch[0], index: reMatch.index });
            }
            rows.splice(0, rows.length, ...reRows);
          }

          // Replace Total row (Row 4) - replace "04" or similar count with actual total
          // The total is split: "Total Batches Manufactured: " + count digits + " Batches"
          let totalRow = rows[4].xml;
          // Replace all <w:t> elements in the total row
          const totalTexts: string[] = [];
          totalRow.replace(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g, (_, text) => {
            totalTexts.push(text);
            return _;
          });

          // Rebuild the total row with correct count
          // Preserve cell structure but replace paragraph content
          const totalTcPr = totalRow.match(/<w:tcPr>[\s\S]*?<\/w:tcPr>/)?.[0] || '';
          const totalPPr = totalRow.match(/<w:pPr>[\s\S]*?<\/w:pPr>/)?.[0] || '';
          const totalRPr = totalRow.match(/<w:rPr>[\s\S]*?<\/w:rPr>/)?.[0] || '';
          const trPr = totalRow.match(/<w:trPr>[\s\S]*?<\/w:trPr>/)?.[0] || '';

          const totalRowNew = `<w:tr>${trPr}<w:tc>${totalTcPr}<w:p>${totalPPr}<w:r>${totalRPr}<w:t xml:space="preserve">Total Batches Manufactured: ${data.total_batches} Batches</w:t></w:r></w:p></w:tc></w:tr>`;
          gridXml = gridXml.substring(0, rows[4].index) + totalRowNew + gridXml.substring(rows[4].index + rows[4].xml.length);
        }

        // Also replace month header years in rows 0 and 2
        for (const monthName of MONTH_NAMES) {
          // Template has "January-2025" etc, we need "MonthName-{year}"
          // Replace year portion: "January-2025" → "January-{year}"
          gridXml = gridXml.replace(
            new RegExp(`(${monthName}-)\\d{4}`, 'g'),
            `$1${data.apqr_year}`
          );
        }

        // Replace grid in document
        docXml = docXml.substring(0, tblStart) + gridXml + docXml.substring(tblEnd);
        console.log('✅ Monthly grid updated');
      }
    }
  }

  // ── 4b. Dynamic Batch Details Table ───────────────────────────
  // Table structure: "Details of Product Batches" title is in a separate element
  // Table rows are ALL data rows (no header row in the table)
  // Last row is "Total Batches Manufactured: XX Batches" (merged)
  // We need to:
  //   1. Find the table by looking for "Batch Number" 
  //   2. Identify data rows (rows with 5 cells)
  //   3. Remove all template data rows  
  //   4. Insert new rows from data.batches
  //   5. Replace the total row
  {
    const batchNumIdx = docXml.indexOf('Batch Number');
    if (batchNumIdx !== -1) {
      // Find the table containing "Batch Number" - this is a header row  
      // Actually looking at the template, "Batch Number" is in a header-like row
      // Let me find the table bounds
      const beforeBN = docXml.substring(Math.max(0, batchNumIdx - 3000), batchNumIdx);
      const tblStartOffset = beforeBN.lastIndexOf('<w:tbl>');
      const tblStart = tblStartOffset !== -1 ? Math.max(0, batchNumIdx - 3000) + tblStartOffset : -1;

      const afterBN = docXml.substring(batchNumIdx);
      const tblEndOffset = afterBN.indexOf('</w:tbl>');
      const tblEnd = tblEndOffset !== -1 ? batchNumIdx + tblEndOffset + 8 : -1;

      if (tblStart !== -1 && tblEnd !== -1) {
        let detailXml = docXml.substring(tblStart, tblEnd);

        // Find all rows
        const rowRegex = /<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/g;
        const rows: { xml: string; index: number }[] = [];
        let rowMatch;
        while ((rowMatch = rowRegex.exec(detailXml)) !== null) {
          rows.push({ xml: rowMatch[0], index: rowMatch.index });
        }

        console.log(`Batch details table: ${rows.length} rows found`);

        // Check if there's a "Details of Product Batches" header row
        // Identify rows: header-like rows (with "Month", "Batch Number"), data rows, and total row
        let headerEndIdx = 0; // Index of last header row + 1
        let totalRowIdx = rows.length - 1; // Last row is presumably the total

        // Find which rows are headers (contain "Month" or "Batch Number")
        for (let i = 0; i < rows.length; i++) {
          const rowTexts: string[] = [];
          rows[i].xml.replace(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g, (_, text) => {
            rowTexts.push(text.trim());
            return _;
          });
          const combined = rowTexts.join(' ');

          const isHeaderRow =
            combined.includes('Details of Product') ||
            combined.includes('Batch Number') ||
            (combined.includes('Month') && combined.includes('Batch') && combined.includes('Size'));

          if (isHeaderRow) {
            headerEndIdx = i + 1;
          }

          // Also mark total row correctly — must NOT be treated as header
          if (combined.includes('Total Batches Manufactured')) {
            totalRowIdx = i;
          }
        }

        // If no explicit header row with "Month" found, check if row 0 is actually data
        // From template inspection: Row 0 is "April-2025 | D25D21 | 150 LTR | 04/2025 | 03/2027"
        // It seems there is NO header row, all rows are data + 1 total
        // Let's check if "Details of Product Batches" is a separate header
        const detailsHeaderCheck = detailXml.indexOf('Details of Product');
        if (detailsHeaderCheck !== -1) {
          // Find which row contains it
          for (let i = 0; i < rows.length; i++) {
            if (rows[i].xml.includes('Details of Product')) {
              headerEndIdx = Math.max(headerEndIdx, i + 1);
              break;
            }
          }
        }

        // Also check for "Month" header
        for (let i = 0; i < rows.length; i++) {
          const rowTexts: string[] = [];
          rows[i].xml.replace(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g, (_, text) => {
            rowTexts.push(text.trim());
            return _;
          });
          const combined = rowTexts.join('|');
          if (combined.includes('Month') && combined.includes('Batch Number')) {
            headerEndIdx = Math.max(headerEndIdx, i + 1);
            break;
          }
        }

        console.log(`  Header rows: 0-${headerEndIdx - 1}, Data rows: ${headerEndIdx}-${totalRowIdx - 1}, Total row: ${totalRowIdx}`);

        const rawTemplateDataRow = rows[headerEndIdx]?.xml || '';

        // Strip ALL <w:shd .../> self-closing shading tags from the template data row.
        // This prevents header-row grey shading from bleeding into every data row.
        const templateDataRow = rawTemplateDataRow
          .replace(/<w:shd\b[^>]*\/>/g, '')           // self-closing: <w:shd ... />
          .replace(/<w:shd\b[^>]*>[\s\S]*?<\/w:shd>/g, ''); // paired tags (rare but safe)

        if (templateDataRow && totalRowIdx > headerEndIdx) {
          // Build new data rows
          let newDataRowsXml = '';

          if (data.batches && data.batches.length > 0) {
            for (const batch of data.batches) {
              let rowXml = templateDataRow;

              // Replace cell contents: Month | Batch Number | Batch Size | Mfg Date | Exp Date
              const monthYear = `${batch.b_month}-${data.apqr_year}`;
              rowXml = replaceCellText(rowXml, 0, xmlEscape(monthYear));
              rowXml = replaceCellText(rowXml, 1, xmlEscape(batch.b_num));
              rowXml = replaceCellText(rowXml, 2, xmlEscape(batch.b_size));
              rowXml = replaceCellText(rowXml, 3, xmlEscape(batch.b_mfg));
              rowXml = replaceCellText(rowXml, 4, xmlEscape(batch.b_exp));

              newDataRowsXml += rowXml;
            }
          } else {
            // No batches - insert a single row with message
            let emptyRow = templateDataRow;
            // Merge all cells into one by using the first cell with gridSpan
            const firstCellMatch = emptyRow.match(/<w:tc\b[^>]*>[\s\S]*?<\/w:tc>/);
            if (firstCellMatch) {
              const tcPr = firstCellMatch[0].match(/<w:tcPr>[\s\S]*?<\/w:tcPr>/)?.[0] || '';
              const pPr = firstCellMatch[0].match(/<w:pPr>[\s\S]*?<\/w:pPr>/)?.[0] || '';
              const rPr = firstCellMatch[0].match(/<w:rPr>[\s\S]*?<\/w:rPr>/)?.[0] || '';
              const trPr = emptyRow.match(/<w:trPr>[\s\S]*?<\/w:trPr>/)?.[0] || '';

              // Create a merged cell spanning all 5 columns
              const mergedTcPr = tcPr.replace(/<\/w:tcPr>/, '<w:gridSpan w:val="5"/></w:tcPr>') || '<w:tcPr><w:gridSpan w:val="5"/></w:tcPr>';

              newDataRowsXml = `<w:tr>${trPr}<w:tc>${mergedTcPr}<w:p>${pPr}<w:r>${rPr}<w:t>No batches were manufactured during the review period.</w:t></w:r></w:p></w:tc></w:tr>`;
            }
          }

          // Build total row
          const totalRow = rows[totalRowIdx].xml;
          const totalTcPr = totalRow.match(/<w:tcPr>[\s\S]*?<\/w:tcPr>/)?.[0] || '';
          const totalPPr = totalRow.match(/<w:pPr>[\s\S]*?<\/w:pPr>/)?.[0] || '';
          const totalRPr = totalRow.match(/<w:rPr>[\s\S]*?<\/w:rPr>/)?.[0] || '';
          const totalTrPr = totalRow.match(/<w:trPr>[\s\S]*?<\/w:trPr>/)?.[0] || '';

          const newTotalRow = `<w:tr>${totalTrPr}<w:tc>${totalTcPr}<w:p>${totalPPr}<w:r>${totalRPr}<w:t xml:space="preserve">Total Batches Manufactured: ${data.total_batches} Batches</w:t></w:r></w:p></w:tc></w:tr>`;

          // Replace: remove all data rows + total row, insert new ones
          const dataStartPos = rows[headerEndIdx].index;
          const totalEndPos = rows[totalRowIdx].index + rows[totalRowIdx].xml.length;

          detailXml = detailXml.substring(0, dataStartPos) + newDataRowsXml + newTotalRow + detailXml.substring(totalEndPos);

          // Replace in document
          docXml = docXml.substring(0, tblStart) + detailXml + docXml.substring(tblEnd);
          console.log(`✅ Batch details table updated: ${data.batches?.length || 0} data rows`);
        }
      }
    }
  }

  // ── 4c. Update Remark Section ─────────────────────────────────
  // "Total XX Batches were manufactured during the review period."
  // NOTE: The text is split across multiple <w:t> elements, e.g.:
  //   "Total " | "0" | "4" | "Batches were m" | "anufactured" | "during the review period."
  // So we can't search for the full string. Instead, find the row that contains
  // "Remark:" and "review period" near the batch section.
  {
    // Find "review period" closest to our batch data (which is near "Details of Product")
    const detailsIdx = docXml.indexOf('Details of Product');
    if (detailsIdx !== -1) {
      // Look for "review period" within a few thousand chars after the batch details
      const searchStart = detailsIdx;
      const searchEnd = Math.min(docXml.length, detailsIdx + 30000);
      const searchChunk = docXml.substring(searchStart, searchEnd);
      const rpOffset = searchChunk.indexOf('review period');

      if (rpOffset !== -1) {
        const rpIdx = searchStart + rpOffset;
        console.log(`Found "review period" at index ${rpIdx}`);

        // Now find the table row (<w:tr>) containing this
        const beforeRP = docXml.substring(Math.max(0, rpIdx - 3000), rpIdx);
        const trStart = beforeRP.lastIndexOf('<w:tr');

        if (trStart !== -1) {
          const rowStart = Math.max(0, rpIdx - 3000) + trStart;
          const rowEnd = docXml.indexOf('</w:tr>', rpIdx) + 7;

          const rowXml = docXml.substring(rowStart, rowEnd);

          // This row contains "Remark:" + "Total XX Batches were manufactured..."
          // We need to find the cell containing "Total" and rebuild it
          // Find cells
          const cellRegex = /<w:tc\b[^>]*>[\s\S]*?<\/w:tc>/g;
          const cells: { xml: string; start: number; end: number }[] = [];
          let cellMatch;
          while ((cellMatch = cellRegex.exec(rowXml)) !== null) {
            cells.push({ xml: cellMatch[0], start: cellMatch.index, end: cellMatch.index + cellMatch[0].length });
          }

          // Find the cell containing "Total" (should be the second cell, after "Remark:")
          let targetCellIdx = -1;
          for (let i = 0; i < cells.length; i++) {
            if (cells[i].xml.includes('Total') && cells[i].xml.includes('review period')) {
              targetCellIdx = i;
              break;
            }
          }

          if (targetCellIdx !== -1) {
            const targetCell = cells[targetCellIdx];

            // Preserve tcPr, pPr, rPr
            const tcPr = targetCell.xml.match(/<w:tcPr>[\s\S]*?<\/w:tcPr>/)?.[0] || '';
            const pPr = targetCell.xml.match(/<w:pPr>[\s\S]*?<\/w:pPr>/)?.[0] || '';
            const rPr = targetCell.xml.match(/<w:rPr>[\s\S]*?<\/w:rPr>/)?.[0] || '';

            const newCell = `<w:tc>${tcPr}<w:p>${pPr}<w:r>${rPr}<w:t>Total ${data.total_batches} Batches were manufactured during the review period.</w:t></w:r></w:p></w:tc>`;

            // Replace just this cell within the row
            const newRow = rowXml.substring(0, targetCell.start) + newCell + rowXml.substring(targetCell.end);
            docXml = docXml.substring(0, rowStart) + newRow + docXml.substring(rowEnd);
            console.log('✅ Remark section updated');
          } else {
            console.warn('⚠️ Could not find target cell with "Total" in remark row');
          }
        }
      }
    }
  }

  // ── 5. Dynamic Material Vendor Details Table Generation ─────────
  if (data.materialVendorDetails && data.materialVendorDetails.length > 0) {
    // Find the table containing "Material Code" header
    const headerRegex = /<w:tr[^>]*>[\s\S]*?<w:t>Material Code<\/w:t>[\s\S]*?<\/w:tr>/;
    const headerMatch = docXml.match(headerRegex);

    if (headerMatch && headerMatch.index !== undefined) {
      const headerRowEndIndex = headerMatch.index + headerMatch[0].length;

      // Find the table end tag after the header to know where template rows end
      const tableEndRegex = /<\/w:tbl>/g;
      tableEndRegex.lastIndex = headerRowEndIndex;
      const tableEndMatch = tableEndRegex.exec(docXml);

      if (!tableEndMatch) {
        console.error('Could not find table end tag for Material Vendor Details');
      } else {
        const tableEndIndex = tableEndMatch.index;

        // Find ALL rows between header and table end (these are template rows to replace)
        const rowsRegex = /<w:tr[^>]*>[\s\S]*?<\/w:tr>/g;
        rowsRegex.lastIndex = headerRowEndIndex;

        let firstRowMatch = rowsRegex.exec(docXml);
        if (!firstRowMatch || firstRowMatch.index >= tableEndIndex) {
          console.error('No template row found after Material Vendor Details header');
        } else {
          const templateRow = firstRowMatch[0];
          const templateRowStartIndex = firstRowMatch.index;

          // Find where all template rows end (continue matching until we hit table end)
          let lastRowEndIndex = firstRowMatch.index + firstRowMatch[0].length;
          let nextRowMatch;

          while ((nextRowMatch = rowsRegex.exec(docXml)) !== null && nextRowMatch.index < tableEndIndex) {
            lastRowEndIndex = nextRowMatch.index + nextRowMatch[0].length;
          }

          console.log(`Replacing ${Math.floor((lastRowEndIndex - templateRowStartIndex) / templateRow.length)} template rows with ${data.materialVendorDetails.length} data rows`);

          // Generate new rows
          let newRowsXml = '';
          let rmPrevVendor: string | null = null;

          for (const item of data.materialVendorDetails) {
            let rowXml = templateRow;

            // 1. Sr No
            rowXml = replaceCellText(rowXml, 0, item.srNo.toString());
            // 2. Material Code
            rowXml = replaceCellText(rowXml, 1, xmlEscape(item.materialCode));
            // 3. Name of Material
            rowXml = replaceCellText(rowXml, 2, xmlEscape(item.materialName));
            // 4. AR Numbers (Multiple, stacked vertically with line breaks)
            const arNumbersText = item.arNumbers.join('<w:br/>');
            rowXml = replaceCellText(rowXml, 3, arNumbersText, true);
            // 5. Vendor — merge consecutive rows with the same vendor
            const effectiveVendor = (item.vendor || '').trim();
            let vendorMerge: 'restart' | 'continue';
            let vendorText: string;
            if (effectiveVendor === '') {
              vendorMerge = rmPrevVendor !== null ? 'continue' : 'restart';
              vendorText = '';
            } else if (effectiveVendor === rmPrevVendor) {
              vendorMerge = 'continue';
              vendorText = '';
            } else {
              vendorMerge = 'restart';
              vendorText = xmlEscape(effectiveVendor);
              rmPrevVendor = effectiveVendor;
            }
            rowXml = replaceCellText(rowXml, 4, vendorText, false, vendorMerge);

            newRowsXml += rowXml;
          }

          // Remove ALL template rows and insert our new rows
          // This preserves all content after the table
          docXml = docXml.substring(0, templateRowStartIndex) + newRowsXml + docXml.substring(lastRowEndIndex);
        }
      }
    }
  }

  // ── 6. Dynamic PPM Vendor Details Table Generation (Section 3.2) ─────────
  if (data.ppmVendorDetails && data.ppmVendorDetails.length > 0) {
    // Find the PPM table by locating the header row containing "Name of Approved"
    // that appears AFTER the first material vendor table (section 3.1).
    // We search for the SECOND occurrence of a table with "Material Code" header,
    // or look for the unique text "Primary Packing" or "Approved Vendor for Primary".

    // Strategy: find the row containing both "Material Code" and comes after
    // the first materialVendorDetails table. We use the index of the second
    // occurrence of a table header row with "Material Code".
    const headerSearchStr = 'Material Code';
    let searchFrom = 0;
    let occurrenceCount = 0;
    let ppmHeaderRowStart = -1;
    let ppmHeaderRowEnd = -1;

    // Find the second table that has a "Material Code" header row
    // (first is section 3.1 RM table, second is section 3.2 PPM table)
    const rowScanRegex = /<w:tr[^>]*>[\s\S]*?<\/w:tr>/g;
    let scanMatch;
    let foundFirstMaterialCodeTable = false;

    while ((scanMatch = rowScanRegex.exec(docXml)) !== null) {
      const rowText = scanMatch[0];
      if (rowText.includes(headerSearchStr)) {
        occurrenceCount++;
        if (occurrenceCount === 1) {
          // This is the section 3.1 header row — skip it
          foundFirstMaterialCodeTable = true;
          searchFrom = scanMatch.index + scanMatch[0].length;
        } else if (occurrenceCount === 2 && foundFirstMaterialCodeTable) {
          // This is the section 3.2 PPM header row
          ppmHeaderRowStart = scanMatch.index;
          ppmHeaderRowEnd = scanMatch.index + scanMatch[0].length;
          break;
        }
      }
    }

    if (ppmHeaderRowEnd === -1) {
      // Fallback: try to find by "Approved Vendor" text near "Primary"
      const approvedVendorIdx = docXml.indexOf('Approved Vendor', searchFrom);
      if (approvedVendorIdx !== -1) {
        const beforeAV = docXml.substring(Math.max(0, approvedVendorIdx - 3000), approvedVendorIdx);
        const trOffset = beforeAV.lastIndexOf('<w:tr');
        if (trOffset !== -1) {
          ppmHeaderRowStart = Math.max(0, approvedVendorIdx - 3000) + trOffset;
          const trEnd = docXml.indexOf('</w:tr>', ppmHeaderRowStart);
          ppmHeaderRowEnd = trEnd !== -1 ? trEnd + 7 : -1;
        }
      }
    }

    if (ppmHeaderRowEnd !== -1) {
      // Find the table end after the PPM header row
      const ppmTableEndRegex = /<\/w:tbl>/g;
      ppmTableEndRegex.lastIndex = ppmHeaderRowEnd;
      const ppmTableEndMatch = ppmTableEndRegex.exec(docXml);

      if (ppmTableEndMatch) {
        const ppmTableEndIndex = ppmTableEndMatch.index;

        // Find all template rows between header and table end
        const ppmRowsRegex = /<w:tr[^>]*>[\s\S]*?<\/w:tr>/g;
        ppmRowsRegex.lastIndex = ppmHeaderRowEnd;

        let ppmFirstRowMatch = ppmRowsRegex.exec(docXml);
        if (ppmFirstRowMatch && ppmFirstRowMatch.index < ppmTableEndIndex) {
          const ppmTemplateRow = ppmFirstRowMatch[0];
          const ppmTemplateRowStart = ppmFirstRowMatch.index;

          // Find where all template rows end
          let ppmLastRowEnd = ppmFirstRowMatch.index + ppmFirstRowMatch[0].length;
          let ppmNextRow;
          while ((ppmNextRow = ppmRowsRegex.exec(docXml)) !== null && ppmNextRow.index < ppmTableEndIndex) {
            ppmLastRowEnd = ppmNextRow.index + ppmNextRow[0].length;
          }

          console.log(`PPM table: replacing template rows with ${data.ppmVendorDetails.length} data rows`);

          // Generate new PPM rows
          let ppmNewRowsXml = '';
          let ppmPrevVendor: string | null = null;
          for (const item of data.ppmVendorDetails) {
            let rowXml = ppmTemplateRow;
            rowXml = replaceCellText(rowXml, 0, item.srNo.toString());
            rowXml = replaceCellText(rowXml, 1, xmlEscape(item.materialCode));
            rowXml = replaceCellText(rowXml, 2, xmlEscape(item.materialName));
            const arNumbersText = item.arNumbers.join('<w:br/>');
            rowXml = replaceCellText(rowXml, 3, arNumbersText, true);
            // Vendor — merge consecutive rows with the same vendor
            const ppmEffectiveVendor = (item.vendor || '').trim();
            let ppmVendorMerge: 'restart' | 'continue';
            let ppmVendorText: string;
            if (ppmEffectiveVendor === '') {
              ppmVendorMerge = ppmPrevVendor !== null ? 'continue' : 'restart';
              ppmVendorText = '';
            } else if (ppmEffectiveVendor === ppmPrevVendor) {
              ppmVendorMerge = 'continue';
              ppmVendorText = '';
            } else {
              ppmVendorMerge = 'restart';
              ppmVendorText = xmlEscape(ppmEffectiveVendor);
              ppmPrevVendor = ppmEffectiveVendor;
            }
            rowXml = replaceCellText(rowXml, 4, ppmVendorText, false, ppmVendorMerge);
            ppmNewRowsXml += rowXml;
          }

          // Replace template rows with new data rows
          docXml = docXml.substring(0, ppmTemplateRowStart) + ppmNewRowsXml + docXml.substring(ppmLastRowEnd);
          console.log('✅ PPM Vendor Details table (section 3.2) updated');
        } else {
          console.warn('⚠️ No template rows found in PPM table');
        }
      } else {
        console.warn('⚠️ Could not find PPM table end tag');
      }
    } else {
      console.warn('⚠️ Could not find PPM table header row (section 3.2)');
    }
  }

  // ── 7. Dynamic Secondary/Tertiary Packaging Details Table (Section 3.3) ──
  if (data.secondaryPackagingDetails && data.secondaryPackagingDetails.length > 0) {
    // Find table by header "Secondary" or "Tertiary"
    const secHeaderRegex = /<w:tr[^>]*>[\s\S]*?(Secondary|Tertiary)[\s\S]*?<\/w:tr>/i;
    // Actually the header is "Details of Secondary/ Tertiary Packaging material:" which is a TITLE row
    // The table header row likely contains "Material Code" and "Artwork Approved"

    // Better strategy: Find the table header row containing "Artwork Approved"
    const artHeaderRegex = /<w:tr[^>]*>[\s\S]*?Artwork Approved[\s\S]*?<\/w:tr>/;
    const artHeaderMatch = docXml.match(artHeaderRegex);

    if (artHeaderMatch && artHeaderMatch.index !== undefined) {
      const tableEndRegex = /<\/w:tbl>/g;
      tableEndRegex.lastIndex = artHeaderMatch.index + artHeaderMatch[0].length;
      const tableEndMatch = tableEndRegex.exec(docXml);

      if (tableEndMatch) {
        const tableEndIndex = tableEndMatch.index;
        const headerRowEnd = artHeaderMatch.index + artHeaderMatch[0].length;

        // Find template rows
        const rowsRegex = /<w:tr[^>]*>[\s\S]*?<\/w:tr>/g;
        rowsRegex.lastIndex = headerRowEnd;

        const firstRowMatch = rowsRegex.exec(docXml);
        if (firstRowMatch && firstRowMatch.index < tableEndIndex) {
          const templateRow = firstRowMatch[0];
          const templateRowStart = firstRowMatch.index;

          let lastRowEnd = firstRowMatch.index + firstRowMatch[0].length;
          let nextRow;
          while ((nextRow = rowsRegex.exec(docXml)) !== null && nextRow.index < tableEndIndex) {
            lastRowEnd = nextRow.index + nextRow[0].length;
          }

          console.log(`Secondary Pkg table: replacing template rows with ${data.secondaryPackagingDetails.length} data rows`);

          // Group items by their 2-character material code prefix (e.g. 2C, 21, 2L, 25)
          // No prefix grouping — each item is its own group (sequential Sr. No)
          const groupedItems = new Map<string, any[]>();
          for (const item of data.secondaryPackagingDetails) {
            groupedItems.set(item.materialCode, [item]);
          }
          let newRowsXml = '';

          // Sr. No is simply sequential — one number per material item, no grouping
          // Vendor merges across ALL consecutive rows with the same non-empty vendor
          let prevVendor: string | null = null;
          let currentSrNo = 1;

          for (const [, group] of groupedItems.entries()) {
            for (let i = 0; i < group.length; i++) {
              const item = group[i];
              let rowXml = templateRow;

              // Cell 0: Sr. No — one per row, no merging
              rowXml = replaceCellText(rowXml, 0, currentSrNo.toString());
              currentSrNo++;

              // Cell 1: Material Code
              rowXml = replaceCellText(rowXml, 1, xmlEscape(item.materialCode));

              // Cell 2: Material Name
              rowXml = replaceCellText(rowXml, 2, xmlEscape(item.materialName));

              // Cell 3: Vendor — merge consecutive rows with the same vendor.
              // Empty vendor strings are treated as a continuation of the previous
              // vendor's merge (so blank rows don't break a running merge chain).
              const effectiveVendor = (item.vendor || '').trim();
              let vendorMerge: 'restart' | 'continue';
              let vendorText: string;

              if (effectiveVendor === '') {
                // No vendor data — continue whatever merge was active
                vendorMerge = prevVendor !== null ? 'continue' : 'restart';
                vendorText = '';
              } else if (effectiveVendor === prevVendor) {
                // Same vendor as previous row — extend the merge
                vendorMerge = 'continue';
                vendorText = '';
              } else {
                // New vendor — start a fresh merge
                vendorMerge = 'restart';
                vendorText = xmlEscape(effectiveVendor);
                prevVendor = effectiveVendor;
              }

              rowXml = replaceCellText(rowXml, 3, vendorText, false, vendorMerge);

              // Cell 4: Artwork
              rowXml = replaceCellText(rowXml, 4, xmlEscape(item.artworkStatus));

              newRowsXml += rowXml;
            }
          }

          // Increment srNo is no longer needed (we use groupIdx + 1 directly above)

          docXml = docXml.substring(0, templateRowStart) + newRowsXml + docXml.substring(lastRowEnd);
          console.log('✅ Secondary/Tertiary Packaging table (section 3.3) updated');
        }
      }
    } else {
      console.warn('⚠️ Could not find Section 3.3 table header (Artwork Approved)');
    }
  }

  // ── 8. Dynamic Section 4.1 – Quantitative Formula: Raw Materials Table ──
  if (data.rawMaterialsData && data.rawMaterialsData.length > 0 && data.largestBatchSize > 0) {
    console.log(`\n📋 Section 4.1 Raw Materials: ${data.rawMaterialsData.length} rows, batch size: ${data.largestBatchSize} LTR`);

    // Find the table by locating the "THEO." column header (unique to this table)
    const theoIdx = docXml.indexOf('THEO.');
    if (theoIdx !== -1) {
      // Find the table bounds
      const beforeTheo = docXml.substring(Math.max(0, theoIdx - 5000), theoIdx);
      const tblStartOffset = beforeTheo.lastIndexOf('<w:tbl>');
      const tblStart = tblStartOffset !== -1 ? Math.max(0, theoIdx - 5000) + tblStartOffset : -1;

      const afterTheo = docXml.substring(theoIdx);
      const tblEndOffset = afterTheo.indexOf('</w:tbl>');
      const tblEnd = tblEndOffset !== -1 ? theoIdx + tblEndOffset + 8 : -1;

      if (tblStart !== -1 && tblEnd !== -1) {
        let rmTableXml = docXml.substring(tblStart, tblEnd);

        // ── 8a. Update "For Batch Size: X Litres" header ──
        const batchSizeHeaderIdx = rmTableXml.search(/For Batch Size/i);
        if (batchSizeHeaderIdx !== -1) {
          const beforeHeader = rmTableXml.substring(0, batchSizeHeaderIdx);
          const trStartOffset = beforeHeader.lastIndexOf('<w:tr');
          if (trStartOffset !== -1) {
            const trEnd = rmTableXml.indexOf('</w:tr>', batchSizeHeaderIdx) + 7;
            const headerRow = rmTableXml.substring(trStartOffset, trEnd);
            const trPr = headerRow.match(/<w:trPr>[\s\S]*?<\/w:trPr>/)?.[0] || '';
            const tcPr = headerRow.match(/<w:tcPr>[\s\S]*?<\/w:tcPr>/)?.[0] || '';
            const pPr = headerRow.match(/<w:pPr>[\s\S]*?<\/w:pPr>/)?.[0] || '';
            const rPr = headerRow.match(/<w:rPr>[\s\S]*?<\/w:rPr>/)?.[0] || '';
            const newHeaderRow = `<w:tr>${trPr}<w:tc>${tcPr}<w:p>${pPr}<w:r>${rPr}<w:t xml:space="preserve">For Batch Size: ${data.largestBatchSize} Litres</w:t></w:r></w:p></w:tc></w:tr>`;
            rmTableXml = rmTableXml.substring(0, trStartOffset) + newHeaderRow + rmTableXml.substring(trEnd);
            console.log(`  Updated "For Batch Size" header to ${data.largestBatchSize} Litres`);
          }
        }

        // ── 8b. Find column header row (contains "THEO.") and replace data rows ──
        const rowRegexRM = /<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/g;
        const allRowsRM: { xml: string; index: number }[] = [];
        let rowMatchRM;
        while ((rowMatchRM = rowRegexRM.exec(rmTableXml)) !== null) {
          allRowsRM.push({ xml: rowMatchRM[0], index: rowMatchRM.index });
        }

        let headerRowIdxRM = -1;
        for (let i = 0; i < allRowsRM.length; i++) {
          const texts: string[] = [];
          allRowsRM[i].xml.replace(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g, (_, t) => { texts.push(t); return _; });
          const combined = texts.join(' ');
          if (combined.includes('THEO.') || (combined.includes('MATERIAL') && combined.includes('CODE') && combined.includes('SR'))) {
            headerRowIdxRM = i;
            break;
          }
        }

        if (headerRowIdxRM === -1) {
          console.warn('Section 4.1: Could not find column header row (THEO.)');
        } else if (headerRowIdxRM + 1 < allRowsRM.length) {
          const templateDataRowRM = allRowsRM[headerRowIdxRM + 1].xml;
          const dataRowsStartRM = allRowsRM[headerRowIdxRM + 1].index;
          const lastRowRM = allRowsRM[allRowsRM.length - 1];
          const dataRowsEndRM = lastRowRM.index + lastRowRM.xml.length;

          let newDataRowsXmlRM = '';
          for (const row of data.rawMaterialsData) {
            let rowXml = templateDataRowRM;
            rowXml = replaceCellText(rowXml, 0, row.srNo.toString());
            rowXml = replaceCellText(rowXml, 1, xmlEscape(row.materialCode));
            rowXml = replaceCellText(rowXml, 2, xmlEscape(row.materialName));
            rowXml = replaceCellText(rowXml, 3, xmlEscape(row.spec || '-'));
            rowXml = replaceCellText(rowXml, 4, xmlEscape(row.theoQtyPerMl || 'Q.S'));
            rowXml = replaceCellText(rowXml, 5, xmlEscape(row.overagePercent || '-'));
            rowXml = replaceCellText(rowXml, 6, xmlEscape(row.actualQtyPerMl || 'Q.S'));
            const batchQtyDisplay = row.isPotencyEnabled ? `*${row.qtyRequiredPerBatch}` : row.qtyRequiredPerBatch;
            rowXml = replaceCellText(rowXml, 7, xmlEscape(batchQtyDisplay));
            newDataRowsXmlRM += rowXml;
          }

          rmTableXml = rmTableXml.substring(0, dataRowsStartRM) + newDataRowsXmlRM + rmTableXml.substring(dataRowsEndRM);
          docXml = docXml.substring(0, tblStart) + rmTableXml + docXml.substring(tblEnd);
          console.log(`  Section 4.1 table populated: ${data.rawMaterialsData.length} rows`);
        } else {
          console.warn('Section 4.1: No template data rows found after header row');
        }
      } else {
        console.warn('Section 4.1: Could not find table bounds');
      }
    } else {
      console.warn('Section 4.1: "THEO." not found in document — table not populated');
    }
  }

  // ── 9. Dynamic Section 4.2 – Quantitative Formula: Packing Materials Table ──
  // Find the EXISTING packing materials table (page 12) by its unique anchor
  // "QUANTITY REQUIRED" and replace its data rows in-place.
  if (data.packingMaterialsData && data.packingMaterialsData.length > 0 && data.largestBatchSize > 0) {
    console.log(`\n📋 Section 4.2 Packing Materials: ${data.packingMaterialsData.length} rows, batch size: ${data.largestBatchSize} LTR`);

    const qrIdx = docXml.indexOf('QUANTITY REQUIRED');
    if (qrIdx !== -1) {
      // Find table boundaries
      const beforeQR = docXml.substring(Math.max(0, qrIdx - 8000), qrIdx);
      const tblStartOffset = beforeQR.lastIndexOf('<w:tbl>');
      const tblStart = tblStartOffset !== -1 ? Math.max(0, qrIdx - 8000) + tblStartOffset : -1;

      const afterQR = docXml.substring(qrIdx);
      const tblEndOffset = afterQR.indexOf('</w:tbl>');
      const tblEnd = tblEndOffset !== -1 ? qrIdx + tblEndOffset + 8 : -1;

      if (tblStart !== -1 && tblEnd !== -1) {
        let pmTableXml = docXml.substring(tblStart, tblEnd);

        // ── 9a. Update "For Batch Size: X Litre" if present ──
        // The text "For Batch Size" may be outside the table (as a title paragraph)
        // but let's check inside the table area too
        const bsIdx = pmTableXml.search(/For[\s\S]*?Batch Size/i);
        if (bsIdx !== -1) {
          // Find the row containing it and update the batch size number
          pmTableXml = pmTableXml.replace(
            /(<w:t[^>]*>)(\d+)(<\/w:t>[\s\S]*?<w:t[^>]*>Litre)/,
            `$1${data.largestBatchSize}$3`
          );
          console.log(`  Updated batch size to ${data.largestBatchSize}`);
        }

        // Also update the "For Batch Size" text that appears BEFORE the table
        // (it might be in a separate row/paragraph above the table)
        const beforeTable = docXml.substring(Math.max(0, tblStart - 3000), tblStart);
        const bsBeforeIdx = beforeTable.lastIndexOf('Batch Size');
        if (bsBeforeIdx !== -1) {
          const bsAbsIdx = Math.max(0, tblStart - 3000) + bsBeforeIdx;
          // Find \"200\" or similar number near this text and replace
          const bsChunk = docXml.substring(bsAbsIdx - 200, bsAbsIdx + 200);
          const numMatch = bsChunk.match(/<w:t[^>]*>(\d+)<\/w:t>/);
          if (numMatch) {
            const oldNum = numMatch[1];
            const newChunk = bsChunk.replace(
              new RegExp(`(<w:t[^>]*>)${oldNum}(<\\/w:t>)`),
              `$1${data.largestBatchSize}$2`
            );
            docXml = docXml.substring(0, bsAbsIdx - 200) + newChunk + docXml.substring(bsAbsIdx + 200);
            // Re-extract table after docXml changed
            pmTableXml = docXml.substring(tblStart, tblEnd);
          }
        }

        // ── 9b. Find rows in the table ──
        const rowRegexPM = /<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/g;
        const allRowsPM: { xml: string; index: number }[] = [];
        let rowMatchPM;
        while ((rowMatchPM = rowRegexPM.exec(pmTableXml)) !== null) {
          allRowsPM.push({ xml: rowMatchPM[0], index: rowMatchPM.index });
        }

        console.log(`  Packing materials table: ${allRowsPM.length} rows found`);

        // Find the column header row (contains "QUANTITY REQUIRED")
        let colHeaderIdx = -1;
        for (let i = 0; i < allRowsPM.length; i++) {
          if (allRowsPM[i].xml.includes('QUANTITY REQUIRED')) {
            colHeaderIdx = i;
            break;
          }
        }

        if (colHeaderIdx === -1) {
          console.warn('Section 4.2: Could not find column header row');
        } else if (colHeaderIdx + 1 < allRowsPM.length) {
          // Template rows to use as patterns:
          // - Group header template: first row with gridSpan after column header (e.g. "FOR 5 ML")
          // - Data row template: first 5-cell row after column header (e.g. row with 2BLP05)
          let groupHeaderTemplate = '';
          let dataRowTemplate = '';

          for (let i = colHeaderIdx + 1; i < allRowsPM.length; i++) {
            const row = allRowsPM[i];
            if (row.xml.includes('gridSpan') && !groupHeaderTemplate) {
              groupHeaderTemplate = row.xml;
            } else if (!row.xml.includes('gridSpan') && !dataRowTemplate) {
              dataRowTemplate = row.xml;
            }
            if (groupHeaderTemplate && dataRowTemplate) break;
          }

          if (!dataRowTemplate) {
            console.warn('Section 4.2: Could not find template data row');
          } else {
            // Build new rows: group headers + data rows
            const dataStartPM = allRowsPM[colHeaderIdx + 1].index;
            const lastRowPM = allRowsPM[allRowsPM.length - 1];
            const dataEndPM = lastRowPM.index + lastRowPM.xml.length;

            let newRowsXml = '';
            let currentGroup = '';

            for (const row of data.packingMaterialsData) {
              // Insert group header if pack group changed
              if (row.packGroup !== currentGroup) {
                currentGroup = row.packGroup;
                if (groupHeaderTemplate) {
                  // Replace text in the group header template
                  let ghRow = groupHeaderTemplate;
                  // Replace all <w:t> content in the single cell with the group name
                  ghRow = ghRow.replace(
                    /(<w:t[^>]*>)[^<]*(<\/w:t>)/g,
                    (match, open, close, offset) => {
                      // Only replace the first meaningful text, set rest to empty
                      return `${open}${close}`;
                    }
                  );
                  // Now set the first <w:t> to the group name
                  let replaced = false;
                  ghRow = ghRow.replace(/<w:t([^>]*)><\/w:t>/g, (match, attrs) => {
                    if (!replaced) {
                      replaced = true;
                      return `<w:t${attrs}>${xmlEscape(row.packGroup)}</w:t>`;
                    }
                    return match;
                  });
                  newRowsXml += ghRow;
                }
              }

              // Data row — use template and replace cell contents
              let rowXml = dataRowTemplate;
              rowXml = replaceCellText(rowXml, 0, row.srNo.toString());
              rowXml = replaceCellText(rowXml, 1, xmlEscape(row.materialCode));
              rowXml = replaceCellText(rowXml, 2, xmlEscape(row.materialName));
              rowXml = replaceCellText(rowXml, 3, xmlEscape(row.qtyRequired));
              rowXml = replaceCellText(rowXml, 4, xmlEscape(row.excessPercent));
              newRowsXml += rowXml;
            }

            // Replace all template rows after column header with new data
            pmTableXml = pmTableXml.substring(0, dataStartPM) + newRowsXml + pmTableXml.substring(dataEndPM);
            docXml = docXml.substring(0, tblStart) + pmTableXml + docXml.substring(tblEnd);
            console.log(`  ✅ Section 4.2 table updated: ${data.packingMaterialsData.length} data rows`);
          }
        }
      } else {
        console.warn('Section 4.2: Could not find table bounds');
      }
    } else {
      console.warn('Section 4.2: "QUANTITY REQUIRED" not found — table not populated');
    }
  }

  // ── 10. Dynamic Section 5.1.1 – Batch Wise Active Raw Material Details ──
  // Track the end of 5.1.1 section in docXml so 5.1.2 search starts after it
  let section511EndIdx = 0;
  if (data.activeRawMaterialDetails && data.activeRawMaterialDetails.length > 0) {
    console.log(`\n📋 Section 5.1.1 Active Raw Materials: ${data.activeRawMaterialDetails.length} materials`);

    // Find the ACTUAL data table by its unique header text
    // The template has this table with static data — we need to REPLACE it
    const armTableAnchor = docXml.indexOf('Active Pharmaceutical Ingredients Used');
    if (armTableAnchor !== -1) {
      // Walk backwards from anchor to find the enclosing <w:tbl>
      const armTblStart = docXml.lastIndexOf('<w:tbl>', armTableAnchor);
      // Walk forward to find the closing </w:tbl>
      const armTblEnd = docXml.indexOf('</w:tbl>', armTableAnchor);

      if (armTblStart !== -1 && armTblEnd !== -1) {
        const armTblEndFull = armTblEnd + 8; // include </w:tbl>

        // Extract the original table to preserve its tblPr and tblGrid
        const originalTable = docXml.substring(armTblStart, armTblEndFull);
        const origTblPrMatch = originalTable.match(/<w:tblPr>[\s\S]*?<\/w:tblPr>/);
        const origTblGridMatch = originalTable.match(/<w:tblGrid>[\s\S]*?<\/w:tblGrid>/);

        // Use original tblPr/tblGrid if available, otherwise use sensible defaults
        const tblPr511 = origTblPrMatch ? origTblPrMatch[0]
          : '<w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:jc w:val="center"/><w:tblBorders>'
          + '<w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
          + '<w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
          + '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
          + '<w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
          + '<w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
          + '<w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
          + '</w:tblBorders></w:tblPr>';

        const tblGrid511 = origTblGridMatch ? origTblGridMatch[0]
          : '<w:tblGrid><w:gridCol w:w="700"/><w:gridCol w:w="2000"/>'
          + '<w:gridCol w:w="1000"/><w:gridCol w:w="1000"/><w:gridCol w:w="1000"/>'
          + '<w:gridCol w:w="2300"/><w:gridCol w:w="2000"/></w:tblGrid>';

        // Extract header rows from original table (first 2 rows contain headers)
        const origRows = [...originalTable.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)];
        const headerRow1 = origRows.length > 0 ? origRows[0][0] : '';
        const headerRow2 = origRows.length > 1 ? origRows[1][0] : '';

        // Helper to build a data cell (normal, centered)
        const dataCell511 = (text: string) => {
          return '<w:tc><w:tcPr>'
            + '<w:vAlign w:val="center"/>'
            + '</w:tcPr>'
            + '<w:p><w:pPr><w:spacing w:before="0"/><w:jc w:val="center"/>'
            + '<w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:pPr>'
            + '<w:r><w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>'
            + `<w:t xml:space="preserve">${xmlEscape(text)}</w:t>`
            + '</w:r></w:p></w:tc>';
        };

        // Helper for vertically merged cell (vMerge)
        const dataCellVM511 = (text: string, mergeType: 'restart' | 'continue') => {
          const mergeTag = mergeType === 'restart' ? '<w:vMerge w:val="restart"/>' : '<w:vMerge/>';
          return '<w:tc><w:tcPr>'
            + mergeTag
            + '<w:vAlign w:val="center"/>'
            + '</w:tcPr>'
            + '<w:p><w:pPr><w:spacing w:before="0"/><w:jc w:val="center"/>'
            + '<w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:pPr>'
            + (text
              ? '<w:r><w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>'
              + `<w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r>`
              : '')
            + '</w:p></w:tc>';
        };

        // Build data rows for each active material
        let dataRowsXml = '';
        for (const mat of data.activeRawMaterialDetails) {
          const receivedStr = mat.received.toString().padStart(2, '0');
          const releasedStr = mat.released.toString().padStart(2, '0');
          const rejectedStr = mat.rejected > 0 ? mat.rejected.toString().padStart(2, '0') : 'Nil';

          const rowCount = Math.max(mat.arEntries.length, 1);

          for (let r = 0; r < rowCount; r++) {
            const arEntry = mat.arEntries[r];
            const arNumber = arEntry?.arNumber || '';
            const batchNums = arEntry?.batchNumbers?.join(', ') || '';

            let rowXml = '<w:tr><w:trPr><w:jc w:val="center"/></w:trPr>';

            if (rowCount === 1) {
              rowXml += dataCell511(`${mat.srNo}.`);
              rowXml += dataCell511(mat.materialName);
              rowXml += dataCell511(receivedStr);
              rowXml += dataCell511(releasedStr);
              rowXml += dataCell511(rejectedStr);
              rowXml += dataCell511(arNumber);
              rowXml += dataCell511(batchNums);
            } else if (r === 0) {
              rowXml += dataCellVM511(`${mat.srNo}.`, 'restart');
              rowXml += dataCellVM511(mat.materialName, 'restart');
              rowXml += dataCellVM511(receivedStr, 'restart');
              rowXml += dataCellVM511(releasedStr, 'restart');
              rowXml += dataCellVM511(rejectedStr, 'restart');
              rowXml += dataCell511(arNumber);
              rowXml += dataCell511(batchNums);
            } else {
              rowXml += dataCellVM511('', 'continue');
              rowXml += dataCellVM511('', 'continue');
              rowXml += dataCellVM511('', 'continue');
              rowXml += dataCellVM511('', 'continue');
              rowXml += dataCellVM511('', 'continue');
              rowXml += dataCell511(arNumber);
              rowXml += dataCell511(batchNums);
            }

            rowXml += '</w:tr>';
            dataRowsXml += rowXml;
          }
        }

        // Build the replacement table (keep original headers, replace data rows)
        const replacementTable = '<w:tbl>' + tblPr511 + tblGrid511
          + headerRow1 + headerRow2
          + dataRowsXml
          + '</w:tbl>';

        // Replace the original table
        docXml = docXml.substring(0, armTblStart) + replacementTable + docXml.substring(armTblEndFull);
        section511EndIdx = armTblStart + replacementTable.length;
        console.log(`  ✅ Section 5.1.1 data table replaced: ${data.activeRawMaterialDetails.length} materials`);

        // Now find and replace the REMARK table (Table 14 — immediately after the data table)
        // It's a separate table that follows, identified by containing "Remark:" after our insertion point
        const remarkSearchStart = armTblStart + replacementTable.length;
        const remarkAnchorIdx = docXml.indexOf('Remark:', remarkSearchStart);
        if (remarkAnchorIdx !== -1 && (remarkAnchorIdx - remarkSearchStart) < 5000) {
          // Find the enclosing table
          const remarkTblStart = docXml.lastIndexOf('<w:tbl>', remarkAnchorIdx);
          const remarkTblEnd = docXml.indexOf('</w:tbl>', remarkAnchorIdx);

          if (remarkTblStart !== -1 && remarkTblEnd !== -1 && remarkTblStart > armTblStart) {
            const remarkTblEndFull = remarkTblEnd + 8;

            // Extract original remark table to preserve its tblPr
            const origRemarkTable = docXml.substring(remarkTblStart, remarkTblEndFull);
            const origRemarkTblPr = origRemarkTable.match(/<w:tblPr>[\s\S]*?<\/w:tblPr>/);
            const origRemarkTblGrid = origRemarkTable.match(/<w:tblGrid>[\s\S]*?<\/w:tblGrid>/);
            const remarkTblPr = origRemarkTblPr ? origRemarkTblPr[0] : '<w:tblPr><w:tblW w:w="5000" w:type="pct"/></w:tblPr>';
            const remarkTblGrid = origRemarkTblGrid ? origRemarkTblGrid[0] : '<w:tblGrid><w:gridCol w:w="10000"/></w:tblGrid>';

            // Extract Prepared By / Reviewed By row (last row) from original remark table
            const remarkOrigRows = [...origRemarkTable.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)];
            const signatureRow = remarkOrigRows.length > 1 ? remarkOrigRows[remarkOrigRows.length - 1][0] : '';

            // Build new remark content
            const allRemarks = data.activeRawMaterialDetails.map(m => m.remark).join(' ');
            const remarkContentRow = '<w:tr><w:tc><w:tcPr><w:gridSpan w:val="7"/>'
              + '<w:shd w:val="clear" w:color="auto" w:fill="D9D9D9"/>'
              + '</w:tcPr>'
              + '<w:p><w:pPr><w:rPr><w:b/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:pPr>'
              + '<w:r><w:rPr><w:b/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>'
              + '<w:t xml:space="preserve">Remark:</w:t></w:r></w:p>'
              + '<w:p><w:pPr><w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:pPr>'
              + '<w:r><w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>'
              + `<w:t xml:space="preserve">${xmlEscape(allRemarks)}</w:t></w:r></w:p>`
              + '</w:tc></w:tr>';

            const replacementRemark = '<w:tbl>' + remarkTblPr + remarkTblGrid
              + remarkContentRow + signatureRow + '</w:tbl>';

            docXml = docXml.substring(0, remarkTblStart) + replacementRemark + docXml.substring(remarkTblEndFull);
            section511EndIdx = remarkTblStart + replacementRemark.length;
            console.log(`  ✅ Section 5.1.1 remark table replaced`);
          }
        }
      } else {
        console.warn('Section 5.1.1: Could not find table bounds around "Active Pharmaceutical Ingredients Used"');
      }
    } else {
      console.warn('Section 5.1.1: "Active Pharmaceutical Ingredients Used" not found in template — table not populated');
    }
  }

  // ── 10b. Dynamic Section 5.1.2 – Active Raw Material Test Details ──
  {
    const rmTestMaterials = (data as any).activeRMTestDetails as RMTestMaterial512[] || [];
    console.log(`\n📋 Section 5.1.2 RM Test Details: ${rmTestMaterials.length} material(s)`);

    // Start search after the end of the 5.1.1 section to avoid matching
    // the material name that was inserted into the 5.1.1 data table.
    const searchFrom512 = section511EndIdx > 0 ? section511EndIdx : Math.floor(docXml.length * 0.3);

    for (const mat of rmTestMaterials) {
      // Find the material name placeholder in the document body.
      // Template uses "SODIUM HYALURONATE BP" as the placeholder.
      const placeholder512 = 'SODIUM HYALURONATE BP';
      let anchorIdx = docXml.indexOf(mat.materialName, searchFrom512);
      if (anchorIdx === -1) anchorIdx = docXml.indexOf(placeholder512, searchFrom512);
      if (anchorIdx === -1) {
        console.warn(`Section 5.1.2: Cannot find "${mat.materialName}" or placeholder in document body`);
        continue;
      }

      // Replace placeholder with actual material name (targeted to this occurrence only)
      if (docXml.substring(anchorIdx, anchorIdx + placeholder512.length) === placeholder512) {
        docXml = docXml.substring(0, anchorIdx)
          + xmlEscape(mat.materialName)
          + docXml.substring(anchorIdx + placeholder512.length);
      }

      // Find the <w:tbl> immediately after the anchor paragraph
      const nextTblIdx512 = docXml.indexOf('<w:tbl>', anchorIdx);
      if (nextTblIdx512 === -1 || (nextTblIdx512 - anchorIdx) > 5000) {
        console.warn(`Section 5.1.2: Cannot find table after material name for "${mat.materialName}"`);
        continue;
      }
      const tblEnd512 = docXml.indexOf('</w:tbl>', nextTblIdx512) + 8;
      const origTbl512 = docXml.substring(nextTblIdx512, tblEnd512);
      const origTblPr512 = origTbl512.match(/<w:tblPr>[\s\S]*?<\/w:tblPr>/)?.[0]
        || '<w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:jc w:val="center"/><w:tblBorders>'
        + '<w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
        + '<w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
        + '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
        + '<w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
        + '<w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
        + '<w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
        + '</w:tblBorders></w:tblPr>';
      // Dynamic grid: 4 base columns + N assay spec columns
      let tblGrid512 = '<w:tblGrid><w:gridCol w:w="2200"/><w:gridCol w:w="2500"/>'
        + '<w:gridCol w:w="1200"/><w:gridCol w:w="1200"/>';
      for (let _i = 0; _i < mat.assaySpecs.length; _i++) tblGrid512 += '<w:gridCol w:w="1200"/>';
      tblGrid512 += '</w:tblGrid>';

      // ── Cell builders ──
      // Shaded header cell (bold, centered)
      const hc512 = (text: string, vMergeRestart = false, vMergeCont = false, gs = 0): string => {
        const vm = vMergeRestart ? '<w:vMerge w:val="restart"/>' : (vMergeCont ? '<w:vMerge/>' : '');
        const gsp = gs > 1 ? `<w:gridSpan w:val="${gs}"/>` : '';
        return `<w:tc><w:tcPr>${vm}${gsp}<w:shd w:val="clear" w:color="auto" w:fill="D9D9D9"/><w:vAlign w:val="center"/></w:tcPr>`
          + `<w:p><w:pPr><w:spacing w:before="0"/><w:jc w:val="center"/>`
          + `<w:rPr><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:pPr>`
          + (text ? `<w:r><w:rPr><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>`
            + `<w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r>` : '')
          + `</w:p></w:tc>`;
      };

      // Data cell (not shaded)
      const dc512 = (text: string): string =>
        `<w:tc><w:tcPr><w:vAlign w:val="center"/></w:tcPr>`
        + `<w:p><w:pPr><w:spacing w:before="0"/><w:jc w:val="center"/>`
        + `<w:rPr><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:pPr>`
        + `<w:r><w:rPr><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>`
        + `<w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r></w:p></w:tc>`;

      // Stat cell (shaded, bold, optional gridSpan)
      const sc512 = (text: string, gs = 0): string => {
        const gsp = gs > 1 ? `<w:gridSpan w:val="${gs}"/>` : '';
        return `<w:tc><w:tcPr>${gsp}<w:shd w:val="clear" w:color="auto" w:fill="D9D9D9"/><w:vAlign w:val="center"/></w:tcPr>`
          + `<w:p><w:pPr><w:spacing w:before="0"/><w:jc w:val="center"/>`
          + `<w:rPr><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:pPr>`
          + `<w:r><w:rPr><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>`
          + `<w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r></w:p></w:tc>`;
      };

      const trOpen = `<w:tr><w:trPr><w:trHeight w:val="454"/><w:jc w:val="center"/></w:trPr>`;
      let rowsXml512 = '';

      // Helper: build the spec-section header label ("As Per IP & USP" when >1 spec, otherwise "As Per IP")
      const specHeaderSpan512 = mat.assaySpecs.length > 1
        ? mat.assaySpecs.map(s => `As Per ${s.specName}`).join(' & ')
        : mat.assaySpecs.length === 1 ? `As Per ${mat.assaySpecs[0].specName}` : 'Assay';

      // Row 0: Description (vMerge) | AR. Number (vMerge) | combined spec header (span=N) | individual spec headers
      rowsXml512 += trOpen
        + hc512('Description', true) + hc512('AR. Number', true)
        + hc512(specHeaderSpan512, false, false, Math.max(mat.assaySpecs.length, 1))
        + (mat.assaySpecs.length > 1 ? mat.assaySpecs.map(s => hc512(`As Per ${s.specName}`)).join('') : '')
        + '</w:tr>';
      // Row 1: vMerge cont ×2 | pH | Water (%) | Assay (%) per spec
      rowsXml512 += trOpen
        + hc512('', false, true) + hc512('', false, true)
        + hc512('pH') + hc512('Water (%)')
        + mat.assaySpecs.map(() => hc512('Assay (%)')).join('')
        + '</w:tr>';
      // Row 2: vMerge cont ×2 | phLimit | waterLimit | assay limit per spec
      rowsXml512 += trOpen
        + hc512('', false, true) + hc512('', false, true)
        + hc512(mat.phLimit) + hc512(mat.waterLimit)
        + mat.assaySpecs.map(s => hc512(s.limit)).join('')
        + '</w:tr>';

      // Data rows
      for (const row of mat.rows) {
        rowsXml512 += trOpen
          + dc512(row.description) + dc512(row.arNumber)
          + dc512(row.ph) + dc512(row.water)
          + mat.assaySpecs.map(s => dc512(row.assays[s.specName] || '')).join('')
          + '</w:tr>';
      }

      // Statistics
      const toNum512 = (s: string) => { const n = parseFloat(s); return isNaN(n) ? null : n; };
      const calcStats512 = (vals: number[]) => {
        if (vals.length === 0) return { min: 'N/A', max: 'N/A', avg: 'N/A', sd: 'N/A' };
        if (vals.length === 1) return { min: vals[0].toFixed(2), max: vals[0].toFixed(2), avg: vals[0].toFixed(2), sd: '0.00' };
        const min = Math.min(...vals);
        const max = Math.max(...vals);
        const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
        const sd = Math.sqrt(vals.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / (vals.length - 1));
        return { min: min.toFixed(2), max: max.toFixed(2), avg: avg.toFixed(2), sd: sd.toFixed(2) };
      };
      const phS = calcStats512(mat.rows.map(r => toNum512(r.ph)).filter((v): v is number => v !== null));
      const waterS = calcStats512(mat.rows.map(r => toNum512(r.water)).filter((v): v is number => v !== null));
      const statsBySpec512 = mat.assaySpecs.map(s =>
        calcStats512(mat.rows.map(r => toNum512(r.assays[s.specName] || '')).filter((v): v is number => v !== null))
      );

      const statRow512 = (label: string, ph: string, water: string, specVals: string[]) =>
        trOpen + sc512(label, 2) + sc512(ph) + sc512(water)
        + specVals.map(v => sc512(v)).join('') + '</w:tr>';

      rowsXml512 += statRow512('Minimum', phS.min, waterS.min, statsBySpec512.map(s => s.min));
      rowsXml512 += statRow512('Maximum', phS.max, waterS.max, statsBySpec512.map(s => s.max));
      rowsXml512 += statRow512('Average', phS.avg, waterS.avg, statsBySpec512.map(s => s.avg));
      rowsXml512 += statRow512('Standard Deviation', phS.sd, waterS.sd, statsBySpec512.map(s => s.sd));

      const replacement512 = '<w:tbl>' + origTblPr512 + tblGrid512 + rowsXml512 + '</w:tbl>';
      docXml = docXml.substring(0, nextTblIdx512) + replacement512 + docXml.substring(tblEnd512);
      console.log(`  ✅ Section 5.1.2 table replaced for "${mat.materialName}" (${mat.rows.length} AR rows)`);
    }
  }

  // ── 10b-ii. Trend Analysis Charts for Section 5.1.2 ──
  {
    const rmTestMaterials = (data as any).activeRMTestDetails as RMTestMaterial512[] || [];
    if (rmTestMaterials.length > 0) {
      const mat = rmTestMaterials[0]; // Template has one set of 3 charts
      const arNumbers = mat.rows.map((r: RMTestRow512) => r.arNumber);

      // ── helpers ──
      const parseNumVal = (s: string): number | null => {
        const m = s.replace(/[^0-9.-]/g, '');
        const n = parseFloat(m);
        return isNaN(n) ? null : n;
      };
      const parseLimit = (limitStr: string): { nlt?: number; nmt?: number } => {
        const s = (limitStr || '').toUpperCase().replace(/%/g, '').trim();
        const rangeM = s.match(/(\d+\.?\d*)\s+TO\s+(\d+\.?\d*)/);
        if (rangeM) return { nlt: parseFloat(rangeM[1]), nmt: parseFloat(rangeM[2]) };
        const nmtM = s.match(/NMT\s+(\d+\.?\d*)/);
        if (nmtM) {
          const nltM = s.match(/NLT\s+(\d+\.?\d*)/);
          return nltM ? { nlt: parseFloat(nltM[1]), nmt: parseFloat(nmtM[1]) } : { nmt: parseFloat(nmtM[1]) };
        }
        const nltM = s.match(/NLT\s+(\d+\.?\d*)/);
        if (nltM) return { nlt: parseFloat(nltM[1]) };
        return {};
      };

      const buildStrCacheXml = (vals: string[]) => {
        const pts = vals.map((v, i) => `<c:pt idx="${i}"><c:v>${xmlEscape(v)}</c:v></c:pt>`).join('');
        return `<c:strCache><c:ptCount val="${vals.length}"/>${pts}</c:strCache>`;
      };
      const buildNumCacheXml = (vals: number[]) => {
        const pts = vals.map((v, i) => `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`).join('');
        return `<c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${vals.length}"/>${pts}</c:numCache>`;
      };
      const buildSerNameXml = (name: string) =>
        `<c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>${xmlEscape(name)}</c:v></c:pt></c:strCache>`;

      // Replace ALL caches in a chart XML for the given series list
      // Each entry: { name, values (number[]) }; arNumbers is shared X-axis
      const updateChartXml = (chartXml: string, series: { name: string; values: number[] }[]): string => {
        let idx = 0;
        let res = chartXml.replace(/<c:ser>([\s\S]*?)<\/c:ser>/g, (match, content) => {
          if (idx >= series.length) return match;
          const sd = series[idx++];
          let updated = content;
          // series name cache
          updated = updated.replace(
            /(<c:tx>[\s\S]*?<c:strRef>[\s\S]*?)<c:strCache>[\s\S]*?<\/c:strCache>([\s\S]*?<\/c:strRef>[\s\S]*?<\/c:tx>)/,
            `$1${buildSerNameXml(sd.name)}$2`
          );
          // category cache
          updated = updated.replace(
            /(<c:cat>[\s\S]*?<c:strRef>[\s\S]*?)<c:strCache>[\s\S]*?<\/c:strCache>([\s\S]*?<\/c:strRef>[\s\S]*?<\/c:cat>)/,
            `$1${buildStrCacheXml(arNumbers)}$2`
          );
          // value cache
          updated = updated.replace(
            /(<c:val>[\s\S]*?<c:numRef>[\s\S]*?)<c:numCache>[\s\S]*?<\/c:numCache>([\s\S]*?<\/c:numRef>[\s\S]*?<\/c:val>)/,
            `$1${buildNumCacheXml(sd.values)}$2`
          );
          return `<c:ser>${updated}</c:ser>`;
        });

        // Remove hardcoded min/max limits from Value Axis to enable auto-scaling
        res = res.replace(/<c:scaling>([\s\S]*?)<\/c:scaling>/g, (match, content) => {
          const stripped = content.replace(/<c:min[^>]*\/>/g, '').replace(/<c:max[^>]*\/>/g, '');
          return `<c:scaling>${stripped}</c:scaling>`;
        });

        return res;
      };

      const limitLine = (limit: number | undefined, n: number): number[] =>
        Array(n).fill(limit ?? 0);

      const phLims = parseLimit(mat.phLimit);
      const waterLims = parseLimit(mat.waterLimit);
      const firstSpec512 = mat.assaySpecs[0]?.specName || '';
      const assayLims = parseLimit(mat.assaySpecs[0]?.limit || '');

      const phVals = mat.rows.map((r: RMTestRow512) => parseNumVal(r.ph) ?? 0);
      const waterVals = mat.rows.map((r: RMTestRow512) => parseNumVal(r.water) ?? 0);
      const assayVals = mat.rows.map((r: RMTestRow512) => parseNumVal(r.assays[firstSpec512] || '') ?? 0);
      const n = arNumbers.length;

      // chart1.xml → pH (3 series: actual, NLT, NMT)
      const chart1Xml = await zip.file('word/charts/chart1.xml')!.async('string');
      const phSeries: { name: string; values: number[] }[] = [
        { name: '% pH OF API', values: phVals },
        ...(phLims.nlt !== undefined ? [{ name: `NLT ${phLims.nlt}`, values: limitLine(phLims.nlt, n) }] : []),
        ...(phLims.nmt !== undefined ? [{ name: `NMT ${phLims.nmt}`, values: limitLine(phLims.nmt, n) }] : []),
      ];
      zip.file('word/charts/chart1.xml', updateChartXml(chart1Xml, phSeries));

      // chart2.xml → Water (2 series: actual, NMT only)
      const chart2Xml = await zip.file('word/charts/chart2.xml')!.async('string');
      const waterSeries: { name: string; values: number[] }[] = [
        { name: '% Water', values: waterVals },
        ...(waterLims.nmt !== undefined ? [{ name: `NMT ${waterLims.nmt}%`, values: limitLine(waterLims.nmt, n) }] : []),
      ];
      // Fix Y-axis label: template has "LOD OF API" but this chart tracks % Water
      const chart2Updated = updateChartXml(chart2Xml, waterSeries)
        .replace(/LOD OF API/g, '% WATER OF API');
      zip.file('word/charts/chart2.xml', chart2Updated);

      // chart3.xml → Assay (3 series: actual, NLT, NMT)
      const chart3Xml = await zip.file('word/charts/chart3.xml')!.async('string');
      const assaySeries: { name: string; values: number[] }[] = [
        { name: `% ASSAY OF ${mat.materialName}`, values: assayVals },
        ...(assayLims.nlt !== undefined ? [{ name: `NLT ${assayLims.nlt}%`, values: limitLine(assayLims.nlt, n) }] : []),
        ...(assayLims.nmt !== undefined ? [{ name: `NMT ${assayLims.nmt}%`, values: limitLine(assayLims.nmt, n) }] : []),
      ];
      zip.file('word/charts/chart3.xml', updateChartXml(chart3Xml, assaySeries));

      // ── Update all "Sodium Hyaluronate" placeholders in docXml ──
      // (chart titles, body paragraphs, table headers — 21 occurrences total)
      docXml = docXml.split('Sodium Hyaluronate').join(xmlEscape(mat.materialName));

      // ── Strip ALL "(As per BP):" parenthetical suffixes from document text ──
      // Uses a two-tier approach:
      //   Tier 1 – paragraph-scoped: for "Trend Analysis" paragraphs, aggressively strip all
      //            "(As per XYZ):" fragments even when they span 3+ separate <w:t> runs.
      //   Tier 2 – global single-node passes: catch any remaining occurrences elsewhere.

      // ── Tier 1: paragraph-level strip for "Trend Analysis" chart title paragraphs ──
      docXml = docXml.replace(
        /(<w:p\b[^>]*>)((?:(?!<\/w:p>)[\s\S])*?)(<\/w:p>)/g,
        (full: string, pOpen: string, body: string, pClose: string) => {
          // Combined visible text of this paragraph
          const combinedText = (body.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [])
            .map(t => t.replace(/<[^>]+>/g, '')).join('');
          // Only process chart-title paragraphs
          if (!combinedText.trim().startsWith('Trend Analysis')) return full;

          let b = body;

          // (a) Strip full "(As per XYZ):" sitting within a single <w:t> (with text before/after)
          b = b.replace(
            /(<w:t[^>]*>)([^<]*?)\s*:?\s*\(?\s*As per\s+[A-Z][A-Z/]*\s*\)?\s*:?\s*([^<]*?)(<\/w:t>)/g,
            (_: string, wOpen: string, before: string, after: string, wClose: string) => {
              const text = (before + after).replace(/\s*:\s*$/, '').trimEnd();
              return `${wOpen}${text ? text + ':' : ''}${wClose}`;
            }
          );

          // (b) Entire <w:t> is "(As per XYZ):"
          b = b.replace(
            /(<w:t[^>]*>)\s*:?\s*\(?\s*As per\s+[A-Z][A-Z/]*\s*\)?\s*:?\s*(<\/w:t>)/g,
            '$1$2'
          );

          // (c) <w:t> ends with "(As per " (pharmacopoeia in the next run)
          b = b.replace(
            /(<w:t[^>]*>)([^<]*?)\s*:?\s*\(\s*As per\s*(<\/w:t>)/g,
            (_: string, wOpen: string, before: string, wClose: string) => `${wOpen}${before.trimEnd()}${wClose}`
          );

          // (d) Entire <w:t> is "As per " (stripped of its surrounding parens by a prior pass)
          b = b.replace(/(<w:t[^>]*>)\s*As per\s*(<\/w:t>)/g, '$1$2');

          // (e) Orphaned pharmacopoeia codes: "BP):", "BP)", "BP", "IP/USP):", "IP/USP" etc.
          //     Safe here because scope is limited to "Trend Analysis" paragraphs.
          b = b.replace(
            /(<w:t[^>]*>)\s*(?:IP|BP|USP|NF|EP|IH|JP|CP)(?:\/(?:IP|BP|USP|NF|EP|IH|JP|CP))*\s*\)?\s*:?\s*(<\/w:t>)/g,
            '$1$2'
          );

          // (f) Orphaned "):" or ")" nodes
          b = b.replace(/(<w:t[^>]*>)\s*\)\s*:?\s*(<\/w:t>)/g, '$1$2');

          // (g) Trailing dangling "(" left in a <w:t>: "...text: (" → "...text:"
          b = b.replace(
            /(<w:t[^>]*>)([^<]*?)\s*:\s*\(\s*(<\/w:t>)/g,
            (_: string, wOpen: string, before: string, wClose: string) => `${wOpen}${before.trimEnd()}:${wClose}`
          );

          // (h) <w:t> that is ONLY "("
          b = b.replace(/(<w:t[^>]*>)\s*\(\s*(<\/w:t>)/g, '$1$2');

          return pOpen + b + pClose;
        }
      );

      // ── Tier 2: global single-node passes for any remaining "(As per XYZ):" elsewhere ──

      // Pass 1: strip when full "(As per XYZ):" sits inside one <w:t> node
      docXml = docXml.replace(
        /(<w:t[^>]*>)([^<]*)\s*:?\s*\(?\s*As per\s+[A-Z][A-Z/]*\s*\)?\s*:?\s*([^<]*)(<\/w:t>)/g,
        (_: string, open: string, before: string, after: string, close: string) => {
          const cleaned = (before + after).replace(/\s*:\s*$/, '').trimEnd();
          return `${open}${cleaned ? cleaned + ':' : ''}${close}`;
        }
      );

      // Pass 2: strip <w:t> nodes whose SOLE content is an "As per XYZ" fragment
      docXml = docXml.replace(
        /(<w:t[^>]*>)\s*:?\s*\(?\s*As per\s+[A-Z][A-Z/]*\s*\)?\s*:?\s*(<\/w:t>)/g,
        '$1$2'
      );

      // Pass 3: strip dangling "(As per " (pharmacopoeia in next run)
      docXml = docXml.replace(
        /(<w:t[^>]*>)([^<]*)\s*:?\s*\(\s*As per\s*(<\/w:t>)/g,
        '$1$2$3'
      );

      // Pass 4: strip orphaned "BP):" / "IP/USP):" closing fragments left by Pass 3
      docXml = docXml.replace(
        /(<w:t[^>]*>)\s*(?:IP|BP|USP|NF|EP|IH|JP|CP)(?:\/(?:IP|BP|USP|NF|EP|IH|JP|CP))*\s*\)\s*:?\s*(<\/w:t>)/g,
        '$1$2'
      );

      // Pass 5: strip lone "):" nodes
      docXml = docXml.replace(
        /(<w:t[^>]*>)\s*\)\s*:?\s*(<\/w:t>)/g,
        '$1$2'
      );


      console.log(`  ✅ Section 5.1.2 charts updated for "${mat.materialName}" (${n} AR points)`);
    }
  }

  // ── 10c. Dynamic Section 5.2.1 – Batch Wise Primary Packing Material Details ──
  if (data.primaryPackingMaterialDetails && data.primaryPackingMaterialDetails.length > 0) {
    console.log(`\n📋 Section 5.2.1 Primary Packing Materials: ${data.primaryPackingMaterialDetails.length} materials`);

    // Find the ACTUAL data table by its unique header text
    const ppmTableAnchor = docXml.indexOf('Primary Packing Material Used');
    if (ppmTableAnchor !== -1) {
      const ppmTblStart = docXml.lastIndexOf('<w:tbl>', ppmTableAnchor);
      const ppmTblEnd = docXml.indexOf('</w:tbl>', ppmTableAnchor);

      if (ppmTblStart !== -1 && ppmTblEnd !== -1) {
        const ppmTblEndFull = ppmTblEnd + 8;

        // Extract original table to preserve tblPr, tblGrid, header rows
        const origPpmTable = docXml.substring(ppmTblStart, ppmTblEndFull);
        const origPpmTblPr = origPpmTable.match(/<w:tblPr>[\s\S]*?<\/w:tblPr>/);
        const origPpmTblGrid = origPpmTable.match(/<w:tblGrid>[\s\S]*?<\/w:tblGrid>/);

        const ppmTblPr = origPpmTblPr ? origPpmTblPr[0]
          : '<w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:jc w:val="center"/><w:tblBorders>'
          + '<w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
          + '<w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
          + '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
          + '<w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
          + '<w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
          + '<w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
          + '</w:tblBorders></w:tblPr>';

        const ppmTblGrid = origPpmTblGrid ? origPpmTblGrid[0]
          : '<w:tblGrid><w:gridCol w:w="700"/><w:gridCol w:w="2000"/>'
          + '<w:gridCol w:w="2300"/><w:gridCol w:w="1000"/><w:gridCol w:w="1000"/>'
          + '<w:gridCol w:w="1000"/><w:gridCol w:w="2000"/></w:tblGrid>';

        // Extract header rows (first 2 rows)
        const origPpmRows = [...origPpmTable.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)];
        const ppmHeaderRow1 = origPpmRows.length > 0 ? origPpmRows[0][0] : '';
        const ppmHeaderRow2 = origPpmRows.length > 1 ? origPpmRows[1][0] : '';

        // Helper to build a data cell
        const dataCell521 = (text: string) => {
          return '<w:tc><w:tcPr>'
            + '<w:vAlign w:val="center"/>'
            + '</w:tcPr>'
            + '<w:p><w:pPr><w:spacing w:before="0"/><w:jc w:val="center"/>'
            + '<w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:pPr>'
            + '<w:r><w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>'
            + `<w:t xml:space="preserve">${xmlEscape(text)}</w:t>`
            + '</w:r></w:p></w:tc>';
        };

        // Helper for vertically merged cell
        const dataCellVM521 = (text: string, mergeType: 'restart' | 'continue') => {
          const mergeTag = mergeType === 'restart' ? '<w:vMerge w:val="restart"/>' : '<w:vMerge/>';
          return '<w:tc><w:tcPr>'
            + mergeTag
            + '<w:vAlign w:val="center"/>'
            + '</w:tcPr>'
            + '<w:p><w:pPr><w:spacing w:before="0"/><w:jc w:val="center"/>'
            + '<w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:pPr>'
            + (text
              ? '<w:r><w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>'
              + `<w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r>`
              : '')
            + '</w:p></w:tc>';
        };

        // Build data rows — table columns:
        // SR.NO. | Primary Packing Material Used | A.R. Number | Received | Released | Rejected | Used for Batch Number
        let ppmDataRowsXml = '';
        for (const mat of data.primaryPackingMaterialDetails) {
          const receivedStr = mat.received.toString();
          const releasedStr = mat.released.toString();
          const rejectedStr = mat.rejected > 0 ? mat.rejected.toString() : 'NIL';

          const rowCount = Math.max(mat.arEntries.length, 1);

          for (let r = 0; r < rowCount; r++) {
            const arEntry = mat.arEntries[r];
            const arNumber = arEntry?.arNumber || '';
            const batchNums = arEntry?.batchNumbers?.join(', ') || '';

            let rowXml = '<w:tr><w:trPr><w:jc w:val="center"/></w:trPr>';

            if (rowCount === 1) {
              rowXml += dataCell521(`${mat.srNo}.`);
              rowXml += dataCell521(mat.materialName);
              rowXml += dataCell521(arNumber);
              rowXml += dataCell521(receivedStr);
              rowXml += dataCell521(releasedStr);
              rowXml += dataCell521(rejectedStr);
              rowXml += dataCell521(batchNums);
            } else if (r === 0) {
              rowXml += dataCellVM521(`${mat.srNo}.`, 'restart');
              rowXml += dataCellVM521(mat.materialName, 'restart');
              rowXml += dataCell521(arNumber);
              rowXml += dataCellVM521(receivedStr, 'restart');
              rowXml += dataCellVM521(releasedStr, 'restart');
              rowXml += dataCellVM521(rejectedStr, 'restart');
              rowXml += dataCell521(batchNums);
            } else {
              rowXml += dataCellVM521('', 'continue');
              rowXml += dataCellVM521('', 'continue');
              rowXml += dataCell521(arNumber);
              rowXml += dataCellVM521('', 'continue');
              rowXml += dataCellVM521('', 'continue');
              rowXml += dataCellVM521('', 'continue');
              rowXml += dataCell521(batchNums);
            }

            rowXml += '</w:tr>';
            ppmDataRowsXml += rowXml;
          }
        }

        // Build replacement table (preserve headers, replace data)
        const replacementPpmTable = '<w:tbl>' + ppmTblPr + ppmTblGrid
          + ppmHeaderRow1 + ppmHeaderRow2
          + ppmDataRowsXml
          + '</w:tbl>';

        docXml = docXml.substring(0, ppmTblStart) + replacementPpmTable + docXml.substring(ppmTblEndFull);
        console.log(`  ✅ Section 5.2.1 data table replaced: ${data.primaryPackingMaterialDetails.length} materials`);

        // Replace the REMARK table (Table 20 — immediately after)
        const ppmRemarkSearchStart = ppmTblStart + replacementPpmTable.length;
        const ppmRemarkAnchorIdx = docXml.indexOf('Remark:', ppmRemarkSearchStart);
        if (ppmRemarkAnchorIdx !== -1 && (ppmRemarkAnchorIdx - ppmRemarkSearchStart) < 5000) {
          const ppmRemarkTblStart = docXml.lastIndexOf('<w:tbl>', ppmRemarkAnchorIdx);
          const ppmRemarkTblEnd = docXml.indexOf('</w:tbl>', ppmRemarkAnchorIdx);

          if (ppmRemarkTblStart !== -1 && ppmRemarkTblEnd !== -1 && ppmRemarkTblStart > ppmTblStart) {
            const ppmRemarkTblEndFull = ppmRemarkTblEnd + 8;

            const origPpmRemarkTable = docXml.substring(ppmRemarkTblStart, ppmRemarkTblEndFull);
            const origPpmRemarkTblPr = origPpmRemarkTable.match(/<w:tblPr>[\s\S]*?<\/w:tblPr>/);
            const origPpmRemarkTblGrid = origPpmRemarkTable.match(/<w:tblGrid>[\s\S]*?<\/w:tblGrid>/);
            const ppmRemarkTblPr = origPpmRemarkTblPr ? origPpmRemarkTblPr[0] : '<w:tblPr><w:tblW w:w="5000" w:type="pct"/></w:tblPr>';
            const ppmRemarkTblGrid = origPpmRemarkTblGrid ? origPpmRemarkTblGrid[0] : '<w:tblGrid><w:gridCol w:w="10000"/></w:tblGrid>';

            // Extract Prepared By / Reviewed By row (last row)
            const ppmRemarkOrigRows = [...origPpmRemarkTable.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)];
            const ppmSignatureRow = ppmRemarkOrigRows.length > 1 ? ppmRemarkOrigRows[ppmRemarkOrigRows.length - 1][0] : '';

            // Build combined remark
            const totalReceived = data.primaryPackingMaterialDetails.reduce((s: number, m: any) => s + m.received, 0);
            const totalRejected = data.primaryPackingMaterialDetails.reduce((s: number, m: any) => s + m.rejected, 0);
            const remarkText = totalRejected > 0
              ? `Total ${totalReceived} Consignments received of different primary packing materials. ${totalRejected} consignment(s) were rejected during the review period.`
              : `Total ${totalReceived} Consignments received of different primary packing materials. No consignment was rejected during the review period.`;

            const ppmRemarkContentRow = '<w:tr><w:tc><w:tcPr><w:gridSpan w:val="7"/>'
              + '<w:shd w:val="clear" w:color="auto" w:fill="D9D9D9"/>'
              + '</w:tcPr>'
              + '<w:p><w:pPr><w:rPr><w:b/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:pPr>'
              + '<w:r><w:rPr><w:b/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>'
              + '<w:t xml:space="preserve">Remark:</w:t></w:r></w:p>'
              + '<w:p><w:pPr><w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:pPr>'
              + '<w:r><w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>'
              + `<w:t xml:space="preserve">${xmlEscape(remarkText)}</w:t></w:r></w:p>`
              + '</w:tc></w:tr>';

            const replacementPpmRemark = '<w:tbl>' + ppmRemarkTblPr + ppmRemarkTblGrid
              + ppmRemarkContentRow + ppmSignatureRow + '</w:tbl>';

            docXml = docXml.substring(0, ppmRemarkTblStart) + replacementPpmRemark + docXml.substring(ppmRemarkTblEndFull);
            console.log(`  ✅ Section 5.2.1 remark table replaced`);
          }
        }
      } else {
        console.warn('Section 5.2.1: Could not find table bounds around "Primary Packing Material Used"');
      }
    } else {
      console.warn('Section 5.2.1: "Primary Packing Material Used" not found in template — table not populated');
    }
  }

  // ── 11. Dynamic Section 5.3.1 – In-Process Analysis Results at Bulk Stage ──
  let bulk531SectionEnd = -1;
  if (data.bulkInProcessData && data.bulkInProcessData.length > 0) {
    console.log(`\n📋 Section 5.3.1 Bulk In-Process: ${data.bulkInProcessData.length} rows`);

    const hdr = data.bulkInProcessHeader || {};
    const assayCols: { compound: string; limit: string }[] = hdr.assayColumns || [];
    // Total columns: Batch Number + AR Number + Description + pH + N assay columns
    const totalCols = 4 + assayCols.length;
    // "Critical Parameters" spans: Description + pH + N assay = 2 + N
    const critParamSpan = 2 + assayCols.length;

    // Find the section 5.3.1 table by its unique header text "Critical Parameters"
    const critParamIdx = docXml.indexOf('Critical Parameters');
    if (critParamIdx !== -1) {
      const tblStart531 = docXml.lastIndexOf('<w:tbl>', critParamIdx);
      const afterTblStart = docXml.substring(tblStart531);
      const tblEndOffset531 = afterTblStart.indexOf('</w:tbl>');

      if (tblStart531 !== -1 && tblEndOffset531 !== -1) {
        const tblEnd531 = tblStart531 + tblEndOffset531 + 8;
        const origTable531 = docXml.substring(tblStart531, tblEnd531);

        // Preserve original table properties
        const origTblPr531 = origTable531.match(/<w:tblPr>[\s\S]*?<\/w:tblPr>/)?.[0]
          || '<w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:jc w:val="center"/><w:tblBorders>'
          + '<w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
          + '<w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
          + '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
          + '<w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
          + '<w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
          + '<w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
          + '</w:tblBorders></w:tblPr>';

        // Build dynamic grid: Batch(1500) + AR(1800) + Desc(3200) + pH(1200) + N assay cols (1800 each)
        let dynTblGrid531 = '<w:tblGrid><w:gridCol w:w="1500"/><w:gridCol w:w="1800"/>'
          + '<w:gridCol w:w="3200"/><w:gridCol w:w="1200"/>';
        for (let i = 0; i < assayCols.length; i++) {
          dynTblGrid531 += '<w:gridCol w:w="1800"/>';
        }
        dynTblGrid531 += '</w:tblGrid>';

        // Helper: bold header cell (shaded, centered)
        const headerCell531 = (text: string, opts?: { vMerge?: 'restart' | 'continue'; gridSpan?: number }) => {
          let tcPrInner = '<w:shd w:val="clear" w:color="auto" w:fill="D9D9D9"/><w:vAlign w:val="center"/>';
          if (opts?.vMerge === 'restart') tcPrInner = '<w:vMerge w:val="restart"/>' + tcPrInner;
          else if (opts?.vMerge === 'continue') tcPrInner = '<w:vMerge/>' + tcPrInner;
          if (opts?.gridSpan) tcPrInner += `<w:gridSpan w:val="${opts.gridSpan}"/>`;
          const rPr = '<w:rPr><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>';
          const pPr = '<w:pPr><w:spacing w:before="0"/><w:jc w:val="center"/>' + rPr + '</w:pPr>';
          return '<w:tc><w:tcPr>' + tcPrInner + '</w:tcPr>'
            + '<w:p>' + pPr
            + (text ? '<w:r>' + rPr + `<w:t xml:space="preserve">${text}</w:t></w:r>` : '')
            + '</w:p></w:tc>';
        };

        // Row 0: "Batch Number" (vMerge) | "AR. Number" (vMerge) | "Critical Parameters (Limit)" (gridSpan = critParamSpan)
        const dynHeaderRow1 = '<w:tr><w:trPr><w:trHeight w:val="432"/><w:jc w:val="center"/></w:trPr>'
          + headerCell531('Batch Number', { vMerge: 'restart' })
          + headerCell531('AR. Number', { vMerge: 'restart' })
          + headerCell531('Critical Parameters (Limit)', { gridSpan: critParamSpan })
          + '</w:tr>';

        // Row 1: "" (vMerge cont) | "" (vMerge cont) | "Description: {limit}" | "pH ({limit})" | one cell per assay compound
        let dynHeaderRow2 = '<w:tr><w:trPr><w:trHeight w:val="432"/><w:jc w:val="center"/></w:trPr>'
          + headerCell531('', { vMerge: 'continue' })
          + headerCell531('', { vMerge: 'continue' })
          + headerCell531(`Description: ${xmlEscape(hdr.descriptionLimit || '')}`)
          + headerCell531(`pH (${xmlEscape(hdr.phLimit || '')})`);
        for (const col of assayCols) {
          dynHeaderRow2 += headerCell531(`Assay (%) ${xmlEscape(col.compound)} (${xmlEscape(col.limit)})`);
        }
        dynHeaderRow2 += '</w:tr>';

        // Find the remark table (separate table after this data table)
        let remarkTable531Xml = '';
        const remarkSearchStart531 = tblEnd531;
        const remarkAnchorIdx531 = docXml.indexOf('Remark:', remarkSearchStart531);
        let remarkTblStart531 = -1;
        let remarkTblEndFull531 = -1;

        if (remarkAnchorIdx531 !== -1 && (remarkAnchorIdx531 - remarkSearchStart531) < 5000) {
          remarkTblStart531 = docXml.lastIndexOf('<w:tbl>', remarkAnchorIdx531);
          const remarkTblEnd531 = docXml.indexOf('</w:tbl>', remarkAnchorIdx531);
          if (remarkTblStart531 !== -1 && remarkTblEnd531 !== -1 && remarkTblStart531 > tblStart531) {
            remarkTblEndFull531 = remarkTblEnd531 + 8;
            const origRemarkTable531 = docXml.substring(remarkTblStart531, remarkTblEndFull531);
            const remarkTblPr531 = origRemarkTable531.match(/<w:tblPr>[\s\S]*?<\/w:tblPr>/)?.[0]
              || '<w:tblPr><w:tblW w:w="5000" w:type="pct"/></w:tblPr>';
            const remarkTblGrid531 = origRemarkTable531.match(/<w:tblGrid>[\s\S]*?<\/w:tblGrid>/)?.[0]
              || '<w:tblGrid><w:gridCol w:w="10000"/></w:tblGrid>';

            // Extract signature row (Prepared By QA / Reviewed By QA - last row)
            const remarkOrigRows531 = [...origRemarkTable531.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)];
            const signatureRow531 = remarkOrigRows531.length > 1 ? remarkOrigRows531[remarkOrigRows531.length - 1][0] : '';

            // Build remark text
            const remarkText531 = `In-process parameters at bulk stage for ${xmlEscape(data.product_name)} found (Satisfactory) within the limit as per in-process specification during the review period.`;

            const remarkContentRow531 = `<w:tr><w:tc><w:tcPr><w:gridSpan w:val="${totalCols}"/>`
              + '<w:shd w:val="clear" w:color="auto" w:fill="D9D9D9"/>'
              + '</w:tcPr>'
              + '<w:p><w:pPr><w:rPr><w:b/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:pPr>'
              + '<w:r><w:rPr><w:b/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>'
              + '<w:t xml:space="preserve">Remark:</w:t></w:r></w:p>'
              + '<w:p><w:pPr><w:rPr><w:b/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:pPr>'
              + '<w:r><w:rPr><w:b/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>'
              + `<w:t xml:space="preserve">${remarkText531}</w:t></w:r></w:p>`
              + '</w:tc></w:tr>';

            remarkTable531Xml = '<w:tbl>' + remarkTblPr531 + remarkTblGrid531
              + remarkContentRow531 + signatureRow531 + '</w:tbl>';
          }
        }

        // Helper to build a data cell (centered, size 20)
        const dataCell531 = (text: string) => {
          return '<w:tc><w:tcPr>'
            + '<w:vAlign w:val="center"/>'
            + '</w:tcPr>'
            + '<w:p><w:pPr><w:spacing w:before="0"/><w:jc w:val="center"/>'
            + '<w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:pPr>'
            + '<w:r><w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>'
            + `<w:t xml:space="preserve">${xmlEscape(text)}</w:t>`
            + '</w:r></w:p></w:tc>';
        };

        // Build data rows with dynamic assay columns
        let dataRows531Xml = '';
        for (const row of data.bulkInProcessData) {
          dataRows531Xml += '<w:tr><w:trPr><w:jc w:val="center"/></w:trPr>';
          dataRows531Xml += dataCell531(row.batchNumber);
          dataRows531Xml += dataCell531(row.arNumber);
          dataRows531Xml += dataCell531(row.description);
          dataRows531Xml += dataCell531(row.ph);
          // Emit one cell per assay column
          if (row.assays && row.assays.length > 0) {
            for (const a of row.assays) {
              dataRows531Xml += dataCell531(a.value);
            }
          } else {
            // Fallback: single assay (backward compat)
            dataRows531Xml += dataCell531(row.assay);
          }
          dataRows531Xml += '</w:tr>';
        }

        // Build replacement data table with DYNAMIC headers and grid
        const replacementTable531 = '<w:tbl>' + origTblPr531 + dynTblGrid531
          + dynHeaderRow1 + dynHeaderRow2
          + dataRows531Xml
          + '</w:tbl>';

        // Replace: data table + remark table (if found)
        if (remarkTblEndFull531 !== -1) {
          docXml = docXml.substring(0, tblStart531) + replacementTable531 + remarkTable531Xml + docXml.substring(remarkTblEndFull531);
          bulk531SectionEnd = tblStart531 + replacementTable531.length + remarkTable531Xml.length;
          console.log(`  ✅ Section 5.3.1 data table + remark table replaced (${totalCols} columns, ${assayCols.length} assay col(s))`);
        } else {
          docXml = docXml.substring(0, tblStart531) + replacementTable531 + docXml.substring(tblEnd531);
          bulk531SectionEnd = tblStart531 + replacementTable531.length;
          console.log(`  ✅ Section 5.3.1 data table replaced (${totalCols} columns, remark table not found)`);
        }
      } else {
        console.warn('Section 5.3.1: Could not find table bounds around "Critical Parameters"');
      }
    } else {
      console.warn('Section 5.3.1: "Critical Parameters" not found in template — table not populated');

    }

    // ── 11b. Dynamic Process Capability & Performance Parameters (Cp, Cpk, Pp, Ppk) ──
    // FIXED: Replace the ENTIRE table including the title row, not just the data rows.
    // This prevents stale header/title rows from a previous product bleeding into the new table.
    let cpkTblStart = -1;
    let cpkTblEndFull = -1;
    let origCpkTable = '';
    {
      // ── Positional search: find CPK table right after 5.3.1 section ──
      // Anchor-text search fails when text is split across multiple <w:t> elements.
      const cpkSearchFrom = bulk531SectionEnd > 0
        ? bulk531SectionEnd
        : docXml.indexOf('Critical Parameters');
      const cpkSearchCap = docXml.indexOf('5.3.2', cpkSearchFrom > 0 ? cpkSearchFrom : 0);
      const cpkSearchEnd = cpkSearchCap > cpkSearchFrom
        ? cpkSearchCap
        : Math.floor(docXml.length * 0.85);

      console.log(`  🔍 CPK search: from=${cpkSearchFrom}, cap=${cpkSearchEnd}`);

      let searchPos = cpkSearchFrom > 0 ? cpkSearchFrom : 0;
      while (searchPos < cpkSearchEnd) {
        const nextTbl = docXml.indexOf('<w:tbl', searchPos);
        if (nextTbl === -1 || nextTbl >= cpkSearchEnd) break;

        const afterTbl = docXml.substring(nextTbl);
        let depth = 0, endOff = -1;
        const tblTagRx = /<\/?w:tbl\b[^>]*>/g;
        let m;
        while ((m = tblTagRx.exec(afterTbl)) !== null) {
          if (m[0].startsWith('<w:tbl')) depth++;
          else if (m[0].startsWith('</w:tbl')) {
            depth--;
            if (depth === 0) { endOff = m.index + m[0].length; break; }
          }
        }
        if (endOff === -1) break;

        const tbl = afterTbl.substring(0, endOff);
        const rowCount = [...tbl.matchAll(/<w:tr\b/g)].length;
        console.log(`  🔍 CPK candidate table at ${nextTbl}: rows=${rowCount}`);

        if (rowCount >= 15) {
          cpkTblStart = nextTbl;
          cpkTblEndFull = nextTbl + endOff;
          origCpkTable = tbl;
          console.log(`  🔍 Found Cpk data table at index ${nextTbl} with ${rowCount} rows`);
          break;
        }

        searchPos = nextTbl + endOff;
      }

      if (cpkTblStart === -1) {
        console.warn('  ⚠️ CPK table not found between 5.3.1 and 5.3.2 sections');
      }
    }

    if (cpkTblStart !== -1 && origCpkTable) {
      const cpkTblPr = origCpkTable.match(/<w:tblPr>[\s\S]*?<\/w:tblPr>/)?.[0] || '<w:tblPr/>';

      // ── Compute process capability for pH and ALL assay columns ──
      const cpkHdr = data.bulkInProcessHeader || {};
      const cpkAssayCols: { compound: string; limit: string }[] = cpkHdr.assayColumns || [];
      // Total Cpk columns: vMerge col + label col + pH col + N assay cols
      const cpkTotalDataCols = 2 + 1 + cpkAssayCols.length; // for gridSpan of title row
      const cpkSimpleCols = 1 + cpkAssayCols.length; // pH + N assays (data value columns)

      const phValues = data.bulkInProcessData.map((r: any) => parseFloat(r.ph));
      const phStats = calculateProcessCapability(phValues, cpkHdr.phLimit || '');

      // Build array of assay stats — one per assay column
      const assayStatsArray: (ProcessCapabilityResults | null)[] = [];
      for (let ci = 0; ci < cpkAssayCols.length; ci++) {
        const vals = data.bulkInProcessData.map((r: any) => {
          if (r.assays && r.assays[ci]) return parseFloat(r.assays[ci].value);
          if (ci === 0) return parseFloat(r.assay);
          return NaN;
        });
        assayStatsArray.push(calculateProcessCapability(vals, cpkAssayCols[ci].limit || ''));
      }

      console.log(`  📊 Process Capability: pH=${!!phStats}, Assays=[${assayStatsArray.map((s, i) => `${cpkAssayCols[i]?.compound}=${!!s}`).join(', ')}]`);

      const fmt5 = (num: number | undefined) => num !== undefined && !isNaN(num) ? num.toFixed(5) : 'N/A';
      const fmt2 = (num: number | undefined) => num !== undefined && !isNaN(num) ? num.toFixed(2) : 'N/A';

      const boldP = (text: string) =>
        `<w:p><w:pPr><w:spacing w:before="0"/><w:jc w:val="center"/>`
        + `<w:rPr><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:pPr>`
        + `<w:r><w:rPr><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>`
        + `<w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r></w:p>`;

      // Build dynamic grid: vMerge(811) + label(1661) + pH(1081) + N assay(1447 each)
      let cpkDynGrid = '<w:tblGrid><w:gridCol w:w="811"/><w:gridCol w:w="1661"/><w:gridCol w:w="1081"/>';
      for (let i = 0; i < cpkAssayCols.length; i++) {
        cpkDynGrid += '<w:gridCol w:w="1447"/>';
      }
      cpkDynGrid += '</w:tblGrid>';

      // Helper: data value cell
      const cpkValCell = (val: string, shade = '') =>
        `<w:tc><w:tcPr><w:tcW w:w="1081" w:type="pct"/>${shade}<w:vAlign w:val="center"/></w:tcPr>`
        + `<w:p><w:pPr><w:spacing w:before="0"/><w:jc w:val="center"/>`
        + `<w:rPr><w:sz w:val="24"/></w:rPr></w:pPr>`
        + `<w:r><w:rPr><w:sz w:val="24"/></w:rPr><w:t>${val}</w:t></w:r></w:p></w:tc>`;

      const vMergeContCol =
        `<w:tc><w:tcPr><w:tcW w:w="811" w:type="pct"/><w:vMerge w:val="continue"/>`
        + `<w:vAlign w:val="center"/></w:tcPr><w:p/></w:tc>`;

      // Dynamic row builders that accept arrays of values
      const buildShortTermRowDyn = (label: string, phVal: string, assayVals: string[], isShaded = false) => {
        const shade = isShaded ? `<w:shd w:val="clear" w:color="auto" w:fill="D9D9D9"/>` : '';
        let row = `<w:tr><w:trPr><w:trHeight w:val="397"/><w:jc w:val="center"/></w:trPr>`
          + vMergeContCol
          + `<w:tc><w:tcPr><w:tcW w:w="1661" w:type="pct"/>${shade}<w:vAlign w:val="center"/></w:tcPr>`
          + `<w:p><w:pPr><w:spacing w:before="0"/><w:jc w:val="center"/>`
          + `<w:rPr><w:b/><w:sz w:val="24"/></w:rPr></w:pPr>`
          + `<w:r><w:rPr><w:b/><w:sz w:val="24"/></w:rPr>`
          + `<w:t xml:space="preserve">${xmlEscape(label)}</w:t></w:r></w:p></w:tc>`;
        row += cpkValCell(phVal, shade);
        for (const v of assayVals) row += cpkValCell(v, shade);
        row += `</w:tr>`;
        return row;
      };

      const buildSimpleRowDyn = (col1Xml: string, phVal: string, assayVals: string[]) => {
        let row = `<w:tr><w:trPr><w:trHeight w:val="397"/><w:jc w:val="center"/></w:trPr>`
          + `<w:tc><w:tcPr><w:tcW w:w="2472" w:type="pct"/><w:gridSpan w:val="2"/>`
          + `<w:vAlign w:val="center"/></w:tcPr>${col1Xml}</w:tc>`;
        row += cpkValCell(phVal);
        for (const v of assayVals) row += cpkValCell(v);
        row += `</w:tr>`;
        return row;
      };

      let dynCpkRows = '';

      // ── ROW 1: Title row — spans ALL columns
      dynCpkRows +=
        `<w:tr><w:trPr><w:trHeight w:val="397"/><w:jc w:val="center"/></w:trPr>`
        + `<w:tc><w:tcPr><w:tcW w:w="5000" w:type="pct"/><w:gridSpan w:val="${cpkTotalDataCols}"/>`
        + `<w:shd w:val="clear" w:color="auto" w:fill="D9D9D9"/><w:vAlign w:val="center"/></w:tcPr>`
        + `<w:p><w:pPr><w:spacing w:before="0"/><w:jc w:val="center"/>`
        + `<w:rPr><w:b/><w:color w:val="7F6000"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:pPr>`
        + `<w:r><w:rPr><w:b/><w:color w:val="7F6000"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>`
        + `<w:t>Process Capability &amp; Performance parameters (Cp, Cpk, and Pp, Ppk)</w:t>`
        + `</w:r></w:p></w:tc>`
        + `</w:tr>`;

      // ── ROW 2: Column headers — pH | Assay columns
      {
        let hdrRow = `<w:tr><w:trPr><w:trHeight w:val="397"/><w:jc w:val="center"/></w:trPr>`
          + `<w:tc><w:tcPr><w:tcW w:w="2472" w:type="pct"/><w:gridSpan w:val="2"/>`
          + `<w:shd w:val="clear" w:color="auto" w:fill="D9D9D9"/><w:vAlign w:val="center"/></w:tcPr>`
          + `<w:p/></w:tc>`
          + `<w:tc><w:tcPr><w:tcW w:w="1081" w:type="pct"/>`
          + `<w:shd w:val="clear" w:color="auto" w:fill="D9D9D9"/><w:vAlign w:val="center"/></w:tcPr>`
          + boldP('pH') + `</w:tc>`;
        for (const col of cpkAssayCols) {
          hdrRow += `<w:tc><w:tcPr><w:tcW w:w="1447" w:type="pct"/>`
            + `<w:shd w:val="clear" w:color="auto" w:fill="D9D9D9"/><w:vAlign w:val="center"/></w:tcPr>`
            + boldP('Assay (%)') + boldP(col.compound) + `</w:tc>`;
        }
        hdrRow += `</w:tr>`;
        dynCpkRows += hdrRow;
      }

      // Helper to get formatted values from all assay stats
      const fmtAssays5 = (getter: (s: ProcessCapabilityResults | null) => number | undefined) =>
        assayStatsArray.map(s => fmt5(getter(s)));
      const fmtAssays2 = (getter: (s: ProcessCapabilityResults | null) => number | undefined) =>
        assayStatsArray.map(s => fmt2(getter(s)));

      // Derived values per assay
      const uslLslAssays = assayStatsArray.map(s => s ? s.usl - s.lsl : NaN);
      const uslAvgAssays = assayStatsArray.map(s => s ? s.usl - s.average : NaN);
      const avgLslAssays = assayStatsArray.map(s => s ? s.average - s.lsl : NaN);

      const uslLslPh = phStats ? phStats.usl - phStats.lsl : NaN;
      const uslAvgPh = phStats ? phStats.usl - phStats.average : NaN;
      const avgLslPh = phStats ? phStats.average - phStats.lsl : NaN;

      // ── ROWS 3–8: Basic statistics ──
      dynCpkRows += buildSimpleRowDyn(boldP('Average'), fmt5(phStats?.average), fmtAssays5(s => s?.average));
      dynCpkRows += buildSimpleRowDyn(boldP('Maximum'), fmt5(phStats?.max), fmtAssays5(s => s?.max));
      dynCpkRows += buildSimpleRowDyn(boldP('Minimum'), fmt5(phStats?.min), fmtAssays5(s => s?.min));
      dynCpkRows += buildSimpleRowDyn(boldP('Upper Specification Limit \u2013 Lower Specification Limit (USL \u2013 LSL)'), fmt5(uslLslPh), uslLslAssays.map(v => fmt5(v)));
      dynCpkRows += buildSimpleRowDyn(boldP('Upper Specification Limit (USL) \u2013 Average'), fmt5(uslAvgPh), uslAvgAssays.map(v => fmt5(v)));
      dynCpkRows += buildSimpleRowDyn(boldP('Average \u2013 Lower Specification Limit (LSL)'), fmt5(avgLslPh), avgLslAssays.map(v => fmt5(v)));

      // ── ROWS 9–15: Short-Term (Cp, Cpk) ──
      // Row 9: Short-Term header with vMerge + "Estimated Std Deviation (σ)"
      {
        let stRow = `<w:tr><w:trPr><w:trHeight w:val="397"/><w:jc w:val="center"/></w:trPr>`
          + `<w:tc><w:tcPr><w:tcW w:w="811" w:type="pct"/><w:vMerge w:val="restart"/>`
          + `<w:vAlign w:val="center"/></w:tcPr>`
          + boldP('Process Capability parameters Short-Term Statistics') + `</w:tc>`
          + `<w:tc><w:tcPr><w:tcW w:w="1661" w:type="pct"/><w:vAlign w:val="center"/></w:tcPr>`
          + `<w:p><w:pPr><w:spacing w:before="0"/><w:jc w:val="center"/>`
          + `<w:rPr><w:b/><w:sz w:val="24"/></w:rPr></w:pPr>`
          + `<w:r><w:rPr><w:b/><w:sz w:val="24"/></w:rPr>`
          + `<w:t xml:space="preserve">Estimated Std Deviation (</w:t></w:r>`
          + `<w:r><w:rPr><w:b/><w:sz w:val="24"/><w:rFonts w:ascii="Symbol" w:hAnsi="Symbol" w:cs="Symbol"/></w:rPr>`
          + `<w:t>s</w:t></w:r>`
          + `<w:r><w:rPr><w:b/><w:sz w:val="24"/></w:rPr><w:t xml:space="preserve">)</w:t></w:r></w:p></w:tc>`;
        stRow += cpkValCell(fmt5(phStats?.sigmaEstimated));
        for (const s of assayStatsArray) stRow += cpkValCell(fmt5(s?.sigmaEstimated));
        stRow += `</w:tr>`;
        dynCpkRows += stRow;
      }

      dynCpkRows += buildShortTermRowDyn('3\u03c3 = (3 X \u03c3)', fmt2(phStats ? phStats.sigmaEstimated * 3 : undefined), assayStatsArray.map(s => fmt2(s ? s.sigmaEstimated * 3 : undefined)));
      dynCpkRows += buildShortTermRowDyn('6\u03c3 = (6 X \u03c3)', fmt2(phStats ? phStats.sigmaEstimated * 6 : undefined), assayStatsArray.map(s => fmt2(s ? s.sigmaEstimated * 6 : undefined)));
      dynCpkRows += buildShortTermRowDyn('Cpku = (USL \u2013 Average) / 3\u03c3', fmt2(phStats?.cpku), fmtAssays2(s => s?.cpku));
      dynCpkRows += buildShortTermRowDyn('Cpkl = (Average \u2013 LSL) / 3\u03c3', fmt2(phStats?.cpkl), fmtAssays2(s => s?.cpkl));
      dynCpkRows += buildShortTermRowDyn('Cpk Value = Min (Cpkl & Cpku)', fmt2(phStats?.cpk), fmtAssays2(s => s?.cpk), true);
      dynCpkRows += buildShortTermRowDyn('Cp Value = (USL \u2013 LSL) / 6\u03c3', fmt2(phStats?.cp), fmtAssays2(s => s?.cp), true);

      // ── ROWS 16–22: Long-Term (Pp, Ppk) ──
      {
        let ltRow = `<w:tr><w:trPr><w:trHeight w:val="397"/><w:jc w:val="center"/></w:trPr>`
          + `<w:tc><w:tcPr><w:tcW w:w="811" w:type="pct"/><w:vMerge w:val="restart"/>`
          + `<w:vAlign w:val="center"/></w:tcPr>`
          + boldP('Process Performance parameters (Long-Term Statistics)') + `</w:tc>`
          + `<w:tc><w:tcPr><w:tcW w:w="1661" w:type="pct"/><w:vAlign w:val="center"/></w:tcPr>`
          + boldP('Std Deviation (S)') + `</w:tc>`;
        ltRow += cpkValCell(fmt5(phStats?.sigmaSample));
        for (const s of assayStatsArray) ltRow += cpkValCell(fmt5(s?.sigmaSample));
        ltRow += `</w:tr>`;
        dynCpkRows += ltRow;
      }

      dynCpkRows += buildShortTermRowDyn('3S = (3 X Std deviation)', fmt2(phStats ? phStats.sigmaSample * 3 : undefined), assayStatsArray.map(s => fmt2(s ? s.sigmaSample * 3 : undefined)));
      dynCpkRows += buildShortTermRowDyn('6S = (6 X Std deviation)', fmt2(phStats ? phStats.sigmaSample * 6 : undefined), assayStatsArray.map(s => fmt2(s ? s.sigmaSample * 6 : undefined)));
      dynCpkRows += buildShortTermRowDyn('Ppku = (USL \u2013 Average) / 3S', fmt2(phStats?.ppku), fmtAssays2(s => s?.ppku));
      dynCpkRows += buildShortTermRowDyn('Ppkl = (Average \u2013 LSL) / 3S', fmt2(phStats?.ppkl), fmtAssays2(s => s?.ppkl));
      dynCpkRows += buildShortTermRowDyn('Ppk Value = Min(Ppkl & Ppku)', fmt2(phStats?.ppk), fmtAssays2(s => s?.ppk));
      dynCpkRows += buildShortTermRowDyn('Pp Value = (USL \u2013 LSL) / 6S', fmt2(phStats?.pp), fmtAssays2(s => s?.pp));

      // ── Assemble and replace the ENTIRE table ──
      const replacementCpkTable = '<w:tbl>' + cpkTblPr + cpkDynGrid + dynCpkRows + '</w:tbl>';

      // ── Replace CPK table first ──
      docXml = docXml.substring(0, cpkTblStart) + replacementCpkTable + docXml.substring(cpkTblEndFull);
      console.log(`  ✅ Process Capability table replaced (${cpkTotalDataCols} columns, ${cpkAssayCols.length} assay col(s))`);

      // ── Update the template UCL/LCL table IN-PLACE (preserve structure/styling) ──
      // Scan tables after the CPK table; take the first one with 4–8 rows.
      const cpkNewEnd = cpkTblStart + replacementCpkTable.length;
      {
        let searchPos = cpkNewEnd;
        let uclTblStart = -1, uclTblEnd = -1;

        // Scan up to 3 tables within 50000 chars to find the UCL/LCL table
        for (let attempt = 0; attempt < 3; attempt++) {
          const afterPos = docXml.substring(searchPos);
          const nextTblOff = afterPos.indexOf('<w:tbl');
          if (nextTblOff === -1 || nextTblOff > 50000) break;

          const afterNext = afterPos.substring(nextTblOff);
          let depth = 0, endOff = -1;
          const rx = /<\/?w:tbl\b[^>]*>/g;
          let m;
          while ((m = rx.exec(afterNext)) !== null) {
            if (m[0].startsWith('<w:tbl')) depth++;
            else if (m[0].startsWith('</w:tbl')) { depth--; if (depth === 0) { endOff = m.index + m[0].length; break; } }
          }
          if (endOff === -1) break;

          const candidateStart = searchPos + nextTblOff;
          const candidateEnd = searchPos + nextTblOff + endOff;
          const candidateXml = afterNext.substring(0, endOff);
          const rowCount = [...candidateXml.matchAll(/<w:tr\b/g)].length;
          console.log(`  🔍 UCL/LCL candidate table at ${candidateStart}: rows=${rowCount}`);

          if (rowCount >= 4 && rowCount <= 8) {
            uclTblStart = candidateStart;
            uclTblEnd = candidateEnd;
            break;
          }
          searchPos = candidateEnd; // skip and try next table
        }

        if (uclTblStart !== -1) {
          let uclTblXml = docXml.substring(uclTblStart, uclTblEnd);
          const uclRowCount = [...uclTblXml.matchAll(/<w:tr\b/g)].length;
          console.log(`  🔍 Bulk UCL/LCL template table found (${uclRowCount} rows) — updating in-place`);

          // Parse all rows
          const uclRows: { xml: string; index: number }[] = [];
          const uclRowRx = /<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/g;
          let uclRowMatch;
          while ((uclRowMatch = uclRowRx.exec(uclTblXml)) !== null) {
            uclRows.push({ xml: uclRowMatch[0], index: uclRowMatch.index });
          }

          const bulkUclFmt = (n: number | undefined) =>
            n !== undefined && !isNaN(n) ? n.toFixed(2) : 'N/A';

          // Column header names: row 0, cells 1..N
          const colHeaders = [
            'pH',
            ...cpkAssayCols.map(c => `Assay (%)\n${c.compound}`),
          ];

          // Data values per data row: [pH, ...assays]
          const specLabels = [
            phStats ? `(${phStats.lsl} to ${phStats.usl})` : '--',
            ...assayStatsArray.map(s => s ? `(${s.lsl} to ${s.usl})` : '--'),
          ];
          const averages = [
            bulkUclFmt(phStats?.average),
            ...assayStatsArray.map(s => bulkUclFmt(s?.average)),
          ];
          const stdDevs = [
            bulkUclFmt(phStats?.sigmaSample),
            ...assayStatsArray.map(s => bulkUclFmt(s?.sigmaSample)),
          ];
          const ucls = [
            bulkUclFmt(phStats ? phStats.average + 3 * phStats.sigmaSample : undefined),
            ...assayStatsArray.map(s => bulkUclFmt(s ? s.average + 3 * s.sigmaSample : undefined)),
          ];
          const lcls = [
            bulkUclFmt(phStats ? phStats.average - 3 * phStats.sigmaSample : undefined),
            ...assayStatsArray.map(s => bulkUclFmt(s ? s.average - 3 * s.sigmaSample : undefined)),
          ];

          // Row 0 = column headers (cell 0 blank, cells 1..N = pH / assay names)
          // Rows 1–5 = Spec Limit, Average, Std Dev, UCL, LCL
          const rowValues: string[][] = [colHeaders, specLabels, averages, stdDevs, ucls, lcls];

          // Apply in reverse so indices stay valid
          for (let ri = uclRows.length - 1; ri >= 0; ri--) {
            const vals = rowValues[ri];
            if (!vals || vals.length === 0) continue;
            let rowXml = uclRows[ri].xml;
            for (let ci = 0; ci < vals.length; ci++) {
              // Row 0: cell 0 is blank label — start at cell index 1
              // Rows 1+: cell 0 is the row label — start at cell index 1
              rowXml = replaceCellText(rowXml, ci + 1, xmlEscape(vals[ci]));
            }
            uclTblXml = uclTblXml.substring(0, uclRows[ri].index)
              + rowXml
              + uclTblXml.substring(uclRows[ri].index + uclRows[ri].xml.length);
          }

          docXml = docXml.substring(0, uclTblStart) + uclTblXml + docXml.substring(uclTblEnd);
          console.log(`  ✅ Bulk UCL/LCL table updated in-place`);
        } else {
          console.warn('  ⚠️ Bulk UCL/LCL template table not found after CPK table');
        }
      }
    }
  }


  // ── 11b-ii. Trend Analysis Charts for Section 5.3.1 – Bulk Stage ──
  if (data.bulkInProcessData && data.bulkInProcessData.length > 0) {
    const bulkHdr531 = data.bulkInProcessHeader || {};
    const bulkAssayCols531: { compound: string; limit: string }[] = bulkHdr531.assayColumns || [];
    const batchNums531: string[] = data.bulkInProcessData.map((r: any) => r.batchNumber as string);
    const n531 = batchNums531.length;

    const parseLimit531 = (limitStr: string): { nlt?: number; nmt?: number } => {
      const s = (limitStr || '').toUpperCase().replace(/%/g, '').trim();
      const rangeM = s.match(/(\d+\.?\d*)\s+TO\s+(\d+\.?\d*)/);
      if (rangeM) return { nlt: parseFloat(rangeM[1]), nmt: parseFloat(rangeM[2]) };
      const nmtM = s.match(/NMT\s+(\d+\.?\d*)/);
      if (nmtM) {
        const nltM = s.match(/NLT\s+(\d+\.?\d*)/);
        return nltM ? { nlt: parseFloat(nltM[1]), nmt: parseFloat(nmtM[1]) } : { nmt: parseFloat(nmtM[1]) };
      }
      const nltM = s.match(/NLT\s+(\d+\.?\d*)/);
      if (nltM) return { nlt: parseFloat(nltM[1]) };
      return {};
    };

    const buildStrCache531 = (vals: string[]) => {
      const pts = vals.map((v, i) => `<c:pt idx="${i}"><c:v>${xmlEscape(v)}</c:v></c:pt>`).join('');
      return `<c:strCache><c:ptCount val="${vals.length}"/>${pts}</c:strCache>`;
    };
    const buildNumCache531 = (vals: number[]) => {
      const pts = vals.map((v, i) => `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`).join('');
      return `<c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${vals.length}"/>${pts}</c:numCache>`;
    };
    const buildSerName531 = (name: string) =>
      `<c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>${xmlEscape(name)}</c:v></c:pt></c:strCache>`;

    const updateChart531 = (chartXml: string, series: { name: string; values: number[] }[]): string => {
      let idx = 0;
      return chartXml.replace(/<c:ser>([\s\S]*?)<\/c:ser>/g, (match, content) => {
        if (idx >= series.length) return match;
        const sd = series[idx++];
        let updated = content;
        updated = updated.replace(
          /(<c:tx>[\s\S]*?<c:strRef>[\s\S]*?)<c:strCache>[\s\S]*?<\/c:strCache>([\s\S]*?<\/c:strRef>[\s\S]*?<\/c:tx>)/,
          `$1${buildSerName531(sd.name)}$2`
        );
        updated = updated.replace(
          /(<c:cat>[\s\S]*?<c:strRef>[\s\S]*?)<c:strCache>[\s\S]*?<\/c:strCache>([\s\S]*?<\/c:strRef>[\s\S]*?<\/c:cat>)/,
          `$1${buildStrCache531(batchNums531)}$2`
        );
        updated = updated.replace(
          /(<c:val>[\s\S]*?<c:numRef>[\s\S]*?)<c:numCache>[\s\S]*?<\/c:numCache>([\s\S]*?<\/c:numRef>[\s\S]*?<\/c:val>)/,
          `$1${buildNumCache531(sd.values)}$2`
        );
        return `<c:ser>${updated}</c:ser>`;
      });
    };

    const limitLine531 = (val: number | undefined, n: number): number[] => Array(n).fill(val ?? 0);
    const parseNum531 = (s: string): number => { const n = parseFloat(s.replace(/[^0-9.-]/g, '')); return isNaN(n) ? NaN : n; };

    // ── chart4.xml → Trend Analysis of pH at Bulk Stage (5 series) ──
    const phVals531 = data.bulkInProcessData.map((r: any) => parseNum531(r.ph));
    const phLims531 = parseLimit531(bulkHdr531.phLimit || '');
    const phStats531 = calculateProcessCapability(phVals531.filter((v: number) => !isNaN(v)), bulkHdr531.phLimit || '');
    const phUcl531 = phStats531 ? phStats531.average + 3 * phStats531.sigmaSample : undefined;
    const phLcl531 = phStats531 ? phStats531.average - 3 * phStats531.sigmaSample : undefined;

    const chart4Xml = await zip.file('word/charts/chart4.xml')!.async('string');
    const phSeries531: { name: string; values: number[] }[] = [
      { name: 'pH', values: phVals531.map((v: number) => isNaN(v) ? 0 : v) },
      ...(phLims531.nlt !== undefined ? [{ name: `NLT ${phLims531.nlt}`, values: limitLine531(phLims531.nlt, n531) }] : []),
      ...(phLims531.nmt !== undefined ? [{ name: `NMT ${phLims531.nmt}`, values: limitLine531(phLims531.nmt, n531) }] : []),
      ...(phUcl531 !== undefined ? [{ name: `UCL (NMT ${phUcl531.toFixed(2)})`, values: limitLine531(phUcl531, n531) }] : []),
      ...(phLcl531 !== undefined ? [{ name: `LCL (NLT ${phLcl531.toFixed(2)})`, values: limitLine531(phLcl531, n531) }] : []),
    ];
    zip.file('word/charts/chart4.xml', updateChart531(chart4Xml, phSeries531));
    console.log(`  ✅ Section 5.3.1 chart4 (pH Bulk) updated: ${n531} batches, UCL=${phUcl531?.toFixed(2)}, LCL=${phLcl531?.toFixed(2)}`);

    // ── chart5.xml → Trend Analysis of % Assay at Bulk Stage (5 series per assay compound) ──
    // Template has one chart (chart5) — we populate it with the first quantifiable assay compound.
    if (bulkAssayCols531.length > 0) {
      const assayCol531 = bulkAssayCols531[0];
      const assayVals531 = data.bulkInProcessData.map((r: any) => {
        const val = r.assays?.[0]?.value ?? r.assay ?? '';
        return parseNum531(val);
      });
      const assayLims531 = parseLimit531(assayCol531.limit || '');
      const assayStats531 = calculateProcessCapability(assayVals531.filter((v: number) => !isNaN(v)), assayCol531.limit || '');
      const assayUcl531 = assayStats531 ? assayStats531.average + 3 * assayStats531.sigmaSample : undefined;
      const assayLcl531 = assayStats531 ? assayStats531.average - 3 * assayStats531.sigmaSample : undefined;

      const chart5Xml = await zip.file('word/charts/chart5.xml')!.async('string');
      const assaySeries531: { name: string; values: number[] }[] = [
        { name: `ASSAY OF ${assayCol531.compound}`, values: assayVals531.map((v: number) => isNaN(v) ? 0 : v) },
        ...(assayLims531.nlt !== undefined ? [{ name: `NLT ${assayLims531.nlt}%`, values: limitLine531(assayLims531.nlt, n531) }] : []),
        ...(assayLims531.nmt !== undefined ? [{ name: `NMT ${assayLims531.nmt}%`, values: limitLine531(assayLims531.nmt, n531) }] : []),
        ...(assayUcl531 !== undefined ? [{ name: `UCL (NMT ${assayUcl531.toFixed(2)})`, values: limitLine531(assayUcl531, n531) }] : []),
        ...(assayLcl531 !== undefined ? [{ name: `LCL (NLT ${assayLcl531.toFixed(2)})`, values: limitLine531(assayLcl531, n531) }] : []),
      ];
      zip.file('word/charts/chart5.xml', updateChart531(chart5Xml, assaySeries531));
      console.log(`  ✅ Section 5.3.1 chart5 (${assayCol531.compound} Assay Bulk) updated: ${n531} batches, UCL=${assayUcl531?.toFixed(2)}, LCL=${assayLcl531?.toFixed(2)}`);
    }

    console.log(`✅ Section 5.3.1 Trend Analysis charts updated (${n531} batches, ${bulkAssayCols531.length} assay col(s))`);
  }

  // ── 11c. Dynamic Section 5.3.3 – Sterility Testing ──
  {
    const sterilityLimit = (data as any).sterilityTestingLimit || DEFAULT_STERILITY_LIMIT;
    const rows533: SterilityTestingRow[] = (data as any).sterilityTestingData || [];
    const productDisplayName =
      ((data as any).generic_name || data.product_name || '').toString().trim();

    console.log(`\n📋 Section 5.3.3 Sterility: ${rows533.length} batches, limit=${sterilityLimit}`);

    // Find the 5.3.3 section heading (skip TOC region at top ~30% of doc)
    const searchFrom533 = Math.floor(docXml.length * 0.3);
    let sec533Idx = -1;
    for (const anchor of ['5.3.3', 'Sterility Testing:', 'STERILITY TESTING']) {
      const idx = docXml.indexOf(anchor, searchFrom533);
      if (idx !== -1) { sec533Idx = idx; break; }
    }

    if (sec533Idx === -1) {
      console.warn('Section 5.3.3: Could not find section heading in template — skipping');
    } else {
      const tblStart533 = docXml.indexOf('<w:tbl>', sec533Idx);
      if (tblStart533 === -1 || (tblStart533 - sec533Idx) > 3000) {
        console.warn('Section 5.3.3: Could not find data table near heading — skipping');
      } else {
        const tblEnd533 = docXml.indexOf('</w:tbl>', tblStart533) + 8;
        const origTable533 = docXml.substring(tblStart533, tblEnd533);

        const origTblPr533 = origTable533.match(/<w:tblPr>[\s\S]*?<\/w:tblPr>/)?.[0]
          || '<w:tblPr><w:tblW w:w="9000" w:type="dxa"/><w:jc w:val="center"/><w:tblBorders>'
          + '<w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
          + '<w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
          + '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
          + '<w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
          + '<w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
          + '<w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
          + '</w:tblBorders></w:tblPr>';

        const tblGrid533 = '<w:tblGrid><w:gridCol w:w="2000"/><w:gridCol w:w="7000"/></w:tblGrid>';

        const hCell533 = (text: string, opts?: { gridSpan?: number; vMerge?: 'restart' | 'continue' }) => {
          let tcPr = '<w:shd w:val="clear" w:color="auto" w:fill="D9D9D9"/><w:vAlign w:val="center"/>';
          if (opts?.gridSpan) tcPr += `<w:gridSpan w:val="${opts.gridSpan}"/>`;
          if (opts?.vMerge === 'restart') tcPr = '<w:vMerge w:val="restart"/>' + tcPr;
          else if (opts?.vMerge === 'continue') tcPr = '<w:vMerge/>' + tcPr;
          const rPr = '<w:rPr><w:b/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>';
          const pPr = '<w:pPr><w:spacing w:before="0"/><w:jc w:val="center"/>' + rPr + '</w:pPr>';
          return '<w:tc><w:tcPr>' + tcPr + '</w:tcPr>'
            + '<w:p>' + pPr
            + (text ? '<w:r>' + rPr + `<w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r>` : '')
            + '</w:p></w:tc>';
        };

        const dCell533 = (text: string, opts?: { vMerge?: 'restart' | 'continue' }) => {
          let tcPr = '<w:vAlign w:val="center"/>';
          if (opts?.vMerge === 'restart') tcPr = '<w:vMerge w:val="restart"/>' + tcPr;
          else if (opts?.vMerge === 'continue') tcPr = '<w:vMerge/>' + tcPr;
          return '<w:tc><w:tcPr>' + tcPr + '</w:tcPr>'
            + '<w:p><w:pPr><w:spacing w:before="0"/><w:jc w:val="center"/>'
            + '<w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:pPr>'
            + '<w:r><w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>'
            + `<w:t xml:space="preserve">${xmlEscape(text)}</w:t>`
            + '</w:r></w:p></w:tc>';
        };

        let rowsXml = '';

        // Header Row 1: BATCH NO. | STERILITY TESTING
        rowsXml += '<w:tr><w:trPr><w:trHeight w:val="432"/><w:jc w:val="center"/></w:trPr>';
        rowsXml += hCell533('BATCH NO.', { vMerge: 'restart' });
        rowsXml += hCell533('STERILITY TESTING');
        rowsXml += '</w:tr>';

        // Header Row 2: (batch merged) | limit/description
        rowsXml += '<w:tr><w:trPr><w:trHeight w:val="432"/><w:jc w:val="center"/></w:trPr>';
        rowsXml += hCell533('', { vMerge: 'continue' });
        rowsXml += hCell533(sterilityLimit);
        rowsXml += '</w:tr>';

        // Data rows – one per batch from FINISH COA sterility results
        if (rows533.length === 0) {
          rowsXml += '<w:tr><w:trPr><w:jc w:val="center"/></w:trPr>'
            + '<w:tc><w:tcPr><w:gridSpan w:val="2"/><w:vAlign w:val="center"/></w:tcPr>'
            + '<w:p><w:pPr><w:spacing w:before="0"/><w:jc w:val="center"/>'
            + '<w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:pPr>'
            + '<w:r><w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>'
            + '<w:t>No sterility data found for the selected product and year.</w:t>'
            + '</w:r></w:p></w:tc></w:tr>';
        } else {
          for (const row of rows533) {
            rowsXml += '<w:tr><w:trPr><w:jc w:val="center"/></w:trPr>';
            rowsXml += dCell533(row.batchNumber || '--');
            rowsXml += dCell533(row.result || '--');
            rowsXml += '</w:tr>';
          }
        }

        const newTable533 = `<w:tbl>${origTblPr533}${tblGrid533}${rowsXml}</w:tbl>`;
        docXml = docXml.substring(0, tblStart533) + newTable533 + docXml.substring(tblEnd533);
        console.log(`  ✅ Section 5.3.3 Sterility table replaced with ${rows533.length} batch rows`);

        // Remark table after sterility data table
        const remarkSearchStart533 = tblEnd533;
        const remarkAnchorIdx533 = docXml.indexOf('Remark:', remarkSearchStart533);
        if (remarkAnchorIdx533 !== -1 && (remarkAnchorIdx533 - remarkSearchStart533) < 8000) {
          const remarkTblStart533 = docXml.lastIndexOf('<w:tbl>', remarkAnchorIdx533);
          const remarkTblEnd533 = docXml.indexOf('</w:tbl>', remarkAnchorIdx533);
          if (remarkTblStart533 !== -1 && remarkTblEnd533 !== -1 && remarkTblStart533 > tblStart533) {
            const remarkTblEndFull533 = remarkTblEnd533 + 8;
            const origRemarkTable533 = docXml.substring(remarkTblStart533, remarkTblEndFull533);
            const remarkTblPr533 = origRemarkTable533.match(/<w:tblPr>[\s\S]*?<\/w:tblPr>/)?.[0]
              || '<w:tblPr><w:tblW w:w="5000" w:type="pct"/></w:tblPr>';
            const remarkTblGrid533 = origRemarkTable533.match(/<w:tblGrid>[\s\S]*?<\/w:tblGrid>/)?.[0]
              || '<w:tblGrid><w:gridCol w:w="10000"/></w:tblGrid>';
            const remarkOrigRows533 = [...origRemarkTable533.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)];
            const signatureRow533 = remarkOrigRows533.length > 1
              ? remarkOrigRows533[remarkOrigRows533.length - 1][0]
              : '';

            const remarkText533 =
              `All the batches of ${productDisplayName} manufactured during the review period found (Satisfactory) within the limit for Sterility Testing as per finished product specification of ${productDisplayName}.`;

            const remarkContentRow533 = `<w:tr><w:tc><w:tcPr><w:gridSpan w:val="2"/>`
              + '<w:shd w:val="clear" w:color="auto" w:fill="D9D9D9"/>'
              + '</w:tcPr>'
              + '<w:p><w:pPr><w:rPr><w:b/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:pPr>'
              + '<w:r><w:rPr><w:b/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>'
              + '<w:t xml:space="preserve">Remark:</w:t></w:r></w:p>'
              + '<w:p><w:pPr><w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:pPr>'
              + '<w:r><w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>'
              + `<w:t xml:space="preserve">${xmlEscape(remarkText533)}</w:t></w:r></w:p>`
              + '</w:tc></w:tr>';

            const replacementRemark533 = '<w:tbl>' + remarkTblPr533 + remarkTblGrid533
              + remarkContentRow533 + signatureRow533 + '</w:tbl>';
            docXml = docXml.substring(0, remarkTblStart533) + replacementRemark533
              + docXml.substring(remarkTblEndFull533);
            console.log('  ✅ Section 5.3.3 Remark updated');
          }
        }
      }
    }
  }

  // ── 12. Dynamic Section 5.4.1 – At Bulk Stage Yield ──
  {
    const bulkYieldRows = (data as any).yieldData541 as Array<{ batchNo: string; yieldPct: number }> || [];
    console.log(`\n📋 Section 5.4.1 Bulk Yield: ${bulkYieldRows.length} rows`);

    // "At Bulk Stage:" is split across <w:t> runs in the body; anchor on section heading instead.
    const bulkSectionHeading = 'REVIEW OF YIELD AT VARIOUS';
    const bulkSearchFrom = Math.floor(docXml.length * 0.4);
    const bulkAnchorIdx = docXml.indexOf(bulkSectionHeading, bulkSearchFrom);

    if (bulkAnchorIdx !== -1) {
      const bulkTblIdx = docXml.indexOf('<w:tbl>', bulkAnchorIdx);
      if (bulkTblIdx !== -1 && (bulkTblIdx - bulkAnchorIdx) < 5000) {
        const bulkTblEndIdx = docXml.indexOf('</w:tbl>', bulkTblIdx);
        if (bulkTblEndIdx !== -1) {
          const bulkTblEndFull = bulkTblEndIdx + 8;
          const origTable541 = docXml.substring(bulkTblIdx, bulkTblEndFull);

          const origTblPr541 = origTable541.match(/<w:tblPr>[\s\S]*?<\/w:tblPr>/)?.[0]
            || '<w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:jc w:val="center"/><w:tblBorders>'
            + '<w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
            + '<w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
            + '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
            + '<w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
            + '<w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
            + '<w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
            + '</w:tblBorders></w:tblPr>';

          const tblGrid541 = '<w:tblGrid><w:gridCol w:w="5000"/><w:gridCol w:w="5000"/></w:tblGrid>';

          const hCell541 = (text: string) =>
            '<w:tc><w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="D9D9D9"/><w:vAlign w:val="center"/></w:tcPr>'
            + '<w:p><w:pPr><w:spacing w:before="0"/><w:jc w:val="center"/>'
            + '<w:rPr><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:pPr>'
            + '<w:r><w:rPr><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>'
            + `<w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r></w:p></w:tc>`;

          const dCell541 = (text: string, shaded = false) => {
            const shd = shaded
              ? '<w:shd w:val="clear" w:color="auto" w:fill="D9D9D9"/>'
              : '';
            const bold = shaded ? '<w:b/>' : '';
            return '<w:tc><w:tcPr>' + shd + '<w:vAlign w:val="center"/></w:tcPr>'
              + '<w:p><w:pPr><w:spacing w:before="0"/><w:jc w:val="center"/>'
              + `<w:rPr>${bold}<w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:pPr>`
              + `<w:r><w:rPr>${bold}<w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>`
              + `<w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r></w:p></w:tc>`;
          };

          const statRow541 = (label: string, value: string) =>
            '<w:tr><w:trPr><w:jc w:val="center"/></w:trPr>'
            + dCell541(label, true)
            + dCell541(value)
            + '</w:tr>';

          let rowsXml541 = '';

          const origRows541 = [...origTable541.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)];
          const headerRow541 = origRows541.length > 0 ? origRows541[0][0] : (
            '<w:tr><w:trPr><w:trHeight w:val="432"/><w:jc w:val="center"/></w:trPr>'
            + hCell541('BATCH NO.')
            + hCell541('%YIELD (STAGE-BULK)\n(LIMIT: 97-100%)')
            + '</w:tr>'
          );
          rowsXml541 += headerRow541;

          if (bulkYieldRows.length === 0) {
            rowsXml541 += '<w:tr><w:trPr><w:jc w:val="center"/></w:trPr>'
              + '<w:tc><w:tcPr><w:gridSpan w:val="2"/><w:vAlign w:val="center"/></w:tcPr>'
              + '<w:p><w:pPr><w:spacing w:before="0"/><w:jc w:val="center"/>'
              + '<w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:pPr>'
              + '<w:r><w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>'
              + '<w:t>No yield data found for the selected product and year.</w:t>'
              + '</w:r></w:p></w:tc></w:tr>';
          } else {
            for (const row of bulkYieldRows) {
              rowsXml541 += '<w:tr><w:trPr><w:jc w:val="center"/></w:trPr>'
                + dCell541(row.batchNo)
                + dCell541(row.yieldPct.toFixed(2))
                + '</w:tr>';
            }

            const stats541 = computeYieldStatistics(bulkYieldRows.map(r => r.yieldPct));
            rowsXml541 += statRow541('Minimum', stats541.min.toFixed(2));
            rowsXml541 += statRow541('Maximum', stats541.max.toFixed(2));
            rowsXml541 += statRow541('Average', stats541.mean.toFixed(2));
            rowsXml541 += statRow541('Standard Deviation', stats541.stdDev.toFixed(2));
            rowsXml541 += statRow541('RSD (%)', stats541.rsd.toFixed(2));
          }

          const replacementTable541 = '<w:tbl>' + origTblPr541 + tblGrid541 + rowsXml541 + '</w:tbl>';
          docXml = docXml.substring(0, bulkTblIdx) + replacementTable541 + docXml.substring(bulkTblEndFull);
          console.log(`  ✅ Section 5.4.1 bulk yield table replaced (${bulkYieldRows.length} batch rows)`);
        }
      } else {
        console.warn('Section 5.4.1: Could not find bulk yield table after section heading');
      }
    } else {
      console.warn('Section 5.4.1: "REVIEW OF YIELD AT VARIOUS" heading not found in template body');
    }

    const yieldProductLabel541 = xmlEscape(
      ((data as any).generic_name || data.product_name || '').toString().trim()
    );
    if (yieldProductLabel541) {
      const bulkRemarkIdx = docXml.indexOf('at bulk stage', 500000);
      if (bulkRemarkIdx !== -1) {
        const bulkParaStart = docXml.lastIndexOf('<w:p ', bulkRemarkIdx);
        const bulkParaEnd = docXml.indexOf('</w:p>', bulkRemarkIdx) + 6;
        if (bulkParaStart !== -1 && bulkParaEnd > bulkParaStart) {
          const remarkText541 =
            `% yield of ${yieldProductLabel541} at bulk stage found within the limit and no adverse trend observed during the review period.`;
          const remarkPara541 = '<w:p><w:pPr><w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:pPr>'
            + '<w:r><w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>'
            + `<w:t xml:space="preserve">${remarkText541}</w:t></w:r></w:p>`;
          docXml = docXml.substring(0, bulkParaStart) + remarkPara541 + docXml.substring(bulkParaEnd);
          console.log('  ✅ Section 5.4.1 bulk yield remark updated');
        }
      }
    }

    // ── 12b. Trend Analysis of Bulk Stage Yield Chart (chart11.xml) ──
    if (bulkYieldRows.length > 0) {
      const batchNos541 = bulkYieldRows.map(r => r.batchNo);
      const nBulkYield = bulkYieldRows.length;
      const bulkYieldSeries: YieldChartSeries[] = [
        { name: '% YIELD AT BULK STAGE', values: bulkYieldRows.map(r => r.yieldPct) },
        { name: 'NLT 97%', values: Array(nBulkYield).fill(97) },
        { name: 'NMT 100%', values: Array(nBulkYield).fill(100) },
      ];
      const bulkChartOk = await applyYieldTrendChartUpdate(zip, 'chart11.xml', batchNos541, bulkYieldSeries);
      if (bulkChartOk) {
        console.log(`  ✅ chart11.xml (Bulk Stage Yield) updated: ${nBulkYield} batches`);
      } else {
        console.warn('  ⚠️ chart11.xml not found — bulk yield chart not updated');
      }
    }
  }

  // ── 12c. Dynamic Section 5.4.2 – At Finished Stage Yield ──
  {
    const finishedYieldRows = (data as any).yieldData542 as YieldRow[] || [];
    console.log(`\n📋 Section 5.4.2 Finished Yield: ${finishedYieldRows.length} rows`);

    const yieldProductLabel542 = xmlEscape(
      ((data as any).generic_name || data.product_name || '').toString().trim()
    );

    const finishedAnchorIdx = docXml.indexOf('At Finished Stage:', 500000);
    if (finishedAnchorIdx !== -1) {
      // Yield data lives in a nested table immediately after the "At Finished Stage:" row.
      const finishedTblIdx = docXml.indexOf('<w:tbl>', finishedAnchorIdx + 1);
      if (finishedTblIdx !== -1 && (finishedTblIdx - finishedAnchorIdx) < 5000) {
        const finishedTblEndIdx = docXml.indexOf('</w:tbl>', finishedTblIdx);
        if (finishedTblEndIdx !== -1) {
          const finishedTblEndFull = finishedTblEndIdx + 8;
          const origTable542 = docXml.substring(finishedTblIdx, finishedTblEndFull);

          const origTblPr542 = origTable542.match(/<w:tblPr>[\s\S]*?<\/w:tblPr>/)?.[0]
            || '<w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:jc w:val="center"/><w:tblBorders>'
            + '<w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
            + '<w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
            + '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
            + '<w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
            + '<w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
            + '<w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
            + '</w:tblBorders></w:tblPr>';

          const tblGrid542 = '<w:tblGrid><w:gridCol w:w="1859"/><w:gridCol w:w="4023"/><w:gridCol w:w="4023"/></w:tblGrid>';

          const hCell542 = (text: string) =>
            '<w:tc><w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="D9D9D9"/><w:vAlign w:val="center"/></w:tcPr>'
            + '<w:p><w:pPr><w:spacing w:before="0"/><w:jc w:val="center"/>'
            + '<w:rPr><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:pPr>'
            + '<w:r><w:rPr><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>'
            + `<w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r></w:p></w:tc>`;

          const dCell542 = (text: string, shaded = false) => {
            const shd = shaded
              ? '<w:shd w:val="clear" w:color="auto" w:fill="D9D9D9"/>'
              : '';
            const bold = shaded ? '<w:b/>' : '';
            return '<w:tc><w:tcPr>' + shd + '<w:vAlign w:val="center"/></w:tcPr>'
              + '<w:p><w:pPr><w:spacing w:before="0"/><w:jc w:val="center"/>'
              + `<w:rPr>${bold}<w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:pPr>`
              + `<w:r><w:rPr>${bold}<w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>`
              + `<w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r></w:p></w:tc>`;
          };

          const statRow542 = (label: string, value: string) =>
            '<w:tr><w:trPr><w:jc w:val="center"/></w:trPr>'
            + '<w:tc><w:tcPr><w:gridSpan w:val="2"/>'
            + '<w:shd w:val="clear" w:color="auto" w:fill="D9D9D9"/><w:vAlign w:val="center"/></w:tcPr>'
            + '<w:p><w:pPr><w:spacing w:before="0"/><w:jc w:val="center"/>'
            + '<w:rPr><w:b/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:pPr>'
            + '<w:r><w:rPr><w:b/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>'
            + `<w:t xml:space="preserve">${xmlEscape(label)}</w:t></w:r></w:p></w:tc>`
            + dCell542(value)
            + '</w:tr>';

          let rowsXml542 = '';

          const origRows542 = [...origTable542.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)];
          const headerRow542 = origRows542.length > 0 ? origRows542[0][0] : (
            '<w:tr><w:trPr><w:trHeight w:val="432"/><w:jc w:val="center"/></w:trPr>'
            + hCell542('BATCH NO.')
            + hCell542('%YIELD (STAGE-FINISHED)\n(LIMIT: 95-100%)')
            + hCell542('%AVERAGE YIELD\n(STAGE-FINISHED)\n(LIMIT: 95-100%)')
            + '</w:tr>'
          );
          rowsXml542 += headerRow542;

          if (finishedYieldRows.length === 0) {
            rowsXml542 += '<w:tr><w:trPr><w:jc w:val="center"/></w:trPr>'
              + '<w:tc><w:tcPr><w:gridSpan w:val="3"/><w:vAlign w:val="center"/></w:tcPr>'
              + '<w:p><w:pPr><w:spacing w:before="0"/><w:jc w:val="center"/>'
              + '<w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:pPr>'
              + '<w:r><w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>'
              + '<w:t>No yield data found for the selected product and year.</w:t>'
              + '</w:r></w:p></w:tc></w:tr>';
          } else {
            for (const row of finishedYieldRows) {
              const y = row.yieldPct.toFixed(2);
              rowsXml542 += '<w:tr><w:trPr><w:jc w:val="center"/></w:trPr>'
                + dCell542(row.batchNo)
                + dCell542(y)
                + dCell542(y)
                + '</w:tr>';
            }

            const stats542 = computeYieldStatistics(finishedYieldRows.map(r => r.yieldPct));
            rowsXml542 += statRow542('Minimum', stats542.min.toFixed(2));
            rowsXml542 += statRow542('Maximum', stats542.max.toFixed(2));
            rowsXml542 += statRow542('Average', stats542.mean.toFixed(2));
            rowsXml542 += statRow542('Standard Deviation', stats542.stdDev.toFixed(2));
            rowsXml542 += statRow542('RSD (%)', stats542.rsd.toFixed(2));
          }

          const replacementTable542 = '<w:tbl>' + origTblPr542 + tblGrid542 + rowsXml542 + '</w:tbl>';
          docXml = docXml.substring(0, finishedTblIdx) + replacementTable542 + docXml.substring(finishedTblEndFull);
          console.log(`  ✅ Section 5.4.2 finished yield table replaced (${finishedYieldRows.length} batch rows)`);
        }
      } else {
        console.warn('Section 5.4.2: Could not find nested yield table after "At Finished Stage:"');
      }
    } else {
      console.warn('Section 5.4.2: "At Finished Stage:" anchor not found in template body');
    }

    // Remark below finished-stage trend chart (text is split across <w:t> runs in template).
    if (yieldProductLabel542) {
      const finishRemarkIdx = docXml.indexOf('at Finished stage', 500000);
      if (finishRemarkIdx !== -1) {
        const paraStart = docXml.lastIndexOf('<w:p ', finishRemarkIdx);
        const paraEnd = docXml.indexOf('</w:p>', finishRemarkIdx) + 6;
        if (paraStart !== -1 && paraEnd > paraStart) {
          const remarkText542 =
            `% yield of ${yieldProductLabel542} at Finished stage found within the limit and no adverse trend observed during the review period.`;
          const remarkPara542 = '<w:p><w:pPr><w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:pPr>'
            + '<w:r><w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>'
            + `<w:t xml:space="preserve">${remarkText542}</w:t></w:r></w:p>`;
          docXml = docXml.substring(0, paraStart) + remarkPara542 + docXml.substring(paraEnd);
          console.log('  ✅ Section 5.4.2 finished yield remark updated');
        }
      }
    }

    // ── 12d. Trend Analysis of Finished Stage Yield Chart (chart12.xml) ──
    if (finishedYieldRows.length > 0) {
      const batchNos542 = finishedYieldRows.map(r => r.batchNo);
      const nYield = finishedYieldRows.length;
      const finishedYieldSeries: YieldChartSeries[] = [
        { name: '% YIELD AT FINISHED STAGE', values: finishedYieldRows.map(r => r.yieldPct) },
        { name: 'NLT 95%', values: Array(nYield).fill(95) },
        { name: 'NMT 100%', values: Array(nYield).fill(100) },
      ];
      const finishChartOk = await applyYieldTrendChartUpdate(zip, 'chart12.xml', batchNos542, finishedYieldSeries);
      if (finishChartOk) {
        console.log(`  ✅ chart12.xml (Finished Stage Yield) updated: ${nYield} batches`);
      } else {
        console.warn('  ⚠️ chart12.xml not found — finished yield chart not updated');
      }
    }
  }

  // ── 13. Dynamic Section 6 – Batch Release / Reject Status ──
  {
    const releaseStatus = (data as { batchReleaseStatus?: BatchReleaseStatus }).batchReleaseStatus;
    if (releaseStatus) {
      const section6Anchor = docXml.indexOf('BATCH RELEASE', 500000);
      if (section6Anchor !== -1) {
        const section6TblIdx = docXml.indexOf('<w:tbl>', section6Anchor);
        if (section6TblIdx !== -1 && (section6TblIdx - section6Anchor) < 5000) {
          const section6TblEndIdx = docXml.indexOf('</w:tbl>', section6TblIdx);
          if (section6TblEndIdx !== -1) {
            const section6TblEndFull = section6TblEndIdx + 8;
            const origTable6 = docXml.substring(section6TblIdx, section6TblEndFull);

            const origTblPr6 = origTable6.match(/<w:tblPr>[\s\S]*?<\/w:tblPr>/)?.[0]
              || '<w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:jc w:val="center"/><w:tblBorders>'
              + '<w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
              + '<w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
              + '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
              + '<w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
              + '<w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
              + '<w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
              + '</w:tblBorders></w:tblPr>';

            const tblGrid6 = origTable6.match(/<w:tblGrid>[\s\S]*?<\/w:tblGrid>/)?.[0]
              || '<w:tblGrid><w:gridCol w:w="720"/><w:gridCol w:w="5040"/><w:gridCol w:w="1440"/></w:tblGrid>';

            const dCell6 = (text: string, shaded = false) => {
              const shd = shaded
                ? '<w:shd w:val="clear" w:color="auto" w:fill="D9D9D9"/>'
                : '';
              const bold = shaded ? '<w:b/>' : '';
              return '<w:tc><w:tcPr>' + shd + '<w:vAlign w:val="center"/></w:tcPr>'
                + '<w:p><w:pPr><w:spacing w:before="0"/><w:jc w:val="center"/>'
                + `<w:rPr>${bold}<w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:pPr>`
                + `<w:r><w:rPr>${bold}<w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>`
                + `<w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r></w:p></w:tc>`;
            };

            const origRows6 = [...origTable6.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)];
            const headerRow6 = origRows6.length > 0 ? origRows6[0][0] : (
              '<w:tr><w:trPr><w:jc w:val="center"/></w:trPr>'
              + dCell6('Sr. No.', true)
              + dCell6('Description', true)
              + dCell6('Number of Batches', true)
              + '</w:tr>'
            );

            const mfgCount = formatBatchCountForApqr(releaseStatus.manufactured);
            const releasedCount = formatBatchCountForApqr(releaseStatus.released);
            const rejectedCount = formatBatchCountForApqr(releaseStatus.rejected, true);

            const rowsXml6 = headerRow6
              + '<w:tr><w:trPr><w:jc w:val="center"/></w:trPr>'
              + dCell6('1.')
              + dCell6('Total Number of Batches Manufactured')
              + dCell6(mfgCount)
              + '</w:tr>'
              + '<w:tr><w:trPr><w:jc w:val="center"/></w:trPr>'
              + dCell6('2.')
              + dCell6('Total Number of Batches Released')
              + dCell6(releasedCount)
              + '</w:tr>'
              + '<w:tr><w:trPr><w:jc w:val="center"/></w:trPr>'
              + dCell6('3.')
              + dCell6('Total Number of Batches Rejected')
              + dCell6(rejectedCount)
              + '</w:tr>';

            const replacementTable6 = '<w:tbl>' + origTblPr6 + tblGrid6 + rowsXml6 + '</w:tbl>';
            docXml = docXml.substring(0, section6TblIdx) + replacementTable6 + docXml.substring(section6TblEndFull);
            console.log(
              `  ✅ Section 6 batch release table replaced (Mfg=${mfgCount}, Released=${releasedCount}, Rejected=${rejectedCount})`
            );
          }
        } else {
          console.warn('Section 6: Could not find table after BATCH RELEASE heading');
        }
      } else {
        console.warn('Section 6: BATCH RELEASE heading not found in template body');
      }
    }
  }

  // ── 14. Dynamic Section 7 – Review of Control Sample ──
  {
    const controlData = (data as { controlSampleData?: ControlSampleData | null }).controlSampleData;
    if (controlData && controlData.batches.length > 0) {
      const csAnchor = 'REVIEW OF CONTROL SAMPLE';
      const defaultCsTblPr =
        '<w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:jc w:val="center"/><w:tblBorders>'
        + '<w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
        + '<w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
        + '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
        + '<w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
        + '<w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
        + '<w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
        + '</w:tblBorders></w:tblPr>';
      const defaultCsGrid =
        '<w:tblGrid><w:gridCol w:w="900"/><w:gridCol w:w="900"/>'
        + '<w:gridCol w:w="900"/><w:gridCol w:w="900"/>'
        + '<w:gridCol w:w="900"/><w:gridCol w:w="900"/><w:gridCol w:w="900"/></w:tblGrid>';

      const csHdrRPr = '<w:rPr><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>';
      const csHdrPPr = '<w:pPr><w:spacing w:before="0" w:line="276" w:lineRule="auto"/><w:jc w:val="center"/>'
        + csHdrRPr + '</w:pPr>';
      const csColHdrRPr = '<w:rPr><w:b/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>';
      const csDataRPr = '<w:rPr><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>';

      const csTitleCell = (lines: string[]) => {
        let body = '';
        lines.forEach((line, li) => {
          const pPr = li === 0 ? csHdrPPr : '<w:pPr><w:spacing w:before="0" w:line="276" w:lineRule="auto"/>'
            + '<w:jc w:val="center"/>' + csHdrRPr + '</w:pPr>';
          body += `<w:p>${pPr}<w:r>${csHdrRPr}<w:t xml:space="preserve">${xmlEscape(line)}</w:t></w:r></w:p>`;
        });
        return '<w:tc><w:tcPr><w:gridSpan w:val="7"/>'
          + '<w:shd w:val="clear" w:color="auto" w:fill="D9D9D9"/>'
          + '<w:vAlign w:val="center"/></w:tcPr>' + body + '</w:tc>';
      };

      const csSpecTitleCell = (title: string, spec: string) => {
        const specTrim = (spec || '').trim();
        let body = `<w:p>${csHdrPPr}<w:r>${csHdrRPr}<w:t xml:space="preserve">${xmlEscape(title)}</w:t></w:r></w:p>`;
        if (specTrim) {
          body += `<w:p>${csHdrPPr}<w:r>${csHdrRPr}<w:t xml:space="preserve">(</w:t></w:r>`
            + `<w:r>${csHdrRPr}<w:t xml:space="preserve">${xmlEscape(specTrim)}</w:t></w:r>`
            + `<w:r>${csHdrRPr}<w:t>)</w:t></w:r></w:p>`;
        }
        return '<w:tc><w:tcPr><w:gridSpan w:val="7"/>'
          + '<w:shd w:val="clear" w:color="auto" w:fill="D9D9D9"/>'
          + '<w:vAlign w:val="center"/></w:tcPr>' + body + '</w:tc>';
      };

      const csHdrCell = (text: string, opts?: { gridSpan?: number; vMerge?: 'restart' | 'continue' }) => {
        let tcPr = '<w:shd w:val="clear" w:color="auto" w:fill="D9D9D9"/><w:vAlign w:val="center"/>';
        if (opts?.gridSpan) tcPr += `<w:gridSpan w:val="${opts.gridSpan}"/>`;
        if (opts?.vMerge === 'restart') tcPr = '<w:vMerge w:val="restart"/>' + tcPr;
        else if (opts?.vMerge === 'continue') tcPr = '<w:vMerge/>' + tcPr;
        const pPr = '<w:pPr><w:spacing w:before="0"/><w:jc w:val="center"/>' + csColHdrRPr + '</w:pPr>';
        return '<w:tc><w:tcPr>' + tcPr + '</w:tcPr><w:p>' + pPr
          + `<w:r>${csColHdrRPr}<w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r>`
          + '</w:p></w:tc>';
      };

      const csDataCell = (text: string) => '<w:tc><w:tcPr><w:vAlign w:val="center"/></w:tcPr>'
        + '<w:p><w:pPr><w:spacing w:before="0"/><w:jc w:val="center"/>' + csDataRPr + '</w:pPr>'
        + `<w:r>${csDataRPr}<w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r>`
        + '</w:p></w:tc>';

      const csHeaderRows =
        '<w:tr><w:trPr><w:trHeight w:val="283"/><w:jc w:val="center"/></w:trPr>'
        + csHdrCell('BATCH NO.', { vMerge: 'restart' })
        + csHdrCell('Month', { gridSpan: 6 })
        + '</w:tr>'
        + '<w:tr><w:trPr><w:trHeight w:val="283"/><w:jc w:val="center"/></w:trPr>'
        + csHdrCell('', { vMerge: 'continue' })
        + csHdrCell('Initial')
        + csHdrCell('6 Month')
        + csHdrCell('12 Month')
        + csHdrCell('18 Month')
        + csHdrCell('24 Month')
        + csHdrCell('30 Month')
        + '</w:tr>';

      const buildCsTable = (
        origTableXml: string,
        titleCellXml: string,
        valueForInterval: (row: ControlSampleBatchRow, month: ControlSampleInterval) => string,
      ) => {
        const origTblPr = origTableXml.match(/<w:tblPr>[\s\S]*?<\/w:tblPr>/)?.[0] || defaultCsTblPr;
        const tblGrid = origTableXml.match(/<w:tblGrid>[\s\S]*?<\/w:tblGrid>/)?.[0] || defaultCsGrid;
        let rowsXml = '<w:tr><w:trPr><w:trHeight w:val="283"/><w:jc w:val="center"/></w:trPr>' + titleCellXml + '</w:tr>';
        rowsXml += csHeaderRows;
        for (const row of controlData.batches) {
          rowsXml += '<w:tr><w:trPr><w:jc w:val="center"/></w:trPr>';
          rowsXml += csDataCell(row.batchNumber);
          for (const month of CONTROL_SAMPLE_INTERVALS) {
            rowsXml += csDataCell(valueForInterval(row, month));
          }
          rowsXml += '</w:tr>';
        }
        return '<w:tbl>' + origTblPr + tblGrid + rowsXml + '</w:tbl>';
      };

      const descTable = extractDocxTableAfterAnchor(docXml, csAnchor, 0);
      const phTable = extractDocxTableAfterAnchor(docXml, csAnchor, 1);
      if (!descTable || !phTable) {
        console.warn('Section 7: Description or pH table not found after REVIEW OF CONTROL SAMPLE');
      } else {
        const descTitle = csSpecTitleCell('Description', controlData.descriptionSpec);
        const descReplacement = buildCsTable(
          descTable.tableXml,
          descTitle,
          (row, month) => formatControlSampleDescriptionCell(row.intervals[month].description),
        );
        docXml = docXml.substring(0, descTable.start) + descReplacement + docXml.substring(descTable.end);

        const phTable2 = extractDocxTableAfterAnchor(docXml, csAnchor, 1);
        if (phTable2) {
          let phTitle: string;
          if (controlData.phParams.length === 0) {
            phTitle = csSpecTitleCell('pH', '');
          } else if (controlData.phParams.length === 1 && !controlData.phParams[0].label) {
            phTitle = csSpecTitleCell('pH', formatControlSamplePhLimit(controlData.phParams[0].limit));
          } else {
            phTitle = csTitleCell(buildControlSamplePhHeaderLines(controlData.phParams));
          }
          const phReplacement = buildCsTable(
            phTable2.tableXml,
            phTitle,
            (row, month) => formatControlSamplePhCell(row.intervals[month].ph),
          );
          docXml = docXml.substring(0, phTable2.start) + phReplacement + docXml.substring(phTable2.end);
          console.log(`  ✅ Section 7 control sample tables replaced (${controlData.batches.length} batches)`);
        }

        const remarkTable2 = extractDocxTableAfterAnchor(docXml, csAnchor, 2);
        if (remarkTable2) {
          const productLabel = (
            ((data as { generic_name?: string }).generic_name || data.product_name || '') as string
          ).trim().toUpperCase();
          const remarkText =
            `Review of control sample for ${productLabel} found Satisfactory as per periodic `
            + 'review schedule and no discrepancy found during the review period.';
          const remarkPara = '<w:p><w:pPr><w:spacing w:before="0"/>'
            + '<w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:pPr>'
            + '<w:r><w:rPr><w:b/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>'
            + '<w:t xml:space="preserve">Remark:</w:t></w:r></w:p>'
            + '<w:p><w:pPr><w:spacing w:before="0"/>'
            + '<w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:pPr>'
            + '<w:r><w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>'
            + `<w:t xml:space="preserve">${xmlEscape(remarkText)}</w:t></w:r></w:p>`;

          let remarkTbl = remarkTable2.tableXml;
          const remarkRowMatch = remarkTbl.match(/<w:tr\b[\s\S]*?Remark:[\s\S]*?<\/w:tr>/);
          if (remarkRowMatch) {
            const newRemarkRow = '<w:tr><w:trPr><w:jc w:val="center"/></w:trPr>'
              + '<w:tc><w:tcPr><w:gridSpan w:val="2"/><w:vAlign w:val="top"/></w:tcPr>'
              + remarkPara
              + '</w:tc></w:tr>';
            remarkTbl = remarkTbl.replace(remarkRowMatch[0], newRemarkRow);
            docXml = docXml.substring(0, remarkTable2.start) + remarkTbl + docXml.substring(remarkTable2.end);
            console.log('  ✅ Section 7 control sample remark updated');
          }
        }
      }
    } else if (controlData) {
      console.warn('Section 7: No control sample batches — tables left unchanged');
    }
  }

  // ── 11c. Dynamic Section 5.3.2 – Finished Product Analysis Tables ──
  //
  // Generates one or more tables from `data.finish532Tables`:
  //   • One "Critical Parameters" table per pharmacopoeia (IP, USP, …),
  //     split into sub-tables of ≤ 3 parameter columns each.
  //   • One "Organic Impurities" table when Early/Late-Eluting data exists.
  //
  // The first table replaces the existing static 5.3.2 template table.
  // Any additional tables are inserted as new paragraphs+tables in-place.
  if (data.finish532Tables && (data.finish532Tables as any[]).length > 0) {
    const fp532Tables: any[] = data.finish532Tables as any[];
    console.log(`\n📋 Section 5.3.2: generating ${fp532Tables.length} table(s)`);

    // ── Locate the template table after the section heading ──
    // "Finished Product Analysis" appears once in the TOC and once in the body.
    const fpBodyHeading = 'Finished Product Analysis';
    let fpBodyIdx = docXml.indexOf(fpBodyHeading);
    if (fpBodyIdx !== -1) fpBodyIdx = docXml.indexOf(fpBodyHeading, fpBodyIdx + fpBodyHeading.length);

    if (fpBodyIdx === -1) {
      console.warn('⚠️ Section 5.3.2: body heading not found — tables not replaced');
    } else {
      const fp532TplStart = docXml.indexOf('<w:tbl', fpBodyIdx);
      if (fp532TplStart === -1) {
        console.warn('⚠️ Section 5.3.2: template table not found after heading');
      } else {
        // Walk to end of template table
        let fp532Depth = 0, fp532TplEnd = -1;
        const fp532Rx = /<\/?w:tbl\b[^>]*>/g;
        fp532Rx.lastIndex = fp532TplStart;
        let fp532M;
        while ((fp532M = fp532Rx.exec(docXml)) !== null) {
          if (fp532M[0].startsWith('<w:tbl')) fp532Depth++;
          else if (fp532M[0].startsWith('</w:tbl')) {
            fp532Depth--;
            if (fp532Depth === 0) { fp532TplEnd = fp532M.index + fp532M[0].length; break; }
          }
        }

        if (fp532TplEnd === -1) {
          console.warn('⚠️ Section 5.3.2: could not find end of template table');
        } else {
          // Capture the original table properties for reuse
          const fp532OrigXml = docXml.substring(fp532TplStart, fp532TplEnd);
          const fp532TblPr = fp532OrigXml.match(/<w:tblPr>[\s\S]*?<\/w:tblPr>/)?.[0]
            || '<w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:jc w:val="center"/>'
            + '<w:tblBorders>'
            + '<w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
            + '<w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
            + '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
            + '<w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
            + '<w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
            + '<w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
            + '</w:tblBorders></w:tblPr>';

          // ── Per-table XML builders ──────────────────────────────────────

          /** Shaded bold header cell (grey background). Supports vMerge and gridSpan. */
          const fp532Hdr = (
            text: string,
            opts?: { vMerge?: 'restart' | 'continue'; gridSpan?: number },
          ) => {
            let tcPr = '<w:shd w:val="clear" w:color="auto" w:fill="D9D9D9"/><w:vAlign w:val="center"/>';
            if (opts?.vMerge === 'restart') tcPr = '<w:vMerge w:val="restart"/>' + tcPr;
            else if (opts?.vMerge === 'continue') tcPr = '<w:vMerge/>' + tcPr;
            if (opts?.gridSpan) tcPr += `<w:gridSpan w:val="${opts.gridSpan}"/>`;
            const rPr = '<w:rPr><w:b/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>';
            const pPr = `<w:pPr><w:spacing w:before="0"/><w:jc w:val="center"/>${rPr}</w:pPr>`;
            const lines = (text || '').split('\n');
            let body = '';
            lines.forEach((line, li) => {
              const para = li === 0 ? pPr : `<w:pPr><w:spacing w:before="0"/><w:jc w:val="center"/></w:pPr>`;
              body += `<w:p>${para}${line.trim() ? `<w:r>${rPr}<w:t xml:space="preserve">${xmlEscape(line)}</w:t></w:r>` : ''}</w:p>`;
            });
            return `<w:tc><w:tcPr>${tcPr}</w:tcPr>${body}</w:tc>`;
          };

          /**
           * Normal data cell (no shading).
           * Multi-line values (containing '\n') produce multiple <w:p> paragraphs
           * so they render on separate lines inside the same cell.
           */
          const fp532Data = (text: string, opts?: { gridSpan?: number; shaded?: boolean; vMerge?: 'restart' | 'continue' }) => {
            let tcPr = '<w:vAlign w:val="center"/>';
            if (opts?.vMerge === 'restart') tcPr = '<w:vMerge w:val="restart"/>' + tcPr;
            else if (opts?.vMerge === 'continue') tcPr = '<w:vMerge/>' + tcPr;
            if (opts?.shaded) tcPr += '<w:shd w:val="clear" w:color="auto" w:fill="D9D9D9"/>';
            if (opts?.gridSpan) tcPr += `<w:gridSpan w:val="${opts.gridSpan}"/>`;
            const rPr = '<w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>';
            const pPr = `<w:pPr><w:spacing w:before="0"/><w:jc w:val="center"/>${rPr}</w:pPr>`;
            const lines = (text || '').split('\n');
            const body = lines.map(
              line => `<w:p>${pPr}<w:r>${rPr}<w:t xml:space="preserve">${xmlEscape(line)}</w:t></w:r></w:p>`,
            ).join('');
            return `<w:tc><w:tcPr>${tcPr}</w:tcPr>${body || `<w:p>${pPr}</w:p>`}</w:tc>`;
          };

          /** Build the tblGrid for fixed (Batch, AR) + N dynamic columns. */
          const fp532Grid = (nCols: number) => {
            const paramW = Math.max(1200, Math.floor(7200 / Math.max(nCols, 1)));
            return '<w:tblGrid>'
              + '<w:gridCol w:w="1300"/>'   // Batch Number
              + '<w:gridCol w:w="1600"/>'   // AR. Number
              + Array.from({ length: nCols }, () => `<w:gridCol w:w="${paramW}"/>`).join('')
              + '</w:tblGrid>';
          };

          /**
           * Build one complete <w:tbl> XML string from a Finish532Table object.
           *
           * Table header (3 rows):
           *   Row 0: Batch [vMerge] | AR [vMerge] | critParamsTitle [span=N]
           *   Row 1: [cont] | [cont] | (hasGroupRow → groupLabel [span=N])
           *                           (else         → col.name per col)
           *   Row 2: [cont] | [cont] | (hasGroupRow → col.name per col)
           *                           (else         → col.subHeader per col)
           * Limit data row:
           *   "Limit →" [span=2, shaded] | col.limitText per col
           * Data rows:
           *   batchNumber | arNumber | values per col
           */
          const buildFp532TableXml = (tbl: any): string => {
            const cols: any[] = tbl.columns || [];
            const N = cols.length;

            // Row 0
            const row0 = '<w:tr><w:trPr><w:trHeight w:val="400"/></w:trPr>'
              + fp532Hdr('Batch\nNumber', { vMerge: 'restart' })
              + fp532Hdr('AR.\nNumber', { vMerge: 'restart' })
              + fp532Hdr(tbl.critParamsTitle, { gridSpan: N })
              + '</w:tr>';

            // Row 1
            let row1 = '<w:tr><w:trPr><w:trHeight w:val="400"/></w:trPr>'
              + fp532Hdr('', { vMerge: 'continue' })
              + fp532Hdr('', { vMerge: 'continue' });
            if (tbl.hasGroupRow) {
              row1 += fp532Hdr(tbl.groupLabel, { gridSpan: N });
            } else {
              for (const col of cols) row1 += fp532Hdr(col.name);
            }
            row1 += '</w:tr>';

            // Row 2
            let row2 = '<w:tr><w:trPr><w:trHeight w:val="400"/></w:trPr>'
              + fp532Hdr('', { vMerge: 'continue' })
              + fp532Hdr('', { vMerge: 'continue' });
            if (tbl.hasGroupRow) {
              for (const col of cols) row2 += fp532Hdr(col.name);
            } else {
              for (const col of cols) row2 += fp532Hdr(col.subHeader || '');
            }
            row2 += '</w:tr>';

            // Limit data row
            const limitRow = '<w:tr>'
              + fp532Data('Limit \u2192', { gridSpan: 2, shaded: true })
              + cols.map((col: any) => fp532Data(col.limitText || '')).join('')
              + '</w:tr>';

            // Data rows.
            //
            // A single batch may have several finished-product COAs (distinct AR
            // numbers, e.g. D25K11 → FIPAR250961 + FIPAR250962). Those rows are
            // vertically merged: the Batch Number cell, and every parameter
            // column whose value is identical across the group, span the rows;
            // columns that differ (e.g. Uniformity of Volume) stay as separate
            // stacked cells. AR Number is always per-row. (Mirrors the reference
            // layout in the APQR template.)
            let dataRowsXml = '';
            const rows: any[] = tbl.dataRows || [];
            let ri = 0;
            while (ri < rows.length) {
              // Rows for one batch are emitted consecutively (ordered by batch),
              // so a forward scan collects the whole group.
              let rj = ri + 1;
              while (rj < rows.length && (rows[rj].batchNumber || '') === (rows[ri].batchNumber || '')) rj++;
              const group = rows.slice(ri, rj);
              const groupSize = group.length;

              // Columns whose value is identical across the whole group are merged.
              const colMergeable: boolean[] = (group[0].values || []).map((_: any, c: number) =>
                groupSize > 1 && group.every((r: any) => (r.values?.[c] || '') === (group[0].values?.[c] || '')),
              );

              group.forEach((row: any, gi: number) => {
                dataRowsXml += '<w:tr>';

                // Batch Number — merged across the group.
                if (groupSize > 1) {
                  dataRowsXml += fp532Data(gi === 0 ? (row.batchNumber || '') : '',
                    { vMerge: gi === 0 ? 'restart' : 'continue' });
                } else {
                  dataRowsXml += fp532Data(row.batchNumber || '');
                }

                // AR Number — always its own cell per COA.
                dataRowsXml += fp532Data(row.arNumber || '');

                // Parameter columns — merge only where the value is shared.
                (row.values || []).forEach((val: string, c: number) => {
                  if (colMergeable[c]) {
                    dataRowsXml += fp532Data(gi === 0 ? (val || '') : '',
                      { vMerge: gi === 0 ? 'restart' : 'continue' });
                  } else {
                    dataRowsXml += fp532Data(val || '');
                  }
                });

                dataRowsXml += '</w:tr>';
              });

              ri = rj;
            }

            return '<w:tbl>'
              + fp532TblPr
              + fp532Grid(N)
              + row0 + row1 + row2
              + limitRow
              + dataRowsXml
              + '</w:tbl>';
          };

          /** Render an "AS PER IP:" heading paragraph between tables. */
          const specHeadingPara = (label: string): string => {
            if (!label) return '';
            const rPr = '<w:rPr><w:b/><w:u w:val="single"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>';
            return '<w:p><w:pPr><w:spacing w:before="120" w:after="60"/>'
              + `${rPr}</w:pPr>`
              + `<w:r>${rPr}<w:t xml:space="preserve">${xmlEscape(label)}</w:t></w:r></w:p>`;
          };

          // ── Assemble all replacement XML ────────────────────────────────
          let fp532Replacement = '';
          for (const tbl of fp532Tables) {
            if (tbl.specificationLabel) {
              fp532Replacement += specHeadingPara(tbl.specificationLabel);
            }
            fp532Replacement += buildFp532TableXml(tbl);
            // Spacing paragraph between tables
            fp532Replacement += '<w:p><w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr></w:p>';
          }

          // ── Per-pharmacopoeia Process Capability + Control Limit tables ──
          // Computed from the numeric 5.3.2 columns (pH, Uniformity, Osmolality,
          // Assay) and placed directly after the finished-product data tables.
          const finish532Capability = buildFinish532Capability(fp532Tables);
          fp532Replacement += buildFinish532CapabilityBlockXml(finish532Capability, xmlEscape);

          // ── Per-pharmacopoeia finished-product trend charts ──
          // Replaces the stale single-spec template charts (chart6–10) with one
          // native chart per numeric column per spec. Does the combined splice
          // (data tables + capability block + charts) itself.
          const prodNameForCharts = ((data as any).product_name || (data as any).product_code || '').toString();
          const docXmlWithCharts = await generateFinish532Charts(
            zip, docXml, finish532Capability, prodNameForCharts,
            fp532TplStart, fp532TplEnd, fp532Replacement, xmlEscape,
          );

          if (docXmlWithCharts !== docXml) {
            docXml = docXmlWithCharts;   // charts found & spliced (incl. tables)
            console.log(`  ✅ Section 5.3.2: tables + ${finish532Capability.reduce((a, s) => a + s.columns.length, 0)} trend chart(s) generated`);
          } else {
            // Chart region not found — fall back to inserting just the tables.
            docXml = docXml.substring(0, fp532TplStart) + fp532Replacement + docXml.substring(fp532TplEnd);
            console.log(`  ✅ Section 5.3.2: replaced template table with ${fp532Tables.length} table(s) (charts not located)`);
          }
        }
      }
    }
  } else {
    console.log('ℹ️  Section 5.3.2: no finish532Tables — template table left unchanged');
  }

  // ── 15. Sections 9–19 — Excel-backed quality reviews (NIL when no batch match) ──
  {
    const apqrBatchNumbers = (data.batches || []).map((b: { b_num?: string }) =>
      String(b.b_num || '').trim(),
    ).filter(Boolean);

    if (apqrBatchNumbers.length > 0) {
      const reviewCatalog = await loadReviewExcelCatalog();
      const { docXml: updatedXml, results } = applyApqrExcelReviewSections(
        docXml,
        apqrBatchNumbers,
        reviewCatalog,
        xmlEscape,
      );
      docXml = updatedXml;
      logApqrReviewSectionReport(results);
    } else {
      console.warn('  ⚠️ Sections 9–19: no APQR batches — review tables left unchanged');
    }
  }

  // ── 12. Write modified XML back and generate output ─────────
  zip.file('word/document.xml', docXml);

  const buffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  // Sanity check: first 4 bytes must be the ZIP magic number PK\x03\x04
  const magic = buffer.subarray(0, 4).toString('hex').toUpperCase();
  if (magic !== '504B0304') {
    throw new Error(`Generated file is not a valid ZIP/DOCX (magic: ${magic})`);
  }

  console.log('✓ DOCX generated successfully:', buffer.length, 'bytes');
  return buffer;
}