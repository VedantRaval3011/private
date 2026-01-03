'use client';

/**
 * COA Page
 * Displays BULK and FINISH stage data in APQR format
 * Matches the manual register format shown in reference images
 */

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import type { COARecord, COAStage, AssayResult, TestParameter } from '@/types/coa';

interface COAListResponse {
    success: boolean;
    data: COARecord[];
    total: number;
    bulkCount: number;
    finishCount: number;
    linkedBatches: number;
}

export default function COAPage() {
    // State
    const [records, setRecords] = useState<COARecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    // Filters
    const [stageFilter, setStageFilter] = useState<COAStage | 'ALL'>('ALL');
    const [dataTypeFilter, setDataTypeFilter] = useState<'ALL' | 'QUANTIFIABLE' | 'NON_QUANTIFIABLE'>('ALL');
    const [searchQuery, setSearchQuery] = useState('');

    // Classification Helper
    const getDataType = (testName: string, result: string): 'QUANTIFIABLE' | 'NON_QUANTIFIABLE' => {
        const name = (testName || '').toUpperCase();
        const res = (result || '').toUpperCase();

        // Quantifiable indicators
        const quantifiableNames = [
            'PH', 'ASSAY', 'UNIFORMITY', 'VOLUME', 'WEIGHT', 'IMPURITY',
            'SUBSTANCE', 'CONTENT', 'WATER', 'MOISTURE', 'ASH', 'RESIDUE',
            'LOSS ON DRYING', 'RELATED', 'PARTICLE SIZE'
        ];

        // Numeric patterns (contains numbers)
        const hasNumbers = /[0-9]/.test(result);
        const hasLimitKeywords = res.includes('NMT') || res.includes('NLT') || res.includes('ND');

        if (quantifiableNames.some(q => name.includes(q))) return 'QUANTIFIABLE';
        if (hasNumbers || hasLimitKeywords) return 'QUANTIFIABLE';

        // Non-Quantifiable indicators
        const nonQuantifiableNames = [
            'DESCRIPTION', 'APPEARANCE', 'IDENTIFICATION', 'STERILITY',
            'CAPPING', 'CLARITY', 'COLOUR', 'ODOUR', 'SOLUBILITY'
        ];

        const complianceResults = ['COMPLIES', 'DOES NOT COMPLY', 'POSITIVE', 'NEGATIVE', 'PRESENT', 'ABSENT', 'PASS', 'FAIL'];

        if (nonQuantifiableNames.some(nq => name.includes(nq))) return 'NON_QUANTIFIABLE';
        if (complianceResults.some(cr => res.includes(cr))) return 'NON_QUANTIFIABLE';

        return 'NON_QUANTIFIABLE';
    };

    // Stats
    const [stats, setStats] = useState({ total: 0, bulkCount: 0, finishCount: 0, linkedBatches: 0 });

    // Selected record for detail view
    const [selectedRecord, setSelectedRecord] = useState<COARecord | null>(null);

    // Fetch COAs
    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const params = new URLSearchParams();
            if (stageFilter !== 'ALL') params.set('stage', stageFilter);
            if (searchQuery) params.set('search', searchQuery);

            const response = await fetch(`/api/coa?${params.toString()}`);
            const data: COAListResponse = await response.json();

            if (data.success) {
                setRecords(data.data);
                setStats({
                    total: data.total,
                    bulkCount: data.bulkCount,
                    finishCount: data.finishCount,
                    linkedBatches: data.linkedBatches,
                });
            } else {
                setError('Failed to fetch COA data');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error');
        } finally {
            setLoading(false);
        }
    }, [stageFilter, searchQuery]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Handle file upload
    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        setUploading(true);
        setError(null);
        setSuccessMessage(null);

        try {
            const formData = new FormData();
            Array.from(files).forEach(file => formData.append('files', file));

            const response = await fetch('/api/coa/upload', {
                method: 'POST',
                body: formData,
            });

            const result = await response.json();

            if (result.success) {
                setSuccessMessage(`Successfully processed ${result.processed} files`);
                fetchData();
            } else {
                setError(result.errors?.join(', ') || 'Upload failed');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Upload error');
        } finally {
            setUploading(false);
            e.target.value = '';
        }
    };

    // Group records by batch number for display
    const groupedByBatch = records.reduce((acc, record) => {
        if (!acc[record.batchNumber]) {
            acc[record.batchNumber] = { bulk: null, finish: null };
        }
        if (record.stage === 'BULK') {
            acc[record.batchNumber].bulk = record;
        } else {
            acc[record.batchNumber].finish = record;
        }
        return acc;
    }, {} as Record<string, { bulk: COARecord | null; finish: COARecord | null }>);

    return (
        <div style={{
            minHeight: '100vh',
            background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
            padding: '2rem',
        }}>
            {/* Header */}
            <header style={{
                background: 'linear-gradient(135deg, #7c3aed 0%, #0d9488 100%)',
                borderRadius: '1rem',
                padding: '2rem',
                marginBottom: '2rem',
                color: 'white',
                boxShadow: '0 10px 40px rgba(124, 58, 237, 0.3)',
                position: 'relative',
            }}>
                <Link
                    href="/"
                    style={{
                        position: 'absolute',
                        top: '2rem',
                        right: '2rem',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.75rem 1.5rem',
                        background: 'rgba(255, 255, 255, 0.2)',
                        backdropFilter: 'blur(10px)',
                        border: '1px solid rgba(255, 255, 255, 0.3)',
                        borderRadius: '0.5rem',
                        color: 'white',
                        textDecoration: 'none',
                        fontSize: '0.875rem',
                        fontWeight: '600',
                        transition: 'all 0.2s',
                        cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
                        e.currentTarget.style.transform = 'translateY(-2px)';
                        e.currentTarget.style.boxShadow = '0 4px 15px rgba(0, 0, 0, 0.2)';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = 'none';
                    }}
                >
                    ← Back to Home
                </Link>
                <h1 style={{ fontSize: '2rem', fontWeight: '700', marginBottom: '0.5rem' }}>
                    📋 APQR COA Data
                </h1>
                <p style={{ opacity: 0.9 }}>
                    In-Process Results at Bulk Stage & Finished Product Analysis (Certificate of Analysis)
                </p>
            </header>

            {/* Stats Cards */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '1rem',
                marginBottom: '2rem',
            }}>
                <StatCard label="Total Records" value={stats.total} color="#7c3aed" />
                <StatCard label="Bulk Stage" value={stats.bulkCount} color="#f59e0b" />
                <StatCard label="Finished Product" value={stats.finishCount} color="#10b981" />
                <StatCard label="Complete Batches" value={stats.linkedBatches} color="#3b82f6" />
            </div>

            {/* Upload Section */}
            <div style={{
                background: 'white',
                borderRadius: '1rem',
                padding: '1.5rem',
                marginBottom: '2rem',
                boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
            }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: '600', marginBottom: '1rem' }}>
                    Upload COA XML Files
                </h2>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <label style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
                        color: 'white',
                        padding: '0.75rem 1.5rem',
                        borderRadius: '0.5rem',
                        cursor: uploading ? 'not-allowed' : 'pointer',
                        opacity: uploading ? 0.7 : 1,
                        transition: 'all 0.2s',
                    }}>
                        {uploading ? '⏳ Uploading...' : '📁 Select Files'}
                        <input
                            type="file"
                            accept=".xml"
                            multiple
                            onChange={handleFileUpload}
                            disabled={uploading}
                            style={{ display: 'none' }}
                        />
                    </label>
                    <span style={{ color: '#64748b', fontSize: '0.875rem' }}>
                        Accepts _BULK.xml and _FINISH.xml files
                    </span>
                </div>

                {successMessage && (
                    <div style={{
                        marginTop: '1rem',
                        padding: '0.75rem 1rem',
                        background: '#ecfdf5',
                        color: '#047857',
                        borderRadius: '0.5rem',
                        border: '1px solid #a7f3d0',
                    }}>
                        ✅ {successMessage}
                    </div>
                )}

                {error && (
                    <div style={{
                        marginTop: '1rem',
                        padding: '0.75rem 1rem',
                        background: '#fef2f2',
                        color: '#dc2626',
                        borderRadius: '0.5rem',
                        border: '1px solid #fecaca',
                    }}>
                        ❌ {error}
                    </div>
                )}
            </div>

            {/* Filters */}
            <div style={{
                display: 'flex',
                gap: '1rem',
                marginBottom: '1.5rem',
                flexWrap: 'wrap',
            }}>
                <select
                    value={stageFilter}
                    onChange={e => setStageFilter(e.target.value as typeof stageFilter)}
                    style={{
                        padding: '0.75rem 1rem',
                        borderRadius: '0.5rem',
                        border: '1px solid #e2e8f0',
                        background: 'white',
                        fontSize: '0.875rem',
                        cursor: 'pointer',
                    }}
                >
                    <option value="ALL">All Stages</option>
                    <option value="BULK">Bulk Stage Only</option>
                    <option value="FINISH">Finished Product Only</option>
                </select>

                <select
                    value={dataTypeFilter}
                    onChange={e => setDataTypeFilter(e.target.value as typeof dataTypeFilter)}
                    style={{
                        padding: '0.75rem 1rem',
                        borderRadius: '0.5rem',
                        border: '1px solid #e2e8f0',
                        background: 'white',
                        fontSize: '0.875rem',
                        cursor: 'pointer',
                        fontWeight: '600',
                        color: dataTypeFilter === 'ALL' ? '#64748b' : '#7c3aed',
                        borderColor: dataTypeFilter === 'ALL' ? '#e2e8f0' : '#c4b5fd',
                    }}
                >
                    <option value="ALL">All Data Types</option>
                    <option value="QUANTIFIABLE">🔹 Quantifiable Data</option>
                    <option value="NON_QUANTIFIABLE">🔸 Non-Quantifiable Data</option>
                </select>

                <input
                    type="text"
                    placeholder="Search batch, product, AR number..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    style={{
                        padding: '0.75rem 1rem',
                        borderRadius: '0.5rem',
                        border: '1px solid #e2e8f0',
                        background: 'white',
                        fontSize: '0.875rem',
                        minWidth: '300px',
                    }}
                />

                <button
                    onClick={fetchData}
                    style={{
                        padding: '0.75rem 1rem',
                        borderRadius: '0.5rem',
                        border: 'none',
                        background: '#0d9488',
                        color: 'white',
                        cursor: 'pointer',
                        fontSize: '0.875rem',
                    }}
                >
                    🔄 Refresh
                </button>
            </div>

            {/* Loading */}
            {loading && (
                <div style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>
                    ⏳ Loading COA data...
                </div>
            )}

            {/* Data Tables */}
            {!loading && records.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                    {/* BULK Stage Table */}
                    {(stageFilter === 'ALL' || stageFilter === 'BULK') && stats.bulkCount > 0 && (
                        <BulkStageTable
                            records={records.filter(r => r.stage === 'BULK')}
                            onSelect={setSelectedRecord}
                            dataTypeFilter={dataTypeFilter}
                            getDataType={getDataType}
                        />
                    )}

                    {/* FINISH Stage Table */}
                    {(stageFilter === 'ALL' || stageFilter === 'FINISH') && stats.finishCount > 0 && (
                        <FinishStageTable
                            records={records.filter(r => r.stage === 'FINISH')}
                            onSelect={setSelectedRecord}
                            dataTypeFilter={dataTypeFilter}
                            getDataType={getDataType}
                        />
                    )}
                </div>
            )}

            {/* Empty State */}
            {!loading && records.length === 0 && (
                <div style={{
                    textAlign: 'center',
                    padding: '4rem',
                    background: 'white',
                    borderRadius: '1rem',
                    color: '#64748b',
                }}>
                    <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📂</div>
                    <p>No COA data found. Upload BULK or FINISH XML files to get started.</p>
                </div>
            )}

            {/* Detail Modal */}
            {selectedRecord && (
                <DetailModal
                    record={selectedRecord}
                    onClose={() => setSelectedRecord(null)}
                    dataTypeFilter={dataTypeFilter}
                    getDataType={getDataType}
                />
            )}
        </div>
    );
}

