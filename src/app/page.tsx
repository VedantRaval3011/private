'use client';

/**
 * Formula Master XML Parser - Main Page
 * Upload, parse, and view formula master data
 * Supports both Batch Registry and Formula Master XML files
 * Supports multiple batch file uploads
 */

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import FileUpload from '@/components/FileUpload';
import BatchFileUpload from '@/components/BatchFileUpload';
import FormulaDisplay from '@/components/FormulaDisplay';
import BatchDisplay from '@/components/BatchDisplay';
import FormulaList from '@/components/FormulaList';
import type {
  FormulaRecord,
  UploadResponse,
  FormulasListResponse,
  BatchRegistryData,
  FormulaMasterData,
  BatchRegistryRecord,
  BatchListResponse
} from '@/types/formula';
import type { IngestionResponse, IngestionResult } from '@/types/ingestion';
import { parseBatchRegistryXml, parseFormulaXml } from '@/lib/xmlParser';

type View = 'upload' | 'list' | 'detail' | 'batch-detail' | 'combined-view';
type UploadType = 'batch' | 'formula' | null;

// Interface for tracking file upload status
interface SelectedFile {
  file: File;
  status: 'pending' | 'parsing' | 'success' | 'error';
  message?: string;
  data?: BatchRegistryData;
}

