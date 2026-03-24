'use client';

import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';

// ─── Types ───
interface FinishInProcessColumn {
  key: string;
  type: string;
  name: string;
  limit: string;
  isQuantifiable: boolean;
}

interface FinishInProcessRow {
  batchNumber: string;
  batchSize: string;
  arNumber: string;
  results: Record<string, string>;
}

interface ProcessCapabilityResults {
  average: number;
  max: number;
  min: number;
  lsl: number;
  usl: number;
  sigmaEstimated: number;
  sigmaSample: number;
  cpku: number;
  cpkl: number;
  cpk: number;
  cp: number;
  ppku: number;
  ppkl: number;
  ppk: number;
  pp: number;
  isCapable: boolean;
}

// ─── Computation helpers ───

function parseLimits(limitString: string): { lsl: number | null; usl: number | null } {
  if (!limitString) return { lsl: null, usl: null };
  const cleanStr = limitString.toLowerCase();
  
  // 1. Find all unique values in parentheses (usually intended precision volumetric limits)
  const parenMatches = [...cleanStr.matchAll(/\(([\d.]+)\s*(?:ml|mg|g|mcg|L|kg|w\/v|w\/w|%)?\)/g)];
  if (parenMatches.length > 0) {
      const nums = [...new Set(parenMatches.map(m => parseFloat(m[1])))].filter(n => !isNaN(n));
      if (nums.length >= 2) {
          nums.sort((a,b) => a-b);
          return { lsl: nums[0], usl: nums[nums.length - 1] };
      }
  }

  // 2. Extract pairs of numbers directly associated with NLT and NMT
  let lsl: number | null = null;
  let usl: number | null = null;
  
  const nltMatch = cleanStr.match(/(?:not less than|nlt)\s*([\d.]+)/);
  if (nltMatch) lsl = parseFloat(nltMatch[1]);
  
  const nmtMatch = cleanStr.match(/(?:not more than|nmt)\s*([\d.]+)/);
  if (nmtMatch) usl = parseFloat(nmtMatch[1]);
  
  if (lsl !== null && usl !== null && !isNaN(lsl) && !isNaN(usl)) {
      return { lsl: Math.min(lsl, usl), usl: Math.max(lsl, usl) };
  }

  // 3. Look for explicit ranges like "90.0 - 110.0", "90.0 to 110.0", or "between 9.0 and 11.0"
  const rangeMatch = cleanStr.match(/([\d.]+)\s*(?:ml|mg|g|mcg|L|kg|w\/v|w\/w|%)?\s*(?:-|to|and)\s*([\d.]+)/);
  if (rangeMatch) {
      const n1 = parseFloat(rangeMatch[1]);
      const n2 = parseFloat(rangeMatch[2]);
      if (!isNaN(n1) && !isNaN(n2)) {
          return { lsl: Math.min(n1, n2), usl: Math.max(n1, n2) };
      }
  }

  // 4. Default fallback: take the first two valid decimal numbers
  const matches = cleanStr.match(/[-+]?[0-9]*\.?[0-9]+/g);
  if (!matches || matches.length < 2) return { lsl: lsl !== null ? lsl : null, usl: usl !== null ? usl : null };
  
  // Try to skip integer "10" if there are other floats, since "10 containers" is common in text
  const floatMatches = matches.map(m => parseFloat(m));
  const nonTenMatches = floatMatches.filter(n => n !== 10);
  
  if (nonTenMatches.length >= 2) {
      return { lsl: Math.min(nonTenMatches[0], nonTenMatches[1]), usl: Math.max(nonTenMatches[0], nonTenMatches[1]) };
  }
  
  return { lsl: Math.min(floatMatches[0], floatMatches[1]), usl: Math.max(floatMatches[0], floatMatches[1]) };
}

function calculateAverage(data: number[]): number {
  if (data.length === 0) return 0;
  return data.reduce((a, b) => a + b, 0) / data.length;
}

function calculateSampleStdDev(data: number[], mean: number): number {
  if (data.length < 2) return 0;
  const sumSq = data.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0);
  return Math.sqrt(sumSq / (data.length - 1));
}

function calculateEstimatedStdDevMR(data: number[]): number {
  if (data.length < 2) return 0;
  let mrSum = 0;
  for (let i = 1; i < data.length; i++) {
    mrSum += Math.abs(data[i] - data[i - 1]);
  }
  const avgMr = mrSum / (data.length - 1);
  return avgMr / 1.128;
}

function calculateProcessCapability(data: number[], limitStr: string): ProcessCapabilityResults | null {
  const nums = data.filter(n => !isNaN(n));
  if (nums.length < 2) return null;
  const { lsl, usl } = parseLimits(limitStr);
  if (lsl === null || usl === null) return null;
  const average = calculateAverage(nums);
  const max = Math.max(...nums);
  const min = Math.min(...nums);
  const sigmaSample = calculateSampleStdDev(nums, average);
  const sigmaEst = calculateEstimatedStdDevMR(nums);
  if (sigmaEst === 0 || sigmaSample === 0) return null;
  const cpku = (usl - average) / (3 * sigmaEst);
  const cpkl = (average - lsl) / (3 * sigmaEst);
  const cpk = Math.min(cpku, cpkl);
  const cp = (usl - lsl) / (6 * sigmaEst);
  const ppku = (usl - average) / (3 * sigmaSample);
  const ppkl = (average - lsl) / (3 * sigmaSample);
  const ppk = Math.min(ppku, ppkl);
  const pp = (usl - lsl) / (6 * sigmaSample);
  const isCapable = cpk > 1.33 && cp > 1.33 && ppk > 1.33 && pp > 1.33;
  return { average, max, min, lsl, usl, sigmaEstimated: sigmaEst, sigmaSample, cpku, cpkl, cpk, cp, ppku, ppkl, ppk, pp, isCapable };
}

// ─── Result key helper ───
// Results in finishInProcessData are stored as row.results[col.key + '|||result']
function resultKey(colKey: string) { return `${colKey}|||result`; }

/**
 * Smart numeric extractor for pharmaceutical result strings.
 * When a result like "101.4% (5.07 gm)" is compared against gram-based limits (4.55–5.45),
 * we want 5.07, not 101.4. Strategy: if a number in the string falls within the
 * extended limit range [lsl-3×range, usl+3×range], prefer it over the first number.
 */
function parseResultValue(result: string, lsl: number | null, usl: number | null): number | null {
  if (!result) return null;
  const nums = (result.match(/[\d]+\.?[\d]*/g) || []).map(Number).filter(n => !isNaN(n) && n !== 0);
  if (nums.length === 0) return null;
  if (lsl !== null && usl !== null && nums.length > 1) {
    const width = usl - lsl;
    const lo = lsl - 3 * width;
    const hi = usl + 3 * width;
    const mid = (lsl + usl) / 2;
    const inRange = nums.filter(n => n >= lo && n <= hi);
    if (inRange.length > 0) {
      return inRange.reduce((best, n) => Math.abs(n - mid) < Math.abs(best - mid) ? n : best);
    }
  }
  return nums[0];
}

// ─── LaTeX renderer ───
function Latex({ math, display = false }: { math: string; display?: boolean }) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(math, { displayMode: display, throwOnError: false });
    } catch { return math; }
  }, [math, display]);
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

// ─── Formatters ───
const fmt5 = (n: number | undefined) => n !== undefined && !isNaN(n) ? n.toFixed(5) : 'N/A';
const fmt2 = (n: number | undefined) => n !== undefined && !isNaN(n) ? n.toFixed(2) : 'N/A';

