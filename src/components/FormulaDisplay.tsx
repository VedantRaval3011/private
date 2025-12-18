'use client';

/**
 * FormulaDisplay Component
 * Renders parsed formula data in beautiful, structured sections
 */

import React, { useState } from 'react';
import type { FormulaRecord } from '@/types/formula';

interface FormulaDisplayProps {
    formula: FormulaRecord;
    onClose?: () => void;
}

interface SectionProps {
    title: string;
    icon: React.ReactNode;
    children: React.ReactNode;
    defaultOpen?: boolean;
    gradient?: string;
}

function Section({ title, icon, children, defaultOpen = true, gradient = 'var(--gradient-primary)' }: SectionProps) {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    return (
        <div
            className="animate-fadeInUp"
            style={{
                background: 'var(--card)',
                borderRadius: 'var(--radius-xl)',
                overflow: 'hidden',
                boxShadow: 'var(--shadow-md)',
                border: '1px solid var(--border)',
                marginBottom: '1.5rem',
            }}
        >
            <button
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    width: '100%',
                    padding: '1.25rem 1.5rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: gradient,
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'all var(--transition-base)',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{
                        width: '36px',
                        height: '36px',
                        background: 'rgba(255, 255, 255, 0.2)',
                        borderRadius: 'var(--radius-md)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white',
                    }}>
                        {icon}
                    </div>
                    <h3 style={{
                        color: 'white',
                        fontSize: '1.125rem',
                        fontWeight: '600',
                        margin: 0,
                    }}>
                        {title}
                    </h3>
                </div>
                <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="white"
                    strokeWidth="2"
                    style={{
                        transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                        transition: 'transform var(--transition-base)',
                    }}
                >
                    <polyline points="6 9 12 15 18 9" />
                </svg>
            </button>

            {isOpen && (
                <div style={{ padding: '1.5rem' }}>
                    {children}
                </div>
            )}
        </div>
    );
}

function InfoRow({ label, value }: { label: string; value: string | undefined }) {
    return (
        <div style={{
            display: 'flex',
            padding: '0.75rem 0',
            borderBottom: '1px solid var(--border)',
        }}>
            <span style={{
                flex: '0 0 40%',
                fontWeight: '500',
                color: 'var(--muted-foreground)',
                fontSize: '0.875rem',
            }}>
                {label}
            </span>
            <span style={{
                flex: '0 0 60%',
                color: 'var(--foreground)',
                fontWeight: '500',
            }}>
                {value || 'N/A'}
            </span>
        </div>
    );
}

