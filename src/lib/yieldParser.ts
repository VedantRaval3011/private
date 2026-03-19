import { parseStringPromise } from 'xml2js';
import { IYieldItem } from '@/models/Yield';

/**
 * Parse a YIELDSTATEMENT XML file
 * XML structure:
 *  <YIELDSTATEMENT>
 *    <LIST_G_MATCODE>
 *      <G_MATCODE>
 *        <BATCH>, <ITMCODE>, <ITMNAME>, <MFGDT>, <EXPDT>,
 *        <TOTBATCHSIZE>, <BATCHUOM>, <YIELD_P>, <STANDARDYIELD>,
 *        <BATCHCOM>, <CF_TARGETDT>, <ELAPASEDDAYS>, <CF_ELASPED>,
 *        <TOTPRODQTY>, <TSTQTY>, <RETAINQTY>, <MFGLOSSQTY>,
 *        <SEMIQTY>, <RRQTY/RRBATCHSIZE>, <SRNO>
 *        <LIST_G_PRODQTY> -> <G_PRODQTY> -> <PACK>
 *      </G_MATCODE>
 *    </LIST_G_MATCODE>
 *  </YIELDSTATEMENT>
 */
export async function parseYieldXml(xmlContent: string): Promise<{
  success: boolean;
  data?: IYieldItem[];
  errors: string[];
}> {
  try {
    const parsed = await parseStringPromise(xmlContent, {
      explicitArray: true,
      ignoreAttrs: true,
      trim: true,
    });

    const root = parsed?.YIELDSTATEMENT;
    if (!root) {
      return { success: false, errors: ['Root element <YIELDSTATEMENT> not found in XML'] };
    }

    // Extract optional metadata
    let companyName = '';
    let plantAddress = '';
    const gCmpnmElem = root?.LIST_G_CMPNM?.[0]?.G_CMPNM?.[0];
    if (gCmpnmElem) {
      if (gCmpnmElem.CMPNM) companyName = String(gCmpnmElem.CMPNM[0] || '').trim();
      if (gCmpnmElem.CMPADD1) plantAddress = String(gCmpnmElem.CMPADD1[0] || '').trim();
    }

    const listGMatcode = root?.LIST_G_MATCODE?.[0];
    if (!listGMatcode) {
      return { success: false, errors: ['<LIST_G_MATCODE> section not found'] };
    }

    const gMatcodeElements: any[] = listGMatcode?.G_MATCODE || [];
    if (gMatcodeElements.length === 0) {
      return { success: false, errors: ['No <G_MATCODE> elements found'] };
    }

    const yieldItems: IYieldItem[] = [];
    const errors: string[] = [];

    for (let i = 0; i < gMatcodeElements.length; i++) {
      const item = gMatcodeElements[i];
      try {
        // Helper: get first string value from xml2js array
        const g = (key: string): string => {
          const val = item[key];
          if (!val) return '';
          if (Array.isArray(val)) return String(val[0] ?? '').trim();
          return String(val).trim();
        };

        const gNum = (key: string): number => {
          const s = g(key);
          if (!s) return 0;
          const n = parseFloat(s);
          return isNaN(n) ? 0 : n;
        };

        // Parse Oracle date strings like "28-JUN-25" or "31-MAY-27"
        const gDate = (key: string): Date => {
          const s = g(key);
          if (!s) return new Date(0);
          // Try direct parse first
          const d = new Date(s);
          if (!isNaN(d.getTime())) return d;
          // Try Oracle "dd-MON-yy" format
          const months: Record<string, number> = {
            JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
            JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
          };
          const match = s.match(/^(\d{1,2})-([A-Z]{3})-(\d{2,4})$/i);
          if (match) {
            const day = parseInt(match[1], 10);
            const month = months[match[2].toUpperCase()];
            let year = parseInt(match[3], 10);
            if (year < 100) year += 2000;
            if (month !== undefined) {
              return new Date(year, month, day);
            }
          }
          return new Date(0);
        };

        const batchNo = g('BATCH');
        const productCode = g('ITMCODE');
        const productName = g('ITMNAME');

        if (!batchNo || !productCode) {
          errors.push(`Row ${i + 1}: Missing BATCH or ITMCODE — skipping`);
          continue;
        }

        // Extract all packing items from LIST_G_PRODQTY
        const packingDetails: { packing: string; qty: string; total: number }[] = [];
        let totalProducedQty = 0;

        const listGProdQty = item?.LIST_G_PRODQTY?.[0];
        if (listGProdQty) {
          const gProdQtyArr: any[] = listGProdQty.G_PRODQTY || [];
          for (const prodQty of gProdQtyArr) {
            const itemCode = prodQty?.ITEM?.[0] ? String(prodQty.ITEM[0]).trim() : '';
            const batchSize = prodQty?.BATSIZE?.[0] ? String(prodQty.BATSIZE[0]).trim() : '';
            const batchUom = prodQty?.BATUOM?.[0] ? String(prodQty.BATUOM[0]).trim() : '';
            const pack = prodQty?.PACK?.[0] ? String(prodQty.PACK[0]).trim() : '';
            const packQty = prodQty?.PACKQTY?.[0] ? String(prodQty.PACKQTY[0]).trim() : '';
            const cQty = prodQty?.CQTY?.[0] ? String(prodQty.CQTY[0]).trim() : '';

            const prodQtyStr = prodQty?.PRODQTY?.[0] ? String(prodQty.PRODQTY[0]).trim() : '0';
            const prodQtyNum = parseFloat(prodQtyStr) || 0;

            packingDetails.push({ itemCode, batchSize, batchUom, prodQty: prodQtyNum, packing: pack, packQty, cQty });
            totalProducedQty += prodQtyNum;
          }
        }

        const batchSize = gNum('TOTBATCHSIZE');
        const uom = g('BATCHUOM');
        const mainBTotal = gNum('TOTPRODQTY');

        const yieldItem: IYieldItem = {
          srNo: gNum('SRNO') || i + 1,
          productName,
          productCode,
          batchNo,
          mfgDate: gDate('MFGDT'),
          expDate: gDate('EXPDT'),
          batchSizeLtrOrKg: `${batchSize} ${uom}`.trim(),
          batchSizeAddReReq: g('RRBATCHSIZE') || g('RRQTY') || '',
          packingDetails,
          totalProducedQty: totalProducedQty > 0 ? parseFloat(totalProducedQty.toFixed(3)) : mainBTotal,
          companyName,
          plantAddress,
          testingQty: gNum('TSTQTY'),
          retainQty: gNum('RETAINQTY'),
          mfgLossQty: gNum('MFGLOSSQTY'),
          residueSFG: g('SEMIQTY') || '',
          actualYield: gNum('YIELD_P'),
          standardYield: gNum('STANDARDYIELD'),
          startDate: gDate('CF_TARGETDT'),
          completeDate: gDate('BATCHCOM'),
          totalDays: gNum('ELAPASEDDAYS'),
          varianceDays: gNum('CF_ELASPED'),
        };

        yieldItems.push(yieldItem);
      } catch (err: any) {
        errors.push(`Row ${i + 1}: ${err.message}`);
      }
    }

    if (yieldItems.length === 0) {
      return {
        success: false,
        errors: ['No valid yield items parsed from the XML.', ...errors],
      };
    }

    return {
      success: true,
      data: yieldItems,
      errors,
    };
  } catch (error: any) {
    return {
      success: false,
      errors: [`Failed to parse XML: ${error.message}`],
    };
  }
}
