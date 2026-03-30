import { Batch } from '@/models/Batch';
import { Formula } from '@/models/Formula';
import { RMCOA } from '@/models/RMCOA';
import { ProductMaster } from '@/models/ProductMaster';
import { InwardRegister } from '@/models/InwardRegister';
import { Requisition } from '@/models/Requisition';
import { MaterialRejection } from '@/models/MaterialRejection';
import { COA } from '@/models/COA';
import Yield from '@/models/Yield';
import type { CompositionItem, ProcessData } from '@/types/formula';
import connectToDatabase from '@/lib/mongodb';
import JSZip from 'jszip';
import fs from 'fs';
import path from 'path';

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
  assaySpecs: { specName: string; limit: string }[]; // dynamic: [{ specName:"IP", limit:"..." }, ...]
  rows: RMTestRow512[];
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

interface FinishInProcessColumn {
  key: string;
  type: string;
  name: string;
  limit: string;
  isQuantifiable: boolean;
}

interface FinishInProcessRow {
  batchNumber: string;
  batchSize: string;
  arNumber: string;
  results: Record<string, string>;
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

export interface ProcessCapabilityResults {
  average: number;
  max: number;
  min: number;
  lsl: number;
  usl: number;
  sigmaEstimated: number; // Short-term (moving range)
  sigmaSample: number;    // Long-term (sample std dev)
  cpku: number;
  cpkl: number;
  cpk: number;
  cp: number;
  ppku: number;
  ppkl: number;
  ppk: number;
  pp: number;
  isCapable: boolean; // true if all > 1.33
}

/**
 * Parses numerical limits from strings like "(5.0 to 8.0)" or "90.0 % to 120.0 % Of labeled amount"
 */
function parseLimits(limitString: string): { lsl: number | null, usl: number | null } {
  // Extract all numbers (including decimals) from the string
  const matches = limitString.match(/[-+]?[0-9]*\.?[0-9]+/g);
  if (!matches || matches.length < 2) return { lsl: null, usl: null };
  const n1 = parseFloat(matches[0]);
  const n2 = parseFloat(matches[1]);
  return {
    lsl: Math.min(n1, n2),
    usl: Math.max(n1, n2)
  };
}

function calculateAverage(data: number[]): number {
  if (data.length === 0) return 0;
  const sum = data.reduce((acc, val) => acc + val, 0);
  return sum / data.length;
}

/**
 * Calculates Sample Standard Deviation (S) for long-term variation
 */
function calculateSampleStdDev(data: number[], mean: number): number {
  if (data.length < 2) return 0; // Need at least 2 points
  const sumSq = data.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0);
  return Math.sqrt(sumSq / (data.length - 1));
}

/**
 * Calculates Estimated Standard Deviation (σ) using Moving Range (MR) for short-term variation
 * Uses d2 = 1.128 for subgroup size n=2
 */
function calculateEstimatedStdDevMR(data: number[]): number {
  if (data.length < 2) return 0;
  let mrSum = 0;
  for (let i = 1; i < data.length; i++) {
    mrSum += Math.abs(data[i] - data[i - 1]);
  }
  const avgMr = mrSum / (data.length - 1);
  return avgMr / 1.128; // 1.128 is d2 for n=2
}

/**
 * Computes all Process Capability & Performance parameters
 */
