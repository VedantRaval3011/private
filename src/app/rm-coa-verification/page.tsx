'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

type DrillMode =
  | 'total_batches'
  | 'requisition_found'
  | 'requisition_missing'
  | 'rm_coa_found'
  | 'rm_coa_missing';

interface VerificationRow {
  id: string;
  matReqNo: string;
  materialName: string;
  materialCode: string;
  arNo?: string;
  batchNumber: string;
  batchStatus: string;
  coaStatus: string;
  coaMessage: string;
}

interface ApiResponse {
  success: boolean;
  message?: string;
  year: string | null;
  drill: DrillMode | null;
  availableYears: string[];
  summary: {
    totalBatchesCreation: number;
    requisitionBatchesFound: number;
    requisitionBatchesMissing: number;
    rmCoaFoundBatches: number;
    rmCoaMissingBatches: number;
  };
  rows: VerificationRow[];
}

type MfcGroupFilter = 'all' | 'main_3plus' | 'low_1_2' | 'no_0' | 'placebo_mediafill';

function yearFromMfgDateLikeFormulaData(mfgDate: string | null | undefined): string | null {
  const parts = (mfgDate || '').split('-');
  if (parts.length !== 3) return null;
  const yy = parseInt(parts[2], 10);
  if (Number.isNaN(yy)) return null;
  return (yy < 50 ? 2000 + yy : 1900 + yy).toString();
}

type FormulaBatchCategory = 'main' | 'lowBatch' | 'noBatch' | 'placebo';

function getFormulaProductCodesLikeFormulaData(f: any): string[] {
  const codes: string[] = [];
  const mainCode = f?.masterFormulaDetails?.productCode;
  if (mainCode && mainCode !== 'N/A') codes.push(String(mainCode).trim().toUpperCase());
  if (f?.fillingDetails && Array.isArray(f.fillingDetails)) {
    f.fillingDetails.forEach((fd: any) => {
      const c = fd?.productCode;
      if (c && c !== 'N/A') {
        const cu = String(c).trim().toUpperCase();
        if (cu && !codes.includes(cu)) codes.push(cu);
      }
    });
  }
  if (f?.processes && Array.isArray(f.processes)) {
    f.processes.forEach((p: any) => {
      if (p?.fillingProducts && Array.isArray(p.fillingProducts)) {
        p.fillingProducts.forEach((fp: any) => {
          const c = fp?.productCode;
          const cu = String(c || '').trim().toUpperCase();
          if (cu && !codes.includes(cu)) codes.push(cu);
        });
      }
    });
  }
  return codes;
}

function batchBadgeStyle(label: string): { bg: string; color: string; border: string } {
  if (label.includes('Requisition Found')) {
    return { bg: 'rgba(16, 185, 129, 0.2)', color: '#047857', border: 'rgba(16,185,129,0.45)' };
  }
  if (label.includes('Requisition Missing')) {
    return { bg: 'rgba(239, 68, 68, 0.22)', color: '#b91c1c', border: 'rgba(239,68,68,0.45)' };
  }
  return { bg: 'rgba(148, 163, 184, 0.2)', color: '#475569', border: 'rgba(148,163,184,0.45)' };
}

function coaBadgeStyle(label: string): { bg: string; color: string; border: string } {
  if (label.includes('COA Found')) {
    return { bg: 'rgba(16, 185, 129, 0.2)', color: '#047857', border: 'rgba(16,185,129,0.45)' };
  }
  if (label.includes('COA Missing')) {
    return { bg: 'rgba(239, 68, 68, 0.22)', color: '#b91c1c', border: 'rgba(239,68,68,0.45)' };
  }
  return { bg: 'rgba(148, 163, 184, 0.15)', color: '#64748b', border: 'rgba(148,163,184,0.35)' };
}

const capsuleBase: React.CSSProperties = {
  padding: '0.85rem 1rem',
  borderRadius: '999px',
  fontWeight: 700,
  fontSize: '0.72rem',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '0.3rem',
  minWidth: '118px',
  maxWidth: '160px',
  boxShadow: '0 4px 14px rgba(0,0,0,0.08)',
  cursor: 'pointer',
  textAlign: 'center',
  border: '2px solid transparent',
  transition: 'transform 0.15s ease, box-shadow 0.15s ease',
};

