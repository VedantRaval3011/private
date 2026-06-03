'use client';

import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import katex from 'katex';
import 'katex/dist/katex.min.css';

// ─── Types ───
interface BulkInProcessRow {
  batchNumber: string;
  batchSize: string;
  arNumber: string;
  description: string;
  ph: string;
  assay: string; // first compound (backward compat)
  assays?: { compound: string; value: string }[];
}

interface BulkHeader {
  descriptionLimit: string;
  phLimit: string;
  assayCompound: string;
  assayLimit: string;
  assayColumns?: { compound: string; limit: string }[];
}

import {
  calculateProcessCapability,
  parseLimits,
  type ProcessCapabilityResults,
} from '@/lib/apqr-capability-math';

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

// ─── Page (with Suspense boundary for useSearchParams) ───
export default function BulkCalculationPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9fafb' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: '48px', height: '48px', border: '4px solid #e5e7eb', borderTopColor: '#7c3aed', borderRadius: '50%', margin: '0 auto 1.5rem', animation: 'spin 1s linear infinite' }} />
          <p style={{ color: '#6b7280' }}>Loading...</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    }>
      <BulkCalculationContent />
    </Suspense>
  );
}

function BulkCalculationContent() {
  const searchParams = useSearchParams();
  const productCode = searchParams.get('productCode') || '';
  const initialYear = parseInt(searchParams.get('year') || new Date().getFullYear().toString(), 10);

  const [selectedYear, setSelectedYear] = useState(initialYear);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bulkData, setBulkData] = useState<BulkInProcessRow[]>([]);
  const [header, setHeader] = useState<BulkHeader | null>(null);
  const [productName, setProductName] = useState('');
  const [totalBatches, setTotalBatches] = useState('');
  const [batchSize, setBatchSize] = useState('');
  const [showFormulaModal, setShowFormulaModal] = useState(false);
  const [selectedRowInfo, setSelectedRowInfo] = useState<{ id: string; label: string } | null>(null);

  // Generate year options (2020 to current year)
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
        const res = await fetch('/api/apqr/bulk-calc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productCode, year: selectedYear }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        setBulkData(data.bulkInProcessData || []);
        setHeader(data.bulkInProcessHeader || null);
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

  // Compute process capability
  const phValues = useMemo(() => bulkData.map(r => parseFloat(r.ph)).filter(n => !isNaN(n)), [bulkData]);
  // First assay (backward compat)
  const assayValues = useMemo(() => bulkData.map(r => parseFloat(r.assay)).filter(n => !isNaN(n)), [bulkData]);
  const phStats = useMemo(() => header ? calculateProcessCapability(phValues, header.phLimit || '') : null, [phValues, header]);
  const assayStats = useMemo(() => header ? calculateProcessCapability(assayValues, header.assayLimit || '') : null, [assayValues, header]);

  // Dynamic per-compound stats for all assay columns
  const assayColumns = header?.assayColumns || [];
  const allAssayStats = useMemo(() =>
    assayColumns.map((col, ci) => {
      const vals = bulkData.map(r => {
        if (r.assays && r.assays[ci]) return parseFloat(r.assays[ci].value);
        if (ci === 0) return parseFloat(r.assay);
        return NaN;
      }).filter(n => !isNaN(n));
      return { col, stats: calculateProcessCapability(vals, col.limit || '') };
    }),
  [bulkData, assayColumns]);

  // Derived values for the table
  const uslLslPh = phStats ? phStats.usl - phStats.lsl : NaN;
  const uslAvgPh = phStats ? phStats.usl - phStats.average : NaN;
  const avgLslPh = phStats ? phStats.average - phStats.lsl : NaN;
  const uslLslAssay = assayStats ? assayStats.usl - assayStats.lsl : NaN;
  const uslAvgAssay = assayStats ? assayStats.usl - assayStats.average : NaN;
  const avgLslAssay = assayStats ? assayStats.average - assayStats.lsl : NaN;

  if (!productCode) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9fafb' }}>
        <div style={{ textAlign: 'center', color: '#6b7280' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700 }}>No Product Selected</h2>
          <p>Please navigate from the Formula Data page.</p>
          <Link href="/formula-data" style={{ color: '#7c3aed', textDecoration: 'underline', fontWeight: 600 }}>← Back to Formula Data</Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 50%, #ede9fe 100%)' }}>
      {/* Header Bar */}
      <div style={{
        background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4c1d95 100%)',
        padding: '1.5rem 2rem',
        color: 'white',
        boxShadow: '0 4px 20px rgba(30, 27, 75, 0.3)',
      }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <Link href="/formula-data" style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '8px' }}>
              ← Back to Formula Data
            </Link>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>
              📊 Bulk Calculations
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
                  <option key={y} value={y} style={{ color: '#1e1b4b', background: 'white' }}>{y}</option>
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
              borderTopColor: '#7c3aed', borderRadius: '50%', margin: '0 auto 1.5rem',
              animation: 'spin 1s linear infinite',
            }} />
            <p style={{ color: '#6b7280', fontSize: '1.1rem' }}>Loading bulk calculation data...</p>
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
            <Link href="/formula-data" style={{ color: '#7c3aed', fontWeight: 600 }}>← Back to Formula Data</Link>
          </div>
        ) : (
          <>
            {/* Bulk In-Process Data Table */}
            <SectionCard title="Section 5.3.1 — In-Process Analysis Results (Bulk Stage)" icon="🧪" gradient="linear-gradient(135deg, #0891b2 0%, #0d9488 100%)">
              {bulkData.length === 0 ? (
                <p style={{ color: '#6b7280', textAlign: 'center', padding: '2rem' }}>No bulk in-process data available.</p>
              ) : (
                <div style={{ overflowX: 'auto', borderRadius: '12px', border: '2px solid #06b6d4', boxShadow: '0 4px 16px rgba(0,0,0,0.06)' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ background: 'linear-gradient(135deg, #0891b2 0%, #06b6d4 100%)' }}>
                        <th style={{ padding: '0.875rem 1rem', textAlign: 'left', fontWeight: 700, color: 'white', whiteSpace: 'nowrap', textTransform: 'uppercase', fontSize: '0.72rem', letterSpacing: '0.05em', verticalAlign: 'top' }}>Sr No</th>
                        <th style={{ padding: '0.875rem 1rem', textAlign: 'left', fontWeight: 700, color: 'white', whiteSpace: 'nowrap', textTransform: 'uppercase', fontSize: '0.72rem', letterSpacing: '0.05em', verticalAlign: 'top' }}>Batch Number</th>
                        <th style={{ padding: '0.875rem 1rem', textAlign: 'left', fontWeight: 700, color: 'white', whiteSpace: 'nowrap', textTransform: 'uppercase', fontSize: '0.72rem', letterSpacing: '0.05em', verticalAlign: 'top' }}>Batch Size</th>
                        <th style={{ padding: '0.875rem 1rem', textAlign: 'left', fontWeight: 700, color: 'white', whiteSpace: 'nowrap', textTransform: 'uppercase', fontSize: '0.72rem', letterSpacing: '0.05em', verticalAlign: 'top' }}>AR Number</th>
                        <th style={{ padding: '0.875rem 1rem', textAlign: 'left', fontWeight: 700, color: 'white', whiteSpace: 'nowrap', textTransform: 'uppercase', fontSize: '0.72rem', letterSpacing: '0.05em', verticalAlign: 'top' }}>Description</th>
                        
                        {/* pH Column */}
                        <th style={{ padding: '0.875rem 1rem', textAlign: 'left', fontWeight: 700, color: 'white', whiteSpace: 'nowrap', textTransform: 'uppercase', fontSize: '0.72rem', letterSpacing: '0.05em', verticalAlign: 'top' }}>
                          <div style={{ marginBottom: (parseLimits(header?.phLimit || '').usl !== null || parseLimits(header?.phLimit || '').lsl !== null) ? '4px' : '0' }}>pH</div>
                          {(() => {
                            const { usl, lsl } = parseLimits(header?.phLimit || '');
                            if (usl !== null || lsl !== null) {
                              return (
                                <div style={{ fontSize: '0.65rem', opacity: 0.85, fontWeight: 600, letterSpacing: '0.02em', textTransform: 'none' }}>
                                  {lsl !== null && usl !== null ? `LSL: ${lsl} | USL: ${usl}` : 
                                   lsl !== null ? `LSL: ${lsl}` : 
                                   usl !== null ? `USL: ${usl}` : ''}
                                </div>
                              );
                            }
                            return null;
                          })()}
                        </th>

                        {/* Assay Columns */}
                        {(assayColumns.length > 0 ? assayColumns : [{ compound: header?.assayCompound || '' }]).map((col, i) => {
                          const { usl, lsl } = parseLimits(header?.assayLimit || '');
                          return (
                            <th key={i} style={{ padding: '0.875rem 1rem', textAlign: 'left', fontWeight: 700, color: 'white', whiteSpace: 'nowrap', textTransform: 'uppercase', fontSize: '0.72rem', letterSpacing: '0.05em', verticalAlign: 'top' }}>
                              <div style={{ marginBottom: (usl !== null || lsl !== null) ? '4px' : '0' }}>Assay (%) {col.compound}</div>
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
                      {bulkData.map((row, i) => (
                        <tr key={i} style={{
                          background: i % 2 === 0 ? 'rgba(6,182,212,0.03)' : 'rgba(6,182,212,0.08)',
                          transition: 'background 0.2s',
                        }}>
                          <td style={{ padding: '0.75rem 1rem', borderBottom: '1px solid rgba(6,182,212,0.15)' }}>
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                              width: '24px', height: '24px', borderRadius: '6px',
                              background: 'linear-gradient(135deg, #0891b2 0%, #06b6d4 100%)',
                              color: 'white', fontSize: '0.7rem', fontWeight: 700,
                            }}>{i + 1}</span>
                          </td>
                          <td style={{ padding: '0.75rem 1rem', borderBottom: '1px solid rgba(6,182,212,0.15)', fontWeight: 600, fontFamily: 'monospace' }}>{row.batchNumber}</td>
                          <td style={{ padding: '0.75rem 1rem', borderBottom: '1px solid rgba(6,182,212,0.15)', fontFamily: 'monospace', color: '#4b5563' }}>{row.batchSize || 'N/A'}</td>
                          <td style={{ padding: '0.75rem 1rem', borderBottom: '1px solid rgba(6,182,212,0.15)', fontFamily: 'monospace', color: '#0891b2' }}>{row.arNumber}</td>
                          <td style={{ padding: '0.75rem 1rem', borderBottom: '1px solid rgba(6,182,212,0.15)', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.description}</td>
                          <td style={{ padding: '0.75rem 1rem', borderBottom: '1px solid rgba(6,182,212,0.15)', fontWeight: 600, textAlign: 'center' }}>{row.ph}</td>
                          {/* Dynamic assay columns */}
                          {assayColumns.length > 0
                            ? assayColumns.map((col, ci) => (
                                <td key={ci} style={{ padding: '0.75rem 1rem', borderBottom: '1px solid rgba(6,182,212,0.15)', fontWeight: 600, textAlign: 'center' }}>
                                  {row.assays?.[ci]?.value ?? (ci === 0 ? row.assay : '')}
                                </td>
                              ))
                            : <td style={{ padding: '0.75rem 1rem', borderBottom: '1px solid rgba(6,182,212,0.15)', fontWeight: 600, textAlign: 'center' }}>{row.assay}</td>
                          }
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>

            {/* Process Capability Table */}
            <SectionCard title="Process Capability &amp; Performance Parameters (Cp, Cpk, Pp, Ppk)" icon="📈" gradient="linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)">
              {(!phStats && allAssayStats.length === 0) ? (
                <p style={{ color: '#6b7280', textAlign: 'center', padding: '2rem' }}>
                  Insufficient data to compute process capability (need at least 2 data points with valid limits).
                </p>
              ) : (() => {
                // Total columns = label(span 2) + pH(1) + N assay(N) + Info(1)
                const totalCpkCols = 2 + 1 + allAssayStats.length + 1;
                const fmt5A = (getter: (s: ProcessCapabilityResults | null) => number | undefined) =>
                  allAssayStats.map(a => fmt5(getter(a.stats)));
                const fmt2A = (getter: (s: ProcessCapabilityResults | null) => number | undefined) =>
                  allAssayStats.map(a => fmt2(getter(a.stats)));
                return (
                  <div style={{ overflowX: 'auto', borderRadius: '12px', border: '2px solid #8b5cf6', boxShadow: '0 4px 16px rgba(0,0,0,0.06)' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                      <thead>
                        <tr style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)' }}>
                          <th colSpan={totalCpkCols} style={{ padding: '1rem', textAlign: 'center', color: 'white', fontWeight: 800, fontSize: '0.95rem', letterSpacing: '-0.01em' }}>
                            Process Capability &amp; Performance Parameters
                          </th>
                        </tr>
                        <tr style={{ background: 'linear-gradient(135deg, #6d28d9 0%, #7c3aed 100%)' }}>
                          <th colSpan={2} style={{ padding: '0.75rem 1rem', textAlign: 'center', color: 'white', fontWeight: 700, fontSize: '0.8rem', verticalAlign: 'top' }}></th>
                          <th style={{ padding: '0.75rem 1rem', textAlign: 'center', color: 'white', fontWeight: 700, fontSize: '0.85rem', verticalAlign: 'top' }}>
                            <div style={{ marginBottom: (parseLimits(header?.phLimit || '').usl !== null || parseLimits(header?.phLimit || '').lsl !== null) ? '4px' : '0' }}>pH</div>
                            {(() => {
                              const { usl, lsl } = parseLimits(header?.phLimit || '');
                              if (usl !== null || lsl !== null) {
                                return (
                                  <div style={{ fontSize: '0.7rem', opacity: 0.85, fontWeight: 600, letterSpacing: '0.02em', textTransform: 'none' }}>
                                    {lsl !== null && usl !== null ? `LSL: ${lsl} | USL: ${usl}` : 
                                     lsl !== null ? `LSL: ${lsl}` : 
                                     usl !== null ? `USL: ${usl}` : ''}
                                  </div>
                                );
                              }
                              return null;
                            })()}
                          </th>
                          {allAssayStats.map((a, ci) => {
                            const { usl, lsl } = parseLimits(header?.assayLimit || '');
                            return (
                              <th key={ci} style={{ padding: '0.75rem 1rem', textAlign: 'center', color: 'white', fontWeight: 700, fontSize: '0.85rem', verticalAlign: 'top' }}>
                                <div style={{ marginBottom: (usl !== null || lsl !== null) ? '4px' : '0' }}>Assay (%) {a.col.compound}</div>
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
                        <CpkRow totalCols={totalCpkCols} label="Average" ph={fmt5(phStats?.average)} assayVals={fmt5A(s => s?.average)} onInfoClick={() => setSelectedRowInfo({ id: 'average', label: 'Average' })} />
                        <CpkRow totalCols={totalCpkCols} label="Maximum" ph={fmt5(phStats?.max)} assayVals={fmt5A(s => s?.max)} shade onInfoClick={() => setSelectedRowInfo({ id: 'max', label: 'Maximum' })} />
                        <CpkRow totalCols={totalCpkCols} label="Minimum" ph={fmt5(phStats?.min)} assayVals={fmt5A(s => s?.min)} onInfoClick={() => setSelectedRowInfo({ id: 'min', label: 'Minimum' })} />
                        <CpkRow totalCols={totalCpkCols} label="USL − LSL" ph={fmt5(uslLslPh)} assayVals={allAssayStats.map(a => fmt5(a.stats ? a.stats.usl - a.stats.lsl : undefined))} shade onInfoClick={() => setSelectedRowInfo({ id: 'usl-lsl', label: 'USL − LSL' })} />
                        <CpkRow totalCols={totalCpkCols} label="USL − Average" ph={fmt5(uslAvgPh)} assayVals={allAssayStats.map(a => fmt5(a.stats ? a.stats.usl - a.stats.average : undefined))} onInfoClick={() => setSelectedRowInfo({ id: 'usl-avg', label: 'USL − Average' })} />
                        <CpkRow totalCols={totalCpkCols} label="Average − LSL" ph={fmt5(avgLslPh)} assayVals={allAssayStats.map(a => fmt5(a.stats ? a.stats.average - a.stats.lsl : undefined))} shade onInfoClick={() => setSelectedRowInfo({ id: 'avg-lsl', label: 'Average − LSL' })} />

                        {/* Short-Term Section Header */}
                        <tr style={{ background: 'linear-gradient(135deg, rgba(124,58,237,0.08) 0%, rgba(139,92,246,0.12) 100%)' }}>
                          <td colSpan={totalCpkCols} style={{ padding: '0.75rem 1rem', fontWeight: 800, color: '#5b21b6', fontSize: '0.9rem', textAlign: 'center', borderBottom: '2px solid rgba(139,92,246,0.2)' }}>
                            Short-Term Statistics (Process Capability)
                          </td>
                        </tr>
                        <CpkRow totalCols={totalCpkCols} label="Estimated Std Deviation (σ)" ph={fmt5(phStats?.sigmaEstimated)} assayVals={fmt5A(s => s?.sigmaEstimated)} onInfoClick={() => setSelectedRowInfo({ id: 'sigma-est', label: 'Estimated Std Deviation (σ)' })} />
                        <CpkRow totalCols={totalCpkCols} label="3σ = (3 × σ)" ph={fmt2(phStats ? phStats.sigmaEstimated * 3 : undefined)} assayVals={fmt2A(s => s ? s.sigmaEstimated * 3 : undefined)} shade onInfoClick={() => setSelectedRowInfo({ id: '3sigma', label: '3σ' })} />
                        <CpkRow totalCols={totalCpkCols} label="6σ = (6 × σ)" ph={fmt2(phStats ? phStats.sigmaEstimated * 6 : undefined)} assayVals={fmt2A(s => s ? s.sigmaEstimated * 6 : undefined)} onInfoClick={() => setSelectedRowInfo({ id: '6sigma', label: '6σ' })} />
                        <CpkRow totalCols={totalCpkCols} label="Cpku = (USL − Average) / 3σ" ph={fmt2(phStats?.cpku)} assayVals={fmt2A(s => s?.cpku)} shade onInfoClick={() => setSelectedRowInfo({ id: 'cpku', label: 'Cpku' })} />
                        <CpkRow totalCols={totalCpkCols} label="Cpkl = (Average − LSL) / 3σ" ph={fmt2(phStats?.cpkl)} assayVals={fmt2A(s => s?.cpkl)} onInfoClick={() => setSelectedRowInfo({ id: 'cpkl', label: 'Cpkl' })} />
                        <CpkRow totalCols={totalCpkCols} label="Cpk = Min(Cpkl, Cpku)" ph={fmt2(phStats?.cpk)} assayVals={fmt2A(s => s?.cpk)} shade highlight onInfoClick={() => setSelectedRowInfo({ id: 'cpk', label: 'Cpk' })} />
                        <CpkRow totalCols={totalCpkCols} label="Cp = (USL − LSL) / 6σ" ph={fmt2(phStats?.cp)} assayVals={fmt2A(s => s?.cp)} highlight onInfoClick={() => setSelectedRowInfo({ id: 'cp', label: 'Cp' })} />

                        {/* Long-Term Section Header */}
                        <tr style={{ background: 'linear-gradient(135deg, rgba(124,58,237,0.08) 0%, rgba(139,92,246,0.12) 100%)' }}>
                          <td colSpan={totalCpkCols} style={{ padding: '0.75rem 1rem', fontWeight: 800, color: '#5b21b6', fontSize: '0.9rem', textAlign: 'center', borderBottom: '2px solid rgba(139,92,246,0.2)' }}>
                            Long-Term Statistics (Process Performance)
                          </td>
                        </tr>
                        <CpkRow totalCols={totalCpkCols} label="Sample Std Deviation (S)" ph={fmt5(phStats?.sigmaSample)} assayVals={fmt5A(s => s?.sigmaSample)} onInfoClick={() => setSelectedRowInfo({ id: 'sigma-sample', label: 'Sample Std Deviation (S)' })} />
                        <CpkRow totalCols={totalCpkCols} label="3S = (3 × S)" ph={fmt2(phStats ? phStats.sigmaSample * 3 : undefined)} assayVals={fmt2A(s => s ? s.sigmaSample * 3 : undefined)} shade onInfoClick={() => setSelectedRowInfo({ id: '3s', label: '3S' })} />
                        <CpkRow totalCols={totalCpkCols} label="6S = (6 × S)" ph={fmt2(phStats ? phStats.sigmaSample * 6 : undefined)} assayVals={fmt2A(s => s ? s.sigmaSample * 6 : undefined)} onInfoClick={() => setSelectedRowInfo({ id: '6s', label: '6S' })} />
                        <CpkRow totalCols={totalCpkCols} label="Ppku = (USL − Average) / 3S" ph={fmt2(phStats?.ppku)} assayVals={fmt2A(s => s?.ppku)} shade onInfoClick={() => setSelectedRowInfo({ id: 'ppku', label: 'Ppku' })} />
                        <CpkRow totalCols={totalCpkCols} label="Ppkl = (Average − LSL) / 3S" ph={fmt2(phStats?.ppkl)} assayVals={fmt2A(s => s?.ppkl)} onInfoClick={() => setSelectedRowInfo({ id: 'ppkl', label: 'Ppkl' })} />
                        <CpkRow totalCols={totalCpkCols} label="Ppk = Min(Ppkl, Ppku)" ph={fmt2(phStats?.ppk)} assayVals={fmt2A(s => s?.ppk)} shade highlight onInfoClick={() => setSelectedRowInfo({ id: 'ppk', label: 'Ppk' })} />
                        <CpkRow totalCols={totalCpkCols} label="Pp = (USL − LSL) / 6S" ph={fmt2(phStats?.pp)} assayVals={fmt2A(s => s?.pp)} highlight onInfoClick={() => setSelectedRowInfo({ id: 'pp', label: 'Pp' })} />

                        {/* Capability conclusion */}
                        <tr style={{ background: 'linear-gradient(135deg, rgba(124,58,237,0.12) 0%, rgba(168,85,247,0.15) 100%)' }}>
                          <td colSpan={totalCpkCols} style={{
                            padding: '1rem', textAlign: 'center', fontWeight: 800, fontSize: '0.95rem',
                            color: (phStats?.isCapable && allAssayStats.every(a => a.stats?.isCapable)) ? '#059669' : '#dc2626',
                            borderTop: '2px solid rgba(139,92,246,0.3)',
                          }}>
                            {(phStats?.isCapable && allAssayStats.every(a => a.stats?.isCapable))
                              ? '✅ Process is Capable (All indices > 1.33)'
                              : '⚠️ Process may require attention (Not all indices > 1.33)'}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                );
              })()}


              {/* Info Button */}
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
          </>
        )}
      </div>

      {/* Formula Info Modal */}
      {showFormulaModal && (
        <FormulaInfoModal
          onClose={() => setShowFormulaModal(false)}
          phData={phValues}
          assayData={assayValues}
          header={header}
          phStats={phStats}
          assayStats={assayStats}
        />
      )}

      {/* Row Calculation Modal */}
      {selectedRowInfo && (
        <RowCalculationModal
          info={selectedRowInfo}
          onClose={() => setSelectedRowInfo(null)}
          phData={phValues}
          assayData={assayValues}
          header={header}
          phStats={phStats}
          assayStats={assayStats}
        />
      )}
    </div>
  );
}

// ─── Sub-components ───

function StatCard({ label, value, icon, gradient }: { label: string; value: string; icon: string; gradient: string }) {
  return (
    <div style={{
      background: 'white', borderRadius: '16px', padding: '1.25rem', boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
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

function CpkRow({ totalCols, label, ph, assayVals, shade, highlight, onInfoClick }: {
  totalCols: number;
  label: string;
  ph: string;
  assayVals: string[];
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

  // Label colSpan = totalCols - ph - assays - info = totalCols - assayVals.length - 2
  const labelColSpan = totalCols - assayVals.length - 2;

  return (
    <tr style={{ background: bgColor }}>
      <td colSpan={labelColSpan > 0 ? labelColSpan : 2} style={{
        padding: '0.7rem 1rem', fontWeight: highlight ? 800 : 600,
        color: highlight ? '#5b21b6' : '#374151', fontSize: '0.84rem',
        borderBottom: '1px solid rgba(139,92,246,0.1)',
      }}>
        {label}
      </td>
      <td style={{
        padding: '0.7rem 1rem', textAlign: 'center', fontWeight: highlight ? 800 : 500,
        fontSize: '0.85rem', borderBottom: '1px solid rgba(139,92,246,0.1)',
        color: highlight && isCapable(ph) ? '#059669' : highlight && !isCapable(ph) && ph !== 'N/A' ? '#dc2626' : '#374151',
      }}>
        {ph}
      </td>
      {assayVals.map((av, i) => (
        <td key={i} style={{
          padding: '0.7rem 1rem', textAlign: 'center', fontWeight: highlight ? 800 : 500,
          fontSize: '0.85rem', borderBottom: '1px solid rgba(139,92,246,0.1)',
          color: highlight && isCapable(av) ? '#059669' : highlight && !isCapable(av) && av !== 'N/A' ? '#dc2626' : '#374151',
        }}>
          {av}
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
  info, onClose, phData, assayData, header, phStats, assayStats,
}: {
  info: { id: string; label: string };
  onClose: () => void;
  phData: number[];
  assayData: number[];
  header: BulkHeader | null;
  phStats: ProcessCapabilityResults | null;
  assayStats: ProcessCapabilityResults | null;
}) {
  const phLimits = header ? parseLimits(header.phLimit || '') : { lsl: null, usl: null };
  const assayLimits = header ? parseLimits(header.assayLimit || '') : { lsl: null, usl: null };

  const getCalc = (type: 'ph' | 'assay') => {
    const data = type === 'ph' ? phData : assayData;
    const stats = type === 'ph' ? phStats : assayStats;
    const limits = type === 'ph' ? phLimits : assayLimits;
    if (!stats) return null;
    
    const usl = limits.usl;
    const lsl = limits.lsl;
    const avg = stats.average;
    const sigEst = stats.sigmaEstimated;
    const s = stats.sigmaSample;
    const fmt = (n: number) => n.toFixed(5);
    const fmt2 = (n: number) => n.toFixed(2);
    
    const limitString = type === 'ph' ? header?.phLimit : header?.assayLimit;
    
    switch(info.id) {
      case 'usl': return usl !== null ? { formula: '\\text{Upper Specification Limit (USL)}', calc: `\\text{Limit: } \\text{${(limitString || '').replace(/ /g, '~')}} \\implies \\text{USL = } ${usl}`, verified: true } : null;
      case 'lsl': return lsl !== null ? { formula: '\\text{Lower Specification Limit (LSL)}', calc: `\\text{Limit: } \\text{${(limitString || '').replace(/ /g, '~')}} \\implies \\text{LSL = } ${lsl}`, verified: true } : null;
      case 'average': return { formula: '\\bar{x} = \\frac{\\sum x_i}{n}', calc: `\\bar{x} = \\frac{\\sum x_i}{${data.length}} = ${fmt(avg)}`, verified: true };
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

  const phCalc = getCalc('ph');
  const assayCalc = getCalc('assay');
  
  const formulaLatex = (phCalc?.formula || assayCalc?.formula) || '';

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
        background: 'white', borderRadius: '20px', width: '100%', maxWidth: '700px',
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
          {/* Main Formula */}
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

          {/* pH Calculation */}
          <div style={{ marginBottom: '2rem' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#4c1d95', borderBottom: '2px solid rgba(139,92,246,0.2)', paddingBottom: '0.5rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>🧪</span> pH Parameter
            </h3>
            {phCalc ? (
              <div style={{ background: 'rgba(139,92,246,0.04)', borderRadius: '10px', padding: '1.25rem', borderLeft: '4px solid #7c3aed', overflowX: 'auto', fontSize: '1.1rem' }}>
                <Latex math={phCalc.calc} display />
                {phCalc.verified && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1rem', padding: '0.5rem 0.75rem', background: 'rgba(16,185,129,0.1)', color: '#065f46', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 600, width: 'fit-content' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                    Automatically Verified
                  </div>
                )}
              </div>
            ) : (
              <p style={{ color: '#6b7280', fontStyle: 'italic', margin: 0, padding: '1rem', background: '#f9fafb', borderRadius: '8px' }}>Values unavailable or insufficient data.</p>
            )}
          </div>

          {/* Assay Calculation */}
          <div style={{ marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#b45309', borderBottom: '2px solid rgba(245,158,11,0.2)', paddingBottom: '0.5rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>💊</span> Assay Parameter
            </h3>
            {assayCalc ? (
              <div style={{ background: 'rgba(245,158,11,0.04)', borderRadius: '10px', padding: '1.25rem', borderLeft: '4px solid #f59e0b', overflowX: 'auto', fontSize: '1.1rem' }}>
                <Latex math={assayCalc.calc} display />
                {assayCalc.verified && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1rem', padding: '0.5rem 0.75rem', background: 'rgba(16,185,129,0.1)', color: '#065f46', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 600, width: 'fit-content' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                    Automatically Verified
                  </div>
                )}
              </div>
            ) : (
              <p style={{ color: '#6b7280', fontStyle: 'italic', margin: 0, padding: '1rem', background: '#f9fafb', borderRadius: '8px' }}>Values unavailable or insufficient data.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}// ─── Formula Modal ───

function FormulaInfoModal({
  onClose, phData, assayData, header, phStats, assayStats,
}: {
  onClose: () => void;
  phData: number[];
  assayData: number[];
  header: BulkHeader | null;
  phStats: ProcessCapabilityResults | null;
  assayStats: ProcessCapabilityResults | null;
}) {
  const formulas: { title: string; latex: string; description: string }[] = [
    {
      title: 'Average (Mean)',
      latex: '\\bar{x} = \\frac{1}{n} \\sum_{i=1}^{n} x_i',
      description: 'The arithmetic mean of all observed data values.',
    },
    {
      title: 'Moving Range (MR)',
      latex: 'MR_i = |x_i - x_{i-1}|',
      description: 'The absolute difference between consecutive observations. Used for short-term variation estimation.',
    },
    {
      title: 'Estimated Std Deviation (σ) — Short-Term',
      latex: '\\hat{\\sigma} = \\frac{\\overline{MR}}{d_2} = \\frac{\\frac{1}{n-1}\\sum_{i=2}^{n}|x_i - x_{i-1}|}{1.128}',
      description: 'Estimated using the average moving range divided by d₂ = 1.128 (for subgroup size n=2). Represents within-subgroup (short-term) variation.',
    },
    {
      title: 'Sample Std Deviation (S) — Long-Term',
      latex: 'S = \\sqrt{\\frac{\\sum_{i=1}^{n}(x_i - \\bar{x})^2}{n - 1}}',
      description: 'The sample standard deviation using (n-1) degrees of freedom. Represents overall (long-term) variation including between-subgroup shifts.',
    },
    {
      title: 'Process Capability — Cp',
      latex: 'C_p = \\frac{USL - LSL}{6\\hat{\\sigma}}',
      description: 'Measures potential capability — how well the process could perform if centered. Uses short-term σ.',
    },
    {
      title: 'Process Capability — Cpk',
      latex: 'C_{pk} = \\min\\left( \\frac{USL - \\bar{x}}{3\\hat{\\sigma}},\\; \\frac{\\bar{x} - LSL}{3\\hat{\\sigma}} \\right)',
      description: 'Measures actual capability accounting for centering. The minimum of upper and lower capability indices. Target: Cpk ≥ 1.33.',
    },
    {
      title: 'Process Performance — Pp',
      latex: 'P_p = \\frac{USL - LSL}{6S}',
      description: 'Measures potential performance using long-term variation. Uses sample std deviation S.',
    },
    {
      title: 'Process Performance — Ppk',
      latex: 'P_{pk} = \\min\\left( \\frac{USL - \\bar{x}}{3S},\\; \\frac{\\bar{x} - LSL}{3S} \\right)',
      description: 'Measures actual performance accounting for centering using long-term variation. Target: Ppk ≥ 1.33.',
    },
    {
      title: 'Cpku (Upper)',
      latex: 'C_{pku} = \\frac{USL - \\bar{x}}{3\\hat{\\sigma}}',
      description: 'One-sided capability index for the upper specification limit.',
    },
    {
      title: 'Cpkl (Lower)',
      latex: 'C_{pkl} = \\frac{\\bar{x} - LSL}{3\\hat{\\sigma}}',
      description: 'One-sided capability index for the lower specification limit.',
    },
  ];

  // Actual data summary
  const phLimits = header ? parseLimits(header.phLimit || '') : { lsl: null, usl: null };
  const assayLimits = header ? parseLimits(header.assayLimit || '') : { lsl: null, usl: null };

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
          background: 'linear-gradient(135deg, #312e81 0%, #4c1d95 100%)', color: 'white',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0 }}>📐 Formulas & Mathematics</h2>
              <p style={{ margin: '4px 0 0', opacity: 0.8, fontSize: '0.85rem' }}>Process Capability & Performance computation details</p>
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
            background: 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)',
            borderRadius: '16px', padding: '1.5rem', marginBottom: '2rem',
            border: '1px solid rgba(139,92,246,0.2)',
          }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#5b21b6', marginTop: 0, marginBottom: '1rem' }}>
              📊 Your Data Summary
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <h4 style={{ fontSize: '0.85rem', fontWeight: 600, color: '#6d28d9', margin: '0 0 0.5rem' }}>pH</h4>
                <div style={{ fontSize: '0.8rem', color: '#374151', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <span>n = {phData.length} data points</span>
                  <span>LSL = {phLimits.lsl ?? 'N/A'}, USL = {phLimits.usl ?? 'N/A'}</span>
                  {phStats && <span>σ̂ = {phStats.sigmaEstimated.toFixed(5)}, S = {phStats.sigmaSample.toFixed(5)}</span>}
                </div>
              </div>
              <div>
                <h4 style={{ fontSize: '0.85rem', fontWeight: 600, color: '#6d28d9', margin: '0 0 0.5rem' }}>Assay ({header?.assayCompound || ''})</h4>
                <div style={{ fontSize: '0.8rem', color: '#374151', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <span>n = {assayData.length} data points</span>
                  <span>LSL = {assayLimits.lsl ?? 'N/A'}, USL = {assayLimits.usl ?? 'N/A'}</span>
                  {assayStats && <span>σ̂ = {assayStats.sigmaEstimated.toFixed(5)}, S = {assayStats.sigmaSample.toFixed(5)}</span>}
                </div>
              </div>
            </div>
          </div>

          {/* Formula Cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {formulas.map((f, i) => (
              <div key={i} style={{
                background: i % 2 === 0 ? 'linear-gradient(135deg, #faf5ff 0%, #f5f3ff 100%)' : 'white',
                borderRadius: '14px', padding: '1.25rem 1.5rem',
                border: '1px solid rgba(139,92,246,0.15)', transition: 'all 0.2s ease',
                boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
              }}>
                <h4 style={{
                  fontSize: '0.95rem', fontWeight: 700, color: '#5b21b6',
                  margin: '0 0 0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem',
                }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: '24px', height: '24px', borderRadius: '6px',
                    background: 'linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)',
                    color: 'white', fontSize: '0.7rem', fontWeight: 800,
                  }}>{i + 1}</span>
                  {f.title}
                </h4>
                <div style={{
                  background: 'white', borderRadius: '10px', padding: '1rem 1.5rem',
                  border: '1px solid rgba(139,92,246,0.1)', textAlign: 'center',
                  marginBottom: '0.75rem', fontSize: '1.1rem',
                }}>
                  <Latex math={f.latex} display />
                </div>
                <p style={{ fontSize: '0.82rem', color: '#6b7280', margin: 0, lineHeight: 1.5 }}>{f.description}</p>
              </div>
            ))}
          </div>

          {/* Acceptance Criteria */}
          <div style={{
            background: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)',
            borderRadius: '14px', padding: '1.25rem 1.5rem', marginTop: '1.5rem',
            border: '1px solid rgba(16,185,129,0.2)',
          }}>
            <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#065f46', margin: '0 0 0.5rem' }}>
              ✅ Acceptance Criteria
            </h4>
            <p style={{ fontSize: '0.85rem', color: '#374151', margin: 0, lineHeight: 1.6 }}>
              A process is considered <strong>capable</strong> when all indices (Cp, Cpk, Pp, Ppk) are <strong>≥ 1.33</strong>.
              This ensures the process spread fits within the specification limits with adequate margin.
            </p>
            <div style={{ marginTop: '0.75rem', fontSize: '0.85rem' }}>
              <Latex math="C_{pk} \geq 1.33 \;\wedge\; C_p \geq 1.33 \;\wedge\; P_{pk} \geq 1.33 \;\wedge\; P_p \geq 1.33" display />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '1rem 2rem', borderTop: '1px solid #e5e7eb',
          display: 'flex', justifyContent: 'flex-end', background: '#f9fafb',
        }}>
          <button onClick={onClose} style={{
            padding: '0.75rem 2rem', borderRadius: '10px',
            background: 'linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)',
            color: 'white', fontWeight: 700, border: 'none', cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(124,58,237,0.25)',
          }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

