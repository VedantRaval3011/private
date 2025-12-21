'use client';

/**
 * BatchFileUpload Component
 * Drag-and-drop file upload for Batch Registry XML
 * Supports multiple file selection
 */

import React, { useState, useRef, useCallback } from 'react';

interface SelectedFile {
    file: File;
    status: 'pending' | 'parsing' | 'success' | 'error';
    message?: string;
}

interface BatchFileUploadProps {
    onFilesSelect: (files: File[]) => void;
    isLoading?: boolean;
    accept?: string;
    maxSize?: number;
    selectedFiles?: SelectedFile[];
    onRemoveFile?: (index: number) => void;
}

export default function BatchFileUpload({
    onFilesSelect,
    isLoading = false,
    accept = '.xml',
    maxSize = 10 * 1024 * 1024, // 10MB
    selectedFiles = [],
    onRemoveFile,
}: BatchFileUploadProps) {
    const [isDragging, setIsDragging] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const validateFile = (file: File): boolean => {
        if (!file.name.toLowerCase().endsWith('.xml')) {
            return false;
        }

        if (file.size > maxSize) {
            return false;
        }

        return true;
    };

    const handleFiles = (files: FileList) => {
        setError(null);
        const validFiles: File[] = [];
        const errors: string[] = [];

        Array.from(files).forEach((file) => {
            if (!file.name.toLowerCase().endsWith('.xml')) {
                errors.push(`${file.name}: Invalid file type (must be XML)`);
            } else if (file.size > maxSize) {
                errors.push(`${file.name}: File too large (max ${maxSize / (1024 * 1024)}MB)`);
            } else {
                validFiles.push(file);
            }
        });

        if (errors.length > 0) {
            setError(errors.join('\n'));
        }

        if (validFiles.length > 0) {
            onFilesSelect(validFiles);
        }
    };

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);

        if (e.dataTransfer.files.length > 0) {
            handleFiles(e.dataTransfer.files);
        }
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            handleFiles(e.target.files);
        }
        // Reset input so same file can be selected again
        if (inputRef.current) {
            inputRef.current.value = '';
        }
    };

    const formatFileSize = (bytes: number): string => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    };

    return (
        <div className="w-full">
            <div
                onClick={() => inputRef.current?.click()}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                style={{
                    position: 'relative',
                    padding: '3rem 2rem',
                    borderRadius: 'var(--radius-xl)',
                    border: `2px dashed ${isDragging ? 'var(--accent-500)' : 'var(--border)'}`,
                    background: isDragging
                        ? 'linear-gradient(135deg, rgba(20, 184, 166, 0.1) 0%, rgba(6, 182, 212, 0.1) 100%)'
                        : 'var(--card)',
                    cursor: isLoading ? 'not-allowed' : 'pointer',
                    transition: 'all var(--transition-base)',
                    textAlign: 'center',
                    boxShadow: isDragging ? '0 0 20px rgba(20, 184, 166, 0.3)' : 'var(--shadow-md)',
                }}
            >
                <input
                    ref={inputRef}
                    type="file"
                    accept={accept}
                    multiple
                    onChange={handleChange}
                    disabled={isLoading}
                    style={{ display: 'none' }}
                />

                {/* Upload Icon - Different gradient for batch */}
                <div style={{
                    width: '80px',
                    height: '80px',
                    margin: '0 auto 1.5rem',
                    borderRadius: 'var(--radius-full)',
                    background: 'linear-gradient(135deg, #14b8a6 0%, #06b6d4 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 10px 40px rgba(20, 184, 166, 0.3)',
                }}>
                    {isLoading ? (
                        <svg
                            className="animate-spin"
                            width="40"
                            height="40"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="white"
                            strokeWidth="2"
                        >
                            <path d="M21 12a9 9 0 11-6.219-8.56" strokeLinecap="round" />
                        </svg>
                    ) : (
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" strokeLinecap="round" strokeLinejoin="round" />
                            <line x1="12" y1="6" x2="12" y2="14" strokeLinecap="round" strokeLinejoin="round" />
                            <polyline points="9 9 12 6 15 9" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    )}
                </div>

                <h3 style={{
                    fontSize: '1.25rem',
                    fontWeight: '600',
                    color: 'var(--foreground)',
                    marginBottom: '0.5rem'
                }}>
                    {isLoading ? 'Processing...' : 'Upload Batch Creation XMLs'}
                </h3>

                <p style={{ color: 'var(--muted-foreground)', marginBottom: '1rem' }}>
                    {isDragging
                        ? 'Drop your batch files here'
                        : 'Drag and drop multiple Batch Registry XML files here, or click to browse'}
                </p>

                <div style={{
                    display: 'inline-flex',
                    gap: '1rem',
                    fontSize: '0.875rem',
                    color: 'var(--muted-foreground)',
                    flexWrap: 'wrap',
                    justifyContent: 'center',
                }}>
                    <span style={{
                        padding: '0.25rem 0.75rem',
                        background: 'rgba(20, 184, 166, 0.1)',
                        borderRadius: 'var(--radius-full)',
                        color: '#14b8a6',
                    }}>
                        BATCHCRREGI format
                    </span>
                    <span style={{
                        padding: '0.25rem 0.75rem',
                        background: 'var(--muted)',
                        borderRadius: 'var(--radius-full)',
                    }}>
                        Max 10MB per file
                    </span>
                    <span style={{
                        padding: '0.25rem 0.75rem',
                        background: 'rgba(20, 184, 166, 0.15)',
                        borderRadius: 'var(--radius-full)',
                        color: '#14b8a6',
                        fontWeight: '500',
                    }}>
                        Multiple files supported
                    </span>
                </div>

                {/* Decorative Elements */}
                <div style={{
                    position: 'absolute',
                    top: '10%',
                    left: '5%',
                    width: '60px',
                    height: '60px',
                    background: 'rgba(20, 184, 166, 0.2)',
                    borderRadius: 'var(--radius-full)',
                    opacity: 0.5,
                    filter: 'blur(20px)',
                }} />
                <div style={{
                    position: 'absolute',
                    bottom: '10%',
                    right: '5%',
                    width: '80px',
                    height: '80px',
                    background: 'rgba(6, 182, 212, 0.2)',
                    borderRadius: 'var(--radius-full)',
                    opacity: 0.5,
                    filter: 'blur(25px)',
                }} />
            </div>

            {/* Selected Files List */}
            {selectedFiles.length > 0 && (
                <div style={{
                    marginTop: '1.5rem',
                    padding: '1rem',
                    borderRadius: 'var(--radius-lg)',
                    background: 'var(--card)',
                    border: '1px solid var(--border)',
                }}>
                    <h4 style={{
                        fontSize: '0.875rem',
                        fontWeight: '600',
                        color: 'var(--foreground)',
                        marginBottom: '0.75rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                    }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                        </svg>
                        Selected Files ({selectedFiles.length})
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {selectedFiles.map((item, index) => (
                            <div
                                key={`${item.file.name}-${index}`}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '0.75rem 1rem',
                                    borderRadius: 'var(--radius-md)',
                                    background: item.status === 'success'
                                        ? 'rgba(16, 185, 129, 0.1)'
                                        : item.status === 'error'
                                            ? 'rgba(239, 68, 68, 0.1)'
                                            : item.status === 'parsing'
                                                ? 'rgba(20, 184, 166, 0.1)'
                                                : 'var(--muted)',
                                    border: `1px solid ${item.status === 'success'
                                        ? 'rgba(16, 185, 129, 0.3)'
                                        : item.status === 'error'
                                            ? 'rgba(239, 68, 68, 0.3)'
                                            : item.status === 'parsing'
                                                ? 'rgba(20, 184, 166, 0.3)'
                                                : 'var(--border)'}`,
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, minWidth: 0 }}>
                                    {/* Status Icon */}
                                    {item.status === 'success' && (
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2">
                                            <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
                                            <polyline points="22 4 12 14.01 9 11.01" />
                                        </svg>
                                    )}
                                    {item.status === 'error' && (
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
                                            <circle cx="12" cy="12" r="10" />
                                            <line x1="15" y1="9" x2="9" y2="15" />
                                            <line x1="9" y1="9" x2="15" y2="15" />
                                        </svg>
                                    )}
                                    {item.status === 'parsing' && (
                                        <svg className="animate-spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#14b8a6" strokeWidth="2">
                                            <path d="M21 12a9 9 0 11-6.219-8.56" strokeLinecap="round" />
                                        </svg>
                                    )}
                                    {item.status === 'pending' && (
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--muted-foreground)" strokeWidth="2">
                                            <circle cx="12" cy="12" r="10" />
                                            <polyline points="12 6 12 12 16 14" />
                                        </svg>
                                    )}

                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <p style={{
                                            fontSize: '0.875rem',
                                            fontWeight: '500',
                                            color: 'var(--foreground)',
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                        }}>
                                            {item.file.name}
                                        </p>
                                        <div style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.5rem',
                                            fontSize: '0.75rem',
                                            color: 'var(--muted-foreground)',
                                        }}>
                                            <span>{formatFileSize(item.file.size)}</span>
                                            {item.message && (
                                                <>
                                                    <span>•</span>
                                                    <span style={{
                                                        color: item.status === 'success' ? '#10b981'
                                                            : item.status === 'error' ? '#ef4444'
                                                                : 'var(--muted-foreground)',
                                                    }}>
                                                        {item.message}
                                                    </span>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Remove Button */}
                                {onRemoveFile && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onRemoveFile(index);
                                        }}
                                        disabled={item.status === 'parsing'}
                                        style={{
                                            padding: '0.375rem',
                                            background: 'transparent',
                                            border: 'none',
                                            borderRadius: 'var(--radius-sm)',
                                            cursor: item.status === 'parsing' ? 'not-allowed' : 'pointer',
                                            opacity: item.status === 'parsing' ? 0.5 : 1,
                                            transition: 'all var(--transition-fast)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                        }}
                                        title="Remove file"
                                    >
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--muted-foreground)" strokeWidth="2">
                                            <line x1="18" y1="6" x2="6" y2="18" />
                                            <line x1="6" y1="6" x2="18" y2="18" />
                                        </svg>
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {error && (
                <div style={{
                    marginTop: '1rem',
                    padding: '0.75rem 1rem',
                    borderRadius: 'var(--radius-md)',
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    color: 'var(--error)',
                    fontSize: '0.875rem',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.5rem',
                }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, marginTop: '2px' }}>
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>{error}</pre>
                </div>
            )}
        </div>
    );
}