export default function RmCoaVerificationPage() {
  const [availableYears, setAvailableYears] = useState<string[]>([]);
  const [selectedYear, setSelectedYear] = useState<string>('');
  const [mfcGroupFilter, setMfcGroupFilter] = useState<MfcGroupFilter>('all');
  const [activeDrill, setActiveDrill] = useState<DrillMode | null>('total_batches');
  const [baseBatchRows, setBaseBatchRows] = useState<VerificationRow[]>([]);
  const [rows, setRows] = useState<VerificationRow[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<keyof VerificationRow>('batchNumber');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [summary, setSummary] = useState({
    totalBatchesCreation: 0,
    requisitionBatchesFound: 0,
    requisitionBatchesMissing: 0,
    rmCoaFoundBatches: 0,
    rmCoaMissingBatches: 0,
  });
  const [loadingYears, setLoadingYears] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [batchYearMap, setBatchYearMap] = useState<Map<string, string>>(new Map());
  const [batchCategoryMap, setBatchCategoryMap] = useState<Map<string, FormulaBatchCategory>>(new Map());

  const loadYears = useCallback(async () => {
    setLoadingYears(true);
    setError(null);
    try {
      const res = await fetch('/api/requisition/rm-coa-verification');
      const data: ApiResponse = await res.json();
      if (!data.success) {
        setError(data.message || 'Failed to load years');
        return;
      }
      setAvailableYears(data.availableYears);
      // Keep current selection if valid; otherwise default to All Years.
      setSelectedYear(prev => (prev && data.availableYears.includes(prev) ? prev : ''));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setLoadingYears(false);
    }
  }, []);

  const emptySummary = useMemo(
    () => ({
      totalBatchesCreation: 0,
      requisitionBatchesFound: 0,
      requisitionBatchesMissing: 0,
      rmCoaFoundBatches: 0,
      rmCoaMissingBatches: 0,
    }),
    []
  );

  const loadVerification = useCallback(
    async (year: string, drill: DrillMode | null) => {
      setLoadingData(true);
      setError(null);
      try {
        const qs = year ? new URLSearchParams({ year }) : new URLSearchParams({ scope: 'all' });
        if (drill) qs.set('drill', drill);
        const res = await fetch(`/api/requisition/rm-coa-verification?${qs}`);
        const data: ApiResponse = await res.json();
        if (!data.success) {
          setError(data.message || 'Failed to load verification');
          setRows([]);
          setSummary(emptySummary);
          return;
        }
        setSummary(data.summary);
        setRows(data.rows);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Network error');
        setRows([]);
        setSummary(emptySummary);
      } finally {
        setLoadingData(false);
      }
    },
    [emptySummary]
  );

  const loadBaseRowsForSummary = useCallback(
    async (year: string) => {
      try {
        const qs = year ? new URLSearchParams({ year, drill: 'total_batches' }) : new URLSearchParams({ scope: 'all', drill: 'total_batches' });
        const res = await fetch(`/api/requisition/rm-coa-verification?${qs}`);
        const data: ApiResponse = await res.json();
        if (!data?.success) {
          setBaseBatchRows([]);
          return;
        }
        setBaseBatchRows(data.rows || []);
      } catch {
        setBaseBatchRows([]);
      }
    },
    []
  );

  useEffect(() => {
    void loadYears();
  }, [loadYears]);

  // Build batchYearMap and batchCategoryMap using the same logic as Formula Data uniqueBatchReconciliation.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [batchRes, formulaRes] = await Promise.all([
          fetch('/api/batch?page=1&limit=10000'),
          fetch('/api/formula?page=1&limit=1000'),
        ]);
        const batchJson = await batchRes.json();
        const formulaJson = await formulaRes.json();
        if (cancelled) return;

        const yearMap = new Map<string, string>();
        const flatBatches: any[] = [];
        if (batchJson?.success && Array.isArray(batchJson?.data)) {
          batchJson.data.forEach((record: any) => {
            (record.batches || []).forEach((b: any) => {
              const bn = (b.batchNumber || '').trim().toUpperCase();
              if (!bn) return;
              const yr = yearFromMfgDateLikeFormulaData(b.mfgDate);
              if (yr && !yearMap.has(bn)) yearMap.set(bn, yr);
              flatBatches.push(b);
            });
          });
        }
        setBatchYearMap(yearMap);

        // Filter formulas by year the same way Formula Data does: if any uniqueBatchNumbers belongs to selected year.
        const formulas: any[] = (formulaJson?.success && Array.isArray(formulaJson?.data)) ? formulaJson.data : [];
        const filteredFormulas = selectedYear
          ? formulas.filter(f => {
              const bns: string[] = (f?.uniqueBatchNumbers || []) as string[];
              return bns.some((bn: string) => yearMap.get(String(bn).trim().toUpperCase()) === selectedYear);
            })
          : formulas;

        const mainFormulas: any[] = [];
        const lowBatchFormulas: any[] = [];
        const noBatchFormulas: any[] = [];
        const placeboFormulas: any[] = [];

        filteredFormulas.forEach(f => {
          const productName = (f?.masterFormulaDetails?.productName || '').toString().toLowerCase();
          const isPlaceboOrMediafill =
            productName.includes('placebo') || productName.includes('mediafill') || productName.includes('media fill');
          const batchCount = Number(f?.totalBatchCount || 0);
          if (isPlaceboOrMediafill) placeboFormulas.push(f);
          else if (batchCount === 0) noBatchFormulas.push(f);
          else if (batchCount < 3) lowBatchFormulas.push(f);
          else mainFormulas.push(f);
        });

        // Build productCode -> category mapping (same precedence/order as Formula Data)
        const productCodeToCategory = new Map<string, FormulaBatchCategory>();
        const addCodes = (arr: any[], cat: FormulaBatchCategory) => {
          arr.forEach(f => {
            getFormulaProductCodesLikeFormulaData(f).forEach(code => {
              if (!productCodeToCategory.has(code)) productCodeToCategory.set(code, cat);
            });
          });
        };
        addCodes(mainFormulas, 'main');
        addCodes(lowBatchFormulas, 'lowBatch');
        addCodes(noBatchFormulas, 'noBatch');
        addCodes(placeboFormulas, 'placebo');

        // Apply year filter to batch creation rows, then dedupe by batchNumber and categorize by itemCode.
        const sourceBatches = selectedYear
          ? flatBatches.filter(b => yearFromMfgDateLikeFormulaData(b.mfgDate) === selectedYear)
          : flatBatches;
        const uniqueBatchMap = new Map<string, any>();
        sourceBatches.forEach(b => {
          const bn = (b.batchNumber || '').toString().trim().toUpperCase();
          if (bn && !uniqueBatchMap.has(bn)) uniqueBatchMap.set(bn, b);
        });

        const catMap = new Map<string, FormulaBatchCategory>();
        uniqueBatchMap.forEach((b, bn) => {
          const itemCode = (b.itemCode || '').toString().trim().toUpperCase();
          const cat = (itemCode ? productCodeToCategory.get(itemCode) : undefined) || 'main';
          catMap.set(bn, cat);
        });
        setBatchCategoryMap(catMap);
      } catch {
        if (cancelled) return;
        setBatchYearMap(new Map());
        setBatchCategoryMap(new Map());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedYear]);

  useEffect(() => {
    void loadVerification(selectedYear, activeDrill);
  }, [selectedYear, activeDrill, loadVerification, emptySummary]);

  // Base batch rows used for capsule counts (always drill=total_batches)
  useEffect(() => {
    void loadBaseRowsForSummary(selectedYear);
  }, [selectedYear, loadBaseRowsForSummary]);

  const displaySummary = useMemo(() => {
    const inGroup = (bnRaw: string): boolean => {
      if (mfcGroupFilter === 'all') return true;
      const bn = (bnRaw || '').trim().toUpperCase();
      if (!bn) return false;
      const cat = batchCategoryMap.get(bn);
      if (!cat) return false;
      if (mfcGroupFilter === 'main_3plus') return cat === 'main';
      if (mfcGroupFilter === 'low_1_2') return cat === 'lowBatch';
      if (mfcGroupFilter === 'no_0') return cat === 'noBatch';
      if (mfcGroupFilter === 'placebo_mediafill') return cat === 'placebo';
      return true;
    };

    let totalBatchesCreation = 0;
    let requisitionBatchesFound = 0;
    let requisitionBatchesMissing = 0;
    let rmCoaFoundBatches = 0;
    let rmCoaMissingBatches = 0;

    for (const r of baseBatchRows) {
      const bn = (r.batchNumber || '').trim();
      if (!bn) continue;
      if (!inGroup(bn)) continue;
      totalBatchesCreation++;
      const isReqFound = (r.batchStatus || '').includes('Requisition Found');
      const isReqMissing = (r.batchStatus || '').includes('Requisition Missing');
      if (isReqFound) {
        requisitionBatchesFound++;
        if ((r.coaStatus || '').includes('COA Found')) rmCoaFoundBatches++;
        else if ((r.coaStatus || '').includes('COA Missing')) rmCoaMissingBatches++;
      } else if (isReqMissing) {
        requisitionBatchesMissing++;
      }
    }

    // Keep validation invariant even if some strings are unexpected
    if (requisitionBatchesFound + requisitionBatchesMissing !== totalBatchesCreation) {
      requisitionBatchesMissing = Math.max(0, totalBatchesCreation - requisitionBatchesFound);
    }
    if (rmCoaFoundBatches + rmCoaMissingBatches !== requisitionBatchesFound) {
      rmCoaMissingBatches = Math.max(0, requisitionBatchesFound - rmCoaFoundBatches);
    }

    return {
      totalBatchesCreation,
      requisitionBatchesFound,
      requisitionBatchesMissing,
      rmCoaFoundBatches,
      rmCoaMissingBatches,
    };
  }, [baseBatchRows, mfcGroupFilter, batchCategoryMap]);

  const reqSumOk =
    displaySummary.requisitionBatchesFound + displaySummary.requisitionBatchesMissing === displaySummary.totalBatchesCreation;
  const coaSumOk =
    displaySummary.rmCoaFoundBatches + displaySummary.rmCoaMissingBatches === displaySummary.requisitionBatchesFound;

  const batchWiseRows = useMemo(() => {
    // Aggregate API line rows into one row per batch number.
    const byBatch = new Map<string, VerificationRow>();
    const reqNos = new Map<string, Set<string>>();
    const items = new Map<string, Set<string>>();
    const codes = new Map<string, Set<string>>();
    const messages = new Map<string, Set<string>>();

    const addSet = (map: Map<string, Set<string>>, key: string, value: string) => {
      if (!value) return;
      if (!map.has(key)) map.set(key, new Set());
      map.get(key)!.add(value);
    };

    for (const r of rows) {
      const bn = (r.batchNumber || '').trim();
      if (!bn) continue;
      if (!byBatch.has(bn)) byBatch.set(bn, { ...r });
      addSet(reqNos, bn, r.matReqNo && r.matReqNo !== '-' ? r.matReqNo : '');
      addSet(items, bn, r.materialName && r.materialName !== '-' ? r.materialName : '');
      addSet(codes, bn, r.materialCode && r.materialCode !== '-' ? r.materialCode : '');
      addSet(messages, bn, r.coaMessage || '');
    }

    const joinSet = (s: Set<string> | undefined, max = 2) => {
      if (!s || s.size === 0) return '-';
      const arr = Array.from(s);
      if (arr.length <= max) return arr.join(', ');
      return `${arr.slice(0, max).join(', ')} +${arr.length - max} more`;
    };

    const out: VerificationRow[] = [];
    for (const [bn, base] of byBatch.entries()) {
      out.push({
        ...base,
        batchNumber: bn,
        matReqNo: joinSet(reqNos.get(bn), 2),
        materialName: joinSet(items.get(bn), 2),
        materialCode: joinSet(codes.get(bn), 2),
        coaMessage: joinSet(messages.get(bn), 1) === '-' ? '' : joinSet(messages.get(bn), 1),
      });
    }
    return out;
  }, [rows]);

  const filteredSortedRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const groupFiltered = batchWiseRows.filter(r => {
      if (mfcGroupFilter === 'all') return true;
      const bn = (r.batchNumber || '').trim().toUpperCase();
      if (!bn) return false;
      const cat = batchCategoryMap.get(bn);
      if (!cat) return false;
      if (mfcGroupFilter === 'main_3plus') return cat === 'main';
      if (mfcGroupFilter === 'low_1_2') return cat === 'lowBatch';
      if (mfcGroupFilter === 'no_0') return cat === 'noBatch';
      if (mfcGroupFilter === 'placebo_mediafill') return cat === 'placebo';
      return true;
    });

    const filtered = q
      ? groupFiltered.filter(r => {
          const hay = [
            r.matReqNo,
            r.materialName,
            r.materialCode,
            r.batchNumber,
            r.batchStatus,
            r.coaStatus,
            r.coaMessage,
          ]
            .join(' ')
            .toLowerCase();
          return hay.includes(q);
        })
      : groupFiltered;

    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = (a[sortKey] ?? '').toString();
      const bv = (b[sortKey] ?? '').toString();
      const c = collator.compare(av, bv);
      return c !== 0 ? c * dir : collator.compare(a.batchNumber, b.batchNumber);
    });
  }, [batchWiseRows, searchQuery, sortKey, sortDir, mfcGroupFilter, batchCategoryMap]);

  const setSort = (key: keyof VerificationRow) => {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const drillTitle: Record<DrillMode, string> = {
    total_batches: `All batch creation batches (${selectedYear || 'All Years'})`,
    requisition_found: 'Batches in batch creation and RM requisition',
    requisition_missing: 'Batches in batch creation only (not on RM requisition)',
    rm_coa_found: 'Requisition batches with RM COA',
    rm_coa_missing: 'Requisition batches without RM COA',
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--background)' }}>
      <header
        style={{
          background: 'linear-gradient(135deg, #0f766e 0%, #115e59 100%)',
          padding: '1.5rem 0',
        }}
      >
        <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '0 1.5rem' }}>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: '1.25rem',
            }}
          >
            <div>
              <h1
                style={{
                  fontSize: '1.65rem',
                  fontWeight: 800,
                  color: 'white',
                  margin: 0,
                  letterSpacing: '-0.02em',
                }}
              >
                RM COA verification
              </h1>
              <p
                style={{
                  color: 'rgba(255,255,255,0.88)',
                  fontSize: '0.9rem',
                  marginTop: '0.35rem',
                  maxWidth: '520px',
                }}
              >
                Step-wise batch verification for the selected manufacturing year: totals from batch creation,
                requisition match, then RM COA coverage for batches that appear in both systems. Click a capsule to
                open the detail table.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
              <label
                htmlFor="mfg-year"
                style={{
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  color: 'rgba(255,255,255,0.75)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}
              >
                Mfg year
              </label>
              <select
                id="mfg-year"
                value={selectedYear}
                onChange={e => {
                  setActiveDrill('total_batches');
                  setSelectedYear(e.target.value);
                }}
                disabled={loadingYears || availableYears.length === 0}
                title="Filter RM requisitions, batch creation, and RM COA scope by manufacturing year"
                style={{
                  padding: '0.55rem 1rem',
                  borderRadius: '12px',
                  border: selectedYear ? '2px solid rgba(255,255,255,0.9)' : '1px solid rgba(255,255,255,0.35)',
                  background: selectedYear ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.12)',
                  color: 'white',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  cursor: loadingYears || availableYears.length === 0 ? 'not-allowed' : 'pointer',
                  minWidth: '128px',
                  textAlign: 'center',
                }}
              >
                {availableYears.length === 0 ? (
                  <option value="">No years in data</option>
                ) : (
                  <>
                    <option value="" style={{ background: '#134e4a', color: 'white' }}>
                      All Years
                    </option>
                    {availableYears.map(y => (
                      <option key={y} value={y} style={{ background: '#134e4a', color: 'white' }}>
                        {y}
                      </option>
                    ))}
                  </>
                )}
              </select>
              <span style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>
                Filter by year
              </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                <label
                  htmlFor="mfc-group"
                  style={{
                    fontSize: '0.65rem',
                    fontWeight: 700,
                    color: 'rgba(255,255,255,0.75)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                  }}
                >
                  MFC group
                </label>
                <select
                  id="mfc-group"
                  value={mfcGroupFilter}
                  onChange={e => setMfcGroupFilter(e.target.value as MfcGroupFilter)}
                  title="Filter table batches by MFC group"
                  style={{
                    padding: '0.55rem 1rem',
                    borderRadius: '12px',
                    border: '1px solid rgba(255,255,255,0.35)',
                    background: 'rgba(255,255,255,0.12)',
                    color: 'white',
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    minWidth: '210px',
                    textAlign: 'center',
                  }}
                >
                  <option value="all" style={{ background: '#134e4a', color: 'white' }}>
                    All MFC groups
                  </option>
                  <option value="main_3plus" style={{ background: '#134e4a', color: 'white' }}>
                    MFCs with 3 or 3+ batches
                  </option>
                  <option value="low_1_2" style={{ background: '#134e4a', color: 'white' }}>
                    MFCs with 1–2 batches
                  </option>
                  <option value="no_0" style={{ background: '#134e4a', color: 'white' }}>
                    MFCs with 0 batches
                  </option>
                  <option value="placebo_mediafill" style={{ background: '#134e4a', color: 'white' }}>
                    Placebo / Media fill
                  </option>
                </select>
                <span style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>
                  Filter table by MFC group
                </span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: '1280px', margin: '0 auto', padding: '1.5rem' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1.25rem',
            flexWrap: 'wrap',
            gap: '0.75rem',
          }}
        >
          <Link
            href="/"
            style={{
              padding: '0.45rem 0.9rem',
              borderRadius: '8px',
              background: 'var(--card)',
              border: '1px solid var(--border)',
              color: 'var(--foreground)',
              textDecoration: 'none',
              fontWeight: 600,
              fontSize: '0.85rem',
            }}
          >
            Back to Home
          </Link>
        </div>

        {error && (
          <div
            role="alert"
            style={{
              padding: '0.75rem 1rem',
              borderRadius: '10px',
              background: 'rgba(220, 38, 38, 0.1)',
              border: '1px solid rgba(220, 38, 38, 0.35)',
              color: '#b91c1c',
              marginBottom: '1rem',
              fontSize: '0.9rem',
            }}
          >
            {error}
          </div>
        )}

        <section
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.75rem',
            marginBottom: '1rem',
            justifyContent: 'flex-start',
            alignItems: 'stretch',
          }}
        >
          <button
            type="button"
            onClick={() => setActiveDrill('total_batches')}
            style={{
              ...capsuleBase,
              background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.12) 0%, rgba(37, 99, 235, 0.08) 100%)',
              border:
                activeDrill === 'total_batches'
                  ? '2px solid rgba(37, 99, 235, 0.85)'
                  : '1px solid rgba(59, 130, 246, 0.35)',
            }}
          >
            <span style={{ color: '#1d4ed8', fontSize: '1.35rem', lineHeight: 1 }}>
              {loadingData ? '...' : displaySummary.totalBatchesCreation.toLocaleString()}
            </span>
            <span style={{ color: '#1e40af', textTransform: 'uppercase', letterSpacing: '0.03em', lineHeight: 1.2 }}>
              Total batches ({selectedYear || 'All Years'})
            </span>
            <span style={{ fontWeight: 500, color: '#64748b', fontSize: '0.62rem' }}>From batch creation</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveDrill('requisition_found')}
            style={{
              ...capsuleBase,
              background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.18) 0%, rgba(5, 150, 105, 0.1) 100%)',
              border:
                activeDrill === 'requisition_found'
                  ? '2px solid rgba(5, 150, 105, 0.9)'
                  : '1px solid rgba(16, 185, 129, 0.45)',
            }}
          >
            <span style={{ color: '#047857', fontSize: '1.35rem', lineHeight: 1 }}>
              {loadingData ? '...' : displaySummary.requisitionBatchesFound.toLocaleString()}
            </span>
            <span style={{ color: '#065f46', textTransform: 'uppercase', letterSpacing: '0.03em', lineHeight: 1.2 }}>
              Requisition batches found
            </span>
            <span style={{ fontWeight: 500, color: '#64748b', fontSize: '0.62rem' }}>Creation + RM requisition</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveDrill('requisition_missing')}
            style={{
              ...capsuleBase,
              background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.14) 0%, rgba(220, 38, 38, 0.08) 100%)',
              border:
                activeDrill === 'requisition_missing'
                  ? '2px solid rgba(220, 38, 38, 0.85)'
                  : '1px solid rgba(239, 68, 68, 0.4)',
            }}
          >
            <span style={{ color: '#b91c1c', fontSize: '1.35rem', lineHeight: 1 }}>
              {loadingData ? '...' : displaySummary.requisitionBatchesMissing.toLocaleString()}
            </span>
            <span style={{ color: '#991b1b', textTransform: 'uppercase', letterSpacing: '0.03em', lineHeight: 1.2 }}>
              Requisition batches missing
            </span>
            <span style={{ fontWeight: 500, color: '#64748b', fontSize: '0.62rem' }}>Creation only, not on RM req.</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveDrill('rm_coa_found')}
            style={{
              ...capsuleBase,
              background: 'linear-gradient(135deg, rgba(21, 128, 61, 0.2) 0%, rgba(6, 95, 70, 0.12) 100%)',
              border:
                activeDrill === 'rm_coa_found'
                  ? '2px solid rgba(6, 95, 70, 0.9)'
                  : '1px solid rgba(21, 128, 61, 0.45)',
            }}
          >
            <span style={{ color: '#047857', fontSize: '1.35rem', lineHeight: 1 }}>
              {loadingData ? '...' : displaySummary.rmCoaFoundBatches.toLocaleString()}
            </span>
            <span style={{ color: '#065f46', textTransform: 'uppercase', letterSpacing: '0.03em', lineHeight: 1.2 }}>
              RM COA found
            </span>
            <span style={{ fontWeight: 500, color: '#64748b', fontSize: '0.62rem' }}>Among requisition-found batches</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveDrill('rm_coa_missing')}
            style={{
              ...capsuleBase,
              background: 'linear-gradient(135deg, rgba(185, 28, 28, 0.12) 0%, rgba(127, 29, 29, 0.08) 100%)',
              border:
                activeDrill === 'rm_coa_missing'
                  ? '2px solid rgba(185, 28, 28, 0.9)'
                  : '1px solid rgba(239, 68, 68, 0.45)',
            }}
          >
            <span style={{ color: '#b91c1c', fontSize: '1.35rem', lineHeight: 1 }}>
              {loadingData ? '...' : displaySummary.rmCoaMissingBatches.toLocaleString()}
            </span>
            <span style={{ color: '#991b1b', textTransform: 'uppercase', letterSpacing: '0.03em', lineHeight: 1.2 }}>
              RM COA missing
            </span>
            <span style={{ fontWeight: 500, color: '#64748b', fontSize: '0.62rem' }}>Among requisition-found batches</span>
          </button>
        </section>

        {availableYears.length > 0 && (
          <div
            style={{
              marginBottom: '1.25rem',
              padding: '0.65rem 1rem',
              borderRadius: '10px',
              background: 'var(--card)',
              border: '1px solid var(--border)',
              fontSize: '0.78rem',
              color: '#475569',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '1.25rem',
            }}
          >
            <span>
              <strong>Requisition check:</strong> Found ({displaySummary.requisitionBatchesFound.toLocaleString()}) + Missing (
              {displaySummary.requisitionBatchesMissing.toLocaleString()}) = Total ({displaySummary.totalBatchesCreation.toLocaleString()}
              ){reqSumOk ? ' ✓' : ' (mismatch)'}
            </span>
            <span>
              <strong>RM COA check:</strong> COA Found ({displaySummary.rmCoaFoundBatches.toLocaleString()}) + COA Missing (
              {displaySummary.rmCoaMissingBatches.toLocaleString()}) = Requisition Found (
              {displaySummary.requisitionBatchesFound.toLocaleString()}){coaSumOk ? ' ✓' : ' (mismatch)'}
            </span>
          </div>
        )}

        <div
          style={{
            borderRadius: '12px',
            border: '1px solid var(--border)',
            background: 'var(--card)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '0.85rem 1rem',
              borderBottom: '1px solid var(--border)',
              fontWeight: 700,
              fontSize: '0.95rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '1rem',
              flexWrap: 'wrap',
            }}
          >
            <div>
              {activeDrill ? drillTitle[activeDrill] : 'Detail table'}
              <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600, marginTop: '0.15rem' }}>
                {activeDrill ? `${filteredSortedRows.length.toLocaleString()} batches` : 'Select a capsule to load data'}
                {searchQuery.trim() ? ` • filtered by “${searchQuery.trim()}”` : ''}
                {loadingData ? ' • loading…' : ''}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search (batch, item, req, status...)"
                style={{
                  padding: '0.5rem 0.7rem',
                  borderRadius: '10px',
                  border: '1px solid var(--border)',
                  background: 'var(--background)',
                  color: 'var(--foreground)',
                  fontSize: '0.85rem',
                  minWidth: '280px',
                  outline: 'none',
                }}
                disabled={!activeDrill}
              />
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                disabled={!activeDrill || !searchQuery}
                style={{
                  padding: '0.5rem 0.7rem',
                  borderRadius: '10px',
                  border: '1px solid var(--border)',
                  background: 'var(--background)',
                  color: 'var(--foreground)',
                  fontSize: '0.85rem',
                  cursor: !activeDrill || !searchQuery ? 'not-allowed' : 'pointer',
                }}
                title="Clear search"
              >
                Clear
              </button>
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ background: 'var(--muted)', textAlign: 'left' }}>
                  <th style={{ padding: '0.65rem 1rem', fontWeight: 700, width: '72px' }}>SR</th>
                  <th style={{ padding: '0.65rem 1rem', fontWeight: 700 }}>Requisition number</th>
                  <th style={{ padding: '0.65rem 1rem', fontWeight: 700 }}>RM item</th>
                  <th style={{ padding: '0.65rem 1rem', fontWeight: 700 }}>Material code</th>
                  <th
                    onClick={() => setSort('batchNumber')}
                    style={{ padding: '0.65rem 1rem', fontWeight: 700, cursor: 'pointer' }}
                    title="Sort by batch number"
                  >
                    Batch number{sortKey === 'batchNumber' ? (sortDir === 'asc' ? ' 뿯▽' : ' 뿯▽') : ''}
                  </th>
                  <th
                    onClick={() => setSort('batchStatus')}
                    style={{ padding: '0.65rem 1rem', fontWeight: 700, cursor: 'pointer' }}
                    title="Sort by batch status"
                  >
                    Batch status{sortKey === 'batchStatus' ? (sortDir === 'asc' ? ' 뿯▽' : ' 뿯▽') : ''}
                  </th>
                  <th
                    onClick={() => setSort('coaStatus')}
                    style={{ padding: '0.65rem 1rem', fontWeight: 700, cursor: 'pointer' }}
                    title="Sort by COA status"
                  >
                    COA status{sortKey === 'coaStatus' ? (sortDir === 'asc' ? ' 뿯▽' : ' 뿯▽') : ''}
                  </th>
                </tr>
              </thead>
              <tbody>
                {availableYears.length === 0 && summary.totalBatchesCreation === 0 && !loadingData ? (
                  <tr>
                    <td colSpan={7} style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
                      {loadingYears
                        ? 'Loading available years'
                        : 'No manufacturing years found in requisitions or batch creation. Import data first.'}
                    </td>
                  </tr>
                ) : !activeDrill ? (
                  <tr>
                    <td colSpan={7} style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
                      Select a capsule above to load batch-wise details for {selectedYear || 'All Years'}.
                    </td>
                  </tr>
                ) : loadingData ? (
                  <tr>
                    <td colSpan={7} style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
                      Loading…
                    </td>
                  </tr>
                ) : filteredSortedRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
                      {searchQuery.trim() ? 'No rows match your search.' : 'No rows for this view.'}
                    </td>
                  </tr>
                ) : (
                  filteredSortedRows.map((row, idx) => {
                    const bb = batchBadgeStyle(row.batchStatus);
                    const cb = coaBadgeStyle(row.coaStatus);
                    const rowGreen =
                      row.batchStatus.includes('Requisition Found') &&
                      (row.coaStatus.includes('COA Found') || row.coaStatus === '-');
                    const rowRed =
                      row.batchStatus.includes('Missing') || row.coaStatus.includes('COA Missing');
                    return (
                      <tr
                        key={row.id}
                        style={{
                          borderTop: '1px solid var(--border)',
                          background: rowGreen
                            ? 'rgba(16, 185, 129, 0.06)'
                            : rowRed
                              ? 'rgba(239, 68, 68, 0.05)'
                              : 'rgba(248, 250, 252, 0.8)',
                        }}
                      >
                        <td style={{ padding: '0.6rem 1rem', color: '#64748b', fontWeight: 700 }}>
                          {idx + 1}
                        </td>
                        <td style={{ padding: '0.6rem 1rem', fontWeight: 600 }}>{row.matReqNo}</td>
                        <td style={{ padding: '0.6rem 1rem' }}>{row.materialName}</td>
                        <td
                          style={{
                            padding: '0.6rem 1rem',
                            fontFamily: 'ui-monospace, monospace',
                            fontSize: '0.8rem',
                          }}
                        >
                          {row.materialCode}
                        </td>
                        <td style={{ padding: '0.6rem 1rem', fontSize: '0.8rem', fontWeight: 600 }}>{row.batchNumber}</td>
                        <td style={{ padding: '0.6rem 1rem' }}>
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '0.25rem 0.65rem',
                              borderRadius: '999px',
                              fontWeight: 700,
                              fontSize: '0.72rem',
                              letterSpacing: '0.02em',
                              background: bb.bg,
                              color: bb.color,
                              border: `1px solid ${bb.border}`,
                            }}
                          >
                            {row.batchStatus}
                          </span>
                        </td>
                        <td style={{ padding: '0.6rem 1rem' }}>
                          {row.coaStatus === '-' ? (
                            <span style={{ color: '#94a3b8', fontWeight: 600 }}>-</span>
                          ) : (
                            <>
                              <span
                                style={{
                                  display: 'inline-block',
                                  padding: '0.25rem 0.65rem',
                                  borderRadius: '999px',
                                  fontWeight: 700,
                                  fontSize: '0.72rem',
                                  letterSpacing: '0.02em',
                                  background: cb.bg,
                                  color: cb.color,
                                  border: `1px solid ${cb.border}`,
                                }}
                              >
                                {row.coaStatus}
                              </span>
                              {row.coaMessage ? (
                                <span
                                  style={{
                                    display: 'block',
                                    fontSize: '0.68rem',
                                    color: '#b91c1c',
                                    marginTop: '0.25rem',
                                  }}
                                >
                                  {row.coaMessage}
                                </span>
                              ) : null}
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
