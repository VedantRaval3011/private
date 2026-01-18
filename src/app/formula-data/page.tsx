'use client';

/**
 * Formula Data Page - MFC Dashboard
 * Shows all Master Formula Cards organized in expandable sections
 * Displays complete MFC data with all fields - using FormulaDisplay style
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import * as XLSX from 'xlsx';

// Complete MasterFormulaDetails interface matching the parsed data
interface MasterFormulaDetails {
    masterCardNo: string;
    productCode: string;
    productName: string;
    genericName: string;
    specification: string;
    manufacturingLicenseNo: string;
    manufacturingLocation: string;
    reasonForChange?: string;
    revisionNo?: string;
    manufacturer: string;
    shelfLife: string;
    effectiveBatchNo?: string;
    date?: string;
}

interface BatchInfo {
    batchSize: string;
    labelClaim: string;
    marketedBy?: string;
    volume?: string;
}

interface MaterialItem {
    srNo: number;
    materialCode: string;
    materialName: string;
    potencyCorrection: string;
    requiredQuantity: string;
    overages?: string;
    quantityPerUnit: string;
    requiredQuantityStandardBatch: string;
    equivalentMaterial?: string;
    conversionFactor?: string;
}

interface FillingDetail {
    productCode: string;
    productName: string;
    packingSize: string;
    actualFillingQuantity: string;
    numberOfSyringes: string;
    syringeType?: string;
    packingMaterials?: Array<{
        srNo: number;
        materialCode: string;
        materialName: string;
        qtyPerUnit: string;
        reqAsPerStdBatchSize: string;
        unit: string;
    }>;
}

interface CompositionItem {
    activeIngredientName: string;
    strengthPerUnit: string;
    form: string;
    equivalentBase?: string;
}

interface ExcipientItem {
    name: string;
    type: string;
    quantity: string;
    unit: string;
}

interface CompanyInfo {
    companyName: string;
    companyAddress: string;
    documentTitle: string;
    pageNumber?: string;
}

interface SummaryTotals {
    totalUnitsProduced?: string;
    totalFillingQuantity?: string;
    standardBatchSizeCompliance?: string;
}

// Process-based data interfaces
interface ProcessMaterialItem {
    srNo: number;
    materialCode: string;
    materialName: string;
    potencyCorrection: string;
    reqQty: string;
    ovgPercent: string;
    qtyPerUnit: string;
    reqAsPerStdBatchSize: string;
    unit: string;
    materialType: string;
    subMaterialType: string;
}

interface AsepticFillingProduct {
    productCode: string;
    productName: string;
    packing: string;
    packingSize?: string;  // Alternative field name
    actualFillingQty: string;
    actualFillingQuantity?: string;  // Alternative field name
    actualFillingMl: string;
    materials: ProcessMaterialItem[];
}

interface ProcessData {
    processNo: number;
    processName: string;
    materials: ProcessMaterialItem[];
    fillingProducts?: AsepticFillingProduct[];
}

interface PackingMaterialItem {
    srNo: number;
    materialCode: string;
    materialName: string;
    subType: string;
    unit: string;
    reqAsPerStdBatchSize: string;
    artworkNo?: string;
}

interface FormulaRecord {
    _id: string;
    uniqueIdentifier: string;
    fileName: string;
    fileSize: number;
    parsingStatus: 'success' | 'partial' | 'failed';
    uploadedAt: string;
    companyInfo: CompanyInfo;
    masterFormulaDetails: MasterFormulaDetails;
    batchInfo: BatchInfo;
    composition: CompositionItem[];
    materials: MaterialItem[];
    excipients?: ExcipientItem[];
    fillingDetails: FillingDetail[];
    summary: SummaryTotals;
    processes?: ProcessData[];
    packingMaterials?: PackingMaterialItem[];
    totalBatchCount?: number;  // Total batches across all product codes in this MFC
    rmDataMatched?: number;    // Number of batches with RM (Raw Material) requisition data
    rmDataUnmatched?: number;  // Number of batches without RM requisition data
    ppmDataMatched?: number;
    ppmDataUnmatched?: number;
    pmDataMatched?: number;
    pmDataUnmatched?: number;
    materialQualified?: number;    // Number of batches with all materials qualified
    materialUnqualified?: number;  // Number of batches with missing materials
    formulaMaterialCount?: number; // Total unique material codes in formula
}

interface ColumnDef {
    id: string;
    label: string;
    highlight?: boolean;
}

interface FormulaListResponse {
    success: boolean;
    data: FormulaRecord[];
    total: number;
    page: number;
    limit: number;
    batchCounts?: Record<string, number>;
    unmatchedBatches?: Array<{ itemCode: string; count: number }>;
    globalRmDataMatched?: number;
    globalRmDataUnmatched?: number;
    totalRmBatchesInSystem?: number;
    globalPpmDataMatched?: number;
    globalPpmDataUnmatched?: number;
    globalPmDataMatched?: number;
    globalPmDataUnmatched?: number;
    rmBatchNumbersList?: string[];
    ppmBatchNumbersList?: string[];
    pmBatchNumbersList?: string[];
    materialQualifiedBatchNumbersList?: string[];
    globalMaterialQualified?: number;
    globalMaterialUnqualified?: number;
    globalPmCoaQualified?: number;
    globalPmCoaUnqualified?: number;
    globalPpmCoaQualified?: number;
    globalPpmCoaUnqualified?: number;
    globalBulkCoaQualified?: number;
    globalBulkCoaUnqualified?: number;
}

// ============================================
// Section Component (from FormulaDisplay) - Enhanced with vibrant colors
// ============================================
interface SectionProps {
    title: string;
    icon: React.ReactNode;
    children: React.ReactNode;
    defaultOpen?: boolean;
    gradient?: string;
}

function Section({ title, icon, children, defaultOpen = true, gradient = 'var(--gradient-primary)' }: SectionProps) {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    // Extract accent color from gradient for border glow
    const getAccentColor = (grad: string) => {
        if (grad.includes('#7c3aed') || grad.includes('#8b5cf6')) return 'rgba(139, 92, 246, 0.4)';
        if (grad.includes('#0891b2') || grad.includes('#0d9488')) return 'rgba(13, 148, 136, 0.4)';
        if (grad.includes('#059669') || grad.includes('#10b981')) return 'rgba(16, 185, 129, 0.4)';
        if (grad.includes('#db2777') || grad.includes('#ec4899')) return 'rgba(236, 72, 153, 0.4)';
        if (grad.includes('#ea580c') || grad.includes('#f97316')) return 'rgba(249, 115, 22, 0.4)';
        if (grad.includes('#6366f1')) return 'rgba(99, 102, 241, 0.4)';
        return 'rgba(139, 92, 246, 0.3)';
    };

    const accentGlow = getAccentColor(gradient);

    return (
        <div
            style={{
                background: 'var(--card)',
                borderRadius: '16px',
                overflow: 'hidden',
                boxShadow: isOpen ? `0 8px 32px ${accentGlow}, 0 4px 12px rgba(0,0,0,0.08)` : 'var(--shadow-md)',
                border: 'none',
                marginBottom: '1.25rem',
                transition: 'all 0.3s ease',
            }}
        >
            <button
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    width: '100%',
                    padding: '1.125rem 1.5rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: gradient,
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    position: 'relative',
                    overflow: 'hidden',
                }}
            >
                {/* Decorative shimmer effect */}
                <div style={{
                    position: 'absolute',
                    top: 0,
                    left: '-100%',
                    width: '50%',
                    height: '100%',
                    background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)',
                    animation: isOpen ? 'none' : undefined,
                }} />

                {/* Decorative circles */}
                <div style={{
                    position: 'absolute',
                    right: '40px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    width: '60px',
                    height: '60px',
                    borderRadius: '50%',
                    background: 'rgba(255,255,255,0.08)',
                }} />
                <div style={{
                    position: 'absolute',
                    right: '20px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    background: 'rgba(255,255,255,0.05)',
                }} />

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', zIndex: 1 }}>
                    <div style={{
                        width: '36px',
                        height: '36px',
                        background: 'rgba(255, 255, 255, 0.25)',
                        borderRadius: '10px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                        backdropFilter: 'blur(10px)',
                    }}>
                        {icon}
                    </div>
                    <h3 style={{
                        color: 'white',
                        fontSize: '1.05rem',
                        fontWeight: '700',
                        margin: 0,
                        textShadow: '0 1px 2px rgba(0,0,0,0.1)',
                        letterSpacing: '-0.01em',
                    }}>
                        {title}
                    </h3>
                </div>
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    zIndex: 1,
                }}>
                    <span style={{
                        fontSize: '0.7rem',
                        color: 'rgba(255,255,255,0.7)',
                        fontWeight: '500',
                    }}>
                        {isOpen ? 'Collapse' : 'Expand'}
                    </span>
                    <div style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '8px',
                        background: 'rgba(255,255,255,0.2)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'transform 0.2s ease',
                    }}>
                        <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="white"
                            strokeWidth="2.5"
                            style={{
                                transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                                transition: 'transform 0.2s ease',
                            }}
                        >
                            <polyline points="6 9 12 15 18 9" />
                        </svg>
                    </div>
                </div>
            </button>

            {isOpen && (
                <div style={{
                    padding: '1.5rem',
                    background: 'linear-gradient(180deg, rgba(249, 250, 251, 0.5) 0%, white 100%)',
                    borderTop: `3px solid ${accentGlow.replace('0.4', '0.6').replace('0.3', '0.5')}`,
                }}>
                    {children}
                </div>
            )}
        </div>
    );
}

// ============================================
// InfoRow Component (from FormulaDisplay) - Enhanced with colors
// ============================================
function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div style={{
            display: 'flex',
            padding: '0.75rem 0.5rem',
            borderBottom: '1px solid rgba(139, 92, 246, 0.1)',
            borderRadius: '8px',
            margin: '2px 0',
            transition: 'all 0.2s ease',
            background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.02) 0%, rgba(20, 184, 166, 0.02) 100%)',
        }}
            onMouseEnter={(e) => {
                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(139, 92, 246, 0.08) 0%, rgba(20, 184, 166, 0.05) 100%)';
                e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.3)';
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(139, 92, 246, 0.02) 0%, rgba(20, 184, 166, 0.02) 100%)';
                e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.1)';
            }}
        >
            <span style={{
                flex: '0 0 40%',
                fontWeight: '600',
                color: '#7c3aed',
                fontSize: '0.85rem',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
            }}>
                <span style={{
                    width: '4px',
                    height: '4px',
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #8b5cf6 0%, #06b6d4 100%)',
                }}></span>
                {label}
            </span>
            <span style={{
                flex: '0 0 60%',
                color: 'var(--foreground)',
                fontWeight: '500',
                fontSize: '0.85rem',
            }}>
                {value || <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>N/A</span>}
            </span>
        </div>
    );
}

// ============================================
// DataTable Component (from FormulaDisplay) - Enhanced with vibrant colors
// ============================================

// Color themes for different table types
const tableColorThemes = [
    { header: 'linear-gradient(135deg, #7c3aed 0%, #8b5cf6 100%)', evenRow: 'rgba(139, 92, 246, 0.03)', oddRow: 'rgba(139, 92, 246, 0.08)', border: '#8b5cf6', accent: '#7c3aed' },
    { header: 'linear-gradient(135deg, #0891b2 0%, #06b6d4 100%)', evenRow: 'rgba(6, 182, 212, 0.03)', oddRow: 'rgba(6, 182, 212, 0.08)', border: '#06b6d4', accent: '#0891b2' },
    { header: 'linear-gradient(135deg, #059669 0%, #10b981 100%)', evenRow: 'rgba(16, 185, 129, 0.03)', oddRow: 'rgba(16, 185, 129, 0.08)', border: '#10b981', accent: '#059669' },
    { header: 'linear-gradient(135deg, #db2777 0%, #ec4899 100%)', evenRow: 'rgba(236, 72, 153, 0.03)', oddRow: 'rgba(236, 72, 153, 0.08)', border: '#ec4899', accent: '#db2777' },
    { header: 'linear-gradient(135deg, #ea580c 0%, #f97316 100%)', evenRow: 'rgba(249, 115, 22, 0.03)', oddRow: 'rgba(249, 115, 22, 0.08)', border: '#f97316', accent: '#ea580c' },
];

let tableColorIndex = 0;
const getNextTableTheme = () => {
    const theme = tableColorThemes[tableColorIndex % tableColorThemes.length];
    tableColorIndex++;
    return theme;
};

function DataTable({
    headers,
    rows,
    colorTheme
}: {
    headers: string[];
    rows: (string | number | React.ReactNode | undefined)[][];
    colorTheme?: { header: string; evenRow: string; oddRow: string; border: string; accent: string };
}) {
    const theme = colorTheme || getNextTableTheme();

    return (
        <div style={{
            overflowX: 'auto',
            borderRadius: '12px',
            border: `2px solid ${theme.border}`,
            boxShadow: `0 4px 16px rgba(0, 0, 0, 0.08), 0 0 0 1px ${theme.border}20`,
            background: 'white',
        }}>
            <table style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '0.82rem',
            }}>
                <thead>
                    <tr style={{ background: theme.header }}>
                        {headers.map((header, i) => (
                            <th key={i} style={{
                                padding: '0.875rem 1rem',
                                textAlign: 'left',
                                fontWeight: '700',
                                color: 'white',
                                borderBottom: 'none',
                                whiteSpace: 'nowrap',
                                textTransform: 'uppercase',
                                fontSize: '0.72rem',
                                letterSpacing: '0.05em',
                                textShadow: '0 1px 2px rgba(0,0,0,0.1)',
                            }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    {i === 0 && <span style={{ opacity: 0.8 }}>📋</span>}
                                    {header}
                                </span>
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.length === 0 ? (
                        <tr>
                            <td
                                colSpan={headers.length}
                                style={{
                                    padding: '2.5rem',
                                    textAlign: 'center',
                                    color: '#9ca3af',
                                    background: 'linear-gradient(180deg, rgba(249, 250, 251, 0) 0%, rgba(249, 250, 251, 1) 100%)',
                                }}
                            >
                                <span style={{ fontSize: '1.5rem', marginBottom: '8px', display: 'block' }}>📭</span>
                                No data available
                            </td>
                        </tr>
                    ) : (
                        rows.map((row, rowIndex) => (
                            <tr
                                key={rowIndex}
                                style={{
                                    background: rowIndex % 2 === 0 ? theme.evenRow : theme.oddRow,
                                    transition: 'all 0.2s ease',
                                    borderLeft: rowIndex % 2 === 1 ? `3px solid ${theme.border}40` : '3px solid transparent',
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.background = `${theme.border}15`;
                                    e.currentTarget.style.transform = 'scale(1.002)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background = rowIndex % 2 === 0 ? theme.evenRow : theme.oddRow;
                                    e.currentTarget.style.transform = 'scale(1)';
                                }}
                            >
                                {row.map((cell, cellIndex) => (
                                    <td key={cellIndex} style={{
                                        padding: '0.75rem 1rem',
                                        borderBottom: `1px solid ${theme.border}20`,
                                        color: '#374151',
                                        fontWeight: cellIndex === 0 ? '600' : '400',
                                    }}>
                                        {cellIndex === 0 && typeof cell === 'number' ? (
                                            <span style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                width: '24px',
                                                height: '24px',
                                                borderRadius: '6px',
                                                background: theme.header,
                                                color: 'white',
                                                fontSize: '0.7rem',
                                                fontWeight: '700',
                                            }}>
                                                {cell}
                                            </span>
                                        ) : cellIndex === 1 ? (
                                            <span style={{
                                                fontFamily: 'monospace',
                                                padding: '2px 8px',
                                                background: `${theme.border}15`,
                                                borderRadius: '4px',
                                                color: theme.accent,
                                                fontWeight: '600',
                                            }}>
                                                {cell ?? 'N/A'}
                                            </span>
                                        ) : (
                                            cell ?? <span style={{ color: '#d1d5db', fontStyle: 'italic' }}>N/A</span>
                                        )}
                                    </td>
                                ))}
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>
    );
}

// Color scheme for different manufacturers - Enhanced with more visible pastel tints
const getManufacturerColor = (manufacturer: string): { primary: string; light: string; border: string; glow: string; glass: string } => {
    const mfr = manufacturer?.toLowerCase() || '';

    if (mfr.includes('indiana')) {
        return {
            primary: '#f97316',
            light: 'rgba(249, 115, 22, 0.18)',
            border: 'rgba(249, 115, 22, 0.4)',
            glow: 'rgba(249, 115, 22, 0.12)',
            glass: 'linear-gradient(135deg, rgba(255, 237, 213, 0.6) 0%, rgba(254, 215, 170, 0.4) 50%, rgba(251, 191, 36, 0.15) 100%)'
        };
    }
    if (mfr.includes('zenex')) {
        return {
            primary: '#ec4899',
            light: 'rgba(236, 72, 153, 0.18)',
            border: 'rgba(236, 72, 153, 0.4)',
            glow: 'rgba(236, 72, 153, 0.12)',
            glass: 'linear-gradient(135deg, rgba(253, 242, 248, 0.7) 0%, rgba(252, 231, 243, 0.5) 50%, rgba(244, 114, 182, 0.15) 100%)'
        };
    }
    if (mfr.includes('ajanta')) {
        return {
            primary: '#3b82f6',
            light: 'rgba(59, 130, 246, 0.18)',
            border: 'rgba(59, 130, 246, 0.4)',
            glow: 'rgba(59, 130, 246, 0.12)',
            glass: 'linear-gradient(135deg, rgba(239, 246, 255, 0.7) 0%, rgba(219, 234, 254, 0.5) 50%, rgba(147, 197, 253, 0.2) 100%)'
        };
    }
    if (mfr.includes('cadila')) {
        return {
            primary: '#14b8a6',
            light: 'rgba(20, 184, 166, 0.18)',
            border: 'rgba(20, 184, 166, 0.4)',
            glow: 'rgba(20, 184, 166, 0.12)',
            glass: 'linear-gradient(135deg, rgba(240, 253, 250, 0.7) 0%, rgba(204, 251, 241, 0.5) 50%, rgba(94, 234, 212, 0.2) 100%)'
        };
    }
    // Default purple
    return {
        primary: '#8b5cf6',
        light: 'rgba(139, 92, 246, 0.18)',
        border: 'rgba(139, 92, 246, 0.4)',
        glow: 'rgba(139, 92, 246, 0.12)',
        glass: 'linear-gradient(135deg, rgba(245, 243, 255, 0.7) 0%, rgba(237, 233, 254, 0.5) 50%, rgba(196, 181, 253, 0.2) 100%)'
    };
};

// ============================================
// Batch Status Capsule Component - Shows RM data matching status
// Green: Batches with RM requisition data. Red: Batches without RM data
// ============================================
interface BatchStatusCapsuleProps {
    matched: number;
    unmatched: number;
    onGreenClick?: () => void | Promise<void>;
    onRedClick?: () => void | Promise<void>;
    size?: 'small' | 'medium' | 'large';
    type: 'RM' | 'PPM' | 'PM' | 'RM COA' | 'PM COA' | 'PPM COA' | 'Bulk COA';
}

function BatchStatusCapsule({ matched, unmatched, onGreenClick, onRedClick, size = 'medium', type }: BatchStatusCapsuleProps) {
    const total = matched + unmatched;
    if (total === 0) return null;

    const greenPercent = (matched / total) * 100;
    const redPercent = (unmatched / total) * 100;

    // Size configurations
    const sizeConfig = {
        small: { height: '20px', fontSize: '10px', padding: '2px 8px', minWidth: '60px' },
        medium: { height: '26px', fontSize: '11px', padding: '4px 10px', minWidth: '80px' },
        large: { height: '32px', fontSize: '12px', padding: '5px 12px', minWidth: '100px' }
    };
    const config = sizeConfig[size];

    return (
        <div
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
            }}
            title={`${type === 'RM COA' ? 'RM COA' : type} Data: ${matched} found, ${unmatched} missing`}
        >
            {/* Type Label */}
            <span style={{
                fontSize: size === 'small' ? '9px' : '10px',
                fontWeight: 700,
                color: type === 'RM' ? '#6b7280'
                    : type === 'PPM' ? '#3b82f6'
                        : type === 'PM' ? '#7c3aed'
                            : type === 'RM COA' ? '#0891b2'
                                : type === 'PM COA' ? '#dc2626'
                                    : type === 'PPM COA' ? '#ea580c'
                                        : '#059669', // Bulk COA - green/emerald
                background: type === 'RM' ? '#f3f4f6'
                    : type === 'PPM' ? '#eff6ff'
                        : type === 'PM' ? '#f5f3ff'
                            : type === 'RM COA' ? '#ecfeff'
                                : type === 'PM COA' ? '#fef2f2'
                                    : type === 'PPM COA' ? '#fff7ed'
                                        : '#ecfdf5', // Bulk COA - emerald bg
                padding: size === 'small' ? '2px 5px' : '3px 6px',
                borderRadius: '4px',
                textTransform: (type === 'RM COA' || type === 'PM COA' || type === 'PPM COA' || type === 'Bulk COA') ? 'none' : 'uppercase',
                letterSpacing: '0.5px',
            }}>
                {type}
            </span>
            {/* Capsule */}
            <div
                style={{
                    display: 'inline-flex',
                    alignItems: 'stretch',
                    height: config.height,
                    borderRadius: '20px',
                    overflow: 'hidden',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.2)',
                    border: '1px solid rgba(255,255,255,0.3)',
                    minWidth: config.minWidth,
                }}
            >
                {/* Green Section - RM Data Found */}
                {matched > 0 && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onGreenClick?.(); }}
                        style={{
                            flex: greenPercent,
                            minWidth: matched > 0 ? '40px' : '0',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '3px',
                            padding: config.padding,
                            background: type === 'RM'
                                ? 'linear-gradient(135deg, #059669 0%, #10b981 100%)'
                                : type === 'PPM'
                                    ? 'linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)'
                                    : type === 'PM'
                                        ? 'linear-gradient(135deg, #6d28d9 0%, #7c3aed 100%)'
                                        : type === 'RM COA'
                                            ? 'linear-gradient(135deg, #0891b2 0%, #06b6d4 100%)'
                                            : type === 'PM COA'
                                                ? 'linear-gradient(135deg, #dc2626 0%, #ef4444 100%)'
                                                : type === 'PPM COA'
                                                    ? 'linear-gradient(135deg, #ea580c 0%, #f97316 100%)'
                                                    : 'linear-gradient(135deg, #059669 0%, #10b981 100%)', // Bulk COA - emerald
                            border: 'none',
                            cursor: onGreenClick ? 'pointer' : 'default',
                            color: 'white',
                            fontSize: config.fontSize,
                            fontWeight: 700,
                            transition: 'all 0.2s ease',
                            whiteSpace: 'nowrap',
                        }}
                        onMouseEnter={(e) => { if (onGreenClick) e.currentTarget.style.filter = 'brightness(1.1)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.filter = 'brightness(1)'; }}
                        title={`${matched} batches with ${type} requisition data - Click to view`}
                    >
                        <span style={{ fontSize: '0.85em' }}>✓</span>
                        {matched}
                    </button>
                )}
                {/* Red Section - RM Data Missing */}
                {unmatched > 0 && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onRedClick?.(); }}
                        style={{
                            flex: redPercent,
                            minWidth: unmatched > 0 ? '40px' : '0',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '3px',
                            padding: config.padding,
                            background: 'linear-gradient(135deg, #dc2626 0%, #ef4444 100%)',
                            border: 'none',
                            cursor: onRedClick ? 'pointer' : 'default',
                            color: 'white',
                            fontSize: config.fontSize,
                            fontWeight: 700,
                            transition: 'all 0.2s ease',
                            whiteSpace: 'nowrap',
                        }}
                        onMouseEnter={(e) => { if (onRedClick) e.currentTarget.style.filter = 'brightness(1.1)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.filter = 'brightness(1)'; }}
                        title={`${unmatched} batches without ${type} requisition data - Click to view`}
                    >
                        <span style={{ fontSize: '0.85em' }}>✗</span>
                        {unmatched}
                    </button>
                )}
            </div>
        </div>
    );
}

export default function FormulaDataPage() {
    const [formulas, setFormulas] = useState<FormulaRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [expandedMfc, setExpandedMfc] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedManufacturer, setSelectedManufacturer] = useState<string | null>(null);
    const [batchCounts, setBatchCounts] = useState<Record<string, number>>({});
    const [unmatchedBatches, setUnmatchedBatches] = useState<{ itemCode: string; count: number }[]>([]);
    // Global RM (Raw Material) data matching for section header capsule
    const [globalRmDataMatched, setGlobalRmDataMatched] = useState<number>(0);
    const [globalRmDataUnmatched, setGlobalRmDataUnmatched] = useState<number>(0);
    // Global PPM and PM data matching for section header capsules
    const [globalPpmDataMatched, setGlobalPpmDataMatched] = useState<number>(0);
    const [globalPpmDataUnmatched, setGlobalPpmDataUnmatched] = useState<number>(0);
    const [globalPmDataMatched, setGlobalPmDataMatched] = useState<number>(0);
    const [globalPmDataUnmatched, setGlobalPmDataUnmatched] = useState<number>(0);
    // Set of batch numbers that have RM requisition data (for per-section RM calculation)
    const [rmBatchNumbers, setRmBatchNumbers] = useState<Set<string>>(new Set());
    // Set of batch numbers that have PPM requisition data
    const [ppmBatchNumbers, setPpmBatchNumbers] = useState<Set<string>>(new Set());
    // Set of batch numbers that have PM requisition data
    const [pmBatchNumbers, setPmBatchNumbers] = useState<Set<string>>(new Set());
    // Set of batch numbers that are material-qualified (all formula materials found in requisition)
    const [materialQualifiedBatchNumbers, setMaterialQualifiedBatchNumbers] = useState<Set<string>>(new Set());
    // Global Material Qualification data for section header capsule
    const [globalMaterialQualified, setGlobalMaterialQualified] = useState<number>(0);
    const [globalMaterialUnqualified, setGlobalMaterialUnqualified] = useState<number>(0);
    // Global PM COA data for section header capsule
    const [globalPmCoaQualified, setGlobalPmCoaQualified] = useState<number>(0);
    const [globalPmCoaUnqualified, setGlobalPmCoaUnqualified] = useState<number>(0);
    // Global PPM COA data for section header capsule
    const [globalPpmCoaQualified, setGlobalPpmCoaQualified] = useState<number>(0);
    const [globalPpmCoaUnqualified, setGlobalPpmCoaUnqualified] = useState<number>(0);
    // Global Bulk COA data for section header capsule
    const [globalBulkCoaQualified, setGlobalBulkCoaQualified] = useState<number>(0);
    const [globalBulkCoaUnqualified, setGlobalBulkCoaUnqualified] = useState<number>(0);

    // RM Data Modal State (for viewing RM requisition details)
    const [showRmDataModal, setShowRmDataModal] = useState(false);
    const [rmModalType, setRmModalType] = useState<'matched' | 'unmatched'>('matched');
    const [rmModalData, setRmModalData] = useState<any[]>([]);
    const [isRmModalLoading, setIsRmModalLoading] = useState(false);
    const [rmModalError, setRmModalError] = useState<string | null>(null);
    const [expandedRmBatches, setExpandedRmBatches] = useState<Set<string>>(new Set());
    // RM Modal Sorting State
    const [rmSortColumn, setRmSortColumn] = useState<string>('batchNumber');
    const [rmSortDirection, setRmSortDirection] = useState<'asc' | 'desc'>('asc');
    // RM Modal View Mode State (table or file)
    const [rmViewMode, setRmViewMode] = useState<'table' | 'file'>('table');

    // PPM Data Modal State (for viewing PPM requisition details)
    const [showPpmDataModal, setShowPpmDataModal] = useState(false);
    const [ppmModalType, setPpmModalType] = useState<'matched' | 'unmatched'>('matched');
    const [ppmModalData, setPpmModalData] = useState<any[]>([]);
    const [isPpmModalLoading, setIsPpmModalLoading] = useState(false);
    const [ppmModalError, setPpmModalError] = useState<string | null>(null);
    const [ppmSortColumn, setPpmSortColumn] = useState<string>('batchNumber');
    const [ppmSortDirection, setPpmSortDirection] = useState<'asc' | 'desc'>('asc');
    const [ppmViewMode, setPpmViewMode] = useState<'table' | 'file'>('table');

    // PM Data Modal State (for viewing PM requisition details)
    const [showPmDataModal, setShowPmDataModal] = useState(false);
    const [pmModalType, setPmModalType] = useState<'matched' | 'unmatched'>('matched');
    const [pmModalData, setPmModalData] = useState<any[]>([]);
    const [isPmModalLoading, setIsPmModalLoading] = useState(false);
    const [pmModalError, setPmModalError] = useState<string | null>(null);
    const [pmSortColumn, setPmSortColumn] = useState<string>('batchNumber');
    const [pmSortDirection, setPmSortDirection] = useState<'asc' | 'desc'>('asc');
    const [pmViewMode, setPmViewMode] = useState<'table' | 'file'>('table');

    // Material Qualification Modal State (for viewing material qualification details)
    const [showMatDataModal, setShowMatDataModal] = useState(false);
    const [matModalType, setMatModalType] = useState<'qualified' | 'unqualified'>('qualified');
    const [matModalData, setMatModalData] = useState<any[]>([]);
    const [isMatModalLoading, setIsMatModalLoading] = useState(false);
    const [matModalError, setMatModalError] = useState<string | null>(null);
    const [matSortColumn, setMatSortColumn] = useState<string>('arNo');
    const [matSortDirection, setMatSortDirection] = useState<'asc' | 'desc'>('asc');
    const [matViewMode, setMatViewMode] = useState<'table' | 'file'>('file');
    const [expandedMatArNumbers, setExpandedMatArNumbers] = useState<Set<string>>(new Set());

    // Per-Formula RM Modal State (for viewing RM data specific to one formula/MFC)
    const [perFormulaRmModalOpen, setPerFormulaRmModalOpen] = useState(false);
    const [perFormulaRmMfc, setPerFormulaRmMfc] = useState<string | null>(null);
    const [perFormulaRmType, setPerFormulaRmType] = useState<'matched' | 'unmatched'>('matched');
    const [perFormulaRmData, setPerFormulaRmData] = useState<any[]>([]);
    const [perFormulaRmLoading, setPerFormulaRmLoading] = useState(false);
    const [perFormulaRmError, setPerFormulaRmError] = useState<string | null>(null);
    const [perFormulaRmFormulaName, setPerFormulaRmFormulaName] = useState<string>('');

    // Per-Formula PPM Modal State (for viewing PPM data specific to one formula/MFC)
    const [perFormulaPpmModalOpen, setPerFormulaPpmModalOpen] = useState(false);
    const [perFormulaPpmMfc, setPerFormulaPpmMfc] = useState<string | null>(null);
    const [perFormulaPpmType, setPerFormulaPpmType] = useState<'matched' | 'unmatched'>('matched');
    const [perFormulaPpmData, setPerFormulaPpmData] = useState<any[]>([]);
    const [perFormulaPpmLoading, setPerFormulaPpmLoading] = useState(false);
    const [perFormulaPpmError, setPerFormulaPpmError] = useState<string | null>(null);
    const [perFormulaPpmFormulaName, setPerFormulaPpmFormulaName] = useState<string>('');

    // Per-Formula PM Modal State (for viewing PM data specific to one formula/MFC)
    const [perFormulaPmModalOpen, setPerFormulaPmModalOpen] = useState(false);
    const [perFormulaPmMfc, setPerFormulaPmMfc] = useState<string | null>(null);
    const [perFormulaPmType, setPerFormulaPmType] = useState<'matched' | 'unmatched'>('matched');
    const [perFormulaPmData, setPerFormulaPmData] = useState<any[]>([]);
    const [perFormulaPmLoading, setPerFormulaPmLoading] = useState(false);
    const [perFormulaPmError, setPerFormulaPmError] = useState<string | null>(null);
    const [perFormulaPmFormulaName, setPerFormulaPmFormulaName] = useState<string>('');


    const [expandedPpmBatches, setExpandedPpmBatches] = useState<Set<string>>(new Set());
    const [expandedPmBatches, setExpandedPmBatches] = useState<Set<string>>(new Set());

    // Bulk COA Data Modal State (for viewing Bulk COA AR numbers and missing batches)
    const [showBulkCoaModal, setShowBulkCoaModal] = useState(false);
    const [bulkCoaModalType, setBulkCoaModalType] = useState<'matched' | 'unmatched'>('matched');
    const [bulkCoaModalData, setBulkCoaModalData] = useState<any[]>([]);
    const [isBulkCoaModalLoading, setIsBulkCoaModalLoading] = useState(false);
    const [bulkCoaModalError, setBulkCoaModalError] = useState<string | null>(null);
    const [bulkCoaSortColumn, setBulkCoaSortColumn] = useState<string>('arNumber');
    const [bulkCoaSortDirection, setBulkCoaSortDirection] = useState<'asc' | 'desc'>('asc');
    const [bulkCoaViewMode, setBulkCoaViewMode] = useState<'table' | 'file'>('table');
    const [expandedBulkCoaBatches, setExpandedBulkCoaBatches] = useState<Set<string>>(new Set());


    // Section collapse states
    const [orphanedBatchesOpen, setOrphanedBatchesOpen] = useState(true);
    const [manufacturerFilterOpen, setManufacturerFilterOpen] = useState(false);
    const [mainMfcsOpen, setMainMfcsOpen] = useState(true);
    const [lowBatchMfcsOpen, setLowBatchMfcsOpen] = useState(false);
    const [noBatchMfcsOpen, setNoBatchMfcsOpen] = useState(false);
    const [placeboMfcsOpen, setPlaceboMfcsOpen] = useState(false);

    // Sort by MFC Number state: 'none' | 'asc' | 'desc'
    const [mfcSortOrder, setMfcSortOrder] = useState<'none' | 'asc' | 'desc'>('none');

    // MFC Summary Table modal state
    const [showMfcSummaryTable, setShowMfcSummaryTable] = useState(false);
    const [mfcTableSortColumn, setMfcTableSortColumn] = useState<'sr' | 'mfc' | 'product' | 'batches'>('sr');
    const [mfcTableSortDirection, setMfcTableSortDirection] = useState<'asc' | 'desc'>('asc');

    // Batch Section State (for viewing all batches at bottom of page)
    const [showBatchSection, setShowBatchSection] = useState(false);
    const [batchViewMode, setBatchViewMode] = useState<'unique' | 'all'>('unique');
    // Type for batch items used in the batch section display
    interface BatchItem {
        batchNumber?: string;
        itemCode?: string;
        itemName?: string;
        mfgDate?: string;
        batchSize?: string;
        batchUom?: string;
        pack?: string;
        sourceFileName?: string;
        expiryDate?: string;
        mrpValue?: string | null;
        type?: 'Export' | 'Import';
        department?: string;
        locationId?: string;
        make?: string;
    }
    const [allBatches, setAllBatches] = useState<BatchItem[]>([]);
    const [isBatchesLoading, setIsBatchesLoading] = useState(false);
    const [batchSearchTerm, setBatchSearchTerm] = useState('');
    const [expandedBatchGroups, setExpandedBatchGroups] = useState<Set<string>>(new Set());
    const batchSectionRef = useRef<HTMLDivElement>(null);
    const [hideZeroBatches, setHideZeroBatches] = useState(false);
    const [batchSortColumn, setBatchSortColumn] = useState<keyof BatchItem>('batchNumber');
    const [batchSortDirection, setBatchSortDirection] = useState<'asc' | 'desc'>('asc');

    // Helper to calculate date difference (shelf life)
    const calculateShelfLife = (mfg: string | undefined, exp: string | undefined) => {
        if (!mfg || !exp || mfg === 'N/A' || exp === 'N/A') return 'N/A';
        try {
            // Check if dates are in 'DD-MMM-YY' or similar format that JS Date can't parse directly
            // common format in pharma: 13-APR-25
            const parsePharmaDate = (dateStr: string) => {
                const parts = dateStr.split('-');
                if (parts.length === 3) {
                    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
                    const monthIdx = months.indexOf(parts[1].toUpperCase());
                    if (monthIdx !== -1) {
                        const year = parseInt(parts[2]);
                        const fullYear = year < 50 ? 2000 + year : 1900 + year;
                        return new Date(fullYear, monthIdx, parseInt(parts[0]));
                    }
                }
                return new Date(dateStr);
            };

            const mfgDate = parsePharmaDate(mfg);
            const expDate = parsePharmaDate(exp);

            if (isNaN(mfgDate.getTime()) || isNaN(expDate.getTime())) return 'N/A';

            const diffTime = expDate.getTime() - mfgDate.getTime();
            if (diffTime < 0) return 'Expired';

            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            const months = Math.floor(diffDays / 30.44);
            return `${months} months`;
        } catch (e) {
            return 'N/A';
        }
    };

    const toggleBatchSort = (column: any) => {
        if (batchSortColumn === column) {
            setBatchSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setBatchSortColumn(column);
            setBatchSortDirection('asc');
        }
    };

    // Batch Detail Modal State
    interface BatchDetailInfo {
        batchNumber: string;
        itemCode: string;
        itemName: string;
        itemDetail: string;
        mfgDate: string;
        expiryDate: string;
        batchSize: string;
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
        companyName: string;
        companyAddress: string;
        fileName: string;
        uploadedAt: Date;
    }
    const [selectedBatchNumber, setSelectedBatchNumber] = useState<string | null>(null);
    const [batchDetails, setBatchDetails] = useState<BatchDetailInfo[] | null>(null);
    const [isBatchModalLoading, setIsBatchModalLoading] = useState(false);
    const [batchModalError, setBatchModalError] = useState<string | null>(null);

    // Batch List Modal State (for viewing all batches of a product code)
    interface BatchListItem {
        batchNumber: string;
        itemCode: string;
        itemName: string;
        itemDetail: string;
        mfgDate: string;
        expiryDate: string;
        batchSize: string;
        unit: string;
        type: string;
        mfgLicNo: string;
        department: string;
        pack: string;
        year: string;
        make: string;
        locationId: string;
        mrpValue: string | null;
        conversionRatio: string;
        batchCompletionDate?: string;
        companyName: string;
        companyAddress: string;
        fileName: string;
        uploadedAt: Date;
    }
    const [selectedProductCode, setSelectedProductCode] = useState<string | null>(null);
    const [selectedProductName, setSelectedProductName] = useState<string | null>(null);
    const [batchList, setBatchList] = useState<BatchListItem[] | null>(null);
    const [isBatchListLoading, setIsBatchListLoading] = useState(false);
    const [batchListError, setBatchListError] = useState<string | null>(null);

    // Batch Reconciliation Summary State
    interface BatchReconciliationSummary {
        totalBatchesInSystem: number;
        batchesMatchedToFormula: number;
        batchesNotMatchedToFormula: number;
        allBatchesAccountedFor: boolean;
        reconciledBatchCount: number;
        mismatchedBatchCount: number;
        reconciliationPercentage: number;
    }
    const [batchReconciliation, setBatchReconciliation] = useState<BatchReconciliationSummary | null>(null);

    // Section Batch List Modal State (for viewing all batches in a section)
    interface SectionBatchItem {
        batchNumber: string;
        itemCode: string;
        itemName: string;
        itemDetail: string;
        mfgDate: string;
        expiryDate: string;
        batchSize: string;
        unit: string;
        type: string;
        mfgLicNo: string;
        department: string;
        pack: string;
        year: string;
        make: string;
        locationId: string;
        mrpValue: string | null;
        conversionRatio: string;
        batchCompletionDate?: string;
        companyName: string;
        companyAddress: string;
        fileName: string;
        uploadedAt: Date;
    }
    const [sectionBatchList, setSectionBatchList] = useState<SectionBatchItem[] | null>(null);
    const [isSectionBatchListLoading, setIsSectionBatchListLoading] = useState(false);
    const [sectionBatchListError, setSectionBatchListError] = useState<string | null>(null);

    // Track expanded filling details per formula (product codes)
    const [expandedFillingDetails, setExpandedFillingDetails] = useState<Set<string>>(new Set());

    const toggleFillingDetail = (formulaId: string, productCode: string) => {
        const key = `${formulaId}-${productCode}`;
        setExpandedFillingDetails(prev => {
            const next = new Set(prev);
            if (next.has(key)) {
                next.delete(key);
            } else {
                next.add(key);
            }
            return next;
        });
    };

    const isFillingDetailExpanded = (formulaId: string, productCode: string) => {
        return expandedFillingDetails.has(`${formulaId}-${productCode}`);
    };
    const [sectionBatchListTitle, setSectionBatchListTitle] = useState<string>('');

    // Track which MFC has batch data visible (show batch data on top of MFC data)
    const [mfcBatchDataVisible, setMfcBatchDataVisible] = useState<Set<string>>(new Set());
    // Store batch data for each MFC
    const [mfcBatchData, setMfcBatchData] = useState<Record<string, BatchListItem[]>>({});
    const [mfcBatchDataLoading, setMfcBatchDataLoading] = useState<Set<string>>(new Set());

    const toggleMfcBatchData = async (formulaId: string, formula: FormulaRecord) => {
        const isCurrentlyVisible = mfcBatchDataVisible.has(formulaId);

        if (isCurrentlyVisible) {
            // Hide the batch data
            setMfcBatchDataVisible(prev => {
                const next = new Set(prev);
                next.delete(formulaId);
                return next;
            });
        } else {
            // Show the batch data - fetch if not already loaded
            setMfcBatchDataVisible(prev => new Set(prev).add(formulaId));

            if (!mfcBatchData[formulaId]) {
                // Fetch batch data for this formula
                setMfcBatchDataLoading(prev => new Set(prev).add(formulaId));

                try {
                    const productCodes = getFormulaAllProductCodes(formula);
                    const validCodes = productCodes.filter(code => code && code !== 'N/A');

                    if (validCodes.length > 0) {
                        const response = await fetch('/api/batch/by-codes', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({ productCodes: validCodes }),
                        });
                        const data = await response.json();

                        if (data.success && data.data && data.data.length > 0) {
                            setMfcBatchData(prev => ({
                                ...prev,
                                [formulaId]: data.data
                            }));
                        }
                    }
                } catch (error) {
                    console.error('Error fetching batch data for MFC:', error);
                } finally {
                    setMfcBatchDataLoading(prev => {
                        const next = new Set(prev);
                        next.delete(formulaId);
                        return next;
                    });
                }
            }
        }
    };

    const isMfcBatchDataVisible = (formulaId: string) => {
        return mfcBatchDataVisible.has(formulaId);
    };

    const isMfcBatchDataLoading = (formulaId: string) => {
        return mfcBatchDataLoading.has(formulaId);
    };

    const fetchFormulas = useCallback(async () => {
        setIsLoading(true);
        try {
            const response = await fetch('/api/formula?page=1&limit=1000');
            const data: FormulaListResponse = await response.json();
            if (data.success) {
                setFormulas(data.data);
                if (data.batchCounts) setBatchCounts(data.batchCounts);
                if (data.unmatchedBatches) setUnmatchedBatches(data.unmatchedBatches);
                // Set global RM matching data for capsule indicator
                if (data.globalRmDataMatched !== undefined) setGlobalRmDataMatched(data.globalRmDataMatched);
                if (data.globalRmDataUnmatched !== undefined) setGlobalRmDataUnmatched(data.globalRmDataUnmatched);
                // Set global PPM and PM matching data
                if (data.globalPpmDataMatched !== undefined) setGlobalPpmDataMatched(data.globalPpmDataMatched);
                if (data.globalPpmDataUnmatched !== undefined) setGlobalPpmDataUnmatched(data.globalPpmDataUnmatched);
                if (data.globalPmDataMatched !== undefined) setGlobalPmDataMatched(data.globalPmDataMatched);
                if (data.globalPmDataUnmatched !== undefined) setGlobalPmDataUnmatched(data.globalPmDataUnmatched);
                // Store batch numbers with RM data for per-section RM calculation
                if (data.rmBatchNumbersList) setRmBatchNumbers(new Set(data.rmBatchNumbersList));
                // Store batch numbers with PPM and PM data for per-section capsule calculation
                if (data.ppmBatchNumbersList) setPpmBatchNumbers(new Set(data.ppmBatchNumbersList));
                if (data.pmBatchNumbersList) setPmBatchNumbers(new Set(data.pmBatchNumbersList));
                // Store batch numbers that are material-qualified for per-section MAT calculation
                if (data.materialQualifiedBatchNumbersList) setMaterialQualifiedBatchNumbers(new Set(data.materialQualifiedBatchNumbersList));
                // Set global Material Qualification data for capsule indicator
                if (data.globalMaterialQualified !== undefined) setGlobalMaterialQualified(data.globalMaterialQualified);
                if (data.globalMaterialUnqualified !== undefined) setGlobalMaterialUnqualified(data.globalMaterialUnqualified);
                // Set global PM COA data for capsule indicator
                if (data.globalPmCoaQualified !== undefined) setGlobalPmCoaQualified(data.globalPmCoaQualified);
                if (data.globalPmCoaUnqualified !== undefined) setGlobalPmCoaUnqualified(data.globalPmCoaUnqualified);
                // Set global PPM COA data for capsule indicator
                if (data.globalPpmCoaQualified !== undefined) setGlobalPpmCoaQualified(data.globalPpmCoaQualified);
                if (data.globalPpmCoaUnqualified !== undefined) setGlobalPpmCoaUnqualified(data.globalPpmCoaUnqualified);
                // Set global Bulk COA data for capsule indicator
                if (data.globalBulkCoaQualified !== undefined) setGlobalBulkCoaQualified(data.globalBulkCoaQualified);
                if (data.globalBulkCoaUnqualified !== undefined) setGlobalBulkCoaUnqualified(data.globalBulkCoaUnqualified);
            }
        } catch (error) {
            console.error('Error fetching formulas:', error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    // Fetch batch reconciliation summary
    // Fetch all batches for batch section
    const fetchAllBatches = useCallback(async () => {
        setIsBatchesLoading(true);
        try {
            const response = await fetch('/api/batch?page=1&limit=10000');
            const data = await response.json();
            if (data.success && data.data) {
                const items: any[] = [];
                data.data.forEach((record: any) => {
                    record.batches.forEach((batch: any) => {
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
            setIsBatchesLoading(false);
        }
    }, []);

    const fetchBatchReconciliation = useCallback(async () => {
        try {
            const response = await fetch('/api/reconciliation');
            const data = await response.json();
            if (data.success && data.data?.batchReconciliation) {
                setBatchReconciliation(data.data.batchReconciliation);
            }
        } catch (error) {
            console.error('Error fetching batch reconciliation:', error);
        }
    }, []);

    useEffect(() => {
        fetchFormulas();
        fetchBatchReconciliation();
        fetchAllBatches();
    }, [fetchFormulas, fetchBatchReconciliation, fetchAllBatches]);

    // Toggle batch section and scroll to it
    const toggleBatchSection = (viewMode: 'unique' | 'all' = 'unique') => {
        if (showBatchSection && batchViewMode === viewMode) {
            setShowBatchSection(false);
        } else {
            setShowBatchSection(true);
            setBatchViewMode(viewMode);
            setTimeout(() => {
                batchSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 100);
        }
    };

    // Open RM Data Modal - fetch and display RM requisition data
    // Green (matched): Show RM materials from requisition (filtered by MFC-linked batches)
    // Red (unmatched): Show batches that are missing RM requisition data (filtered by MFC-linked batches)
    const openRmDataModal = useCallback(async (type: 'matched' | 'unmatched') => {
        setShowRmDataModal(true);
        setRmModalType(type);
        setIsRmModalLoading(true);
        setRmModalError(null);
        setRmModalData([]);

        try {
            // Get the set of product codes that are linked to MFCs (from Formula Master)
            // These are the keys in batchCounts that have counts > 0
            const mfcLinkedProductCodes = new Set<string>(Object.keys(batchCounts));

            if (type === 'matched') {
                // Green: Fetch RM materials from requisition API
                // Then filter to only show materials for batches linked to MFCs
                const response = await fetch('/api/requisition/materials?type=RM&pageSize=100000');
                const data = await response.json();

                if (data.success && data.materials) {
                    // We need to get the itemCode for each batch to filter by MFC linkage
                    // First fetch batch data to map batchNumber -> itemCode
                    const batchResponse = await fetch('/api/batch?page=1&limit=10000');
                    const batchData = await batchResponse.json();

                    // Build a map of batchNumber -> itemCode
                    const batchToItemCode: Record<string, string> = {};
                    if (batchData.success && batchData.data) {
                        batchData.data.forEach((record: any) => {
                            record.batches?.forEach((batch: any) => {
                                if (batch.batchNumber && batch.itemCode) {
                                    batchToItemCode[batch.batchNumber] = batch.itemCode;
                                }
                            });
                        });
                    }

                    // Filter materials to only those whose batch is linked to an MFC product code
                    const filteredMaterials = data.materials.filter((m: any) => {
                        const itemCode = batchToItemCode[m.batchNumber];
                        return itemCode && mfcLinkedProductCodes.has(itemCode);
                    });

                    setRmModalData(filteredMaterials);
                } else {
                    setRmModalError(data.message || 'Failed to fetch RM materials');
                }
            } else {
                // Red (unmatched): Fetch batches that are missing RM requisition data
                // Only include batches that are linked to MFCs
                const batchResponse = await fetch('/api/batch?page=1&limit=10000');
                const batchData = await batchResponse.json();

                // Get all batch numbers that have RM requisition data
                const rmResponse = await fetch('/api/requisition/materials?type=RM&pageSize=100000');
                const rmData = await rmResponse.json();

                if (batchData.success && batchData.data) {
                    // Get set of batch numbers that have RM data
                    const batchesWithRm = new Set<string>();
                    if (rmData.success && rmData.materials) {
                        rmData.materials.forEach((m: any) => {
                            if (m.batchNumber) batchesWithRm.add(m.batchNumber);
                        });
                    }

                    // Find batches that:
                    // 1. Are linked to an MFC (itemCode is in batchCounts)
                    // 2. DON'T have RM requisition data
                    const unmatchedBatches: any[] = [];
                    batchData.data.forEach((record: any) => {
                        record.batches?.forEach((batch: any) => {
                            // Only include if linked to an MFC
                            if (batch.itemCode && mfcLinkedProductCodes.has(batch.itemCode)) {
                                if (!batchesWithRm.has(batch.batchNumber)) {
                                    unmatchedBatches.push({
                                        batchNumber: batch.batchNumber,
                                        itemCode: batch.itemCode,
                                        itemName: batch.itemName,
                                        mfgDate: batch.mfgDate,
                                        expiryDate: batch.expiryDate,
                                        batchSize: batch.batchSize,
                                        department: batch.department,
                                        make: record.companyName || batch.make,
                                    });
                                }
                            }
                        });
                    });

                    setRmModalData(unmatchedBatches);
                } else {
                    setRmModalError('Failed to fetch batch data');
                }
            }
        } catch (error) {
            console.error('Error fetching RM data:', error);
            setRmModalError('Failed to fetch data');
        } finally {
            setIsRmModalLoading(false);
        }
    }, [batchCounts]);

    const closeRmDataModal = useCallback(() => {
        setShowRmDataModal(false);
        setRmModalData([]);
        setRmModalError(null);
        setExpandedRmBatches(new Set());
    }, []);

    // Toggle expanded state for a batch group in RM modal
    const toggleRmBatchExpand = (batchNumber: string) => {
        setExpandedRmBatches(prev => {
            const next = new Set(prev);
            if (next.has(batchNumber)) {
                next.delete(batchNumber);
            } else {
                next.add(batchNumber);
            }
            return next;
        });
    };

    // Toggle expanded state for a batch group in PPM modal
    const togglePpmBatchExpand = (batchNumber: string) => {
        setExpandedPpmBatches(prev => {
            const next = new Set(prev);
            if (next.has(batchNumber)) {
                next.delete(batchNumber);
            } else {
                next.add(batchNumber);
            }
            return next;
        });
    };

    // Toggle expanded state for a batch group in PM modal
    const togglePmBatchExpand = (batchNumber: string) => {
        setExpandedPmBatches(prev => {
            const next = new Set(prev);
            if (next.has(batchNumber)) {
                next.delete(batchNumber);
            } else {
                next.add(batchNumber);
            }
            return next;
        });
    };

    // Open PPM Data Modal - fetch and display PPM requisition data
    const openPpmDataModal = useCallback(async (type: 'matched' | 'unmatched') => {
        setShowPpmDataModal(true);
        setPpmModalType(type);
        setIsPpmModalLoading(true);
        setPpmModalError(null);
        setPpmModalData([]);

        try {
            const mfcLinkedProductCodes = new Set<string>(Object.keys(batchCounts));

            if (type === 'matched') {
                // Green: Fetch PPM materials from requisition API
                const response = await fetch('/api/requisition/materials?type=PPM&pageSize=100000');
                const data = await response.json();

                if (data.success && data.materials) {
                    const batchResponse = await fetch('/api/batch?page=1&limit=10000');
                    const batchData = await batchResponse.json();

                    const batchToItemCode: Record<string, string> = {};
                    if (batchData.success && batchData.data) {
                        batchData.data.forEach((record: any) => {
                            record.batches?.forEach((batch: any) => {
                                if (batch.batchNumber && batch.itemCode) {
                                    batchToItemCode[batch.batchNumber] = batch.itemCode;
                                }
                            });
                        });
                    }

                    const filteredMaterials = data.materials.filter((m: any) => {
                        const itemCode = batchToItemCode[m.batchNumber];
                        return itemCode && mfcLinkedProductCodes.has(itemCode);
                    });

                    setPpmModalData(filteredMaterials);
                } else {
                    setPpmModalError(data.message || 'Failed to fetch PPM materials');
                }
            } else {
                // Red (unmatched): Show batches missing PPM requisition data
                const batchResponse = await fetch('/api/batch?page=1&limit=10000');
                const batchData = await batchResponse.json();

                const ppmResponse = await fetch('/api/requisition/materials?type=PPM&pageSize=100000');
                const ppmData = await ppmResponse.json();

                if (batchData.success && batchData.data) {
                    const batchesWithPpm = new Set<string>();
                    if (ppmData.success && ppmData.materials) {
                        ppmData.materials.forEach((m: any) => {
                            if (m.batchNumber) batchesWithPpm.add(m.batchNumber);
                        });
                    }

                    const unmatchedBatches: any[] = [];
                    batchData.data.forEach((record: any) => {
                        record.batches?.forEach((batch: any) => {
                            if (batch.itemCode && mfcLinkedProductCodes.has(batch.itemCode)) {
                                if (!batchesWithPpm.has(batch.batchNumber)) {
                                    unmatchedBatches.push({
                                        batchNumber: batch.batchNumber,
                                        itemCode: batch.itemCode,
                                        itemName: batch.itemName,
                                        mfgDate: batch.mfgDate,
                                        expiryDate: batch.expiryDate,
                                        batchSize: batch.batchSize,
                                        department: batch.department,
                                        make: record.companyName || batch.make,
                                    });
                                }
                            }
                        });
                    });

                    setPpmModalData(unmatchedBatches);
                } else {
                    setPpmModalError('Failed to fetch batch data');
                }
            }
        } catch (error) {
            console.error('Error fetching PPM data:', error);
            setPpmModalError('Failed to fetch data');
        } finally {
            setIsPpmModalLoading(false);
        }
    }, [batchCounts]);

    const closePpmDataModal = useCallback(() => {
        setShowPpmDataModal(false);
        setPpmModalData([]);
        setPpmModalError(null);
    }, []);

    // Open PM Data Modal - fetch and display PM requisition data
    const openPmDataModal = useCallback(async (type: 'matched' | 'unmatched') => {
        setShowPmDataModal(true);
        setPmModalType(type);
        setIsPmModalLoading(true);
        setPmModalError(null);
        setPmModalData([]);

        try {
            const mfcLinkedProductCodes = new Set<string>(Object.keys(batchCounts));

            if (type === 'matched') {
                // Green: Fetch PM materials from requisition API
                const response = await fetch('/api/requisition/materials?type=PM&pageSize=100000');
                const data = await response.json();

                if (data.success && data.materials) {
                    const batchResponse = await fetch('/api/batch?page=1&limit=10000');
                    const batchData = await batchResponse.json();

                    const batchToItemCode: Record<string, string> = {};
                    if (batchData.success && batchData.data) {
                        batchData.data.forEach((record: any) => {
                            record.batches?.forEach((batch: any) => {
                                if (batch.batchNumber && batch.itemCode) {
                                    batchToItemCode[batch.batchNumber] = batch.itemCode;
                                }
                            });
                        });
                    }

                    const filteredMaterials = data.materials.filter((m: any) => {
                        const itemCode = batchToItemCode[m.batchNumber];
                        return itemCode && mfcLinkedProductCodes.has(itemCode);
                    });

                    setPmModalData(filteredMaterials);
                } else {
                    setPmModalError(data.message || 'Failed to fetch PM materials');
                }
            } else {
                // Red (unmatched): Show batches missing PM requisition data
                const batchResponse = await fetch('/api/batch?page=1&limit=10000');
                const batchData = await batchResponse.json();

                const pmResponse = await fetch('/api/requisition/materials?type=PM&pageSize=100000');
                const pmData = await pmResponse.json();

                if (batchData.success && batchData.data) {
                    const batchesWithPm = new Set<string>();
                    if (pmData.success && pmData.materials) {
                        pmData.materials.forEach((m: any) => {
                            if (m.batchNumber) batchesWithPm.add(m.batchNumber);
                        });
                    }

                    const unmatchedBatches: any[] = [];
                    batchData.data.forEach((record: any) => {
                        record.batches?.forEach((batch: any) => {
                            if (batch.itemCode && mfcLinkedProductCodes.has(batch.itemCode)) {
                                if (!batchesWithPm.has(batch.batchNumber)) {
                                    unmatchedBatches.push({
                                        batchNumber: batch.batchNumber,
                                        itemCode: batch.itemCode,
                                        itemName: batch.itemName,
                                        mfgDate: batch.mfgDate,
                                        expiryDate: batch.expiryDate,
                                        batchSize: batch.batchSize,
                                        department: batch.department,
                                        make: record.companyName || batch.make,
                                    });
                                }
                            }
                        });
                    });

                    setPmModalData(unmatchedBatches);
                } else {
                    setPmModalError('Failed to fetch batch data');
                }
            }
        } catch (error) {
            console.error('Error fetching PM data:', error);
            setPmModalError('Failed to fetch data');
        } finally {
            setIsPmModalLoading(false);
        }
    }, [batchCounts]);

    const closePmDataModal = useCallback(() => {
        setShowPmDataModal(false);
        setPmModalData([]);
        setPmModalError(null);
    }, []);

    // Open Material Qualification Modal - show materials with/without RM COA data
    const openMatDataModal = useCallback(async (type: 'qualified' | 'unqualified') => {
        setShowMatDataModal(true);
        setMatModalType(type);
        setIsMatModalLoading(true);
        setMatModalError(null);
        setMatModalData([]);
        setExpandedMatArNumbers(new Set());

        try {
            if (type === 'qualified') {
                // Qualified: Show materials that HAVE RM COA data
                const rmCoaResponse = await fetch('/api/rmcoa');
                const rmCoaData = await rmCoaResponse.json();

                if (rmCoaData.success) {
                    // Transform to display format with AR numbers prominently
                    const materials = rmCoaData.data.map((coa: any) => ({
                        arNo: coa.arNo,
                        materialCode: coa.materialCode,
                        materialName: coa.materialName,
                        testDate: coa.testDate || 'N/A',
                        status: coa.status || 'N/A',
                        sourceFile: coa.sourceFile,
                    }));
                    setMatModalData(materials);
                } else {
                    setMatModalError(rmCoaData.message || 'Failed to fetch RM COA data');
                }
            } else {
                // Unqualified: Show formula materials that DON'T have RM COA data
                // First get all RM COA material codes
                const rmCoaResponse = await fetch('/api/rmcoa');
                const rmCoaData = await rmCoaResponse.json();
                const rmCoaMaterialCodes = new Set<string>(
                    rmCoaData.success ? rmCoaData.data.map((c: any) => c.materialCode) : []
                );

                // Get all unique materials from formulas
                const materialsWithoutCoa: any[] = [];
                formulas.forEach(formula => {
                    // Main materials
                    formula.materials?.forEach((m: any) => {
                        if (m.materialCode && m.materialCode !== 'N/A' && !rmCoaMaterialCodes.has(m.materialCode)) {
                            materialsWithoutCoa.push({
                                arNo: 'Missing RM COA',
                                materialCode: m.materialCode,
                                materialName: m.materialName || 'Unknown',
                                formulaMfc: formula.masterFormulaDetails?.masterCardNo || 'N/A',
                                formulaName: formula.masterFormulaDetails?.productName || 'N/A',
                                status: 'Missing',
                            });
                        }
                    });

                    // Process materials
                    formula.processes?.forEach((p: any) => {
                        p.materials?.forEach((m: any) => {
                            if (m.materialCode && m.materialCode !== 'N/A' && !rmCoaMaterialCodes.has(m.materialCode)) {
                                materialsWithoutCoa.push({
                                    arNo: 'Missing RM COA',
                                    materialCode: m.materialCode,
                                    materialName: m.materialName || 'Unknown',
                                    formulaMfc: formula.masterFormulaDetails?.masterCardNo || 'N/A',
                                    formulaName: formula.masterFormulaDetails?.productName || 'N/A',
                                    status: 'Missing',
                                });
                            }
                        });
                        p.fillingProducts?.forEach((fp: any) => {
                            fp.materials?.forEach((m: any) => {
                                if (m.materialCode && m.materialCode !== 'N/A' && !rmCoaMaterialCodes.has(m.materialCode)) {
                                    materialsWithoutCoa.push({
                                        arNo: 'Missing RM COA',
                                        materialCode: m.materialCode,
                                        materialName: m.materialName || 'Unknown',
                                        formulaMfc: formula.masterFormulaDetails?.masterCardNo || 'N/A',
                                        formulaName: formula.masterFormulaDetails?.productName || 'N/A',
                                        status: 'Missing',
                                    });
                                }
                            });
                        });
                    });
                });

                // Deduplicate by material code
                const uniqueMaterials = Object.values(
                    materialsWithoutCoa.reduce((acc: any, m: any) => {
                        if (!acc[m.materialCode]) {
                            acc[m.materialCode] = m;
                        }
                        return acc;
                    }, {})
                );

                setMatModalData(uniqueMaterials);
            }
        } catch (error) {
            console.error('Error fetching material qualification data:', error);
            setMatModalError('Failed to fetch data');
        } finally {
            setIsMatModalLoading(false);
        }
    }, [formulas]);

    const closeMatDataModal = useCallback(() => {
        setShowMatDataModal(false);
        setMatModalData([]);
        setMatModalError(null);
        setExpandedMatArNumbers(new Set());
    }, []);

    // Bulk COA Modal - Open modal to show AR numbers for matched batches or missing batches for unmatched
    const openBulkCoaModal = useCallback(async (type: 'matched' | 'unmatched') => {
        setShowBulkCoaModal(true);
        setBulkCoaModalType(type);
        setIsBulkCoaModalLoading(true);
        setBulkCoaModalError(null);
        setBulkCoaModalData([]);
        setExpandedBulkCoaBatches(new Set());

        try {
            // Fetch Bulk COA data (stage=BULK)
            const bulkCoaResponse = await fetch('/api/coa?stage=BULK');
            const bulkCoaResult = await bulkCoaResponse.json();

            if (!bulkCoaResult.success) {
                throw new Error(bulkCoaResult.message || 'Failed to fetch Bulk COA data');
            }

            const bulkCoaRecords = bulkCoaResult.data || [];
            const bulkCoaBatchSet = new Set<string>(
                bulkCoaRecords.map((coa: any) => coa.batchNumber)
            );

            if (type === 'matched') {
                // Show Bulk COA records with AR numbers
                const matchedData = bulkCoaRecords.map((coa: any) => ({
                    arNumber: coa.bulkData?.arNumber || coa.arNo || 'N/A',
                    batchNumber: coa.batchNumber,
                    productCode: coa.bulkData?.productCode || coa.productCode || 'N/A',
                    productName: coa.bulkData?.productName || coa.productName || 'N/A',
                    testDate: coa.bulkData?.testDate || 'N/A',
                    status: coa.bulkData?.status || coa.status || 'N/A',
                    manufacturer: coa.bulkData?.manufacturer || coa.manufacturer || 'N/A',
                }));
                setBulkCoaModalData(matchedData);
            } else {
                // Show batches that DON'T have Bulk COA data
                // Get unique batches from allBatches
                const uniqueBatchMap = new Map<string, any>();
                allBatches.forEach(batch => {
                    if (batch.batchNumber && !uniqueBatchMap.has(batch.batchNumber)) {
                        uniqueBatchMap.set(batch.batchNumber, batch);
                    }
                });

                // Filter batches without Bulk COA
                const unmatchedData: any[] = [];
                uniqueBatchMap.forEach((batch, batchNumber) => {
                    if (!bulkCoaBatchSet.has(batchNumber)) {
                        unmatchedData.push({
                            batchNumber: batchNumber,
                            itemCode: batch.itemCode || 'N/A',
                            itemName: batch.itemName || 'N/A',
                            mfgDate: batch.mfgDate || 'N/A',
                            expiryDate: batch.expiryDate || 'N/A',
                            department: batch.department || 'N/A',
                            arNumber: 'Missing Bulk COA',
                        });
                    }
                });
                setBulkCoaModalData(unmatchedData);
            }
        } catch (error) {
            console.error('Error fetching Bulk COA data:', error);
            setBulkCoaModalError(error instanceof Error ? error.message : 'Failed to fetch data');
        } finally {
            setIsBulkCoaModalLoading(false);
        }
    }, [allBatches]);

    const closeBulkCoaModal = useCallback(() => {
        setShowBulkCoaModal(false);
        setBulkCoaModalData([]);
        setBulkCoaModalError(null);
        setExpandedBulkCoaBatches(new Set());
    }, []);


    // Per-Formula RM Modal - Opens modal showing RM data for a specific MFC
    const openPerFormulaRmModal = useCallback(async (
        mfcNo: string,
        productCodes: string[], // Array of all product codes for this formula
        formulaName: string,
        type: 'matched' | 'unmatched'
    ) => {
        setPerFormulaRmModalOpen(true);
        setPerFormulaRmMfc(mfcNo);
        setPerFormulaRmType(type);
        setPerFormulaRmFormulaName(formulaName);
        setPerFormulaRmLoading(true);
        setPerFormulaRmError(null);
        setPerFormulaRmData([]);

        // Create a Set of product codes for efficient lookup
        const productCodeSet = new Set(productCodes.filter(pc => pc && pc !== 'N/A'));

        try {
            if (type === 'matched') {
                // Fetch RM materials and filter by batches with any of these product codes
                const response = await fetch('/api/requisition/materials?type=RM&pageSize=100000');
                const data = await response.json();

                if (data.success && data.materials) {
                    // Get batch data to map batchNumber -> itemCode
                    const batchResponse = await fetch('/api/batch?page=1&limit=10000');
                    const batchData = await batchResponse.json();

                    const batchToItemCode: Record<string, string> = {};
                    if (batchData.success && batchData.data) {
                        batchData.data.forEach((record: any) => {
                            record.batches?.forEach((batch: any) => {
                                if (batch.batchNumber && batch.itemCode) {
                                    batchToItemCode[batch.batchNumber] = batch.itemCode;
                                }
                            });
                        });
                    }

                    // Filter materials to only those whose batch has one of the product codes
                    const filteredMaterials = data.materials.filter((m: any) => {
                        const itemCode = batchToItemCode[m.batchNumber];
                        return itemCode && productCodeSet.has(itemCode);
                    });

                    setPerFormulaRmData(filteredMaterials);
                } else {
                    setPerFormulaRmError(data.message || 'Failed to fetch RM materials');
                }
            } else {
                // Unmatched: Fetch batches with this product code that don't have RM data
                const batchResponse = await fetch('/api/batch?page=1&limit=10000');
                const batchData = await batchResponse.json();

                const rmResponse = await fetch('/api/requisition/materials?type=RM&pageSize=100000');
                const rmData = await rmResponse.json();

                if (batchData.success && batchData.data) {
                    const batchesWithRm = new Set<string>();
                    if (rmData.success && rmData.materials) {
                        rmData.materials.forEach((m: any) => {
                            if (m.batchNumber) batchesWithRm.add(m.batchNumber);
                        });
                    }

                    const unmatchedBatches: any[] = [];
                    batchData.data.forEach((record: any) => {
                        record.batches?.forEach((batch: any) => {
                            // Only include if this batch has one of the formula's product codes
                            if (batch.itemCode && productCodeSet.has(batch.itemCode)) {
                                if (!batchesWithRm.has(batch.batchNumber)) {
                                    unmatchedBatches.push({
                                        batchNumber: batch.batchNumber,
                                        itemCode: batch.itemCode,
                                        itemName: batch.itemName,
                                        mfgDate: batch.mfgDate,
                                        expiryDate: batch.expiryDate,
                                        batchSize: batch.batchSize,
                                        department: batch.department,
                                        make: record.companyName || batch.make,
                                    });
                                }
                            }
                        });
                    });

                    setPerFormulaRmData(unmatchedBatches);
                } else {
                    setPerFormulaRmError('Failed to fetch batch data');
                }
            }
        } catch (error) {
            console.error('Error fetching per-formula RM data:', error);
            setPerFormulaRmError('Failed to fetch data');
        } finally {
            setPerFormulaRmLoading(false);
        }
    }, []);

    const closePerFormulaRmModal = useCallback(() => {
        setPerFormulaRmModalOpen(false);
        setPerFormulaRmData([]);
        setPerFormulaRmError(null);
        setPerFormulaRmMfc(null);
    }, []);

    // Per-Formula PPM Modal - Opens modal showing PPM data for a specific MFC
    const openPerFormulaPpmModal = useCallback(async (
        mfcNo: string,
        productCodes: string[],
        formulaName: string,
        type: 'matched' | 'unmatched'
    ) => {
        setPerFormulaPpmModalOpen(true);
        setPerFormulaPpmMfc(mfcNo);
        setPerFormulaPpmType(type);
        setPerFormulaPpmFormulaName(formulaName);
        setPerFormulaPpmLoading(true);
        setPerFormulaPpmError(null);
        setPerFormulaPpmData([]);

        const productCodeSet = new Set(productCodes.filter(pc => pc && pc !== 'N/A'));

        try {
            if (type === 'matched') {
                // Fetch PPM materials and filter by batches with any of these product codes
                const response = await fetch('/api/requisition/materials?type=PPM&pageSize=100000');
                const data = await response.json();

                if (data.success && data.materials) {
                    const batchResponse = await fetch('/api/batch?page=1&limit=10000');
                    const batchData = await batchResponse.json();

                    const batchToItemCode: Record<string, string> = {};
                    if (batchData.success && batchData.data) {
                        batchData.data.forEach((record: any) => {
                            record.batches?.forEach((batch: any) => {
                                if (batch.batchNumber && batch.itemCode) {
                                    batchToItemCode[batch.batchNumber] = batch.itemCode;
                                }
                            });
                        });
                    }

                    const filteredMaterials = data.materials.filter((m: any) => {
                        const itemCode = batchToItemCode[m.batchNumber];
                        return itemCode && productCodeSet.has(itemCode);
                    });

                    setPerFormulaPpmData(filteredMaterials);
                } else {
                    setPerFormulaPpmError(data.message || 'Failed to fetch PPM materials');
                }
            } else {
                // Unmatched: Fetch batches with this product code that don't have PPM data
                const batchResponse = await fetch('/api/batch?page=1&limit=10000');
                const batchData = await batchResponse.json();

                const ppmResponse = await fetch('/api/requisition/materials?type=PPM&pageSize=100000');
                const ppmData = await ppmResponse.json();

                if (batchData.success && batchData.data) {
                    const batchesWithPpm = new Set<string>();
                    if (ppmData.success && ppmData.materials) {
                        ppmData.materials.forEach((m: any) => {
                            if (m.batchNumber) batchesWithPpm.add(m.batchNumber);
                        });
                    }

                    const unmatchedBatches: any[] = [];
                    batchData.data.forEach((record: any) => {
                        record.batches?.forEach((batch: any) => {
                            if (batch.itemCode && productCodeSet.has(batch.itemCode)) {
                                if (!batchesWithPpm.has(batch.batchNumber)) {
                                    unmatchedBatches.push({
                                        batchNumber: batch.batchNumber,
                                        itemCode: batch.itemCode,
                                        itemName: batch.itemName,
                                        mfgDate: batch.mfgDate,
                                        expiryDate: batch.expiryDate,
                                        batchSize: batch.batchSize,
                                        department: batch.department,
                                        make: record.companyName || batch.make,
                                    });
                                }
                            }
                        });
                    });

                    setPerFormulaPpmData(unmatchedBatches);
                } else {
                    setPerFormulaPpmError('Failed to fetch batch data');
                }
            }
        } catch (error) {
            console.error('Error fetching per-formula PPM data:', error);
            setPerFormulaPpmError('Failed to fetch data');
        } finally {
            setPerFormulaPpmLoading(false);
        }
    }, []);

    const closePerFormulaPpmModal = useCallback(() => {
        setPerFormulaPpmModalOpen(false);
        setPerFormulaPpmData([]);
        setPerFormulaPpmError(null);
        setPerFormulaPpmMfc(null);
    }, []);

    // Per-Formula PM Modal - Opens modal showing PM data for a specific MFC
    const openPerFormulaPmModal = useCallback(async (
        mfcNo: string,
        productCodes: string[],
        formulaName: string,
        type: 'matched' | 'unmatched'
    ) => {
        setPerFormulaPmModalOpen(true);
        setPerFormulaPmMfc(mfcNo);
        setPerFormulaPmType(type);
        setPerFormulaPmFormulaName(formulaName);
        setPerFormulaPmLoading(true);
        setPerFormulaPmError(null);
        setPerFormulaPmData([]);

        const productCodeSet = new Set(productCodes.filter(pc => pc && pc !== 'N/A'));

        try {
            if (type === 'matched') {
                // Fetch PM materials and filter by batches with any of these product codes
                const response = await fetch('/api/requisition/materials?type=PM&pageSize=100000');
                const data = await response.json();

                if (data.success && data.materials) {
                    const batchResponse = await fetch('/api/batch?page=1&limit=10000');
                    const batchData = await batchResponse.json();

                    const batchToItemCode: Record<string, string> = {};
                    if (batchData.success && batchData.data) {
                        batchData.data.forEach((record: any) => {
                            record.batches?.forEach((batch: any) => {
                                if (batch.batchNumber && batch.itemCode) {
                                    batchToItemCode[batch.batchNumber] = batch.itemCode;
                                }
                            });
                        });
                    }

                    const filteredMaterials = data.materials.filter((m: any) => {
                        const itemCode = batchToItemCode[m.batchNumber];
                        return itemCode && productCodeSet.has(itemCode);
                    });

                    setPerFormulaPmData(filteredMaterials);
                } else {
                    setPerFormulaPmError(data.message || 'Failed to fetch PM materials');
                }
            } else {
                // Unmatched: Fetch batches with this product code that don't have PM data
                const batchResponse = await fetch('/api/batch?page=1&limit=10000');
                const batchData = await batchResponse.json();

                const pmResponse = await fetch('/api/requisition/materials?type=PM&pageSize=100000');
                const pmData = await pmResponse.json();

                if (batchData.success && batchData.data) {
                    const batchesWithPm = new Set<string>();
                    if (pmData.success && pmData.materials) {
                        pmData.materials.forEach((m: any) => {
                            if (m.batchNumber) batchesWithPm.add(m.batchNumber);
                        });
                    }

                    const unmatchedBatches: any[] = [];
                    batchData.data.forEach((record: any) => {
                        record.batches?.forEach((batch: any) => {
                            if (batch.itemCode && productCodeSet.has(batch.itemCode)) {
                                if (!batchesWithPm.has(batch.batchNumber)) {
                                    unmatchedBatches.push({
                                        batchNumber: batch.batchNumber,
                                        itemCode: batch.itemCode,
                                        itemName: batch.itemName,
                                        mfgDate: batch.mfgDate,
                                        expiryDate: batch.expiryDate,
                                        batchSize: batch.batchSize,
                                        department: batch.department,
                                        make: record.companyName || batch.make,
                                    });
                                }
                            }
                        });
                    });

                    setPerFormulaPmData(unmatchedBatches);
                } else {
                    setPerFormulaPmError('Failed to fetch batch data');
                }
            }
        } catch (error) {
            console.error('Error fetching per-formula PM data:', error);
            setPerFormulaPmError('Failed to fetch data');
        } finally {
            setPerFormulaPmLoading(false);
        }
    }, []);

    const closePerFormulaPmModal = useCallback(() => {
        setPerFormulaPmModalOpen(false);
        setPerFormulaPmData([]);
        setPerFormulaPmError(null);
        setPerFormulaPmMfc(null);
    }, []);


    // Group formulas by manufacturer
    const manufacturerSummary = useMemo(() => {
        const summary: Record<string, { count: number; formulas: FormulaRecord[] }> = {};

        formulas.forEach(formula => {
            const manufacturer = formula.masterFormulaDetails?.manufacturer || 'Other';
            if (!summary[manufacturer]) {
                summary[manufacturer] = { count: 0, formulas: [] };
            }
            summary[manufacturer].count++;
            summary[manufacturer].formulas.push(formula);
        });

        return Object.entries(summary)
            .sort((a, b) => b[1].count - a[1].count)
            .map(([name, data]) => ({ name, ...data }));
    }, [formulas])

    // Batch Detail Modal Functions
    const openBatchModal = useCallback(async (batchNumber: string) => {
        setSelectedBatchNumber(batchNumber);
        setIsBatchModalLoading(true);
        setBatchModalError(null);
        setBatchDetails(null);

        try {
            const response = await fetch(`/api/batch/details/${encodeURIComponent(batchNumber)}`);
            const data = await response.json();

            if (data.success && data.data) {
                setBatchDetails(data.data);
            } else {
                setBatchModalError(data.message || 'Batch not found');
            }
        } catch (error) {
            console.error('Error fetching batch details:', error);
            setBatchModalError('Failed to fetch batch details');
        } finally {
            setIsBatchModalLoading(false);
        }
    }, []);

    const closeBatchModal = useCallback(() => {
        setSelectedBatchNumber(null);
        setBatchDetails(null);
        setBatchModalError(null);
    }, []);

    // Batch List Modal Functions
    const openBatchListModal = useCallback(async (productCodes: string[], productName: string) => {
        setSelectedProductCode(productCodes.join(', '));
        setSelectedProductName(productName);
        setIsBatchListLoading(true);
        setBatchListError(null);
        setBatchList(null);

        try {
            // Filter out invalid codes
            const validCodes = productCodes.filter(code => code && code !== 'N/A');

            if (validCodes.length === 0) {
                setBatchListError('No valid product codes found');
                return;
            }

            // Use by-codes API to get complete batch information for ALL product codes
            const response = await fetch('/api/batch/by-codes', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ productCodes: validCodes }),
            });
            const data = await response.json();

            if (data.success && data.data && data.data.length > 0) {
                setBatchList(data.data);
            } else {
                setBatchListError(data.message || `No batches found for codes: ${validCodes.join(', ')}`);
            }
        } catch (error) {
            console.error('Error fetching batch list:', error);
            setBatchListError('Failed to fetch batch list');
        } finally {
            setIsBatchListLoading(false);
        }
    }, []);

    const closeBatchListModal = useCallback(() => {
        setSelectedProductCode(null);
        setSelectedProductName(null);
        setBatchList(null);
        setBatchListError(null);
    }, []);

    // Helper function to get all product codes from a formula (for batch lookup)
    const getFormulaAllProductCodes = useCallback((formula: FormulaRecord): string[] => {
        const codes: string[] = [];

        // Add main product code
        const mainCode = formula.masterFormulaDetails?.productCode;
        if (mainCode && mainCode !== 'N/A') {
            codes.push(mainCode);
        }

        // Add filling details product codes
        if (formula.fillingDetails && Array.isArray(formula.fillingDetails)) {
            formula.fillingDetails.forEach((fd: any) => {
                const fdCode = fd.productCode;
                if (fdCode && fdCode !== 'N/A' && !codes.includes(fdCode)) {
                    codes.push(fdCode);
                }
            });
        }

        // Add process filling product codes
        if (formula.processes && Array.isArray(formula.processes)) {
            formula.processes.forEach((p: any) => {
                if (p.fillingProducts && Array.isArray(p.fillingProducts)) {
                    p.fillingProducts.forEach((fp: any) => {
                        const fpCode = fp.productCode;
                        if (fpCode && fpCode !== 'N/A' && !codes.includes(fpCode)) {
                            codes.push(fpCode);
                        }
                    });
                }
            });
        }

        return codes;
    }, []);

    // Filter formulas
    const filteredFormulas = useMemo(() => {
        let result = formulas;

        if (selectedManufacturer) {
            result = result.filter(f =>
                (f.masterFormulaDetails?.manufacturer || 'Other') === selectedManufacturer
            );
        }

        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            result = result.filter(f =>
                f.masterFormulaDetails.masterCardNo?.toLowerCase().includes(term) ||
                f.masterFormulaDetails.productCode?.toLowerCase().includes(term) ||
                f.masterFormulaDetails.productName?.toLowerCase().includes(term) ||
                f.masterFormulaDetails.genericName?.toLowerCase().includes(term)
            );
        }

        // Sort by MFC Number if enabled
        if (mfcSortOrder !== 'none') {
            result = [...result].sort((a, b) => {
                const mfcA = a.masterFormulaDetails?.masterCardNo || '';
                const mfcB = b.masterFormulaDetails?.masterCardNo || '';

                // Natural sort for MFC numbers (handles alphanumeric like MFC/ZAIIUCF09)
                const comparison = mfcA.localeCompare(mfcB, undefined, { numeric: true, sensitivity: 'base' });

                return mfcSortOrder === 'asc' ? comparison : -comparison;
            });
        }

        return result;
    }, [formulas, selectedManufacturer, searchTerm, mfcSortOrder]);

    // Separate formulas into categories with DEDUPLICATION by product code
    const { mainFormulas, lowBatchFormulas, noBatchFormulas, placeboFormulas, sectionBatchTotals } = useMemo(() => {
        const placebo: FormulaRecord[] = [];
        const lowBatch: FormulaRecord[] = [];
        const noBatch: FormulaRecord[] = [];
        const main: FormulaRecord[] = [];

        filteredFormulas.forEach(f => {
            const productName = f.masterFormulaDetails.productName?.toLowerCase() || '';
            // Include both 'placebo' and 'mediafill' in placebo section
            const isPlaceboOrMediafill = productName.includes('placebo') || productName.includes('mediafill') || productName.includes('media fill');
            const batchCount = f.totalBatchCount || 0;

            if (isPlaceboOrMediafill) {
                placebo.push(f);
            } else if (batchCount === 0) {
                // New category: MFCs with NO batches at all
                noBatch.push(f);
            } else if (batchCount < 3) {
                // Low batch: 1-2 batches
                lowBatch.push(f);
            } else {
                main.push(f);
            }
        });

        // Calculate total batches for each section - DEDUPLICATED by PRODUCT CODE
        // The key insight: batches are matched by product code (itemCode)
        // If the same product code appears in multiple formulas, we only count it ONCE

        // Track which product codes we've already counted (globally across all sections)
        const countedProductCodes = new Set<string>();

        // Helper function to get all product codes from a formula
        const getFormulaProductCodes = (f: FormulaRecord): string[] => {
            const codes: string[] = [];

            // Main product code
            const mainCode = f.masterFormulaDetails?.productCode;
            if (mainCode && mainCode !== 'N/A') codes.push(mainCode);

            // Filling details product codes
            if (f.fillingDetails && Array.isArray(f.fillingDetails)) {
                f.fillingDetails.forEach((fd: FillingDetail) => {
                    if (fd.productCode && fd.productCode !== 'N/A' && !codes.includes(fd.productCode)) {
                        codes.push(fd.productCode);
                    }
                });
            }

            // Process filling products
            if (f.processes && Array.isArray(f.processes)) {
                f.processes.forEach((p: ProcessData) => {
                    if (p.fillingProducts && Array.isArray(p.fillingProducts)) {
                        p.fillingProducts.forEach((fp: AsepticFillingProduct) => {
                            if (fp.productCode && !codes.includes(fp.productCode)) {
                                codes.push(fp.productCode);
                            }
                        });
                    }
                });
            }

            return codes;
        };

        let mainBatchTotal = 0;
        let lowBatchTotal = 0;
        let noBatchTotal = 0;
        let placeboBatchTotal = 0;

        // Calculate for main formulas (3+ batches)
        main.forEach(f => {
            const productCodes = getFormulaProductCodes(f);
            productCodes.forEach(code => {
                if (!countedProductCodes.has(code)) {
                    countedProductCodes.add(code);
                    mainBatchTotal += batchCounts[code] || 0;
                }
            });
        });

        // Calculate for low batch formulas (1-2 batches)
        lowBatch.forEach(f => {
            const productCodes = getFormulaProductCodes(f);
            productCodes.forEach(code => {
                if (!countedProductCodes.has(code)) {
                    countedProductCodes.add(code);
                    lowBatchTotal += batchCounts[code] || 0;
                }
            });
        });

        // No batch formulas always have 0
        noBatch.forEach(f => {
            const productCodes = getFormulaProductCodes(f);
            productCodes.forEach(code => {
                if (!countedProductCodes.has(code)) {
                    countedProductCodes.add(code);
                    noBatchTotal += batchCounts[code] || 0; // Should be 0
                }
            });
        });

        // Calculate for placebo formulas
        placebo.forEach(f => {
            const productCodes = getFormulaProductCodes(f);
            productCodes.forEach(code => {
                if (!countedProductCodes.has(code)) {
                    countedProductCodes.add(code);
                    placeboBatchTotal += batchCounts[code] || 0;
                }
            });
        });

        return {
            mainFormulas: main,
            lowBatchFormulas: lowBatch,
            noBatchFormulas: noBatch,
            placeboFormulas: placebo,
            sectionBatchTotals: {
                main: mainBatchTotal,
                lowBatch: lowBatchTotal,
                noBatch: noBatchTotal,
                placebo: placeboBatchTotal,
                // Total should now match actual batch count
                totalCounted: mainBatchTotal + lowBatchTotal + noBatchTotal + placeboBatchTotal
            }
        };
    }, [filteredFormulas, batchCounts]);

    // Calculate unique batch reconciliation - how unique batches are distributed across MFC categories
    const uniqueBatchReconciliation = useMemo(() => {
        if (!allBatches || allBatches.length === 0) {
            return null;
        }

        // Get unique batches by batch number
        const uniqueBatchMap = new Map<string, BatchItem>();
        allBatches.forEach(batch => {
            if (batch.batchNumber && !uniqueBatchMap.has(batch.batchNumber)) {
                uniqueBatchMap.set(batch.batchNumber, batch);
            }
        });

        const uniqueBatches = Array.from(uniqueBatchMap.values());
        const totalUniqueBatches = uniqueBatches.length;

        // Build a map of product codes to their MFC category
        const productCodeToCategory = new Map<string, 'main' | 'lowBatch' | 'noBatch' | 'placebo'>();

        // Helper to get all product codes from a formula
        const getFormulaProductCodes = (f: FormulaRecord): string[] => {
            const codes: string[] = [];
            const mainCode = f.masterFormulaDetails?.productCode;
            if (mainCode && mainCode !== 'N/A') codes.push(mainCode);
            if (f.fillingDetails && Array.isArray(f.fillingDetails)) {
                f.fillingDetails.forEach((fd: FillingDetail) => {
                    if (fd.productCode && fd.productCode !== 'N/A' && !codes.includes(fd.productCode)) {
                        codes.push(fd.productCode);
                    }
                });
            }
            if (f.processes && Array.isArray(f.processes)) {
                f.processes.forEach((p: ProcessData) => {
                    if (p.fillingProducts && Array.isArray(p.fillingProducts)) {
                        p.fillingProducts.forEach((fp: AsepticFillingProduct) => {
                            if (fp.productCode && !codes.includes(fp.productCode)) {
                                codes.push(fp.productCode);
                            }
                        });
                    }
                });
            }
            return codes;
        };

        // Map product codes to their category
        mainFormulas.forEach(f => {
            getFormulaProductCodes(f).forEach(code => {
                if (!productCodeToCategory.has(code)) {
                    productCodeToCategory.set(code, 'main');
                }
            });
        });
        lowBatchFormulas.forEach(f => {
            getFormulaProductCodes(f).forEach(code => {
                if (!productCodeToCategory.has(code)) {
                    productCodeToCategory.set(code, 'lowBatch');
                }
            });
        });
        noBatchFormulas.forEach(f => {
            getFormulaProductCodes(f).forEach(code => {
                if (!productCodeToCategory.has(code)) {
                    productCodeToCategory.set(code, 'noBatch');
                }
            });
        });
        placeboFormulas.forEach(f => {
            getFormulaProductCodes(f).forEach(code => {
                if (!productCodeToCategory.has(code)) {
                    productCodeToCategory.set(code, 'placebo');
                }
            });
        });

        // Count unique batches per category
        let mainUniqueBatches = 0;
        let lowBatchUniqueBatches = 0;
        let noBatchUniqueBatches = 0;
        let placeboUniqueBatches = 0;
        let unmatchedUniqueBatches = 0;

        uniqueBatches.forEach(batch => {
            const itemCode = batch.itemCode;
            if (!itemCode) {
                unmatchedUniqueBatches++;
                return;
            }

            const category = productCodeToCategory.get(itemCode);
            switch (category) {
                case 'main':
                    mainUniqueBatches++;
                    break;
                case 'lowBatch':
                    lowBatchUniqueBatches++;
                    break;
                case 'noBatch':
                    noBatchUniqueBatches++;
                    break;
                case 'placebo':
                    placeboUniqueBatches++;
                    break;
                default:
                    unmatchedUniqueBatches++;
            }
        });

        return {
            totalUniqueBatches,
            mainUniqueBatches,
            lowBatchUniqueBatches,
            noBatchUniqueBatches,
            placeboUniqueBatches,
            unmatchedUniqueBatches,
            // MFC counts for display
            mainMfcCount: mainFormulas.length,
            lowBatchMfcCount: lowBatchFormulas.length,
            noBatchMfcCount: noBatchFormulas.length,
            placeboMfcCount: placeboFormulas.length,
            // Calculated total for reconciliation check
            reconciledTotal: mainUniqueBatches + lowBatchUniqueBatches + noBatchUniqueBatches + placeboUniqueBatches,
            isReconciled: (mainUniqueBatches + lowBatchUniqueBatches + noBatchUniqueBatches + placeboUniqueBatches + unmatchedUniqueBatches) === totalUniqueBatches
        };
    }, [allBatches, mainFormulas, lowBatchFormulas, noBatchFormulas, placeboFormulas]);

    // Calculate per-section RM data based on UNIQUE batches per section
    // This matches the unique batch counts by checking which unique batches have RM data
    const sectionRmData = useMemo(() => {
        if (!allBatches || allBatches.length === 0 || rmBatchNumbers.size === 0) {
            return {
                main: { matched: 0, unmatched: 0 },
                lowBatch: { matched: 0, unmatched: 0 },
                noBatch: { matched: 0, unmatched: 0 },
                placebo: { matched: 0, unmatched: 0 },
            };
        }

        // Get unique batches by batch number
        const uniqueBatchMap = new Map<string, { batchNumber: string; itemCode?: string }>();
        allBatches.forEach(batch => {
            if (batch.batchNumber && !uniqueBatchMap.has(batch.batchNumber)) {
                uniqueBatchMap.set(batch.batchNumber, { batchNumber: batch.batchNumber, itemCode: batch.itemCode });
            }
        });

        const uniqueBatches = Array.from(uniqueBatchMap.values());

        // Build a map of product codes to their MFC category (same as uniqueBatchReconciliation)
        const productCodeToCategory = new Map<string, 'main' | 'lowBatch' | 'noBatch' | 'placebo'>();
        const getFormulaProductCodes = (f: FormulaRecord): string[] => {
            const codes: string[] = [];
            const mainCode = f.masterFormulaDetails?.productCode;
            if (mainCode && mainCode !== 'N/A') codes.push(mainCode);
            if (f.fillingDetails && Array.isArray(f.fillingDetails)) {
                f.fillingDetails.forEach((fd: FillingDetail) => {
                    if (fd.productCode && fd.productCode !== 'N/A' && !codes.includes(fd.productCode)) {
                        codes.push(fd.productCode);
                    }
                });
            }
            if (f.processes && Array.isArray(f.processes)) {
                f.processes.forEach((p: ProcessData) => {
                    if (p.fillingProducts && Array.isArray(p.fillingProducts)) {
                        p.fillingProducts.forEach((fp: AsepticFillingProduct) => {
                            if (fp.productCode && !codes.includes(fp.productCode)) {
                                codes.push(fp.productCode);
                            }
                        });
                    }
                });
            }
            return codes;
        };

        mainFormulas.forEach(f => {
            getFormulaProductCodes(f).forEach(code => {
                if (!productCodeToCategory.has(code)) productCodeToCategory.set(code, 'main');
            });
        });
        lowBatchFormulas.forEach(f => {
            getFormulaProductCodes(f).forEach(code => {
                if (!productCodeToCategory.has(code)) productCodeToCategory.set(code, 'lowBatch');
            });
        });
        noBatchFormulas.forEach(f => {
            getFormulaProductCodes(f).forEach(code => {
                if (!productCodeToCategory.has(code)) productCodeToCategory.set(code, 'noBatch');
            });
        });
        placeboFormulas.forEach(f => {
            getFormulaProductCodes(f).forEach(code => {
                if (!productCodeToCategory.has(code)) productCodeToCategory.set(code, 'placebo');
            });
        });

        // Count RM matched/unmatched per category
        const counts = {
            main: { matched: 0, unmatched: 0 },
            lowBatch: { matched: 0, unmatched: 0 },
            noBatch: { matched: 0, unmatched: 0 },
            placebo: { matched: 0, unmatched: 0 },
        };

        uniqueBatches.forEach(batch => {
            const itemCode = batch.itemCode;
            if (!itemCode) return;

            const category = productCodeToCategory.get(itemCode);
            if (!category) return;

            // Check if this batch has RM data
            const hasRmData = rmBatchNumbers.has(batch.batchNumber);
            if (hasRmData) {
                counts[category].matched++;
            } else {
                counts[category].unmatched++;
            }
        });

        return counts;
    }, [allBatches, rmBatchNumbers, mainFormulas, lowBatchFormulas, noBatchFormulas, placeboFormulas]);

    // Calculate per-section PPM and PM data based on TOTAL batches (not unique)
    // PPM and PM should each reconcile to total batch count (e.g., 1796 for main section)
    const sectionPpmPmData = useMemo(() => {
        if (!allBatches || allBatches.length === 0) {
            return {
                main: { ppmMatched: 0, ppmUnmatched: 0, pmMatched: 0, pmUnmatched: 0 },
                lowBatch: { ppmMatched: 0, ppmUnmatched: 0, pmMatched: 0, pmUnmatched: 0 },
                noBatch: { ppmMatched: 0, ppmUnmatched: 0, pmMatched: 0, pmUnmatched: 0 },
                placebo: { ppmMatched: 0, ppmUnmatched: 0, pmMatched: 0, pmUnmatched: 0 },
            };
        }

        // Build a map of product codes to their MFC category
        const productCodeToCategory = new Map<string, 'main' | 'lowBatch' | 'noBatch' | 'placebo'>();
        const getFormulaProductCodes = (f: FormulaRecord): string[] => {
            const codes: string[] = [];
            const mainCode = f.masterFormulaDetails?.productCode;
            if (mainCode && mainCode !== 'N/A') codes.push(mainCode);
            if (f.fillingDetails && Array.isArray(f.fillingDetails)) {
                f.fillingDetails.forEach((fd: FillingDetail) => {
                    if (fd.productCode && fd.productCode !== 'N/A' && !codes.includes(fd.productCode)) {
                        codes.push(fd.productCode);
                    }
                });
            }
            if (f.processes && Array.isArray(f.processes)) {
                f.processes.forEach((p: ProcessData) => {
                    if (p.fillingProducts && Array.isArray(p.fillingProducts)) {
                        p.fillingProducts.forEach((fp: AsepticFillingProduct) => {
                            if (fp.productCode && !codes.includes(fp.productCode)) {
                                codes.push(fp.productCode);
                            }
                        });
                    }
                });
            }
            return codes;
        };

        mainFormulas.forEach(f => {
            getFormulaProductCodes(f).forEach(code => {
                if (!productCodeToCategory.has(code)) productCodeToCategory.set(code, 'main');
            });
        });
        lowBatchFormulas.forEach(f => {
            getFormulaProductCodes(f).forEach(code => {
                if (!productCodeToCategory.has(code)) productCodeToCategory.set(code, 'lowBatch');
            });
        });
        noBatchFormulas.forEach(f => {
            getFormulaProductCodes(f).forEach(code => {
                if (!productCodeToCategory.has(code)) productCodeToCategory.set(code, 'noBatch');
            });
        });
        placeboFormulas.forEach(f => {
            getFormulaProductCodes(f).forEach(code => {
                if (!productCodeToCategory.has(code)) productCodeToCategory.set(code, 'placebo');
            });
        });

        // Count PPM and PM matched/unmatched per category based on TOTAL batches (all records)
        const counts = {
            main: { ppmMatched: 0, ppmUnmatched: 0, pmMatched: 0, pmUnmatched: 0 },
            lowBatch: { ppmMatched: 0, ppmUnmatched: 0, pmMatched: 0, pmUnmatched: 0 },
            noBatch: { ppmMatched: 0, ppmUnmatched: 0, pmMatched: 0, pmUnmatched: 0 },
            placebo: { ppmMatched: 0, ppmUnmatched: 0, pmMatched: 0, pmUnmatched: 0 },
        };

        // Iterate over ALL batches (total records) for PPM+PM to reconcile to total batch count
        allBatches.forEach(batch => {
            const itemCode = batch.itemCode;
            if (!itemCode) return;

            const category = productCodeToCategory.get(itemCode);
            if (!category) return;

            // Check if this batch has PPM data
            if (batch.batchNumber && ppmBatchNumbers.has(batch.batchNumber)) {
                counts[category].ppmMatched++;
            } else {
                counts[category].ppmUnmatched++;
            }

            // Check if this batch has PM data
            if (batch.batchNumber && pmBatchNumbers.has(batch.batchNumber)) {
                counts[category].pmMatched++;
            } else {
                counts[category].pmUnmatched++;
            }
        });

        return counts;
    }, [allBatches, ppmBatchNumbers, pmBatchNumbers, mainFormulas, lowBatchFormulas, noBatchFormulas, placeboFormulas]);

    const sectionMaterialQualData = useMemo(() => {
        // Only return zeros if there are no batches to analyze
        // (Don't check materialQualifiedBatchNumbers.size - we want to show unqualified even if 0 qualified)
        if (!allBatches || allBatches.length === 0) {
            return {
                main: { qualified: 0, unqualified: 0 },
                lowBatch: { qualified: 0, unqualified: 0 },
                noBatch: { qualified: 0, unqualified: 0 },
                placebo: { qualified: 0, unqualified: 0 },
            };
        }

        // Get unique batches by batch number
        const uniqueBatchMap = new Map<string, { batchNumber: string; itemCode?: string }>();
        allBatches.forEach(batch => {
            if (batch.batchNumber && !uniqueBatchMap.has(batch.batchNumber)) {
                uniqueBatchMap.set(batch.batchNumber, { batchNumber: batch.batchNumber, itemCode: batch.itemCode });
            }
        });

        const uniqueBatches = Array.from(uniqueBatchMap.values());

        // Build a map of product codes to their MFC category
        const productCodeToCategory = new Map<string, 'main' | 'lowBatch' | 'noBatch' | 'placebo'>();
        const getFormulaProductCodes = (f: FormulaRecord): string[] => {
            const codes: string[] = [];
            const mainCode = f.masterFormulaDetails?.productCode;
            if (mainCode && mainCode !== 'N/A') codes.push(mainCode);
            if (f.fillingDetails && Array.isArray(f.fillingDetails)) {
                f.fillingDetails.forEach((fd: FillingDetail) => {
                    if (fd.productCode && fd.productCode !== 'N/A' && !codes.includes(fd.productCode)) {
                        codes.push(fd.productCode);
                    }
                });
            }
            if (f.processes && Array.isArray(f.processes)) {
                f.processes.forEach((p: ProcessData) => {
                    if (p.fillingProducts && Array.isArray(p.fillingProducts)) {
                        p.fillingProducts.forEach((fp: AsepticFillingProduct) => {
                            if (fp.productCode && !codes.includes(fp.productCode)) {
                                codes.push(fp.productCode);
                            }
                        });
                    }
                });
            }
            return codes;
        };

        mainFormulas.forEach(f => {
            getFormulaProductCodes(f).forEach(code => {
                if (!productCodeToCategory.has(code)) productCodeToCategory.set(code, 'main');
            });
        });
        lowBatchFormulas.forEach(f => {
            getFormulaProductCodes(f).forEach(code => {
                if (!productCodeToCategory.has(code)) productCodeToCategory.set(code, 'lowBatch');
            });
        });
        noBatchFormulas.forEach(f => {
            getFormulaProductCodes(f).forEach(code => {
                if (!productCodeToCategory.has(code)) productCodeToCategory.set(code, 'noBatch');
            });
        });
        placeboFormulas.forEach(f => {
            getFormulaProductCodes(f).forEach(code => {
                if (!productCodeToCategory.has(code)) productCodeToCategory.set(code, 'placebo');
            });
        });

        // Count material qualified/unqualified per category
        const counts = {
            main: { qualified: 0, unqualified: 0 },
            lowBatch: { qualified: 0, unqualified: 0 },
            noBatch: { qualified: 0, unqualified: 0 },
            placebo: { qualified: 0, unqualified: 0 },
        };

        uniqueBatches.forEach(batch => {
            const itemCode = batch.itemCode;
            if (!itemCode) return;

            const category = productCodeToCategory.get(itemCode);
            if (!category) return;

            // Check if this batch is material-qualified
            const isQualified = materialQualifiedBatchNumbers.has(batch.batchNumber);
            if (isQualified) {
                counts[category].qualified++;
            } else {
                counts[category].unqualified++;
            }
        });

        return counts;
    }, [allBatches, materialQualifiedBatchNumbers, mainFormulas, lowBatchFormulas, noBatchFormulas, placeboFormulas]);

    // Calculate Bulk COA qualified/unqualified per section by summing per-formula values
    const sectionBulkCoaData = useMemo(() => {
        const sumBulkCoa = (formulas: FormulaRecord[]) => {
            let qualified = 0;
            let unqualified = 0;
            formulas.forEach((f: any) => {
                qualified += f.bulkCoaQualified || 0;
                unqualified += f.bulkCoaUnqualified || 0;
            });
            return { qualified, unqualified };
        };

        return {
            main: sumBulkCoa(mainFormulas),
            lowBatch: sumBulkCoa(lowBatchFormulas),
            noBatch: sumBulkCoa(noBatchFormulas),
            placebo: sumBulkCoa(placeboFormulas),
        };
    }, [mainFormulas, lowBatchFormulas, noBatchFormulas, placeboFormulas]);

    const toggleMfc = (mfcId: string) => {
        setExpandedMfc(expandedMfc === mfcId ? null : mfcId);
    };

    // Collapsible section header component with light colors
    const CollapsibleSectionHeader = ({
        title,
        count,
        totalBatches,
        uniqueBatches,
        icon,
        isOpen,
        onToggle,
        badgeColor,
        badgeText,
        description,
        rmDataMatched,
        rmDataUnmatched,
        onRmMatchedClick,
        onRmUnmatchedClick,
        ppmDataMatched,
        ppmDataUnmatched,
        pmDataMatched,
        pmDataUnmatched,
        onPpmMatchedClick,
        onPpmUnmatchedClick,
        onPmMatchedClick,
        onPmUnmatchedClick,
        materialQualified,
        materialUnqualified,
        onMaterialQualifiedClick,
        onMaterialUnqualifiedClick,
        pmCoaQualified,
        pmCoaUnqualified,
        onPmCoaQualifiedClick,
        onPmCoaUnqualifiedClick,
        ppmCoaQualified,
        ppmCoaUnqualified,
        onPpmCoaQualifiedClick,
        onPpmCoaUnqualifiedClick,
        bulkCoaQualified,
        bulkCoaUnqualified,
        onBulkCoaQualifiedClick,
        onBulkCoaUnqualifiedClick
    }: {
        title: string;
        count: number;
        totalBatches?: number;
        uniqueBatches?: number;
        icon: string;
        isOpen: boolean;
        onToggle: () => void;
        badgeColor: string;
        badgeText?: string;
        description?: string;
        rmDataMatched?: number;
        rmDataUnmatched?: number;
        onRmMatchedClick?: () => void;
        onRmUnmatchedClick?: () => void;
        ppmDataMatched?: number;
        ppmDataUnmatched?: number;
        pmDataMatched?: number;
        pmDataUnmatched?: number;
        onPpmMatchedClick?: () => void;
        onPpmUnmatchedClick?: () => void;
        onPmMatchedClick?: () => void;
        onPmUnmatchedClick?: () => void;
        materialQualified?: number;
        materialUnqualified?: number;
        onMaterialQualifiedClick?: () => void;
        onMaterialUnqualifiedClick?: () => void;
        pmCoaQualified?: number;
        pmCoaUnqualified?: number;
        onPmCoaQualifiedClick?: () => void;
        onPmCoaUnqualifiedClick?: () => void;
        ppmCoaQualified?: number;
        ppmCoaUnqualified?: number;
        onPpmCoaQualifiedClick?: () => void;
        onPpmCoaUnqualifiedClick?: () => void;
        bulkCoaQualified?: number;
        bulkCoaUnqualified?: number;
        onBulkCoaQualifiedClick?: () => void;
        onBulkCoaUnqualifiedClick?: () => void;
    }) => {
        // Convert dark badge colors to light background colors
        const getLightColors = (darkColor: string) => {
            switch (darkColor) {
                case '#dc2626': // red
                    return { bg: '#fef2f2', border: '#fecaca', text: '#dc2626', badgeBg: '#fee2e2' };
                case '#8b5cf6': // purple
                    return { bg: '#faf5ff', border: '#e9d5ff', text: '#7c3aed', badgeBg: '#f3e8ff' };
                case '#10b981': // green
                    return { bg: '#ecfdf5', border: '#a7f3d0', text: '#059669', badgeBg: '#d1fae5' };
                case '#f97316': // orange
                    return { bg: '#fff7ed', border: '#fed7aa', text: '#ea580c', badgeBg: '#ffedd5' };
                case '#f59e0b': // amber/yellow
                    return { bg: '#fffbeb', border: '#fde68a', text: '#d97706', badgeBg: '#fef3c7' };
                case '#6b7280': // gray
                    return { bg: '#f9fafb', border: '#e5e7eb', text: '#4b5563', badgeBg: '#f3f4f6' };
                default: // blue fallback
                    return { bg: '#eff6ff', border: '#bfdbfe', text: '#2563eb', badgeBg: '#dbeafe' };
            }
        };

        const colors = getLightColors(badgeColor);

        // Calculate if RM reconciliation matches unique batches
        const rmTotal = (rmDataMatched || 0) + (rmDataUnmatched || 0);
        const rmMatchesUnique = uniqueBatches !== undefined && rmTotal === uniqueBatches;

        return (
            <div
                onClick={onToggle}
                style={{
                    width: '100%',
                    padding: '1rem 1.5rem',
                    background: isOpen ? colors.bg : 'var(--card)',
                    border: `1px solid ${isOpen ? colors.border : 'var(--border)'}`,
                    borderRadius: 'var(--radius-lg)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1rem',
                    textAlign: 'left',
                    marginBottom: isOpen ? '1rem' : '0',
                    transition: 'all 0.2s ease',
                }}
            >
                <div style={{
                    width: '28px',
                    height: '28px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '6px',
                    background: colors.badgeBg,
                    color: colors.text,
                    transition: 'transform 0.2s ease',
                    transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                    fontSize: '0.9rem',
                }}>
                    ▶
                </div>
                <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '1.25rem' }}>{icon}</span>
                        <span style={{ fontSize: '1.1rem', fontWeight: '600', color: 'var(--foreground)' }}>
                            {title} ({count})
                        </span>
                        {badgeText && (
                            <span style={{
                                padding: '0.25rem 0.5rem',
                                background: colors.badgeBg,
                                color: colors.text,
                                border: `1px solid ${colors.border}`,
                                borderRadius: '8px',
                                fontSize: '0.75rem',
                                fontWeight: '600',
                            }}>
                                {badgeText}
                            </span>
                        )}
                        {/* Total Batches Display with Unique Batches below */}
                        {totalBatches !== undefined && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <span style={{
                                    padding: '0.3rem 0.75rem',
                                    background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
                                    color: 'white',
                                    borderRadius: '12px',
                                    fontSize: '0.8rem',
                                    fontWeight: '700',
                                    boxShadow: '0 2px 4px rgba(59, 130, 246, 0.3)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                }}>
                                    📦 {totalBatches.toLocaleString()} Batches
                                </span>
                                {uniqueBatches !== undefined && (
                                    <span style={{
                                        padding: '0.2rem 0.6rem',
                                        background: 'linear-gradient(135deg, #10b981 0%, #06b6d4 100%)',
                                        color: 'white',
                                        borderRadius: '10px',
                                        fontSize: '0.7rem',
                                        fontWeight: '600',
                                        boxShadow: '0 2px 4px rgba(16, 185, 129, 0.3)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '3px',
                                    }}>
                                        🎯 {uniqueBatches.toLocaleString()} Unique
                                    </span>
                                )}
                            </div>
                        )}
                        {/* RM Data Status Capsule */}
                        {(rmDataMatched !== undefined || rmDataUnmatched !== undefined) && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
                                <BatchStatusCapsule
                                    matched={rmDataMatched || 0}
                                    unmatched={rmDataUnmatched || 0}
                                    onGreenClick={onRmMatchedClick}
                                    onRedClick={onRmUnmatchedClick}
                                    size="medium"
                                    type="RM"
                                />
                                {/* RM Total indicator (global across all MFCs) */}
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    fontSize: '0.65rem',
                                    fontWeight: '600',
                                    color: '#059669',
                                    background: 'rgba(16, 185, 129, 0.1)',
                                    padding: '2px 8px',
                                    borderRadius: '6px',
                                    border: '1px solid rgba(16, 185, 129, 0.3)',
                                }}>
                                    <span>{rmDataMatched || 0}</span>
                                    <span>+</span>
                                    <span>{rmDataUnmatched || 0}</span>
                                    <span>=</span>
                                    <span style={{ fontWeight: '700' }}>{rmTotal}</span>
                                    <span style={{ marginLeft: '4px', opacity: 0.8 }}>total</span>
                                </div>
                            </div>
                        )}
                        {/* PPM Data Status Capsule */}
                        {(ppmDataMatched !== undefined || ppmDataUnmatched !== undefined) && (ppmDataMatched! + ppmDataUnmatched!) > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
                                <BatchStatusCapsule
                                    matched={ppmDataMatched || 0}
                                    unmatched={ppmDataUnmatched || 0}
                                    onGreenClick={onPpmMatchedClick}
                                    onRedClick={onPpmUnmatchedClick}
                                    size="medium"
                                    type="PPM"
                                />
                            </div>
                        )}
                        {/* PM Data Status Capsule */}
                        {(pmDataMatched !== undefined || pmDataUnmatched !== undefined) && (pmDataMatched! + pmDataUnmatched!) > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
                                <BatchStatusCapsule
                                    matched={pmDataMatched || 0}
                                    unmatched={pmDataUnmatched || 0}
                                    onGreenClick={onPmMatchedClick}
                                    onRedClick={onPmUnmatchedClick}
                                    size="medium"
                                    type="PM"
                                />
                            </div>
                        )}
                        {/* Material Qualification Status Capsule */}
                        {(materialQualified !== undefined || materialUnqualified !== undefined) && (materialQualified! + materialUnqualified!) > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
                                <BatchStatusCapsule
                                    matched={materialQualified || 0}
                                    unmatched={materialUnqualified || 0}
                                    onGreenClick={onMaterialQualifiedClick}
                                    onRedClick={onMaterialUnqualifiedClick}
                                    size="medium"
                                    type="RM COA"
                                />
                            </div>
                        )}
                        {/* Bulk COA Status Capsule - After PM and before RM COA */}
                        {(bulkCoaQualified !== undefined || bulkCoaUnqualified !== undefined) && (bulkCoaQualified! + bulkCoaUnqualified!) > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
                                <BatchStatusCapsule
                                    matched={bulkCoaQualified || 0}
                                    unmatched={bulkCoaUnqualified || 0}
                                    onGreenClick={onBulkCoaQualifiedClick}
                                    onRedClick={onBulkCoaUnqualifiedClick}
                                    size="medium"
                                    type="Bulk COA"
                                />
                            </div>
                        )}
                        {/* PM COA Status Capsule */}
                        {(pmCoaQualified !== undefined || pmCoaUnqualified !== undefined) && (pmCoaQualified! + pmCoaUnqualified!) > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
                                <BatchStatusCapsule
                                    matched={pmCoaQualified || 0}
                                    unmatched={pmCoaUnqualified || 0}
                                    onGreenClick={onPmCoaQualifiedClick}
                                    onRedClick={onPmCoaUnqualifiedClick}
                                    size="medium"
                                    type="PM COA"
                                />
                            </div>
                        )}
                        {/* PPM COA Status Capsule */}
                        {(ppmCoaQualified !== undefined || ppmCoaUnqualified !== undefined) && (ppmCoaQualified! + ppmCoaUnqualified!) > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
                                <BatchStatusCapsule
                                    matched={ppmCoaQualified || 0}
                                    unmatched={ppmCoaUnqualified || 0}
                                    onGreenClick={onPpmCoaQualifiedClick}
                                    onRedClick={onPpmCoaUnqualifiedClick}
                                    size="medium"
                                    type="PPM COA"
                                />
                            </div>
                        )}
                    </div>
                    {description && (
                        <p style={{ fontSize: '0.8rem', color: 'var(--muted-foreground)', marginTop: '0.25rem' }}>
                            {description}
                        </p>
                    )}
                </div>
                <div style={{
                    fontSize: '0.8rem',
                    color: 'var(--muted-foreground)',
                    padding: '0.25rem 0.5rem',
                    background: 'var(--background)',
                    borderRadius: '4px',
                }}>
                    {isOpen ? 'Click to collapse' : 'Click to expand'}
                </div>
            </div>
        );
    };

    // Batch Detail Modal Component (no background blur)
    const BatchDetailModal = () => {
        if (!selectedBatchNumber) return null;

        return (
            <div style={{
                position: 'fixed',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                zIndex: 1000,
                width: '90%',
                maxWidth: '700px',
                maxHeight: '85vh',
                overflowY: 'auto',
                background: 'white',
                borderRadius: '16px',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.05)',
                border: '2px solid #e5e7eb',
            }}>
                {/* Modal Header */}
                <div style={{
                    position: 'sticky',
                    top: 0,
                    background: 'linear-gradient(135deg, #7c3aed 0%, #8b5cf6 100%)',
                    padding: '16px 24px',
                    borderRadius: '14px 14px 0 0',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    zIndex: 10,
                }}>
                    <div>
                        <h3 style={{ color: 'white', fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>
                            📦 Batch Details
                        </h3>
                        <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.85rem', marginTop: '4px' }}>
                            Batch No: <strong>{selectedBatchNumber}</strong>
                        </p>
                    </div>
                    <button
                        onClick={closeBatchModal}
                        style={{
                            background: 'rgba(255,255,255,0.2)',
                            border: 'none',
                            borderRadius: '8px',
                            padding: '8px 12px',
                            color: 'white',
                            fontSize: '1rem',
                            cursor: 'pointer',
                            fontWeight: 600,
                        }}
                    >
                        ✕ Close
                    </button>
                </div>

                {/* Modal Body */}
                <div style={{ padding: '20px 24px' }}>
                    {isBatchModalLoading && (
                        <div style={{ textAlign: 'center', padding: '40px' }}>
                            <svg className="animate-spin" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2">
                                <path d="M21 12a9 9 0 11-6.219-8.56" strokeLinecap="round" />
                            </svg>
                            <p style={{ marginTop: '12px', color: '#6b7280' }}>Loading batch details...</p>
                        </div>
                    )}

                    {batchModalError && (
                        <div style={{
                            background: '#fef2f2',
                            border: '1px solid #fecaca',
                            borderRadius: '12px',
                            padding: '20px',
                            textAlign: 'center',
                        }}>
                            <span style={{ fontSize: '2rem' }}>⚠️</span>
                            <p style={{ color: '#dc2626', fontWeight: 600, marginTop: '8px' }}>{batchModalError}</p>
                        </div>
                    )}

                    {batchDetails && batchDetails.length > 0 && (
                        <div>
                            {batchDetails.map((batch, idx) => (
                                <div key={idx} style={{
                                    background: '#f9fafb',
                                    borderRadius: '12px',
                                    padding: '20px',
                                    marginBottom: idx < batchDetails.length - 1 ? '16px' : 0,
                                    border: '1px solid #e5e7eb',
                                }}>
                                    {/* Product Info */}
                                    <div style={{
                                        borderBottom: '1px solid #e5e7eb',
                                        paddingBottom: '16px',
                                        marginBottom: '16px',
                                    }}>
                                        <h4 style={{
                                            color: '#1f2937',
                                            fontSize: '1.05rem',
                                            fontWeight: 700,
                                            marginBottom: '8px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px'
                                        }}>
                                            🏷️ {batch.itemName || 'N/A'}
                                        </h4>
                                        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                                            <span style={{
                                                background: '#dbeafe',
                                                color: '#1d4ed8',
                                                padding: '4px 10px',
                                                borderRadius: '6px',
                                                fontSize: '0.8rem',
                                                fontWeight: 600,
                                            }}>
                                                Item Code: {batch.itemCode}
                                            </span>
                                            <span style={{
                                                background: batch.type === 'Export' ? '#d1fae5' : '#fef3c7',
                                                color: batch.type === 'Export' ? '#059669' : '#d97706',
                                                padding: '4px 10px',
                                                borderRadius: '6px',
                                                fontSize: '0.8rem',
                                                fontWeight: 600,
                                            }}>
                                                {batch.type}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Details Grid */}
                                    <div style={{
                                        display: 'grid',
                                        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                                        gap: '12px',
                                    }}>
                                        <DetailRow label="Batch Number" value={batch.batchNumber} />
                                        <DetailRow label="Manufacturing Date" value={batch.mfgDate} />
                                        <DetailRow label="Expiry Date" value={batch.expiryDate} />
                                        <DetailRow label="Batch Size" value={`${batch.batchSize} ${batch.unit}`} />
                                        <DetailRow label="Pack" value={batch.pack} />
                                        <DetailRow label="Department" value={batch.department} />
                                        <DetailRow label="Manufacturing License" value={batch.mfgLicNo} />
                                        <DetailRow label="Location ID" value={batch.locationId} />
                                        <DetailRow label="Year" value={batch.year} />
                                        <DetailRow label="Make" value={batch.make} />
                                        {batch.mrpValue && <DetailRow label="MRP" value={batch.mrpValue} />}
                                        {batch.batchCompletionDate && <DetailRow label="Completion Date" value={batch.batchCompletionDate} />}
                                    </div>

                                    {/* Company Info */}
                                    <div style={{
                                        marginTop: '16px',
                                        paddingTop: '16px',
                                        borderTop: '1px solid #e5e7eb',
                                    }}>
                                        <p style={{ fontSize: '0.85rem', color: '#6b7280' }}>
                                            <strong>Company:</strong> {batch.companyName}
                                        </p>
                                        <p style={{ fontSize: '0.8rem', color: '#9ca3af', marginTop: '4px' }}>
                                            Source: {batch.fileName}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        );
    };

    // Detail row component for modal
    const DetailRow = ({ label, value }: { label: string; value: string }) => (
        <div style={{
            background: 'white',
            padding: '10px 12px',
            borderRadius: '8px',
            border: '1px solid #e5e7eb',
        }}>
            <p style={{ fontSize: '0.7rem', color: '#9ca3af', fontWeight: 500, marginBottom: '2px' }}>
                {label}
            </p>
            <p style={{ fontSize: '0.9rem', color: '#1f2937', fontWeight: 600 }}>
                {value || 'N/A'}
            </p>
        </div>
    );

    // Batch List Modal Component (shows all batches for a product code with complete details)
    // State for expanded product codes (file-like structure)
    const [expandedProductCodes, setExpandedProductCodes] = useState<Set<string>>(new Set());
    const [expandedBatchIdx, setExpandedBatchIdx] = useState<string | null>(null); // Changed to string for unique key
    const modalScrollRef = useRef<HTMLDivElement>(null); // Ref to preserve scroll position

    // Toggle expanded state for a product code "file"
    const toggleProductCodeExpand = (productCode: string) => {
        setExpandedProductCodes(prev => {
            const next = new Set(prev);
            if (next.has(productCode)) {
                next.delete(productCode);
            } else {
                next.add(productCode);
            }
            return next;
        });
    };

    // Group batches by item code (product code)
    const groupBatchesByItemCode = (batches: BatchListItem[]): Map<string, { itemName: string; batches: BatchListItem[] }> => {
        const grouped = new Map<string, { itemName: string; batches: BatchListItem[] }>();

        batches.forEach(batch => {
            const code = batch.itemCode || 'N/A';
            if (!grouped.has(code)) {
                grouped.set(code, {
                    itemName: batch.itemName || 'N/A',
                    batches: []
                });
            }
            grouped.get(code)!.batches.push(batch);
        });

        return grouped;
    };

    const BatchListModal = () => {
        if (!selectedProductCode) return null;

        // Group batches by item code
        const groupedBatches = batchList ? groupBatchesByItemCode(batchList) : new Map<string, { itemName: string; batches: BatchListItem[] }>();
        const uniqueProductCodeCount = groupedBatches.size;

        return (
            <div
                ref={modalScrollRef}
                style={{
                    position: 'fixed',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    zIndex: 1000,
                    width: '95%',
                    maxWidth: '1100px',
                    maxHeight: '90vh',
                    overflowY: 'auto',
                    background: 'white',
                    borderRadius: '16px',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.05)',
                    border: '2px solid #10b981',
                }}>
                {/* Modal Header */}
                <div style={{
                    position: 'sticky',
                    top: 0,
                    background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                    padding: '16px 24px',
                    borderRadius: '14px 14px 0 0',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    zIndex: 10,
                }}>
                    <div>
                        <h3 style={{ color: 'white', fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>
                            📋 Batch Information
                        </h3>
                        <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: '0.85rem', marginTop: '4px' }}>
                            {selectedProductName} <span style={{ opacity: 0.7 }}>({selectedProductCode})</span>
                        </p>
                    </div>
                    <button
                        onClick={() => {
                            closeBatchListModal();
                            setExpandedBatchIdx(null);
                            setExpandedProductCodes(new Set());
                        }}
                        style={{
                            background: 'rgba(255,255,255,0.2)',
                            border: 'none',
                            borderRadius: '8px',
                            padding: '8px 16px',
                            color: 'white',
                            fontSize: '1rem',
                            cursor: 'pointer',
                            fontWeight: 600,
                        }}
                    >
                        ✕ Close
                    </button>
                </div>

                {/* Modal Body */}
                <div style={{ padding: '20px 24px' }}>
                    {isBatchListLoading && (
                        <div style={{ textAlign: 'center', padding: '40px' }}>
                            <svg className="animate-spin" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2">
                                <path d="M21 12a9 9 0 11-6.219-8.56" strokeLinecap="round" />
                            </svg>
                            <p style={{ marginTop: '12px', color: '#6b7280' }}>Loading batch information...</p>
                        </div>
                    )}

                    {batchListError && (
                        <div style={{
                            background: '#fef2f2',
                            border: '1px solid #fecaca',
                            borderRadius: '12px',
                            padding: '20px',
                            textAlign: 'center',
                        }}>
                            <span style={{ fontSize: '2rem' }}>📭</span>
                            <p style={{ color: '#dc2626', fontWeight: 600, marginTop: '8px' }}>{batchListError}</p>
                        </div>
                    )}

                    {batchList && batchList.length > 0 && (
                        <div>
                            {/* Summary Header - Now includes Product Code count */}
                            <div style={{
                                display: 'flex',
                                gap: '16px',
                                marginBottom: '20px',
                                flexWrap: 'wrap',
                            }}>
                                <div style={{
                                    padding: '12px 20px',
                                    background: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)',
                                    borderRadius: '12px',
                                    border: '1px solid #a7f3d0',
                                    flex: '1',
                                    minWidth: '140px',
                                }}>
                                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#059669' }}>
                                        {batchList.length}
                                    </div>
                                    <div style={{ fontSize: '0.8rem', color: '#047857', fontWeight: 500 }}>
                                        Total Batches
                                    </div>
                                </div>
                                {/* New: Unique Product Codes Count */}
                                <div style={{
                                    padding: '12px 20px',
                                    background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
                                    borderRadius: '12px',
                                    border: '1px solid #93c5fd',
                                    flex: '1',
                                    minWidth: '140px',
                                }}>
                                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#2563eb' }}>
                                        {uniqueProductCodeCount}
                                    </div>
                                    <div style={{ fontSize: '0.8rem', color: '#1d4ed8', fontWeight: 500 }}>
                                        Product Codes
                                    </div>
                                </div>
                                <div style={{
                                    padding: '12px 20px',
                                    background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
                                    borderRadius: '12px',
                                    border: '1px solid #bbf7d0',
                                    flex: '1',
                                    minWidth: '140px',
                                }}>
                                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#16a34a' }}>
                                        {batchList.filter(b => b.type === 'Export').length}
                                    </div>
                                    <div style={{ fontSize: '0.8rem', color: '#15803d', fontWeight: 500 }}>
                                        Export Batches
                                    </div>
                                </div>
                                <div style={{
                                    padding: '12px 20px',
                                    background: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
                                    borderRadius: '12px',
                                    border: '1px solid #fde68a',
                                    flex: '1',
                                    minWidth: '140px',
                                }}>
                                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#ca8a04' }}>
                                        {batchList.filter(b => b.type === 'Import').length}
                                    </div>
                                    <div style={{ fontSize: '0.8rem', color: '#a16207', fontWeight: 500 }}>
                                        Import Batches
                                    </div>
                                </div>
                            </div>

                            <p style={{
                                fontSize: '0.85rem',
                                color: '#6b7280',
                                marginBottom: '16px',
                                padding: '10px 16px',
                                background: '#f0fdf4',
                                borderRadius: '8px',
                                border: '1px solid #bbf7d0'
                            }}>
                                📁 Click on a <strong>Product Code</strong> to expand and view all its batches. Click on any batch row to see complete details.
                            </p>

                            {/* Product Code Files - Grouped by Item Code */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {Array.from(groupedBatches.entries()).map(([itemCode, { itemName, batches: codeBatches }], fileIdx) => {
                                    const isCodeExpanded = expandedProductCodes.has(itemCode);

                                    return (
                                        <div
                                            key={itemCode}
                                            id={`productcode-${itemCode}`}
                                            style={{
                                                background: isCodeExpanded ? '#f0fdf4' : '#fff',
                                                border: isCodeExpanded ? '2px solid #10b981' : '1px solid #e5e7eb',
                                                borderRadius: '12px',
                                                overflow: 'hidden',
                                                transition: 'all 0.2s ease',
                                            }}
                                        >
                                            {/* Product Code Header - File/Folder like */}
                                            <div
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    const wasExpanded = isCodeExpanded;
                                                    toggleProductCodeExpand(itemCode);
                                                    // Scroll to keep the clicked element visible
                                                    if (!wasExpanded) {
                                                        setTimeout(() => {
                                                            const element = document.getElementById(`productcode-${itemCode}`);
                                                            if (element) {
                                                                element.scrollIntoView({ behavior: 'auto', block: 'nearest' });
                                                            }
                                                        }, 10);
                                                    }
                                                }}
                                                style={{
                                                    padding: '14px 18px',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '12px',
                                                    cursor: 'pointer',
                                                    background: isCodeExpanded
                                                        ? 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)'
                                                        : 'linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%)',
                                                    transition: 'all 0.15s ease',
                                                }}
                                            >
                                                {/* Expand Icon */}
                                                <div style={{
                                                    width: '28px',
                                                    height: '28px',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    borderRadius: '8px',
                                                    background: isCodeExpanded ? '#10b981' : '#dbeafe',
                                                    color: isCodeExpanded ? 'white' : '#2563eb',
                                                    transition: 'all 0.2s ease',
                                                    fontSize: '1rem',
                                                    flexShrink: 0,
                                                }}>
                                                    {isCodeExpanded ? '📂' : '📁'}
                                                </div>

                                                {/* File Index */}
                                                <div style={{
                                                    width: '28px',
                                                    fontSize: '0.8rem',
                                                    fontWeight: 600,
                                                    color: '#9ca3af',
                                                    flexShrink: 0,
                                                }}>
                                                    #{fileIdx + 1}
                                                </div>

                                                {/* Item Code - Main identifier */}
                                                <div style={{
                                                    fontFamily: 'monospace',
                                                    fontSize: '0.95rem',
                                                    fontWeight: 700,
                                                    color: '#1d4ed8',
                                                    padding: '4px 12px',
                                                    background: '#dbeafe',
                                                    borderRadius: '8px',
                                                    minWidth: '100px',
                                                    flexShrink: 0,
                                                }}>
                                                    {itemCode}
                                                </div>

                                                {/* Item Name */}
                                                <div style={{
                                                    flex: '1',
                                                    fontSize: '0.9rem',
                                                    fontWeight: 600,
                                                    color: '#1f2937',
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    whiteSpace: 'nowrap',
                                                }}>
                                                    {itemName}
                                                </div>

                                                {/* Batch Count Badge */}
                                                <div style={{
                                                    padding: '6px 14px',
                                                    borderRadius: '20px',
                                                    fontSize: '0.8rem',
                                                    fontWeight: 700,
                                                    background: isCodeExpanded
                                                        ? 'linear-gradient(135deg, #059669 0%, #10b981 100%)'
                                                        : 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                                                    color: 'white',
                                                    flexShrink: 0,
                                                    boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                                                }}>
                                                    📦 {codeBatches.length} {codeBatches.length === 1 ? 'Batch' : 'Batches'}
                                                </div>

                                                {/* Chevron */}
                                                <div style={{
                                                    fontSize: '0.8rem',
                                                    color: '#6b7280',
                                                    transform: isCodeExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                                                    transition: 'transform 0.2s ease',
                                                }}>
                                                    ▶
                                                </div>
                                            </div>

                                            {/* Expanded Batches List */}
                                            {isCodeExpanded && (
                                                <div style={{
                                                    padding: '12px 18px 18px',
                                                    background: 'linear-gradient(180deg, #f0fdf4 0%, #ffffff 100%)',
                                                    borderTop: '1px solid #a7f3d0',
                                                }}>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                        {codeBatches.map((batch: BatchListItem, idx: number) => {
                                                            const batchKey = `${itemCode}-${idx}`;
                                                            const isBatchExpanded = expandedBatchIdx === batchKey;

                                                            return (
                                                                <div
                                                                    key={batchKey}
                                                                    id={`batch-${batchKey}`}
                                                                    style={{
                                                                        background: isBatchExpanded ? '#ecfdf5' : '#fff',
                                                                        border: isBatchExpanded ? '2px solid #34d399' : '1px solid #d1d5db',
                                                                        borderRadius: '10px',
                                                                        overflow: 'hidden',
                                                                        transition: 'all 0.2s ease',
                                                                    }}
                                                                >
                                                                    {/* Batch Row Header */}
                                                                    <div
                                                                        onClick={(e) => {
                                                                            e.preventDefault();
                                                                            e.stopPropagation();
                                                                            const newExpanded = isBatchExpanded ? null : batchKey;
                                                                            setExpandedBatchIdx(newExpanded);
                                                                            // Scroll to keep the clicked element visible
                                                                            if (newExpanded) {
                                                                                setTimeout(() => {
                                                                                    const element = document.getElementById(`batch-${batchKey}`);
                                                                                    if (element) {
                                                                                        element.scrollIntoView({ behavior: 'auto', block: 'nearest' });
                                                                                    }
                                                                                }, 10);
                                                                            }
                                                                        }}
                                                                        style={{
                                                                            padding: '12px 14px',
                                                                            display: 'flex',
                                                                            alignItems: 'center',
                                                                            gap: '10px',
                                                                            cursor: 'pointer',
                                                                            flexWrap: 'wrap',
                                                                        }}
                                                                    >
                                                                        {/* Expand Icon */}
                                                                        <div style={{
                                                                            width: '22px',
                                                                            height: '22px',
                                                                            display: 'flex',
                                                                            alignItems: 'center',
                                                                            justifyContent: 'center',
                                                                            borderRadius: '5px',
                                                                            background: isBatchExpanded ? '#10b981' : '#e5e7eb',
                                                                            color: isBatchExpanded ? 'white' : '#6b7280',
                                                                            transition: 'all 0.2s ease',
                                                                            transform: isBatchExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                                                                            fontSize: '0.65rem',
                                                                            fontWeight: 700,
                                                                            flexShrink: 0,
                                                                        }}>
                                                                            ▶
                                                                        </div>

                                                                        {/* Index */}
                                                                        <div style={{
                                                                            width: '24px',
                                                                            fontSize: '0.75rem',
                                                                            fontWeight: 600,
                                                                            color: '#9ca3af',
                                                                            flexShrink: 0,
                                                                        }}>
                                                                            #{idx + 1}
                                                                        </div>

                                                                        {/* Batch Number */}
                                                                        <div style={{
                                                                            fontFamily: 'monospace',
                                                                            fontSize: '0.85rem',
                                                                            fontWeight: 700,
                                                                            color: '#059669',
                                                                            minWidth: '90px',
                                                                            flexShrink: 0,
                                                                        }}>
                                                                            {batch.batchNumber}
                                                                        </div>

                                                                        {/* Item Name */}
                                                                        <div style={{
                                                                            flex: '1',
                                                                            fontSize: '0.8rem',
                                                                            fontWeight: 500,
                                                                            color: '#374151',
                                                                            minWidth: '120px',
                                                                            overflow: 'hidden',
                                                                            textOverflow: 'ellipsis',
                                                                            whiteSpace: 'nowrap',
                                                                        }}>
                                                                            {batch.itemName || 'N/A'}
                                                                        </div>

                                                                        {/* Pack */}
                                                                        <div style={{
                                                                            fontSize: '0.75rem',
                                                                            color: '#7c3aed',
                                                                            fontWeight: 600,
                                                                            padding: '2px 8px',
                                                                            background: '#f3e8ff',
                                                                            borderRadius: '6px',
                                                                            flexShrink: 0,
                                                                        }}>
                                                                            📦 {batch.pack || 'N/A'}
                                                                        </div>

                                                                        {/* Department */}
                                                                        <div style={{
                                                                            fontSize: '0.75rem',
                                                                            color: '#0891b2',
                                                                            fontWeight: 500,
                                                                            padding: '2px 8px',
                                                                            background: '#ecfeff',
                                                                            borderRadius: '6px',
                                                                            flexShrink: 0,
                                                                        }}>
                                                                            🏭 {batch.department || 'N/A'}
                                                                        </div>

                                                                        {/* Type Badge */}
                                                                        <span style={{
                                                                            padding: '3px 10px',
                                                                            borderRadius: '20px',
                                                                            fontSize: '0.65rem',
                                                                            fontWeight: 600,
                                                                            background: batch.type === 'Export' ? '#d1fae5' : '#fef3c7',
                                                                            color: batch.type === 'Export' ? '#059669' : '#d97706',
                                                                            flexShrink: 0,
                                                                        }}>
                                                                            {batch.type}
                                                                        </span>
                                                                    </div>

                                                                    {/* Expanded Batch Details */}
                                                                    {isBatchExpanded && (
                                                                        <div style={{
                                                                            padding: '14px 16px',
                                                                            background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
                                                                            borderTop: '1px solid #e5e7eb',
                                                                        }}>
                                                                            {/* Details Grid */}
                                                                            <div style={{
                                                                                display: 'grid',
                                                                                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                                                                                gap: '10px',
                                                                                marginBottom: '12px',
                                                                            }}>
                                                                                <div style={{ background: 'white', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                                                                                    <div style={{ fontSize: '0.65rem', color: '#9ca3af', fontWeight: 500, marginBottom: '3px' }}>Item Code</div>
                                                                                    <div style={{ fontSize: '0.85rem', color: '#1f2937', fontWeight: 600 }}>{batch.itemCode || 'N/A'}</div>
                                                                                </div>
                                                                                <div style={{ background: 'white', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                                                                                    <div style={{ fontSize: '0.65rem', color: '#9ca3af', fontWeight: 500, marginBottom: '3px' }}>Item Detail</div>
                                                                                    <div style={{ fontSize: '0.85rem', color: '#1f2937', fontWeight: 600 }}>{batch.itemDetail || 'N/A'}</div>
                                                                                </div>
                                                                                <div style={{ background: 'white', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                                                                                    <div style={{ fontSize: '0.65rem', color: '#9ca3af', fontWeight: 500, marginBottom: '3px' }}>Manufacturing Date</div>
                                                                                    <div style={{ fontSize: '0.85rem', color: '#1f2937', fontWeight: 600 }}>{batch.mfgDate || 'N/A'}</div>
                                                                                </div>
                                                                                <div style={{ background: 'white', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                                                                                    <div style={{ fontSize: '0.65rem', color: '#9ca3af', fontWeight: 500, marginBottom: '3px' }}>Expiry Date</div>
                                                                                    <div style={{ fontSize: '0.85rem', color: '#1f2937', fontWeight: 600 }}>{batch.expiryDate || 'N/A'}</div>
                                                                                </div>
                                                                                <div style={{ background: 'white', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                                                                                    <div style={{ fontSize: '0.65rem', color: '#9ca3af', fontWeight: 500, marginBottom: '3px' }}>Batch Size</div>
                                                                                    <div style={{ fontSize: '0.85rem', color: '#1f2937', fontWeight: 600 }}>{batch.batchSize} {batch.unit}</div>
                                                                                </div>
                                                                                <div style={{ background: 'white', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                                                                                    <div style={{ fontSize: '0.65rem', color: '#9ca3af', fontWeight: 500, marginBottom: '3px' }}>Mfg License</div>
                                                                                    <div style={{ fontSize: '0.85rem', color: '#1f2937', fontWeight: 600 }}>{batch.mfgLicNo || 'N/A'}</div>
                                                                                </div>
                                                                                <div style={{ background: 'white', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                                                                                    <div style={{ fontSize: '0.65rem', color: '#9ca3af', fontWeight: 500, marginBottom: '3px' }}>Year</div>
                                                                                    <div style={{ fontSize: '0.85rem', color: '#1f2937', fontWeight: 600 }}>{batch.year || 'N/A'}</div>
                                                                                </div>
                                                                                <div style={{ background: 'white', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                                                                                    <div style={{ fontSize: '0.65rem', color: '#9ca3af', fontWeight: 500, marginBottom: '3px' }}>Make</div>
                                                                                    <div style={{ fontSize: '0.85rem', color: '#1f2937', fontWeight: 600 }}>{batch.make || 'N/A'}</div>
                                                                                </div>
                                                                                <div style={{ background: 'white', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                                                                                    <div style={{ fontSize: '0.65rem', color: '#9ca3af', fontWeight: 500, marginBottom: '3px' }}>Location ID</div>
                                                                                    <div style={{ fontSize: '0.85rem', color: '#1f2937', fontWeight: 600 }}>{batch.locationId || 'N/A'}</div>
                                                                                </div>
                                                                                {batch.mrpValue && (
                                                                                    <div style={{ background: 'white', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                                                                                        <div style={{ fontSize: '0.65rem', color: '#9ca3af', fontWeight: 500, marginBottom: '3px' }}>MRP Value</div>
                                                                                        <div style={{ fontSize: '0.85rem', color: '#1f2937', fontWeight: 600 }}>{batch.mrpValue}</div>
                                                                                    </div>
                                                                                )}
                                                                                {batch.conversionRatio && (
                                                                                    <div style={{ background: 'white', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                                                                                        <div style={{ fontSize: '0.65rem', color: '#9ca3af', fontWeight: 500, marginBottom: '3px' }}>Conversion Ratio</div>
                                                                                        <div style={{ fontSize: '0.85rem', color: '#1f2937', fontWeight: 600 }}>{batch.conversionRatio}</div>
                                                                                    </div>
                                                                                )}
                                                                                {batch.batchCompletionDate && (
                                                                                    <div style={{ background: 'white', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                                                                                        <div style={{ fontSize: '0.65rem', color: '#9ca3af', fontWeight: 500, marginBottom: '3px' }}>Completion Date</div>
                                                                                        <div style={{ fontSize: '0.85rem', color: '#1f2937', fontWeight: 600 }}>{batch.batchCompletionDate}</div>
                                                                                    </div>
                                                                                )}
                                                                            </div>

                                                                            {/* Company Info Footer */}
                                                                            <div style={{
                                                                                paddingTop: '10px',
                                                                                borderTop: '1px solid #e5e7eb',
                                                                                display: 'flex',
                                                                                flexWrap: 'wrap',
                                                                                gap: '12px',
                                                                                fontSize: '0.75rem',
                                                                                color: '#6b7280',
                                                                            }}>
                                                                                <div><strong>🏢 Company:</strong> {batch.companyName || 'N/A'}</div>
                                                                                <div><strong>📍 Address:</strong> {batch.companyAddress || 'N/A'}</div>
                                                                                <div><strong>📄 Source:</strong> {batch.fileName || 'N/A'}</div>
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    // RM Data Modal Component - Shows batches with/without RM requisition data
    const RmDataModal = () => {
        if (!showRmDataModal) return null;

        return (
            <div style={{
                position: 'fixed',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                zIndex: 1000,
                width: '95%',
                maxWidth: '1200px',
                maxHeight: '90vh',
                overflowY: 'auto',
                background: 'white',
                borderRadius: '16px',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.05)',
                border: '2px solid #e5e7eb',
            }}>
                {/* Modal Header */}
                <div style={{
                    position: 'sticky',
                    top: 0,
                    background: rmModalType === 'matched'
                        ? 'linear-gradient(135deg, #059669 0%, #10b981 100%)'
                        : 'linear-gradient(135deg, #dc2626 0%, #ef4444 100%)',
                    padding: '16px 24px',
                    borderRadius: '14px 14px 0 0',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    zIndex: 10,
                }}>
                    <div>
                        <h3 style={{ color: 'white', fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>
                            🧪 RM (Raw Materials) Requisition Data
                        </h3>
                        <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: '0.85rem', marginTop: '4px' }}>
                            {rmModalType === 'matched'
                                ? `✓ ${globalRmDataMatched} batches with RM data`
                                : `✗ ${globalRmDataUnmatched} batches without RM data`
                            }
                        </p>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        {/* View Mode Toggle */}
                        <div style={{
                            display: 'flex',
                            background: 'rgba(255,255,255,0.2)',
                            borderRadius: '8px',
                            padding: '3px',
                        }}>
                            <button
                                onClick={() => setRmViewMode('table')}
                                style={{
                                    padding: '6px 12px',
                                    border: 'none',
                                    borderRadius: '6px',
                                    fontSize: '0.8rem',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    background: rmViewMode === 'table' ? 'white' : 'transparent',
                                    color: rmViewMode === 'table' ? (rmModalType === 'matched' ? '#059669' : '#dc2626') : 'white',
                                    transition: 'all 0.2s',
                                }}
                            >
                                📊 Table
                            </button>
                            <button
                                onClick={() => setRmViewMode('file')}
                                style={{
                                    padding: '6px 12px',
                                    border: 'none',
                                    borderRadius: '6px',
                                    fontSize: '0.8rem',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    background: rmViewMode === 'file' ? 'white' : 'transparent',
                                    color: rmViewMode === 'file' ? (rmModalType === 'matched' ? '#059669' : '#dc2626') : 'white',
                                    transition: 'all 0.2s',
                                }}
                            >
                                📁 File
                            </button>
                        </div>
                        <button
                            onClick={closeRmDataModal}
                            style={{
                                background: 'rgba(255,255,255,0.2)',
                                border: 'none',
                                borderRadius: '8px',
                                padding: '8px 12px',
                                color: 'white',
                                fontSize: '1rem',
                                cursor: 'pointer',
                                fontWeight: 600,
                            }}
                        >
                            ✕ Close
                        </button>
                    </div>
                </div>

                {/* Modal Body */}
                <div style={{ padding: '20px 24px' }}>
                    {isRmModalLoading && (
                        <div style={{ textAlign: 'center', padding: '40px' }}>
                            <svg className="animate-spin" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={rmModalType === 'matched' ? '#10b981' : '#ef4444'} strokeWidth="2">
                                <path d="M21 12a9 9 0 11-6.219-8.56" strokeLinecap="round" />
                            </svg>
                            <p style={{ marginTop: '12px', color: '#6b7280' }}>Loading RM requisition data...</p>
                        </div>
                    )}

                    {rmModalError && (
                        <div style={{
                            background: '#fef2f2',
                            border: '1px solid #fecaca',
                            borderRadius: '12px',
                            padding: '20px',
                            textAlign: 'center',
                        }}>
                            <span style={{ fontSize: '2rem' }}>⚠️</span>
                            <p style={{ color: '#dc2626', fontWeight: 600, marginTop: '8px' }}>{rmModalError}</p>
                        </div>
                    )}

                    {rmModalData && rmModalData.length > 0 && (
                        <div>
                            {/* Summary */}
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                                gap: '12px',
                                marginBottom: '20px',
                            }}>
                                <div style={{
                                    background: rmModalType === 'matched'
                                        ? 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)'
                                        : 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)',
                                    padding: '12px 16px',
                                    borderRadius: '12px',
                                    border: rmModalType === 'matched' ? '1px solid #a7f3d0' : '1px solid #fecaca',
                                }}>
                                    <p style={{
                                        fontSize: '0.75rem',
                                        color: rmModalType === 'matched' ? '#059669' : '#dc2626',
                                        fontWeight: 600,
                                        marginBottom: '4px'
                                    }}>
                                        {rmModalType === 'matched' ? 'Total RM Materials' : 'Batches Missing RM Data'}
                                    </p>
                                    <p style={{
                                        fontSize: '1.5rem',
                                        fontWeight: 700,
                                        color: rmModalType === 'matched' ? '#047857' : '#b91c1c'
                                    }}>
                                        {rmModalData.length}
                                    </p>
                                </div>
                                <div style={{
                                    background: 'linear-gradient(135deg, #f3e8ff 0%, #e9d5ff 100%)',
                                    padding: '12px 16px',
                                    borderRadius: '12px',
                                    border: '1px solid #c4b5fd',
                                }}>
                                    <p style={{ fontSize: '0.75rem', color: '#7c3aed', fontWeight: 600, marginBottom: '4px' }}>Unique Batches</p>
                                    <p style={{ fontSize: '1.5rem', fontWeight: 700, color: '#6d28d9' }}>
                                        {new Set(rmModalData.map((m: any) => m.batchNumber)).size}
                                    </p>
                                </div>
                            </div>

                            {/* Content - Different display for matched vs unmatched */}
                            {rmModalType === 'matched' ? (
                                /* Matched: Show RM materials - Table or File view */
                                (() => {
                                    // Toggle sorting function
                                    const toggleRmSort = (column: string) => {
                                        if (rmSortColumn === column) {
                                            setRmSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
                                        } else {
                                            setRmSortColumn(column);
                                            setRmSortDirection('asc');
                                        }
                                    };

                                    // Sort the data
                                    const sortedRmData = [...rmModalData].sort((a, b) => {
                                        const valA = a[rmSortColumn] ?? '';
                                        const valB = b[rmSortColumn] ?? '';

                                        // Handle numeric fields
                                        if (typeof valA === 'number' && typeof valB === 'number') {
                                            return rmSortDirection === 'asc' ? valA - valB : valB - valA;
                                        }

                                        // String comparison
                                        const strA = String(valA).toLowerCase();
                                        const strB = String(valB).toLowerCase();
                                        if (strA < strB) return rmSortDirection === 'asc' ? -1 : 1;
                                        if (strA > strB) return rmSortDirection === 'asc' ? 1 : -1;
                                        return 0;
                                    });

                                    // Define columns with their properties
                                    const columns: { id: string; label: string; width?: string; highlight?: boolean }[] = [
                                        { id: 'matReqNo', label: 'Slip No', width: '85px' },
                                        { id: 'batchNumber', label: 'Batch No', width: '90px' },
                                        { id: 'mfcNo', label: 'MFC No', width: '100px' },
                                        { id: 'materialName', label: 'Material Name', width: '1fr' },
                                        { id: 'materialCode', label: 'Code', width: '80px' },
                                        { id: 'arNo', label: 'AR No', width: '95px', highlight: true },
                                        { id: 'quantityRequired', label: 'Qty Req', width: '75px' },
                                        { id: 'quantityToIssue', label: 'Qty Issue', width: '75px' },
                                        { id: 'labelClaim', label: 'Label', width: '60px' },
                                        { id: 'ovgPercent', label: 'OVG%', width: '55px' },
                                    ];

                                    // Group by batch for file view
                                    const groupedByBatch = new Map<string, any[]>();
                                    sortedRmData.forEach((item: any) => {
                                        const bn = item.batchNumber || 'Unknown';
                                        if (!groupedByBatch.has(bn)) {
                                            groupedByBatch.set(bn, []);
                                        }
                                        groupedByBatch.get(bn)!.push(item);
                                    });

                                    // Sort batch groups by the sort column
                                    const sortedBatchGroups = Array.from(groupedByBatch.entries()).sort((a, b) => {
                                        const valA = a[1][0]?.[rmSortColumn] ?? '';
                                        const valB = b[1][0]?.[rmSortColumn] ?? '';
                                        const strA = String(valA).toLowerCase();
                                        const strB = String(valB).toLowerCase();
                                        if (strA < strB) return rmSortDirection === 'asc' ? -1 : 1;
                                        if (strA > strB) return rmSortDirection === 'asc' ? 1 : -1;
                                        return 0;
                                    });

                                    return rmViewMode === 'table' ? (
                                        // TABLE VIEW
                                        <div style={{
                                            background: '#f9fafb',
                                            borderRadius: '12px',
                                            border: '1px solid #e5e7eb',
                                            overflow: 'hidden',
                                        }}>
                                            {/* Scrollable Table Container */}
                                            <div style={{ overflowX: 'auto', maxHeight: '500px', overflowY: 'auto' }}>
                                                <table style={{ width: '100%', minWidth: '1100px', borderCollapse: 'collapse' }}>
                                                    <thead style={{ position: 'sticky', top: 0, zIndex: 5 }}>
                                                        <tr style={{
                                                            background: '#f3f4f6',
                                                            borderBottom: '2px solid #e5e7eb',
                                                        }}>
                                                            {columns.map(col => (
                                                                <th
                                                                    key={col.id}
                                                                    onClick={() => toggleRmSort(col.id)}
                                                                    style={{
                                                                        padding: '10px 8px',
                                                                        textAlign: 'left',
                                                                        fontWeight: 600,
                                                                        fontSize: '0.75rem',
                                                                        color: rmSortColumn === col.id ? '#7c3aed' : '#4b5563',
                                                                        cursor: 'pointer',
                                                                        whiteSpace: 'nowrap',
                                                                        background: col.highlight ? '#fef3c7' : '#f3f4f6',
                                                                        transition: 'all 0.2s',
                                                                        userSelect: 'none',
                                                                    }}
                                                                >
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                        {col.label}
                                                                        <span style={{ fontSize: '0.7rem', opacity: rmSortColumn === col.id ? 1 : 0.3 }}>
                                                                            {rmSortColumn === col.id ? (rmSortDirection === 'asc' ? '↑' : '↓') : '↕'}
                                                                        </span>
                                                                    </div>
                                                                </th>
                                                            ))}
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {sortedRmData.slice(0, 500).map((item: any, idx: number) => (
                                                            <tr
                                                                key={idx}
                                                                style={{
                                                                    background: idx % 2 === 0 ? 'white' : '#fafafa',
                                                                    borderBottom: '1px solid #f3f4f6',
                                                                    transition: 'background 0.15s',
                                                                }}
                                                                onMouseEnter={e => e.currentTarget.style.background = '#f0fdf4'}
                                                                onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? 'white' : '#fafafa'}
                                                            >
                                                                <td style={{ padding: '8px', fontSize: '0.75rem', fontFamily: 'monospace', color: '#6b7280' }}>{item.matReqNo || 'N/A'}</td>
                                                                <td style={{ padding: '8px', fontFamily: 'monospace', fontWeight: 600, color: '#059669', fontSize: '0.8rem' }}>{item.batchNumber || 'N/A'}</td>
                                                                <td style={{ padding: '8px', fontFamily: 'monospace', fontSize: '0.7rem', color: '#f97316', fontWeight: 600 }}>{item.mfcNo || 'N/A'}</td>
                                                                <td style={{ padding: '8px', color: '#374151', fontWeight: 500, fontSize: '0.8rem', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.materialName}>{item.materialName || 'N/A'}</td>
                                                                <td style={{ padding: '8px', fontFamily: 'monospace', fontSize: '0.7rem', color: '#6b7280' }}>{item.materialCode || 'N/A'}</td>
                                                                <td style={{ padding: '8px', background: '#fef3c7', fontFamily: 'monospace', fontWeight: 700, color: '#d97706', fontSize: '0.75rem' }}>{item.arNo || 'N/A'}</td>
                                                                <td style={{ padding: '8px', color: '#7c3aed', fontWeight: 600, fontSize: '0.8rem' }}>{item.quantityRequired || 0}</td>
                                                                <td style={{ padding: '8px', color: '#0891b2', fontWeight: 600, fontSize: '0.8rem' }}>{item.quantityToIssue || 0}</td>
                                                                <td style={{ padding: '8px', fontSize: '0.7rem', color: '#6b7280' }}>{item.labelClaim || 'N/A'}</td>
                                                                <td style={{ padding: '8px', fontSize: '0.75rem', color: '#059669', fontWeight: 600 }}>{item.ovgPercent ? `${item.ovgPercent}%` : 'N/A'}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                            {sortedRmData.length > 500 && (
                                                <div style={{ padding: '12px 16px', textAlign: 'center', background: '#f3f4f6', color: '#6b7280', fontSize: '0.8rem' }}>
                                                    Showing first 500 of {sortedRmData.length} materials
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        // FILE VIEW - Grouped by batch
                                        <div style={{
                                            background: '#f9fafb',
                                            borderRadius: '12px',
                                            border: '1px solid #e5e7eb',
                                            overflow: 'hidden',
                                        }}>
                                            {/* Sort controls for file view */}
                                            <div style={{
                                                display: 'flex',
                                                gap: '8px',
                                                padding: '12px 16px',
                                                background: '#f3f4f6',
                                                borderBottom: '1px solid #e5e7eb',
                                                flexWrap: 'wrap',
                                                alignItems: 'center',
                                            }}>
                                                <span style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 600 }}>Sort by:</span>
                                                {[
                                                    { id: 'batchNumber', label: 'Batch No' },
                                                    { id: 'mfcNo', label: 'MFC No' },
                                                    { id: 'materialName', label: 'Material' },
                                                ].map(opt => (
                                                    <button
                                                        key={opt.id}
                                                        onClick={() => toggleRmSort(opt.id)}
                                                        style={{
                                                            padding: '4px 10px',
                                                            border: '1px solid',
                                                            borderColor: rmSortColumn === opt.id ? '#10b981' : '#d1d5db',
                                                            borderRadius: '6px',
                                                            fontSize: '0.75rem',
                                                            fontWeight: 600,
                                                            cursor: 'pointer',
                                                            background: rmSortColumn === opt.id ? '#d1fae5' : 'white',
                                                            color: rmSortColumn === opt.id ? '#059669' : '#6b7280',
                                                            transition: 'all 0.2s',
                                                        }}
                                                    >
                                                        {opt.label} {rmSortColumn === opt.id ? (rmSortDirection === 'asc' ? '↑' : '↓') : ''}
                                                    </button>
                                                ))}
                                            </div>
                                            {/* Batch Groups */}
                                            <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
                                                {sortedBatchGroups.slice(0, 100).map(([batchNumber, items], groupIdx) => {
                                                    const isExpanded = expandedRmBatches.has(batchNumber);
                                                    const firstItem = items[0];
                                                    return (
                                                        <div key={batchNumber} style={{ borderBottom: groupIdx < sortedBatchGroups.length - 1 ? '1px solid #e5e7eb' : 'none' }}>
                                                            {/* Batch Header */}
                                                            <button
                                                                onClick={() => toggleRmBatchExpand(batchNumber)}
                                                                style={{
                                                                    width: '100%',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    gap: '12px',
                                                                    padding: '12px 16px',
                                                                    background: isExpanded ? '#ecfdf5' : 'white',
                                                                    border: 'none',
                                                                    cursor: 'pointer',
                                                                    textAlign: 'left',
                                                                    transition: 'background 0.15s ease',
                                                                }}
                                                            >
                                                                <div style={{
                                                                    width: '22px', height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                    borderRadius: '5px', background: isExpanded ? '#10b981' : '#e5e7eb', color: isExpanded ? 'white' : '#6b7280',
                                                                    transition: 'all 0.2s ease', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                                                                    fontSize: '0.7rem', fontWeight: 700, flexShrink: 0,
                                                                }}>▶</div>
                                                                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#9ca3af', minWidth: '28px' }}>#{groupIdx + 1}</div>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                    <span style={{ fontSize: '1rem' }}>📁</span>
                                                                    <span style={{ fontFamily: 'monospace', fontSize: '0.95rem', fontWeight: 700, color: '#059669' }}>{batchNumber}</span>
                                                                </div>
                                                                <div style={{ fontSize: '0.75rem', color: '#6b7280', background: '#f3f4f6', padding: '2px 8px', borderRadius: '10px' }}>
                                                                    {items.length} material{items.length !== 1 ? 's' : ''}
                                                                </div>
                                                                <div style={{ fontSize: '0.7rem', color: '#f97316', fontWeight: 600 }}>MFC: {firstItem?.mfcNo || 'N/A'}</div>
                                                                {!isExpanded && <div style={{ flex: 1, fontSize: '0.8rem', color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{firstItem?.itemName || ''}</div>}
                                                            </button>
                                                            {/* Expanded Materials */}
                                                            {isExpanded && (
                                                                <div style={{ background: '#fafafa', padding: '8px 16px 12px 50px' }}>
                                                                    {items.map((item: any, itemIdx: number) => (
                                                                        <div key={itemIdx} style={{
                                                                            display: 'grid',
                                                                            gridTemplateColumns: '28px 1fr 100px 90px 90px',
                                                                            gap: '10px',
                                                                            padding: '10px 12px',
                                                                            background: itemIdx % 2 === 0 ? 'white' : '#f9fafb',
                                                                            borderRadius: '8px',
                                                                            marginBottom: itemIdx < items.length - 1 ? '6px' : 0,
                                                                            border: '1px solid #f3f4f6',
                                                                            fontSize: '0.8rem',
                                                                        }}>
                                                                            <div style={{ fontSize: '0.7rem', fontWeight: 600, color: '#9ca3af' }}>{itemIdx + 1}.</div>
                                                                            <div style={{ color: '#374151', fontWeight: 500 }}>{item.materialName || 'N/A'}</div>
                                                                            <div style={{ background: '#fef3c7', padding: '2px 6px', borderRadius: '4px', fontFamily: 'monospace', fontWeight: 700, color: '#d97706', fontSize: '0.7rem', textAlign: 'center' }}>{item.arNo || 'N/A'}</div>
                                                                            <div style={{ color: '#7c3aed', fontWeight: 600, textAlign: 'right' }}>{item.quantityRequired || 0}</div>
                                                                            <div style={{ color: '#0891b2', fontWeight: 600, textAlign: 'right' }}>{item.quantityToIssue || 0}</div>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                            {sortedBatchGroups.length > 100 && (
                                                <div style={{ padding: '12px 16px', textAlign: 'center', background: '#f3f4f6', color: '#6b7280', fontSize: '0.8rem' }}>
                                                    Showing first 100 of {sortedBatchGroups.length} batches
                                                </div>
                                            )}
                                        </div>
                                    );
                                })()
                            ) : (
                                /* Unmatched: Show batches missing RM data - Table or File view */
                                (() => {
                                    // Toggle sorting function
                                    const toggleRmSort = (column: string) => {
                                        if (rmSortColumn === column) {
                                            setRmSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
                                        } else {
                                            setRmSortColumn(column);
                                            setRmSortDirection('asc');
                                        }
                                    };

                                    // Sort the data
                                    const sortedRmData = [...rmModalData].sort((a, b) => {
                                        const valA = a[rmSortColumn] ?? '';
                                        const valB = b[rmSortColumn] ?? '';

                                        if (typeof valA === 'number' && typeof valB === 'number') {
                                            return rmSortDirection === 'asc' ? valA - valB : valB - valA;
                                        }

                                        const strA = String(valA).toLowerCase();
                                        const strB = String(valB).toLowerCase();
                                        if (strA < strB) return rmSortDirection === 'asc' ? -1 : 1;
                                        if (strA > strB) return rmSortDirection === 'asc' ? 1 : -1;
                                        return 0;
                                    });

                                    // Group by batch for file view (for unmatched, each entry is already one batch)
                                    const groupedByBatch = new Map<string, any[]>();
                                    sortedRmData.forEach((item: any) => {
                                        const bn = item.batchNumber || 'Unknown';
                                        if (!groupedByBatch.has(bn)) {
                                            groupedByBatch.set(bn, []);
                                        }
                                        groupedByBatch.get(bn)!.push(item);
                                    });

                                    // Columns for unmatched table
                                    const columns = [
                                        { id: 'batchNumber', label: 'Batch No' },
                                        { id: 'itemCode', label: 'Item Code' },
                                        { id: 'itemName', label: 'Item Name' },
                                        { id: 'mfgDate', label: 'Mfg Date' },
                                        { id: 'expiryDate', label: 'Expiry' },
                                        { id: 'batchSize', label: 'Batch Size' },
                                        { id: 'department', label: 'Dept' },
                                        { id: 'make', label: 'Make' },
                                    ];

                                    return rmViewMode === 'table' ? (
                                        // TABLE VIEW for unmatched
                                        <div style={{
                                            background: '#f9fafb',
                                            borderRadius: '12px',
                                            border: '1px solid #e5e7eb',
                                            overflow: 'hidden',
                                        }}>
                                            <div style={{ overflowX: 'auto', maxHeight: '500px', overflowY: 'auto' }}>
                                                <table style={{ width: '100%', minWidth: '1000px', borderCollapse: 'collapse' }}>
                                                    <thead style={{ position: 'sticky', top: 0, zIndex: 5 }}>
                                                        <tr style={{ background: '#fef2f2', borderBottom: '2px solid #fecaca' }}>
                                                            {columns.map(col => (
                                                                <th
                                                                    key={col.id}
                                                                    onClick={() => toggleRmSort(col.id)}
                                                                    style={{
                                                                        padding: '10px 8px',
                                                                        textAlign: 'left',
                                                                        fontWeight: 600,
                                                                        fontSize: '0.75rem',
                                                                        color: rmSortColumn === col.id ? '#dc2626' : '#4b5563',
                                                                        cursor: 'pointer',
                                                                        whiteSpace: 'nowrap',
                                                                        background: '#fef2f2',
                                                                        transition: 'all 0.2s',
                                                                        userSelect: 'none',
                                                                    }}
                                                                >
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                        {col.label}
                                                                        <span style={{ fontSize: '0.7rem', opacity: rmSortColumn === col.id ? 1 : 0.3 }}>
                                                                            {rmSortColumn === col.id ? (rmSortDirection === 'asc' ? '↑' : '↓') : '↕'}
                                                                        </span>
                                                                    </div>
                                                                </th>
                                                            ))}
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {sortedRmData.slice(0, 500).map((item: any, idx: number) => (
                                                            <tr
                                                                key={idx}
                                                                style={{
                                                                    background: idx % 2 === 0 ? 'white' : '#fafafa',
                                                                    borderBottom: '1px solid #f3f4f6',
                                                                    transition: 'background 0.15s',
                                                                }}
                                                                onMouseEnter={e => e.currentTarget.style.background = '#fef2f2'}
                                                                onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? 'white' : '#fafafa'}
                                                            >
                                                                <td style={{ padding: '8px', fontFamily: 'monospace', fontWeight: 700, color: '#dc2626', fontSize: '0.85rem' }}>{item.batchNumber || 'N/A'}</td>
                                                                <td style={{ padding: '8px', fontFamily: 'monospace', fontSize: '0.7rem', color: '#6b7280' }}>{item.itemCode || 'N/A'}</td>
                                                                <td style={{ padding: '8px', color: '#374151', fontWeight: 500, fontSize: '0.8rem', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.itemName}>{item.itemName || 'N/A'}</td>
                                                                <td style={{ padding: '8px', fontSize: '0.75rem', color: '#6b7280' }}>{item.mfgDate || 'N/A'}</td>
                                                                <td style={{ padding: '8px', fontSize: '0.75rem', color: '#dc2626', fontWeight: 600 }}>{item.expiryDate || 'N/A'}</td>
                                                                <td style={{ padding: '8px', color: '#7c3aed', fontWeight: 600, fontSize: '0.8rem' }}>{item.batchSize || 'N/A'}</td>
                                                                <td style={{ padding: '8px', fontSize: '0.75rem', color: '#0891b2' }}>{item.department || 'N/A'}</td>
                                                                <td style={{ padding: '8px', fontSize: '0.75rem', color: '#6b7280' }}>{item.make || 'N/A'}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                            {sortedRmData.length > 500 && (
                                                <div style={{ padding: '12px 16px', textAlign: 'center', background: '#fef2f2', color: '#dc2626', fontSize: '0.8rem' }}>
                                                    Showing first 500 of {sortedRmData.length} batches
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        // FILE VIEW for unmatched
                                        <div style={{
                                            background: '#f9fafb',
                                            borderRadius: '12px',
                                            border: '1px solid #e5e7eb',
                                            overflow: 'hidden',
                                        }}>
                                            {/* Sort controls */}
                                            <div style={{
                                                display: 'flex',
                                                gap: '8px',
                                                padding: '12px 16px',
                                                background: '#fef2f2',
                                                borderBottom: '1px solid #fecaca',
                                                flexWrap: 'wrap',
                                                alignItems: 'center',
                                            }}>
                                                <span style={{ fontSize: '0.75rem', color: '#dc2626', fontWeight: 600 }}>Sort by:</span>
                                                {[
                                                    { id: 'batchNumber', label: 'Batch No' },
                                                    { id: 'itemName', label: 'Item Name' },
                                                    { id: 'expiryDate', label: 'Expiry' },
                                                ].map(opt => (
                                                    <button
                                                        key={opt.id}
                                                        onClick={() => toggleRmSort(opt.id)}
                                                        style={{
                                                            padding: '4px 10px',
                                                            border: '1px solid',
                                                            borderColor: rmSortColumn === opt.id ? '#dc2626' : '#d1d5db',
                                                            borderRadius: '6px',
                                                            fontSize: '0.75rem',
                                                            fontWeight: 600,
                                                            cursor: 'pointer',
                                                            background: rmSortColumn === opt.id ? '#fee2e2' : 'white',
                                                            color: rmSortColumn === opt.id ? '#dc2626' : '#6b7280',
                                                            transition: 'all 0.2s',
                                                        }}
                                                    >
                                                        {opt.label} {rmSortColumn === opt.id ? (rmSortDirection === 'asc' ? '↑' : '↓') : ''}
                                                    </button>
                                                ))}
                                            </div>
                                            {/* Batch Groups */}
                                            <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
                                                {Array.from(groupedByBatch.entries()).slice(0, 100).map(([batchNumber, items], groupIdx) => {
                                                    const isExpanded = expandedRmBatches.has(batchNumber);
                                                    const firstItem = items[0];
                                                    return (
                                                        <div key={batchNumber} style={{ borderBottom: groupIdx < groupedByBatch.size - 1 ? '1px solid #e5e7eb' : 'none' }}>
                                                            <button
                                                                onClick={() => toggleRmBatchExpand(batchNumber)}
                                                                style={{
                                                                    width: '100%',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    gap: '12px',
                                                                    padding: '12px 16px',
                                                                    background: isExpanded ? '#fef2f2' : 'white',
                                                                    border: 'none',
                                                                    cursor: 'pointer',
                                                                    textAlign: 'left',
                                                                    transition: 'background 0.15s ease',
                                                                }}
                                                            >
                                                                <div style={{
                                                                    width: '22px', height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                    borderRadius: '5px', background: isExpanded ? '#dc2626' : '#e5e7eb', color: isExpanded ? 'white' : '#6b7280',
                                                                    transition: 'all 0.2s ease', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                                                                    fontSize: '0.7rem', fontWeight: 700, flexShrink: 0,
                                                                }}>▶</div>
                                                                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#9ca3af', minWidth: '28px' }}>#{groupIdx + 1}</div>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                    <span style={{ fontSize: '1rem' }}>📁</span>
                                                                    <span style={{ fontFamily: 'monospace', fontSize: '0.95rem', fontWeight: 700, color: '#dc2626' }}>{batchNumber}</span>
                                                                </div>
                                                                <div style={{ fontSize: '0.75rem', color: '#6b7280', background: '#fee2e2', padding: '2px 8px', borderRadius: '10px' }}>
                                                                    {items.length} item{items.length !== 1 ? 's' : ''}
                                                                </div>
                                                                {!isExpanded && <div style={{ flex: 1, fontSize: '0.8rem', color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{firstItem?.itemName || ''}</div>}
                                                            </button>
                                                            {isExpanded && (
                                                                <div style={{ background: '#fafafa', padding: '8px 16px 12px 50px' }}>
                                                                    {items.map((item: any, itemIdx: number) => (
                                                                        <div key={itemIdx} style={{
                                                                            display: 'grid',
                                                                            gridTemplateColumns: '28px 100px 1fr 80px 80px',
                                                                            gap: '10px',
                                                                            padding: '10px 12px',
                                                                            background: itemIdx % 2 === 0 ? 'white' : '#f9fafb',
                                                                            borderRadius: '8px',
                                                                            marginBottom: itemIdx < items.length - 1 ? '6px' : 0,
                                                                            border: '1px solid #fee2e2',
                                                                            fontSize: '0.8rem',
                                                                        }}>
                                                                            <div style={{ fontSize: '0.7rem', fontWeight: 600, color: '#9ca3af' }}>{itemIdx + 1}.</div>
                                                                            <div style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#6b7280' }}>{item.itemCode || 'N/A'}</div>
                                                                            <div style={{ color: '#374151', fontWeight: 500 }}>{item.itemName || 'N/A'}</div>
                                                                            <div style={{ fontSize: '0.75rem', color: '#dc2626', fontWeight: 600 }}>{item.expiryDate || 'N/A'}</div>
                                                                            <div style={{ color: '#7c3aed', fontWeight: 600 }}>{item.batchSize || 'N/A'}</div>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                            {groupedByBatch.size > 100 && (
                                                <div style={{ padding: '12px 16px', textAlign: 'center', background: '#fef2f2', color: '#dc2626', fontSize: '0.8rem' }}>
                                                    Showing first 100 of {groupedByBatch.size} batches
                                                </div>
                                            )}
                                        </div>
                                    );
                                })()
                            )}
                        </div>
                    )}

                    {rmModalData && rmModalData.length === 0 && !isRmModalLoading && !rmModalError && (
                        <div style={{
                            textAlign: 'center',
                            padding: '40px',
                            color: '#6b7280',
                        }}>
                            <span style={{ fontSize: '3rem' }}>{rmModalType === 'matched' ? '📭' : '🎉'}</span>
                            <p style={{ marginTop: '12px', fontWeight: 500 }}>
                                {rmModalType === 'matched'
                                    ? 'No RM materials found'
                                    : 'All batches have RM requisition data!'}
                            </p>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    // Per-Formula RM Data Modal Component - Shows RM data for a specific MFC
    const PerFormulaRmModal = () => {
        if (!perFormulaRmModalOpen) return null;

        // Toggle sorting function
        const toggleRmSort = (column: string) => {
            if (rmSortColumn === column) {
                setRmSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
            } else {
                setRmSortColumn(column);
                setRmSortDirection('asc');
            }
        };

        // Sort the data
        const sortedData = [...perFormulaRmData].sort((a, b) => {
            const valA = a[rmSortColumn] ?? '';
            const valB = b[rmSortColumn] ?? '';
            if (typeof valA === 'number' && typeof valB === 'number') {
                return rmSortDirection === 'asc' ? valA - valB : valB - valA;
            }
            const strA = String(valA).toLowerCase();
            const strB = String(valB).toLowerCase();
            if (strA < strB) return rmSortDirection === 'asc' ? -1 : 1;
            if (strA > strB) return rmSortDirection === 'asc' ? 1 : -1;
            return 0;
        });

        // Group by batch for file view
        const groupedByBatch = new Map<string, any[]>();
        sortedData.forEach((item: any) => {
            const bn = item.batchNumber || 'Unknown';
            if (!groupedByBatch.has(bn)) {
                groupedByBatch.set(bn, []);
            }
            groupedByBatch.get(bn)!.push(item);
        });

        const isMatched = perFormulaRmType === 'matched';
        const primaryColor = isMatched ? '#10b981' : '#dc2626';
        const bgGradient = isMatched
            ? 'linear-gradient(135deg, #059669 0%, #10b981 100%)'
            : 'linear-gradient(135deg, #dc2626 0%, #ef4444 100%)';

        const matchedColumns: { id: string; label: string; highlight?: boolean }[] = [
            { id: 'matReqNo', label: 'Slip No' },
            { id: 'batchNumber', label: 'Batch No' },
            { id: 'materialName', label: 'Material Name' },
            { id: 'materialCode', label: 'Code' },
            { id: 'arNo', label: 'AR No', highlight: true },
            { id: 'quantityRequired', label: 'Qty Req' },
            { id: 'quantityToIssue', label: 'Qty Issue' },
        ];

        const unmatchedColumns: { id: string; label: string; highlight?: boolean }[] = [
            { id: 'batchNumber', label: 'Batch No' },
            { id: 'itemCode', label: 'Item Code' },
            { id: 'itemName', label: 'Item Name' },
            { id: 'mfgDate', label: 'Mfg Date' },
            { id: 'expiryDate', label: 'Expiry' },
            { id: 'batchSize', label: 'Batch Size' },
        ];

        const columns = isMatched ? matchedColumns : unmatchedColumns;

        return (
            <div style={{
                position: 'fixed',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                zIndex: 1001,
                width: '95%',
                maxWidth: '1100px',
                maxHeight: '85vh',
                overflowY: 'auto',
                background: 'white',
                borderRadius: '16px',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                border: '2px solid #e5e7eb',
            }}>
                {/* Modal Header */}
                <div style={{
                    position: 'sticky',
                    top: 0,
                    background: bgGradient,
                    padding: '16px 24px',
                    borderRadius: '14px 14px 0 0',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    zIndex: 10,
                }}>
                    <div>
                        <h3 style={{ color: 'white', fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>
                            🧪 RM Data: {perFormulaRmMfc}
                        </h3>
                        <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: '0.85rem', marginTop: '4px' }}>
                            {perFormulaRmFormulaName} • {isMatched ? `✓ ${sortedData.length} materials` : `✗ ${sortedData.length} batches without RM`}
                        </p>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        {/* View Mode Toggle */}
                        <div style={{
                            display: 'flex',
                            background: 'rgba(255,255,255,0.2)',
                            borderRadius: '8px',
                            padding: '3px',
                        }}>
                            <button
                                onClick={() => setRmViewMode('table')}
                                style={{
                                    padding: '6px 12px',
                                    border: 'none',
                                    borderRadius: '6px',
                                    fontSize: '0.8rem',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    background: rmViewMode === 'table' ? 'white' : 'transparent',
                                    color: rmViewMode === 'table' ? primaryColor : 'white',
                                    transition: 'all 0.2s',
                                }}
                            >
                                📊 Table
                            </button>
                            <button
                                onClick={() => setRmViewMode('file')}
                                style={{
                                    padding: '6px 12px',
                                    border: 'none',
                                    borderRadius: '6px',
                                    fontSize: '0.8rem',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    background: rmViewMode === 'file' ? 'white' : 'transparent',
                                    color: rmViewMode === 'file' ? primaryColor : 'white',
                                    transition: 'all 0.2s',
                                }}
                            >
                                📁 File
                            </button>
                        </div>
                        <button
                            onClick={closePerFormulaRmModal}
                            style={{
                                background: 'rgba(255,255,255,0.2)',
                                border: 'none',
                                borderRadius: '8px',
                                padding: '8px 12px',
                                color: 'white',
                                fontSize: '1rem',
                                cursor: 'pointer',
                                fontWeight: 600,
                            }}
                        >
                            ✕ Close
                        </button>
                    </div>
                </div>

                {/* Modal Body */}
                <div style={{ padding: '20px 24px' }}>
                    {perFormulaRmLoading && (
                        <div style={{ textAlign: 'center', padding: '40px' }}>
                            <svg className="animate-spin" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={primaryColor} strokeWidth="2">
                                <path d="M21 12a9 9 0 11-6.219-8.56" strokeLinecap="round" />
                            </svg>
                            <p style={{ marginTop: '12px', color: '#6b7280' }}>Loading RM data...</p>
                        </div>
                    )}

                    {perFormulaRmError && (
                        <div style={{ background: '#fef2f2', padding: '16px', borderRadius: '8px', textAlign: 'center' }}>
                            <p style={{ color: '#dc2626', fontWeight: 600 }}>{perFormulaRmError}</p>
                        </div>
                    )}

                    {!perFormulaRmLoading && !perFormulaRmError && sortedData.length > 0 && (
                        rmViewMode === 'table' ? (
                            // TABLE VIEW
                            <div style={{
                                background: '#f9fafb',
                                borderRadius: '12px',
                                border: '1px solid #e5e7eb',
                                overflow: 'hidden',
                            }}>
                                <div style={{ overflowX: 'auto', maxHeight: '400px', overflowY: 'auto' }}>
                                    <table style={{ width: '100%', minWidth: '900px', borderCollapse: 'collapse' }}>
                                        <thead style={{ position: 'sticky', top: 0, zIndex: 5 }}>
                                            <tr style={{
                                                background: isMatched ? '#f0fdf4' : '#fef2f2',
                                                borderBottom: `2px solid ${isMatched ? '#bbf7d0' : '#fecaca'}`,
                                            }}>
                                                {columns.map(col => (
                                                    <th
                                                        key={col.id}
                                                        onClick={() => toggleRmSort(col.id)}
                                                        style={{
                                                            padding: '10px 8px',
                                                            textAlign: 'left',
                                                            fontWeight: 600,
                                                            fontSize: '0.75rem',
                                                            color: rmSortColumn === col.id ? primaryColor : '#4b5563',
                                                            cursor: 'pointer',
                                                            whiteSpace: 'nowrap',
                                                            background: col.highlight ? '#fef3c7' : 'inherit',
                                                            transition: 'all 0.2s',
                                                            userSelect: 'none',
                                                        }}
                                                    >
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                            {col.label}
                                                            <span style={{ fontSize: '0.7rem', opacity: rmSortColumn === col.id ? 1 : 0.3 }}>
                                                                {rmSortColumn === col.id ? (rmSortDirection === 'asc' ? '↑' : '↓') : '↕'}
                                                            </span>
                                                        </div>
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {sortedData.slice(0, 300).map((item: any, idx: number) => (
                                                <tr
                                                    key={idx}
                                                    style={{
                                                        background: idx % 2 === 0 ? 'white' : '#fafafa',
                                                        borderBottom: '1px solid #f3f4f6',
                                                        transition: 'background 0.15s',
                                                    }}
                                                    onMouseEnter={e => e.currentTarget.style.background = isMatched ? '#f0fdf4' : '#fef2f2'}
                                                    onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? 'white' : '#fafafa'}
                                                >
                                                    {isMatched ? (
                                                        <>
                                                            <td style={{ padding: '8px', fontSize: '0.75rem', fontFamily: 'monospace', color: '#6b7280' }}>{item.matReqNo || 'N/A'}</td>
                                                            <td style={{ padding: '8px', fontFamily: 'monospace', fontWeight: 600, color: '#059669', fontSize: '0.8rem' }}>{item.batchNumber || 'N/A'}</td>
                                                            <td style={{ padding: '8px', color: '#374151', fontWeight: 500, fontSize: '0.8rem', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.materialName}>{item.materialName || 'N/A'}</td>
                                                            <td style={{ padding: '8px', fontFamily: 'monospace', fontSize: '0.7rem', color: '#6b7280' }}>{item.materialCode || 'N/A'}</td>
                                                            <td style={{ padding: '8px', background: '#fef3c7', fontFamily: 'monospace', fontWeight: 700, color: '#d97706', fontSize: '0.75rem' }}>{item.arNo || 'N/A'}</td>
                                                            <td style={{ padding: '8px', color: '#7c3aed', fontWeight: 600, fontSize: '0.8rem' }}>{item.quantityRequired || 0}</td>
                                                            <td style={{ padding: '8px', color: '#0891b2', fontWeight: 600, fontSize: '0.8rem' }}>{item.quantityToIssue || 0}</td>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <td style={{ padding: '8px', fontFamily: 'monospace', fontWeight: 700, color: '#dc2626', fontSize: '0.85rem' }}>{item.batchNumber || 'N/A'}</td>
                                                            <td style={{ padding: '8px', fontFamily: 'monospace', fontSize: '0.7rem', color: '#6b7280' }}>{item.itemCode || 'N/A'}</td>
                                                            <td style={{ padding: '8px', color: '#374151', fontWeight: 500, fontSize: '0.8rem', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.itemName}>{item.itemName || 'N/A'}</td>
                                                            <td style={{ padding: '8px', fontSize: '0.75rem', color: '#6b7280' }}>{item.mfgDate || 'N/A'}</td>
                                                            <td style={{ padding: '8px', fontSize: '0.75rem', color: '#dc2626', fontWeight: 600 }}>{item.expiryDate || 'N/A'}</td>
                                                            <td style={{ padding: '8px', color: '#7c3aed', fontWeight: 600, fontSize: '0.8rem' }}>{item.batchSize || 'N/A'}</td>
                                                        </>
                                                    )}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ) : (
                            // FILE VIEW
                            <div style={{
                                background: '#f9fafb',
                                borderRadius: '12px',
                                border: '1px solid #e5e7eb',
                                overflow: 'hidden',
                            }}>
                                {/* Sort controls */}
                                <div style={{
                                    display: 'flex',
                                    gap: '8px',
                                    padding: '12px 16px',
                                    background: isMatched ? '#f0fdf4' : '#fef2f2',
                                    borderBottom: `1px solid ${isMatched ? '#bbf7d0' : '#fecaca'}`,
                                    flexWrap: 'wrap',
                                    alignItems: 'center',
                                }}>
                                    <span style={{ fontSize: '0.75rem', color: primaryColor, fontWeight: 600 }}>Sort by:</span>
                                    {[
                                        { id: 'batchNumber', label: 'Batch No' },
                                        { id: isMatched ? 'materialName' : 'itemName', label: isMatched ? 'Material' : 'Item' },
                                    ].map(opt => (
                                        <button
                                            key={opt.id}
                                            onClick={() => toggleRmSort(opt.id)}
                                            style={{
                                                padding: '4px 10px',
                                                border: '1px solid',
                                                borderColor: rmSortColumn === opt.id ? primaryColor : '#d1d5db',
                                                borderRadius: '6px',
                                                fontSize: '0.75rem',
                                                fontWeight: 600,
                                                cursor: 'pointer',
                                                background: rmSortColumn === opt.id ? (isMatched ? '#d1fae5' : '#fee2e2') : 'white',
                                                color: rmSortColumn === opt.id ? primaryColor : '#6b7280',
                                                transition: 'all 0.2s',
                                            }}
                                        >
                                            {opt.label} {rmSortColumn === opt.id ? (rmSortDirection === 'asc' ? '↑' : '↓') : ''}
                                        </button>
                                    ))}
                                </div>
                                {/* Batch Groups */}
                                <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                                    {Array.from(groupedByBatch.entries()).slice(0, 50).map(([batchNumber, items], groupIdx) => {
                                        const isExpanded = expandedRmBatches.has(batchNumber);
                                        return (
                                            <div key={batchNumber} style={{ borderBottom: groupIdx < groupedByBatch.size - 1 ? '1px solid #e5e7eb' : 'none' }}>
                                                <button
                                                    onClick={() => toggleRmBatchExpand(batchNumber)}
                                                    style={{
                                                        width: '100%',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '12px',
                                                        padding: '12px 16px',
                                                        background: isExpanded ? (isMatched ? '#ecfdf5' : '#fef2f2') : 'white',
                                                        border: 'none',
                                                        cursor: 'pointer',
                                                        textAlign: 'left',
                                                        transition: 'background 0.15s ease',
                                                    }}
                                                >
                                                    <div style={{
                                                        width: '22px', height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        borderRadius: '5px', background: isExpanded ? primaryColor : '#e5e7eb', color: isExpanded ? 'white' : '#6b7280',
                                                        transition: 'all 0.2s ease', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                                                        fontSize: '0.7rem', fontWeight: 700, flexShrink: 0,
                                                    }}>▶</div>
                                                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#9ca3af', minWidth: '28px' }}>#{groupIdx + 1}</div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <span style={{ fontSize: '1rem' }}>📁</span>
                                                        <span style={{ fontFamily: 'monospace', fontSize: '0.95rem', fontWeight: 700, color: primaryColor }}>{batchNumber}</span>
                                                    </div>
                                                    <div style={{ fontSize: '0.75rem', color: '#6b7280', background: isMatched ? '#d1fae5' : '#fee2e2', padding: '2px 8px', borderRadius: '10px' }}>
                                                        {items.length} {isMatched ? 'material' : 'item'}{items.length !== 1 ? 's' : ''}
                                                    </div>
                                                </button>
                                                {isExpanded && (
                                                    <div style={{ background: '#fafafa', padding: '8px 16px 12px 50px' }}>
                                                        {items.map((item: any, itemIdx: number) => (
                                                            <div key={itemIdx} style={{
                                                                display: 'grid',
                                                                gridTemplateColumns: isMatched ? '28px 1fr 100px 90px' : '28px 100px 1fr 80px',
                                                                gap: '10px',
                                                                padding: '10px 12px',
                                                                background: itemIdx % 2 === 0 ? 'white' : '#f9fafb',
                                                                borderRadius: '8px',
                                                                marginBottom: itemIdx < items.length - 1 ? '6px' : 0,
                                                                border: `1px solid ${isMatched ? '#d1fae5' : '#fee2e2'}`,
                                                                fontSize: '0.8rem',
                                                            }}>
                                                                <div style={{ fontSize: '0.7rem', fontWeight: 600, color: '#9ca3af' }}>{itemIdx + 1}.</div>
                                                                {isMatched ? (
                                                                    <>
                                                                        <div style={{ color: '#374151', fontWeight: 500 }}>{item.materialName || 'N/A'}</div>
                                                                        <div style={{ background: '#fef3c7', padding: '2px 6px', borderRadius: '4px', fontFamily: 'monospace', fontWeight: 700, color: '#d97706', fontSize: '0.7rem', textAlign: 'center' }}>{item.arNo || 'N/A'}</div>
                                                                        <div style={{ color: '#7c3aed', fontWeight: 600, textAlign: 'right' }}>{item.quantityRequired || 0}</div>
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <div style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#6b7280' }}>{item.itemCode || 'N/A'}</div>
                                                                        <div style={{ color: '#374151', fontWeight: 500 }}>{item.itemName || 'N/A'}</div>
                                                                        <div style={{ color: '#dc2626', fontWeight: 600, textAlign: 'right' }}>{item.expiryDate || 'N/A'}</div>
                                                                    </>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )
                    )}

                    {!perFormulaRmLoading && !perFormulaRmError && sortedData.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
                            <span style={{ fontSize: '3rem' }}>{isMatched ? '📭' : '🎉'}</span>
                            <p style={{ marginTop: '12px', fontWeight: 500 }}>
                                {isMatched ? 'No RM materials found for this formula' : 'All batches for this formula have RM data!'}
                            </p>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    const PerFormulaPpmModal = () => {
        if (!perFormulaPpmModalOpen) return null;

        const togglePpmSort = (column: string) => {
            if (ppmSortColumn === column) {
                setPpmSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
            } else {
                setPpmSortColumn(column);
                setPpmSortDirection('asc');
            }
        };

        const sortedData = [...perFormulaPpmData].sort((a, b) => {
            const valA = a[ppmSortColumn] ?? '';
            const valB = b[ppmSortColumn] ?? '';
            if (typeof valA === 'number' && typeof valB === 'number') {
                return ppmSortDirection === 'asc' ? valA - valB : valB - valA;
            }
            const strA = String(valA).toLowerCase();
            const strB = String(valB).toLowerCase();
            if (strA < strB) return ppmSortDirection === 'asc' ? -1 : 1;
            if (strA > strB) return ppmSortDirection === 'asc' ? 1 : -1;
            return 0;
        });

        const groupedByBatch = new Map<string, any[]>();
        sortedData.forEach((item: any) => {
            const bn = item.batchNumber || 'Unknown';
            if (!groupedByBatch.has(bn)) {
                groupedByBatch.set(bn, []);
            }
            groupedByBatch.get(bn)!.push(item);
        });

        const isMatched = perFormulaPpmType === 'matched';
        const primaryColor = isMatched ? '#2563eb' : '#dc2626';
        const bgGradient = isMatched
            ? 'linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)'
            : 'linear-gradient(135deg, #dc2626 0%, #ef4444 100%)';

        const matchedColumns: ColumnDef[] = [
            { id: 'matReqNo', label: 'Slip No' },
            { id: 'batchNumber', label: 'Batch No' },
            { id: 'materialName', label: 'Material Name' },
            { id: 'materialCode', label: 'Code' },
            { id: 'arNo', label: 'AR No', highlight: true },
            { id: 'quantityRequired', label: 'Qty Req' },
            { id: 'quantityToIssue', label: 'Qty Issue' },
        ];

        const unmatchedColumns: ColumnDef[] = [
            { id: 'batchNumber', label: 'Batch No' },
            { id: 'itemCode', label: 'Item Code' },
            { id: 'itemName', label: 'Item Name' },
            { id: 'mfgDate', label: 'Mfg Date' },
            { id: 'expiryDate', label: 'Expiry' },
            { id: 'batchSize', label: 'Batch Size' },
        ];

        const columns = isMatched ? matchedColumns : unmatchedColumns;

        return (
            <div style={{
                position: 'fixed',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                zIndex: 1001,
                width: '95%',
                maxWidth: '1100px',
                maxHeight: '85vh',
                overflowY: 'auto',
                background: 'white',
                borderRadius: '16px',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                border: '2px solid #e5e7eb',
            }}>
                <div style={{
                    position: 'sticky',
                    top: 0,
                    background: bgGradient,
                    padding: '16px 24px',
                    borderRadius: '14px 14px 0 0',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    zIndex: 10,
                }}>
                    <div>
                        <h3 style={{ color: 'white', fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>
                            📦 PPM Data: {perFormulaPpmMfc}
                        </h3>
                        <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: '0.85rem', marginTop: '4px' }}>
                            {perFormulaPpmFormulaName} • {isMatched ? `✓ ${sortedData.length} materials` : `✗ ${sortedData.length} batches without PPM`}
                        </p>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <div style={{
                            display: 'flex',
                            background: 'rgba(255,255,255,0.2)',
                            borderRadius: '8px',
                            padding: '3px',
                        }}>
                            <button
                                onClick={() => setPpmViewMode('table')}
                                style={{
                                    padding: '6px 12px',
                                    border: 'none',
                                    borderRadius: '6px',
                                    fontSize: '0.8rem',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    background: ppmViewMode === 'table' ? 'white' : 'transparent',
                                    color: ppmViewMode === 'table' ? primaryColor : 'white',
                                    transition: 'all 0.2s',
                                }}
                            >
                                📊 Table
                            </button>
                            <button
                                onClick={() => setPpmViewMode('file')}
                                style={{
                                    padding: '6px 12px',
                                    border: 'none',
                                    borderRadius: '6px',
                                    fontSize: '0.8rem',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    background: ppmViewMode === 'file' ? 'white' : 'transparent',
                                    color: ppmViewMode === 'file' ? primaryColor : 'white',
                                    transition: 'all 0.2s',
                                }}
                            >
                                📁 File
                            </button>
                        </div>
                        <button
                            onClick={() => setPerFormulaPpmModalOpen(false)}
                            style={{
                                background: 'rgba(255,255,255,0.2)',
                                border: 'none',
                                borderRadius: '8px',
                                padding: '8px 12px',
                                color: 'white',
                                fontSize: '1rem',
                                cursor: 'pointer',
                                fontWeight: 600,
                            }}
                        >
                            ✕ Close
                        </button>
                    </div>
                </div>

                <div style={{ padding: '20px 24px' }}>
                    {perFormulaPpmLoading && (
                        <div style={{ textAlign: 'center', padding: '40px' }}>
                            <svg className="animate-spin" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={primaryColor} strokeWidth="2">
                                <path d="M21 12a9 9 0 11-6.219-8.56" strokeLinecap="round" />
                            </svg>
                            <p style={{ marginTop: '12px', color: '#6b7280' }}>Loading PPM data...</p>
                        </div>
                    )}

                    {perFormulaPpmError && (
                        <div style={{ background: '#fef2f2', padding: '16px', borderRadius: '8px', textAlign: 'center' }}>
                            <p style={{ color: '#dc2626', fontWeight: 600 }}>{perFormulaPpmError}</p>
                        </div>
                    )}

                    {!perFormulaPpmLoading && !perFormulaPpmError && sortedData.length > 0 && (
                        ppmViewMode === 'table' ? (
                            <div style={{ background: '#f9fafb', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                                <div style={{ overflowX: 'auto', maxHeight: '400px', overflowY: 'auto' }}>
                                    <table style={{ width: '100%', minWidth: '900px', borderCollapse: 'collapse' }}>
                                        <thead style={{ position: 'sticky', top: 0, zIndex: 5 }}>
                                            <tr style={{ background: isMatched ? '#eff6ff' : '#fef2f2', borderBottom: `2px solid ${isMatched ? '#bfdbfe' : '#fecaca'}` }}>
                                                {columns.map(col => (
                                                    <th
                                                        key={col.id}
                                                        onClick={() => togglePpmSort(col.id)}
                                                        style={{
                                                            padding: '10px 8px',
                                                            textAlign: 'left',
                                                            fontWeight: 600,
                                                            fontSize: '0.75rem',
                                                            color: ppmSortColumn === col.id ? primaryColor : '#4b5563',
                                                            cursor: 'pointer',
                                                            whiteSpace: 'nowrap',
                                                            background: col.highlight ? '#fef3c7' : 'inherit',
                                                            transition: 'all 0.2s',
                                                            userSelect: 'none',
                                                        }}
                                                    >
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                            {col.label}
                                                            <span style={{ fontSize: '0.7rem', opacity: ppmSortColumn === col.id ? 1 : 0.3 }}>
                                                                {ppmSortColumn === col.id ? (ppmSortDirection === 'asc' ? '↑' : '↓') : '↕'}
                                                            </span>
                                                        </div>
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {sortedData.slice(0, 300).map((item: any, idx: number) => (
                                                <tr key={idx} style={{ background: idx % 2 === 0 ? 'white' : '#fafafa', borderBottom: '1px solid #f3f4f6' }}>
                                                    {isMatched ? (
                                                        <>
                                                            <td style={{ padding: '8px', fontSize: '0.75rem', fontFamily: 'monospace', color: '#6b7280' }}>{item.matReqNo || 'N/A'}</td>
                                                            <td style={{ padding: '8px', fontFamily: 'monospace', fontWeight: 600, color: '#2563eb', fontSize: '0.8rem' }}>{item.batchNumber || 'N/A'}</td>
                                                            <td style={{ padding: '8px', color: '#374151', fontWeight: 500, fontSize: '0.8rem', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.materialName}>{item.materialName || 'N/A'}</td>
                                                            <td style={{ padding: '8px', fontFamily: 'monospace', fontSize: '0.7rem', color: '#6b7280' }}>{item.materialCode || 'N/A'}</td>
                                                            <td style={{ padding: '8px', background: '#fef3c7', fontFamily: 'monospace', fontWeight: 700, color: '#d97706', fontSize: '0.75rem' }}>{item.arNo || 'N/A'}</td>
                                                            <td style={{ padding: '8px', color: '#7c3aed', fontWeight: 600, fontSize: '0.8rem' }}>{item.quantityRequired || 0}</td>
                                                            <td style={{ padding: '8px', color: '#0891b2', fontWeight: 600, fontSize: '0.8rem' }}>{item.quantityToIssue || 0}</td>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <td style={{ padding: '8px', fontFamily: 'monospace', fontWeight: 700, color: '#dc2626', fontSize: '0.85rem' }}>{item.batchNumber || 'N/A'}</td>
                                                            <td style={{ padding: '8px', fontFamily: 'monospace', fontSize: '0.7rem', color: '#6b7280' }}>{item.itemCode || 'N/A'}</td>
                                                            <td style={{ padding: '8px', color: '#374151', fontWeight: 500, fontSize: '0.8rem', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.itemName}>{item.itemName || 'N/A'}</td>
                                                            <td style={{ padding: '8px', fontSize: '0.75rem', color: '#6b7280' }}>{item.mfgDate || 'N/A'}</td>
                                                            <td style={{ padding: '8px', fontSize: '0.75rem', color: '#dc2626', fontWeight: 600 }}>{item.expiryDate || 'N/A'}</td>
                                                            <td style={{ padding: '8px', color: '#7c3aed', fontWeight: 600, fontSize: '0.8rem' }}>{item.batchSize || 'N/A'}</td>
                                                        </>
                                                    )}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ) : (
                            <div style={{ background: '#f9fafb', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                                <div style={{ display: 'flex', gap: '8px', padding: '12px 16px', background: isMatched ? '#eff6ff' : '#fef2f2', borderBottom: `1px solid ${isMatched ? '#bfdbfe' : '#fecaca'}`, alignItems: 'center' }}>
                                    <span style={{ fontSize: '0.75rem', color: primaryColor, fontWeight: 600 }}>Sort by:</span>
                                    {[{ id: 'batchNumber', label: 'Batch No' }, { id: isMatched ? 'materialName' : 'itemName', label: isMatched ? 'Material' : 'Item' }].map(opt => (
                                        <button
                                            key={opt.id}
                                            onClick={() => togglePpmSort(opt.id)}
                                            style={{
                                                padding: '4px 10px',
                                                border: '1px solid',
                                                borderColor: ppmSortColumn === opt.id ? primaryColor : '#d1d5db',
                                                borderRadius: '6px',
                                                fontSize: '0.75rem',
                                                fontWeight: 600,
                                                cursor: 'pointer',
                                                background: ppmSortColumn === opt.id ? (isMatched ? '#dbeafe' : '#fee2e2') : 'white',
                                                color: ppmSortColumn === opt.id ? primaryColor : '#6b7280',
                                            }}
                                        >
                                            {opt.label} {ppmSortColumn === opt.id ? (ppmSortDirection === 'asc' ? '↑' : '↓') : ''}
                                        </button>
                                    ))}
                                </div>
                                <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                                    {Array.from(groupedByBatch.entries()).slice(0, 50).map(([batchNumber, items], groupIdx) => {
                                        const isExpanded = expandedPpmBatches.has(batchNumber);
                                        return (
                                            <div key={batchNumber} style={{ borderBottom: '1px solid #e5e7eb' }}>
                                                <button
                                                    onClick={() => togglePpmBatchExpand(batchNumber)}
                                                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', background: isExpanded ? (isMatched ? '#f0f7ff' : '#fef2f2') : 'white', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                                                >
                                                    <div style={{ width: '22px', height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '5px', background: isExpanded ? primaryColor : '#e5e7eb', color: isExpanded ? 'white' : '#6b7280', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', fontSize: '0.7rem', fontWeight: 700 }}>▶</div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <span style={{ fontSize: '1rem' }}>📁</span>
                                                        <span style={{ fontFamily: 'monospace', fontSize: '0.95rem', fontWeight: 700, color: primaryColor }}>{batchNumber}</span>
                                                    </div>
                                                    <div style={{ fontSize: '0.75rem', color: '#6b7280', background: isMatched ? '#dbeafe' : '#fee2e2', padding: '2px 8px', borderRadius: '10px' }}>{items.length} {isMatched ? 'material' : 'item'}{items.length !== 1 ? 's' : ''}</div>
                                                </button>
                                                {isExpanded && (
                                                    <div style={{ background: '#fafafa', padding: '8px 16px 12px 50px' }}>
                                                        {items.map((item: any, itemIdx: number) => (
                                                            <div key={itemIdx} style={{ display: 'grid', gridTemplateColumns: isMatched ? '28px 1fr 100px 90px' : '28px 100px 1fr 80px', gap: '10px', padding: '10px 12px', background: 'white', borderRadius: '8px', marginBottom: '6px', border: `1px solid ${isMatched ? '#bfdbfe' : '#fecaca'}`, fontSize: '0.8rem' }}>
                                                                <div style={{ fontSize: '0.7rem', fontWeight: 600, color: '#9ca3af' }}>{itemIdx + 1}.</div>
                                                                {isMatched ? (
                                                                    <>
                                                                        <div style={{ color: '#374151', fontWeight: 500 }}>{item.materialName || 'N/A'}</div>
                                                                        <div style={{ background: '#fef3c7', padding: '2px 6px', borderRadius: '4px', fontFamily: 'monospace', fontWeight: 700, color: '#d97706', fontSize: '0.7rem', textAlign: 'center' }}>{item.arNo || 'N/A'}</div>
                                                                        <div style={{ color: '#7c3aed', fontWeight: 600, textAlign: 'right' }}>{item.quantityRequired || 0}</div>
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <div style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#6b7280' }}>{item.itemCode || 'N/A'}</div>
                                                                        <div style={{ color: '#374151', fontWeight: 500 }}>{item.itemName || 'N/A'}</div>
                                                                        <div style={{ color: '#dc2626', fontWeight: 600, textAlign: 'right' }}>{item.expiryDate || 'N/A'}</div>
                                                                    </>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )
                    )}

                    {!perFormulaPpmLoading && !perFormulaPpmError && sortedData.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
                            <span style={{ fontSize: '3rem' }}>{isMatched ? '📭' : '🎉'}</span>
                            <p style={{ marginTop: '12px', fontWeight: 500 }}>
                                {isMatched ? 'No PPM materials found for this formula' : 'All batches for this formula have PPM data!'}
                            </p>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    const PerFormulaPmModal = () => {
        if (!perFormulaPmModalOpen) return null;

        const togglePmSort = (column: string) => {
            if (pmSortColumn === column) {
                setPmSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
            } else {
                setPmSortColumn(column);
                setPmSortDirection('asc');
            }
        };

        const sortedData = [...perFormulaPmData].sort((a, b) => {
            const valA = a[pmSortColumn] ?? '';
            const valB = b[pmSortColumn] ?? '';
            if (typeof valA === 'number' && typeof valB === 'number') {
                return pmSortDirection === 'asc' ? valA - valB : valB - valA;
            }
            const strA = String(valA).toLowerCase();
            const strB = String(valB).toLowerCase();
            if (strA < strB) return pmSortDirection === 'asc' ? -1 : 1;
            if (strA > strB) return pmSortDirection === 'asc' ? 1 : -1;
            return 0;
        });

        const groupedByBatch = new Map<string, any[]>();
        sortedData.forEach((item: any) => {
            const bn = item.batchNumber || 'Unknown';
            if (!groupedByBatch.has(bn)) {
                groupedByBatch.set(bn, []);
            }
            groupedByBatch.get(bn)!.push(item);
        });

        const isMatched = perFormulaPmType === 'matched';
        const primaryColor = isMatched ? '#7c3aed' : '#dc2626';
        const bgGradient = isMatched
            ? 'linear-gradient(135deg, #6d28d9 0%, #7c3aed 100%)'
            : 'linear-gradient(135deg, #dc2626 0%, #ef4444 100%)';

        const matchedColumns: ColumnDef[] = [
            { id: 'matReqNo', label: 'Slip No' },
            { id: 'batchNumber', label: 'Batch No' },
            { id: 'materialName', label: 'Material Name' },
            { id: 'materialCode', label: 'Code' },
            { id: 'arNo', label: 'AR No', highlight: true },
            { id: 'quantityRequired', label: 'Qty Req' },
            { id: 'quantityToIssue', label: 'Qty Issue' },
        ];

        const unmatchedColumns: ColumnDef[] = [
            { id: 'batchNumber', label: 'Batch No' },
            { id: 'itemCode', label: 'Item Code' },
            { id: 'itemName', label: 'Item Name' },
            { id: 'mfgDate', label: 'Mfg Date' },
            { id: 'expiryDate', label: 'Expiry' },
            { id: 'batchSize', label: 'Batch Size' },
        ];

        const columns = isMatched ? matchedColumns : unmatchedColumns;

        return (
            <div style={{
                position: 'fixed',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                zIndex: 1001,
                width: '95%',
                maxWidth: '1100px',
                maxHeight: '85vh',
                overflowY: 'auto',
                background: 'white',
                borderRadius: '16px',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                border: '2px solid #e5e7eb',
            }}>
                <div style={{
                    position: 'sticky',
                    top: 0,
                    background: bgGradient,
                    padding: '16px 24px',
                    borderRadius: '14px 14px 0 0',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    zIndex: 10,
                }}>
                    <div>
                        <h3 style={{ color: 'white', fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>
                            📦 PM Data: {perFormulaPmMfc}
                        </h3>
                        <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: '0.85rem', marginTop: '4px' }}>
                            {perFormulaPmFormulaName} • {isMatched ? `✓ ${sortedData.length} materials` : `✗ ${sortedData.length} batches without PM`}
                        </p>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <div style={{
                            display: 'flex',
                            background: 'rgba(255,255,255,0.2)',
                            borderRadius: '8px',
                            padding: '3px',
                        }}>
                            <button
                                onClick={() => setPmViewMode('table')}
                                style={{
                                    padding: '6px 12px',
                                    border: 'none',
                                    borderRadius: '6px',
                                    fontSize: '0.8rem',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    background: pmViewMode === 'table' ? 'white' : 'transparent',
                                    color: pmViewMode === 'table' ? primaryColor : 'white',
                                    transition: 'all 0.2s',
                                }}
                            >
                                📊 Table
                            </button>
                            <button
                                onClick={() => setPmViewMode('file')}
                                style={{
                                    padding: '6px 12px',
                                    border: 'none',
                                    borderRadius: '6px',
                                    fontSize: '0.8rem',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    background: pmViewMode === 'file' ? 'white' : 'transparent',
                                    color: pmViewMode === 'file' ? primaryColor : 'white',
                                    transition: 'all 0.2s',
                                }}
                            >
                                📁 File
                            </button>
                        </div>
                        <button
                            onClick={() => setPerFormulaPmModalOpen(false)}
                            style={{
                                background: 'rgba(255,255,255,0.2)',
                                border: 'none',
                                borderRadius: '8px',
                                padding: '8px 12px',
                                color: 'white',
                                fontSize: '1rem',
                                cursor: 'pointer',
                                fontWeight: 600,
                            }}
                        >
                            ✕ Close
                        </button>
                    </div>
                </div>

                <div style={{ padding: '20px 24px' }}>
                    {perFormulaPmLoading && (
                        <div style={{ textAlign: 'center', padding: '40px' }}>
                            <svg className="animate-spin" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={primaryColor} strokeWidth="2">
                                <path d="M21 12a9 9 0 11-6.219-8.56" strokeLinecap="round" />
                            </svg>
                            <p style={{ marginTop: '12px', color: '#6b7280' }}>Loading PM data...</p>
                        </div>
                    )}

                    {perFormulaPmError && (
                        <div style={{ background: '#fef2f2', padding: '16px', borderRadius: '8px', textAlign: 'center' }}>
                            <p style={{ color: '#dc2626', fontWeight: 600 }}>{perFormulaPmError}</p>
                        </div>
                    )}

                    {!perFormulaPmLoading && !perFormulaPmError && sortedData.length > 0 && (
                        pmViewMode === 'table' ? (
                            <div style={{ background: '#f9fafb', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                                <div style={{ overflowX: 'auto', maxHeight: '400px', overflowY: 'auto' }}>
                                    <table style={{ width: '100%', minWidth: '900px', borderCollapse: 'collapse' }}>
                                        <thead style={{ position: 'sticky', top: 0, zIndex: 5 }}>
                                            <tr style={{ background: isMatched ? '#f5f3ff' : '#fef2f2', borderBottom: `2px solid ${isMatched ? '#ddd6fe' : '#fecaca'}` }}>
                                                {columns.map(col => (
                                                    <th
                                                        key={col.id}
                                                        onClick={() => togglePmSort(col.id)}
                                                        style={{
                                                            padding: '10px 8px',
                                                            textAlign: 'left',
                                                            fontWeight: 600,
                                                            fontSize: '0.75rem',
                                                            color: pmSortColumn === col.id ? primaryColor : '#4b5563',
                                                            cursor: 'pointer',
                                                            whiteSpace: 'nowrap',
                                                            background: col.highlight ? '#fef3c7' : 'inherit',
                                                            transition: 'all 0.2s',
                                                            userSelect: 'none',
                                                        }}
                                                    >
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                            {col.label}
                                                            <span style={{ fontSize: '0.7rem', opacity: pmSortColumn === col.id ? 1 : 0.3 }}>
                                                                {pmSortColumn === col.id ? (pmSortDirection === 'asc' ? '↑' : '↓') : '↕'}
                                                            </span>
                                                        </div>
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {sortedData.slice(0, 300).map((item: any, idx: number) => (
                                                <tr key={idx} style={{ background: idx % 2 === 0 ? 'white' : '#fafafa', borderBottom: '1px solid #f3f4f6' }}>
                                                    {isMatched ? (
                                                        <>
                                                            <td style={{ padding: '8px', fontSize: '0.75rem', fontFamily: 'monospace', color: '#6b7280' }}>{item.matReqNo || 'N/A'}</td>
                                                            <td style={{ padding: '8px', fontFamily: 'monospace', fontWeight: 600, color: '#7c3aed', fontSize: '0.8rem' }}>{item.batchNumber || 'N/A'}</td>
                                                            <td style={{ padding: '8px', color: '#374151', fontWeight: 500, fontSize: '0.8rem', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.materialName}>{item.materialName || 'N/A'}</td>
                                                            <td style={{ padding: '8px', fontFamily: 'monospace', fontSize: '0.7rem', color: '#6b7280' }}>{item.materialCode || 'N/A'}</td>
                                                            <td style={{ padding: '8px', background: '#fef3c7', fontFamily: 'monospace', fontWeight: 700, color: '#d97706', fontSize: '0.75rem' }}>{item.arNo || 'N/A'}</td>
                                                            <td style={{ padding: '8px', color: '#7c3aed', fontWeight: 600, fontSize: '0.8rem' }}>{item.quantityRequired || 0}</td>
                                                            <td style={{ padding: '8px', color: '#0891b2', fontWeight: 600, fontSize: '0.8rem' }}>{item.quantityToIssue || 0}</td>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <td style={{ padding: '8px', fontFamily: 'monospace', fontWeight: 700, color: '#dc2626', fontSize: '0.85rem' }}>{item.batchNumber || 'N/A'}</td>
                                                            <td style={{ padding: '8px', fontFamily: 'monospace', fontSize: '0.7rem', color: '#6b7280' }}>{item.itemCode || 'N/A'}</td>
                                                            <td style={{ padding: '8px', color: '#374151', fontWeight: 500, fontSize: '0.8rem', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.itemName}>{item.itemName || 'N/A'}</td>
                                                            <td style={{ padding: '8px', fontSize: '0.75rem', color: '#6b7280' }}>{item.mfgDate || 'N/A'}</td>
                                                            <td style={{ padding: '8px', fontSize: '0.75rem', color: '#dc2626', fontWeight: 600 }}>{item.expiryDate || 'N/A'}</td>
                                                            <td style={{ padding: '8px', color: '#7c3aed', fontWeight: 600, fontSize: '0.8rem' }}>{item.batchSize || 'N/A'}</td>
                                                        </>
                                                    )}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ) : (
                            <div style={{ background: '#f9fafb', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                                <div style={{ display: 'flex', gap: '8px', padding: '12px 16px', background: isMatched ? '#f5f3ff' : '#fef2f2', borderBottom: `1px solid ${isMatched ? '#ddd6fe' : '#fecaca'}`, alignItems: 'center' }}>
                                    <span style={{ fontSize: '0.75rem', color: primaryColor, fontWeight: 600 }}>Sort by:</span>
                                    {[{ id: 'batchNumber', label: 'Batch No' }, { id: isMatched ? 'materialName' : 'itemName', label: isMatched ? 'Material' : 'Item' }].map(opt => (
                                        <button
                                            key={opt.id}
                                            onClick={() => togglePmSort(opt.id)}
                                            style={{
                                                padding: '4px 10px',
                                                border: '1px solid',
                                                borderColor: pmSortColumn === opt.id ? primaryColor : '#d1d5db',
                                                borderRadius: '6px',
                                                fontSize: '0.75rem',
                                                fontWeight: 600,
                                                cursor: 'pointer',
                                                background: pmSortColumn === opt.id ? (isMatched ? '#ede9fe' : '#fee2e2') : 'white',
                                                color: pmSortColumn === opt.id ? primaryColor : '#6b7280',
                                            }}
                                        >
                                            {opt.label} {pmSortColumn === opt.id ? (pmSortDirection === 'asc' ? '↑' : '↓') : ''}
                                        </button>
                                    ))}
                                </div>
                                <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                                    {Array.from(groupedByBatch.entries()).slice(0, 50).map(([batchNumber, items], groupIdx) => {
                                        const isExpanded = expandedPmBatches.has(batchNumber);
                                        return (
                                            <div key={batchNumber} style={{ borderBottom: '1px solid #e5e7eb' }}>
                                                <button
                                                    onClick={() => togglePmBatchExpand(batchNumber)}
                                                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', background: isExpanded ? (isMatched ? '#f5f3ff' : '#fef2f2') : 'white', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                                                >
                                                    <div style={{ width: '22px', height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '5px', background: isExpanded ? primaryColor : '#e5e7eb', color: isExpanded ? 'white' : '#6b7280', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', fontSize: '0.7rem', fontWeight: 700 }}>▶</div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <span style={{ fontSize: '1rem' }}>📁</span>
                                                        <span style={{ fontFamily: 'monospace', fontSize: '0.95rem', fontWeight: 700, color: primaryColor }}>{batchNumber}</span>
                                                    </div>
                                                    <div style={{ fontSize: '0.75rem', color: '#6b7280', background: isMatched ? '#ede9fe' : '#fee2e2', padding: '2px 8px', borderRadius: '10px' }}>{items.length} {isMatched ? 'material' : 'item'}{items.length !== 1 ? 's' : ''}</div>
                                                </button>
                                                {isExpanded && (
                                                    <div style={{ background: '#fafafa', padding: '8px 16px 12px 50px' }}>
                                                        {items.map((item: any, itemIdx: number) => (
                                                            <div key={itemIdx} style={{ display: 'grid', gridTemplateColumns: isMatched ? '28px 1fr 100px 90px' : '28px 100px 1fr 80px', gap: '10px', padding: '10px 12px', background: 'white', borderRadius: '8px', marginBottom: '6px', border: `1px solid ${isMatched ? '#ddd6fe' : '#fecaca'}`, fontSize: '0.8rem' }}>
                                                                <div style={{ fontSize: '0.7rem', fontWeight: 600, color: '#9ca3af' }}>{itemIdx + 1}.</div>
                                                                {isMatched ? (
                                                                    <>
                                                                        <div style={{ color: '#374151', fontWeight: 500 }}>{item.materialName || 'N/A'}</div>
                                                                        <div style={{ background: '#fef3c7', padding: '2px 6px', borderRadius: '4px', fontFamily: 'monospace', fontWeight: 700, color: '#d97706', fontSize: '0.7rem', textAlign: 'center' }}>{item.arNo || 'N/A'}</div>
                                                                        <div style={{ color: '#7c3aed', fontWeight: 600, textAlign: 'right' }}>{item.quantityRequired || 0}</div>
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <div style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#6b7280' }}>{item.itemCode || 'N/A'}</div>
                                                                        <div style={{ color: '#374151', fontWeight: 500 }}>{item.itemName || 'N/A'}</div>
                                                                        <div style={{ color: '#dc2626', fontWeight: 600, textAlign: 'right' }}>{item.expiryDate || 'N/A'}</div>
                                                                    </>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )
                    )}

                    {!perFormulaPmLoading && !perFormulaPmError && sortedData.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
                            <span style={{ fontSize: '3rem' }}>{isMatched ? '📭' : '🎉'}</span>
                            <p style={{ marginTop: '12px', fontWeight: 500 }}>
                                {isMatched ? 'No PM materials found for this formula' : 'All batches for this formula have PM data!'}
                            </p>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    // Helper function to render a formula card (reused for all sections) - Enhanced with colors
    const renderFormulaCard = (formula: FormulaRecord, index: number, sectionIndex: number = 0) => {
        const isExpanded = expandedMfc === formula._id;
        const colors = getManufacturerColor(formula.masterFormulaDetails?.manufacturer || '');
        const materialCount = formula.materials?.length || 0;
        const mfcNo = formula.masterFormulaDetails?.masterCardNo?.trim() || 'N/A';

        return (
            <div
                key={formula._id}
                style={{
                    background: isExpanded
                        ? `linear-gradient(135deg, ${colors.light} 0%, ${colors.glow} 40%, rgba(255,255,255,0.92) 100%)`
                        : `linear-gradient(135deg, ${colors.light} 0%, ${colors.glow} 50%, rgba(255,255,255,0.88) 100%)`,
                    backdropFilter: 'blur(10px)',
                    WebkitBackdropFilter: 'blur(10px)',
                    borderRadius: '16px',
                    border: isExpanded
                        ? `2px solid ${colors.border}`
                        : `1px solid ${colors.border}`,
                    overflow: 'hidden',
                    transition: 'all 0.3s ease',
                    boxShadow: isExpanded
                        ? `0 10px 40px ${colors.border}, 0 4px 16px ${colors.glow}, inset 0 1px 2px rgba(255,255,255,0.9)`
                        : `0 4px 24px ${colors.glow}, 0 2px 8px rgba(0,0,0,0.03), inset 0 1px 0 rgba(255,255,255,0.95)`,
                    position: 'relative' as const,
                }}
            >
                {/* Colored accent bar on left */}
                <div style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: '5px',
                    background: `linear-gradient(180deg, ${colors.primary} 0%, ${colors.primary}dd 100%)`,
                    borderRadius: '16px 0 0 16px',
                    boxShadow: `3px 0 16px ${colors.border}`,
                }} />

                {/* MFC Header - Always visible */}
                <button
                    onClick={() => toggleMfc(formula._id)}
                    style={{
                        width: '100%',
                        padding: '1rem 1.5rem 1rem 1.75rem',
                        background: isExpanded
                            ? `linear-gradient(135deg, ${colors.light} 0%, ${colors.glow} 60%, rgba(255,255,255,0.96) 100%)`
                            : `linear-gradient(135deg, ${colors.glow} 0%, rgba(255,255,255,0.95) 100%)`,
                        border: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '1rem',
                        textAlign: 'left',
                        transition: 'all 0.2s ease',
                    }}
                >
                    {/* Sr. No with gradient circle */}
                    <div style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '10px',
                        background: `linear-gradient(135deg, ${colors.primary}15 0%, ${colors.primary}25 100%)`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.8rem',
                        fontWeight: '700',
                        color: colors.primary,
                    }}>
                        #{sectionIndex + index + 1}
                    </div>

                    {/* Expand/Collapse Icon */}
                    <div style={{
                        width: '28px',
                        height: '28px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: '8px',
                        background: isExpanded
                            ? `linear-gradient(135deg, ${colors.primary} 0%, ${colors.primary}cc 100%)`
                            : colors.light,
                        color: isExpanded ? 'white' : colors.primary,
                        transition: 'all 0.2s ease',
                        transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                        fontSize: '0.75rem',
                        fontWeight: '700',
                        boxShadow: isExpanded ? `0 2px 8px ${colors.border}` : 'none',
                    }}>
                        ▶
                    </div>

                    {/* MFC Number */}
                    <div style={{
                        fontFamily: 'monospace',
                        fontSize: '1rem',
                        fontWeight: '700',
                        color: colors.primary,
                        minWidth: '160px',
                        padding: '4px 10px',
                        background: `${colors.primary}08`,
                        borderRadius: '6px',
                    }}>
                        {mfcNo}
                    </div>

                    {/* Product Name */}
                    <div style={{
                        flex: 1,
                        fontSize: '0.9rem',
                        fontWeight: '600',
                        color: '#1f2937',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                    }}>
                        {formula.masterFormulaDetails.productName}
                        {formula.totalBatchCount !== undefined && formula.totalBatchCount > 0 && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    openBatchListModal(
                                        getFormulaAllProductCodes(formula),
                                        formula.masterFormulaDetails.productName
                                    );
                                }}
                                style={{
                                    padding: '0.25rem 0.75rem',
                                    background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                                    color: '#fff',
                                    borderRadius: '16px',
                                    fontSize: '0.72rem',
                                    fontWeight: '700',
                                    boxShadow: '0 2px 8px rgba(16, 185, 129, 0.35)',
                                    whiteSpace: 'nowrap',
                                    border: 'none',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.transform = 'scale(1.05)';
                                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.45)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.transform = 'scale(1)';
                                    e.currentTarget.style.boxShadow = '0 2px 8px rgba(16, 185, 129, 0.35)';
                                }}
                                title="Click to view all batches"
                            >
                                📦 {formula.totalBatchCount} Batches
                            </button>
                        )}
                    </div>

                    {/* Product Code */}
                    <div style={{
                        fontFamily: 'monospace',
                        fontSize: '0.8rem',
                        color: '#6b7280',
                        minWidth: '100px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                    }}>
                        <span style={{
                            padding: '2px 8px',
                            background: '#f3f4f6',
                            borderRadius: '4px',
                        }}>
                            {formula.masterFormulaDetails.productCode}
                        </span>
                        {batchCounts[formula.masterFormulaDetails.productCode] > 0 && (
                            <span style={{
                                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                color: '#fff',
                                padding: '2px 8px',
                                borderRadius: '8px',
                                fontSize: '0.65rem',
                                fontWeight: '700',
                                boxShadow: '0 1px 4px rgba(16, 185, 129, 0.3)',
                            }}>
                                {batchCounts[formula.masterFormulaDetails.productCode]}
                            </span>
                        )}
                    </div>

                    {/* Manufacturer Tag */}
                    <div style={{
                        padding: '0.4rem 0.9rem',
                        borderRadius: '20px',
                        background: `linear-gradient(135deg, ${colors.light} 0%, ${colors.glow} 100%)`,
                        backdropFilter: 'blur(6px)',
                        color: colors.primary,
                        fontSize: '0.72rem',
                        fontWeight: '700',
                        border: `1px solid ${colors.border}`,
                        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.5), 0 1px 4px ${colors.glow}`,
                    }}>
                        {formula.masterFormulaDetails.manufacturer || 'N/A'}
                    </div>

                    {/* Material Count */}
                    <div style={{
                        padding: '0.4rem 0.9rem',
                        borderRadius: '20px',
                        background: 'linear-gradient(135deg, rgba(240, 249, 255, 0.8) 0%, rgba(224, 242, 254, 0.7) 100%)',
                        backdropFilter: 'blur(6px)',
                        color: '#0284c7',
                        fontSize: '0.72rem',
                        fontWeight: '600',
                        border: '1px solid rgba(186, 230, 253, 0.6)',
                        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.5)',
                    }}>
                        🧪 {materialCount} materials
                    </div>


                </button>
            </div>
        );
    };

    return (
        <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #faf5ff 0%, #f5f3ff 50%, #fafafa 100%)' }}>
            {/* Batch Modals */}
            <BatchDetailModal />
            <BatchListModal />
            {/* Header with Back Button - Enhanced with gradient */}
            <header style={{
                padding: '1.75rem 2rem',
                borderBottom: 'none',
                background: 'linear-gradient(135deg, #7c3aed 0%, #8b5cf6 40%, #a855f7 70%, #c084fc 100%)',
                position: 'relative',
                overflow: 'hidden',
            }}>
                {/* Decorative elements */}
                <div style={{
                    position: 'absolute',
                    top: '-50%',
                    right: '-5%',
                    width: '300px',
                    height: '300px',
                    borderRadius: '50%',
                    background: 'rgba(255,255,255,0.1)',
                }} />
                <div style={{
                    position: 'absolute',
                    bottom: '-60%',
                    right: '15%',
                    width: '200px',
                    height: '200px',
                    borderRadius: '50%',
                    background: 'rgba(255,255,255,0.08)',
                }} />
                <div style={{
                    position: 'absolute',
                    top: '-30%',
                    left: '10%',
                    width: '150px',
                    height: '150px',
                    borderRadius: '50%',
                    background: 'rgba(255,255,255,0.05)',
                }} />

                <div style={{ maxWidth: '1600px', margin: '0 auto', display: 'flex', alignItems: 'center', gap: '1.5rem', position: 'relative', zIndex: 1 }}>
                    <Link
                        href="/"
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            padding: '0.75rem 1.25rem',
                            background: 'rgba(255,255,255,0.2)',
                            border: '1px solid rgba(255,255,255,0.3)',
                            borderRadius: '12px',
                            color: 'white',
                            fontSize: '0.9rem',
                            fontWeight: '600',
                            textDecoration: 'none',
                            transition: 'all 0.2s ease',
                            backdropFilter: 'blur(10px)',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                        }}
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M19 12H5M12 19l-7-7 7-7" />
                        </svg>
                        Back to Home
                    </Link>
                    <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
                            <span style={{ fontSize: '1.75rem' }}>🧪</span>
                            <h1 style={{
                                fontSize: '1.85rem',
                                fontWeight: '800',
                                color: 'white',
                                margin: 0,
                                textShadow: '0 2px 8px rgba(0,0,0,0.2)',
                                letterSpacing: '-0.02em',
                            }}>
                                Master Formula Dashboard
                            </h1>
                        </div>
                        <p style={{
                            fontSize: '0.95rem',
                            color: 'rgba(255,255,255,0.85)',
                            marginTop: '0.25rem',
                        }}>
                            View and manage all Master Formula Cards • Comprehensive data visualization
                        </p>
                    </div>

                    {/* Quick Stats in Header */}
                    <div style={{
                        display: 'flex',
                        gap: '12px',
                    }}>
                        <div style={{
                            padding: '0.85rem 1.5rem',
                            background: 'linear-gradient(135deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0.1) 100%)',
                            borderRadius: '14px',
                            backdropFilter: 'blur(12px)',
                            WebkitBackdropFilter: 'blur(12px)',
                            border: '1px solid rgba(255,255,255,0.25)',
                            boxShadow: '0 4px 16px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.3)',
                        }}>
                            <div style={{ fontSize: '1.35rem', fontWeight: '800', color: 'white', textShadow: '0 1px 2px rgba(0,0,0,0.1)' }}>
                                {formulas.length}
                            </div>
                            <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.85)', fontWeight: '600' }}>
                                Total MFCs
                            </div>
                        </div>
                        {batchReconciliation && (
                            <div style={{
                                padding: '0.85rem 1.5rem',
                                background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.35) 0%, rgba(20, 184, 166, 0.25) 100%)',
                                borderRadius: '14px',
                                backdropFilter: 'blur(12px)',
                                WebkitBackdropFilter: 'blur(12px)',
                                border: '1px solid rgba(16, 185, 129, 0.4)',
                                boxShadow: '0 4px 16px rgba(16, 185, 129, 0.2), inset 0 1px 0 rgba(255,255,255,0.2)',
                            }}>
                                <div style={{ fontSize: '1.35rem', fontWeight: '800', color: 'white', textShadow: '0 1px 2px rgba(0,0,0,0.1)' }}>
                                    {batchReconciliation.totalBatchesInSystem.toLocaleString()}
                                </div>
                                <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.95)', fontWeight: '600' }}>
                                    Total Batches
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </header>

            <main style={{ maxWidth: '1600px', margin: '0 auto', padding: '2rem' }}>
                {isLoading ? (
                    // ... loading spinner ...
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
                        <svg className="animate-spin" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2">
                            <path d="M21 12a9 9 0 11-6.219-8.56" strokeLinecap="round" />
                        </svg>
                    </div>
                ) : (
                    <>
                        {/* BATCH & MFC RECONCILIATION SUMMARY - Compact with category breakdown */}
                        <div style={{
                            marginBottom: '1.5rem',
                            background: 'linear-gradient(135deg, rgba(240, 249, 255, 0.9) 0%, rgba(250, 245, 255, 0.85) 50%, rgba(245, 243, 255, 0.9) 100%)',
                            backdropFilter: 'blur(12px)',
                            WebkitBackdropFilter: 'blur(12px)',
                            borderRadius: '16px',
                            border: '1px solid rgba(255,255,255,0.7)',
                            padding: '16px 20px',
                            position: 'relative',
                            overflow: 'hidden',
                            boxShadow: '0 4px 20px rgba(99, 102, 241, 0.12), inset 0 1px 0 rgba(255,255,255,0.8)',
                        }}>
                            {/* Decorative background */}
                            <div style={{
                                position: 'absolute',
                                top: '-30%',
                                right: '-3%',
                                width: '120px',
                                height: '120px',
                                borderRadius: '50%',
                                background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.08) 0%, rgba(59, 130, 246, 0.08) 100%)',
                            }} />

                            {/* Header Row - Unique MFCs + Title */}
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                marginBottom: '12px',
                                position: 'relative',
                                zIndex: 1,
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <span style={{
                                        width: '28px',
                                        height: '28px',
                                        background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                                        borderRadius: '8px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '14px',
                                    }}>📊</span>
                                    <h2 style={{
                                        color: '#1e293b',
                                        fontSize: '14px',
                                        fontWeight: 700,
                                        margin: 0,
                                    }}>
                                        Batch Reconciliation
                                    </h2>
                                </div>

                                {/* Stats Badges */}
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    flexWrap: 'wrap',
                                }}>


                                    {/* Unique Batches Badge */}
                                    {batchReconciliation && (
                                        <button
                                            onClick={() => toggleBatchSection('unique')}
                                            style={{
                                                background: 'linear-gradient(135deg, #7c3aed 0%, #8b5cf6 100%)',
                                                color: 'white',
                                                padding: '5px 12px',
                                                borderRadius: '20px',
                                                fontSize: '11px',
                                                fontWeight: 700,
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '5px',
                                                boxShadow: '0 2px 8px rgba(139, 92, 246, 0.3)',
                                                border: 'none',
                                                cursor: 'pointer',
                                                transition: 'transform 0.15s ease',
                                            }}
                                            onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.05)'; }}
                                            onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
                                            title="Click to view unique batches"
                                        >
                                            📦 {(batchReconciliation.totalBatchesInSystem - batchReconciliation.batchesNotMatchedToFormula).toLocaleString()} Unique Batches
                                        </button>
                                    )}

                                    {/* Total Batches Badge */}
                                    {batchReconciliation && (
                                        <button
                                            onClick={() => toggleBatchSection('all')}
                                            style={{
                                                background: 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)',
                                                color: 'white',
                                                padding: '5px 12px',
                                                borderRadius: '20px',
                                                fontSize: '11px',
                                                fontWeight: 700,
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '5px',
                                                boxShadow: '0 2px 8px rgba(245, 158, 11, 0.3)',
                                                border: 'none',
                                                cursor: 'pointer',
                                                transition: 'transform 0.15s ease',
                                            }}
                                            onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.05)'; }}
                                            onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
                                            title="Click to view all batches"
                                        >
                                            📋 {batchReconciliation.totalBatchesInSystem.toLocaleString()} Total Batches
                                        </button>
                                    )}

                                    {/* Reconciliation Status Badge */}
                                    {batchReconciliation && (
                                        <div style={{
                                            background: batchReconciliation.allBatchesAccountedFor
                                                ? 'linear-gradient(135deg, #059669 0%, #10b981 100%)'
                                                : 'linear-gradient(135deg, #dc2626 0%, #ef4444 100%)',
                                            color: 'white',
                                            padding: '5px 12px',
                                            borderRadius: '20px',
                                            fontSize: '10px',
                                            fontWeight: 700,
                                            boxShadow: batchReconciliation.allBatchesAccountedFor
                                                ? '0 2px 8px rgba(16, 185, 129, 0.3)'
                                                : '0 2px 8px rgba(239, 68, 68, 0.3)',
                                        }}>
                                            {batchReconciliation.allBatchesAccountedFor ? '✅ RECONCILED' : '❌ MISMATCH'}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Reconciliation Equation: Total = 3+ batches + 1-2 batches + No batch MFCs + Placebo */}
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px',
                                flexWrap: 'wrap',
                                position: 'relative',
                                zIndex: 1,
                            }}>
                                {/* Total Batches */}
                                <Link href="/batches" style={{
                                    background: 'linear-gradient(135deg, rgba(124, 58, 237, 0.9) 0%, rgba(139, 92, 246, 0.95) 100%)',
                                    borderRadius: '12px',
                                    padding: '10px 16px',
                                    textAlign: 'center',
                                    boxShadow: '0 4px 16px rgba(139, 92, 246, 0.3)',
                                    border: '1px solid rgba(255,255,255,0.2)',
                                    color: 'white',
                                    textDecoration: 'none',
                                    cursor: 'pointer',
                                    transition: 'transform 0.15s ease',
                                    minWidth: '90px',
                                }}
                                    onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.03)'; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
                                >
                                    <div style={{ fontSize: '22px', fontWeight: 800 }}>
                                        {batchReconciliation?.totalBatchesInSystem?.toLocaleString() || sectionBatchTotals.totalCounted.toLocaleString()}
                                    </div>
                                    <div style={{ fontSize: '9px', fontWeight: 600, textTransform: 'uppercase', opacity: 0.9 }}>
                                        Total Batches
                                    </div>
                                </Link>

                                <span style={{ fontSize: '20px', color: '#94a3b8', fontWeight: 300 }}>=</span>

                                {/* MFCs with 3+ Batches */}
                                <div
                                    onClick={() => setMainMfcsOpen(true)}
                                    style={{
                                        background: 'linear-gradient(135deg, rgba(5, 150, 105, 0.9) 0%, rgba(16, 185, 129, 0.95) 100%)',
                                        borderRadius: '12px',
                                        padding: '10px 14px',
                                        textAlign: 'center',
                                        boxShadow: '0 4px 16px rgba(16, 185, 129, 0.3)',
                                        border: '1px solid rgba(255,255,255,0.2)',
                                        color: 'white',
                                        cursor: 'pointer',
                                        transition: 'transform 0.15s ease',
                                        minWidth: '80px',
                                    }}
                                    onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.03)'; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
                                >
                                    <div style={{ fontSize: '20px', fontWeight: 800 }}>
                                        {sectionBatchTotals.main.toLocaleString()}
                                    </div>
                                    <div style={{ fontSize: '8px', fontWeight: 600, textTransform: 'uppercase', opacity: 0.9 }}>
                                        MFC 3+ Batches
                                    </div>
                                    <div style={{ fontSize: '8px', opacity: 0.7 }}>
                                        ({mainFormulas.length} MFCs)
                                    </div>
                                </div>

                                <span style={{ fontSize: '18px', color: '#94a3b8', fontWeight: 300 }}>+</span>

                                {/* MFCs with 1-2 Batches */}
                                <div
                                    onClick={() => setLowBatchMfcsOpen(true)}
                                    style={{
                                        background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.9) 0%, rgba(251, 191, 36, 0.95) 100%)',
                                        borderRadius: '12px',
                                        padding: '10px 14px',
                                        textAlign: 'center',
                                        boxShadow: '0 4px 16px rgba(245, 158, 11, 0.3)',
                                        border: '1px solid rgba(255,255,255,0.2)',
                                        color: 'white',
                                        cursor: 'pointer',
                                        transition: 'transform 0.15s ease',
                                        minWidth: '80px',
                                    }}
                                    onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.03)'; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
                                >
                                    <div style={{ fontSize: '20px', fontWeight: 800 }}>
                                        {sectionBatchTotals.lowBatch.toLocaleString()}
                                    </div>
                                    <div style={{ fontSize: '8px', fontWeight: 600, textTransform: 'uppercase', opacity: 0.9 }}>
                                        MFC 1-2 Batches
                                    </div>
                                    <div style={{ fontSize: '8px', opacity: 0.7 }}>
                                        ({lowBatchFormulas.length} MFCs)
                                    </div>
                                </div>

                                <span style={{ fontSize: '18px', color: '#94a3b8', fontWeight: 300 }}>+</span>

                                {/* No Batch MFCs */}
                                <div
                                    onClick={() => setNoBatchMfcsOpen(true)}
                                    style={{
                                        background: 'linear-gradient(135deg, rgba(107, 114, 128, 0.9) 0%, rgba(156, 163, 175, 0.95) 100%)',
                                        borderRadius: '12px',
                                        padding: '10px 14px',
                                        textAlign: 'center',
                                        boxShadow: '0 4px 16px rgba(107, 114, 128, 0.3)',
                                        border: '1px solid rgba(255,255,255,0.2)',
                                        color: 'white',
                                        cursor: 'pointer',
                                        transition: 'transform 0.15s ease',
                                        minWidth: '80px',
                                    }}
                                    onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.03)'; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
                                >
                                    <div style={{ fontSize: '20px', fontWeight: 800 }}>
                                        {sectionBatchTotals.noBatch.toLocaleString()}
                                    </div>
                                    <div style={{ fontSize: '8px', fontWeight: 600, textTransform: 'uppercase', opacity: 0.9 }}>
                                        No Batch MFCs
                                    </div>
                                    <div style={{ fontSize: '8px', opacity: 0.7 }}>
                                        ({noBatchFormulas.length} MFCs)
                                    </div>
                                </div>

                                <span style={{ fontSize: '18px', color: '#94a3b8', fontWeight: 300 }}>+</span>

                                {/* Placebo & Media Fill */}
                                <div
                                    onClick={() => setPlaceboMfcsOpen(true)}
                                    style={{
                                        background: 'linear-gradient(135deg, rgba(236, 72, 153, 0.9) 0%, rgba(244, 114, 182, 0.95) 100%)',
                                        borderRadius: '12px',
                                        padding: '10px 14px',
                                        textAlign: 'center',
                                        boxShadow: '0 4px 16px rgba(236, 72, 153, 0.3)',
                                        border: '1px solid rgba(255,255,255,0.2)',
                                        color: 'white',
                                        cursor: 'pointer',
                                        transition: 'transform 0.15s ease',
                                        minWidth: '80px',
                                    }}
                                    onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.03)'; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
                                >
                                    <div style={{ fontSize: '20px', fontWeight: 800 }}>
                                        {sectionBatchTotals.placebo.toLocaleString()}
                                    </div>
                                    <div style={{ fontSize: '8px', fontWeight: 600, textTransform: 'uppercase', opacity: 0.9 }}>
                                        Placebo/Media
                                    </div>
                                    <div style={{ fontSize: '8px', opacity: 0.7 }}>
                                        ({placeboFormulas.length} MFCs)
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* UNIQUE BATCH RECONCILIATION SECTION */}
                        {uniqueBatchReconciliation && (
                            <div style={{
                                marginBottom: '1.5rem',
                                background: 'linear-gradient(135deg, rgba(250, 245, 255, 0.9) 0%, rgba(240, 249, 255, 0.85) 50%, rgba(236, 253, 245, 0.9) 100%)',
                                backdropFilter: 'blur(12px)',
                                WebkitBackdropFilter: 'blur(12px)',
                                borderRadius: '16px',
                                border: '1px solid rgba(255,255,255,0.7)',
                                padding: '16px 20px',
                                position: 'relative',
                                overflow: 'hidden',
                                boxShadow: '0 4px 20px rgba(139, 92, 246, 0.12), inset 0 1px 0 rgba(255,255,255,0.8)',
                            }}>
                                {/* Decorative background */}
                                <div style={{
                                    position: 'absolute',
                                    top: '-30%',
                                    right: '-3%',
                                    width: '120px',
                                    height: '120px',
                                    borderRadius: '50%',
                                    background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(139, 92, 246, 0.08) 100%)',
                                }} />

                                {/* Header Row */}
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    marginBottom: '12px',
                                    position: 'relative',
                                    zIndex: 1,
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <span style={{
                                            width: '28px',
                                            height: '28px',
                                            background: 'linear-gradient(135deg, #10b981 0%, #06b6d4 100%)',
                                            borderRadius: '8px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontSize: '14px',
                                        }}>📦</span>
                                        <h2 style={{
                                            color: '#1e293b',
                                            fontSize: '14px',
                                            fontWeight: 700,
                                            margin: 0,
                                        }}>
                                            Unique Batch Reconciliation
                                        </h2>
                                    </div>

                                    {/* Reconciliation Status Badge */}
                                    <div style={{
                                        background: uniqueBatchReconciliation.isReconciled
                                            ? 'linear-gradient(135deg, #059669 0%, #10b981 100%)'
                                            : 'linear-gradient(135deg, #dc2626 0%, #ef4444 100%)',
                                        color: 'white',
                                        padding: '5px 12px',
                                        borderRadius: '20px',
                                        fontSize: '10px',
                                        fontWeight: 700,
                                        boxShadow: uniqueBatchReconciliation.isReconciled
                                            ? '0 2px 8px rgba(16, 185, 129, 0.3)'
                                            : '0 2px 8px rgba(239, 68, 68, 0.3)',
                                    }}>
                                        {uniqueBatchReconciliation.isReconciled ? '✅ RECONCILED' : '❌ MISMATCH'}
                                    </div>
                                </div>

                                {/* Unique Batch Reconciliation Equation */}
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '8px',
                                    flexWrap: 'wrap',
                                    position: 'relative',
                                    zIndex: 1,
                                }}>
                                    {/* Total Unique Batches */}
                                    <div
                                        onClick={() => toggleBatchSection('unique')}
                                        style={{
                                            background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.9) 0%, rgba(6, 182, 212, 0.95) 100%)',
                                            borderRadius: '12px',
                                            padding: '10px 16px',
                                            textAlign: 'center',
                                            boxShadow: '0 4px 16px rgba(16, 185, 129, 0.3)',
                                            border: '1px solid rgba(255,255,255,0.2)',
                                            color: 'white',
                                            cursor: 'pointer',
                                            transition: 'transform 0.15s ease',
                                            minWidth: '100px',
                                        }}
                                        onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.03)'; }}
                                        onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
                                    >
                                        <div style={{ fontSize: '22px', fontWeight: 800 }}>
                                            {uniqueBatchReconciliation.totalUniqueBatches.toLocaleString()}
                                        </div>
                                        <div style={{ fontSize: '9px', fontWeight: 600, textTransform: 'uppercase', opacity: 0.9 }}>
                                            Unique Batches
                                        </div>
                                    </div>

                                    <span style={{ fontSize: '20px', color: '#94a3b8', fontWeight: 300 }}>=</span>

                                    {/* MFCs with 3+ Batches */}
                                    <div
                                        onClick={() => setMainMfcsOpen(true)}
                                        style={{
                                            background: 'linear-gradient(135deg, rgba(5, 150, 105, 0.9) 0%, rgba(16, 185, 129, 0.95) 100%)',
                                            borderRadius: '12px',
                                            padding: '10px 14px',
                                            textAlign: 'center',
                                            boxShadow: '0 4px 16px rgba(16, 185, 129, 0.3)',
                                            border: '1px solid rgba(255,255,255,0.2)',
                                            color: 'white',
                                            cursor: 'pointer',
                                            transition: 'transform 0.15s ease',
                                            minWidth: '80px',
                                        }}
                                        onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.03)'; }}
                                        onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
                                    >
                                        <div style={{ fontSize: '20px', fontWeight: 800 }}>
                                            {uniqueBatchReconciliation.mainUniqueBatches.toLocaleString()}
                                        </div>
                                        <div style={{ fontSize: '8px', fontWeight: 600, textTransform: 'uppercase', opacity: 0.9 }}>
                                            MFCs 3+ Batches
                                        </div>
                                        <div style={{ fontSize: '8px', opacity: 0.7 }}>
                                            ({uniqueBatchReconciliation.mainMfcCount} MFCs)
                                        </div>
                                    </div>

                                    <span style={{ fontSize: '18px', color: '#94a3b8', fontWeight: 300 }}>+</span>

                                    {/* Low Batch MFCs (1-2 Batches) */}
                                    <div
                                        onClick={() => setLowBatchMfcsOpen(true)}
                                        style={{
                                            background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.9) 0%, rgba(251, 191, 36, 0.95) 100%)',
                                            borderRadius: '12px',
                                            padding: '10px 14px',
                                            textAlign: 'center',
                                            boxShadow: '0 4px 16px rgba(245, 158, 11, 0.3)',
                                            border: '1px solid rgba(255,255,255,0.2)',
                                            color: 'white',
                                            cursor: 'pointer',
                                            transition: 'transform 0.15s ease',
                                            minWidth: '80px',
                                        }}
                                        onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.03)'; }}
                                        onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
                                    >
                                        <div style={{ fontSize: '20px', fontWeight: 800 }}>
                                            {uniqueBatchReconciliation.lowBatchUniqueBatches.toLocaleString()}
                                        </div>
                                        <div style={{ fontSize: '8px', fontWeight: 600, textTransform: 'uppercase', opacity: 0.9 }}>
                                            Low Batch MFCs
                                        </div>
                                        <div style={{ fontSize: '8px', opacity: 0.7 }}>
                                            ({uniqueBatchReconciliation.lowBatchMfcCount} MFCs)
                                        </div>
                                    </div>

                                    <span style={{ fontSize: '18px', color: '#94a3b8', fontWeight: 300 }}>+</span>

                                    {/* No Batch MFCs */}
                                    <div
                                        onClick={() => setNoBatchMfcsOpen(true)}
                                        style={{
                                            background: 'linear-gradient(135deg, rgba(107, 114, 128, 0.9) 0%, rgba(156, 163, 175, 0.95) 100%)',
                                            borderRadius: '12px',
                                            padding: '10px 14px',
                                            textAlign: 'center',
                                            boxShadow: '0 4px 16px rgba(107, 114, 128, 0.3)',
                                            border: '1px solid rgba(255,255,255,0.2)',
                                            color: 'white',
                                            cursor: 'pointer',
                                            transition: 'transform 0.15s ease',
                                            minWidth: '80px',
                                        }}
                                        onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.03)'; }}
                                        onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
                                    >
                                        <div style={{ fontSize: '20px', fontWeight: 800 }}>
                                            {uniqueBatchReconciliation.noBatchUniqueBatches.toLocaleString()}
                                        </div>
                                        <div style={{ fontSize: '8px', fontWeight: 600, textTransform: 'uppercase', opacity: 0.9 }}>
                                            No Batch MFCs
                                        </div>
                                        <div style={{ fontSize: '8px', opacity: 0.7 }}>
                                            ({uniqueBatchReconciliation.noBatchMfcCount} MFCs)
                                        </div>
                                    </div>

                                    <span style={{ fontSize: '18px', color: '#94a3b8', fontWeight: 300 }}>+</span>

                                    {/* Placebo & Media Fill */}
                                    <div
                                        onClick={() => setPlaceboMfcsOpen(true)}
                                        style={{
                                            background: 'linear-gradient(135deg, rgba(236, 72, 153, 0.9) 0%, rgba(244, 114, 182, 0.95) 100%)',
                                            borderRadius: '12px',
                                            padding: '10px 14px',
                                            textAlign: 'center',
                                            boxShadow: '0 4px 16px rgba(236, 72, 153, 0.3)',
                                            border: '1px solid rgba(255,255,255,0.2)',
                                            color: 'white',
                                            cursor: 'pointer',
                                            transition: 'transform 0.15s ease',
                                            minWidth: '80px',
                                        }}
                                        onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.03)'; }}
                                        onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
                                    >
                                        <div style={{ fontSize: '20px', fontWeight: 800 }}>
                                            {uniqueBatchReconciliation.placeboUniqueBatches.toLocaleString()}
                                        </div>
                                        <div style={{ fontSize: '8px', fontWeight: 600, textTransform: 'uppercase', opacity: 0.9 }}>
                                            Placebo/Media
                                        </div>
                                        <div style={{ fontSize: '8px', opacity: 0.7 }}>
                                            ({uniqueBatchReconciliation.placeboMfcCount} MFCs)
                                        </div>
                                    </div>

                                    {/* Show unmatched if any */}
                                    {uniqueBatchReconciliation.unmatchedUniqueBatches > 0 && (
                                        <>
                                            <span style={{ fontSize: '18px', color: '#94a3b8', fontWeight: 300 }}>+</span>
                                            <div
                                                style={{
                                                    background: 'linear-gradient(135deg, rgba(220, 38, 38, 0.9) 0%, rgba(239, 68, 68, 0.95) 100%)',
                                                    borderRadius: '12px',
                                                    padding: '10px 14px',
                                                    textAlign: 'center',
                                                    boxShadow: '0 4px 16px rgba(220, 38, 38, 0.3)',
                                                    border: '1px solid rgba(255,255,255,0.2)',
                                                    color: 'white',
                                                    minWidth: '80px',
                                                }}
                                            >
                                                <div style={{ fontSize: '20px', fontWeight: 800 }}>
                                                    {uniqueBatchReconciliation.unmatchedUniqueBatches.toLocaleString()}
                                                </div>
                                                <div style={{ fontSize: '8px', fontWeight: 600, textTransform: 'uppercase', opacity: 0.9 }}>
                                                    Unmatched
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </div>


                            </div>
                        )}

                        {/* DOWNLOAD REPORTS SECTION */}
                        <div style={{
                            marginBottom: '2rem',
                            display: 'flex',
                            gap: '1rem',
                            flexWrap: 'wrap',
                        }}>
                            <button
                                onClick={() => {
                                    // Open Excel download in new tab
                                    window.open('/api/reports/duplicate-batches?format=excel', '_blank');
                                }}
                                style={{
                                    padding: '0.75rem 1.5rem',
                                    background: 'linear-gradient(135deg, #dc2626 0%, #ef4444 100%)',
                                    color: 'white',
                                    borderRadius: '12px',
                                    fontSize: '0.9rem',
                                    fontWeight: '600',
                                    border: 'none',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    boxShadow: '0 4px 12px rgba(220, 38, 38, 0.3)',
                                    transition: 'all 0.2s ease',
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.transform = 'scale(1.02)';
                                    e.currentTarget.style.boxShadow = '0 6px 16px rgba(220, 38, 38, 0.4)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.transform = 'scale(1)';
                                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(220, 38, 38, 0.3)';
                                }}
                            >
                                📥 Download Duplicate Batches Report (Excel)
                            </button>

                            <button
                                onClick={() => {
                                    window.open('/api/reports/reconciliation-mismatch?format=excel', '_blank');
                                }}
                                style={{
                                    padding: '0.75rem 1.5rem',
                                    background: 'linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)',
                                    color: 'white',
                                    borderRadius: '12px',
                                    fontSize: '0.9rem',
                                    fontWeight: '600',
                                    border: 'none',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)',
                                    transition: 'all 0.2s ease',
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.transform = 'scale(1.02)';
                                    e.currentTarget.style.boxShadow = '0 6px 16px rgba(37, 99, 235, 0.4)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.transform = 'scale(1)';
                                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(37, 99, 235, 0.3)';
                                }}
                            >
                                📊 Download Reconciliation Mismatch Report (Excel)
                            </button>

                            <button
                                onClick={async () => {
                                    try {
                                        // Show loading state
                                        const btn = document.activeElement as HTMLButtonElement;
                                        const originalText = btn.innerHTML;
                                        btn.innerHTML = '⏳ Exporting...';
                                        btn.disabled = true;

                                        // Fetch all matched batches (now grouped by MFC)
                                        const response = await fetch('/api/batch/matched-batches');
                                        const data = await response.json();

                                        if (!data.success || !data.data || data.data.length === 0) {
                                            alert('No matched batches found to export');
                                            btn.innerHTML = originalText;
                                            btn.disabled = false;
                                            return;
                                        }

                                        // Prepare data for Excel - Only unique MFC + Item Code combinations
                                        const excelData: any[] = [];
                                        let rowNumber = 1;
                                        const merges: any[] = [];
                                        let currentRow = 2; // Row 1 is header in Excel

                                        // Iterate through each MFC group
                                        data.data.forEach((mfcGroup: any) => {
                                            const mfcStartRow = currentRow;
                                            const productCodeCount = mfcGroup.productCodes.length;

                                            // Iterate through each product code in this MFC (unique only)
                                            mfcGroup.productCodes.forEach((productCodeGroup: any, pcIndex: number) => {
                                                excelData.push({
                                                    'Sr. No': rowNumber++,
                                                    'MFC Number': mfcGroup.masterCardNo,
                                                    'Item Code': productCodeGroup.productCode,
                                                    'Product Name': mfcGroup.productName,
                                                    'Generic Name': mfcGroup.genericName,
                                                    'Manufacturer': mfcGroup.manufacturer,
                                                    'Revision No': mfcGroup.revisionNo,
                                                    'Shelf Life': mfcGroup.shelfLife,
                                                    'Batch Count': productCodeGroup.batchCount,
                                                });
                                                currentRow++;
                                            });

                                            // Add merge for MFC Number column (column B, index 1) if multiple product codes
                                            if (productCodeCount > 1) {
                                                merges.push({
                                                    s: { r: mfcStartRow - 1, c: 1 }, // Start: row, col (0-indexed)
                                                    e: { r: mfcStartRow - 1 + productCodeCount - 1, c: 1 } // End
                                                });
                                                // Also merge Product Name (column D, index 3)
                                                merges.push({
                                                    s: { r: mfcStartRow - 1, c: 3 },
                                                    e: { r: mfcStartRow - 1 + productCodeCount - 1, c: 3 }
                                                });
                                                // Also merge Generic Name (column E, index 4)
                                                merges.push({
                                                    s: { r: mfcStartRow - 1, c: 4 },
                                                    e: { r: mfcStartRow - 1 + productCodeCount - 1, c: 4 }
                                                });
                                                // Also merge Manufacturer (column F, index 5)
                                                merges.push({
                                                    s: { r: mfcStartRow - 1, c: 5 },
                                                    e: { r: mfcStartRow - 1 + productCodeCount - 1, c: 5 }
                                                });
                                                // Also merge Revision No (column G, index 6)
                                                merges.push({
                                                    s: { r: mfcStartRow - 1, c: 6 },
                                                    e: { r: mfcStartRow - 1 + productCodeCount - 1, c: 6 }
                                                });
                                                // Also merge Shelf Life (column H, index 7)
                                                merges.push({
                                                    s: { r: mfcStartRow - 1, c: 7 },
                                                    e: { r: mfcStartRow - 1 + productCodeCount - 1, c: 7 }
                                                });
                                            }
                                        });

                                        // Create workbook and worksheet
                                        const ws = XLSX.utils.json_to_sheet(excelData);
                                        const wb = XLSX.utils.book_new();

                                        // Apply cell merges
                                        ws['!merges'] = merges;

                                        XLSX.utils.book_append_sheet(wb, ws, 'MFC Product Codes');

                                        // Set column widths for better readability
                                        const colWidths = [
                                            { wch: 8 },  // Sr. No
                                            { wch: 22 }, // MFC Number
                                            { wch: 14 }, // Item Code
                                            { wch: 40 }, // Product Name
                                            { wch: 35 }, // Generic Name
                                            { wch: 28 }, // Manufacturer
                                            { wch: 12 }, // Revision No
                                            { wch: 15 }, // Shelf Life
                                            { wch: 12 }, // Batch Count
                                        ];
                                        ws['!cols'] = colWidths;

                                        // Generate filename with timestamp
                                        const timestamp = new Date().toISOString().split('T')[0];
                                        const filename = `MFC_Product_Codes_${timestamp}.xlsx`;

                                        // Download the file
                                        XLSX.writeFile(wb, filename);

                                        // Reset button
                                        btn.innerHTML = originalText;
                                        btn.disabled = false;

                                        // Show success message
                                        alert(`Successfully exported ${excelData.length} unique MFC-Product Code combinations from ${data.total} MFCs to Excel!`);
                                    } catch (error) {
                                        console.error('Export error:', error);
                                        alert('Failed to export. Please try again.');
                                        const btn = document.activeElement as HTMLButtonElement;
                                        btn.disabled = false;
                                        btn.innerHTML = '📊 Export MFC Product Codes to Excel';
                                    }
                                }}
                                style={{
                                    padding: '0.75rem 1.5rem',
                                    background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                                    color: 'white',
                                    borderRadius: '12px',
                                    fontSize: '0.9rem',
                                    fontWeight: '600',
                                    border: 'none',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
                                    transition: 'all 0.2s ease',
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.transform = 'scale(1.02)';
                                    e.currentTarget.style.boxShadow = '0 6px 16px rgba(16, 185, 129, 0.4)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.transform = 'scale(1)';
                                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.3)';
                                }}
                            >
                                📊 Export MFC Product Codes to Excel
                            </button>
                        </div>

                        {/* Orphaned Batches Alert Section */}
                        {unmatchedBatches.length > 0 && (
                            <div style={{ marginBottom: '2rem' }}>
                                <CollapsibleSectionHeader
                                    title="Batches without Formula Master"
                                    count={unmatchedBatches.length}
                                    icon="⚠️"
                                    isOpen={orphanedBatchesOpen}
                                    onToggle={() => setOrphanedBatchesOpen(!orphanedBatchesOpen)}
                                    badgeColor="#dc2626"
                                    badgeText="Alert"
                                    description="These batches have item codes not found in any MFC"
                                />
                                {orphanedBatchesOpen && (
                                    <div style={{
                                        display: 'flex',
                                        gap: '1rem',
                                        overflowX: 'auto',
                                        paddingBottom: '1rem',
                                    }}>
                                        {unmatchedBatches.map((item, idx) => (
                                            <div
                                                key={idx}
                                                style={{
                                                    minWidth: '200px',
                                                    background: '#fee2e2', // red-100
                                                    border: '1px solid #f87171', // red-400
                                                    borderRadius: 'var(--radius-lg)',
                                                    padding: '1rem',
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    gap: '0.5rem'
                                                }}
                                            >
                                                <div style={{
                                                    fontSize: '0.85rem',
                                                    color: '#b91c1c', // red-700
                                                    fontWeight: '600'
                                                }}>
                                                    Item Code
                                                </div>
                                                <div style={{
                                                    fontSize: '1.1rem',
                                                    fontWeight: '700',
                                                    fontFamily: 'monospace',
                                                    color: '#7f1d1d' // red-900
                                                }}>
                                                    {item.itemCode}
                                                </div>
                                                <div style={{
                                                    fontSize: '0.8rem',
                                                    color: '#b91c1c',
                                                    marginTop: 'auto'
                                                }}>
                                                    Found in <strong>{item.count}</strong> batches
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Manufacturer Summary Cards */}
                        <div style={{ marginBottom: '2rem' }}>
                            <CollapsibleSectionHeader
                                title="By Manufacturer"
                                count={manufacturerSummary.length}
                                icon="📊"
                                isOpen={manufacturerFilterOpen}
                                onToggle={() => setManufacturerFilterOpen(!manufacturerFilterOpen)}
                                badgeColor="#8b5cf6"
                                description="Filter MFCs by manufacturer"
                            />
                            {manufacturerFilterOpen && (
                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                                    gap: '1rem',
                                }}>
                                    {manufacturerSummary.map(item => {
                                        const colors = getManufacturerColor(item.name);
                                        const isActive = selectedManufacturer === item.name;
                                        return (
                                            <button
                                                key={item.name}
                                                onClick={() => setSelectedManufacturer(isActive ? null : item.name)}
                                                style={{
                                                    padding: '1rem',
                                                    background: isActive ? colors.light : 'var(--card)',
                                                    border: isActive ? `2px solid ${colors.primary}` : '1px solid var(--border)',
                                                    borderRadius: 'var(--radius-md)',
                                                    cursor: 'pointer',
                                                    textAlign: 'left',
                                                    transition: 'all 0.2s ease',
                                                }}
                                            >
                                                <div style={{
                                                    fontSize: '2rem',
                                                    fontWeight: '800',
                                                    color: colors.primary,
                                                }}>
                                                    {item.count}
                                                </div>
                                                <div style={{
                                                    fontSize: '0.85rem',
                                                    color: 'var(--muted-foreground)',
                                                    fontWeight: '500',
                                                }}>
                                                    {item.name}
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Search and Sort */}
                        <div style={{ marginBottom: '1.5rem', display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                            <input
                                type="text"
                                placeholder="Search by MFC number, product code, name, or generic name..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                style={{
                                    flex: '1',
                                    minWidth: '300px',
                                    padding: '0.75rem 1rem',
                                    borderRadius: 'var(--radius-md)',
                                    border: '1px solid var(--border)',
                                    background: 'var(--card)',
                                    color: 'var(--foreground)',
                                    fontSize: '0.9rem',
                                }}
                            />

                            {/* Sort by MFC Number Button */}
                            <button
                                onClick={() => {
                                    // Cycle through: none -> asc -> desc -> none
                                    setMfcSortOrder(prev => {
                                        if (prev === 'none') return 'asc';
                                        if (prev === 'asc') return 'desc';
                                        return 'none';
                                    });
                                }}
                                style={{
                                    padding: '0.75rem 1rem',
                                    borderRadius: 'var(--radius-md)',
                                    border: mfcSortOrder !== 'none'
                                        ? '2px solid #8b5cf6'
                                        : '1px solid var(--border)',
                                    background: mfcSortOrder !== 'none'
                                        ? 'linear-gradient(135deg, #f3e8ff 0%, #faf5ff 100%)'
                                        : 'var(--card)',
                                    color: mfcSortOrder !== 'none' ? '#7c3aed' : 'var(--foreground)',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    fontWeight: mfcSortOrder !== 'none' ? '600' : '500',
                                    fontSize: '0.9rem',
                                    transition: 'all 0.2s ease',
                                    boxShadow: mfcSortOrder !== 'none'
                                        ? '0 2px 8px rgba(139, 92, 246, 0.25)'
                                        : 'none',
                                }}
                                title={
                                    mfcSortOrder === 'none'
                                        ? 'Click to sort by MFC Number (A→Z)'
                                        : mfcSortOrder === 'asc'
                                            ? 'Sorted A→Z. Click for Z→A'
                                            : 'Sorted Z→A. Click to clear sort'
                                }
                            >
                                <span style={{ fontSize: '1.1rem' }}>
                                    {mfcSortOrder === 'none' && '🔢'}
                                    {mfcSortOrder === 'asc' && '⬆️'}
                                    {mfcSortOrder === 'desc' && '⬇️'}
                                </span>
                                Sort by MFC
                                {mfcSortOrder === 'asc' && <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>(A→Z)</span>}
                                {mfcSortOrder === 'desc' && <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>(Z→A)</span>}
                            </button>

                            {/* MFC Summary Table Button */}
                            <button
                                onClick={() => setShowMfcSummaryTable(true)}
                                style={{
                                    padding: '0.75rem 1rem',
                                    borderRadius: 'var(--radius-md)',
                                    border: '1px solid #06b6d4',
                                    background: 'linear-gradient(135deg, #ecfeff 0%, #cffafe 100%)',
                                    color: '#0891b2',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    fontWeight: '600',
                                    fontSize: '0.9rem',
                                    transition: 'all 0.2s ease',
                                    boxShadow: '0 2px 8px rgba(6, 182, 212, 0.25)',
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.transform = 'scale(1.02)';
                                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(6, 182, 212, 0.35)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.transform = 'scale(1)';
                                    e.currentTarget.style.boxShadow = '0 2px 8px rgba(6, 182, 212, 0.25)';
                                }}
                            >
                                <span style={{ fontSize: '1.1rem' }}>📋</span>
                                MFC Summary Table
                            </button>

                            {selectedManufacturer && (
                                <button
                                    onClick={() => setSelectedManufacturer(null)}
                                    style={{
                                        padding: '0.75rem 1rem',
                                        borderRadius: 'var(--radius-md)',
                                        border: '1px solid var(--border)',
                                        background: 'var(--card)',
                                        color: 'var(--foreground)',
                                        cursor: 'pointer',
                                    }}
                                >
                                    Clear Filter ✕
                                </button>
                            )}
                        </div>

                        {/* MFC List Title - Main (3+ Batches) */}
                        <div style={{ marginBottom: mainMfcsOpen ? '1rem' : '0' }}>
                            <CollapsibleSectionHeader
                                title="MFCs with 3+ Batches"
                                count={mainFormulas.length}
                                totalBatches={sectionBatchTotals.main}
                                uniqueBatches={uniqueBatchReconciliation?.mainUniqueBatches}
                                icon="🧪"
                                isOpen={mainMfcsOpen}
                                onToggle={() => setMainMfcsOpen(!mainMfcsOpen)}
                                badgeColor="#10b981"
                                badgeText="Primary"
                                description="MFCs with significant production volume"
                                rmDataMatched={sectionRmData.main.matched}
                                rmDataUnmatched={sectionRmData.main.unmatched}
                                onRmMatchedClick={() => openRmDataModal('matched')}
                                onRmUnmatchedClick={() => openRmDataModal('unmatched')}
                                ppmDataMatched={sectionPpmPmData.main.ppmMatched}
                                ppmDataUnmatched={sectionPpmPmData.main.ppmUnmatched}
                                pmDataMatched={sectionPpmPmData.main.pmMatched}
                                pmDataUnmatched={sectionPpmPmData.main.pmUnmatched}
                                onPpmMatchedClick={() => openPpmDataModal('matched')}
                                onPpmUnmatchedClick={() => openPpmDataModal('unmatched')}
                                onPmMatchedClick={() => openPmDataModal('matched')}
                                onPmUnmatchedClick={() => openPmDataModal('unmatched')}
                                materialQualified={sectionMaterialQualData.main.qualified}
                                materialUnqualified={sectionMaterialQualData.main.unqualified}
                                onMaterialQualifiedClick={() => openMatDataModal('qualified')}
                                onMaterialUnqualifiedClick={() => openMatDataModal('unqualified')}
                                pmCoaQualified={0}
                                pmCoaUnqualified={sectionMaterialQualData.main.qualified + sectionMaterialQualData.main.unqualified}
                                onPmCoaQualifiedClick={() => { }}
                                onPmCoaUnqualifiedClick={() => { }}
                                ppmCoaQualified={0}
                                ppmCoaUnqualified={sectionMaterialQualData.main.qualified + sectionMaterialQualData.main.unqualified}
                                onPpmCoaQualifiedClick={() => { }}
                                onPpmCoaUnqualifiedClick={() => { }}
                                bulkCoaQualified={sectionBulkCoaData.main.qualified}
                                bulkCoaUnqualified={sectionBulkCoaData.main.unqualified}
                                onBulkCoaQualifiedClick={() => openBulkCoaModal('matched')}
                                onBulkCoaUnqualifiedClick={() => openBulkCoaModal('unmatched')}
                            />
                        </div>

                        {/* MFC List - Main (3+ Batches) */}
                        {mainMfcsOpen && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {mainFormulas.map((formula, index) => {
                                    const isExpanded = expandedMfc === formula._id;
                                    const colors = getManufacturerColor(formula.masterFormulaDetails?.manufacturer || '');
                                    const materialCount = formula.materials?.length || 0;
                                    const mfcNo = formula.masterFormulaDetails?.masterCardNo?.trim() || 'N/A';

                                    return (
                                        <div
                                            key={formula._id}
                                            style={{
                                                background: colors.glass,
                                                backdropFilter: 'blur(10px)',
                                                WebkitBackdropFilter: 'blur(10px)',
                                                borderRadius: 'var(--radius-lg)',
                                                border: isExpanded ? `2px solid ${colors.primary}` : `1px solid ${colors.border}`,
                                                overflow: 'hidden',
                                                transition: 'all 0.2s ease',
                                                boxShadow: `0 4px 16px ${colors.glow}, 0 1px 3px rgba(0, 0, 0, 0.05)`,
                                            }}
                                        >
                                            {/* MFC Header - Always visible */}
                                            <div
                                                role="button"
                                                tabIndex={0}
                                                onClick={() => toggleMfc(formula._id)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter' || e.key === ' ') {
                                                        e.preventDefault();
                                                        toggleMfc(formula._id);
                                                    }
                                                }}
                                                style={{
                                                    width: '100%',
                                                    padding: '1rem 1.5rem',
                                                    background: isExpanded ? colors.light : 'transparent',
                                                    border: 'none',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '1rem',
                                                    textAlign: 'left',
                                                    outline: 'none',
                                                }}
                                            >
                                                {/* Sr. No */}
                                                <div style={{
                                                    width: '40px',
                                                    fontSize: '0.9rem',
                                                    fontWeight: '600',
                                                    color: 'var(--muted-foreground)',
                                                }}>
                                                    #{index + 1}
                                                </div>

                                                {/* Expand/Collapse Icon */}
                                                <div style={{
                                                    width: '24px',
                                                    height: '24px',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    borderRadius: '4px',
                                                    background: colors.light,
                                                    color: colors.primary,
                                                    transition: 'transform 0.2s ease',
                                                    transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                                                }}>
                                                    ▶
                                                </div>

                                                {/* MFC Number */}
                                                <div style={{
                                                    fontFamily: 'monospace',
                                                    fontSize: '1rem',
                                                    fontWeight: '700',
                                                    color: colors.primary,
                                                    minWidth: '160px',
                                                }}>
                                                    {mfcNo}
                                                </div>

                                                {/* Product Name */}
                                                <div style={{
                                                    flex: 1,
                                                    fontSize: '0.9rem',
                                                    fontWeight: '500',
                                                    color: 'var(--foreground)',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '0.75rem',
                                                }}>
                                                    {formula.masterFormulaDetails.productName}
                                                    {/* Batch Count Badges: Total and Unique with Reconciliation */}
                                                    {formula.totalBatchCount && formula.totalBatchCount > 0 && (() => {
                                                        const uniqueBatches = (formula.rmDataMatched || 0) + (formula.rmDataUnmatched || 0);
                                                        const matched = formula.rmDataMatched || 0;
                                                        const unmatched = formula.rmDataUnmatched || 0;
                                                        return (
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                {/* Total Batch Records */}
                                                                <span
                                                                    style={{
                                                                        padding: '0.15rem 0.5rem',
                                                                        background: '#e5e7eb',
                                                                        color: '#4b5563',
                                                                        borderRadius: '10px',
                                                                        fontSize: '0.65rem',
                                                                        fontWeight: '600',
                                                                        whiteSpace: 'nowrap',
                                                                    }}
                                                                    title={`Total batch records (may include duplicates)`}
                                                                >
                                                                    📦 {formula.totalBatchCount} Total
                                                                </span>
                                                                {/* Unique Batches */}
                                                                <span
                                                                    style={{
                                                                        padding: '0.15rem 0.5rem',
                                                                        background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                                                                        color: '#fff',
                                                                        borderRadius: '10px',
                                                                        fontSize: '0.65rem',
                                                                        fontWeight: '600',
                                                                        boxShadow: '0 2px 4px rgba(16, 185, 129, 0.2)',
                                                                        whiteSpace: 'nowrap',
                                                                    }}
                                                                    title={`Unique batch numbers: ${uniqueBatches} (RM: ${matched} matched + ${unmatched} unmatched = ${matched + unmatched})`}
                                                                >
                                                                    🎯 {uniqueBatches} Unique
                                                                </span>
                                                            </div>
                                                        );
                                                    })()}
                                                    {/* Per-formula RM Data Status Capsule with reconciliation */}
                                                    {(formula.rmDataMatched !== undefined || formula.rmDataUnmatched !== undefined) && (() => {
                                                        // Collect all product codes for this formula
                                                        const allProductCodes: string[] = [];
                                                        if (formula.masterFormulaDetails?.productCode) {
                                                            allProductCodes.push(formula.masterFormulaDetails.productCode);
                                                        }
                                                        // Add filling details product codes
                                                        if (formula.fillingDetails && Array.isArray(formula.fillingDetails)) {
                                                            formula.fillingDetails.forEach((fd: any) => {
                                                                if (fd.productCode && fd.productCode !== 'N/A' && !allProductCodes.includes(fd.productCode)) {
                                                                    allProductCodes.push(fd.productCode);
                                                                }
                                                            });
                                                        }
                                                        // Add process filling product codes
                                                        if (formula.processes && Array.isArray(formula.processes)) {
                                                            formula.processes.forEach((p: any) => {
                                                                if (p.fillingProducts && Array.isArray(p.fillingProducts)) {
                                                                    p.fillingProducts.forEach((fp: any) => {
                                                                        if (fp.productCode && !allProductCodes.includes(fp.productCode)) {
                                                                            allProductCodes.push(fp.productCode);
                                                                        }
                                                                    });
                                                                }
                                                            });
                                                        }

                                                        const ppmMatched = formula.ppmDataMatched || 0;
                                                        const ppmUnmatched = formula.ppmDataUnmatched || 0;
                                                        const pmMatched = formula.pmDataMatched || 0;
                                                        const pmUnmatched = formula.pmDataUnmatched || 0;

                                                        return (
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                {/* RM Capsule */}
                                                                <BatchStatusCapsule
                                                                    type="RM"
                                                                    matched={formula.rmDataMatched || 0}
                                                                    unmatched={formula.rmDataUnmatched || 0}
                                                                    onGreenClick={() => openPerFormulaRmModal(
                                                                        mfcNo,
                                                                        allProductCodes,
                                                                        formula.masterFormulaDetails.productName,
                                                                        'matched'
                                                                    )}
                                                                    onRedClick={() => openPerFormulaRmModal(
                                                                        mfcNo,
                                                                        allProductCodes,
                                                                        formula.masterFormulaDetails.productName,
                                                                        'unmatched'
                                                                    )}
                                                                    size="small"
                                                                />

                                                                {/* PPM Capsule (Blue) */}
                                                                {(ppmMatched > 0 || ppmUnmatched > 0) && (
                                                                    <div
                                                                        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                                                        title={`PPM (Primary Packing Material): ${ppmMatched} found, ${ppmUnmatched} missing`}
                                                                    >
                                                                        <span style={{
                                                                            fontSize: '9px',
                                                                            fontWeight: 700,
                                                                            color: '#2563eb',
                                                                            background: '#dbeafe',
                                                                            padding: '2px 5px',
                                                                            borderRadius: '4px',
                                                                            textTransform: 'uppercase',
                                                                            letterSpacing: '0.5px',
                                                                        }}>
                                                                            PPM
                                                                        </span>
                                                                        <div style={{
                                                                            display: 'inline-flex',
                                                                            alignItems: 'stretch',
                                                                            height: '20px',
                                                                            borderRadius: '20px',
                                                                            overflow: 'hidden',
                                                                            boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                                                                            border: '1px solid rgba(255,255,255,0.3)',
                                                                            minWidth: '60px',
                                                                        }}>
                                                                            {ppmMatched > 0 && (
                                                                                <button
                                                                                    onClick={(e) => { e.stopPropagation(); openPerFormulaPpmModal(mfcNo, allProductCodes, formula.masterFormulaDetails.productName, 'matched'); }}
                                                                                    style={{
                                                                                        flex: ppmMatched,
                                                                                        minWidth: '30px',
                                                                                        display: 'flex',
                                                                                        alignItems: 'center',
                                                                                        justifyContent: 'center',
                                                                                        gap: '3px',
                                                                                        padding: '2px 8px',
                                                                                        background: 'linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)',
                                                                                        color: 'white',
                                                                                        fontSize: '10px',
                                                                                        fontWeight: 700,
                                                                                        border: 'none',
                                                                                        cursor: 'pointer',
                                                                                        transition: 'filter 0.2s ease',
                                                                                    }}
                                                                                    onMouseEnter={(e) => e.currentTarget.style.filter = 'brightness(1.1)'}
                                                                                    onMouseLeave={(e) => e.currentTarget.style.filter = 'brightness(1)'}
                                                                                    title={`${ppmMatched} batches with PPM data - Click to view`}
                                                                                >
                                                                                    <span style={{ fontSize: '0.85em' }}>✓</span>
                                                                                    {ppmMatched}
                                                                                </button>
                                                                            )}
                                                                            {ppmUnmatched > 0 && (
                                                                                <button
                                                                                    onClick={(e) => { e.stopPropagation(); openPerFormulaPpmModal(mfcNo, allProductCodes, formula.masterFormulaDetails.productName, 'unmatched'); }}
                                                                                    style={{
                                                                                        flex: ppmUnmatched,
                                                                                        minWidth: '30px',
                                                                                        display: 'flex',
                                                                                        alignItems: 'center',
                                                                                        justifyContent: 'center',
                                                                                        gap: '3px',
                                                                                        padding: '2px 8px',
                                                                                        background: 'linear-gradient(135deg, #dc2626 0%, #ef4444 100%)',
                                                                                        color: 'white',
                                                                                        fontSize: '10px',
                                                                                        fontWeight: 700,
                                                                                        border: 'none',
                                                                                        cursor: 'pointer',
                                                                                        transition: 'filter 0.2s ease',
                                                                                    }}
                                                                                    onMouseEnter={(e) => e.currentTarget.style.filter = 'brightness(1.1)'}
                                                                                    onMouseLeave={(e) => e.currentTarget.style.filter = 'brightness(1)'}
                                                                                    title={`${ppmUnmatched} batches without PPM data - Click to view`}
                                                                                >
                                                                                    <span style={{ fontSize: '0.85em' }}>✕</span>
                                                                                    {ppmUnmatched}
                                                                                </button>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                )}

                                                                {/* PM Capsule (Purple) */}
                                                                {(pmMatched > 0 || pmUnmatched > 0) && (
                                                                    <div
                                                                        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                                                        title={`PM (Packing Material): ${pmMatched} found, ${pmUnmatched} missing`}
                                                                    >
                                                                        <span style={{
                                                                            fontSize: '9px',
                                                                            fontWeight: 700,
                                                                            color: '#7c3aed',
                                                                            background: '#f3e8ff',
                                                                            padding: '2px 5px',
                                                                            borderRadius: '4px',
                                                                            textTransform: 'uppercase',
                                                                            letterSpacing: '0.5px',
                                                                        }}>
                                                                            PM
                                                                        </span>
                                                                        <div style={{
                                                                            display: 'inline-flex',
                                                                            alignItems: 'stretch',
                                                                            height: '20px',
                                                                            borderRadius: '20px',
                                                                            overflow: 'hidden',
                                                                            boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                                                                            border: '1px solid rgba(255,255,255,0.3)',
                                                                            minWidth: '60px',
                                                                        }}>
                                                                            {pmMatched > 0 && (
                                                                                <button
                                                                                    onClick={(e) => { e.stopPropagation(); openPerFormulaPmModal(mfcNo, allProductCodes, formula.masterFormulaDetails.productName, 'matched'); }}
                                                                                    style={{
                                                                                        flex: pmMatched,
                                                                                        minWidth: '30px',
                                                                                        display: 'flex',
                                                                                        alignItems: 'center',
                                                                                        justifyContent: 'center',
                                                                                        gap: '3px',
                                                                                        padding: '2px 8px',
                                                                                        background: 'linear-gradient(135deg, #6d28d9 0%, #7c3aed 100%)',
                                                                                        color: 'white',
                                                                                        fontSize: '10px',
                                                                                        fontWeight: 700,
                                                                                        border: 'none',
                                                                                        cursor: 'pointer',
                                                                                        transition: 'filter 0.2s ease',
                                                                                    }}
                                                                                    onMouseEnter={(e) => e.currentTarget.style.filter = 'brightness(1.1)'}
                                                                                    onMouseLeave={(e) => e.currentTarget.style.filter = 'brightness(1)'}
                                                                                    title={`${pmMatched} batches with PM data - Click to view`}
                                                                                >
                                                                                    <span style={{ fontSize: '0.85em' }}>✓</span>
                                                                                    {pmMatched}
                                                                                </button>
                                                                            )}
                                                                            {pmUnmatched > 0 && (
                                                                                <button
                                                                                    onClick={(e) => { e.stopPropagation(); openPerFormulaPmModal(mfcNo, allProductCodes, formula.masterFormulaDetails.productName, 'unmatched'); }}
                                                                                    style={{
                                                                                        flex: pmUnmatched,
                                                                                        minWidth: '30px',
                                                                                        display: 'flex',
                                                                                        alignItems: 'center',
                                                                                        justifyContent: 'center',
                                                                                        gap: '3px',
                                                                                        padding: '2px 8px',
                                                                                        background: 'linear-gradient(135deg, #dc2626 0%, #ef4444 100%)',
                                                                                        color: 'white',
                                                                                        fontSize: '10px',
                                                                                        fontWeight: 700,
                                                                                        border: 'none',
                                                                                        cursor: 'pointer',
                                                                                        transition: 'filter 0.2s ease',
                                                                                    }}
                                                                                    onMouseEnter={(e) => e.currentTarget.style.filter = 'brightness(1.1)'}
                                                                                    onMouseLeave={(e) => e.currentTarget.style.filter = 'brightness(1)'}
                                                                                    title={`${pmUnmatched} batches without PM data - Click to view`}
                                                                                >
                                                                                    <span style={{ fontSize: '0.85em' }}>✕</span>
                                                                                    {pmUnmatched}
                                                                                </button>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                )}

                                                                {/* RM COA Capsule (Cyan/Teal) */}
                                                                <BatchStatusCapsule
                                                                    type="RM COA"
                                                                    matched={formula.materialQualified || 0}
                                                                    unmatched={formula.materialUnqualified || 0}
                                                                    onGreenClick={() => openMatDataModal('qualified')}
                                                                    onRedClick={() => openMatDataModal('unqualified')}
                                                                    size="small"
                                                                />

                                                                {/* PM COA Capsule (Red) */}
                                                                <BatchStatusCapsule
                                                                    type="PM COA"
                                                                    matched={(formula as any).pmCoaQualified || 0}
                                                                    unmatched={(formula as any).pmCoaUnqualified || 0}
                                                                    onGreenClick={() => { }} // TODO: Open PM COA modal
                                                                    onRedClick={() => { }} // TODO: Open PM COA modal
                                                                    size="small"
                                                                />

                                                                {/* PPM COA Capsule (Orange) */}
                                                                <BatchStatusCapsule
                                                                    type="PPM COA"
                                                                    matched={(formula as any).ppmCoaQualified || 0}
                                                                    unmatched={(formula as any).ppmCoaUnqualified || 0}
                                                                    onGreenClick={() => { }} // TODO: Open PPM COA modal
                                                                    onRedClick={() => { }} // TODO: Open PPM COA modal
                                                                    size="small"
                                                                />
                                                            </div>
                                                        );
                                                    })()}
                                                </div>

                                                {/* Manufacturer Tag */}
                                                <div style={{
                                                    padding: '0.25rem 0.75rem',
                                                    borderRadius: 'var(--radius-sm)',
                                                    background: colors.light,
                                                    color: colors.primary,
                                                    fontSize: '0.75rem',
                                                    fontWeight: '600',
                                                }}>
                                                    {formula.masterFormulaDetails.manufacturer || 'N/A'}
                                                </div>


                                            </div>

                                            {/* Expanded Content - FormulaDisplay Style */}
                                            {isExpanded && (
                                                <div style={{
                                                    padding: '1.5rem',
                                                    borderTop: '1px solid var(--border)',
                                                    background: 'var(--background)',
                                                }}>
                                                    {/* Header with Product Name */}
                                                    <div style={{
                                                        display: 'flex',
                                                        alignItems: 'flex-start',
                                                        justifyContent: 'space-between',
                                                        marginBottom: '1.5rem',
                                                        flexWrap: 'wrap',
                                                        gap: '1rem',
                                                    }}>
                                                        <div>
                                                            <h2 style={{
                                                                fontSize: '1.5rem',
                                                                fontWeight: '700',
                                                                color: 'var(--foreground)',
                                                                marginBottom: '0.5rem',
                                                            }}>
                                                                {formula.masterFormulaDetails.productName || 'Formula Details'}
                                                            </h2>
                                                            <div style={{
                                                                display: 'flex',
                                                                gap: '0.75rem',
                                                                flexWrap: 'wrap',
                                                            }}>
                                                                <span style={{
                                                                    padding: '0.375rem 0.75rem',
                                                                    background: 'var(--gradient-primary)',
                                                                    color: 'white',
                                                                    borderRadius: 'var(--radius-full)',
                                                                    fontSize: '0.875rem',
                                                                    fontWeight: '500',
                                                                }}>
                                                                    {mfcNo}
                                                                </span>
                                                                <span style={{
                                                                    padding: '0.375rem 0.75rem',
                                                                    background: formula.parsingStatus === 'success' ? '#10b981' : '#f59e0b',
                                                                    color: 'white',
                                                                    borderRadius: 'var(--radius-full)',
                                                                    fontSize: '0.875rem',
                                                                    fontWeight: '500',
                                                                }}>
                                                                    {formula.parsingStatus === 'success' ? 'Complete' : 'Partial'}
                                                                </span>
                                                                {formula.totalBatchCount && formula.totalBatchCount > 0 && (
                                                                    <span
                                                                        role="button"
                                                                        tabIndex={0}
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            openBatchListModal(
                                                                                getFormulaAllProductCodes(formula),
                                                                                formula.masterFormulaDetails.productName
                                                                            );
                                                                        }}
                                                                        onKeyDown={(e) => {
                                                                            if (e.key === 'Enter' || e.key === ' ') {
                                                                                e.stopPropagation();
                                                                                openBatchListModal(
                                                                                    getFormulaAllProductCodes(formula),
                                                                                    formula.masterFormulaDetails.productName
                                                                                );
                                                                            }
                                                                        }}
                                                                        style={{
                                                                            padding: '0.375rem 0.75rem',
                                                                            background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                                                                            color: 'white',
                                                                            borderRadius: 'var(--radius-full)',
                                                                            fontSize: '0.875rem',
                                                                            fontWeight: '600',
                                                                            boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)',
                                                                            cursor: 'pointer',
                                                                            transition: 'all 0.15s ease',
                                                                            display: 'inline-flex',
                                                                            alignItems: 'center',
                                                                            gap: '4px',
                                                                        }}
                                                                        onMouseEnter={(e) => {
                                                                            e.currentTarget.style.transform = 'scale(1.05)';
                                                                            e.currentTarget.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.4)';
                                                                        }}
                                                                        onMouseLeave={(e) => {
                                                                            e.currentTarget.style.transform = 'scale(1)';
                                                                            e.currentTarget.style.boxShadow = '0 2px 8px rgba(16, 185, 129, 0.3)';
                                                                        }}
                                                                        title="Click to view all batch details"
                                                                    >
                                                                        📦 {formula.totalBatchCount} Batches - View Details
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* BATCH ACTION PANEL - APPEARS FIRST */}
                                                    {formula.totalBatchCount && formula.totalBatchCount > 0 && (
                                                        <div style={{
                                                            marginBottom: '1.25rem',
                                                            padding: '1.25rem 1.5rem',
                                                            background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
                                                            borderRadius: '16px',
                                                            border: '1px solid rgba(139, 92, 246, 0.3)',
                                                            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3), 0 0 20px rgba(139, 92, 246, 0.1)',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'space-between',
                                                            gap: '1.5rem',
                                                            flexWrap: 'wrap',
                                                        }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                                                <div style={{
                                                                    width: '52px',
                                                                    height: '52px',
                                                                    borderRadius: '14px',
                                                                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'center',
                                                                    boxShadow: '0 4px 16px rgba(16, 185, 129, 0.4)',
                                                                    fontSize: '1.5rem',
                                                                }}>
                                                                    📦
                                                                </div>
                                                                <div>
                                                                    <div style={{
                                                                        fontSize: '1.15rem',
                                                                        fontWeight: '800',
                                                                        color: 'white',
                                                                        letterSpacing: '-0.01em',
                                                                    }}>
                                                                        {formula.totalBatchCount} Production Batches
                                                                    </div>
                                                                    <div style={{
                                                                        fontSize: '0.85rem',
                                                                        color: 'rgba(255, 255, 255, 0.6)',
                                                                        marginTop: '2px',
                                                                    }}>
                                                                        Click to view batch manufacturing records
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        toggleMfcBatchData(formula._id, formula);
                                                                    }}
                                                                    style={{
                                                                        padding: '0.875rem 1.75rem',
                                                                        background: isMfcBatchDataVisible(formula._id)
                                                                            ? 'linear-gradient(135deg, #dc2626 0%, #ef4444 100%)'
                                                                            : 'linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)',
                                                                        color: 'white',
                                                                        borderRadius: '14px',
                                                                        fontSize: '1rem',
                                                                        fontWeight: '700',
                                                                        boxShadow: isMfcBatchDataVisible(formula._id)
                                                                            ? '0 6px 20px rgba(220, 38, 38, 0.4)'
                                                                            : '0 6px 20px rgba(139, 92, 246, 0.4)',
                                                                        border: 'none',
                                                                        cursor: 'pointer',
                                                                        transition: 'all 0.2s ease',
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        gap: '10px',
                                                                        whiteSpace: 'nowrap',
                                                                    }}
                                                                    onMouseEnter={(e) => {
                                                                        e.currentTarget.style.transform = 'scale(1.05)';
                                                                    }}
                                                                    onMouseLeave={(e) => {
                                                                        e.currentTarget.style.transform = 'scale(1)';
                                                                    }}
                                                                >
                                                                    {isMfcBatchDataVisible(formula._id) ? '✕ Hide Batches' : '🔓 Show Batches'}
                                                                </button>
                                                                <button
                                                                    onClick={() => openBatchListModal(
                                                                        getFormulaAllProductCodes(formula),
                                                                        formula.masterFormulaDetails.productName
                                                                    )}
                                                                    style={{
                                                                        padding: '0.875rem 1.75rem',
                                                                        background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                                                                        color: 'white',
                                                                        borderRadius: '14px',
                                                                        fontSize: '1rem',
                                                                        fontWeight: '700',
                                                                        boxShadow: '0 6px 20px rgba(16, 185, 129, 0.4)',
                                                                        border: 'none',
                                                                        cursor: 'pointer',
                                                                        transition: 'all 0.2s ease',
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        gap: '10px',
                                                                        whiteSpace: 'nowrap',
                                                                    }}
                                                                    onMouseEnter={(e) => {
                                                                        e.currentTarget.style.transform = 'scale(1.05)';
                                                                        e.currentTarget.style.boxShadow = '0 8px 24px rgba(16, 185, 129, 0.5)';
                                                                    }}
                                                                    onMouseLeave={(e) => {
                                                                        e.currentTarget.style.transform = 'scale(1)';
                                                                        e.currentTarget.style.boxShadow = '0 6px 20px rgba(16, 185, 129, 0.4)';
                                                                    }}
                                                                >
                                                                    🔍 Open in Modal
                                                                </button>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* File Info Banner */}
                                                    <div style={{
                                                        padding: '0.875rem 1.25rem',
                                                        background: 'var(--muted)',
                                                        borderRadius: 'var(--radius-lg)',
                                                        marginBottom: '1.25rem',
                                                        display: 'flex',
                                                        justifyContent: 'space-between',
                                                        flexWrap: 'wrap',
                                                        gap: '1rem',
                                                        fontSize: '0.8rem',
                                                    }}>
                                                        <span><strong>File:</strong> {formula.fileName}</span>
                                                        <span><strong>Size:</strong> {(formula.fileSize / 1024).toFixed(2)} KB</span>
                                                        <span><strong>Uploaded:</strong> {new Date(formula.uploadedAt).toLocaleString()}</span>
                                                    </div>

                                                    {/* Batch Data Section - PREMIUM CARD-BASED DESIGN - SHOWS FIRST */}
                                                    {formula.totalBatchCount && formula.totalBatchCount > 0 && isMfcBatchDataVisible(formula._id) && (
                                                        <div style={{
                                                            marginBottom: '1.5rem',
                                                            padding: '1.75rem',
                                                            background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%)',
                                                            borderRadius: '20px',
                                                            border: '1px solid rgba(139, 92, 246, 0.3)',
                                                            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.4), 0 0 40px rgba(139, 92, 246, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
                                                        }}>
                                                            {/* Premium Header */}
                                                            <div style={{
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'space-between',
                                                                marginBottom: '1.5rem',
                                                                paddingBottom: '1rem',
                                                                borderBottom: '1px solid rgba(139, 92, 246, 0.2)',
                                                            }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                                                    <div style={{
                                                                        width: '48px',
                                                                        height: '48px',
                                                                        borderRadius: '14px',
                                                                        background: 'linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)',
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        justifyContent: 'center',
                                                                        boxShadow: '0 4px 16px rgba(139, 92, 246, 0.4)',
                                                                    }}>
                                                                        <span style={{ fontSize: '1.5rem' }}>📦</span>
                                                                    </div>
                                                                    <div>
                                                                        <h3 style={{
                                                                            fontSize: '1.35rem',
                                                                            fontWeight: '800',
                                                                            color: 'white',
                                                                            margin: 0,
                                                                            letterSpacing: '-0.02em',
                                                                        }}>
                                                                            Batch Production Records
                                                                        </h3>
                                                                        <p style={{
                                                                            fontSize: '0.85rem',
                                                                            color: 'rgba(255, 255, 255, 0.6)',
                                                                            margin: '0.25rem 0 0 0',
                                                                        }}>
                                                                            Complete manufacturing batch history
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                                {!isMfcBatchDataLoading(formula._id) && mfcBatchData[formula._id] && (
                                                                    <div style={{
                                                                        padding: '0.5rem 1.25rem',
                                                                        background: 'linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)',
                                                                        color: 'white',
                                                                        borderRadius: '30px',
                                                                        fontSize: '0.9rem',
                                                                        fontWeight: '700',
                                                                        boxShadow: '0 4px 12px rgba(139, 92, 246, 0.4)',
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        gap: '0.5rem',
                                                                    }}>
                                                                        <span style={{ fontSize: '1.1rem' }}>🏭</span>
                                                                        {mfcBatchData[formula._id].length} Batches
                                                                    </div>
                                                                )}
                                                            </div>

                                                            {/* Loading State */}
                                                            {isMfcBatchDataLoading(formula._id) && (
                                                                <div style={{
                                                                    textAlign: 'center',
                                                                    padding: '3rem',
                                                                }}>
                                                                    <div style={{
                                                                        width: '60px',
                                                                        height: '60px',
                                                                        margin: '0 auto 1rem auto',
                                                                        borderRadius: '50%',
                                                                        border: '3px solid rgba(139, 92, 246, 0.2)',
                                                                        borderTopColor: '#a855f7',
                                                                        animation: 'spin 1s linear infinite',
                                                                    }} />
                                                                    <p style={{ color: 'rgba(255, 255, 255, 0.7)', fontWeight: '600', fontSize: '1rem' }}>Loading batch records...</p>
                                                                </div>
                                                            )}

                                                            {/* Batch Cards Grid */}
                                                            {!isMfcBatchDataLoading(formula._id) && mfcBatchData[formula._id] && mfcBatchData[formula._id].length > 0 && (
                                                                <div style={{
                                                                    display: 'flex',
                                                                    flexDirection: 'column',
                                                                    gap: '1rem',
                                                                    maxHeight: '600px',
                                                                    overflowY: 'auto',
                                                                    paddingRight: '0.5rem',
                                                                }}>
                                                                    {mfcBatchData[formula._id].map((batch, idx) => (
                                                                        <div
                                                                            key={idx}
                                                                            style={{
                                                                                background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.02) 100%)',
                                                                                backdropFilter: 'blur(10px)',
                                                                                borderRadius: '16px',
                                                                                border: '1px solid rgba(255, 255, 255, 0.08)',
                                                                                padding: '1.25rem',
                                                                                transition: 'all 0.2s ease',
                                                                            }}
                                                                            onMouseEnter={(e) => {
                                                                                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(139, 92, 246, 0.15) 0%, rgba(168, 85, 247, 0.1) 100%)';
                                                                                e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.3)';
                                                                                e.currentTarget.style.transform = 'translateY(-2px)';
                                                                            }}
                                                                            onMouseLeave={(e) => {
                                                                                e.currentTarget.style.background = 'linear-gradient(135deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.02) 100%)';
                                                                                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
                                                                                e.currentTarget.style.transform = 'translateY(0)';
                                                                            }}
                                                                        >
                                                                            {/* Card Header */}
                                                                            <div style={{
                                                                                display: 'flex',
                                                                                alignItems: 'center',
                                                                                justifyContent: 'space-between',
                                                                                marginBottom: '1rem',
                                                                                paddingBottom: '0.75rem',
                                                                                borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                                                                            }}>
                                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                                                                    <div style={{
                                                                                        width: '36px',
                                                                                        height: '36px',
                                                                                        borderRadius: '10px',
                                                                                        background: batch.type === 'Export'
                                                                                            ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                                                                                            : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                                                                                        display: 'flex',
                                                                                        alignItems: 'center',
                                                                                        justifyContent: 'center',
                                                                                        fontSize: '1rem',
                                                                                        boxShadow: batch.type === 'Export'
                                                                                            ? '0 4px 12px rgba(16, 185, 129, 0.3)'
                                                                                            : '0 4px 12px rgba(59, 130, 246, 0.3)',
                                                                                    }}>
                                                                                        {batch.type === 'Export' ? '📤' : '📥'}
                                                                                    </div>
                                                                                    <div>
                                                                                        <div style={{
                                                                                            fontFamily: 'monospace',
                                                                                            fontSize: '1.1rem',
                                                                                            fontWeight: '800',
                                                                                            color: '#a855f7',
                                                                                            letterSpacing: '0.02em',
                                                                                        }}>
                                                                                            {batch.batchNumber}
                                                                                        </div>
                                                                                        <div style={{
                                                                                            fontSize: '0.75rem',
                                                                                            color: 'rgba(255, 255, 255, 0.5)',
                                                                                            marginTop: '2px',
                                                                                        }}>
                                                                                            Batch #{idx + 1}
                                                                                        </div>
                                                                                    </div>
                                                                                </div>
                                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                                                    <span style={{
                                                                                        padding: '0.35rem 0.75rem',
                                                                                        background: batch.type === 'Export'
                                                                                            ? 'rgba(16, 185, 129, 0.2)'
                                                                                            : 'rgba(59, 130, 246, 0.2)',
                                                                                        color: batch.type === 'Export' ? '#34d399' : '#60a5fa',
                                                                                        borderRadius: '8px',
                                                                                        fontSize: '0.75rem',
                                                                                        fontWeight: '700',
                                                                                        textTransform: 'uppercase',
                                                                                        letterSpacing: '0.05em',
                                                                                    }}>
                                                                                        {batch.type}
                                                                                    </span>
                                                                                    <button
                                                                                        onClick={() => openBatchModal(batch.batchNumber)}
                                                                                        style={{
                                                                                            padding: '0.5rem 1rem',
                                                                                            background: 'linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)',
                                                                                            color: 'white',
                                                                                            borderRadius: '10px',
                                                                                            fontSize: '0.8rem',
                                                                                            fontWeight: '700',
                                                                                            border: 'none',
                                                                                            cursor: 'pointer',
                                                                                            transition: 'all 0.15s ease',
                                                                                            boxShadow: '0 4px 12px rgba(139, 92, 246, 0.3)',
                                                                                        }}
                                                                                        onMouseEnter={(e) => {
                                                                                            e.currentTarget.style.transform = 'scale(1.05)';
                                                                                            e.currentTarget.style.boxShadow = '0 6px 16px rgba(139, 92, 246, 0.4)';
                                                                                        }}
                                                                                        onMouseLeave={(e) => {
                                                                                            e.currentTarget.style.transform = 'scale(1)';
                                                                                            e.currentTarget.style.boxShadow = '0 4px 12px rgba(139, 92, 246, 0.3)';
                                                                                        }}
                                                                                    >
                                                                                        🔍 Details
                                                                                    </button>
                                                                                </div>
                                                                            </div>

                                                                            {/* Main Content - 2 Column Grid */}
                                                                            <div style={{
                                                                                display: 'grid',
                                                                                gridTemplateColumns: 'repeat(2, 1fr)',
                                                                                gap: '0.75rem 1.5rem',
                                                                            }}>
                                                                                {/* Item Code */}
                                                                                <div style={{
                                                                                    display: 'flex',
                                                                                    alignItems: 'center',
                                                                                    gap: '0.5rem',
                                                                                }}>
                                                                                    <span style={{ fontSize: '0.9rem' }}>🏷️</span>
                                                                                    <span style={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: '0.75rem', minWidth: '70px' }}>Item Code</span>
                                                                                    <span style={{ color: 'white', fontSize: '0.85rem', fontWeight: '600', fontFamily: 'monospace' }}>{batch.itemCode}</span>
                                                                                </div>

                                                                                {/* Item Name */}
                                                                                <div style={{
                                                                                    display: 'flex',
                                                                                    alignItems: 'center',
                                                                                    gap: '0.5rem',
                                                                                    gridColumn: batch.itemName && batch.itemName.length > 30 ? 'span 2' : 'span 1',
                                                                                }}>
                                                                                    <span style={{ fontSize: '0.9rem' }}>💊</span>
                                                                                    <span style={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: '0.75rem', minWidth: '70px' }}>Product</span>
                                                                                    <span style={{ color: '#f0abfc', fontSize: '0.85rem', fontWeight: '600' }}>{batch.itemName || 'N/A'}</span>
                                                                                </div>

                                                                                {/* Manufacturing Date */}
                                                                                <div style={{
                                                                                    display: 'flex',
                                                                                    alignItems: 'center',
                                                                                    gap: '0.5rem',
                                                                                }}>
                                                                                    <span style={{ fontSize: '0.9rem' }}>📅</span>
                                                                                    <span style={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: '0.75rem', minWidth: '70px' }}>Mfg Date</span>
                                                                                    <span style={{ color: '#86efac', fontSize: '0.85rem', fontWeight: '600' }}>{batch.mfgDate || 'N/A'}</span>
                                                                                </div>

                                                                                {/* Expiry Date */}
                                                                                <div style={{
                                                                                    display: 'flex',
                                                                                    alignItems: 'center',
                                                                                    gap: '0.5rem',
                                                                                }}>
                                                                                    <span style={{ fontSize: '0.9rem' }}>⏰</span>
                                                                                    <span style={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: '0.75rem', minWidth: '70px' }}>Expiry</span>
                                                                                    <span style={{ color: '#fca5a5', fontSize: '0.85rem', fontWeight: '600' }}>{batch.expiryDate || 'N/A'}</span>
                                                                                </div>

                                                                                {/* Batch Size */}
                                                                                <div style={{
                                                                                    display: 'flex',
                                                                                    alignItems: 'center',
                                                                                    gap: '0.5rem',
                                                                                }}>
                                                                                    <span style={{ fontSize: '0.9rem' }}>📊</span>
                                                                                    <span style={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: '0.75rem', minWidth: '70px' }}>Batch Size</span>
                                                                                    <span style={{ color: '#c4b5fd', fontSize: '0.85rem', fontWeight: '700' }}>{batch.batchSize} {batch.unit}</span>
                                                                                </div>

                                                                                {/* Pack */}
                                                                                <div style={{
                                                                                    display: 'flex',
                                                                                    alignItems: 'center',
                                                                                    gap: '0.5rem',
                                                                                }}>
                                                                                    <span style={{ fontSize: '0.9rem' }}>📦</span>
                                                                                    <span style={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: '0.75rem', minWidth: '70px' }}>Pack</span>
                                                                                    <span style={{ color: 'white', fontSize: '0.85rem', fontWeight: '600' }}>{batch.pack || 'N/A'}</span>
                                                                                </div>

                                                                                {/* MRP Value */}
                                                                                <div style={{
                                                                                    display: 'flex',
                                                                                    alignItems: 'center',
                                                                                    gap: '0.5rem',
                                                                                }}>
                                                                                    <span style={{ fontSize: '0.9rem' }}>💰</span>
                                                                                    <span style={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: '0.75rem', minWidth: '70px' }}>MRP</span>
                                                                                    <span style={{ color: '#fde047', fontSize: '0.85rem', fontWeight: '700' }}>
                                                                                        {batch.mrpValue ? `₹${batch.mrpValue}` : 'N/A'}
                                                                                    </span>
                                                                                </div>

                                                                                {/* Department */}
                                                                                <div style={{
                                                                                    display: 'flex',
                                                                                    alignItems: 'center',
                                                                                    gap: '0.5rem',
                                                                                }}>
                                                                                    <span style={{ fontSize: '0.9rem' }}>🏢</span>
                                                                                    <span style={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: '0.75rem', minWidth: '70px' }}>Dept</span>
                                                                                    <span style={{ color: 'white', fontSize: '0.85rem', fontWeight: '600' }}>{batch.department || 'N/A'}</span>
                                                                                </div>

                                                                                {/* Location */}
                                                                                <div style={{
                                                                                    display: 'flex',
                                                                                    alignItems: 'center',
                                                                                    gap: '0.5rem',
                                                                                }}>
                                                                                    <span style={{ fontSize: '0.9rem' }}>📍</span>
                                                                                    <span style={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: '0.75rem', minWidth: '70px' }}>Location</span>
                                                                                    <span style={{ color: 'white', fontSize: '0.85rem', fontWeight: '600' }}>{batch.locationId || 'N/A'}</span>
                                                                                </div>

                                                                                {/* Manufacturing License */}
                                                                                <div style={{
                                                                                    display: 'flex',
                                                                                    alignItems: 'center',
                                                                                    gap: '0.5rem',
                                                                                }}>
                                                                                    <span style={{ fontSize: '0.9rem' }}>📜</span>
                                                                                    <span style={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: '0.75rem', minWidth: '70px' }}>Mfg Lic</span>
                                                                                    <span style={{ color: 'white', fontSize: '0.85rem', fontWeight: '600' }}>{batch.mfgLicNo || 'N/A'}</span>
                                                                                </div>

                                                                                {/* Year */}
                                                                                <div style={{
                                                                                    display: 'flex',
                                                                                    alignItems: 'center',
                                                                                    gap: '0.5rem',
                                                                                }}>
                                                                                    <span style={{ fontSize: '0.9rem' }}>🗓️</span>
                                                                                    <span style={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: '0.75rem', minWidth: '70px' }}>Year</span>
                                                                                    <span style={{ color: 'white', fontSize: '0.85rem', fontWeight: '600' }}>{batch.year || 'N/A'}</span>
                                                                                </div>

                                                                                {/* Make */}
                                                                                <div style={{
                                                                                    display: 'flex',
                                                                                    alignItems: 'center',
                                                                                    gap: '0.5rem',
                                                                                }}>
                                                                                    <span style={{ fontSize: '0.9rem' }}>🏭</span>
                                                                                    <span style={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: '0.75rem', minWidth: '70px' }}>Make</span>
                                                                                    <span style={{ color: 'white', fontSize: '0.85rem', fontWeight: '600' }}>{batch.make || 'N/A'}</span>
                                                                                </div>

                                                                                {/* Batch Completion Date */}
                                                                                {batch.batchCompletionDate && (
                                                                                    <div style={{
                                                                                        display: 'flex',
                                                                                        alignItems: 'center',
                                                                                        gap: '0.5rem',
                                                                                    }}>
                                                                                        <span style={{ fontSize: '0.9rem' }}>✅</span>
                                                                                        <span style={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: '0.75rem', minWidth: '70px' }}>Completed</span>
                                                                                        <span style={{ color: '#86efac', fontSize: '0.85rem', fontWeight: '600' }}>{batch.batchCompletionDate}</span>
                                                                                    </div>
                                                                                )}
                                                                            </div>

                                                                            {/* Company Info Footer */}
                                                                            {(batch.companyName || batch.fileName) && (
                                                                                <div style={{
                                                                                    marginTop: '1rem',
                                                                                    paddingTop: '0.75rem',
                                                                                    borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                                                                                    display: 'flex',
                                                                                    alignItems: 'center',
                                                                                    justifyContent: 'space-between',
                                                                                    flexWrap: 'wrap',
                                                                                    gap: '0.5rem',
                                                                                }}>
                                                                                    {batch.companyName && batch.companyName !== 'N/A' && (
                                                                                        <div style={{
                                                                                            display: 'flex',
                                                                                            alignItems: 'center',
                                                                                            gap: '0.5rem',
                                                                                            fontSize: '0.75rem',
                                                                                            color: 'rgba(255, 255, 255, 0.4)',
                                                                                        }}>
                                                                                            <span>🏛️</span>
                                                                                            <span>{batch.companyName}</span>
                                                                                        </div>
                                                                                    )}
                                                                                    {batch.fileName && (
                                                                                        <div style={{
                                                                                            display: 'flex',
                                                                                            alignItems: 'center',
                                                                                            gap: '0.5rem',
                                                                                            fontSize: '0.7rem',
                                                                                            color: 'rgba(255, 255, 255, 0.3)',
                                                                                            fontFamily: 'monospace',
                                                                                        }}>
                                                                                            <span>📁</span>
                                                                                            <span>{batch.fileName}</span>
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}

                                                            {/* No Data State */}
                                                            {!isMfcBatchDataLoading(formula._id) && (!mfcBatchData[formula._id] || mfcBatchData[formula._id].length === 0) && (
                                                                <div style={{
                                                                    textAlign: 'center',
                                                                    padding: '3rem',
                                                                }}>
                                                                    <div style={{
                                                                        width: '80px',
                                                                        height: '80px',
                                                                        margin: '0 auto 1rem auto',
                                                                        borderRadius: '50%',
                                                                        background: 'rgba(255, 255, 255, 0.05)',
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        justifyContent: 'center',
                                                                        fontSize: '2.5rem',
                                                                    }}>📭</div>
                                                                    <p style={{ color: 'rgba(255, 255, 255, 0.6)', fontWeight: '600', fontSize: '1rem', margin: 0 }}>No batch data found for this formula</p>
                                                                    <p style={{ color: 'rgba(255, 255, 255, 0.4)', fontSize: '0.85rem', marginTop: '0.5rem' }}>Batch records may not have been uploaded yet</p>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}


                                                    {/* Company Information */}
                                                    {formula.companyInfo && (
                                                        <Section
                                                            title="Company Information"
                                                            icon={
                                                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                                    <path d="M3 21h18M3 7v1a3 3 0 0 0 6 0V7m0 1a3 3 0 0 0 6 0V7m0 1a3 3 0 0 0 6 0V7H3l2-4h14l2 4M5 21V10.85M19 21V10.85" />
                                                                </svg>
                                                            }
                                                            gradient="linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)"
                                                        >
                                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0 2rem' }}>
                                                                <InfoRow label="Company Name" value={formula.companyInfo.companyName} />
                                                                <InfoRow label="Company Address" value={formula.companyInfo.companyAddress} />
                                                                <InfoRow label="Document Title" value={formula.companyInfo.documentTitle} />
                                                                <InfoRow label="Page Number" value={formula.companyInfo.pageNumber} />
                                                            </div>
                                                        </Section>
                                                    )}

                                                    {/* Master Formula Details */}
                                                    <Section
                                                        title="Master Formula Details"
                                                        icon={
                                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                                                            </svg>
                                                        }
                                                        gradient="var(--gradient-primary)"
                                                    >
                                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0 2rem' }}>
                                                            <InfoRow label="Master Card No" value={formula.masterFormulaDetails.masterCardNo} />
                                                            <InfoRow label="Product Code" value={
                                                                <div style={{ display: 'flex', alignItems: 'center' }}>
                                                                    {formula.masterFormulaDetails.productCode}
                                                                    {batchCounts[formula.masterFormulaDetails.productCode] > 0 && (
                                                                        <span style={{
                                                                            marginLeft: '0.5rem',
                                                                            background: '#10b981',
                                                                            color: '#fff',
                                                                            padding: '0.1rem 0.4rem',
                                                                            borderRadius: '4px',
                                                                            fontSize: '0.7em'
                                                                        }}>
                                                                            {batchCounts[formula.masterFormulaDetails.productCode]} batches
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            } />
                                                            <InfoRow label="Product Name" value={formula.masterFormulaDetails.productName} />
                                                            <InfoRow label="Generic Name" value={formula.masterFormulaDetails.genericName} />
                                                            <InfoRow label="Specification" value={formula.masterFormulaDetails.specification} />
                                                            <InfoRow label="Manufacturing License No" value={formula.masterFormulaDetails.manufacturingLicenseNo} />
                                                            <InfoRow label="Manufacturing Location" value={formula.masterFormulaDetails.manufacturingLocation} />
                                                            <InfoRow label="Manufacturer" value={formula.masterFormulaDetails.manufacturer} />
                                                            <InfoRow label="Shelf Life" value={formula.masterFormulaDetails.shelfLife} />

                                                            <InfoRow label="Reason for Change" value={formula.masterFormulaDetails.reasonForChange} />
                                                            <InfoRow label="Effective Batch No" value={formula.masterFormulaDetails.effectiveBatchNo} />
                                                            <InfoRow label="Date" value={formula.masterFormulaDetails.date} />
                                                        </div>
                                                    </Section>

                                                    {/* Batch Information */}
                                                    <Section
                                                        title="Batch Information"
                                                        icon={
                                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                                <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                                                                <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                                                            </svg>
                                                        }
                                                        gradient="linear-gradient(135deg, #0891b2 0%, #0d9488 100%)"
                                                    >
                                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0 2rem' }}>
                                                            <InfoRow label="Batch Size" value={formula.batchInfo?.batchSize} />
                                                            <InfoRow label="Label Claim" value={formula.batchInfo?.labelClaim} />
                                                            <InfoRow label="Marketed By" value={formula.batchInfo?.marketedBy} />
                                                            <InfoRow label="Volume" value={formula.batchInfo?.volume} />
                                                        </div>
                                                    </Section>

                                                    {/* Composition */}
                                                    {formula.composition && formula.composition.length > 0 && (
                                                        <Section
                                                            title={`Composition / Label Claim (${formula.composition.length} items)`}
                                                            icon={
                                                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                                    <path d="M10 2v7.31M14 2v7.31M8.5 2h7M8.5 9.31h7M8.5 14.9h7M10 14.9v7.1M14 14.9v7.1" />
                                                                </svg>
                                                            }
                                                            gradient="linear-gradient(135deg, #059669 0%, #10b981 100%)"
                                                        >
                                                            <DataTable
                                                                headers={['Active Ingredient', 'Strength', 'Form', 'Equivalent Base']}
                                                                rows={formula.composition.map(item => [
                                                                    item.activeIngredientName,
                                                                    item.strengthPerUnit,
                                                                    item.form,
                                                                    item.equivalentBase,
                                                                ])}
                                                            />
                                                        </Section>
                                                    )}

                                                    {/* Materials Table */}
                                                    {formula.materials && formula.materials.length > 0 && (
                                                        <Section
                                                            title={`Aseptic Mixing Materials (${formula.materials.length} items)`}
                                                            icon={
                                                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                                                                    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                                                                </svg>
                                                            }
                                                            gradient="linear-gradient(135deg, #7c3aed 0%, #8b5cf6 100%)"
                                                        >
                                                            <DataTable
                                                                headers={[
                                                                    'Sr. No',
                                                                    'Material Code',
                                                                    'Material Name',
                                                                    'Potency',
                                                                    'Required Qty',
                                                                    'Overages %',
                                                                    'Qty/Unit',
                                                                    'Std Batch Qty',
                                                                ]}
                                                                rows={formula.materials.map(item => [
                                                                    item.srNo,
                                                                    item.materialCode,
                                                                    item.materialName,
                                                                    item.potencyCorrection,
                                                                    item.requiredQuantity,
                                                                    item.overages,
                                                                    item.quantityPerUnit,
                                                                    item.requiredQuantityStandardBatch,
                                                                ])}
                                                            />
                                                        </Section>
                                                    )}

                                                    {/* Excipients */}
                                                    {formula.excipients && formula.excipients.length > 0 && (
                                                        <Section
                                                            title={`Excipients / Additives (${formula.excipients.length} items)`}
                                                            icon={
                                                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                                    <circle cx="12" cy="12" r="10" />
                                                                    <path d="M12 16v-4M12 8h.01" />
                                                                </svg>
                                                            }
                                                            gradient="linear-gradient(135deg, #db2777 0%, #ec4899 100%)"
                                                        >
                                                            <DataTable
                                                                headers={['Name', 'Type', 'Quantity', 'Unit']}
                                                                rows={formula.excipients.map(item => [
                                                                    item.name,
                                                                    item.type,
                                                                    item.quantity,
                                                                    item.unit,
                                                                ])}
                                                            />
                                                        </Section>
                                                    )}


                                                    {formula.fillingDetails && formula.fillingDetails.length > 0 && (
                                                        <Section
                                                            title={`Filling Details (${formula.fillingDetails.length} items)`}
                                                            icon={
                                                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                                                    <polyline points="14 2 14 8 20 8" />
                                                                    <line x1="12" y1="18" x2="12" y2="12" />
                                                                    <line x1="9" y1="15" x2="15" y2="15" />
                                                                </svg>
                                                            }
                                                            gradient="linear-gradient(135deg, #ea580c 0%, #f97316 100%)"
                                                        >
                                                            {/* Filling Details Table - without packing materials */}
                                                            <div style={{
                                                                overflowX: 'auto',
                                                                borderRadius: 'var(--radius-lg)',
                                                                border: '1px solid var(--border)',
                                                            }}>
                                                                <table style={{
                                                                    width: '100%',
                                                                    borderCollapse: 'collapse',
                                                                    fontSize: '0.8rem',
                                                                }}>
                                                                    <thead>
                                                                        <tr style={{ background: 'var(--muted)' }}>
                                                                            <th style={{
                                                                                padding: '0.75rem 1rem',
                                                                                textAlign: 'left',
                                                                                fontWeight: '600',
                                                                                color: 'var(--foreground)',
                                                                                borderBottom: '2px solid var(--border)',
                                                                                whiteSpace: 'nowrap',
                                                                            }}>Product Code</th>
                                                                            <th style={{
                                                                                padding: '0.75rem 1rem',
                                                                                textAlign: 'left',
                                                                                fontWeight: '600',
                                                                                color: 'var(--foreground)',
                                                                                borderBottom: '2px solid var(--border)',
                                                                                whiteSpace: 'nowrap',
                                                                            }}>Product Name</th>
                                                                            <th style={{
                                                                                padding: '0.75rem 1rem',
                                                                                textAlign: 'left',
                                                                                fontWeight: '600',
                                                                                color: 'var(--foreground)',
                                                                                borderBottom: '2px solid var(--border)',
                                                                                whiteSpace: 'nowrap',
                                                                            }}>Packing Size</th>
                                                                            <th style={{
                                                                                padding: '0.75rem 1rem',
                                                                                textAlign: 'left',
                                                                                fontWeight: '600',
                                                                                color: 'var(--foreground)',
                                                                                borderBottom: '2px solid var(--border)',
                                                                                whiteSpace: 'nowrap',
                                                                            }}>Filling Qty</th>
                                                                            <th style={{
                                                                                padding: '0.75rem 1rem',
                                                                                textAlign: 'left',
                                                                                fontWeight: '600',
                                                                                color: 'var(--foreground)',
                                                                                borderBottom: '2px solid var(--border)',
                                                                                whiteSpace: 'nowrap',
                                                                            }}>No. of Units</th>
                                                                            <th style={{
                                                                                padding: '0.75rem 1rem',
                                                                                textAlign: 'left',
                                                                                fontWeight: '600',
                                                                                color: 'var(--foreground)',
                                                                                borderBottom: '2px solid var(--border)',
                                                                                whiteSpace: 'nowrap',
                                                                            }}>Type</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody>
                                                                        {formula.fillingDetails.map((item, rowIndex) => {
                                                                            const hasMatch = batchCounts[item.productCode] > 0;
                                                                            const hasPackingMaterials = item.packingMaterials && item.packingMaterials.length > 0;
                                                                            const isExpanded = expandedFillingDetails.has(`${formula._id}-${item.productCode}`);

                                                                            return (
                                                                                <React.Fragment key={item.productCode || rowIndex}>
                                                                                    <tr
                                                                                        style={{
                                                                                            background: rowIndex % 2 === 0 ? 'transparent' : 'var(--muted)',
                                                                                            transition: 'background 0.15s ease',
                                                                                        }}
                                                                                    >
                                                                                        {/* Product Code */}
                                                                                        <td style={{
                                                                                            padding: '0.625rem 1rem',
                                                                                            borderBottom: '1px solid var(--border)',
                                                                                            color: 'var(--foreground)',
                                                                                        }}>
                                                                                            <span style={{
                                                                                                display: 'inline-flex',
                                                                                                alignItems: 'center',
                                                                                                gap: '0.5rem',
                                                                                                background: hasMatch ? '#dcfce7' : 'transparent',
                                                                                                padding: hasMatch ? '0.25rem 0.5rem' : '0',
                                                                                                borderRadius: '4px',
                                                                                                fontFamily: 'monospace',
                                                                                                fontWeight: hasMatch ? '600' : '400',
                                                                                            }}>
                                                                                                {/* Expand Button for Packing Materials */}
                                                                                                {hasPackingMaterials && (
                                                                                                    <button
                                                                                                        onClick={(e) => {
                                                                                                            e.stopPropagation();
                                                                                                            toggleFillingDetail(formula._id, item.productCode);
                                                                                                        }}
                                                                                                        style={{
                                                                                                            background: isExpanded
                                                                                                                ? 'linear-gradient(135deg, #7c3aed 0%, #8b5cf6 100%)'
                                                                                                                : 'linear-gradient(135deg, #6366f1 0%, #818cf8 100%)',
                                                                                                            color: '#fff',
                                                                                                            width: '24px',
                                                                                                            height: '24px',
                                                                                                            borderRadius: '6px',
                                                                                                            fontSize: '0.75rem',
                                                                                                            fontWeight: '600',
                                                                                                            border: 'none',
                                                                                                            cursor: 'pointer',
                                                                                                            display: 'inline-flex',
                                                                                                            alignItems: 'center',
                                                                                                            justifyContent: 'center',
                                                                                                            boxShadow: '0 2px 4px rgba(99, 102, 241, 0.3)',
                                                                                                            transition: 'all 0.2s ease',
                                                                                                            transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                                                                                                        }}
                                                                                                        onMouseEnter={(e) => {
                                                                                                            e.currentTarget.style.boxShadow = '0 4px 8px rgba(99, 102, 241, 0.4)';
                                                                                                        }}
                                                                                                        onMouseLeave={(e) => {
                                                                                                            e.currentTarget.style.boxShadow = '0 2px 4px rgba(99, 102, 241, 0.3)';
                                                                                                        }}
                                                                                                        title={`Click to ${isExpanded ? 'hide' : 'view'} ${item.packingMaterials?.length} packing materials for ${item.productCode}`}
                                                                                                    >
                                                                                                        ▶
                                                                                                    </button>
                                                                                                )}
                                                                                                {item.productCode}
                                                                                                {hasMatch && (
                                                                                                    <button
                                                                                                        onClick={(e) => {
                                                                                                            e.stopPropagation();
                                                                                                            openBatchListModal([item.productCode], item.productName);
                                                                                                        }}
                                                                                                        style={{
                                                                                                            background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                                                                                                            color: '#fff',
                                                                                                            padding: '0.2rem 0.5rem',
                                                                                                            borderRadius: '6px',
                                                                                                            fontSize: '0.7em',
                                                                                                            fontWeight: '600',
                                                                                                            border: 'none',
                                                                                                            cursor: 'pointer',
                                                                                                            display: 'inline-flex',
                                                                                                            alignItems: 'center',
                                                                                                            gap: '4px',
                                                                                                            boxShadow: '0 2px 4px rgba(16, 185, 129, 0.3)',
                                                                                                            transition: 'all 0.15s ease',
                                                                                                        }}
                                                                                                        onMouseEnter={(e) => {
                                                                                                            e.currentTarget.style.transform = 'scale(1.05)';
                                                                                                            e.currentTarget.style.boxShadow = '0 4px 8px rgba(16, 185, 129, 0.4)';
                                                                                                        }}
                                                                                                        onMouseLeave={(e) => {
                                                                                                            e.currentTarget.style.transform = 'scale(1)';
                                                                                                            e.currentTarget.style.boxShadow = '0 2px 4px rgba(16, 185, 129, 0.3)';
                                                                                                        }}
                                                                                                        title={`Click to view ${batchCounts[item.productCode]} batch details for ${item.productCode}`}
                                                                                                    >
                                                                                                        📦 {batchCounts[item.productCode]} batches
                                                                                                    </button>
                                                                                                )}
                                                                                            </span>
                                                                                        </td>
                                                                                        {/* Product Name */}
                                                                                        <td style={{
                                                                                            padding: '0.625rem 1rem',
                                                                                            borderBottom: '1px solid var(--border)',
                                                                                            color: 'var(--foreground)',
                                                                                        }}>
                                                                                            {item.productName ?? 'N/A'}
                                                                                        </td>
                                                                                        {/* Packing Size */}
                                                                                        <td style={{
                                                                                            padding: '0.625rem 1rem',
                                                                                            borderBottom: '1px solid var(--border)',
                                                                                            color: 'var(--foreground)',
                                                                                        }}>
                                                                                            {item.packingSize ?? 'N/A'}
                                                                                        </td>
                                                                                        {/* Filling Qty */}
                                                                                        <td style={{
                                                                                            padding: '0.625rem 1rem',
                                                                                            borderBottom: '1px solid var(--border)',
                                                                                            color: 'var(--foreground)',
                                                                                        }}>
                                                                                            {item.actualFillingQuantity ?? 'N/A'}
                                                                                        </td>
                                                                                        {/* No. of Units */}
                                                                                        <td style={{
                                                                                            padding: '0.625rem 1rem',
                                                                                            borderBottom: '1px solid var(--border)',
                                                                                            color: 'var(--foreground)',
                                                                                        }}>
                                                                                            {item.numberOfSyringes ?? 'N/A'}
                                                                                        </td>
                                                                                        {/* Type */}
                                                                                        <td style={{
                                                                                            padding: '0.625rem 1rem',
                                                                                            borderBottom: '1px solid var(--border)',
                                                                                            color: 'var(--foreground)',
                                                                                        }}>
                                                                                            {item.syringeType ?? 'N/A'}
                                                                                        </td>
                                                                                    </tr>
                                                                                    {/* Expanded Packing Materials Row */}
                                                                                    {isExpanded && hasPackingMaterials && (
                                                                                        <tr>
                                                                                            <td colSpan={6} style={{
                                                                                                padding: '0',
                                                                                                background: 'linear-gradient(135deg, #f3e8ff 0%, #ede9fe 100%)',
                                                                                                borderBottom: '2px solid #8b5cf6',
                                                                                            }}>
                                                                                                <div style={{
                                                                                                    padding: '1rem',
                                                                                                }}>
                                                                                                    <div style={{
                                                                                                        display: 'flex',
                                                                                                        alignItems: 'center',
                                                                                                        gap: '0.5rem',
                                                                                                        marginBottom: '0.75rem',
                                                                                                        fontWeight: '600',
                                                                                                        fontSize: '0.85rem',
                                                                                                        color: '#6b21a8',
                                                                                                    }}>
                                                                                                        📦 Packing Materials ({item.packingMaterials?.length} items)
                                                                                                    </div>
                                                                                                    <table style={{
                                                                                                        width: '100%',
                                                                                                        borderCollapse: 'collapse',
                                                                                                        fontSize: '0.75rem',
                                                                                                        background: 'white',
                                                                                                        borderRadius: '8px',
                                                                                                        overflow: 'hidden',
                                                                                                        boxShadow: '0 2px 8px rgba(139, 92, 246, 0.15)',
                                                                                                    }}>
                                                                                                        <thead>
                                                                                                            <tr style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #8b5cf6 100%)' }}>
                                                                                                                <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', color: 'white', fontWeight: '600' }}>Sr.</th>
                                                                                                                <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', color: 'white', fontWeight: '600' }}>Material Code</th>
                                                                                                                <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', color: 'white', fontWeight: '600' }}>Material Name</th>
                                                                                                                <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right', color: 'white', fontWeight: '600' }}>Qty/Unit</th>
                                                                                                                <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right', color: 'white', fontWeight: '600' }}>Req. As Per Std. Batch</th>
                                                                                                            </tr>
                                                                                                        </thead>
                                                                                                        <tbody>
                                                                                                            {item.packingMaterials?.map((mat, matIdx) => (
                                                                                                                <tr
                                                                                                                    key={mat.materialCode || matIdx}
                                                                                                                    style={{
                                                                                                                        background: matIdx % 2 === 0 ? 'white' : '#f5f3ff',
                                                                                                                        borderBottom: '1px solid #e5e7eb',
                                                                                                                    }}
                                                                                                                >
                                                                                                                    <td style={{ padding: '0.5rem 0.75rem' }}>{mat.srNo}</td>
                                                                                                                    <td style={{
                                                                                                                        padding: '0.5rem 0.75rem',
                                                                                                                        fontFamily: 'monospace',
                                                                                                                        color: '#7c3aed',
                                                                                                                        fontWeight: '500'
                                                                                                                    }}>{mat.materialCode}</td>
                                                                                                                    <td style={{ padding: '0.5rem 0.75rem' }}>{mat.materialName}</td>
                                                                                                                    <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>
                                                                                                                        {mat.qtyPerUnit || '-'}
                                                                                                                    </td>
                                                                                                                    <td style={{
                                                                                                                        padding: '0.5rem 0.75rem',
                                                                                                                        textAlign: 'right',
                                                                                                                        fontWeight: '600'
                                                                                                                    }}>
                                                                                                                        {mat.reqAsPerStdBatchSize} {mat.unit || 'NOS'}
                                                                                                                    </td>
                                                                                                                </tr>
                                                                                                            ))}
                                                                                                        </tbody>
                                                                                                    </table>
                                                                                                </div>
                                                                                            </td>
                                                                                        </tr>
                                                                                    )}
                                                                                </React.Fragment>
                                                                            );
                                                                        })}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        </Section>
                                                    )}
                                                    {/* LABELLING & PACKING Section - Grouped by Product Code */}
                                                    {formula.fillingDetails && formula.fillingDetails.some(item => item.packingMaterials && item.packingMaterials.length > 0) && (
                                                        <Section
                                                            title={`LABELLING & PACKING (${formula.fillingDetails.filter(item => item.packingMaterials && item.packingMaterials.length > 0).length} Products)`}
                                                            icon={
                                                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                                                                    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                                                                    <line x1="12" y1="22.08" x2="12" y2="12" />
                                                                </svg>
                                                            }
                                                            gradient="linear-gradient(135deg, #7c3aed 0%, #8b5cf6 100%)"
                                                        >
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                                                {formula.fillingDetails
                                                                    .filter(item => item.packingMaterials && item.packingMaterials.length > 0)
                                                                    .map((item, productIndex) => {
                                                                        // Calculate total materials count for this product
                                                                        const materialsCount = item.packingMaterials?.length || 0;

                                                                        return (
                                                                            <div key={item.productCode || productIndex} style={{
                                                                                background: 'var(--card)',
                                                                                borderRadius: 'var(--radius-lg)',
                                                                                border: '1px solid var(--border)',
                                                                                overflow: 'hidden',
                                                                            }}>
                                                                                {/* Product Header */}
                                                                                <div style={{
                                                                                    background: 'linear-gradient(135deg, #f3e8ff 0%, #e9d5ff 100%)',
                                                                                    padding: '0.75rem 1rem',
                                                                                    borderBottom: '2px solid #8b5cf6',
                                                                                }}>
                                                                                    {/* First Row: Code, Packing, Actual Filling Qty, Actual Filling */}
                                                                                    <div style={{
                                                                                        display: 'flex',
                                                                                        flexWrap: 'wrap',
                                                                                        gap: '2rem',
                                                                                        marginBottom: '0.5rem',
                                                                                        fontSize: '0.85rem',
                                                                                        fontWeight: '600',
                                                                                    }}>
                                                                                        <span>
                                                                                            <span style={{ color: '#6b21a8' }}>Code : </span>
                                                                                            <span style={{ color: '#1f2937', fontFamily: 'monospace' }}>{item.productCode}</span>
                                                                                        </span>
                                                                                        <span>
                                                                                            <span style={{ color: '#6b21a8' }}>Packing : </span>
                                                                                            <span style={{ color: '#1f2937' }}>{item.packingSize || 'N/A'}</span>
                                                                                        </span>
                                                                                        <span>
                                                                                            <span style={{ color: '#6b21a8' }}>Actual Filling Qty : </span>
                                                                                            <span style={{ color: '#1f2937' }}>{item.numberOfSyringes || 'N/A'} {item.syringeType || 'SYRIN'}</span>
                                                                                        </span>
                                                                                        <span>
                                                                                            <span style={{ color: '#6b21a8' }}>Actual Filling </span>
                                                                                            <span style={{ color: '#1f2937' }}>{item.actualFillingQuantity || 'N/A'}</span>
                                                                                        </span>
                                                                                    </div>
                                                                                    {/* Second Row: Product Name */}
                                                                                    <div style={{
                                                                                        fontSize: '0.85rem',
                                                                                        fontWeight: '600',
                                                                                    }}>
                                                                                        <span style={{ color: '#6b21a8' }}>Product Name : </span>
                                                                                        <span style={{ color: '#1f2937' }}>{item.productName || 'N/A'}</span>
                                                                                    </div>
                                                                                </div>

                                                                                {/* Materials Table */}
                                                                                <div style={{ overflowX: 'auto' }}>
                                                                                    <table style={{
                                                                                        width: '100%',
                                                                                        borderCollapse: 'collapse',
                                                                                        fontSize: '0.8rem',
                                                                                    }}>
                                                                                        <thead>
                                                                                            <tr style={{ background: 'var(--muted)' }}>
                                                                                                <th style={{
                                                                                                    padding: '0.6rem 0.75rem',
                                                                                                    textAlign: 'left',
                                                                                                    fontWeight: '600',
                                                                                                    color: 'var(--foreground)',
                                                                                                    borderBottom: '1px solid var(--border)',
                                                                                                    width: '50px',
                                                                                                }}>Sr.</th>
                                                                                                <th style={{
                                                                                                    padding: '0.6rem 0.75rem',
                                                                                                    textAlign: 'left',
                                                                                                    fontWeight: '600',
                                                                                                    color: 'var(--foreground)',
                                                                                                    borderBottom: '1px solid var(--border)',
                                                                                                    width: '120px',
                                                                                                }}>Material Code</th>
                                                                                                <th style={{
                                                                                                    padding: '0.6rem 0.75rem',
                                                                                                    textAlign: 'left',
                                                                                                    fontWeight: '600',
                                                                                                    color: 'var(--foreground)',
                                                                                                    borderBottom: '1px solid var(--border)',
                                                                                                }}>Material Name</th>
                                                                                                <th style={{
                                                                                                    padding: '0.6rem 0.75rem',
                                                                                                    textAlign: 'right',
                                                                                                    fontWeight: '600',
                                                                                                    color: 'var(--foreground)',
                                                                                                    borderBottom: '1px solid var(--border)',
                                                                                                    width: '100px',
                                                                                                }}>Qty/Unit</th>
                                                                                                <th style={{
                                                                                                    padding: '0.6rem 0.75rem',
                                                                                                    textAlign: 'right',
                                                                                                    fontWeight: '600',
                                                                                                    color: 'var(--foreground)',
                                                                                                    borderBottom: '1px solid var(--border)',
                                                                                                    width: '150px',
                                                                                                }}>Req. As Per Std. Batch</th>
                                                                                            </tr>
                                                                                        </thead>
                                                                                        <tbody>
                                                                                            {item.packingMaterials?.map((mat, matIdx) => (
                                                                                                <tr
                                                                                                    key={mat.materialCode || matIdx}
                                                                                                    style={{
                                                                                                        borderBottom: '1px solid var(--border)',
                                                                                                        background: matIdx % 2 === 0 ? 'white' : 'var(--muted)',
                                                                                                    }}
                                                                                                >
                                                                                                    <td style={{ padding: '0.5rem 0.75rem' }}>{mat.srNo}</td>
                                                                                                    <td style={{
                                                                                                        padding: '0.5rem 0.75rem',
                                                                                                        fontFamily: 'monospace',
                                                                                                        color: '#7c3aed',
                                                                                                        fontWeight: '500'
                                                                                                    }}>{mat.materialCode}</td>
                                                                                                    <td style={{ padding: '0.5rem 0.75rem' }}>{mat.materialName}</td>
                                                                                                    <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>
                                                                                                        {mat.qtyPerUnit || ''}
                                                                                                    </td>
                                                                                                    <td style={{
                                                                                                        padding: '0.5rem 0.75rem',
                                                                                                        textAlign: 'right',
                                                                                                        fontWeight: '600'
                                                                                                    }}>
                                                                                                        {mat.reqAsPerStdBatchSize}{mat.unit ? mat.unit : 'NOS'}
                                                                                                    </td>
                                                                                                </tr>
                                                                                            ))}
                                                                                        </tbody>
                                                                                    </table>
                                                                                </div>
                                                                            </div>
                                                                        );
                                                                    })}
                                                            </div>
                                                        </Section>
                                                    )}

                                                    {/* Summary */}
                                                    {formula.summary && (
                                                        <Section
                                                            title="Summary / Totals"
                                                            icon={
                                                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                                    <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                                                                </svg>
                                                            }
                                                            gradient="linear-gradient(135deg, #0284c7 0%, #0ea5e9 100%)"
                                                        >
                                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0 2rem' }}>
                                                                <InfoRow label="Total Units Produced" value={formula.summary.totalUnitsProduced} />
                                                                <InfoRow label="Total Filling Quantity" value={formula.summary.totalFillingQuantity} />
                                                                <InfoRow label="Std Batch Size Compliance" value={formula.summary.standardBatchSizeCompliance} />
                                                            </div>
                                                        </Section>
                                                    )}


                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* Low Batch MFCs Section (1-2 Batches) */}
                        {lowBatchFormulas.length > 0 && (
                            <div style={{ marginTop: '2rem' }}>
                                <CollapsibleSectionHeader
                                    title="Low Batch MFCs (1-2 Batches)"
                                    count={lowBatchFormulas.length}
                                    totalBatches={sectionBatchTotals.lowBatch}
                                    uniqueBatches={uniqueBatchReconciliation?.lowBatchUniqueBatches}
                                    icon="📊"
                                    isOpen={lowBatchMfcsOpen}
                                    onToggle={() => setLowBatchMfcsOpen(!lowBatchMfcsOpen)}
                                    badgeColor="#f59e0b"
                                    badgeText="1-2 Batches"
                                    description="MFCs with 1 or 2 batches in the system"
                                    rmDataMatched={sectionRmData.lowBatch.matched}
                                    rmDataUnmatched={sectionRmData.lowBatch.unmatched}
                                    ppmDataMatched={sectionPpmPmData.lowBatch.ppmMatched}
                                    ppmDataUnmatched={sectionPpmPmData.lowBatch.ppmUnmatched}
                                    pmDataMatched={sectionPpmPmData.lowBatch.pmMatched}
                                    pmDataUnmatched={sectionPpmPmData.lowBatch.pmUnmatched}
                                    onPpmMatchedClick={() => openPpmDataModal('matched')}
                                    onPpmUnmatchedClick={() => openPpmDataModal('unmatched')}
                                    onPmMatchedClick={() => openPmDataModal('matched')}
                                    onPmUnmatchedClick={() => openPmDataModal('unmatched')}
                                    materialQualified={sectionMaterialQualData.lowBatch.qualified}
                                    materialUnqualified={sectionMaterialQualData.lowBatch.unqualified}
                                    onMaterialQualifiedClick={() => openMatDataModal('qualified')}
                                    onMaterialUnqualifiedClick={() => openMatDataModal('unqualified')}
                                    bulkCoaQualified={sectionBulkCoaData.lowBatch.qualified}
                                    bulkCoaUnqualified={sectionBulkCoaData.lowBatch.unqualified}
                                    onBulkCoaQualifiedClick={() => openBulkCoaModal('matched')}
                                    onBulkCoaUnqualifiedClick={() => openBulkCoaModal('unmatched')}
                                />
                                {lowBatchMfcsOpen && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                        {lowBatchFormulas.map((formula, index) => {
                                            const isExpanded = expandedMfc === formula._id;
                                            const colors = getManufacturerColor(formula.masterFormulaDetails?.manufacturer || '');
                                            const materialCount = formula.materials?.length || 0;
                                            const mfcNo = formula.masterFormulaDetails?.masterCardNo?.trim() || 'N/A';

                                            return (
                                                <div
                                                    key={formula._id}
                                                    style={{
                                                        background: colors.glass,
                                                        backdropFilter: 'blur(10px)',
                                                        WebkitBackdropFilter: 'blur(10px)',
                                                        borderRadius: 'var(--radius-lg)',
                                                        borderTop: isExpanded ? `2px solid #f59e0b` : `1px solid ${colors.border}`,
                                                        borderRight: isExpanded ? `2px solid #f59e0b` : `1px solid ${colors.border}`,
                                                        borderBottom: isExpanded ? `2px solid #f59e0b` : `1px solid ${colors.border}`,
                                                        borderLeft: '4px solid #f59e0b',
                                                        overflow: 'hidden',
                                                        transition: 'all 0.2s ease',
                                                        boxShadow: `0 4px 16px ${colors.glow}, 0 1px 3px rgba(0, 0, 0, 0.05)`,
                                                    }}
                                                >
                                                    {/* MFC Header */}
                                                    <div
                                                        role="button"
                                                        tabIndex={0}
                                                        onClick={() => toggleMfc(formula._id)}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter' || e.key === ' ') {
                                                                e.preventDefault();
                                                                toggleMfc(formula._id);
                                                            }
                                                        }}
                                                        style={{
                                                            width: '100%',
                                                            padding: '1rem 1.5rem',
                                                            background: isExpanded ? 'rgba(245, 158, 11, 0.1)' : 'transparent',
                                                            border: 'none',
                                                            cursor: 'pointer',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '1rem',
                                                            textAlign: 'left',
                                                            outline: 'none',
                                                        }}
                                                    >
                                                        <div style={{ width: '40px', fontSize: '0.9rem', fontWeight: '600', color: 'var(--muted-foreground)' }}>
                                                            #{index + 1}
                                                        </div>
                                                        <div style={{
                                                            width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                            borderRadius: '4px', background: 'rgba(245, 158, 11, 0.2)', color: '#d97706',
                                                            transition: 'transform 0.2s ease', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                                                        }}>▶</div>
                                                        <div style={{ fontFamily: 'monospace', fontSize: '1rem', fontWeight: '700', color: '#d97706', minWidth: '160px' }}>
                                                            {mfcNo}
                                                        </div>
                                                        <div style={{ flex: 1, fontSize: '0.9rem', fontWeight: '500', color: 'var(--foreground)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                            {formula.masterFormulaDetails.productName}
                                                            {formula.totalBatchCount !== undefined && formula.totalBatchCount > 0 && (
                                                                <span style={{ padding: '0.2rem 0.6rem', background: 'linear-gradient(135deg, #d97706 0%, #f59e0b 100%)', color: '#fff', borderRadius: '12px', fontSize: '0.7rem', fontWeight: '600' }}>
                                                                    📦 {formula.totalBatchCount} Batches
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div style={{ padding: '0.25rem 0.75rem', borderRadius: 'var(--radius-sm)', background: colors.light, color: colors.primary, fontSize: '0.75rem', fontWeight: '600' }}>
                                                            {formula.masterFormulaDetails.manufacturer || 'N/A'}
                                                        </div>

                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* No Batch MFCs Section (0 Batches) */}
                        {noBatchFormulas.length > 0 && (
                            <div style={{ marginTop: '2rem' }}>
                                <CollapsibleSectionHeader
                                    title="No Batch MFCs"
                                    count={noBatchFormulas.length}
                                    totalBatches={sectionBatchTotals.noBatch}
                                    uniqueBatches={uniqueBatchReconciliation?.noBatchUniqueBatches}
                                    icon="🚫"
                                    isOpen={noBatchMfcsOpen}
                                    onToggle={() => setNoBatchMfcsOpen(!noBatchMfcsOpen)}
                                    badgeColor="#dc2626"
                                    badgeText="0 Batches"
                                    description="MFCs with no production batches in the system"
                                    rmDataMatched={sectionRmData.noBatch.matched}
                                    rmDataUnmatched={sectionRmData.noBatch.unmatched}
                                    ppmDataMatched={sectionPpmPmData.noBatch.ppmMatched}
                                    ppmDataUnmatched={sectionPpmPmData.noBatch.ppmUnmatched}
                                    pmDataMatched={sectionPpmPmData.noBatch.pmMatched}
                                    pmDataUnmatched={sectionPpmPmData.noBatch.pmUnmatched}
                                    onPpmMatchedClick={() => openPpmDataModal('matched')}
                                    onPpmUnmatchedClick={() => openPpmDataModal('unmatched')}
                                    onPmMatchedClick={() => openPmDataModal('matched')}
                                    onPmUnmatchedClick={() => openPmDataModal('unmatched')}
                                    materialQualified={sectionMaterialQualData.noBatch.qualified}
                                    materialUnqualified={sectionMaterialQualData.noBatch.unqualified}
                                    onMaterialQualifiedClick={() => openMatDataModal('qualified')}
                                    onMaterialUnqualifiedClick={() => openMatDataModal('unqualified')}
                                    bulkCoaQualified={sectionBulkCoaData.noBatch.qualified}
                                    bulkCoaUnqualified={sectionBulkCoaData.noBatch.unqualified}
                                    onBulkCoaQualifiedClick={() => openBulkCoaModal('matched')}
                                    onBulkCoaUnqualifiedClick={() => openBulkCoaModal('unmatched')}
                                />
                                {noBatchMfcsOpen && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                        {noBatchFormulas.map((formula, index) => {
                                            const isExpanded = expandedMfc === formula._id;
                                            const colors = getManufacturerColor(formula.masterFormulaDetails?.manufacturer || '');
                                            const materialCount = formula.materials?.length || 0;
                                            const mfcNo = formula.masterFormulaDetails?.masterCardNo?.trim() || 'N/A';

                                            return (
                                                <div
                                                    key={formula._id}
                                                    style={{
                                                        background: colors.glass,
                                                        backdropFilter: 'blur(10px)',
                                                        WebkitBackdropFilter: 'blur(10px)',
                                                        borderRadius: 'var(--radius-lg)',
                                                        borderTop: isExpanded ? `2px solid #dc2626` : `1px solid ${colors.border}`,
                                                        borderRight: isExpanded ? `2px solid #dc2626` : `1px solid ${colors.border}`,
                                                        borderBottom: isExpanded ? `2px solid #dc2626` : `1px solid ${colors.border}`,
                                                        borderLeft: '4px solid #dc2626',
                                                        overflow: 'hidden',
                                                        transition: 'all 0.2s ease',
                                                        boxShadow: `0 4px 16px ${colors.glow}, 0 1px 3px rgba(0, 0, 0, 0.05)`,
                                                        opacity: 0.85,
                                                    }}
                                                >
                                                    {/* MFC Header */}
                                                    <div
                                                        role="button"
                                                        tabIndex={0}
                                                        onClick={() => toggleMfc(formula._id)}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter' || e.key === ' ') {
                                                                e.preventDefault();
                                                                toggleMfc(formula._id);
                                                            }
                                                        }}
                                                        style={{
                                                            width: '100%',
                                                            padding: '1rem 1.5rem',
                                                            background: isExpanded ? 'rgba(220, 38, 38, 0.1)' : 'transparent',
                                                            border: 'none',
                                                            cursor: 'pointer',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '1rem',
                                                            textAlign: 'left',
                                                            outline: 'none',
                                                        }}
                                                    >
                                                        <div style={{ width: '40px', fontSize: '0.9rem', fontWeight: '600', color: 'var(--muted-foreground)' }}>
                                                            #{index + 1}
                                                        </div>
                                                        <div style={{
                                                            width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                            borderRadius: '4px', background: 'rgba(220, 38, 38, 0.2)', color: '#dc2626',
                                                            transition: 'transform 0.2s ease', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                                                        }}>▶</div>
                                                        <div style={{ fontFamily: 'monospace', fontSize: '1rem', fontWeight: '700', color: '#dc2626', minWidth: '160px' }}>
                                                            {mfcNo}
                                                        </div>
                                                        <div style={{ flex: 1, fontSize: '0.9rem', fontWeight: '500', color: 'var(--foreground)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                            {formula.masterFormulaDetails.productName}
                                                            <span style={{ padding: '0.2rem 0.6rem', background: '#fee2e2', color: '#dc2626', borderRadius: '12px', fontSize: '0.7rem', fontWeight: '600', border: '1px solid #fecaca' }}>
                                                                ⚠️ No Batches
                                                            </span>
                                                        </div>
                                                        <div style={{ padding: '0.25rem 0.75rem', borderRadius: 'var(--radius-sm)', background: colors.light, color: colors.primary, fontSize: '0.75rem', fontWeight: '600' }}>
                                                            {formula.masterFormulaDetails.manufacturer || 'N/A'}
                                                        </div>
                                                        <div style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>
                                                            REV {formula.masterFormulaDetails.revisionNo || '0'}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Placebo & Media Fill Products Section */}
                        {placeboFormulas.length > 0 && (
                            <div style={{ marginTop: '2rem' }}>
                                <CollapsibleSectionHeader
                                    title="Placebo & Media Fill Products"
                                    count={placeboFormulas.length}
                                    totalBatches={sectionBatchTotals.placebo}
                                    uniqueBatches={uniqueBatchReconciliation?.placeboUniqueBatches}
                                    icon="💊"
                                    isOpen={placeboMfcsOpen}
                                    onToggle={() => setPlaceboMfcsOpen(!placeboMfcsOpen)}
                                    badgeColor="#6b7280"
                                    badgeText="Placebo/MediaFill"
                                    description="Placebo formulations and Media Fill products for validation"
                                    rmDataMatched={sectionRmData.placebo.matched}
                                    rmDataUnmatched={sectionRmData.placebo.unmatched}
                                    ppmDataMatched={sectionPpmPmData.placebo.ppmMatched}
                                    ppmDataUnmatched={sectionPpmPmData.placebo.ppmUnmatched}
                                    pmDataMatched={sectionPpmPmData.placebo.pmMatched}
                                    pmDataUnmatched={sectionPpmPmData.placebo.pmUnmatched}
                                    onPpmMatchedClick={() => openPpmDataModal('matched')}
                                    onPpmUnmatchedClick={() => openPpmDataModal('unmatched')}
                                    onPmMatchedClick={() => openPmDataModal('matched')}
                                    onPmUnmatchedClick={() => openPmDataModal('unmatched')}
                                    materialQualified={sectionMaterialQualData.placebo.qualified}
                                    materialUnqualified={sectionMaterialQualData.placebo.unqualified}
                                    onMaterialQualifiedClick={() => openMatDataModal('qualified')}
                                    onMaterialUnqualifiedClick={() => openMatDataModal('unqualified')}
                                    bulkCoaQualified={sectionBulkCoaData.placebo.qualified}
                                    bulkCoaUnqualified={sectionBulkCoaData.placebo.unqualified}
                                    onBulkCoaQualifiedClick={() => openBulkCoaModal('matched')}
                                    onBulkCoaUnqualifiedClick={() => openBulkCoaModal('unmatched')}
                                />
                                {placeboMfcsOpen && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                        {placeboFormulas.map((formula, index) => {
                                            const isExpanded = expandedMfc === formula._id;
                                            const colors = getManufacturerColor(formula.masterFormulaDetails?.manufacturer || '');
                                            const materialCount = formula.materials?.length || 0;
                                            const mfcNo = formula.masterFormulaDetails?.masterCardNo?.trim() || 'N/A';

                                            return (
                                                <div
                                                    key={formula._id}
                                                    style={{
                                                        background: colors.glass,
                                                        backdropFilter: 'blur(10px)',
                                                        WebkitBackdropFilter: 'blur(10px)',
                                                        borderRadius: 'var(--radius-lg)',
                                                        borderTop: isExpanded ? `2px solid #9ca3af` : `1px solid ${colors.border}`,
                                                        borderRight: isExpanded ? `2px solid #9ca3af` : `1px solid ${colors.border}`,
                                                        borderBottom: isExpanded ? `2px solid #9ca3af` : `1px solid ${colors.border}`,
                                                        borderLeft: '4px solid #9ca3af',
                                                        overflow: 'hidden',
                                                        transition: 'all 0.2s ease',
                                                        boxShadow: `0 4px 16px ${colors.glow}, 0 1px 3px rgba(0, 0, 0, 0.05)`,
                                                    }}
                                                >
                                                    {/* MFC Header */}
                                                    <div
                                                        role="button"
                                                        tabIndex={0}
                                                        onClick={() => toggleMfc(formula._id)}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter' || e.key === ' ') {
                                                                e.preventDefault();
                                                                toggleMfc(formula._id);
                                                            }
                                                        }}
                                                        style={{
                                                            width: '100%',
                                                            padding: '1rem 1.5rem',
                                                            background: isExpanded ? 'rgba(156, 163, 175, 0.1)' : 'transparent',
                                                            border: 'none',
                                                            cursor: 'pointer',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '1rem',
                                                            textAlign: 'left',
                                                            outline: 'none',
                                                        }}
                                                    >
                                                        <div style={{ width: '40px', fontSize: '0.9rem', fontWeight: '600', color: 'var(--muted-foreground)' }}>
                                                            #{index + 1}
                                                        </div>
                                                        <div style={{
                                                            width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                            borderRadius: '4px', background: 'rgba(156, 163, 175, 0.2)', color: '#6b7280',
                                                            transition: 'transform 0.2s ease', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                                                        }}>▶</div>
                                                        <div style={{ fontFamily: 'monospace', fontSize: '1rem', fontWeight: '700', color: '#6b7280', minWidth: '160px' }}>
                                                            {mfcNo}
                                                        </div>
                                                        <div style={{ flex: 1, fontSize: '0.9rem', fontWeight: '500', color: 'var(--foreground)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                            {formula.masterFormulaDetails.productName}
                                                            {formula.totalBatchCount !== undefined && formula.totalBatchCount > 0 && (
                                                                <span style={{ padding: '0.2rem 0.6rem', background: 'linear-gradient(135deg, #6b7280 0%, #9ca3af 100%)', color: '#fff', borderRadius: '12px', fontSize: '0.7rem', fontWeight: '600' }}>
                                                                    📦 {formula.totalBatchCount} Batches
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div style={{ padding: '0.25rem 0.75rem', borderRadius: 'var(--radius-sm)', background: colors.light, color: colors.primary, fontSize: '0.75rem', fontWeight: '600' }}>
                                                            {formula.masterFormulaDetails.manufacturer || 'N/A'}
                                                        </div>
                                                        <div style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>
                                                            REV {formula.masterFormulaDetails.revisionNo || '0'}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}

                        {filteredFormulas.length === 0 && (
                            <div style={{
                                textAlign: 'center',
                                padding: '4rem',
                                color: 'var(--muted-foreground)',
                            }}>
                                No formulas found matching your criteria
                            </div>
                        )}
                    </>
                )}
            </main>

            {/* MFC Summary Table Modal */}
            {showMfcSummaryTable && (() => {
                // Build the data rows first so we can sort them
                // Also track row counts per MFC for merged cells
                interface TableRow {
                    sr: number;
                    mfc: string;
                    product: string;
                    productName: string; // Product name from filling details or master formula
                    packingSize: string; // Packing size from filling details
                    batches: number;
                    formulaId: string;
                    isFirstRow: boolean;
                    rowCount: number; // Number of rows for this MFC (for rowSpan)
                    mfcIndex: number; // Index of MFC group (1-based for display)
                }
                const tableData: TableRow[] = [];
                let srCounter = 0;
                let mfcIndex = 0;

                formulas.forEach((formula) => {
                    const mfcNo = formula.masterFormulaDetails?.masterCardNo?.trim() || 'N/A';

                    // Build product info map from filling details
                    const productInfoMap = new Map<string, { productName: string; packingSize: string }>();

                    // Get product info from filling details
                    formula.fillingDetails?.forEach(fd => {
                        if (fd.productCode && fd.productCode !== 'N/A') {
                            productInfoMap.set(fd.productCode, {
                                productName: fd.productName || 'N/A',
                                packingSize: fd.packingSize || 'N/A',
                            });
                        }
                    });

                    const productCodes = formula.fillingDetails?.map(fd => fd.productCode) || [];
                    if (productCodes.length === 0) {
                        const mainCode = formula.masterFormulaDetails?.productCode || 'N/A';
                        productCodes.push(mainCode);
                        // Use master formula details for main product code
                        productInfoMap.set(mainCode, {
                            productName: formula.masterFormulaDetails?.productName || 'N/A',
                            packingSize: 'N/A',
                        });
                    }
                    const uniqueProductCodes = [...new Set(productCodes)];
                    const rowCount = uniqueProductCodes.length;
                    mfcIndex++;

                    uniqueProductCodes.forEach((productCode, pcIndex) => {
                        srCounter++;
                        const productInfo = productInfoMap.get(productCode) || {
                            productName: formula.masterFormulaDetails?.productName || 'N/A',
                            packingSize: 'N/A',
                        };
                        tableData.push({
                            sr: srCounter,
                            mfc: mfcNo,
                            product: productCode,
                            productName: productInfo.productName,
                            packingSize: productInfo.packingSize,
                            batches: batchCounts[productCode] || 0,
                            formulaId: formula._id,
                            isFirstRow: pcIndex === 0,
                            rowCount: rowCount,
                            mfcIndex: mfcIndex,
                        });
                    });
                });

                // Filter out zero batches if enabled
                const filteredData = hideZeroBatches
                    ? tableData.filter(row => row.batches > 0)
                    : tableData;

                // Sort the data based on current sort settings
                const sortedData = [...filteredData].sort((a, b) => {
                    let comparison = 0;
                    switch (mfcTableSortColumn) {
                        case 'sr':
                            comparison = a.sr - b.sr;
                            break;
                        case 'mfc':
                            comparison = a.mfc.localeCompare(b.mfc);
                            break;
                        case 'product':
                            comparison = a.product.localeCompare(b.product);
                            break;
                        case 'batches':
                            comparison = a.batches - b.batches;
                            break;
                    }
                    return mfcTableSortDirection === 'asc' ? comparison : -comparison;
                });

                // Calculate merge groups for sorted data based on the sorted column
                // This creates merged cells for consecutive duplicate values in the primary sorted column
                interface MergeGroup {
                    startIndex: number;
                    count: number;
                    value: string | number;
                }

                const getMergeGroups = (): MergeGroup[] => {
                    const groups: MergeGroup[] = [];
                    if (sortedData.length === 0) return groups;

                    let currentGroup: MergeGroup = { startIndex: 0, count: 1, value: '' };

                    // Determine which column value to group by based on sort
                    const getGroupValue = (row: typeof sortedData[0]): string | number => {
                        switch (mfcTableSortColumn) {
                            case 'sr': return row.mfcIndex; // Group by MFC index for Sr sort
                            case 'mfc': return row.mfc;
                            case 'product': return row.product;
                            case 'batches': return row.batches;
                            default: return row.mfcIndex;
                        }
                    };

                    currentGroup.value = getGroupValue(sortedData[0]);

                    for (let i = 1; i < sortedData.length; i++) {
                        const currentValue = getGroupValue(sortedData[i]);
                        if (currentValue === currentGroup.value) {
                            currentGroup.count++;
                        } else {
                            groups.push({ ...currentGroup });
                            currentGroup = { startIndex: i, count: 1, value: currentValue };
                        }
                    }
                    groups.push(currentGroup); // Push the last group
                    return groups;
                };

                const mergeGroups = getMergeGroups();

                // Create a lookup for each row: is it first in group, group size, and group index
                const rowMergeInfo = sortedData.map((_, index) => {
                    const groupIndex = mergeGroups.findIndex(g => index >= g.startIndex && index < g.startIndex + g.count);
                    const group = groupIndex >= 0 ? mergeGroups[groupIndex] : null;
                    return {
                        isFirstInGroup: group ? index === group.startIndex : true,
                        groupSize: group ? group.count : 1,
                        groupIndex: groupIndex // For alternating colors
                    };
                });

                // Excel download function with merged cells for any sort order
                const downloadExcel = () => {
                    // Build data array for Excel
                    const excelData: (string | number)[][] = [
                        ['Sr Number', 'MFC Number', 'Product Code', 'Product Name', 'Packing Size', 'Number of Batches']
                    ];

                    // Track merge ranges for merged cells
                    const merges: XLSX.Range[] = [];

                    sortedData.forEach((row, index) => {
                        const mergeInfo = rowMergeInfo[index];
                        const excelRow = index + 1; // Excel row (1-indexed after header)

                        if (mergeInfo.isFirstInGroup) {
                            // First row of group - add full data
                            excelData.push([row.mfcIndex, row.mfc, row.product, row.productName, row.packingSize, row.batches]);

                            // Add merge ranges if group has multiple rows
                            if (mergeInfo.groupSize > 1) {
                                // Determine which columns to merge based on sort
                                if (mfcTableSortColumn === 'sr' || mfcTableSortColumn === 'mfc') {
                                    // Merge Sr Number and MFC Number columns
                                    merges.push({ s: { r: excelRow, c: 0 }, e: { r: excelRow + mergeInfo.groupSize - 1, c: 0 } });
                                    merges.push({ s: { r: excelRow, c: 1 }, e: { r: excelRow + mergeInfo.groupSize - 1, c: 1 } });
                                } else if (mfcTableSortColumn === 'product') {
                                    // Merge Product Code, Product Name, and Packing Size columns
                                    merges.push({ s: { r: excelRow, c: 2 }, e: { r: excelRow + mergeInfo.groupSize - 1, c: 2 } });
                                    merges.push({ s: { r: excelRow, c: 3 }, e: { r: excelRow + mergeInfo.groupSize - 1, c: 3 } });
                                    merges.push({ s: { r: excelRow, c: 4 }, e: { r: excelRow + mergeInfo.groupSize - 1, c: 4 } });
                                } else if (mfcTableSortColumn === 'batches') {
                                    // Merge Batches column
                                    merges.push({ s: { r: excelRow, c: 5 }, e: { r: excelRow + mergeInfo.groupSize - 1, c: 5 } });
                                }
                            }
                        } else {
                            // Subsequent rows in group - hide grouped column values
                            if (mfcTableSortColumn === 'sr' || mfcTableSortColumn === 'mfc') {
                                excelData.push(['', '', row.product, row.productName, row.packingSize, row.batches]);
                            } else if (mfcTableSortColumn === 'product') {
                                excelData.push([row.mfcIndex, row.mfc, '', '', '', row.batches]);
                            } else if (mfcTableSortColumn === 'batches') {
                                excelData.push([row.mfcIndex, row.mfc, row.product, row.productName, row.packingSize, '']);
                            } else {
                                excelData.push([row.mfcIndex, row.mfc, row.product, row.productName, row.packingSize, row.batches]);
                            }
                        }
                    });

                    // Create worksheet
                    const ws = XLSX.utils.aoa_to_sheet(excelData);

                    // Apply merges if any
                    if (merges.length > 0) {
                        ws['!merges'] = merges;
                    }

                    // Set column widths
                    ws['!cols'] = [
                        { wch: 12 }, // Sr Number
                        { wch: 20 }, // MFC Number
                        { wch: 18 }, // Product Code
                        { wch: 35 }, // Product Name
                        { wch: 15 }, // Packing Size
                        { wch: 18 }, // Number of Batches
                    ];

                    // Create workbook and add worksheet
                    const wb = XLSX.utils.book_new();
                    XLSX.utils.book_append_sheet(wb, ws, 'MFC Summary');

                    // Download file
                    XLSX.writeFile(wb, `MFC_Summary_${new Date().toISOString().split('T')[0]}.xlsx`);
                };

                // Toggle sort function
                const toggleSort = (column: 'sr' | 'mfc' | 'product' | 'batches') => {
                    if (mfcTableSortColumn === column) {
                        setMfcTableSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
                    } else {
                        setMfcTableSortColumn(column);
                        setMfcTableSortDirection('asc');
                    }
                };

                // Sort indicator component
                const SortIndicator = ({ column }: { column: 'sr' | 'mfc' | 'product' | 'batches' }) => {
                    if (mfcTableSortColumn !== column) return <span style={{ opacity: 0.3, marginLeft: '4px' }}>↕</span>;
                    return <span style={{ marginLeft: '4px' }}>{mfcTableSortDirection === 'asc' ? '↑' : '↓'}</span>;
                };

                return (
                    <div
                        style={{
                            position: 'fixed',
                            inset: 0,
                            zIndex: 1000,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '0.5rem',
                        }}
                        onClick={() => setShowMfcSummaryTable(false)}
                    >
                        {/* Backdrop */}
                        <div style={{
                            position: 'absolute',
                            inset: 0,
                            background: 'rgba(0, 0, 0, 0.5)',
                        }} />

                        {/* Modal Content */}
                        <div
                            style={{
                                position: 'relative',
                                background: 'white',
                                borderRadius: '8px',
                                width: '100%',
                                maxWidth: '1300px',
                                maxHeight: '95vh',
                                display: 'flex',
                                flexDirection: 'column',
                                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                                overflow: 'hidden',
                            }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* Header */}
                            <div style={{
                                padding: '0.5rem 0.75rem',
                                background: 'linear-gradient(135deg, #0891b2 0%, #06b6d4 100%)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ fontSize: '1rem' }}>📋</span>
                                    <h2 style={{
                                        margin: 0,
                                        fontSize: '0.95rem',
                                        fontWeight: '700',
                                        color: 'white',
                                    }}>
                                        MFC Summary
                                    </h2>
                                    <span style={{
                                        padding: '2px 8px',
                                        background: 'rgba(255,255,255,0.2)',
                                        borderRadius: '12px',
                                        fontSize: '0.75rem',
                                        color: 'white',
                                        fontWeight: '600',
                                    }}>
                                        {formulas.length} MFCs
                                    </span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    {/* Hide Zero Batches Toggle */}
                                    <button
                                        onClick={() => setHideZeroBatches(!hideZeroBatches)}
                                        style={{
                                            padding: '4px 10px',
                                            borderRadius: '4px',
                                            border: 'none',
                                            background: hideZeroBatches ? 'rgba(16,185,129,0.3)' : 'rgba(255,255,255,0.2)',
                                            color: 'white',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '4px',
                                            fontSize: '0.75rem',
                                            fontWeight: '600',
                                            transition: 'all 0.2s ease',
                                        }}
                                    >
                                        {hideZeroBatches ? '✓ Hide 0' : '○ Hide 0'}
                                    </button>
                                    {/* Download Excel Button */}
                                    <button
                                        onClick={downloadExcel}
                                        style={{
                                            padding: '4px 10px',
                                            borderRadius: '4px',
                                            border: 'none',
                                            background: 'rgba(255,255,255,0.2)',
                                            color: 'white',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '4px',
                                            fontSize: '0.75rem',
                                            fontWeight: '600',
                                            transition: 'all 0.2s ease',
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.background = 'rgba(255,255,255,0.3)';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.background = 'rgba(255,255,255,0.2)';
                                        }}
                                    >
                                        📥 Excel
                                    </button>
                                    <button
                                        onClick={() => setShowMfcSummaryTable(false)}
                                        style={{
                                            width: '28px',
                                            height: '28px',
                                            borderRadius: '4px',
                                            border: 'none',
                                            background: 'rgba(255,255,255,0.2)',
                                            color: 'white',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontSize: '1rem',
                                            transition: 'all 0.2s ease',
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.background = 'rgba(255,255,255,0.3)';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.background = 'rgba(255,255,255,0.2)';
                                        }}
                                    >
                                        ✕
                                    </button>
                                </div>
                            </div>

                            {/* Table Container */}
                            <div style={{
                                flex: 1,
                                overflow: 'auto',
                                padding: '0',
                            }}>
                                <table style={{
                                    width: '100%',
                                    borderCollapse: 'collapse',
                                    fontSize: '0.75rem',
                                }}>
                                    <thead>
                                        <tr style={{
                                            background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
                                            position: 'sticky',
                                            top: 0,
                                            zIndex: 1,
                                        }}>
                                            <th
                                                onClick={() => toggleSort('sr')}
                                                style={{
                                                    padding: '0.5rem 0.6rem',
                                                    textAlign: 'center',
                                                    fontWeight: '600',
                                                    color: mfcTableSortColumn === 'sr' ? '#0891b2' : '#334155',
                                                    borderBottom: '2px solid #e2e8f0',
                                                    whiteSpace: 'nowrap',
                                                    cursor: 'pointer',
                                                    userSelect: 'none',
                                                }}
                                            >
                                                Sr Number <SortIndicator column="sr" />
                                            </th>
                                            <th
                                                onClick={() => toggleSort('mfc')}
                                                style={{
                                                    padding: '0.5rem 0.6rem',
                                                    textAlign: 'left',
                                                    fontWeight: '600',
                                                    color: mfcTableSortColumn === 'mfc' ? '#0891b2' : '#334155',
                                                    borderBottom: '2px solid #e2e8f0',
                                                    whiteSpace: 'nowrap',
                                                    cursor: 'pointer',
                                                    userSelect: 'none',
                                                }}
                                            >
                                                MFC Number <SortIndicator column="mfc" />
                                            </th>
                                            <th
                                                onClick={() => toggleSort('product')}
                                                style={{
                                                    padding: '0.5rem 0.6rem',
                                                    textAlign: 'left',
                                                    fontWeight: '600',
                                                    color: mfcTableSortColumn === 'product' ? '#0891b2' : '#334155',
                                                    borderBottom: '2px solid #e2e8f0',
                                                    cursor: 'pointer',
                                                    userSelect: 'none',
                                                }}
                                            >
                                                Product Code <SortIndicator column="product" />
                                            </th>
                                            <th
                                                style={{
                                                    padding: '0.5rem 0.6rem',
                                                    textAlign: 'left',
                                                    fontWeight: '600',
                                                    color: '#334155',
                                                    borderBottom: '2px solid #e2e8f0',
                                                    whiteSpace: 'nowrap',
                                                }}
                                            >
                                                Product Name
                                            </th>
                                            <th
                                                style={{
                                                    padding: '0.5rem 0.6rem',
                                                    textAlign: 'left',
                                                    fontWeight: '600',
                                                    color: '#334155',
                                                    borderBottom: '2px solid #e2e8f0',
                                                    whiteSpace: 'nowrap',
                                                }}
                                            >
                                                Packing Size
                                            </th>
                                            <th
                                                onClick={() => toggleSort('batches')}
                                                style={{
                                                    padding: '0.5rem 0.6rem',
                                                    textAlign: 'right',
                                                    fontWeight: '600',
                                                    color: mfcTableSortColumn === 'batches' ? '#0891b2' : '#334155',
                                                    borderBottom: '2px solid #e2e8f0',
                                                    whiteSpace: 'nowrap',
                                                    cursor: 'pointer',
                                                    userSelect: 'none',
                                                }}
                                            >
                                                Batches <SortIndicator column="batches" />
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {sortedData.map((row, index) => {
                                            const isEvenRow = index % 2 === 0;
                                            const mergeInfo = rowMergeInfo[index];

                                            // Determine which columns to merge based on sort
                                            const mergeSrMfc = mfcTableSortColumn === 'sr' || mfcTableSortColumn === 'mfc';
                                            const mergeProduct = mfcTableSortColumn === 'product';
                                            const mergeBatches = mfcTableSortColumn === 'batches';

                                            // Alternating colors based on group index
                                            const isEvenGroup = mergeInfo.groupIndex % 2 === 0;
                                            const groupBgColor = isEvenGroup ? '#f0fdfa' : '#fff7ed'; // cyan tint vs orange tint

                                            return (
                                                <tr
                                                    key={`${row.formulaId}-${row.product}-${index}`}
                                                    style={{
                                                        background: groupBgColor,
                                                    }}
                                                >
                                                    {/* Sr Number - merge when sorted by sr or mfc */}
                                                    {(!mergeSrMfc || mergeInfo.isFirstInGroup) && (
                                                        <td
                                                            rowSpan={mergeSrMfc && mergeInfo.groupSize > 1 ? mergeInfo.groupSize : 1}
                                                            style={{
                                                                padding: '0.35rem 0.5rem',
                                                                borderBottom: '1px solid #e2e8f0',
                                                                borderRight: '1px solid #e2e8f0',
                                                                color: '#64748b',
                                                                fontWeight: '600',
                                                                verticalAlign: 'middle',
                                                                textAlign: 'center',
                                                                background: groupBgColor,
                                                            }}
                                                        >
                                                            {row.mfcIndex}
                                                        </td>
                                                    )}
                                                    {/* MFC Number - merge when sorted by sr or mfc */}
                                                    {(!mergeSrMfc || mergeInfo.isFirstInGroup) && (
                                                        <td
                                                            rowSpan={mergeSrMfc && mergeInfo.groupSize > 1 ? mergeInfo.groupSize : 1}
                                                            style={{
                                                                padding: '0.35rem 0.5rem',
                                                                borderBottom: '1px solid #e2e8f0',
                                                                borderRight: '1px solid #e2e8f0',
                                                                color: '#1e293b',
                                                                fontWeight: '600',
                                                                verticalAlign: 'middle',
                                                                background: groupBgColor,
                                                            }}
                                                        >
                                                            {row.mfc}
                                                        </td>
                                                    )}
                                                    {/* Product Code - merge when sorted by product */}
                                                    {(!mergeProduct || mergeInfo.isFirstInGroup) && (
                                                        <td
                                                            rowSpan={mergeProduct && mergeInfo.groupSize > 1 ? mergeInfo.groupSize : 1}
                                                            style={{
                                                                padding: '0.35rem 0.5rem',
                                                                borderBottom: '1px solid #e2e8f0',
                                                                fontFamily: 'monospace',
                                                                color: '#0891b2',
                                                                fontWeight: '500',
                                                                verticalAlign: 'middle',
                                                                background: groupBgColor,
                                                            }}
                                                        >
                                                            {row.product}
                                                        </td>
                                                    )}
                                                    {/* Product Name - always shown */}
                                                    <td
                                                        style={{
                                                            padding: '0.35rem 0.5rem',
                                                            borderBottom: '1px solid #e2e8f0',
                                                            color: '#374151',
                                                            fontWeight: '400',
                                                            verticalAlign: 'middle',
                                                            background: groupBgColor,
                                                            maxWidth: '200px',
                                                            overflow: 'hidden',
                                                            textOverflow: 'ellipsis',
                                                            whiteSpace: 'nowrap',
                                                        }}
                                                        title={row.productName}
                                                    >
                                                        {row.productName}
                                                    </td>
                                                    {/* Packing Size - always shown */}
                                                    <td
                                                        style={{
                                                            padding: '0.35rem 0.5rem',
                                                            borderBottom: '1px solid #e2e8f0',
                                                            color: '#64748b',
                                                            fontWeight: '400',
                                                            verticalAlign: 'middle',
                                                            background: groupBgColor,
                                                        }}
                                                    >
                                                        {row.packingSize}
                                                    </td>
                                                    {/* Batches - merge when sorted by batches */}
                                                    {(!mergeBatches || mergeInfo.isFirstInGroup) && (
                                                        <td
                                                            rowSpan={mergeBatches && mergeInfo.groupSize > 1 ? mergeInfo.groupSize : 1}
                                                            style={{
                                                                padding: '0.35rem 0.5rem',
                                                                borderBottom: '1px solid #e2e8f0',
                                                                textAlign: 'right',
                                                                fontWeight: '600',
                                                                color: row.batches > 0 ? '#059669' : '#94a3b8',
                                                                verticalAlign: 'middle',
                                                                background: groupBgColor,
                                                            }}
                                                        >
                                                            {row.batches}
                                                        </td>
                                                    )}
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {/* Footer */}
                            <div style={{
                                padding: '0.4rem 0.75rem',
                                background: '#f8fafc',
                                borderTop: '1px solid #e2e8f0',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                gap: '8px',
                            }}>
                                <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                                    Total MFCs: <strong>{formulas.length}</strong> |
                                    Total Rows: <strong>{sortedData.length}</strong> |
                                    Sorted by: <strong style={{ color: '#0891b2' }}>
                                        {mfcTableSortColumn === 'sr' ? 'Sr Number' :
                                            mfcTableSortColumn === 'mfc' ? 'MFC Number' :
                                                mfcTableSortColumn === 'product' ? 'Product Code' : 'Number of Batches'}
                                        {' '}({mfcTableSortDirection === 'asc' ? 'A→Z' : 'Z→A'})
                                    </strong>
                                </div>
                                <button
                                    onClick={() => setShowMfcSummaryTable(false)}
                                    style={{
                                        padding: '0.25rem 0.75rem',
                                        borderRadius: '4px',
                                        border: '1px solid #e2e8f0',
                                        background: 'white',
                                        color: '#374151',
                                        cursor: 'pointer',
                                        fontWeight: '500',
                                        fontSize: '0.75rem',
                                    }}
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* BATCH SECTION - Collapsible at bottom */}
            {showBatchSection && (
                <div ref={batchSectionRef} style={{
                    marginTop: '2rem',
                    background: 'var(--card)',
                    borderRadius: '16px',
                    border: '2px solid var(--border)',
                    overflow: 'hidden',
                    marginLeft: '1rem',
                    marginRight: "1rem"
                }}>
                    {/* Batch Section Header */}
                    <div style={{
                        padding: '1.5rem',
                        background: batchViewMode === 'unique'
                            ? 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)'
                            : 'linear-gradient(135deg, #ecfeff 0%, #cffafe 100%)',
                        borderBottom: '2px solid var(--border)',
                    }}>
                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: '1rem',
                        }}>
                            <div>
                                <h2 style={{
                                    fontSize: '1.5rem',
                                    fontWeight: 700,
                                    color: batchViewMode === 'unique' ? '#7c3aed' : '#0891b2',
                                    marginBottom: '0.5rem',
                                }}>
                                    📦 Batch Registry
                                </h2>
                                <p style={{
                                    fontSize: '0.9rem',
                                    color: 'var(--muted-foreground)',
                                }}>
                                    {batchViewMode === 'unique'
                                        ? `Viewing ${(() => {
                                            const groups = new Map<string, BatchItem[]>();
                                            allBatches.forEach(b => {
                                                const bn = b.batchNumber || 'Unknown';
                                                if (!groups.has(bn)) groups.set(bn, []);
                                                groups.get(bn)?.push(b);
                                            });
                                            return groups.size;
                                        })()} unique batch groups`
                                        : `Viewing all ${allBatches.length} batch records`
                                    }
                                </p>
                            </div>
                            <button
                                onClick={() => setShowBatchSection(false)}
                                style={{
                                    padding: '0.75rem 1.5rem',
                                    background: 'var(--muted)',
                                    border: 'none',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    fontWeight: 600,
                                    color: 'var(--foreground)',
                                }}
                            >
                                ✕ Close
                            </button>
                        </div>

                        {/* View Mode Tabs */}
                        <div style={{
                            display: 'flex',
                            gap: '1rem',
                            marginTop: '1rem',
                        }}>
                            <button
                                onClick={() => setBatchViewMode('unique')}
                                style={{
                                    padding: '0.75rem 1.5rem',
                                    background: batchViewMode === 'unique'
                                        ? 'linear-gradient(135deg, #7c3aed 0%, #8b5cf6 100%)'
                                        : 'var(--muted)',
                                    color: batchViewMode === 'unique' ? 'white' : 'var(--foreground)',
                                    border: 'none',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    fontWeight: 600,
                                    boxShadow: batchViewMode === 'unique' ? '0 4px 12px rgba(139, 92, 246, 0.3)' : 'none',
                                }}
                            >
                                📁 Unique Batches
                            </button>
                            <button
                                onClick={() => setBatchViewMode('all')}
                                style={{
                                    padding: '0.75rem 1.5rem',
                                    background: batchViewMode === 'all'
                                        ? 'linear-gradient(135deg, #0891b2 0%, #06b6d4 100%)'
                                        : 'var(--muted)',
                                    color: batchViewMode === 'all' ? 'white' : 'var(--foreground)',
                                    border: 'none',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    fontWeight: 600,
                                    boxShadow: batchViewMode === 'all' ? '0 4px 12px rgba(6, 182, 212, 0.3)' : 'none',
                                }}
                            >
                                📋 All Batches
                            </button>
                        </div>

                        {/* Search Bar */}
                        <div style={{ marginTop: '1rem', position: 'relative' }}>
                            <input
                                type="text"
                                placeholder="Search by batch number, item code, or item name..."
                                value={batchSearchTerm}
                                onChange={(e) => setBatchSearchTerm(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '0.75rem 1rem 0.75rem 2.5rem',
                                    fontSize: '0.9rem',
                                    border: '2px solid var(--border)',
                                    borderRadius: '8px',
                                    background: 'var(--background)',
                                    color: 'var(--foreground)',
                                }}
                            />
                            <span style={{
                                position: 'absolute',
                                left: '0.75rem',
                                top: '50%',
                                transform: 'translateY(-50%)',
                                fontSize: '1.1rem',
                            }}>🔍</span>
                        </div>
                    </div>

                    {/* Batch Content */}
                    <div style={{ maxHeight: '600px', overflowY: 'auto', padding: '1rem' }}>
                        {isBatchesLoading ? (
                            <div style={{ textAlign: 'center', padding: '3rem' }}>
                                <svg className="animate-spin" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2">
                                    <path d="M21 12a9 9 0 11-6.219-8.56" strokeLinecap="round" />
                                </svg>
                                <p style={{ marginTop: '1rem', color: 'var(--muted-foreground)' }}>Loading batches...</p>
                            </div>
                        ) : batchViewMode === 'unique' ? (
                            /* Unique Batches View */
                            (() => {
                                const groups = new Map<string, BatchItem[]>();
                                const filtered = allBatches.filter(b => {
                                    if (!batchSearchTerm.trim()) return true;
                                    const term = batchSearchTerm.toLowerCase();
                                    return (
                                        b.batchNumber?.toLowerCase().includes(term) ||
                                        b.itemCode?.toLowerCase().includes(term) ||
                                        b.itemName?.toLowerCase().includes(term)
                                    );
                                });

                                filtered.forEach(batch => {
                                    const bn = batch.batchNumber || 'Unknown';
                                    if (!groups.has(bn)) groups.set(bn, []);
                                    groups.get(bn)?.push(batch);
                                });

                                // Support sorting groups by various fields
                                const sortedGroups = Array.from(groups.entries()).sort((a, b) => {
                                    const itemA = a[1][0];
                                    const itemB = b[1][0];

                                    // Custom sorting for records count
                                    if ((batchSortColumn as string) === 'records') {
                                        const countA = a[1].length;
                                        const countB = b[1].length;
                                        return batchSortDirection === 'asc' ? countA - countB : countB - countA;
                                    }

                                    let valA: any = itemA[batchSortColumn as keyof BatchItem] || '';
                                    let valB: any = itemB[batchSortColumn as keyof BatchItem] || '';

                                    // Special handling for counts if sorting by unknown
                                    if (batchSortColumn === 'batchNumber') {
                                        valA = a[0];
                                        valB = b[0];
                                    }

                                    // Chronological sort for dates or shelf life
                                    if (batchSortColumn === 'mfgDate' || batchSortColumn === 'expiryDate' || (batchSortColumn as string) === 'shelfLife') {
                                        const parsePharmaDate = (dateStr: string | undefined) => {
                                            if (!dateStr || dateStr === 'N/A') return 0;
                                            const parts = dateStr.split('-');
                                            if (parts.length === 3) {
                                                const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
                                                const monthIdx = months.indexOf(parts[1].toUpperCase());
                                                if (monthIdx !== -1) {
                                                    const year = parseInt(parts[2]);
                                                    const fullYear = year < 50 ? 2000 + year : 1900 + year;
                                                    return new Date(fullYear, monthIdx, parseInt(parts[0])).getTime();
                                                }
                                            }
                                            return new Date(dateStr).getTime() || 0;
                                        };

                                        if ((batchSortColumn as string) === 'shelfLife') {
                                            const timeA = parsePharmaDate(itemA.expiryDate).valueOf() - parsePharmaDate(itemA.mfgDate).valueOf();
                                            const timeB = parsePharmaDate(itemB.expiryDate).valueOf() - parsePharmaDate(itemB.mfgDate).valueOf();
                                            return batchSortDirection === 'asc' ? timeA - timeB : timeB - timeA;
                                        }

                                        const timeA = parsePharmaDate(valA);
                                        const timeB = parsePharmaDate(valB);
                                        return batchSortDirection === 'asc' ? timeA - timeB : timeB - timeA;
                                    }

                                    const comparison = String(valA).localeCompare(String(valB), undefined, { numeric: true, sensitivity: 'base' });
                                    return batchSortDirection === 'asc' ? comparison : -comparison;
                                });

                                return sortedGroups.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--muted-foreground)' }}>
                                        <span style={{ fontSize: '3rem' }}>📭</span>
                                        <p style={{ marginTop: '1rem' }}>No batches found</p>
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                        {/* Sorting Headers for Unique View */}
                                        <div style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '1rem',
                                            padding: '0.75rem 1rem',
                                            background: '#f8fafc',
                                            borderRadius: '8px',
                                            marginBottom: '0.5rem',
                                            border: '1px solid #e2e8f0',
                                            fontSize: '0.75rem',
                                            fontWeight: 700,
                                            color: '#64748b',
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.05em'
                                        }}>
                                            <div style={{ width: '24px' }}></div>
                                            <div style={{ width: '32px' }}>#</div>
                                            <div
                                                onClick={() => toggleBatchSort('batchNumber')}
                                                style={{ width: '150px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', color: batchSortColumn === 'batchNumber' ? '#7c3aed' : 'inherit' }}
                                            >
                                                Batch No {batchSortColumn === 'batchNumber' && (batchSortDirection === 'asc' ? '↑' : '↓')}
                                            </div>
                                            <div
                                                onClick={() => toggleBatchSort('itemCode')}
                                                style={{ width: '120px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', color: batchSortColumn === 'itemCode' ? '#7c3aed' : 'inherit' }}
                                            >
                                                Item Code {batchSortColumn === 'itemCode' && (batchSortDirection === 'asc' ? '↑' : '↓')}
                                            </div>
                                            <div
                                                onClick={() => toggleBatchSort('records')}
                                                style={{ width: '80px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', color: (batchSortColumn as string) === 'records' ? '#7c3aed' : 'inherit' }}
                                            >
                                                Records {(batchSortColumn as string) === 'records' && (batchSortDirection === 'asc' ? '↑' : '↓')}
                                            </div>
                                            <div
                                                onClick={() => toggleBatchSort('itemName')}
                                                style={{ flex: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', color: batchSortColumn === 'itemName' ? '#7c3aed' : 'inherit' }}
                                            >
                                                Item Name {batchSortColumn === 'itemName' && (batchSortDirection === 'asc' ? '↑' : '↓')}
                                            </div>
                                            <div
                                                onClick={() => toggleBatchSort('mfgDate')}
                                                style={{ width: '180px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', color: (batchSortColumn === 'mfgDate' || batchSortColumn === 'expiryDate') ? '#7c3aed' : 'inherit' }}
                                            >
                                                Validity {(batchSortColumn === 'mfgDate' || batchSortColumn === 'expiryDate') && (batchSortDirection === 'asc' ? '↑' : '↓')}
                                            </div>
                                            <div
                                                onClick={() => toggleBatchSort('shelfLife')}
                                                style={{ width: '100px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', textAlign: 'right', justifyContent: 'flex-end', color: (batchSortColumn as string) === 'shelfLife' ? '#7c3aed' : 'inherit' }}
                                            >
                                                Shelf Life {(batchSortColumn as string) === 'shelfLife' && (batchSortDirection === 'asc' ? '↑' : '↓')}
                                            </div>
                                        </div>

                                        {sortedGroups.map(([batchNumber, rawItems], idx) => {
                                            const isExpanded = expandedBatchGroups.has(batchNumber);

                                            // Sort items inside the folder as well
                                            const items = [...rawItems].sort((a, b) => {
                                                let valA: any = a[batchSortColumn as keyof BatchItem] || '';
                                                let valB: any = b[batchSortColumn as keyof BatchItem] || '';

                                                if (batchSortColumn === 'mfgDate' || batchSortColumn === 'expiryDate' || (batchSortColumn as string) === 'shelfLife') {
                                                    const parsePharmaDate = (dateStr: string | undefined) => {
                                                        if (!dateStr || dateStr === 'N/A') return 0;
                                                        const parts = dateStr.split('-');
                                                        if (parts.length === 3) {
                                                            const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
                                                            const monthIdx = months.indexOf(parts[1].toUpperCase());
                                                            if (monthIdx !== -1) {
                                                                const year = parseInt(parts[2]);
                                                                const fullYear = year < 50 ? 2000 + year : 1900 + year;
                                                                return new Date(fullYear, monthIdx, parseInt(parts[0])).getTime();
                                                            }
                                                        }
                                                        return new Date(dateStr).getTime() || 0;
                                                    };

                                                    if ((batchSortColumn as string) === 'shelfLife') {
                                                        const timeA = parsePharmaDate(a.expiryDate) - parsePharmaDate(a.mfgDate);
                                                        const timeB = parsePharmaDate(b.expiryDate) - parsePharmaDate(b.mfgDate);
                                                        return batchSortDirection === 'asc' ? timeA - timeB : timeB - timeA;
                                                    }

                                                    const timeA = parsePharmaDate(valA);
                                                    const timeB = parsePharmaDate(valB);
                                                    return batchSortDirection === 'asc' ? timeA - timeB : timeB - timeA;
                                                }

                                                const comparison = String(valA).localeCompare(String(valB), undefined, { numeric: true, sensitivity: 'base' });
                                                return batchSortDirection === 'asc' ? comparison : -comparison;
                                            });

                                            return (
                                                <div key={batchNumber} style={{
                                                    marginBottom: '0.75rem',
                                                    border: '1px solid var(--border)',
                                                    borderRadius: '8px',
                                                    overflow: 'hidden',
                                                    boxShadow: isExpanded ? '0 4px 12px rgba(124, 58, 237, 0.1)' : 'none',
                                                }}>
                                                    <button
                                                        onClick={() => {
                                                            setExpandedBatchGroups(prev => {
                                                                const next = new Set(prev);
                                                                if (next.has(batchNumber)) {
                                                                    next.delete(batchNumber);
                                                                } else {
                                                                    next.add(batchNumber);
                                                                }
                                                                return next;
                                                            });
                                                        }}
                                                        style={{
                                                            width: '100%',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '1rem',
                                                            padding: '1rem',
                                                            background: isExpanded ? '#faf5ff' : 'var(--card)',
                                                            border: 'none',
                                                            cursor: 'pointer',
                                                            textAlign: 'left',
                                                        }}
                                                    >
                                                        <div style={{
                                                            width: '24px',
                                                            height: '24px',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            borderRadius: '4px',
                                                            background: isExpanded ? '#7c3aed' : '#e5e7eb',
                                                            color: isExpanded ? 'white' : '#6b7280',
                                                            transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                                                            transition: 'all 0.2s ease',
                                                            fontSize: '0.7rem',
                                                            fontWeight: 700,
                                                        }}>▶</div>
                                                        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#9ca3af', minWidth: '32px' }}>
                                                            #{idx + 1}
                                                        </div>
                                                        <div style={{
                                                            fontFamily: 'monospace',
                                                            fontSize: '1rem',
                                                            fontWeight: 700,
                                                            color: '#7c3aed',
                                                            minWidth: '150px'
                                                        }}>
                                                            📁 {batchNumber}
                                                        </div>
                                                        <div style={{
                                                            fontSize: '0.85rem',
                                                            fontWeight: 600,
                                                            color: '#6b7280',
                                                            fontFamily: 'monospace',
                                                            minWidth: '120px'
                                                        }}>
                                                            {items[0].itemCode}
                                                        </div>
                                                        <div style={{
                                                            fontSize: '0.75rem',
                                                            minWidth: '80px',
                                                            color: items.length > 1 ? '#ea580c' : '#6b7280',
                                                            background: items.length > 1 ? '#fff7ed' : '#f3f4f6',
                                                            border: items.length > 1 ? '1px solid #fed7aa' : '1px solid #e5e7eb',
                                                            padding: '3px 10px',
                                                            borderRadius: '12px',
                                                            fontWeight: 600,
                                                            textAlign: 'center'
                                                        }}>
                                                            {items.length} record{items.length !== 1 ? 's' : ''}
                                                        </div>
                                                        <div style={{
                                                            flex: 1,
                                                            fontSize: '0.85rem',
                                                            color: '#374151',
                                                            overflow: 'hidden',
                                                            textOverflow: 'ellipsis',
                                                            whiteSpace: 'nowrap',
                                                            fontWeight: 500
                                                        }}>
                                                            {items[0].itemName}
                                                        </div>
                                                        <div style={{ fontSize: '0.8rem', color: '#6b7280', width: '180px', display: 'flex', gap: '8px' }}>
                                                            <span>{items[0].mfgDate} → {items[0].expiryDate}</span>
                                                        </div>
                                                        <div style={{ fontSize: '0.8rem', width: '100px', display: 'flex', justifyContent: 'flex-end' }}>
                                                            <span style={{ fontWeight: 600, color: '#059669' }}>
                                                                {calculateShelfLife(items[0].mfgDate, items[0].expiryDate)}
                                                            </span>
                                                        </div>
                                                    </button>

                                                    {isExpanded && (
                                                        <div style={{ padding: '1rem', background: '#fafafa' }}>
                                                            {items.map((item: BatchItem, itemIdx: number) => (
                                                                <div key={itemIdx} style={{
                                                                    display: 'grid',
                                                                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                                                                    gap: '1rem',
                                                                    padding: '1rem',
                                                                    background: 'white',
                                                                    borderRadius: '8px',
                                                                    border: '1px solid #e9d5ff',
                                                                    marginBottom: itemIdx < items.length - 1 ? '0.75rem' : 0,
                                                                    boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                                                                }}>
                                                                    <div>
                                                                        <div style={{ fontSize: '0.65rem', color: '#9ca3af', fontWeight: 500, textTransform: 'uppercase' }}>Item Code</div>
                                                                        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#7c3aed', fontFamily: 'monospace' }}>{item.itemCode}</div>
                                                                    </div>
                                                                    <div>
                                                                        <div style={{ fontSize: '0.65rem', color: '#9ca3af', fontWeight: 500, textTransform: 'uppercase' }}>Item Name</div>
                                                                        <div style={{ fontSize: '0.85rem', color: '#374151', fontWeight: 500 }}>{item.itemName}</div>
                                                                    </div>
                                                                    <div>
                                                                        <div style={{ fontSize: '0.65rem', color: '#9ca3af', fontWeight: 500, textTransform: 'uppercase' }}>Mfg Date</div>
                                                                        <div style={{ fontSize: '0.85rem', color: '#374151' }}>{item.mfgDate || 'N/A'}</div>
                                                                    </div>
                                                                    <div>
                                                                        <div style={{ fontSize: '0.65rem', color: '#9ca3af', fontWeight: 500, textTransform: 'uppercase' }}>Expiry Date</div>
                                                                        <div style={{ fontSize: '0.85rem', color: '#dc2626', fontWeight: 600 }}>{item.expiryDate || 'N/A'}</div>
                                                                    </div>
                                                                    <div>
                                                                        <div style={{ fontSize: '0.65rem', color: '#9ca3af', fontWeight: 500, textTransform: 'uppercase' }}>Shelf Life</div>
                                                                        <div style={{ fontSize: '0.85rem', color: '#059669', fontWeight: 600 }}>{calculateShelfLife(item.mfgDate, item.expiryDate)}</div>
                                                                    </div>
                                                                    <div>
                                                                        <div style={{ fontSize: '0.65rem', color: '#9ca3af', fontWeight: 500, textTransform: 'uppercase' }}>Batch Size</div>
                                                                        <div style={{ fontSize: '0.85rem', color: '#374151' }}>{item.batchSize} {item.batchUom}</div>
                                                                    </div>
                                                                    <div>
                                                                        <div style={{ fontSize: '0.65rem', color: '#9ca3af', fontWeight: 500, textTransform: 'uppercase' }}>Pack</div>
                                                                        <div style={{ fontSize: '0.85rem', color: '#374151' }}>{item.pack || 'N/A'}</div>
                                                                    </div>
                                                                    <div style={{ gridColumn: 'span 2' }}>
                                                                        <div style={{ fontSize: '0.65rem', color: '#9ca3af', fontWeight: 500, textTransform: 'uppercase' }}>Source</div>
                                                                        <div style={{ fontSize: '0.75rem', color: '#6b7280', fontStyle: 'italic' }}>{item.sourceFileName}</div>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                );
                            })()
                        ) : (
                            /* All Batches View - Table */
                            (() => {
                                const filtered = allBatches.filter(b => {
                                    if (!batchSearchTerm.trim()) return true;
                                    const term = batchSearchTerm.toLowerCase();
                                    return (
                                        b.batchNumber?.toLowerCase().includes(term) ||
                                        b.itemCode?.toLowerCase().includes(term) ||
                                        b.itemName?.toLowerCase().includes(term)
                                    );
                                });

                                const sortedBatches = [...filtered].sort((a, b) => {
                                    let valA: any = a[batchSortColumn as keyof BatchItem] || '';
                                    let valB: any = b[batchSortColumn as keyof BatchItem] || '';

                                    // Chronological sort for dates or shelf life
                                    if (batchSortColumn === 'mfgDate' || batchSortColumn === 'expiryDate' || (batchSortColumn as string) === 'shelfLife') {
                                        const parsePharmaDate = (dateStr: string | undefined) => {
                                            if (!dateStr || dateStr === 'N/A') return 0;
                                            const parts = dateStr.split('-');
                                            if (parts.length === 3) {
                                                const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
                                                const monthIdx = months.indexOf(parts[1].toUpperCase());
                                                if (monthIdx !== -1) {
                                                    const year = parseInt(parts[2]);
                                                    const fullYear = year < 50 ? 2000 + year : 1900 + year;
                                                    return new Date(fullYear, monthIdx, parseInt(parts[0])).getTime();
                                                }
                                            }
                                            return new Date(dateStr).getTime() || 0;
                                        };

                                        if ((batchSortColumn as string) === 'shelfLife') {
                                            const timeA = parsePharmaDate(a.expiryDate) - parsePharmaDate(a.mfgDate);
                                            const timeB = parsePharmaDate(b.expiryDate) - parsePharmaDate(b.mfgDate);
                                            return batchSortDirection === 'asc' ? timeA - timeB : timeB - timeA;
                                        }

                                        const timeA = parsePharmaDate(valA);
                                        const timeB = parsePharmaDate(valB);
                                        return batchSortDirection === 'asc' ? timeA - timeB : timeB - timeA;
                                    }

                                    const comparison = String(valA).localeCompare(String(valB), undefined, { numeric: true, sensitivity: 'base' });
                                    return batchSortDirection === 'asc' ? comparison : -comparison;
                                });

                                return (
                                    <div style={{ overflowX: 'auto' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                            <thead>
                                                <tr style={{ background: '#f9fafb', position: 'sticky', top: 0, zIndex: 10 }}>
                                                    <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: 600, borderBottom: '2px solid var(--border)', color: '#6b7280' }}>#</th>
                                                    {[
                                                        { id: 'batchNumber', label: 'Batch No' },
                                                        { id: 'itemCode', label: 'Item Code' },
                                                        { id: 'itemName', label: 'Item Name' },
                                                        { id: 'mfgDate', label: 'Mfg Date' },
                                                        { id: 'expiryDate', label: 'Expiry Date' },
                                                        { id: 'shelfLife', label: 'Shelf Life' },
                                                        { id: 'batchSize', label: 'Batch Size' },
                                                        { id: 'pack', label: 'Pack' },
                                                        { id: 'sourceFileName', label: 'Source' }
                                                    ].map(col => (
                                                        <th
                                                            key={col.id}
                                                            onClick={() => toggleBatchSort(col.id as keyof BatchItem)}
                                                            style={{
                                                                padding: '0.75rem',
                                                                textAlign: 'left',
                                                                fontWeight: 600,
                                                                borderBottom: '2px solid var(--border)',
                                                                cursor: 'pointer',
                                                                color: batchSortColumn === col.id ? '#7c3aed' : '#6b7280',
                                                                transition: 'all 0.2s',
                                                                whiteSpace: 'nowrap'
                                                            }}
                                                        >
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                {col.label}
                                                                <span style={{ fontSize: '0.7rem', opacity: batchSortColumn === col.id ? 1 : 0.3 }}>
                                                                    {batchSortColumn === col.id ? (batchSortDirection === 'asc' ? '↑' : '↓') : '↕'}
                                                                </span>
                                                            </div>
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {sortedBatches.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={10} style={{ padding: '3rem', textAlign: 'center', color: 'var(--muted-foreground)' }}>
                                                            <span style={{ fontSize: '2rem' }}>📭</span>
                                                            <p style={{ marginTop: '0.5rem' }}>No batches found</p>
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    sortedBatches.slice(0, 500).map((batch, idx) => (
                                                        <tr key={idx} style={{
                                                            background: idx % 2 === 0 ? 'white' : '#fafafa',
                                                            transition: 'background 0.2s'
                                                        }}
                                                            onMouseEnter={(e) => e.currentTarget.style.background = '#f5f3ff'}
                                                            onMouseLeave={(e) => e.currentTarget.style.background = idx % 2 === 0 ? 'white' : '#fafafa'}
                                                        >
                                                            <td style={{ padding: '0.75rem', borderBottom: '1px solid #f3f4f6', color: '#9ca3af' }}>{idx + 1}</td>
                                                            <td style={{ padding: '0.75rem', borderBottom: '1px solid #f3f4f6' }}>
                                                                <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#0891b2' }}>{batch.batchNumber}</span>
                                                            </td>
                                                            <td style={{ padding: '0.75rem', borderBottom: '1px solid #f3f4f6' }}>
                                                                <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#6b7280' }}>{batch.itemCode}</span>
                                                            </td>
                                                            <td style={{ padding: '0.75rem', borderBottom: '1px solid #f3f4f6', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={batch.itemName}>
                                                                {batch.itemName}
                                                            </td>
                                                            <td style={{ padding: '0.75rem', borderBottom: '1px solid #f3f4f6' }}>{batch.mfgDate || 'N/A'}</td>
                                                            <td style={{ padding: '0.75rem', borderBottom: '1px solid #f3f4f6', color: '#dc2626', fontWeight: 600 }}>{batch.expiryDate || 'N/A'}</td>
                                                            <td style={{ padding: '0.75rem', borderBottom: '1px solid #f3f4f6', color: '#059669', fontWeight: 600 }}>
                                                                {calculateShelfLife(batch.mfgDate, batch.expiryDate)}
                                                            </td>
                                                            <td style={{ padding: '0.75rem', borderBottom: '1px solid #f3f4f6' }}>{batch.batchSize} {batch.batchUom}</td>
                                                            <td style={{ padding: '0.75rem', borderBottom: '1px solid #f3f4f6' }}>{batch.pack || 'N/A'}</td>
                                                            <td style={{ padding: '0.75rem', borderBottom: '1px solid #f3f4f6', fontSize: '0.75rem', color: '#6b7280', fontStyle: 'italic', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis' }} title={batch.sourceFileName}>
                                                                {batch.sourceFileName}
                                                            </td>
                                                        </tr>
                                                    ))
                                                )}
                                            </tbody>
                                        </table>
                                        {sortedBatches.length > 500 && (
                                            <div style={{
                                                padding: '1rem',
                                                textAlign: 'center',
                                                background: '#f9fafb',
                                                color: '#6b7280',
                                                fontSize: '0.85rem',
                                                borderTop: '1px solid var(--border)',
                                            }}>
                                                Showing first 500 of {sortedBatches.length.toLocaleString()} records. Use search to narrow results.
                                            </div>
                                        )}
                                    </div>
                                );
                            })()
                        )}
                    </div>
                </div>
            )}

            {/* RM Data Modal */}
            <RmDataModal />

            {/* Per-Formula RM Modal with backdrop */}
            {perFormulaRmModalOpen && (
                <div
                    onClick={closePerFormulaRmModal}
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: 'rgba(0,0,0,0.5)',
                        zIndex: 1000,
                    }}
                />
            )}
            <PerFormulaRmModal />

            {/* Per-Formula PPM Modal with backdrop */}
            {perFormulaPpmModalOpen && (
                <div
                    onClick={closePerFormulaPpmModal}
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: 'rgba(0,0,0,0.5)',
                        zIndex: 1000,
                    }}
                />
            )}
            <PerFormulaPpmModal />

            {/* Per-Formula PM Modal with backdrop */}
            {perFormulaPmModalOpen && (
                <div
                    onClick={closePerFormulaPmModal}
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: 'rgba(0,0,0,0.5)',
                        zIndex: 1000,
                    }}
                />
            )}
            <PerFormulaPmModal />

            {/* PPM Data Modal */}
            {showPpmDataModal && (
                <div style={{
                    position: 'fixed',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    zIndex: 1000,
                    width: '95%',
                    maxWidth: '1200px',
                    maxHeight: '90vh',
                    overflowY: 'auto',
                    background: 'white',
                    borderRadius: '16px',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.05)',
                    border: '2px solid #e5e7eb',
                }}>
                    {/* Modal Header */}
                    <div style={{
                        position: 'sticky',
                        top: 0,
                        background: ppmModalType === 'matched'
                            ? 'linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)'
                            : 'linear-gradient(135deg, #dc2626 0%, #ef4444 100%)',
                        padding: '16px 24px',
                        borderRadius: '14px 14px 0 0',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        zIndex: 10,
                    }}>
                        <div>
                            <h3 style={{ color: 'white', fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>
                                📦 PPM (Primary Packing Material) Requisition Data
                            </h3>
                            <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: '0.85rem', marginTop: '4px' }}>
                                {ppmModalType === 'matched'
                                    ? `✓ ${ppmModalData.length} batches with PPM data`
                                    : `✗ ${ppmModalData.length} batches without PPM data`
                                }
                            </p>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            {/* View Mode Toggle */}
                            <div style={{
                                display: 'flex',
                                background: 'rgba(255,255,255,0.2)',
                                borderRadius: '8px',
                                padding: '3px',
                            }}>
                                <button
                                    onClick={() => setPpmViewMode('table')}
                                    style={{
                                        padding: '6px 12px',
                                        border: 'none',
                                        borderRadius: '6px',
                                        fontSize: '0.8rem',
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                        background: ppmViewMode === 'table' ? 'white' : 'transparent',
                                        color: ppmViewMode === 'table' ? (ppmModalType === 'matched' ? '#2563eb' : '#dc2626') : 'white',
                                        transition: 'all 0.2s',
                                    }}
                                >
                                    📊 Table
                                </button>
                                <button
                                    onClick={() => setPpmViewMode('file')}
                                    style={{
                                        padding: '6px 12px',
                                        border: 'none',
                                        borderRadius: '6px',
                                        fontSize: '0.8rem',
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                        background: ppmViewMode === 'file' ? 'white' : 'transparent',
                                        color: ppmViewMode === 'file' ? (ppmModalType === 'matched' ? '#2563eb' : '#dc2626') : 'white',
                                        transition: 'all 0.2s',
                                    }}
                                >
                                    📁 File
                                </button>
                            </div>
                            <button
                                onClick={closePpmDataModal}
                                style={{
                                    padding: '8px 16px',
                                    background: 'white',
                                    border: 'none',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    fontWeight: 600,
                                    color: ppmModalType === 'matched' ? '#2563eb' : '#dc2626',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                }}
                            >
                                ✕ Close
                            </button>
                        </div>
                    </div>

                    {/* Modal Body */}
                    <div style={{ padding: '20px' }}>
                        {isPpmModalLoading ? (
                            <div style={{ textAlign: 'center', padding: '60px', color: '#64748b' }}>
                                <div style={{ width: '48px', height: '48px', border: '4px solid #e2e8f0', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 20px' }} />
                                Loading PPM data...
                            </div>
                        ) : ppmModalError ? (
                            <div style={{ textAlign: 'center', padding: '60px', color: '#ef4444' }}>
                                ❌ {ppmModalError}
                            </div>
                        ) : (
                            <>
                                {/* Stats Cards */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px', marginBottom: '20px' }}>
                                    <div style={{
                                        background: ppmModalType === 'matched'
                                            ? 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)'
                                            : 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)',
                                        padding: '12px 16px',
                                        borderRadius: '12px',
                                        border: ppmModalType === 'matched' ? '1px solid #bfdbfe' : '1px solid #fecaca',
                                    }}>
                                        <p style={{ fontSize: '0.75rem', color: ppmModalType === 'matched' ? '#2563eb' : '#dc2626', fontWeight: 600, marginBottom: '4px' }}>
                                            {ppmModalType === 'matched' ? 'Total PPM Materials' : 'Batches Missing PPM Data'}
                                        </p>
                                        <p style={{ fontSize: '1.5rem', fontWeight: 700, color: ppmModalType === 'matched' ? '#1d4ed8' : '#b91c1c' }}>
                                            {ppmModalData.length}
                                        </p>
                                    </div>
                                    <div style={{
                                        background: 'linear-gradient(135deg, #f3e8ff 0%, #e9d5ff 100%)',
                                        padding: '12px 16px',
                                        borderRadius: '12px',
                                        border: '1px solid #c4b5fd',
                                    }}>
                                        <p style={{ fontSize: '0.75rem', color: '#7c3aed', fontWeight: 600, marginBottom: '4px' }}>Unique Batches</p>
                                        <p style={{ fontSize: '1.5rem', fontWeight: 700, color: '#6d28d9' }}>
                                            {new Set(ppmModalData.map((m: any) => m.batchNumber)).size}
                                        </p>
                                    </div>
                                </div>

                                {/* Table View */}
                                {ppmViewMode === 'table' && ppmModalData.length > 0 && (() => {
                                    const togglePpmSort = (column: string) => {
                                        if (ppmSortColumn === column) {
                                            setPpmSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
                                        } else {
                                            setPpmSortColumn(column);
                                            setPpmSortDirection('asc');
                                        }
                                    };

                                    const sortedPpmData = [...ppmModalData].sort((a, b) => {
                                        const valA = a[ppmSortColumn] ?? '';
                                        const valB = b[ppmSortColumn] ?? '';
                                        if (typeof valA === 'number' && typeof valB === 'number') {
                                            return ppmSortDirection === 'asc' ? valA - valB : valB - valA;
                                        }
                                        const strA = String(valA).toLowerCase();
                                        const strB = String(valB).toLowerCase();
                                        if (strA < strB) return ppmSortDirection === 'asc' ? -1 : 1;
                                        if (strA > strB) return ppmSortDirection === 'asc' ? 1 : -1;
                                        return 0;
                                    });

                                    const columns = ppmModalType === 'matched' ? [
                                        { id: 'matReqNo', label: 'Slip No', width: '85px' },
                                        { id: 'batchNumber', label: 'Batch No', width: '90px' },
                                        { id: 'mfcNo', label: 'MFC No', width: '100px' },
                                        { id: 'materialName', label: 'Material Name', width: '1fr' },
                                        { id: 'materialCode', label: 'Code', width: '80px' },
                                        { id: 'arNo', label: 'AR No', width: '95px', highlight: true },
                                        { id: 'quantityRequired', label: 'Qty Req', width: '75px' },
                                        { id: 'quantityToIssue', label: 'Qty Issue', width: '75px' },
                                        { id: 'labelClaim', label: 'Label', width: '60px' },
                                        { id: 'ovgPercent', label: 'OVG%', width: '55px' },
                                    ] : [
                                        { id: 'batchNumber', label: 'Batch No', width: '120px' },
                                        { id: 'itemCode', label: 'Item Code', width: '120px' },
                                        { id: 'itemName', label: 'Item Name', width: '1fr' },
                                        { id: 'mfgDate', label: 'Mfg Date', width: '100px' },
                                        { id: 'expiryDate', label: 'Expiry Date', width: '100px' },
                                        { id: 'batchSize', label: 'Batch Size', width: '100px' },
                                    ];

                                    return (
                                        <div style={{ overflowX: 'auto' }}>
                                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                                <thead>
                                                    <tr style={{ background: '#eff6ff' }}>
                                                        {columns.map(col => (
                                                            <th
                                                                key={col.id}
                                                                onClick={() => togglePpmSort(col.id)}
                                                                style={{
                                                                    padding: '12px 10px',
                                                                    textAlign: 'left',
                                                                    fontWeight: 600,
                                                                    borderBottom: '2px solid #bfdbfe',
                                                                    cursor: 'pointer',
                                                                    color: ppmSortColumn === col.id ? '#2563eb' : '#64748b',
                                                                    whiteSpace: 'nowrap',
                                                                    background: (col as any).highlight ? '#fef3c7' : undefined,
                                                                }}
                                                            >
                                                                {col.label} {ppmSortColumn === col.id && (ppmSortDirection === 'asc' ? '↑' : '↓')}
                                                            </th>
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {sortedPpmData.slice(0, 500).map((item, idx) => (
                                                        <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                                            {columns.map(col => (
                                                                <td
                                                                    key={col.id}
                                                                    style={{
                                                                        padding: '10px',
                                                                        fontWeight: col.id === 'batchNumber' ? 600 : 400,
                                                                        color: col.id === 'batchNumber' ? '#2563eb' : (col as any).highlight ? '#d97706' : '#374151',
                                                                        background: (col as any).highlight ? '#fefce8' : undefined,
                                                                    }}
                                                                >
                                                                    {typeof item[col.id] === 'number' ? item[col.id].toLocaleString() : (item[col.id] || 'N/A')}
                                                                </td>
                                                            ))}
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                            {sortedPpmData.length > 500 && (
                                                <div style={{ textAlign: 'center', padding: '12px', color: '#64748b', fontSize: '0.85rem', borderTop: '1px solid #e2e8f0' }}>
                                                    Showing first 500 of {sortedPpmData.length.toLocaleString()} materials
                                                </div>
                                            )}
                                        </div>
                                    );
                                })()}

                                {/* File View */}
                                {ppmViewMode === 'file' && ppmModalData.length > 0 && (
                                    <div style={{ color: '#64748b', textAlign: 'center', padding: '40px' }}>
                                        📁 File view coming soon
                                    </div>
                                )}

                                {ppmModalData.length === 0 && (
                                    <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                                        No {ppmModalType === 'matched' ? 'PPM materials found' : 'missing batches'} for MFC-linked products.
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* PM Data Modal */}
            {showPmDataModal && (
                <div style={{
                    position: 'fixed',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    zIndex: 1000,
                    width: '95%',
                    maxWidth: '1200px',
                    maxHeight: '90vh',
                    overflowY: 'auto',
                    background: 'white',
                    borderRadius: '16px',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.05)',
                    border: '2px solid #e5e7eb',
                }}>
                    {/* Modal Header */}
                    <div style={{
                        position: 'sticky',
                        top: 0,
                        background: pmModalType === 'matched'
                            ? 'linear-gradient(135deg, #6d28d9 0%, #7c3aed 100%)'
                            : 'linear-gradient(135deg, #dc2626 0%, #ef4444 100%)',
                        padding: '16px 24px',
                        borderRadius: '14px 14px 0 0',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        zIndex: 10,
                    }}>
                        <div>
                            <h3 style={{ color: 'white', fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>
                                📦 PM (Packing Material) Requisition Data
                            </h3>
                            <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: '0.85rem', marginTop: '4px' }}>
                                {pmModalType === 'matched'
                                    ? `✓ ${pmModalData.length} batches with PM data`
                                    : `✗ ${pmModalData.length} batches without PM data`
                                }
                            </p>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            {/* View Mode Toggle */}
                            <div style={{
                                display: 'flex',
                                background: 'rgba(255,255,255,0.2)',
                                borderRadius: '8px',
                                padding: '3px',
                            }}>
                                <button
                                    onClick={() => setPmViewMode('table')}
                                    style={{
                                        padding: '6px 12px',
                                        border: 'none',
                                        borderRadius: '6px',
                                        fontSize: '0.8rem',
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                        background: pmViewMode === 'table' ? 'white' : 'transparent',
                                        color: pmViewMode === 'table' ? (pmModalType === 'matched' ? '#7c3aed' : '#dc2626') : 'white',
                                        transition: 'all 0.2s',
                                    }}
                                >
                                    📊 Table
                                </button>
                                <button
                                    onClick={() => setPmViewMode('file')}
                                    style={{
                                        padding: '6px 12px',
                                        border: 'none',
                                        borderRadius: '6px',
                                        fontSize: '0.8rem',
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                        background: pmViewMode === 'file' ? 'white' : 'transparent',
                                        color: pmViewMode === 'file' ? (pmModalType === 'matched' ? '#7c3aed' : '#dc2626') : 'white',
                                        transition: 'all 0.2s',
                                    }}
                                >
                                    📁 File
                                </button>
                            </div>
                            <button
                                onClick={closePmDataModal}
                                style={{
                                    padding: '8px 16px',
                                    background: 'white',
                                    border: 'none',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    fontWeight: 600,
                                    color: pmModalType === 'matched' ? '#7c3aed' : '#dc2626',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                }}
                            >
                                ✕ Close
                            </button>
                        </div>
                    </div>

                    {/* Modal Body */}
                    <div style={{ padding: '20px' }}>
                        {isPmModalLoading ? (
                            <div style={{ textAlign: 'center', padding: '60px', color: '#64748b' }}>
                                <div style={{ width: '48px', height: '48px', border: '4px solid #e2e8f0', borderTopColor: '#7c3aed', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 20px' }} />
                                Loading PM data...
                            </div>
                        ) : pmModalError ? (
                            <div style={{ textAlign: 'center', padding: '60px', color: '#ef4444' }}>
                                ❌ {pmModalError}
                            </div>
                        ) : (
                            <>
                                {/* Stats Cards */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px', marginBottom: '20px' }}>
                                    <div style={{
                                        background: pmModalType === 'matched'
                                            ? 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)'
                                            : 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)',
                                        padding: '12px 16px',
                                        borderRadius: '12px',
                                        border: pmModalType === 'matched' ? '1px solid #c4b5fd' : '1px solid #fecaca',
                                    }}>
                                        <p style={{ fontSize: '0.75rem', color: pmModalType === 'matched' ? '#7c3aed' : '#dc2626', fontWeight: 600, marginBottom: '4px' }}>
                                            {pmModalType === 'matched' ? 'Total PM Materials' : 'Batches Missing PM Data'}
                                        </p>
                                        <p style={{ fontSize: '1.5rem', fontWeight: 700, color: pmModalType === 'matched' ? '#6d28d9' : '#b91c1c' }}>
                                            {pmModalData.length}
                                        </p>
                                    </div>
                                    <div style={{
                                        background: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)',
                                        padding: '12px 16px',
                                        borderRadius: '12px',
                                        border: '1px solid #a7f3d0',
                                    }}>
                                        <p style={{ fontSize: '0.75rem', color: '#059669', fontWeight: 600, marginBottom: '4px' }}>Unique Batches</p>
                                        <p style={{ fontSize: '1.5rem', fontWeight: 700, color: '#047857' }}>
                                            {new Set(pmModalData.map((m: any) => m.batchNumber)).size}
                                        </p>
                                    </div>
                                </div>

                                {/* Table View */}
                                {pmViewMode === 'table' && pmModalData.length > 0 && (() => {
                                    const togglePmSort = (column: string) => {
                                        if (pmSortColumn === column) {
                                            setPmSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
                                        } else {
                                            setPmSortColumn(column);
                                            setPmSortDirection('asc');
                                        }
                                    };

                                    const sortedPmData = [...pmModalData].sort((a, b) => {
                                        const valA = a[pmSortColumn] ?? '';
                                        const valB = b[pmSortColumn] ?? '';
                                        if (typeof valA === 'number' && typeof valB === 'number') {
                                            return pmSortDirection === 'asc' ? valA - valB : valB - valA;
                                        }
                                        const strA = String(valA).toLowerCase();
                                        const strB = String(valB).toLowerCase();
                                        if (strA < strB) return pmSortDirection === 'asc' ? -1 : 1;
                                        if (strA > strB) return pmSortDirection === 'asc' ? 1 : -1;
                                        return 0;
                                    });

                                    const columns = pmModalType === 'matched' ? [
                                        { id: 'matReqNo', label: 'Slip No', width: '85px' },
                                        { id: 'batchNumber', label: 'Batch No', width: '90px' },
                                        { id: 'mfcNo', label: 'MFC No', width: '100px' },
                                        { id: 'materialName', label: 'Material Name', width: '1fr' },
                                        { id: 'materialCode', label: 'Code', width: '80px' },
                                        { id: 'arNo', label: 'AR No', width: '95px', highlight: true },
                                        { id: 'quantityRequired', label: 'Qty Req', width: '75px' },
                                        { id: 'quantityToIssue', label: 'Qty Issue', width: '75px' },
                                        { id: 'labelClaim', label: 'Label', width: '60px' },
                                        { id: 'ovgPercent', label: 'OVG%', width: '55px' },
                                    ] : [
                                        { id: 'batchNumber', label: 'Batch No', width: '120px' },
                                        { id: 'itemCode', label: 'Item Code', width: '120px' },
                                        { id: 'itemName', label: 'Item Name', width: '1fr' },
                                        { id: 'mfgDate', label: 'Mfg Date', width: '100px' },
                                        { id: 'expiryDate', label: 'Expiry Date', width: '100px' },
                                        { id: 'batchSize', label: 'Batch Size', width: '100px' },
                                    ];

                                    return (
                                        <div style={{ overflowX: 'auto' }}>
                                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                                <thead>
                                                    <tr style={{ background: '#f5f3ff' }}>
                                                        {columns.map(col => (
                                                            <th
                                                                key={col.id}
                                                                onClick={() => togglePmSort(col.id)}
                                                                style={{
                                                                    padding: '12px 10px',
                                                                    textAlign: 'left',
                                                                    fontWeight: 600,
                                                                    borderBottom: '2px solid #ddd6fe',
                                                                    cursor: 'pointer',
                                                                    color: pmSortColumn === col.id ? '#7c3aed' : '#64748b',
                                                                    whiteSpace: 'nowrap',
                                                                    background: (col as any).highlight ? '#fef3c7' : undefined,
                                                                }}
                                                            >
                                                                {col.label} {pmSortColumn === col.id && (pmSortDirection === 'asc' ? '↑' : '↓')}
                                                            </th>
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {sortedPmData.slice(0, 500).map((item, idx) => (
                                                        <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                                            {columns.map(col => (
                                                                <td
                                                                    key={col.id}
                                                                    style={{
                                                                        padding: '10px',
                                                                        fontWeight: col.id === 'batchNumber' ? 600 : 400,
                                                                        color: col.id === 'batchNumber' ? '#7c3aed' : (col as any).highlight ? '#d97706' : '#374151',
                                                                        background: (col as any).highlight ? '#fefce8' : undefined,
                                                                    }}
                                                                >
                                                                    {typeof item[col.id] === 'number' ? item[col.id].toLocaleString() : (item[col.id] || 'N/A')}
                                                                </td>
                                                            ))}
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                            {sortedPmData.length > 500 && (
                                                <div style={{ textAlign: 'center', padding: '12px', color: '#64748b', fontSize: '0.85rem', borderTop: '1px solid #e2e8f0' }}>
                                                    Showing first 500 of {sortedPmData.length.toLocaleString()} materials
                                                </div>
                                            )}
                                        </div>
                                    );
                                })()}

                                {/* File View */}
                                {pmViewMode === 'file' && pmModalData.length > 0 && (
                                    <div style={{ color: '#64748b', textAlign: 'center', padding: '40px' }}>
                                        📁 File view coming soon
                                    </div>
                                )}

                                {pmModalData.length === 0 && (
                                    <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                                        No {pmModalType === 'matched' ? 'PM materials found' : 'missing batches'} for MFC-linked products.
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Material Qualification Data Modal */}
            {showMatDataModal && (
                <div
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(0, 0, 0, 0.6)',
                        backdropFilter: 'blur(4px)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 1000,
                        padding: '20px',
                    }}
                    onClick={closeMatDataModal}
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            background: 'white',
                            borderRadius: '16px',
                            boxShadow: '0 25px 50px rgba(0, 0, 0, 0.25)',
                            width: '100%',
                            maxWidth: '1200px',
                            maxHeight: '90vh',
                            display: 'flex',
                            flexDirection: 'column',
                            overflow: 'hidden',
                        }}
                    >
                        {/* Header */}
                        <div style={{
                            padding: '24px 28px',
                            borderBottom: '1px solid #e2e8f0',
                            background: 'linear-gradient(to right, #ecfeff, #f0fdfa)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                <div style={{
                                    width: '48px',
                                    height: '48px',
                                    borderRadius: '12px',
                                    background: matModalType === 'qualified'
                                        ? 'linear-gradient(135deg, #10b981, #059669)'
                                        : 'linear-gradient(135deg, #ef4444, #dc2626)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: 'white',
                                    fontSize: '24px',
                                }}>
                                    {matModalType === 'qualified' ? '✓' : '✗'}
                                </div>
                                <div>
                                    <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                                        RM COA - {matModalType === 'qualified' ? 'With COA Data' : 'Missing COA Data'}
                                    </h2>
                                    <p style={{ fontSize: '0.9rem', color: '#64748b', margin: '4px 0 0 0' }}>
                                        {matModalType === 'qualified'
                                            ? 'Materials with RM COA (Certificate of Analysis) data available'
                                            : 'Formula materials missing RM COA data'}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={closeMatDataModal}
                                style={{
                                    width: '40px',
                                    height: '40px',
                                    borderRadius: '10px',
                                    border: 'none',
                                    background: '#f1f5f9',
                                    color: '#64748b',
                                    fontSize: '20px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                }}
                            >
                                ×
                            </button>
                        </div>

                        {/* Stats Bar with View Toggle */}
                        <div style={{
                            padding: '16px 28px',
                            background: '#f8fafc',
                            borderBottom: '1px solid #e2e8f0',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: '16px',
                        }}>
                            <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{
                                        padding: '6px 14px',
                                        background: '#0891b2',
                                        color: 'white',
                                        borderRadius: '8px',
                                        fontWeight: 700,
                                        fontSize: '1.1rem',
                                    }}>
                                        {(() => {
                                            const arNos = new Set(matModalData.filter((m: any) => m.arNo && m.arNo !== 'Missing RM COA').map((m: any) => m.arNo));
                                            return arNos.size;
                                        })()}
                                    </span>
                                    <span style={{ color: '#64748b', fontWeight: 500 }}>AR Numbers</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{
                                        padding: '6px 14px',
                                        background: '#06b6d4',
                                        color: 'white',
                                        borderRadius: '8px',
                                        fontWeight: 700,
                                        fontSize: '1.1rem',
                                    }}>
                                        {(() => {
                                            const materials = new Set(matModalData.map((m: any) => m.materialCode));
                                            return materials.size;
                                        })()}
                                    </span>
                                    <span style={{ color: '#64748b', fontWeight: 500 }}>Unique Materials</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{
                                        padding: '6px 14px',
                                        background: '#0e7490',
                                        color: 'white',
                                        borderRadius: '8px',
                                        fontWeight: 700,
                                        fontSize: '1.1rem',
                                    }}>
                                        {matModalData.length.toLocaleString()}
                                    </span>
                                    <span style={{ color: '#64748b', fontWeight: 500 }}>Total Records</span>
                                </div>
                            </div>
                            {/* View Toggle */}
                            <div style={{
                                display: 'flex',
                                gap: '8px',
                                background: matModalType === 'qualified' ? '#ecfdf5' : '#fef2f2',
                                padding: '4px',
                                borderRadius: '8px',
                            }}>
                                <button
                                    onClick={() => setMatViewMode('file')}
                                    style={{
                                        padding: '8px 16px',
                                        border: 'none',
                                        borderRadius: '6px',
                                        fontSize: '0.85rem',
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                        background: matViewMode === 'file' ? 'white' : 'transparent',
                                        color: matViewMode === 'file' ? (matModalType === 'qualified' ? '#059669' : '#dc2626') : '#64748b',
                                        boxShadow: matViewMode === 'file' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                        transition: 'all 0.2s',
                                    }}
                                >
                                    📁 File View
                                </button>
                                <button
                                    onClick={() => setMatViewMode('table')}
                                    style={{
                                        padding: '8px 16px',
                                        border: 'none',
                                        borderRadius: '6px',
                                        fontSize: '0.85rem',
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                        background: matViewMode === 'table' ? 'white' : 'transparent',
                                        color: matViewMode === 'table' ? (matModalType === 'qualified' ? '#059669' : '#dc2626') : '#64748b',
                                        boxShadow: matViewMode === 'table' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                        transition: 'all 0.2s',
                                    }}
                                >
                                    📊 All Materials
                                </button>
                            </div>
                        </div>

                        {/* Content */}
                        <div style={{ flex: 1, overflow: 'auto', padding: '20px 28px' }}>
                            {isMatModalLoading && (
                                <div style={{ textAlign: 'center', padding: '60px', color: '#64748b' }}>
                                    <div style={{ fontSize: '2rem', marginBottom: '16px' }}>⏳</div>
                                    Loading material qualification data...
                                </div>
                            )}

                            {matModalError && (
                                <div style={{
                                    textAlign: 'center',
                                    padding: '40px',
                                    color: '#dc2626',
                                    background: '#fef2f2',
                                    borderRadius: '12px',
                                    border: '1px solid #fecaca',
                                }}>
                                    ❌ {matModalError}
                                </div>
                            )}

                            {!isMatModalLoading && !matModalError && matModalData.length > 0 && matViewMode === 'table' && (() => {
                                // Table view with sorting
                                const sortedData = [...matModalData].sort((a: any, b: any) => {
                                    const aVal = a[matSortColumn] || '';
                                    const bVal = b[matSortColumn] || '';
                                    const comparison = String(aVal).localeCompare(String(bVal));
                                    return matSortDirection === 'asc' ? comparison : -comparison;
                                });

                                const handleSort = (column: string) => {
                                    if (matSortColumn === column) {
                                        setMatSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
                                    } else {
                                        setMatSortColumn(column);
                                        setMatSortDirection('asc');
                                    }
                                };

                                const sortIcon = (col: string) => matSortColumn === col ? (matSortDirection === 'asc' ? ' ▲' : ' ▼') : ' ⇅';
                                const thStyle: React.CSSProperties = {
                                    padding: '12px',
                                    textAlign: 'left',
                                    fontWeight: 600,
                                    borderBottom: '2px solid #e2e8f0',
                                    cursor: 'pointer',
                                    whiteSpace: 'nowrap',
                                    background: '#f8fafc',
                                };

                                return (
                                    <div style={{ overflowX: 'auto' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', minWidth: '800px' }}>
                                            <thead>
                                                <tr>
                                                    <th style={thStyle} onClick={() => handleSort('arNo')}>
                                                        AR Number{sortIcon('arNo')}
                                                    </th>
                                                    <th style={thStyle} onClick={() => handleSort('materialCode')}>
                                                        Material Code{sortIcon('materialCode')}
                                                    </th>
                                                    <th style={thStyle} onClick={() => handleSort('materialName')}>
                                                        Material Name{sortIcon('materialName')}
                                                    </th>
                                                    {matModalType === 'qualified' && (
                                                        <>
                                                            <th style={thStyle} onClick={() => handleSort('testDate')}>
                                                                Test Date{sortIcon('testDate')}
                                                            </th>
                                                            <th style={thStyle} onClick={() => handleSort('status')}>
                                                                Status{sortIcon('status')}
                                                            </th>
                                                        </>
                                                    )}
                                                    {matModalType === 'unqualified' && (
                                                        <th style={thStyle} onClick={() => handleSort('formulaMfc')}>
                                                            Formula MFC{sortIcon('formulaMfc')}
                                                        </th>
                                                    )}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {sortedData.slice(0, 500).map((m: any, idx: number) => (
                                                    <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                                        <td style={{
                                                            padding: '12px',
                                                            fontFamily: 'monospace',
                                                            fontWeight: 600,
                                                            color: m.arNo === 'Missing RM COA' ? '#dc2626' : '#059669',
                                                        }}>
                                                            {m.arNo}
                                                        </td>
                                                        <td style={{ padding: '12px', fontFamily: 'monospace', color: '#374151' }}>
                                                            {m.materialCode}
                                                        </td>
                                                        <td style={{ padding: '12px', color: '#374151' }}>
                                                            {m.materialName}
                                                        </td>
                                                        {matModalType === 'qualified' && (
                                                            <>
                                                                <td style={{ padding: '12px', color: '#64748b' }}>
                                                                    {m.testDate}
                                                                </td>
                                                                <td style={{ padding: '12px' }}>
                                                                    <span style={{
                                                                        padding: '4px 10px',
                                                                        background: m.status === 'APPROVED' ? '#dcfce7' : '#fef3c7',
                                                                        color: m.status === 'APPROVED' ? '#166534' : '#92400e',
                                                                        borderRadius: '6px',
                                                                        fontSize: '0.75rem',
                                                                        fontWeight: 600,
                                                                    }}>
                                                                        {m.status}
                                                                    </span>
                                                                </td>
                                                            </>
                                                        )}
                                                        {matModalType === 'unqualified' && (
                                                            <td style={{ padding: '12px', fontFamily: 'monospace', color: '#64748b' }}>
                                                                {m.formulaMfc}
                                                            </td>
                                                        )}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                        {sortedData.length > 500 && (
                                            <div style={{ textAlign: 'center', padding: '12px', color: '#64748b', fontSize: '0.85rem', borderTop: '1px solid #e2e8f0' }}>
                                                Showing first 500 of {sortedData.length} materials
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}

                            {!isMatModalLoading && !matModalError && matModalData.length > 0 && matViewMode === 'file' && (() => {
                                // Group by AR Number
                                const groupedByArNo: Record<string, any[]> = {};
                                matModalData.forEach((m: any) => {
                                    const arNo = m.arNo || 'N/A';
                                    if (!groupedByArNo[arNo]) {
                                        groupedByArNo[arNo] = [];
                                    }
                                    groupedByArNo[arNo].push(m);
                                });

                                // Sort AR numbers
                                const arNumbers = Object.keys(groupedByArNo).sort((a, b) => {
                                    if (matSortDirection === 'asc') {
                                        return a.localeCompare(b);
                                    }
                                    return b.localeCompare(a);
                                });

                                return (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                        {arNumbers.map((arNo, arIdx) => {
                                            const materials = groupedByArNo[arNo];
                                            const isExpanded = expandedMatArNumbers.has(arNo);

                                            return (
                                                <div
                                                    key={arNo}
                                                    style={{
                                                        border: '1px solid #e2e8f0',
                                                        borderRadius: '12px',
                                                        overflow: 'hidden',
                                                        background: 'white',
                                                    }}
                                                >
                                                    {/* AR Number Header */}
                                                    <div
                                                        role="button"
                                                        tabIndex={0}
                                                        onClick={() => {
                                                            setExpandedMatArNumbers(prev => {
                                                                const next = new Set(prev);
                                                                if (next.has(arNo)) {
                                                                    next.delete(arNo);
                                                                } else {
                                                                    next.add(arNo);
                                                                }
                                                                return next;
                                                            });
                                                        }}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter' || e.key === ' ') {
                                                                e.preventDefault();
                                                                setExpandedMatArNumbers(prev => {
                                                                    const next = new Set(prev);
                                                                    if (next.has(arNo)) {
                                                                        next.delete(arNo);
                                                                    } else {
                                                                        next.add(arNo);
                                                                    }
                                                                    return next;
                                                                });
                                                            }
                                                        }}
                                                        style={{
                                                            padding: '16px 20px',
                                                            background: arNo === 'Missing RM COA'
                                                                ? 'linear-gradient(to right, #fef2f2, #fee2e2)'
                                                                : 'linear-gradient(to right, #ecfdf5, #d1fae5)',
                                                            borderBottom: isExpanded ? '1px solid #e2e8f0' : 'none',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'space-between',
                                                            cursor: 'pointer',
                                                        }}
                                                    >
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                                            <div style={{
                                                                fontSize: '0.9rem',
                                                                color: '#64748b',
                                                                fontWeight: 600,
                                                                minWidth: '24px',
                                                            }}>
                                                                {arIdx + 1}.
                                                            </div>
                                                            <div style={{
                                                                width: '32px',
                                                                height: '32px',
                                                                borderRadius: '8px',
                                                                background: arNo === 'Missing RM COA' ? '#dc2626' : '#059669',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                color: 'white',
                                                                fontWeight: 700,
                                                                fontSize: '0.9rem',
                                                                transform: isExpanded ? 'rotate(90deg)' : 'none',
                                                                transition: 'transform 0.2s ease',
                                                            }}>
                                                                ▶
                                                            </div>
                                                            <div>
                                                                <div style={{
                                                                    fontSize: '1.25rem',
                                                                    fontWeight: 700,
                                                                    color: arNo === 'Missing RM COA' ? '#dc2626' : '#059669',
                                                                    fontFamily: 'monospace',
                                                                }}>
                                                                    {arNo}
                                                                </div>
                                                                <div style={{
                                                                    fontSize: '0.85rem',
                                                                    color: '#64748b',
                                                                    marginTop: '2px',
                                                                }}>
                                                                    {materials.length} materials
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div style={{
                                                            padding: '8px 16px',
                                                            background: arNo === 'Missing RM COA' ? '#dc2626' : '#059669',
                                                            color: 'white',
                                                            borderRadius: '8px',
                                                            fontWeight: 600,
                                                            fontSize: '0.9rem',
                                                        }}>
                                                            {materials.length} items
                                                        </div>
                                                    </div>

                                                    {/* Expanded Content */}
                                                    {isExpanded && (
                                                        <div style={{ padding: '16px' }}>
                                                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                                                <thead>
                                                                    <tr style={{ background: '#f8fafc' }}>
                                                                        <th style={{ padding: '10px', textAlign: 'left', fontWeight: 600, borderBottom: '2px solid #e2e8f0' }}>Material Code</th>
                                                                        <th style={{ padding: '10px', textAlign: 'left', fontWeight: 600, borderBottom: '2px solid #e2e8f0' }}>Material Name</th>
                                                                        {matModalType === 'qualified' && (
                                                                            <th style={{ padding: '10px', textAlign: 'left', fontWeight: 600, borderBottom: '2px solid #e2e8f0' }}>Status</th>
                                                                        )}
                                                                        {matModalType === 'unqualified' && (
                                                                            <th style={{ padding: '10px', textAlign: 'left', fontWeight: 600, borderBottom: '2px solid #e2e8f0' }}>Formula</th>
                                                                        )}
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {materials.slice(0, 100).map((m: any, idx: number) => (
                                                                        <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                                                            <td style={{ padding: '10px', fontFamily: 'monospace', color: '#374151' }}>{m.materialCode}</td>
                                                                            <td style={{ padding: '10px', color: '#374151' }}>{m.materialName}</td>
                                                                            {matModalType === 'qualified' && (
                                                                                <td style={{ padding: '10px' }}>
                                                                                    <span style={{
                                                                                        padding: '2px 8px',
                                                                                        background: '#dcfce7',
                                                                                        color: '#166534',
                                                                                        borderRadius: '4px',
                                                                                        fontSize: '0.75rem',
                                                                                        fontWeight: 600,
                                                                                    }}>
                                                                                        {m.status || 'Available'}
                                                                                    </span>
                                                                                </td>
                                                                            )}
                                                                            {matModalType === 'unqualified' && (
                                                                                <td style={{ padding: '10px', fontFamily: 'monospace', color: '#64748b' }}>{m.formulaMfc || 'N/A'}</td>
                                                                            )}
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                            {materials.length > 100 && (
                                                                <div style={{ textAlign: 'center', padding: '12px', color: '#64748b', fontSize: '0.85rem', borderTop: '1px solid #e2e8f0' }}>
                                                                    Showing first 100 of {materials.length} materials
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                );
                            })()}

                            {!isMatModalLoading && !matModalError && matModalData.length === 0 && (
                                <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                                    {matModalType === 'qualified'
                                        ? 'No RM COA data found. Upload RM COA XML files to populate this view.'
                                        : 'All formula materials have RM COA data available.'}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {showBulkCoaModal && (
                <div
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(0, 0, 0, 0.6)',
                        backdropFilter: 'blur(4px)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 1000,
                        padding: '20px',
                    }}
                    onClick={closeBulkCoaModal}
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            background: 'white',
                            borderRadius: '16px',
                            boxShadow: '0 25px 50px rgba(0, 0, 0, 0.25)',
                            width: '100%',
                            maxWidth: '1200px',
                            maxHeight: '90vh',
                            display: 'flex',
                            flexDirection: 'column',
                            overflow: 'hidden',
                        }}
                    >
                        {/* Header */}
                        <div style={{
                            padding: '24px 28px',
                            borderBottom: '1px solid #e2e8f0',
                            background: bulkCoaModalType === 'matched' ? 'linear-gradient(to right, #ecfdf5, #f0fdf4)' : 'linear-gradient(to right, #fef2f2, #fff1f1)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                <div style={{
                                    width: '48px',
                                    height: '48px',
                                    borderRadius: '12px',
                                    background: bulkCoaModalType === 'matched'
                                        ? 'linear-gradient(135deg, #10b981, #059669)'
                                        : 'linear-gradient(135deg, #ef4444, #dc2626)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: 'white',
                                    fontSize: '24px',
                                }}>
                                    {bulkCoaModalType === 'matched' ? '✓' : '✗'}
                                </div>
                                <div>
                                    <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                                        Bulk COA - {bulkCoaModalType === 'matched' ? 'With COA Data' : 'Missing COA Data'}
                                    </h2>
                                    <p style={{ fontSize: '0.9rem', color: '#64748b', margin: '4px 0 0 0' }}>
                                        {bulkCoaModalType === 'matched'
                                            ? 'Batches with Bulk stage COA available'
                                            : 'Product batches missing Bulk COA record'}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={closeBulkCoaModal}
                                style={{
                                    width: '40px',
                                    height: '40px',
                                    borderRadius: '10px',
                                    border: 'none',
                                    background: '#f1f5f9',
                                    color: '#64748b',
                                    fontSize: '20px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                }}
                            >
                                ×
                            </button>
                        </div>

                        {/* Stats Bar */}
                        <div style={{
                            padding: '16px 28px',
                            background: '#f8fafc',
                            borderBottom: '1px solid #e2e8f0',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: '16px',
                        }}>
                            <div style={{ display: 'flex', gap: '24px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{
                                        padding: '6px 14px',
                                        background: bulkCoaModalType === 'matched' ? '#059669' : '#dc2626',
                                        color: 'white',
                                        borderRadius: '8px',
                                        fontWeight: 700,
                                        fontSize: '0.9rem'
                                    }}>
                                        {bulkCoaModalData.length}
                                    </span>
                                    <span style={{ color: '#475569', fontWeight: 600, fontSize: '0.9rem' }}>
                                        {bulkCoaModalType === 'matched' ? 'Matched Batches' : 'Missing Batches'}
                                    </span>
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button
                                    onClick={() => setBulkCoaViewMode('table')}
                                    style={{
                                        padding: '8px 16px',
                                        borderRadius: '8px',
                                        border: '1px solid #e2e8f0',
                                        background: bulkCoaViewMode === 'table' ? '#eff6ff' : 'white',
                                        color: bulkCoaViewMode === 'table' ? '#2563eb' : '#64748b',
                                        fontWeight: 600,
                                        fontSize: '0.85rem',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    Table View
                                </button>
                                <button
                                    onClick={() => setBulkCoaViewMode('file')}
                                    style={{
                                        padding: '8px 16px',
                                        borderRadius: '8px',
                                        border: '1px solid #e2e8f0',
                                        background: bulkCoaViewMode === 'file' ? '#eff6ff' : 'white',
                                        color: bulkCoaViewMode === 'file' ? '#2563eb' : '#64748b',
                                        fontWeight: 600,
                                        fontSize: '0.85rem',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    Grid View
                                </button>
                            </div>
                        </div>

                        {/* Content Area */}
                        <div style={{ flex: 1, overflowY: 'auto', padding: '28px', background: '#f8fafc' }}>
                            {isBulkCoaModalLoading ? (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '100px 0' }}>
                                    <div style={{ width: '40px', height: '40px', border: '3px solid #f3f3f3', borderTop: '3px solid #059669', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                                    <p style={{ marginTop: '16px', color: '#64748b', fontWeight: 500 }}>Fetching Bulk COA details...</p>
                                    <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
                                </div>
                            ) : bulkCoaModalError ? (
                                <div style={{ padding: '32px', textAlign: 'center' }}>
                                    <div style={{ fontSize: '3rem', marginBottom: '16px' }}>⚠️</div>
                                    <h3 style={{ color: '#b91c1c', marginBottom: '8px' }}>Failed to load data</h3>
                                    <p style={{ color: '#64748b' }}>{bulkCoaModalError}</p>
                                    <button
                                        onClick={() => openBulkCoaModal(bulkCoaModalType)}
                                        style={{ marginTop: '16px', padding: '8px 20px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
                                    >
                                        Try Again
                                    </button>
                                </div>
                            ) : bulkCoaViewMode === 'table' ? (
                                <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                        <thead>
                                            <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                                <th style={{ padding: '16px 20px', fontWeight: 700, fontSize: '0.8rem', color: '#475569', textTransform: 'uppercase' }}>Batch No</th>
                                                <th style={{ padding: '16px 20px', fontWeight: 700, fontSize: '0.8rem', color: '#475569', textTransform: 'uppercase' }}>AR Number</th>
                                                <th style={{ padding: '16px 20px', fontWeight: 700, fontSize: '0.8rem', color: '#475569', textTransform: 'uppercase' }}>Product Code</th>
                                                <th style={{ padding: '16px 20px', fontWeight: 700, fontSize: '0.8rem', color: '#475569', textTransform: 'uppercase' }}>Product Name</th>
                                                <th style={{ padding: '16px 20px', fontWeight: 700, fontSize: '0.8rem', color: '#475569', textTransform: 'uppercase' }}>Status</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {bulkCoaModalData.map((item, idx) => (
                                                <tr key={idx} style={{
                                                    borderBottom: '1px solid #f1f5f9',
                                                    background: idx % 2 === 0 ? 'white' : '#fafafa'
                                                }}>
                                                    <td style={{ padding: '16px 20px' }}>
                                                        <div style={{ fontFamily: 'monospace', fontWeight: 800, color: bulkCoaModalType === 'matched' ? '#059669' : '#dc2626', fontSize: '1rem' }}>{item.batchNumber}</div>
                                                    </td>
                                                    <td style={{ padding: '16px 20px' }}>
                                                        <div style={{
                                                            fontWeight: 700,
                                                            color: bulkCoaModalType === 'matched' ? '#0f172a' : '#ef4444',
                                                            background: bulkCoaModalType === 'matched' ? '#ecfdf5' : '#fef2f2',
                                                            padding: '4px 10px',
                                                            borderRadius: '6px',
                                                            display: 'inline-block'
                                                        }}>
                                                            {item.arNumber}
                                                        </div>
                                                    </td>
                                                    <td style={{ padding: '16px 20px', color: '#475569', fontFamily: 'monospace', fontSize: '0.85rem' }}>{item.productCode}</td>
                                                    <td style={{ padding: '16px 20px', color: '#1e293b', fontWeight: 500, fontSize: '0.9rem' }}>{item.productName}</td>
                                                    <td style={{ padding: '16px 20px' }}>
                                                        <span style={{
                                                            padding: '4px 12px',
                                                            borderRadius: '20px',
                                                            fontSize: '0.75rem',
                                                            fontWeight: 700,
                                                            background: bulkCoaModalType === 'matched' ? '#dcfce7' : '#fee2e2',
                                                            color: bulkCoaModalType === 'matched' ? '#166534' : '#991b1b',
                                                            border: `1px solid ${bulkCoaModalType === 'matched' ? '#bbf7d0' : '#fecaca'}`
                                                        }}>
                                                            {item.status}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
                                    {bulkCoaModalData.map((item, idx) => (
                                        <div key={idx} style={{
                                            background: 'white',
                                            borderRadius: '16px',
                                            border: '1px solid #e2e8f0',
                                            padding: '24px',
                                            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '16px',
                                            transition: 'transform 0.2s, box-shadow 0.2s',
                                        }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                <div>
                                                    <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>Batch Number</div>
                                                    <div style={{ fontSize: '1.4rem', fontWeight: 900, fontFamily: 'monospace', color: bulkCoaModalType === 'matched' ? '#059669' : '#dc2626' }}>{item.batchNumber}</div>
                                                </div>
                                                <div style={{
                                                    width: '32px',
                                                    height: '32px',
                                                    borderRadius: '50%',
                                                    background: bulkCoaModalType === 'matched' ? '#dcfce7' : '#fee2e2',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    color: bulkCoaModalType === 'matched' ? '#059669' : '#dc2626'
                                                }}>
                                                    {bulkCoaModalType === 'matched' ? '✓' : '✗'}
                                                </div>
                                            </div>

                                            <div style={{
                                                padding: '16px',
                                                background: bulkCoaModalType === 'matched' ? '#f0fdf4' : '#fff1f1',
                                                borderRadius: '12px',
                                                border: `1px solid ${bulkCoaModalType === 'matched' ? '#dcfce7' : '#fee2e2'}`
                                            }}>
                                                <div style={{ fontSize: '0.7rem', color: bulkCoaModalType === 'matched' ? '#059669' : '#dc2626', fontWeight: 700, marginBottom: '4px' }}>
                                                    {bulkCoaModalType === 'matched' ? '✅ AVAILABLE AR NUMBER' : '⚠️ MISSING AR NUMBER'}
                                                </div>
                                                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: bulkCoaModalType === 'matched' ? '#065f46' : '#991b1b' }}>
                                                    {item.arNumber}
                                                </div>
                                            </div>

                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                    <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Product Code:</span>
                                                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#1e293b', fontFamily: 'monospace' }}>{item.productCode}</span>
                                                </div>
                                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                    <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Product Name:</span>
                                                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#1e293b', marginTop: '2px' }}>{item.productName}</span>
                                                </div>
                                                {bulkCoaModalType === 'matched' && (
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #f1f5f9', paddingTop: '8px', marginTop: '4px' }}>
                                                        <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Test Date:</span>
                                                        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#1e293b' }}>{item.testDate}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {!isBulkCoaModalLoading && !bulkCoaModalError && bulkCoaModalData.length === 0 && (
                                <div style={{ textAlign: 'center', padding: '100px 0', color: '#94a3b8' }}>
                                    <div style={{ fontSize: '4rem', marginBottom: '24px' }}>
                                        {bulkCoaModalType === 'matched' ? '🔍' : '✨'}
                                    </div>
                                    <h3 style={{ fontSize: '1.3rem', color: '#475569', marginBottom: '8px' }}>
                                        {bulkCoaModalType === 'matched' ? 'No records' : 'All clear!'}
                                    </h3>
                                    <p style={{ maxWidth: '400px', margin: '0 auto' }}>
                                        {bulkCoaModalType === 'matched'
                                            ? 'No batches with Bulk COA data were found matching the filter criteria.'
                                            : 'No batches are currently missing Bulk COA records in the system.'}
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div style={{ padding: '16px 28px', borderTop: '1px solid #e2e8f0', background: 'white', textAlign: 'right' }}>
                            <button
                                onClick={closeBulkCoaModal}
                                style={{
                                    padding: '10px 24px',
                                    borderRadius: '10px',
                                    background: '#0f172a',
                                    color: 'white',
                                    fontWeight: 600,
                                    border: 'none',
                                    cursor: 'pointer'
                                }}
                            >
                                Close Modal
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
