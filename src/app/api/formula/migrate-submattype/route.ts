/**
 * POST /api/formula/migrate-submattype
 *
 * One-time migration: Re-parses the formula XML files from /files folder,
 * extracts SUBMATTYPE for each material, and updates subMaterialType on
 * matching Formula documents in MongoDB (matched by masterCardNo or productCode).
 *
 * Safe to re-run multiple times (idempotent).
 */

import path from 'path';
import { promises as fs } from 'fs';
import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Formula from '@/models/Formula';
import { parseMultipleFormulasXml } from '@/lib/xmlParser';

const FILES_FOLDER = path.join(process.cwd(), 'files');

export async function POST(): Promise<NextResponse> {
  try {
    await connectToDatabase();

    // 1. Find all .xml files in /files folder
    let fileNames: string[] = [];
    try {
      const entries = await fs.readdir(FILES_FOLDER);
      fileNames = entries.filter(f => f.toLowerCase().endsWith('.xml'));
    } catch {
      return NextResponse.json(
        { success: false, error: `Could not read /files folder: ${FILES_FOLDER}` },
        { status: 500 }
      );
    }

    console.log(`[migrate-submattype] Scanning ${fileNames.length} XML files in /files`);

    let totalFormulasUpdated = 0;
    let totalMaterialsUpdated = 0;
    let totalSkipped = 0;
    let totalErrors = 0;
    const results: Array<{ file: string; mfc: string; status: string; materialsUpdated: number }> = [];

    for (const fileName of fileNames) {
      const filePath = path.join(FILES_FOLDER, fileName);

      let content: string;
      try {
        content = await fs.readFile(filePath, 'utf-8');
      } catch (err) {
        totalErrors++;
        results.push({ file: fileName, mfc: '-', status: `read error: ${err instanceof Error ? err.message : err}`, materialsUpdated: 0 });
        continue;
      }

      // 2. Parse the file to extract formulas with their materials + SUBMATTYPE
      let parseResult;
      try {
        parseResult = await parseMultipleFormulasXml(content);
      } catch (err) {
        totalErrors++;
        results.push({ file: fileName, mfc: '-', status: `parse error: ${err instanceof Error ? err.message : err}`, materialsUpdated: 0 });
        continue;
      }

      if (!parseResult.success || parseResult.formulas.length === 0) {
        // Not a formula file — skip silently
        totalSkipped++;
        continue;
      }

      // 3. For each formula in the file, find the matching DB document and update materials
      for (const data of parseResult.formulas) {
        const masterCardNo = data.masterFormulaDetails.masterCardNo?.trim();
        const productCode = data.masterFormulaDetails.productCode?.trim();
        const mfcLabel = masterCardNo || productCode || '(unknown)';

        // Build subMaterialType map: materialCode -> subMaterialType
        const submattypeMap = new Map<string, string>();
        for (const mat of data.materials || []) {
          if (mat.materialCode && mat.subMaterialType) {
            submattypeMap.set(mat.materialCode, mat.subMaterialType);
          }
        }

        if (submattypeMap.size === 0) {
          totalSkipped++;
          results.push({ file: fileName, mfc: mfcLabel, status: 'skipped (no SUBMATTYPE in XML)', materialsUpdated: 0 });
          continue;
        }

        // Find the Formula document
        let existing: any = null;
        if (masterCardNo && masterCardNo !== 'N/A') {
          existing = await Formula.findOne({ 'masterFormulaDetails.masterCardNo': masterCardNo })
            .select('_id materials')
            .lean();
        }
        if (!existing && productCode) {
          existing = await Formula.findOne({ 'masterFormulaDetails.productCode': productCode })
            .select('_id materials')
            .lean();
        }

        if (!existing) {
          totalSkipped++;
          results.push({ file: fileName, mfc: mfcLabel, status: 'skipped (not found in DB)', materialsUpdated: 0 });
          continue;
        }

        // Build $set payload for each materials[i].subMaterialType
        const existingMaterials: any[] = (existing as any).materials || [];
        const setPayload: Record<string, string> = {};
        let count = 0;

        for (let i = 0; i < existingMaterials.length; i++) {
          const mat = existingMaterials[i];
          const subMatType = submattypeMap.get(mat.materialCode);
          if (subMatType) {
            setPayload[`materials.${i}.subMaterialType`] = subMatType;
            count++;
          }
        }

        if (count === 0) {
          totalSkipped++;
          results.push({ file: fileName, mfc: mfcLabel, status: 'skipped (material codes not matched)', materialsUpdated: 0 });
          continue;
        }

        await Formula.updateOne({ _id: (existing as any)._id }, { $set: setPayload });

        totalFormulasUpdated++;
        totalMaterialsUpdated += count;
        results.push({ file: fileName, mfc: mfcLabel, status: 'updated', materialsUpdated: count });
        console.log(`[migrate-submattype] Updated ${mfcLabel}: ${count} materials`);
      }
    }

    return NextResponse.json({
      success: true,
      summary: {
        filesScanned: fileNames.length,
        formulasUpdated: totalFormulasUpdated,
        materialsUpdated: totalMaterialsUpdated,
        skipped: totalSkipped,
        errors: totalErrors,
      },
      results,
    });

  } catch (error) {
    console.error('[migrate-submattype] Fatal error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
