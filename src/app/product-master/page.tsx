'use client';

/**
 * Product Master Page
 * Displays all product master data from the database
 * Two views: MFC-wise and Product Code-wise with Excel export
 */

import React, { useState, useEffect } from 'react';
import Link from 'next/link';

interface ProductMaster {
  _id: string;
  productCode: string;
  productName: string;
  department: string;
  masterCardNo: string;
  storageCondition: string;
  productType: string;
  therapeuticCategory: string;
  sourceFile: string;
  genericName?: string;
}

type ViewMode = 'mfc' | 'product';
type SortField = 'therapeuticCategory' | 'productName' | 'productCode' | 'genericName' | 'department' | 'masterCardNo' | 'storageCondition' | 'productType';
type SortDirection = 'asc' | 'desc' | null;

// Helper to check if a field has missing/invalid data
const isMissingData = (value: string | undefined): boolean => {
  return !value || value === 'N/A' || value.trim() === '';
};

// Helper to get all missing fields
const getMissingFields = (item: ProductMaster) => {
  const errors: string[] = [];
  if (isMissingData(item.therapeuticCategory)) errors.push('Therapeutic Category');
  if (isMissingData(item.productName)) errors.push('Product Name');
  if (isMissingData(item.productCode)) errors.push('Product Code');
  // Generic name is optional, so we don't flag it as error if missing
  if (isMissingData(item.department)) errors.push('Department');
  if (isMissingData(item.masterCardNo)) errors.push('Master Card No');
  if (isMissingData(item.storageCondition)) errors.push('Storage Condition');
  if (isMissingData(item.productType)) errors.push('Product Type');
  return errors;
};

