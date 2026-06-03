'use client';

/**
 * Yield Statements Page
 * Displays all yield data from the database
 */

import React, { useState, useEffect } from 'react';
import Link from 'next/link';

interface IPackingDetail {
  itemCode: string;
  batchSize: string;
  batchUom: string;
  prodQty: number;
  packing: string;
  packQty: string;
  cQty: string;
}

interface YieldItem {
  _id: string;
  srNo: number;
  productName: string;
  productCode: string;
  batchNo: string;
  mfgDate: string;
  expDate: string;
  batchSizeLtrOrKg: string;
  batchSizeAddReReq?: string;
  packingDetails: IPackingDetail[];
  totalProducedQty: number;
  companyName?: string;
  plantAddress?: string;
  period?: string;
  testingQty: number;
  retainQty: number;
  mfgLossQty: number;
  residueSFG: string;
  actualYield: number;
  standardYield: number;
  startDate: string;
  completeDate: string;
  totalDays: number;
  varianceDays: number;
  sourceFile: string;
}

type SortField =
  | 'srNo' | 'productName' | 'productCode' | 'batchNo' | 'mfgDate' | 'actualYield' | 'totalDays'
  | 'varianceDays' | 'completeDate' | 'startDate' | 'batchSizeLtrOrKg' | 'batchSizeAddReReq'
  | 'testingQty' | 'retainQty' | 'mfgLossQty' | 'residueSFG' | 'standardYield' | 'totalProducedQty'
  | 'inBatchCreation';
type SortDirection = 'asc' | 'desc' | null;

