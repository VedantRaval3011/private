'use client';

/**
 * BatchFileUpload Component
 * Drag-and-drop file upload for Batch Registry XML
 */

import React, { useState, useRef, useCallback } from 'react';

interface BatchFileUploadProps {
    onFileSelect: (file: File) => void;
    isLoading?: boolean;
    accept?: string;
    maxSize?: number;
}

export default function BatchFileUpload({
    onFileSelect,
    isLoading = false,
    accept = '.xml',
    maxSize = 10 * 1024 * 1024, // 10MB
}: BatchFileUploadProps) {
    const [isDragging, setIsDragging] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const validateFile = (file: File): boolean => {
        setError(null);

        if (!file.name.toLowerCase().endsWith('.xml')) {
            setError('Please upload a valid XML file');
            return false;
        }

        if (file.size > maxSize) {
            setError(`File size must be less than ${maxSize / (1024 * 1024)}MB`);
            return false;
        }

        return true;
    };

    const handleFile = (file: File) => {
        if (validateFile(file)) {
            onFileSelect(file);
        }
    };

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);

        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
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
        const file = e.target.files?.[0];
        if (file) handleFile(file);
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
                    {isLoading ? 'Processing...' : 'Upload Batch Creation XML'}
                </h3>

                <p style={{ color: 'var(--muted-foreground)', marginBottom: '1rem' }}>
                    {isDragging
                        ? 'Drop your batch file here'
                        : 'Drag and drop your Batch Registry XML file here, or click to browse'}
                </p>

                <div style={{
                    display: 'inline-flex',
                    gap: '1rem',
                    fontSize: '0.875rem',
                    color: 'var(--muted-foreground)',
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
                        Max 10MB
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
                    alignItems: 'center',
                    gap: '0.5rem',
                }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    {error}
                </div>
            )}
        </div>
    );
}
