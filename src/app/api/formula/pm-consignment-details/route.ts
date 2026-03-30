/**
 * POST /api/formula/pm-consignment-details
 * Returns PM (Primary Packing Material) consignment breakdown for a given formula.
 *
 * Body: { formulaId: string, year?: number }
 *
 * When `year` is provided all three data sources are filtered:
 *   - InwardRegister  → by inwardDate year  (received count)
 *   - MaterialRejection → by arDate year    (rejected count)
 *   - Requisition batches → by mfgDate year (AR→batch map shown in the table)
 *
 * Materials scope: PRIMARY packing materials from formula.packingMaterials
 * and processes named LABELLING / PACKING.
 */

import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import { Formula } from '@/models/Formula';
import { InwardRegister } from '@/models/InwardRegister';
import { Requisition } from '@/models/Requisition';
import { MaterialRejection } from '@/models/MaterialRejection';
import mongoose from 'mongoose';

function getYear(dateStr: string): number | null {
    if (!dateStr) return null;
    // Try ISO and dd-MMM-yy / dd-MMM-yyyy formats
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) return d.getFullYear();
    // Handle "24-DEC-24" or "24-DEC-2024"
    const parts = dateStr.split('-');
    if (parts.length === 3) {
        const yr = parseInt(parts[2]);
        if (!isNaN(yr)) return yr < 100 ? 2000 + yr : yr;
    }
    return null;
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { formulaId, year } = body;
        const yearNum: number | null = year ? parseInt(String(year)) : null;

        if (!formulaId) {
            return NextResponse.json({ error: 'formulaId is required' }, { status: 400 });
        }

        await connectToDatabase();

        const formula = await Formula.findById(new mongoose.Types.ObjectId(formulaId)).lean() as any;
        if (!formula) {
            return NextResponse.json({ error: 'Formula not found' }, { status: 404 });
        }

        const mfcNo: string = formula.masterFormulaDetails?.masterCardNo || '';

        // ── Collect PRIMARY packing materials ────────────────────────────────
        const materialMap = new Map<string, {
            materialCode: string;
            materialName: string;
            subType: string;
            unit: string;
            srNo: number;
        }>();

        for (const mat of formula.packingMaterials || []) {
            const subType = (mat.subType || 'PRIMARY').toUpperCase();
            if (subType !== 'PRIMARY') continue;
            if (mat.materialCode && !materialMap.has(mat.materialCode)) {
                materialMap.set(mat.materialCode, {
                    materialCode: mat.materialCode,
                    materialName: mat.materialName || mat.materialCode,
                    subType: 'PRIMARY',
                    unit: mat.unit || '',
                    srNo: mat.srNo ?? 0,
                });
            }
        }

        const PACKING_RE = /labelling|packing/i;
        for (const proc of (formula.processes || []) as any[]) {
            if (!PACKING_RE.test(proc.processName || '')) continue;
            for (const mat of proc.materials || []) {
                const subType = (mat.subMaterialType || mat.materialType || 'PRIMARY').toUpperCase();
                if (subType !== 'PRIMARY') continue;
                if (mat.materialCode && !materialMap.has(mat.materialCode)) {
                    materialMap.set(mat.materialCode, {
                        materialCode: mat.materialCode,
                        materialName: mat.materialName || mat.materialCode,
                        subType: 'PRIMARY',
                        unit: mat.unit || '',
                        srNo: mat.srNo ?? 0,
                    });
                }
            }
        }

        // ── Fetch Requisition docs — optionally year-filtered by batch mfgDate ──
        const requisitionDocs = mfcNo
            ? await Requisition.find({ 'batches.mfcNo': mfcNo }).lean() as any[]
            : [];

        const knownCodes = new Set(materialMap.keys());
        const arByMaterial = new Map<string, Map<string, Set<string>>>();
        // arNo → make (batch.make field from requisition, collected without year filter)
        const arMakeFromReq = new Map<string, string>();

        for (const doc of requisitionDocs) {
            for (const batch of doc.batches || []) {
                if (batch.mfcNo !== mfcNo) continue;
                const batchMake = (batch.make || '').trim();
                // Collect make for all AR numbers (no year filter — make doesn't change over time)
                for (const item of batch.materials || []) {
                    const ar: string = (item.arNo || '').trim();
                    if (ar && batchMake && !arMakeFromReq.has(ar)) {
                        arMakeFromReq.set(ar, batchMake);
                    }
                }
                // Year-filtered AR→batch mapping
                if (yearNum !== null) {
                    const batchYear = getYear(batch.mfgDate || '');
                    if (batchYear !== yearNum) continue;
                }
                for (const item of batch.materials || []) {
                    const code: string = item.materialCode || '';
                    if (!knownCodes.has(code)) continue;
                    const ar: string = (item.arNo || '').trim();
                    const bn: string = batch.batchNumber || '';
                    if (!ar) continue;
                    if (!arByMaterial.has(code)) arByMaterial.set(code, new Map());
                    const arMap = arByMaterial.get(code)!;
                    if (!arMap.has(ar)) arMap.set(ar, new Set());
                    arMap.get(ar)!.add(bn);
                }
            }
        }

        // ── Build per-material result ─────────────────────────────────────────
        const materialResults = [];

        for (const [code, meta] of materialMap.entries()) {
            const arMap = arByMaterial.get(code);
            const arNumbers = arMap ? Array.from(arMap.keys()) : [];

            if (arNumbers.length === 0) continue;

            // AR Details table: AR numbers used in batches (already year-filtered via requisitions)
            const arDetails = arNumbers
                .map(ar => ({
                    arNumber: ar,
                    batchNumbers: Array.from(arMap!.get(ar) || []).sort((a, b) =>
                        a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })),
                }))
                .sort((a, b) => a.arNumber.localeCompare(b.arNumber));

            // ── Received: unique AR numbers in InwardRegister, filtered by inwardDate year ──
            const allInwardRecords = await InwardRegister.find({ materialCode: code }).lean() as any[];

            // Build make map per AR: use the `make` field (brand/MAKE tag) from inward records,
            // fallback to requisition batch make
            const makeByAr: Record<string, string> = {};
            for (const r of allInwardRecords) {
                const ar = (r.arNumber || '').trim();
                if (ar && !makeByAr[ar]) {
                    makeByAr[ar] = ((r as any).make || '').trim();
                }
            }
            for (const [ar, make] of arMakeFromReq) {
                if (!makeByAr[ar]) makeByAr[ar] = make;
            }

            const filteredInward = yearNum !== null
                ? allInwardRecords.filter((r: any) => getYear(r.inwardDate || '') === yearNum)
                : allInwardRecords;
            const receivedArNumbers: string[] = [...new Set(
                filteredInward
                    .map((r: any) => (r.arNumber || '').trim())
                    .filter((ar: string) => ar && ar !== 'N/A')
            )].sort() as string[];
            const receivedCount = receivedArNumbers.length;

            // ── Rejected: unique AR numbers in MaterialRejection, filtered by arDate year ──
            const allRejectionRecords = await MaterialRejection.find({ materialCode: code }).lean() as any[];
            const filteredRejections = yearNum !== null
                ? allRejectionRecords.filter((r: any) => getYear(r.arDate || '') === yearNum)
                : allRejectionRecords;
            const rejectedArNumbers: string[] = [...new Set(
                filteredRejections
                    .map((r: any) => (r.arNumber || '').trim())
                    .filter((ar: string) => ar)
            )].sort() as string[];
            const rejectedCount = rejectedArNumbers.length;

            const releasedCount = receivedCount - rejectedCount;

            materialResults.push({
                materialCode: meta.materialCode,
                materialName: meta.materialName,
                subType: meta.subType,
                unit: meta.unit,
                srNo: meta.srNo,
                receivedCount,
                releasedCount,
                rejectedCount,
                receivedArNumbers,
                rejectedArNumbers,
                arDetails,
                makeByAr,
            });
        }

        materialResults.sort((a, b) => a.srNo - b.srNo || a.materialName.localeCompare(b.materialName));

        return NextResponse.json({
            success: true,
            mfcNo,
            year: yearNum,
            productCode: formula.masterFormulaDetails?.productCode || '',
            productName: formula.masterFormulaDetails?.productName || '',
            materials: materialResults,
        });

    } catch (error: any) {
        console.error('Error fetching PM consignment details:', error);
        return NextResponse.json({ error: error.message || 'Failed to fetch PM consignment details' }, { status: 500 });
    }
}
