/**
 * Retained Sample Audit Logs API
 *
 * GET /api/retained-sample/audit-logs
 *   Returns a flat list of all audit events derived from RetainedSample records.
 *   Each event represents either an initial creation or a subsequent edit of a
 *   stability entry. Supports filtering by mfcNo, batchNumber, actor, month, and date range.
 */

import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import RetainedSample from '@/models/RetainedSample';

export interface AuditEvent {
  id: string;                  // synthetic: mfcNo|batchNumber|itemCode|month|index
  mfcNo: string;
  productCode: string;
  productName: string;
  batchNumber: string;
  itemCode: string;
  month: number;
  action: 'created' | 'edited';
  pH: string;
  phValues: Array<{ label: string; value: string }>;
  description: string;
  timestamp: string;           // ISO string
  actor?: { name: string; username: string };
}

export interface AuditLogsResponse {
  success: boolean;
  data?: AuditEvent[];
  total?: number;
  error?: string;
}

export async function GET(request: NextRequest): Promise<NextResponse<AuditLogsResponse>> {
  try {
    await connectToDatabase();

    const { searchParams } = new URL(request.url);
    const filterMfc    = searchParams.get('mfcNo')?.trim().toLowerCase() || '';
    const filterBatch  = searchParams.get('batchNumber')?.trim().toLowerCase() || '';
    const filterActor  = searchParams.get('actor')?.trim().toLowerCase() || '';
    const filterMonth  = searchParams.get('month') ? Number(searchParams.get('month')) : null;
    const filterAction = searchParams.get('action') || '';      // 'created' | 'edited' | ''
    const filterFrom   = searchParams.get('from') || '';        // ISO date string
    const filterTo     = searchParams.get('to') || '';          // ISO date string

    const docs = await RetainedSample.find({}).lean();

    const events: AuditEvent[] = [];

    for (const doc of docs) {
      const mfcNo       = doc.mfcNo || '';
      const productCode = doc.productCode || '';
      const productName = doc.productName || '';
      const batchNumber = doc.batchNumber || '';
      const itemCode    = (doc as { itemCode?: string }).itemCode || '';

      for (const entry of doc.stabilityEntries || []) {
        const month: number = entry.month;

        // ── Creation event ────────────────────────────────────
        const createdAt  = entry.createdAt || entry.recordedAt;
        const createdBy  = entry.createdBy;

        events.push({
          id: `${mfcNo}|${batchNumber}|${itemCode}|${month}|created`,
          mfcNo,
          productCode,
          productName,
          batchNumber,
          itemCode,
          month,
          action: 'created',
          pH: entry.pH || '',
          phValues: entry.phValues || [],
          description: entry.description || '',
          timestamp: createdAt ? new Date(createdAt).toISOString() : '',
          actor: createdBy ? { name: createdBy.name || '', username: createdBy.username || '' } : undefined,
        });

        // ── Edit history events ───────────────────────────────
        const history: Array<{
          pH?: string;
          phValues?: Array<{ label: string; value: string }>;
          description?: string;
          recordedAt?: Date | string;
          savedBy?: { name?: string; username?: string };
        }> = entry.editHistory || [];

        history.forEach((h, idx) => {
          events.push({
            id: `${mfcNo}|${batchNumber}|${itemCode}|${month}|edit-${idx}`,
            mfcNo,
            productCode,
            productName,
            batchNumber,
            itemCode,
            month,
            action: 'edited',
            pH: h.pH || '',
            phValues: h.phValues || [],
            description: h.description || '',
            timestamp: h.recordedAt ? new Date(h.recordedAt).toISOString() : '',
            actor: h.savedBy ? { name: h.savedBy.name || '', username: h.savedBy.username || '' } : undefined,
          });
        });
      }
    }

    // ── Apply filters ─────────────────────────────────────────
    const fromDate = filterFrom ? new Date(filterFrom) : null;
    const toDate   = filterTo   ? new Date(filterTo + 'T23:59:59.999Z') : null;

    const filtered = events.filter((e) => {
      if (filterMfc    && !e.mfcNo.toLowerCase().includes(filterMfc))         return false;
      if (filterBatch  && !e.batchNumber.toLowerCase().includes(filterBatch)) return false;
      if (filterActor  && !(
        (e.actor?.name?.toLowerCase().includes(filterActor)) ||
        (e.actor?.username?.toLowerCase().includes(filterActor))
      )) return false;
      if (filterMonth  !== null && e.month !== filterMonth)                   return false;
      if (filterAction && e.action !== filterAction)                          return false;
      if (e.timestamp) {
        const ts = new Date(e.timestamp);
        if (fromDate && ts < fromDate) return false;
        if (toDate   && ts > toDate)   return false;
      }
      return true;
    });

    // Sort: most recent first; events without timestamps go to end
    filtered.sort((a, b) => {
      if (!a.timestamp && !b.timestamp) return 0;
      if (!a.timestamp) return 1;
      if (!b.timestamp) return -1;
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });

    return NextResponse.json({ success: true, data: filtered, total: filtered.length });
  } catch (error) {
    console.error('GET /api/retained-sample/audit-logs error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch audit logs' },
      { status: 500 }
    );
  }
}
