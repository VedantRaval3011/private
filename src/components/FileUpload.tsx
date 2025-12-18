'use client';

/**
 * FileUpload Component
 * Beautiful drag-and-drop file upload with validation
 */

import React, { useState, useRef, useCallback } from 'react';

interface FileUploadProps {
    onFileSelect: (file: File) => void;
    isLoading?: boolean;
    accept?: string;
    maxSize?: number;
}

export default function FileUpload({
    onFileSelect,
    isLoading = false,
    accept = '.xml',
    maxSize = 10 * 1024 * 1024, // 10MB
}: FileUploadProps) {
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
                    border: `2px dashed ${isDragging ? 'var(--primary-500)' : 'var(--border)'}`,
                    background: isDragging
                        ? 'linear-gradient(135deg, rgba(139, 92, 246, 0.1) 0%, rgba(20, 184, 166, 0.1) 100%)'
                        : 'var(--card)',
                    cursor: isLoading ? 'not-allowed' : 'pointer',
                    transition: 'all var(--transition-base)',
                    textAlign: 'center',
                    boxShadow: isDragging ? 'var(--shadow-glow)' : 'var(--shadow-md)',
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

                {/* Upload Icon */}
                <div style={{
                    width: '80px',
                    height: '80px',
                    margin: '0 auto 1.5rem',
                    borderRadius: 'var(--radius-full)',
                    background: 'var(--gradient-primary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: 'var(--shadow-lg)',
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
                            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" strokeLinecap="round" strokeLinejoin="round" />
                            <polyline points="17 8 12 3 7 8" strokeLinecap="round" strokeLinejoin="round" />
                            <line x1="12" y1="3" x2="12" y2="15" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    )}
                </div>

                <h3 style={{
                    fontSize: '1.25rem',
                    fontWeight: '600',
                    color: 'var(--foreground)',
                    marginBottom: '0.5rem'
                }}>
                    {isLoading ? 'Processing...' : 'Upload Formula Master XML'}
                </h3>

                <p style={{ color: 'var(--muted-foreground)', marginBottom: '1rem' }}>
                    {isDragging
                        ? 'Drop your file here'
                        : 'Drag and drop your XML file here, or click to browse'}
                </p>

                <div style={{
                    display: 'inline-flex',
                    gap: '1rem',
                    fontSize: '0.875rem',
                    color: 'var(--muted-foreground)',
                }}>
                    <span style={{
                        padding: '0.25rem 0.75rem',
                        background: 'var(--muted)',
                        borderRadius: 'var(--radius-full)',
                    }}>
                        .XML files only
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
                    background: 'var(--primary-100)',
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
                    background: 'var(--accent-100)',
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
