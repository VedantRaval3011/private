import { Batch } from '@/models/Batch';
import { Formula } from '@/models/Formula';
import { RMCOA } from '@/models/RMCOA';
import { ProductMaster } from '@/models/ProductMaster';
import { InwardRegister } from '@/models/InwardRegister';
import { Requisition } from '@/models/Requisition';
import { MaterialRejection } from '@/models/MaterialRejection';
import { COA } from '@/models/COA';
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

interface BulkInProcessRow {
  batchNumber: string;
  arNumber: string;
  description: string;
  ph: string;
  assay: string;
}

interface FinishInProcessRow {
  batchNumber: string;
  arNumber: string;
  description: string;
  identification: Array<{ compound: string; result: string }>;
}

// Known pharmacopoeial spec tokens (longer first to avoid partial matches)
const KNOWN_SPECS = [
  'IP/USP/NF', 'IP/BP/NF', 'IP/BP/IH', 'IP/USP', 'BP/NF', 'USP/NF',
  'IP/NF', 'IP/BP', 'IP', 'BP', 'USP', 'NF', 'IH', 'EP', 'JP'
];

/**
 * Splits a material name that may contain a trailing spec token.
 * e.g. "NAPHAZOLINE HYDROCHLORIDE USP" -> { name: "NAPHAZOLINE HYDROCHLORIDE", spec: "USP" }
 */
