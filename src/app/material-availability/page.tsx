'use client';

/**
 * Material Code Availability Page
 * Checks which material codes from MFCs with 3+ batches are NOT in requisition
 */

import { useState, useCallback } from 'react';
import Link from 'next/link';

interface MissingMaterial {
    materialCode: string;
    materialName: string;
    materialType: 'RM' | 'PM' | 'PPM';
    mfcNo: string;
    productName: string;
    batchNumber: string;
    message: string;
}

interface MaterialCodeSummary {
    materialCode: string;
    materialName: string;
    materialType: string;
    missingInBatches: number;
    batches: string[];
}

interface MaterialAvailabilityData {
    loaded: boolean;
    loading: boolean;
    error: string | null;
    summary: {
        totalMFCs: number;
        totalBatches: number;
        totalMaterialsInMFC: number;
        totalMissingMaterials: number;
        missingByType: Record<string, number>;
    };
    missingMaterials: MissingMaterial[];
    materialCodeSummary: MaterialCodeSummary[];
}

type ViewMode = 'summary' | 'details';
type MaterialType = 'ALL' | 'RM' | 'PPM' | 'PM';

const typeColors: Record<string, { bg: string; text: string; border: string }> = {
    'RM': { bg: 'rgba(245, 158, 11, 0.1)', text: '#f59e0b', border: '#f59e0b' },
    'PPM': { bg: 'rgba(139, 92, 246, 0.1)', text: '#8b5cf6', border: '#8b5cf6' },
    'PM': { bg: 'rgba(236, 72, 153, 0.1)', text: '#ec4899', border: '#ec4899' },
};

