'use client';

/**
 * Requisition Data Page
 * Displays requisition materials with progressive loading by section (RM, PPM, PM)
 */

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import type { RequisitionMaterial, MaterialCategory } from '@/types/requisition';

interface SectionData {
    loaded: boolean;
    loading: boolean;
    error: string | null;
    materials: RequisitionMaterial[];
    stats: {
        totalBatches: number;
        totalMaterials: number;
        totalQtyRequired: number;
        totalQtyToIssue: number;
        mismatchCount: number;
    };
}

const SECTIONS: MaterialCategory[] = ['RM', 'PPM', 'PM'];

const sectionConfig: Record<MaterialCategory, { name: string; color: string; bgColor: string; borderColor: string }> = {
    'RM': { name: 'Raw Materials (Mixing)', color: '#14b8a6', bgColor: '#f0fdfa', borderColor: '#99f6e4' },
    'PPM': { name: 'Aseptic Filling (PPM)', color: '#f59e0b', bgColor: '#fffbeb', borderColor: '#fde68a' },
    'PM': { name: 'Packing Materials (PM)', color: '#a855f7', bgColor: '#faf5ff', borderColor: '#e9d5ff' },
};

const defaultSectionData: SectionData = {
    loaded: false,
    loading: false,
    error: null,
    materials: [],
    stats: { totalBatches: 0, totalMaterials: 0, totalQtyRequired: 0, totalQtyToIssue: 0, mismatchCount: 0 },
};

