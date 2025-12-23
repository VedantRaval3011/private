'use client';

/**
 * Processing Logs Management Page
 * View, filter, and delete processing logs
 * Allows full reset of processing history
 * Shows detailed duplicate item information
 */

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

interface DuplicateItemDetail {
    batchNumber: string;
    itemCode: string;
    itemName: string;
    type: string;
    mfgDate?: string;
    expiryDate?: string;
    reason: string;
    existingFileName: string;
}

interface SuccessfulItemDetail {
    batchNumber: string;
    itemCode: string;
    itemName: string;
    type: string;
    mfgDate?: string;
    expiryDate?: string;
}

interface ItemLevelStats {
    totalItems: number;
    newItems: number;
    duplicateItems: number;
    duplicateDetails: DuplicateItemDetail[];
    successfulDetails: SuccessfulItemDetail[];
}

interface ProcessingLog {
    _id: string;
    contentHash: string;
    fileName: string;
    fileType: 'BATCH' | 'FORMULA' | 'UNKNOWN';
    status: 'SUCCESS' | 'DUPLICATE' | 'ERROR';
    businessKey?: string;
    errorMessage?: string;
    processedAt: string;
    fileSize: number;
    itemStats?: ItemLevelStats;
}

interface LogsResponse {
    success: boolean;
    data: ProcessingLog[];
    total: number;
    page: number;
    limit: number;
}