// Helper to export to Excel
const exportToExcel = (data: ProductMaster[], viewMode: ViewMode) => {
  if (data.length === 0) {
    alert('No data to export');
    return;
  }

  // Create CSV content with new column order
  const headers = [
    'SR No',
    'Product Code',
    'Generic Name',
    'Master Card No',
    'Therapeutic Category',
    'Product Name',
    'Department',
    'Storage Condition',
    'Product Type',
    'Errors'
  ];

  const rows = data.map((item, index) => {
    const errors = getMissingFields(item);

    return [
      index + 1, // SR Number
      item.productCode || 'N/A',
      item.genericName || '',
      item.masterCardNo || 'N/A',
      item.therapeuticCategory || 'N/A',
      item.productName || 'N/A',
      item.department || 'N/A',
      item.storageCondition || 'N/A',
      item.storageCondition || 'N/A',
      item.productType || 'N/A',
      errors.length > 0 ? `MISSING: ${errors.join(', ')}` : 'OK'
    ];
  });

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
  ].join('\n');

  // Create blob and download
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `Product_Master_${viewMode === 'mfc' ? 'MFC_Wise' : 'Product_Code_Wise'}_${new Date().toISOString().split('T')[0]}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export default function ProductMasterPage() {
  const [data, setData] = useState<ProductMaster[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('product');
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);

  const fetchData = async (search: string) => {
    setLoading(true);
    try {
      // Fetch ALL data without pagination
      const res = await fetch(`/api/product-master?page=1&limit=10000&search=${encodeURIComponent(search)}`);
      const json = await res.json();
      if (json.success) {
        setData(json.data);
        setTotal(json.pagination.total);
      }
    } catch (err) {
      console.error('Failed to fetch data', err);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData(searchTerm);
  }, [searchTerm]);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  };

  // Handle column sorting
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      // Cycle through: asc -> desc -> null
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else if (sortDirection === 'desc') {
        setSortDirection(null);
        setSortField(null);
      }
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Sort data based on view mode and column sorting
  const getSortedData = () => {
    let sorted = [...data];
    
    // Apply column sorting if active
    if (sortField && sortDirection) {
      sorted.sort((a, b) => {
        const aValue = (a[sortField] || 'ZZZ').toString().toLowerCase();
        const bValue = (b[sortField] || 'ZZZ').toString().toLowerCase();
        
        const comparison = aValue.localeCompare(bValue);
        return sortDirection === 'asc' ? comparison : -comparison;
      });
    } else {
      // Default sorting based on view mode
      if (viewMode === 'mfc') {
        // Sort by Master Card No
        sorted.sort((a, b) => {
          const mfcA = a.masterCardNo || 'ZZZ';
          const mfcB = b.masterCardNo || 'ZZZ';
          return mfcA.localeCompare(mfcB);
        });
      } else {
        // Sort by Product Code
        sorted.sort((a, b) => {
          const codeA = a.productCode || 'ZZZ';
          const codeB = b.productCode || 'ZZZ';
          return codeA.localeCompare(codeB);
        });
      }
    }
    
    return sorted;
  };

  const sortedData = getSortedData();

  // Calculate error statistics
  const errorStats = data.reduce((acc, item) => {
    let hasError = false;
    if (isMissingData(item.therapeuticCategory)) hasError = true;
    if (isMissingData(item.productName)) hasError = true;
    if (isMissingData(item.productCode)) hasError = true;
    if (isMissingData(item.department)) hasError = true;
    if (isMissingData(item.masterCardNo)) hasError = true;
    if (isMissingData(item.storageCondition)) hasError = true;
    if (isMissingData(item.productType)) hasError = true;
    return hasError ? acc + 1 : acc;
  }, 0);

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
                  <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                  <line x1="8" y1="21" x2="16" y2="21" />
                  <line x1="12" y1="17" x2="12" y2="21" />
                </svg>
                Product Master
              </h1>
              <p style={{
                color: 'rgba(255, 255, 255, 0.8)',
                fontSize: '1rem',
              }}>
                Complete Product Database - {total} Products
              </p>
            </div>

            {/* Navigation */}
            <Link
              href="/"
              style={{
                padding: '0.625rem 1.25rem',
                background: 'rgba(255, 255, 255, 0.2)',
                color: 'white',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                textDecoration: 'none',
                fontWeight: '500',
                transition: 'all var(--transition-fast)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                backdropFilter: 'blur(10px)',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
              Back to Home
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main style={{
        maxWidth: '1600px',
        margin: '0 auto',
        padding: '2rem',
      }}>
        {/* Search and Stats */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '2rem',
          flexWrap: 'wrap',
          gap: '1rem',
        }}>
          <div style={{ flex: '1', minWidth: '300px', maxWidth: '500px' }}>
            <input
              type="text"
              placeholder="Search by Product Name, Code, Department..."
              value={searchTerm}
              onChange={handleSearch}
              style={{
                width: '100%',
                padding: '0.875rem 1rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border)',
                background: 'var(--card)',
                color: 'var(--foreground)',
                fontSize: '0.875rem',
                transition: 'all var(--transition-fast)',
              }}
            />
          </div>

          {/* Stats Cards */}
          <div style={{
            display: 'flex',
            gap: '1rem',
            flexWrap: 'wrap',
          }}>
            <div style={{
              padding: '0.75rem 1.25rem',
              borderRadius: 'var(--radius-md)',
              background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.1) 0%, rgba(168, 85, 247, 0.1) 100%)',
              border: '1px solid rgba(139, 92, 246, 0.2)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2">
                <path d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
              </svg>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>Total Products</div>
                <div style={{ fontSize: '1.25rem', fontWeight: '700', color: '#8b5cf6' }}>{total}</div>
              </div>
            </div>

            <div style={{
              padding: '0.75rem 1.25rem',
              borderRadius: 'var(--radius-md)',
              background: errorStats > 0 
                ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.1) 0%, rgba(220, 38, 38, 0.1) 100%)'
                : 'linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(52, 211, 153, 0.1) 100%)',
              border: errorStats > 0 ? '1px solid rgba(239, 68, 68, 0.2)' : '1px solid rgba(16, 185, 129, 0.2)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={errorStats > 0 ? '#ef4444' : '#10b981'} strokeWidth="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>Records with Errors</div>
                <div style={{ fontSize: '1.25rem', fontWeight: '700', color: errorStats > 0 ? '#ef4444' : '#10b981' }}>{errorStats}</div>
              </div>
            </div>
          </div>
        </div>

        {/* View Mode Toggle and Export Buttons */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1.5rem',
          flexWrap: 'wrap',
          gap: '1rem',
        }}>
          {/* View Mode Toggle */}
          <div style={{
            display: 'flex',
            gap: '0.5rem',
            background: 'var(--card)',
            padding: '0.375rem',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border)',
          }}>
            <button
              onClick={() => setViewMode('product')}
              style={{
                padding: '0.625rem 1.25rem',
                background: viewMode === 'product' ? 'var(--gradient-primary)' : 'transparent',
                color: viewMode === 'product' ? 'white' : 'var(--foreground)',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                fontWeight: '500',
                fontSize: '0.875rem',
                transition: 'all var(--transition-fast)',
              }}
            >
              Product Code View
            </button>
            <button
              onClick={() => setViewMode('mfc')}
              style={{
                padding: '0.625rem 1.25rem',
                background: viewMode === 'mfc' ? 'var(--gradient-primary)' : 'transparent',
                color: viewMode === 'mfc' ? 'white' : 'var(--foreground)',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                fontWeight: '500',
                fontSize: '0.875rem',
                transition: 'all var(--transition-fast)',
              }}
            >
              MFC View
            </button>
          </div>

          {/* Export Button */}
          <button
            onClick={() => exportToExcel(sortedData, viewMode)}
            disabled={sortedData.length === 0}
            style={{
              padding: '0.75rem 1.5rem',
              background: sortedData.length === 0 ? 'var(--muted)' : 'linear-gradient(135deg, #10b981 0%, #34d399 100%)',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              color: sortedData.length === 0 ? 'var(--muted-foreground)' : 'white',
              cursor: sortedData.length === 0 ? 'not-allowed' : 'pointer',
              fontSize: '0.875rem',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              boxShadow: sortedData.length === 0 ? 'none' : 'var(--shadow-lg)',
              transition: 'all var(--transition-fast)',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export to Excel
          </button>
        </div>

        {/* Table Card */}
        <div style={{
          background: 'var(--card)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-md)',
          overflow: 'hidden',
        }}>
          {/* Table Header Info */}
          <div style={{
            padding: '1.5rem',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <h2 style={{
              fontSize: '1.125rem',
              fontWeight: '600',
              color: 'var(--foreground)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="8" y1="6" x2="21" y2="6" />
                <line x1="8" y1="12" x2="21" y2="12" />
                <line x1="8" y1="18" x2="21" y2="18" />
                <line x1="3" y1="6" x2="3.01" y2="6" />
                <line x1="3" y1="12" x2="3.01" y2="12" />
                <line x1="3" y1="18" x2="3.01" y2="18" />
              </svg>
              Product Records
            </h2>
            <span style={{
              padding: '0.375rem 0.75rem',
              background: 'rgba(139, 92, 246, 0.1)',
              color: '#8b5cf6',
              borderRadius: 'var(--radius-full)',
              fontSize: '0.75rem',
              fontWeight: '600',
            }}>
              Showing {sortedData.length} of {total}
            </span>
          </div>

          {/* Table */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{
              width: '100%',
              borderCollapse: 'collapse',
            }}>
              <thead style={{
                background: 'var(--muted)',
                borderBottom: '2px solid var(--border)',
              }}>
                <tr>
                  <th style={{
                    padding: '1rem',
                    textAlign: 'left',
                    fontSize: '0.75rem',
                    fontWeight: '600',
                    color: 'var(--muted-foreground)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    width: '80px',
                  }}>
                    SR No
                  </th>
                  <th 
                    onClick={() => handleSort('productCode')}
                    style={{
                      padding: '1rem',
                      textAlign: 'left',
                      fontSize: '0.75rem',
                      fontWeight: '600',
                      color: 'var(--muted-foreground)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      cursor: 'pointer',
                      userSelect: 'none',
                      transition: 'background-color var(--transition-fast)',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.05)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      Product Code
                      {sortField === 'productCode' && (
                        <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </div>
                  </th>
                  <th 
                    onClick={() => handleSort('genericName')}
                    style={{
                      padding: '1rem',
                      textAlign: 'left',
                      fontSize: '0.75rem',
                      fontWeight: '600',
                      color: 'var(--muted-foreground)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      cursor: 'pointer',
                      userSelect: 'none',
                      transition: 'background-color var(--transition-fast)',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.05)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      Generic Name
                      {sortField === 'genericName' && (
                        <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </div>
                  </th>
                  <th 
                    onClick={() => handleSort('masterCardNo')}
                    style={{
                      padding: '1rem',
                      textAlign: 'left',
                      fontSize: '0.75rem',
                      fontWeight: '600',
                      color: 'var(--muted-foreground)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      cursor: 'pointer',
                      userSelect: 'none',
                      transition: 'background-color var(--transition-fast)',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.05)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      Master Card No
                      {sortField === 'masterCardNo' && (
                        <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </div>
                  </th>
                  <th 
                    onClick={() => handleSort('therapeuticCategory')}
                    style={{
                      padding: '1rem',
                      textAlign: 'left',
                      fontSize: '0.75rem',
                      fontWeight: '600',
                      color: 'var(--muted-foreground)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      cursor: 'pointer',
                      userSelect: 'none',
                      transition: 'background-color var(--transition-fast)',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.05)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      Therapeutic Category
                      {sortField === 'therapeuticCategory' && (
                        <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </div>
                  </th>
                  <th 
                    onClick={() => handleSort('productName')}
                    style={{
                      padding: '1rem',
                      textAlign: 'left',
                      fontSize: '0.75rem',
                      fontWeight: '600',
                      color: 'var(--muted-foreground)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      cursor: 'pointer',
                      userSelect: 'none',
                      transition: 'background-color var(--transition-fast)',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.05)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      Product Name
                      {sortField === 'productName' && (
                        <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </div>
                  </th>
                  <th 
                    onClick={() => handleSort('department')}
                    style={{
                      padding: '1rem',
                      textAlign: 'left',
                      fontSize: '0.75rem',
                      fontWeight: '600',
                      color: 'var(--muted-foreground)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      cursor: 'pointer',
                      userSelect: 'none',
                      transition: 'background-color var(--transition-fast)',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.05)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      Department
                      {sortField === 'department' && (
                        <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </div>
                  </th>
                  <th 
                    onClick={() => handleSort('storageCondition')}
                    style={{
                      padding: '1rem',
                      textAlign: 'left',
                      fontSize: '0.75rem',
                      fontWeight: '600',
                      color: 'var(--muted-foreground)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      cursor: 'pointer',
                      userSelect: 'none',
                      transition: 'background-color var(--transition-fast)',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.05)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      Storage Condition
                      {sortField === 'storageCondition' && (
                        <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </div>
                  </th>
                  <th 
                    onClick={() => handleSort('productType')}
                    style={{
                      padding: '1rem',
                      textAlign: 'left',
                      fontSize: '0.75rem',
                      fontWeight: '600',
                      color: 'var(--muted-foreground)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      cursor: 'pointer',
                      userSelect: 'none',
                      transition: 'background-color var(--transition-fast)',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.05)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      Product Type
                      {sortField === 'productType' && (
                        <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </div>
                  </th>
                  <th style={{
                    padding: '1rem',
                    textAlign: 'left',
                    fontSize: '0.75rem',
                    fontWeight: '600',
                    color: 'var(--muted-foreground)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}>
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} style={{
                      padding: '3rem',
                      textAlign: 'center',
                      color: 'var(--muted-foreground)',
                    }}>
                      <svg className="animate-spin" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ display: 'inline-block', marginBottom: '0.5rem' }}>
                        <path d="M21 12a9 9 0 11-6.219-8.56" strokeLinecap="round" />
                      </svg>
                      <div>Loading products...</div>
                    </td>
                  </tr>
                ) : sortedData.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{
                      padding: '3rem',
                      textAlign: 'center',
                      color: 'var(--muted-foreground)',
                    }}>
                      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ display: 'inline-block', marginBottom: '1rem', opacity: 0.3 }}>
                        <circle cx="11" cy="11" r="8" />
                        <path d="m21 21-4.35-4.35" />
                      </svg>
                      <div style={{ fontSize: '1.125rem', fontWeight: '500' }}>No products found</div>
                      <div style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
                        {searchTerm ? 'Try a different search term' : 'Upload a Product Master XML file from the home page'}
                      </div>
                    </td>
                  </tr>
                ) : (
                  sortedData.map((item, index) => {
                    // Check if row has errors
                    const errors = getMissingFields(item);
                    const hasError = errors.length > 0;

                    return (
                      <tr key={item._id} style={{
                        borderBottom: '1px solid var(--border)',
                        transition: 'background-color var(--transition-fast)',
                        background: hasError 
                          ? 'rgba(239, 68, 68, 0.05)' 
                          : index % 2 === 0 ? 'transparent' : 'rgba(0, 0, 0, 0.02)',
                        borderLeft: hasError ? '3px solid #ef4444' : 'none',
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = hasError ? 'rgba(239, 68, 68, 0.1)' : 'var(--muted)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = hasError ? 'rgba(239, 68, 68, 0.05)' : index % 2 === 0 ? 'transparent' : 'rgba(0, 0, 0, 0.02)'}
                      >
                        {/* SR Number */} 
                        <td style={{
                          padding: '1rem',
                          fontSize: '0.875rem',
                          fontWeight: '600',
                          color: 'var(--foreground)',
                          fontFamily: 'monospace',
                        }}>
                          {index + 1}
                        </td>
                        
                        {/* Product Code */}
                        <td style={{
                          padding: '1rem',
                          fontSize: '0.875rem',
                          color: isMissingData(item.productCode) ? '#ef4444' : 'var(--foreground)',
                          fontFamily: 'monospace',
                          fontWeight: '500',
                        }}>{item.productCode || 'N/A'}</td>
                        
                        {/* Generic Name - Newly Added */}
                        <td style={{
                          padding: '1rem',
                          fontSize: '0.875rem',
                          color: 'var(--foreground)',
                        }}>
                          {item.genericName || '-'}
                        </td>
                        
                        {/* Master Card No */}
                        <td style={{
                          padding: '1rem',
                          fontSize: '0.875rem',
                          color: isMissingData(item.masterCardNo) ? '#ef4444' : 'var(--foreground)',
                          fontFamily: 'monospace',
                        }}>{item.masterCardNo || 'N/A'}</td>
                        
                        {/* Therapeutic Category */}
                        <td style={{
                          padding: '1rem',
                          fontSize: '0.875rem',
                          color: 'var(--foreground)',
                        }}>
                          <span style={{
                            padding: '0.25rem 0.625rem',
                            background: isMissingData(item.therapeuticCategory) ? 'rgba(239, 68, 68, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                            color: isMissingData(item.therapeuticCategory) ? '#ef4444' : '#f59e0b',
                            borderRadius: 'var(--radius-sm)',
                            fontSize: '0.75rem',
                            fontWeight: '600',
                          }}>
                            {item.therapeuticCategory || 'N/A'}
                          </span>
                        </td>
                        
                        {/* Product Name */}
                        <td style={{
                          padding: '1rem',
                          fontSize: '0.875rem',
                          fontWeight: '500',
                          color: isMissingData(item.productName) ? '#ef4444' : 'var(--foreground)',
                        }}>{item.productName || 'N/A'}</td>
                        
                        {/* Department */}
                        <td style={{
                          padding: '1rem',
                          fontSize: '0.875rem',
                          color: isMissingData(item.department) ? '#ef4444' : 'var(--foreground)',
                        }}>{item.department || 'N/A'}</td>
                        
                        {/* Storage Condition */}
                        <td style={{
                          padding: '1rem',
                          fontSize: '0.875rem',
                          color: isMissingData(item.storageCondition) ? '#ef4444' : 'var(--muted-foreground)',
                          maxWidth: '250px',
                        }}>
                          <div style={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }} title={item.storageCondition || 'N/A'}>
                            {item.storageCondition || 'N/A'}
                          </div>
                        </td>
                        
                        {/* Product Type */}
                        <td style={{
                          padding: '1rem',
                          fontSize: '0.875rem',
                          color: 'var(--foreground)',
                        }}>
                          <span style={{
                            padding: '0.25rem 0.625rem',
                            background: isMissingData(item.productType) 
                              ? 'rgba(239, 68, 68, 0.1)' 
                              : item.productType === 'EXPORT' ? 'rgba(20, 184, 166, 0.1)' : 'rgba(139, 92, 246, 0.1)',
                            color: isMissingData(item.productType) 
                              ? '#ef4444' 
                              : item.productType === 'EXPORT' ? '#14b8a6' : '#8b5cf6',
                            borderRadius: 'var(--radius-sm)',
                            fontSize: '0.75rem',
                            fontWeight: '600',
                          }}>
                            {item.productType || 'N/A'}
                          </span>
                        </td>

                        {/* Status (Errors) */}
                        <td style={{
                          padding: '1rem',
                          fontSize: '0.75rem',
                          color: hasError ? '#ef4444' : '#10b981',
                          fontWeight: '600',
                          verticalAlign: 'top',
                        }}>
                          {hasError ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                              <span style={{ fontWeight: '700' }}>MISSING:</span>
                              <ul style={{ paddingLeft: '1rem', margin: 0, listStyleType: 'disc' }}>
                                {errors.map((err: string, i: number) => (
                                  <li key={i}>{err}</li>
                                ))}
                              </ul>
                            </div>
                          ) : (
                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                              OK
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Info Card */}
        <div style={{
          marginTop: '2rem',
          padding: '1.5rem',
          background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.1) 0%, rgba(168, 85, 247, 0.05) 100%)',
          border: '1px solid rgba(139, 92, 246, 0.2)',
          borderRadius: 'var(--radius-lg)',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '1rem',
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
            <div>
              <h3 style={{
                fontSize: '0.875rem',
                fontWeight: '600',
                color: '#8b5cf6',
                marginBottom: '0.5rem',
              }}>
                Product Master Data
              </h3>
              <p style={{
                fontSize: '0.875rem',
                color: 'var(--muted-foreground)',
                lineHeight: '1.6',
              }}>
                This page displays all products from the Product Master database. To add new products, 
                upload a Product Master XML file from the home page using the "Scan & Process Files" feature. 
                The system will automatically detect and import product data.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer style={{
        padding: '2rem',
        textAlign: 'center',
        borderTop: '1px solid var(--border)',
        color: 'var(--muted-foreground)',
        fontSize: '0.875rem',
      }}>
        <p>Product Master Database Management System</p>
      </footer>
    </div>
  );
}
