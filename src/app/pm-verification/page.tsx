'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';

type DrillMode =
  | 'total_batches'
  | 'requisition_found'
  | 'requisition_missing'
  | 'pm_coa_found'
  | 'pm_coa_missing';

interface VerificationRow {
  id: string;
  matReqNo: string;
  materialName: string;
  materialCode: string;
  batchNumber: string;
  requisitionStatus: 'Requisition Found' | 'Requisition Missing';
  pmCoaStatus: 'PM COA Found' | 'PM COA Missing' | '-';
}

interface ApiResponse {
  success: boolean;
  message?: string;
  year: string | null;
  drill: DrillMode | null;
  availableYears: string[];
  summary: {
    totalBatchesCreation: number;
    requisitionFoundBatches: number;
    requisitionMissingBatches: number;
    pmCoaFoundBatches: number;
    pmCoaMissingBatches: number;
  };
  rows: VerificationRow[];
}

type MfcGroupFilter = 'all' | 'main_3plus' | 'low_1_2' | 'no_0' | 'placebo_mediafill';
type FormulaBatchCategory = 'main' | 'lowBatch' | 'noBatch' | 'placebo';

function yearFromMfgDateLikeFormulaData(mfgDate: string | null | undefined): string | null {
  const parts = (mfgDate || '').split('-');
  if (parts.length !== 3) return null;
  const yy = parseInt(parts[2], 10);
  if (Number.isNaN(yy)) return null;
  return (yy < 50 ? 2000 + yy : 1900 + yy).toString();
}

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
          const cu = String(fp?.productCode || '').trim().toUpperCase();
          if (cu && !codes.includes(cu)) codes.push(cu);
        });
      }
    });
  }
  return codes;
}

function statusBadgeStyle(label: string): { bg: string; color: string; border: string } {
  if (label.includes('Found')) return { bg: 'rgba(16, 185, 129, 0.2)', color: '#047857', border: 'rgba(16,185,129,0.45)' };
  if (label.includes('Missing')) return { bg: 'rgba(239, 68, 68, 0.22)', color: '#b91c1c', border: 'rgba(239,68,68,0.45)' };
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
  maxWidth: '175px',
  boxShadow: '0 4px 14px rgba(0,0,0,0.08)',
  cursor: 'pointer',
  textAlign: 'center',
  border: '2px solid transparent',
  transition: 'transform 0.15s ease, box-shadow 0.15s ease',
};

