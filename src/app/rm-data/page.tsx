
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import type { RMCOARecord } from '@/types/rmcoa';

type SortConfig = {
    key: keyof RMCOARecord | 'testCount';
    direction: 'asc' | 'desc';
};

export default function RMDataPage() {
    const [records, setRecords] = useState<RMCOARecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedRecord, setSelectedRecord] = useState<RMCOARecord | null>(null);
    
    // Sorting state
    const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'arNo', direction: 'desc' });

    // Filter state
    const [filters, setFilters] = useState({
        arNo: '',
        materialCode: '',
        materialName: '',
        manufacturer: '',
        supplier: '',
        batchNumber: ''
    });

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (searchQuery) params.set('search', searchQuery);
            
            const res = await fetch(`/api/rm-coa?${params.toString()}`);
            const data = await res.json();
            
            if (data.success) {
                setRecords(data.data);
            }
        } catch (error) {
            console.error('Failed to fetch RM COA data', error);
        } finally {
            setLoading(false);
        }
    }, [searchQuery]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleSort = (key: keyof RMCOARecord | 'testCount') => {
        setSortConfig(current => ({
            key,
            direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const handleFilterChange = (key: keyof typeof filters, value: string) => {
        setFilters(prev => ({ ...prev, [key]: value }));
    };

    // Derived state for sorted and filtered records
    const processedRecords = useMemo(() => {
        let filtered = records.filter(record => {
            return (
                (record.arNo?.toLowerCase() || '').includes(filters.arNo.toLowerCase()) &&
                (record.materialCode?.toLowerCase() || '').includes(filters.materialCode.toLowerCase()) &&
                (record.materialName?.toLowerCase() || '').includes(filters.materialName.toLowerCase()) &&
                (record.manufacturer?.toLowerCase() || '').includes(filters.manufacturer.toLowerCase()) &&
                (record.supplier?.toLowerCase() || '').includes(filters.supplier.toLowerCase()) &&
                (record.batchNumber?.toLowerCase() || '').includes(filters.batchNumber.toLowerCase())
            );
        });

        return filtered.sort((a, b) => {
            const aValue = sortConfig.key === 'testCount' ? (a.testParameters?.length || 0) : (a[sortConfig.key] || '');
            const bValue = sortConfig.key === 'testCount' ? (b.testParameters?.length || 0) : (b[sortConfig.key] || '');

            if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }, [records, filters, sortConfig]);

    const SortIcon = ({ columnKey }: { columnKey: keyof RMCOARecord | 'testCount' }) => {
        if (sortConfig.key !== columnKey) return <span style={{ opacity: 0.3, marginLeft: '4px' }}>↕</span>;
        return <span style={{ marginLeft: '4px' }}>{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>;
    };

    return (
        <div style={{
            minHeight: '100vh',
            background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)',
            padding: '2rem',
            fontFamily: 'Inter, sans-serif'
        }}>
            {/* Header */}
            <header style={{
                background: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)',
                borderRadius: '1rem',
                padding: '2rem',
                marginBottom: '2rem',
                color: 'white',
                boxShadow: '0 10px 40px rgba(14, 165, 233, 0.3)',
                position: 'relative',
            }}>
                <Link
                    href="/"
                    style={{
                        position: 'absolute',
                        top: '2rem',
                        right: '2rem',
                        background: 'rgba(255, 255, 255, 0.2)',
                        backdropFilter: 'blur(10px)',
                        border: '1px solid rgba(255, 255, 255, 0.3)',
                        borderRadius: '0.5rem',
                        color: 'white',
                        padding: '0.5rem 1rem',
                        textDecoration: 'none',
                        fontWeight: '600',
                        fontSize: '0.875rem'
                    }}
                >
                    ← Back to Home
                </Link>
                <h1 style={{ fontSize: '2rem', fontWeight: '700', marginBottom: '0.5rem' }}>
                    📦 Raw Material Data
                </h1>
                <p style={{ opacity: 0.9 }}>
                    Certificate of Analysis (COA) for Raw Materials
                </p>
            </header>

            {/* Controls */}
            <div style={{
                display: 'flex',
                justifyContent: 'flex-end',
                marginBottom: '1.5rem',
                gap: '1rem',
            }}>
                <button
                    onClick={fetchData}
                    style={{
                        padding: '0.75rem 1.5rem',
                        background: 'white',
                        color: '#0284c7',
                        border: '1px solid #e2e8f0',
                        borderRadius: '0.5rem',
                        cursor: 'pointer',
                        fontWeight: '600'
                    }}
                >
                    Refresh Data
                </button>
            </div>

            {/* Data Table */}
            <div style={{
                background: 'white',
                borderRadius: '1rem',
                overflow: 'hidden',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
            }}>
                {loading ? (
                    <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
                        Loading...
                    </div>
                ) : records.length === 0 ? (
                    <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
                        No records found. Try scanning files from the Home page.
                    </div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1200px' }}>
                            <thead style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                <tr>
                                    <th style={thStyle}>
                                        <div style={headerContentStyle} onClick={() => handleSort('arNo')}> AR Number <SortIcon columnKey="arNo" /> </div>
                                        <input 
                                            style={filterInputStyle} 
                                            placeholder="Filter..." 
                                            value={filters.arNo}
                                            onChange={(e) => handleFilterChange('arNo', e.target.value)}
                                        />
                                    </th>
                                    <th style={thStyle}>
                                        <div style={headerContentStyle} onClick={() => handleSort('materialCode')}> Mat. Code <SortIcon columnKey="materialCode" /> </div>
                                        <input 
                                            style={filterInputStyle} 
                                            placeholder="Filter..." 
                                            value={filters.materialCode}
                                            onChange={(e) => handleFilterChange('materialCode', e.target.value)}
                                        />
                                    </th>
                                    <th style={thStyle}>
                                        <div style={headerContentStyle} onClick={() => handleSort('materialName')}> Material Name <SortIcon columnKey="materialName" /> </div>
                                        <input 
                                            style={filterInputStyle} 
                                            placeholder="Filter..." 
                                            value={filters.materialName}
                                            onChange={(e) => handleFilterChange('materialName', e.target.value)}
                                        />
                                    </th>
                                    <th style={thStyle}>
                                        <div style={headerContentStyle} onClick={() => handleSort('batchNumber')}> Batch No <SortIcon columnKey="batchNumber" /> </div>
                                        <input 
                                            style={filterInputStyle} 
                                            placeholder="Filter..." 
                                            value={filters.batchNumber}
                                            onChange={(e) => handleFilterChange('batchNumber', e.target.value)}
                                        />
                                    </th>
                                    <th style={thStyle}>
                                        <div style={headerContentStyle} onClick={() => handleSort('supplier')}> Supplier <SortIcon columnKey="supplier" /> </div>
                                        <input 
                                            style={filterInputStyle} 
                                            placeholder="Filter..." 
                                            value={filters.supplier}
                                            onChange={(e) => handleFilterChange('supplier', e.target.value)}
                                        />
                                    </th>
                                    <th style={thStyle}>
                                        <div style={headerContentStyle} onClick={() => handleSort('manufacturer')}> Manufacturer <SortIcon columnKey="manufacturer" /> </div>
                                        <input 
                                            style={filterInputStyle} 
                                            placeholder="Filter..." 
                                            value={filters.manufacturer}
                                            onChange={(e) => handleFilterChange('manufacturer', e.target.value)}
                                        />
                                    </th>
                                    <th style={thStyle}>
                                        <div style={headerContentStyle}> Quantity </div>
                                    </th>
                                    <th style={thStyle}>
                                        <div style={headerContentStyle} onClick={() => handleSort('testDate')}> Date <SortIcon columnKey="testDate" /> </div>
                                    </th>
                                    <th style={thStyle}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {processedRecords.map((record) => (
                                    <tr key={record._id || record.arNo} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                        <td style={{ ...tdStyle, fontWeight: '600', color: '#0369a1' }}>{record.arNo}</td>
                                        <td style={tdStyle}>{record.materialCode}</td>
                                        <td style={tdStyle}>{record.materialName}</td>
                                        <td style={tdStyle}>{record.batchNumber || '-'}</td>
                                        <td style={{ ...tdStyle, maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={record.supplier}>{record.supplier || '-'}</td>
                                        <td style={{ ...tdStyle, maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={record.manufacturer}>{record.manufacturer || '-'}</td>
                                        <td style={tdStyle}>{record.quantity} {record.uom}</td>
                                        <td style={tdStyle}>{record.testDate || '-'}</td>
                                        <td style={tdStyle}>
                                            <button
                                                onClick={() => setSelectedRecord(record)}
                                                style={{
                                                    padding: '0.375rem 0.75rem',
                                                    background: '#0ea5e9',
                                                    color: 'white',
                                                    border: 'none',
                                                    borderRadius: '0.375rem',
                                                    cursor: 'pointer',
                                                    fontSize: '0.75rem'
                                                }}
                                            >
                                                View
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Modal */}
            {selectedRecord && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0,0,0,0.5)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1000,
                    padding: '2rem'
                }} onClick={() => setSelectedRecord(null)}>
                    <div style={{
                        background: 'white',
                        borderRadius: '1rem',
                        width: '100%',
                        maxWidth: '900px',
                        maxHeight: '90vh',
                        overflowY: 'auto',
                        padding: '2rem',
                        position: 'relative'
                    }} onClick={e => e.stopPropagation()}>
                        <button
                            onClick={() => setSelectedRecord(null)}
                            style={{
                                position: 'absolute',
                                top: '1.5rem',
                                right: '1.5rem',
                                background: 'transparent',
                                border: 'none',
                                fontSize: '1.5rem',
                                cursor: 'pointer',
                                color: '#64748b'
                            }}
                        >
                            ×
                        </button>
                        
                        <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '1.5rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '1rem' }}>
                            {selectedRecord.materialName}
                            <span style={{ display: 'block', fontSize: '1rem', color: '#64748b', fontWeight: '400', marginTop: '0.5rem' }}>
                                AR No: {selectedRecord.arNo} | Batch: {selectedRecord.batchNumber}
                            </span>
                        </h2>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
                            <DetailItem label="Material Code" value={selectedRecord.materialCode} />
                            <DetailItem label="Batch No" value={selectedRecord.batchNumber} />
                            <DetailItem label="Manufacturer" value={selectedRecord.manufacturer} />
                            <DetailItem label="Supplier" value={selectedRecord.supplier} />
                            <DetailItem label="Quantity" value={selectedRecord.quantity ? `${selectedRecord.quantity} ${selectedRecord.uom || ''}` : '-'} />
                            <DetailItem label="Mfg Date" value={selectedRecord.mfgDate} />
                            <DetailItem label="Exp Date" value={selectedRecord.expDate} />
                            <DetailItem label="Test Date" value={selectedRecord.testDate} />
                        </div>

                        <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '1rem', color: '#0f172a' }}>
                            Test Results ({selectedRecord.testParameters?.length || 0})
                        </h3>
                        
                        <div style={{ background: '#f8fafc', borderRadius: '0.5rem', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                                <thead style={{ background: '#f1f5f9', textAlign: 'left' }}>
                                    <tr>
                                        <th style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #e2e8f0' }}>Test Parameter</th>
                                        <th style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #e2e8f0' }}>Result</th>
                                        <th style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #e2e8f0' }}>Limits</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {selectedRecord.testParameters?.map((test, idx) => (
                                        <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                            <td style={{ padding: '0.75rem 1rem', fontWeight: '500' }}>{test.name}</td>
                                            <td style={{ padding: '0.75rem 1rem' }}>{test.result}</td>
                                            <td style={{ padding: '0.75rem 1rem', color: '#64748b' }}>{test.limits}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

const thStyle = {
    padding: '1rem',
    textAlign: 'left' as const,
    fontSize: '0.875rem',
    fontWeight: '600',
    color: '#64748b',
    whiteSpace: 'nowrap' as const,
};

const headerContentStyle = {
    display: 'flex',
    alignItems: 'center',
    cursor: 'pointer',
    marginBottom: '0.5rem',
    userSelect: 'none' as const,
};

const filterInputStyle = {
    width: '100%',
    padding: '0.25rem 0.5rem',
    fontSize: '0.75rem',
    borderRadius: '4px',
    border: '1px solid #e2e8f0',
    outline: 'none',
};

const tdStyle = {
    padding: '1rem',
    fontSize: '0.875rem',
    color: '#334155'
};

const DetailItem = ({ label, value }: { label: string, value?: string }) => (
    <div>
        <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>
            {label}
        </div>
        <div style={{ fontWeight: '500', color: '#0f172a' }}>
            {value || '-'}
        </div>
    </div>
);
