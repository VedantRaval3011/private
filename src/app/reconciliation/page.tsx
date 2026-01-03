/**
 * Formula Reconciliation Page
 * Displays comprehensive reconciliation results between Formula Master and Batch Creation data
 */

'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import type { ReconciliationReport, FormulaReconciliationResult, OrphanBatchResult, BatchValidationResult } from '@/types/reconciliation';

// ============================================
// Status Badge Component
// ============================================
function StatusBadge({
    status
}: {
    status: 'fully_reconciled' | 'partially_reconciled' | 'not_reconciled' | 'no_batches'
}) {
    const config = {
        fully_reconciled: { bg: '#10B981', text: 'white', label: '✅ Fully Reconciled' },
        partially_reconciled: { bg: '#F59E0B', text: 'white', label: '⚠️ Partially Reconciled' },
        not_reconciled: { bg: '#EF4444', text: 'white', label: '❌ Not Reconciled' },
        no_batches: { bg: '#6B7280', text: 'white', label: '📭 No Batches' }
    };

    const { bg, text, label } = config[status];

    return (
        <span style={{
            backgroundColor: bg,
            color: text,
            padding: '4px 10px',
            borderRadius: '4px',
            fontSize: '12px',
            fontWeight: 600,
            whiteSpace: 'nowrap'
        }}>
            {label}
        </span>
    );
}

// ============================================
// Priority Badge Component
// ============================================
function PriorityBadge({ priority }: { priority: 'high' | 'medium' | 'low' }) {
    const config = {
        high: { bg: '#FEE2E2', text: '#DC2626', label: 'HIGH' },
        medium: { bg: '#FEF3C7', text: '#D97706', label: 'MEDIUM' },
        low: { bg: '#DBEAFE', text: '#2563EB', label: 'LOW' }
    };

    const { bg, text, label } = config[priority];

    return (
        <span style={{
            backgroundColor: bg,
            color: text,
            padding: '2px 8px',
            borderRadius: '3px',
            fontSize: '10px',
            fontWeight: 700,
            letterSpacing: '0.5px'
        }}>
            {label}
        </span>
    );
}

// ============================================
// Stats Card Component
// ============================================
function StatsCard({
    title,
    value,
    subtitle,
    color
}: {
    title: string;
    value: number | string;
    subtitle?: string;
    color: string;
}) {
    return (
        <div style={{
            background: 'linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 100%)',
            backdropFilter: 'blur(10px)',
            border: `1px solid ${color}40`,
            borderRadius: '12px',
            padding: '20px',
            textAlign: 'center',
            minWidth: '160px'
        }}>
            <div style={{ color: '#94A3B8', fontSize: '12px', fontWeight: 500, marginBottom: '8px' }}>
                {title}
            </div>
            <div style={{ color, fontSize: '28px', fontWeight: 700 }}>
                {value}
            </div>
            {subtitle && (
                <div style={{ color: '#64748B', fontSize: '11px', marginTop: '4px' }}>
                    {subtitle}
                </div>
            )}
        </div>
    );
}

// ============================================
// Collapsible Section Component
// ============================================
function CollapsibleSection({
    title,
    count,
    icon,
    defaultOpen = true,
    children
}: {
    title: string;
    count?: number;
    icon: string;
    defaultOpen?: boolean;
    children: React.ReactNode;
}) {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    return (
        <div style={{
            marginBottom: '24px',
            background: 'rgba(15, 23, 42, 0.6)',
            borderRadius: '12px',
            border: '1px solid rgba(148, 163, 184, 0.1)',
            overflow: 'hidden'
        }}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '16px 20px',
                    background: 'rgba(30, 41, 59, 0.8)',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'white'
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '20px' }}>{icon}</span>
                    <span style={{ fontSize: '16px', fontWeight: 600 }}>{title}</span>
                    {count !== undefined && (
                        <span style={{
                            background: 'rgba(59, 130, 246, 0.2)',
                            color: '#60A5FA',
                            padding: '2px 10px',
                            borderRadius: '12px',
                            fontSize: '12px',
                            fontWeight: 600
                        }}>
                            {count}
                        </span>
                    )}
                </div>
                <span style={{ fontSize: '18px', transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'rotate(0)' }}>
                    ▼
                </span>
            </button>
            {isOpen && (
                <div style={{ padding: '20px' }}>
                    {children}
                </div>
            )}
        </div>
    );
}

