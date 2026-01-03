'use client';

/**
 * Data Validation Page
 * Validates batch availability across Bulk, Finish, RM, PPM, PM sections
 * Loads one section at a time for better performance
 */

import { useState, useCallback } from 'react';
import Link from 'next/link';
import type { ValidationIssue, SectionType } from '@/types/validation';

interface SectionData {
    loaded: boolean;
    loading: boolean;
    error: string | null;
    summary: {
        totalMFCs: number;
        totalBatches: number;
        batchesWithData: number;
        batchesMissingData: number;
    };
    issues: ValidationIssue[];
}

const SECTIONS: SectionType[] = ['Bulk', 'Finish', 'RM', 'PPM', 'PM'];

const sectionColors: Record<SectionType, { bg: string; text: string; border: string }> = {
    'Bulk': { bg: 'rgba(59, 130, 246, 0.1)', text: '#3b82f6', border: '#3b82f6' },
    'Finish': { bg: 'rgba(16, 185, 129, 0.1)', text: '#10b981', border: '#10b981' },
    'RM': { bg: 'rgba(245, 158, 11, 0.1)', text: '#f59e0b', border: '#f59e0b' },
    'PPM': { bg: 'rgba(139, 92, 246, 0.1)', text: '#8b5cf6', border: '#8b5cf6' },
    'PM': { bg: 'rgba(236, 72, 153, 0.1)', text: '#ec4899', border: '#ec4899' },
};

const defaultSectionData: SectionData = {
    loaded: false,
    loading: false,
    error: null,
    summary: { totalMFCs: 0, totalBatches: 0, batchesWithData: 0, batchesMissingData: 0 },
    issues: [],
};

