import { Batch } from '@/models/Batch';
import { Formula } from '@/models/Formula';
import type { CompositionItem } from '@/types/formula';
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

      // 2. Extract Year from mfgDate and Filter
      const mfgDate = parseBatchDate(batch.mfgDate);
      if (!mfgDate) continue;

      if (mfgDate.getFullYear() === yearNum) {
        // 3. Deduplicate by batchNumber + itemCode
        const key = `${batch.batchNumber}_${batch.itemCode}`;
        if (!uniqueBatches.has(key)) {
          uniqueBatches.set(key, {
            ...batch,
            parsedMfgDate: mfgDate,
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

  return {
    company_name: formula.companyInfo?.companyName || 'INDIANA OPHTHALMICS LLP',
    company_address: formula.companyInfo?.companyAddress || '132, 135, 136, 137, GIDC ESTATE, WADHWAN CITY',

    product_name: formula.masterFormulaDetails?.productName || '',
    product_code: productCode,
    generic_name: formula.masterFormulaDetails?.genericName || '',
    dosage_form: formula.masterFormulaDetails?.specification || 'Ophthalmic Solution',
    shelf_life: formula.masterFormulaDetails?.shelfLife || '',
    mfg_lic_no: formula.masterFormulaDetails?.manufacturingLicenseNo || '',
    therapeutic_category: '',

    batch_size: formula.batchInfo?.batchSize || '',
    label_claim: formula.batchInfo?.labelClaim || '',
    pack_style: '',
    volume: formula.batchInfo?.volume || '',

    apqr_year: yearNum.toString(),
    apqr_no: `IO/APQR/${productCode.substring(0, 4)}/${yearNum}/${totalBatchesCount.toString().padStart(3, '0')}`,
    ref_sop_no: 'QAGE110',

    total_batches: totalBatchesCount.toString().padStart(2, '0'),

    batches: batchTable,
    composition: compositionData,

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

  // ── 2. Text replacements (longer matches first!) ───────────
  // All replacement values are XML-escaped so we don't break the OOXML structure.
  const replacements: [string, string][] = [
    // Full product name – replace first because it's the longest match containing the ingredient name
    ['SODIUM HYALURONATE EYE DROPS', xmlEscape(data.product_name)],

    // Product code
    ['SY208G1H', xmlEscape(data.product_code)],

    // Dosage form
    ['Ophthalmic Solution', xmlEscape(data.dosage_form)],

    // Shelf life (template has "24 Months" and "24 Month" variants)
    ['24 Months', xmlEscape(data.shelf_life)],
    ['24 Month', xmlEscape(data.shelf_life)],

    // Manufacturing license
    ['G/28/197', xmlEscape(data.mfg_lic_no)],

    // Therapeutic category
    ['Artificial Tears', xmlEscape(data.therapeutic_category)],

    // Standalone ingredient name (UPPERCASE only — mixed-case "Sodium Hyaluronate"
    // is left intact because it appears in generic process / test descriptions)
    ['SODIUM HYALURONATE', xmlEscape(data.label_claim)],

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

  // ── 4. Write modified XML back and generate output ─────────
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
