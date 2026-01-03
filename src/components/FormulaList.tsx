'use client';

/**
 * FormulaList Component
 * Displays a list of uploaded formulas with search and pagination
 */

import React from 'react';
import type { FormulaRecord } from '@/types/formula';

interface FormulaListProps {
    formulas: FormulaRecord[];
    total: number;
    page: number;
    limit: number;
    search: string;
    onSearchChange: (search: string) => void;
    onPageChange: (page: number) => void;
    onSelect: (formula: FormulaRecord) => void;
    onDelete?: (id: string) => void;
    isLoading?: boolean;
}

export default function FormulaList({
    formulas,
    total,
    page,
    limit,
    search,
    onSearchChange,
    onPageChange,
    onSelect,
    onDelete,
    isLoading = false,
}: FormulaListProps) {
    const totalPages = Math.ceil(total / limit);

    return (
        <div>
            {/* Search Bar */}
            <div style={{
                marginBottom: '1.5rem',
                position: 'relative',
            }}>
                <input
                    type="text"
                    value={search}
                    onChange={(e) => onSearchChange(e.target.value)}
                    placeholder="Search formulas by name, code, or generic name..."
                    style={{
                        width: '100%',
                        padding: '1rem 1rem 1rem 3rem',
                        borderRadius: 'var(--radius-lg)',
                        border: '2px solid var(--border)',
                        background: 'var(--card)',
                        fontSize: '1rem',
                        color: 'var(--foreground)',
                        transition: 'all var(--transition-base)',
                        outline: 'none',
                    }}
                    onFocus={(e) => {
                        e.target.style.borderColor = 'var(--primary-500)';
                        e.target.style.boxShadow = '0 0 0 3px rgba(139, 92, 246, 0.1)';
                    }}
                    onBlur={(e) => {
                        e.target.style.borderColor = 'var(--border)';
                        e.target.style.boxShadow = 'none';
                    }}
                />
                <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--muted-foreground)"
                    strokeWidth="2"
                    style={{
                        position: 'absolute',
                        left: '1rem',
                        top: '50%',
                        transform: 'translateY(-50%)',
                    }}
                >
                    <circle cx="11" cy="11" r="8" />
                    <path d="m21 21-4.35-4.35" />
                </svg>
            </div>

            {/* Results Count */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1rem',
                padding: '0 0.25rem',
            }}>
                <span style={{ color: 'var(--muted-foreground)', fontSize: '0.875rem' }}>
                    {isLoading ? 'Loading...' : `${total} formula${total !== 1 ? 's' : ''} found`}
                </span>
                {totalPages > 1 && (
                    <span style={{ color: 'var(--muted-foreground)', fontSize: '0.875rem' }}>
                        Page {page} of {totalPages}
                    </span>
                )}
            </div>

            {/* Formula Cards */}
            {isLoading ? (
                <div style={{
                    display: 'grid',
                    gap: '1rem',
                }}>
                    {[1, 2, 3].map(i => (
                        <div
                            key={i}
                            style={{
                                padding: '1.5rem',
                                background: 'var(--card)',
                                borderRadius: 'var(--radius-lg)',
                                border: '1px solid var(--border)',
                            }}
                        >
                            <div style={{
                                height: '24px',
                                width: '60%',
                                background: 'var(--muted)',
                                borderRadius: 'var(--radius-md)',
                                marginBottom: '0.75rem',
                                animation: 'pulse 2s infinite',
                            }} />
                            <div style={{
                                height: '16px',
                                width: '40%',
                                background: 'var(--muted)',
                                borderRadius: 'var(--radius-md)',
                                animation: 'pulse 2s infinite',
                            }} />
                        </div>
                    ))}
                </div>
            ) : formulas.length === 0 ? (
                <div style={{
                    padding: '4rem 2rem',
                    textAlign: 'center',
                    background: 'var(--card)',
                    borderRadius: 'var(--radius-xl)',
                    border: '1px solid var(--border)',
                }}>
                    <div style={{
                        width: '80px',
                        height: '80px',
                        margin: '0 auto 1.5rem',
                        borderRadius: 'var(--radius-full)',
                        background: 'var(--muted)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}>
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--muted-foreground)" strokeWidth="2">
                            <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
                            <polyline points="13 2 13 9 20 9" />
                        </svg>
                    </div>
                    <h3 style={{ marginBottom: '0.5rem', color: 'var(--foreground)' }}>
                        No formulas found
                    </h3>
                    <p style={{ color: 'var(--muted-foreground)' }}>
                        {search ? 'Try adjusting your search terms' : 'Upload your first Formula Master XML'}
                    </p>
                </div>
            ) : (
                <div style={{ display: 'grid', gap: '1rem' }}>
                    {formulas.map((formula, index) => (
                        <div
                            key={formula._id}
                            className="animate-fadeInUp"
                            style={{
                                padding: '1.5rem',
                                background: formula.totalBatchCount && formula.totalBatchCount > 0
                                    ? 'linear-gradient(to right, rgba(16, 185, 129, 0.05), transparent)'
                                    : 'var(--card)',
                                borderRadius: 'var(--radius-lg)',
                                border: '1px solid var(--border)',
                                borderLeft: formula.totalBatchCount && formula.totalBatchCount > 0
                                    ? '4px solid #10b981'
                                    : '1px solid var(--border)',
                                cursor: 'pointer',
                                transition: 'all var(--transition-base)',
                                animationDelay: `${index * 0.05}s`,
                            }}
                            onClick={() => onSelect(formula)}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.borderColor = 'var(--primary-300)';
                                e.currentTarget.style.boxShadow = 'var(--shadow-lg)';
                                e.currentTarget.style.transform = 'translateY(-2px)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.borderColor = 'var(--border)';
                                e.currentTarget.style.boxShadow = 'none';
                                e.currentTarget.style.transform = 'translateY(0)';
                                // Restore green left border if it has batches
                                if (formula.totalBatchCount && formula.totalBatchCount > 0) {
                                    e.currentTarget.style.borderLeft = '4px solid #10b981';
                                }
                            }}
                        >
                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'flex-start',
                                gap: '1rem',
                            }}>
                                <div style={{ flex: 1 }}>
                                    <h3 style={{
                                        fontSize: '1.125rem',
                                        fontWeight: '600',
                                        color: 'var(--foreground)',
                                        marginBottom: '0.5rem',
                                    }}>
                                        {formula.masterFormulaDetails.productName || 'Unnamed Formula'}
                                    </h3>

                                    <div style={{
                                        display: 'flex',
                                        gap: '0.5rem',
                                        flexWrap: 'wrap',
                                        marginBottom: '0.75rem',
                                    }}>
                                        <span style={{
                                            padding: '0.25rem 0.625rem',
                                            background: 'var(--gradient-primary)',
                                            color: 'white',
                                            borderRadius: 'var(--radius-full)',
                                            fontSize: '0.75rem',
                                            fontWeight: '500',
                                        }}>
                                            {formula.masterFormulaDetails.productCode || 'N/A'}
                                        </span>
                                        {formula.masterFormulaDetails.revisionNo && (
                                            <span style={{
                                                padding: '0.25rem 0.625rem',
                                                background: 'var(--muted)',
                                                color: 'var(--muted-foreground)',
                                                borderRadius: 'var(--radius-full)',
                                                fontSize: '0.75rem',
                                            }}>
                                                Rev. {formula.masterFormulaDetails.revisionNo}
                                            </span>
                                        )}
                                        <span style={{
                                            padding: '0.25rem 0.625rem',
                                            background: formula.parsingStatus === 'success'
                                                ? 'rgba(16, 185, 129, 0.1)'
                                                : 'rgba(245, 158, 11, 0.1)',
                                            color: formula.parsingStatus === 'success'
                                                ? 'var(--success)'
                                                : 'var(--warning)',
                                            borderRadius: 'var(--radius-full)',
                                            fontSize: '0.75rem',
                                        }}>
                                            {formula.parsingStatus === 'success' ? '✓ Complete' : '⚠ Partial'}
                                        </span>
                                        {formula.totalBatchCount && formula.totalBatchCount > 0 && (
                                            <span style={{
                                                padding: '0.25rem 0.625rem',
                                                background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                                                color: 'white',
                                                borderRadius: 'var(--radius-full)',
                                                fontSize: '0.75rem',
                                                fontWeight: '600',
                                                boxShadow: '0 2px 4px rgba(16, 185, 129, 0.2)',
                                            }}>
                                                📦 {formula.totalBatchCount} Batches
                                            </span>
                                        )}
                                    </div>

                                    <div style={{
                                        display: 'flex',
                                        gap: '1.5rem',
                                        fontSize: '0.8125rem',
                                        color: 'var(--muted-foreground)',
                                    }}>
                                        <span>
                                            <strong>Generic:</strong> {formula.masterFormulaDetails.genericName || 'N/A'}
                                        </span>
                                        <span>
                                            <strong>Batch Size:</strong> {formula.batchInfo.batchSize || 'N/A'}
                                        </span>
                                    </div>
                                </div>

                                <div style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'flex-end',
                                    gap: '0.5rem',
                                }}>
                                    <span style={{
                                        fontSize: '0.75rem',
                                        color: 'var(--muted-foreground)',
                                    }}>
                                        {new Date(formula.uploadedAt).toLocaleDateString()}
                                    </span>

                                    {onDelete && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onDelete(formula._id!);
                                            }}
                                            style={{
                                                padding: '0.5rem',
                                                background: 'transparent',
                                                border: 'none',
                                                borderRadius: 'var(--radius-md)',
                                                cursor: 'pointer',
                                                color: 'var(--muted-foreground)',
                                                transition: 'all var(--transition-fast)',
                                            }}
                                            onMouseEnter={(e) => {
                                                e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                                                e.currentTarget.style.color = 'var(--error)';
                                            }}
                                            onMouseLeave={(e) => {
                                                e.currentTarget.style.background = 'transparent';
                                                e.currentTarget.style.color = 'var(--muted-foreground)';
                                            }}
                                            title="Delete formula"
                                        >
                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <polyline points="3 6 5 6 21 6" />
                                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                                <line x1="10" y1="11" x2="10" y2="17" />
                                                <line x1="14" y1="11" x2="14" y2="17" />
                                            </svg>
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && !isLoading && (
                <div style={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    gap: '0.5rem',
                    marginTop: '2rem',
                }}>
                    <button
                        onClick={() => onPageChange(page - 1)}
                        disabled={page <= 1}
                        style={{
                            padding: '0.625rem 1rem',
                            background: page <= 1 ? 'var(--muted)' : 'var(--card)',
                            color: page <= 1 ? 'var(--muted-foreground)' : 'var(--foreground)',
                            border: '1px solid var(--border)',
                            borderRadius: 'var(--radius-md)',
                            cursor: page <= 1 ? 'not-allowed' : 'pointer',
                            fontWeight: '500',
                            transition: 'all var(--transition-fast)',
                        }}
                    >
                        ← Prev
                    </button>

                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        let pageNum;
                        if (totalPages <= 5) {
                            pageNum = i + 1;
                        } else if (page <= 3) {
                            pageNum = i + 1;
                        } else if (page >= totalPages - 2) {
                            pageNum = totalPages - 4 + i;
                        } else {
                            pageNum = page - 2 + i;
                        }

                        return (
                            <button
                                key={pageNum}
                                onClick={() => onPageChange(pageNum)}
                                style={{
                                    width: '40px',
                                    height: '40px',
                                    background: pageNum === page ? 'var(--gradient-primary)' : 'var(--card)',
                                    color: pageNum === page ? 'white' : 'var(--foreground)',
                                    border: '1px solid var(--border)',
                                    borderRadius: 'var(--radius-md)',
                                    cursor: 'pointer',
                                    fontWeight: '500',
                                    transition: 'all var(--transition-fast)',
                                }}
                            >
                                {pageNum}
                            </button>
                        );
                    })}

                    <button
                        onClick={() => onPageChange(page + 1)}
                        disabled={page >= totalPages}
                        style={{
                            padding: '0.625rem 1rem',
                            background: page >= totalPages ? 'var(--muted)' : 'var(--card)',
                            color: page >= totalPages ? 'var(--muted-foreground)' : 'var(--foreground)',
                            border: '1px solid var(--border)',
                            borderRadius: 'var(--radius-md)',
                            cursor: page >= totalPages ? 'not-allowed' : 'pointer',
                            fontWeight: '500',
                            transition: 'all var(--transition-fast)',
                        }}
                    >
                        Next →
                    </button>
                </div>
            )}
        </div>
    );
}
