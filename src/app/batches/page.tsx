'use client';

/**
 * Batches Page - View All Batches
 * Shows all batch data with two viewing modes:
 * 1. Unique Batches - Grouped by batch number (deduplicated)
 * 2. All Batches - Flat list of every batch record
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';

interface BatchRecordItem {
    srNo: number;
    batchNumber: string;
    itemCode: string;
    itemName: string;
    itemDetail: string;
    mfgDate: string;
    expiryDate: string;
    batchSize: string;
    batchUom: string;
    unit: string;
    mfgLicNo: string;
    department: string;
    pack: string;
    type: string;
    year: string;
    make: string;
    locationId: string;
    mrpValue: string | null;
    conversionRatio: string;
    batchCompletionDate?: string;
}

interface BatchRegistryRecord {
    _id: string;
    companyName: string;
    companyAddress: string;
    fileName: string;
    fileSize: number;
    batches: BatchRecordItem[];
    uploadedAt: string;
}

interface BatchWithSource extends BatchRecordItem {
    sourceFileName: string;
    sourceCompanyName: string;
    uploadedAt: string;
}

interface UniqueBatchGroup {
    batchNumber: string;
    items: BatchWithSource[];
    firstItem: BatchWithSource;
    count: number;
}

// Sort options
type SortOption = 'batch-asc' | 'batch-desc' | 'mfg-asc' | 'mfg-desc' | 'expiry-asc' | 'expiry-desc' | 'count-desc' | 'count-asc' | 'code-asc' | 'code-desc';

const SORT_OPTIONS: { value: SortOption; label: string; icon: string }[] = [
    { value: 'count-desc', label: 'Most Records First', icon: '📊' },
    { value: 'count-asc', label: 'Least Records First', icon: '📉' },
    { value: 'batch-asc', label: 'Batch No (A-Z)', icon: '🔤' },
    { value: 'batch-desc', label: 'Batch No (Z-A)', icon: '🔤' },
    { value: 'mfg-desc', label: 'Mfg Date (Newest)', icon: '📅' },
    { value: 'mfg-asc', label: 'Mfg Date (Oldest)', icon: '📅' },
    { value: 'expiry-desc', label: 'Expiry (Latest)', icon: '⏰' },
    { value: 'expiry-asc', label: 'Expiry (Earliest)', icon: '⏰' },
    { value: 'code-asc', label: 'Item Code (A-Z)', icon: '🏷️' },
    { value: 'code-desc', label: 'Item Code (Z-A)', icon: '🏷️' },
];

// Helper to parse date strings for comparison
const parseDate = (dateStr: string): number => {
    if (!dateStr || dateStr === 'N/A') return 0;
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? 0 : date.getTime();
};

export default function BatchesPage() {
    const [allBatches, setAllBatches] = useState<BatchWithSource[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [viewMode, setViewMode] = useState<'unique' | 'all'>('unique');
    const [searchTerm, setSearchTerm] = useState('');
    const [expandedBatches, setExpandedBatches] = useState<Set<string>>(new Set());
    const [sortBy, setSortBy] = useState<SortOption>('count-desc');

    // Fetch all batches
    const fetchBatches = useCallback(async () => {
        setIsLoading(true);
        try {
            const response = await fetch('/api/batch?page=1&limit=10000');
            const data = await response.json();

            if (data.success && data.data) {
                // Flatten all batch items with source info
                const items: BatchWithSource[] = [];
                data.data.forEach((record: BatchRegistryRecord) => {
                    record.batches.forEach((batch: BatchRecordItem) => {
                        items.push({
                            ...batch,
                            sourceFileName: record.fileName,
                            sourceCompanyName: record.companyName,
                            uploadedAt: record.uploadedAt,
                        });
                    });
                });
                setAllBatches(items);
            }
        } catch (error) {
            console.error('Error fetching batches:', error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchBatches();
    }, [fetchBatches]);

    // Filter batches based on search
    const filteredBatches = useMemo(() => {
        let result = allBatches;

        if (searchTerm.trim()) {
            const term = searchTerm.toLowerCase();
            result = allBatches.filter(batch =>
                batch.batchNumber?.toLowerCase().includes(term) ||
                batch.itemCode?.toLowerCase().includes(term) ||
                batch.itemName?.toLowerCase().includes(term) ||
                batch.itemDetail?.toLowerCase().includes(term)
            );
        }

        // Sort for "all" view
        return [...result].sort((a, b) => {
            switch (sortBy) {
                case 'batch-asc':
                    return (a.batchNumber || '').localeCompare(b.batchNumber || '');
                case 'batch-desc':
                    return (b.batchNumber || '').localeCompare(a.batchNumber || '');
                case 'mfg-asc':
                    return parseDate(a.mfgDate) - parseDate(b.mfgDate);
                case 'mfg-desc':
                    return parseDate(b.mfgDate) - parseDate(a.mfgDate);
                case 'expiry-asc':
                    return parseDate(a.expiryDate) - parseDate(b.expiryDate);
                case 'expiry-desc':
                    return parseDate(b.expiryDate) - parseDate(a.expiryDate);
                case 'code-asc':
                    return (a.itemCode || '').localeCompare(b.itemCode || '');
                case 'code-desc':
                    return (b.itemCode || '').localeCompare(a.itemCode || '');
                default:
                    return 0;
            }
        });
    }, [allBatches, searchTerm, sortBy]);

    // Group batches by batch number for unique view
    const uniqueBatchGroups = useMemo(() => {
        const groups: Record<string, UniqueBatchGroup> = {};

        // Use unsorted allBatches for grouping (apply search filter only)
        let batchesToGroup = allBatches;
        if (searchTerm.trim()) {
            const term = searchTerm.toLowerCase();
            batchesToGroup = allBatches.filter(batch =>
                batch.batchNumber?.toLowerCase().includes(term) ||
                batch.itemCode?.toLowerCase().includes(term) ||
                batch.itemName?.toLowerCase().includes(term) ||
                batch.itemDetail?.toLowerCase().includes(term)
            );
        }

        batchesToGroup.forEach(batch => {
            const bn = batch.batchNumber || 'Unknown';
            if (!groups[bn]) {
                groups[bn] = {
                    batchNumber: bn,
                    items: [],
                    firstItem: batch,
                    count: 0,
                };
            }
            groups[bn].items.push(batch);
            groups[bn].count++;
        });

        // Sort groups based on selected sort option
        return Object.values(groups).sort((a, b) => {
            switch (sortBy) {
                case 'count-desc':
                    return b.count - a.count || a.batchNumber.localeCompare(b.batchNumber);
                case 'count-asc':
                    return a.count - b.count || a.batchNumber.localeCompare(b.batchNumber);
                case 'batch-asc':
                    return a.batchNumber.localeCompare(b.batchNumber);
                case 'batch-desc':
                    return b.batchNumber.localeCompare(a.batchNumber);
                case 'mfg-asc':
                    return parseDate(a.firstItem.mfgDate) - parseDate(b.firstItem.mfgDate);
                case 'mfg-desc':
                    return parseDate(b.firstItem.mfgDate) - parseDate(a.firstItem.mfgDate);
                case 'expiry-asc':
                    return parseDate(a.firstItem.expiryDate) - parseDate(b.firstItem.expiryDate);
                case 'expiry-desc':
                    return parseDate(b.firstItem.expiryDate) - parseDate(a.firstItem.expiryDate);
                case 'code-asc':
                    return (a.firstItem.itemCode || '').localeCompare(b.firstItem.itemCode || '');
                case 'code-desc':
                    return (b.firstItem.itemCode || '').localeCompare(a.firstItem.itemCode || '');
                default:
                    return b.count - a.count;
            }
        });
    }, [allBatches, searchTerm, sortBy]);

    // Statistics
    const stats = useMemo(() => ({
        totalBatches: filteredBatches.length,
        uniqueBatches: uniqueBatchGroups.length,
    }), [filteredBatches, uniqueBatchGroups]);

    // Toggle batch expansion
    const toggleBatch = (batchNumber: string) => {
        setExpandedBatches(prev => {
            const next = new Set(prev);
            if (next.has(batchNumber)) {
                next.delete(batchNumber);
            } else {
                next.add(batchNumber);
            }
            return next;
        });
    };

    return (
        <div style={{ minHeight: '100vh', background: 'var(--background)' }}>
            {/* Header */}
            <header style={{
                background: 'linear-gradient(135deg, #7c3aed 0%, #8b5cf6 50%, #a78bfa 100%)',
                padding: '2rem 0',
                position: 'relative',
                overflow: 'hidden',
            }}>
                {/* Decorative elements */}
                <div style={{
                    position: 'absolute',
                    top: '-50%',
                    left: '-10%',
                    width: '400px',
                    height: '400px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    borderRadius: '50%',
                    filter: 'blur(40px)',
                }} />
                <div style={{
                    position: 'absolute',
                    bottom: '-30%',
                    right: '-5%',
                    width: '300px',
                    height: '300px',
                    background: 'rgba(255, 255, 255, 0.08)',
                    borderRadius: '50%',
                    filter: 'blur(30px)',
                }} />

                <div style={{
                    maxWidth: '1600px',
                    margin: '0 auto',
                    padding: '0 2rem',
                    position: 'relative',
                    zIndex: 1,
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                        <div>
                            <h1 style={{
                                fontSize: 'clamp(1.5rem, 4vw, 2.25rem)',
                                fontWeight: '700',
                                color: 'white',
                                marginBottom: '0.25rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.75rem',
                            }}>
                                📦 All Batches
                            </h1>
                            <p style={{ color: 'rgba(255, 255, 255, 0.8)', fontSize: '1rem' }}>
                                Complete batch registry with {stats.totalBatches.toLocaleString()} records • {stats.uniqueBatches.toLocaleString()} unique batch numbers
                            </p>
                        </div>
                        <Link href="/formula-data" style={{
                            padding: '0.75rem 1.5rem',
                            background: 'rgba(255, 255, 255, 0.2)',
                            backdropFilter: 'blur(10px)',
                            border: 'none',
                            borderRadius: '12px',
                            color: 'white',
                            textDecoration: 'none',
                            fontWeight: '500',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            transition: 'all 0.2s ease',
                        }}>
                            ← Back to MFC Dashboard
                        </Link>
                    </div>
                </div>
            </header>

            <main style={{ maxWidth: '1600px', margin: '0 auto', padding: '2rem' }}>
                {/* Statistics Cards */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '1rem',
                    marginBottom: '1.5rem',
                }}>
                    {/* Unique Batches Card */}
                    <div
                        onClick={() => setViewMode('unique')}
                        style={{
                            padding: '1.5rem',
                            background: viewMode === 'unique'
                                ? 'linear-gradient(135deg, #7c3aed 0%, #8b5cf6 100%)'
                                : 'var(--card)',
                            borderRadius: '16px',
                            border: viewMode === 'unique' ? 'none' : '1px solid var(--border)',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            boxShadow: viewMode === 'unique' ? '0 8px 30px rgba(139, 92, 246, 0.3)' : 'var(--shadow-sm)',
                        }}
                    >
                        <div style={{
                            fontSize: '2.5rem',
                            fontWeight: '800',
                            color: viewMode === 'unique' ? 'white' : '#7c3aed',
                            marginBottom: '0.25rem',
                        }}>
                            {stats.uniqueBatches.toLocaleString()}
                        </div>
                        <div style={{
                            fontSize: '0.9rem',
                            fontWeight: '600',
                            color: viewMode === 'unique' ? 'rgba(255,255,255,0.9)' : 'var(--muted-foreground)',
                        }}>
                            Unique Batches
                        </div>
                        <div style={{
                            fontSize: '0.75rem',
                            color: viewMode === 'unique' ? 'rgba(255,255,255,0.7)' : 'var(--muted-foreground)',
                            marginTop: '0.25rem',
                        }}>
                            Grouped by batch number
                        </div>
                    </div>

                    {/* All Batches Card */}
                    <div
                        onClick={() => setViewMode('all')}
                        style={{
                            padding: '1.5rem',
                            background: viewMode === 'all'
                                ? 'linear-gradient(135deg, #0891b2 0%, #06b6d4 100%)'
                                : 'var(--card)',
                            borderRadius: '16px',
                            border: viewMode === 'all' ? 'none' : '1px solid var(--border)',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            boxShadow: viewMode === 'all' ? '0 8px 30px rgba(6, 182, 212, 0.3)' : 'var(--shadow-sm)',
                        }}
                    >
                        <div style={{
                            fontSize: '2.5rem',
                            fontWeight: '800',
                            color: viewMode === 'all' ? 'white' : '#0891b2',
                            marginBottom: '0.25rem',
                        }}>
                            {stats.totalBatches.toLocaleString()}
                        </div>
                        <div style={{
                            fontSize: '0.9rem',
                            fontWeight: '600',
                            color: viewMode === 'all' ? 'rgba(255,255,255,0.9)' : 'var(--muted-foreground)',
                        }}>
                            All Batches
                        </div>
                        <div style={{
                            fontSize: '0.75rem',
                            color: viewMode === 'all' ? 'rgba(255,255,255,0.7)' : 'var(--muted-foreground)',
                            marginTop: '0.25rem',
                        }}>
                            Complete flat list
                        </div>
                    </div>
                </div>

                {/* Search and Sort Row */}
                <div style={{
                    display: 'flex',
                    gap: '1rem',
                    marginBottom: '1.5rem',
                    flexWrap: 'wrap',
                }}>
                    {/* Search Bar */}
                    <div style={{
                        flex: 1,
                        minWidth: '250px',
                        position: 'relative',
                    }}>
                        <input
                            type="text"
                            placeholder="Search by batch number, item code, or item name..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '1rem 1rem 1rem 3rem',
                                fontSize: '1rem',
                                border: '2px solid var(--border)',
                                borderRadius: '12px',
                                background: 'var(--card)',
                                color: 'var(--foreground)',
                                outline: 'none',
                                transition: 'border-color 0.2s ease',
                            }}
                            onFocus={(e) => e.target.style.borderColor = '#8b5cf6'}
                            onBlur={(e) => e.target.style.borderColor = 'var(--border)'}
                        />
                        <span style={{
                            position: 'absolute',
                            left: '1rem',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            fontSize: '1.25rem',
                        }}>🔍</span>
                        {searchTerm && (
                            <button
                                onClick={() => setSearchTerm('')}
                                style={{
                                    position: 'absolute',
                                    right: '1rem',
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    background: 'var(--muted)',
                                    border: 'none',
                                    borderRadius: '50%',
                                    width: '28px',
                                    height: '28px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '0.9rem',
                                    color: 'var(--muted-foreground)',
                                }}
                            >✕</button>
                        )}
                    </div>

                    {/* Sort Dropdown */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                    }}>
                        <span style={{ fontSize: '0.9rem', color: 'var(--muted-foreground)', fontWeight: 500 }}>Sort by:</span>
                        <select
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value as SortOption)}
                            style={{
                                padding: '0.75rem 2.5rem 0.75rem 1rem',
                                fontSize: '0.9rem',
                                border: '2px solid var(--border)',
                                borderRadius: '10px',
                                background: 'var(--card)',
                                color: 'var(--foreground)',
                                cursor: 'pointer',
                                outline: 'none',
                                fontWeight: 500,
                                appearance: 'none',
                                backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e")`,
                                backgroundRepeat: 'no-repeat',
                                backgroundPosition: 'right 0.75rem center',
                                backgroundSize: '1rem',
                            }}
                        >
                            {SORT_OPTIONS.map(opt => (
                                <option key={opt.value} value={opt.value}>
                                    {opt.icon} {opt.label}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Loading State */}
                {isLoading && (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
                        <svg className="animate-spin" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2">
                            <path d="M21 12a9 9 0 11-6.219-8.56" strokeLinecap="round" />
                        </svg>
                    </div>
                )}

                {/* Content */}
                {!isLoading && (
                    <div style={{
                        background: 'var(--card)',
                        borderRadius: '16px',
                        border: '1px solid var(--border)',
                        overflow: 'hidden',
                    }}>
                        {/* View Mode Header */}
                        <div style={{
                            padding: '1rem 1.5rem',
                            background: viewMode === 'unique'
                                ? 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)'
                                : 'linear-gradient(135deg, #ecfeff 0%, #cffafe 100%)',
                            borderBottom: '1px solid var(--border)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: '0.5rem',
                        }}>
                            <div style={{
                                fontSize: '1rem',
                                fontWeight: '600',
                                color: viewMode === 'unique' ? '#7c3aed' : '#0891b2',
                            }}>
                                {viewMode === 'unique'
                                    ? `📁 Showing ${uniqueBatchGroups.length.toLocaleString()} unique batch groups`
                                    : `📋 Showing ${filteredBatches.length.toLocaleString()} batch records`
                                }
                            </div>
                            {searchTerm && (
                                <div style={{
                                    fontSize: '0.85rem',
                                    color: 'var(--muted-foreground)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                }}>
                                    <span>Filtered by: "{searchTerm}"</span>
                                    <button
                                        onClick={() => setSearchTerm('')}
                                        style={{
                                            background: 'var(--muted)',
                                            border: 'none',
                                            borderRadius: '4px',
                                            padding: '2px 8px',
                                            fontSize: '0.75rem',
                                            cursor: 'pointer',
                                        }}
                                    >Clear</button>
                                </div>
                            )}
                        </div>

                        {/* Unique Batches View */}
                        {viewMode === 'unique' && (
                            <div style={{ maxHeight: '600px', overflowY: 'auto' }}>
                                {uniqueBatchGroups.length === 0 ? (
                                    <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--muted-foreground)' }}>
                                        <span style={{ fontSize: '2rem' }}>📭</span>
                                        <p style={{ marginTop: '0.5rem' }}>No batches found</p>
                                    </div>
                                ) : (
                                    uniqueBatchGroups.map((group, idx) => {
                                        const isExpanded = expandedBatches.has(group.batchNumber);
                                        return (
                                            <div key={group.batchNumber} style={{
                                                borderBottom: idx < uniqueBatchGroups.length - 1 ? '1px solid var(--border)' : 'none',
                                            }}>
                                                {/* Group Header */}
                                                <button
                                                    onClick={() => toggleBatch(group.batchNumber)}
                                                    style={{
                                                        width: '100%',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '1rem',
                                                        padding: '1rem 1.5rem',
                                                        background: isExpanded ? '#faf5ff' : 'transparent',
                                                        border: 'none',
                                                        cursor: 'pointer',
                                                        textAlign: 'left',
                                                        transition: 'background 0.15s ease',
                                                    }}
                                                >
                                                    {/* Expand Icon */}
                                                    <div style={{
                                                        width: '28px',
                                                        height: '28px',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        borderRadius: '6px',
                                                        background: isExpanded ? '#7c3aed' : '#e5e7eb',
                                                        color: isExpanded ? 'white' : '#6b7280',
                                                        transition: 'all 0.2s ease',
                                                        transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                                                        fontSize: '0.8rem',
                                                        fontWeight: 700,
                                                        flexShrink: 0,
                                                    }}>▶</div>

                                                    {/* Index */}
                                                    <div style={{
                                                        fontSize: '0.85rem',
                                                        fontWeight: 600,
                                                        color: '#9ca3af',
                                                        minWidth: '36px',
                                                    }}>#{idx + 1}</div>

                                                    {/* Batch Number */}
                                                    <div style={{
                                                        fontFamily: 'monospace',
                                                        fontSize: '1rem',
                                                        fontWeight: 700,
                                                        color: '#7c3aed',
                                                        minWidth: '100px',
                                                    }}>📁 {group.batchNumber}</div>

                                                    {/* Count Badge */}
                                                    <div style={{
                                                        fontSize: '0.75rem',
                                                        color: group.count > 1 ? '#ea580c' : '#6b7280',
                                                        background: group.count > 1 ? '#fff7ed' : '#f3f4f6',
                                                        border: group.count > 1 ? '1px solid #fed7aa' : '1px solid #e5e7eb',
                                                        padding: '3px 10px',
                                                        borderRadius: '12px',
                                                        fontWeight: 600,
                                                    }}>
                                                        {group.count} record{group.count !== 1 ? 's' : ''}
                                                    </div>

                                                    {/* Item Name Preview */}
                                                    <div style={{
                                                        flex: 1,
                                                        fontSize: '0.85rem',
                                                        color: '#374151',
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis',
                                                        whiteSpace: 'nowrap',
                                                    }}>
                                                        {group.firstItem.itemName}
                                                    </div>

                                                    {/* Item Code */}
                                                    <div style={{
                                                        fontFamily: 'monospace',
                                                        fontSize: '0.8rem',
                                                        color: '#6b7280',
                                                        background: '#f3f4f6',
                                                        padding: '4px 8px',
                                                        borderRadius: '6px',
                                                    }}>
                                                        {group.firstItem.itemCode}
                                                    </div>
                                                </button>

                                                {/* Expanded Content */}
                                                {isExpanded && (
                                                    <div style={{
                                                        padding: '0 1.5rem 1rem 4.5rem',
                                                        background: '#faf5ff',
                                                    }}>
                                                        {group.items.map((item, itemIdx) => (
                                                            <div key={itemIdx} style={{
                                                                display: 'grid',
                                                                gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                                                                gap: '0.75rem',
                                                                padding: '0.75rem',
                                                                background: 'white',
                                                                borderRadius: '8px',
                                                                border: '1px solid #e9d5ff',
                                                                marginBottom: '0.5rem',
                                                            }}>
                                                                <div>
                                                                    <div style={{ fontSize: '0.65rem', color: '#9ca3af', fontWeight: 500 }}>Item Code</div>
                                                                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#7c3aed' }}>{item.itemCode}</div>
                                                                </div>
                                                                <div>
                                                                    <div style={{ fontSize: '0.65rem', color: '#9ca3af', fontWeight: 500 }}>Item Name</div>
                                                                    <div style={{ fontSize: '0.85rem', color: '#374151' }}>{item.itemName}</div>
                                                                </div>
                                                                <div>
                                                                    <div style={{ fontSize: '0.65rem', color: '#9ca3af', fontWeight: 500 }}>Mfg Date</div>
                                                                    <div style={{ fontSize: '0.85rem', color: '#374151' }}>{item.mfgDate || 'N/A'}</div>
                                                                </div>
                                                                <div>
                                                                    <div style={{ fontSize: '0.65rem', color: '#9ca3af', fontWeight: 500 }}>Batch Size</div>
                                                                    <div style={{ fontSize: '0.85rem', color: '#374151' }}>{item.batchSize} {item.batchUom}</div>
                                                                </div>
                                                                <div>
                                                                    <div style={{ fontSize: '0.65rem', color: '#9ca3af', fontWeight: 500 }}>Pack</div>
                                                                    <div style={{ fontSize: '0.85rem', color: '#374151' }}>{item.pack || 'N/A'}</div>
                                                                </div>
                                                                <div>
                                                                    <div style={{ fontSize: '0.65rem', color: '#9ca3af', fontWeight: 500 }}>Source</div>
                                                                    <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{item.sourceFileName}</div>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        )}

                        {/* All Batches View */}
                        {viewMode === 'all' && (
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                    <thead>
                                        <tr style={{ background: '#f9fafb' }}>
                                            <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600, color: '#374151', borderBottom: '1px solid var(--border)' }}>#</th>
                                            <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600, color: '#374151', borderBottom: '1px solid var(--border)' }}>Batch No</th>
                                            <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600, color: '#374151', borderBottom: '1px solid var(--border)' }}>Item Code</th>
                                            <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600, color: '#374151', borderBottom: '1px solid var(--border)' }}>Item Name</th>
                                            <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600, color: '#374151', borderBottom: '1px solid var(--border)' }}>Mfg Date</th>
                                            <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600, color: '#374151', borderBottom: '1px solid var(--border)' }}>Expiry</th>
                                            <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600, color: '#374151', borderBottom: '1px solid var(--border)' }}>Batch Size</th>
                                            <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600, color: '#374151', borderBottom: '1px solid var(--border)' }}>Pack</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredBatches.length === 0 ? (
                                            <tr>
                                                <td colSpan={8} style={{ padding: '3rem', textAlign: 'center', color: 'var(--muted-foreground)' }}>
                                                    <span style={{ fontSize: '2rem' }}>📭</span>
                                                    <p style={{ marginTop: '0.5rem' }}>No batches found</p>
                                                </td>
                                            </tr>
                                        ) : (
                                            filteredBatches.slice(0, 500).map((batch, idx) => (
                                                <tr
                                                    key={idx}
                                                    style={{
                                                        background: idx % 2 === 0 ? 'white' : '#fafafa',
                                                        transition: 'background 0.15s ease',
                                                    }}
                                                    onMouseEnter={(e) => e.currentTarget.style.background = '#f0fdfa'}
                                                    onMouseLeave={(e) => e.currentTarget.style.background = idx % 2 === 0 ? 'white' : '#fafafa'}
                                                >
                                                    <td style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #f3f4f6', color: '#9ca3af' }}>{idx + 1}</td>
                                                    <td style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #f3f4f6' }}>
                                                        <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#0891b2' }}>{batch.batchNumber}</span>
                                                    </td>
                                                    <td style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #f3f4f6' }}>
                                                        <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#6b7280' }}>{batch.itemCode}</span>
                                                    </td>
                                                    <td style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #f3f4f6', maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {batch.itemName}
                                                    </td>
                                                    <td style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #f3f4f6', color: '#374151' }}>{batch.mfgDate || 'N/A'}</td>
                                                    <td style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #f3f4f6', color: '#374151' }}>{batch.expiryDate || 'N/A'}</td>
                                                    <td style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #f3f4f6', color: '#374151' }}>{batch.batchSize} {batch.batchUom}</td>
                                                    <td style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #f3f4f6', color: '#374151' }}>{batch.pack || 'N/A'}</td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                                {filteredBatches.length > 500 && (
                                    <div style={{
                                        padding: '1rem',
                                        textAlign: 'center',
                                        background: '#f9fafb',
                                        color: '#6b7280',
                                        fontSize: '0.85rem',
                                        borderTop: '1px solid var(--border)',
                                    }}>
                                        Showing first 500 of {filteredBatches.length.toLocaleString()} records. Use search to narrow results.
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </main>
        </div>
    );
}