function calculateProcessCapability(data: number[], limitStr: string): ProcessCapabilityResults | null {
  const nums = data.filter(n => !isNaN(n));
  if (nums.length < 2) return null; // Need at least 2 points

  const { lsl, usl } = parseLimits(limitStr);
  if (lsl === null || usl === null) return null;

  const average = calculateAverage(nums);
  const max = Math.max(...nums);
  const min = Math.min(...nums);

  const sigmaSample = calculateSampleStdDev(nums, average);    // S (Long-term)
  const sigmaEst = calculateEstimatedStdDevMR(nums);             // σ (Short-term)

  // Capability indices require non-zero standard deviation
  if (sigmaEst === 0 || sigmaSample === 0) return null;

  // Short-term (Cp, Cpk)
  const cpku = (usl - average) / (3 * sigmaEst);
  const cpkl = (average - lsl) / (3 * sigmaEst);
  const cpk = Math.min(cpku, cpkl);
  const cp = (usl - lsl) / (6 * sigmaEst);

  // Long-term (Pp, Ppk)
  const ppku = (usl - average) / (3 * sigmaSample);
  const ppkl = (average - lsl) / (3 * sigmaSample);
  const ppk = Math.min(ppku, ppkl);
  const pp = (usl - lsl) / (6 * sigmaSample);

  const isCapable = cpk > 1.33 && cp > 1.33 && ppk > 1.33 && pp > 1.33;

  return {
    average, max, min, lsl, usl,
    sigmaEstimated: sigmaEst, sigmaSample,
    cpku, cpkl, cpk, cp,
    ppku, ppkl, ppk, pp,
    isCapable
  };
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

          const VOLUME_UNITS = new Set(['LTR', 'L', 'ML', 'KG', 'G', 'GM', 'GMS']);

          const parseQtyUnit = (s: string): { qty: number; unit: string } => {
            const clean = (s || '').toUpperCase().trim();
            const m = clean.match(/^([\d.]+)\s*([A-Z]*)$/);
            if (m) return { qty: parseFloat(m[1]) || 0, unit: m[2].trim() };
            return { qty: 0, unit: '' };
          };

          // Collect all (qty, unit) pairs from existing + new record
          const existingParts = (existing.batchSize || '')
            .split(',')
            .map((p: string) => p.trim())
            .filter(Boolean);
          const newPartStr = `${batch.batchSize || ''} ${batch.unit || ''}`.trim();

          const allParts: Array<{ qty: number; unit: string }> = [
            ...existingParts.map(parseQtyUnit),
            parseQtyUnit(newPartStr),
          ].filter(p => p.qty > 0);

          const hasVolume = allParts.some(p => VOLUME_UNITS.has(p.unit));

          if (hasVolume) {
            // Sum only volume-unit parts; discard count-unit parts (BOT, NOS, etc.)
            const volumeParts = allParts.filter(p => VOLUME_UNITS.has(p.unit));
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
          // ── New batch: format initial size cleanly ──
          const batchSizeRaw = (batch.batchSize || '').toString().trim();
          const batchUnitRaw = (batch.unit || '').toString().trim().toUpperCase();
          const batchSizeNum = parseFloat(batchSizeRaw);
          const formattedBatchNum = !isNaN(batchSizeNum)
            ? (Number.isInteger(batchSizeNum)
              ? batchSizeNum.toString()
              : batchSizeNum.toFixed(2).replace(/\.?0+$/, ''))
            : batchSizeRaw;
          const initialFormattedSize = batchUnitRaw
            ? `${formattedBatchNum} ${batchUnitRaw}`
            : formattedBatchNum;

          uniqueBatches.set(key, {
            ...batch,
            batchSize: initialFormattedSize,
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

  // Set of batch numbers confirmed in the review period — used to filter AR entries
  const finalBatchNumbersSet = new Set<string>(finalBatches.map((b: any) => b.batchNumber));

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

  // Volume units are meaningful for batch size display; count units (BOT/NOS) are not.
  // If a batch only has a count unit, fall back to the formula's batch size (LTR).
  const VOLUME_UNITS_DISPLAY = new Set(['LTR', 'L', 'ML', 'KG', 'G', 'GM', 'GMS']);
  const COUNT_UNITS_DISPLAY = new Set(['BOT', 'NOS', 'PCS', 'UNIT', 'UNITS', 'NO', 'EA']);

  const normalizeBatchSizeDisplay = (rawSize: string): string => {
    if (!rawSize || rawSize === 'N/A') return rawSize;
    // Parse unit from size string e.g. "4820 BOT" → unit="BOT"
    const m = rawSize.toUpperCase().trim().match(/^([\d.,]+)\s*([A-Z]*)$/);
    if (!m) return rawSize;
    const unit = m[2].trim();
    // If it's a count unit and we have a formula batch size, use formula batch size instead
    if (COUNT_UNITS_DISPLAY.has(unit) && formulaBatchSizeNumeric > 0) {
      return `${formulaBatchSizeNumeric} LTR`;
    }
    return rawSize;
  };

  // Prepare batch table data
  const batchTable = finalBatches.map(b => ({
    b_month: FULL_MONTHS[b.parsedMfgDate.getMonth()],
    b_num: b.batchNumber || 'N/A',
    b_size: normalizeBatchSizeDisplay(b.batchSize || 'N/A'),
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


  // ── Section 5.3.2 — Finish Stage COA Analysis Results ──
  const finishInProcessData: FinishInProcessRow[] = [];
  const finishColumnsMap = new Map<string, FinishInProcessColumn>();

  if (finalBatches.length > 0) {
    const batchNumbers = finalBatches.map((b: any) => b.batchNumber);
    console.log(`\n📋 Section 5.3.2: Fetching FINISH COAs for ${batchNumbers.length} batches`);

    const finishCoas = await COA.find({
      batchNumber: { $in: batchNumbers },
      stage: 'FINISH',
    }).sort({ uploadedAt: -1 }).lean();

    // Group COAs by batch (keep ALL COAs for multiple ARs)
    const coasByBatchFinish = new Map<string, any[]>();
    for (const coa of finishCoas) {
      if (!coasByBatchFinish.has(coa.batchNumber)) {
        coasByBatchFinish.set(coa.batchNumber, []);
      }
      coasByBatchFinish.get(coa.batchNumber)!.push(coa);
    }

    // Process batches to gather all possible columns and their values
    for (const batch of finalBatches) {
      const coas = coasByBatchFinish.get(batch.batchNumber) || [];
      if (coas.length === 0) {
        console.warn(`  ⚠️ No FINISH COA found for batch ${batch.batchNumber}`);
        continue;
      }

      for (const coa of coas) {
        if (!coa.finishData) continue;
        const fd = coa.finishData;
        const arNumber = coa.arNumber || fd.arNumber || '';
        const batchResults: Record<string, string> = {};

        // Helper to process a parameter and update columns
        const processParam = (category: string, name: string, limit: string, result: string, forceNonQuantifiable = false, isMissingCompliesFallback = false) => {
          name = name.trim();
          limit = limit.trim();
          if (!name) return;

          let cleanedLimit = limit;
          if (cleanedLimit.includes('\n')) cleanedLimit = cleanedLimit.split('\n')[0].trim();
          if (category === 'ph') cleanedLimit = cleanedLimit.replace(/^Between\s*/i, '').trim();

          const colKey = `${category}|||${name}`; // Removed limit from colKey to group by test

          if (!finishColumnsMap.has(colKey)) {
            finishColumnsMap.set(colKey, { key: colKey, type: category, name, limit: cleanedLimit, isQuantifiable: false });
          }

          const colDef = finishColumnsMap.get(colKey)!;

          let finalResult = result.trim();
          if (!finalResult && isMissingCompliesFallback) finalResult = 'Complies';
          if (!finalResult) finalResult = '--';

          // Check for numbers to determine if quantifiable
          if (!forceNonQuantifiable && !colDef.isQuantifiable && /\d/.test(finalResult)) {
            colDef.isQuantifiable = true;
          }

          // Notice we don't need `${colKey}|||limit` but I'll leave it in the objects
          // just in case it is queried elsewhere. What goes in the Result cell is `-result`.
          batchResults[`${colKey}|||limit`] = limit || '--';
          batchResults[`${colKey}|||result`] = finalResult;
        };

        // 1. Critical Parameters
        for (const cp of (fd.criticalParameters || [])) {
          let cat = 'critical';
          const n = (cp.name || '').toUpperCase().trim();
          if (n === 'PH') cat = 'ph';
          // Description is always non-quantifiable even if it contains "10ml"
          const forceNonQuant = n === 'DESCRIPTION';
          processParam(cat, cp.name || '', cp.limit || '', cp.result || '', forceNonQuant);
        }

        // 2. Identification Tests
        for (const id of (fd.identificationTests || [])) {
          processParam('identification', id.compound || '', id.specification || '', id.result || '', true, true);
        }

        // 3. Related Substances
        for (const rs of (fd.relatedSubstances || [])) {
          processParam('related_substance', rs.compound || '', rs.limit || '', rs.result || '', false, true);
        }

        // 4. Assay Results
        for (const a of (fd.assayResults || [])) {
          processParam('assay', a.compound || '', a.specification || '', a.result || '');
        }

        // 5. Explicit uniformity, capping, sterility if not in criticalParameters
        if (fd.uniformityOfVolume && fd.uniformityOfVolume.name) {
          processParam('critical', fd.uniformityOfVolume.name, fd.uniformityOfVolume.limits || '', fd.uniformityOfVolume.result || '');
        }
        if (fd.capping && fd.capping.name) {
          // Normalize capping result
          let cr = fd.capping.result || '';
          if (cr.toLowerCase().includes('properly placed')) cr = 'Cap Properly Placed';
          if (cr.toLowerCase().includes('complies')) cr = 'Complies';
          processParam('critical', fd.capping.name, fd.capping.limits || '', cr, true, true);
        }
        if (fd.sterility && fd.sterility.name) {
          // Normalize sterility
          let sr = fd.sterility.result || '';
          if (sr.toLowerCase().includes('growth or turbidity was not present')) sr = 'Complies';
          if (sr.toLowerCase().includes('complies')) sr = 'Complies';
          processParam('critical', fd.sterility.name, fd.sterility.limits || '', sr, true, true);
        }

        finishInProcessData.push({
          batchNumber: batch.batchNumber,
          batchSize: batch.batchSize || 'N/A',
          arNumber,
          results: batchResults
        });
      }
    }
    console.log(`✅ Section 5.3.2: ${finishInProcessData.length} rows, found ${finishColumnsMap.size} distinct parameter columns`);
  }

  const finishInProcessColumns = Array.from(finishColumnsMap.values());

  // ── Section 5.4.2 — At Finished Stage: Yield Data ──
  interface YieldRow542 {
    batchNo: string;
    yieldLines: string[];  // proportional yield per item code e.g. "19.16% (23553)"
    avgYield: number;      // actualYield from DB
  }
  const yieldRows542: YieldRow542[] = [];

  if (finalBatches.length > 0) {
    const batchNumbers542 = finalBatches.map((b: any) => b.batchNumber);
    console.log(`\n📋 Section 5.4.2: Fetching Yield data for ${batchNumbers542.length} batches`);

    const yieldDocs = await Yield.find({ batchNo: { $in: batchNumbers542 } }).lean();
    const yieldByBatch = new Map<string, any>();
    for (const yd of yieldDocs) {
      if (!yieldByBatch.has(yd.batchNo)) {
        yieldByBatch.set(yd.batchNo, yd);
      }
    }

    for (const batch of finalBatches) {
      const yd = yieldByBatch.get(batch.batchNumber);
      if (!yd) {
        console.warn(`  ⚠️ No Yield record found for batch ${batch.batchNumber}`);
        continue;
      }

      const totalBatchSize = parseFloat(yd.batchSizeLtrOrKg) || 0;
      const actualYield: number = typeof yd.actualYield === 'number' ? yd.actualYield : 0;
      const packingDetails: any[] = Array.isArray(yd.packingDetails) ? yd.packingDetails : [];

      let yieldLines: string[];
      if (packingDetails.length === 0 || totalBatchSize === 0) {
        yieldLines = [`${actualYield.toFixed(2)}%`];
      } else {
        yieldLines = packingDetails.map((pd: any) => {
          const itemBatchSize = parseFloat(pd.batchSize) || 0;
          const itemYield = totalBatchSize > 0 ? (itemBatchSize / totalBatchSize) * actualYield : 0;
          return `${itemYield.toFixed(2)}% (${pd.itemCode})`;
        });
      }

      yieldRows542.push({ batchNo: yd.batchNo, yieldLines, avgYield: actualYield });
    }
    console.log(`✅ Section 5.4.2: ${yieldRows542.length} yield rows`);
  }

  return {
    company_name: formula.companyInfo?.companyName || 'INDIANA OPHTHALMICS LLP',
    company_address: formula.companyInfo?.companyAddress || '132, 135, 136, 137, GIDC ESTATE, WADHWAN CITY',

    // From Product Master
    product_name: cleanProductName(productMaster?.productName || ''),
    product_code: productCode,
    generic_name: productMaster?.genericName || '',
    therapeutic_category: productMaster?.therapeuticCategory || '',
    storage_condition: productMaster?.storageCondition || '',

    // From Formula Master — support 1 or more label claims (IP, USP, etc.)
    label_claims: buildLabelClaimsText(formula.batchInfo),
    label_claim: buildLabelClaimsText(formula.batchInfo)[0] || '',
    shelf_life: formula.masterFormulaDetails?.shelfLife || '',
    mfg_lic_no: formula.masterFormulaDetails?.manufacturingLicenseNo || '',

    dosage_form: '',
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
    finishInProcessData,           // Section 5.3.2 - In-Process Analysis Results at Finish Stage
    finishInProcessColumns,        // Section 5.3.2 - Dynamic columns across all batches
    yieldData542: yieldRows542,    // Section 5.4.2 - At Finished Stage yield data

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
  const fieldReplacements: [string, string][] = [
    ['Product Name:', data.product_name],
    ['Generic Name:', data.generic_name],
    ['Product Code:', data.product_code],
    ['Dosage Form:', data.dosage_form],
    ['Label Claim:', data.label_claim],
    ['Therapeutic Category:', data.therapeutic_category],
    ['Storage Condition:', data.storage_condition],
    ['Shelf Life:', data.shelf_life],
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
        const min = Math.min(...vals);
        const max = Math.max(...vals);
        const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
        const sd = Math.sqrt(vals.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / vals.length);
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
        return chartXml.replace(/<c:ser>([\s\S]*?)<\/c:ser>/g, (match, content) => {
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

      // chart2.xml → LOD (2 series: actual, NMT only)
      const chart2Xml = await zip.file('word/charts/chart2.xml')!.async('string');
      const lodSeries: { name: string; values: number[] }[] = [
        { name: '% Water', values: waterVals },
        ...(waterLims.nmt !== undefined ? [{ name: `NMT ${waterLims.nmt}%`, values: limitLine(waterLims.nmt, n) }] : []),
      ];
      zip.file('word/charts/chart2.xml', updateChartXml(chart2Xml, lodSeries));

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
          console.log(`  ✅ Section 5.3.1 data table + remark table replaced (${totalCols} columns, ${assayCols.length} assay col(s))`);
        } else {
          docXml = docXml.substring(0, tblStart531) + replacementTable531 + docXml.substring(tblEnd531);
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
    const cpkAnchorStr = 'Process Capability &amp; Performance parameters (Cp, Cpk, and Pp, Ppk)';
    let cpkTblStart = -1;
    let cpkTblEndFull = -1;
    let origCpkTable = '';
    {
      let searchFrom = 0;
      while (true) {
        const anchorIdx = docXml.indexOf(cpkAnchorStr, searchFrom);
        if (anchorIdx === -1) break;
        const nextTbl = docXml.indexOf('<w:tbl', anchorIdx);
        if (nextTbl !== -1) {
          const afterTbl = docXml.substring(nextTbl);
          let depth = 0;
          let endOff = -1;
          const regex = /<\/?w:tbl\b[^>]*>/g;
          let match;
          while ((match = regex.exec(afterTbl)) !== null) {
            if (match[0].startsWith('<w:tbl')) depth++;
            else if (match[0].startsWith('</w:tbl')) {
              depth--;
              if (depth === 0) { endOff = match.index + match[0].length; break; }
            }
          }
          if (endOff !== -1) {
            const tbl = afterTbl.substring(0, endOff);
            const rowCount = [...tbl.matchAll(/<w:tr\b/g)].length;
            if (rowCount >= 15) {
              cpkTblStart = nextTbl;
              cpkTblEndFull = nextTbl + endOff;
              origCpkTable = tbl;
              console.log(`  🔍 Found Cpk data table at index ${nextTbl} with ${rowCount} rows`);
              break;
            }
          }
        }
        searchFrom = anchorIdx + cpkAnchorStr.length;
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

      docXml = docXml.substring(0, cpkTblStart) + replacementCpkTable + docXml.substring(cpkTblEndFull);
      console.log(`  ✅ Process Capability table replaced (${cpkTotalDataCols} columns, ${cpkAssayCols.length} assay col(s))`);
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
    const phUcl531 = phStats531 ? phStats531.average + 3 * phStats531.sigmaEstimated : undefined;
    const phLcl531 = phStats531 ? phStats531.average - 3 * phStats531.sigmaEstimated : undefined;

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
      const assayUcl531 = assayStats531 ? assayStats531.average + 3 * assayStats531.sigmaEstimated : undefined;
      const assayLcl531 = assayStats531 ? assayStats531.average - 3 * assayStats531.sigmaEstimated : undefined;

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

  // ── 11c. Dynamic Section 5.3.2 – In-Process Analysis Results at Finish Stage ──
  // Always runs — replaces the template table whether or not FINISH COA data exists.
  // This ensures switching products clears the previous product's stale values.
  {
    const finishRows: any[] = data.finishInProcessData || [];
    console.log(`\n📋 Section 5.3.2 Finish In-Process: ${finishRows.length} rows`);

    // Find the 5.3.2 table by its anchor text
    const finishTableAnchors = ['5.3.2', 'Finished Product Analysis', 'Finished Product'];
    let finishTblStart = -1;
    let finishTblEnd = -1;
    // Allow searching from earlier in the document to avoid missing 5.3.2
    const searchStartPos532 = Math.floor(docXml.length * 0.1);
    console.log(`  5.3.2 DEBUG: docXml.length=${docXml.length}, searchStartPos=${searchStartPos532}`);

    // Try finding "5.3.2" and checking if it's followed by a table
    for (const anchor of finishTableAnchors) {
      let anchorIdx = docXml.indexOf(anchor, searchStartPos532);
      // If we find TOC occurrences, skip them by finding the last occurrence if it's early
      if (anchorIdx !== -1 && anchor === '5.3.2') {
        anchorIdx = docXml.lastIndexOf(anchor);
      }

      console.log(`  5.3.2 DEBUG: anchor="${anchor}" idx=${anchorIdx}`);
      if (anchorIdx === -1) continue;
      const nextTblIdx = docXml.indexOf('<w:tbl>', anchorIdx);
      const dist = nextTblIdx !== -1 ? nextTblIdx - anchorIdx : -1;
      console.log(`  5.3.2 DEBUG: nextTblIdx=${nextTblIdx}, distance=${dist}`);
      if (nextTblIdx === -1 || dist > 5000) continue;
      const tblEndIdx = docXml.indexOf('</w:tbl>', nextTblIdx);
      console.log(`  5.3.2 DEBUG: tblEndIdx=${tblEndIdx}`);
      if (tblEndIdx === -1) continue;
      finishTblStart = nextTblIdx;
      finishTblEnd = tblEndIdx + 8;
      console.log(`  ✅ Section 5.3.2: Found table via anchor "${anchor}" at [${nextTblIdx}..${finishTblEnd}]`);
      break;
    }
    console.log(`  5.3.2 DEBUG: finishTblStart=${finishTblStart}, finishTblEnd=${finishTblEnd}`);

    if (finishTblStart !== -1) {
      // ── Step 1: Identify bounds to replace ALL template tables in this section ──
      // The section starts at the first table after the anchor.
      // The section ends at the table containing "Remark:" (usually the last table in the section).
      let sectionContentStart = finishTblStart;
      let sectionContentEnd = finishTblEnd;

      // Use the Process Capability heading to reliably anchor the end of all 5.3.2 tables.
      // The original template uses 3 separate tables before this heading.
      const nextSectionHeading = docXml.indexOf('Process Capability &amp; Performance parameters', finishTblStart);
      let remarkTblPr532 = '<w:tblPr><w:tblW w:w="5000" w:type="pct"/></w:tblPr>';
      let remarkTblGrid532 = '<w:tblGrid><w:gridCol w:w="10000"/></w:tblGrid>';
      let signatureRow532 = '';

      // We also need origTblPr532 for our new data tables
      const origTable532 = docXml.substring(finishTblStart, finishTblEnd);
      const origTblPr532 = origTable532.match(/<w:tblPr>[\s\S]*?<\/w:tblPr>/)?.[0]
        || '<w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:jc w:val="center"/><w:tblBorders>'
        + '<w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
        + '<w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
        + '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
        + '<w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
        + '<w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
        + '<w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
        + '</w:tblBorders></w:tblPr>';

      if (nextSectionHeading !== -1 && (nextSectionHeading - finishTblStart) < 15000) {
        // The last table immediately before the "Process Capability" text is the Remark table.
        const remarkTblStart532 = docXml.lastIndexOf('<w:tbl>', nextSectionHeading);
        const remarkTblEnd532 = docXml.indexOf('</w:tbl>', remarkTblStart532);
        if (remarkTblStart532 !== -1 && remarkTblEnd532 !== -1 && remarkTblStart532 >= finishTblStart) {
          // Temporarily set section content end to remark
          sectionContentEnd = remarkTblEnd532 + 8;

          const origRemark = docXml.substring(remarkTblStart532, sectionContentEnd);
          remarkTblPr532 = origRemark.match(/<w:tblPr>[\s\S]*?<\/w:tblPr>/)?.[0] || remarkTblPr532;
          remarkTblGrid532 = origRemark.match(/<w:tblGrid>[\s\S]*?<\/w:tblGrid>/)?.[0] || remarkTblGrid532;
          const remarkOrigRows = [...origRemark.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)];
          signatureRow532 = remarkOrigRows.length > 1 ? remarkOrigRows[remarkOrigRows.length - 1][0] : '';

          // Now extend sectionContentEnd to capture the two redundant CPK tables AFTER the heading
          let currentIdx = nextSectionHeading;
          let tablesFound = 0;
          for (let i = 0; i < 2; i++) {
            const tStart = docXml.indexOf('<w:tbl>', currentIdx);
            if (tStart !== -1 && (tStart - currentIdx) < 8000) {
              const tEnd = docXml.indexOf('</w:tbl>', tStart);
              if (tEnd !== -1) {
                currentIdx = tEnd + 8;
                tablesFound++;
              }
            }
          }
          if (tablesFound === 2) {
            console.log(`  ✅ Found 2 CPK template tables after heading, removing them. Extended bound: ${currentIdx}`);
            sectionContentEnd = currentIdx;
          }
        }
      } else {
        // Fallback to checking for 5.3.3 if Process Capability is missing
        const fallbackHeading = docXml.indexOf('5.3.3', finishTblStart);
        if (fallbackHeading !== -1 && (fallbackHeading - finishTblStart) < 15000) {
          const remarkTblStart532 = docXml.lastIndexOf('<w:tbl>', fallbackHeading);
          const remarkTblEnd532 = docXml.indexOf('</w:tbl>', remarkTblStart532);
          if (remarkTblStart532 !== -1 && remarkTblEnd532 !== -1 && remarkTblStart532 >= finishTblStart) {
            sectionContentEnd = remarkTblEnd532 + 8;
            const origRemark = docXml.substring(remarkTblStart532, sectionContentEnd);
            remarkTblPr532 = origRemark.match(/<w:tblPr>[\s\S]*?<\/w:tblPr>/)?.[0] || remarkTblPr532;
            remarkTblGrid532 = origRemark.match(/<w:tblGrid>[\s\S]*?<\/w:tblGrid>/)?.[0] || remarkTblGrid532;
            const remarkOrigRows = [...origRemark.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)];
            signatureRow532 = remarkOrigRows.length > 1 ? remarkOrigRows[remarkOrigRows.length - 1][0] : '';
          }
        }
      }

      // Generate Table 1 (Non-Quantifiable) and Table 2 (Quantifiable)
      const finishCols = data.finishInProcessColumns || [];
      const nonQuantCols = finishCols.filter((c: any) => !c.isQuantifiable);
      const quantCols = finishCols.filter((c: any) => c.isQuantifiable);

      const typeWeight: Record<string, number> = {
        'ph': 1,
        'critical': 2,
        'assay': 3,
        'related_substance': 4,
        'identification': 5,
      };

      const sortCols = (a: any, b: any) => {
        const wA = typeWeight[a.type] || 99;
        const wB = typeWeight[b.type] || 99;
        if (wA !== wB) return wA - wB;
        const nameCmp = (a.name || '').localeCompare(b.name || '');
        if (nameCmp !== 0) return nameCmp;
        return (a.limit || '').localeCompare(b.limit || '');
      };

      nonQuantCols.sort(sortCols);
      quantCols.sort(sortCols);

      // ── Helpers ──
      const hCell = (text: string, opts?: { vMerge?: 'restart' | 'continue'; gridSpan?: number }) => {
        let tcPr = '<w:shd w:val="clear" w:color="auto" w:fill="D9D9D9"/><w:vAlign w:val="center"/>';
        if (opts?.vMerge === 'restart') tcPr = '<w:vMerge w:val="restart"/>' + tcPr;
        else if (opts?.vMerge === 'continue') tcPr = '<w:vMerge/>' + tcPr;
        if (opts?.gridSpan) tcPr += `<w:gridSpan w:val="${opts.gridSpan}"/>`;
        const rPr = '<w:rPr><w:b/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>';
        const pPr = '<w:pPr><w:spacing w:before="0"/><w:jc w:val="center"/>' + rPr + '</w:pPr>';
        return '<w:tc><w:tcPr>' + tcPr + '</w:tcPr>'
          + '<w:p>' + pPr
          + (text ? '<w:r>' + rPr + `<w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r>` : '')
          + '</w:p></w:tc>';
      };

      const dCell = (text: string, opts?: { vMerge?: 'restart' | 'continue'; gridSpan?: number }) => {
        let tcPr = '<w:vAlign w:val="center"/>';
        if (opts?.vMerge === 'restart') tcPr = '<w:vMerge w:val="restart"/>' + tcPr;
        else if (opts?.vMerge === 'continue') tcPr = '<w:vMerge/>' + tcPr;
        if (opts?.gridSpan) tcPr += `<w:gridSpan w:val="${opts.gridSpan}"/>`;

        return '<w:tc><w:tcPr>' + tcPr + '</w:tcPr>'
          + '<w:p><w:pPr><w:spacing w:before="0"/><w:jc w:val="center"/>'
          + '<w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:pPr>'
          + '<w:r><w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>'
          + `<w:t xml:space="preserve">${xmlEscape(text)}</w:t>`
          + '</w:r></w:p></w:tc>';
      };

      const buildTable = (cols: any[], tableIndex: number) => {
        const totalTblCols = 2 + cols.length;
        const colWidth = Math.round(9000 / totalTblCols);
        const gridCols = Array(totalTblCols).fill(`<w:gridCol w:w="${colWidth}"/>`).join('');
        const tblGrid = `<w:tblGrid>${gridCols}</w:tblGrid>`;

        let rowsXml = '';

        // Row 0: Top header
        rowsXml += '<w:tr><w:trPr><w:trHeight w:val="432"/><w:jc w:val="center"/></w:trPr>';
        rowsXml += hCell('Batch\nNumber', { vMerge: 'restart' });
        rowsXml += hCell('AR.\nNumber', { vMerge: 'restart' });
        if (cols.length > 0) {
          rowsXml += hCell('Critical Parameters (Limit)', { gridSpan: cols.length });
        }
        rowsXml += '</w:tr>';

        if (tableIndex === 1) {
          // For Table 1 (Non-Quant), limits go in a separate row
          rowsXml += '<w:tr><w:trPr><w:trHeight w:val="432"/><w:jc w:val="center"/></w:trPr>';
          rowsXml += hCell('', { vMerge: 'continue' });
          rowsXml += hCell('', { vMerge: 'continue' });
          for (const c of cols) {
            let displayName = c.name;
            if (c.type === 'identification') displayName = `Identification\n${c.name}`;
            rowsXml += hCell(displayName);
          }
          rowsXml += '</w:tr>';

          // Limit row (Row 2) - Note: standard APQR merged Limit cell across Batch & AR
          rowsXml += '<w:tr><w:trPr><w:trHeight w:val="432"/><w:jc w:val="center"/></w:trPr>';
          rowsXml += hCell('Limit \u2192', { gridSpan: 2 });
          for (const c of cols) {
            rowsXml += hCell((c.limit || '--').replace(/\n\n/g, '\n').trim());
          }
          rowsXml += '</w:tr>';
        } else {
          // For Table 2 (Quant), limits go in the subheader
          rowsXml += '<w:tr><w:trPr><w:trHeight w:val="432"/><w:jc w:val="center"/></w:trPr>';
          rowsXml += hCell('', { vMerge: 'continue' });
          rowsXml += hCell('', { vMerge: 'continue' });
          for (const c of cols) {
            let limitPart = (c.limit || '').trim();
            let displayName = c.name;
            if (c.type === 'assay') displayName = `Assay (%)\n${c.name}`;
            else if (c.type === 'related_substance') displayName = `Related Substances\n${c.name}`;
            else if (c.type === 'ph') displayName = 'pH';
            else if (c.type === 'critical' && displayName.toUpperCase().includes('UNIFORMITY')) {
              displayName = 'Uniformity of Volume (ml)';
            } else if (c.type === 'critical' && displayName.toUpperCase().includes('OSMOLALITY')) {
              displayName = 'Osmolality';
            }

            if (displayName.includes('Uniformity')) {
              limitPart = `(${limitPart})`;
            } else {
              if (limitPart) limitPart = `(${limitPart})`;
            }

            let headerText = `${displayName}\n${limitPart}`.replace(/\n\n/g, '\n').trim();
            rowsXml += hCell(headerText);
          }
          rowsXml += '</w:tr>';
        }

        // Data Rows
        const rows = data.finishInProcessData || [];
        if (rows.length === 0) {
          rowsXml += '<w:tr><w:trPr><w:jc w:val="center"/></w:trPr>'
            + `<w:tc><w:tcPr><w:gridSpan w:val="${totalTblCols}"/><w:vAlign w:val="center"/></w:tcPr>`
            + '<w:p><w:pPr><w:spacing w:before="0"/><w:jc w:val="center"/>'
            + '<w:rPr><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr></w:pPr>'
            + '<w:r><w:rPr><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr>'
            + '<w:t>No Finish Stage COA data found for the selected product and year.</w:t>'
            + '</w:r></w:p></w:tc></w:tr>';
        } else {
          let prevBatch = '';
          for (const row of rows) {
            rowsXml += '<w:tr><w:trPr><w:jc w:val="center"/></w:trPr>';
            if (row.batchNumber !== prevBatch) {
              rowsXml += dCell(row.batchNumber || '', { vMerge: 'restart' });
            } else {
              rowsXml += dCell('', { vMerge: 'continue' });
            }
            prevBatch = row.batchNumber;

            rowsXml += dCell(row.arNumber || '');
            for (const c of cols) {
              const colKey = c.key;
              // If we were using `row.results[`${colKey}|||result`]`, we'll restore to use it here:
              rowsXml += dCell(row.results[`${colKey}|||result`] || '--');
            }
            rowsXml += '</w:tr>';
          }
        }

        return '<w:tbl>' + origTblPr532 + tblGrid + rowsXml + '</w:tbl>';
      };

      let newXmlContent = '';

      // Separator paragraph to keep tables from merging
      // Empty paragraph structure with some spacing
      const pSeparator = '<w:p><w:pPr><w:spacing w:before="120" w:after="120"/></w:pPr></w:p>';

      if (nonQuantCols.length > 0) {
        newXmlContent += buildTable(nonQuantCols, 1) + pSeparator;
      }
      if (quantCols.length > 0) {
        newXmlContent += buildTable(quantCols, 2) + pSeparator;
      }
      if (nonQuantCols.length === 0 && quantCols.length === 0) {
        // Fallback if no columns
        newXmlContent += buildTable([], 1) + pSeparator;
      }

      // ── Remark Table ──
      const remarkText532 = `Finished product parameters for ${xmlEscape(data.product_name)} found (Satisfactory) within the limit as per specification during the review period.`;
      // Remark table spans the max columns of any table generated
      const finalTotalCols = 2 + Math.max(nonQuantCols.length, Math.max(quantCols.length, 1));

      const remarkContentRow532 = '<w:tr><w:tc><w:tcPr><w:gridSpan w:val="' + finalTotalCols + '"/>'
        + '<w:shd w:val="clear" w:color="auto" w:fill="D9D9D9"/>'
        + '</w:tcPr>'
        + '<w:p><w:pPr><w:rPr><w:b/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:pPr>'
        + '<w:r><w:rPr><w:b/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>'
        + '<w:t xml:space="preserve">Remark:</w:t></w:r></w:p>'
        + '<w:p><w:pPr><w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:pPr>'
        + '<w:r><w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>'
        + `<w:t xml:space="preserve">${xmlEscape(remarkText532)}</w:t></w:r></w:p>`
        + '</w:tc></w:tr>';

      const replacementRemark532 = '<w:tbl>' + remarkTblPr532 + remarkTblGrid532 + remarkContentRow532 + signatureRow532 + '</w:tbl>';
      newXmlContent += replacementRemark532;

      // ── FP Process Capability & Performance Parameters Table (3rd table in 5.3.2) ──
      // Mirrors the bulk CPK table logic but uses finishInProcessData and quantifiable FP columns.
      const fpQuantCols = (data.finishInProcessColumns || []).filter((c: any) => c.isQuantifiable);
      fpQuantCols.sort(sortCols);

      // fpColStats is declared at this outer scope so the chart loop (below) can access it
      const fpColStats: Map<string, ProcessCapabilityResults | null> = new Map();

      if (fpQuantCols.length > 0) {
        newXmlContent += pSeparator;

        // ── Data extraction: gather all numeric values per column ──
        // For FP, each batch can have multiple AR rows — all individual numeric values are used
        // for Uniformity-style parameters. For per-batch parameters (pH, Osmolality, Assay),
        // each unique batch value is used once.

        for (const col of fpQuantCols) {
          const rawValues: number[] = [];
          for (const row of (data.finishInProcessData || [])) {
            // Now we need to look for the result value specifically
            const cell = row.results[`${col.key}|||result`];
            if (cell && cell !== '--' && cell !== '') {
              const num = parseFloat(cell);
              if (!isNaN(num)) rawValues.push(num);
            }
          }
          if (rawValues.length >= 2) {
            fpColStats.set(col.key, calculateProcessCapability(rawValues, col.limit));
          } else {
            fpColStats.set(col.key, null);
          }
        }

        // ── Layout helpers ──
        // Total data cols: vMerge(811) + label(1661) + N FP quant cols
        const fpTotalCols = 2 + fpQuantCols.length; // vMerge + label + each quant col
        const fpColW = 1200; // approx width per parameter column

        const fp_fmt5 = (num: number | undefined) => num !== undefined && !isNaN(num) ? num.toFixed(5) : 'N/A';
        const fp_fmt2 = (num: number | undefined) => num !== undefined && !isNaN(num) ? num.toFixed(2) : 'N/A';

        const fp_boldP = (text: string) =>
          `<w:p><w:pPr><w:spacing w:before="0"/><w:jc w:val="center"/>`
          + `<w:rPr><w:b/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:pPr>`
          + `<w:r><w:rPr><w:b/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>`
          + `<w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r></w:p>`;

        // Data value cell
        const fp_valCell = (val: string, shade = '') =>
          `<w:tc><w:tcPr>${shade}<w:vAlign w:val="center"/></w:tcPr>`
          + `<w:p><w:pPr><w:spacing w:before="0"/><w:jc w:val="center"/>`
          + `<w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:pPr>`
          + `<w:r><w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>`
          + `<w:t>${xmlEscape(val)}</w:t></w:r></w:p></w:tc>`;

        // vMerge continue cell
        const fp_vMergeCont =
          `<w:tc><w:tcPr><w:vMerge w:val="continue"/><w:vAlign w:val="center"/></w:tcPr><w:p/></w:tc>`;

        // Row with a label cell spanning cols 1+2 (gridSpan=2) and one value cell per quant col
        const fp_buildSimpleRow = (labelXml: string, vals: string[], shaded = false) => {
          const shade = shaded ? `<w:shd w:val="clear" w:color="auto" w:fill="D9D9D9"/>` : '';
          let row = `<w:tr><w:trPr><w:trHeight w:val="350"/><w:jc w:val="center"/></w:trPr>`
            + `<w:tc><w:tcPr><w:gridSpan w:val="2"/>${shade}<w:vAlign w:val="center"/></w:tcPr>${labelXml}</w:tc>`;
          for (const v of vals) row += fp_valCell(v, shade);
          row += `</w:tr>`;
          return row;
        };

        // Row within Short-Term or Long-Term block (vMerge continue in col 0, label in col 1)
        const fp_buildBlockRow = (label: string, vals: string[], shaded = false) => {
          const shade = shaded ? `<w:shd w:val="clear" w:color="auto" w:fill="D9D9D9"/>` : '';
          let row = `<w:tr><w:trPr><w:trHeight w:val="350"/><w:jc w:val="center"/></w:trPr>`
            + fp_vMergeCont
            + `<w:tc><w:tcPr>${shade}<w:vAlign w:val="center"/></w:tcPr>`
            + `<w:p><w:pPr><w:spacing w:before="0"/><w:jc w:val="center"/>`
            + `<w:rPr><w:b/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:pPr>`
            + `<w:r><w:rPr><w:b/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>`
            + `<w:t xml:space="preserve">${xmlEscape(label)}</w:t></w:r></w:p></w:tc>`;
          for (const v of vals) row += fp_valCell(v, shade);
          row += `</w:tr>`;
          return row;
        };

        // Helper: get formatted values for each FP quantile column
        const fp_fmt5All = (getter: (s: ProcessCapabilityResults | null) => number | undefined) =>
          fpQuantCols.map(c => fp_fmt5(getter(fpColStats.get(c.key) ?? null)));
        const fp_fmt2All = (getter: (s: ProcessCapabilityResults | null) => number | undefined) =>
          fpQuantCols.map(c => fp_fmt2(getter(fpColStats.get(c.key) ?? null)));

        // Build column display names for header row
        const fp_colHeaders = fpQuantCols.map((c: any) => {
          if (c.type === 'ph') return 'pH';
          if (c.type === 'assay') return `Assay (%)\n${c.name}`;
          if (c.type === 'critical' && (c.name || '').toUpperCase().includes('UNIFORMITY')) {
            return `Uniformity of Volume\n(${c.limit})`;
          }
          if (c.type === 'critical' && (c.name || '').toUpperCase().includes('OSMOLALITY')) {
            return `Osmolality\n(${c.limit})`;
          }
          return c.name || c.type;
        });

        // Grid: vMerge col (811) + label col (1661) + N quant cols (fpColW each)
        let fpCpkGrid = `<w:tblGrid><w:gridCol w:w="811"/><w:gridCol w:w="1661"/>`;
        for (let i = 0; i < fpQuantCols.length; i++) fpCpkGrid += `<w:gridCol w:w="${fpColW}"/>`;
        fpCpkGrid += `</w:tblGrid>`;

        let fpCpkRows = '';

        // ── ROW 1: Title row spanning all columns ──
        fpCpkRows +=
          `<w:tr><w:trPr><w:trHeight w:val="397"/><w:jc w:val="center"/></w:trPr>`
          + `<w:tc><w:tcPr><w:gridSpan w:val="${fpTotalCols}"/>`
          + `<w:shd w:val="clear" w:color="auto" w:fill="D9D9D9"/><w:vAlign w:val="center"/></w:tcPr>`
          + `<w:p><w:pPr><w:spacing w:before="0"/><w:jc w:val="center"/>`
          + `<w:rPr><w:b/><w:color w:val="7F6000"/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:pPr>`
          + `<w:r><w:rPr><w:b/><w:color w:val="7F6000"/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>`
          + `<w:t>Process Capability &amp; Performance parameters (Cp, Cpk, and Pp, Ppk)</w:t>`
          + `</w:r></w:p></w:tc>`
          + `</w:tr>`;

        // ── ROW 2: Column headers (empty label area + one header per quant col) ──
        {
          let hdrRow = `<w:tr><w:trPr><w:trHeight w:val="397"/><w:jc w:val="center"/></w:trPr>`
            + `<w:tc><w:tcPr><w:gridSpan w:val="2"/>`
            + `<w:shd w:val="clear" w:color="auto" w:fill="D9D9D9"/><w:vAlign w:val="center"/></w:tcPr>`
            + `<w:p/></w:tc>`;
          for (const hdr of fp_colHeaders) {
            // Build multi-line header (split on \n)
            const lines = hdr.split('\n');
            let hdrCellContent = '';
            for (const line of lines) {
              hdrCellContent += fp_boldP(line);
            }
            hdrRow += `<w:tc><w:tcPr>`
              + `<w:shd w:val="clear" w:color="auto" w:fill="D9D9D9"/><w:vAlign w:val="center"/></w:tcPr>`
              + hdrCellContent + `</w:tc>`;
          }
          hdrRow += `</w:tr>`;
          fpCpkRows += hdrRow;
        }

        // Derived intermediates
        const fp_uslLsl = fpQuantCols.map((c: any) => {
          const s = fpColStats.get(c.key);
          return s ? s.usl - s.lsl : NaN;
        });
        const fp_uslAvg = fpQuantCols.map((c: any) => {
          const s = fpColStats.get(c.key);
          return s ? s.usl - s.average : NaN;
        });
        const fp_avgLsl = fpQuantCols.map((c: any) => {
          const s = fpColStats.get(c.key);
          return s ? s.average - s.lsl : NaN;
        });

        // ── ROWS 3–8: Basic statistics ──
        fpCpkRows += fp_buildSimpleRow(fp_boldP('Average'), fp_fmt5All(s => s?.average));
        fpCpkRows += fp_buildSimpleRow(fp_boldP('Maximum'), fp_fmt5All(s => s?.max));
        fpCpkRows += fp_buildSimpleRow(fp_boldP('Minimum'), fp_fmt5All(s => s?.min));
        fpCpkRows += fp_buildSimpleRow(fp_boldP('Upper Specification Limit \u2013 Lower Specification Limit (USL \u2013 LSL)'), fp_uslLsl.map(v => fp_fmt5(v)));
        fpCpkRows += fp_buildSimpleRow(fp_boldP('Upper Specification Limit (USL) \u2013 Average'), fp_uslAvg.map(v => fp_fmt5(v)));
        fpCpkRows += fp_buildSimpleRow(fp_boldP('Average \u2013 Lower Specification Limit (LSL)'), fp_avgLsl.map(v => fp_fmt5(v)));

        // ── ROW 9: Short-Term header + Estimated Std Dev (σ) ──
        {
          let stRow = `<w:tr><w:trPr><w:trHeight w:val="350"/><w:jc w:val="center"/></w:trPr>`
            + `<w:tc><w:tcPr><w:vMerge w:val="restart"/><w:vAlign w:val="center"/></w:tcPr>`
            + fp_boldP('Process Capability parameters Short-Term Statistics') + `</w:tc>`
            + `<w:tc><w:tcPr><w:vAlign w:val="center"/></w:tcPr>`
            + `<w:p><w:pPr><w:spacing w:before="0"/><w:jc w:val="center"/>`
            + `<w:rPr><w:b/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:pPr>`
            + `<w:r><w:rPr><w:b/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>`
            + `<w:t xml:space="preserve">Estimated Std Deviation (</w:t></w:r>`
            + `<w:r><w:rPr><w:b/><w:sz w:val="20"/><w:szCs w:val="20"/><w:rFonts w:ascii="Symbol" w:hAnsi="Symbol" w:cs="Symbol"/></w:rPr>`
            + `<w:t>s</w:t></w:r>`
            + `<w:r><w:rPr><w:b/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr><w:t xml:space="preserve">)</w:t></w:r></w:p></w:tc>`;
          for (const [, s] of [...fpQuantCols.map((c: any) => fpColStats.get(c.key))].entries()) stRow += fp_valCell(fp_fmt5(s?.sigmaEstimated));
          stRow += `</w:tr>`;
          fpCpkRows += stRow;
        }

        fpCpkRows += fp_buildBlockRow('3\u03c3 = (3 X \u03c3)', fpQuantCols.map((c: any) => fp_fmt2((fpColStats.get(c.key)?.sigmaEstimated ?? NaN) * 3)));
        fpCpkRows += fp_buildBlockRow('6\u03c3 = (6 X \u03c3)', fpQuantCols.map((c: any) => fp_fmt2((fpColStats.get(c.key)?.sigmaEstimated ?? NaN) * 6)));
        fpCpkRows += fp_buildBlockRow('Cpku = (USL \u2013 Average) / 3\u03c3', fp_fmt2All(s => s?.cpku));
        fpCpkRows += fp_buildBlockRow('Cpkl = (Average \u2013 LSL) / 3\u03c3', fp_fmt2All(s => s?.cpkl));
        fpCpkRows += fp_buildBlockRow('Cpk Value = Min (Cpkl & Cpku)', fp_fmt2All(s => s?.cpk), true);
        fpCpkRows += fp_buildBlockRow('Cp Value = (USL \u2013 LSL) / 6\u03c3', fp_fmt2All(s => s?.cp), true);

        // ── ROW 16: Long-Term header + Std Dev S ──
        {
          let ltRow = `<w:tr><w:trPr><w:trHeight w:val="350"/><w:jc w:val="center"/></w:trPr>`
            + `<w:tc><w:tcPr><w:vMerge w:val="restart"/><w:vAlign w:val="center"/></w:tcPr>`
            + fp_boldP('Process Performance parameters (Long-Term Statistics)') + `</w:tc>`
            + `<w:tc><w:tcPr><w:vAlign w:val="center"/></w:tcPr>`
            + fp_boldP('Std Deviation (S)') + `</w:tc>`;
          for (const c of fpQuantCols) {
            const s = fpColStats.get(c.key);
            ltRow += fp_valCell(fp_fmt5(s?.sigmaSample));
          }
          ltRow += `</w:tr>`;
          fpCpkRows += ltRow;
        }

        fpCpkRows += fp_buildBlockRow('3S = (3 X Std deviation)', fpQuantCols.map((c: any) => fp_fmt2((fpColStats.get(c.key)?.sigmaSample ?? NaN) * 3)));
        fpCpkRows += fp_buildBlockRow('6S = (6 X Std deviation)', fpQuantCols.map((c: any) => fp_fmt2((fpColStats.get(c.key)?.sigmaSample ?? NaN) * 6)));
        fpCpkRows += fp_buildBlockRow('Ppku = (USL \u2013 Average) / 3S', fp_fmt2All(s => s?.ppku));
        fpCpkRows += fp_buildBlockRow('Ppkl = (Average \u2013 LSL) / 3S', fp_fmt2All(s => s?.ppkl));
        fpCpkRows += fp_buildBlockRow('Ppk Value = Min(Ppkl & Ppku)', fp_fmt2All(s => s?.ppk));
        fpCpkRows += fp_buildBlockRow('Pp Value = (USL \u2013 LSL) / 6S', fp_fmt2All(s => s?.pp));

        // Assemble FP CPK table
        const fpCpkTblPr = origTblPr532;
        const fpCpkTable = `<w:tbl>${fpCpkTblPr}${fpCpkGrid}${fpCpkRows}</w:tbl>`;
        newXmlContent += fpCpkTable;

        // ── Limit Conclusion Table (Cp, Cpk, Pp, Ppk interpretation) ──
        newXmlContent += pSeparator;
        {
          const limHCell = (text: string, gs?: number) => {
            const gsAttr = gs ? `<w:gridSpan w:val="${gs}"/>` : '';
            return `<w:tc><w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="D9D9D9"/>${gsAttr}<w:vAlign w:val="center"/></w:tcPr>`
              + `<w:p><w:pPr><w:spacing w:before="0"/><w:jc w:val="center"/>`
              + `<w:rPr><w:b/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:pPr>`
              + `<w:r><w:rPr><w:b/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>`
              + `<w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r></w:p></w:tc>`;
          };
          const limDCell = (text: string) => {
            return `<w:tc><w:tcPr><w:vAlign w:val="center"/></w:tcPr>`
              + `<w:p><w:pPr><w:spacing w:before="0"/><w:jc w:val="center"/>`
              + `<w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:pPr>`
              + `<w:r><w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>`
              + `<w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r></w:p></w:tc>`;
          };

          let limitRows = '';

          // Row 1: "Limit for Process Capability & Performance parameters" spanning all 4 cols
          limitRows += `<w:tr><w:trPr><w:trHeight w:val="397"/><w:jc w:val="center"/></w:trPr>`
            + `<w:tc><w:tcPr><w:gridSpan w:val="4"/>`
            + `<w:shd w:val="clear" w:color="auto" w:fill="D9D9D9"/><w:vAlign w:val="center"/></w:tcPr>`
            + `<w:p><w:pPr><w:spacing w:before="0"/><w:jc w:val="center"/>`
            + `<w:rPr><w:b/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:pPr>`
            + `<w:r><w:rPr><w:b/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>`
            + `<w:t>Limit for Process Capability &amp; Performance parameters (Cp, Cpk, and Pp, Ppk)</w:t>`
            + `</w:r></w:p></w:tc></w:tr>`;

          // Row 2: blank | "Cp, Cpk, and Pp, Ppk" spanning 3
          limitRows += `<w:tr><w:trPr><w:trHeight w:val="350"/><w:jc w:val="center"/></w:trPr>`
            + limHCell('')
            + limHCell('Cp, Cpk, and Pp, Ppk', 3)
            + `</w:tr>`;

          // Row 3: blank | < 1 | Between 1 to 1.33 | > 1.33
          limitRows += `<w:tr><w:trPr><w:trHeight w:val="350"/><w:jc w:val="center"/></w:trPr>`
            + limHCell('')
            + limHCell('< 1')
            + limHCell('Between 1 to 1.33')
            + limHCell('> 1.33')
            + `</w:tr>`;

          // Row 4: Conclusion | not capable | capable | very excellent / very capable
          limitRows += `<w:tr><w:trPr><w:trHeight w:val="350"/><w:jc w:val="center"/></w:trPr>`
            + limDCell('Conclusion')
            + limDCell('Process is not capable')
            + limDCell('Process is capable')
            + limDCell('very excellent / very capable')
            + `</w:tr>`;

          const limitTblGrid = `<w:tblGrid><w:gridCol w:w="1500"/><w:gridCol w:w="1500"/><w:gridCol w:w="2500"/><w:gridCol w:w="2500"/></w:tblGrid>`;
          const limitTable = `<w:tbl>${origTblPr532}${limitTblGrid}${limitRows}</w:tbl>`;
          newXmlContent += limitTable;
        }

        // ── UCL & LCL Table ──
        newXmlContent += pSeparator;
        {
          // Title paragraph
          newXmlContent += `<w:p><w:pPr><w:spacing w:before="240"/><w:jc w:val="left"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="20"/><w:szCs w:val="20"/><w:u w:val="single"/></w:rPr><w:t xml:space="preserve">Upper Control Limits (UCL) &amp; Lower Control Limits (LCL): -</w:t></w:r></w:p>`;

          const uclHCell = (text: string, shade = '') => {
            return `<w:tc><w:tcPr>${shade}<w:vAlign w:val="center"/></w:tcPr>`
              + `<w:p><w:pPr><w:spacing w:before="0"/><w:jc w:val="center"/>`
              + `<w:rPr><w:b/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:pPr>`
              + `<w:r><w:rPr><w:b/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>`
              + `<w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r></w:p></w:tc>`;
          };
          const uclDCell = (text: string, bold = false) => {
            const bTag = bold ? '<w:b/>' : '';
            return `<w:tc><w:tcPr><w:vAlign w:val="center"/></w:tcPr>`
              + `<w:p><w:pPr><w:spacing w:before="0"/><w:jc w:val="center"/>`
              + `<w:rPr>${bTag}<w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:pPr>`
              + `<w:r><w:rPr>${bTag}<w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>`
              + `<w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r></w:p></w:tc>`;
          };

          const uclTotalCols = 1 + fpQuantCols.length;
          let uclGrid = `<w:tblGrid><w:gridCol w:w="2000"/>`;
          for (let i = 0; i < fpQuantCols.length; i++) uclGrid += `<w:gridCol w:w="1200"/>`;
          uclGrid += `</w:tblGrid>`;

          let uclRows = '';
          const shadeStr = '<w:shd w:val="clear" w:color="auto" w:fill="D9D9D9"/>';

          // Row 1: Headers
          uclRows += `<w:tr><w:trPr><w:trHeight w:val="432"/><w:jc w:val="center"/></w:trPr>`;
          uclRows += uclHCell('', shadeStr);
          for (const c of fpQuantCols) {
            let hdr = c.name;
            if (c.type === 'ph') hdr = 'pH';
            else if (c.type === 'assay') hdr = `Assay (%)\n${c.name}`;
            else if (c.type === 'critical' && (c.name || '').toUpperCase().includes('UNIFORMITY')) {
              hdr = `Uniformity of Volume\n(ml)`;
            }
            else if (c.type === 'critical' && (c.name || '').toUpperCase().includes('OSMOLALITY')) {
              hdr = `Osmolality\n(mOsmol/kg)`;
            }

            const lines = hdr.split('\n');
            let cellContent = '';
            for (const line of lines) {
              cellContent += `<w:p><w:pPr><w:spacing w:before="0"/><w:jc w:val="center"/>`
                + `<w:rPr><w:b/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:pPr>`
                + `<w:r><w:rPr><w:b/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>`
                + `<w:t xml:space="preserve">${xmlEscape(line)}</w:t></w:r></w:p>`;
            }
            uclRows += `<w:tc><w:tcPr>${shadeStr}<w:vAlign w:val="center"/></w:tcPr>${cellContent}</w:tc>`;
          }
          uclRows += `</w:tr>`;

          // Row 2: Specification Limit
          uclRows += `<w:tr><w:trPr><w:trHeight w:val="350"/><w:jc w:val="center"/></w:trPr>`;
          uclRows += uclHCell('Specification Limit', shadeStr);
          for (const c of fpQuantCols) {
            let lim = (c.limit || '').trim();
            if (lim) {
              if (!lim.startsWith('(')) lim = `(${lim})`;
            } else {
              lim = '(--)';
            }
            uclRows += uclHCell(lim, shadeStr);
          }
          uclRows += `</w:tr>`;

          const uclFmt = (num: number | undefined) => num !== undefined && !isNaN(num) ? num.toFixed(2) : 'N/A';

          // Row 3: Average
          uclRows += `<w:tr><w:trPr><w:trHeight w:val="350"/><w:jc w:val="center"/></w:trPr>`;
          uclRows += uclDCell('Average');
          for (const c of fpQuantCols) {
            const s = fpColStats.get(c.key);
            uclRows += uclDCell(uclFmt(s?.average));
          }
          uclRows += `</w:tr>`;

          // Row 4: Std. Dev.
          uclRows += `<w:tr><w:trPr><w:trHeight w:val="350"/><w:jc w:val="center"/></w:trPr>`;
          uclRows += uclDCell('Std. Dev.');
          for (const c of fpQuantCols) {
            const s = fpColStats.get(c.key);
            uclRows += uclDCell(uclFmt(s?.sigmaSample));
          }
          uclRows += `</w:tr>`;

          // Row 5: Upper Control Limit (UCL)
          uclRows += `<w:tr><w:trPr><w:trHeight w:val="350"/><w:jc w:val="center"/></w:trPr>`;
          uclRows += uclDCell('Upper Control Limit (UCL)', true);
          for (const c of fpQuantCols) {
            const s = fpColStats.get(c.key);
            const ucl = s ? s.average + (3 * s.sigmaSample) : undefined;
            uclRows += uclDCell(uclFmt(ucl), true);
          }
          uclRows += `</w:tr>`;

          // Row 6: Lower Control Limit (LCL)
          uclRows += `<w:tr><w:trPr><w:trHeight w:val="350"/><w:jc w:val="center"/></w:trPr>`;
          uclRows += uclDCell('Lower Control Limit (LCL)', true);
          for (const c of fpQuantCols) {
            const s = fpColStats.get(c.key);
            const lcl = s ? s.average - (3 * s.sigmaSample) : undefined;
            uclRows += uclDCell(uclFmt(lcl), true);
          }
          uclRows += `</w:tr>`;

          const uclTableXml = `<w:tbl>${origTblPr532}${uclGrid}${uclRows}</w:tbl>`;
          newXmlContent += uclTableXml;
        }

        console.log(`  ✅ Section 5.3.2 FP CPK table added (${fpQuantCols.length} quantifiable columns)`);
      }

      // Replace everything between the start of the first table and the end of the remark table
      docXml = docXml.substring(0, sectionContentStart) + newXmlContent + docXml.substring(sectionContentEnd);
      console.log(`  ✅ Section 5.3.2 tables replaced. NonQuantCols: ${nonQuantCols.length}, QuantCols: ${quantCols.length}`);

      // ── 11b. Dynamic Finished Stage Trend Charts ──
      // rId-based paragraph lookup (DOCX fragments text in w:t so direct string search fails).

      const batchNumsFP = data.finishInProcessData.map((r: any) => r.batchNumber || r.batchNo || '');

      const buildStrCacheFP = (vals: string[]) => {
        const pts = vals.map((v, i) => `<c:pt idx="${i}"><c:v>${xmlEscape(v)}</c:v></c:pt>`).join('');
        return `<c:strCache><c:ptCount val="${vals.length}"/>${pts}</c:strCache>`;
      };
      const buildNumCacheFP = (vals: number[]) => {
        const pts = vals.map((v, i) => `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`).join('');
        return `<c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${vals.length}"/>${pts}</c:numCache>`;
      };
      const buildSerNameFP = (name: string) => `<c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>${xmlEscape(name)}</c:v></c:pt></c:strCache>`;
      const limitLineFP = (val: number | undefined, n: number): number[] => Array(n).fill(val ?? 0);
      const parseNumFP = (s: string): number => { const num = parseFloat(s.replace(/[^0-9.-]/g, '')); return isNaN(num) ? NaN : num; };
      const parseLimitFP = (s: string): { nlt?: number; nmt?: number } => {
        if (!s || typeof s !== 'string') return {};
        const nmtM = s.match(/NMT\s+(\d+\.?\d*)/);
        if (nmtM) {
          const nltM = s.match(/NLT\s+(\d+\.?\d*)/);
          return nltM ? { nlt: parseFloat(nltM[1]), nmt: parseFloat(nmtM[1]) } : { nmt: parseFloat(nmtM[1]) };
        }
        const nltM = s.match(/NLT\s+(\d+\.?\d*)/);
        if (nltM) return { nlt: parseFloat(nltM[1]) };
        return {};
      };

      const updateChartFP = (chartXml: string, series: { name: string; values: number[] }[]): string => {
        let idx = 0;
        return chartXml.replace(/<c:ser>([\s\S]*?)<\/c:ser>/g, (match, content) => {
          if (idx >= series.length) return '';
          const sd = series[idx++];
          let updated = content;
          updated = updated.replace(
            /(<c:tx>[\s\S]*?<c:strRef>[\s\S]*?)<c:strCache>[\s\S]*?<\/c:strCache>([\s\S]*?<\/c:strRef>[\s\S]*?<\/c:tx>)/,
            `$1${buildSerNameFP(sd.name)}$2`
          );
          updated = updated.replace(
            /(<c:cat>[\s\S]*?<c:strRef>[\s\S]*?)<c:strCache>[\s\S]*?<\/c:strCache>([\s\S]*?<\/c:strRef>[\s\S]*?<\/c:cat>)/,
            `$1${buildStrCacheFP(batchNumsFP)}$2`
          );
          updated = updated.replace(
            /(<c:val>[\s\S]*?<c:numRef>[\s\S]*?)<c:numCache>[\s\S]*?<\/c:numCache>([\s\S]*?<\/c:numRef>[\s\S]*?<\/c:val>)/,
            `$1${buildNumCacheFP(sd.values)}$2`
          );
          return `<c:ser>${updated}</c:ser>`;
        });
      };

      // Parse rels to get rId for each chart6..10, then find/update/delete paragraphs
      const relsXml = await zip.file('word/_rels/document.xml.rels')?.async('string') ?? '';

      // Process in REVERSE order so deletions at higher indices don't shift lower-index offsets
      for (let i = 4; i >= 0; i--) {
        const chartNum = 6 + i;
        const relRx = new RegExp(`Id="([^"]+)"[^>]*Target="charts/chart${chartNum}\\.xml"`);
        const relM = relsXml.match(relRx);
        if (!relM) { console.warn(`  ⚠️ No rId for chart${chartNum}.xml in rels`); continue; }
        const rId = relM[1];
        const rIdRef = `"${rId}"`;
        const rIdIdx = docXml.indexOf(rIdRef);
        if (rIdIdx === -1) { console.warn(`  ⚠️ rId ${rId} not in document.xml`); continue; }

        // Drawing paragraph: walk back to find <w:p
        const drawPStart = docXml.lastIndexOf('<w:p ', rIdIdx);
        const drawPEnd = docXml.indexOf('</w:p>', rIdIdx) + 6;
        // Heading paragraph: immediately preceding <w:p>...</w:p>
        const prevPEnd = docXml.lastIndexOf('</w:p>', drawPStart - 1) + 6;
        const prevPStart = docXml.lastIndexOf('<w:p ', prevPEnd - 1);

        if (i < fpQuantCols.length) {
          // Active slot: rewrite heading + update chart XML
          const col = fpQuantCols[i];
          const newHdr = `Trend Analysis of ${col.name} at Finished Stage:`;
          const safeHdrXml = `<w:p><w:pPr><w:pStyle w:val="Heading4"/><w:jc w:val="left"/></w:pPr><w:r><w:rPr><w:b/><w:i/></w:rPr><w:t xml:space="preserve">${xmlEscape(newHdr)}</w:t></w:r></w:p>`;
          docXml = docXml.substring(0, prevPStart) + safeHdrXml + docXml.substring(prevPEnd);

          const cXmlRaw = await zip.file(`word/charts/chart${chartNum}.xml`)?.async('string');
          if (cXmlRaw) {
            const stat = fpColStats.get(col.key);
            const chartVals = data.finishInProcessData.map((r: any) => parseNumFP(r.results[`${col.key}|||result`] || ''));
            const clims = parseLimitFP(col.limit || '');
            const chartUcl = stat ? stat.average + 3 * stat.sigmaSample : undefined;
            const chartLcl = stat ? stat.average - 3 * stat.sigmaSample : undefined;
            const nPoints = chartVals.length;
            const cSeries: { name: string; values: number[] }[] = [
              { name: col.name, values: chartVals.map((v: number) => isNaN(v) ? 0 : v) },
            ];
            if (clims.nlt !== undefined) cSeries.push({ name: `NLT ${clims.nlt}`, values: limitLineFP(clims.nlt, nPoints) });
            if (clims.nmt !== undefined) cSeries.push({ name: `NMT ${clims.nmt}`, values: limitLineFP(clims.nmt, nPoints) });
            if (chartUcl !== undefined) cSeries.push({ name: `UCL (NMT ${chartUcl.toFixed(2)})`, values: limitLineFP(chartUcl, nPoints) });
            if (chartLcl !== undefined) cSeries.push({ name: `LCL (NLT ${chartLcl.toFixed(2)})`, values: limitLineFP(chartLcl, nPoints) });
            zip.file(`word/charts/chart${chartNum}.xml`, updateChartFP(cXmlRaw, cSeries));
            console.log(`  ✅ chart${chartNum}.xml updated for "${col.name}" (${nPoints} pts, UCL=${chartUcl?.toFixed(2)}, LCL=${chartLcl?.toFixed(2)})`);
          }
        } else {
          // Inactive slot: delete heading + drawing paragraphs
          docXml = docXml.substring(0, prevPStart) + docXml.substring(drawPEnd);
          console.log(`  🗑️ Removed inactive chart slot chart${chartNum} (paramIdx=${i} >= ${fpQuantCols.length})`);
        }
      }

    } else {
      console.warn('Section 5.3.2: Could not find finish stage table in template — table not populated');
    }
  }



  // ── 11c. Dynamic Section 5.3.3 – Sterility Testing ──
  {
    // Find the sterility column from finishInProcessColumns
    const sterilityCol = (data.finishInProcessColumns || []).find((c: any) =>
      c.name.toLowerCase().includes('sterility') || c.name.toLowerCase().includes('sterile')
    );
    const sterilityKey = sterilityCol?.key || null;
    const sterilityLimit = sterilityCol?.limit || 'Growth or turbidity should not present in the original clear media.';

    console.log(`\n📋 Section 5.3.3 Sterility: key=${sterilityKey}, limit=${sterilityLimit}`);

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

        // Data rows – one per batch; split multi-line results into separate rows with vMerge
        const rows533 = data.finishInProcessData || [];
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
            const batchNo = row.batchNumber || (row as any).batchNo || '--';
            const rawResult = sterilityKey
              ? (row.results[`${sterilityKey}|||result`] || '--')
              : '--';
            // Split on newlines to support multi-line sterility results (e.g. two media)
            const resultLines = rawResult.split(/\n|\\n/).map((s: string) => s.trim()).filter(Boolean);
            if (resultLines.length <= 1) {
              rowsXml += '<w:tr><w:trPr><w:jc w:val="center"/></w:trPr>';
              rowsXml += dCell533(batchNo);
              rowsXml += dCell533(rawResult);
              rowsXml += '</w:tr>';
            } else {
              // Multiple lines: vMerge the batch number cell
              for (let li = 0; li < resultLines.length; li++) {
                rowsXml += '<w:tr><w:trPr><w:jc w:val="center"/></w:trPr>';
                rowsXml += dCell533(li === 0 ? batchNo : '', { vMerge: li === 0 ? 'restart' : 'continue' });
                rowsXml += dCell533(resultLines[li]);
                rowsXml += '</w:tr>';
              }
            }
          }
        }

        const newTable533 = `<w:tbl>${origTblPr533}${tblGrid533}${rowsXml}</w:tbl>`;
        docXml = docXml.substring(0, tblStart533) + newTable533 + docXml.substring(tblEnd533);
        console.log(`  ✅ Section 5.3.3 Sterility table replaced with ${rows533.length} batch rows`);
      }
    }
  }

  // ── 12a. Dynamic Section 5.4.2 – At Finished Stage Yield ──
  {
    const yieldRows = (data as any).yieldData542 as Array<{ batchNo: string; yieldLines: string[]; avgYield: number }> || [];
    console.log(`\n📋 Section 5.4.2 Yield: ${yieldRows.length} rows`);

    // Find "At Finished Stage:" in the document body (second occurrence, not TOC)
    const anchorText = 'At Finished Stage:';
    let searchFrom = Math.floor(docXml.length * 0.4); // skip first half (TOC region)
    const anchorIdx = docXml.indexOf(anchorText, searchFrom);

    if (anchorIdx !== -1) {
      // Find the next <w:tbl> after the anchor
      const nextTblIdx = docXml.indexOf('<w:tbl>', anchorIdx);
      if (nextTblIdx !== -1 && (nextTblIdx - anchorIdx) < 5000) {
        const tblEndIdx = docXml.indexOf('</w:tbl>', nextTblIdx);
        if (tblEndIdx !== -1) {
          const tblEndFull = tblEndIdx + 8;
          const origTable542 = docXml.substring(nextTblIdx, tblEndFull);

          // Extract table properties from original template table
          const origTblPr = origTable542.match(/<w:tblPr>[\s\S]*?<\/w:tblPr>/)?.[0]
            || '<w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:jc w:val="center"/><w:tblBorders>'
            + '<w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
            + '<w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
            + '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
            + '<w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
            + '<w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
            + '<w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
            + '</w:tblBorders></w:tblPr>';

          // Fixed 3-column grid matching template: Batch No | Yield | Avg Yield
          const tblGrid542 = '<w:tblGrid><w:gridCol w:w="1859"/><w:gridCol w:w="4023"/><w:gridCol w:w="4023"/></w:tblGrid>';

          // Cell helpers
          const hCell542 = (text: string) =>
            '<w:tc><w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="D9D9D9"/><w:vAlign w:val="center"/></w:tcPr>'
            + '<w:p><w:pPr><w:spacing w:before="0"/><w:jc w:val="center"/>'
            + '<w:rPr><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:pPr>'
            + '<w:r><w:rPr><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>'
            + `<w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r></w:p></w:tc>`;

          const dCell542 = (text: string) =>
            '<w:tc><w:tcPr><w:vAlign w:val="center"/></w:tcPr>'
            + '<w:p><w:pPr><w:spacing w:before="0"/><w:jc w:val="center"/>'
            + '<w:rPr><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:pPr>'
            + '<w:r><w:rPr><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>'
            + `<w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r></w:p></w:tc>`;

          // Multi-line cell using <w:br/> for line breaks between yield lines
          const multiLineCell542 = (lines: string[]) => {
            let runs = '';
            for (let i = 0; i < lines.length; i++) {
              if (i > 0) runs += '<w:r><w:rPr><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr><w:br/></w:r>';
              runs += '<w:r><w:rPr><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>'
                + `<w:t xml:space="preserve">${xmlEscape(lines[i])}</w:t></w:r>`;
            }
            return '<w:tc><w:tcPr><w:vAlign w:val="center"/></w:tcPr>'
              + '<w:p><w:pPr><w:spacing w:before="0"/><w:jc w:val="center"/>'
              + '<w:rPr><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:pPr>'
              + runs + '</w:p></w:tc>';
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

          let rowsXml = '';

          // Header row (extract from original to preserve formatting if possible)
          const origRows = [...origTable542.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)];
          const headerRow = origRows.length > 0 ? origRows[0][0] : (
            '<w:tr><w:trPr><w:trHeight w:val="432"/><w:jc w:val="center"/></w:trPr>'
            + hCell542('BATCH NO.')
            + hCell542('%YIELD (STAGE-FINISHED)\n(LIMIT: 95-100%)')
            + hCell542('%AVERAGE YIELD\n(STAGE-FINISHED)\n(LIMIT: 95-100%)')
            + '</w:tr>'
          );
          rowsXml += headerRow;

          if (yieldRows.length === 0) {
            rowsXml += '<w:tr><w:trPr><w:jc w:val="center"/></w:trPr>'
              + '<w:tc><w:tcPr><w:gridSpan w:val="3"/><w:vAlign w:val="center"/></w:tcPr>'
              + '<w:p><w:pPr><w:spacing w:before="0"/><w:jc w:val="center"/>'
              + '<w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:pPr>'
              + '<w:r><w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>'
              + '<w:t>No yield data found for the selected product and year.</w:t>'
              + '</w:r></w:p></w:tc></w:tr>';
          } else {
            // Data rows
            for (const row of yieldRows) {
              rowsXml += '<w:tr><w:trPr><w:jc w:val="center"/></w:trPr>'
                + dCell542(row.batchNo)
                + multiLineCell542(row.yieldLines)
                + dCell542(row.avgYield.toFixed(2))
                + '</w:tr>';
            }

            // Statistics — computed from avgYield values
            const avgYields = yieldRows.map(r => r.avgYield);
            const minVal = Math.min(...avgYields);
            const maxVal = Math.max(...avgYields);
            const mean = avgYields.reduce((s, v) => s + v, 0) / avgYields.length;
            const variance = avgYields.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / avgYields.length;
            const stdDev = Math.sqrt(variance);
            const rsd = mean !== 0 ? (stdDev / mean) * 100 : 0;

            rowsXml += statRow542('Minimum', minVal.toFixed(2));
            rowsXml += statRow542('Maximum', maxVal.toFixed(2));
            rowsXml += statRow542('Average', mean.toFixed(2));
            rowsXml += statRow542('Standard Deviation', stdDev.toFixed(2));
            rowsXml += statRow542('RSD (%)', rsd.toFixed(2));
          }

          const replacementTable542 = '<w:tbl>' + origTblPr + tblGrid542 + rowsXml + '</w:tbl>';
          docXml = docXml.substring(0, nextTblIdx) + replacementTable542 + docXml.substring(tblEndFull);
          console.log(`  ✅ Section 5.4.2 yield table replaced (${yieldRows.length} batch rows)`);
        }
      } else {
        console.warn('Section 5.4.2: Could not find table after "At Finished Stage:" anchor');
      }
    } else {
      console.warn('Section 5.4.2: "At Finished Stage:" anchor not found in template body');
    }

    // ── 12b. Trend Analysis of Finished Stage Yield Chart (chart12.xml) ──
    // Uses same rId-based approach as the 5.3.2 FP charts.
    // Chart has 3 series: % YIELD AT FINISHED STAGE, NLT 95%, NMT 100%
    if (yieldRows.length > 0) {
      const yieldRelsXml = await zip.file('word/_rels/document.xml.rels')?.async('string') ?? '';
      const yieldRelRx = /Id="([^"]+)"[^>]*Target="charts\/chart12\.xml"/;
      const yieldRelM = yieldRelsXml.match(yieldRelRx);

      if (yieldRelM) {
        const yieldRId = yieldRelM[1];
        const yieldRIdRef = `"${yieldRId}"`;
        const yieldRIdIdx = docXml.indexOf(yieldRIdRef);

        if (yieldRIdIdx !== -1) {
          const yieldCXmlRaw = await zip.file('word/charts/chart12.xml')?.async('string');
          if (yieldCXmlRaw) {
            const batchNos = yieldRows.map(r => r.batchNo);
            const yieldVals = yieldRows.map(r => r.avgYield);
            const nYield = yieldRows.length;
            const nltVal = 95;
            const nmtVal = 100;

            const yBuildStrCache = (vals: string[]) => {
              const pts = vals.map((v, i) => `<c:pt idx="${i}"><c:v>${xmlEscape(v)}</c:v></c:pt>`).join('');
              return `<c:strCache><c:ptCount val="${vals.length}"/>${pts}</c:strCache>`;
            };
            const yBuildNumCache = (vals: number[]) => {
              const pts = vals.map((v, i) => `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`).join('');
              return `<c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${vals.length}"/>${pts}</c:numCache>`;
            };
            const yBuildSerName = (name: string) =>
              `<c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>${xmlEscape(name)}</c:v></c:pt></c:strCache>`;
            const yFlat = (val: number, n: number) => Array(n).fill(val);

            const yieldSeries = [
              { name: '% YIELD AT FINISHED STAGE', values: yieldVals },
              { name: `NLT ${nltVal}%`, values: yFlat(nltVal, nYield) },
              { name: `NMT ${nmtVal}%`, values: yFlat(nmtVal, nYield) },
            ];

            let yieldIdx = 0;
            const updatedYieldChart = yieldCXmlRaw.replace(/<c:ser>([\s\S]*?)<\/c:ser>/g, (match, content) => {
              if (yieldIdx >= yieldSeries.length) return '';
              const sd = yieldSeries[yieldIdx++];
              let updated = content;
              updated = updated.replace(
                /(<c:tx>[\s\S]*?<c:strRef>[\s\S]*?)<c:strCache>[\s\S]*?<\/c:strCache>([\s\S]*?<\/c:strRef>[\s\S]*?<\/c:tx>)/,
                `$1${yBuildSerName(sd.name)}$2`
              );
              updated = updated.replace(
                /(<c:cat>[\s\S]*?<c:strRef>[\s\S]*?)<c:strCache>[\s\S]*?<\/c:strCache>([\s\S]*?<\/c:strRef>[\s\S]*?<\/c:cat>)/,
                `$1${yBuildStrCache(batchNos)}$2`
              );
              updated = updated.replace(
                /(<c:val>[\s\S]*?<c:numRef>[\s\S]*?)<c:numCache>[\s\S]*?<\/c:numCache>([\s\S]*?<\/c:numRef>[\s\S]*?<\/c:val>)/,
                `$1${yBuildNumCache(sd.values)}$2`
              );
              return `<c:ser>${updated}</c:ser>`;
            });

            zip.file('word/charts/chart12.xml', updatedYieldChart);
            console.log(`  ✅ chart12.xml (Finished Stage Yield) updated: ${nYield} batches`);
          }
        } else {
          console.warn(`  ⚠️ rId ${yieldRelM[1]} for chart12.xml not found in document.xml`);
        }
      } else {
        console.warn('  ⚠️ chart12.xml not found in document rels — yield chart not updated');
      }
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