import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import ProductMaster from '@/models/ProductMaster';

const MISSING_VALUES = new Set(['n/a', 'na', 'nil', 'null', 'none', '-', '--', 'n.a.', 'n.a', '0', 'undefined', 'not available', 'not applicable']);

const isMissingData = (value: string | undefined | null): boolean => {
  if (value === null || value === undefined) return true;
  const trimmed = value.trim();
  if (trimmed === '') return true;
  if (MISSING_VALUES.has(trimmed.toLowerCase())) return true;
  if (!/\w/.test(trimmed)) return true;
  return false;
};

const EFF_BATCH_MISSING_VALUES = new Set(['n/a', 'na', 'nil', 'null', 'none', '-', '--', 'n.a.', 'n.a', 'undefined', 'not available', 'not applicable']);
const isValidEffBatch = (value: string | undefined | null): boolean => {
  if (value === null || value === undefined) return false;
  const trimmed = value.trim();
  if (trimmed === '') return false;
  if (EFF_BATCH_MISSING_VALUES.has(trimmed.toLowerCase())) return false;
  if (!/\w/.test(trimmed)) return false;
  return true;
};

type PMRecord = {
  productCode: string;
  productName: string;
  masterCardNo: string;
  genericName?: string;
  therapeuticCategory: string;
  storageCondition: string;
  productType: string;
  department: string;
  specification?: string;
  effectiveBatchNo?: string;
  mfgLicenseNo?: string;
};

const FIELDS_TO_CHECK: Array<{ key: keyof PMRecord; label: string; check?: (v: string | undefined | null) => boolean }> = [
  { key: 'productCode',         label: 'Product Code' },
  { key: 'genericName',         label: 'Generic Name' },
  { key: 'masterCardNo',        label: 'Master Card No' },
  { key: 'therapeuticCategory', label: 'Therapeutic Category' },
  { key: 'productName',         label: 'Product Name' },
  { key: 'department',          label: 'Department' },
  { key: 'storageCondition',    label: 'Storage Condition' },
  { key: 'productType',         label: 'Product Type' },
  { key: 'specification',       label: 'Specification' },
  { key: 'effectiveBatchNo',    label: 'Effective Batch No', check: v => !isValidEffBatch(v) },
  { key: 'mfgLicenseNo',        label: 'Mfg License No' },
];

export async function GET() {
  try {
    await connectToDatabase();

    const records = await ProductMaster.find({})
      .select('productCode productName masterCardNo genericName therapeuticCategory storageCondition productType department specification effectiveBatchNo mfgLicenseNo')
      .lean() as PMRecord[];

    // Group by masterCardNo to detect mismatches
    const byMfc = new Map<string, PMRecord[]>();
    for (const rec of records) {
      const mfc = (rec.masterCardNo || '').trim();
      if (!mfc || isMissingData(mfc)) continue;
      if (!byMfc.has(mfc)) byMfc.set(mfc, []);
      byMfc.get(mfc)!.push(rec);
    }

    const normalizeForCompare = (v: string | undefined | null) => String(v || '').trim().toLowerCase();
    const normalizeEffBatch = (v: string | undefined | null) => String(v === null || v === undefined ? '' : v).trim();

    const getMajority = (values: string[]): string | null => {
      if (!values.length) return null;
      const counts = new Map<string, number>();
      for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
      let max = 0, majority: string | null = null;
      for (const [v, c] of counts) { if (c > max) { max = c; majority = v; } }
      return majority;
    };

    const effBatchConnected = (a: string, b: string): boolean => {
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
      if (Number.isFinite(ai) && Number.isFinite(bi) && ai !== bi) return ai - bi;
      if (a.length !== b.length) return a.length - b.length;
      return a.localeCompare(b);
    };

    // mismatchCodes: code -> which fields mismatch
    const mismatchDetails = new Map<string, Set<string>>();
    const ensureMismatch = (code: string) => {
      if (!mismatchDetails.has(code)) mismatchDetails.set(code, new Set());
      return mismatchDetails.get(code)!;
    };

    for (const [, group] of byMfc) {
      if (group.length < 2) continue;

      const validStorages = group.filter(g => !isMissingData(g.storageCondition)).map(g => normalizeForCompare(g.storageCondition));
      const hasStorageMismatch = new Set(validStorages).size > 1;
      const majorityStorage = hasStorageMismatch ? getMajority(validStorages) : null;

      const validTheras = group.filter(g => !isMissingData(g.therapeuticCategory)).map(g => normalizeForCompare(g.therapeuticCategory));
      const hasTherapeuticMismatch = new Set(validTheras).size > 1;
      const majorityThera = hasTherapeuticMismatch ? getMajority(validTheras) : null;

      let smallest = group[0].effectiveBatchNo;
      for (const g of group) {
        if (compareEffBatchForParent(g.effectiveBatchNo, smallest) < 0) smallest = g.effectiveBatchNo;
      }
      const smallestSet = group.filter(g => compareEffBatchForParent(g.effectiveBatchNo, smallest) === 0);
      smallestSet.sort((a, b) => (a.productCode || '').localeCompare(b.productCode || ''));
      const parent = smallestSet[0];
      const pEffOk = isValidEffBatch(parent.effectiveBatchNo);
      const pEff = normalizeEffBatch(parent.effectiveBatchNo);

      let hasEffBatchMismatch = false;
      for (const g of group) {
        if (pEffOk && isValidEffBatch(g.effectiveBatchNo)) {
          if (!effBatchConnected(normalizeEffBatch(g.effectiveBatchNo), pEff)) {
            hasEffBatchMismatch = true;
            break;
          }
        }
      }

      for (const g of group) {
        const code = (g.productCode || '').trim();
        if (!code) continue;
        if (hasStorageMismatch && !isMissingData(g.storageCondition) && normalizeForCompare(g.storageCondition) !== majorityStorage) {
          ensureMismatch(code).add('Storage Condition');
        }
        if (hasTherapeuticMismatch && !isMissingData(g.therapeuticCategory) && normalizeForCompare(g.therapeuticCategory) !== majorityThera) {
          ensureMismatch(code).add('Therapeutic Category');
        }
        if (hasEffBatchMismatch && pEffOk && isValidEffBatch(g.effectiveBatchNo) && !effBatchConnected(normalizeEffBatch(g.effectiveBatchNo), pEff)) {
          ensureMismatch(code).add('Effective Batch No');
        }
      }
    }

    // Build result: productCode (uppercase) -> full info
    const result: Record<string, {
      productName: string;
      masterCardNo: string;
      missingFields: string[];
      mismatchFields: string[];
    }> = {};

    for (const rec of records) {
      const code = (rec.productCode || '').trim().toUpperCase();
      if (!code) continue;

      const missingFields = FIELDS_TO_CHECK
        .filter(({ key, check }) => check ? check(rec[key]) : isMissingData(rec[key] as string | undefined | null))
        .map(({ label }) => label);

      const mismatchFields = [...(mismatchDetails.get(rec.productCode.trim()) ?? [])];

      if (!result[code]) {
        result[code] = {
          productName: rec.productName || '',
          masterCardNo: rec.masterCardNo || '',
          missingFields,
          mismatchFields,
        };
      } else {
        // OR errors across duplicate codes
        missingFields.forEach(f => { if (!result[code].missingFields.includes(f)) result[code].missingFields.push(f); });
        mismatchFields.forEach(f => { if (!result[code].mismatchFields.includes(f)) result[code].mismatchFields.push(f); });
      }
    }

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('Error fetching product master cross-reference:', error);
    return NextResponse.json({ success: false, message: 'Failed to fetch data' }, { status: 500 });
  }
}
