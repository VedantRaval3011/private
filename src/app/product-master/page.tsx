'use client';

/**
 * Product Master Page
 * Displays all product master data from the database
 * Two views: MFC-wise and Product Code-wise with Excel export
 */

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import * as XLSX from 'xlsx';

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
  specification?: string;
  effectiveBatchNo?: string;
  effectiveDate?: string;
  revisionNo?: string;
  workStatus?: string;
  mfgLicenseNo?: string;
  liveMonth?: string;
  batchSize?: string;
  batchUom?: string;
  locationCode?: string;
}

interface MissingProduct {
  itemCode: string;
  itemName: string;
  department: string;
  productType: string;
  batchCount: number;
  sampleBatchNumbers: string[];
}

type ViewMode = 'mfc' | 'product' | 'effective-batch' | 'batch';
type SortField = 'therapeuticCategory' | 'productName' | 'productCode' | 'genericName' | 'department' | 'masterCardNo' | 'storageCondition' | 'productType' | 'specification' | 'effectiveBatchNo' | 'srNo' | 'status';
type SortDirection = 'asc' | 'desc' | null;

// Helper to check if a field has missing/invalid data
const MISSING_VALUES = new Set(['n/a', 'na', 'nil', 'null', 'none', '-', '--', 'n.a.', 'n.a', '0', 'undefined', 'not available', 'not applicable']);
const isMissingData = (value: string | undefined | null): boolean => {
  if (value === null || value === undefined) return true;
  const trimmed = value.trim();
  if (trimmed === '') return true;
  if (MISSING_VALUES.has(trimmed.toLowerCase())) return true;
  // Flag values composed entirely of non-word characters (symbols like ©, °, • etc.)
  // Any real field value must contain at least one letter or digit
  if (!/\w/.test(trimmed)) return true;
  return false;
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
const exportToExcel = (
  data: ProductMaster[],
  viewMode: ViewMode,
  totalCount: number,
  filters: {
    searchTerm: string;
    batchFilter: 'all' | 'mfg' | 'not-mfg';
    errorFilter: string | null;
  }
) => {
  if (data.length === 0) {
    alert('No data to export');
    return;
  }

  const exportDate = new Date().toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });

  const viewLabel: Record<ViewMode, string> = {
    product: 'Product Code-Wise',
    mfc: 'MFC-Wise',
    'effective-batch': 'Effective Batch-Wise',
    batch: 'Batch-Wise',
  };

  const batchFilterLabel: Record<'all' | 'mfg' | 'not-mfg', string> = {
    all: 'All Products',
    mfg: 'Manufactured Only',
    'not-mfg': 'Not Manufactured Only',
  };

  const errorFilterLabels: Record<string, string> = {
    'mfg-missing': 'MFG Missing',
    'has-errors': 'Has Field Errors',
    'missing-therapeutic': 'Missing Therapeutic Category',
    'missing-product-name': 'Missing Product Name',
    'missing-department': 'Missing Department',
    'missing-master-card': 'Missing Master Card No',
    'missing-storage': 'Missing Storage Condition',
    'missing-product-type': 'Missing Product Type',
  };

  const activeFilters: string[] = [];
  if (filters.searchTerm) activeFilters.push(`Search: "${filters.searchTerm}"`);
  if (filters.batchFilter !== 'all') activeFilters.push(`Batch Filter: ${batchFilterLabel[filters.batchFilter]}`);
  if (filters.errorFilter) activeFilters.push(`Error Filter: ${errorFilterLabels[filters.errorFilter] ?? filters.errorFilter}`);

  // Build summary block
  const q = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
  const summaryRows = [
    [q('PRODUCT MASTER — EXPORT SUMMARY'), '', '', '', '', '', '', '', '', '', '', ''],
    [q('Report Generated'), q(exportDate), '', '', '', '', '', '', '', '', '', ''],
    [q('View Mode'), q(viewLabel[viewMode]), '', '', '', '', '', '', '', '', '', ''],
    [q('Total Records in DB'), q(String(totalCount)), '', '', '', '', '', '', '', '', '', ''],
    [q('Records Exported'), q(String(data.length)), '', '', '', '', '', '', '', '', '', ''],
    [
      q('Active Filters'),
      q(activeFilters.length > 0 ? activeFilters.join(' | ') : 'None (all records)'),
      '', '', '', '', '', '', '', '', '', '',
    ],
    ['', '', '', '', '', '', '', '', '', '', '', ''], // blank separator row
  ];

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
    'Specification',
    'Effective Batch No',
    'Errors'
  ];

  const rows = data.map((item, index) => {
    const errors = getMissingFields(item);
    const notMfg = item.sourceFile === 'added-from-batch-data';
    const statusParts: string[] = [];
    if (notMfg) statusParts.push('MFG MISSING');
    if (errors.length > 0) statusParts.push(`MISSING: ${errors.join(', ')}`);
    if (statusParts.length === 0) statusParts.push('OK');

    return [
      index + 1,
      item.productCode || 'N/A',
      item.genericName || '',
      item.masterCardNo || 'N/A',
      item.therapeuticCategory || 'N/A',
      item.productName || 'N/A',
      item.department || 'N/A',
      item.storageCondition || 'N/A',
      item.productType || 'N/A',
      item.specification || '',
      item.effectiveBatchNo || '',
      statusParts.join(' | ')
    ];
  });

  const csvContent = [
    ...summaryRows.map(row => row.join(',')),
    headers.map(h => q(h)).join(','),
    ...rows.map(row => row.map(cell => q(String(cell))).join(','))
  ].join('\n');

  // Build a concise filename that reflects active filters
  const filterSuffix = activeFilters.length > 0
    ? '_' + activeFilters
        .map(f => f.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, ''))
        .join('-')
        .slice(0, 60)
    : '';

  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `Product_Master_${viewLabel[viewMode].replace(/\s+/g, '_')}${filterSuffix}_${new Date().toISOString().split('T')[0]}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

// Export Effective Batch view as a real .xlsx file with one sheet per batch group
const exportEffectiveBatchToExcel = (data: ProductMaster[], errorsOnly: boolean) => {
  if (data.length === 0) {
    alert('No data to export');
    return;
  }

  // Build groups (same logic as render)
  const groupMap = new Map<string, ProductMaster[]>();
  data.forEach(item => {
    const raw = item.effectiveBatchNo;
    const normalized = (raw !== null && raw !== undefined) ? String(raw).trim() : '';
    const key = normalized === '' ? '__null__' : normalized;
    if (!groupMap.has(key)) groupMap.set(key, []);
    groupMap.get(key)!.push(item);
  });

  const isBottomKey = (k: string) => k === '0' || k === '__null__';
  const sortedKeys = Array.from(groupMap.keys()).sort((a, b) => {
    const aBottom = isBottomKey(a);
    const bBottom = isBottomKey(b);
    if (aBottom && bBottom) {
      if (a === '__null__' && b !== '__null__') return 1;
      if (b === '__null__' && a !== '__null__') return -1;
      return 0;
    }
    if (aBottom) return 1;
    if (bBottom) return -1;
    const aNum = parseFloat(a);
    const bNum = parseFloat(b);
    if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
    return a.localeCompare(b);
  });

  const headers = [
    'SR No', 'Product Code', 'Generic Name', 'Master Card No',
    'Therapeutic Category', 'Product Name', 'Department',
    'Storage Condition', 'Product Type', 'Specification',
    'Effective Batch No', 'Errors',
  ];

  const wb = XLSX.utils.book_new();

  sortedKeys.forEach(key => {
    const products = groupMap.get(key)!;
    const filtered = errorsOnly
      ? products.filter(p => getMissingFields(p).length > 0 || p.sourceFile === 'added-from-batch-data')
      : products;

    if (filtered.length === 0) return; // skip empty sheets when errors-only

    const rows = filtered.map((item, idx) => {
      const errors = getMissingFields(item);
      const notMfg = item.sourceFile === 'added-from-batch-data';
      const statusParts: string[] = [];
      if (notMfg) statusParts.push('MFG MISSING');
      if (errors.length > 0) statusParts.push(`MISSING: ${errors.join(', ')}`);
      if (statusParts.length === 0) statusParts.push('OK');
      return [
        idx + 1,
        item.productCode || 'N/A',
        item.genericName || '',
        item.masterCardNo || 'N/A',
        item.therapeuticCategory || 'N/A',
        item.productName || 'N/A',
        item.department || 'N/A',
        item.storageCondition || 'N/A',
        item.productType || 'N/A',
        item.specification || '',
        item.effectiveBatchNo || '',
        statusParts.join(' | '),
      ];
    });

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

    // Column widths
    ws['!cols'] = [
      { wch: 6 }, { wch: 14 }, { wch: 20 }, { wch: 16 },
      { wch: 22 }, { wch: 28 }, { wch: 14 }, { wch: 18 },
      { wch: 14 }, { wch: 12 }, { wch: 16 }, { wch: 40 },
    ];

    const sheetName = key === '__null__'
      ? 'No Eff Batch'
      : key === '0'
        ? 'Eff Batch 0'
        : `Eff Batch ${key}`;

    XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31)); // Excel max 31 chars
  });

  if (wb.SheetNames.length === 0) {
    alert('No records with errors found.');
    return;
  }

  const suffix = errorsOnly ? '_Errors_Only' : '_Full_Data';
  const dateStr = new Date().toISOString().split('T')[0];
  XLSX.writeFile(wb, `Product_Master_Effective_Batch${suffix}_${dateStr}.xlsx`);
};

export default function ProductMasterPage() {
  const [data, setData] = useState<ProductMaster[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('product');
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);

  // Export modal state (effective-batch view)
  const [showExportModal, setShowExportModal] = useState(false);

  // Batch filter state
  const [batchFilter, setBatchFilter] = useState<'all' | 'mfg' | 'not-mfg'>('all');

  // Error type filter state
  const [errorFilter, setErrorFilter] = useState<string | null>(null);

  const toggleErrorFilter = (key: string) => {
    setErrorFilter(prev => prev === key ? null : key);
  };

  // MFC grouped view — tracks which MFC folders are expanded
  const [expandedMfcGroups, setExpandedMfcGroups] = useState<Set<string>>(new Set());

  const toggleMfcGroup = (mfc: string) => {
    setExpandedMfcGroups(prev => {
      const next = new Set(prev);
      if (next.has(mfc)) next.delete(mfc);
      else next.add(mfc);
      return next;
    });
  };

  const expandAllMfcGroups = (groups: string[]) => setExpandedMfcGroups(new Set(groups));
  const collapseAllMfcGroups = () => setExpandedMfcGroups(new Set());

  // Effective Batch grouped view — tracks which groups are expanded
  const [expandedEffBatchGroups, setExpandedEffBatchGroups] = useState<Set<string>>(new Set());

  const toggleEffBatchGroup = (key: string) => {
    setExpandedEffBatchGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const expandAllEffBatchGroups = (keys: string[]) => setExpandedEffBatchGroups(new Set(keys));
  const collapseAllEffBatchGroups = () => setExpandedEffBatchGroups(new Set());

  // Batch-wise grouped view — tracks which batch folders are expanded
  const [expandedBatchGroups, setExpandedBatchGroups] = useState<Set<string>>(new Set());

  const toggleBatchGroup = (key: string) => {
    setExpandedBatchGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const expandAllBatchGroups = (keys: string[]) => setExpandedBatchGroups(new Set(keys));
  const collapseAllBatchGroups = () => setExpandedBatchGroups(new Set());

  // Batch-wise view data: batchNumber → productCode[]
  // fetched lazily from /api/batch/by-codes when the view is first activated
  const [batchLinkMap, setBatchLinkMap] = useState<Map<string, string[]> | null>(null);
  const [batchViewLoading, setBatchViewLoading] = useState(false);

  useEffect(() => {
    if (viewMode !== 'batch' || data.length === 0) return;
    if (batchLinkMap !== null) return; // already fetched
    const productCodes = [...new Set(data.map(d => d.productCode).filter(Boolean))];
    setBatchViewLoading(true);
    fetch('/api/batch/by-codes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productCodes }),
    })
      .then(r => r.json())
      .then(json => {
        const map = new Map<string, string[]>();
        if (json.success && Array.isArray(json.data)) {
          json.data.forEach((item: { batchNumber: string; itemCode: string }) => {
            if (!map.has(item.batchNumber)) map.set(item.batchNumber, []);
            if (!map.get(item.batchNumber)!.includes(item.itemCode)) {
              map.get(item.batchNumber)!.push(item.itemCode);
            }
          });
        }
        setBatchLinkMap(map);
      })
      .catch(err => { console.error('Failed to fetch batch link data', err); setBatchLinkMap(new Map()); })
      .finally(() => setBatchViewLoading(false));
  }, [viewMode, data, batchLinkMap]);

  // Missing products state
  const [missingProducts, setMissingProducts] = useState<MissingProduct[]>([]);
  const [showMissingPanel, setShowMissingPanel] = useState(false);
  const [checkingMissing, setCheckingMissing] = useState(false);
  const [addingProducts, setAddingProducts] = useState(false);
  const [selectedMissing, setSelectedMissing] = useState<Set<string>>(new Set());
  const [missingStats, setMissingStats] = useState<{ totalMissing: number; totalBatchProducts: number } | null>(null);
  const [addMessage, setAddMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const checkMissingProducts = async () => {
    setCheckingMissing(true);
    setAddMessage(null);
    setSelectedMissing(new Set());
    try {
      const res = await fetch('/api/product-master/missing');
      const json = await res.json();
      if (json.success) {
        setMissingProducts(json.missing);
        setMissingStats({ totalMissing: json.totalMissing, totalBatchProducts: json.totalBatchProducts });
        setShowMissingPanel(true);
      }
    } catch (err) {
      console.error('Failed to check missing products', err);
    }
    setCheckingMissing(false);
  };

  const toggleSelectMissing = (itemCode: string) => {
    setSelectedMissing(prev => {
      const next = new Set(prev);
      if (next.has(itemCode)) next.delete(itemCode);
      else next.add(itemCode);
      return next;
    });
  };

  const selectAllMissing = () => {
    setSelectedMissing(new Set(missingProducts.map(p => p.itemCode)));
  };

  const deselectAllMissing = () => {
    setSelectedMissing(new Set());
  };

  const addSelectedToMaster = async () => {
    if (selectedMissing.size === 0) return;
    setAddingProducts(true);
    setAddMessage(null);
    try {
      const toAdd = missingProducts.filter(p => selectedMissing.has(p.itemCode));
      const res = await fetch('/api/product-master/missing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ products: toAdd.map(p => ({ itemCode: p.itemCode, itemName: p.itemName, department: p.department, productType: p.productType })) }),
      });
      const json = await res.json();
      if (json.success) {
        setAddMessage({ type: 'success', text: json.message });
        // Refresh missing list and main data
        await checkMissingProducts();
        await fetchData(searchTerm);
      } else {
        setAddMessage({ type: 'error', text: json.message });
      }
    } catch (err) {
      setAddMessage({ type: 'error', text: 'Failed to add products. Please try again.' });
    }
    setAddingProducts(false);
  };

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
  // A product is "not manufactured" if it was added from batch data (no proper PM entry)
  const isNotManufactured = (item: ProductMaster) => item.sourceFile === 'added-from-batch-data';

  const getStatusValue = (item: ProductMaster): number => {
    // Status sort order: OK (0) > MFG MISSING (1) > Errors (2)
    if (isNotManufactured(item)) return 1;
    if (getMissingFields(item).length > 0) return 2;
    return 0;
  };

  const getSortedData = () => {
    let sorted = [...data];

    // Apply column sorting if active
    if (sortField && sortDirection) {
      sorted.sort((a, b) => {
        let comparison = 0;

        if (sortField === 'srNo') {
          // Sort by original order (index in data array)
          const aIndex = data.indexOf(a);
          const bIndex = data.indexOf(b);
          comparison = aIndex - bIndex;
        } else if (sortField === 'status') {
          // Sort by status (OK > MFG MISSING > Errors)
          const aStatus = getStatusValue(a);
          const bStatus = getStatusValue(b);
          comparison = aStatus - bStatus;
        } else {
          const aValue = (a[sortField as keyof ProductMaster] || 'ZZZ').toString().toLowerCase();
          const bValue = (b[sortField as keyof ProductMaster] || 'ZZZ').toString().toLowerCase();
          comparison = aValue.localeCompare(bValue);
        }

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

    // Always float "not manufactured" (MFG missing) records to the top
    sorted.sort((a, b) => {
      const aNotMfg = isNotManufactured(a) ? 0 : 1;
      const bNotMfg = isNotManufactured(b) ? 0 : 1;
      return aNotMfg - bNotMfg;
    });

    return sorted;
  };

  const sortedData = getSortedData().filter(item => {
    if (batchFilter === 'not-mfg' && !isNotManufactured(item)) return false;
    if (batchFilter === 'mfg' && isNotManufactured(item)) return false;
    if (errorFilter === 'mfg-missing') return isNotManufactured(item);
    if (errorFilter === 'has-errors') return getMissingFields(item).length > 0;
    if (errorFilter === 'missing-therapeutic') return isMissingData(item.therapeuticCategory);
    if (errorFilter === 'missing-product-name') return isMissingData(item.productName);
    if (errorFilter === 'missing-department') return isMissingData(item.department);
    if (errorFilter === 'missing-master-card') return isMissingData(item.masterCardNo);
    if (errorFilter === 'missing-storage') return isMissingData(item.storageCondition);
    if (errorFilter === 'missing-product-type') return isMissingData(item.productType);
    return true;
  });

  // Count not-manufactured records (added from batch, missing proper PM entry)
  const notManufacturedCount = data.filter(isNotManufactured).length;
  const manufacturedCount = data.length - notManufacturedCount;

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

  // Per-field error counts
  const fieldErrorCounts = {
    mfgMissing: notManufacturedCount,
    hasErrors: data.filter(item => getMissingFields(item).length > 0).length,
    missingTherapeutic: data.filter(item => isMissingData(item.therapeuticCategory)).length,
    missingProductName: data.filter(item => isMissingData(item.productName)).length,
    missingDepartment: data.filter(item => isMissingData(item.department)).length,
    missingMasterCard: data.filter(item => isMissingData(item.masterCardNo)).length,
    missingStorage: data.filter(item => isMissingData(item.storageCondition)).length,
    missingProductType: data.filter(item => isMissingData(item.productType)).length,
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--background)',
    }}>
      {/* Header */}
      <header style={{
        background: 'var(--gradient-hero)',
        padding: '0.6rem 0',
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
                fontSize: 'clamp(0.9rem, 2.5vw, 1.15rem)',
                fontWeight: '700',
                color: 'white',
                marginBottom: '0.1rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                  <line x1="8" y1="21" x2="16" y2="21" />
                  <line x1="12" y1="17" x2="12" y2="21" />
                </svg>
                Product Master
              </h1>
              <p style={{
                color: 'rgba(255, 255, 255, 0.8)',
                fontSize: '0.7rem',
                margin: 0,
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
        padding: '0.5rem 1rem',
      }}>
        {/* Search and Stats */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '0.5rem',
          flexWrap: 'wrap',
          gap: '0.5rem',
        }}>
          <div style={{ flex: '1', minWidth: '200px', maxWidth: '400px' }}>
            <input
              type="text"
              placeholder="Search by Product Name, Code, Department..."
              value={searchTerm}
              onChange={handleSearch}
              style={{
                width: '100%',
                padding: '0.45rem 0.75rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border)',
                background: 'var(--card)',
                color: 'var(--foreground)',
                fontSize: '0.8rem',
                transition: 'all var(--transition-fast)',
              }}
            />
          </div>

          {/* Stats Cards */}
          <div style={{
            display: 'flex',
            gap: '0.5rem',
            flexWrap: 'wrap',
          }}>
            <div style={{
              padding: '0.3rem 0.75rem',
              borderRadius: 'var(--radius-md)',
              background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.1) 0%, rgba(168, 85, 247, 0.1) 100%)',
              border: '1px solid rgba(139, 92, 246, 0.2)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2">
                <path d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
              </svg>
              <div>
                <div style={{ fontSize: '0.6rem', color: 'var(--muted-foreground)' }}>Total</div>
                <div style={{ fontSize: '0.9rem', fontWeight: '700', color: '#8b5cf6' }}>{total}</div>
              </div>
            </div>

            {notManufacturedCount > 0 && (
              <div style={{
                padding: '0.3rem 0.75rem',
                borderRadius: 'var(--radius-md)',
                background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.1) 0%, rgba(251, 191, 36, 0.1) 100%)',
                border: '1px solid rgba(245, 158, 11, 0.2)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <div>
                  <div style={{ fontSize: '0.6rem', color: 'var(--muted-foreground)' }}>MFG Missing</div>
                  <div style={{ fontSize: '0.9rem', fontWeight: '700', color: '#f59e0b' }}>{notManufacturedCount}</div>
                </div>
              </div>
            )}

            <div style={{
              padding: '0.3rem 0.75rem',
              borderRadius: 'var(--radius-md)',
              background: errorStats > 0
                ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.1) 0%, rgba(220, 38, 38, 0.1) 100%)'
                : 'linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(52, 211, 153, 0.1) 100%)',
              border: errorStats > 0 ? '1px solid rgba(239, 68, 68, 0.2)' : '1px solid rgba(16, 185, 129, 0.2)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={errorStats > 0 ? '#ef4444' : '#10b981'} strokeWidth="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <div>
                <div style={{ fontSize: '0.6rem', color: 'var(--muted-foreground)' }}>Errors</div>
                <div style={{ fontSize: '0.9rem', fontWeight: '700', color: errorStats > 0 ? '#ef4444' : '#10b981' }}>{errorStats}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Error Filter Chips */}
        {data.length > 0 && (
          <div style={{ marginBottom: '0.4rem' }}>
            <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: '0.6rem', fontWeight: '600', color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em', marginRight: '0.2rem' }}>
                Filter by error:
              </span>
              {([
                { key: 'mfg-missing',          label: 'MFG Missing',          count: fieldErrorCounts.mfgMissing,        color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.35)' },
                { key: 'has-errors',            label: 'Has Field Errors',     count: fieldErrorCounts.hasErrors,          color: '#ef4444', bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.35)' },
                { key: 'missing-therapeutic',   label: 'Therapeutic Cat.',     count: fieldErrorCounts.missingTherapeutic, color: '#ec4899', bg: 'rgba(236,72,153,0.12)',  border: 'rgba(236,72,153,0.35)' },
                { key: 'missing-product-name',  label: 'Product Name',         count: fieldErrorCounts.missingProductName, color: '#f97316', bg: 'rgba(249,115,22,0.12)',  border: 'rgba(249,115,22,0.35)' },
                { key: 'missing-department',    label: 'Department',           count: fieldErrorCounts.missingDepartment,  color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)',  border: 'rgba(139,92,246,0.35)' },
                { key: 'missing-master-card',   label: 'Master Card No',       count: fieldErrorCounts.missingMasterCard,  color: '#6366f1', bg: 'rgba(99,102,241,0.12)',  border: 'rgba(99,102,241,0.35)' },
                { key: 'missing-storage',       label: 'Storage Condition',    count: fieldErrorCounts.missingStorage,     color: '#14b8a6', bg: 'rgba(20,184,166,0.12)',  border: 'rgba(20,184,166,0.35)' },
                { key: 'missing-product-type',  label: 'Product Type',         count: fieldErrorCounts.missingProductType, color: '#64748b', bg: 'rgba(100,116,139,0.12)', border: 'rgba(100,116,139,0.35)' },
              ] as const).filter(({ count }) => count > 0).map(({ key, label, count, color, bg, border }) => {
                const isActive = errorFilter === key;
                return (
                  <button
                    key={key}
                    onClick={() => toggleErrorFilter(key)}
                    title={`Filter: ${label}`}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                      padding: '0.15rem 0.5rem',
                      background: isActive ? bg : 'var(--card)',
                      border: `1px solid ${isActive ? border : 'var(--border)'}`,
                      borderRadius: '9999px',
                      cursor: 'pointer',
                      fontSize: '0.6rem',
                      fontWeight: isActive ? '700' : '500',
                      color: isActive ? color : 'var(--muted-foreground)',
                      transition: 'all var(--transition-fast)',
                      boxShadow: isActive ? `0 0 0 2px ${border}` : 'none',
                    }}
                  >
                    {label}
                    <span style={{
                      padding: '0.05rem 0.35rem',
                      background: isActive ? color : 'var(--muted)',
                      color: isActive ? 'white' : 'var(--muted-foreground)',
                      borderRadius: '9999px',
                      fontSize: '0.6rem',
                      fontWeight: '700',
                    }}>
                      {count}
                    </span>
                  </button>
                );
              })}
              {errorFilter && (
                <button
                  onClick={() => setErrorFilter(null)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.2rem',
                    padding: '0.15rem 0.5rem',
                    background: 'var(--muted)',
                    border: '1px solid var(--border)',
                    borderRadius: '9999px',
                    cursor: 'pointer',
                    fontSize: '0.6rem',
                    fontWeight: '600',
                    color: 'var(--muted-foreground)',
                  }}
                >
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                  Clear
                </button>
              )}
            </div>
          </div>
        )}

        {/* Batch Filter Buttons */}
        <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.4rem', flexWrap: 'wrap' }}>
          {([
            { key: 'all', label: 'All Batches', count: data.length, color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.1)', border: 'rgba(139, 92, 246, 0.3)' },
            { key: 'mfg', label: 'Manufactured', count: manufacturedCount, color: '#10b981', bg: 'rgba(16, 185, 129, 0.1)', border: 'rgba(16, 185, 129, 0.3)' },
            { key: 'not-mfg', label: 'Not Manufactured', count: notManufacturedCount, color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.1)', border: 'rgba(245, 158, 11, 0.3)' },
          ] as const).map(({ key, label, count, color, bg, border }) => (
            <button
              key={key}
              onClick={() => setBatchFilter(key)}
              style={{
                padding: '0.3rem 0.75rem',
                background: batchFilter === key ? bg : 'var(--card)',
                border: `2px solid ${batchFilter === key ? border : 'var(--border)'}`,
                borderRadius: 'var(--radius-md)',
                color: batchFilter === key ? color : 'var(--muted-foreground)',
                cursor: 'pointer',
                fontSize: '0.7rem',
                fontWeight: batchFilter === key ? '700' : '500',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                transition: 'all var(--transition-fast)',
                boxShadow: batchFilter === key ? `0 0 0 2px ${border}` : 'none',
              }}
            >
              {label}
              <span style={{
                padding: '0.125rem 0.5rem',
                background: batchFilter === key ? color : 'var(--muted)',
                color: batchFilter === key ? 'white' : 'var(--muted-foreground)',
                borderRadius: '9999px',
                fontSize: '0.7rem',
                fontWeight: '700',
                minWidth: '24px',
                textAlign: 'center',
              }}>
                {count}
              </span>
            </button>
          ))}
        </div>

        {/* View Mode Toggle and Export Buttons */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '0.4rem',
          flexWrap: 'wrap',
          gap: '0.5rem',
        }}>
          {/* View Mode Toggle */}
          <div style={{
            display: 'flex',
            gap: '0.25rem',
            background: 'var(--card)',
            padding: '0.2rem',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border)',
          }}>
            <button
              onClick={() => setViewMode('product')}
              style={{
                padding: '0.3rem 0.75rem',
                background: viewMode === 'product' ? 'var(--gradient-primary)' : 'transparent',
                color: viewMode === 'product' ? 'white' : 'var(--foreground)',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                fontWeight: '500',
                fontSize: '0.7rem',
                transition: 'all var(--transition-fast)',
              }}
            >
              Product Code
            </button>
            <button
              onClick={() => setViewMode('mfc')}
              style={{
                padding: '0.3rem 0.75rem',
                background: viewMode === 'mfc' ? 'var(--gradient-primary)' : 'transparent',
                color: viewMode === 'mfc' ? 'white' : 'var(--foreground)',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                fontWeight: '500',
                fontSize: '0.7rem',
                transition: 'all var(--transition-fast)',
              }}
            >
              MFC
            </button>
            <button
              onClick={() => setViewMode('effective-batch')}
              style={{
                padding: '0.3rem 0.75rem',
                background: viewMode === 'effective-batch' ? 'var(--gradient-primary)' : 'transparent',
                color: viewMode === 'effective-batch' ? 'white' : 'var(--foreground)',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                fontWeight: '500',
                fontSize: '0.7rem',
                transition: 'all var(--transition-fast)',
              }}
            >
              Eff. Batch
            </button>
            <button
              onClick={() => setViewMode('batch')}
              style={{
                padding: '0.3rem 0.75rem',
                background: viewMode === 'batch' ? 'var(--gradient-primary)' : 'transparent',
                color: viewMode === 'batch' ? 'white' : 'var(--foreground)',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                fontWeight: '500',
                fontSize: '0.7rem',
                transition: 'all var(--transition-fast)',
              }}
            >
              Batch
            </button>
          </div>

          {/* Check Missing & Export Buttons Container */}
          <div style={{
            display: 'flex',
            gap: '0.5rem',
            alignItems: 'center',
          }}>
            {/* Check Missing Products Button */}
            <button
              onClick={checkMissingProducts}
              disabled={checkingMissing}
              style={{
                padding: '0.35rem 0.875rem',
                background: showMissingPanel
                  ? 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)'
                  : 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                color: 'white',
                cursor: checkingMissing ? 'not-allowed' : 'pointer',
                fontSize: '0.7rem',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                boxShadow: 'var(--shadow-lg)',
                transition: 'all var(--transition-fast)',
                opacity: checkingMissing ? 0.7 : 1,
              }}
            >
              {checkingMissing ? (
                <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12a9 9 0 11-6.219-8.56" strokeLinecap="round" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                  <line x1="11" y1="8" x2="11" y2="14" /><line x1="8" y1="11" x2="14" y2="11" />
                </svg>
              )}
              {checkingMissing ? 'Checking...' : showMissingPanel ? 'Hide Missing' : 'Check Missing'}
              {missingStats && missingStats.totalMissing > 0 && !showMissingPanel && (
                <span style={{
                  background: 'rgba(255,255,255,0.3)',
                  borderRadius: '9999px',
                  padding: '0.125rem 0.5rem',
                  fontSize: '0.7rem',
                  fontWeight: '700',
                }}>
                  {missingStats.totalMissing}
                </span>
              )}
            </button>

            {/* Export Button */}
            <button
            onClick={() => {
              if (viewMode === 'effective-batch') {
                setShowExportModal(true);
              } else {
                exportToExcel(sortedData, viewMode, total, { searchTerm, batchFilter, errorFilter });
              }
            }}
            disabled={sortedData.length === 0}
            style={{
              padding: '0.35rem 0.875rem',
              background: sortedData.length === 0 ? 'var(--muted)' : 'linear-gradient(135deg, #10b981 0%, #34d399 100%)',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              color: sortedData.length === 0 ? 'var(--muted-foreground)' : 'white',
              cursor: sortedData.length === 0 ? 'not-allowed' : 'pointer',
              fontSize: '0.7rem',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              boxShadow: sortedData.length === 0 ? 'none' : 'var(--shadow-lg)',
              transition: 'all var(--transition-fast)',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export to Excel
          </button>
          </div>
        </div>

        {/* Effective Batch Export Modal */}
        {showExportModal && (
          <div
            onClick={() => setShowExportModal(false)}
            style={{
              position: 'fixed', inset: 0, zIndex: 1000,
              background: 'rgba(0,0,0,0.45)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{
                background: 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-lg)',
                boxShadow: 'var(--shadow-lg)',
                padding: '1.75rem',
                width: '340px',
                display: 'flex',
                flexDirection: 'column',
                gap: '1.25rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '700', color: 'var(--foreground)' }}>
                    Export to Excel
                  </h3>
                  <p style={{ margin: '0.25rem 0 0', fontSize: '0.72rem', color: 'var(--muted-foreground)' }}>
                    One sheet per Effective Batch group
                  </p>
                </div>
                <button
                  onClick={() => setShowExportModal(false)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)', padding: '0.25rem' }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <button
                  onClick={() => { exportEffectiveBatchToExcel(sortedData, false); setShowExportModal(false); }}
                  style={{
                    padding: '0.75rem 1rem',
                    background: 'linear-gradient(135deg, #10b981 0%, #34d399 100%)',
                    border: 'none', borderRadius: 'var(--radius-md)',
                    color: 'white', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: '0.6rem',
                    fontSize: '0.8rem', fontWeight: '600',
                    boxShadow: 'var(--shadow-md)',
                    textAlign: 'left',
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  <div>
                    <div>Export Full Data</div>
                    <div style={{ fontSize: '0.68rem', fontWeight: '400', opacity: 0.85 }}>All records for each batch</div>
                  </div>
                </button>

                <button
                  onClick={() => { exportEffectiveBatchToExcel(sortedData, true); setShowExportModal(false); }}
                  style={{
                    padding: '0.75rem 1rem',
                    background: 'linear-gradient(135deg, #ef4444 0%, #f87171 100%)',
                    border: 'none', borderRadius: 'var(--radius-md)',
                    color: 'white', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: '0.6rem',
                    fontSize: '0.8rem', fontWeight: '600',
                    boxShadow: 'var(--shadow-md)',
                    textAlign: 'left',
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  <div>
                    <div>Export Errors Only</div>
                    <div style={{ fontSize: '0.68rem', fontWeight: '400', opacity: 0.85 }}>Only records with validation issues</div>
                  </div>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Missing Products Panel */}
        {showMissingPanel && (
          <div style={{
            marginBottom: '1.5rem',
            background: 'var(--card)',
            borderRadius: 'var(--radius-lg)',
            border: '2px solid rgba(245, 158, 11, 0.4)',
            boxShadow: 'var(--shadow-md)',
            overflow: 'hidden',
          }}>
            {/* Panel Header */}
            <div style={{
              padding: '1.25rem 1.5rem',
              background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.1) 0%, rgba(251, 191, 36, 0.05) 100%)',
              borderBottom: '1px solid rgba(245, 158, 11, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '1rem',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <div>
                  <h3 style={{ fontSize: '0.9rem', fontWeight: '700', color: '#f59e0b', margin: 0 }}>
                    Missing Product Master Entries
                  </h3>
                  <p style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', margin: 0 }}>
                    {missingProducts.length === 0
                      ? 'All batch products have Product Master entries'
                      : `${missingProducts.length} product(s) found in batch data but missing from Product Master`}
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                {missingProducts.length > 0 && (
                  <>
                    <button
                      onClick={selectAllMissing}
                      style={{
                        padding: '0.5rem 1rem',
                        background: 'transparent',
                        border: '1px solid rgba(245, 158, 11, 0.4)',
                        borderRadius: 'var(--radius-sm)',
                        color: '#f59e0b',
                        cursor: 'pointer',
                        fontSize: '0.75rem',
                        fontWeight: '600',
                      }}
                    >
                      Select All
                    </button>
                    <button
                      onClick={deselectAllMissing}
                      style={{
                        padding: '0.5rem 1rem',
                        background: 'transparent',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-sm)',
                        color: 'var(--muted-foreground)',
                        cursor: 'pointer',
                        fontSize: '0.75rem',
                        fontWeight: '600',
                      }}
                    >
                      Deselect All
                    </button>
                    <button
                      onClick={addSelectedToMaster}
                      disabled={selectedMissing.size === 0 || addingProducts}
                      style={{
                        padding: '0.5rem 1.25rem',
                        background: selectedMissing.size === 0 || addingProducts
                          ? 'var(--muted)'
                          : 'linear-gradient(135deg, #10b981 0%, #34d399 100%)',
                        border: 'none',
                        borderRadius: 'var(--radius-sm)',
                        color: selectedMissing.size === 0 || addingProducts ? 'var(--muted-foreground)' : 'white',
                        cursor: selectedMissing.size === 0 || addingProducts ? 'not-allowed' : 'pointer',
                        fontSize: '0.75rem',
                        fontWeight: '700',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                      }}
                    >
                      {addingProducts ? (
                        <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 12a9 9 0 11-6.219-8.56" strokeLinecap="round" />
                        </svg>
                      ) : (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                      )}
                      {addingProducts ? 'Adding...' : `Add ${selectedMissing.size > 0 ? `(${selectedMissing.size})` : ''} to Product Master`}
                    </button>
                  </>
                )}
                <button
                  onClick={() => setShowMissingPanel(false)}
                  style={{
                    padding: '0.5rem',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--muted-foreground)',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                  title="Close"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Add message */}
            {addMessage && (
              <div style={{
                padding: '0.75rem 1.5rem',
                background: addMessage.type === 'success' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                borderBottom: `1px solid ${addMessage.type === 'success' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
                color: addMessage.type === 'success' ? '#10b981' : '#ef4444',
                fontSize: '0.8rem',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}>
                {addMessage.type === 'success' ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                )}
                {addMessage.text}
              </div>
            )}

            {/* Missing Products Table */}
            {missingProducts.length === 0 ? (
              <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--muted-foreground)' }}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="1.5" style={{ display: 'inline-block', marginBottom: '0.75rem', opacity: 0.6 }}>
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <div style={{ fontSize: '0.9rem', fontWeight: '600', color: '#10b981' }}>All Good!</div>
                <div style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>Every product in batch data has a matching Product Master entry.</div>
              </div>
            ) : (
              <div style={{ overflowX: 'auto', maxHeight: '400px', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead style={{ background: 'var(--muted)', position: 'sticky', top: 0, zIndex: 1 }}>
                    <tr>
                      <th style={{ padding: '0.25rem 0.5rem', textAlign: 'center', fontSize: '0.7rem', fontWeight: '600', color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em', width: '50px', borderRight: '1px solid var(--border)' }}>
                        Select
                      </th>
                      <th style={{ padding: '0.25rem 0.5rem', textAlign: 'left', fontSize: '0.7rem', fontWeight: '600', color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em', borderRight: '1px solid var(--border)' }}>
                        Product Code
                      </th>
                      <th style={{ padding: '0.25rem 0.5rem', textAlign: 'left', fontSize: '0.7rem', fontWeight: '600', color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em', borderRight: '1px solid var(--border)' }}>
                        Product Name (from Batch)
                      </th>
                      <th style={{ padding: '0.25rem 0.5rem', textAlign: 'left', fontSize: '0.7rem', fontWeight: '600', color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em', borderRight: '1px solid var(--border)' }}>
                        Department
                      </th>
                      <th style={{ padding: '0.25rem 0.5rem', textAlign: 'left', fontSize: '0.7rem', fontWeight: '600', color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em', borderRight: '1px solid var(--border)' }}>
                        Type
                      </th>
                      <th style={{ padding: '0.25rem 0.5rem', textAlign: 'center', fontSize: '0.7rem', fontWeight: '600', color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em', borderRight: '1px solid var(--border)' }}>
                        Batch Count
                      </th>
                      <th style={{ padding: '0.25rem 0.5rem', textAlign: 'left', fontSize: '0.7rem', fontWeight: '600', color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {missingProducts.map((product) => {
                      const isSelected = selectedMissing.has(product.itemCode);
                      return (
                        <tr
                          key={product.itemCode}
                          onClick={() => toggleSelectMissing(product.itemCode)}
                          style={{
                            borderBottom: '1px solid var(--border)',
                            background: isSelected ? 'rgba(245, 158, 11, 0.08)' : 'transparent',
                            cursor: 'pointer',
                            transition: 'background var(--transition-fast)',
                            borderLeft: '3px solid #f59e0b',
                          }}
                          onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = 'rgba(245, 158, 11, 0.04)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = isSelected ? 'rgba(245, 158, 11, 0.08)' : 'transparent'; }}
                        >
                          <td style={{ padding: '0.25rem 0.5rem', textAlign: 'center', borderRight: '1px solid var(--border)' }}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelectMissing(product.itemCode)}
                              onClick={(e) => e.stopPropagation()}
                              style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#f59e0b' }}
                            />
                          </td>
                          <td style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', fontFamily: 'monospace', fontWeight: '600', color: '#f59e0b', borderRight: '1px solid var(--border)' }}>
                            {product.itemCode}
                          </td>
                          <td style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', color: 'var(--foreground)', fontWeight: '500', borderRight: '1px solid var(--border)' }}>
                            {product.itemName}
                          </td>
                          <td style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', color: 'var(--muted-foreground)', borderRight: '1px solid var(--border)' }}>
                            {product.department}
                          </td>
                          <td style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', borderRight: '1px solid var(--border)' }}>
                            <span style={{
                              padding: '0.2rem 0.5rem',
                              background: product.productType === 'Export' ? 'rgba(20, 184, 166, 0.1)' : 'rgba(139, 92, 246, 0.1)',
                              color: product.productType === 'Export' ? '#14b8a6' : '#8b5cf6',
                              borderRadius: 'var(--radius-sm)',
                              fontSize: '0.7rem',
                              fontWeight: '600',
                            }}>
                              {product.productType}
                            </span>
                          </td>
                          <td style={{ padding: '0.25rem 0.5rem', textAlign: 'center', fontSize: '0.8rem', fontWeight: '700', color: 'var(--foreground)', borderRight: '1px solid var(--border)' }}>
                            {product.batchCount}
                          </td>
                          <td style={{ padding: '0.25rem 0.5rem', borderRight: '1px solid var(--border)' }}>
                            <span style={{
                              padding: '0.25rem 0.625rem',
                              background: 'rgba(239, 68, 68, 0.1)',
                              color: '#ef4444',
                              borderRadius: 'var(--radius-sm)',
                              fontSize: '0.7rem',
                              fontWeight: '700',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                            }}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                              </svg>
                              PM MISSING
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

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
            padding: '0.4rem 0.75rem',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <h2 style={{
              fontSize: '0.8rem',
              fontWeight: '600',
              color: 'var(--foreground)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              margin: 0,
            }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
              fontSize: '0.7rem',
              fontWeight: '600',
            }}>
              Showing {sortedData.length} of {total}
            </span>
          </div>

          {/* Table */}
          <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 160px)' }}>
            <table style={{
              width: '100%',
              borderCollapse: 'collapse',
              border: '1px solid var(--border)',
            }}>
              <thead style={{
                background: 'var(--muted)',
                borderBottom: '2px solid var(--border)',
                position: 'sticky',
                top: 0,
                zIndex: 2,
              }}>
                <tr>
                  <th
                    onClick={() => handleSort('srNo')}
                    style={{
                      padding: '0.35rem 0.5rem',
                      textAlign: 'left',
                      fontSize: '0.65rem',
                      fontWeight: '600',
                      color: 'var(--muted-foreground)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      width: '80px',
                      borderRight: '1px solid var(--border)',
                      cursor: 'pointer',
                      userSelect: 'none',
                      transition: 'background-color var(--transition-fast)',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.05)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      SR No
                      <span style={{ opacity: sortField === 'srNo' ? 1 : 0.4 }}>
                        {sortField === 'srNo' ? (sortDirection === 'asc' ? '↑' : '↓') : '↕'}
                      </span>
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('productCode')}
                    style={{
                      padding: '0.35rem 0.5rem',
                      textAlign: 'left',
                      fontSize: '0.65rem',
                      fontWeight: '600',
                      color: 'var(--muted-foreground)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      cursor: 'pointer',
                      userSelect: 'none',
                      transition: 'background-color var(--transition-fast)',
                      borderRight: '1px solid var(--border)',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.05)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      Product Code
                      <span style={{ opacity: sortField === 'productCode' ? 1 : 0.4 }}>
                        {sortField === 'productCode' ? (sortDirection === 'asc' ? '↑' : '↓') : '↕'}
                      </span>
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('genericName')}
                    style={{
                      padding: '0.35rem 0.5rem',
                      textAlign: 'left',
                      fontSize: '0.65rem',
                      fontWeight: '600',
                      color: 'var(--muted-foreground)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      cursor: 'pointer',
                      userSelect: 'none',
                      transition: 'background-color var(--transition-fast)',
                      borderRight: '1px solid var(--border)',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.05)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      Generic Name
                      <span style={{ opacity: sortField === 'genericName' ? 1 : 0.4 }}>
                        {sortField === 'genericName' ? (sortDirection === 'asc' ? '↑' : '↓') : '↕'}
                      </span>
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('masterCardNo')}
                    style={{
                      padding: '0.35rem 0.5rem',
                      textAlign: 'left',
                      fontSize: '0.65rem',
                      fontWeight: '600',
                      color: 'var(--muted-foreground)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      cursor: 'pointer',
                      userSelect: 'none',
                      transition: 'background-color var(--transition-fast)',
                      borderRight: '1px solid var(--border)',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.05)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      Master Card No
                      <span style={{ opacity: sortField === 'masterCardNo' ? 1 : 0.4 }}>
                        {sortField === 'masterCardNo' ? (sortDirection === 'asc' ? '↑' : '↓') : '↕'}
                      </span>
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('therapeuticCategory')}
                    style={{
                      padding: '0.35rem 0.5rem',
                      textAlign: 'left',
                      fontSize: '0.65rem',
                      fontWeight: '600',
                      color: 'var(--muted-foreground)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      cursor: 'pointer',
                      userSelect: 'none',
                      transition: 'background-color var(--transition-fast)',
                      borderRight: '1px solid var(--border)',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.05)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      Therapeutic Category
                      <span style={{ opacity: sortField === 'therapeuticCategory' ? 1 : 0.4 }}>
                        {sortField === 'therapeuticCategory' ? (sortDirection === 'asc' ? '↑' : '↓') : '↕'}
                      </span>
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('productName')}
                    style={{
                      padding: '0.35rem 0.5rem',
                      textAlign: 'left',
                      fontSize: '0.65rem',
                      fontWeight: '600',
                      color: 'var(--muted-foreground)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      cursor: 'pointer',
                      userSelect: 'none',
                      transition: 'background-color var(--transition-fast)',
                      borderRight: '1px solid var(--border)',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.05)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      Product Name
                      <span style={{ opacity: sortField === 'productName' ? 1 : 0.4 }}>
                        {sortField === 'productName' ? (sortDirection === 'asc' ? '↑' : '↓') : '↕'}
                      </span>
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('department')}
                    style={{
                      padding: '0.35rem 0.5rem',
                      textAlign: 'left',
                      fontSize: '0.65rem',
                      fontWeight: '600',
                      color: 'var(--muted-foreground)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      cursor: 'pointer',
                      userSelect: 'none',
                      transition: 'background-color var(--transition-fast)',
                      borderRight: '1px solid var(--border)',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.05)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      Department
                      <span style={{ opacity: sortField === 'department' ? 1 : 0.4 }}>
                        {sortField === 'department' ? (sortDirection === 'asc' ? '↑' : '↓') : '↕'}
                      </span>
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('storageCondition')}
                    style={{
                      padding: '0.35rem 0.5rem',
                      textAlign: 'left',
                      fontSize: '0.65rem',
                      fontWeight: '600',
                      color: 'var(--muted-foreground)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      cursor: 'pointer',
                      userSelect: 'none',
                      transition: 'background-color var(--transition-fast)',
                      borderRight: '1px solid var(--border)',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.05)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      Storage Condition
                      <span style={{ opacity: sortField === 'storageCondition' ? 1 : 0.4 }}>
                        {sortField === 'storageCondition' ? (sortDirection === 'asc' ? '↑' : '↓') : '↕'}
                      </span>
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('productType')}
                    style={{
                      padding: '0.35rem 0.5rem',
                      textAlign: 'left',
                      fontSize: '0.65rem',
                      fontWeight: '600',
                      color: 'var(--muted-foreground)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      cursor: 'pointer',
                      userSelect: 'none',
                      transition: 'background-color var(--transition-fast)',
                      borderRight: '1px solid var(--border)',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.05)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      Product Type
                      <span style={{ opacity: sortField === 'productType' ? 1 : 0.4 }}>
                        {sortField === 'productType' ? (sortDirection === 'asc' ? '↑' : '↓') : '↕'}
                      </span>
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('specification')}
                    style={{
                      padding: '0.35rem 0.5rem',
                      textAlign: 'left',
                      fontSize: '0.65rem',
                      fontWeight: '600',
                      color: 'var(--muted-foreground)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      whiteSpace: 'nowrap',
                      borderRight: '1px solid var(--border)',
                      cursor: 'pointer',
                      userSelect: 'none',
                      transition: 'background-color var(--transition-fast)',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.05)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      Spec
                      <span style={{ opacity: sortField === 'specification' ? 1 : 0.4 }}>
                        {sortField === 'specification' ? (sortDirection === 'asc' ? '↑' : '↓') : '↕'}
                      </span>
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('effectiveBatchNo')}
                    style={{
                      padding: '0.35rem 0.5rem',
                      textAlign: 'left',
                      fontSize: '0.65rem',
                      fontWeight: '600',
                      color: 'var(--muted-foreground)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      whiteSpace: 'nowrap',
                      borderRight: '1px solid var(--border)',
                      cursor: 'pointer',
                      userSelect: 'none',
                      transition: 'background-color var(--transition-fast)',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.05)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      Eff. Batch No
                      <span style={{ opacity: sortField === 'effectiveBatchNo' ? 1 : 0.4 }}>
                        {sortField === 'effectiveBatchNo' ? (sortDirection === 'asc' ? '↑' : '↓') : '↕'}
                      </span>
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('status')}
                    style={{
                      padding: '0.35rem 0.5rem',
                      textAlign: 'left',
                      fontSize: '0.65rem',
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
                      Status
                      <span style={{ opacity: sortField === 'status' ? 1 : 0.4 }}>
                        {sortField === 'status' ? (sortDirection === 'asc' ? '↑' : '↓') : '↕'}
                      </span>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={12} style={{
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
                    <td colSpan={12} style={{
                      padding: '3rem',
                      textAlign: 'center',
                      color: 'var(--muted-foreground)',
                    }}>
                      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ display: 'inline-block', marginBottom: '1rem', opacity: 0.3 }}>
                        <circle cx="11" cy="11" r="8" />
                        <path d="m21 21-4.35-4.35" />
                      </svg>
                      <div style={{ fontSize: '0.95rem', fontWeight: '500' }}>No products found</div>
                      <div style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>
                        {searchTerm ? 'Try a different search term' : 'Upload a Product Master XML file from the home page'}
                      </div>
                    </td>
                  </tr>
                ) : viewMode === 'mfc' ? (() => {
                  // Build grouped structure: { mfc -> products[] }
                  const groups: { mfc: string; products: ProductMaster[] }[] = [];
                  const seen = new Map<string, number>();
                  sortedData.forEach(item => {
                    const mfc = item.masterCardNo || 'N/A';
                    if (!seen.has(mfc)) { seen.set(mfc, groups.length); groups.push({ mfc, products: [] }); }
                    groups[seen.get(mfc)!].products.push(item);
                  });
                  const allMfcKeys = groups.map(g => g.mfc);

                  return (
                    <>
                      {/* Expand/Collapse All row */}
                      <tr>
                        <td colSpan={12} style={{ padding: '0.25rem 0.5rem', background: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>
                          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.7rem', color: 'var(--muted-foreground)', fontWeight: '600' }}>
                              {groups.length} MFC group{groups.length !== 1 ? 's' : ''}
                            </span>
                            <button onClick={() => expandAllMfcGroups(allMfcKeys)} style={{ fontSize: '0.7rem', color: '#8b5cf6', background: 'none', border: 'none', cursor: 'pointer', fontWeight: '600', padding: '0.125rem 0.5rem', borderRadius: 'var(--radius-sm)' }}>
                              Expand All
                            </button>
                            <span style={{ color: 'var(--border)' }}>|</span>
                            <button onClick={() => collapseAllMfcGroups()} style={{ fontSize: '0.7rem', color: 'var(--muted-foreground)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: '600', padding: '0.125rem 0.5rem', borderRadius: 'var(--radius-sm)' }}>
                              Collapse All
                            </button>
                          </div>
                        </td>
                      </tr>

                      {groups.map((group) => {
                        const isOpen = expandedMfcGroups.has(group.mfc);
                        const groupHasError = group.products.some(p => getMissingFields(p).length > 0);
                        const groupNotMfg = group.products.every(p => isNotManufactured(p));

                        return (
                          <React.Fragment key={group.mfc}>
                            {/* MFC folder row */}
                            <tr
                              onClick={() => toggleMfcGroup(group.mfc)}
                              style={{
                                borderBottom: '1px solid var(--border)',
                                background: groupNotMfg
                                  ? 'rgba(245, 158, 11, 0.08)'
                                  : groupHasError
                                    ? 'rgba(239, 68, 68, 0.06)'
                                    : 'rgba(139, 92, 246, 0.06)',
                                borderLeft: groupNotMfg ? '4px solid #f59e0b' : groupHasError ? '4px solid #ef4444' : '4px solid #8b5cf6',
                                cursor: 'pointer',
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.opacity = '0.85'}
                              onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
                            >
                              <td style={{ padding: '0.3rem 0.5rem', width: '80px' }}>
                                <svg
                                  width="16" height="16" viewBox="0 0 24 24" fill="none"
                                  stroke={groupNotMfg ? '#f59e0b' : '#8b5cf6'} strokeWidth="2.5"
                                  style={{ transition: 'transform 0.15s', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', display: 'block' }}
                                >
                                  <polyline points="9 18 15 12 9 6" />
                                </svg>
                              </td>
                              <td colSpan={10} style={{ padding: '0.3rem 0.5rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                                  <svg width="18" height="18" viewBox="0 0 24 24" fill={isOpen ? '#8b5cf6' : 'none'} stroke={groupNotMfg ? '#f59e0b' : '#8b5cf6'} strokeWidth="2">
                                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                                  </svg>
                                  <span style={{ fontFamily: 'monospace', fontWeight: '700', fontSize: '0.85rem', color: groupNotMfg ? '#f59e0b' : 'var(--foreground)' }}>
                                    {group.mfc}
                                  </span>
                                  <span style={{
                                    padding: '0.15rem 0.5rem',
                                    background: 'rgba(139, 92, 246, 0.12)',
                                    color: '#8b5cf6',
                                    borderRadius: '9999px',
                                    fontSize: '0.65rem',
                                    fontWeight: '700',
                                  }}>
                                    {group.products.length} product{group.products.length !== 1 ? 's' : ''}
                                  </span>
                                  {groupNotMfg && (
                                    <span style={{ padding: '0.15rem 0.5rem', background: 'rgba(245,158,11,0.15)', color: '#f59e0b', borderRadius: '9999px', fontSize: '0.65rem', fontWeight: '700' }}>
                                      MFG MISSING
                                    </span>
                                  )}
                                  {groupHasError && !groupNotMfg && (
                                    <span style={{ padding: '0.15rem 0.5rem', background: 'rgba(239,68,68,0.1)', color: '#ef4444', borderRadius: '9999px', fontSize: '0.65rem', fontWeight: '700' }}>
                                      HAS ERRORS
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td style={{ padding: '0.3rem 0.5rem', textAlign: 'right', color: 'var(--muted-foreground)', fontSize: '0.65rem' }}>
                                {isOpen ? 'Collapse' : 'Expand'}
                              </td>
                            </tr>

                            {/* Product rows inside folder */}
                            {isOpen && group.products.map((item, idx) => {
                              const errors = getMissingFields(item);
                              const hasError = errors.length > 0;
                              const notMfg = isNotManufactured(item);
                              return (
                                <tr key={item._id} style={{
                                  borderBottom: '1px solid var(--border)',
                                  background: (notMfg && hasError) ? 'rgba(239,68,68,0.04)' : notMfg ? 'rgba(245,158,11,0.04)' : hasError ? 'rgba(239,68,68,0.04)' : idx % 2 === 0 ? 'rgba(0,0,0,0.01)' : 'transparent',
                                  borderLeft: (notMfg && hasError) ? '4px solid rgba(239,68,68,0.5)' : notMfg ? '4px solid rgba(245,158,11,0.4)' : hasError ? '4px solid rgba(239,68,68,0.3)' : '4px solid rgba(139,92,246,0.2)',
                                }}
                                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--muted)'}
                                  onMouseLeave={(e) => e.currentTarget.style.background = notMfg ? 'rgba(245,158,11,0.04)' : hasError ? 'rgba(239,68,68,0.04)' : idx % 2 === 0 ? 'rgba(0,0,0,0.01)' : 'transparent'}
                                >
                                  {/* Indent + tree connector */}
                                  <td style={{ padding: '0.25rem 0.5rem', color: 'var(--muted-foreground)', fontSize: '0.7rem', fontFamily: 'monospace', borderRight: '1px solid var(--border)' }}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', paddingLeft: '0.5rem' }}>
                                      <span style={{ color: '#8b5cf6', opacity: 0.5 }}>{idx === group.products.length - 1 ? '└' : '├'}</span>
                                    </span>
                                  </td>
                                  <td style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', color: notMfg ? '#f59e0b' : isMissingData(item.productCode) ? '#ef4444' : 'var(--foreground)', fontFamily: 'monospace', fontWeight: '600', borderRight: '1px solid var(--border)' }}>
                                    {item.productCode || 'N/A'}
                                  </td>
                                  <td style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', color: 'var(--foreground)', borderRight: '1px solid var(--border)' }}>{item.genericName || '-'}</td>
                                  <td style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', color: isMissingData(item.masterCardNo) ? '#ef4444' : 'var(--muted-foreground)', fontFamily: 'monospace', borderRight: '1px solid var(--border)' }}>{item.masterCardNo || 'N/A'}</td>
                                  <td style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', borderRight: '1px solid var(--border)' }}>
                                    <span style={{ padding: '0.2rem 0.5rem', background: isMissingData(item.therapeuticCategory) ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)', color: isMissingData(item.therapeuticCategory) ? '#ef4444' : '#f59e0b', borderRadius: 'var(--radius-sm)', fontSize: '0.7rem', fontWeight: '600' }}>
                                      {item.therapeuticCategory || 'N/A'}
                                    </span>
                                  </td>
                                  <td style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', fontWeight: '500', color: isMissingData(item.productName) ? '#ef4444' : 'var(--foreground)', borderRight: '1px solid var(--border)' }}>{item.productName || 'N/A'}</td>
                                  <td style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', color: isMissingData(item.department) ? '#ef4444' : 'var(--foreground)', borderRight: '1px solid var(--border)' }}>{item.department || 'N/A'}</td>
                                  <td style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', color: isMissingData(item.storageCondition) ? '#ef4444' : 'var(--muted-foreground)', maxWidth: '200px', borderRight: '1px solid var(--border)' }}>
                                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.storageCondition || 'N/A'}>{item.storageCondition || 'N/A'}</div>
                                  </td>
                                  <td style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', borderRight: '1px solid var(--border)' }}>
                                    <span style={{ padding: '0.2rem 0.5rem', background: isMissingData(item.productType) ? 'rgba(239,68,68,0.1)' : item.productType === 'EXPORT' ? 'rgba(20,184,166,0.1)' : 'rgba(139,92,246,0.1)', color: isMissingData(item.productType) ? '#ef4444' : item.productType === 'EXPORT' ? '#14b8a6' : '#8b5cf6', borderRadius: 'var(--radius-sm)', fontSize: '0.7rem', fontWeight: '600' }}>
                                      {item.productType || 'N/A'}
                                    </span>
                                  </td>
                                  {/* Specification */}
                                  <td style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', borderRight: '1px solid var(--border)' }}>
                                    {item.specification ? (
                                      <span style={{ padding: '0.2rem 0.5rem', background: 'rgba(99,102,241,0.1)', color: '#6366f1', borderRadius: 'var(--radius-sm)', fontSize: '0.7rem', fontWeight: '700', fontFamily: 'monospace' }}>
                                        {item.specification}
                                      </span>
                                    ) : <span style={{ color: 'var(--muted-foreground)' }}>—</span>}
                                  </td>
                                  {/* Effective Batch No */}
                                  <td style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', fontFamily: 'monospace', color: item.effectiveBatchNo ? 'var(--foreground)' : 'var(--muted-foreground)', borderRight: '1px solid var(--border)' }}>
                                    {item.effectiveBatchNo || '—'}
                                  </td>
                                  <td style={{ padding: '0.25rem 0.5rem', fontSize: '0.7rem', verticalAlign: 'top' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                      {notMfg && (
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.2rem 0.5rem', background: 'rgba(245,158,11,0.15)', color: '#f59e0b', borderRadius: 'var(--radius-sm)', fontSize: '0.65rem', fontWeight: '700' }}>
                                          MFG MISSING
                                        </span>
                                      )}
                                      {hasError && (
                                        <div style={{ color: '#ef4444', fontWeight: '700', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                          <span>MISSING:</span>
                                          <ul style={{ paddingLeft: '1rem', margin: 0, listStyleType: 'disc' }}>
                                            {errors.map((e, i) => <li key={i}>{e}</li>)}
                                          </ul>
                                        </div>
                                      )}
                                      {!notMfg && !hasError && (
                                        <span style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
                                          OK
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </React.Fragment>
                        );
                      })}
                    </>
                  );
                })() : viewMode === 'effective-batch' ? (() => {
                  // Build groups keyed by effectiveBatchNo
                  // null/empty → '__null__' group (no batch assigned)
                  // "0" / 0   → '0' group (explicitly zero)
                  // Both go to the bottom; all other values sort ascending
                  const groupMap = new Map<string, ProductMaster[]>();
                  sortedData.forEach(item => {
                    const raw = item.effectiveBatchNo;
                    const normalized = (raw !== null && raw !== undefined)
                      ? String(raw).trim()
                      : '';
                    const key = normalized === '' ? '__null__' : normalized;
                    if (!groupMap.has(key)) groupMap.set(key, []);
                    groupMap.get(key)!.push(item);
                  });

                  const isBottomKey = (k: string) => k === '0' || k === '__null__';

                  // Sort: real batches first (numeric), then "0", then null
                  const sortedKeys = Array.from(groupMap.keys()).sort((a, b) => {
                    const aBottom = isBottomKey(a);
                    const bBottom = isBottomKey(b);
                    if (aBottom && bBottom) {
                      // null comes after 0
                      if (a === '__null__' && b !== '__null__') return 1;
                      if (b === '__null__' && a !== '__null__') return -1;
                      return 0;
                    }
                    if (aBottom) return 1;
                    if (bBottom) return -1;
                    const aNum = parseFloat(a);
                    const bNum = parseFloat(b);
                    if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
                    return a.localeCompare(b);
                  });

                  const groups = sortedKeys.map(key => ({ key, products: groupMap.get(key)! }));

                  return (
                    <>
                      {/* Expand/Collapse All row */}
                      <tr>
                        <td colSpan={12} style={{ padding: '0.25rem 0.5rem', background: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>
                          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.7rem', color: 'var(--muted-foreground)', fontWeight: '600' }}>
                              {groups.length} Effective Batch group{groups.length !== 1 ? 's' : ''}
                            </span>
                            <button onClick={() => expandAllEffBatchGroups(sortedKeys)} style={{ fontSize: '0.7rem', color: '#6366f1', background: 'none', border: 'none', cursor: 'pointer', fontWeight: '600', padding: '0.125rem 0.5rem', borderRadius: 'var(--radius-sm)' }}>
                              Expand All
                            </button>
                            <span style={{ color: 'var(--border)' }}>|</span>
                            <button onClick={() => collapseAllEffBatchGroups()} style={{ fontSize: '0.7rem', color: 'var(--muted-foreground)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: '600', padding: '0.125rem 0.5rem', borderRadius: 'var(--radius-sm)' }}>
                              Collapse All
                            </button>
                          </div>
                        </td>
                      </tr>

                      {groups.map((group) => {
                        const isOpen = expandedEffBatchGroups.has(group.key);
                        const isZeroBatch = group.key === '0';
                        const isNullBatch = group.key === '__null__';
                        const isBottomGroup = isZeroBatch || isNullBatch;
                        const groupIssueCount = group.products.filter(p => getMissingFields(p).length > 0 || isNotManufactured(p)).length;
                        const hasIssues = groupIssueCount > 0;

                        const headerBg = isBottomGroup
                          ? 'rgba(100, 116, 139, 0.08)'
                          : hasIssues
                            ? 'rgba(239, 68, 68, 0.06)'
                            : 'rgba(99, 102, 241, 0.06)';
                        const headerAccent = isBottomGroup ? '#64748b' : hasIssues ? '#ef4444' : '#6366f1';

                        const groupLabel = isNullBatch
                          ? 'No Effective Batch (—)'
                          : isZeroBatch
                            ? 'Effective Batch: 0'
                            : `Eff. Batch: ${group.key}`;

                        return (
                          <React.Fragment key={group.key}>
                            {/* Group header row */}
                            <tr
                              onClick={() => toggleEffBatchGroup(group.key)}
                              style={{
                                borderBottom: '1px solid var(--border)',
                                borderLeft: `4px solid ${headerAccent}`,
                                cursor: 'pointer',
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.opacity = '0.85'}
                              onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
                            >
                              <td style={{ padding: '0.3rem 0.5rem', width: '80px', background: headerBg, boxShadow: '0 1px 0 var(--border)' }}>
                                <svg
                                  width="16" height="16" viewBox="0 0 24 24" fill="none"
                                  stroke={headerAccent} strokeWidth="2.5"
                                  style={{ transition: 'transform 0.15s', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', display: 'block' }}
                                >
                                  <polyline points="9 18 15 12 9 6" />
                                </svg>
                              </td>
                              <td colSpan={10} style={{ padding: '0.3rem 0.5rem', background: headerBg, boxShadow: '0 1px 0 var(--border)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={headerAccent} strokeWidth="2">
                                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                                    <line x1="16" y1="2" x2="16" y2="6" />
                                    <line x1="8" y1="2" x2="8" y2="6" />
                                    <line x1="3" y1="10" x2="21" y2="10" />
                                  </svg>
                                  <span style={{ fontFamily: 'monospace', fontWeight: '700', fontSize: '0.85rem', color: isBottomGroup ? '#64748b' : 'var(--foreground)' }}>
                                    {groupLabel}
                                  </span>
                                  <span style={{
                                    padding: '0.15rem 0.5rem',
                                    background: 'rgba(99,102,241,0.12)',
                                    color: '#6366f1',
                                    borderRadius: '9999px',
                                    fontSize: '0.65rem',
                                    fontWeight: '700',
                                  }}>
                                    {group.products.length} product{group.products.length !== 1 ? 's' : ''}
                                  </span>
                                  {hasIssues ? (
                                    <span style={{
                                      padding: '0.15rem 0.6rem',
                                      background: 'rgba(239,68,68,0.12)',
                                      color: '#ef4444',
                                      borderRadius: '9999px',
                                      fontSize: '0.65rem',
                                      fontWeight: '700',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '0.25rem',
                                    }}>
                                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                        <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                                      </svg>
                                      {groupIssueCount} issue{groupIssueCount !== 1 ? 's' : ''}
                                    </span>
                                  ) : !isBottomGroup ? (
                                    <span style={{
                                      padding: '0.15rem 0.6rem',
                                      background: 'rgba(16,185,129,0.12)',
                                      color: '#10b981',
                                      borderRadius: '9999px',
                                      fontSize: '0.65rem',
                                      fontWeight: '700',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '0.25rem',
                                    }}>
                                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                        <polyline points="20 6 9 17 4 12" />
                                      </svg>
                                      No issue found
                                    </span>
                                  ) : null}
                                  {isZeroBatch && (
                                    <span style={{ padding: '0.15rem 0.5rem', background: 'rgba(100,116,139,0.15)', color: '#64748b', borderRadius: '9999px', fontSize: '0.65rem', fontWeight: '700' }}>
                                      ZERO BATCH
                                    </span>
                                  )}
                                  {isNullBatch && (
                                    <span style={{ padding: '0.15rem 0.5rem', background: 'rgba(100,116,139,0.15)', color: '#64748b', borderRadius: '9999px', fontSize: '0.65rem', fontWeight: '700' }}>
                                      NO BATCH
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td style={{ padding: '0.3rem 0.5rem', textAlign: 'right', color: 'var(--muted-foreground)', fontSize: '0.7rem', background: headerBg, boxShadow: '0 1px 0 var(--border)' }}>
                                {isOpen ? 'Collapse' : 'Expand'}
                              </td>
                            </tr>

                            {/* Product rows inside group */}
                            {isOpen && group.products.map((item, idx) => {
                              const errors = getMissingFields(item);
                              const hasError = errors.length > 0;
                              const notMfg = isNotManufactured(item);
                              return (
                                <tr key={item._id} style={{
                                  borderBottom: '1px solid var(--border)',
                                  background: (notMfg && hasError) ? 'rgba(239,68,68,0.04)' : notMfg ? 'rgba(245,158,11,0.04)' : hasError ? 'rgba(239,68,68,0.04)' : idx % 2 === 0 ? 'rgba(0,0,0,0.01)' : 'transparent',
                                  borderLeft: (notMfg && hasError) ? '4px solid rgba(239,68,68,0.5)' : notMfg ? '4px solid rgba(245,158,11,0.4)' : hasError ? '4px solid rgba(239,68,68,0.3)' : '4px solid rgba(99,102,241,0.2)',
                                }}
                                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--muted)'}
                                  onMouseLeave={(e) => e.currentTarget.style.background = notMfg ? 'rgba(245,158,11,0.04)' : hasError ? 'rgba(239,68,68,0.04)' : idx % 2 === 0 ? 'rgba(0,0,0,0.01)' : 'transparent'}
                                >
                                  <td style={{ padding: '0.25rem 0.5rem', color: 'var(--muted-foreground)', fontSize: '0.7rem', fontFamily: 'monospace', borderRight: '1px solid var(--border)' }}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', paddingLeft: '0.5rem' }}>
                                      <span style={{ color: '#6366f1', opacity: 0.5 }}>{idx === group.products.length - 1 ? '└' : '├'}</span>
                                    </span>
                                  </td>
                                  <td style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', color: notMfg ? '#f59e0b' : isMissingData(item.productCode) ? '#ef4444' : 'var(--foreground)', fontFamily: 'monospace', fontWeight: '600', borderRight: '1px solid var(--border)' }}>
                                    {item.productCode || 'N/A'}
                                  </td>
                                  <td style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', color: 'var(--foreground)', borderRight: '1px solid var(--border)' }}>{item.genericName || '-'}</td>
                                  <td style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', color: isMissingData(item.masterCardNo) ? '#ef4444' : 'var(--muted-foreground)', fontFamily: 'monospace', borderRight: '1px solid var(--border)' }}>{item.masterCardNo || 'N/A'}</td>
                                  <td style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', borderRight: '1px solid var(--border)' }}>
                                    <span style={{ padding: '0.2rem 0.5rem', background: isMissingData(item.therapeuticCategory) ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)', color: isMissingData(item.therapeuticCategory) ? '#ef4444' : '#f59e0b', borderRadius: 'var(--radius-sm)', fontSize: '0.7rem', fontWeight: '600' }}>
                                      {item.therapeuticCategory || 'N/A'}
                                    </span>
                                  </td>
                                  <td style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', fontWeight: '500', color: isMissingData(item.productName) ? '#ef4444' : 'var(--foreground)', borderRight: '1px solid var(--border)' }}>{item.productName || 'N/A'}</td>
                                  <td style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', color: isMissingData(item.department) ? '#ef4444' : 'var(--foreground)', borderRight: '1px solid var(--border)' }}>{item.department || 'N/A'}</td>
                                  <td style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', color: isMissingData(item.storageCondition) ? '#ef4444' : 'var(--muted-foreground)', maxWidth: '200px', borderRight: '1px solid var(--border)' }}>
                                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.storageCondition || 'N/A'}>{item.storageCondition || 'N/A'}</div>
                                  </td>
                                  <td style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', borderRight: '1px solid var(--border)' }}>
                                    <span style={{ padding: '0.2rem 0.5rem', background: isMissingData(item.productType) ? 'rgba(239,68,68,0.1)' : item.productType === 'EXPORT' ? 'rgba(20,184,166,0.1)' : 'rgba(139,92,246,0.1)', color: isMissingData(item.productType) ? '#ef4444' : item.productType === 'EXPORT' ? '#14b8a6' : '#8b5cf6', borderRadius: 'var(--radius-sm)', fontSize: '0.7rem', fontWeight: '600' }}>
                                      {item.productType || 'N/A'}
                                    </span>
                                  </td>
                                  <td style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', borderRight: '1px solid var(--border)' }}>
                                    {item.specification ? (
                                      <span style={{ padding: '0.2rem 0.5rem', background: 'rgba(99,102,241,0.1)', color: '#6366f1', borderRadius: 'var(--radius-sm)', fontSize: '0.7rem', fontWeight: '700', fontFamily: 'monospace' }}>
                                        {item.specification}
                                      </span>
                                    ) : <span style={{ color: 'var(--muted-foreground)' }}>—</span>}
                                  </td>
                                  <td style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', fontFamily: 'monospace', color: item.effectiveBatchNo ? 'var(--foreground)' : 'var(--muted-foreground)', borderRight: '1px solid var(--border)' }}>
                                    {item.effectiveBatchNo || '—'}
                                  </td>
                                  <td style={{ padding: '0.25rem 0.5rem', fontSize: '0.7rem', verticalAlign: 'top' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                      {notMfg && (
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.2rem 0.5rem', background: 'rgba(245,158,11,0.15)', color: '#f59e0b', borderRadius: 'var(--radius-sm)', fontSize: '0.65rem', fontWeight: '700' }}>
                                          MFG MISSING
                                        </span>
                                      )}
                                      {hasError && (
                                        <div style={{ color: '#ef4444', fontWeight: '700', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                          <span>MISSING:</span>
                                          <ul style={{ paddingLeft: '1rem', margin: 0, listStyleType: 'disc' }}>
                                            {errors.map((e, i) => <li key={i}>{e}</li>)}
                                          </ul>
                                        </div>
                                      )}
                                      {!notMfg && !hasError && (
                                        <span style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
                                          OK
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </React.Fragment>
                        );
                      })}
                    </>
                  );
                })() : viewMode === 'batch' ? (() => {
                  // Batch-wise view: group products by real batch numbers from Batch collection
                  if (batchViewLoading || batchLinkMap === null) {
                    return (
                      <tr>
                        <td colSpan={12} style={{ padding: '3rem', textAlign: 'center', color: 'var(--muted-foreground)' }}>
                          <svg className="animate-spin" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ display: 'inline-block', marginBottom: '0.5rem' }}>
                            <path d="M21 12a9 9 0 11-6.219-8.56" strokeLinecap="round" />
                          </svg>
                          <div>Loading batch data...</div>
                        </td>
                      </tr>
                    );
                  }

                  // Build productCode → ProductMaster lookup
                  const productMap = new Map<string, ProductMaster>();
                  sortedData.forEach(item => { if (item.productCode) productMap.set(item.productCode, item); });

                  // Build groups from batchLinkMap: batchNumber → ProductMaster[]
                  // A product code may appear in multiple batches
                  const groupMap = new Map<string, ProductMaster[]>();
                  batchLinkMap.forEach((codes, batchNumber) => {
                    const products: ProductMaster[] = [];
                    codes.forEach(code => {
                      const pm = productMap.get(code);
                      if (pm) products.push(pm);
                    });
                    if (products.length > 0) groupMap.set(batchNumber, products);
                  });

                  // Products with no batch association
                  const linkedCodes = new Set<string>();
                  batchLinkMap.forEach(codes => codes.forEach(c => linkedCodes.add(c)));
                  const unlinked = sortedData.filter(item => !item.productCode || !linkedCodes.has(item.productCode));
                  if (unlinked.length > 0) groupMap.set('__no_batch__', unlinked);

                  // Sort: real batch keys alphabetically, then "no batch" at end
                  const sortedKeys = Array.from(groupMap.keys()).sort((a, b) => {
                    if (a === '__no_batch__') return 1;
                    if (b === '__no_batch__') return -1;
                    return a.localeCompare(b);
                  });

                  const groups = sortedKeys.map(key => ({ key, products: groupMap.get(key)! }));

                  return (
                    <>
                      {/* Expand/Collapse All row */}
                      <tr>
                        <td colSpan={12} style={{ padding: '0.25rem 0.5rem', background: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>
                          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.7rem', color: 'var(--muted-foreground)', fontWeight: '600' }}>
                              {groups.length} Batch group{groups.length !== 1 ? 's' : ''}
                            </span>
                            <button onClick={() => expandAllBatchGroups(sortedKeys)} style={{ fontSize: '0.7rem', color: '#14b8a6', background: 'none', border: 'none', cursor: 'pointer', fontWeight: '600', padding: '0.125rem 0.5rem', borderRadius: 'var(--radius-sm)' }}>
                              Expand All
                            </button>
                            <span style={{ color: 'var(--border)' }}>|</span>
                            <button onClick={() => collapseAllBatchGroups()} style={{ fontSize: '0.7rem', color: 'var(--muted-foreground)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: '600', padding: '0.125rem 0.5rem', borderRadius: 'var(--radius-sm)' }}>
                              Collapse All
                            </button>
                          </div>
                        </td>
                      </tr>

                      {groups.map((group) => {
                        const isOpen = expandedBatchGroups.has(group.key);
                        const isNoBatch = group.key === '__no_batch__';
                        const groupHasError = group.products.some(p => getMissingFields(p).length > 0 || isNotManufactured(p));
                        const issueCount = group.products.filter(p => getMissingFields(p).length > 0 || isNotManufactured(p)).length;
                        const accent = isNoBatch ? '#64748b' : groupHasError ? '#ef4444' : '#14b8a6';
                        const headerBg = isNoBatch
                          ? 'rgba(100,116,139,0.08)'
                          : groupHasError
                            ? 'rgba(239,68,68,0.06)'
                            : 'rgba(20,184,166,0.06)';

                        return (
                          <React.Fragment key={group.key}>
                            {/* Batch folder row */}
                            <tr
                              onClick={() => toggleBatchGroup(group.key)}
                              style={{
                                borderBottom: '1px solid var(--border)',
                                borderLeft: `4px solid ${accent}`,
                                cursor: 'pointer',
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.opacity = '0.85'}
                              onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
                            >
                              <td style={{ padding: '0.3rem 0.5rem', width: '80px', background: headerBg }}>
                                <svg
                                  width="16" height="16" viewBox="0 0 24 24" fill="none"
                                  stroke={accent} strokeWidth="2.5"
                                  style={{ transition: 'transform 0.15s', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', display: 'block' }}
                                >
                                  <polyline points="9 18 15 12 9 6" />
                                </svg>
                              </td>
                              <td colSpan={10} style={{ padding: '0.3rem 0.5rem', background: headerBg }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                                  <svg width="18" height="18" viewBox="0 0 24 24" fill={isOpen ? accent : 'none'} stroke={accent} strokeWidth="2">
                                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                                  </svg>
                                  <span style={{ fontFamily: 'monospace', fontWeight: '700', fontSize: '0.85rem', color: isNoBatch ? '#64748b' : 'var(--foreground)' }}>
                                    {isNoBatch ? 'No Batch Assigned' : `Batch No: ${group.key}`}
                                  </span>
                                  <span style={{ padding: '0.15rem 0.5rem', background: 'rgba(20,184,166,0.12)', color: '#14b8a6', borderRadius: '9999px', fontSize: '0.65rem', fontWeight: '700' }}>
                                    {group.products.length} product{group.products.length !== 1 ? 's' : ''}
                                  </span>
                                  {isNoBatch && (
                                    <span style={{ padding: '0.15rem 0.5rem', background: 'rgba(100,116,139,0.15)', color: '#64748b', borderRadius: '9999px', fontSize: '0.65rem', fontWeight: '700' }}>
                                      NO BATCH
                                    </span>
                                  )}
                                  {groupHasError && !isNoBatch && (
                                    <span style={{ padding: '0.15rem 0.6rem', background: 'rgba(239,68,68,0.12)', color: '#ef4444', borderRadius: '9999px', fontSize: '0.65rem', fontWeight: '700', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                        <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                                      </svg>
                                      {issueCount} issue{issueCount !== 1 ? 's' : ''}
                                    </span>
                                  )}
                                  {!groupHasError && !isNoBatch && (
                                    <span style={{ padding: '0.15rem 0.6rem', background: 'rgba(16,185,129,0.12)', color: '#10b981', borderRadius: '9999px', fontSize: '0.65rem', fontWeight: '700', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
                                      All OK
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td style={{ padding: '0.3rem 0.5rem', textAlign: 'right', color: 'var(--muted-foreground)', fontSize: '0.65rem', background: headerBg }}>
                                {isOpen ? 'Collapse' : 'Expand'}
                              </td>
                            </tr>

                            {/* Child product rows */}
                            {isOpen && group.products.map((item, idx) => {
                              const errors = getMissingFields(item);
                              const hasError = errors.length > 0;
                              const notMfg = isNotManufactured(item);
                              return (
                                <tr key={item._id} style={{
                                  borderBottom: '1px solid var(--border)',
                                  background: (notMfg && hasError) ? 'rgba(239,68,68,0.04)' : notMfg ? 'rgba(245,158,11,0.04)' : hasError ? 'rgba(239,68,68,0.04)' : idx % 2 === 0 ? 'rgba(0,0,0,0.01)' : 'transparent',
                                  borderLeft: (notMfg && hasError) ? '4px solid rgba(239,68,68,0.5)' : notMfg ? '4px solid rgba(245,158,11,0.4)' : hasError ? '4px solid rgba(239,68,68,0.3)' : '4px solid rgba(20,184,166,0.2)',
                                }}
                                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--muted)'}
                                  onMouseLeave={(e) => e.currentTarget.style.background = notMfg ? 'rgba(245,158,11,0.04)' : hasError ? 'rgba(239,68,68,0.04)' : idx % 2 === 0 ? 'rgba(0,0,0,0.01)' : 'transparent'}
                                >
                                  <td style={{ padding: '0.25rem 0.5rem', color: 'var(--muted-foreground)', fontSize: '0.7rem', fontFamily: 'monospace' }}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', paddingLeft: '0.5rem' }}>
                                      <span style={{ color: '#14b8a6', opacity: 0.6 }}>{idx === group.products.length - 1 ? '└' : '├'}</span>
                                    </span>
                                  </td>
                                  <td style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', color: notMfg ? '#f59e0b' : isMissingData(item.productCode) ? '#ef4444' : 'var(--foreground)', fontFamily: 'monospace', fontWeight: '600', borderRight: '1px solid var(--border)' }}>
                                    {item.productCode || 'N/A'}
                                  </td>
                                  <td style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', color: 'var(--foreground)', borderRight: '1px solid var(--border)' }}>{item.genericName || '-'}</td>
                                  <td style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', color: isMissingData(item.masterCardNo) ? '#ef4444' : 'var(--muted-foreground)', fontFamily: 'monospace', borderRight: '1px solid var(--border)' }}>{item.masterCardNo || 'N/A'}</td>
                                  <td style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', borderRight: '1px solid var(--border)' }}>
                                    <span style={{ padding: '0.2rem 0.5rem', background: isMissingData(item.therapeuticCategory) ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)', color: isMissingData(item.therapeuticCategory) ? '#ef4444' : '#f59e0b', borderRadius: 'var(--radius-sm)', fontSize: '0.7rem', fontWeight: '600' }}>
                                      {item.therapeuticCategory || 'N/A'}
                                    </span>
                                  </td>
                                  <td style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', fontWeight: '500', color: isMissingData(item.productName) ? '#ef4444' : 'var(--foreground)', borderRight: '1px solid var(--border)' }}>{item.productName || 'N/A'}</td>
                                  <td style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', color: isMissingData(item.department) ? '#ef4444' : 'var(--foreground)', borderRight: '1px solid var(--border)' }}>{item.department || 'N/A'}</td>
                                  <td style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', color: isMissingData(item.storageCondition) ? '#ef4444' : 'var(--muted-foreground)', maxWidth: '200px', borderRight: '1px solid var(--border)' }}>
                                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.storageCondition || 'N/A'}>{item.storageCondition || 'N/A'}</div>
                                  </td>
                                  <td style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', borderRight: '1px solid var(--border)' }}>
                                    <span style={{ padding: '0.2rem 0.5rem', background: isMissingData(item.productType) ? 'rgba(239,68,68,0.1)' : item.productType === 'EXPORT' ? 'rgba(20,184,166,0.1)' : 'rgba(139,92,246,0.1)', color: isMissingData(item.productType) ? '#ef4444' : item.productType === 'EXPORT' ? '#14b8a6' : '#8b5cf6', borderRadius: 'var(--radius-sm)', fontSize: '0.7rem', fontWeight: '600' }}>
                                      {item.productType || 'N/A'}
                                    </span>
                                  </td>
                                  <td style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', borderRight: '1px solid var(--border)' }}>
                                    {item.specification ? (
                                      <span style={{ padding: '0.2rem 0.5rem', background: 'rgba(99,102,241,0.1)', color: '#6366f1', borderRadius: 'var(--radius-sm)', fontSize: '0.7rem', fontWeight: '700', fontFamily: 'monospace' }}>
                                        {item.specification}
                                      </span>
                                    ) : <span style={{ color: 'var(--muted-foreground)' }}>—</span>}
                                  </td>
                                  <td style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', fontFamily: 'monospace', color: item.effectiveBatchNo ? 'var(--foreground)' : 'var(--muted-foreground)', borderRight: '1px solid var(--border)' }}>
                                    {item.effectiveBatchNo || '—'}
                                  </td>
                                  <td style={{ padding: '0.25rem 0.5rem', fontSize: '0.7rem', verticalAlign: 'top' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                      {notMfg && (
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.2rem 0.5rem', background: 'rgba(245,158,11,0.15)', color: '#f59e0b', borderRadius: 'var(--radius-sm)', fontSize: '0.65rem', fontWeight: '700' }}>
                                          MFG MISSING
                                        </span>
                                      )}
                                      {hasError && (
                                        <div style={{ color: '#ef4444', fontWeight: '700', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                          <span>MISSING:</span>
                                          <ul style={{ paddingLeft: '1rem', margin: 0, listStyleType: 'disc' }}>
                                            {errors.map((e, i) => <li key={i}>{e}</li>)}
                                          </ul>
                                        </div>
                                      )}
                                      {!notMfg && !hasError && (
                                        <span style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
                                          OK
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </React.Fragment>
                        );
                      })}
                    </>
                  );
                })() : (
                  sortedData.map((item, index) => {
                    // Check if row has errors
                    const errors = getMissingFields(item);
                    const hasError = errors.length > 0;

                    const notMfg = isNotManufactured(item);

                    return (
                      <tr key={item._id} style={{
                        borderBottom: '1px solid var(--border)',
                        transition: 'background-color var(--transition-fast)',
                        background: (notMfg && hasError)
                          ? 'rgba(239, 68, 68, 0.05)'
                          : notMfg
                            ? 'rgba(245, 158, 11, 0.05)'
                            : hasError
                              ? 'rgba(239, 68, 68, 0.05)'
                              : index % 2 === 0 ? 'transparent' : 'rgba(0, 0, 0, 0.02)',
                        borderLeft: (notMfg && hasError) ? '3px solid #ef4444' : notMfg ? '3px solid #f59e0b' : hasError ? '3px solid #ef4444' : 'none',
                      }}
                        onMouseEnter={(e) => e.currentTarget.style.background = (notMfg && hasError) ? 'rgba(239, 68, 68, 0.1)' : notMfg ? 'rgba(245, 158, 11, 0.1)' : hasError ? 'rgba(239, 68, 68, 0.1)' : 'var(--muted)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = notMfg ? 'rgba(245, 158, 11, 0.05)' : hasError ? 'rgba(239, 68, 68, 0.05)' : index % 2 === 0 ? 'transparent' : 'rgba(0, 0, 0, 0.02)'}
                      >
                        {/* SR Number */}
                        <td style={{
                          padding: '0.25rem 0.5rem',
                          fontSize: '0.7rem',
                          fontWeight: '600',
                          color: 'var(--foreground)',
                          fontFamily: 'monospace',
                          borderRight: '1px solid var(--border)',
                        }}>
                          {index + 1}
                        </td>

                        {/* Product Code */}
                        <td style={{
                          padding: '0.25rem 0.5rem',
                          fontSize: '0.7rem',
                          color: isMissingData(item.productCode) ? '#ef4444' : 'var(--foreground)',
                          fontFamily: 'monospace',
                          fontWeight: '500',
                          borderRight: '1px solid var(--border)',
                        }}>{item.productCode || 'N/A'}</td>

                        {/* Generic Name */}
                        <td style={{
                          padding: '0.25rem 0.5rem',
                          fontSize: '0.7rem',
                          color: 'var(--foreground)',
                          borderRight: '1px solid var(--border)',
                        }}>
                          {item.genericName || '-'}
                        </td>

                        {/* Master Card No */}
                        <td style={{
                          padding: '0.25rem 0.5rem',
                          fontSize: '0.7rem',
                          color: isMissingData(item.masterCardNo) ? '#ef4444' : 'var(--foreground)',
                          fontFamily: 'monospace',
                          borderRight: '1px solid var(--border)',
                        }}>{item.masterCardNo || 'N/A'}</td>

                        {/* Therapeutic Category */}
                        <td style={{
                          padding: '0.25rem 0.5rem',
                          fontSize: '0.7rem',
                          color: 'var(--foreground)',
                          borderRight: '1px solid var(--border)',
                        }}>
                          <span style={{
                            padding: '0.1rem 0.4rem',
                            background: isMissingData(item.therapeuticCategory) ? 'rgba(239, 68, 68, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                            color: isMissingData(item.therapeuticCategory) ? '#ef4444' : '#f59e0b',
                            borderRadius: 'var(--radius-sm)',
                            fontSize: '0.65rem',
                            fontWeight: '600',
                          }}>
                            {item.therapeuticCategory || 'N/A'}
                          </span>
                        </td>

                        {/* Product Name */}
                        <td style={{
                          padding: '0.25rem 0.5rem',
                          fontSize: '0.7rem',
                          fontWeight: '500',
                          color: isMissingData(item.productName) ? '#ef4444' : 'var(--foreground)',
                          borderRight: '1px solid var(--border)',
                        }}>{item.productName || 'N/A'}</td>

                        {/* Department */}
                        <td style={{
                          padding: '0.25rem 0.5rem',
                          fontSize: '0.7rem',
                          color: isMissingData(item.department) ? '#ef4444' : 'var(--foreground)',
                          borderRight: '1px solid var(--border)',
                        }}>{item.department || 'N/A'}</td>

                        {/* Storage Condition */}
                        <td style={{
                          padding: '0.25rem 0.5rem',
                          fontSize: '0.7rem',
                          color: isMissingData(item.storageCondition) ? '#ef4444' : 'var(--muted-foreground)',
                          maxWidth: '200px',
                          borderRight: '1px solid var(--border)',
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
                          padding: '0.25rem 0.5rem',
                          fontSize: '0.7rem',
                          color: 'var(--foreground)',
                          borderRight: '1px solid var(--border)',
                        }}>
                          <span style={{
                            padding: '0.1rem 0.4rem',
                            background: isMissingData(item.productType)
                              ? 'rgba(239, 68, 68, 0.1)'
                              : item.productType === 'EXPORT' ? 'rgba(20, 184, 166, 0.1)' : 'rgba(139, 92, 246, 0.1)',
                            color: isMissingData(item.productType)
                              ? '#ef4444'
                              : item.productType === 'EXPORT' ? '#14b8a6' : '#8b5cf6',
                            borderRadius: 'var(--radius-sm)',
                            fontSize: '0.65rem',
                            fontWeight: '600',
                          }}>
                            {item.productType || 'N/A'}
                          </span>
                        </td>

                        {/* Specification */}
                        <td style={{ padding: '0.25rem 0.5rem', fontSize: '0.7rem', borderRight: '1px solid var(--border)' }}>
                          {item.specification ? (
                            <span style={{
                              padding: '0.1rem 0.4rem',
                              background: 'rgba(99, 102, 241, 0.1)',
                              color: '#6366f1',
                              borderRadius: 'var(--radius-sm)',
                              fontSize: '0.65rem',
                              fontWeight: '700',
                              fontFamily: 'monospace',
                            }}>
                              {item.specification}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--muted-foreground)', fontSize: '0.65rem' }}>—</span>
                          )}
                        </td>

                        {/* Effective Batch No */}
                        <td style={{ padding: '0.25rem 0.5rem', fontSize: '0.7rem', fontFamily: 'monospace', color: item.effectiveBatchNo ? 'var(--foreground)' : 'var(--muted-foreground)', borderRight: '1px solid var(--border)' }}>
                          {item.effectiveBatchNo || '—'}
                        </td>

                        {/* Status (Errors / MFG Missing) */}
                        <td style={{
                          padding: '0.25rem 0.5rem',
                          fontSize: '0.65rem',
                          fontWeight: '600',
                          verticalAlign: 'middle',
                        }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                            {notMfg && (
                              <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.3rem',
                                padding: '0.2rem 0.5rem',
                                background: 'rgba(245, 158, 11, 0.15)',
                                color: '#f59e0b',
                                borderRadius: 'var(--radius-sm)',
                                fontSize: '0.7rem',
                                fontWeight: '700',
                              }}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                  <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                                </svg>
                                MFG MISSING
                              </span>
                            )}
                            {hasError && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', color: '#ef4444' }}>
                                <span style={{ fontWeight: '700' }}>MISSING:</span>
                                <ul style={{ paddingLeft: '1rem', margin: 0, listStyleType: 'disc' }}>
                                  {errors.map((err: string, i: number) => (
                                    <li key={i}>{err}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {!notMfg && !hasError && (
                              <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: '#10b981' }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                                OK
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

      </main>
    </div>
  );
}