function splitMaterialNameAndSpec(fullName: string): { name: string; spec: string } {
  const trimmed = fullName.trim();
  const upper = trimmed.toUpperCase();
  for (const spec of KNOWN_SPECS) {
    if (upper.endsWith(' ' + spec)) {
      return {
        name: trimmed.slice(0, trimmed.length - spec.length - 1).trim(),
        spec
      };
    }
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
          // Batch already exists - Aggregate Batch Size
          const existing = uniqueBatches.get(key);
          
          // Helper to parse "140 BOT" -> 140
          const parseQty = (s: string) => {
             const match = (s || '').match(/[\d.]+/);
             return match ? parseFloat(match[0]) : 0;
          };
          
          // Helper to get unit "140 BOT" -> "BOT"
          const getUnit = (s: string) => (s || '').replace(/[\d.\s]/g, '').trim();
          
          const existingQty = parseQty(existing.batchSize);
          const currentQty = parseQty(batch.batchSize);
          const unit = getUnit(batch.batchSize) || getUnit(existing.batchSize) || '';
          
          // Update total size
          const totalQty = existingQty + currentQty;
          existing.batchSize = `${totalQty} ${unit}`;
          
          // We keep the existing dates/details from the first record found
          // (Assuming splits share dates, or first entry is representative)
        } else {
          uniqueBatches.set(key, {
            ...batch,
            parsedMfgDate: mfgDate,
            dateSource, // Track which field was used
            formattedMfgDate: formatMonthYear(mfgDate),
            formattedExpDate: batch.expiryDate ? formatMonthYear(parseBatchDate(batch.expiryDate) || new Date()) : 'N/A'
          });
        }
      }
    }
  }

  // Convert to array and sort by mfgDate ascending
  const finalBatches = Array.from(uniqueBatches.values());
  finalBatches.sort((a, b) => a.parsedMfgDate.getTime() - b.parsedMfgDate.getTime());

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
        isCalculated
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

  // Prepare batch table data
  const batchTable = finalBatches.map(b => ({
    b_month: FULL_MONTHS[b.parsedMfgDate.getMonth()],
    b_num: b.batchNumber || 'N/A',
    b_size: `${b.batchSize || ''} ${b.unit || ''}`.trim() || 'N/A',
    b_mfg: b.formattedMfgDate,
    b_exp: b.formattedExpDate,
  }));

  // Prepare composition data
  const compositionData = formula.composition ? formula.composition.map((c: CompositionItem) => ({
    comp_name: c.activeIngredientName || '',
    comp_strength: c.strengthPerUnit || '',
    comp_spec: c.form || ''
  })) : [];

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

      // Get RMCOA data for this material code
      const rmcoas = await RMCOA.find({ materialCode: mat.materialCode }).lean();

      // Filter RMCOAs by year
      const yearRmcoas = rmcoas.filter((r: any) => {
        const d = parseBatchDate(r.testDate);
        return d && d.getFullYear() === yearNum;
      });

      if (yearRmcoas.length > 0) {
        // Collect all AR numbers for this material
        const arNumbers = yearRmcoas.map((rmcoa: any) => rmcoa.arNo || '').filter(ar => ar);
        
        // Get vendor from first RMCOA (prioritize supplier over manufacturer)
        const vendor = yearRmcoas[0].supplier || yearRmcoas[0].manufacturer || '';
        
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
        // Skip if no data for the year, as per requirements
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
  const mfcNo = formula.masterFormulaDetails?.masterCardNo || '';
  console.log(`\n📦 PPM Section 3.2 — MFC: ${mfcNo}`);

  // Fetch all requisition docs that contain batches with this MFC number
  // We query at the document level and filter in-memory for the nested batch/material data
  // Shared by both Section 3.2 (PPM) and Section 3.3 (Secondary)
  const requisitionDocs = await Requisition.find({
    'batches.mfcNo': mfcNo
  }).lean();
  console.log(`  Requisition docs with MFC ${mfcNo}: ${requisitionDocs.length}`);

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

      // Get vendor name from Inward Register using the first AR number found
      // (Inward Register has the full vendor name; requisition only has vendor code)
      let vendor = '';
      if (arNumbers.length > 0) {
        const inwardRecord = await InwardRegister.findOne({
          arNumber: arNumbers[0]
        }).lean();
        vendor = (inwardRecord as any)?.vendorName || '';
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

     for(const mat of packingProcess.materials) {
        if(mat.materialCode && !seenPmCodes.has(mat.materialCode)) {
           seenPmCodes.add(mat.materialCode);
           pmMaterials.push({ materialCode: mat.materialCode, materialName: mat.materialName });
        }
     }
     
     console.log(`  PM Materials from PACKING Process: ${pmMaterials.length} materials`);

     // We already have 'requisitionDocs' fetched for this MFC in previous section
     // Re-use it for filtering
     
     let pmSrNo = 1;
     for(const mat of pmMaterials) {
        // Collect matching requisition items for this material
        const matchingItems: Array<{ arNo: string; vendorCode: string }> = [];
        
        for(const doc of requisitionDocs) {
           for(const batch of (doc.batches || [])) {
              if(batch.mfcNo !== mfcNo) continue; // Should be redundant if query was correct but safe
              
              // Filter by user review year (using Requisition Batch Date or Mfg Date)
              // Logic mirrors 3.2: check if batch mfg date is in review year
              const batchDate = parseBatchDate(batch.mfgDate);
              if (!batchDate || batchDate.getFullYear() !== yearNum) continue;

              for(const item of (batch.materials || [])) {
                 if(item.materialCode === mat.materialCode && item.arNo) {
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
        if(matchingItems.length === 0) {
           console.log(`  Skipping PM Material ${mat.materialCode}: No requisition items found for MFC ${mfcNo}`);
           continue; 
        }

        const arNumbers = [...new Set(matchingItems.map(i => i.arNo).filter(ar => ar))];
        
        // Fetch Vendor from Inward Register (using first AR)
        // Fetch Artwork Status from Rejection Data (using ANY matching AR)
        
        let vendor = '';
        let isRejected = false;
        
        if (arNumbers.length > 0) {
           // Get Vendor
           const inwardRecord = await InwardRegister.findOne({
              arNumber: arNumbers[0] 
           }).lean();
           vendor = (inwardRecord as any)?.vendorName || '';

           // Check Rejection for Artwork
           // User Rule: "IF rejectionExists(materialCode, arNumber) -> REJECTED, ELSE APPROVED"
           // We check if ANY of the AR numbers for this material are in the rejection list
           
           for(const ar of arNumbers) {
              const rejection = await MaterialRejection.findOne({
                 materialCode: mat.materialCode,
                 arNumber: ar
              }).lean();
              
              if(rejection) {
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

      // Step 2: Query Inward Register for this material in review year
      const inwardRecords = await InwardRegister.find({
        materialCode: mat.materialCode
      }).lean();

      // Filter by inward date in review year
      const yearInwardRecords = inwardRecords.filter((rec: any) => {
        const d = parseBatchDate(rec.inwardDate);
        return d && d.getFullYear() === yearNum;
      });

      // Count unique AR numbers (received)
      const uniqueArNumbers = [...new Set(
        yearInwardRecords
          .map((rec: any) => (rec.arNumber || '').trim())
          .filter((ar: string) => ar && ar !== 'N/A')
      )] as string[];
      const received = uniqueArNumbers.length;

      // Step 3: Query MaterialRejection for this material in review year
      const rejectionRecords = await MaterialRejection.find({
        materialCode: mat.materialCode
      }).lean();

      // Filter by arDate in review year
      const yearRejections = rejectionRecords.filter((rec: any) => {
        const d = parseBatchDate(rec.arDate);
        return d && d.getFullYear() === yearNum;
      });
      const rejectedArNumbers = [...new Set(
        yearRejections.map((rec: any) => (rec.arNumber || '').trim()).filter((ar: string) => ar)
      )] as string[];
      const rejected = rejectedArNumbers.length;

      // Step 4: Released = Received - Rejected
      const released = received - rejected;

      // Step 5: Map AR numbers to batch numbers via requisition data
      // Build a map: arNumber -> batchNumber[] from requisition docs
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

      // Build AR entries with batch mapping
      const arEntries = uniqueArNumbers.map(ar => ({
        arNumber: ar,
        batchNumbers: arToBatchMap.has(ar) ? Array.from(arToBatchMap.get(ar)!) : []
      }));

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

      console.log(`  ${mat.materialName}: Received=${received}, Rejected=${rejected}, Released=${released}, ARs=${uniqueArNumbers.length}`);
    }
    console.log(`✅ Active Raw Material Details (Section 5.1.1): ${activeRawMaterialDetails.length} materials`);
  } else {
    console.warn('⚠️ No ASEPTIC MIXING process found for Section 5.1.1');
  }

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

      // Step 2: Get AR numbers from REQUISITION filtered by MFC + materialCode + year
      // This ensures we only get ARs relevant to THIS specific MFC product
      const arToBatchMap521 = new Map<string, Set<string>>();
      const mfcFilteredArNumbers = new Set<string>();

      for (const doc of requisitionDocs) {
        for (const batch of (doc.batches || [])) {
          if (batch.mfcNo !== mfcNo) continue;
          const batchDate = parseBatchDate(batch.mfgDate);
          if (!batchDate || batchDate.getFullYear() !== yearNum) continue;
          for (const item of (batch.materials || [])) {
            if (item.materialCode === mat.materialCode && item.arNo) {
              const arNo = (item.arNo || '').trim();
              if (arNo) {
                mfcFilteredArNumbers.add(arNo);
                if (!arToBatchMap521.has(arNo)) arToBatchMap521.set(arNo, new Set());
                arToBatchMap521.get(arNo)!.add(batch.batchNumber);
              }
            }
          }
        }
      }

      const uniqueArNumbers = [...mfcFilteredArNumbers] as string[];

      // Received = count of MFC-filtered AR numbers (consignments used by this MFC)
      const received = uniqueArNumbers.length;

      // Step 3: Query MaterialRejection — count rejected ARs (only from MFC-filtered set)
      const rejectionRecords = await MaterialRejection.find({
        materialCode: mat.materialCode
      }).lean();

      const yearRejections = rejectionRecords.filter((rec: any) => {
        const d = parseBatchDate(rec.arDate);
        if (!d || d.getFullYear() !== yearNum) return false;
        // Only count rejections for ARs that belong to this MFC
        const rejArNo = (rec.arNumber || '').trim();
        return mfcFilteredArNumbers.has(rejArNo);
      });
      const rejectedArNumbers = [...new Set(
        yearRejections.map((rec: any) => (rec.arNumber || '').trim()).filter((ar: string) => ar)
      )] as string[];
      const rejected = rejectedArNumbers.length;

      // Step 4: Released = Received - Rejected
      const released = received - rejected;

      // Build AR entries with batch mapping (already built above)
      const arEntries = uniqueArNumbers.map(ar => ({
        arNumber: ar,
        batchNumbers: arToBatchMap521.has(ar) ? Array.from(arToBatchMap521.get(ar)!) : []
      }));

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

      console.log(`  ${mat.materialName}: Received=${received}, Rejected=${rejected}, Released=${released}, ARs=${uniqueArNumbers.length}`);
    }
    console.log(`✅ Primary Packing Material Details (Section 5.2.1): ${primaryPackingMaterialDetails.length} materials`);
  } else {
    console.warn('⚠️ No ASEPTIC FILLING process found for Section 5.2.1');
  }

  // ── Section 5.3.1 — Bulk In-Process Analysis Results ──
  const bulkInProcessData: BulkInProcessRow[] = [];
  let bulkDescriptionLimit = '';
  let bulkPhLimit = '';
  let bulkAssayCompound = '';
  let bulkAssayLimit = '';

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

      // Assay header: find compound testParameter (not PH, ASSAY, or DESCRIPTION)
      // The compound name (e.g., "SODIUM HYALURONATE") is stored as a testParameter name
      const SKIP_NAMES = ['PH', 'ASSAY', 'DESCRIPTION'];
      const assayHeaderParam = (firstBd.testParameters || []).find((p: any) => {
        const n = (p.name || '').toUpperCase().trim();
        return n && !SKIP_NAMES.includes(n);
      });
      if (assayHeaderParam) {
        bulkAssayCompound = assayHeaderParam.name || '';
        bulkAssayLimit = (assayHeaderParam.limits || '');
        // Clean multi-line/multi-part limits (take first line)
        if (bulkAssayLimit.includes('\n') || bulkAssayLimit.includes('\r')) {
          bulkAssayLimit = bulkAssayLimit.split(/[\r\n]/)[0].trim();
        }
      } else {
        // Fallback: try assayResults array
        const assayHeaderEntry = (firstBd.assayResults || []).find((a: any) => a.compound);
        if (assayHeaderEntry) {
          bulkAssayCompound = assayHeaderEntry.compound || '';
          bulkAssayLimit = assayHeaderEntry.specification || '';
          if (bulkAssayLimit.includes('\n')) {
            bulkAssayLimit = bulkAssayLimit.split('\n')[0].trim();
          }
        }
      }

      console.log(`  Header: Desc="${bulkDescriptionLimit.substring(0, 50)}...", pH="${bulkPhLimit}", Assay="${bulkAssayCompound} (${bulkAssayLimit})"`);
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

      // Assay: find compound testParameter matching the header compound
      let assay = '';
      if (bulkAssayCompound) {
        const assayParam = (bd.testParameters || []).find((p: any) =>
          (p.name || '').toUpperCase().trim() === bulkAssayCompound.toUpperCase().trim()
        );
        assay = assayParam?.result || '';
      }
      if (!assay) {
        // Fallback: try assayResults array
        const assayEntry = (bd.assayResults || []).find((a: any) =>
          (a.compound || '').trim() !== ''
        );
        assay = assayEntry?.result || '';
      }
      // If result is multi-line (e.g. "103.70 % \r\ni.e. 0.1037 % w/v"), take first line only
      if (assay.includes('\n') || assay.includes('\r')) {
        assay = assay.split(/[\r\n]/)[0].trim();
      }

      bulkInProcessData.push({
        batchNumber: batch.batchNumber,
        arNumber,
        description,
        ph,
        assay
      });

      console.log(`  ${batch.batchNumber}: AR=${arNumber}, pH=${ph}, Assay=${assay}`);
    }
    console.log(`✅ Section 5.3.1: ${bulkInProcessData.length} bulk in-process rows`);
  }

  // ── Section 5.3.2 — Finish Stage COA Analysis Results ──
  const finishInProcessData: FinishInProcessRow[] = [];
  let finishDescriptionLimit = '';
  let finishIdentificationCompounds: string[] = []; // dynamic — one per compound found
  let finishIdentificationSpecifications: string[] = []; // limit row text per compound

  if (finalBatches.length > 0) {
    const batchNumbers = finalBatches.map((b: any) => b.batchNumber);
    console.log(`\n📋 Section 5.3.2: Fetching FINISH COAs for ${batchNumbers.length} batches`);

    const finishCoas = await COA.find({
      batchNumber: { $in: batchNumbers },
      stage: 'FINISH',
    }).sort({ uploadedAt: -1 }).lean();

    // Deduplicate: keep latest COA per batch
    const coaByBatchFinish = new Map<string, any>();
    for (const coa of finishCoas) {
      if (!coaByBatchFinish.has(coa.batchNumber)) {
        coaByBatchFinish.set(coa.batchNumber, coa);
      }
    }

    // Extract header metadata from first available FINISH COA
    const firstFinishCoa = coaByBatchFinish.values().next().value;
    const firstFd = firstFinishCoa?.finishData;
    if (firstFd) {
      // Description limit: from criticalParameters where name === 'Description'
      const descParam = (firstFd.criticalParameters || []).find(
        (p: any) => (p.name || '').toUpperCase() === 'DESCRIPTION'
      );
      finishDescriptionLimit = descParam?.limit || '';

      // Identification compounds (dynamic — no hardcoding)
      finishIdentificationCompounds = (firstFd.identificationTests || [])
        .map((id: any) => (id.compound || '').trim())
        .filter(Boolean);

      // Identification specifications (limit text per compound)
      finishIdentificationSpecifications = (firstFd.identificationTests || [])
        .map((id: any) => (id.specification || '').trim());

      console.log(`  FINISH header: DescLimit="${finishDescriptionLimit.substring(0, 40)}...", Compounds=${JSON.stringify(finishIdentificationCompounds)}`);
    }

    // Build one row per batch (same order as finalBatches)
    for (const batch of finalBatches) {
      const coa = coaByBatchFinish.get(batch.batchNumber);
      if (!coa || !coa.finishData) {
        console.warn(`  ⚠️ No FINISH COA found for batch ${batch.batchNumber}`);
        continue;
      }

      const fd = coa.finishData;
      const arNumber = coa.arNumber || fd.arNumber || '';

      // Description result: from criticalParameters
      const descParam = (fd.criticalParameters || []).find(
        (p: any) => (p.name || '').toUpperCase() === 'DESCRIPTION'
      );
      const description = descParam?.result || '';

      // Identification results: dynamic, matched by compound name
      const identification = finishIdentificationCompounds.map((compound: string) => {
        const idTest = (fd.identificationTests || []).find(
          (id: any) => (id.compound || '').trim() === compound
        );
        const raw = idTest?.result || null;
        const isComplies =
          raw?.toLowerCase() === 'complies' ||
          raw === '-' ||
          raw === '' ||
          raw == null;
        return { compound, result: isComplies ? 'Complies' : (raw || 'Complies') };
      });

      finishInProcessData.push({ batchNumber: batch.batchNumber, arNumber, description, identification });
      console.log(`  FINISH ${batch.batchNumber}: AR=${arNumber}, Desc=${description.substring(0, 30)}, IDs=${identification.map(i => i.result).join('|')}`);
    }
    console.log(`✅ Section 5.3.2: ${finishInProcessData.length} finish in-process rows`);
  }

  return {
    company_name: formula.companyInfo?.companyName || 'INDIANA OPHTHALMICS LLP',
    company_address: formula.companyInfo?.companyAddress || '132, 135, 136, 137, GIDC ESTATE, WADHWAN CITY',

    // From Product Master
    product_name: productMaster?.productName || '',
    product_code: productCode,
    generic_name: productMaster?.genericName || '',
    therapeutic_category: productMaster?.therapeuticCategory || '',
    storage_condition: productMaster?.storageCondition || '',

    // From Formula Master
    label_claim: formula.batchInfo?.labelClaim || '',
    shelf_life: formula.masterFormulaDetails?.shelfLife || '',
    mfg_lic_no: formula.masterFormulaDetails?.manufacturingLicenseNo || '',

    // Keep empty (no data source yet)
    dosage_form: '',
    pack_style: '',

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
    primaryPackingMaterialDetails, // Section 5.2.1 - Batch Wise Primary Packing Material Details
    bulkInProcessData,             // Section 5.3.1 - In-Process Analysis Results at Bulk Stage
    bulkInProcessHeader: {         // Section 5.3.1 - Dynamic header from COA limits
      descriptionLimit: bulkDescriptionLimit,
      phLimit: bulkPhLimit,
      assayCompound: bulkAssayCompound,
      assayLimit: bulkAssayLimit,
    },
    finishInProcessData,           // Section 5.3.2 - In-Process Analysis Results at Finish Stage
    finishInProcessHeader: {       // Section 5.3.2 - Dynamic header from FINISH COA limits
      descriptionLimit: finishDescriptionLimit,
      identificationCompounds: finishIdentificationCompounds,
      identificationSpecifications: finishIdentificationSpecifications,
    },

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
function replaceCellText(rowXml: string, cellIndex: number, newText: string, isRawXml: boolean = false): string {
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
      const tcPr = tcPrMatch ? tcPrMatch[0] : '';
      
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
    const tcPr = tcPrMatch ? tcPrMatch[0] : '';
    
    // Preserve <w:pPr> (paragraph properties like alignment)
    const pPrMatch = valueCell.match(/<w:pPr>[\s\S]*?<\/w:pPr>/);
    const pPr = pPrMatch ? pPrMatch[0] : '';
    
    // Preserve <w:rPr> (run properties like font size, bold, font family)
    // but REMOVE color to avoid red placeholder text
    const rPrMatch = valueCell.match(/<w:rPr>[\s\S]*?<\/w:rPr>/);
    let rPr = rPrMatch ? rPrMatch[0] : '';
    
    // Remove <w:color> tag to clear red placeholder color
    if (rPr) {
      rPr = rPr.replace(/<w:color\b[^>]*\/>/g, '');
      rPr = rPr.replace(/<w:color\b[^>]*>[\s\S]*?<\/w:color>/g, '');
    }
    
    // Build new cell preserving original formatting (minus color)
    const escapedValue = xmlEscape(newValue);
    const newCell = `<w:tc>${tcPr}<w:p>${pPr}<w:r>${rPr}<w:t>${escapedValue}</w:t></w:r></w:p></w:tc>`;
    
    // Replace in the row
    const newRowXml = rowXml.substring(0, cells[1].start) + newCell + rowXml.substring(cells[1].end);
    
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

  // ── 2b. Global text replacements for non-table content ────────────
  // Only for items that appear outside the Brief Description table.
  const replacements: [string, string][] = [
    // Product name in headers/titles (e.g. "PRODUCT NAME: - SODIUM HYALURONATE EYE DROPS")
    ['SODIUM HYALURONATE EYE DROPS', xmlEscape(data.product_name)],

    // Product code in headers
    ['SY208G1H', xmlEscape(data.product_code)],

    // Clear secondary composition items that are template-specific
    ['STABILIZED OXYCHLORO COMPLEX', ''],
    ['STERILE AQUEOUS BASE', ''],
    ['(AS PRESERVATIVE)', ''],
  ];

  for (const [find, replace] of replacements) {
    docXml = replaceTextInXml(docXml, find, replace);
  }

  // ── 3. Clear specific specification cells in the composition table ─
  // These are exact <w:t> contents that are template-specific
  const clearCells = ['BP', '0.1% WV', '0.005% W/V', 'Q. S'];
  for (const cell of clearCells) {
    // Only replace exact-match <w:t> contents (not substrings)
    docXml = docXml.replace(
      new RegExp(`(<w:t[^>]*>)${cell.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(<\\/w:t>)`, 'g'),
      '$1$2'
    );
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
              
              const newCell = `<w:tc>${tcPr}<w:p>${pPr}<w:r>${rPr}<w:t>${newValue}</w:t></w:r></w:p></w:tc>`;
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
          
          if (combined.includes('Details of Product') || combined.includes('Batch Number') || combined.includes('Month') && combined.includes('Batch')) {
            headerEndIdx = i + 1;
          }
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
        
        // Get a template data row to use as a pattern (first data row)
        const templateDataRow = rows[headerEndIdx]?.xml || '';
        
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
            // 5. Vendor
            rowXml = replaceCellText(rowXml, 4, xmlEscape(item.vendor));

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
          for (const item of data.ppmVendorDetails) {
            let rowXml = ppmTemplateRow;
            rowXml = replaceCellText(rowXml, 0, item.srNo.toString());
            rowXml = replaceCellText(rowXml, 1, xmlEscape(item.materialCode));
            rowXml = replaceCellText(rowXml, 2, xmlEscape(item.materialName));
            const arNumbersText = item.arNumbers.join('<w:br/>');
            rowXml = replaceCellText(rowXml, 3, arNumbersText, true);
            rowXml = replaceCellText(rowXml, 4, xmlEscape(item.vendor));
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
      
      if(artHeaderMatch && artHeaderMatch.index !== undefined) {
         const tableEndRegex = /<\/w:tbl>/g;
         tableEndRegex.lastIndex = artHeaderMatch.index + artHeaderMatch[0].length;
         const tableEndMatch = tableEndRegex.exec(docXml);
         
         if(tableEndMatch) {
            const tableEndIndex = tableEndMatch.index;
            const headerRowEnd = artHeaderMatch.index + artHeaderMatch[0].length;
            
            // Find template rows
            const rowsRegex = /<w:tr[^>]*>[\s\S]*?<\/w:tr>/g;
            rowsRegex.lastIndex = headerRowEnd;
            
            const firstRowMatch = rowsRegex.exec(docXml);
            if(firstRowMatch && firstRowMatch.index < tableEndIndex) {
               const templateRow = firstRowMatch[0];
               const templateRowStart = firstRowMatch.index;
               
               let lastRowEnd = firstRowMatch.index + firstRowMatch[0].length;
               let nextRow;
               while((nextRow = rowsRegex.exec(docXml)) !== null && nextRow.index < tableEndIndex) {
                  lastRowEnd = nextRow.index + nextRow[0].length;
               }
               
               console.log(`Secondary Pkg table: replacing template rows with ${data.secondaryPackagingDetails.length} data rows`);
               
               // Generate new Rows
               let newRowsXml = '';
               for(const item of data.secondaryPackagingDetails) {
                  let rowXml = templateRow;
                  rowXml = replaceCellText(rowXml, 0, item.srNo.toString());
                  rowXml = replaceCellText(rowXml, 1, xmlEscape(item.materialCode));
                  rowXml = replaceCellText(rowXml, 2, xmlEscape(item.materialName));
                  // Vendor (merged with AR? No, check table structure)
                  // Table format: Sr | Mat Code | Name | Vendor | Artwork
                  // (AR Numbers are NOT in the table columns list provided by user for 3.3)
                  // "Name of Approved Vendor Column Source: Inward Register"
                  // "Artwork Approved Column"
                  // Wait, user provided table mapping:
                  // Sr. No, Material Code, Name of Material, Name of Approved Vendor, Artwork Approved
                  // BUT in 3.2 logic we had AR numbers. User said "We show too many AR numbers" for 3.2.
                  // For 3.3, user lists: "Sr. No, Material Code, Name of Material, Name of Approved Vendor, Artwork Approved"
                  // AR Number is mentioned in "Fetch AR Number" step but NOT in "Final Table Mapping Summary".
                  // AND the screenshot shows 5 columns: Sr, Code, Name, Vendor, Artwork Approved.
                  // So NO AR Number column directly in the table? 
                  // But 3.2 had AR Number column. 
                  // Wait, looking at screen shot for Section 3.3 title:
                  // Columns are: Sr. No., Material Code, Name of Material, Name of Approved vendor, Artwork Approved
                  // Indeed, AR Number is NOT a visible column in the screenshot.
                  // But typically AR Number is needed to trace the vendor. 
                  // I will populate Vendor derived from AR.
                  
                  // Column 3 is Vendor? 
                  // Index 0: Sr No
                  // Index 1: Material Code
                  // Index 2: Name of Material
                  // Index 3: Name of Approved Vendor
                  // Index 4: Artwork Approved
                  
                  rowXml = replaceCellText(rowXml, 3, xmlEscape(item.vendor));
                  rowXml = replaceCellText(rowXml, 4, xmlEscape(item.artworkStatus));
                  
                  // Clean up potentially red placeholder text in columns
                  newRowsXml += rowXml;
               }
               
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
            const batchQtyDisplay = row.isCalculated ? `*${row.qtyRequiredPerBatch}` : row.qtyRequiredPerBatch;
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

  // ── 10b. Dynamic Section 5.2.1 – Batch Wise Primary Packing Material Details ──
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

    // Find the section 5.3.1 table by its unique header text "Critical Parameters"
    // This text appears ONLY in the section 5.3.1 data table header row.
    // We use lastIndexOf('<w:tbl>') to walk backwards to the enclosing table start.
    const critParamIdx = docXml.indexOf('Critical Parameters');
    if (critParamIdx !== -1) {
      // Walk backwards to find the enclosing <w:tbl>
      const tblStart531 = docXml.lastIndexOf('<w:tbl>', critParamIdx);
      const afterTblStart = docXml.substring(tblStart531);
      const tblEndOffset531 = afterTblStart.indexOf('</w:tbl>');
      
      if (tblStart531 !== -1 && tblEndOffset531 !== -1) {
        const tblEnd531 = tblStart531 + tblEndOffset531 + 8;
        const origTable531 = docXml.substring(tblStart531, tblEnd531);

          // Preserve original table properties and grid
          const origTblPr531 = origTable531.match(/<w:tblPr>[\s\S]*?<\/w:tblPr>/)?.[0]
            || '<w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:jc w:val="center"/><w:tblBorders>'
            + '<w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
            + '<w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
            + '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
            + '<w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
            + '<w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
            + '<w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
            + '</w:tblBorders></w:tblPr>';

          const origTblGrid531 = origTable531.match(/<w:tblGrid>[\s\S]*?<\/w:tblGrid>/)?.[0]
            || '<w:tblGrid><w:gridCol w:w="1500"/><w:gridCol w:w="1800"/>'
            + '<w:gridCol w:w="3200"/><w:gridCol w:w="1200"/><w:gridCol w:w="1800"/></w:tblGrid>';

          // ── Build DYNAMIC header rows from COA specification data ──
          const hdr = data.bulkInProcessHeader || {};
          const hDescLimit = xmlEscape(hdr.descriptionLimit || '');
          const hPhLimit = xmlEscape(hdr.phLimit || '');
          const hAssayCompound = xmlEscape(hdr.assayCompound || '');
          const hAssayLimit = xmlEscape(hdr.assayLimit || '');

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

          // Row 0: "Batch Number" (vMerge start) | "AR. Number" (vMerge start) | "Critical Parameters (Limit)" (gridSpan 3)
          const dynHeaderRow1 = '<w:tr><w:trPr><w:trHeight w:val="432"/><w:jc w:val="center"/></w:trPr>'
            + headerCell531('Batch Number', { vMerge: 'restart' })
            + headerCell531('AR. Number', { vMerge: 'restart' })
            + headerCell531('Critical Parameters (Limit)', { gridSpan: 3 })
            + '</w:tr>';

          // Row 1: "" (vMerge cont) | "" (vMerge cont) | "Description: {limit}" | "pH ({limit})" | "Assay (%) {compound} ({limits})"
          const dynHeaderRow2 = '<w:tr><w:trPr><w:trHeight w:val="432"/><w:jc w:val="center"/></w:trPr>'
            + headerCell531('', { vMerge: 'continue' })
            + headerCell531('', { vMerge: 'continue' })
            + headerCell531(`Description: ${hDescLimit}`)
            + headerCell531(`pH (${hPhLimit})`)
            + headerCell531(`Assay (%) ${hAssayCompound} (${hAssayLimit})`)
            + '</w:tr>';

          // Find the remark table (separate table after this data table)
          // It contains "Remark:" and "Prepared By QA"
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

              const remarkContentRow531 = '<w:tr><w:tc><w:tcPr><w:gridSpan w:val="5"/>'
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

          // Build data rows
          let dataRows531Xml = '';
          for (const row of data.bulkInProcessData) {
            dataRows531Xml += '<w:tr><w:trPr><w:jc w:val="center"/></w:trPr>';
            dataRows531Xml += dataCell531(row.batchNumber);
            dataRows531Xml += dataCell531(row.arNumber);
            dataRows531Xml += dataCell531(row.description);
            dataRows531Xml += dataCell531(row.ph);
            dataRows531Xml += dataCell531(row.assay);
            dataRows531Xml += '</w:tr>';
          }

          // Build replacement data table with DYNAMIC headers
          const replacementTable531 = '<w:tbl>' + origTblPr531 + origTblGrid531
            + dynHeaderRow1 + dynHeaderRow2
            + dataRows531Xml
            + '</w:tbl>';

          // Replace: data table + remark table (if found)
          if (remarkTblEndFull531 !== -1) {
            // Replace both the data table AND the remark table
            docXml = docXml.substring(0, tblStart531) + replacementTable531 + remarkTable531Xml + docXml.substring(remarkTblEndFull531);
            console.log(`  ✅ Section 5.3.1 data table + remark table replaced`);
          } else {
            // Replace only the data table
            docXml = docXml.substring(0, tblStart531) + replacementTable531 + docXml.substring(tblEnd531);
            console.log(`  ✅ Section 5.3.1 data table replaced (remark table not found)`);
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
  const cpkTblGrid = origCpkTable.match(/<w:tblGrid>[\s\S]*?<\/w:tblGrid>/)?.[0] || '<w:tblGrid/>';

  const phValues = data.bulkInProcessData.map(r => parseFloat(r.ph));
  const assayValues = data.bulkInProcessData.map(r => parseFloat(r.assay));

  const hdr = data.bulkInProcessHeader || {};
  const phStats = calculateProcessCapability(phValues, hdr.phLimit || '');
  const assayStats = calculateProcessCapability(assayValues, hdr.assayLimit || '');

  console.log(`  📊 Process Capability: pH=${!!phStats}, Assay=${!!assayStats}`);

  const fmt5 = (num: number | undefined) => num !== undefined && !isNaN(num) ? num.toFixed(5) : 'N/A';
  const fmt2 = (num: number | undefined) => num !== undefined && !isNaN(num) ? num.toFixed(2) : 'N/A';

  const boldP = (text: string) =>
    `<w:p><w:pPr><w:spacing w:before="0"/><w:jc w:val="center"/>`
    + `<w:rPr><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:pPr>`
    + `<w:r><w:rPr><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>`
    + `<w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r></w:p>`;

  const uslLslPh    = phStats    ? phStats.usl    - phStats.lsl    : NaN;
  const uslAvgPh    = phStats    ? phStats.usl    - phStats.average : NaN;
  const avgLslPh    = phStats    ? phStats.average - phStats.lsl   : NaN;
  const uslLslAssay = assayStats ? assayStats.usl - assayStats.lsl : NaN;
  const uslAvgAssay = assayStats ? assayStats.usl - assayStats.average : NaN;
  const avgLslAssay = assayStats ? assayStats.average - assayStats.lsl : NaN;

  const vMergeContCol =
    `<w:tc><w:tcPr><w:tcW w:w="811" w:type="pct"/><w:vMerge w:val="continue"/>`
    + `<w:vAlign w:val="center"/></w:tcPr><w:p/></w:tc>`;

  const buildShortTermRow = (label: string, phVal: string, assayVal: string, isShaded = false) => {
    const shade = isShaded ? `<w:shd w:val="clear" w:color="auto" w:fill="D9D9D9"/>` : '';
    return `<w:tr><w:trPr><w:trHeight w:val="397"/><w:jc w:val="center"/></w:trPr>`
      + vMergeContCol
      + `<w:tc><w:tcPr><w:tcW w:w="1661" w:type="pct"/>${shade}<w:vAlign w:val="center"/></w:tcPr>`
      + `<w:p><w:pPr><w:spacing w:before="0"/><w:jc w:val="center"/>`
      + `<w:rPr><w:b/><w:sz w:val="24"/></w:rPr></w:pPr>`
      + `<w:r><w:rPr><w:b/><w:sz w:val="24"/></w:rPr>`
      + `<w:t xml:space="preserve">${xmlEscape(label)}</w:t></w:r></w:p></w:tc>`
      + `<w:tc><w:tcPr><w:tcW w:w="1081" w:type="pct"/>${shade}<w:vAlign w:val="center"/></w:tcPr>`
      + `<w:p><w:pPr><w:spacing w:before="0"/><w:jc w:val="center"/>`
      + `<w:rPr><w:sz w:val="24"/></w:rPr></w:pPr>`
      + `<w:r><w:rPr><w:sz w:val="24"/></w:rPr><w:t>${phVal}</w:t></w:r></w:p></w:tc>`
      + `<w:tc><w:tcPr><w:tcW w:w="1447" w:type="pct"/>${shade}<w:vAlign w:val="center"/></w:tcPr>`
      + `<w:p><w:pPr><w:spacing w:before="0"/><w:jc w:val="center"/>`
      + `<w:rPr><w:sz w:val="24"/></w:rPr></w:pPr>`
      + `<w:r><w:rPr><w:sz w:val="24"/></w:rPr><w:t>${assayVal}</w:t></w:r></w:p></w:tc>`
      + `</w:tr>`;
  };

  const buildSimpleRow = (col1Xml: string, phVal: string, assayVal: string) =>
    `<w:tr><w:trPr><w:trHeight w:val="397"/><w:jc w:val="center"/></w:trPr>`
    + `<w:tc><w:tcPr><w:tcW w:w="2472" w:type="pct"/><w:gridSpan w:val="2"/>`
    + `<w:vAlign w:val="center"/></w:tcPr>${col1Xml}</w:tc>`
    + `<w:tc><w:tcPr><w:tcW w:w="1081" w:type="pct"/><w:vAlign w:val="center"/></w:tcPr>`
    + `<w:p><w:pPr><w:spacing w:before="0"/><w:jc w:val="center"/>`
    + `<w:rPr><w:sz w:val="24"/></w:rPr></w:pPr>`
    + `<w:r><w:rPr><w:sz w:val="24"/></w:rPr><w:t>${xmlEscape(phVal)}</w:t></w:r></w:p></w:tc>`
    + `<w:tc><w:tcPr><w:tcW w:w="1447" w:type="pct"/><w:vAlign w:val="center"/></w:tcPr>`
    + `<w:p><w:pPr><w:spacing w:before="0"/><w:jc w:val="center"/>`
    + `<w:rPr><w:sz w:val="24"/></w:rPr></w:pPr>`
    + `<w:r><w:rPr><w:sz w:val="24"/></w:rPr><w:t>${xmlEscape(assayVal)}</w:t></w:r></w:p></w:tc>`
    + `</w:tr>`;

  let dynCpkRows = '';

  // ── ROW 1: Title row — spans ALL columns — generated fresh for THIS product ──
  // FIX: Previously this row was preserved from the template (stale), now we generate it.
  dynCpkRows +=
    `<w:tr><w:trPr><w:trHeight w:val="397"/><w:jc w:val="center"/></w:trPr>`
    + `<w:tc><w:tcPr><w:tcW w:w="5000" w:type="pct"/><w:gridSpan w:val="4"/>`
    + `<w:shd w:val="clear" w:color="auto" w:fill="D9D9D9"/><w:vAlign w:val="center"/></w:tcPr>`
    + `<w:p><w:pPr><w:spacing w:before="0"/><w:jc w:val="center"/>`
    + `<w:rPr><w:b/><w:color w:val="7F6000"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:pPr>`
    + `<w:r><w:rPr><w:b/><w:color w:val="7F6000"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>`
    + `<w:t>Process Capability &amp; Performance parameters (Cp, Cpk, and Pp, Ppk)</w:t>`
    + `</w:r></w:p></w:tc>`
    + `</w:tr>`;

  // ── ROW 2: Column headers — pH | Assay (%) {compound} — for THIS product's data ──
  dynCpkRows +=
    `<w:tr><w:trPr><w:trHeight w:val="397"/><w:jc w:val="center"/></w:trPr>`
    + `<w:tc><w:tcPr><w:tcW w:w="2472" w:type="pct"/><w:gridSpan w:val="2"/>`
    + `<w:shd w:val="clear" w:color="auto" w:fill="D9D9D9"/><w:vAlign w:val="center"/></w:tcPr>`
    + `<w:p/></w:tc>`
    + `<w:tc><w:tcPr><w:tcW w:w="1081" w:type="pct"/>`
    + `<w:shd w:val="clear" w:color="auto" w:fill="D9D9D9"/><w:vAlign w:val="center"/></w:tcPr>`
    + boldP('pH') + `</w:tc>`
    + `<w:tc><w:tcPr><w:tcW w:w="1447" w:type="pct"/>`
    + `<w:shd w:val="clear" w:color="auto" w:fill="D9D9D9"/><w:vAlign w:val="center"/></w:tcPr>`
    + boldP('Assay (%)') + boldP(hdr.assayCompound || 'Sodium Hyaluronate') + `</w:tc>`
    + `</w:tr>`;

  // ── ROWS 3–8: Basic statistics ──
  dynCpkRows += buildSimpleRow(boldP('Average'),                                       fmt5(phStats?.average),  fmt5(assayStats?.average));
  dynCpkRows += buildSimpleRow(boldP('Maximum'),                                       fmt5(phStats?.max),      fmt5(assayStats?.max));
  dynCpkRows += buildSimpleRow(boldP('Minimum'),                                       fmt5(phStats?.min),      fmt5(assayStats?.min));
  dynCpkRows += buildSimpleRow(boldP('Upper Specification Limit \u2013 Lower Specification Limit (USL \u2013 LSL)'), fmt5(uslLslPh), fmt5(uslLslAssay));
  dynCpkRows += buildSimpleRow(boldP('Upper Specification Limit (USL) \u2013 Average'), fmt5(uslAvgPh),         fmt5(uslAvgAssay));
  dynCpkRows += buildSimpleRow(boldP('Average \u2013 Lower Specification Limit (LSL)'), fmt5(avgLslPh),         fmt5(avgLslAssay));

  // ── ROWS 9–15: Short-Term (Cp, Cpk) ──
  // Row 9: Short-Term header with vMerge + "Estimated Std Deviation (σ)"
  dynCpkRows +=
    `<w:tr><w:trPr><w:trHeight w:val="397"/><w:jc w:val="center"/></w:trPr>`
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
    + `<w:r><w:rPr><w:b/><w:sz w:val="24"/></w:rPr><w:t xml:space="preserve">)</w:t></w:r></w:p></w:tc>`
    + `<w:tc><w:tcPr><w:tcW w:w="1081" w:type="pct"/><w:vAlign w:val="center"/></w:tcPr>`
    + `<w:p><w:pPr><w:spacing w:before="0"/><w:jc w:val="center"/>`
    + `<w:rPr><w:sz w:val="24"/></w:rPr></w:pPr>`
    + `<w:r><w:rPr><w:sz w:val="24"/></w:rPr><w:t>${fmt5(phStats?.sigmaEstimated)}</w:t></w:r></w:p></w:tc>`
    + `<w:tc><w:tcPr><w:tcW w:w="1447" w:type="pct"/><w:vAlign w:val="center"/></w:tcPr>`
    + `<w:p><w:pPr><w:spacing w:before="0"/><w:jc w:val="center"/>`
    + `<w:rPr><w:sz w:val="24"/></w:rPr></w:pPr>`
    + `<w:r><w:rPr><w:sz w:val="24"/></w:rPr><w:t>${fmt5(assayStats?.sigmaEstimated)}</w:t></w:r></w:p></w:tc>`
    + `</w:tr>`;

  dynCpkRows += buildShortTermRow('3\u03c3 = (3 X \u03c3)',              fmt2(phStats    ? phStats.sigmaEstimated    * 3 : undefined), fmt2(assayStats ? assayStats.sigmaEstimated    * 3 : undefined));
  dynCpkRows += buildShortTermRow('6\u03c3 = (6 X \u03c3)',              fmt2(phStats    ? phStats.sigmaEstimated    * 6 : undefined), fmt2(assayStats ? assayStats.sigmaEstimated    * 6 : undefined));
  dynCpkRows += buildShortTermRow('Cpku = (USL \u2013 Average) / 3\u03c3', fmt2(phStats?.cpku),  fmt2(assayStats?.cpku));
  dynCpkRows += buildShortTermRow('Cpkl = (Average \u2013 LSL) / 3\u03c3', fmt2(phStats?.cpkl),  fmt2(assayStats?.cpkl));
  dynCpkRows += buildShortTermRow('Cpk Value = Min (Cpkl & Cpku)',        fmt2(phStats?.cpk),   fmt2(assayStats?.cpk),  true);
  dynCpkRows += buildShortTermRow('Cp Value = (USL \u2013 LSL) / 6\u03c3', fmt2(phStats?.cp),    fmt2(assayStats?.cp),   true);

  // ── ROWS 16–22: Long-Term (Pp, Ppk) ──
  dynCpkRows +=
    `<w:tr><w:trPr><w:trHeight w:val="397"/><w:jc w:val="center"/></w:trPr>`
    + `<w:tc><w:tcPr><w:tcW w:w="811" w:type="pct"/><w:vMerge w:val="restart"/>`
    + `<w:vAlign w:val="center"/></w:tcPr>`
    + boldP('Process Performance parameters (Long-Term Statistics)') + `</w:tc>`
    + `<w:tc><w:tcPr><w:tcW w:w="1661" w:type="pct"/><w:vAlign w:val="center"/></w:tcPr>`
    + boldP('Std Deviation (S)') + `</w:tc>`
    + `<w:tc><w:tcPr><w:tcW w:w="1081" w:type="pct"/><w:vAlign w:val="center"/></w:tcPr>`
    + `<w:p><w:pPr><w:spacing w:before="0"/><w:jc w:val="center"/>`
    + `<w:rPr><w:sz w:val="24"/></w:rPr></w:pPr>`
    + `<w:r><w:rPr><w:sz w:val="24"/></w:rPr><w:t>${fmt5(phStats?.sigmaSample)}</w:t></w:r></w:p></w:tc>`
    + `<w:tc><w:tcPr><w:tcW w:w="1447" w:type="pct"/><w:vAlign w:val="center"/></w:tcPr>`
    + `<w:p><w:pPr><w:spacing w:before="0"/><w:jc w:val="center"/>`
    + `<w:rPr><w:sz w:val="24"/></w:rPr></w:pPr>`
    + `<w:r><w:rPr><w:sz w:val="24"/></w:rPr><w:t>${fmt5(assayStats?.sigmaSample)}</w:t></w:r></w:p></w:tc>`
    + `</w:tr>`;

  dynCpkRows += buildShortTermRow('3S = (3 X Std deviation)', fmt2(phStats    ? phStats.sigmaSample    * 3 : undefined), fmt2(assayStats ? assayStats.sigmaSample    * 3 : undefined));
  dynCpkRows += buildShortTermRow('6S = (6 X Std deviation)', fmt2(phStats    ? phStats.sigmaSample    * 6 : undefined), fmt2(assayStats ? assayStats.sigmaSample    * 6 : undefined));
  dynCpkRows += buildShortTermRow('Ppku = (USL \u2013 Average) / 3S',     fmt2(phStats?.ppku),  fmt2(assayStats?.ppku));
  dynCpkRows += buildShortTermRow('Ppkl = (Average \u2013 LSL) / 3S',     fmt2(phStats?.ppkl),  fmt2(assayStats?.ppkl));
  dynCpkRows += buildShortTermRow('Ppk Value = Min(Ppkl & Ppku)',          fmt2(phStats?.ppk),   fmt2(assayStats?.ppk));
  dynCpkRows += buildShortTermRow('Pp Value = (USL \u2013 LSL) / 6S',      fmt2(phStats?.pp),    fmt2(assayStats?.pp));

  // ── Assemble and replace the ENTIRE table ──
  const replacementCpkTable = '<w:tbl>' + cpkTblPr + cpkTblGrid + dynCpkRows + '</w:tbl>';

  docXml = docXml.substring(0, cpkTblStart) + replacementCpkTable + docXml.substring(cpkTblEndFull);
  console.log(`  ✅ Process Capability & Performance parameters table replaced (including title + column headers)`);
}
  }

  // ── 11c. Dynamic Section 5.3.2 – In-Process Analysis Results at Finish Stage ──
  // Always runs — replaces the template table whether or not FINISH COA data exists.
  // This ensures switching products clears the previous product's stale values.
  {
    const finishRows: any[] = data.finishInProcessData || [];
    console.log(`\n📋 Section 5.3.2 Finish In-Process: ${finishRows.length} rows`);

    const fhdr = data.finishInProcessHeader || {};
    const compounds: string[] = fhdr.identificationCompounds || [];
    const specs: string[] = fhdr.identificationSpecifications || [];

    // Find the 5.3.2 table by its unique anchor text "Finished Product Analysis"
    // This text appears in the paragraph immediately before the table in the template.
    // We search starting AFTER the 5.3.1 area to avoid matching the wrong occurrence.
    // The 5.3.1 "Critical Parameters" table is Table 20; we need Table 28.
    const finishTableAnchors = [
      'Finished Product Analysis',
      'Finished Product',
    ];

    let finishTblStart = -1;
    let finishTblEnd = -1;

    // Start searching from well past the 5.3.1 section (halfway through the doc)
    const searchStartPos532 = Math.floor(docXml.length * 0.4);

    for (const anchor of finishTableAnchors) {
      const anchorIdx = docXml.indexOf(anchor, searchStartPos532);
      if (anchorIdx === -1) continue;

      // Walk forward to find the next <w:tbl> after the anchor
      const nextTblIdx = docXml.indexOf('<w:tbl>', anchorIdx);
      if (nextTblIdx === -1 || (nextTblIdx - anchorIdx) > 5000) continue;

      // Find matching closing tag
      const tblEndIdx = docXml.indexOf('</w:tbl>', nextTblIdx);
      if (tblEndIdx === -1) continue;

      finishTblStart = nextTblIdx;
      finishTblEnd = tblEndIdx + 8;
      console.log(`  Section 5.3.2: Found table via anchor "${anchor}" at docXml[${anchorIdx}], table at index ${nextTblIdx}`);
      break;
    }

    if (finishTblStart !== -1) {
      const origTable532 = docXml.substring(finishTblStart, finishTblEnd);

      // Preserve original table properties and grid
      const origTblPr532 = origTable532.match(/<w:tblPr>[\s\S]*?<\/w:tblPr>/)?.[0]
        || '<w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:jc w:val="center"/><w:tblBorders>'
        + '<w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
        + '<w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
        + '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
        + '<w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
        + '<w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
        + '<w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
        + '</w:tblBorders></w:tblPr>';

      // Build grid: Batch Number + AR Number + Description + one col per compound
      const totalCols = 2 + 1 + compounds.length;
      const colWidth = Math.round(5000 / totalCols);
      const gridCols = Array(totalCols).fill(`<w:gridCol w:w="${colWidth}"/>`).join('');
      const tblGrid532 = `<w:tblGrid>${gridCols}</w:tblGrid>`;

      // Helper: styled header cell (shaded, bold, centered)
      const headerCell532 = (text: string, opts?: { vMerge?: 'restart' | 'continue'; gridSpan?: number }) => {
        let tcPrInner = '<w:shd w:val="clear" w:color="auto" w:fill="D9D9D9"/><w:vAlign w:val="center"/>';
        if (opts?.vMerge === 'restart') tcPrInner = '<w:vMerge w:val="restart"/>' + tcPrInner;
        else if (opts?.vMerge === 'continue') tcPrInner = '<w:vMerge/>' + tcPrInner;
        if (opts?.gridSpan) tcPrInner += `<w:gridSpan w:val="${opts.gridSpan}"/>`;
        const rPr = '<w:rPr><w:b/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>';
        const pPr = '<w:pPr><w:spacing w:before="0"/><w:jc w:val="center"/>' + rPr + '</w:pPr>';
        return '<w:tc><w:tcPr>' + tcPrInner + '</w:tcPr>'
          + '<w:p>' + pPr
          + (text ? '<w:r>' + rPr + `<w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r>` : '')
          + '</w:p></w:tc>';
      };

      // Helper: regular data cell (centered, size 20)
      const dataCell532 = (text: string) => {
        return '<w:tc><w:tcPr>'
          + '<w:vAlign w:val="center"/>'
          + '</w:tcPr>'
          + '<w:p><w:pPr><w:spacing w:before="0"/><w:jc w:val="center"/>'
          + '<w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:pPr>'
          + '<w:r><w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>'
          + `<w:t xml:space="preserve">${xmlEscape(text)}</w:t>`
          + '</w:r></w:p></w:tc>';
      };

      // ── Row 0: Column headers ──
      // Batch Number (vMerge restart) | AR Number (vMerge restart) | Description (vMerge restart) | Identification → {compound} per col
      let dynRows532 = '<w:tr><w:trPr><w:trHeight w:val="432"/><w:jc w:val="center"/></w:trPr>';
      dynRows532 += headerCell532('Batch Number', { vMerge: 'restart' });
      dynRows532 += headerCell532('AR. Number', { vMerge: 'restart' });
      dynRows532 += headerCell532('Description', { vMerge: 'restart' });
      if (compounds.length === 0) {
        dynRows532 += headerCell532('Identification');
      } else if (compounds.length === 1) {
        dynRows532 += headerCell532(`Identification\n${compounds[0]}`);
      } else {
        // multiple compounds: span all compound cols under "Identification"
        dynRows532 += headerCell532('Identification', { gridSpan: compounds.length });
      }
      dynRows532 += '</w:tr>';

      // ── Row 1: Limit row (subheader) ──
      // For single compound, this is a vMerge continue for first 3 cols and shows limit text.
      // For multiple compounds, shows compound name in each column.
      if (compounds.length > 1) {
        // subheader: vMerge continue | vMerge continue | vMerge continue | compound1 | compound2 ...
        dynRows532 += '<w:tr><w:trPr><w:trHeight w:val="432"/><w:jc w:val="center"/></w:trPr>';
        dynRows532 += headerCell532('', { vMerge: 'continue' });
        dynRows532 += headerCell532('', { vMerge: 'continue' });
        dynRows532 += headerCell532('', { vMerge: 'continue' });
        for (const compound of compounds) {
          dynRows532 += headerCell532(compound);
        }
        dynRows532 += '</w:tr>';
      }

      // ── Row 2: Limit values row ──
      const descLimit = xmlEscape((fhdr.descriptionLimit || '').trim());
      dynRows532 += '<w:tr><w:trPr><w:trHeight w:val="432"/><w:jc w:val="center"/></w:trPr>';
      dynRows532 += headerCell532('Limit →');
      dynRows532 += headerCell532('');
      dynRows532 += headerCell532(descLimit);
      if (compounds.length === 0) {
        dynRows532 += headerCell532('');
      } else {
        for (let ci = 0; ci < compounds.length; ci++) {
          dynRows532 += headerCell532(xmlEscape(specs[ci] || ''));
        }
      }
      dynRows532 += '</w:tr>';

      // ── Data rows ──
      if (finishRows.length === 0) {
        // No FINISH COA data — show empty state so stale template rows are cleared
        const emptyColSpan = 2 + 1 + Math.max(compounds.length, 1);
        dynRows532 += '<w:tr><w:trPr><w:jc w:val="center"/></w:trPr>'
          + '<w:tc><w:tcPr><w:gridSpan w:val="' + emptyColSpan + '"/><w:vAlign w:val="center"/></w:tcPr>'
          + '<w:p><w:pPr><w:spacing w:before="0"/><w:jc w:val="center"/>'
          + '<w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:pPr>'
          + '<w:r><w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>'
          + '<w:t>No Finish Stage COA data found for the selected product and year.</w:t>'
          + '</w:r></w:p></w:tc></w:tr>';
      } else {
        for (const row of finishRows) {
        dynRows532 += '<w:tr><w:trPr><w:jc w:val="center"/></w:trPr>';
        dynRows532 += dataCell532(row.batchNumber);
        dynRows532 += dataCell532(row.arNumber);
        dynRows532 += dataCell532(row.description);
          if (compounds.length === 0) {
            dynRows532 += dataCell532('Complies');
          } else {
            for (let ci = 0; ci < compounds.length; ci++) {
              const id = row.identification.find((i: any) => i.compound === compounds[ci]);
              dynRows532 += dataCell532(id?.result || 'Complies');
            }
          }
          dynRows532 += '</w:tr>';
        }
      }

      // Build replacement table
      const replacementTable532 = '<w:tbl>' + origTblPr532 + tblGrid532 + dynRows532 + '</w:tbl>';

      // Replace the 5.3.2 data table
      docXml = docXml.substring(0, finishTblStart) + replacementTable532 + docXml.substring(finishTblEnd);
      console.log(`  ✅ Section 5.3.2 data table replaced: ${compounds.length} identification compounds, ${data.finishInProcessData.length} rows`);

      // Also try to find and update the remark table immediately after
      const remarkSearchStart532 = finishTblStart + replacementTable532.length;
      const remarkAnchor532 = docXml.indexOf('Remark:', remarkSearchStart532);
      if (remarkAnchor532 !== -1 && (remarkAnchor532 - remarkSearchStart532) < 5000) {
        const remarkTblStart532 = docXml.lastIndexOf('<w:tbl>', remarkAnchor532);
        const remarkTblEnd532 = docXml.indexOf('</w:tbl>', remarkAnchor532);
        if (remarkTblStart532 !== -1 && remarkTblEnd532 !== -1 && remarkTblStart532 > finishTblStart) {
          const remarkTblEndFull532 = remarkTblEnd532 + 8;
          const origRemark532 = docXml.substring(remarkTblStart532, remarkTblEndFull532);
          const remarkTblPr532 = origRemark532.match(/<w:tblPr>[\s\S]*?<\/w:tblPr>/)?.[0] || '<w:tblPr><w:tblW w:w="5000" w:type="pct"/></w:tblPr>';
          const remarkTblGrid532 = origRemark532.match(/<w:tblGrid>[\s\S]*?<\/w:tblGrid>/)?.[0] || '<w:tblGrid><w:gridCol w:w="10000"/></w:tblGrid>';

          // Extract signature row (Prepared By QA / Reviewed By QA - last row)
          const remarkOrigRows532 = [...origRemark532.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)];
          const signatureRow532 = remarkOrigRows532.length > 1 ? remarkOrigRows532[remarkOrigRows532.length - 1][0] : '';

          const remarkText532 = `In-process parameters at finish stage for ${xmlEscape(data.product_name)} found (Satisfactory) within the limit as per in-process specification during the review period.`;

          const remarkContentRow532 = '<w:tr><w:tc><w:tcPr><w:gridSpan w:val="' + totalCols + '"/>'
            + '<w:shd w:val="clear" w:color="auto" w:fill="D9D9D9"/>'
            + '</w:tcPr>'
            + '<w:p><w:pPr><w:rPr><w:b/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:pPr>'
            + '<w:r><w:rPr><w:b/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>'
            + '<w:t xml:space="preserve">Remark:</w:t></w:r></w:p>'
            + '<w:p><w:pPr><w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:pPr>'
            + '<w:r><w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>'
            + `<w:t xml:space="preserve">${xmlEscape(remarkText532)}</w:t></w:r></w:p>`
            + '</w:tc></w:tr>';

          const replacementRemark532 = '<w:tbl>' + remarkTblPr532 + remarkTblGrid532
            + remarkContentRow532 + signatureRow532 + '</w:tbl>';

          docXml = docXml.substring(0, remarkTblStart532) + replacementRemark532 + docXml.substring(remarkTblEndFull532);
          console.log(`  ✅ Section 5.3.2 remark table replaced`);
        }
      }
    } else {
      console.warn('Section 5.3.2: Could not find finish stage table in template — table not populated');
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