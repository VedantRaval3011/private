import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

interface AstRstEntry {
    hasAccelerated: boolean;
    hasLongTerm: boolean;
    mfrNo: string;
}

interface AstRstResult {
    byMfr: Record<string, AstRstEntry>;
    byProductCode: Record<string, AstRstEntry>;
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
            } else if (entry.isFile() && !entry.name.startsWith('~$')) {
                const lower = entry.name.toLowerCase();
                if (lower.endsWith('.doc') || lower.endsWith('.docx')) {
                    files.push(fullPath);
                }
            }
        }
    } catch { /* skip unreadable dirs */ }
    return files;
}

function extractFromDoc(filePath: string): { mfrNo: string | null; productCodes: string[] } {
    try {
        const raw = fs.readFileSync(filePath).toString('latin1');

        // Extract MFR No. (format: MFR/XX/DXXXX.XX)
        const mfrMatch = raw.match(/MFR\/[A-Za-z]+\/[A-Za-z0-9]+\.[0-9]+/);
        const mfrNo = mfrMatch ? mfrMatch[0].toUpperCase() : null;

        // Extract product codes (format like BC002G1H, PN367G1IU, etc.)
        // Pattern: 2 uppercase letters + 3-4 digits + G + 1 digit + 1-3 uppercase letters
        const rawCodes = raw.match(/\b[A-Z]{2,3}[0-9]{3,4}G[0-9][A-Z]{1,3}\b/g) || [];
        const productCodes = [...new Set(rawCodes)];

        return { mfrNo, productCodes };
    } catch {
        return { mfrNo: null, productCodes: [] };
    }
}

// Module-level cache
let cachedResult: AstRstResult | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const forceRefresh = searchParams.get('refresh') === 'true';

    const now = Date.now();
    if (!forceRefresh && cachedResult && now - cacheTimestamp < CACHE_TTL_MS) {
        return NextResponse.json({ success: true, ...cachedResult, cached: true });
    }

    const astRstDir = path.join(process.cwd(), 'AST & RST');

    if (!fs.existsSync(astRstDir)) {
        return NextResponse.json({
            success: false,
            error: 'AST & RST directory not found',
            byMfr: {},
            byProductCode: {},
        });
    }

    const files = walkDir(astRstDir);
    const byMfr: Record<string, AstRstEntry> = {};
    const byProductCode: Record<string, AstRstEntry> = {};

    for (const filePath of files) {
        const filename = path.basename(filePath);
        const isAcc = isAcceleratedFile(filename);
        const isLT = isLongTermFile(filename);

        if (!isAcc && !isLT) continue;

        const { mfrNo, productCodes } = extractFromDoc(filePath);
        if (!mfrNo) continue;

        // Index by MFR No.
        if (!byMfr[mfrNo]) {
            byMfr[mfrNo] = { hasAccelerated: false, hasLongTerm: false, mfrNo };
        }
        if (isAcc) byMfr[mfrNo].hasAccelerated = true;
        if (isLT) byMfr[mfrNo].hasLongTerm = true;

        // Index by product code
        for (const code of productCodes) {
            if (!byProductCode[code]) {
                byProductCode[code] = { hasAccelerated: false, hasLongTerm: false, mfrNo };
            }
            if (isAcc) byProductCode[code].hasAccelerated = true;
            if (isLT) byProductCode[code].hasLongTerm = true;
        }
    }

    cachedResult = { byMfr, byProductCode };
    cacheTimestamp = now;

    return NextResponse.json({ success: true, byMfr, byProductCode, cached: false, scannedFiles: files.length });
}
