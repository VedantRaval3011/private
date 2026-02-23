'use client';

/**
 * Rejected Data Page
 * Displays Material Rejection records parsed from XML files
 */

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

interface RejectionRecord {
    _id: string;
    arNumber: string;
    arDate: string;
    grDate: string;
    materialCode: string;
    materialName: string;
    vendorName: string;
    receivedQty: number;
    unit: string;
    status: string;
    sourceFile: string;
}

export default function RejectedDataPage() {
    const [data, setData] = useState<RejectionRecord[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [limit] = useState(20);
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [sortBy, setSortBy] = useState('arDate');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

    // Scan & Process state
    const [isProcessing, setIsProcessing] = useState(false);
    const [processMessage, setProcessMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const headers = [
        { key: 'srNo', label: 'SR#', sortable: false },
        { key: 'arNumber', label: 'AR Number', sortable: true },
        { key: 'arDate', label: 'AR Date', sortable: true },
        { key: 'grDate', label: 'GR Date', sortable: true },
        { key: 'materialCode', label: 'Material Code', sortable: true },
        { key: 'materialName', label: 'Material Name', sortable: true },
        { key: 'vendorName', label: 'Vendor Name', sortable: true },
        { key: 'receivedQty', label: 'Received Qty', sortable: true, align: 'right' },
        { key: 'status', label: 'Status', sortable: false },
    ];

    const handleSort = (key: string) => {
        if (sortBy === key) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        } else {
            setSortBy(key);
            setSortOrder('asc');
        }
    };

    // Debounce search
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(search.trim());
            setPage(1);
        }, 500);
        return () => clearTimeout(timer);
    }, [search]);

    // Fetch data
    const fetchData = useCallback(async () => {
        setIsLoading(true);
        try {
            const params = new URLSearchParams({
                page: page.toString(),
                limit: limit.toString(),
                sortBy,
                sortOrder,
                ...(debouncedSearch && { search: debouncedSearch }),
            });

            const response = await fetch(`/api/rejection?${params}`);
            const result = await response.json();

            if (result.success) {
                setData(result.data);
                setTotal(result.total);
            }
        } catch (error) {
            console.error('Error fetching rejection data:', error);
        } finally {
            setIsLoading(false);
        }
    }, [page, limit, debouncedSearch, sortBy, sortOrder]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Scan & Process
    const handleScanAndProcess = async () => {
        setIsProcessing(true);
        setProcessMessage(null);

        try {
            const response = await fetch('/api/rejection/process', { method: 'POST' });
            const result = await response.json();

            if (result.success) {
                setProcessMessage({
                    type: 'success',
                    text: result.message || `Successfully processed rejection files`,
                });
                await fetchData();
            } else {
                setProcessMessage({
                    type: 'error',
                    text: result.message || 'Processing failed',
                });
            }
        } catch (error) {
            setProcessMessage({
                type: 'error',
                text: error instanceof Error ? error.message : 'Unknown error occurred',
            });
        } finally {
            setIsProcessing(false);
        }
    };

    const totalPages = Math.ceil(total / limit);
    const startIndex = (page - 1) * limit;

    return (
        <div style={{ minHeight: '100vh', background: 'var(--background)' }}>
            {/* Header */}
            <header style={{
                background: 'linear-gradient(135deg, #dc2626 0%, #991b1b 50%, #7f1d1d 100%)',
                padding: '2rem 0',
                position: 'relative',
                overflow: 'hidden',
                marginBottom: '2rem',
            }}>
                {/* Decorative blobs */}
                <div style={{
                    position: 'absolute', top: '-50%', left: '-10%',
                    width: '400px', height: '400px',
                    background: 'rgba(255,255,255,0.05)',
                    borderRadius: '50%', filter: 'blur(40px)',
                }} />
                <div style={{
                    position: 'absolute', bottom: '-30%', right: '-5%',
                    width: '300px', height: '300px',
                    background: 'rgba(255,255,255,0.05)',
                    borderRadius: '50%', filter: 'blur(30px)',
                }} />

                <div style={{
                    maxWidth: '1400px', margin: '0 auto', padding: '0 2rem',
                    position: 'relative', zIndex: 1,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                    <div>
                        <h1 style={{
                            fontSize: '2.25rem', fontWeight: '700', color: 'white',
                            marginBottom: '0.25rem',
                            display: 'flex', alignItems: 'center', gap: '0.75rem',
                        }}>
                            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="10" />
                                <line x1="15" y1="9" x2="9" y2="15" />
                                <line x1="9" y1="9" x2="15" y2="15" />
                            </svg>
                            Material Rejection Data
                        </h1>
                        <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '1rem' }}>
                            View all rejected material records · {total} total records
                        </p>
                    </div>

                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                        <button
                            onClick={handleScanAndProcess}
                            disabled={isProcessing}
                            style={{
                                padding: '0.625rem 1.5rem',
                                background: isProcessing ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.2)',
                                color: 'white',
                                borderRadius: '8px',
                                border: '1px solid rgba(255,255,255,0.3)',
                                cursor: isProcessing ? 'not-allowed' : 'pointer',
                                fontWeight: '600',
                                fontSize: '0.95rem',
                                display: 'flex', alignItems: 'center', gap: '0.5rem',
                                backdropFilter: 'blur(10px)',
                                transition: 'all 0.2s',
                                opacity: isProcessing ? 0.7 : 1,
                            }}
                        >
                            {isProcessing ? (
                                <>
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
                                        <path d="M21 12a9 9 0 11-6.219-8.56" />
                                    </svg>
                                    Processing...
                                </>
                            ) : (
                                <>
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
                                    </svg>
                                    Scan &amp; Process
                                </>
                            )}
                        </button>

                        <Link
                            href="/"
                            style={{
                                padding: '0.625rem 1.25rem',
                                background: 'rgba(255,255,255,0.1)',
                                color: 'white',
                                borderRadius: '8px',
                                backdropFilter: 'blur(10px)',
                                textDecoration: 'none',
                                fontWeight: '500',
                                display: 'flex', alignItems: 'center', gap: '0.5rem',
                                border: '1px solid rgba(255,255,255,0.2)',
                            }}
                        >
                            ← Dashboard
                        </Link>
                    </div>
                </div>
            </header>

            {/* Process Message */}
            {processMessage && (
                <div style={{ maxWidth: '1400px', margin: '-1rem auto 1rem', padding: '0 2rem' }}>
                    <div style={{
                        padding: '1rem 1.5rem',
                        borderRadius: '8px',
                        background: processMessage.type === 'success' ? '#f0fdf4' : '#fef2f2',
                        border: `1px solid ${processMessage.type === 'success' ? '#bbf7d0' : '#fecaca'}`,
                        color: processMessage.type === 'success' ? '#166534' : '#991b1b',
                        display: 'flex', alignItems: 'center', gap: '0.75rem',
                    }}>
                        <span style={{ fontSize: '1.25rem' }}>
                            {processMessage.type === 'success' ? '✅' : '❌'}
                        </span>
                        {processMessage.text}
                        <button
                            onClick={() => setProcessMessage(null)}
                            style={{
                                marginLeft: 'auto', background: 'transparent',
                                border: 'none', cursor: 'pointer', fontSize: '1.2rem', opacity: 0.7,
                            }}
                        >×</button>
                    </div>
                </div>
            )}

            {/* Main Content */}
            <main style={{ maxWidth: '1400px', margin: '0 auto', padding: '0 2rem 2rem' }}>
                {/* Controls */}
                <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    marginBottom: '1.5rem', gap: '1rem', flexWrap: 'wrap',
                }}>
                    <div style={{ flex: 1, minWidth: '300px' }}>
                        <input
                            type="text"
                            placeholder="Search by AR Number, Material Code, Material Name, Vendor..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            style={{
                                width: '100%', padding: '0.75rem 1rem',
                                borderRadius: '8px', border: '1px solid var(--border)',
                                outline: 'none', fontSize: '1rem',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                            }}
                        />
                    </div>
                    <div style={{ color: 'var(--muted-foreground)', whiteSpace: 'nowrap' }}>
                        Total Records: <strong>{total}</strong>
                    </div>
                </div>

                {/* Table */}
                <div style={{
                    background: 'white', borderRadius: '12px',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
                    overflow: 'hidden', border: '1px solid var(--border)',
                }}>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                            <thead>
                                <tr style={{ background: '#fef2f2', borderBottom: '2px solid #fecaca' }}>
                                    {headers.map(header => (
                                        <th
                                            key={header.key}
                                            onClick={() => header.sortable && handleSort(header.key)}
                                            style={{
                                                padding: '1rem',
                                                textAlign: (header.align as any) || 'left',
                                                fontWeight: '600',
                                                color: '#7f1d1d',
                                                cursor: header.sortable ? 'pointer' : 'default',
                                                userSelect: 'none',
                                                whiteSpace: 'nowrap',
                                            }}
                                        >
                                            <div style={{
                                                display: 'flex', alignItems: 'center',
                                                justifyContent: header.align === 'right' ? 'flex-end' : 'flex-start',
                                                gap: '0.4rem',
                                            }}>
                                                {header.label}
                                                {header.sortable && (
                                                    sortBy === header.key ? (
                                                        <span style={{ color: '#dc2626', fontSize: '0.8rem' }}>
                                                            {sortOrder === 'asc' ? '▲' : '▼'}
                                                        </span>
                                                    ) : (
                                                        <span style={{ color: '#fca5a5', fontSize: '0.8rem', opacity: 0.6 }}>↕</span>
                                                    )
                                                )}
                                            </div>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {isLoading ? (
                                    <tr>
                                        <td colSpan={9} style={{ padding: '3rem', textAlign: 'center', color: 'var(--muted-foreground)' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                                                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" style={{ animation: 'spin 1s linear infinite', opacity: 0.6 }}>
                                                    <path d="M21 12a9 9 0 11-6.219-8.56" />
                                                </svg>
                                                Loading rejection records...
                                            </div>
                                        </td>
                                    </tr>
                                ) : data.length === 0 ? (
                                    <tr>
                                        <td colSpan={9} style={{ padding: '3rem', textAlign: 'center', color: 'var(--muted-foreground)' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                                                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="1.5" style={{ opacity: 0.4 }}>
                                                    <circle cx="12" cy="12" r="10" />
                                                    <line x1="15" y1="9" x2="9" y2="15" />
                                                    <line x1="9" y1="9" x2="15" y2="15" />
                                                </svg>
                                                <div>
                                                    <p style={{ fontWeight: '600', marginBottom: '0.25rem' }}>No rejection records found</p>
                                                    <p style={{ fontSize: '0.875rem' }}>
                                                        {search ? 'Try a different search term.' : 'Click "Scan & Process" to import Material Rejection XML files.'}
                                                    </p>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    data.map((item, index) => (
                                        <tr
                                            key={item._id}
                                            style={{
                                                borderBottom: '1px solid #fee2e2',
                                                transition: 'background 0.15s',
                                            }}
                                            onMouseEnter={e => (e.currentTarget.style.background = '#fff5f5')}
                                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                        >
                                            <td style={{ padding: '0.75rem 1rem', color: '#9ca3af', fontSize: '0.85rem', fontWeight: '500' }}>
                                                {startIndex + index + 1}
                                            </td>
                                            <td style={{ padding: '0.75rem 1rem', color: '#dc2626', fontWeight: '600', fontFamily: 'monospace', fontSize: '0.875rem' }}>
                                                {item.arNumber}
                                            </td>
                                            <td style={{ padding: '0.75rem 1rem', whiteSpace: 'nowrap' }}>
                                                {item.arDate || '-'}
                                            </td>
                                            <td style={{ padding: '0.75rem 1rem', whiteSpace: 'nowrap', color: '#6b7280' }}>
                                                {item.grDate || '-'}
                                            </td>
                                            <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', fontSize: '0.85rem', color: '#7c3aed', fontWeight: '500' }}>
                                                {item.materialCode || '-'}
                                            </td>
                                            <td style={{ padding: '0.75rem 1rem', maxWidth: '280px' }}>
                                                <div style={{ fontWeight: '500', lineHeight: '1.3' }}>
                                                    {item.materialName}
                                                </div>
                                            </td>
                                            <td style={{ padding: '0.75rem 1rem', fontWeight: '500' }}>
                                                {item.vendorName || '-'}
                                            </td>
                                            <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: '600' }}>
                                                {item.receivedQty?.toLocaleString()}
                                                <span style={{ color: '#9ca3af', fontSize: '0.8em', marginLeft: '0.25rem' }}>
                                                    {item.unit}
                                                </span>
                                            </td>
                                            <td style={{ padding: '0.75rem 1rem' }}>
                                                <span style={{
                                                    display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                                                    padding: '0.25rem 0.75rem',
                                                    background: '#fef2f2', color: '#dc2626',
                                                    borderRadius: '999px', fontSize: '0.78rem', fontWeight: '600',
                                                    border: '1px solid #fecaca',
                                                }}>
                                                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#dc2626', display: 'inline-block' }} />
                                                    REJECTED
                                                </span>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div style={{
                            padding: '1rem 1.5rem',
                            borderTop: '1px solid #fee2e2',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            background: '#fff5f5',
                        }}>
                            <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                                Showing {startIndex + 1}–{Math.min(startIndex + limit, total)} of {total} records
                            </span>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button
                                    onClick={() => setPage(p => Math.max(1, p - 1))}
                                    disabled={page === 1}
                                    style={{
                                        padding: '0.5rem 1rem',
                                        border: '1px solid #fecaca',
                                        borderRadius: '6px',
                                        background: page === 1 ? '#fef2f2' : 'white',
                                        cursor: page === 1 ? 'not-allowed' : 'pointer',
                                        color: page === 1 ? '#fca5a5' : '#dc2626',
                                        fontWeight: '500',
                                    }}
                                >
                                    ← Previous
                                </button>
                                <span style={{ display: 'flex', alignItems: 'center', padding: '0 0.75rem', fontSize: '0.9rem', color: '#374151' }}>
                                    Page {page} of {totalPages}
                                </span>
                                <button
                                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                    disabled={page >= totalPages}
                                    style={{
                                        padding: '0.5rem 1rem',
                                        border: '1px solid #fecaca',
                                        borderRadius: '6px',
                                        background: page >= totalPages ? '#fef2f2' : 'white',
                                        cursor: page >= totalPages ? 'not-allowed' : 'pointer',
                                        color: page >= totalPages ? '#fca5a5' : '#dc2626',
                                        fontWeight: '500',
                                    }}
                                >
                                    Next →
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </main>

            <style>{`
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
}