// ============================================
// Batch Detail Row Component
// ============================================
function BatchDetailRow({ batch, formulaMfgLic }: { batch: BatchValidationResult; formulaMfgLic: string }) {
    const hasMismatch = batch.mismatches.length > 0;

    return (
        <div style={{
            background: hasMismatch ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.05)',
            borderRadius: '6px',
            border: `1px solid ${hasMismatch ? 'rgba(239, 68, 68, 0.3)' : 'rgba(16, 185, 129, 0.2)'}`,
            padding: '12px',
            marginBottom: '8px'
        }}>
            {/* Batch Header */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr 80px',
                gap: '12px',
                marginBottom: hasMismatch ? '12px' : '0'
            }}>
                <div>
                    <div style={{ color: '#64748B', fontSize: '10px', marginBottom: '2px' }}>BATCH NO.</div>
                    <div style={{ color: '#E2E8F0', fontSize: '13px', fontWeight: 600 }}>{batch.batchNumber}</div>
                </div>
                <div>
                    <div style={{ color: '#64748B', fontSize: '10px', marginBottom: '2px' }}>ITEM CODE</div>
                    <div style={{ color: '#60A5FA', fontSize: '12px' }}>{batch.itemCode}</div>
                </div>
                <div>
                    <div style={{ color: '#64748B', fontSize: '10px', marginBottom: '2px' }}>MFG DATE</div>
                    <div style={{ color: '#94A3B8', fontSize: '12px' }}>{batch.mfgDate}</div>
                </div>
                <div>
                    <div style={{ color: '#64748B', fontSize: '10px', marginBottom: '2px' }}>EXPIRY DATE</div>
                    <div style={{ color: '#94A3B8', fontSize: '12px' }}>{batch.expiryDate}</div>
                </div>
                <div>
                    <div style={{ color: '#64748B', fontSize: '10px', marginBottom: '2px' }}>BATCH SIZE</div>
                    <div style={{ color: '#94A3B8', fontSize: '12px' }}>{batch.batchSize}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                    <span style={{
                        background: hasMismatch ? '#EF4444' : '#10B981',
                        color: 'white',
                        padding: '3px 8px',
                        borderRadius: '4px',
                        fontSize: '10px',
                        fontWeight: 600
                    }}>
                        {hasMismatch ? '❌ MISMATCH' : '✅ OK'}
                    </span>
                </div>
            </div>

            {/* Additional Info Row */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: '2fr 1fr 1fr',
                gap: '12px',
                marginTop: '8px',
                paddingTop: '8px',
                borderTop: '1px solid rgba(148, 163, 184, 0.1)'
            }}>
                <div>
                    <div style={{ color: '#64748B', fontSize: '10px', marginBottom: '2px' }}>ITEM NAME</div>
                    <div style={{ color: '#E2E8F0', fontSize: '12px' }}>{batch.itemName}</div>
                </div>
                <div>
                    <div style={{ color: '#64748B', fontSize: '10px', marginBottom: '2px' }}>DEPARTMENT</div>
                    <div style={{ color: '#94A3B8', fontSize: '12px' }}>{batch.department}</div>
                </div>
                <div>
                    <div style={{ color: '#64748B', fontSize: '10px', marginBottom: '2px' }}>TYPE</div>
                    <div style={{
                        color: batch.type === 'Export' ? '#10B981' : '#F59E0B',
                        fontSize: '12px'
                    }}>
                        {batch.type}
                    </div>
                </div>
            </div>

            {/* Mismatch Details */}
            {hasMismatch && (
                <div style={{
                    marginTop: '12px',
                    padding: '10px',
                    background: 'rgba(239, 68, 68, 0.15)',
                    borderRadius: '4px',
                    border: '1px solid rgba(239, 68, 68, 0.3)'
                }}>
                    <div style={{ color: '#F87171', fontSize: '11px', fontWeight: 600, marginBottom: '8px' }}>
                        🔍 MISMATCH DETAILS - WHY AND WHERE:
                    </div>
                    {batch.mismatches.map((mismatch, idx) => (
                        <div key={idx} style={{
                            marginBottom: idx < batch.mismatches.length - 1 ? '8px' : '0',
                            paddingLeft: '12px',
                            borderLeft: `3px solid ${mismatch.severity === 'critical' ? '#EF4444' : mismatch.severity === 'warning' ? '#F59E0B' : '#60A5FA'}`
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                <span style={{
                                    background: mismatch.severity === 'critical' ? '#DC2626' : mismatch.severity === 'warning' ? '#D97706' : '#2563EB',
                                    color: 'white',
                                    padding: '1px 6px',
                                    borderRadius: '3px',
                                    fontSize: '9px',
                                    fontWeight: 700,
                                    textTransform: 'uppercase'
                                }}>
                                    {mismatch.severity}
                                </span>
                                <span style={{
                                    color: '#94A3B8',
                                    fontSize: '10px',
                                    background: 'rgba(148, 163, 184, 0.2)',
                                    padding: '1px 6px',
                                    borderRadius: '3px'
                                }}>
                                    {mismatch.type.replace(/_/g, ' ').toUpperCase()}
                                </span>
                            </div>
                            <div style={{ color: '#F87171', fontSize: '12px' }}>
                                {mismatch.description}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ============================================
// Formula Result Card Component
// ============================================
function FormulaResultCard({ result }: { result: FormulaReconciliationResult }) {
    const [expanded, setExpanded] = useState(false);
    const [showBatchDetails, setShowBatchDetails] = useState(false);
    const [batchFilter, setBatchFilter] = useState<'all' | 'mismatched' | 'reconciled'>('all');

    const filteredBatches = result.batchDetails.filter(batch => {
        if (batchFilter === 'all') return true;
        if (batchFilter === 'mismatched') return batch.mismatches.length > 0;
        if (batchFilter === 'reconciled') return batch.mismatches.length === 0;
        return true;
    });

    return (
        <div style={{
            background: 'rgba(30, 41, 59, 0.5)',
            borderRadius: '8px',
            border: '1px solid rgba(148, 163, 184, 0.1)',
            marginBottom: '12px',
            overflow: 'hidden'
        }}>
            {/* Header */}
            <div
                style={{
                    padding: '16px',
                    display: 'grid',
                    gridTemplateColumns: '1fr 100px 100px 100px 160px',
                    alignItems: 'center',
                    gap: '16px',
                    cursor: 'pointer'
                }}
                onClick={() => setExpanded(!expanded)}
            >
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <span style={{ color: '#60A5FA', fontSize: '13px', fontWeight: 600 }}>
                            {result.masterCardNo}
                        </span>
                        <span style={{ color: '#64748B', fontSize: '12px' }}>|</span>
                        <span style={{ color: '#94A3B8', fontSize: '12px' }}>
                            {result.productCode}
                        </span>
                        <span style={{
                            marginLeft: '8px',
                            fontSize: '14px',
                            transition: 'transform 0.2s',
                            transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)'
                        }}>▶</span>
                    </div>
                    <div style={{ color: 'white', fontSize: '14px', fontWeight: 500 }}>
                        {result.productName}
                    </div>
                    <div style={{ color: '#64748B', fontSize: '11px', marginTop: '4px' }}>
                        Rev: {result.revisionNo} | {result.manufacturer}
                    </div>
                </div>

                <div style={{ textAlign: 'center' }}>
                    <div style={{ color: '#60A5FA', fontSize: '20px', fontWeight: 700 }}>
                        {result.stats.totalBatches}
                    </div>
                    <div style={{ color: '#64748B', fontSize: '10px' }}>Total Batches</div>
                </div>

                <div style={{ textAlign: 'center' }}>
                    <div style={{ color: '#10B981', fontSize: '20px', fontWeight: 700 }}>
                        {result.stats.reconciledBatches}
                    </div>
                    <div style={{ color: '#64748B', fontSize: '10px' }}>Reconciled</div>
                </div>

                <div style={{ textAlign: 'center' }}>
                    <div style={{
                        color: result.stats.mismatchedBatches > 0 ? '#EF4444' : '#10B981',
                        fontSize: '20px',
                        fontWeight: 700
                    }}>
                        {result.stats.mismatchedBatches}
                    </div>
                    <div style={{ color: '#64748B', fontSize: '10px' }}>Mismatched</div>
                </div>

                <div style={{ textAlign: 'right' }}>
                    <StatusBadge status={result.reconciliationStatus} />
                </div>
            </div>

            {/* Expanded Details */}
            {expanded && (
                <div style={{
                    borderTop: '1px solid rgba(148, 163, 184, 0.1)',
                    padding: '16px',
                    background: 'rgba(15, 23, 42, 0.3)'
                }}>
                    {/* Mismatch Summary */}
                    {result.stats.mismatchedBatches > 0 && (
                        <div style={{ marginBottom: '16px' }}>
                            <div style={{ color: '#F59E0B', fontSize: '13px', fontWeight: 600, marginBottom: '8px' }}>
                                ⚠️ Mismatch Summary
                            </div>
                            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                                {result.mismatchSummary.mfcMismatches > 0 && (
                                    <span style={{ color: '#EF4444', fontSize: '12px' }}>
                                        MFC Mismatches: {result.mismatchSummary.mfcMismatches}
                                    </span>
                                )}
                                {result.mismatchSummary.oldRevisionBatches > 0 && (
                                    <span style={{ color: '#F59E0B', fontSize: '12px' }}>
                                        Old Revisions: {result.mismatchSummary.oldRevisionBatches}
                                    </span>
                                )}
                                {result.mismatchSummary.materialMismatches > 0 && (
                                    <span style={{ color: '#EF4444', fontSize: '12px' }}>
                                        Material Mismatches: {result.mismatchSummary.materialMismatches}
                                    </span>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Linked Product Codes */}
                    <div style={{ marginBottom: '16px' }}>
                        <div style={{ color: '#94A3B8', fontSize: '12px', marginBottom: '6px' }}>
                            Linked Product Codes:
                        </div>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            {result.linkedProductCodes.map(code => (
                                <span key={code} style={{
                                    background: 'rgba(59, 130, 246, 0.2)',
                                    color: '#60A5FA',
                                    padding: '2px 8px',
                                    borderRadius: '4px',
                                    fontSize: '11px'
                                }}>
                                    {code}
                                </span>
                            ))}
                        </div>
                    </div>

                    {/* Compliance Notes */}
                    {result.complianceNotes.length > 0 && (
                        <div style={{ marginBottom: '16px' }}>
                            <div style={{ color: '#94A3B8', fontSize: '12px', marginBottom: '6px' }}>
                                Compliance Notes:
                            </div>
                            {result.complianceNotes.map((note, idx) => (
                                <div key={idx} style={{ color: '#64748B', fontSize: '11px', marginBottom: '4px' }}>
                                    • {note}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Batch Details Section */}
                    {result.batchDetails.length > 0 && (
                        <div style={{ marginTop: '16px' }}>
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                marginBottom: '12px'
                            }}>
                                <button
                                    onClick={(e) => { e.stopPropagation(); setShowBatchDetails(!showBatchDetails); }}
                                    style={{
                                        background: showBatchDetails
                                            ? 'linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)'
                                            : 'rgba(139, 92, 246, 0.2)',
                                        border: '1px solid #8B5CF6',
                                        color: 'white',
                                        padding: '8px 16px',
                                        borderRadius: '6px',
                                        fontSize: '12px',
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px'
                                    }}
                                >
                                    {showBatchDetails ? '🔼 Hide Batch Details' : '🔽 Show All Batch Details'}
                                    <span style={{
                                        background: 'rgba(255,255,255,0.2)',
                                        padding: '2px 8px',
                                        borderRadius: '10px',
                                        fontSize: '11px'
                                    }}>
                                        {result.batchDetails.length}
                                    </span>
                                </button>

                                {showBatchDetails && (
                                    <div style={{ display: 'flex', gap: '6px' }}>
                                        {[
                                            { value: 'all', label: 'All', count: result.batchDetails.length },
                                            { value: 'mismatched', label: 'Mismatched', count: result.stats.mismatchedBatches },
                                            { value: 'reconciled', label: 'Reconciled', count: result.stats.reconciledBatches }
                                        ].map(opt => (
                                            <button
                                                key={opt.value}
                                                onClick={(e) => { e.stopPropagation(); setBatchFilter(opt.value as typeof batchFilter); }}
                                                style={{
                                                    background: batchFilter === opt.value
                                                        ? opt.value === 'mismatched' ? 'rgba(239, 68, 68, 0.3)'
                                                            : opt.value === 'reconciled' ? 'rgba(16, 185, 129, 0.3)'
                                                                : 'rgba(59, 130, 246, 0.3)'
                                                        : 'rgba(30, 41, 59, 0.5)',
                                                    border: '1px solid',
                                                    borderColor: batchFilter === opt.value
                                                        ? opt.value === 'mismatched' ? '#EF4444'
                                                            : opt.value === 'reconciled' ? '#10B981'
                                                                : '#3B82F6'
                                                        : 'rgba(148, 163, 184, 0.2)',
                                                    color: 'white',
                                                    padding: '4px 10px',
                                                    borderRadius: '4px',
                                                    fontSize: '11px',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                {opt.label} ({opt.count})
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {showBatchDetails && (
                                <div style={{
                                    background: 'rgba(15, 23, 42, 0.5)',
                                    borderRadius: '8px',
                                    padding: '12px',
                                    maxHeight: '500px',
                                    overflowY: 'auto'
                                }}>
                                    {/* Batch Table Header */}
                                    <div style={{
                                        display: 'grid',
                                        gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr 80px',
                                        gap: '12px',
                                        padding: '8px 12px',
                                        background: 'rgba(30, 41, 59, 0.8)',
                                        borderRadius: '4px',
                                        marginBottom: '8px'
                                    }}>
                                        <div style={{ color: '#64748B', fontSize: '10px', fontWeight: 600 }}>BATCH NO.</div>
                                        <div style={{ color: '#64748B', fontSize: '10px', fontWeight: 600 }}>ITEM CODE</div>
                                        <div style={{ color: '#64748B', fontSize: '10px', fontWeight: 600 }}>MFG DATE</div>
                                        <div style={{ color: '#64748B', fontSize: '10px', fontWeight: 600 }}>EXPIRY DATE</div>
                                        <div style={{ color: '#64748B', fontSize: '10px', fontWeight: 600 }}>BATCH SIZE</div>
                                        <div style={{ color: '#64748B', fontSize: '10px', fontWeight: 600, textAlign: 'right' }}>STATUS</div>
                                    </div>

                                    {/* Batch Rows */}
                                    {filteredBatches.length === 0 ? (
                                        <div style={{ color: '#64748B', textAlign: 'center', padding: '24px' }}>
                                            No batches match the selected filter
                                        </div>
                                    ) : (
                                        filteredBatches.map((batch, idx) => (
                                            <BatchDetailRow
                                                key={`${batch.batchNumber}-${idx}`}
                                                batch={batch}
                                                formulaMfgLic={result.manufacturer}
                                            />
                                        ))
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ============================================
// Orphan Batch Card Component
// ============================================
function OrphanBatchCard({ orphan }: { orphan: OrphanBatchResult }) {
    const [showDetails, setShowDetails] = useState(false);

    return (
        <div style={{
            background: 'rgba(239, 68, 68, 0.1)',
            borderRadius: '8px',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            padding: '16px',
            marginBottom: '12px'
        }}>
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: '8px',
                    cursor: 'pointer'
                }}
                onClick={() => setShowDetails(!showDetails)}
            >
                <div>
                    <span style={{ color: '#F87171', fontSize: '14px', fontWeight: 600 }}>
                        {orphan.itemCode}
                    </span>
                    <span style={{ color: '#64748B', margin: '0 8px' }}>|</span>
                    <span style={{ color: '#94A3B8', fontSize: '13px' }}>
                        {orphan.itemName}
                    </span>
                    <span style={{
                        marginLeft: '8px',
                        fontSize: '12px',
                        transition: 'transform 0.2s',
                        transform: showDetails ? 'rotate(90deg)' : 'rotate(0deg)'
                    }}>▶</span>
                </div>
                <span style={{
                    background: orphan.complianceRisk === 'high' ? '#DC2626' : '#D97706',
                    color: 'white',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: 600
                }}>
                    {orphan.batchCount} BATCHES
                </span>
            </div>
            <div style={{ color: '#EF4444', fontSize: '12px', marginBottom: showDetails ? '12px' : '0' }}>
                ❌ {orphan.reason}
            </div>

            {/* Individual Batch Details */}
            {showDetails && orphan.batches && orphan.batches.length > 0 && (
                <div style={{
                    marginTop: '12px',
                    background: 'rgba(15, 23, 42, 0.4)',
                    borderRadius: '6px',
                    padding: '12px',
                    maxHeight: '300px',
                    overflowY: 'auto'
                }}>
                    <div style={{
                        color: '#F87171',
                        fontSize: '11px',
                        fontWeight: 600,
                        marginBottom: '10px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                    }}>
                        📋 Individual Batch Details (No Formula Master Found)
                    </div>

                    {/* Batch Table Header */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr 1fr',
                        gap: '8px',
                        padding: '6px 10px',
                        background: 'rgba(30, 41, 59, 0.8)',
                        borderRadius: '4px',
                        marginBottom: '6px'
                    }}>
                        <div style={{ color: '#64748B', fontSize: '10px', fontWeight: 600 }}>BATCH NO.</div>
                        <div style={{ color: '#64748B', fontSize: '10px', fontWeight: 600 }}>MFG DATE</div>
                        <div style={{ color: '#64748B', fontSize: '10px', fontWeight: 600 }}>BATCH SIZE</div>
                    </div>

                    {/* Batch Rows */}
                    {orphan.batches.map((batch, idx) => (
                        <div key={`${batch.batchNumber}-${idx}`} style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 1fr 1fr',
                            gap: '8px',
                            padding: '8px 10px',
                            background: 'rgba(239, 68, 68, 0.05)',
                            borderRadius: '4px',
                            border: '1px solid rgba(239, 68, 68, 0.2)',
                            marginBottom: '4px'
                        }}>
                            <div style={{ color: '#E2E8F0', fontSize: '12px', fontWeight: 500 }}>
                                {batch.batchNumber}
                            </div>
                            <div style={{ color: '#94A3B8', fontSize: '12px' }}>
                                {batch.mfgDate}
                            </div>
                            <div style={{ color: '#94A3B8', fontSize: '12px' }}>
                                {batch.batchSize}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ============================================
// Main Page Component
// ============================================
export default function ReconciliationPage() {
    const [report, setReport] = useState<ReconciliationReport | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState<'all' | 'fully_reconciled' | 'partially_reconciled' | 'not_reconciled' | 'no_batches'>('all');

    const fetchReconciliation = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const response = await fetch('/api/reconciliation');
            const data = await response.json();

            if (data.success && data.data) {
                setReport(data.data);
            } else {
                setError(data.message || 'Failed to fetch reconciliation data');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Network error');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchReconciliation();
    }, [fetchReconciliation]);

    const filteredResults = report?.formulaResults.filter(r =>
        filter === 'all' || r.reconciliationStatus === filter
    ) || [];

    return (
        <div style={{
            minHeight: '100vh',
            background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 50%, #0F172A 100%)',
            color: 'white',
            padding: '24px'
        }}>
            {/* Header */}
            <div style={{ marginBottom: '32px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <div>
                        <Link href="/" style={{
                            color: '#60A5FA',
                            textDecoration: 'none',
                            fontSize: '13px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            marginBottom: '8px'
                        }}>
                            ← Back to Home
                        </Link>
                        <h1 style={{
                            fontSize: '28px',
                            fontWeight: 700,
                            margin: 0,
                            background: 'linear-gradient(135deg, #60A5FA 0%, #A78BFA 100%)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent'
                        }}>
                            Formula Master Reconciliation
                        </h1>
                        <p style={{ color: '#64748B', fontSize: '14px', marginTop: '4px' }}>
                            GMP Compliance Audit: Formula Master vs Batch Creation Data
                        </p>
                    </div>

                    <button
                        onClick={fetchReconciliation}
                        disabled={loading}
                        style={{
                            background: 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)',
                            border: 'none',
                            color: 'white',
                            padding: '12px 24px',
                            borderRadius: '8px',
                            fontSize: '14px',
                            fontWeight: 600,
                            cursor: loading ? 'not-allowed' : 'pointer',
                            opacity: loading ? 0.7 : 1,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                        }}
                    >
                        {loading ? '⏳ Processing...' : '🔄 Refresh Reconciliation'}
                    </button>
                </div>

                {report && (
                    <div style={{ color: '#64748B', fontSize: '12px' }}>
                        Report ID: {report.reportId} | Generated: {new Date(report.generatedAt).toLocaleString()}
                    </div>
                )}
            </div>

            {/* Loading State */}
            {loading && (
                <div style={{
                    textAlign: 'center',
                    padding: '80px 20px'
                }}>
                    <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔍</div>
                    <div style={{ color: '#94A3B8', fontSize: '16px' }}>
                        Performing reconciliation analysis...
                    </div>
                    <div style={{ color: '#64748B', fontSize: '13px', marginTop: '8px' }}>
                        Comparing Formula Master against Batch Creation data
                    </div>
                </div>
            )}

            {/* Error State */}
            {error && (
                <div style={{
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: '12px',
                    padding: '24px',
                    textAlign: 'center'
                }}>
                    <div style={{ color: '#EF4444', fontSize: '16px', marginBottom: '8px' }}>
                        ❌ Reconciliation Failed
                    </div>
                    <div style={{ color: '#F87171', fontSize: '14px' }}>
                        {error}
                    </div>
                </div>
            )}

            {/* Report Content */}
            {!loading && report && (
                <>
                    {/* Overall Statistics */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                        gap: '16px',
                        marginBottom: '32px'
                    }}>
                        <StatsCard
                            title="Formula Masters"
                            value={report.dataSources.formulaMasterCount}
                            color="#60A5FA"
                        />
                        <StatsCard
                            title="Total Batches"
                            value={report.dataSources.totalBatchRecords}
                            color="#8B5CF6"
                        />
                        <StatsCard
                            title="Compliance Score"
                            value={`${report.overallStats.complianceScore}%`}
                            color={report.overallStats.complianceScore >= 80 ? '#10B981' : report.overallStats.complianceScore >= 50 ? '#F59E0B' : '#EF4444'}
                        />
                        <StatsCard
                            title="Fully Reconciled"
                            value={report.overallStats.fullyReconciledFormulas}
                            subtitle="Formulas"
                            color="#10B981"
                        />
                        <StatsCard
                            title="Partially Reconciled"
                            value={report.overallStats.partiallyReconciledFormulas}
                            subtitle="Formulas"
                            color="#F59E0B"
                        />
                        <StatsCard
                            title="Orphan Batches"
                            value={report.overallStats.totalOrphanBatches}
                            subtitle="No Formula Master"
                            color="#EF4444"
                        />
                    </div>

                    {/* BATCH RECONCILIATION SUMMARY - Key Metric */}
                    {report.batchReconciliation && (
                        <div style={{
                            marginBottom: '32px',
                            background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(139, 92, 246, 0.1) 100%)',
                            borderRadius: '16px',
                            border: '2px solid rgba(59, 130, 246, 0.3)',
                            padding: '24px',
                            position: 'relative',
                            overflow: 'hidden'
                        }}>
                            <div style={{
                                position: 'absolute',
                                top: '12px',
                                right: '16px',
                                background: report.batchReconciliation.allBatchesAccountedFor ? '#10B981' : '#EF4444',
                                color: 'white',
                                padding: '4px 12px',
                                borderRadius: '20px',
                                fontSize: '11px',
                                fontWeight: 700
                            }}>
                                {report.batchReconciliation.allBatchesAccountedFor ? '✅ ALL BATCHES ACCOUNTED' : '❌ BATCHES MISSING'}
                            </div>

                            <h2 style={{
                                color: 'white',
                                fontSize: '18px',
                                fontWeight: 700,
                                marginBottom: '20px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px'
                            }}>
                                📊 Batch Reconciliation Summary
                            </h2>

                            {/* Main Equation Display */}
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '16px',
                                background: 'rgba(15, 23, 42, 0.6)',
                                borderRadius: '12px',
                                padding: '20px',
                                marginBottom: '20px',
                                flexWrap: 'wrap'
                            }}>
                                {/* Total Batches */}
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{ color: '#8B5CF6', fontSize: '32px', fontWeight: 700 }}>
                                        {report.batchReconciliation.totalBatchesInSystem}
                                    </div>
                                    <div style={{ color: '#94A3B8', fontSize: '11px', fontWeight: 500 }}>
                                        TOTAL BATCHES
                                    </div>
                                    <div style={{ color: '#64748B', fontSize: '10px' }}>
                                        (Batch Creation)
                                    </div>
                                </div>

                                <div style={{ color: '#64748B', fontSize: '24px', fontWeight: 300 }}>=</div>

                                {/* Matched Batches */}
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{ color: '#10B981', fontSize: '32px', fontWeight: 700 }}>
                                        {report.batchReconciliation.batchesMatchedToFormula}
                                    </div>
                                    <div style={{ color: '#94A3B8', fontSize: '11px', fontWeight: 500 }}>
                                        MATCHED TO FORMULA
                                    </div>
                                    <div style={{ color: '#64748B', fontSize: '10px' }}>
                                        (Found in Master)
                                    </div>
                                </div>

                                <div style={{ color: '#64748B', fontSize: '24px', fontWeight: 300 }}>+</div>

                                {/* Orphan Batches */}
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{
                                        color: report.batchReconciliation.batchesNotMatchedToFormula > 0 ? '#EF4444' : '#10B981',
                                        fontSize: '32px',
                                        fontWeight: 700
                                    }}>
                                        {report.batchReconciliation.batchesNotMatchedToFormula}
                                    </div>
                                    <div style={{ color: '#94A3B8', fontSize: '11px', fontWeight: 500 }}>
                                        NOT MATCHED
                                    </div>
                                    <div style={{ color: '#64748B', fontSize: '10px' }}>
                                        (Orphan Batches)
                                    </div>
                                </div>
                            </div>

                            {/* Reconciliation Details */}
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                                gap: '16px'
                            }}>
                                {/* Reconciled vs Mismatched */}
                                <div style={{
                                    background: 'rgba(15, 23, 42, 0.4)',
                                    borderRadius: '8px',
                                    padding: '16px'
                                }}>
                                    <div style={{ color: '#94A3B8', fontSize: '12px', marginBottom: '8px', fontWeight: 500 }}>
                                        Of Matched Batches:
                                    </div>
                                    <div style={{ display: 'flex', gap: '20px' }}>
                                        <div>
                                            <span style={{ color: '#10B981', fontSize: '20px', fontWeight: 700 }}>
                                                {report.batchReconciliation.reconciledBatchCount}
                                            </span>
                                            <span style={{ color: '#64748B', fontSize: '12px', marginLeft: '6px' }}>
                                                Reconciled ✅
                                            </span>
                                        </div>
                                        <div>
                                            <span style={{
                                                color: report.batchReconciliation.mismatchedBatchCount > 0 ? '#EF4444' : '#10B981',
                                                fontSize: '20px',
                                                fontWeight: 700
                                            }}>
                                                {report.batchReconciliation.mismatchedBatchCount}
                                            </span>
                                            <span style={{ color: '#64748B', fontSize: '12px', marginLeft: '6px' }}>
                                                Mismatched ❌
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Reconciliation Percentage */}
                                <div style={{
                                    background: 'rgba(15, 23, 42, 0.4)',
                                    borderRadius: '8px',
                                    padding: '16px',
                                    textAlign: 'center'
                                }}>
                                    <div style={{ color: '#94A3B8', fontSize: '12px', marginBottom: '8px', fontWeight: 500 }}>
                                        Batch Reconciliation Rate:
                                    </div>
                                    <div style={{
                                        color: report.batchReconciliation.reconciliationPercentage >= 90 ? '#10B981'
                                            : report.batchReconciliation.reconciliationPercentage >= 70 ? '#F59E0B'
                                                : '#EF4444',
                                        fontSize: '28px',
                                        fontWeight: 700
                                    }}>
                                        {report.batchReconciliation.reconciliationPercentage}%
                                    </div>
                                    <div style={{ color: '#64748B', fontSize: '10px' }}>
                                        of all batches fully reconciled
                                    </div>
                                </div>

                                {/* Verification Status */}
                                <div style={{
                                    background: report.batchReconciliation.allBatchesAccountedFor
                                        ? 'rgba(16, 185, 129, 0.1)'
                                        : 'rgba(239, 68, 68, 0.1)',
                                    border: `1px solid ${report.batchReconciliation.allBatchesAccountedFor ? '#10B981' : '#EF4444'}`,
                                    borderRadius: '8px',
                                    padding: '16px',
                                    textAlign: 'center'
                                }}>
                                    <div style={{ color: '#94A3B8', fontSize: '12px', marginBottom: '8px', fontWeight: 500 }}>
                                        Verification:
                                    </div>
                                    <div style={{
                                        color: report.batchReconciliation.allBatchesAccountedFor ? '#10B981' : '#EF4444',
                                        fontSize: '14px',
                                        fontWeight: 600
                                    }}>
                                        {report.batchReconciliation.batchesMatchedToFormula} + {report.batchReconciliation.batchesNotMatchedToFormula} = {report.batchReconciliation.batchesMatchedToFormula + report.batchReconciliation.batchesNotMatchedToFormula}
                                    </div>
                                    <div style={{
                                        color: report.batchReconciliation.allBatchesAccountedFor ? '#10B981' : '#EF4444',
                                        fontSize: '12px',
                                        marginTop: '4px'
                                    }}>
                                        {report.batchReconciliation.allBatchesAccountedFor
                                            ? `✅ Equals Total (${report.batchReconciliation.totalBatchesInSystem})`
                                            : `❌ Does NOT equal Total (${report.batchReconciliation.totalBatchesInSystem})`}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Recommendations */}
                    {report.recommendations.length > 0 && (
                        <CollapsibleSection
                            title="Priority Recommendations"
                            count={report.recommendations.length}
                            icon="📋"
                            defaultOpen={true}
                        >
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {report.recommendations.map((rec, idx) => (
                                    <div key={idx} style={{
                                        background: 'rgba(30, 41, 59, 0.5)',
                                        borderRadius: '8px',
                                        padding: '14px 16px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '12px'
                                    }}>
                                        <PriorityBadge priority={rec.priority} />
                                        <div style={{ flex: 1 }}>
                                            <span style={{ color: '#E2E8F0', fontSize: '13px' }}>
                                                {rec.description}
                                            </span>
                                            {rec.masterCardNo && (
                                                <span style={{
                                                    color: '#60A5FA',
                                                    fontSize: '11px',
                                                    marginLeft: '8px',
                                                    background: 'rgba(59, 130, 246, 0.2)',
                                                    padding: '2px 6px',
                                                    borderRadius: '3px'
                                                }}>
                                                    {rec.masterCardNo}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CollapsibleSection>
                    )}

                    {/* Orphan Batches */}
                    {report.orphanBatches.length > 0 && (
                        <CollapsibleSection
                            title="Orphan Batches (No Formula Master)"
                            count={report.orphanBatches.length}
                            icon="⚠️"
                            defaultOpen={true}
                        >
                            {report.orphanBatches.slice(0, 10).map((orphan, idx) => (
                                <OrphanBatchCard key={idx} orphan={orphan} />
                            ))}
                            {report.orphanBatches.length > 10 && (
                                <div style={{ color: '#64748B', fontSize: '12px', textAlign: 'center', marginTop: '12px' }}>
                                    ... and {report.orphanBatches.length - 10} more orphan product codes
                                </div>
                            )}
                        </CollapsibleSection>
                    )}

                    {/* Formula Results Filter */}
                    <div style={{ marginBottom: '16px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {[
                            { value: 'all', label: 'All Formulas' },
                            { value: 'fully_reconciled', label: '✅ Fully Reconciled' },
                            { value: 'partially_reconciled', label: '⚠️ Partially Reconciled' },
                            { value: 'not_reconciled', label: '❌ Not Reconciled' },
                            { value: 'no_batches', label: '📭 No Batches' }
                        ].map(opt => (
                            <button
                                key={opt.value}
                                onClick={() => setFilter(opt.value as typeof filter)}
                                style={{
                                    background: filter === opt.value
                                        ? 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)'
                                        : 'rgba(30, 41, 59, 0.5)',
                                    border: '1px solid',
                                    borderColor: filter === opt.value ? '#3B82F6' : 'rgba(148, 163, 184, 0.2)',
                                    color: 'white',
                                    padding: '8px 16px',
                                    borderRadius: '6px',
                                    fontSize: '12px',
                                    cursor: 'pointer'
                                }}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>

                    {/* Formula Results */}
                    <CollapsibleSection
                        title="Formula-wise Reconciliation Results"
                        count={filteredResults.length}
                        icon="📊"
                        defaultOpen={true}
                    >
                        {filteredResults.length === 0 ? (
                            <div style={{ color: '#64748B', textAlign: 'center', padding: '24px' }}>
                                No formulas match the selected filter
                            </div>
                        ) : (
                            <>
                                {/* Table Header */}
                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: '1fr 100px 100px 100px 160px',
                                    gap: '16px',
                                    padding: '12px 16px',
                                    background: 'rgba(15, 23, 42, 0.5)',
                                    borderRadius: '8px',
                                    marginBottom: '12px'
                                }}>
                                    <div style={{ color: '#64748B', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase' }}>
                                        Formula Details
                                    </div>
                                    <div style={{ color: '#64748B', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', textAlign: 'center' }}>
                                        Total
                                    </div>
                                    <div style={{ color: '#64748B', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', textAlign: 'center' }}>
                                        Reconciled
                                    </div>
                                    <div style={{ color: '#64748B', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', textAlign: 'center' }}>
                                        Mismatched
                                    </div>
                                    <div style={{ color: '#64748B', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', textAlign: 'right' }}>
                                        Status
                                    </div>
                                </div>

                                {/* Results */}
                                {filteredResults.map((result, idx) => (
                                    <FormulaResultCard key={result.formulaId || idx} result={result} />
                                ))}
                            </>
                        )}
                    </CollapsibleSection>

                    {/* Compliance Summary */}
                    <div style={{
                        marginTop: '32px',
                        background: 'rgba(30, 41, 59, 0.6)',
                        borderRadius: '12px',
                        border: '1px solid rgba(148, 163, 184, 0.1)',
                        padding: '24px'
                    }}>
                        <h3 style={{
                            color: 'white',
                            fontSize: '18px',
                            fontWeight: 600,
                            marginBottom: '16px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                        }}>
                            📝 Compliance Summary
                        </h3>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' }}>
                            <div>
                                <div style={{ color: '#94A3B8', fontSize: '13px', marginBottom: '12px', fontWeight: 600 }}>
                                    Reconciliation Breakdown
                                </div>
                                <div style={{ color: '#E2E8F0', fontSize: '14px', lineHeight: 1.8 }}>
                                    • <span style={{ color: '#10B981' }}>Fully Reconciled:</span> {report.overallStats.fullyReconciledFormulas} formulas<br />
                                    • <span style={{ color: '#F59E0B' }}>Partially Reconciled:</span> {report.overallStats.partiallyReconciledFormulas} formulas<br />
                                    • <span style={{ color: '#EF4444' }}>Not Reconciled:</span> {report.overallStats.notReconciledFormulas} formulas<br />
                                    • <span style={{ color: '#64748B' }}>No Batch Data:</span> {report.overallStats.formulasWithNoBatches} formulas
                                </div>
                            </div>

                            <div>
                                <div style={{ color: '#94A3B8', fontSize: '13px', marginBottom: '12px', fontWeight: 600 }}>
                                    Data Coverage
                                </div>
                                <div style={{ color: '#E2E8F0', fontSize: '14px', lineHeight: 1.8 }}>
                                    • Total Formulas Analyzed: {report.dataSources.formulaMasterCount}<br />
                                    • Total Batches Processed: {report.dataSources.totalBatchRecords}<br />
                                    • Unique Product Codes: {report.dataSources.uniqueProductCodes}<br />
                                    • Orphan Batches: {report.overallStats.totalOrphanBatches}
                                </div>
                            </div>

                            <div>
                                <div style={{ color: '#94A3B8', fontSize: '13px', marginBottom: '12px', fontWeight: 600 }}>
                                    Audit Result
                                </div>
                                <div style={{
                                    background: report.overallStats.complianceScore >= 80
                                        ? 'rgba(16, 185, 129, 0.2)'
                                        : report.overallStats.complianceScore >= 50
                                            ? 'rgba(245, 158, 11, 0.2)'
                                            : 'rgba(239, 68, 68, 0.2)',
                                    border: '1px solid',
                                    borderColor: report.overallStats.complianceScore >= 80
                                        ? '#10B981'
                                        : report.overallStats.complianceScore >= 50
                                            ? '#F59E0B'
                                            : '#EF4444',
                                    borderRadius: '8px',
                                    padding: '16px',
                                    textAlign: 'center'
                                }}>
                                    <div style={{
                                        fontSize: '36px',
                                        fontWeight: 700,
                                        color: report.overallStats.complianceScore >= 80
                                            ? '#10B981'
                                            : report.overallStats.complianceScore >= 50
                                                ? '#F59E0B'
                                                : '#EF4444'
                                    }}>
                                        {report.overallStats.complianceScore}%
                                    </div>
                                    <div style={{ color: '#94A3B8', fontSize: '12px', marginTop: '4px' }}>
                                        Overall Compliance Score
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
