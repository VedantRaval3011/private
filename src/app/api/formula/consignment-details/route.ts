/**
 * POST /api/formula/consignment-details
 * Returns consignment breakdown for a given formula, mapped by material.
 * Uses Requisition (filtered by mfcNo) to find which AR numbers were actually
 * consumed under this MFC, then looks up full details from InwardRegister.
 */

import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import { Formula } from '@/models/Formula';
import { InwardRegister } from '@/models/InwardRegister';
import { Requisition } from '@/models/Requisition';
import mongoose from 'mongoose';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { formulaId } = body;

        if (!formulaId) {
            return NextResponse.json({ error: 'formulaId is required' }, { status: 400 });
        }

        await connectToDatabase();

        const formula = await Formula.findById(new mongoose.Types.ObjectId(formulaId)).lean() as any;
        if (!formula) {
            return NextResponse.json({ error: 'Formula not found' }, { status: 404 });
        }

        const mfcNo: string = formula.masterFormulaDetails?.masterCardNo || '';

        // ── Collect all materials from all processes ──────────────────────────
        const materialMap = new Map<string, { materialCode: string; materialName: string; processName: string }>();

        const processes: any[] = formula.processes || [];
        for (const proc of processes) {
            const procName: string = proc.processName || 'Unknown';

            // Direct materials on the process
            for (const mat of proc.materials || []) {
                if (mat.materialCode && !materialMap.has(mat.materialCode)) {
                    materialMap.set(mat.materialCode, {
                        materialCode: mat.materialCode,
                        materialName: mat.materialName || mat.materialCode,
                        processName: procName,
                    });
                }
            }

            // Materials nested under fillingProducts
            for (const fp of proc.fillingProducts || []) {
                for (const mat of fp.materials || []) {
                    if (mat.materialCode && !materialMap.has(mat.materialCode)) {
                        materialMap.set(mat.materialCode, {
                            materialCode: mat.materialCode,
                            materialName: mat.materialName || mat.materialCode,
                            processName: procName,
                        });
                    }
                }
            }
        }

        // Also include top-level materials array if present
        for (const mat of formula.materials || []) {
            if (mat.materialCode && !materialMap.has(mat.materialCode)) {
                materialMap.set(mat.materialCode, {
                    materialCode: mat.materialCode,
                    materialName: mat.materialName || mat.materialCode,
                    processName: 'Formula Materials',
                });
            }
        }

        // ── Fetch Requisition docs for this MFC ──────────────────────────────
        // mfcNo may be empty for old records — still fetch so we can map AR→batch
        const requisitionDocs = mfcNo
            ? await Requisition.find({ 'batches.mfcNo': mfcNo }).lean() as any[]
            : [];

        // Build materialCode → { arNumber → Set<batchNumber> } from requisitions
        const arByMaterial = new Map<string, Map<string, Set<string>>>();

        for (const doc of requisitionDocs) {
            for (const batch of doc.batches || []) {
                if (batch.mfcNo !== mfcNo) continue;
                for (const item of batch.materials || []) {
                    const code: string = item.materialCode || '';
                    const ar: string = (item.arNo || '').trim();
                    const bn: string = batch.batchNumber || '';
                    if (!code || !ar) continue;

                    if (!arByMaterial.has(code)) arByMaterial.set(code, new Map());
                    const arMap = arByMaterial.get(code)!;
                    if (!arMap.has(ar)) arMap.set(ar, new Set());
                    arMap.get(ar)!.add(bn);
                }
            }
        }

        // ── Build per-material result ─────────────────────────────────────────
        const materialResults = [];
        let totalConsignments = 0;

        for (const [code, meta] of materialMap.entries()) {
            const arMap = arByMaterial.get(code);
            const arNumbers = arMap ? Array.from(arMap.keys()) : [];

            if (arNumbers.length === 0) continue; // skip materials with no usage

            // Fetch InwardRegister entries for these AR numbers
            const inwardEntries = await InwardRegister.find({
                arNumber: { $in: arNumbers },
                materialCode: code,
            }).lean() as any[];

            // Build AR-level details (group by arNumber)
            const arDetailsMap = new Map<string, any>();

            for (const entry of inwardEntries) {
                const ar: string = (entry.arNumber || '').trim();
                if (!arDetailsMap.has(ar)) {
                    arDetailsMap.set(ar, {
                        arNumber: ar,
                        inwardNumber: entry.inwardNumber || '',
                        inwardDate: entry.inwardDate || '',
                        vendorName: entry.vendorName || '',
                        manufacturedBy: entry.manufacturedBy || '',
                        receivedQuantity: entry.receivedQuantity ?? null,
                        acceptedQuantity: entry.acceptedQuantity ?? null,
                        rejectedQuantity: entry.rejectedQuantity ?? null,
                        unit: entry.unit || '',
                        batchNumbers: arMap ? Array.from(arMap.get(ar) || []) : [],
                    });
                } else {
                    // Aggregate quantities for the same AR (multiple inward entries)
                    const existing = arDetailsMap.get(ar);
                    if (entry.receivedQuantity != null) {
                        existing.receivedQuantity = (existing.receivedQuantity ?? 0) + entry.receivedQuantity;
                    }
                    if (entry.acceptedQuantity != null) {
                        existing.acceptedQuantity = (existing.acceptedQuantity ?? 0) + entry.acceptedQuantity;
                    }
                    if (entry.rejectedQuantity != null) {
                        existing.rejectedQuantity = (existing.rejectedQuantity ?? 0) + entry.rejectedQuantity;
                    }
                }
            }

            // For AR numbers that appear in requisitions but not InwardRegister
            for (const ar of arNumbers) {
                if (!arDetailsMap.has(ar)) {
                    arDetailsMap.set(ar, {
                        arNumber: ar,
                        inwardNumber: '',
                        inwardDate: '',
                        vendorName: '—',
                        manufacturedBy: '',
                        receivedQuantity: null,
                        acceptedQuantity: null,
                        rejectedQuantity: null,
                        unit: '',
                        batchNumbers: arMap ? Array.from(arMap.get(ar) || []) : [],
                        notInInward: true,
                    });
                }
            }

            const arDetails = Array.from(arDetailsMap.values()).sort((a, b) =>
                a.arNumber.localeCompare(b.arNumber)
            );

            totalConsignments += arDetails.length;

            materialResults.push({
                materialCode: meta.materialCode,
                materialName: meta.materialName,
                processName: meta.processName,
                consignmentCount: arDetails.length,
                arDetails,
            });
        }

        // Sort materials by consignment count descending, then by name
        materialResults.sort((a, b) =>
            b.consignmentCount - a.consignmentCount || a.materialName.localeCompare(b.materialName)
        );

        return NextResponse.json({
            success: true,
            mfcNo,
            productCode: formula.masterFormulaDetails?.productCode || '',
            productName: formula.masterFormulaDetails?.productName || '',
            totalConsignments,
            materials: materialResults,
        });

    } catch (error: any) {
        console.error('Error fetching consignment details:', error);
        return NextResponse.json({ error: error.message || 'Failed to fetch consignment details' }, { status: 500 });
    }
}