function DataTable({
    headers,
    rows
}: {
    headers: string[];
    rows: (string | number | undefined)[][]
}) {
    return (
        <div style={{
            overflowX: 'auto',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border)',
        }}>
            <table style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '0.875rem',
            }}>
                <thead>
                    <tr style={{ background: 'var(--muted)' }}>
                        {headers.map((header, i) => (
                            <th key={i} style={{
                                padding: '0.875rem 1rem',
                                textAlign: 'left',
                                fontWeight: '600',
                                color: 'var(--foreground)',
                                borderBottom: '2px solid var(--border)',
                                whiteSpace: 'nowrap',
                            }}>
                                {header}
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
                                    padding: '2rem',
                                    textAlign: 'center',
                                    color: 'var(--muted-foreground)',
                                }}
                            >
                                No data available
                            </td>
                        </tr>
                    ) : (
                        rows.map((row, rowIndex) => (
                            <tr
                                key={rowIndex}
                                style={{
                                    background: rowIndex % 2 === 0 ? 'transparent' : 'var(--muted)',
                                    transition: 'background var(--transition-fast)',
                                }}
                            >
                                {row.map((cell, cellIndex) => (
                                    <td key={cellIndex} style={{
                                        padding: '0.75rem 1rem',
                                        borderBottom: '1px solid var(--border)',
                                        color: 'var(--foreground)',
                                    }}>
                                        {cell ?? 'N/A'}
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

export default function FormulaDisplay({ formula, onClose }: FormulaDisplayProps) {
    const { companyInfo, masterFormulaDetails, batchInfo, composition, materials, excipients, fillingDetails, summary } = formula;

    return (
        <div style={{
            maxWidth: '1200px',
            margin: '0 auto',
            padding: '2rem',
        }}>
            {/* Header */}
            <div style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                marginBottom: '2rem',
                flexWrap: 'wrap',
                gap: '1rem',
            }}>
                <div>
                    <h1 style={{
                        fontSize: '2rem',
                        fontWeight: '700',
                        color: 'var(--foreground)',
                        marginBottom: '0.5rem',
                    }}>
                        {masterFormulaDetails.productName || 'Formula Details'}
                    </h1>
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
                            {masterFormulaDetails.productCode || 'N/A'}
                        </span>
                        <span style={{
                            padding: '0.375rem 0.75rem',
                            background: formula.parsingStatus === 'success' ? 'var(--success)' : 'var(--warning)',
                            color: 'white',
                            borderRadius: 'var(--radius-full)',
                            fontSize: '0.875rem',
                            fontWeight: '500',
                        }}>
                            {formula.parsingStatus === 'success' ? 'Complete' : 'Partial'}
                        </span>
                    </div>
                </div>

                {onClose && (
                    <button
                        onClick={onClose}
                        style={{
                            padding: '0.75rem 1.5rem',
                            background: 'var(--muted)',
                            border: 'none',
                            borderRadius: 'var(--radius-md)',
                            cursor: 'pointer',
                            fontWeight: '500',
                            color: 'var(--foreground)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            transition: 'all var(--transition-fast)',
                        }}
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M19 12H5M12 19l-7-7 7-7" />
                        </svg>
                        Back
                    </button>
                )}
            </div>

            {/* File Info Banner */}
            <div style={{
                padding: '1rem 1.5rem',
                background: 'var(--muted)',
                borderRadius: 'var(--radius-lg)',
                marginBottom: '1.5rem',
                display: 'flex',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '1rem',
                fontSize: '0.875rem',
            }}>
                <span><strong>File:</strong> {formula.fileName}</span>
                <span><strong>Size:</strong> {(formula.fileSize / 1024).toFixed(2)} KB</span>
                <span><strong>Uploaded:</strong> {new Date(formula.uploadedAt).toLocaleString()}</span>
            </div>

            {/* Company Information */}
            <Section
                title="Company Information"
                icon={
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 21h18M3 7v1a3 3 0 0 0 6 0V7m0 1a3 3 0 0 0 6 0V7m0 1a3 3 0 0 0 6 0V7H3l2-4h14l2 4M5 21V10.85M19 21V10.85" />
                    </svg>
                }
                gradient="linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)"
            >
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0 2rem' }}>
                    <InfoRow label="Company Name" value={companyInfo.companyName} />
                    <InfoRow label="Company Address" value={companyInfo.companyAddress} />
                    <InfoRow label="Document Title" value={companyInfo.documentTitle} />
                    <InfoRow label="Page Number" value={companyInfo.pageNumber} />
                </div>
            </Section>

            {/* Master Formula Details */}
            <Section
                title="Master Formula Details"
                icon={
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                    </svg>
                }
                gradient="var(--gradient-primary)"
            >
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0 2rem' }}>
                    <InfoRow label="Master Card No" value={masterFormulaDetails.masterCardNo} />
                    <InfoRow label="Product Code" value={masterFormulaDetails.productCode} />
                    <InfoRow label="Product Name" value={masterFormulaDetails.productName} />
                    <InfoRow label="Generic Name" value={masterFormulaDetails.genericName} />
                    <InfoRow label="Specification" value={masterFormulaDetails.specification} />
                    <InfoRow label="Manufacturing License No" value={masterFormulaDetails.manufacturingLicenseNo} />
                    <InfoRow label="Manufacturing Location" value={masterFormulaDetails.manufacturingLocation} />
                    <InfoRow label="Manufacturer" value={masterFormulaDetails.manufacturer} />
                    <InfoRow label="Shelf Life" value={masterFormulaDetails.shelfLife} />
                    <InfoRow label="Revision No" value={masterFormulaDetails.revisionNo} />
                    <InfoRow label="Reason for Change" value={masterFormulaDetails.reasonForChange} />
                    <InfoRow label="Effective Batch No" value={masterFormulaDetails.effectiveBatchNo} />
                    <InfoRow label="Date" value={masterFormulaDetails.date} />
                </div>
            </Section>

            {/* Batch Information */}
            <Section
                title="Batch Information"
                icon={
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                        <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                    </svg>
                }
                gradient="linear-gradient(135deg, #0891b2 0%, #0d9488 100%)"
            >
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0 2rem' }}>
                    <InfoRow label="Batch Size" value={batchInfo.batchSize} />
                    <InfoRow label="Label Claim" value={batchInfo.labelClaim} />
                    <InfoRow label="Marketed By" value={batchInfo.marketedBy} />
                    <InfoRow label="Volume" value={batchInfo.volume} />
                </div>
            </Section>

            {/* Composition */}
            <Section
                title="Composition / Label Claim"
                icon={
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M10 2v7.31M14 2v7.31M8.5 2h7M8.5 9.31h7M8.5 14.9h7M10 14.9v7.1M14 14.9v7.1" />
                    </svg>
                }
                gradient="linear-gradient(135deg, #059669 0%, #10b981 100%)"
                defaultOpen={composition.length > 0}
            >
                <DataTable
                    headers={['Active Ingredient', 'Strength', 'Form', 'Equivalent Base']}
                    rows={composition.map(item => [
                        item.activeIngredientName,
                        item.strengthPerUnit,
                        item.form,
                        item.equivalentBase,
                    ])}
                />
            </Section>

            {/* Materials Table */}
            <Section
                title="Aseptic Mixing Materials"
                icon={
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                    </svg>
                }
                gradient="linear-gradient(135deg, #7c3aed 0%, #8b5cf6 100%)"
                defaultOpen={materials.length > 0}
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
                    rows={materials.map(item => [
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

            {/* Excipients */}
            <Section
                title="Excipients / Additives"
                icon={
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 16v-4M12 8h.01" />
                    </svg>
                }
                gradient="linear-gradient(135deg, #db2777 0%, #ec4899 100%)"
                defaultOpen={(excipients?.length ?? 0) > 0}
            >
                <DataTable
                    headers={['Name', 'Type', 'Quantity', 'Unit']}
                    rows={(excipients ?? []).map(item => [
                        item.name,
                        item.type,
                        item.quantity,
                        item.unit,
                    ])}
                />
            </Section>

            {/* Filling Details */}
            <Section
                title="Aseptic Filling Details"
                icon={
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="12" y1="18" x2="12" y2="12" />
                        <line x1="9" y1="15" x2="15" y2="15" />
                    </svg>
                }
                gradient="linear-gradient(135deg, #ea580c 0%, #f97316 100%)"
                defaultOpen={fillingDetails.length > 0}
            >
                <DataTable
                    headers={[
                        'Product Code',
                        'Product Name',
                        'Packing Size',
                        'Filling Qty',
                        'No. of Units',
                        'Type',
                    ]}
                    rows={fillingDetails.map(item => [
                        item.productCode,
                        item.productName,
                        item.packingSize,
                        item.actualFillingQuantity,
                        item.numberOfSyringes,
                        item.syringeType,
                    ])}
                />
            </Section>

            {/* Summary */}
            <Section
                title="Summary / Totals"
                icon={
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                    </svg>
                }
                gradient="linear-gradient(135deg, #0284c7 0%, #0ea5e9 100%)"
            >
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0 2rem' }}>
                    <InfoRow label="Total Units Produced" value={summary?.totalUnitsProduced} />
                    <InfoRow label="Total Filling Quantity" value={summary?.totalFillingQuantity} />
                    <InfoRow label="Std Batch Size Compliance" value={summary?.standardBatchSizeCompliance} />
                </div>
            </Section>

            {/* Parsing Warnings */}
            {formula.parsingErrors && formula.parsingErrors.length > 0 && (
                <div style={{
                    padding: '1.25rem',
                    background: 'rgba(245, 158, 11, 0.1)',
                    borderRadius: 'var(--radius-lg)',
                    border: '1px solid rgba(245, 158, 11, 0.3)',
                }}>
                    <h4 style={{
                        color: 'var(--warning)',
                        marginBottom: '0.75rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                    }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                            <line x1="12" y1="9" x2="12" y2="13" />
                            <line x1="12" y1="17" x2="12.01" y2="17" />
                        </svg>
                        Parsing Warnings
                    </h4>
                    <ul style={{ paddingLeft: '1.5rem', color: 'var(--warning)' }}>
                        {formula.parsingErrors.map((error, index) => (
                            <li key={index} style={{ marginBottom: '0.25rem' }}>{error}</li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}