export default function Home() {
  // State
  const [view, setView] = useState<View>('upload');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadType, setUploadType] = useState<UploadType>(null);
  const [uploadResult, setUploadResult] = useState<UploadResponse | null>(null);
  const [formulas, setFormulas] = useState<FormulaRecord[]>([]);
  const [batches, setBatches] = useState<BatchRegistryRecord[]>([]);
  const [selectedFormula, setSelectedFormula] = useState<FormulaRecord | null>(null);
  const [selectedBatch, setSelectedBatch] = useState<BatchRegistryRecord | null>(null);
  // Multiple batch files support
  const [batchFiles, setBatchFiles] = useState<SelectedFile[]>([]);
  const [combinedBatchData, setCombinedBatchData] = useState<BatchRegistryData | null>(null);
  const [formulaData, setFormulaData] = useState<FormulaMasterData | null>(null);
  const [formulaFile, setFormulaFile] = useState<File | null>(null);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [formulaError, setFormulaError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [total, setTotal] = useState(0);
  const [batchTotal, setBatchTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Folder ingestion state
  const [isIngesting, setIsIngesting] = useState(false);
  const [ingestionResults, setIngestionResults] = useState<IngestionResult[]>([]);

  // Fetch formulas
  const fetchFormulas = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        ...(search && { search }),
      });

      const response = await fetch(`/api/formula?${params}`);
      const data: FormulasListResponse = await response.json();

      if (data.success) {
        setFormulas(data.data);
        setTotal(data.total);
      }
    } catch (error) {
      console.error('Error fetching formulas:', error);
    } finally {
      setIsLoading(false);
    }
  }, [page, limit, search]);

  // Fetch batches
  const fetchBatches = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        page: '1',
        limit: '10',
        ...(search && { search }),
      });

      const response = await fetch(`/api/batch?${params}`);
      const data: BatchListResponse = await response.json();

      if (data.success) {
        setBatches(data.data);
        setBatchTotal(data.total);
      }
    } catch (error) {
      console.error('Error fetching batches:', error);
    }
  }, [search]);

  // Fetch on mount and when search/page changes
  useEffect(() => {
    if (view === 'list') {
      fetchFormulas();
      fetchBatches();
    }
  }, [view, fetchFormulas, fetchBatches]);

  // Check if both uploads are complete, navigate to combined view
  useEffect(() => {
    const hasSuccessfulBatches = batchFiles.some(f => f.status === 'success');
    if (hasSuccessfulBatches && formulaData) {
      setView('combined-view');
    }
  }, [batchFiles, formulaData]);

  // Combine batch data from all successful files
  useEffect(() => {
    const successfulFiles = batchFiles.filter(f => f.status === 'success' && f.data);
    if (successfulFiles.length === 0) {
      setCombinedBatchData(null);
      return;
    }

    // Merge all batch data
    const combined: BatchRegistryData = {
      companyName: successfulFiles[0].data!.companyName,
      companyAddress: successfulFiles[0].data!.companyAddress,
      batches: [],
      totalBatches: 0,
      exportCount: 0,
      importCount: 0,
    };

    successfulFiles.forEach(file => {
      if (file.data) {
        combined.batches.push(...file.data.batches);
        combined.totalBatches += file.data.totalBatches;
        combined.exportCount += file.data.exportCount;
        combined.importCount += file.data.importCount;
      }
    });

    setCombinedBatchData(combined);
  }, [batchFiles]);

  // Handle multiple batch file upload
  const handleBatchFilesSelect = async (files: File[]) => {
    setBatchError(null);

    // Add new files with pending status
    const newFiles: SelectedFile[] = files.map(file => ({
      file,
      status: 'pending' as const,
    }));

    setBatchFiles(prev => [...prev, ...newFiles]);

    // Process each file
    const startIndex = batchFiles.length;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileIndex = startIndex + i;

      // Update status to parsing
      setBatchFiles(prev => prev.map((f, idx) =>
        idx === fileIndex ? { ...f, status: 'parsing' as const } : f
      ));

      try {
        const text = await file.text();
        const result = await parseBatchRegistryXml(text);

        if (result.success && result.data) {
          setBatchFiles(prev => prev.map((f, idx) =>
            idx === fileIndex ? {
              ...f,
              status: 'success' as const,
              message: `${result.data!.totalBatches} batches found`,
              data: result.data
            } : f
          ));
        } else {
          setBatchFiles(prev => prev.map((f, idx) =>
            idx === fileIndex ? {
              ...f,
              status: 'error' as const,
              message: result.errors.join(', ') || 'Parse failed'
            } : f
          ));
        }
      } catch (error) {
        setBatchFiles(prev => prev.map((f, idx) =>
          idx === fileIndex ? {
            ...f,
            status: 'error' as const,
            message: error instanceof Error ? error.message : 'Unknown error'
          } : f
        ));
      }
    }
  };

  // Handle removing a batch file
  const handleRemoveBatchFile = (index: number) => {
    setBatchFiles(prev => prev.filter((_, idx) => idx !== index));
  };

  // Handle formula file upload - parse locally, don't navigate
  const handleFormulaFileSelect = async (file: File) => {
    setIsUploading(true);
    setUploadType('formula');
    setFormulaError(null);

    try {
      const text = await file.text();
      const result = await parseFormulaXml(text);

      if (result.success && result.data) {
        setFormulaData(result.data);
        setFormulaFile(file);
        // Don't navigate - wait for both files
      } else {
        setFormulaError(result.errors.join(', ') || 'Failed to parse formula XML');
      }
    } catch (error) {
      setFormulaError(error instanceof Error ? error.message : 'Unknown error parsing formula file');
    } finally {
      setIsUploading(false);
      setUploadType(null);
    }
  };

  // Save both batch and formula to database
  const handleSaveToDatabase = async () => {
    const successfulBatchFiles = batchFiles.filter(f => f.status === 'success');
    if (successfulBatchFiles.length === 0 || !formulaFile) {
      setSaveMessage({ type: 'error', text: 'Both batch files and formula file are required to save' });
      return;
    }

    setIsSaving(true);
    setSaveMessage(null);

    try {
      // Save each batch file separately
      let savedBatches = 0;
      for (const batchItem of successfulBatchFiles) {
        const batchFormData = new FormData();
        batchFormData.append('file', batchItem.file);

        const batchResponse = await fetch('/api/batch', {
          method: 'POST',
          body: batchFormData,
        });
        const batchResult = await batchResponse.json();

        if (!batchResult.success) {
          setSaveMessage({ type: 'error', text: `Batch save failed for ${batchItem.file.name}: ${batchResult.message}` });
          setIsSaving(false);
          return;
        }
        savedBatches++;
      }

      // Save formula data
      const formulaFormData = new FormData();
      formulaFormData.append('file', formulaFile);

      const formulaResponse = await fetch('/api/formula', {
        method: 'POST',
        body: formulaFormData,
      });
      const formulaResult = await formulaResponse.json();

      if (!formulaResult.success) {
        setSaveMessage({ type: 'error', text: `Formula save failed: ${formulaResult.message}` });
        setIsSaving(false);
        return;
      }

      setSaveMessage({ type: 'success', text: `Successfully saved ${savedBatches} batch file(s) and formula data!` });
    } catch (error) {
      setSaveMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to save data'
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Handle delete formula
  const handleDeleteFormula = async (id: string) => {
    if (!confirm('Are you sure you want to delete this formula?')) return;

    try {
      const response = await fetch(`/api/formula/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        fetchFormulas();
      }
    } catch (error) {
      console.error('Delete error:', error);
    }
  };

  // Handle delete batch
  const handleDeleteBatch = async (id: string) => {
    if (!confirm('Are you sure you want to delete this batch record?')) return;

    try {
      const response = await fetch(`/api/batch/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        fetchBatches();
      }
    } catch (error) {
      console.error('Delete error:', error);
    }
  };

  // Handle search with debounce effect
  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  // Reset to upload view
  const handleBackToUpload = () => {
    setView('upload');
    setSelectedFormula(null);
    setSelectedBatch(null);
    setBatchFiles([]);
    setCombinedBatchData(null);
    setFormulaData(null);
    setFormulaFile(null);
    setUploadResult(null);
    setBatchError(null);
    setFormulaError(null);
    setSaveMessage(null);
  };

  // Create a FormulaRecord-like object from FormulaMasterData for display
  const createDisplayRecord = (data: FormulaMasterData): FormulaRecord => {
    return {
      ...data,
      _id: 'preview',
      uniqueIdentifier: `${data.masterFormulaDetails.productCode}-preview`,
      uploadedAt: new Date(),
      fileName: 'Uploaded Formula',
      fileSize: 0,
      parsingStatus: 'success',
    };
  };

  // Load files from /files folder
  const handleLoadFromFolder = async () => {
    setIsIngesting(true);
    setIngestionResults([]);

    try {
      const response = await fetch('/api/ingestion', {
        method: 'POST',
      });
      const data: IngestionResponse = await response.json();

      if (data.success) {
        setIngestionResults(data.status.results);
        // Refresh the lists to show new data
        fetchFormulas();
        fetchBatches();
      } else {
        console.error('Ingestion failed:', data.message);
      }
    } catch (error) {
      console.error('Ingestion error:', error);
    } finally {
      setIsIngesting(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--background)',
    }}>
      {/* Header */}
      <header style={{
        background: 'var(--gradient-hero)',
        padding: '2rem 0',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Decorative bubbles */}
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
          position: 'absolute',
          bottom: '-30%',
          right: '-5%',
          width: '300px',
          height: '300px',
          background: 'rgba(255, 255, 255, 0.05)',
          borderRadius: '50%',
          filter: 'blur(30px)',
        }} />

        <div style={{
          maxWidth: '1400px',
          margin: '0 auto',
          padding: '0 2rem',
          position: 'relative',
          zIndex: 1,
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem',
          }}>
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
                Formula Master
              </h1>
              <p style={{
                color: 'rgba(255, 255, 255, 0.8)',
                fontSize: '1rem',
              }}>
                XML Parser & Data Management System
              </p>
            </div>

            {/* Navigation */}
            <nav style={{
              display: 'flex',
              gap: '0.5rem',
              background: 'rgba(255, 255, 255, 0.1)',
              padding: '0.375rem',
              borderRadius: 'var(--radius-lg)',
              backdropFilter: 'blur(10px)',
            }}>
              <button
                onClick={handleBackToUpload}
                style={{
                  padding: '0.625rem 1.25rem',
                  background: view === 'upload' || view === 'combined-view' ? 'white' : 'transparent',
                  color: view === 'upload' || view === 'combined-view' ? 'var(--primary-700)' : 'white',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  cursor: 'pointer',
                  fontWeight: '500',
                  transition: 'all var(--transition-fast)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                Upload
              </button>
              <button
                onClick={() => { setView('list'); setSelectedFormula(null); setSelectedBatch(null); }}
                style={{
                  padding: '0.625rem 1.25rem',
                  background: view === 'list' ? 'white' : 'transparent',
                  color: view === 'list' ? 'var(--primary-700)' : 'white',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  cursor: 'pointer',
                  fontWeight: '500',
                  transition: 'all var(--transition-fast)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="8" y1="6" x2="21" y2="6" />
                  <line x1="8" y1="12" x2="21" y2="12" />
                  <line x1="8" y1="18" x2="21" y2="18" />
                  <line x1="3" y1="6" x2="3.01" y2="6" />
                  <line x1="3" y1="12" x2="3.01" y2="12" />
                  <line x1="3" y1="18" x2="3.01" y2="18" />
                </svg>
                History
              </button>
              <Link
                href="/batch-data"
                style={{
                  padding: '0.625rem 1.25rem',
                  background: 'transparent',
                  color: 'white',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  textDecoration: 'none',
                  fontWeight: '500',
                  transition: 'all var(--transition-fast)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
                Batch Data
              </Link>
              <Link
                href="/formula-data"
                style={{
                  padding: '0.625rem 1.25rem',
                  background: 'transparent',
                  color: 'white',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  textDecoration: 'none',
                  fontWeight: '500',
                  transition: 'all var(--transition-fast)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                </svg>
                Formula Data
              </Link>
              <Link
                href="/coa"
                style={{
                  padding: '0.625rem 1.25rem',
                  background: 'transparent',
                  color: 'white',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  textDecoration: 'none',
                  fontWeight: '500',
                  transition: 'all var(--transition-fast)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                COA Data
              </Link>
              <Link
                href="/processing-logs"
                style={{
                  padding: '0.625rem 1.25rem',
                  background: 'transparent',
                  color: 'white',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  textDecoration: 'none',
                  fontWeight: '500',
                  transition: 'all var(--transition-fast)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                </svg>
                Logs
              </Link>
              <Link
                href="/skipped-duplicates"
                style={{
                  padding: '0.625rem 1.25rem',
                  background: 'transparent',
                  color: 'white',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  textDecoration: 'none',
                  fontWeight: '500',
                  transition: 'all var(--transition-fast)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                Duplicates
              </Link>
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main style={{
        maxWidth: '1400px',
        margin: '0 auto',
        padding: '2rem',
      }}>
        {/* Upload View - Two upload buttons side by side */}
        {view === 'upload' && (
          <div className="animate-fadeIn">
            <div style={{
              textAlign: 'center',
              marginBottom: '2rem',
            }}>
              <h2 style={{
                fontSize: '1.5rem',
                fontWeight: '600',
                color: 'var(--foreground)',
                marginBottom: '0.5rem',
              }}>
                Upload Both Files
              </h2>
              <p style={{ color: 'var(--muted-foreground)' }}>
                Upload Batch Creation XML first, then Formula Master XML to view combined data
              </p>
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
              gap: '2rem',
            }}>
              {/* Batch Upload - First */}
              <div>
                <h3 style={{
                  fontSize: '1.125rem',
                  fontWeight: '600',
                  color: 'var(--foreground)',
                  marginBottom: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}>
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    background: combinedBatchData
                      ? 'linear-gradient(135deg, #10b981 0%, #34d399 100%)'
                      : 'linear-gradient(135deg, #14b8a6 0%, #06b6d4 100%)',
                    color: 'white',
                    fontSize: '0.875rem',
                    fontWeight: '700',
                  }}>
                    {combinedBatchData ? '✓' : '1'}
                  </span>
                  Batch Creation XMLs
                  {combinedBatchData && (
                    <span style={{
                      marginLeft: 'auto',
                      padding: '0.25rem 0.75rem',
                      background: 'rgba(16, 185, 129, 0.1)',
                      color: '#10b981',
                      borderRadius: 'var(--radius-full)',
                      fontSize: '0.75rem',
                      fontWeight: '600',
                    }}>
                      ✓ {batchFiles.filter(f => f.status === 'success').length} file(s) - {combinedBatchData.totalBatches} batches
                    </span>
                  )}
                </h3>
                <BatchFileUpload
                  onFilesSelect={handleBatchFilesSelect}
                  isLoading={batchFiles.some(f => f.status === 'parsing')}
                  selectedFiles={batchFiles}
                  onRemoveFile={handleRemoveBatchFile}
                />
              </div>

              {/* Formula Upload - Second */}
              <div>
                <h3 style={{
                  fontSize: '1.125rem',
                  fontWeight: '600',
                  color: 'var(--foreground)',
                  marginBottom: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}>
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    background: formulaData
                      ? 'linear-gradient(135deg, #10b981 0%, #34d399 100%)'
                      : 'var(--gradient-primary)',
                    color: 'white',
                    fontSize: '0.875rem',
                    fontWeight: '700',
                  }}>
                    {formulaData ? '✓' : '2'}
                  </span>
                  Formula Master XML
                  {formulaData && (
                    <span style={{
                      marginLeft: 'auto',
                      padding: '0.25rem 0.75rem',
                      background: 'rgba(16, 185, 129, 0.1)',
                      color: '#10b981',
                      borderRadius: 'var(--radius-full)',
                      fontSize: '0.75rem',
                      fontWeight: '600',
                    }}>
                      ✓ Uploaded ({formulaData.masterFormulaDetails.productName})
                    </span>
                  )}
                </h3>
                <FileUpload
                  onFileSelect={handleFormulaFileSelect}
                  isLoading={isUploading && uploadType === 'formula'}
                />
              </div>
            </div>

            {/* Upload Status */}
            {(combinedBatchData || formulaData) && !(combinedBatchData && formulaData) && (
              <div style={{
                marginTop: '2rem',
                padding: '1.25rem',
                borderRadius: 'var(--radius-lg)',
                background: 'rgba(139, 92, 246, 0.1)',
                border: '1px solid rgba(139, 92, 246, 0.3)',
                textAlign: 'center',
              }}>
                <p style={{ color: 'var(--primary-600)', fontWeight: '500' }}>
                  {combinedBatchData && !formulaData && `✓ ${batchFiles.filter(f => f.status === 'success').length} batch file(s) loaded. Now upload the Formula Master XML.`}
                  {!combinedBatchData && formulaData && '✓ Formula data loaded. Now upload the Batch Creation XML(s).'}
                </p>
              </div>
            )}

            {/* Error Messages */}
            {batchError && (
              <div style={{
                marginTop: '1.5rem',
                padding: '1.25rem',
                borderRadius: 'var(--radius-lg)',
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
              }}>
                <h4 style={{
                  color: 'var(--error)',
                  marginBottom: '0.5rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="15" y1="9" x2="9" y2="15" />
                    <line x1="9" y1="9" x2="15" y2="15" />
                  </svg>
                  Batch XML Error
                </h4>
                <p style={{ color: 'var(--error)', fontSize: '0.875rem' }}>{batchError}</p>
              </div>
            )}

            {formulaError && (
              <div style={{
                marginTop: '1.5rem',
                padding: '1.25rem',
                borderRadius: 'var(--radius-lg)',
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
              }}>
                <h4 style={{
                  color: 'var(--error)',
                  marginBottom: '0.5rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="15" y1="9" x2="9" y2="15" />
                    <line x1="9" y1="9" x2="15" y2="15" />
                  </svg>
                  Formula XML Error
                </h4>
                <p style={{ color: 'var(--error)', fontSize: '0.875rem' }}>{formulaError}</p>
              </div>
            )}

            {uploadResult && !uploadResult.success && (
              <div style={{
                marginTop: '1.5rem',
                padding: '1.25rem',
                borderRadius: 'var(--radius-lg)',
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
              }}>
                <h4 style={{
                  color: 'var(--error)',
                  marginBottom: '0.5rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="15" y1="9" x2="9" y2="15" />
                    <line x1="9" y1="9" x2="15" y2="15" />
                  </svg>
                  {uploadResult.message}
                </h4>
                <ul style={{
                  paddingLeft: '1.5rem',
                  color: 'var(--error)',
                  fontSize: '0.875rem',
                }}>
                  {uploadResult.errors?.map((error, index) => (
                    <li key={index}>{error}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Separator */}
            <div style={{
              margin: '2.5rem 0',
              display: 'flex',
              alignItems: 'center',
              gap: '1rem',
            }}>
              <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
              <span style={{ color: 'var(--muted-foreground)', fontSize: '0.875rem', fontWeight: '500' }}>
                OR
              </span>
              <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
            </div>

            {/* Load from Files Folder Section */}
            <div style={{
              padding: '2rem',
              background: 'var(--card)',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--border)',
              boxShadow: 'var(--shadow-md)',
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
                marginBottom: '1rem',
              }}>
                <div style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: 'var(--radius-md)',
                  background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                    <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
                  </svg>
                </div>
                <div>
                  <h3 style={{
                    fontSize: '1.25rem',
                    fontWeight: '600',
                    color: 'var(--foreground)',
                  }}>
                    Auto-Load from Files Folder
                  </h3>
                  <p style={{ color: 'var(--muted-foreground)', fontSize: '0.875rem' }}>
                    Automatically scan and process all XML files in the /files folder
                  </p>
                </div>
              </div>

              <button
                onClick={handleLoadFromFolder}
                disabled={isIngesting}
                style={{
                  width: '100%',
                  padding: '1rem 1.5rem',
                  background: isIngesting ? 'var(--muted)' : 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  color: 'white',
                  cursor: isIngesting ? 'not-allowed' : 'pointer',
                  fontSize: '1rem',
                  fontWeight: '600',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.75rem',
                  boxShadow: isIngesting ? 'none' : 'var(--shadow-lg)',
                  transition: 'all var(--transition-fast)',
                }}
              >
                {isIngesting ? (
                  <>
                    <svg className="animate-spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 12a9 9 0 11-6.219-8.56" strokeLinecap="round" />
                    </svg>
                    Processing Files...
                  </>
                ) : (
                  <>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Scan & Process Files
                  </>
                )}
              </button>

              {/* Ingestion Results */}
              {ingestionResults.length > 0 && (
                <div style={{ marginTop: '1.5rem' }}>
                  <h4 style={{
                    fontSize: '0.875rem',
                    fontWeight: '600',
                    color: 'var(--foreground)',
                    marginBottom: '0.75rem',
                  }}>
                    Processing Results ({ingestionResults.length} files)
                  </h4>
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem',
                  }}>
                    {ingestionResults.map((result, index) => (
                      <div
                        key={index}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '0.75rem 1rem',
                          background: result.status === 'SUCCESS'
                            ? 'rgba(16, 185, 129, 0.1)'
                            : result.status === 'DUPLICATE'
                              ? 'rgba(245, 158, 11, 0.1)'
                              : 'rgba(239, 68, 68, 0.1)',
                          borderRadius: 'var(--radius-md)',
                          border: `1px solid ${result.status === 'SUCCESS'
                            ? 'rgba(16, 185, 129, 0.3)'
                            : result.status === 'DUPLICATE'
                              ? 'rgba(245, 158, 11, 0.3)'
                              : 'rgba(239, 68, 68, 0.3)'
                            }`,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <span style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            background: result.status === 'SUCCESS'
                              ? '#10b981'
                              : result.status === 'DUPLICATE'
                                ? '#f59e0b'
                                : '#ef4444',
                          }} />
                          <div>
                            <div style={{ fontWeight: '500', fontSize: '0.875rem', color: 'var(--foreground)' }}>
                              {result.fileName}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>
                              {result.message}
                            </div>
                          </div>
                        </div>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                        }}>
                          <span style={{
                            padding: '0.25rem 0.5rem',
                            borderRadius: 'var(--radius-sm)',
                            fontSize: '0.7rem',
                            fontWeight: '600',
                            textTransform: 'uppercase',
                            background: result.fileType === 'BATCH'
                              ? 'rgba(20, 184, 166, 0.2)'
                              : result.fileType === 'FORMULA'
                                ? 'rgba(139, 92, 246, 0.2)'
                                : 'rgba(156, 163, 175, 0.2)',
                            color: result.fileType === 'BATCH'
                              ? '#14b8a6'
                              : result.fileType === 'FORMULA'
                                ? '#8b5cf6'
                                : '#9ca3af',
                          }}>
                            {result.fileType}
                          </span>
                          <span style={{
                            padding: '0.25rem 0.5rem',
                            borderRadius: 'var(--radius-sm)',
                            fontSize: '0.7rem',
                            fontWeight: '600',
                            background: result.status === 'SUCCESS'
                              ? 'rgba(16, 185, 129, 0.2)'
                              : result.status === 'DUPLICATE'
                                ? 'rgba(245, 158, 11, 0.2)'
                                : 'rgba(239, 68, 68, 0.2)',
                            color: result.status === 'SUCCESS'
                              ? '#10b981'
                              : result.status === 'DUPLICATE'
                                ? '#f59e0b'
                                : '#ef4444',
                          }}>
                            {result.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Combined View - Shows both Batch and Formula data */}
        {view === 'combined-view' && combinedBatchData && formulaData && (
          <div className="animate-fadeIn">
            {/* Action Bar */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '1.5rem',
              flexWrap: 'wrap',
              gap: '1rem',
            }}>
              <button
                onClick={handleBackToUpload}
                style={{
                  padding: '0.625rem 1.25rem',
                  background: 'var(--muted)',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--foreground)',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  transition: 'all var(--transition-fast)',
                }}
              >
                ← Upload New Files
              </button>

              <button
                onClick={handleSaveToDatabase}
                disabled={isSaving}
                style={{
                  padding: '0.75rem 1.5rem',
                  background: isSaving ? 'var(--muted)' : 'var(--gradient-primary)',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  color: 'white',
                  cursor: isSaving ? 'not-allowed' : 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: '600',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  boxShadow: isSaving ? 'none' : 'var(--shadow-lg)',
                  transition: 'all var(--transition-fast)',
                }}
              >
                {isSaving ? (
                  <>
                    <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 12a9 9 0 11-6.219-8.56" strokeLinecap="round" />
                    </svg>
                    Saving...
                  </>
                ) : (
                  <>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" />
                      <polyline points="17 21 17 13 7 13 7 21" />
                      <polyline points="7 3 7 8 15 8" />
                    </svg>
                    Save to Database
                  </>
                )}
              </button>
            </div>

            {/* Save Message */}
            {saveMessage && (
              <div style={{
                marginBottom: '1.5rem',
                padding: '1rem',
                borderRadius: 'var(--radius-md)',
                background: saveMessage.type === 'success'
                  ? 'rgba(16, 185, 129, 0.1)'
                  : 'rgba(239, 68, 68, 0.1)',
                border: `1px solid ${saveMessage.type === 'success'
                  ? 'rgba(16, 185, 129, 0.3)'
                  : 'rgba(239, 68, 68, 0.3)'}`,
                color: saveMessage.type === 'success' ? '#10b981' : 'var(--error)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  {saveMessage.type === 'success' ? (
                    <path d="M22 11.08V12a10 10 0 11-5.93-9.14M22 4L12 14.01l-3-3" />
                  ) : (
                    <>
                      <circle cx="12" cy="12" r="10" />
                      <line x1="15" y1="9" x2="9" y2="15" />
                      <line x1="9" y1="9" x2="15" y2="15" />
                    </>
                  )}
                </svg>
                {saveMessage.text}
              </div>
            )}

            {/* Section 1: Batch Data */}
            <div style={{ marginBottom: '3rem' }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                marginBottom: '1rem',
                paddingBottom: '0.75rem',
                borderBottom: '2px solid var(--border)',
              }}>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #14b8a6 0%, #06b6d4 100%)',
                  color: 'white',
                  fontSize: '1rem',
                  fontWeight: '700',
                }}>1</span>
                <h2 style={{
                  fontSize: '1.25rem',
                  fontWeight: '600',
                  color: 'var(--foreground)',
                }}>
                  Batch Creation Data
                </h2>
              </div>
              <BatchDisplay batchData={combinedBatchData} />
            </div>

            {/* Divider */}
            <div style={{
              height: '2px',
              background: 'var(--gradient-primary)',
              marginBottom: '3rem',
              borderRadius: '1px',
            }} />

            {/* Section 2: Formula Data */}
            <div>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                marginBottom: '1rem',
                paddingBottom: '0.75rem',
                borderBottom: '2px solid var(--border)',
              }}>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: 'var(--gradient-primary)',
                  color: 'white',
                  fontSize: '1rem',
                  fontWeight: '700',
                }}>2</span>
                <h2 style={{
                  fontSize: '1.25rem',
                  fontWeight: '600',
                  color: 'var(--foreground)',
                }}>
                  Formula Master Data
                </h2>
              </div>
              <FormulaDisplay formula={createDisplayRecord(formulaData)} />
            </div>
          </div>
        )}

        {/* History View - Shows both stored batches and formulas */}
        {view === 'list' && (
          <div className="animate-fadeIn">
            {/* Search */}
            <div style={{ marginBottom: '2rem' }}>
              <input
                type="text"
                placeholder="Search batches and formulas..."
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                style={{
                  width: '100%',
                  maxWidth: '400px',
                  padding: '0.75rem 1rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border)',
                  background: 'var(--card)',
                  color: 'var(--foreground)',
                  fontSize: '0.875rem',
                }}
              />
            </div>

            {/* Stored Batch Records Section */}
            <div style={{ marginBottom: '3rem' }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                marginBottom: '1.5rem',
                paddingBottom: '0.75rem',
                borderBottom: '2px solid var(--border)',
              }}>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #14b8a6 0%, #06b6d4 100%)',
                  color: 'white',
                  fontSize: '1rem',
                  fontWeight: '700',
                }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                  </svg>
                </span>
                <h2 style={{
                  fontSize: '1.25rem',
                  fontWeight: '600',
                  color: 'var(--foreground)',
                }}>
                  Stored Batch Records
                </h2>
                <span style={{
                  marginLeft: 'auto',
                  padding: '0.25rem 0.75rem',
                  background: 'rgba(20, 184, 166, 0.1)',
                  color: '#14b8a6',
                  borderRadius: 'var(--radius-full)',
                  fontSize: '0.75rem',
                  fontWeight: '600',
                }}>
                  {batchTotal} records
                </span>
              </div>

              {isLoading ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--muted-foreground)' }}>
                  Loading...
                </div>
              ) : batches.length === 0 ? (
                <div style={{
                  padding: '2rem',
                  textAlign: 'center',
                  background: 'var(--muted)',
                  borderRadius: 'var(--radius-lg)',
                  color: 'var(--muted-foreground)',
                }}>
                  No batch records found. Upload a batch XML file to get started.
                </div>
              ) : (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
                  gap: '1rem',
                }}>
                  {batches.map((batch) => (
                    <div
                      key={batch._id}
                      style={{
                        padding: '1.25rem',
                        borderRadius: 'var(--radius-lg)',
                        border: '1px solid var(--border)',
                        background: 'var(--card)',
                        cursor: 'pointer',
                        transition: 'all var(--transition-fast)',
                      }}
                      onClick={() => {
                        setSelectedBatch(batch);
                        setView('batch-detail');
                      }}
                    >
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        marginBottom: '0.75rem',
                      }}>
                        <h4 style={{
                          fontWeight: '600',
                          color: 'var(--foreground)',
                          fontSize: '1rem',
                        }}>
                          {batch.companyName || 'Batch Record'}
                        </h4>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteBatch(batch._id!);
                          }}
                          style={{
                            padding: '0.25rem 0.5rem',
                            background: 'rgba(239, 68, 68, 0.1)',
                            border: 'none',
                            borderRadius: 'var(--radius-sm)',
                            color: 'var(--error)',
                            cursor: 'pointer',
                            fontSize: '0.75rem',
                          }}
                        >
                          Delete
                        </button>
                      </div>
                      <div style={{
                        display: 'flex',
                        gap: '0.5rem',
                        flexWrap: 'wrap',
                        marginBottom: '0.5rem',
                      }}>
                        <span style={{
                          padding: '0.25rem 0.5rem',
                          background: 'rgba(20, 184, 166, 0.1)',
                          color: '#14b8a6',
                          borderRadius: 'var(--radius-sm)',
                          fontSize: '0.75rem',
                          fontWeight: '500',
                        }}>
                          {batch.totalBatches} batches
                        </span>
                        <span style={{
                          padding: '0.25rem 0.5rem',
                          background: 'rgba(245, 158, 11, 0.1)',
                          color: '#f59e0b',
                          borderRadius: 'var(--radius-sm)',
                          fontSize: '0.75rem',
                          fontWeight: '500',
                        }}>
                          {batch.exportCount} Export
                        </span>
                        <span style={{
                          padding: '0.25rem 0.5rem',
                          background: 'rgba(139, 92, 246, 0.1)',
                          color: '#8b5cf6',
                          borderRadius: 'var(--radius-sm)',
                          fontSize: '0.75rem',
                          fontWeight: '500',
                        }}>
                          {batch.importCount} Import
                        </span>
                      </div>
                      <p style={{
                        fontSize: '0.75rem',
                        color: 'var(--muted-foreground)',
                      }}>
                        Uploaded: {new Date(batch.uploadedAt).toLocaleDateString()}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Divider */}
            <div style={{
              height: '2px',
              background: 'var(--gradient-primary)',
              marginBottom: '3rem',
              borderRadius: '1px',
            }} />

            {/* Stored Formula Records Section */}
            <div>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                marginBottom: '1.5rem',
                paddingBottom: '0.75rem',
                borderBottom: '2px solid var(--border)',
              }}>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: 'var(--gradient-primary)',
                  color: 'white',
                  fontSize: '1rem',
                  fontWeight: '700',
                }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                  </svg>
                </span>
                <h2 style={{
                  fontSize: '1.25rem',
                  fontWeight: '600',
                  color: 'var(--foreground)',
                }}>
                  Stored Formula Records
                </h2>
                <span style={{
                  marginLeft: 'auto',
                  padding: '0.25rem 0.75rem',
                  background: 'rgba(139, 92, 246, 0.1)',
                  color: '#8b5cf6',
                  borderRadius: 'var(--radius-full)',
                  fontSize: '0.75rem',
                  fontWeight: '600',
                }}>
                  {total} records
                </span>
              </div>

              <FormulaList
                formulas={formulas}
                total={total}
                page={page}
                limit={limit}
                search={search}
                onSearchChange={handleSearchChange}
                onPageChange={setPage}
                onSelect={(formula) => {
                  setSelectedFormula(formula);
                  setView('detail');
                }}
                onDelete={handleDeleteFormula}
                isLoading={isLoading}
              />
            </div>
          </div>
        )}

        {/* Batch Detail View (if accessed from history) */}
        {view === 'batch-detail' && selectedBatch && (
          <BatchDisplay
            batchData={selectedBatch}
            onClose={() => {
              setSelectedBatch(null);
              setView('list');
            }}
          />
        )}

        {/* Formula Detail View */}
        {view === 'detail' && selectedFormula && (
          <FormulaDisplay
            formula={selectedFormula}
            onClose={() => {
              setSelectedFormula(null);
              setView('list');
            }}
          />
        )}
      </main>

      {/* Footer */}
      <footer style={{
        padding: '2rem',
        textAlign: 'center',
        borderTop: '1px solid var(--border)',
        color: 'var(--muted-foreground)',
        fontSize: '0.875rem',
      }}>
        <p>Formula Master XML Parser</p>
      </footer>
    </div>
  );
}