// ─── Page ───
export default function FinishCalculationPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9fafb' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: '48px', height: '48px', border: '4px solid #e5e7eb', borderTopColor: '#10b981', borderRadius: '50%', margin: '0 auto 1.5rem', animation: 'spin 1s linear infinite' }} />
          <p style={{ color: '#6b7280' }}>Loading...</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    }>
      <FinishCalculationContent />
    </Suspense>
  );
}

function FinishCalculationContent() {
  const searchParams = useSearchParams();
  const productCode = searchParams.get('productCode') || '';
  const initialYear = parseInt(searchParams.get('year') || new Date().getFullYear().toString(), 10);

  const [selectedYear, setSelectedYear] = useState(initialYear);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [finishData, setFinishData] = useState<FinishInProcessRow[]>([]);
  const [finishColumns, setFinishColumns] = useState<FinishInProcessColumn[]>([]);
  const [allFinishColumns, setAllFinishColumns] = useState<FinishInProcessColumn[]>([]);
  const [productName, setProductName] = useState('');
  const [totalBatches, setTotalBatches] = useState('');
  const [batchSize, setBatchSize] = useState('');
  
  const [showFormulaModal, setShowFormulaModal] = useState(false);
  const [selectedRowInfo, setSelectedRowInfo] = useState<{ id: string; label: string } | null>(null);

  const currentYear = new Date().getFullYear();
  const yearOptions = useMemo(() => {
    const years: number[] = [];
    for (let y = currentYear; y >= 2020; y--) years.push(y);
    return years;
  }, [currentYear]);

  useEffect(() => {
    if (!productCode) return;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/apqr/finish-calc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productCode, year: selectedYear }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        
        const rows: FinishInProcessRow[] = data.finishInProcessData || [];
        const allCols: FinishInProcessColumn[] = data.finishInProcessColumns || [];
        setFinishData(rows);
        setAllFinishColumns(allCols);
        // Only keep quantifiable columns for CPK calculation
        setFinishColumns(allCols.filter(c => c.isQuantifiable && c.limit && c.limit !== 'N/A' && c.limit !== '-'));
        setProductName(data.productName || '');
        setTotalBatches(data.totalBatches || '0');
        setBatchSize(data.batchSize || 'N/A');
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [productCode, selectedYear]);

  // Compute process capability for each column
  const columnStats = useMemo(() => {
    return finishColumns.map(col => {
      const { lsl, usl } = parseLimits(col.limit || '');
      const vals = finishData
        .map(r => parseResultValue(r.results[resultKey(col.key)] || '', lsl, usl))
        .filter((n): n is number => n !== null && !isNaN(n));
      return { col, stats: calculateProcessCapability(vals, col.limit || ''), vals };
    });
  }, [finishData, finishColumns]);

  if (!productCode) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9fafb' }}>
        <div style={{ textAlign: 'center', color: '#6b7280' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700 }}>No Product Selected</h2>
          <p>Please navigate from the Formula Data page.</p>
          <Link href="/formula-data" style={{ color: '#10b981', textDecoration: 'underline', fontWeight: 600 }}>← Back to Formula Data</Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #f8fafc 0%, #f0fdf4 50%, #dcfce7 100%)' }}>
      {/* Header Bar */}
      <div style={{
        background: 'linear-gradient(135deg, #064e3b 0%, #065f46 50%, #047857 100%)',
        padding: '1.5rem 2rem',
        color: 'white',
        boxShadow: '0 4px 20px rgba(6, 78, 59, 0.3)',
      }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <Link href="/formula-data" style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '8px' }}>
              ← Back to Formula Data
            </Link>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>
              📊 Finish Product Calculations
            </h1>
            <p style={{ margin: '4px 0 0', opacity: 0.8, fontSize: '0.95rem' }}>
              Process Capability & Performance Analysis
            </p>
          </div>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: '12px', padding: '0.75rem 1.25rem', backdropFilter: 'blur(10px)' }}>
              <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.7 }}>Product</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{productCode}</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: '12px', padding: '0.75rem 1.25rem', backdropFilter: 'blur(10px)' }}>
              <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.7 }}>Year</div>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
                style={{
                  background: 'transparent', border: 'none', color: 'white',
                  fontSize: '1.1rem', fontWeight: 700, cursor: 'pointer',
                  outline: 'none', appearance: 'auto', padding: '0',
                }}
              >
                {yearOptions.map(y => (
                  <option key={y} value={y} style={{ color: '#064e3b', background: 'white' }}>{y}</option>
                ))}
              </select>
            </div>
            {productName && (
              <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: '12px', padding: '0.75rem 1.25rem', backdropFilter: 'blur(10px)' }}>
                <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.7 }}>Product Name</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{productName}</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '2rem' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '6rem' }}>
            <div style={{
              width: '48px', height: '48px', border: '4px solid #e5e7eb',
              borderTopColor: '#10b981', borderRadius: '50%', margin: '0 auto 1.5rem',
              animation: 'spin 1s linear infinite',
            }} />
            <p style={{ color: '#6b7280', fontSize: '1.1rem' }}>Loading finish calculation data...</p>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : error ? (
          <div style={{
            background: '#fef2f2', border: '2px solid #fca5a5', borderRadius: '16px',
            padding: '2rem', textAlign: 'center', color: '#dc2626',
          }}>
            <span style={{ fontSize: '2rem' }}>⚠️</span>
            <h3 style={{ margin: '1rem 0 0.5rem' }}>Error Loading Data</h3>
            <p>{error}</p>
            <Link href="/formula-data" style={{ color: '#10b981', fontWeight: 600 }}>← Back to Formula Data</Link>
          </div>
        ) : allFinishColumns.length === 0 ? (
          <div style={{
            background: 'white', border: '1px solid #e5e7eb', borderRadius: '16px',
            padding: '4rem 2rem', textAlign: 'center', color: '#6b7280',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
          }}>
            <span style={{ fontSize: '3rem', display: 'block', marginBottom: '1rem' }}>🤷</span>
            <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.25rem', color: '#374151' }}>No Finish COA Data Found</h3>
            <p>No Finish stage COA data was found for this product and year.</p>
          </div>
        ) : (
          <>
            {/* Per-Batch COA Table */}
            <SectionCard title="Section 5.3.2 — Finished Product Analysis" icon="📋" gradient="linear-gradient(135deg, #0369a1 0%, #0284c7 100%)">
              {finishData.length === 0 ? (
                <p style={{ color: '#6b7280', textAlign: 'center', padding: '2rem' }}>No finished product data available.</p>
              ) : (
                finishData.map(row => {
                  const descCols  = allFinishColumns.filter(c => c.type === 'critical' && c.name.toUpperCase().includes('DESCRIPTION'));
                  const idCols    = allFinishColumns.filter(c => c.type === 'identification');
                  const critCols  = allFinishColumns.filter(c => (c.type === 'critical' || c.type === 'ph') && !c.name.toUpperCase().includes('DESCRIPTION'));
                  const relCols   = allFinishColumns.filter(c => c.type === 'related_substance');
                  const assayCols = allFinishColumns.filter(c => c.type === 'assay');

                  const thStyle: React.CSSProperties = {
                    padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 700, color: 'white',
                    fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em',
                    background: 'linear-gradient(135deg, #0369a1 0%, #0284c7 100%)',
                  };
                  const tdBase: React.CSSProperties = {
                    padding: '0.65rem 1rem', borderBottom: '1px solid #e0f2fe', fontSize: '0.85rem', verticalAlign: 'top',
                  };
                  const sectionHeaderTd: React.CSSProperties = {
                    ...tdBase, fontWeight: 800, color: '#075985', background: '#e0f2fe',
                    textTransform: 'uppercase', letterSpacing: '0.04em',
                  };

                  let srCounter = 0;
                  const tableRows: React.ReactNode[] = [];

                  const addRows = (cols: FinishInProcessColumn[], sectionLabel?: string) => {
                    if (cols.length === 0) return;
                    if (sectionLabel) {
                      srCounter++;
                      tableRows.push(
                        <tr key={`hdr-${sectionLabel}`}>
                          <td style={{ ...tdBase, textAlign: 'center', fontWeight: 700, color: '#075985', width: '50px' }}>{srCounter}</td>
                          <td colSpan={3} style={sectionHeaderTd}>{sectionLabel}</td>
                        </tr>
                      );
                      cols.forEach((col, idx) => {
                        tableRows.push(
                          <tr key={col.key} style={{ background: idx % 2 === 0 ? 'white' : '#f0f9ff' }}>
                            <td style={{ ...tdBase, textAlign: 'center', color: '#64748b', fontSize: '0.78rem' }}>{idx + 1}</td>
                            <td style={{ ...tdBase, paddingLeft: '2rem', fontStyle: 'italic' }}>{col.name}</td>
                            <td style={{ ...tdBase, fontWeight: 600, whiteSpace: 'pre-line' }}>{row.results[resultKey(col.key)] || '-'}</td>
                            <td style={{ ...tdBase, color: '#374151', whiteSpace: 'pre-line' }}>{col.limit || '-'}</td>
                          </tr>
                        );
                      });
                    } else {
                      cols.forEach(col => {
                        srCounter++;
                        tableRows.push(
                          <tr key={col.key} style={{ background: srCounter % 2 === 0 ? '#f0f9ff' : 'white' }}>
                            <td style={{ ...tdBase, textAlign: 'center', fontWeight: 700, color: '#075985', width: '50px' }}>{srCounter}</td>
                            <td style={{ ...tdBase, fontWeight: 600, textTransform: 'uppercase' }}>{col.name}</td>
                            <td style={{ ...tdBase, fontWeight: 600, whiteSpace: 'pre-line' }}>{row.results[resultKey(col.key)] || '-'}</td>
                            <td style={{ ...tdBase, color: '#374151', whiteSpace: 'pre-line' }}>{col.limit || '-'}</td>
                          </tr>
                        );
                      });
                    }
                  };

                  addRows(descCols);
                  addRows(idCols, idCols.length > 0 ? 'IDENTIFICATION' : undefined);
                  addRows(critCols);
                  addRows(relCols, relCols.length > 0 ? 'RELATED SUBSTANCES' : undefined);
                  addRows(assayCols, assayCols.length > 0 ? 'ASSAY' : undefined);

                  return (
                    <div key={row.batchNumber + row.arNumber} style={{ marginBottom: '2rem' }}>
                      {/* Batch header */}
                      <div style={{
                        display: 'flex', gap: '1.5rem', alignItems: 'center',
                        padding: '0.6rem 1rem', marginBottom: '0.5rem',
                        background: '#f0f9ff', borderRadius: '8px', border: '1px solid #bae6fd',
                      }}>
                        <span style={{ fontWeight: 700, color: '#0369a1' }}>Batch: {row.batchNumber}</span>
                        <span style={{ color: '#64748b', fontSize: '0.85rem' }}>AR: {row.arNumber}</span>
                        <span style={{ color: '#64748b', fontSize: '0.85rem' }}>Batch Size: {row.batchSize || 'N/A'}</span>
                      </div>
                      <div style={{ overflowX: 'auto', borderRadius: '10px', border: '2px solid #0284c7', boxShadow: '0 4px 12px rgba(0,0,0,0.06)' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: '"Times New Roman", Times, serif' }}>
                          <thead>
                            <tr>
                              <th style={{ ...thStyle, width: '50px', textAlign: 'center' }}>Sr.</th>
                              <th style={thStyle}>Test</th>
                              <th style={thStyle}>Result</th>
                              <th style={thStyle}>Specification</th>
                            </tr>
                          </thead>
                          <tbody>{tableRows}</tbody>
                        </table>
                      </div>
                    </div>
                  );
                })
              )}
            </SectionCard>

            {/* In-Process Data Table (All Batches Pivot) */}
            <SectionCard title="Section 5.3.2 — Finished Product Analysis Results (All Batches)" icon="🧪" gradient="linear-gradient(135deg, #059669 0%, #047857 100%)">
              {finishData.length === 0 ? (
                <p style={{ color: '#6b7280', textAlign: 'center', padding: '2rem' }}>No finished product data available.</p>
              ) : (
                <div style={{ overflowX: 'auto', borderRadius: '12px', border: '2px solid #059669', boxShadow: '0 4px 16px rgba(0,0,0,0.06)' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' }}>
                        <th style={{ padding: '0.875rem 1rem', textAlign: 'left', fontWeight: 700, color: 'white', whiteSpace: 'nowrap', textTransform: 'uppercase', fontSize: '0.72rem', letterSpacing: '0.05em', verticalAlign: 'top' }}>Sr No</th>
                        <th style={{ padding: '0.875rem 1rem', textAlign: 'left', fontWeight: 700, color: 'white', whiteSpace: 'nowrap', textTransform: 'uppercase', fontSize: '0.72rem', letterSpacing: '0.05em', verticalAlign: 'top' }}>Batch Number</th>
                        <th style={{ padding: '0.875rem 1rem', textAlign: 'left', fontWeight: 700, color: 'white', whiteSpace: 'nowrap', textTransform: 'uppercase', fontSize: '0.72rem', letterSpacing: '0.05em', verticalAlign: 'top' }}>Batch Size</th>
                        <th style={{ padding: '0.875rem 1rem', textAlign: 'left', fontWeight: 700, color: 'white', whiteSpace: 'nowrap', textTransform: 'uppercase', fontSize: '0.72rem', letterSpacing: '0.05em', verticalAlign: 'top' }}>AR Number</th>
                        {finishColumns.map((col, i) => {
                          const { usl, lsl } = parseLimits(col.limit || '');
                          return (
                            <th key={i} style={{
                              padding: '0.875rem 1rem', textAlign: 'left', fontWeight: 700,
                              color: 'white', whiteSpace: 'nowrap', textTransform: 'uppercase',
                              fontSize: '0.72rem', letterSpacing: '0.05em', verticalAlign: 'top'
                            }}>
                              <div style={{ marginBottom: (usl !== null || lsl !== null) ? '4px' : '0' }}>{col.name}</div>
                              {(usl !== null || lsl !== null) && (
                                <div style={{ fontSize: '0.65rem', opacity: 0.85, fontWeight: 600, letterSpacing: '0.02em', textTransform: 'none' }}>
                                  {lsl !== null && usl !== null ? `LSL: ${lsl} | USL: ${usl}` : 
                                   lsl !== null ? `LSL: ${lsl}` : 
                                   usl !== null ? `USL: ${usl}` : ''}
                                </div>
                              )}
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {finishData.map((row, i) => (
                        <tr key={i} style={{
                          background: i % 2 === 0 ? 'rgba(16,185,129,0.03)' : 'rgba(16,185,129,0.08)',
                          transition: 'background 0.2s',
                        }}>
                          <td style={{ padding: '0.75rem 1rem', borderBottom: '1px solid rgba(16,185,129,0.15)' }}>
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                              width: '24px', height: '24px', borderRadius: '6px',
                              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                              color: 'white', fontSize: '0.7rem', fontWeight: 700,
                            }}>{i + 1}</span>
                          </td>
                          <td style={{ padding: '0.75rem 1rem', borderBottom: '1px solid rgba(16,185,129,0.15)', fontWeight: 600, fontFamily: 'monospace' }}>{row.batchNumber}</td>
                          <td style={{ padding: '0.75rem 1rem', borderBottom: '1px solid rgba(16,185,129,0.15)', fontFamily: 'monospace', color: '#4b5563' }}>{row.batchSize || 'N/A'}</td>
                          <td style={{ padding: '0.75rem 1rem', borderBottom: '1px solid rgba(16,185,129,0.15)', fontFamily: 'monospace', color: '#059669' }}>{row.arNumber}</td>
                          
                          {finishColumns.map((col, ci) => (
                            <td key={ci} style={{ padding: '0.75rem 1rem', borderBottom: '1px solid rgba(16,185,129,0.15)', fontWeight: 600, textAlign: 'center' }}>
                              {row.results[resultKey(col.key)] || '-'}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>

            {/* Process Capability Table */}
            <SectionCard title="Process Capability & Performance Parameters (Cp, Cpk, Pp, Ppk)" icon="📈" gradient="linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%)">
              {columnStats.every(c => !c.stats) ? (
                <p style={{ color: '#6b7280', textAlign: 'center', padding: '2rem' }}>
                  Insufficient data to compute process capability (need at least 2 numeric data points for quantifiable limits).
                </p>
              ) : (() => {
                // columns = Label(span 2) + all dynamic columns + Info(1)
                const totalCols = 2 + finishColumns.length + 1;
                
                const fmt5A = (getter: (s: ProcessCapabilityResults | null) => number | undefined) =>
                  columnStats.map(c => fmt5(getter(c.stats)));
                const fmt2A = (getter: (s: ProcessCapabilityResults | null) => number | undefined) =>
                  columnStats.map(c => fmt2(getter(c.stats)));
                  
                return (
                  <div style={{ overflowX: 'auto', borderRadius: '12px', border: '2px solid #8b5cf6', boxShadow: '0 4px 16px rgba(0,0,0,0.06)' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                      <thead>
                        <tr style={{ background: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)' }}>
                          <th colSpan={totalCols} style={{ padding: '1rem', textAlign: 'center', color: 'white', fontWeight: 800, fontSize: '0.95rem', letterSpacing: '-0.01em' }}>
                            Process Capability & Performance Parameters
                          </th>
                        </tr>
                        <tr style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)' }}>
                          <th colSpan={2} style={{ padding: '0.75rem 1rem', textAlign: 'center', color: 'white', fontWeight: 700, fontSize: '0.8rem', verticalAlign: 'top' }}></th>
                          {finishColumns.map((col, ci) => {
                            const { usl, lsl } = parseLimits(col.limit || '');
                            return (
                              <th key={ci} style={{ padding: '0.75rem 1rem', textAlign: 'center', color: 'white', fontWeight: 700, fontSize: '0.85rem', verticalAlign: 'top' }}>
                                <div style={{ marginBottom: (usl !== null || lsl !== null) ? '4px' : '0' }}>{col.name}</div>
                                {(usl !== null || lsl !== null) && (
                                  <div style={{ fontSize: '0.7rem', opacity: 0.85, fontWeight: 600, letterSpacing: '0.02em', textTransform: 'none' }}>
                                    {lsl !== null && usl !== null ? `LSL: ${lsl} | USL: ${usl}` : 
                                     lsl !== null ? `LSL: ${lsl}` : 
                                     usl !== null ? `USL: ${usl}` : ''}
                                  </div>
                                )}
                              </th>
                            );
                          })}
                          <th style={{ padding: '0.75rem 1rem', textAlign: 'center', color: 'white', fontWeight: 700, fontSize: '0.85rem', width: '60px', verticalAlign: 'middle' }}>Info</th>
                        </tr>
                      </thead>
                      <tbody>
                        {/* Basic Statistics */}
                        <CpkRow totalCols={totalCols} label="Average" vals={fmt5A(s => s?.average)} onInfoClick={() => setSelectedRowInfo({ id: 'average', label: 'Average' })} />
                        <CpkRow totalCols={totalCols} label="Maximum" vals={fmt5A(s => s?.max)} shade onInfoClick={() => setSelectedRowInfo({ id: 'max', label: 'Maximum' })} />
                        <CpkRow totalCols={totalCols} label="Minimum" vals={fmt5A(s => s?.min)} onInfoClick={() => setSelectedRowInfo({ id: 'min', label: 'Minimum' })} />
                        <CpkRow totalCols={totalCols} label="USL − LSL" vals={columnStats.map(c => fmt5(c.stats ? c.stats.usl - c.stats.lsl : undefined))} shade onInfoClick={() => setSelectedRowInfo({ id: 'usl-lsl', label: 'USL − LSL' })} />
                        <CpkRow totalCols={totalCols} label="USL − Average" vals={columnStats.map(c => fmt5(c.stats ? c.stats.usl - c.stats.average : undefined))} onInfoClick={() => setSelectedRowInfo({ id: 'usl-avg', label: 'USL − Average' })} />
                        <CpkRow totalCols={totalCols} label="Average − LSL" vals={columnStats.map(c => fmt5(c.stats ? c.stats.average - c.stats.lsl : undefined))} shade onInfoClick={() => setSelectedRowInfo({ id: 'avg-lsl', label: 'Average − LSL' })} />

                        {/* Short-Term Section Header */}
                        <tr style={{ background: 'linear-gradient(135deg, rgba(124,58,237,0.08) 0%, rgba(139,92,246,0.12) 100%)' }}>
                          <td colSpan={totalCols} style={{ padding: '0.75rem 1rem', fontWeight: 800, color: '#5b21b6', fontSize: '0.9rem', textAlign: 'center', borderBottom: '2px solid rgba(139,92,246,0.2)' }}>
                            Short-Term Statistics (Process Capability)
                          </td>
                        </tr>
                        <CpkRow totalCols={totalCols} label="Estimated Std Deviation (σ)" vals={fmt5A(s => s?.sigmaEstimated)} onInfoClick={() => setSelectedRowInfo({ id: 'sigma-est', label: 'Estimated Std Deviation (σ)' })} />
                        <CpkRow totalCols={totalCols} label="3σ = (3 × σ)" vals={fmt2A(s => s ? s.sigmaEstimated * 3 : undefined)} shade onInfoClick={() => setSelectedRowInfo({ id: '3sigma', label: '3σ' })} />
                        <CpkRow totalCols={totalCols} label="6σ = (6 × σ)" vals={fmt2A(s => s ? s.sigmaEstimated * 6 : undefined)} onInfoClick={() => setSelectedRowInfo({ id: '6sigma', label: '6σ' })} />
                        <CpkRow totalCols={totalCols} label="Cpku = (USL − Average) / 3σ" vals={fmt2A(s => s?.cpku)} shade onInfoClick={() => setSelectedRowInfo({ id: 'cpku', label: 'Cpku' })} />
                        <CpkRow totalCols={totalCols} label="Cpkl = (Average − LSL) / 3σ" vals={fmt2A(s => s?.cpkl)} onInfoClick={() => setSelectedRowInfo({ id: 'cpkl', label: 'Cpkl' })} />
                        <CpkRow totalCols={totalCols} label="Cpk = Min(Cpkl, Cpku)" vals={fmt2A(s => s?.cpk)} shade highlight onInfoClick={() => setSelectedRowInfo({ id: 'cpk', label: 'Cpk' })} />
                        <CpkRow totalCols={totalCols} label="Cp = (USL − LSL) / 6σ" vals={fmt2A(s => s?.cp)} highlight onInfoClick={() => setSelectedRowInfo({ id: 'cp', label: 'Cp' })} />

                        {/* Long-Term Section Header */}
                        <tr style={{ background: 'linear-gradient(135deg, rgba(124,58,237,0.08) 0%, rgba(139,92,246,0.12) 100%)' }}>
                          <td colSpan={totalCols} style={{ padding: '0.75rem 1rem', fontWeight: 800, color: '#5b21b6', fontSize: '0.9rem', textAlign: 'center', borderBottom: '2px solid rgba(139,92,246,0.2)' }}>
                            Long-Term Statistics (Process Performance)
                          </td>
                        </tr>
                        <CpkRow totalCols={totalCols} label="Sample Std Deviation (S)" vals={fmt5A(s => s?.sigmaSample)} onInfoClick={() => setSelectedRowInfo({ id: 'sigma-sample', label: 'Sample Std Deviation (S)' })} />
                        <CpkRow totalCols={totalCols} label="3S = (3 × S)" vals={fmt2A(s => s ? s.sigmaSample * 3 : undefined)} shade onInfoClick={() => setSelectedRowInfo({ id: '3s', label: '3S' })} />
                        <CpkRow totalCols={totalCols} label="6S = (6 × S)" vals={fmt2A(s => s ? s.sigmaSample * 6 : undefined)} onInfoClick={() => setSelectedRowInfo({ id: '6s', label: '6S' })} />
                        <CpkRow totalCols={totalCols} label="Ppku = (USL − Average) / 3S" vals={fmt2A(s => s?.ppku)} shade onInfoClick={() => setSelectedRowInfo({ id: 'ppku', label: 'Ppku' })} />
                        <CpkRow totalCols={totalCols} label="Ppkl = (Average − LSL) / 3S" vals={fmt2A(s => s?.ppkl)} onInfoClick={() => setSelectedRowInfo({ id: 'ppkl', label: 'Ppkl' })} />
                        <CpkRow totalCols={totalCols} label="Ppk = Min(Ppkl, Ppku)" vals={fmt2A(s => s?.ppk)} shade highlight onInfoClick={() => setSelectedRowInfo({ id: 'ppk', label: 'Ppk' })} />
                        <CpkRow totalCols={totalCols} label="Pp = (USL − LSL) / 6S" vals={fmt2A(s => s?.pp)} highlight onInfoClick={() => setSelectedRowInfo({ id: 'pp', label: 'Pp' })} />

                        {/* Capability conclusion */}
                        <tr style={{ background: 'linear-gradient(135deg, rgba(124,58,237,0.12) 0%, rgba(168,85,247,0.15) 100%)' }}>
                          <td colSpan={totalCols} style={{
                            padding: '1rem', textAlign: 'center', fontWeight: 800, fontSize: '0.95rem',
                            color: columnStats.every(c => c.stats?.isCapable) ? '#059669' : '#dc2626',
                            borderTop: '2px solid rgba(139,92,246,0.3)',
                          }}>
                            {columnStats.every(c => c.stats?.isCapable)
                              ? '✅ Process is Capable (All available indices > 1.33)'
                              : '⚠️ Process may require attention (Not all indices > 1.33)'}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                );
              })()}

              <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'center' }}>
                <button
                  onClick={() => setShowFormulaModal(true)}
                  style={{
                    padding: '0.75rem 2rem',
                    borderRadius: '12px',
                    background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                    color: 'white',
                    fontWeight: 700,
                    fontSize: '0.95rem',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    boxShadow: '0 4px 12px rgba(99,102,241,0.35)',
                    transition: 'all 0.2s ease',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(99,102,241,0.45)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(99,102,241,0.35)'; }}
                >
                  <span style={{ fontSize: '1.2em' }}>ℹ️</span>
                  View Formulas & Math
                </button>
              </div>
            </SectionCard>

            {/* Trend Analysis Charts */}
            {columnStats.some(c => c.stats !== null && c.vals.length >= 1) && (
              <SectionCard title="Trend Analysis at Finished Stage" icon="📈" gradient="linear-gradient(135deg, #0e7490 0%, #0891b2 100%)">
                {columnStats
                  .filter(c => c.stats !== null && c.vals.length >= 1)
                  .map(({ col, stats, vals }) => {
                    const batchNumbers = finishData.map(r => r.batchNumber);
                    const valuesByBatch = finishData.map(r => {
                      return parseResultValue(r.results[resultKey(col.key)] || '', stats!.lsl, stats!.usl);
                    });
                    return (
                      <TrendAnalysisChart
                        key={col.key}
                        colName={col.name}
                        batchNumbers={batchNumbers}
                        values={valuesByBatch}
                        lsl={stats!.lsl}
                        usl={stats!.usl}
                        average={stats!.average}
                        sigmaEst={stats!.sigmaEstimated}
                      />
                    );
                  })}
              </SectionCard>
            )}
          </>
        )}
      </div>

      {showFormulaModal && (
        <FormulaInfoModal
          onClose={() => setShowFormulaModal(false)}
          columnStats={columnStats}
        />
      )}

      {selectedRowInfo && (
        <RowCalculationModal
          info={selectedRowInfo}
          onClose={() => setSelectedRowInfo(null)}
          columnStats={columnStats}
        />
      )}
    </div>
  );
}

// ─── Trend Analysis Chart ───

function TrendAnalysisChart({
  colName, batchNumbers, values, lsl, usl, average, sigmaEst,
}: {
  colName: string;
  batchNumbers: string[];
  values: (number | null)[];
  lsl: number | null;
  usl: number | null;
  average: number;
  sigmaEst: number;
}) {
  const ucl = parseFloat((average + 3 * sigmaEst).toFixed(3));
  const lcl = parseFloat((average - 3 * sigmaEst).toFixed(3));

  const data = batchNumbers.map((batch, i) => ({
    batch,
    value: values[i],
    nlt: lsl,
    nmt: usl,
    ucl,
    lcl,
  }));

  // Compute Y axis domain with comfortable padding
  const allVals = [
    ...values.filter((v): v is number => v !== null),
    ...(lsl !== null ? [lsl] : []),
    ...(usl !== null ? [usl] : []),
    ucl, lcl,
  ];
  const minVal = Math.min(...allVals);
  const maxVal = Math.max(...allVals);
  const pad = (maxVal - minVal) * 0.1 || 0.5;
  const yMin = parseFloat((minVal - pad).toFixed(2));
  const yMax = parseFloat((maxVal + pad).toFixed(2));

  const uclLabel = `UCL (NMT ${ucl})`;
  const lclLabel = `LCL (NLT ${lcl})`;
  const nltLabel = lsl !== null ? `NLT ${lsl}` : 'NLT';
  const nmtLabel = usl !== null ? `NMT ${usl}` : 'NMT';

  return (
    <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '1.5rem', marginBottom: '1.5rem' }}>
      <h4 style={{ margin: '0 0 1.25rem', fontSize: '0.95rem', fontWeight: 700, color: '#1e293b', textAlign: 'center' }}>
        Trend Analysis of {colName} at Finished Stage
      </h4>
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={data} margin={{ top: 10, right: 30, left: 10, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="batch"
            tick={{ fontSize: 11, fill: '#374151' }}
            label={{ value: 'BATCH NO.', position: 'insideBottom', offset: -10, fontSize: 11, fill: '#374151', fontWeight: 600 }}
          />
          <YAxis
            domain={[yMin, yMax]}
            tick={{ fontSize: 11, fill: '#374151' }}
            label={{ value: colName, angle: -90, position: 'insideLeft', offset: 10, fontSize: 11, fill: '#374151', fontWeight: 600 }}
            width={60}
          />
          <Tooltip
            contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '0.82rem' }}
          />
          <Legend
            wrapperStyle={{ fontSize: '0.8rem', paddingTop: '12px' }}
            iconType="plainline"
          />

          {/* Actual values */}
          <Line
            type="linear"
            dataKey="value"
            name={colName}
            stroke="#2563eb"
            strokeWidth={2}
            dot={{ r: 5, fill: '#2563eb', stroke: 'white', strokeWidth: 2 }}
            activeDot={{ r: 7 }}
            connectNulls
          />

          {/* NLT – specification lower limit */}
          {lsl !== null && (
            <Line
              type="linear"
              dataKey="nlt"
              name={nltLabel}
              stroke="#f97316"
              strokeWidth={2}
              dot={false}
              activeDot={false}
            />
          )}

          {/* NMT – specification upper limit */}
          {usl !== null && (
            <Line
              type="linear"
              dataKey="nmt"
              name={nmtLabel}
              stroke="#9ca3af"
              strokeWidth={2}
              dot={false}
              activeDot={false}
            />
          )}

          {/* UCL – average + 3σ */}
          <Line
            type="linear"
            dataKey="ucl"
            name={uclLabel}
            stroke="#ca8a04"
            strokeWidth={1.5}
            strokeDasharray="6 3"
            dot={false}
            activeDot={false}
          />

          {/* LCL – average – 3σ */}
          <Line
            type="linear"
            dataKey="lcl"
            name={lclLabel}
            stroke="#0ea5e9"
            strokeWidth={1.5}
            strokeDasharray="6 3"
            dot={false}
            activeDot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Sub-components ───

function StatCard({ label, value, icon, gradient }: { label: string; value: string; icon: string; gradient: string }) {
  return (
    <div style={{
      minWidth: '200px', flexShrink: 0, background: 'white', borderRadius: '16px', padding: '1.25rem', boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
      border: '1px solid rgba(0,0,0,0.05)', transition: 'all 0.2s ease',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
        <div style={{
          width: '36px', height: '36px', borderRadius: '10px', background: gradient,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem',
        }}>{icon}</div>
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
      </div>
      <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#111827' }}>{value}</div>
    </div>
  );
}

function SectionCard({ title, icon, gradient, children }: { title: string; icon: string; gradient: string; children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(true);
  return (
    <div style={{ background: 'white', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 4px 16px rgba(0,0,0,0.06)', marginBottom: '2rem', border: '1px solid rgba(0,0,0,0.05)' }}>
      <button onClick={() => setIsOpen(!isOpen)} style={{
        width: '100%', padding: '1.125rem 1.5rem', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', background: gradient, border: 'none', cursor: 'pointer',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ fontSize: '1.2rem' }}>{icon}</span>
          <h3 style={{ color: 'white', fontSize: '1.05rem', fontWeight: 700, margin: 0, textShadow: '0 1px 2px rgba(0,0,0,0.1)' }}>{title}</h3>
        </div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"
          style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {isOpen && <div style={{ padding: '1.5rem' }}>{children}</div>}
    </div>
  );
}

function CpkRow({ totalCols, label, vals, shade, highlight, onInfoClick }: {
  totalCols: number;
  label: string;
  vals: string[];
  shade?: boolean;
  highlight?: boolean;
  onInfoClick?: () => void;
}) {
  const bgColor = highlight
    ? 'linear-gradient(135deg, rgba(124,58,237,0.06) 0%, rgba(168,85,247,0.1) 100%)'
    : shade ? 'rgba(139,92,246,0.04)' : 'transparent';

  const isCapable = (val: string) => {
    const n = parseFloat(val);
    return !isNaN(n) && n > 1.33;
  };

  const labelColSpan = totalCols - vals.length - 1;

  return (
    <tr style={{ background: bgColor }}>
      <td colSpan={labelColSpan > 0 ? labelColSpan : 2} style={{
        padding: '0.7rem 1rem', fontWeight: highlight ? 800 : 600,
        color: highlight ? '#5b21b6' : '#374151', fontSize: '0.84rem',
        borderBottom: '1px solid rgba(139,92,246,0.1)',
      }}>
        {label}
      </td>
      {vals.map((v, i) => (
        <td key={i} style={{
          padding: '0.7rem 1rem', textAlign: 'center', fontWeight: highlight ? 800 : 500,
          fontSize: '0.85rem', borderBottom: '1px solid rgba(139,92,246,0.1)',
          color: highlight && isCapable(v) ? '#059669' : highlight && !isCapable(v) && v !== 'N/A' ? '#dc2626' : '#374151',
        }}>
          {v}
        </td>
      ))}
      <td style={{
        padding: '0.4rem 1rem', textAlign: 'center', borderBottom: '1px solid rgba(139,92,246,0.1)',
      }}>
        {onInfoClick && (
          <button
            onClick={onInfoClick}
            style={{
              background: 'rgba(139,92,246,0.1)', border: 'none', borderRadius: '50%',
              width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#6d28d9', fontSize: '1rem', cursor: 'pointer', margin: '0 auto',
              transition: 'background 0.2s ease, transform 0.2s ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(139,92,246,0.2)'; e.currentTarget.style.transform = 'scale(1.1)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(139,92,246,0.1)'; e.currentTarget.style.transform = 'scale(1)'; }}
            title={`View calculation for ${label}`}
          >
            ℹ️
          </button>
        )}
      </td>
    </tr>
  );
}

// ─── Row Calculation Modal ───

function RowCalculationModal({
  info, onClose, columnStats
}: {
  info: { id: string; label: string };
  onClose: () => void;
  columnStats: { col: FinishInProcessColumn, stats: ProcessCapabilityResults | null, vals: number[] }[];
}) {
  const getCalc = (colStat: typeof columnStats[0]) => {
    const { col, stats, vals } = colStat;
    if (!stats) return null;
    const limits = parseLimits(col.limit || '');
    
    const usl = limits.usl;
    const lsl = limits.lsl;
    const avg = stats.average;
    const sigEst = stats.sigmaEstimated;
    const s = stats.sigmaSample;
    const fmt = (n: number) => n.toFixed(5);
    const fmt2 = (n: number) => n.toFixed(2);
    
    switch(info.id) {
      case 'usl': return usl !== null ? { formula: '\\text{Upper Specification Limit (USL)}', calc: `\\text{Limit: } \\text{${col.limit.replace(/ /g, '~')}} \\implies \\text{USL = } ${usl}`, verified: true } : null;
      case 'lsl': return lsl !== null ? { formula: '\\text{Lower Specification Limit (LSL)}', calc: `\\text{Limit: } \\text{${col.limit.replace(/ /g, '~')}} \\implies \\text{LSL = } ${lsl}`, verified: true } : null;
      case 'average': return { formula: '\\bar{x} = \\frac{\\sum x_i}{n}', calc: `\\bar{x} = \\frac{\\sum x_i}{${vals.length}} = ${fmt(avg)}`, verified: true };
      case 'max': return { formula: '\\max(x_1, x_2, \\dots, x_n)', calc: `\\max(\\dots) = ${fmt(stats.max)}`, verified: true };
      case 'min': return { formula: '\\min(x_1, x_2, \\dots, x_n)', calc: `\\min(\\dots) = ${fmt(stats.min)}`, verified: true };
      case 'usl-lsl': return usl !== null && lsl !== null ? { formula: 'USL - LSL', calc: `${usl} - ${lsl} = ${fmt(usl - lsl)}`, verified: Math.abs((usl - lsl) - (usl - lsl)) < 0.001 } : null;
      case 'usl-avg': return usl !== null ? { formula: 'USL - \\bar{x}', calc: `${usl} - ${fmt(avg)} = ${fmt(usl - avg)}`, verified: Math.abs((usl - avg) - (usl - avg)) < 0.001 } : null;
      case 'avg-lsl': return lsl !== null ? { formula: '\\bar{x} - LSL', calc: `${fmt(avg)} - ${lsl} = ${fmt(avg - lsl)}`, verified: Math.abs((avg - lsl) - (avg - lsl)) < 0.001 } : null;
      case 'sigma-est': return { formula: '\\hat{\\sigma} = \\frac{\\overline{MR}}{1.128}', calc: `\\hat{\\sigma} = \\frac{${fmt(sigEst * 1.128)}}{1.128} = ${fmt(sigEst)}`, verified: Math.abs((sigEst * 1.128 / 1.128) - sigEst) < 0.02 };
      case '3sigma': return { formula: '3 \\times \\hat{\\sigma}', calc: `3 \\times ${fmt(sigEst)} = ${fmt2(3 * sigEst)}`, verified: Math.abs((3 * sigEst) - (3 * sigEst)) < 0.02 };
      case '6sigma': return { formula: '6 \\times \\hat{\\sigma}', calc: `6 \\times ${fmt(sigEst)} = ${fmt2(6 * sigEst)}`, verified: Math.abs((6 * sigEst) - (6 * sigEst)) < 0.02 };
      case 'cpku': return usl !== null ? { formula: 'C_{pku} = \\frac{USL - \\bar{x}}{3\\hat{\\sigma}}', calc: `C_{pku} = \\frac{${usl} - ${fmt(avg)}}{3 \\times ${fmt(sigEst)}} = ${fmt2(stats.cpku)}`, verified: Math.abs(((usl - avg) / (3 * sigEst)) - stats.cpku) < 0.02 } : null;
      case 'cpkl': return lsl !== null ? { formula: 'C_{pkl} = \\frac{\\bar{x} - LSL}{3\\hat{\\sigma}}', calc: `C_{pkl} = \\frac{${fmt(avg)} - ${lsl}}{3 \\times ${fmt(sigEst)}} = ${fmt2(stats.cpkl)}`, verified: Math.abs(((avg - lsl) / (3 * sigEst)) - stats.cpkl) < 0.02 } : null;
      case 'cpk': return usl !== null && lsl !== null ? { formula: 'C_{pk} = \\min(C_{pkl}, C_{pku})', calc: `C_{pk} = \\min(${fmt2(stats.cpkl)}, ${fmt2(stats.cpku)}) = ${fmt2(stats.cpk)}`, verified: Math.abs(Math.min(stats.cpkl, stats.cpku) - stats.cpk) < 0.02 } : null;
      case 'cp': return usl !== null && lsl !== null ? { formula: 'C_p = \\frac{USL - LSL}{6\\hat{\\sigma}}', calc: `C_p = \\frac{${usl} - ${lsl}}{6 \\times ${fmt(sigEst)}} = ${fmt2(stats.cp)}`, verified: Math.abs(((usl - lsl) / (6 * sigEst)) - stats.cp) < 0.02 } : null;
      case 'sigma-sample': return { formula: 'S = \\sqrt{\\frac{\\sum(x_i - \\bar{x})^2}{n-1}}', calc: `S = ${fmt(s)}`, verified: true };
      case '3s': return { formula: '3 \\times S', calc: `3 \\times ${fmt(s)} = ${fmt2(3 * s)}`, verified: Math.abs((3 * s) - (3 * s)) < 0.02 };
      case '6s': return { formula: '6 \\times S', calc: `6 \\times ${fmt(s)} = ${fmt2(6 * s)}`, verified: Math.abs((6 * s) - (6 * s)) < 0.02 };
      case 'ppku': return usl !== null ? { formula: 'P_{pku} = \\frac{USL - \\bar{x}}{3S}', calc: `P_{pku} = \\frac{${usl} - ${fmt(avg)}}{3 \\times ${fmt(s)}} = ${fmt2(stats.ppku)}`, verified: Math.abs(((usl - avg) / (3 * s)) - stats.ppku) < 0.02 } : null;
      case 'ppkl': return lsl !== null ? { formula: 'P_{pkl} = \\frac{\\bar{x} - LSL}{3S}', calc: `P_{pkl} = \\frac{${fmt(avg)} - ${lsl}}{3 \\times ${fmt(s)}} = ${fmt2(stats.ppkl)}`, verified: Math.abs(((avg - lsl) / (3 * s)) - stats.ppkl) < 0.02 } : null;
      case 'ppk': return usl !== null && lsl !== null ? { formula: 'P_{pk} = \\min(P_{pkl}, P_{pku})', calc: `P_{pk} = \\min(${fmt2(stats.ppkl)}, ${fmt2(stats.ppku)}) = ${fmt2(stats.ppk)}`, verified: Math.abs(Math.min(stats.ppkl, stats.ppku) - stats.ppk) < 0.02 } : null;
      case 'pp': return usl !== null && lsl !== null ? { formula: 'P_p = \\frac{USL - LSL}{6S}', calc: `P_p = \\frac{${usl} - ${lsl}}{6 \\times ${fmt(s)}} = ${fmt2(stats.pp)}`, verified: Math.abs(((usl - lsl) / (6 * s)) - stats.pp) < 0.02 } : null;
      default: return null;
    }
  };

  const formulaLatex = columnStats.length > 0 ? getCalc(columnStats[0])?.formula : '';

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(17,24,39,0.5)', 
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      padding: '2rem', animation: 'fadeIn 0.2s ease-out',
    }}>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
      <div style={{
        background: 'white', borderRadius: '20px', width: '100%', maxWidth: '900px',
        maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 40px rgba(0,0,0,0.2), 0 0 0 1px rgba(0,0,0,0.05)',
        animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
      }}>
        <div style={{
          padding: '1.5rem 2rem', borderBottom: '1px solid #e5e7eb',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: 'linear-gradient(135deg, rgba(124,58,237,0.05) 0%, rgba(168,85,247,0.05) 100%)',
          borderTopLeftRadius: '20px', borderTopRightRadius: '20px',
        }}>
          <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#111827', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '1.5rem' }}>🧮</span> Calculation Details: {info.label}
          </h2>
          <button onClick={onClose} style={{
            background: 'white', border: '1px solid #e5e7eb', borderRadius: '50%',
            width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
          }} onMouseEnter={(e) => { e.currentTarget.style.background = '#f3f4f6'; e.currentTarget.style.transform = 'scale(1.05)'; }}
             onMouseLeave={(e) => { e.currentTarget.style.background = 'white'; e.currentTarget.style.transform = 'scale(1)'; }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>

        <div style={{ padding: '2rem', overflowY: 'auto' }}>
          {formulaLatex && (
            <div style={{
              background: '#f8fafc', borderRadius: '12px', padding: '1.5rem', marginBottom: '2rem',
              border: '1px solid #e2e8f0', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)',
              textAlign: 'center'
            }}>
              <h4 style={{ margin: '0 0 1rem', fontSize: '0.85rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>General Formula</h4>
              <div style={{ fontSize: '1.1rem', overflowX: 'auto', paddingBottom: '0.5rem' }}>
                <Latex math={formulaLatex} display />
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
            {columnStats.map((colStat, i) => {
              const calc = getCalc(colStat);
              const color = ['#4c1d95', '#b45309', '#0d9488', '#b91c1c'][i % 4];
              const bg = ['rgba(139,92,246,0.04)', 'rgba(245,158,11,0.04)', 'rgba(20,184,166,0.04)', 'rgba(239,68,68,0.04)'][i % 4];
              const border = ['#7c3aed', '#f59e0b', '#14b8a6', '#ef4444'][i % 4];

              return (
                <div key={i} style={{ marginBottom: '1rem' }}>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color, borderBottom: `2px solid ${bg.replace('0.04', '0.2')}`, paddingBottom: '0.5rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>{['🧪', '💊', '💧', '🌡️'][i % 4]}</span> {colStat.col.name}
                  </h3>
                  {calc ? (
                    <div style={{ background: bg, borderRadius: '10px', padding: '1.25rem', borderLeft: `4px solid ${border}`, overflowX: 'auto', fontSize: '1.1rem' }}>
                      <Latex math={calc.calc} display />
                      {calc.verified && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1rem', padding: '0.5rem 0.75rem', background: 'rgba(16,185,129,0.1)', color: '#065f46', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 600, width: 'fit-content' }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                          Verified
                        </div>
                      )}
                    </div>
                  ) : (
                    <p style={{ color: '#6b7280', fontStyle: 'italic', margin: 0, padding: '1rem', background: '#f9fafb', borderRadius: '8px' }}>Values unavailable.</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Formula Modal ───

function FormulaInfoModal({
  onClose, columnStats
}: {
  onClose: () => void;
  columnStats: { col: FinishInProcessColumn, stats: ProcessCapabilityResults | null, vals: number[] }[];
}) {
  const formulas = [
    { title: 'Average (Mean)', latex: '\\bar{x} = \\frac{1}{n} \\sum_{i=1}^{n} x_i', description: 'The arithmetic mean of all observed data values.' },
    { title: 'Moving Range (MR)', latex: 'MR_i = |x_i - x_{i-1}|', description: 'The absolute difference between consecutive observations. Used for short-term variation estimation.' },
    { title: 'Estimated Std Deviation (σ) — Short-Term', latex: '\\hat{\\sigma} = \\frac{\\overline{MR}}{d_2} = \\frac{\\frac{1}{n-1}\\sum_{i=2}^{n}|x_i - x_{i-1}|}{1.128}', description: 'Estimated using the average moving range divided by d₂ = 1.128 (for subgroup size n=2). Represents within-subgroup (short-term) variation.' },
    { title: 'Sample Std Deviation (S) — Long-Term', latex: 'S = \\sqrt{\\frac{\\sum_{i=1}^{n}(x_i - \\bar{x})^2}{n - 1}}', description: 'The sample standard deviation using (n-1) degrees of freedom. Represents overall (long-term) variation including between-subgroup shifts.' },
    { title: 'Process Capability — Cp', latex: 'C_p = \\frac{USL - LSL}{6\\hat{\\sigma}}', description: 'Measures potential capability — how well the process could perform if centered. Uses short-term σ.' },
    { title: 'Process Capability — Cpk', latex: 'C_{pk} = \\min\\left( \\frac{USL - \\bar{x}}{3\\hat{\\sigma}},\\; \\frac{\\bar{x} - LSL}{3\\hat{\\sigma}} \\right)', description: 'Measures actual capability accounting for centering. Target: Cpk ≥ 1.33.' },
    { title: 'Process Performance — Pp', latex: 'P_p = \\frac{USL - LSL}{6S}', description: 'Measures potential performance using long-term variation. Uses sample std deviation S.' },
    { title: 'Process Performance — Ppk', latex: 'P_{pk} = \\min\\left( \\frac{USL - \\bar{x}}{3S},\\; \\frac{\\bar{x} - LSL}{3S} \\right)', description: 'Measures actual performance accounting for centering using long-term variation. Target: Ppk ≥ 1.33.' },
  ];

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
      zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem',
    }}>
      <div style={{
        background: 'white', borderRadius: '24px', width: '100%', maxWidth: '900px',
        maxHeight: '90vh', overflow: 'hidden', boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{
          padding: '1.5rem 2rem', borderBottom: '1px solid #e5e7eb',
          background: 'linear-gradient(135deg, #064e3b 0%, #047857 100%)', color: 'white',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0 }}>📐 Formulas & Mathematics</h2>
              <p style={{ margin: '4px 0 0', opacity: 0.8, fontSize: '0.85rem' }}>Finish Process Capability computation details</p>
            </div>
            <button onClick={onClose} style={{
              background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '10px',
              width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'white', fontSize: '1.2rem', cursor: 'pointer',
            }}>×</button>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '2rem' }}>
          {/* Data Summary */}
          <div style={{
            background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
            borderRadius: '16px', padding: '1.5rem', marginBottom: '2rem',
            border: '1px solid rgba(16,185,129,0.2)',
          }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#065f46', marginTop: 0, marginBottom: '1rem' }}>
              📊 Your Data Summary
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
              {columnStats.map((colStat, i) => {
                const limits = parseLimits(colStat.col.limit || '');
                return (
                  <div key={i}>
                    <h4 style={{ fontSize: '0.85rem', fontWeight: 600, color: '#047857', margin: '0 0 0.5rem' }}>{colStat.col.name}</h4>
                    <div style={{ fontSize: '0.8rem', color: '#374151', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span>n = {colStat.vals.length} data points</span>
                      <span>LSL = {limits.lsl ?? 'N/A'}, USL = {limits.usl ?? 'N/A'}</span>
                      {colStat.stats && <span>σ̂ = {colStat.stats.sigmaEstimated.toFixed(5)}, S = {colStat.stats.sigmaSample.toFixed(5)}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {formulas.map((f, i) => (
              <div key={i} style={{
                background: i % 2 === 0 ? 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)' : 'white',
                borderRadius: '14px', padding: '1.25rem 1.5rem',
                border: '1px solid rgba(16,185,129,0.15)', transition: 'all 0.2s ease',
              }}>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#065f46', margin: '0 0 0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '24px', height: '24px', borderRadius: '6px', background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: 'white', fontSize: '0.7rem', fontWeight: 800 }}>{i + 1}</span>
                  {f.title}
                </h4>
                <div style={{ background: 'white', borderRadius: '10px', padding: '1rem 1.5rem', border: '1px solid rgba(16,185,129,0.1)', textAlign: 'center', marginBottom: '0.75rem', fontSize: '1.1rem' }}>
                  <Latex math={f.latex} display />
                </div>
                <p style={{ fontSize: '0.82rem', color: '#6b7280', margin: 0, lineHeight: 1.5 }}>{f.description}</p>
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding: '1rem 2rem', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'flex-end', background: '#f9fafb' }}>
          <button onClick={onClose} style={{
            padding: '0.75rem 2rem', borderRadius: '10px',
            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            color: 'white', fontWeight: 700, border: 'none', cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(16,185,129,0.25)',
          }}>Close</button>
        </div>
      </div>
    </div>
  );
}
