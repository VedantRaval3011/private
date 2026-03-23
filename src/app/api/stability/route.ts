import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

interface StabilityEntry {
    hasAccelerated: boolean;
    hasLongTerm: boolean;
}

interface StabilityResult {
    byMfrKey: Record<string, StabilityEntry>;
}

function isAcceleratedFile(filename: string): boolean {
    return /\bacc\b/i.test(filename) || /accelerated/i.test(filename);
}

function isLongTermFile(filename: string): boolean {
    return /long[\s._-]?term/i.test(filename);
}

function walkDir(dir: string): string[] {
    const files: string[] = [];
    try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                files.push(...walkDir(fullPath));
            } else if (entry.isFile() && !entry.name.startsWith('~$') && !entry.name.startsWith('~WRL')) {
                const lower = entry.name.toLowerCase();
                if (lower.endsWith('.doc') || lower.endsWith('.docx')) {
                    files.push(fullPath);
                }
            }
        }
    } catch { /* skip unreadable dirs */ }
    return files;
}

/**
 * Extract a canonical MFR key from the file's parent folder path.
 * Folders are named like "PRODUCT NAME (MFRHDNC150.06)".
 * We extract the raw code and strip the 3-char prefix to get the key (e.g. HDNC150.06).
 *
 * This canonical key matches the DB masterCardNo when transformed as:
 *   masterCardNo.replace(/^MF[A-Z]{1,2}\//, '').replace(/\//g, '')
 * e.g. "MFC/H/DNC150.06" → "HDNC150.06"
 */
function extractMfrKeyFromPath(filePath: string): string | null {
    const dirParts = path.dirname(filePath).split(path.sep);
    for (let i = dirParts.length - 1; i >= 0; i--) {
        const m = dirParts[i].match(/\((MF[A-Z0-9.]+)\)/i);
        if (m) {
            const raw = m[1].toUpperCase();
            // Strip the 3-char prefix (MFR, MFC, MFE = MF + exactly one uppercase letter)
            return raw.replace(/^MF[A-Z]/, '');
        }
    }
    return null;
}

// Module-level cache
let cachedResult: StabilityResult | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const forceRefresh = searchParams.get('refresh') === 'true';

    const now = Date.now();
    if (!forceRefresh && cachedResult && now - cacheTimestamp < CACHE_TTL_MS) {
        return NextResponse.json({ success: true, ...cachedResult, cached: true });
    }

    const stabilityDir = path.join(process.cwd(), 'ONLY STABILITY');

    if (!fs.existsSync(stabilityDir)) {
        return NextResponse.json({
            success: false,
            error: 'ONLY STABILITY directory not found',
            byMfrKey: {},
        });
    }

    const files = walkDir(stabilityDir);
    const byMfrKey: Record<string, StabilityEntry> = {};

    for (const filePath of files) {
        const filename = path.basename(filePath);
        const isAcc = isAcceleratedFile(filename);
        const isLT = isLongTermFile(filename);

        if (!isAcc && !isLT) continue;

        const mfrKey = extractMfrKeyFromPath(filePath);
        if (!mfrKey) continue; // skip files not inside a (MFRxxx) named folder

        if (!byMfrKey[mfrKey]) {
            byMfrKey[mfrKey] = { hasAccelerated: false, hasLongTerm: false };
        }
        if (isAcc) byMfrKey[mfrKey].hasAccelerated = true;
        if (isLT) byMfrKey[mfrKey].hasLongTerm = true;
    }

    cachedResult = { byMfrKey };
    cacheTimestamp = now;

    return NextResponse.json({ success: true, byMfrKey, cached: false, scannedFiles: files.length });
}
