'use client';

/**
 * Data Verification Page
 * Shows all items from processing logs - both successfully processed and skipped duplicates
 * Provides complete data verification view with cross-linking between successful and duplicate items
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';

interface DuplicateItemDetail {
    batchNumber: string;
    itemCode: string;
    itemName: string;
    type: string;
    mfgDate?: string;
    expiryDate?: string;
    reason: string;
    existingFileName: string;
}

interface SuccessfulItemDetail {
    batchNumber: string;
    itemCode: string;
    itemName: string;
    type: string;
    mfgDate?: string;
    expiryDate?: string;
}

interface ItemLevelStats {
    totalItems: number;
    newItems: number;
    duplicateItems: number;
    duplicateDetails: DuplicateItemDetail[];
    successfulDetails: SuccessfulItemDetail[];
}

interface ProcessingLog {
    _id: string;
    fileName: string;
    fileType: 'BATCH' | 'FORMULA' | 'UNKNOWN';
    status: 'SUCCESS' | 'DUPLICATE' | 'ERROR';
    processedAt: string;
    itemStats?: ItemLevelStats;
}

interface LogsResponse {
    success: boolean;
    data: ProcessingLog[];
    total: number;
}

// Flattened items with source file info
interface FlatDuplicateItem extends DuplicateItemDetail {
    sourceFileName: string;
    processedAt: string;
}

interface FlatSuccessfulItem extends SuccessfulItemDetail {
    sourceFileName: string;
    processedAt: string;
}

// Generate unique ID for an item
const getItemKey = (batchNumber: string, itemCode: string) => `${batchNumber}-${itemCode}`;

export default function DataVerificationPage() {
    const [allDuplicates, setAllDuplicates] = useState<FlatDuplicateItem[]>([]);
    const [allSuccessful, setAllSuccessful] = useState<FlatSuccessfulItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [filter, setFilter] = useState<'all' | 'successful' | 'duplicates'>('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [highlightedItem, setHighlightedItem] = useState<string | null>(null);

    // Refs for scrolling
    const successfulRowRefs = useRef<{ [key: string]: HTMLTableRowElement | null }>({});
    const duplicateRowRefs = useRef<{ [key: string]: HTMLTableRowElement | null }>({});

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        try {
            // Fetch successful items from actual database
            const batchItemsResponse = await fetch('/api/batch/items');
            const batchItemsData = await batchItemsResponse.json();

            // Fetch duplicates from processing logs
            const logsResponse = await fetch('/api/ingestion/logs?limit=1000');
            const logsData: LogsResponse = await logsResponse.json();

            // Set successful items from actual database
            if (batchItemsData.success) {
                setAllSuccessful(batchItemsData.data);
            }

            // Set duplicates from processing logs
            if (logsData.success) {
                const duplicates: FlatDuplicateItem[] = [];

                logsData.data.forEach(log => {
                    if (log.itemStats && log.itemStats.duplicateDetails) {
                        log.itemStats.duplicateDetails.forEach(dup => {
                            duplicates.push({
                                ...dup,
                                sourceFileName: log.fileName,
                                processedAt: log.processedAt,
                            });
                        });
                    }
                });

                setAllDuplicates(duplicates);
            }
        } catch (error) {
            console.error('Error fetching data:', error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Create a set of duplicate keys for quick lookup
    const duplicateKeys = new Set(
        allDuplicates.map(dup => getItemKey(dup.batchNumber, dup.itemCode))
    );

    // Create a set of successful keys for quick lookup
    const successfulKeys = new Set(
        allSuccessful.map(item => getItemKey(item.batchNumber, item.itemCode))
    );

    // Filter items based on search term
    const filteredSuccessful = allSuccessful.filter(item =>
        item.batchNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.itemCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.itemName.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const filteredDuplicates = allDuplicates.filter(item =>
        item.batchNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.itemCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.itemName.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    // Scroll to duplicate item from successful item
    const scrollToDuplicate = (batchNumber: string, itemCode: string) => {
        const key = getItemKey(batchNumber, itemCode);
        const row = duplicateRowRefs.current[key];
        if (row) {
            // Switch to 'all' filter if needed to show duplicates
            if (filter === 'successful') {
                setFilter('all');
                setTimeout(() => {
                    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    setHighlightedItem(key);
                    setTimeout(() => setHighlightedItem(null), 2000);
                }, 100);
            } else {
                row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                setHighlightedItem(key);
                setTimeout(() => setHighlightedItem(null), 2000);
            }
        }
    };

    // Scroll to successful item from duplicate item
    const scrollToSuccessful = (batchNumber: string, itemCode: string) => {
        const key = getItemKey(batchNumber, itemCode);
        const row = successfulRowRefs.current[key];
        if (row) {
            // Switch to 'all' filter if needed to show successful items
            if (filter === 'duplicates') {
                setFilter('all');
                setTimeout(() => {
                    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    setHighlightedItem(key);
                    setTimeout(() => setHighlightedItem(null), 2000);
                }, 100);
            } else {
                row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                setHighlightedItem(key);
                setTimeout(() => setHighlightedItem(null), 2000);
            }
        }
    };

    return (
        <div style={{ minHeight: '100vh', background: 'var(--background)' }}>
            {/* Header */}
            <header style={{
                background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
                padding: '2rem 0',
                position: 'relative',
                overflow: 'hidden',
            }}>
                <div style={{
                    position: 'absolute',
                    top: '-50%',
                    right: '-10%',
                    width: '400px',
                    height: '400px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    borderRadius: '50%',
                    filter: 'blur(40px)',
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
                                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M9 11l3 3L22 4" />
                                    <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
                                </svg>
                                Data Verification
                            </h1>
                            <p style={{ color: 'rgba(255, 255, 255, 0.8)', fontSize: '1rem' }}>
                                {allSuccessful.length} successful • {allDuplicates.length} duplicates
                            </p>
                        </div>
                        <Link href="/processing-logs" style={{
                            padding: '0.75rem 1.5rem',
                            background: 'rgba(255, 255, 255, 0.2)',
                            backdropFilter: 'blur(10px)',
                            border: 'none',
                            borderRadius: 'var(--radius-md)',
                            color: 'white',
                            textDecoration: 'none',
                            fontWeight: '500',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                        }}>
                            ← Back to Logs
                        </Link>
                    </div>
                </div>
            </header>

            <main style={{ maxWidth: '1600px', margin: '0 auto', padding: '2rem' }}>
                {/* Filters and Search */}
                <div style={{
                    display: 'flex',
                    gap: '1rem',
                    marginBottom: '1.5rem',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                }}>
                    {/* Filter Buttons */}
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                            onClick={() => setFilter('all')}
                            style={{
                                padding: '0.625rem 1.25rem',
                                borderRadius: 'var(--radius-md)',
                                border: filter === 'all' ? '2px solid #8b5cf6' : '1px solid var(--border)',
                                background: filter === 'all' ? 'rgba(139, 92, 246, 0.1)' : 'var(--card)',
                                color: filter === 'all' ? '#8b5cf6' : 'var(--foreground)',
                                cursor: 'pointer',
                                fontWeight: '500',
                            }}
                        >
                            All Items
                        </button>
                        <button
                            onClick={() => setFilter('successful')}
                            style={{
                                padding: '0.625rem 1.25rem',
                                borderRadius: 'var(--radius-md)',
                                border: filter === 'successful' ? '2px solid #22c55e' : '1px solid var(--border)',
                                background: filter === 'successful' ? 'rgba(34, 197, 94, 0.1)' : 'var(--card)',
                                color: filter === 'successful' ? '#22c55e' : 'var(--foreground)',
                                cursor: 'pointer',
                                fontWeight: '500',
                            }}
                        >
                            ✓ Successful ({allSuccessful.length})
                        </button>
                        <button
                            onClick={() => setFilter('duplicates')}
                            style={{
                                padding: '0.625rem 1.25rem',
                                borderRadius: 'var(--radius-md)',
                                border: filter === 'duplicates' ? '2px solid #f59e0b' : '1px solid var(--border)',
                                background: filter === 'duplicates' ? 'rgba(245, 158, 11, 0.1)' : 'var(--card)',
                                color: filter === 'duplicates' ? '#f59e0b' : 'var(--foreground)',
                                cursor: 'pointer',
                                fontWeight: '500',
                            }}
                        >
                            ⚠ Duplicates ({allDuplicates.length})
                        </button>
                    </div>

                    {/* Search Box */}
                    <input
                        type="text"
                        placeholder="Search by batch #, item code, or name..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        style={{
                            flex: '1',
                            minWidth: '300px',
                            padding: '0.625rem 1rem',
                            borderRadius: 'var(--radius-md)',
                            border: '1px solid var(--border)',
                            background: 'var(--card)',
                            color: 'var(--foreground)',
                            fontSize: '0.9rem',
                        }}
                    />

                    {/* Refresh Button */}
                    <button
                        onClick={fetchData}
                        disabled={isLoading}
                        style={{
                            padding: '0.625rem 1rem',
                            borderRadius: 'var(--radius-md)',
                            border: '1px solid var(--border)',
                            background: 'var(--card)',
                            color: 'var(--foreground)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                        }}
                    >
                        🔄 Refresh
                    </button>
                </div>

                {/* Stats Cards */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '1rem',
                    marginBottom: '1.5rem',
                }}>
                    <div style={{
                        background: 'var(--card)',
                        borderRadius: 'var(--radius-lg)',
                        padding: '1.25rem',
                        border: '1px solid var(--border)',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <span style={{ fontSize: '1.5rem' }}>📊</span>
                            <div>
                                <div style={{ fontSize: '0.85rem', color: 'var(--muted-foreground)' }}>Total Items</div>
                                <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#8b5cf6' }}>
                                    {allSuccessful.length + allDuplicates.length}
                                </div>
                            </div>
                        </div>
                    </div>
                    <div style={{
                        background: 'var(--card)',
                        borderRadius: 'var(--radius-lg)',
                        padding: '1.25rem',
                        border: '1px solid var(--border)',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <span style={{ fontSize: '1.5rem' }}>✓</span>
                            <div>
                                <div style={{ fontSize: '0.85rem', color: 'var(--muted-foreground)' }}>Successful</div>
                                <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#22c55e' }}>
                                    {allSuccessful.length}
                                </div>
                            </div>
                        </div>
                    </div>
                    <div style={{
                        background: 'var(--card)',
                        borderRadius: 'var(--radius-lg)',
                        padding: '1.25rem',
                        border: '1px solid var(--border)',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <span style={{ fontSize: '1.5rem' }}>⚠</span>
                            <div>
                                <div style={{ fontSize: '0.85rem', color: 'var(--muted-foreground)' }}>Duplicates</div>
                                <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#f59e0b' }}>
                                    {allDuplicates.length}
                                </div>
                            </div>
                        </div>
                    </div>
                    <div style={{
                        background: 'var(--card)',
                        borderRadius: 'var(--radius-lg)',
                        padding: '1.25rem',
                        border: '1px solid var(--border)',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <span style={{ fontSize: '1.5rem' }}>🔗</span>
                            <div>
                                <div style={{ fontSize: '0.85rem', color: 'var(--muted-foreground)' }}>Items with Duplicates</div>
                                <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#ec4899' }}>
                                    {filteredSuccessful.filter(item =>
                                        duplicateKeys.has(getItemKey(item.batchNumber, item.itemCode))
                                    ).length}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {isLoading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
                        <svg className="animate-spin" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2">
                            <path d="M21 12a9 9 0 11-6.219-8.56" strokeLinecap="round" />
                        </svg>
                    </div>
                ) : (
                    <>
                        {/* Successful Items Table */}
                        {(filter === 'all' || filter === 'successful') && filteredSuccessful.length > 0 && (
                            <div style={{ marginBottom: '2rem' }}>
                                <h2 style={{
                                    fontSize: '1.25rem',
                                    fontWeight: '600',
                                    color: '#22c55e',
                                    marginBottom: '1rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                }}>
                                    ✓ Successfully Processed Items ({filteredSuccessful.length})
                                    <span style={{ fontSize: '0.85rem', color: 'var(--muted-foreground)', fontWeight: '400' }}>
                                        • Click 🔗 to jump to duplicate
                                    </span>
                                </h2>
                                <div style={{
                                    background: 'var(--card)',
                                    borderRadius: 'var(--radius-lg)',
                                    border: '1px solid rgba(34, 197, 94, 0.3)',
                                    overflow: 'hidden',
                                }}>
                                    <div style={{ overflowX: 'auto' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                            <thead>
                                                <tr style={{ background: 'rgba(34, 197, 94, 0.1)' }}>
                                                    <th style={thStyle}>Link</th>
                                                    <th style={thStyle}>Batch #</th>
                                                    <th style={thStyle}>Item Code</th>
                                                    <th style={thStyle}>Item Name</th>
                                                    <th style={thStyle}>Type</th>
                                                    <th style={thStyle}>Mfg Date</th>
                                                    <th style={thStyle}>Expiry Date</th>
                                                    <th style={thStyle}>Source File</th>
                                                    <th style={thStyle}>Processed At</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {filteredSuccessful.map((item, index) => {
                                                    const itemKey = getItemKey(item.batchNumber, item.itemCode);
                                                    const hasDuplicate = duplicateKeys.has(itemKey);
                                                    const isHighlighted = highlightedItem === itemKey;

                                                    return (
                                                        <tr
                                                            key={index}
                                                            ref={(el) => { successfulRowRefs.current[itemKey] = el; }}
                                                            style={{
                                                                background: isHighlighted
                                                                    ? 'rgba(236, 72, 153, 0.2)'
                                                                    : index % 2 === 0 ? 'transparent' : 'var(--muted)',
                                                                transition: 'background 0.3s ease',
                                                            }}
                                                        >
                                                            <td style={{ ...tdStyle, textAlign: 'center' }}>
                                                                {hasDuplicate ? (
                                                                    <button
                                                                        onClick={() => scrollToDuplicate(item.batchNumber, item.itemCode)}
                                                                        title="Jump to duplicate entry"
                                                                        style={{
                                                                            background: 'rgba(236, 72, 153, 0.1)',
                                                                            border: '1px solid rgba(236, 72, 153, 0.3)',
                                                                            borderRadius: 'var(--radius-sm)',
                                                                            padding: '0.25rem 0.5rem',
                                                                            cursor: 'pointer',
                                                                            fontSize: '0.9rem',
                                                                            display: 'flex',
                                                                            alignItems: 'center',
                                                                            gap: '0.25rem',
                                                                            color: '#ec4899',
                                                                        }}
                                                                    >
                                                                        🔗↓
                                                                    </button>
                                                                ) : (
                                                                    <span style={{ color: 'var(--muted-foreground)' }}>-</span>
                                                                )}
                                                            </td>
                                                            <td style={{ ...tdStyle, fontFamily: 'monospace' }}>{item.batchNumber}</td>
                                                            <td style={{ ...tdStyle, fontFamily: 'monospace' }}>{item.itemCode}</td>
                                                            <td style={tdStyle}>{item.itemName}</td>
                                                            <td style={tdStyle}>
                                                                <span style={{
                                                                    display: 'inline-block',
                                                                    padding: '0.15rem 0.5rem',
                                                                    background: item.type === 'Export' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(139, 92, 246, 0.1)',
                                                                    color: item.type === 'Export' ? '#3b82f6' : '#8b5cf6',
                                                                    borderRadius: 'var(--radius-sm)',
                                                                    fontSize: '0.7rem',
                                                                    fontWeight: '500',
                                                                }}>
                                                                    {item.type}
                                                                </span>
                                                            </td>
                                                            <td style={{ ...tdStyle, fontSize: '0.85rem' }}>{item.mfgDate || '-'}</td>
                                                            <td style={{ ...tdStyle, fontSize: '0.85rem' }}>{item.expiryDate || '-'}</td>
                                                            <td style={tdStyle}>
                                                                <span style={{
                                                                    display: 'inline-block',
                                                                    padding: '0.15rem 0.5rem',
                                                                    background: 'rgba(139, 92, 246, 0.1)',
                                                                    color: '#8b5cf6',
                                                                    borderRadius: 'var(--radius-sm)',
                                                                    fontSize: '0.7rem',
                                                                    fontWeight: '500',
                                                                }}>
                                                                    {item.sourceFileName}
                                                                </span>
                                                            </td>
                                                            <td style={{ ...tdStyle, fontSize: '0.85rem' }}>{formatDate(item.processedAt)}</td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Duplicate Items Table */}
                        {(filter === 'all' || filter === 'duplicates') && filteredDuplicates.length > 0 && (
                            <div>
                                <h2 style={{
                                    fontSize: '1.25rem',
                                    fontWeight: '600',
                                    color: '#f59e0b',
                                    marginBottom: '1rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                }}>
                                    ⚠ Skipped Duplicates ({filteredDuplicates.length})
                                    <span style={{ fontSize: '0.85rem', color: 'var(--muted-foreground)', fontWeight: '400' }}>
                                        • Click ↑ to jump to original
                                    </span>
                                </h2>
                                <div style={{
                                    background: 'var(--card)',
                                    borderRadius: 'var(--radius-lg)',
                                    border: '1px solid rgba(245, 158, 11, 0.3)',
                                    overflow: 'hidden',
                                }}>
                                    <div style={{ overflowX: 'auto' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                            <thead>
                                                <tr style={{ background: 'rgba(245, 158, 11, 0.1)' }}>
                                                    <th style={thStyle}>Link</th>
                                                    <th style={thStyle}>Batch #</th>
                                                    <th style={thStyle}>Item Code</th>
                                                    <th style={thStyle}>Item Name</th>
                                                    <th style={thStyle}>Type</th>
                                                    <th style={thStyle}>Mfg Date</th>
                                                    <th style={thStyle}>Expiry Date</th>
                                                    <th style={thStyle}>Reason</th>
                                                    <th style={thStyle}>Found In File</th>
                                                    <th style={thStyle}>Attempted File</th>
                                                    <th style={thStyle}>Attempted At</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {filteredDuplicates.map((item, index) => {
                                                    const itemKey = getItemKey(item.batchNumber, item.itemCode);
                                                    const hasSuccessful = successfulKeys.has(itemKey);
                                                    const isHighlighted = highlightedItem === itemKey;

                                                    return (
                                                        <tr
                                                            key={index}
                                                            ref={(el) => { duplicateRowRefs.current[itemKey] = el; }}
                                                            style={{
                                                                background: isHighlighted
                                                                    ? 'rgba(236, 72, 153, 0.2)'
                                                                    : index % 2 === 0 ? 'transparent' : 'var(--muted)',
                                                                transition: 'background 0.3s ease',
                                                            }}
                                                        >
                                                            <td style={{ ...tdStyle, textAlign: 'center' }}>
                                                                {hasSuccessful ? (
                                                                    <button
                                                                        onClick={() => scrollToSuccessful(item.batchNumber, item.itemCode)}
                                                                        title="Jump to original successful entry"
                                                                        style={{
                                                                            background: 'rgba(34, 197, 94, 0.1)',
                                                                            border: '1px solid rgba(34, 197, 94, 0.3)',
                                                                            borderRadius: 'var(--radius-sm)',
                                                                            padding: '0.25rem 0.5rem',
                                                                            cursor: 'pointer',
                                                                            fontSize: '0.9rem',
                                                                            display: 'flex',
                                                                            alignItems: 'center',
                                                                            gap: '0.25rem',
                                                                            color: '#22c55e',
                                                                        }}
                                                                    >
                                                                        ↑✓
                                                                    </button>
                                                                ) : (
                                                                    <span style={{ color: 'var(--muted-foreground)' }}>-</span>
                                                                )}
                                                            </td>
                                                            <td style={{ ...tdStyle, fontFamily: 'monospace' }}>{item.batchNumber}</td>
                                                            <td style={{ ...tdStyle, fontFamily: 'monospace' }}>{item.itemCode}</td>
                                                            <td style={tdStyle}>{item.itemName}</td>
                                                            <td style={tdStyle}>
                                                                <span style={{
                                                                    display: 'inline-block',
                                                                    padding: '0.15rem 0.5rem',
                                                                    background: item.type === 'Export' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(139, 92, 246, 0.1)',
                                                                    color: item.type === 'Export' ? '#3b82f6' : '#8b5cf6',
                                                                    borderRadius: 'var(--radius-sm)',
                                                                    fontSize: '0.7rem',
                                                                    fontWeight: '500',
                                                                }}>
                                                                    {item.type}
                                                                </span>
                                                            </td>
                                                            <td style={{ ...tdStyle, fontSize: '0.85rem' }}>{item.mfgDate || '-'}</td>
                                                            <td style={{ ...tdStyle, fontSize: '0.85rem' }}>{item.expiryDate || '-'}</td>
                                                            <td style={{ ...tdStyle, color: '#f59e0b', fontWeight: '500' }}>{item.reason}</td>
                                                            <td style={tdStyle}>
                                                                <span style={{
                                                                    display: 'inline-block',
                                                                    padding: '0.15rem 0.5rem',
                                                                    background: 'rgba(59, 130, 246, 0.1)',
                                                                    color: '#3b82f6',
                                                                    borderRadius: 'var(--radius-sm)',
                                                                    fontSize: '0.7rem',
                                                                    fontWeight: '500',
                                                                }}>
                                                                    {item.existingFileName}
                                                                </span>
                                                            </td>
                                                            <td style={tdStyle}>
                                                                <span style={{
                                                                    display: 'inline-block',
                                                                    padding: '0.15rem 0.5rem',
                                                                    background: 'rgba(139, 92, 246, 0.1)',
                                                                    color: '#8b5cf6',
                                                                    borderRadius: 'var(--radius-sm)',
                                                                    fontSize: '0.7rem',
                                                                    fontWeight: '500',
                                                                }}>
                                                                    {item.sourceFileName}
                                                                </span>
                                                            </td>
                                                            <td style={{ ...tdStyle, fontSize: '0.85rem' }}>{formatDate(item.processedAt)}</td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* No Results */}
                        {filteredSuccessful.length === 0 && filteredDuplicates.length === 0 && (
                            <div style={{
                                textAlign: 'center',
                                padding: '4rem',
                                color: 'var(--muted-foreground)',
                            }}>
                                No items found matching your search criteria
                            </div>
                        )}
                    </>
                )}
            </main>
        </div>
    );
}

// Table styles
const thStyle: React.CSSProperties = {
    padding: '1rem 1rem',
    textAlign: 'left',
    fontWeight: '600',
    color: 'var(--foreground)',
    whiteSpace: 'nowrap',
    borderBottom: '1px solid var(--border)',
};

const tdStyle: React.CSSProperties = {
    padding: '1rem 1rem',
    borderBottom: '1px solid var(--border)',
    color: 'var(--foreground)',
};