export default function YieldPage() {
  const [data, setData] = useState<YieldItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [batchCreationNums, setBatchCreationNums] = useState<Set<string>>(new Set());
  const [batchDataLoaded, setBatchDataLoaded] = useState(false);
  const [errorsOnly, setErrorsOnly] = useState(false);

  const fetchData = async (search: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/yield?page=1&limit=10000&search=${encodeURIComponent(search)}`);
      const json = await res.json();
      if (json.success) {
        setData(json.data);
        setTotal(json.total);
      }
    } catch (err) {
      console.error('Failed to fetch data', err);
    }
    setLoading(false);
  };

  const fetchBatchCreation = async () => {
    try {
      const res = await fetch('/api/batch?page=1&limit=10000');
      const json = await res.json();
      if (json.success && json.data) {
        const nums = new Set<string>();
        (json.data as any[]).forEach((record: any) => {
          (record.batches || []).forEach((batch: any) => {
            const bn = (batch.batchNumber || '').toString().trim().toUpperCase();
            if (bn) nums.add(bn);
          });
        });
        setBatchCreationNums(nums);
      }
    } catch (err) {
      console.error('Failed to fetch batch creation data', err);
    } finally {
      setBatchDataLoaded(true);
    }
  };

  useEffect(() => {
    fetchData(searchTerm);
  }, [searchTerm]);

  useEffect(() => {
    fetchBatchCreation();
  }, []);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  };

  const isInBatchCreation = (batchNo: string) =>
    batchCreationNums.has((batchNo || '').toString().trim().toUpperCase());

  const getSortedData = () => {
    let sorted = [...data];

    if (errorsOnly) {
      sorted = sorted.filter(item => !isInBatchCreation(item.batchNo));
    }

    if (sortField && sortDirection) {
      sorted.sort((a, b) => {
        if (sortField === 'inBatchCreation') {
          const aV = isInBatchCreation(a.batchNo) ? 1 : 0;
          const bV = isInBatchCreation(b.batchNo) ? 1 : 0;
          return sortDirection === 'asc' ? aV - bV : bV - aV;
        }

        let aValue = a[sortField as keyof YieldItem] as any;
        let bValue = b[sortField as keyof YieldItem] as any;

        if (aValue === undefined || aValue === null) return sortDirection === 'asc' ? 1 : -1;
        if (bValue === undefined || bValue === null) return sortDirection === 'asc' ? -1 : 1;

        if (sortField === 'batchSizeLtrOrKg') {
          const aNum = parseFloat(String(aValue).split(' ')[0]) || 0;
          const bNum = parseFloat(String(bValue).split(' ')[0]) || 0;
          return sortDirection === 'asc' ? aNum - bNum : bNum - aNum;
        }

        let comparison = 0;
        if (typeof aValue === 'number' && typeof bValue === 'number') {
          comparison = aValue - bValue;
        } else {
          comparison = String(aValue).localeCompare(String(bValue));
        }
        return sortDirection === 'asc' ? comparison : -comparison;
      });
    }
    return sorted;
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      if (sortDirection === 'asc') setSortDirection('desc');
      else if (sortDirection === 'desc') { setSortDirection(null); setSortField(null); }
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const sortedData = getSortedData();
  const errorCount = batchDataLoaded ? data.filter(item => !isInBatchCreation(item.batchNo)).length : 0;

  const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch (e) {
      return dateString;
    }
  };

  const thBase: React.CSSProperties = {
    padding: '0.75rem',
    textAlign: 'left',
    fontSize: '0.65rem',
    fontWeight: '700',
    color: 'var(--muted-foreground)',
    textTransform: 'uppercase',
    borderRight: '1px solid var(--border)',
    cursor: 'pointer',
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--background)' }}>
      {/* Header */}
      <header style={{ background: 'var(--gradient-hero)', padding: '2rem 0', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '-50%', left: '-10%', width: '400px', height: '400px', background: 'rgba(255,255,255,0.05)', borderRadius: '50%', filter: 'blur(40px)' }} />
        <div style={{ position: 'absolute', bottom: '-30%', right: '-5%', width: '300px', height: '300px', background: 'rgba(255,255,255,0.05)', borderRadius: '50%', filter: 'blur(30px)' }} />
        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '0 2rem', position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h1 style={{ fontSize: 'clamp(1.5rem, 4vw, 2.25rem)', fontWeight: '700', color: 'white', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                  <polyline points="7.5 4.21 12 6.81 16.5 4.21" />
                  <polyline points="7.5 19.79 7.5 14.6 3 12" />
                  <polyline points="21 12 16.5 14.6 16.5 19.79" />
                  <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                  <line x1="12" y1="22.08" x2="12" y2="12" />
                </svg>
                Yield Statements
              </h1>
              <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '1rem' }}>
                Production Yield Data and Variances — {total} Records
              </p>
              {data.length > 0 && data[0].plantAddress && (
                <div style={{ marginTop: '1rem', fontSize: '0.85rem', color: 'rgba(255,255,255,0.9)', background: 'rgba(0,0,0,0.2)', padding: '0.75rem', borderRadius: '8px' }}>
                  <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>{data[0].companyName || 'YIELD STATEMENT'}</div>
                  <div>Location: ALL &nbsp;|&nbsp; Make: ALL &nbsp;|&nbsp; DEPT.: ALL</div>
                  <div>Plant Address: {data[0].plantAddress}</div>
                  {data[0].period && <div>Period: {data[0].period}</div>}
                </div>
              )}
            </div>
            <Link
              href="/"
              style={{ padding: '0.625rem 1.25rem', background: 'rgba(255,255,255,0.2)', color: 'white', border: 'none', borderRadius: 'var(--radius-md)', textDecoration: 'none', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '0.5rem', backdropFilter: 'blur(10px)' }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
              Back to Home
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main style={{ maxWidth: '1600px', margin: '0 auto', padding: '2rem' }}>
        {/* Search + Stats */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ flex: '1', minWidth: '300px', maxWidth: '500px' }}>
            <input
              type="text"
              placeholder="Search by Product Name, Code, Batch No..."
              value={searchTerm}
              onChange={handleSearch}
              style={{ width: '100%', padding: '0.875rem 1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--foreground)', fontSize: '0.875rem' }}
            />
          </div>

          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Total records */}
            <div style={{ padding: '0.75rem 1.25rem', borderRadius: 'var(--radius-md)', background: 'linear-gradient(135deg, rgba(139,92,246,0.1), rgba(168,85,247,0.1))', border: '1px solid rgba(139,92,246,0.2)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>Total Yield Records</div>
                <div style={{ fontSize: '1.25rem', fontWeight: '700', color: '#8b5cf6' }}>{total}</div>
              </div>
            </div>

            {/* Error count */}
            {batchDataLoaded && (
              <div style={{ padding: '0.75rem 1.25rem', borderRadius: 'var(--radius-md)', background: 'linear-gradient(135deg, rgba(239,68,68,0.1), rgba(220,38,38,0.1))', border: '1px solid rgba(239,68,68,0.25)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>Not in Batch Creation</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: '700', color: '#ef4444' }}>{errorCount}</div>
                </div>
              </div>
            )}

            {/* Errors-only toggle */}
            {batchDataLoaded && errorCount > 0 && (
              <button
                onClick={() => setErrorsOnly(v => !v)}
                style={{
                  padding: '0.75rem 1.25rem',
                  borderRadius: 'var(--radius-md)',
                  border: `2px solid ${errorsOnly ? '#ef4444' : 'var(--border)'}`,
                  background: errorsOnly ? '#fef2f2' : 'var(--card)',
                  color: errorsOnly ? '#dc2626' : 'var(--foreground)',
                  fontWeight: '700',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
              >
                <span>{errorsOnly ? '✕' : '⚠'}</span>
                {errorsOnly ? 'Show All' : 'Show Errors Only'}
              </button>
            )}
          </div>
        </div>

        {/* Table Card */}
        <div style={{ background: 'var(--card)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-md)', overflow: 'hidden' }}>
          <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: '600', color: 'var(--foreground)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
                <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
              </svg>
              Yield Data Records
              {errorsOnly && <span style={{ fontSize: '0.75rem', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '6px', padding: '2px 8px', fontWeight: 700 }}>Errors Only</span>}
            </h2>
            <span style={{ padding: '0.375rem 0.75rem', background: 'rgba(139,92,246,0.1)', color: '#8b5cf6', borderRadius: 'var(--radius-full)', fontSize: '0.75rem', fontWeight: '600' }}>
              Showing {sortedData.length} of {errorsOnly ? errorCount : total}
            </span>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ background: 'var(--muted)', borderBottom: '2px solid var(--border)' }}>
                <tr>
                  <th rowSpan={2} onClick={() => handleSort('srNo')} style={thBase}>SR.<br />NO. {sortField === 'srNo' && <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>}</th>
                  <th rowSpan={2} onClick={() => handleSort('productName')} style={{ ...thBase, minWidth: '150px' }}>PRODUCT NAME<br />PRODUCT CODE {sortField === 'productName' && <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>}</th>
                  <th rowSpan={2} onClick={() => handleSort('batchNo')} style={thBase}>BATCH<br />NO. {sortField === 'batchNo' && <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>}</th>
                  <th rowSpan={2} onClick={() => handleSort('inBatchCreation')} style={{ ...thBase, textAlign: 'center', whiteSpace: 'nowrap' }}>
                    IN BATCH<br />CREATION {sortField === 'inBatchCreation' && <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>}
                  </th>
                  <th rowSpan={2} onClick={() => handleSort('mfgDate')} style={{ ...thBase, minWidth: '90px' }}>MFG. DT.<br />EXP. DT. {sortField === 'mfgDate' && <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>}</th>
                  <th rowSpan={2} onClick={() => handleSort('batchSizeLtrOrKg')} style={{ ...thBase, minWidth: '110px' }}>BATCH SIZE<br />ADD : R.R. {sortField === 'batchSizeLtrOrKg' && <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>}</th>
                  <th colSpan={7} style={{ padding: '0.5rem', textAlign: 'center', fontSize: '0.65rem', fontWeight: '700', color: 'var(--muted-foreground)', textTransform: 'uppercase', borderBottom: '1px solid var(--border)', borderRight: '1px solid var(--border)' }}>
                    &lt;-----TRANSFER IN BONDED-----&gt;
                  </th>
                  <th rowSpan={2} onClick={() => handleSort('testingQty')} style={{ ...thBase, textAlign: 'right' }}>TESTING<br />QTY {sortField === 'testingQty' && <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>}</th>
                  <th rowSpan={2} onClick={() => handleSort('retainQty')} style={{ ...thBase, textAlign: 'right' }}>RETAIN<br />QTY {sortField === 'retainQty' && <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>}</th>
                  <th rowSpan={2} onClick={() => handleSort('mfgLossQty')} style={{ ...thBase, textAlign: 'right' }}>MFG.<br />LOSS QTY {sortField === 'mfgLossQty' && <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>}</th>
                  <th rowSpan={2} onClick={() => handleSort('residueSFG')} style={{ ...thBase, textAlign: 'right' }}>RESIDUE<br />S.F.G. {sortField === 'residueSFG' && <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>}</th>
                  <th rowSpan={2} onClick={() => handleSort('actualYield')} style={{ ...thBase, textAlign: 'right' }}>ACT.YIELD(%)<br />STD.YIELD {sortField === 'actualYield' && <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>}</th>
                  <th rowSpan={2} onClick={() => handleSort('startDate')} style={{ ...thBase, minWidth: '95px' }}>Start Dt.<br />Target Dt. {sortField === 'startDate' && <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>}</th>
                  <th rowSpan={2} onClick={() => handleSort('completeDate')} style={{ ...thBase, minWidth: '95px' }}>Complete Dt. {sortField === 'completeDate' && <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>}</th>
                  <th rowSpan={2} onClick={() => handleSort('totalDays')} style={{ ...thBase, textAlign: 'right', borderRight: 'none' }}>Total Days<br />Variance Days {sortField === 'totalDays' && <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>}</th>
                </tr>
                <tr>
                  <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontSize: '0.65rem', fontWeight: '700', color: 'var(--muted-foreground)', textTransform: 'uppercase', borderRight: '1px solid var(--border)' }}>ITEM CODE</th>
                  <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontSize: '0.65rem', fontWeight: '700', color: 'var(--muted-foreground)', textTransform: 'uppercase', borderRight: '1px solid var(--border)' }}>BAT SIZE</th>
                  <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontSize: '0.65rem', fontWeight: '700', color: 'var(--muted-foreground)', textTransform: 'uppercase', borderRight: '1px solid var(--border)' }}>UOM</th>
                  <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontSize: '0.65rem', fontWeight: '700', color: 'var(--muted-foreground)', textTransform: 'uppercase', borderRight: '1px solid var(--border)' }}>PROD QTY</th>
                  <th onClick={() => handleSort('totalProducedQty')} style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontSize: '0.65rem', fontWeight: '700', color: 'var(--muted-foreground)', textTransform: 'uppercase', borderRight: '1px solid var(--border)', cursor: 'pointer' }}>
                    PACK {sortField === 'totalProducedQty' && <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>}
                  </th>
                  <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontSize: '0.65rem', fontWeight: '700', color: 'var(--muted-foreground)', textTransform: 'uppercase', borderRight: '1px solid var(--border)' }}>PACK QTY</th>
                  <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontSize: '0.65rem', fontWeight: '700', color: 'var(--muted-foreground)', textTransform: 'uppercase', borderRight: '1px solid var(--border)' }}>CQTY</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={17} style={{ padding: '3rem', textAlign: 'center', color: 'var(--muted-foreground)' }}>
                      <svg className="animate-spin" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ display: 'inline-block', marginBottom: '0.5rem' }}>
                        <path d="M21 12a9 9 0 11-6.219-8.56" strokeLinecap="round" />
                      </svg>
                      <div>Loading yields...</div>
                    </td>
                  </tr>
                ) : sortedData.length === 0 ? (
                  <tr>
                    <td colSpan={17} style={{ padding: '3rem', textAlign: 'center', color: 'var(--muted-foreground)' }}>
                      <div style={{ fontSize: '1.125rem', fontWeight: '500' }}>
                        {errorsOnly ? 'No errors — all yield batches exist in Batch Creation' : 'No yields found'}
                      </div>
                      <div style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
                        {searchTerm ? 'Try a different search term' : errorsOnly ? '' : 'Upload a Yield Statement XML file from the home page'}
                      </div>
                    </td>
                  </tr>
                ) : (
                  sortedData.map((item, index) => {
                    const inBC = batchDataLoaded ? isInBatchCreation(item.batchNo) : null;
                    return (
                      <tr
                        key={item._id}
                        style={{
                          borderBottom: '1px solid var(--border)',
                          background: !inBC && batchDataLoaded
                            ? (index % 2 === 0 ? '#fff5f5' : '#fff0f0')
                            : (index % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.02)'),
                        }}
                      >
                        <td style={{ padding: '0.75rem', fontSize: '0.8rem', color: 'var(--foreground)', verticalAlign: 'top', borderRight: '1px solid var(--border)' }}>
                          {item.srNo}
                        </td>
                        <td style={{ padding: '0.75rem', fontSize: '0.8rem', color: 'var(--foreground)', verticalAlign: 'top', borderRight: '1px solid var(--border)' }}>
                          <div style={{ fontWeight: '500' }}>{item.productName}</div>
                          <div style={{ color: 'var(--muted-foreground)', marginTop: '0.25rem' }}>{item.productCode}</div>
                        </td>
                        <td style={{ padding: '0.75rem', fontSize: '0.8rem', fontWeight: '500', color: 'var(--primary)', verticalAlign: 'top', borderRight: '1px solid var(--border)' }}>
                          {item.batchNo}
                        </td>

                        {/* In Batch Creation column */}
                        <td style={{ padding: '0.75rem', fontSize: '0.8rem', verticalAlign: 'top', borderRight: '1px solid var(--border)', textAlign: 'center' }}>
                          {!batchDataLoaded ? (
                            <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>…</span>
                          ) : inBC ? (
                            <span style={{
                              display: 'inline-block',
                              padding: '2px 10px',
                              borderRadius: '12px',
                              background: '#dcfce7',
                              color: '#16a34a',
                              fontWeight: 700,
                              fontSize: '0.75rem',
                            }}>Yes</span>
                          ) : (
                            <span style={{
                              display: 'inline-block',
                              padding: '2px 10px',
                              borderRadius: '12px',
                              background: '#fee2e2',
                              color: '#dc2626',
                              fontWeight: 700,
                              fontSize: '0.75rem',
                            }}>No</span>
                          )}
                        </td>

                        <td style={{ padding: '0.75rem', fontSize: '0.8rem', color: 'var(--foreground)', verticalAlign: 'top', borderRight: '1px solid var(--border)' }}>
                          <div>{formatDate(item.mfgDate).toUpperCase()}</div>
                          <div style={{ marginTop: '0.25rem' }}>{formatDate(item.expDate).toUpperCase()}</div>
                        </td>
                        <td style={{ padding: '0.75rem', fontSize: '0.8rem', color: 'var(--foreground)', verticalAlign: 'top', borderRight: '1px solid var(--border)' }}>
                          <div>{item.batchSizeLtrOrKg}</div>
                          {item.batchSizeAddReReq && <div style={{ marginTop: '0.25rem' }}>{item.batchSizeAddReReq}</div>}
                        </td>

                        {/* Packing Details Block */}
                        <td style={{ padding: '0.75rem', fontSize: '0.8rem', color: 'var(--foreground)', verticalAlign: 'top', borderRight: '1px solid var(--border)', fontFamily: 'monospace' }}>
                          {(item.packingDetails || []).map((p, i) => <div key={i} style={{ marginBottom: '0.25rem' }}>{p.itemCode || '-'}</div>)}
                        </td>
                        <td style={{ padding: '0.75rem', fontSize: '0.8rem', color: 'var(--foreground)', textAlign: 'right', verticalAlign: 'top', borderRight: '1px solid var(--border)' }}>
                          {(item.packingDetails || []).map((p, i) => <div key={i} style={{ marginBottom: '0.25rem' }}>{p.batchSize || '-'}</div>)}
                        </td>
                        <td style={{ padding: '0.75rem', fontSize: '0.8rem', color: 'var(--foreground)', verticalAlign: 'top', borderRight: '1px solid var(--border)' }}>
                          {(item.packingDetails || []).map((p, i) => <div key={i} style={{ marginBottom: '0.25rem' }}>{p.batchUom || '-'}</div>)}
                        </td>
                        <td style={{ padding: '0.75rem', fontSize: '0.8rem', color: 'var(--foreground)', textAlign: 'right', verticalAlign: 'top', borderRight: '1px solid var(--border)' }}>
                          {(item.packingDetails || []).map((p, i) => <div key={i} style={{ marginBottom: '0.25rem' }}>{p.prodQty?.toFixed(3)}</div>)}
                          {(item.packingDetails || []).length > 1 && <div style={{ marginTop: '0.5rem', fontWeight: '600', borderTop: '1px solid var(--border)', paddingTop: '0.25rem' }}>{item.totalProducedQty?.toFixed(3)}</div>}
                        </td>
                        <td style={{ padding: '0.75rem', fontSize: '0.8rem', color: 'var(--foreground)', verticalAlign: 'top', borderRight: '1px solid var(--border)' }}>
                          {(item.packingDetails || []).map((p, i) => <div key={i} style={{ marginBottom: '0.25rem' }}>{p.packing || '-'}</div>)}
                        </td>
                        <td style={{ padding: '0.75rem', fontSize: '0.8rem', color: 'var(--foreground)', textAlign: 'right', verticalAlign: 'top', borderRight: '1px solid var(--border)' }}>
                          {(item.packingDetails || []).map((p, i) => <div key={i} style={{ marginBottom: '0.25rem' }}>{p.packQty || '-'}</div>)}
                        </td>
                        <td style={{ padding: '0.75rem', fontSize: '0.8rem', color: 'var(--foreground)', textAlign: 'right', verticalAlign: 'top', borderRight: '1px solid var(--border)' }}>
                          {(item.packingDetails || []).map((p, i) => <div key={i} style={{ marginBottom: '0.25rem' }}>{p.cQty || '-'}</div>)}
                        </td>

                        <td style={{ padding: '0.75rem', fontSize: '0.8rem', color: 'var(--foreground)', textAlign: 'right', verticalAlign: 'top', borderRight: '1px solid var(--border)' }}>
                          {item.testingQty?.toFixed(3)}
                        </td>
                        <td style={{ padding: '0.75rem', fontSize: '0.8rem', color: 'var(--foreground)', textAlign: 'right', verticalAlign: 'top', borderRight: '1px solid var(--border)' }}>
                          {item.retainQty?.toFixed(3)}
                        </td>
                        <td style={{ padding: '0.75rem', fontSize: '0.8rem', color: 'var(--foreground)', textAlign: 'right', verticalAlign: 'top', borderRight: '1px solid var(--border)' }}>
                          {item.mfgLossQty?.toFixed(3)}
                        </td>
                        <td style={{ padding: '0.75rem', fontSize: '0.8rem', color: 'var(--foreground)', textAlign: 'right', verticalAlign: 'top', borderRight: '1px solid var(--border)' }}>
                          {item.residueSFG || ''}
                        </td>
                        <td style={{ padding: '0.75rem', fontSize: '0.8rem', color: 'var(--foreground)', textAlign: 'right', verticalAlign: 'top', borderRight: '1px solid var(--border)' }}>
                          <div style={{ color: item.actualYield >= item.standardYield ? '#10b981' : '#ef4444', fontWeight: '600' }}>
                            {item.actualYield?.toFixed(2)}
                          </div>
                          <div style={{ color: 'var(--muted-foreground)', marginTop: '0.25rem' }}>
                            {item.standardYield?.toFixed(2)}
                          </div>
                        </td>
                        <td style={{ padding: '0.75rem', fontSize: '0.8rem', color: 'var(--foreground)', verticalAlign: 'top', borderRight: '1px solid var(--border)' }}>
                          <div>{formatDate(item.startDate)}</div>
                          <div style={{ color: 'var(--muted-foreground)', marginTop: '0.25rem' }}>{formatDate(item.startDate)}</div>
                        </td>
                        <td style={{ padding: '0.75rem', fontSize: '0.8rem', color: 'var(--foreground)', verticalAlign: 'top', borderRight: '1px solid var(--border)' }}>
                          {formatDate(item.completeDate)}
                        </td>
                        <td style={{ padding: '0.75rem', fontSize: '0.8rem', color: 'var(--foreground)', textAlign: 'right', verticalAlign: 'top' }}>
                          <div>{item.totalDays}</div>
                          <div style={{ marginTop: '0.25rem', color: item.varianceDays > 0 ? '#ef4444' : item.varianceDays < 0 ? '#10b981' : 'inherit' }}>
                            {item.varianceDays}
                          </div>
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