export default function DataValidationPage() {
    const [activeSection, setActiveSection] = useState<SectionType>('Bulk');
    const [sectionData, setSectionData] = useState<Record<SectionType, SectionData>>({
        Bulk: { ...defaultSectionData },
        Finish: { ...defaultSectionData },
        RM: { ...defaultSectionData },
        PPM: { ...defaultSectionData },
        PM: { ...defaultSectionData },
    });
    const [searchQuery, setSearchQuery] = useState('');

    // Load section data
    const loadSection = useCallback(async (section: SectionType) => {
        if (sectionData[section].loading) return;

        setSectionData(prev => ({
            ...prev,
            [section]: { ...prev[section], loading: true, error: null },
        }));

        try {
            const response = await fetch(`/api/data-validation?section=${section}`);
            const result = await response.json();

            if (result.success) {
                setSectionData(prev => ({
                    ...prev,
                    [section]: {
                        loaded: true,
                        loading: false,
                        error: null,
                        summary: result.summary,
                        issues: result.issues,
                    },
                }));
            } else {
                setSectionData(prev => ({
                    ...prev,
                    [section]: { ...prev[section], loading: false, error: result.message },
                }));
            }
        } catch (err) {
            setSectionData(prev => ({
                ...prev,
                [section]: {
                    ...prev[section],
                    loading: false,
                    error: err instanceof Error ? err.message : 'Failed to load',
                },
            }));
        }
    }, [sectionData]);

    // Handle section tab click
    const handleSectionClick = (section: SectionType) => {
        setActiveSection(section);
        if (!sectionData[section].loaded && !sectionData[section].loading) {
            loadSection(section);
        }
    };

    // Get current section data
    const currentData = sectionData[activeSection];
    const currentColor = sectionColors[activeSection];

    // Filter issues by search
    const filteredIssues = currentData.issues.filter(issue =>
        searchQuery === '' ||
        issue.batchNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        issue.mfcNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
        issue.productName.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // Export current section to CSV
    const exportToCSV = () => {
        const headers = ['Batch Number', 'MFC No', 'Product Name', 'Section', 'Message'];
        const rows = currentData.issues.map(i => [
            i.batchNumber, i.mfcNo, i.productName, i.section, i.message,
        ]);
        const csvContent = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${activeSection}-validation-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // Calculate total issues across all loaded sections
    const totalIssues = SECTIONS.reduce((sum, s) => sum + (sectionData[s].loaded ? sectionData[s].issues.length : 0), 0);
    const loadedSections = SECTIONS.filter(s => sectionData[s].loaded).length;

    return (
        <div style={{ minHeight: '100vh', background: 'var(--background)' }}>
            {/* Header */}
            <header style={{
                background: `linear-gradient(135deg, ${currentColor.border} 0%, ${currentColor.text}cc 100%)`,
                padding: '1.5rem 0',
                transition: 'background 0.3s ease',
            }}>
                <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '0 2rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                        <div>
                            <h1 style={{ fontSize: '1.75rem', fontWeight: '700', color: 'white', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M9 12l2 2 4-4" />
                                    <path d="M21 12c0 4.97-4.03 9-9 9s-9-4.03-9-9 4.03-9 9-9c1.03 0 2.02.17 2.94.49" />
                                </svg>
                                Batch Availability Validation - {activeSection}
                            </h1>
                            <p style={{ color: 'rgba(255, 255, 255, 0.8)', fontSize: '0.875rem' }}>
                                MFCs with 3+ Batches • {loadedSections}/5 sections loaded • {totalIssues} total issues found
                            </p>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <Link href="/material-availability" style={{
                                padding: '0.5rem 1rem',
                                background: 'rgba(255, 255, 255, 0.15)',
                                color: 'white',
                                border: 'none',
                                borderRadius: '8px',
                                textDecoration: 'none',
                                fontWeight: '500',
                                backdropFilter: 'blur(10px)',
                            }}>
                                🔍 Material Codes
                            </Link>
                            <Link href="/" style={{
                                padding: '0.5rem 1rem',
                                background: 'rgba(255, 255, 255, 0.15)',
                                color: 'white',
                                border: 'none',
                                borderRadius: '8px',
                                textDecoration: 'none',
                                fontWeight: '500',
                                backdropFilter: 'blur(10px)',
                            }}>
                                ← Back to Home
                            </Link>
                        </div>
                    </div>
                </div>
            </header>

            {/* Section Tabs */}
            <div style={{
                background: 'var(--card)',
                borderBottom: '1px solid var(--border)',
                position: 'sticky',
                top: 0,
                zIndex: 10,
            }}>
                <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '0 2rem' }}>
                    <div style={{ display: 'flex', gap: '0' }}>
                        {SECTIONS.map(section => {
                            const data = sectionData[section];
                            const color = sectionColors[section];
                            const isActive = activeSection === section;

                            return (
                                <button
                                    key={section}
                                    onClick={() => handleSectionClick(section)}
                                    style={{
                                        padding: '1rem 1.5rem',
                                        background: isActive ? color.bg : 'transparent',
                                        color: isActive ? color.text : 'var(--muted-foreground)',
                                        border: 'none',
                                        borderBottom: isActive ? `3px solid ${color.border}` : '3px solid transparent',
                                        cursor: 'pointer',
                                        fontWeight: '600',
                                        fontSize: '0.9rem',
                                        transition: 'all 0.2s ease',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.5rem',
                                    }}
                                >
                                    {section}
                                    {data.loading && (
                                        <span style={{
                                            width: '14px',
                                            height: '14px',
                                            border: `2px solid ${color.border}`,
                                            borderTopColor: 'transparent',
                                            borderRadius: '50%',
                                            animation: 'spin 1s linear infinite',
                                        }} />
                                    )}
                                    {data.loaded && !data.loading && (
                                        <span style={{
                                            padding: '0.125rem 0.5rem',
                                            background: data.issues.length > 0 ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                                            color: data.issues.length > 0 ? '#ef4444' : '#10b981',
                                            borderRadius: '10px',
                                            fontSize: '0.75rem',
                                        }}>
                                            {data.issues.length}
                                        </span>
                                    )}
                                    {!data.loaded && !data.loading && (
                                        <span style={{ color: 'var(--muted-foreground)', fontSize: '0.75rem' }}>
                                            Click to load
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <main style={{ maxWidth: '1400px', margin: '0 auto', padding: '2rem' }}>
                {/* Not loaded state */}
                {!currentData.loaded && !currentData.loading && !currentData.error && (
                    <div style={{
                        textAlign: 'center',
                        padding: '4rem 2rem',
                        background: currentColor.bg,
                        borderRadius: '12px',
                        border: `2px dashed ${currentColor.border}`,
                    }}>
                        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📊</div>
                        <h2 style={{ color: currentColor.text, marginBottom: '0.5rem' }}>Load {activeSection} Data</h2>
                        <p style={{ color: 'var(--muted-foreground)', marginBottom: '1.5rem' }}>
                            Click the button below to check batch availability for {activeSection} section
                        </p>
                        <button
                            onClick={() => loadSection(activeSection)}
                            style={{
                                padding: '0.75rem 2rem',
                                background: currentColor.border,
                                color: 'white',
                                border: 'none',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                fontWeight: '600',
                                fontSize: '1rem',
                            }}
                        >
                            Load {activeSection} Data
                        </button>
                    </div>
                )}

                {/* Loading state */}
                {currentData.loading && (
                    <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--muted-foreground)' }}>
                        <div style={{
                            width: '50px',
                            height: '50px',
                            border: `4px solid ${currentColor.bg}`,
                            borderTopColor: currentColor.border,
                            borderRadius: '50%',
                            animation: 'spin 1s linear infinite',
                            margin: '0 auto 1.5rem',
                        }} />
                        <p style={{ fontSize: '1.1rem' }}>Loading {activeSection} data...</p>
                        <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>Checking batch availability</p>
                    </div>
                )}

                {/* Error state */}
                {currentData.error && (
                    <div style={{
                        padding: '2rem',
                        background: 'rgba(239, 68, 68, 0.1)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        borderRadius: '12px',
                        textAlign: 'center',
                    }}>
                        <p style={{ color: '#ef4444', fontWeight: '600', marginBottom: '0.5rem' }}>Error Loading {activeSection}</p>
                        <p style={{ color: '#ef4444' }}>{currentData.error}</p>
                        <button
                            onClick={() => loadSection(activeSection)}
                            style={{
                                marginTop: '1rem',
                                padding: '0.5rem 1rem',
                                background: '#ef4444',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                            }}
                        >
                            Retry
                        </button>
                    </div>
                )}

                {/* Loaded state */}
                {currentData.loaded && !currentData.loading && (
                    <>
                        {/* Summary Stats */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                            gap: '1rem',
                            marginBottom: '2rem',
                        }}>
                            <StatCard label="MFCs Analyzed" value={currentData.summary.totalMFCs} color={currentColor.border} />
                            <StatCard label="Total Batches" value={currentData.summary.totalBatches} color="#6b7280" />
                            <StatCard label="Have Data" value={currentData.summary.batchesWithData} color="#10b981" />
                            <StatCard label="Missing Data" value={currentData.summary.batchesMissingData} color="#ef4444" />
                        </div>

                        {/* Controls */}
                        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                            <input
                                type="text"
                                placeholder="Search batch, MFC, product..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                style={{
                                    padding: '0.5rem 1rem',
                                    borderRadius: '8px',
                                    border: '1px solid var(--border)',
                                    background: 'var(--card)',
                                    color: 'var(--foreground)',
                                    fontSize: '0.875rem',
                                    width: '280px',
                                }}
                            />
                            <button
                                onClick={() => loadSection(activeSection)}
                                style={{
                                    padding: '0.5rem 1rem',
                                    background: currentColor.border,
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    fontWeight: '500',
                                }}
                            >
                                ↻ Refresh
                            </button>
                            <button
                                onClick={exportToCSV}
                                disabled={currentData.issues.length === 0}
                                style={{
                                    padding: '0.5rem 1rem',
                                    background: '#10b981',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    fontWeight: '500',
                                    marginLeft: 'auto',
                                    opacity: currentData.issues.length === 0 ? 0.5 : 1,
                                }}
                            >
                                📥 Export {activeSection} CSV
                            </button>
                        </div>

                        {/* Issues Table */}
                        <div style={{
                            background: 'var(--card)',
                            borderRadius: '12px',
                            border: `2px solid ${currentColor.border}`,
                            overflow: 'hidden',
                        }}>
                            <div style={{
                                padding: '1rem',
                                background: currentColor.bg,
                                borderBottom: `1px solid ${currentColor.border}`,
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                            }}>
                                <h3 style={{ margin: 0, color: currentColor.text, fontWeight: '700' }}>
                                    Missing {activeSection} Data ({filteredIssues.length} batches)
                                </h3>
                            </div>

                            <div style={{ maxHeight: '500px', overflow: 'auto' }}>
                                {filteredIssues.length > 0 ? (
                                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                        <thead>
                                            <tr style={{ background: 'var(--muted)', position: 'sticky', top: 0 }}>
                                                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: '600', borderBottom: '1px solid var(--border)' }}>Batch Number</th>
                                                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: '600', borderBottom: '1px solid var(--border)' }}>MFC No</th>
                                                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: '600', borderBottom: '1px solid var(--border)' }}>Product Name</th>
                                                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: '600', borderBottom: '1px solid var(--border)' }}>Issue</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredIssues.map((issue, idx) => (
                                                <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                                                    <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', fontWeight: '600', color: currentColor.text }}>{issue.batchNumber}</td>
                                                    <td style={{ padding: '0.75rem 1rem', color: 'var(--muted-foreground)' }}>{issue.mfcNo}</td>
                                                    <td style={{ padding: '0.75rem 1rem' }}>{issue.productName}</td>
                                                    <td style={{ padding: '0.75rem 1rem', color: 'var(--muted-foreground)', fontSize: '0.875rem' }}>{issue.message}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                ) : (
                                    <div style={{ padding: '3rem', textAlign: 'center', color: '#10b981' }}>
                                        ✓ All batches have {activeSection} data
                                    </div>
                                )}
                            </div>
                        </div>
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