export default function PmVerificationPage() {
  const [availableYears, setAvailableYears] = useState<string[]>([]);
  const [selectedYear, setSelectedYear] = useState<string>('');
  const [mfcGroupFilter, setMfcGroupFilter] = useState<MfcGroupFilter>('all');
  const [activeDrill, setActiveDrill] = useState<DrillMode>('total_batches');
  const [baseBatchRows, setBaseBatchRows] = useState<VerificationRow[]>([]);
  const [rows, setRows] = useState<VerificationRow[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<keyof VerificationRow>('batchNumber');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [summary, setSummary] = useState({
    totalBatchesCreation: 0,
    requisitionFoundBatches: 0,
    requisitionMissingBatches: 0,
    pmCoaFoundBatches: 0,
    pmCoaMissingBatches: 0,
  });
  const [loadingYears, setLoadingYears] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [batchCategoryMap, setBatchCategoryMap] = useState<Map<string, FormulaBatchCategory>>(new Map());

  const loadYears = useCallback(async () => {
    setLoadingYears(true);
    setError(null);
    try {
      const res = await fetch('/api/requisition/pm-verification');
      const data: ApiResponse = await res.json();
      if (!data.success) {
        setError(data.message || 'Failed to load years');
        return;
      }
      setAvailableYears(data.availableYears);
      setSelectedYear(prev => (prev && data.availableYears.includes(prev) ? prev : ''));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setLoadingYears(false);
    }
  }, []);

  // Build batchCategoryMap (same logic as Formula Data uniqueBatchReconciliation)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [batchRes, formulaRes] = await Promise.all([fetch('/api/batch?page=1&limit=10000'), fetch('/api/formula?page=1&limit=1000')]);
        const batchJson = await batchRes.json();
        const formulaJson = await formulaRes.json();
        if (cancelled) return;

        const flatBatches: any[] = [];
        if (batchJson?.success && Array.isArray(batchJson?.data)) {
          batchJson.data.forEach((record: any) => (record.batches || []).forEach((b: any) => flatBatches.push(b)));
        }

        const yearMap = new Map<string, string>();
        flatBatches.forEach(b => {
          const bn = (b.batchNumber || '').toString().trim().toUpperCase();
          if (!bn || yearMap.has(bn)) return;
          const yr = yearFromMfgDateLikeFormulaData(b.mfgDate);
          if (yr) yearMap.set(bn, yr);
        });

        const formulas: any[] = formulaJson?.success && Array.isArray(formulaJson?.data) ? formulaJson.data : [];
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
          const isPlaceboOrMediafill = productName.includes('placebo') || productName.includes('mediafill') || productName.includes('media fill');
          const batchCount = Number(f?.totalBatchCount || 0);
          if (isPlaceboOrMediafill) placeboFormulas.push(f);
          else if (batchCount === 0) noBatchFormulas.push(f);
          else if (batchCount < 3) lowBatchFormulas.push(f);
          else mainFormulas.push(f);
        });

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

        const sourceBatches = selectedYear ? flatBatches.filter(b => yearFromMfgDateLikeFormulaData(b.mfgDate) === selectedYear) : flatBatches;
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
        setBatchCategoryMap(new Map());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedYear]);

  const loadBaseRowsForSummary = useCallback(async () => {
    setError(null);
    try {
      const q = selectedYear ? `?year=${encodeURIComponent(selectedYear)}&drill=total_batches` : '?scope=all&drill=total_batches';
      const res = await fetch(`/api/requisition/pm-verification${q}`);
      const data: ApiResponse = await res.json();
      if (!data.success) throw new Error(data.message || 'Failed to load summary rows');
      setBaseBatchRows(data.rows || []);
    } catch (e) {
      setBaseBatchRows([]);
      setError(e instanceof Error ? e.message : 'Failed to load summary rows');
    }
  }, [selectedYear]);

  const loadVerification = useCallback(async () => {
    setLoadingData(true);
    setError(null);
    try {
      const q = selectedYear
        ? `?year=${encodeURIComponent(selectedYear)}&drill=${encodeURIComponent(activeDrill)}`
        : `?scope=all&drill=${encodeURIComponent(activeDrill)}`;
      const res = await fetch(`/api/requisition/pm-verification${q}`);
      const data: ApiResponse = await res.json();
      if (!data.success) {
        setError(data.message || 'Failed to load verification');
        setRows([]);
        setSummary({
          totalBatchesCreation: 0,
          requisitionFoundBatches: 0,
          requisitionMissingBatches: 0,
          pmCoaFoundBatches: 0,
          pmCoaMissingBatches: 0,
        });
        return;
      }
      setRows(data.rows || []);
      setSummary(
        data.summary || {
          totalBatchesCreation: 0,
          requisitionFoundBatches: 0,
          requisitionMissingBatches: 0,
          pmCoaFoundBatches: 0,
          pmCoaMissingBatches: 0,
        }
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
      setRows([]);
      setSummary({
        totalBatchesCreation: 0,
        requisitionFoundBatches: 0,
        requisitionMissingBatches: 0,
        pmCoaFoundBatches: 0,
        pmCoaMissingBatches: 0,
      });
    } finally {
      setLoadingData(false);
    }
  }, [selectedYear, activeDrill]);

  useEffect(() => {
    loadYears();
  }, [loadYears]);

  useEffect(() => {
    loadBaseRowsForSummary();
    loadVerification();
  }, [loadBaseRowsForSummary, loadVerification]);

  const displaySummary = useMemo(() => {
    const inGroup = (batchNumber: string): boolean => {
      if (mfcGroupFilter === 'all') return true;
      const bn = (batchNumber || '').trim().toUpperCase();
      if (!bn) return false;
      const cat = batchCategoryMap.get(bn);
      if (!cat) return false;
      if (mfcGroupFilter === 'main_3plus') return cat === 'main';
      if (mfcGroupFilter === 'low_1_2') return cat === 'lowBatch';
      if (mfcGroupFilter === 'no_0') return cat === 'noBatch';
      if (mfcGroupFilter === 'placebo_mediafill') return cat === 'placebo';
      return true;
    };

    const filtered = baseBatchRows.filter(r => inGroup(r.batchNumber));
    const total = filtered.length;
    const reqFound = filtered.filter(r => r.requisitionStatus === 'Requisition Found').length;
    const reqMissing = Math.max(0, total - reqFound);
    const coaFound = filtered.filter(r => r.pmCoaStatus === 'PM COA Found').length;
    const coaMissing = Math.max(0, reqFound - coaFound);
    return {
      totalBatchesCreation: total,
      requisitionFoundBatches: reqFound,
      requisitionMissingBatches: reqMissing,
      pmCoaFoundBatches: coaFound,
      pmCoaMissingBatches: coaMissing,
    };
  }, [baseBatchRows, mfcGroupFilter, batchCategoryMap]);

  const capsuleDef = useMemo(() => {
    return [
      { key: 'total', label: 'TOTAL BATCHES', sub: selectedYear ? `(${selectedYear})` : '(ALL YEARS)', value: displaySummary.totalBatchesCreation, drill: 'total_batches' as DrillMode, tone: 'neutral' as const },
      { key: 'req_found', label: 'REQUISITION BATCHES FOUND', sub: 'Batches in batch creation + PM requisition', value: displaySummary.requisitionFoundBatches, drill: 'requisition_found' as DrillMode, tone: 'good' as const },
      { key: 'req_missing', label: 'REQUISITION BATCHES MISSING', sub: 'Batches in batch creation only (no PM requisition)', value: displaySummary.requisitionMissingBatches, drill: 'requisition_missing' as DrillMode, tone: 'bad' as const },
      { key: 'coa_found', label: 'PM COA FOUND', sub: 'Among requisition-found batches', value: displaySummary.pmCoaFoundBatches, drill: 'pm_coa_found' as DrillMode, tone: 'good' as const },
      { key: 'coa_missing', label: 'PM COA MISSING', sub: 'Among requisition-found batches', value: displaySummary.pmCoaMissingBatches, drill: 'pm_coa_missing' as DrillMode, tone: 'bad' as const },
    ];
  }, [displaySummary, selectedYear]);

  const toggleSort = (key: keyof VerificationRow) => {
    setSortKey(prev => {
      if (prev !== key) {
        setSortDir('asc');
        return key;
      }
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
      return prev;
    });
  };

  const filteredSortedRows = useMemo(() => {
    const inGroup = (r: VerificationRow) => {
      if (mfcGroupFilter === 'all') return true;
      const bn = (r.batchNumber || '').trim().toUpperCase();
      const cat = batchCategoryMap.get(bn);
      if (!cat) return false;
      if (mfcGroupFilter === 'main_3plus') return cat === 'main';
      if (mfcGroupFilter === 'low_1_2') return cat === 'lowBatch';
      if (mfcGroupFilter === 'no_0') return cat === 'noBatch';
      if (mfcGroupFilter === 'placebo_mediafill') return cat === 'placebo';
      return true;
    };

    const q = searchQuery.trim().toLowerCase();
    const scoped = rows.filter(r => inGroup(r));
    const searched = q
      ? scoped.filter(r => {
          return (
            r.batchNumber.toLowerCase().includes(q) ||
            (r.materialCode || '').toLowerCase().includes(q) ||
            (r.materialName || '').toLowerCase().includes(q) ||
            (r.matReqNo || '').toLowerCase().includes(q) ||
            (r.requisitionStatus || '').toLowerCase().includes(q) ||
            (r.pmCoaStatus || '').toLowerCase().includes(q)
          );
        })
      : scoped;

    const sorted = [...searched].sort((a, b) => {
      const av = String(a[sortKey] ?? '');
      const bv = String(b[sortKey] ?? '');
      const cmp = av.localeCompare(bv, undefined, { numeric: true, sensitivity: 'base' });
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [rows, searchQuery, sortKey, sortDir, mfcGroupFilter, batchCategoryMap]);

  const reqOk = displaySummary.requisitionFoundBatches + displaySummary.requisitionMissingBatches === displaySummary.totalBatchesCreation;
  const coaOk = displaySummary.pmCoaFoundBatches + displaySummary.pmCoaMissingBatches === displaySummary.requisitionFoundBatches;

  const drillTitle: Record<DrillMode, string> = {
    total_batches: `All batch creation batches (${selectedYear || 'All Years'})`,
    requisition_found: 'Batches in batch creation and PM requisition',
    requisition_missing: 'Batches in batch creation only (not on PM requisition)',
    pm_coa_found: 'Requisition batches with PM COA',
    pm_coa_missing: 'Requisition batches without PM COA',
  };

  const tableAnchorRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    tableAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [activeDrill, selectedYear, mfcGroupFilter]);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--background)' }}>
      <header style={{ background: 'linear-gradient(135deg, #0f766e 0%, #115e59 100%)', padding: '1.5rem 0' }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '0 1.5rem' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1.25rem' }}>
            <div>
              <h1 style={{ fontSize: '1.65rem', fontWeight: 800, color: 'white', margin: 0, letterSpacing: '-0.02em' }}>PM verification</h1>
              <p style={{ color: 'rgba(255,255,255,0.88)', fontSize: '0.9rem', marginTop: '0.35rem', maxWidth: '560px' }}>
                Step-wise batch verification for PM materials: totals from batch creation and PM requisition coverage, then COA availability via Inward Register AR numbers. Click a capsule to open the detail table.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                <label style={{ fontSize: '0.65rem', fontWeight: 700, color: 'rgba(255,255,255,0.75)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Mfg year
                </label>
                <select
                  value={selectedYear}
                  onChange={e => {
                    setActiveDrill('total_batches');
                    setSelectedYear(e.target.value);
                  }}
                  disabled={loadingYears || availableYears.length === 0}
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
                  <option value="" style={{ background: '#134e4a', color: 'white' }}>
                    All Years
                  </option>
                  {availableYears.map(y => (
                    <option key={y} value={y} style={{ background: '#134e4a', color: 'white' }}>
                      {y}
                    </option>
                  ))}
                </select>
                <span style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>Filter by year</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                <label style={{ fontSize: '0.65rem', fontWeight: 700, color: 'rgba(255,255,255,0.75)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  MFC group
                </label>
                <select
                  value={mfcGroupFilter}
                  onChange={e => setMfcGroupFilter(e.target.value as MfcGroupFilter)}
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
                <span style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>Filter table by MFC group</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: '1280px', margin: '0 auto', padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.8rem' }}>
          <Link
            href="/"
            style={{
              textDecoration: 'none',
              color: '#0f172a',
              background: 'white',
              border: '1px solid #e2e8f0',
              padding: '0.6rem 0.95rem',
              borderRadius: '12px',
              fontWeight: 800,
              boxShadow: '0 6px 20px rgba(0,0,0,0.06)',
            }}
          >
            Back to Home
          </Link>
        </div>

        {error && (
          <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', borderRadius: '12px', background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontWeight: 700 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap' }}>
          {capsuleDef.map(c => {
            const toneStyle =
              c.tone === 'good'
                ? { bg: 'rgba(16, 185, 129, 0.10)', border: 'rgba(16,185,129,0.45)', color: '#047857' }
                : c.tone === 'bad'
                  ? { bg: 'rgba(239, 68, 68, 0.10)', border: 'rgba(239,68,68,0.45)', color: '#b91c1c' }
                  : { bg: 'rgba(59, 130, 246, 0.08)', border: 'rgba(59,130,246,0.45)', color: '#1d4ed8' };

            return (
              <div
                key={c.key}
                onClick={() => setActiveDrill(c.drill)}
                style={{
                  ...capsuleBase,
                  background: toneStyle.bg,
                  borderColor: activeDrill === c.drill ? '#0f172a' : toneStyle.border,
                  transform: activeDrill === c.drill ? 'translateY(-2px)' : undefined,
                }}
                title="Click to drill down"
              >
                <div style={{ fontSize: '1.2rem', fontWeight: 900, color: toneStyle.color }}>{loadingData ? '…' : c.value.toLocaleString()}</div>
                <div style={{ fontSize: '0.72rem', fontWeight: 900, letterSpacing: '0.03em', color: '#0f172a' }}>
                  {c.label} <span style={{ color: '#64748b', fontWeight: 800 }}>{c.sub}</span>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: '0.75rem', padding: '0.65rem 0.9rem', borderRadius: '12px', border: '1px solid #e2e8f0', background: 'white', color: '#334155' }}>
          <div style={{ fontWeight: 800 }}>
            Requisition check: Found ({displaySummary.requisitionFoundBatches.toLocaleString()}) + Missing ({displaySummary.requisitionMissingBatches.toLocaleString()}) = Total ({displaySummary.totalBatchesCreation.toLocaleString()})
            {reqOk ? ' ✓' : ' (mismatch)'}
          </div>
          <div style={{ marginTop: '0.2rem', fontWeight: 800 }}>
            PM COA check: COA Found ({displaySummary.pmCoaFoundBatches.toLocaleString()}) + COA Missing ({displaySummary.pmCoaMissingBatches.toLocaleString()}) = Requisition Found ({displaySummary.requisitionFoundBatches.toLocaleString()})
            {coaOk ? ' ✓' : ' (mismatch)'}
          </div>
        </div>

        <div ref={tableAnchorRef} />

        <div style={{ marginTop: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem', flexWrap: 'wrap' }}>
            <div style={{ fontWeight: 900, color: '#0f172a', fontSize: '1.05rem' }}>{drillTitle[activeDrill]}</div>
            <div style={{ color: '#64748b', fontWeight: 700, fontSize: '0.85rem' }}>{`${filteredSortedRows.length.toLocaleString()} batches`}</div>
          </div>
          <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search (batch, item, req...)"
              style={{ padding: '0.6rem 0.75rem', borderRadius: '10px', border: '1px solid #e2e8f0', minWidth: '280px' }}
            />
            <button
              onClick={() => setSearchQuery('')}
              style={{ padding: '0.6rem 0.85rem', borderRadius: '10px', border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', fontWeight: 800, color: '#0f172a' }}
              title="Clear search"
            >
              Clear
            </button>
          </div>
        </div>

        <div style={{ marginTop: '0.75rem', border: '1px solid #e2e8f0', borderRadius: '14px', overflow: 'hidden', background: 'white' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={{ padding: '0.85rem 0.9rem', textAlign: 'left', color: '#64748b', fontWeight: 900 }}>SR</th>
                <th style={{ padding: '0.85rem 0.9rem', textAlign: 'left', color: '#0f172a', fontWeight: 900 }}>Requisition No</th>
                <th onClick={() => toggleSort('batchNumber')} style={{ padding: '0.85rem 0.9rem', textAlign: 'left', cursor: 'pointer', color: '#0f172a', fontWeight: 900 }}>
                  Batch {sortKey === 'batchNumber' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th onClick={() => toggleSort('materialCode')} style={{ padding: '0.85rem 0.9rem', textAlign: 'left', cursor: 'pointer', color: '#0f172a', fontWeight: 900 }}>
                  Material Code {sortKey === 'materialCode' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th onClick={() => toggleSort('materialName')} style={{ padding: '0.85rem 0.9rem', textAlign: 'left', cursor: 'pointer', color: '#0f172a', fontWeight: 900 }}>
                  Material Name {sortKey === 'materialName' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th onClick={() => toggleSort('requisitionStatus')} style={{ padding: '0.85rem 0.9rem', textAlign: 'left', cursor: 'pointer', color: '#0f172a', fontWeight: 900 }}>
                  Batch Status {sortKey === 'requisitionStatus' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                </th>
                <th onClick={() => toggleSort('pmCoaStatus')} style={{ padding: '0.85rem 0.9rem', textAlign: 'left', cursor: 'pointer', color: '#0f172a', fontWeight: 900 }}>
                  COA Status {sortKey === 'pmCoaStatus' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                </th>
              </tr>
            </thead>
            <tbody>
              {loadingData ? (
                <tr>
                  <td colSpan={8} style={{ padding: '1.25rem', textAlign: 'center', color: '#64748b' }}>
                    Loading…
                  </td>
                </tr>
              ) : filteredSortedRows.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: '1.25rem', textAlign: 'center', color: '#64748b' }}>
                    No data
                  </td>
                </tr>
              ) : (
                filteredSortedRows.map((r, idx) => {
                  const sReq = statusBadgeStyle(r.requisitionStatus);
                  const sCoa = statusBadgeStyle(r.pmCoaStatus);
                  return (
                    <tr key={`${r.id}-${idx}`} style={{ borderTop: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '0.75rem 0.9rem', color: '#64748b', fontWeight: 800 }}>{idx + 1}</td>
                      <td style={{ padding: '0.75rem 0.9rem', fontFamily: 'monospace', color: '#334155', fontWeight: 800 }}>{r.matReqNo || '-'}</td>
                      <td style={{ padding: '0.75rem 0.9rem', fontFamily: 'monospace', fontWeight: 900 }}>{r.batchNumber}</td>
                      <td style={{ padding: '0.75rem 0.9rem', fontFamily: 'monospace' }}>{r.materialCode}</td>
                      <td style={{ padding: '0.75rem 0.9rem' }}>{r.materialName}</td>
                      <td style={{ padding: '0.75rem 0.9rem' }}>
                        <span style={{ padding: '0.3rem 0.65rem', borderRadius: '999px', border: `1px solid ${sReq.border}`, background: sReq.bg, color: sReq.color, fontWeight: 900, fontSize: '0.78rem' }}>
                          {r.requisitionStatus}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 0.9rem' }}>
                        <span style={{ padding: '0.3rem 0.65rem', borderRadius: '999px', border: `1px solid ${sCoa.border}`, background: sCoa.bg, color: sCoa.color, fontWeight: 900, fontSize: '0.78rem' }}>
                          {r.pmCoaStatus}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}

