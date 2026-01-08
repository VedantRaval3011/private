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
}

interface FormulaListResponse {
    success: boolean;
    data: FormulaRecord[];
    total: number;
    page: number;
    limit: number;
    batchCounts?: Record<string, number>;
    unmatchedBatches?: Array<{ itemCode: string; count: number }>;
    // Global RM data matching for section headers (capsule indicator)
    globalRmDataMatched?: number;
    globalRmDataUnmatched?: number;
    totalRmBatchesInSystem?: number;
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
    onGreenClick?: () => void;
    onRedClick?: () => void;
    size?: 'small' | 'medium' | 'large';
}

function BatchStatusCapsule({ matched, unmatched, onGreenClick, onRedClick, size = 'medium' }: BatchStatusCapsuleProps) {
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
            title={`RM (Raw Materials) Requisition Data: ${matched} found, ${unmatched} missing`}
        >
            {/* RM Label */}
            <span style={{
                fontSize: size === 'small' ? '9px' : '10px',
                fontWeight: 700,
                color: '#6b7280',
                background: '#f3f4f6',
                padding: size === 'small' ? '2px 5px' : '3px 6px',
                borderRadius: '4px',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
            }}>
                RM
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
                            background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
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
                        title={`${matched} batches with RM requisition data - Click to view`}
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
                        title={`${unmatched} batches without RM requisition data - Click to view`}
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

    // RM Data Modal State (for viewing RM requisition details)
    const [showRmDataModal, setShowRmDataModal] = useState(false);
    const [rmModalType, setRmModalType] = useState<'matched' | 'unmatched'>('matched');
    const [rmModalData, setRmModalData] = useState<any[]>([]);
    const [isRmModalLoading, setIsRmModalLoading] = useState(false);
    const [rmModalError, setRmModalError] = useState<string | null>(null);
    const [expandedRmBatches, setExpandedRmBatches] = useState<Set<string>>(new Set());

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
    const [hideZeroBatches, setHideZeroBatches] = useState(false);

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
            }
        } catch (error) {
            console.error('Error fetching formulas:', error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    // Fetch batch reconciliation summary
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
    }, [fetchFormulas, fetchBatchReconciliation]);

    // Open RM Data Modal - fetch and display RM requisition data
    // Green (matched): Show RM materials from requisition
    // Red (unmatched): Show batches that are missing RM requisition data
    const openRmDataModal = useCallback(async (type: 'matched' | 'unmatched') => {
        setShowRmDataModal(true);
        setRmModalType(type);
        setIsRmModalLoading(true);
        setRmModalError(null);
        setRmModalData([]);

        try {
            if (type === 'matched') {
                // Green: Fetch RM materials from requisition API
                const response = await fetch('/api/requisition/materials?type=RM');
                const data = await response.json();

                if (data.success && data.materials) {
                    setRmModalData(data.materials);
                } else {
                    setRmModalError(data.message || 'Failed to fetch RM materials');
                }
            } else {
                // Red (unmatched): Fetch batches that are missing RM requisition data
                // First get all batches from the batch registry
                const batchResponse = await fetch('/api/batch?page=1&limit=10000');
                const batchData = await batchResponse.json();

                // Then get all batch numbers that have RM requisition data
                const rmResponse = await fetch('/api/requisition/materials?type=RM');
                const rmData = await rmResponse.json();

                if (batchData.success && batchData.data) {
                    // Get set of batch numbers that have RM data
                    const batchesWithRm = new Set<string>();
                    if (rmData.success && rmData.materials) {
                        rmData.materials.forEach((m: any) => {
                            if (m.batchNumber) batchesWithRm.add(m.batchNumber);
                        });
                    }

                    // Find batches that DON'T have RM requisition data
                    const unmatchedBatches: any[] = [];
                    batchData.data.forEach((record: any) => {
                        record.batches?.forEach((batch: any) => {
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
    }, []);

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

    const toggleMfc = (mfcId: string) => {
        setExpandedMfc(expandedMfc === mfcId ? null : mfcId);
    };

    // Collapsible section header component with light colors
    const CollapsibleSectionHeader = ({
        title,
        count,
        totalBatches,
        icon,
        isOpen,
        onToggle,
        badgeColor,
        badgeText,
        description,
        rmDataMatched,
        rmDataUnmatched,
        onRmMatchedClick,
        onRmUnmatchedClick
    }: {
        title: string;
        count: number;
        totalBatches?: number;
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
                        {/* Total Batches Display */}
                        {totalBatches !== undefined && (
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
                        )}
                        {/* RM Data Status Capsule */}
                        {(rmDataMatched !== undefined || rmDataUnmatched !== undefined) && (
                            <BatchStatusCapsule
                                matched={rmDataMatched || 0}
                                unmatched={rmDataUnmatched || 0}
                                onGreenClick={onRmMatchedClick}
                                onRedClick={onRmUnmatchedClick}
                                size="medium"
                            />
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
        const groupedBatches = batchList ? groupBatchesByItemCode(batchList) : new Map();
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
                width: '90%',
                maxWidth: '900px',
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
                                /* Matched: Show table of RM materials */
                                <div style={{
                                    background: '#f9fafb',
                                    borderRadius: '12px',
                                    border: '1px solid #e5e7eb',
                                    overflow: 'hidden',
                                }}>
                                    {/* Table Header */}
                                    <div style={{
                                        display: 'grid',
                                        gridTemplateColumns: '100px 1fr 80px 90px 100px',
                                        gap: '8px',
                                        padding: '12px 16px',
                                        background: '#f3f4f6',
                                        fontWeight: 600,
                                        fontSize: '0.75rem',
                                        color: '#4b5563',
                                        borderBottom: '1px solid #e5e7eb',
                                    }}>
                                        <div>Batch No</div>
                                        <div>Material Name</div>
                                        <div>Code</div>
                                        <div>Qty</div>
                                        <div>MFC No</div>
                                    </div>
                                    {/* Table Body */}
                                    <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                                        {rmModalData.slice(0, 100).map((item: any, idx: number) => (
                                            <div
                                                key={idx}
                                                style={{
                                                    display: 'grid',
                                                    gridTemplateColumns: '100px 1fr 80px 90px 100px',
                                                    gap: '8px',
                                                    padding: '10px 16px',
                                                    borderBottom: '1px solid #f3f4f6',
                                                    fontSize: '0.8rem',
                                                    background: idx % 2 === 0 ? 'white' : '#fafafa',
                                                }}
                                            >
                                                <div style={{ fontFamily: 'monospace', fontWeight: 600, color: '#059669' }}>
                                                    {item.batchNumber || 'N/A'}
                                                </div>
                                                <div style={{ color: '#374151', fontWeight: 500 }}>
                                                    {item.materialName || 'N/A'}
                                                </div>
                                                <div style={{ fontFamily: 'monospace', fontSize: '0.7rem', color: '#6b7280' }}>
                                                    {item.materialCode || 'N/A'}
                                                </div>
                                                <div style={{ color: '#7c3aed', fontWeight: 600 }}>
                                                    {item.quantityRequired || 0} {item.unit || ''}
                                                </div>
                                                <div style={{ fontFamily: 'monospace', fontSize: '0.7rem', color: '#f97316' }}>
                                                    {item.mfcNo || 'N/A'}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    {rmModalData.length > 100 && (
                                        <div style={{
                                            padding: '12px 16px',
                                            textAlign: 'center',
                                            background: '#f3f4f6',
                                            color: '#6b7280',
                                            fontSize: '0.8rem',
                                        }}>
                                            Showing first 100 of {rmModalData.length} materials
                                        </div>
                                    )}
                                </div>
                            ) : (
                                /* Unmatched: Show file-like grouped structure by batch number */
                                <div style={{
                                    background: '#f9fafb',
                                    borderRadius: '12px',
                                    border: '1px solid #e5e7eb',
                                    overflow: 'hidden',
                                    maxHeight: '500px',
                                    overflowY: 'auto',
                                }}>
                                    {(() => {
                                        // Group items by batch number
                                        const groupedByBatch = new Map<string, any[]>();
                                        rmModalData.forEach((item: any) => {
                                            const bn = item.batchNumber || 'Unknown';
                                            if (!groupedByBatch.has(bn)) {
                                                groupedByBatch.set(bn, []);
                                            }
                                            groupedByBatch.get(bn)!.push(item);
                                        });

                                        return Array.from(groupedByBatch.entries()).map(([batchNumber, items], groupIdx) => {
                                            const isExpanded = expandedRmBatches.has(batchNumber);
                                            return (
                                                <div key={batchNumber} style={{
                                                    borderBottom: groupIdx < groupedByBatch.size - 1 ? '1px solid #e5e7eb' : 'none',
                                                }}>
                                                    {/* Batch Header (Collapsible) */}
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
                                                        {/* Expand Icon */}
                                                        <div style={{
                                                            width: '22px',
                                                            height: '22px',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            borderRadius: '5px',
                                                            background: isExpanded ? '#dc2626' : '#e5e7eb',
                                                            color: isExpanded ? 'white' : '#6b7280',
                                                            transition: 'all 0.2s ease',
                                                            transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                                                            fontSize: '0.7rem',
                                                            fontWeight: 700,
                                                            flexShrink: 0,
                                                        }}>
                                                            ▶
                                                        </div>
                                                        {/* Index Number */}
                                                        <div style={{
                                                            fontSize: '0.8rem',
                                                            fontWeight: 600,
                                                            color: '#9ca3af',
                                                            minWidth: '28px',
                                                        }}>
                                                            #{groupIdx + 1}
                                                        </div>
                                                        {/* Batch Number */}
                                                        <div style={{
                                                            fontFamily: 'monospace',
                                                            fontSize: '0.95rem',
                                                            fontWeight: 700,
                                                            color: '#dc2626',
                                                        }}>
                                                            📁 {batchNumber}
                                                        </div>
                                                        {/* Items Count */}
                                                        <div style={{
                                                            fontSize: '0.75rem',
                                                            color: '#6b7280',
                                                            background: '#f3f4f6',
                                                            padding: '2px 8px',
                                                            borderRadius: '10px',
                                                        }}>
                                                            {items.length} item{items.length !== 1 ? 's' : ''}
                                                        </div>
                                                        {/* First item preview */}
                                                        {!isExpanded && items[0] && (
                                                            <div style={{
                                                                flex: 1,
                                                                fontSize: '0.8rem',
                                                                color: '#6b7280',
                                                                overflow: 'hidden',
                                                                textOverflow: 'ellipsis',
                                                                whiteSpace: 'nowrap',
                                                            }}>
                                                                {items[0].itemName || 'N/A'}
                                                            </div>
                                                        )}
                                                    </button>

                                                    {/* Expanded Items */}
                                                    {isExpanded && (
                                                        <div style={{
                                                            background: '#fafafa',
                                                            padding: '8px 16px 12px 50px',
                                                        }}>
                                                            {items.map((item: any, itemIdx: number) => (
                                                                <div
                                                                    key={itemIdx}
                                                                    style={{
                                                                        display: 'grid',
                                                                        gridTemplateColumns: '28px 100px 1fr 80px 80px',
                                                                        gap: '10px',
                                                                        padding: '10px 12px',
                                                                        background: itemIdx % 2 === 0 ? 'white' : '#f9fafb',
                                                                        borderRadius: '8px',
                                                                        marginBottom: itemIdx < items.length - 1 ? '6px' : 0,
                                                                        border: '1px solid #f3f4f6',
                                                                        fontSize: '0.8rem',
                                                                    }}
                                                                >
                                                                    {/* Item Index */}
                                                                    <div style={{
                                                                        fontSize: '0.7rem',
                                                                        fontWeight: 600,
                                                                        color: '#9ca3af',
                                                                        minWidth: '20px',
                                                                    }}>
                                                                        {itemIdx + 1}.
                                                                    </div>
                                                                    <div style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#6b7280' }}>
                                                                        {item.itemCode || 'N/A'}
                                                                    </div>
                                                                    <div style={{ color: '#374151', fontWeight: 500 }}>
                                                                        {item.itemName || 'N/A'}
                                                                    </div>
                                                                    <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                                                                        {item.mfgDate || 'N/A'}
                                                                    </div>
                                                                    <div style={{ color: '#7c3aed', fontWeight: 600 }}>
                                                                        {item.batchSize || 'N/A'}
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        });
                                    })()}
                                </div>
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

                    {/* Revision */}
                    <div style={{
                        padding: '0.35rem 0.75rem',
                        borderRadius: '10px',
                        background: 'linear-gradient(135deg, rgba(253, 244, 255, 0.85) 0%, rgba(243, 232, 255, 0.75) 100%)',
                        backdropFilter: 'blur(6px)',
                        color: '#a855f7',
                        fontSize: '0.72rem',
                        fontWeight: '600',
                        border: '1px solid rgba(243, 232, 255, 0.7)',
                        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.5)',
                    }}>
                        REV {formula.masterFormulaDetails.revisionNo || '0'}
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
                        {/* BATCH RECONCILIATION SUMMARY - Enhanced with vibrant colors & glass effect */}
                        {batchReconciliation && (
                            <div style={{
                                marginBottom: '2rem',
                                background: 'linear-gradient(135deg, rgba(240, 249, 255, 0.85) 0%, rgba(250, 245, 255, 0.8) 50%, rgba(245, 243, 255, 0.85) 100%)',
                                backdropFilter: 'blur(12px)',
                                WebkitBackdropFilter: 'blur(12px)',
                                borderRadius: '22px',
                                border: '1px solid rgba(255,255,255,0.7)',
                                padding: '24px 28px',
                                position: 'relative',
                                overflow: 'hidden',
                                boxShadow: '0 8px 32px rgba(99, 102, 241, 0.15), inset 0 1px 0 rgba(255,255,255,0.8)',
                            }}>
                                {/* Decorative background elements */}
                                <div style={{
                                    position: 'absolute',
                                    top: '-20%',
                                    right: '-5%',
                                    width: '200px',
                                    height: '200px',
                                    borderRadius: '50%',
                                    background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.1) 0%, rgba(59, 130, 246, 0.1) 100%)',
                                }} />
                                <div style={{
                                    position: 'absolute',
                                    bottom: '-30%',
                                    left: '10%',
                                    width: '150px',
                                    height: '150px',
                                    borderRadius: '50%',
                                    background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(6, 182, 212, 0.08) 100%)',
                                }} />

                                <div style={{
                                    position: 'absolute',
                                    top: '16px',
                                    right: '20px',
                                    background: batchReconciliation.allBatchesAccountedFor
                                        ? 'linear-gradient(135deg, #059669 0%, #10b981 100%)'
                                        : 'linear-gradient(135deg, #dc2626 0%, #ef4444 100%)',
                                    color: 'white',
                                    padding: '6px 16px',
                                    borderRadius: '24px',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    boxShadow: batchReconciliation.allBatchesAccountedFor
                                        ? '0 4px 12px rgba(16, 185, 129, 0.3)'
                                        : '0 4px 12px rgba(239, 68, 68, 0.3)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                }}>
                                    {batchReconciliation.allBatchesAccountedFor ? '✅ ALL BATCHES ACCOUNTED' : '❌ BATCHES MISSING'}
                                </div>

                                <h2 style={{
                                    color: '#1e293b',
                                    fontSize: '17px',
                                    fontWeight: 700,
                                    marginBottom: '20px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '10px',
                                    position: 'relative',
                                    zIndex: 1,
                                }}>
                                    <span style={{
                                        width: '36px',
                                        height: '36px',
                                        background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                                        borderRadius: '10px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '18px',
                                    }}>📊</span>
                                    Batch Reconciliation Summary
                                </h2>

                                {/* Main Stats Cards */}
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'stretch',
                                    justifyContent: 'center',
                                    gap: '16px',
                                    flexWrap: 'wrap',
                                    position: 'relative',
                                    zIndex: 1,
                                }}>
                                    {/* Total Batches Card */}
                                    <Link href="/batches" style={{
                                        flex: '1',
                                        minWidth: '160px',
                                        background: 'linear-gradient(135deg, rgba(124, 58, 237, 0.85) 0%, rgba(139, 92, 246, 0.9) 100%)',
                                        backdropFilter: 'blur(8px)',
                                        WebkitBackdropFilter: 'blur(8px)',
                                        borderRadius: '18px',
                                        padding: '22px 26px',
                                        textAlign: 'center',
                                        boxShadow: '0 8px 32px rgba(139, 92, 246, 0.35), inset 0 1px 1px rgba(255,255,255,0.2)',
                                        border: '1px solid rgba(255,255,255,0.2)',
                                        color: 'white',
                                        position: 'relative',
                                        overflow: 'hidden',
                                        textDecoration: 'none',
                                        cursor: 'pointer',
                                        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                                    }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.transform = 'translateY(-2px)';
                                            e.currentTarget.style.boxShadow = '0 12px 40px rgba(139, 92, 246, 0.45), inset 0 1px 1px rgba(255,255,255,0.2)';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.transform = 'translateY(0)';
                                            e.currentTarget.style.boxShadow = '0 8px 32px rgba(139, 92, 246, 0.35), inset 0 1px 1px rgba(255,255,255,0.2)';
                                        }}
                                    >
                                        <div style={{
                                            position: 'absolute',
                                            top: '-10px',
                                            right: '-10px',
                                            width: '50px',
                                            height: '50px',
                                            borderRadius: '50%',
                                            background: 'rgba(255,255,255,0.1)',
                                        }} />
                                        <div style={{ fontSize: '32px', fontWeight: 800, marginBottom: '4px' }}>
                                            {batchReconciliation.totalBatchesInSystem.toLocaleString()}
                                        </div>
                                        <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.9 }}>
                                            Total Batches
                                        </div>
                                        <div style={{ fontSize: '10px', opacity: 0.7, marginTop: '2px' }}>
                                            Click to view all →
                                        </div>
                                    </Link>

                                    {/* Equals Sign */}
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '28px',
                                        fontWeight: '300',
                                        color: '#94a3b8',
                                    }}>=</div>

                                    {/* Matched Batches Card */}
                                    <div style={{
                                        flex: '1',
                                        minWidth: '160px',
                                        background: 'linear-gradient(135deg, rgba(5, 150, 105, 0.85) 0%, rgba(16, 185, 129, 0.9) 100%)',
                                        backdropFilter: 'blur(8px)',
                                        WebkitBackdropFilter: 'blur(8px)',
                                        borderRadius: '18px',
                                        padding: '22px 26px',
                                        textAlign: 'center',
                                        boxShadow: '0 8px 32px rgba(16, 185, 129, 0.35), inset 0 1px 1px rgba(255,255,255,0.2)',
                                        border: '1px solid rgba(255,255,255,0.2)',
                                        color: 'white',
                                        position: 'relative',
                                        overflow: 'hidden',
                                    }}>
                                        <div style={{
                                            position: 'absolute',
                                            top: '-10px',
                                            right: '-10px',
                                            width: '50px',
                                            height: '50px',
                                            borderRadius: '50%',
                                            background: 'rgba(255,255,255,0.1)',
                                        }} />
                                        <div style={{ fontSize: '32px', fontWeight: 800, marginBottom: '4px' }}>
                                            {batchReconciliation.batchesMatchedToFormula.toLocaleString()}
                                        </div>
                                        <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.9 }}>
                                            Matched to Formula
                                        </div>
                                        <div style={{ fontSize: '10px', opacity: 0.7, marginTop: '2px' }}>
                                            Found in Master
                                        </div>
                                    </div>

                                    {/* Plus Sign */}
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '28px',
                                        fontWeight: '300',
                                        color: '#94a3b8',
                                    }}>+</div>

                                    {/* Orphan Batches Card */}
                                    <div style={{
                                        flex: '1',
                                        minWidth: '160px',
                                        background: batchReconciliation.batchesNotMatchedToFormula > 0
                                            ? 'linear-gradient(135deg, rgba(220, 38, 38, 0.85) 0%, rgba(239, 68, 68, 0.9) 100%)'
                                            : 'linear-gradient(135deg, rgba(5, 150, 105, 0.85) 0%, rgba(16, 185, 129, 0.9) 100%)',
                                        backdropFilter: 'blur(8px)',
                                        WebkitBackdropFilter: 'blur(8px)',
                                        borderRadius: '18px',
                                        padding: '22px 26px',
                                        textAlign: 'center',
                                        boxShadow: batchReconciliation.batchesNotMatchedToFormula > 0
                                            ? '0 8px 32px rgba(239, 68, 68, 0.35), inset 0 1px 1px rgba(255,255,255,0.2)'
                                            : '0 8px 32px rgba(16, 185, 129, 0.35), inset 0 1px 1px rgba(255,255,255,0.2)',
                                        border: '1px solid rgba(255,255,255,0.2)',
                                        color: 'white',
                                        position: 'relative',
                                        overflow: 'hidden',
                                    }}>
                                        <div style={{
                                            position: 'absolute',
                                            top: '-10px',
                                            right: '-10px',
                                            width: '50px',
                                            height: '50px',
                                            borderRadius: '50%',
                                            background: 'rgba(255,255,255,0.1)',
                                        }} />
                                        <div style={{ fontSize: '32px', fontWeight: 800, marginBottom: '4px' }}>
                                            {batchReconciliation.batchesNotMatchedToFormula.toLocaleString()}
                                        </div>
                                        <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.9 }}>
                                            Not Matched
                                        </div>
                                        <div style={{ fontSize: '10px', opacity: 0.7, marginTop: '2px' }}>
                                            Orphan Batches
                                        </div>
                                    </div>
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
                                icon="🧪"
                                isOpen={mainMfcsOpen}
                                onToggle={() => setMainMfcsOpen(!mainMfcsOpen)}
                                badgeColor="#10b981"
                                badgeText="Primary"
                                description="MFCs with significant production volume"
                                rmDataMatched={globalRmDataMatched}
                                rmDataUnmatched={globalRmDataUnmatched}
                                onRmMatchedClick={() => openRmDataModal('matched')}
                                onRmUnmatchedClick={() => openRmDataModal('unmatched')}
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
                                            <button
                                                onClick={() => toggleMfc(formula._id)}
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
                                                    {formula.totalBatchCount && formula.totalBatchCount > 0 && (
                                                        <span style={{
                                                            padding: '0.2rem 0.6rem',
                                                            background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                                                            color: '#fff',
                                                            borderRadius: '12px',
                                                            fontSize: '0.7rem',
                                                            fontWeight: '600',
                                                            boxShadow: '0 2px 4px rgba(16, 185, 129, 0.3)',
                                                            whiteSpace: 'nowrap',
                                                        }}>
                                                            📦 {formula.totalBatchCount} Batches
                                                        </span>
                                                    )}
                                                    {/* Per-formula RM Data Status Capsule */}
                                                    {(formula.rmDataMatched !== undefined || formula.rmDataUnmatched !== undefined) && (
                                                        <BatchStatusCapsule
                                                            matched={formula.rmDataMatched || 0}
                                                            unmatched={formula.rmDataUnmatched || 0}
                                                            size="small"
                                                        />
                                                    )}
                                                </div>

                                                {/* Product Code */}
                                                <div style={{
                                                    fontFamily: 'monospace',
                                                    fontSize: '0.8rem',
                                                    color: 'var(--muted-foreground)',
                                                    minWidth: '100px',
                                                }}>
                                                    {formula.masterFormulaDetails.productCode}
                                                    {batchCounts[formula.masterFormulaDetails.productCode] > 0 && (
                                                        <span style={{
                                                            marginLeft: '0.5rem',
                                                            background: '#10b981',
                                                            color: '#fff',
                                                            padding: '0.1rem 0.4rem',
                                                            borderRadius: '4px',
                                                            fontSize: '0.7em',
                                                            verticalAlign: 'middle'
                                                        }}>
                                                            {batchCounts[formula.masterFormulaDetails.productCode]}
                                                        </span>
                                                    )}
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

                                                {/* Material Count */}
                                                <div style={{
                                                    padding: '0.25rem 0.75rem',
                                                    borderRadius: 'var(--radius-sm)',
                                                    background: 'var(--muted)',
                                                    color: 'var(--muted-foreground)',
                                                    fontSize: '0.75rem',
                                                    fontWeight: '500',
                                                }}>
                                                    {materialCount} materials
                                                </div>

                                                {/* Revision */}
                                                <div style={{
                                                    fontSize: '0.75rem',
                                                    color: 'var(--muted-foreground)',
                                                }}>
                                                    REV {formula.masterFormulaDetails.revisionNo || '0'}
                                                </div>
                                            </button>

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
                                                                    <button
                                                                        onClick={() => openBatchListModal(
                                                                            getFormulaAllProductCodes(formula),
                                                                            formula.masterFormulaDetails.productName
                                                                        )}
                                                                        style={{
                                                                            padding: '0.375rem 0.75rem',
                                                                            background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                                                                            color: 'white',
                                                                            borderRadius: 'var(--radius-full)',
                                                                            fontSize: '0.875rem',
                                                                            fontWeight: '600',
                                                                            boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)',
                                                                            border: 'none',
                                                                            cursor: 'pointer',
                                                                            transition: 'all 0.15s ease',
                                                                            display: 'flex',
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
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>

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

                                                    {/* VIEW BATCH DETAILS BUTTON - Prominent CTA */}
                                                    {formula.totalBatchCount && formula.totalBatchCount > 0 && (
                                                        <div style={{
                                                            marginBottom: '1.25rem',
                                                            padding: '1rem 1.25rem',
                                                            background: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)',
                                                            borderRadius: 'var(--radius-lg)',
                                                            border: '2px solid #10b981',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'space-between',
                                                            gap: '1rem',
                                                            flexWrap: 'wrap',
                                                        }}>
                                                            <div>
                                                                <div style={{
                                                                    fontSize: '1rem',
                                                                    fontWeight: '700',
                                                                    color: '#059669',
                                                                    marginBottom: '4px'
                                                                }}>
                                                                    📦 {formula.totalBatchCount} Production Batches Found
                                                                </div>
                                                                <div style={{
                                                                    fontSize: '0.8rem',
                                                                    color: '#047857'
                                                                }}>
                                                                    Click the button to view complete batch information from Batch Creation data
                                                                </div>
                                                            </div>
                                                            <button
                                                                onClick={() => openBatchListModal(
                                                                    getFormulaAllProductCodes(formula),
                                                                    formula.masterFormulaDetails.productName
                                                                )}
                                                                style={{
                                                                    padding: '0.75rem 1.5rem',
                                                                    background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                                                                    color: 'white',
                                                                    borderRadius: '12px',
                                                                    fontSize: '0.95rem',
                                                                    fontWeight: '700',
                                                                    boxShadow: '0 4px 12px rgba(16, 185, 129, 0.4)',
                                                                    border: 'none',
                                                                    cursor: 'pointer',
                                                                    transition: 'all 0.2s ease',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    gap: '8px',
                                                                    whiteSpace: 'nowrap',
                                                                }}
                                                                onMouseEnter={(e) => {
                                                                    e.currentTarget.style.transform = 'scale(1.05)';
                                                                    e.currentTarget.style.boxShadow = '0 6px 16px rgba(16, 185, 129, 0.5)';
                                                                }}
                                                                onMouseLeave={(e) => {
                                                                    e.currentTarget.style.transform = 'scale(1)';
                                                                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.4)';
                                                                }}
                                                            >
                                                                🔍 View Batch Details
                                                            </button>
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
                                                            <InfoRow label="Revision No" value={formula.masterFormulaDetails.revisionNo} />
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
                                    icon="📊"
                                    isOpen={lowBatchMfcsOpen}
                                    onToggle={() => setLowBatchMfcsOpen(!lowBatchMfcsOpen)}
                                    badgeColor="#f59e0b"
                                    badgeText="1-2 Batches"
                                    description="MFCs with 1 or 2 batches in the system"
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
                                                    <button
                                                        onClick={() => toggleMfc(formula._id)}
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
                                                        <div style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--muted-foreground)', minWidth: '100px' }}>
                                                            {formula.masterFormulaDetails.productCode}
                                                        </div>
                                                        <div style={{ padding: '0.25rem 0.75rem', borderRadius: 'var(--radius-sm)', background: colors.light, color: colors.primary, fontSize: '0.75rem', fontWeight: '600' }}>
                                                            {formula.masterFormulaDetails.manufacturer || 'N/A'}
                                                        </div>
                                                        <div style={{ padding: '0.25rem 0.75rem', borderRadius: 'var(--radius-sm)', background: 'var(--muted)', color: 'var(--muted-foreground)', fontSize: '0.75rem', fontWeight: '500' }}>
                                                            {materialCount} materials
                                                        </div>
                                                        <div style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>
                                                            REV {formula.masterFormulaDetails.revisionNo || '0'}
                                                        </div>
                                                    </button>
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
                                    icon="🚫"
                                    isOpen={noBatchMfcsOpen}
                                    onToggle={() => setNoBatchMfcsOpen(!noBatchMfcsOpen)}
                                    badgeColor="#dc2626"
                                    badgeText="0 Batches"
                                    description="MFCs with no production batches in the system"
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
                                                    <button
                                                        onClick={() => toggleMfc(formula._id)}
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
                                                        <div style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--muted-foreground)', minWidth: '100px' }}>
                                                            {formula.masterFormulaDetails.productCode}
                                                        </div>
                                                        <div style={{ padding: '0.25rem 0.75rem', borderRadius: 'var(--radius-sm)', background: colors.light, color: colors.primary, fontSize: '0.75rem', fontWeight: '600' }}>
                                                            {formula.masterFormulaDetails.manufacturer || 'N/A'}
                                                        </div>
                                                        <div style={{ padding: '0.25rem 0.75rem', borderRadius: 'var(--radius-sm)', background: 'var(--muted)', color: 'var(--muted-foreground)', fontSize: '0.75rem', fontWeight: '500' }}>
                                                            {materialCount} materials
                                                        </div>
                                                        <div style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>
                                                            REV {formula.masterFormulaDetails.revisionNo || '0'}
                                                        </div>
                                                    </button>
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
                                    icon="💊"
                                    isOpen={placeboMfcsOpen}
                                    onToggle={() => setPlaceboMfcsOpen(!placeboMfcsOpen)}
                                    badgeColor="#6b7280"
                                    badgeText="Placebo/MediaFill"
                                    description="Placebo formulations and Media Fill products for validation"
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
                                                    <button
                                                        onClick={() => toggleMfc(formula._id)}
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
                                                        <div style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--muted-foreground)', minWidth: '100px' }}>
                                                            {formula.masterFormulaDetails.productCode}
                                                        </div>
                                                        <div style={{ padding: '0.25rem 0.75rem', borderRadius: 'var(--radius-sm)', background: colors.light, color: colors.primary, fontSize: '0.75rem', fontWeight: '600' }}>
                                                            {formula.masterFormulaDetails.manufacturer || 'N/A'}
                                                        </div>
                                                        <div style={{ padding: '0.25rem 0.75rem', borderRadius: 'var(--radius-sm)', background: 'var(--muted)', color: 'var(--muted-foreground)', fontSize: '0.75rem', fontWeight: '500' }}>
                                                            {materialCount} materials
                                                        </div>
                                                        <div style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>
                                                            REV {formula.masterFormulaDetails.revisionNo || '0'}
                                                        </div>
                                                    </button>
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

            {/* RM Data Modal */}
            <RmDataModal />
        </div>
    );
}
