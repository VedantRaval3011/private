'use client';

/**
 * BatchDisplay Component
 * Displays parsed Batch Registry data in a beautiful table format
 */

import React, { useState, useEffect } from 'react';
import type { BatchRegistryData, BatchRecordItem } from '@/types/formula';

interface BatchDisplayProps {
    batchData: BatchRegistryData;
    onClose?: () => void;
}

export default function BatchDisplay({ batchData, onClose }: BatchDisplayProps) {
    const [filter, setFilter] = useState<'all' | 'Export' | 'Import'>('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [sortField, setSortField] = useState<keyof BatchRecordItem>('srNo');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
    const [isSorting, setIsSorting] = useState(false);
    const [sortingField, setSortingField] = useState<keyof BatchRecordItem | null>(null);

    // Filter and search batches
    const filteredBatches = batchData.batches.filter(batch => {
        const matchesFilter = filter === 'all' || batch.type === filter;
        const searchLower = searchTerm.toLowerCase();
        const matchesSearch = !searchTerm ||
            batch.itemCode.toLowerCase().includes(searchLower) ||
            batch.itemName.toLowerCase().includes(searchLower) ||
            batch.itemDetail.toLowerCase().includes(searchLower) ||
            batch.batchNumber.toLowerCase().includes(searchLower) ||
            batch.department.toLowerCase().includes(searchLower);
        return matchesFilter && matchesSearch;
    });

    // Sort batches
    const sortedBatches = [...filteredBatches].sort((a, b) => {
        const aValue = a[sortField];
        const bValue = b[sortField];

        if (typeof aValue === 'number' && typeof bValue === 'number') {
            return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
        }

        const aStr = String(aValue || '');
        const bStr = String(bValue || '');
        return sortDirection === 'asc'
            ? aStr.localeCompare(bStr)
            : bStr.localeCompare(aStr);
    });

    const handleSort = (field: keyof BatchRecordItem) => {
        setIsSorting(true);
        setSortingField(field);

        // Use setTimeout to allow the loading animation to render
        setTimeout(() => {
            if (sortField === field) {
                setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
            } else {
                setSortField(field);
                setSortDirection('asc');
            }
        }, 10);
    };

    // Clear sorting state after sort completes
    useEffect(() => {
        if (isSorting) {
            const timer = setTimeout(() => {
                setIsSorting(false);
                setSortingField(null);
            }, 300);
            return () => clearTimeout(timer);
        }
    }, [sortField, sortDirection, isSorting]);

    const SortIcon = ({ field }: { field: keyof BatchRecordItem }) => (
        <span style={{ marginLeft: '4px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            {/* Loading spinner for this specific field */}
            {isSorting && sortingField === field && (
                <span
                    className="sort-spinner"
                    style={{
                        width: '12px',
                        height: '12px',
                        border: '2px solid var(--muted)',
                        borderTopColor: 'var(--primary-500, #8b5cf6)',
                        borderRadius: '50%',
                        display: 'inline-block',
                        animation: 'spin 0.6s linear infinite',
                    }}
                />
            )}
            {/* Sort arrow - hide while loading this field */}
            {!(isSorting && sortingField === field) && (
                <span style={{ opacity: sortField === field ? 1 : 0.3 }}>
                    {sortField === field && sortDirection === 'desc' ? '↓' : '↑'}
                </span>
            )}
        </span>
    );

    return (
        <div className="animate-fadeIn">
            {/* Header */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: '1.5rem',
                flexWrap: 'wrap',
                gap: '1rem',
            }}>
                <div>
                    <h2 style={{
                        fontSize: '1.5rem',
                        fontWeight: '700',
                        color: 'var(--foreground)',
                        marginBottom: '0.25rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                    }}>
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                        </svg>
                        Batch Registry Data
                    </h2>
                    <p style={{ color: 'var(--muted-foreground)', fontSize: '0.875rem' }}>
                        {batchData.companyName}
                    </p>
                </div>

                {onClose && (
                    <button
                        onClick={onClose}
                        style={{
                            padding: '0.5rem 1rem',
                            background: 'var(--muted)',
                            border: 'none',
                            borderRadius: 'var(--radius-md)',
                            color: 'var(--foreground)',
                            cursor: 'pointer',
                            fontSize: '0.875rem',
                            fontWeight: '500',
                        }}
                    >
                        ← Back
                    </button>
                )}
            </div>

            {/* Summary Cards */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '1rem',
                marginBottom: '1.5rem',
            }}>
                <div style={{
                    padding: '1.25rem',
                    borderRadius: 'var(--radius-lg)',
                    background: 'linear-gradient(135deg, #8b5cf6 0%, #a855f7 100%)',
                    color: 'white',
                    boxShadow: '0 4px 20px rgba(139, 92, 246, 0.3)',
                }}>
                    <p style={{ fontSize: '0.75rem', textTransform: 'uppercase', opacity: 0.8, marginBottom: '0.25rem' }}>
                        Total Batches
                    </p>
                    <p style={{ fontSize: '2rem', fontWeight: '700' }}>{batchData.totalBatches}</p>
                </div>
                <div style={{
                    padding: '1.25rem',
                    borderRadius: 'var(--radius-lg)',
                    background: 'linear-gradient(135deg, #14b8a6 0%, #06b6d4 100%)',
                    color: 'white',
                    boxShadow: '0 4px 20px rgba(20, 184, 166, 0.3)',
                }}>
                    <p style={{ fontSize: '0.75rem', textTransform: 'uppercase', opacity: 0.8, marginBottom: '0.25rem' }}>
                        Export (No MRP)
                    </p>
                    <p style={{ fontSize: '2rem', fontWeight: '700' }}>{batchData.exportCount}</p>
                </div>
                <div style={{
                    padding: '1.25rem',
                    borderRadius: 'var(--radius-lg)',
                    background: 'linear-gradient(135deg, #f59e0b 0%, #f97316 100%)',
                    color: 'white',
                    boxShadow: '0 4px 20px rgba(245, 158, 11, 0.3)',
                }}>
                    <p style={{ fontSize: '0.75rem', textTransform: 'uppercase', opacity: 0.8, marginBottom: '0.25rem' }}>
                        Import (With MRP)
                    </p>
                    <p style={{ fontSize: '2rem', fontWeight: '700' }}>{batchData.importCount}</p>
                </div>
            </div>

            {/* Filters */}
            <div style={{
                display: 'flex',
                gap: '1rem',
                marginBottom: '1rem',
                flexWrap: 'wrap',
                alignItems: 'center',
            }}>
                {/* Search */}
                <div style={{ flex: 1, minWidth: '200px' }}>
                    <input
                        type="text"
                        placeholder="Search by item code, name, batch..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        style={{
                            width: '100%',
                            padding: '0.625rem 1rem',
                            borderRadius: 'var(--radius-md)',
                            border: '1px solid var(--border)',
                            background: 'var(--card)',
                            color: 'var(--foreground)',
                            fontSize: '0.875rem',
                        }}
                    />
                </div>

                {/* Type Filter */}
                <div style={{
                    display: 'flex',
                    gap: '0.375rem',
                    background: 'var(--muted)',
                    padding: '0.25rem',
                    borderRadius: 'var(--radius-md)',
                }}>
                    {(['all', 'Export', 'Import'] as const).map(type => (
                        <button
                            key={type}
                            onClick={() => setFilter(type)}
                            style={{
                                padding: '0.5rem 1rem',
                                background: filter === type ? 'var(--card)' : 'transparent',
                                border: 'none',
                                borderRadius: 'var(--radius-sm)',
                                color: filter === type ? 'var(--foreground)' : 'var(--muted-foreground)',
                                cursor: 'pointer',
                                fontSize: '0.875rem',
                                fontWeight: filter === type ? '500' : '400',
                                boxShadow: filter === type ? 'var(--shadow-sm)' : 'none',
                                transition: 'all var(--transition-fast)',
                            }}
                        >
                            {type === 'all' ? 'All' : type}
                        </button>
                    ))}
                </div>

                <span style={{ color: 'var(--muted-foreground)', fontSize: '0.875rem' }}>
                    Showing {sortedBatches.length} of {batchData.totalBatches}
                </span>
            </div>

            {/* Data Table with Sticky Horizontal Scrollbar */}
            <div style={{
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--border)',
                overflow: 'hidden',
                background: 'var(--card)',
                position: 'relative',
            }}>
                <div
                    className="table-scroll-container"
                    style={{
                        overflowX: 'auto',
                        overflowY: 'visible',
                        maxHeight: 'calc(100vh - 350px)',
                        scrollbarWidth: 'auto',
                        scrollbarColor: 'var(--primary-500) var(--muted)',
                    }}
                >
                    <table style={{
                        width: '100%',
                        borderCollapse: 'collapse',
                        fontSize: '0.8125rem',
                    }}>
                        <thead style={{
                            position: 'sticky',
                            top: 0,
                            zIndex: 10,
                        }}>
                            <tr style={{ background: 'var(--muted)' }}>
                                <th onClick={() => handleSort('srNo')} style={thStyle}>#<SortIcon field="srNo" /></th>
                                <th onClick={() => handleSort('type')} style={thStyle}>Type<SortIcon field="type" /></th>
                                <th onClick={() => handleSort('itemCode')} style={thStyle}>Item Code<SortIcon field="itemCode" /></th>
                                <th onClick={() => handleSort('itemDetail')} style={thStyle}>Item Detail<SortIcon field="itemDetail" /></th>
                                <th onClick={() => handleSort('batchNumber')} style={thStyle}>Batch No<SortIcon field="batchNumber" /></th>
                                <th onClick={() => handleSort('batchUom')} style={thStyle}>UOM<SortIcon field="batchUom" /></th>
                                <th onClick={() => handleSort('batchSize')} style={thStyle}>Batch Size<SortIcon field="batchSize" /></th>
                                <th onClick={() => handleSort('pack')} style={thStyle}>Pack<SortIcon field="pack" /></th>
                                <th onClick={() => handleSort('unit')} style={thStyle}>Unit<SortIcon field="unit" /></th>
                                <th onClick={() => handleSort('mfgDate')} style={thStyle}>Mfg Date<SortIcon field="mfgDate" /></th>
                                <th onClick={() => handleSort('expiryDate')} style={thStyle}>Exp Date<SortIcon field="expiryDate" /></th>
                                <th onClick={() => handleSort('mrpValue')} style={thStyle}>MRP<SortIcon field="mrpValue" /></th>
                                <th onClick={() => handleSort('conversionRatio')} style={thStyle}>Conversion<SortIcon field="conversionRatio" /></th>
                                <th onClick={() => handleSort('department')} style={thStyle}>Dept<SortIcon field="department" /></th>
                                <th onClick={() => handleSort('mfgLicNo')} style={thStyle}>Lic No<SortIcon field="mfgLicNo" /></th>
                                <th onClick={() => handleSort('locationId')} style={thStyle}>Loc ID<SortIcon field="locationId" /></th>
                                <th onClick={() => handleSort('year')} style={thStyle}>Year<SortIcon field="year" /></th>
                                <th onClick={() => handleSort('make')} style={thStyle}>Make<SortIcon field="make" /></th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedBatches.map((batch, index) => (
                                <tr
                                    key={`${batch.batchNumber}-${batch.itemCode}-${index}`}
                                    style={{
                                        background: index % 2 === 0 ? 'transparent' : 'var(--muted)',
                                        transition: 'background var(--transition-fast)',
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.background = 'rgba(139, 92, 246, 0.05)';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.background = index % 2 === 0 ? 'transparent' : 'var(--muted)';
                                    }}
                                >
                                    <td style={tdStyle}>{batch.srNo}</td>
                                    <td style={tdStyle}>
                                        <span style={{
                                            padding: '0.25rem 0.5rem',
                                            borderRadius: 'var(--radius-sm)',
                                            fontSize: '0.75rem',
                                            fontWeight: '500',
                                            background: batch.type === 'Export'
                                                ? 'rgba(20, 184, 166, 0.1)'
                                                : 'rgba(245, 158, 11, 0.1)',
                                            color: batch.type === 'Export' ? '#14b8a6' : '#f59e0b',
                                        }}>
                                            {batch.type}
                                        </span>
                                    </td>
                                    <td style={{ ...tdStyle, fontFamily: 'monospace', fontWeight: '500' }}>{batch.itemCode}</td>
                                    <td style={{ ...tdStyle, maxWidth: '200px' }}>
                                        <div style={{
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap',
                                            maxWidth: '200px',
                                        }} title={batch.itemDetail}>
                                            {batch.itemDetail}
                                        </div>
                                    </td>
                                    <td style={{ ...tdStyle, fontFamily: 'monospace' }}>{batch.batchNumber}</td>
                                    <td style={tdStyle}>{batch.batchUom}</td>
                                    <td style={{ ...tdStyle, textAlign: 'right' }}>{batch.batchSize}</td>
                                    <td style={tdStyle}>{batch.pack}</td>
                                    <td style={tdStyle}>{batch.unit}</td>
                                    <td style={tdStyle}>{batch.mfgDate}</td>
                                    <td style={tdStyle}>{batch.expiryDate}</td>
                                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                                        {batch.mrpValue || <span style={{ color: 'var(--muted-foreground)' }}>—</span>}
                                    </td>
                                    <td style={tdStyle}>{batch.conversionRatio}</td>
                                    <td style={{ ...tdStyle, maxWidth: '100px' }}>
                                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={batch.department}>
                                            {batch.department}
                                        </div>
                                    </td>
                                    <td style={{ ...tdStyle, maxWidth: '150px', fontSize: '0.75rem' }}>
                                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={batch.mfgLicNo}>
                                            {batch.mfgLicNo}
                                        </div>
                                    </td>
                                    <td style={{ ...tdStyle, textAlign: 'center' }}>{batch.locationId}</td>
                                    <td style={tdStyle}>{batch.year}</td>
                                    <td style={tdStyle}>{batch.make}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {sortedBatches.length === 0 && (
                    <div style={{
                        padding: '3rem',
                        textAlign: 'center',
                        color: 'var(--muted-foreground)',
                    }}>
                        <p>No batches found matching your criteria</p>
                    </div>
                )}
            </div>
        </div>
    );
}

// Table styles
const thStyle: React.CSSProperties = {
    padding: '0.75rem 0.5rem',
    textAlign: 'left',
    fontWeight: '600',
    color: 'var(--foreground)',
    whiteSpace: 'nowrap',
    borderBottom: '1px solid var(--border)',
    cursor: 'pointer',
    userSelect: 'none',
};

const tdStyle: React.CSSProperties = {
    padding: '0.625rem 0.5rem',
    borderBottom: '1px solid var(--border)',
    color: 'var(--foreground)',
    whiteSpace: 'nowrap',
};
