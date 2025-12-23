'use client';

/**
 * Formula Data Page
 * Displays all Formula Master records from all files in combined view
 * Shows which file each formula came from
 */

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import type { FormulaRecord, MaterialItem, CompositionItem } from '@/types/formula';

interface FormulaListResponse {
    success: boolean;
    data: FormulaRecord[];
    total: number;
    page: number;
    limit: number;
}

// Extended material with source info
interface MaterialWithSource extends MaterialItem {
    sourceFileName: string;
    sourceProductName: string;
    sourceProductCode: string;
}

export default function FormulaDataPage() {
    const [formulas, setFormulas] = useState<FormulaRecord[]>([]);
    const [allMaterials, setAllMaterials] = useState<MaterialWithSource[]>([]);
    const [allCompositions, setAllCompositions] = useState<(CompositionItem & { sourceFileName: string; sourceProductName: string })[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'overview' | 'materials' | 'composition'>('overview');
    const [sortField, setSortField] = useState<string>('srNo');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

    const fetchFormulas = useCallback(async () => {
        setIsLoading(true);
        try {
            const response = await fetch(`/api/formula?page=1&limit=100`);
            const data: FormulaListResponse = await response.json();
            if (data.success) {
                setFormulas(data.data);

                // Flatten all materials with source info
                const materials: MaterialWithSource[] = [];
                const compositions: (CompositionItem & { sourceFileName: string; sourceProductName: string })[] = [];

                data.data.forEach(formula => {
                    // Materials
                    if (formula.materials) {
                        formula.materials.forEach(mat => {
                            materials.push({
                                ...mat,
                                sourceFileName: formula.fileName,
                                sourceProductName: formula.masterFormulaDetails?.productName || 'Unknown',
                                sourceProductCode: formula.masterFormulaDetails?.productCode || 'N/A',
                            });
                        });
                    }
                    // Composition
                    if (formula.composition) {
                        formula.composition.forEach(comp => {
                            compositions.push({
                                ...comp,
                                sourceFileName: formula.fileName,
                                sourceProductName: formula.masterFormulaDetails?.productName || 'Unknown',
                            });
                        });
                    }
                });

                setAllMaterials(materials);
                setAllCompositions(compositions);
            }
        } catch (error) {
            console.error('Error fetching formulas:', error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchFormulas();
    }, [fetchFormulas]);

    const handleSort = (field: string) => {
        if (sortField === field) {
            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('asc');
        }
    };

    // Sort materials
    const sortedMaterials = [...allMaterials].sort((a, b) => {
        const aVal = a[sortField as keyof MaterialWithSource];
        const bVal = b[sortField as keyof MaterialWithSource];
        if (aVal === null || aVal === undefined) return 1;
        if (bVal === null || bVal === undefined) return -1;
        if (typeof aVal === 'number' && typeof bVal === 'number') {
            return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
        }
        return sortDirection === 'asc'
            ? String(aVal).localeCompare(String(bVal))
            : String(bVal).localeCompare(String(aVal));
    });

    return (
        <div style={{ minHeight: '100vh', background: 'var(--background)' }}>
            {/* Header */}
            <header style={{
                background: 'linear-gradient(135deg, #8b5cf6 0%, #a855f7 100%)',
                padding: '2rem 0',
                position: 'relative',
                overflow: 'hidden',
            }}>
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
                    maxWidth: '1600px',
                    margin: '0 auto',
                    padding: '0 2rem',
                    position: 'relative',
                    zIndex: 1,
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
                                    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                                </svg>
                                Formula Master Data
                            </h1>
                            <p style={{ color: 'rgba(255, 255, 255, 0.8)', fontSize: '1rem' }}>
                                All formula data from {formulas.length} file(s) • {allMaterials.length} materials • {allCompositions.length} compositions
                            </p>
                        </div>
                        <Link href="/" style={{
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
                            ← Back to Home
                        </Link>
                    </div>
                </div>
            </header>

            <main style={{ maxWidth: '1600px', margin: '0 auto', padding: '2rem' }}>
                {isLoading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
                        <svg className="animate-spin" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2">
                            <path d="M21 12a9 9 0 11-6.219-8.56" strokeLinecap="round" />
                        </svg>
                    </div>
                ) : (
                    <>
                        {/* Tabs */}
                        <div style={{
                            display: 'flex',
                            gap: '0.5rem',
                            marginBottom: '1.5rem',
                            background: 'var(--muted)',
                            padding: '0.375rem',
                            borderRadius: 'var(--radius-lg)',
                            width: 'fit-content',
                        }}>
                            {[
                                { key: 'overview', label: 'Formula Overview' },
                                { key: 'materials', label: `Materials (${allMaterials.length})` },
                                { key: 'composition', label: `Composition (${allCompositions.length})` },
                            ].map(tab => (
                                <button
                                    key={tab.key}
                                    onClick={() => setActiveTab(tab.key as 'overview' | 'materials' | 'composition')}
                                    style={{
                                        padding: '0.625rem 1.25rem',
                                        background: activeTab === tab.key ? 'white' : 'transparent',
                                        border: 'none',
                                        borderRadius: 'var(--radius-md)',
                                        cursor: 'pointer',
                                        fontWeight: '500',
                                        color: activeTab === tab.key ? '#8b5cf6' : 'var(--muted-foreground)',
                                        transition: 'all var(--transition-fast)',
                                    }}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>

                        {/* Overview Tab */}
                        {activeTab === 'overview' && (
                            <div style={{
                                background: 'var(--card)',
                                borderRadius: 'var(--radius-lg)',
                                border: '1px solid var(--border)',
                                overflow: 'hidden',
                            }}>
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                        <thead>
                                            <tr style={{ background: 'var(--muted)' }}>
                                                <th style={thStyle}>📁 Source File</th>
                                                <th style={thStyle}>Product Code</th>
                                                <th style={thStyle}>Product Name</th>
                                                <th style={thStyle}>Generic Name</th>
                                                <th style={thStyle}>Batch Size</th>
                                                <th style={thStyle}>Manufacturer</th>
                                                <th style={thStyle}>Materials</th>
                                                <th style={thStyle}>Imported On</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {formulas.map((formula, index) => (
                                                <tr
                                                    key={formula._id || index}
                                                    style={{ background: index % 2 === 0 ? 'transparent' : 'var(--muted)' }}
                                                >
                                                    <td style={tdStyle}>
                                                        <span style={{
                                                            display: 'inline-block',
                                                            padding: '0.25rem 0.5rem',
                                                            background: 'rgba(139, 92, 246, 0.1)',
                                                            color: '#8b5cf6',
                                                            borderRadius: 'var(--radius-sm)',
                                                            fontSize: '0.7rem',
                                                            fontWeight: '600',
                                                            maxWidth: '180px',
                                                            overflow: 'hidden',
                                                            textOverflow: 'ellipsis',
                                                            whiteSpace: 'nowrap',
                                                        }}>
                                                            {formula.fileName}
                                                        </span>
                                                    </td>
                                                    <td style={{ ...tdStyle, fontFamily: 'monospace' }}>
                                                        {formula.masterFormulaDetails?.productCode}
                                                    </td>
                                                    <td style={tdStyle}>{formula.masterFormulaDetails?.productName}</td>
                                                    <td style={tdStyle}>{formula.masterFormulaDetails?.genericName}</td>
                                                    <td style={tdStyle}>{formula.batchInfo?.batchSize}</td>
                                                    <td style={tdStyle}>{formula.masterFormulaDetails?.manufacturer}</td>
                                                    <td style={tdStyle}>
                                                        <span style={{
                                                            padding: '0.25rem 0.5rem',
                                                            background: 'rgba(245, 158, 11, 0.1)',
                                                            color: '#f59e0b',
                                                            borderRadius: 'var(--radius-sm)',
                                                            fontSize: '0.7rem',
                                                            fontWeight: '600',
                                                        }}>
                                                            {formula.materials?.length || 0}
                                                        </span>
                                                    </td>
                                                    <td style={{ ...tdStyle, fontSize: '0.8rem' }}>
                                                        {new Date(formula.uploadedAt).toLocaleDateString('en-IN')}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* Materials Tab */}
                        {activeTab === 'materials' && (
                            <div style={{
                                background: 'var(--card)',
                                borderRadius: 'var(--radius-lg)',
                                border: '1px solid var(--border)',
                                overflow: 'hidden',
                            }}>
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                        <thead>
                                            <tr style={{ background: 'var(--muted)' }}>
                                                {[
                                                    { key: 'sourceFileName', label: '📁 Source File' },
                                                    { key: 'sourceProductName', label: 'Product' },
                                                    { key: 'srNo', label: 'Sr' },
                                                    { key: 'materialCode', label: 'Material Code' },
                                                    { key: 'materialName', label: 'Material Name' },
                                                    { key: 'requiredQuantity', label: 'Req Qty' },
                                                    { key: 'quantityPerUnit', label: 'Qty/Unit' },
                                                ].map(({ key, label }) => (
                                                    <th
                                                        key={key}
                                                        onClick={() => handleSort(key)}
                                                        style={{
                                                            ...thStyle,
                                                            cursor: 'pointer',
                                                            background: sortField === key ? 'rgba(139, 92, 246, 0.1)' : 'transparent',
                                                        }}
                                                    >
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                                            {label}
                                                            {sortField === key && (
                                                                <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                                                            )}
                                                        </div>
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {sortedMaterials.map((material, index) => (
                                                <tr
                                                    key={index}
                                                    style={{ background: index % 2 === 0 ? 'transparent' : 'var(--muted)' }}
                                                >
                                                    <td style={tdStyle}>
                                                        <span style={{
                                                            display: 'inline-block',
                                                            padding: '0.25rem 0.5rem',
                                                            background: 'rgba(139, 92, 246, 0.1)',
                                                            color: '#8b5cf6',
                                                            borderRadius: 'var(--radius-sm)',
                                                            fontSize: '0.7rem',
                                                            fontWeight: '600',
                                                        }}>
                                                            {material.sourceFileName}
                                                        </span>
                                                    </td>
                                                    <td style={{ ...tdStyle, fontSize: '0.8rem' }}>
                                                        {material.sourceProductName}
                                                    </td>
                                                    <td style={tdStyle}>{material.srNo}</td>
                                                    <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: '0.8rem' }}>
                                                        {material.materialCode}
                                                    </td>
                                                    <td style={tdStyle}>{material.materialName}</td>
                                                    <td style={tdStyle}>{material.requiredQuantity}</td>
                                                    <td style={tdStyle}>{material.quantityPerUnit}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* Composition Tab */}
                        {activeTab === 'composition' && (
                            <div style={{
                                background: 'var(--card)',
                                borderRadius: 'var(--radius-lg)',
                                border: '1px solid var(--border)',
                                overflow: 'hidden',
                            }}>
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                        <thead>
                                            <tr style={{ background: 'var(--muted)' }}>
                                                <th style={thStyle}>📁 Source File</th>
                                                <th style={thStyle}>Product</th>
                                                <th style={thStyle}>Active Ingredient</th>
                                                <th style={thStyle}>Strength/Unit</th>
                                                <th style={thStyle}>Form</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {allCompositions.map((comp, index) => (
                                                <tr
                                                    key={index}
                                                    style={{ background: index % 2 === 0 ? 'transparent' : 'var(--muted)' }}
                                                >
                                                    <td style={tdStyle}>
                                                        <span style={{
                                                            display: 'inline-block',
                                                            padding: '0.25rem 0.5rem',
                                                            background: 'rgba(139, 92, 246, 0.1)',
                                                            color: '#8b5cf6',
                                                            borderRadius: 'var(--radius-sm)',
                                                            fontSize: '0.7rem',
                                                            fontWeight: '600',
                                                        }}>
                                                            {comp.sourceFileName}
                                                        </span>
                                                    </td>
                                                    <td style={{ ...tdStyle, fontSize: '0.8rem' }}>
                                                        {comp.sourceProductName}
                                                    </td>
                                                    <td style={tdStyle}>{comp.activeIngredientName}</td>
                                                    <td style={tdStyle}>{comp.strengthPerUnit}</td>
                                                    <td style={tdStyle}>{comp.form}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
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
    padding: '0.75rem 0.5rem',
    textAlign: 'left',
    fontWeight: '600',
    color: 'var(--foreground)',
    whiteSpace: 'nowrap',
    borderBottom: '1px solid var(--border)',
};

const tdStyle: React.CSSProperties = {
    padding: '0.625rem 0.5rem',
    borderBottom: '1px solid var(--border)',
    color: 'var(--foreground)',
};