// Stat Card Component
function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
    return (
        <div style={{
            background: 'white',
            borderRadius: '1rem',
            padding: '1.25rem',
            boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
            borderLeft: `4px solid ${color}`,
        }}>
            <div style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '0.25rem' }}>
                {label}
            </div>
            <div style={{ color, fontSize: '2rem', fontWeight: '700' }}>
                {value}
            </div>
        </div>
    );
}

// BULK Stage Table - Matches "5.3.1 In-Process Analysis Results at Bulk Stage" format
function BulkStageTable({
    records,
    onSelect,
    dataTypeFilter,
    getDataType
}: {
    records: COARecord[];
    onSelect: (r: COARecord) => void;
    dataTypeFilter: 'ALL' | 'QUANTIFIABLE' | 'NON_QUANTIFIABLE';
    getDataType: (name: string, res: string) => 'QUANTIFIABLE' | 'NON_QUANTIFIABLE';
}) {
    const [isExpanded, setIsExpanded] = useState(true);

    return (
        <div style={{
            background: 'white',
            borderRadius: '1rem',
            overflow: 'hidden',
            boxShadow: '0 4px 25px rgba(0,0,0,0.1)',
            border: '1px solid #e2e8f0',
        }}>
            <div style={{
                background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                padding: '1.25rem 1.5rem',
                color: 'white',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <h3 style={{ fontWeight: '700', fontSize: '1.25rem', margin: 0 }}>
                        5.3.1 In-Process Analysis Results at Bulk Stage
                    </h3>
                    <span style={{
                        fontSize: '0.75rem',
                        background: 'rgba(255,255,255,0.2)',
                        padding: '0.2rem 0.6rem',
                        borderRadius: '1rem',
                        fontWeight: '600'
                    }}>
                        {records.length} Records
                    </span>
                </div>
                <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    style={{
                        background: 'rgba(255,255,255,0.2)',
                        border: 'none',
                        color: 'white',
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        fontSize: '1.25rem',
                        transition: 'transform 0.3s ease',
                        transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                    }}
                >
                    ▼
                </button>
            </div>

            {isExpanded && (
                <>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{
                            width: '100%',
                            borderCollapse: 'collapse',
                            fontSize: '0.8125rem',
                            minWidth: '1400px'
                        }}>
                            <thead>
                                <tr style={{ background: '#fffbeb' }}>
                                    <th style={thStyle}>Batch No</th>
                                    <th style={thStyle}>AR Number</th>
                                    <th style={thStyle}>Product Name</th>
                                    <th style={thStyle}>Product Code</th>
                                    <th style={thStyle}>Description</th>
                                    <th style={thStyle}>pH / Parameters</th>
                                    <th style={thStyle}>Assay Results</th>
                                    <th style={thStyle}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {records.map((record, idx) => (
                                    <tr key={record._id || idx} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.2s' }}>
                                        <td style={{ ...tdStyle, fontWeight: '700', color: '#d97706' }}>{record.batchNumber}</td>
                                        <td style={tdStyle}>{record.arNumber}</td>
                                        <td style={{ ...tdStyle, fontWeight: '600' }}>{record.productName}</td>
                                        <td style={tdStyle}>{record.productCode}</td>
                                        <td style={{ ...tdStyle, fontSize: '0.75rem', color: '#64748b' }}>{record.bulkData?.description || '-'}</td>
                                        <td style={tdStyle}>
                                            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                                                {record.bulkData?.testParameters
                                                    ?.filter(p => !p.name.toUpperCase().includes('ASSAY'))
                                                    ?.filter(p => dataTypeFilter === 'ALL' || getDataType(p.name, p.result) === dataTypeFilter)
                                                    ?.map((p, i) => (
                                                        <div key={i} style={{ background: '#f8fafc', padding: '0.2rem 0.4rem', borderRadius: '0.25rem', border: '1px solid #e2e8f0', fontSize: '0.7rem' }}>
                                                            <span style={{ fontWeight: '600' }}>{p.name}:</span> {p.result}
                                                        </div>
                                                    ))}
                                            </div>
                                        </td>
                                        <td style={tdStyle}>
                                            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                                                {(dataTypeFilter === 'ALL' || dataTypeFilter === 'QUANTIFIABLE') && record.bulkData?.assayResults?.map((a, i) => (
                                                    <div key={i} style={{ background: '#fef3c7', padding: '0.2rem 0.4rem', borderRadius: '0.25rem', border: '1px solid #fcd34d', fontSize: '0.7rem' }}>
                                                        <span style={{ fontWeight: '600' }}>{a.compound}:</span> {a.result}
                                                    </div>
                                                ))}
                                            </div>
                                        </td>
                                        <td style={tdStyle}>
                                            <button
                                                onClick={() => onSelect(record)}
                                                style={{
                                                    padding: '0.4rem 0.8rem',
                                                    background: '#fef3c7',
                                                    color: '#d97706',
                                                    border: '1px solid #fcd34d',
                                                    borderRadius: '0.4rem',
                                                    cursor: 'pointer',
                                                    fontSize: '0.7rem',
                                                    fontWeight: '700',
                                                }}
                                            >
                                                View COA
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div style={{
                        padding: '1.25rem 1.5rem',
                        background: '#fffbeb',
                        borderTop: '1px solid #fde68a',
                        fontSize: '0.8125rem',
                        color: '#92400e',
                    }}>
                        <strong>Remark:</strong> In-process parameters at bulk stage found (Satisfactory)
                        within the limit as per in-process specification during the review period.
                    </div>
                </>
            )}
        </div>
    );
}

// FINISH Stage Table - Matches Critical Parameters & Identification format
function FinishStageTable({
    records,
    onSelect,
    dataTypeFilter,
    getDataType
}: {
    records: COARecord[];
    onSelect: (r: COARecord) => void;
    dataTypeFilter: 'ALL' | 'QUANTIFIABLE' | 'NON_QUANTIFIABLE';
    getDataType: (name: string, res: string) => 'QUANTIFIABLE' | 'NON_QUANTIFIABLE';
}) {
    const [isExpanded, setIsExpanded] = useState(true);

    return (
        <div style={{
            background: 'white',
            borderRadius: '1rem',
            overflow: 'hidden',
            boxShadow: '0 4px 25px rgba(0,0,0,0.1)',
            border: '1px solid #e2e8f0',
        }}>
            <div style={{
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                padding: '1.25rem 1.5rem',
                color: 'white',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <h3 style={{ fontWeight: '700', fontSize: '1.25rem', margin: 0 }}>
                        5.3.2 Finished Product Analysis
                    </h3>
                    <span style={{
                        fontSize: '0.75rem',
                        background: 'rgba(255,255,255,0.2)',
                        padding: '0.2rem 0.6rem',
                        borderRadius: '1rem',
                        fontWeight: '600'
                    }}>
                        {records.length} Records
                    </span>
                </div>
                <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    style={{
                        background: 'rgba(255,255,255,0.2)',
                        border: 'none',
                        color: 'white',
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        fontSize: '1.25rem',
                        transition: 'transform 0.3s ease',
                        transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                    }}
                >
                    ▼
                </button>
            </div>

            {isExpanded && (
                <>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{
                            width: '100%',
                            borderCollapse: 'collapse',
                            fontSize: '0.8125rem',
                            minWidth: '2000px'
                        }}>
                            <thead>
                                <tr style={{ background: '#ecfdf5' }}>
                                    <th style={thStyle}>Batch No</th>
                                    <th style={thStyle}>AR Number</th>
                                    <th style={thStyle}>Product Name</th>
                                    <th style={thStyle}>Product Code</th>
                                    <th style={thStyle}>Description</th>
                                    <th style={thStyle}>pH / Critical Params</th>
                                    <th style={thStyle}>Identification</th>
                                    <th style={thStyle}>Related Substances</th>
                                    <th style={thStyle}>Assay Results</th>
                                    <th style={{ ...thStyle, position: 'sticky', right: 0, background: '#ecfdf5', boxShadow: '-4px 0 8px rgba(0,0,0,0.05)', zIndex: 10 }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {records.map((record, idx) => {
                                    const fd = record.finishData;
                                    return (
                                        <tr key={record._id || idx} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.2s' }}>
                                            <td style={{ ...tdStyle, fontWeight: '700', color: '#059669' }}>{record.batchNumber}</td>
                                            <td style={tdStyle}>{record.arNumber}</td>
                                            <td style={{ ...tdStyle, fontWeight: '600' }}>{record.productName}</td>
                                            <td style={tdStyle}>{record.productCode}</td>
                                            <td style={{ ...tdStyle, fontSize: '0.75rem', color: '#64748b', maxWidth: '150px' }}>{fd?.description || '-'}</td>
                                            <td style={tdStyle}>
                                                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                                                    {fd?.criticalParameters
                                                        ?.filter(p => dataTypeFilter === 'ALL' || getDataType(p.name, p.result) === dataTypeFilter)
                                                        ?.map((p, i) => (
                                                            <div key={i} style={{ background: '#f8fafc', padding: '0.2rem 0.4rem', borderRadius: '0.25rem', border: '1px solid #e2e8f0', fontSize: '0.7rem' }}>
                                                                <strong>{p.name}:</strong> {p.result}
                                                            </div>
                                                        ))}
                                                </div>
                                            </td>
                                            <td style={tdStyle}>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', fontSize: '0.7rem' }}>
                                                    {fd?.identificationTests
                                                        ?.filter(t => dataTypeFilter === 'ALL' || getDataType(t.method, t.result) === dataTypeFilter)
                                                        ?.map((t, i) => (
                                                            <div key={i}>• {t.method} ({t.compound}): <strong>{t.result}</strong></div>
                                                        ))}
                                                    {(!fd?.identificationTests || fd.identificationTests.length === 0) && '-'}
                                                </div>
                                            </td>
                                            <td style={tdStyle}>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', fontSize: '0.7rem' }}>
                                                    {fd?.relatedSubstances
                                                        ?.filter(s => dataTypeFilter === 'ALL' || getDataType(s.compound, s.result) === dataTypeFilter)
                                                        ?.map((s, i) => (
                                                            <div key={i}>• {s.compound}: <strong>{s.result}</strong></div>
                                                        ))}
                                                    {(!fd?.relatedSubstances || fd.relatedSubstances.length === 0) && '-'}
                                                </div>
                                            </td>
                                            <td style={tdStyle}>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                                    {(dataTypeFilter === 'ALL' || dataTypeFilter === 'QUANTIFIABLE') && fd?.assayResults?.map((a, i) => {
                                                        // Parse result to separate assay % and content % w/v
                                                        const resultParts = a.result.split(/i\.?e\.?/i);
                                                        const assayValue = resultParts[0]?.trim() || a.result;
                                                        const contentValue = resultParts[1]?.trim() || a.resultAlt;

                                                        return (
                                                            <div key={i} style={{
                                                                background: '#d1fae5',
                                                                padding: '0.5rem',
                                                                borderRadius: '0.375rem',
                                                                border: '1px solid #6ee7b7',
                                                                fontSize: '0.75rem'
                                                            }}>
                                                                <div style={{ fontWeight: '700', color: '#047857', marginBottom: '0.25rem' }}>
                                                                    {a.compound}
                                                                </div>
                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem', color: '#065f46' }}>
                                                                    <span>Assay: <strong>{assayValue}</strong></span>
                                                                    {contentValue && <span>Content: <strong>{contentValue}</strong></span>}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                    {(!fd?.assayResults || fd.assayResults.length === 0) && '-'}
                                                </div>
                                            </td>
                                            <td style={{ ...tdStyle, position: 'sticky', right: 0, background: 'white', boxShadow: '-4px 0 8px rgba(0,0,0,0.05)', zIndex: 5 }}>
                                                <button
                                                    onClick={() => onSelect(record)}
                                                    style={{
                                                        padding: '0.4rem 0.8rem',
                                                        background: '#d1fae5',
                                                        color: '#059669',
                                                        border: '1px solid #6ee7b7',
                                                        borderRadius: '0.4rem',
                                                        cursor: 'pointer',
                                                        fontSize: '0.7rem',
                                                        fontWeight: '700',
                                                    }}
                                                >
                                                    View COA
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    <div style={{
                        padding: '1.25rem 1.5rem',
                        background: '#ecfdf5',
                        borderTop: '1px solid #a7f3d0',
                        fontSize: '0.8125rem',
                        color: '#065f46',
                    }}>
                        <strong>Remark:</strong> Finished product parameters found (Satisfactory)
                        within the limit as per finished product specification during the review period.
                    </div>
                </>
            )}
        </div>
    );
}

// Detail Modal - matches the COA document format shown in reference images
function DetailModal({
    record,
    onClose,
    dataTypeFilter,
    getDataType
}: {
    record: COARecord;
    onClose: () => void;
    dataTypeFilter: 'ALL' | 'QUANTIFIABLE' | 'NON_QUANTIFIABLE';
    getDataType: (name: string, res: string) => 'QUANTIFIABLE' | 'NON_QUANTIFIABLE';
}) {
    const isBulk = record.stage === 'BULK';
    const data = isBulk ? record.bulkData : record.finishData;

    // Prepare table rows for COA format
    const coaRows: Array<{
        sr: number;
        test: string;
        result: string;
        spec: string;
    }> = [];

    let currentSr = 1;

    // 1. Description
    if (data?.description) {
        if (dataTypeFilter === 'ALL' || getDataType('DESCRIPTION', data.description) === dataTypeFilter) {
            coaRows.push({
                sr: currentSr++,
                test: 'DESCRIPTION',
                result: data.description,
                spec: data.specification || 'As per BP/USP'
            });
        }
    }

    // 2. Identification (FINISH)
    if (!isBulk && record.finishData?.identificationTests && record.finishData.identificationTests.length > 0) {
        const idTests = record.finishData.identificationTests.filter(it =>
            dataTypeFilter === 'ALL' || getDataType(it.method, it.result) === dataTypeFilter
        );

        if (idTests.length > 0) {
            coaRows.push({
                sr: currentSr++,
                test: 'IDENTIFICATION',
                result: '.',
                spec: '.'
            });

            idTests.forEach((it, idx) => {
                coaRows.push({
                    sr: idx + 1,
                    test: `By ${it.method}: ${it.compound}`,
                    result: it.result,
                    spec: it.specification
                });
            });
        }
    }

    // 3. pH or other Test Parameters (BULK)
    if (isBulk && record.bulkData?.testParameters) {
        record.bulkData.testParameters.forEach(tp => {
            if (dataTypeFilter === 'ALL' || getDataType(tp.name, tp.result) === dataTypeFilter) {
                coaRows.push({
                    sr: currentSr++,
                    test: tp.name.toUpperCase(),
                    result: tp.result,
                    spec: tp.limits || '-'
                });
            }
        });
    }

    // 3. Critical Parameters (FINISH)
    if (!isBulk && record.finishData?.criticalParameters) {
        record.finishData.criticalParameters.forEach(cp => {
            if (dataTypeFilter === 'ALL' || getDataType(cp.name, cp.result) === dataTypeFilter) {
                coaRows.push({
                    sr: currentSr++,
                    test: cp.name.toUpperCase(),
                    result: cp.result,
                    spec: cp.limit || '-'
                });
            }
        });
    }

    // 4. Related Substances (FINISH)
    if (!isBulk && record.finishData?.relatedSubstances && record.finishData.relatedSubstances.length > 0) {
        const relTests = record.finishData.relatedSubstances.filter(rs =>
            dataTypeFilter === 'ALL' || getDataType(rs.compound, rs.result) === dataTypeFilter
        );

        if (relTests.length > 0) {
            coaRows.push({
                sr: currentSr++,
                test: 'RELATED SUBSTANCES',
                result: '.',
                spec: '.'
            });

            relTests.forEach((rs, idx) => {
                coaRows.push({
                    sr: idx + 1,
                    test: rs.compound.toUpperCase(),
                    result: rs.result,
                    spec: rs.limit || '-'
                });
            });
        }
    }

    // 8. Assay
    if (data?.assayResults && data.assayResults.length > 0) {
        // Assay is always quantifiable
        if (dataTypeFilter === 'ALL' || dataTypeFilter === 'QUANTIFIABLE') {
            coaRows.push({
                sr: currentSr++,
                test: 'ASSAY',
                result: '.',
                spec: '.'
            });

            data.assayResults.forEach((ar, idx) => {
                const specLines = ar.specification
                    ? ar.specification.split('\n').map(line => line.trim()).filter(line => line && line !== '.')
                    : [];

                const displaySpec = specLines.length > 0
                    ? specLines.join('\n')
                    : (ar.limitMin && ar.limitMax ? `${ar.limitMin} to ${ar.limitMax} of label amount.` : 'As per spec');

                coaRows.push({
                    sr: idx + 1,
                    test: ar.compound.toUpperCase(),
                    result: ar.result + (ar.resultAlt ? `\n${ar.resultAlt}` : ''),
                    spec: displaySpec
                });
            });
        }
    }

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem',
        }} onClick={onClose}>
            <div
                style={{
                    background: 'white',
                    borderRadius: '0.25rem',
                    maxWidth: '1000px',
                    maxHeight: '95vh',
                    overflow: 'auto',
                    width: '100%',
                    boxShadow: '0 25px 50px rgba(0,0,0,0.4)',
                    padding: '2rem',
                    position: 'relative',
                    fontFamily: '"Times New Roman", Times, serif', // COA style font
                    color: 'black',
                }}
                onClick={e => e.stopPropagation()}
            >
                {/* Close Button UI */}
                <button
                    onClick={onClose}
                    style={{
                        position: 'absolute',
                        top: '1rem',
                        right: '1rem',
                        background: '#f1f5f9',
                        border: 'none',
                        color: '#64748b',
                        width: '2rem',
                        height: '2rem',
                        borderRadius: '50%',
                        cursor: 'pointer',
                        fontSize: '1rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 10,
                    }}
                >
                    ✕
                </button>

                {/* COA Header Box */}
                <div style={{ border: '2px solid black', padding: '1rem', marginBottom: '1.5rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 1.5fr minmax(0, 1fr)', gap: '1rem', marginBottom: '1rem', borderBottom: '1px solid black', paddingBottom: '0.5rem' }}>
                        <div>
                            <div style={{ fontWeight: 'bold' }}>Product Name</div>
                            <div style={{ fontWeight: 'bold' }}>Generic Name</div>
                            <div style={{ fontWeight: 'bold' }}>Product Code</div>
                        </div>
                        <div style={{ wordBreak: 'break-word' }}>
                            <div>: {data?.productName}</div>
                            <div>: {data?.genericName}</div>
                            <div>: {data?.productCode}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <div style={{ fontWeight: 'bold' }}>Batch No. : <span style={{ textDecoration: 'underline' }}>{record.batchNumber}</span></div>
                            <div style={{ fontWeight: 'bold' }}>Batch Size : {data?.batchSize}</div>
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                        <div>
                            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '4px' }}>
                                <span style={{ fontWeight: 'bold' }}>Label Claim</span><span>: </span>
                                <div style={{ gridColumn: '1 / span 2', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                                    COMPOSITION:<br />
                                    {data?.genericName} {data?.specification}<br />
                                    ... Q.S
                                </div>
                            </div>
                        </div>
                        <div>
                            <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '4px', fontSize: '0.9rem' }}>
                                <span style={{ fontWeight: 'bold' }}>Location</span><span>: WADHWAN</span>
                                <span style={{ fontWeight: 'bold' }}>Make</span><span>: {data?.manufacturer}</span>
                                <span style={{ fontWeight: 'bold' }}>Mfg. Lic No.</span><span>: {data?.mfgLicenseNo}</span>
                                <span style={{ fontWeight: 'bold' }}>Specification No.</span><span>: {data?.specification}</span>
                                <br />
                                <span style={{ fontWeight: 'bold' }}>Test As Per</span><span>: {data?.specification}</span>
                                <span style={{ fontWeight: 'bold' }}>Sample Size</span><span>: 50.000 ML</span>
                                <span style={{ fontWeight: 'bold', fontSize: '1rem' }}>Mfg. Dt. : {data?.mfgDate}</span>
                                <span style={{ fontWeight: 'bold', fontSize: '1rem' }}>Exp. Dt. : {data?.expDate}</span>
                                <br />
                                <span style={{ fontWeight: 'bold' }}>T.R. Slip No.</span><span>: {data?.testNumber}</span>
                                <span style={{ fontWeight: 'bold' }}>Analysis Date</span><span>: {data?.testDate}</span>
                                <span style={{ fontWeight: 'bold' }}>A.R. No.</span><span>: {record.arNumber}</span>
                                {!isBulk && (
                                    <>
                                        <span style={{ fontWeight: 'bold' }}>Released Qty.</span>
                                        <span>: {record.finishData?.releaseQty}</span>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Test Table */}
                <table style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    border: '2px solid black',
                    marginBottom: '1rem'
                }}>
                    <thead>
                        <tr style={{ background: '#e5e7eb' }}>
                            <th style={{ ...coaThStyle, width: '40px' }}>Sr.</th>
                            <th style={coaThStyle}>Test</th>
                            <th style={coaThStyle}>Result</th>
                            <th style={coaThStyle}>Specification</th>
                        </tr>
                    </thead>
                    <tbody>
                        {coaRows.map((row, i) => (
                            <tr key={i} style={{ borderBottom: row.result === '.' ? 'none' : '1px solid #ccc' }}>
                                <td style={{ ...coaTdStyle, textAlign: 'center', fontWeight: row.result === '.' ? 'bold' : 'normal' }}>
                                    {row.result === '.' ? row.sr : row.sr}
                                </td>
                                <td style={{ ...coaTdStyle, fontWeight: row.result === '.' ? 'bold' : 'normal', paddingLeft: row.sr > 0 && row.result !== '.' && !['DESCRIPTION', 'PH', 'ASSAY', 'IDENTIFICATION', 'RELATED SUBSTANCES'].includes(row.test) ? '1.5rem' : '0.5rem' }}>
                                    {row.test}
                                </td>
                                <td style={{ ...coaTdStyle, whiteSpace: 'pre-line', textAlign: row.result === '.' ? 'center' : 'left' }}>
                                    {row.result === '.' ? '-' : row.result}
                                </td>
                                <td style={{ ...coaTdStyle, whiteSpace: 'pre-line', textAlign: row.spec === '.' ? 'center' : 'left' }}>
                                    {row.spec === '.' ? '-' : row.spec}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {/* Conclusion */}
                <div style={{ border: '2px solid black', padding: '1rem', marginTop: '1rem' }}>
                    <div style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>
                        Conclusion : The above sample complies as per <span style={{ textDecoration: 'underline' }}>{data?.specification}</span>
                    </div>
                    <div style={{ fontSize: '0.9rem' }}>
                        In the Opinion of the undersigned the sample referred to above is of Standard quality as defined in the Act and the Rules made thereunder for the result given above. "This computer generated certificate of analysis is valid without signature"
                    </div>
                </div>

                {/* Footer Signatures */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginTop: '2rem', borderTop: '1px solid black', paddingTop: '1rem' }}>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ fontWeight: 'bold', marginBottom: '2rem' }}>Analyst</div>
                        <div style={{ borderTop: '1px solid black', display: 'inline-block', minWidth: '200px', paddingTop: '0.25rem' }}>{data?.analystName}</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ fontWeight: 'bold', marginBottom: '2rem' }}>Q.C. Incharge</div>
                        <div style={{ borderTop: '1px solid black', display: 'inline-block', minWidth: '200px', paddingTop: '0.25rem' }}>{data?.qaData?.reviewedBy || 'Manager'}</div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// Helper Components
function ComplianceBadge({ complies }: { complies: boolean }) {
    return (
        <span style={{
            display: 'inline-block',
            padding: '0.25rem 0.5rem',
            background: complies ? '#d1fae5' : '#fee2e2',
            color: complies ? '#047857' : '#dc2626',
            borderRadius: '0.25rem',
            fontSize: '0.75rem',
            fontWeight: '600',
        }}>
            {complies ? '✓ Complies' : '✗ Failed'}
        </span>
    );
}

function InfoItem({ label, value }: { label: string; value: string }) {
    return (
        <div style={{
            padding: '0.75rem',
            background: '#f8fafc',
            borderRadius: '0.5rem',
        }}>
            <div style={{ color: '#64748b', fontSize: '0.75rem', marginBottom: '0.25rem' }}>{label}</div>
            <div style={{ fontWeight: '600' }}>{value}</div>
        </div>
    );
}

// Table Styles
const thStyle: React.CSSProperties = {
    padding: '1rem',
    textAlign: 'left',
    fontWeight: '700',
    fontSize: '0.7rem',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: '#475569',
    whiteSpace: 'nowrap',
};

const tdStyle: React.CSSProperties = {
    padding: '1rem',
    verticalAlign: 'top',
    borderRight: '1px solid #f1f5f9',
};

const coaThStyle: React.CSSProperties = {
    border: '1px solid black',
    padding: '0.5rem',
    textAlign: 'center',
    fontSize: '0.9rem',
};

const coaTdStyle: React.CSSProperties = {
    border: '1px solid black',
    padding: '0.5rem',
    fontSize: '0.9rem',
    verticalAlign: 'top',
};
