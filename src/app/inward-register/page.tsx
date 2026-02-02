'use client';

/**
 * Inward Register Page
 * Displays parsed Material Inward Register data
 */

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import type { InwardRegisterRecord, InwardRegisterListResponse } from '@/types/inward';

export default function InwardRegisterPage() {
    const [inwardData, setInwardData] = useState<InwardRegisterRecord[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [limit] = useState(20);
    const [search, setSearch] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [sortBy, setSortBy] = useState('uploadedAt');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

    // Header definition for easier rendering
    const headers = [
        { key: 'inwardNumber', label: 'Inward No' },
        { key: 'inwardDate', label: 'Inward Date' },
        { key: 'vendorName', label: 'Vendor Name' },
        { key: 'materialName', label: 'Material Name' },
        { key: 'batchNumber', label: 'Batch No' },
        { key: 'arNumber', label: 'AR Number' },
        { key: 'receivedQuantity', label: 'Received Qty', align: 'right' },
        { key: 'sourceFile', label: 'Source File' }
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
            setDebouncedSearch(search);
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

            const response = await fetch(`/api/inward?${params}`);
            const data: InwardRegisterListResponse = await response.json();

            if (data.success) {
                setInwardData(data.data);
                setTotal(data.total);
            }
        } catch (error) {
            console.error('Error fetching inward data:', error);
        } finally {
            setIsLoading(false);
        }
    }, [page, limit, debouncedSearch, sortBy, sortOrder]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const totalPages = Math.ceil(total / limit);

    return (
        <div style={{
            minHeight: '100vh',
            background: 'var(--background)',
        }}>
            {/* Header */}
            <header style={{
                background: 'var(--gradient-hero)',
                padding: '2rem 0',
                position: 'relative',
                overflow: 'hidden',
                marginBottom: '2rem',
            }}>
                <div style={{
                    maxWidth: '1400px',
                    margin: '0 auto',
                    padding: '0 2rem',
                    position: 'relative',
                    zIndex: 1,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center"
                }}>
                    <div>
                        <h1 style={{
                            fontSize: '2.25rem',
                            fontWeight: '700',
                            color: 'white',
                            marginBottom: '0.25rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.75rem',
                        }}>
                            Material Inward Register
                        </h1>
                        <p style={{
                            color: 'rgba(255, 255, 255, 0.8)',
                            fontSize: '1rem',
                        }}>
                            View and manage inward material records
                        </p>
                    </div>
                    <Link
                        href="/"
                        style={{
                            padding: '0.625rem 1.25rem',
                            background: 'rgba(255, 255, 255, 0.1)',
                            color: 'white',
                            borderRadius: 'var(--radius-md)',
                            backdropFilter: 'blur(10px)',
                            textDecoration: 'none',
                            fontWeight: '500',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            border: '1px solid rgba(255,255,255,0.2)'
                        }}
                    >
                        Back to Dashboard
                    </Link>
                </div>
            </header>

            {/* Content */}
            <main style={{
                maxWidth: '1400px',
                margin: '0 auto',
                padding: '0 2rem 2rem',
            }}>
                {/* Controls */}
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '1.5rem',
                    gap: '1rem',
                    flexWrap: 'wrap'
                }}>
                    <div style={{ flex: 1, minWidth: '300px' }}>
                        <input
                            type="text"
                            placeholder="Search by Vendor, Inward No, AR No, Material..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '0.75rem 1rem',
                                borderRadius: 'var(--radius-md)',
                                border: '1px solid var(--border)',
                                outline: 'none',
                                fontSize: '1rem',
                                boxShadow: 'var(--shadow-sm)',
                            }}
                        />
                    </div>
                    <div style={{ color: 'var(--muted-foreground)' }}>
                        Total Records: <strong>{total}</strong>
                    </div>
                </div>

                {/* Table */}
                <div style={{
                    background: 'white',
                    borderRadius: 'var(--radius-lg)',
                    boxShadow: 'var(--shadow-md)',
                    overflow: 'hidden',
                    border: '1px solid var(--border)',
                }}>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                            <thead>
                                <tr style={{ background: 'var(--primary-50)', borderBottom: '1px solid var(--border)' }}>
                                    {headers.map(header => (
                                        <th
                                            key={header.key}
                                            onClick={() => handleSort(header.key)}
                                            style={{
                                                padding: '1rem',
                                                textAlign: header.align as any || 'left',
                                                fontWeight: '600',
                                                color: 'var(--foreground)',
                                                cursor: 'pointer',
                                                userSelect: 'none',
                                                whiteSpace: 'nowrap'
                                            }}
                                            title="Click to sort"
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: header.align === 'right' ? 'flex-end' : 'flex-start', gap: '0.5rem' }}>
                                                {header.label}
                                                {sortBy === header.key ? (
                                                    <span style={{ color: 'var(--primary-600)', fontSize: '0.8rem' }}>
                                                        {sortOrder === 'asc' ? '▲' : '▼'}
                                                    </span>
                                                ) : (
                                                    <span style={{ color: 'var(--muted-foreground)', fontSize: '0.8rem', opacity: 0.5 }}>
                                                        ↕
                                                    </span>
                                                )}
                                            </div>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {isLoading ? (
                                    <tr>
                                        <td colSpan={8} style={{ padding: '2rem', textAlign: 'center', color: 'var(--muted-foreground)' }}>
                                            Loading data...
                                        </td>
                                    </tr>
                                ) : inwardData.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} style={{ padding: '2rem', textAlign: 'center', color: 'var(--muted-foreground)' }}>
                                            No records found. Try uploading Inward Register XML files.
                                        </td>
                                    </tr>
                                ) : (
                                    inwardData.map((item, index) => (
                                        <tr key={item._id || index} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.2s', cursor: 'default' }}
                                            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--primary-50)'}
                                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                        >
                                            <td style={{ padding: '0.75rem 1rem', color: 'var(--primary-700)', fontWeight: '500' }}>{item.inwardNumber}</td>
                                            <td style={{ padding: '0.75rem 1rem' }}>{item.inwardDate || '-'}</td>
                                            <td style={{ padding: '0.75rem 1rem', fontWeight: '500' }}>{item.vendorName}</td>
                                            <td style={{ padding: '0.75rem 1rem' }}>{item.materialName}</td>
                                            <td style={{ padding: '0.75rem 1rem' }}>{item.batchNumber || '-'}</td>
                                            <td style={{ padding: '0.75rem 1rem', color: item.arNumber ? 'var(--foreground)' : 'var(--muted-foreground)' }}>
                                                {item.arNumber || 'N/A'}
                                            </td>
                                            <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>{item.receivedQuantity}</td>
                                            <td style={{ padding: '0.75rem 1rem', fontSize: '0.8rem', color: 'var(--muted-foreground)' }}>
                                                {item.sourceFile.replace('.XML', '')}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    <div style={{
                        padding: '1rem',
                        borderTop: '1px solid var(--border)',
                        display: 'flex',
                        justifyContent: 'flex-end',
                        gap: '0.5rem',
                        background: 'var(--background-alt)'
                    }}>
                        <button
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={page === 1}
                            style={{
                                padding: '0.5rem 1rem',
                                border: '1px solid var(--border)',
                                borderRadius: 'var(--radius-md)',
                                background: page === 1 ? 'var(--background)' : 'white',
                                cursor: page === 1 ? 'not-allowed' : 'pointer',
                                color: page === 1 ? 'var(--muted-foreground)' : 'var(--foreground)',
                            }}
                        >
                            Previous
                        </button>
                        <span style={{ display: 'flex', alignItems: 'center', padding: '0 0.5rem', fontSize: '0.9rem' }}>
                            Page {page} of {totalPages || 1}
                        </span>
                        <button
                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                            disabled={page >= totalPages}
                            style={{
                                padding: '0.5rem 1rem',
                                border: '1px solid var(--border)',
                                borderRadius: 'var(--radius-md)',
                                background: page >= totalPages ? 'var(--background)' : 'white',
                                cursor: page >= totalPages ? 'not-allowed' : 'pointer',
                                color: page >= totalPages ? 'var(--muted-foreground)' : 'var(--foreground)',
                            }}
                        >
                            Next
                        </button>
                    </div>
                </div>
            </main>
        </div>
    );
}