export default function MaterialAvailabilityPage() {
    const [data, setData] = useState<MaterialAvailabilityData>({
        loaded: false,
        loading: false,
        error: null,
        summary: { totalMFCs: 0, totalBatches: 0, totalMaterialsInMFC: 0, totalMissingMaterials: 0, missingByType: {} },
        missingMaterials: [],
        materialCodeSummary: [],
    });
    const [viewMode, setViewMode] = useState<ViewMode>('summary');
    const [typeFilter, setTypeFilter] = useState<MaterialType>('ALL');
    const [searchQuery, setSearchQuery] = useState('');

    // Load data
    const loadData = useCallback(async () => {
        setData(prev => ({ ...prev, loading: true, error: null }));

        try {
            const response = await fetch('/api/data-validation/materials');
            const result = await response.json();

            if (result.success) {
                setData({
                    loaded: true,
                    loading: false,
                    error: null,
                    summary: result.summary,
                    missingMaterials: result.missingMaterials,
                    materialCodeSummary: result.materialCodeSummary,
                });
            } else {
                setData(prev => ({ ...prev, loading: false, error: result.message }));
            }
        } catch (err) {
            setData(prev => ({ ...prev, loading: false, error: err instanceof Error ? err.message : 'Failed to load' }));
        }
    }, []);

    // Filter materials
    const filteredSummary = data.materialCodeSummary.filter(m => {
        const matchesType = typeFilter === 'ALL' || m.materialType === typeFilter;
        const matchesSearch = searchQuery === '' ||
            m.materialCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
            m.materialName.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesType && matchesSearch;
    });

    const filteredDetails = data.missingMaterials.filter(m => {
        const matchesType = typeFilter === 'ALL' || m.materialType === typeFilter;
        const matchesSearch = searchQuery === '' ||
            m.materialCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
            m.materialName.toLowerCase().includes(searchQuery.toLowerCase()) ||
            m.batchNumber.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesType && matchesSearch;
    });

    // Export to CSV
    const exportToCSV = () => {
        const headers = ['Material Code', 'Material Name', 'Type', 'Missing In Batches', 'Sample Batches'];
        const rows = filteredSummary.map(m => [
            m.materialCode, m.materialName, m.materialType, m.missingInBatches, m.batches.join('; ')
        ]);
        const csvContent = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `missing-materials-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div style={{ minHeight: '100vh', background: 'var(--background)' }}>
            {/* Header */}
            <header style={{
                background: 'linear-gradient(135deg, #dc2626 0%, #f59e0b 100%)',
                padding: '1.5rem 0',
            }}>
                <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '0 2rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                        <div>
                            <h1 style={{ fontSize: '1.75rem', fontWeight: '700', color: 'white', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                🔍 Material Code Availability
                            </h1>
                            <p style={{ color: 'rgba(255, 255, 255, 0.8)', fontSize: '0.875rem' }}>
                                MFCs with 3+ Batches - Check which material codes are missing in Requisition
                            </p>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <Link href="/data-validation" style={{
                                padding: '0.5rem 1rem',
                                background: 'rgba(255, 255, 255, 0.15)',
                                color: 'white',
                                border: 'none',
                                borderRadius: '8px',
                                textDecoration: 'none',
                                fontWeight: '500',
                            }}>
                                ← Batch Validation
                            </Link>
                            <Link href="/" style={{
                                padding: '0.5rem 1rem',
                                background: 'rgba(255, 255, 255, 0.15)',
                                color: 'white',
                                border: 'none',
                                borderRadius: '8px',
                                textDecoration: 'none',
                                fontWeight: '500',
                            }}>
                                Home
                            </Link>
                        </div>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main style={{ maxWidth: '1400px', margin: '0 auto', padding: '2rem' }}>
                {/* Not Loaded State */}
                {!data.loaded && !data.loading && !data.error && (
                    <div style={{
                        textAlign: 'center',
                        padding: '4rem 2rem',
                        background: 'rgba(245, 158, 11, 0.1)',
                        borderRadius: '12px',
                        border: '2px dashed #f59e0b',
                    }}>
                        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📦</div>
                        <h2 style={{ color: '#f59e0b', marginBottom: '0.5rem' }}>Check Material Availability</h2>
                        <p style={{ color: 'var(--muted-foreground)', marginBottom: '1.5rem' }}>
                            Compare material codes from MFCs with 3+ batches against Requisition data
                        </p>
                        <button
                            onClick={loadData}
                            style={{
                                padding: '0.75rem 2rem',
                                background: 'linear-gradient(135deg, #dc2626 0%, #f59e0b 100%)',
                                color: 'white',
                                border: 'none',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                fontWeight: '600',
                                fontSize: '1rem',
                            }}
                        >
                            Load Material Availability Data
                        </button>
                    </div>
                )}

                {/* Loading State */}
                {data.loading && (
                    <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--muted-foreground)' }}>
                        <div style={{
                            width: '50px',
                            height: '50px',
                            border: '4px solid rgba(245, 158, 11, 0.2)',
                            borderTopColor: '#f59e0b',
                            borderRadius: '50%',
                            animation: 'spin 1s linear infinite',
                            margin: '0 auto 1.5rem',
                        }} />
                        <p style={{ fontSize: '1.1rem' }}>Checking material availability...</p>
                        <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>Comparing MFC materials vs Requisition</p>
                    </div>
                )}

                {/* Error State */}
                {data.error && (
                    <div style={{
                        padding: '2rem',
                        background: 'rgba(239, 68, 68, 0.1)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        borderRadius: '12px',
                        textAlign: 'center',
                    }}>
                        <p style={{ color: '#ef4444', fontWeight: '600' }}>Error</p>
                        <p style={{ color: '#ef4444' }}>{data.error}</p>
                        <button onClick={loadData} style={{ marginTop: '1rem', padding: '0.5rem 1rem', background: '#ef4444', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
                            Retry
                        </button>
                    </div>
                )}

                {/* Loaded State */}
                {data.loaded && !data.loading && (
                    <>
                        {/* Summary Stats */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                            gap: '1rem',
                            marginBottom: '2rem',
                        }}>
                            <StatCard label="MFCs Analyzed" value={data.summary.totalMFCs} color="#7c3aed" />
                            <StatCard label="Total Batches" value={data.summary.totalBatches} color="#3b82f6" />
                            <StatCard label="Materials in MFCs" value={data.summary.totalMaterialsInMFC} color="#10b981" />
                            <StatCard label="Missing Entries" value={data.summary.totalMissingMaterials} color="#ef4444" />
                        </div>

                        {/* Missing by Type */}
                        <div style={{
                            display: 'flex',
                            gap: '1rem',
                            marginBottom: '2rem',
                            padding: '1rem',
                            background: 'var(--card)',
                            borderRadius: '12px',
                            border: '1px solid var(--border)',
                            flexWrap: 'wrap',
                        }}>
                            <span style={{ fontWeight: '600', color: 'var(--foreground)' }}>Missing by Type:</span>
                            {Object.entries(data.summary.missingByType).map(([type, count]) => (
                                <span
                                    key={type}
                                    style={{
                                        padding: '0.375rem 0.75rem',
                                        background: typeColors[type]?.bg || 'var(--muted)',
                                        color: typeColors[type]?.text || 'var(--foreground)',
                                        borderRadius: '20px',
                                        fontSize: '0.875rem',
                                        fontWeight: '600',
                                        border: `1px solid ${typeColors[type]?.border || 'var(--border)'}`,
                                    }}
                                >
                                    {type}: {count.toLocaleString()}
                                </span>
                            ))}
                        </div>

                        {/* Controls */}
                        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                            {/* View Mode Toggle */}
                            <div style={{ display: 'flex', background: 'var(--card)', padding: '0.25rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
                                <button
                                    onClick={() => setViewMode('summary')}
                                    style={{
                                        padding: '0.5rem 1rem',
                                        background: viewMode === 'summary' ? '#f59e0b' : 'transparent',
                                        color: viewMode === 'summary' ? 'white' : 'var(--foreground)',
                                        border: 'none',
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                        fontWeight: '500',
                                    }}
                                >
                                    By Material Code ({filteredSummary.length})
                                </button>
                                <button
                                    onClick={() => setViewMode('details')}
                                    style={{
                                        padding: '0.5rem 1rem',
                                        background: viewMode === 'details' ? '#f59e0b' : 'transparent',
                                        color: viewMode === 'details' ? 'white' : 'var(--foreground)',
                                        border: 'none',
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                        fontWeight: '500',
                                    }}
                                >
                                    Detailed List ({filteredDetails.length})
                                </button>
                            </div>

                            {/* Type Filter */}
                            <select
                                value={typeFilter}
                                onChange={(e) => setTypeFilter(e.target.value as MaterialType)}
                                style={{
                                    padding: '0.5rem 1rem',
                                    borderRadius: '8px',
                                    border: '1px solid var(--border)',
                                    background: 'var(--card)',
                                    color: 'var(--foreground)',
                                }}
                            >
                                <option value="ALL">All Types</option>
                                <option value="RM">RM Only</option>
                                <option value="PPM">PPM Only</option>
                                <option value="PM">PM Only</option>
                            </select>

                            {/* Search */}
                            <input
                                type="text"
                                placeholder="Search material code, name, batch..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                style={{
                                    padding: '0.5rem 1rem',
                                    borderRadius: '8px',
                                    border: '1px solid var(--border)',
                                    background: 'var(--card)',
                                    color: 'var(--foreground)',
                                    width: '280px',
                                }}
                            />

                            {/* Refresh */}
                            <button onClick={loadData} style={{ padding: '0.5rem 1rem', background: '#f59e0b', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '500' }}>
                                ↻ Refresh
                            </button>

                            {/* Export */}
                            <button onClick={exportToCSV} style={{ padding: '0.5rem 1rem', background: '#10b981', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '500', marginLeft: 'auto' }}>
                                📥 Export CSV
                            </button>
                        </div>

                        {/* Summary View - By Material Code */}
                        {viewMode === 'summary' && (
                            <div style={{
                                background: 'var(--card)',
                                borderRadius: '12px',
                                border: '2px solid #f59e0b',
                                overflow: 'hidden',
                            }}>
                                <div style={{ padding: '1rem', background: 'rgba(245, 158, 11, 0.1)', borderBottom: '1px solid #f59e0b' }}>
                                    <h3 style={{ margin: 0, color: '#f59e0b', fontWeight: '700' }}>
                                        Missing Material Codes ({filteredSummary.length})
                                    </h3>
                                    <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: 'var(--muted-foreground)' }}>
                                        Sorted by number of batches missing this material
                                    </p>
                                </div>

                                <div style={{ maxHeight: '500px', overflow: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                        <thead style={{ position: 'sticky', top: 0, background: 'var(--muted)' }}>
                                            <tr>
                                                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: '600', borderBottom: '1px solid var(--border)' }}>Material Code</th>
                                                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: '600', borderBottom: '1px solid var(--border)' }}>Material Name</th>
                                                <th style={{ padding: '0.75rem 1rem', textAlign: 'center', fontWeight: '600', borderBottom: '1px solid var(--border)' }}>Type</th>
                                                <th style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: '600', borderBottom: '1px solid var(--border)' }}>Missing In</th>
                                                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: '600', borderBottom: '1px solid var(--border)' }}>Sample Batches</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredSummary.map((m, idx) => (
                                                <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                                                    <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', fontWeight: '600', color: typeColors[m.materialType]?.text || '#333' }}>
                                                        {m.materialCode}
                                                    </td>
                                                    <td style={{ padding: '0.75rem 1rem' }}>{m.materialName}</td>
                                                    <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                                                        <span style={{
                                                            padding: '0.25rem 0.5rem',
                                                            background: typeColors[m.materialType]?.bg,
                                                            color: typeColors[m.materialType]?.text,
                                                            borderRadius: '4px',
                                                            fontSize: '0.75rem',
                                                            fontWeight: '600',
                                                        }}>
                                                            {m.materialType}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: '700', color: '#ef4444' }}>
                                                        {m.missingInBatches} batches
                                                    </td>
                                                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.8rem', color: 'var(--muted-foreground)' }}>
                                                        {m.batches.slice(0, 3).join(', ')}{m.batches.length > 3 && ` +${m.batches.length - 3} more`}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>

                                    {filteredSummary.length === 0 && (
                                        <div style={{ padding: '3rem', textAlign: 'center', color: '#10b981' }}>
                                            ✓ All materials are available in requisition
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Details View - By Batch */}
                        {viewMode === 'details' && (
                            <div style={{
                                background: 'var(--card)',
                                borderRadius: '12px',
                                border: '2px solid #f59e0b',
                                overflow: 'hidden',
                            }}>
                                <div style={{ padding: '1rem', background: 'rgba(245, 158, 11, 0.1)', borderBottom: '1px solid #f59e0b' }}>
                                    <h3 style={{ margin: 0, color: '#f59e0b', fontWeight: '700' }}>
                                        Detailed Missing Materials ({filteredDetails.length})
                                    </h3>
                                </div>

                                <div style={{ maxHeight: '500px', overflow: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                        <thead style={{ position: 'sticky', top: 0, background: 'var(--muted)' }}>
                                            <tr>
                                                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: '600', borderBottom: '1px solid var(--border)' }}>Material Code</th>
                                                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: '600', borderBottom: '1px solid var(--border)' }}>Material Name</th>
                                                <th style={{ padding: '0.75rem 1rem', textAlign: 'center', fontWeight: '600', borderBottom: '1px solid var(--border)' }}>Type</th>
                                                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: '600', borderBottom: '1px solid var(--border)' }}>Batch No</th>
                                                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: '600', borderBottom: '1px solid var(--border)' }}>MFC No</th>
                                                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: '600', borderBottom: '1px solid var(--border)' }}>Product</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredDetails.slice(0, 200).map((m, idx) => (
                                                <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                                                    <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', fontWeight: '600', color: typeColors[m.materialType]?.text || '#333' }}>
                                                        {m.materialCode}
                                                    </td>
                                                    <td style={{ padding: '0.75rem 1rem' }}>{m.materialName}</td>
                                                    <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                                                        <span style={{
                                                            padding: '0.25rem 0.5rem',
                                                            background: typeColors[m.materialType]?.bg,
                                                            color: typeColors[m.materialType]?.text,
                                                            borderRadius: '4px',
                                                            fontSize: '0.75rem',
                                                            fontWeight: '600',
                                                        }}>
                                                            {m.materialType}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '0.75rem 1rem', fontWeight: '600' }}>{m.batchNumber}</td>
                                                    <td style={{ padding: '0.75rem 1rem', color: '#0369a1' }}>{m.mfcNo}</td>
                                                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem', color: 'var(--muted-foreground)' }}>{m.productName}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>

                                    {filteredDetails.length > 200 && (
                                        <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--muted-foreground)', background: 'var(--muted)' }}>
                                            Showing first 200 of {filteredDetails.length} results. Use search to filter.
                                        </div>
                                    )}

                                    {filteredDetails.length === 0 && (
                                        <div style={{ padding: '3rem', textAlign: 'center', color: '#10b981' }}>
                                            ✓ All materials are available in requisition
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </>
                )}
            </main>

            <style jsx global>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
        </div>
    );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
    return (
        <div style={{
            padding: '1rem',
            background: 'var(--card)',
            borderRadius: '10px',
            border: '1px solid var(--border)',
            borderLeft: `4px solid ${color}`,
        }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--muted-foreground)', marginBottom: '0.25rem' }}>{label}</div>
            <div style={{ fontSize: '1.75rem', fontWeight: '700', color }}>{value.toLocaleString()}</div>
        </div>
    );
}