export default function ProcessingLogsPage() {
    const [logs, setLogs] = useState<ProcessingLog[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [limit] = useState(50);
    const [statusFilter, setStatusFilter] = useState<string>('');
    const [typeFilter, setTypeFilter] = useState<string>('');
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteMessage, setDeleteMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [showConfirmModal, setShowConfirmModal] = useState<'orphaned' | 'all' | null>(null);
    const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

    const fetchLogs = useCallback(async () => {
        setIsLoading(true);
        try {
            const params = new URLSearchParams({
                page: page.toString(),
                limit: limit.toString(),
            });
            if (statusFilter) params.append('status', statusFilter);
            if (typeFilter) params.append('fileType', typeFilter);

            const response = await fetch(`/api/ingestion/logs?${params}`);
            const data: LogsResponse = await response.json();
            if (data.success) {
                setLogs(data.data);
                setTotal(data.total);
            }
        } catch (error) {
            console.error('Error fetching logs:', error);
        } finally {
            setIsLoading(false);
        }
    }, [page, limit, statusFilter, typeFilter]);

    useEffect(() => {
        fetchLogs();
    }, [fetchLogs]);

    const handleDeleteOrphaned = async () => {
        setIsDeleting(true);
        setDeleteMessage(null);
        setShowConfirmModal(null);
        try {
            const response = await fetch('/api/ingestion/logs', { method: 'DELETE' });
            const data = await response.json();
            if (data.success) {
                setDeleteMessage({ type: 'success', text: data.message });
                fetchLogs();
            } else {
                setDeleteMessage({ type: 'error', text: data.error || 'Failed to clean up logs' });
            }
        } catch (error) {
            setDeleteMessage({ type: 'error', text: 'Network error while cleaning up logs' });
        } finally {
            setIsDeleting(false);
        }
    };

    const handleDeleteAll = async () => {
        setIsDeleting(true);
        setDeleteMessage(null);
        setShowConfirmModal(null);
        try {
            const response = await fetch('/api/ingestion/logs?deleteAll=true', { method: 'DELETE' });
            const data = await response.json();
            if (data.success) {
                setDeleteMessage({ type: 'success', text: data.message });
                fetchLogs();
            } else {
                setDeleteMessage({ type: 'error', text: data.error || 'Failed to delete logs' });
            }
        } catch (error) {
            setDeleteMessage({ type: 'error', text: 'Network error while deleting logs' });
        } finally {
            setIsDeleting(false);
        }
    };

    const formatFileSize = (bytes: number) => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    };

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const getStatusBadge = (status: string) => {
        const styles: Record<string, { bg: string; color: string }> = {
            SUCCESS: { bg: 'rgba(34, 197, 94, 0.15)', color: '#22c55e' },
            DUPLICATE: { bg: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b' },
            ERROR: { bg: 'rgba(239, 68, 68, 0.15)', color: '#ef4444' },
        };
        const style = styles[status] || { bg: 'var(--muted)', color: 'var(--muted-foreground)' };
        return (
            <span style={{
                padding: '0.25rem 0.625rem',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.7rem',
                fontWeight: '600',
                background: style.bg,
                color: style.color,
            }}>
                {status}
            </span>
        );
    };

    const getTypeBadge = (type: string) => {
        const styles: Record<string, { bg: string; color: string }> = {
            BATCH: { bg: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6' },
            FORMULA: { bg: 'rgba(139, 92, 246, 0.15)', color: '#8b5cf6' },
            UNKNOWN: { bg: 'var(--muted)', color: 'var(--muted-foreground)' },
        };
        const style = styles[type] || { bg: 'var(--muted)', color: 'var(--muted-foreground)' };
        return (
            <span style={{
                padding: '0.25rem 0.625rem',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.7rem',
                fontWeight: '600',
                background: style.bg,
                color: style.color,
            }}>
                {type}
            </span>
        );
    };

    const totalPages = Math.ceil(total / limit);

    return (
        <div style={{ minHeight: '100vh', background: 'var(--background)' }}>
            {/* Header */}
            <header style={{
                background: 'linear-gradient(135deg, #ef4444 0%, #f97316 100%)',
                padding: '2rem 0',
                position: 'relative',
                overflow: 'hidden',
            }}>
                <div style={{
                    position: 'absolute',
                    top: '-50%',
                    right: '-10%',
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
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
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
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                    <polyline points="14 2 14 8 20 8" />
                                    <line x1="16" y1="13" x2="8" y2="13" />
                                    <line x1="16" y1="17" x2="8" y2="17" />
                                    <polyline points="10 9 9 9 8 9" />
                                </svg>
                                Processing Logs
                            </h1>
                            <p style={{ color: 'rgba(255, 255, 255, 0.8)', fontSize: '1rem' }}>
                                {total} log entries • Manage file processing history
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
                {/* Alert Message */}
                {deleteMessage && (
                    <div style={{
                        padding: '1rem 1.5rem',
                        marginBottom: '1.5rem',
                        borderRadius: 'var(--radius-lg)',
                        background: deleteMessage.type === 'success' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                        border: `1px solid ${deleteMessage.type === 'success' ? '#22c55e' : '#ef4444'}`,
                        color: deleteMessage.type === 'success' ? '#22c55e' : '#ef4444',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                    }}>
                        <span style={{ fontSize: '1.25rem' }}>{deleteMessage.type === 'success' ? '✓' : '✕'}</span>
                        {deleteMessage.text}
                        <button
                            onClick={() => setDeleteMessage(null)}
                            style={{
                                marginLeft: 'auto',
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                color: 'inherit',
                                fontSize: '1.25rem',
                            }}
                        >
                            ×
                        </button>
                    </div>
                )}

                {/* Actions & Filters Bar */}
                <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '1rem',
                    marginBottom: '1.5rem',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                }}>
                    {/* Filters */}
                    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <select
                            value={statusFilter}
                            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                            style={{
                                padding: '0.625rem 1rem',
                                borderRadius: 'var(--radius-md)',
                                border: '1px solid var(--border)',
                                background: 'var(--card)',
                                color: 'var(--foreground)',
                                cursor: 'pointer',
                            }}
                        >
                            <option value="">All Statuses</option>
                            <option value="SUCCESS">Success</option>
                            <option value="DUPLICATE">Duplicate</option>
                            <option value="ERROR">Error</option>
                        </select>
                        <select
                            value={typeFilter}
                            onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
                            style={{
                                padding: '0.625rem 1rem',
                                borderRadius: 'var(--radius-md)',
                                border: '1px solid var(--border)',
                                background: 'var(--card)',
                                color: 'var(--foreground)',
                                cursor: 'pointer',
                            }}
                        >
                            <option value="">All Types</option>
                            <option value="BATCH">Batch</option>
                            <option value="FORMULA">Formula</option>
                        </select>
                        <button
                            onClick={fetchLogs}
                            disabled={isLoading}
                            style={{
                                padding: '0.625rem 1rem',
                                borderRadius: 'var(--radius-md)',
                                border: '1px solid var(--border)',
                                background: 'var(--card)',
                                color: 'var(--foreground)',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                            }}
                        >
                            🔄 Refresh
                        </button>
                    </div>

                    {/* Delete Actions */}
                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                        <button
                            onClick={() => setShowConfirmModal('orphaned')}
                            disabled={isDeleting}
                            style={{
                                padding: '0.625rem 1.25rem',
                                borderRadius: 'var(--radius-md)',
                                border: 'none',
                                background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                                color: 'white',
                                cursor: 'pointer',
                                fontWeight: '500',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                opacity: isDeleting ? 0.7 : 1,
                            }}
                        >
                            🧹 Clean Orphaned Logs
                        </button>
                        <button
                            onClick={() => setShowConfirmModal('all')}
                            disabled={isDeleting}
                            style={{
                                padding: '0.625rem 1.25rem',
                                borderRadius: 'var(--radius-md)',
                                border: 'none',
                                background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                                color: 'white',
                                cursor: 'pointer',
                                fontWeight: '500',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                opacity: isDeleting ? 0.7 : 1,
                            }}
                        >
                            🗑️ Delete ALL Logs
                        </button>
                    </div>
                </div>

                {/* Info Cards */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '1rem',
                    marginBottom: '1.5rem',
                }}>
                    {[
                        { label: 'Total Logs', value: total, color: '#3b82f6', icon: '📋' },
                        { label: 'Success', value: logs.filter(l => l.status === 'SUCCESS').length, color: '#22c55e', icon: '✓' },
                        { label: 'Duplicates', value: logs.filter(l => l.status === 'DUPLICATE').length, color: '#f59e0b', icon: '⚠' },
                        { label: 'Errors', value: logs.filter(l => l.status === 'ERROR').length, color: '#ef4444', icon: '✕' },
                    ].map((stat) => (
                        <div key={stat.label} style={{
                            background: 'var(--card)',
                            borderRadius: 'var(--radius-lg)',
                            padding: '1.25rem',
                            border: '1px solid var(--border)',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <span style={{ fontSize: '1.5rem' }}>{stat.icon}</span>
                                <div>
                                    <div style={{ fontSize: '0.85rem', color: 'var(--muted-foreground)' }}>{stat.label}</div>
                                    <div style={{ fontSize: '1.5rem', fontWeight: '700', color: stat.color }}>{stat.value}</div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Logs Table */}
                {isLoading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
                        <svg className="animate-spin" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
                            <path d="M21 12a9 9 0 11-6.219-8.56" strokeLinecap="round" />
                        </svg>
                    </div>
                ) : (
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
                                        <th style={{ ...thStyle, width: '30px' }}></th>
                                        <th style={thStyle}>Status</th>
                                        <th style={thStyle}>Type</th>
                                        <th style={thStyle}>File Name</th>
                                        <th style={thStyle}>Items</th>
                                        <th style={thStyle}>Size</th>
                                        <th style={thStyle}>Processed At</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {logs.length === 0 ? (
                                        <tr>
                                            <td colSpan={7} style={{ ...tdStyle, textAlign: 'center', padding: '3rem', color: 'var(--muted-foreground)' }}>
                                                No processing logs found
                                            </td>
                                        </tr>
                                    ) : (
                                        logs.map((log, index) => (
                                            <React.Fragment key={log._id}>
                                                <tr
                                                    style={{
                                                        background: index % 2 === 0 ? 'transparent' : 'var(--muted)',
                                                        cursor: log.itemStats && (log.itemStats.duplicateItems > 0 || log.itemStats.newItems > 0) ? 'pointer' : 'default',
                                                    }}
                                                    onClick={() => {
                                                        if (log.itemStats && (log.itemStats.duplicateItems > 0 || log.itemStats.newItems > 0)) {
                                                            setExpandedLogId(expandedLogId === log._id ? null : log._id);
                                                        }
                                                    }}
                                                >
                                                    <td style={tdStyle}>
                                                        {log.itemStats && (log.itemStats.duplicateItems > 0 || log.itemStats.newItems > 0) && (
                                                            <span style={{
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                width: '20px',
                                                                height: '20px',
                                                                fontSize: '0.75rem',
                                                                transition: 'transform 0.2s',
                                                                transform: expandedLogId === log._id ? 'rotate(90deg)' : 'rotate(0deg)',
                                                            }}>
                                                                ▶
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td style={tdStyle}>{getStatusBadge(log.status)}</td>
                                                    <td style={tdStyle}>{getTypeBadge(log.fileType)}</td>
                                                    <td style={{ ...tdStyle, maxWidth: '250px' }}>
                                                        <span style={{
                                                            display: 'block',
                                                            overflow: 'hidden',
                                                            textOverflow: 'ellipsis',
                                                            whiteSpace: 'nowrap',
                                                        }}>
                                                            {log.fileName}
                                                        </span>
                                                    </td>
                                                    <td style={tdStyle}>
                                                        {log.itemStats ? (
                                                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                                                {log.itemStats.newItems > 0 && (
                                                                    <span style={{
                                                                        padding: '0.2rem 0.5rem',
                                                                        background: 'rgba(34, 197, 94, 0.15)',
                                                                        color: '#22c55e',
                                                                        borderRadius: 'var(--radius-sm)',
                                                                        fontSize: '0.7rem',
                                                                        fontWeight: '600',
                                                                    }}>
                                                                        {log.itemStats.newItems} new
                                                                    </span>
                                                                )}
                                                                {log.itemStats.duplicateItems > 0 && (
                                                                    <span style={{
                                                                        padding: '0.2rem 0.5rem',
                                                                        background: 'rgba(245, 158, 11, 0.15)',
                                                                        color: '#f59e0b',
                                                                        borderRadius: 'var(--radius-sm)',
                                                                        fontSize: '0.7rem',
                                                                        fontWeight: '600',
                                                                    }}>
                                                                        {log.itemStats.duplicateItems} skipped
                                                                    </span>
                                                                )}
                                                            </div>
                                                        ) : '-'}
                                                    </td>
                                                    <td style={tdStyle}>{formatFileSize(log.fileSize)}</td>
                                                    <td style={{ ...tdStyle, fontSize: '0.85rem' }}>{formatDate(log.processedAt)}</td>
                                                </tr>

                                                {/* Expanded item details row */}
                                                {expandedLogId === log._id && log.itemStats && (
                                                    <tr>
                                                        <td colSpan={7} style={{
                                                            padding: 0,
                                                            background: 'rgba(59, 130, 246, 0.03)',
                                                            borderBottom: '2px solid var(--border)',
                                                        }}>
                                                            <div style={{ padding: '1.5rem' }}>
                                                                {/* Successfully Processed Items */}
                                                                {log.itemStats.successfulDetails && log.itemStats.successfulDetails.length > 0 && (
                                                                    <div style={{ marginBottom: log.itemStats.duplicateDetails.length > 0 ? '1.5rem' : '0' }}>
                                                                        <h4 style={{
                                                                            margin: '0 0 0.75rem 0',
                                                                            fontSize: '0.875rem',
                                                                            fontWeight: '600',
                                                                            color: '#22c55e',
                                                                            display: 'flex',
                                                                            alignItems: 'center',
                                                                            gap: '0.5rem',
                                                                        }}>
                                                                            ✓ Successfully Processed Items ({log.itemStats.newItems} items)
                                                                        </h4>
                                                                        <div style={{
                                                                            maxHeight: '300px',
                                                                            overflowY: 'auto',
                                                                            borderRadius: 'var(--radius-md)',
                                                                            border: '1px solid rgba(34, 197, 94, 0.3)',
                                                                            background: 'var(--card)',
                                                                        }}>
                                                                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                                                                <thead>
                                                                                    <tr style={{ background: 'rgba(34, 197, 94, 0.1)', position: 'sticky', top: 0 }}>
                                                                                        <th style={{ ...thStyle, padding: '0.5rem 0.75rem' }}>Batch #</th>
                                                                                        <th style={{ ...thStyle, padding: '0.5rem 0.75rem' }}>Item Code</th>
                                                                                        <th style={{ ...thStyle, padding: '0.5rem 0.75rem' }}>Item Name</th>
                                                                                        <th style={{ ...thStyle, padding: '0.5rem 0.75rem' }}>Type</th>
                                                                                        <th style={{ ...thStyle, padding: '0.5rem 0.75rem' }}>Mfg Date</th>
                                                                                        <th style={{ ...thStyle, padding: '0.5rem 0.75rem' }}>Expiry Date</th>
                                                                                    </tr>
                                                                                </thead>
                                                                                <tbody>
                                                                                    {log.itemStats.successfulDetails.map((item, itemIndex) => (
                                                                                        <tr key={itemIndex} style={{ background: itemIndex % 2 === 0 ? 'transparent' : 'var(--muted)' }}>
                                                                                            <td style={{ ...tdStyle, padding: '0.5rem 0.75rem', fontFamily: 'monospace' }}>
                                                                                                {item.batchNumber}
                                                                                            </td>
                                                                                            <td style={{ ...tdStyle, padding: '0.5rem 0.75rem', fontFamily: 'monospace' }}>
                                                                                                {item.itemCode}
                                                                                            </td>
                                                                                            <td style={{ ...tdStyle, padding: '0.5rem 0.75rem', maxWidth: '200px' }}>
                                                                                                <span style={{
                                                                                                    display: 'block',
                                                                                                    overflow: 'hidden',
                                                                                                    textOverflow: 'ellipsis',
                                                                                                    whiteSpace: 'nowrap',
                                                                                                }}>
                                                                                                    {item.itemName}
                                                                                                </span>
                                                                                            </td>
                                                                                            <td style={{ ...tdStyle, padding: '0.5rem 0.75rem' }}>
                                                                                                <span style={{
                                                                                                    display: 'inline-block',
                                                                                                    padding: '0.15rem 0.5rem',
                                                                                                    background: item.type === 'Export' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(139, 92, 246, 0.1)',
                                                                                                    color: item.type === 'Export' ? '#3b82f6' : '#8b5cf6',
                                                                                                    borderRadius: 'var(--radius-sm)',
                                                                                                    fontSize: '0.7rem',
                                                                                                    fontWeight: '500',
                                                                                                }}>
                                                                                                    {item.type}
                                                                                                </span>
                                                                                            </td>
                                                                                            <td style={{ ...tdStyle, padding: '0.5rem 0.75rem', fontSize: '0.75rem' }}>
                                                                                                {item.mfgDate || '-'}
                                                                                            </td>
                                                                                            <td style={{ ...tdStyle, padding: '0.5rem 0.75rem', fontSize: '0.75rem' }}>
                                                                                                {item.expiryDate || '-'}
                                                                                            </td>
                                                                                        </tr>
                                                                                    ))}
                                                                                </tbody>
                                                                            </table>
                                                                        </div>
                                                                    </div>
                                                                )}

                                                                {/* Skipped Duplicates */}
                                                                {log.itemStats.duplicateDetails.length > 0 && (
                                                                    <div>
                                                                        <h4 style={{
                                                                            margin: '0 0 0.75rem 0',
                                                                            fontSize: '0.875rem',
                                                                            fontWeight: '600',
                                                                            color: '#f59e0b',
                                                                            display: 'flex',
                                                                            alignItems: 'center',
                                                                            gap: '0.5rem',
                                                                        }}>
                                                                            ⚠ Skipped Duplicates ({log.itemStats.duplicateItems} items)
                                                                        </h4>
                                                                        <div style={{
                                                                            maxHeight: '300px',
                                                                            overflowY: 'auto',
                                                                            borderRadius: 'var(--radius-md)',
                                                                            border: '1px solid rgba(245, 158, 11, 0.3)',
                                                                            background: 'var(--card)',
                                                                        }}>
                                                                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                                                                <thead>
                                                                                    <tr style={{ background: 'rgba(245, 158, 11, 0.1)', position: 'sticky', top: 0 }}>
                                                                                        <th style={{ ...thStyle, padding: '0.5rem 0.75rem' }}>Batch #</th>
                                                                                        <th style={{ ...thStyle, padding: '0.5rem 0.75rem' }}>Item Code</th>
                                                                                        <th style={{ ...thStyle, padding: '0.5rem 0.75rem' }}>Item Name</th>
                                                                                        <th style={{ ...thStyle, padding: '0.5rem 0.75rem' }}>Type</th>
                                                                                        <th style={{ ...thStyle, padding: '0.5rem 0.75rem' }}>Mfg Date</th>
                                                                                        <th style={{ ...thStyle, padding: '0.5rem 0.75rem' }}>Expiry Date</th>
                                                                                        <th style={{ ...thStyle, padding: '0.5rem 0.75rem' }}>Reason</th>
                                                                                        <th style={{ ...thStyle, padding: '0.5rem 0.75rem' }}>Found In File</th>
                                                                                    </tr>
                                                                                </thead>
                                                                                <tbody>
                                                                                    {log.itemStats.duplicateDetails.map((dup, dupIndex) => (
                                                                                        <tr key={dupIndex} style={{ background: dupIndex % 2 === 0 ? 'transparent' : 'var(--muted)' }}>
                                                                                            <td style={{ ...tdStyle, padding: '0.5rem 0.75rem', fontFamily: 'monospace' }}>
                                                                                                {dup.batchNumber}
                                                                                            </td>
                                                                                            <td style={{ ...tdStyle, padding: '0.5rem 0.75rem', fontFamily: 'monospace' }}>
                                                                                                {dup.itemCode}
                                                                                            </td>
                                                                                            <td style={{ ...tdStyle, padding: '0.5rem 0.75rem' }}>
                                                                                                {dup.itemName}
                                                                                            </td>
                                                                                            <td style={{ ...tdStyle, padding: '0.5rem 0.75rem' }}>
                                                                                                <span style={{
                                                                                                    display: 'inline-block',
                                                                                                    padding: '0.15rem 0.5rem',
                                                                                                    background: dup.type === 'Export' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(139, 92, 246, 0.1)',
                                                                                                    color: dup.type === 'Export' ? '#3b82f6' : '#8b5cf6',
                                                                                                    borderRadius: 'var(--radius-sm)',
                                                                                                    fontSize: '0.7rem',
                                                                                                    fontWeight: '500',
                                                                                                }}>
                                                                                                    {dup.type}
                                                                                                </span>
                                                                                            </td>
                                                                                            <td style={{ ...tdStyle, padding: '0.5rem 0.75rem', fontSize: '0.75rem' }}>
                                                                                                {dup.mfgDate || '-'}
                                                                                            </td>
                                                                                            <td style={{ ...tdStyle, padding: '0.5rem 0.75rem', fontSize: '0.75rem' }}>
                                                                                                {dup.expiryDate || '-'}
                                                                                            </td>
                                                                                            <td style={{ ...tdStyle, padding: '0.5rem 0.75rem', color: '#f59e0b' }}>
                                                                                                {dup.reason}
                                                                                            </td>
                                                                                            <td style={{ ...tdStyle, padding: '0.5rem 0.75rem' }}>
                                                                                                <span style={{
                                                                                                    display: 'inline-block',
                                                                                                    padding: '0.15rem 0.5rem',
                                                                                                    background: 'rgba(59, 130, 246, 0.1)',
                                                                                                    color: '#3b82f6',
                                                                                                    borderRadius: 'var(--radius-sm)',
                                                                                                    fontSize: '0.7rem',
                                                                                                    fontWeight: '500',
                                                                                                }}>
                                                                                                    {dup.existingFileName}
                                                                                                </span>
                                                                                            </td>
                                                                                        </tr>
                                                                                    ))}
                                                                                </tbody>
                                                                            </table>
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </React.Fragment>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination */}
                        {totalPages > 1 && (
                            <div style={{
                                display: 'flex',
                                justifyContent: 'center',
                                alignItems: 'center',
                                gap: '0.5rem',
                                padding: '1rem',
                                borderTop: '1px solid var(--border)',
                            }}>
                                <button
                                    onClick={() => setPage(p => Math.max(1, p - 1))}
                                    disabled={page === 1}
                                    style={{
                                        padding: '0.5rem 1rem',
                                        borderRadius: 'var(--radius-md)',
                                        border: '1px solid var(--border)',
                                        background: page === 1 ? 'var(--muted)' : 'var(--card)',
                                        color: 'var(--foreground)',
                                        cursor: page === 1 ? 'not-allowed' : 'pointer',
                                        opacity: page === 1 ? 0.5 : 1,
                                    }}
                                >
                                    ← Previous
                                </button>
                                <span style={{ padding: '0 1rem', color: 'var(--muted-foreground)' }}>
                                    Page {page} of {totalPages}
                                </span>
                                <button
                                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                    disabled={page === totalPages}
                                    style={{
                                        padding: '0.5rem 1rem',
                                        borderRadius: 'var(--radius-md)',
                                        border: '1px solid var(--border)',
                                        background: page === totalPages ? 'var(--muted)' : 'var(--card)',
                                        color: 'var(--foreground)',
                                        cursor: page === totalPages ? 'not-allowed' : 'pointer',
                                        opacity: page === totalPages ? 0.5 : 1,
                                    }}
                                >
                                    Next →
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </main>

            {/* Confirmation Modal */}
            {showConfirmModal && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0, 0, 0, 0.5)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1000,
                }}>
                    <div style={{
                        background: 'var(--card)',
                        borderRadius: 'var(--radius-xl)',
                        padding: '2rem',
                        maxWidth: '450px',
                        width: '90%',
                        boxShadow: 'var(--shadow-xl)',
                    }}>
                        <h3 style={{
                            fontSize: '1.25rem',
                            fontWeight: '600',
                            marginBottom: '1rem',
                            color: showConfirmModal === 'all' ? '#ef4444' : '#f59e0b',
                        }}>
                            {showConfirmModal === 'all' ? '⚠️ Delete ALL Processing Logs?' : '🧹 Clean Orphaned Logs?'}
                        </h3>
                        <p style={{ color: 'var(--muted-foreground)', marginBottom: '1.5rem', lineHeight: 1.6 }}>
                            {showConfirmModal === 'all' ? (
                                <>
                                    This will <strong>permanently delete ALL {total} processing log(s)</strong>.
                                    This action cannot be undone. After deletion, all files will be
                                    considered as &quot;new&quot; and can be re-processed.
                                </>
                            ) : (
                                <>
                                    This will remove processing logs where the corresponding Batch/Formula
                                    records have been deleted. This allows those files to be re-ingested.
                                </>
                            )}
                        </p>
                        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                            <button
                                onClick={() => setShowConfirmModal(null)}
                                style={{
                                    padding: '0.625rem 1.25rem',
                                    borderRadius: 'var(--radius-md)',
                                    border: '1px solid var(--border)',
                                    background: 'var(--card)',
                                    color: 'var(--foreground)',
                                    cursor: 'pointer',
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={showConfirmModal === 'all' ? handleDeleteAll : handleDeleteOrphaned}
                                style={{
                                    padding: '0.625rem 1.25rem',
                                    borderRadius: 'var(--radius-md)',
                                    border: 'none',
                                    background: showConfirmModal === 'all'
                                        ? 'linear-gradient(135deg, #ef4444, #dc2626)'
                                        : 'linear-gradient(135deg, #f59e0b, #d97706)',
                                    color: 'white',
                                    cursor: 'pointer',
                                    fontWeight: '500',
                                }}
                            >
                                {showConfirmModal === 'all' ? 'Delete All Logs' : 'Clean Orphaned Logs'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// Table styles
const thStyle: React.CSSProperties = {
    padding: '0.75rem 0.75rem',
    textAlign: 'left',
    fontWeight: '600',
    color: 'var(--foreground)',
    whiteSpace: 'nowrap',
    borderBottom: '1px solid var(--border)',
};

const tdStyle: React.CSSProperties = {
    padding: '0.625rem 0.75rem',
    borderBottom: '1px solid var(--border)',
    color: 'var(--foreground)',
};