export default function RequisitionPage() {
    const [activeTab, setActiveTab] = useState<MaterialCategory>('RM');
    const [sectionData, setSectionData] = useState<Record<MaterialCategory, SectionData>>({
        RM: { ...defaultSectionData },
        PPM: { ...defaultSectionData },
        PM: { ...defaultSectionData },
    });
    const [searchQuery, setSearchQuery] = useState('');
    const [processingFiles, setProcessingFiles] = useState(false);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Load section data
    const loadSection = useCallback(async (type: MaterialCategory, search?: string) => {
        if (sectionData[type].loading) return;

        setSectionData(prev => ({
            ...prev,
            [type]: { ...prev[type], loading: true, error: null },
        }));

        try {
            const params = new URLSearchParams({ type });
            if (search) params.set('search', search);

            const response = await fetch(`/api/requisition/materials?${params.toString()}`);
            const result = await response.json();

            if (result.success) {
                setSectionData(prev => ({
                    ...prev,
                    [type]: {
                        loaded: true,
                        loading: false,
                        error: null,
                        materials: result.materials,
                        stats: result.stats,
                    },
                }));
            } else {
                setSectionData(prev => ({
                    ...prev,
                    [type]: { ...prev[type], loading: false, error: result.message },
                }));
            }
        } catch (err) {
            setSectionData(prev => ({
                ...prev,
                [type]: { ...prev[type], loading: false, error: err instanceof Error ? err.message : 'Failed to load' },
            }));
        }
    }, [sectionData]);

    // Handle tab click - load if not already loaded
    const handleTabClick = (type: MaterialCategory) => {
        setActiveTab(type);
        if (!sectionData[type].loaded && !sectionData[type].loading) {
            loadSection(type, searchQuery);
        }
    };

    // Load from /files folder
    const handleLoadFromFolder = async () => {
        setProcessingFiles(true);
        setError(null);
        setSuccessMessage(null);

        try {
            const response = await fetch('/api/ingestion', { method: 'POST' });
            const result = await response.json();

            if (result.success) {
                const requisitionResults = result.status?.results?.filter(
                    (r: { fileType: string }) => r.fileType === 'REQUISITION'
                ) || [];

                const successCount = requisitionResults.filter((r: { status: string }) => r.status === 'SUCCESS').length;
                const dupCount = requisitionResults.filter((r: { status: string }) => r.status === 'DUPLICATE').length;

                if (requisitionResults.length > 0) {
                    setSuccessMessage(`Processed ${requisitionResults.length} requisition files: ${successCount} new, ${dupCount} duplicates skipped`);
                    // Reload all sections
                    setSectionData({
                        RM: { ...defaultSectionData },
                        PPM: { ...defaultSectionData },
                        PM: { ...defaultSectionData },
                    });
                    loadSection(activeTab, searchQuery);
                } else {
                    setSuccessMessage('No requisition files found in /files folder');
                }
            } else {
                setError(result.message || 'Failed to process files');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Processing error');
        } finally {
            setProcessingFiles(false);
        }
    };

    // Delete all records
    const handleDeleteRecords = async () => {
        if (!confirm('Are you sure you want to delete all requisition records? This cannot be undone.')) return;

        try {
            const response = await fetch('/api/requisition', { method: 'DELETE' });
            const result = await response.json();
            if (result.success) {
                setSuccessMessage('Successfully deleted all records');
                setSectionData({
                    RM: { ...defaultSectionData },
                    PPM: { ...defaultSectionData },
                    PM: { ...defaultSectionData },
                });
            } else {
                setError(result.message || 'Failed to delete records');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Delete error');
        }
    };

    // Search handler
    const handleSearch = () => {
        if (sectionData[activeTab].loaded || sectionData[activeTab].loading === false) {
            loadSection(activeTab, searchQuery);
        }
    };

    // Current section data
    const currentData = sectionData[activeTab];
    const currentConfig = sectionConfig[activeTab];

    // Calculate totals
    const loadedSections = SECTIONS.filter(s => sectionData[s].loaded).length;
    const totalMaterials = SECTIONS.reduce((sum, s) => sum + (sectionData[s].loaded ? sectionData[s].stats.totalMaterials : 0), 0);

    return (
        <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)', padding: '2rem' }}>
            {/* Header */}
            <header style={{
                background: `linear-gradient(135deg, ${currentConfig.color} 0%, ${adjustColor(currentConfig.color, -30)} 100%)`,
                borderRadius: '1rem',
                padding: '2rem',
                marginBottom: '2rem',
                color: 'white',
                boxShadow: `0 10px 40px ${currentConfig.color}40`,
                position: 'relative',
                transition: 'background 0.3s ease',
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
                    }}
                >
                    ← Back to Home
                </Link>
                <h1 style={{ fontSize: '2rem', fontWeight: '700', marginBottom: '0.5rem' }}>
                    📦 Requisition Data - {currentConfig.name}
                </h1>
                <p style={{ opacity: 0.9 }}>
                    {loadedSections}/3 sections loaded • {totalMaterials.toLocaleString()} total materials
                </p>
            </header>

            {/* Section Tabs */}
            <div style={{
                display: 'flex',
                gap: '0.5rem',
                marginBottom: '1.5rem',
                background: 'white',
                padding: '0.5rem',
                borderRadius: '0.75rem',
                boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
                width: 'fit-content',
            }}>
                {SECTIONS.map(section => {
                    const config = sectionConfig[section];
                    const data = sectionData[section];
                    const isActive = activeTab === section;

                    return (
                        <button
                            key={section}
                            onClick={() => handleTabClick(section)}
                            style={{
                                padding: '0.75rem 1.5rem',
                                borderRadius: '0.5rem',
                                border: 'none',
                                background: isActive ? config.color : 'transparent',
                                color: isActive ? 'white' : '#64748b',
                                fontSize: '0.875rem',
                                fontWeight: '600',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                            }}
                        >
                            {config.name}
                            {data.loading && (
                                <span style={{
                                    width: '14px',
                                    height: '14px',
                                    border: `2px solid ${isActive ? 'rgba(255,255,255,0.5)' : config.color}`,
                                    borderTopColor: 'transparent',
                                    borderRadius: '50%',
                                    animation: 'spin 1s linear infinite',
                                }} />
                            )}
                            {data.loaded && !data.loading && (
                                <span style={{
                                    fontSize: '0.75rem',
                                    background: isActive ? 'rgba(255,255,255,0.3)' : '#f1f5f9',
                                    padding: '0.15rem 0.5rem',
                                    borderRadius: '1rem',
                                }}>
                                    {data.stats.totalMaterials.toLocaleString()}
                                </span>
                            )}
                            {!data.loaded && !data.loading && (
                                <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>Click to load</span>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* Actions */}
            <div style={{
                background: 'white',
                borderRadius: '1rem',
                padding: '1.5rem',
                marginBottom: '2rem',
                boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
            }}>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <button
                        onClick={handleLoadFromFolder}
                        disabled={processingFiles}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            background: processingFiles ? '#94a3b8' : `linear-gradient(135deg, ${currentConfig.color} 0%, ${adjustColor(currentConfig.color, -20)} 100%)`,
                            color: 'white',
                            padding: '0.75rem 1.5rem',
                            borderRadius: '0.5rem',
                            border: 'none',
                            cursor: processingFiles ? 'not-allowed' : 'pointer',
                            fontSize: '0.875rem',
                            fontWeight: '600',
                        }}
                    >
                        {processingFiles ? '⏳ Processing...' : '📁 Load from /files Folder'}
                    </button>

                    <input
                        type="text"
                        placeholder="Search batch, material, MFC..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSearch()}
                        style={{
                            padding: '0.75rem 1rem',
                            borderRadius: '0.5rem',
                            border: '1px solid #e2e8f0',
                            background: 'white',
                            fontSize: '0.875rem',
                            minWidth: '250px',
                        }}
                    />

                    <button
                        onClick={handleSearch}
                        disabled={currentData.loading}
                        style={{
                            padding: '0.75rem 1rem',
                            borderRadius: '0.5rem',
                            border: 'none',
                            background: currentConfig.color,
                            color: 'white',
                            cursor: 'pointer',
                            fontSize: '0.875rem',
                            fontWeight: '600',
                        }}
                    >
                        🔍 Search
                    </button>
                </div>

                {successMessage && (
                    <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', background: '#ecfdf5', color: '#047857', borderRadius: '0.5rem', border: '1px solid #a7f3d0' }}>
                        ✅ {successMessage}
                    </div>
                )}

                {error && (
                    <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', background: '#fef2f2', color: '#dc2626', borderRadius: '0.5rem', border: '1px solid #fecaca' }}>
                        ❌ {error}
                    </div>
                )}
            </div>

            {/* Not Loaded State */}
            {!currentData.loaded && !currentData.loading && !currentData.error && (
                <div style={{
                    textAlign: 'center',
                    padding: '4rem 2rem',
                    background: currentConfig.bgColor,
                    borderRadius: '1rem',
                    border: `2px dashed ${currentConfig.borderColor}`,
                }}>
                    <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📊</div>
                    <h2 style={{ color: currentConfig.color, marginBottom: '0.5rem' }}>Load {currentConfig.name}</h2>
                    <p style={{ color: '#64748b', marginBottom: '1.5rem' }}>
                        Click to load {activeTab} materials from the database
                    </p>
                    <button
                        onClick={() => loadSection(activeTab, searchQuery)}
                        style={{
                            padding: '0.75rem 2rem',
                            background: currentConfig.color,
                            color: 'white',
                            border: 'none',
                            borderRadius: '0.5rem',
                            cursor: 'pointer',
                            fontWeight: '600',
                            fontSize: '1rem',
                        }}
                    >
                        Load {activeTab} Data
                    </button>
                </div>
            )}

            {/* Loading State */}
            {currentData.loading && (
                <div style={{ textAlign: 'center', padding: '4rem', color: '#64748b' }}>
                    <div style={{
                        width: '50px',
                        height: '50px',
                        border: `4px solid ${currentConfig.bgColor}`,
                        borderTopColor: currentConfig.color,
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite',
                        margin: '0 auto 1.5rem',
                    }} />
                    <p style={{ fontSize: '1.1rem' }}>Loading {currentConfig.name}...</p>
                </div>
            )}

            {/* Error State */}
            {currentData.error && (
                <div style={{
                    padding: '2rem',
                    background: '#fef2f2',
                    border: '1px solid #fecaca',
                    borderRadius: '1rem',
                    textAlign: 'center',
                }}>
                    <p style={{ color: '#ef4444', fontWeight: '600', marginBottom: '0.5rem' }}>Error Loading {activeTab}</p>
                    <p style={{ color: '#ef4444' }}>{currentData.error}</p>
                    <button
                        onClick={() => loadSection(activeTab, searchQuery)}
                        style={{ marginTop: '1rem', padding: '0.5rem 1rem', background: '#ef4444', color: 'white', border: 'none', borderRadius: '0.5rem', cursor: 'pointer' }}
                    >
                        Retry
                    </button>
                </div>
            )}

            {/* Loaded State - Materials Table */}
            {currentData.loaded && !currentData.loading && (
                <>
                    {/* Stats Cards */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                        gap: '1rem',
                        marginBottom: '2rem',
                    }}>
                        <StatCard label="Batches" value={currentData.stats.totalBatches} color={currentConfig.color} />
                        <StatCard label="Materials" value={currentData.stats.totalMaterials} color="#6366f1" />
                        <StatCard label="Qty Required" value={currentData.stats.totalQtyRequired} color="#0ea5e9" />
                        <StatCard label="Qty to Issue" value={currentData.stats.totalQtyToIssue} color="#10b981" />
                        <StatCard label="Mismatches" value={currentData.stats.mismatchCount} color="#ef4444" />
                    </div>

                    {/* Materials Table */}
                    <MaterialTable
                        title={currentConfig.name}
                        materials={currentData.materials}
                        color={currentConfig.color}
                        bgColor={currentConfig.bgColor}
                        borderColor={currentConfig.borderColor}
                        onRefresh={() => loadSection(activeTab, searchQuery)}
                    />
                </>
            )}

            {/* Delete All Section */}
            {(sectionData.RM.loaded || sectionData.PPM.loaded || sectionData.PM.loaded) && (
                <div style={{ marginTop: '3rem', borderTop: '1px solid #e2e8f0', paddingTop: '2rem', textAlign: 'center' }}>
                    <button
                        onClick={handleDeleteRecords}
                        style={{
                            padding: '0.5rem 1rem',
                            background: 'transparent',
                            color: '#ef4444',
                            border: '1px solid #ef4444',
                            borderRadius: '0.5rem',
                            cursor: 'pointer',
                            fontSize: '0.75rem',
                            fontWeight: '600',
                        }}
                    >
                        🗑️ Clear All Requisition Data
                    </button>
                </div>
            )}


        </div>
    );
}

// Stat Card Component
function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
    return (
        <div style={{
            background: 'white',
            borderRadius: '0.75rem',
            padding: '1rem',
            boxShadow: '0 2px 10px rgba(0,0,0,0.06)',
            borderLeft: `4px solid ${color}`,
        }}>
            <div style={{ color: '#64748b', fontSize: '0.8rem', marginBottom: '0.25rem' }}>{label}</div>
            <div style={{ color, fontSize: '1.5rem', fontWeight: '700' }}>{value.toLocaleString()}</div>
        </div>
    );
}

// Material Table Component
function MaterialTable({
    title,
    materials,
    color,
    bgColor,
    borderColor,
    onRefresh,
}: {
    title: string;
    materials: RequisitionMaterial[];
    color: string;
    bgColor: string;
    borderColor: string;
    onRefresh: () => void;
}) {
    const [currentPage, setCurrentPage] = useState(1);
    const pageSize = 50;

    const totalPages = Math.ceil(materials.length / pageSize);
    const paginatedMaterials = materials.slice((currentPage - 1) * pageSize, currentPage * pageSize);

    useEffect(() => {
        setCurrentPage(1);
    }, [materials.length]);

    const thStyle: React.CSSProperties = {
        padding: '0.75rem 1rem',
        textAlign: 'left',
        fontWeight: '600',
        fontSize: '0.75rem',
        textTransform: 'uppercase',
        color: '#64748b',
        borderBottom: `2px solid ${borderColor}`,
        whiteSpace: 'nowrap',
    };

    const tdStyle: React.CSSProperties = {
        padding: '0.75rem 1rem',
        fontSize: '0.8125rem',
        verticalAlign: 'middle',
    };

    return (
        <div style={{
            background: 'white',
            borderRadius: '1rem',
            overflow: 'hidden',
            boxShadow: '0 4px 25px rgba(0,0,0,0.1)',
            border: `2px solid ${borderColor}`,
        }}>
            <div style={{
                background: `linear-gradient(135deg, ${color} 0%, ${adjustColor(color, -20)} 100%)`,
                padding: '1rem 1.5rem',
                color: 'white',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <h3 style={{ fontWeight: '700', fontSize: '1.1rem', margin: 0 }}>{title}</h3>
                    <span style={{ fontSize: '0.75rem', background: 'rgba(255,255,255,0.2)', padding: '0.2rem 0.6rem', borderRadius: '1rem' }}>
                        {materials.length} Items
                    </span>
                </div>
                <button
                    onClick={onRefresh}
                    style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', padding: '0.4rem 0.8rem', borderRadius: '0.4rem', cursor: 'pointer', fontSize: '0.8rem' }}
                >
                    ↻ Refresh
                </button>
            </div>

            {materials.length > 0 ? (
                <>
                    <div style={{ overflowX: 'auto', maxHeight: '500px' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem', minWidth: '1200px' }}>
                            <thead style={{ position: 'sticky', top: 0, background: bgColor }}>
                                <tr>
                                    <th style={thStyle}>Material Code</th>
                                    <th style={thStyle}>Vendor Code</th>
                                    <th style={thStyle}>Material Name</th>
                                    <th style={thStyle}>Batch No</th>
                                    <th style={thStyle}>MFC No</th>
                                    <th style={thStyle}>Process</th>
                                    <th style={thStyle}>Stage</th>
                                    <th style={{ ...thStyle, textAlign: 'right' }}>OVG %</th>
                                    <th style={{ ...thStyle, textAlign: 'right' }}>Qty Required</th>
                                    <th style={{ ...thStyle, textAlign: 'right' }}>Formula Qty</th>
                                    <th style={{ ...thStyle, textAlign: 'right' }}>Qty to Issue</th>
                                    <th style={thStyle}>Unit</th>
                                    <th style={thStyle}>A.R. No.</th>
                                    <th style={thStyle}>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {paginatedMaterials.map((material, idx) => (
                                    <tr
                                        key={`${material.matReqDtlId}-${idx}`}
                                        style={{ borderBottom: '1px solid #f1f5f9' }}
                                    >
                                        <td style={{ ...tdStyle, fontWeight: '600', color }}>{material.materialCode}</td>
                                        <td style={{ ...tdStyle, fontSize: '0.75rem' }}>{material.vendorCode || '-'}</td>
                                        <td style={tdStyle}>{material.materialName}</td>
                                        <td style={{ ...tdStyle, fontWeight: 'bold' }}>{material.batchNumber || '-'}</td>
                                        <td style={{ ...tdStyle, color: '#0369a1' }}>{material.mfcNo || '-'}</td>
                                        <td style={{ ...tdStyle, color: '#64748b' }}>{material.process}</td>
                                        <td style={tdStyle}>{material.stage}</td>
                                        <td style={{ ...tdStyle, textAlign: 'right' }}>{material.ovgPercent ? material.ovgPercent.toFixed(3) : '-'}</td>
                                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: '600' }}>{material.quantityRequired?.toLocaleString()}</td>
                                        <td style={{ ...tdStyle, textAlign: 'right', color: material.masterFormulaQty ? '#2563eb' : '#94a3b8' }}>
                                            {material.masterFormulaQty ? material.masterFormulaQty.toLocaleString() : '-'}
                                        </td>
                                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: '600' }}>{material.quantityToIssue?.toLocaleString()}</td>
                                        <td style={tdStyle}>{material.unit}</td>
                                        <td style={{ ...tdStyle, fontWeight: '500' }}>{material.arNo || '-'}</td>
                                        <td style={tdStyle}>
                                            <ValidationBadge status={material.validationStatus} />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div style={{
                            padding: '1rem 1.5rem',
                            background: bgColor,
                            borderTop: `1px solid ${borderColor}`,
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                        }}>
                            <span style={{ fontSize: '0.8125rem', color: '#64748b' }}>
                                Showing {((currentPage - 1) * pageSize) + 1} - {Math.min(currentPage * pageSize, materials.length)} of {materials.length}
                            </span>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    disabled={currentPage === 1}
                                    style={{ padding: '0.4rem 0.8rem', background: 'white', border: '1px solid #e2e8f0', borderRadius: '0.4rem', cursor: currentPage === 1 ? 'not-allowed' : 'pointer', opacity: currentPage === 1 ? 0.5 : 1 }}
                                >
                                    Previous
                                </button>
                                <span style={{ padding: '0.4rem 0.8rem' }}>Page {currentPage} of {totalPages}</span>
                                <button
                                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                    disabled={currentPage === totalPages}
                                    style={{ padding: '0.4rem 0.8rem', background: 'white', border: '1px solid #e2e8f0', borderRadius: '0.4rem', cursor: currentPage === totalPages ? 'not-allowed' : 'pointer', opacity: currentPage === totalPages ? 0.5 : 1 }}
                                >
                                    Next
                                </button>
                            </div>
                        </div>
                    )}
                </>
            ) : (
                <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
                    No materials found for this section
                </div>
            )}
        </div>
    );
}

// Validation Badge Component
function ValidationBadge({ status }: { status: string }) {
    const getStyle = (): React.CSSProperties => {
        switch (status) {
            case 'matched':
                return { background: '#d1fae5', color: '#047857', border: '1px solid #6ee7b7' };
            case 'mismatch':
                return { background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' };
            default:
                return { background: '#f1f5f9', color: '#64748b', border: '1px solid #e2e8f0' };
        }
    };

    return (
        <span style={{
            ...getStyle(),
            padding: '0.2rem 0.5rem',
            borderRadius: '0.25rem',
            fontSize: '0.7rem',
            fontWeight: '600',
            textTransform: 'uppercase',
        }}>
            {status || 'pending'}
        </span>
    );
}

// Helper function to adjust color brightness
function adjustColor(color: string, amount: number): string {
    const clamp = (val: number) => Math.min(255, Math.max(0, val));
    const hex = color.replace('#', '');
    const r = clamp(parseInt(hex.substring(0, 2), 16) + amount);
    const g = clamp(parseInt(hex.substring(2, 4), 16) + amount);
    const b = clamp(parseInt(hex.substring(4, 6), 16) + amount);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}
