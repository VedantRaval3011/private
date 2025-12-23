'use client';

/**
 * Batch Data Page - Year-wise Dashboard
 * Shows batch data organized by year with breakdowns by product type, pack size, and detailed table
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import type { BatchRegistryRecord, BatchRecordItem } from '@/types/formula';

interface BatchListResponse {
    success: boolean;
    data: BatchRegistryRecord[];
    total: number;
    page: number;
    limit: number;
}

// Extended batch item with source file info
interface BatchItemWithSource extends BatchRecordItem {
    sourceFileName: string;
    sourceFileId: string;
}

// Product type mapping (unit field to display name)
const PRODUCT_TYPE_MAP: Record<string, string> = {
    'BOT': 'Bottles (Eye Drops)',
    'TUBE': 'Tubes',
    'SYRIN': 'Syringes',
    'VIAL': 'Vials',
    'AMP': 'Ampoules',
    'CAP': 'Capsules',
    'TAB': 'Tablets',
    'SACHET': 'Sachets',
    'JAR': 'Jars',
};

// Get display name for product type
const getProductTypeName = (unit: string): string => {
    const upperUnit = unit?.toUpperCase() || '';
    for (const [key, value] of Object.entries(PRODUCT_TYPE_MAP)) {
        if (upperUnit.includes(key)) return value;
    }
    return unit || 'Other';
};

// Parse year from "202425" format to "2024-2025"
const parseYearDisplay = (yearCode: string): string => {
    if (!yearCode || yearCode === 'N/A') return 'Unknown Year';
    // Format: "202425" -> "2024-25" or "2024-2025"
    if (yearCode.length >= 6) {
        const firstYear = yearCode.substring(0, 4);
        const secondYear = yearCode.substring(4, 6);
        return `${firstYear}-${secondYear}`;
    }
    return yearCode;
};

// Parse batch size to get numeric value
const parseBatchSize = (batchSize: string): number => {
    if (!batchSize || batchSize === 'N/A') return 0;
    const match = batchSize.match(/[\d.]+/);
    return match ? parseFloat(match[0]) : 0;
};

// Parse UOM to determine if it's liters or kg
const getUomType = (batchUom: string): 'LTR' | 'KG' | 'Other' => {
    const upper = batchUom?.toUpperCase() || '';
    if (upper.includes('LTR') || upper.includes('LITER') || upper.includes('L')) return 'LTR';
    if (upper.includes('KG') || upper.includes('KILO')) return 'KG';
    return 'Other';
};

// Get color scheme for each product type
const getProductTypeColor = (productType: string): { primary: string; light: string; border: string } => {
    const type = productType.toLowerCase();

    if (type.includes('tube')) {
        return { primary: '#ec4899', light: 'rgba(236, 72, 153, 0.1)', border: 'rgba(236, 72, 153, 0.3)' }; // Pink
    }
    if (type.includes('bottle') || type.includes('eye drop')) {
        return { primary: '#3b82f6', light: 'rgba(59, 130, 246, 0.1)', border: 'rgba(59, 130, 246, 0.3)' }; // Blue
    }
    if (type.includes('syringe') || type.includes('syrin')) {
        return { primary: '#f97316', light: 'rgba(249, 115, 22, 0.1)', border: 'rgba(249, 115, 22, 0.3)' }; // Orange
    }
    if (type.includes('vial')) {
        return { primary: '#f59e0b', light: 'rgba(245, 158, 11, 0.1)', border: 'rgba(245, 158, 11, 0.3)' }; // Amber
    }
    if (type.includes('capsule')) {
        return { primary: '#8b5cf6', light: 'rgba(139, 92, 246, 0.1)', border: 'rgba(139, 92, 246, 0.3)' }; // Purple
    }
    if (type.includes('tablet')) {
        return { primary: '#06b6d4', light: 'rgba(6, 182, 212, 0.1)', border: 'rgba(6, 182, 212, 0.3)' }; // Cyan
    }
    if (type.includes('cream') || type.includes('ointment')) {
        return { primary: '#a855f7', light: 'rgba(168, 85, 247, 0.1)', border: 'rgba(168, 85, 247, 0.3)' }; // Violet
    }
    if (type.includes('powder')) {
        return { primary: '#84cc16', light: 'rgba(132, 204, 22, 0.1)', border: 'rgba(132, 204, 22, 0.3)' }; // Lime
    }
    // Default purple for unknown types
    return { primary: '#8b5cf6', light: 'rgba(139, 92, 246, 0.1)', border: 'rgba(139, 92, 246, 0.3)' };
};

// Interface for year summary
interface YearSummary {
    year: string;
    yearDisplay: string;
    totalBatches: number;
    totalLiters: number;
    totalKg: number;
    productTypes: Record<string, { count: number; liters: number; kg: number }>;
    packSizes: Record<string, Record<string, { count: number; liters: number; kg: number }>>;
    items: BatchItemWithSource[];
}

export default function BatchDataPage() {
    const [batches, setBatches] = useState<BatchRegistryRecord[]>([]);
    const [allBatchItems, setAllBatchItems] = useState<BatchItemWithSource[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedYear, setSelectedYear] = useState<string | null>(null);
    const [sortField, setSortField] = useState<keyof BatchItemWithSource>('srNo');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
    const [expandedProductType, setExpandedProductType] = useState<string | null>(null);
    // State for expanded item codes in the grouped table view
    const [expandedItemCodes, setExpandedItemCodes] = useState<Set<string>>(new Set());
    // Filter states
    const [filterProductType, setFilterProductType] = useState<string | null>(null);
    const [filterPackSize, setFilterPackSize] = useState<string | null>(null);
    // Ref for scrolling to products section
    const productsSectionRef = useRef<HTMLDivElement>(null);

    const fetchBatches = useCallback(async () => {
        setIsLoading(true);
        try {
            const response = await fetch(`/api/batch?page=1&limit=100`);
            const data: BatchListResponse = await response.json();
            if (data.success) {
                setBatches(data.data);

                // Flatten all batch items with source file info
                const items: BatchItemWithSource[] = [];
                data.data.forEach(batch => {
                    batch.batches.forEach(item => {
                        items.push({
                            ...item,
                            sourceFileName: batch.fileName,
                            sourceFileId: batch._id || '',
                        });
                    });
                });
                setAllBatchItems(items);
            }
        } catch (error) {
            console.error('Error fetching batches:', error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchBatches();
    }, [fetchBatches]);

    // Calculate year-wise summaries
    const yearSummaries = useMemo(() => {
        const summaries: Record<string, YearSummary> = {};

        allBatchItems.forEach(item => {
            const year = item.year || 'Unknown';
            const yearDisplay = parseYearDisplay(year);

            if (!summaries[year]) {
                summaries[year] = {
                    year,
                    yearDisplay,
                    totalBatches: 0,
                    totalLiters: 0,
                    totalKg: 0,
                    productTypes: {},
                    packSizes: {},
                    items: [],
                };
            }

            const summary = summaries[year];
            summary.totalBatches++;
            summary.items.push(item);

            // Calculate liters/kg
            const batchSize = parseBatchSize(item.batchSize);
            const uomType = getUomType(item.batchUom);
            if (uomType === 'LTR') {
                summary.totalLiters += batchSize;
            } else if (uomType === 'KG') {
                summary.totalKg += batchSize;
            }

            // Product type breakdown
            const productType = getProductTypeName(item.unit);
            if (!summary.productTypes[productType]) {
                summary.productTypes[productType] = { count: 0, liters: 0, kg: 0 };
            }
            summary.productTypes[productType].count++;
            if (uomType === 'LTR') {
                summary.productTypes[productType].liters += batchSize;
            } else if (uomType === 'KG') {
                summary.productTypes[productType].kg += batchSize;
            }

            // Pack size breakdown per product type
            const pack = item.pack || 'Unknown';
            if (!summary.packSizes[productType]) {
                summary.packSizes[productType] = {};
            }
            if (!summary.packSizes[productType][pack]) {
                summary.packSizes[productType][pack] = { count: 0, liters: 0, kg: 0 };
            }
            summary.packSizes[productType][pack].count++;
            if (uomType === 'LTR') {
                summary.packSizes[productType][pack].liters += batchSize;
            } else if (uomType === 'KG') {
                summary.packSizes[productType][pack].kg += batchSize;
            }
        });

        // Sort by year descending
        return Object.values(summaries).sort((a, b) => b.year.localeCompare(a.year));
    }, [allBatchItems]);

    // Get selected year data
    const selectedYearData = useMemo(() => {
        if (!selectedYear) return null;
        return yearSummaries.find(s => s.year === selectedYear) || null;
    }, [selectedYear, yearSummaries]);

    // Sorted items for the table
    const sortedItems = useMemo(() => {
        if (!selectedYearData) return [];
        return [...selectedYearData.items].sort((a, b) => {
            const aVal = a[sortField];
            const bVal = b[sortField];
            if (aVal === null || aVal === undefined) return 1;
            if (bVal === null || bVal === undefined) return -1;
            if (typeof aVal === 'number' && typeof bVal === 'number') {
                return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
            }
            return sortDirection === 'asc'
                ? String(aVal).localeCompare(String(bVal))
                : String(bVal).localeCompare(String(aVal));
        });
    }, [selectedYearData, sortField, sortDirection]);

    // Group items by Item Code (product ID)
    interface ItemCodeGroup {
        itemCode: string;
        itemName: string;
        itemDetail: string;
        batchCount: number;
        totalLiters: number;
        totalKg: number;
        items: BatchItemWithSource[];
        pack: string;
        unit: string;
    }

    const groupedByItemCode = useMemo(() => {
        if (!selectedYearData) return [];

        const groups: Record<string, ItemCodeGroup> = {};

        selectedYearData.items.forEach(item => {
            // Apply product type filter
            const productType = getProductTypeName(item.unit);
            if (filterProductType && productType !== filterProductType) {
                return;
            }

            // Apply pack size filter
            if (filterPackSize && item.pack !== filterPackSize) {
                return;
            }

            const code = item.itemCode;
            if (!groups[code]) {
                groups[code] = {
                    itemCode: code,
                    itemName: item.itemName,
                    itemDetail: item.itemDetail,
                    batchCount: 0,
                    totalLiters: 0,
                    totalKg: 0,
                    items: [],
                    pack: item.pack,
                    unit: item.unit,
                };
            }
            groups[code].batchCount++;
            groups[code].items.push(item);

            const batchSize = parseBatchSize(item.batchSize);
            const uomType = getUomType(item.batchUom);
            if (uomType === 'LTR') {
                groups[code].totalLiters += batchSize;
            } else if (uomType === 'KG') {
                groups[code].totalKg += batchSize;
            }
        });

        // Sort groups by batch count descending
        return Object.values(groups).sort((a, b) => b.batchCount - a.batchCount);
    }, [selectedYearData, filterProductType, filterPackSize]);

    // Toggle item code expansion
    const toggleItemCode = (itemCode: string) => {
        setExpandedItemCodes(prev => {
            const newSet = new Set(prev);
            if (newSet.has(itemCode)) {
                newSet.delete(itemCode);
            } else {
                newSet.add(itemCode);
            }
            return newSet;
        });
    };

    // Expand/collapse all
    const expandAll = () => {
        setExpandedItemCodes(new Set(groupedByItemCode.map(g => g.itemCode)));
    };

    const collapseAll = () => {
        setExpandedItemCodes(new Set());
    };

    const handleSort = (field: keyof BatchItemWithSource) => {
        if (sortField === field) {
            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('asc');
        }
    };

    // Handle product type card click - filter and scroll
    const handleProductTypeClick = (type: string) => {
        setExpandedProductType(expandedProductType === type ? null : type);
        // Toggle filter
        if (filterProductType === type) {
            setFilterProductType(null);
            setFilterPackSize(null); // Clear pack filter when clearing type filter
        } else {
            setFilterProductType(type);
            setFilterPackSize(null); // Clear pack filter when changing type
            // Scroll to products section after a small delay
            setTimeout(() => {
                productsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 100);
        }
    };

    // Handle pack size card click - filter and scroll
    const handlePackSizeClick = (pack: string) => {
        if (filterPackSize === pack) {
            setFilterPackSize(null);
        } else {
            setFilterPackSize(pack);
            // Scroll to products section after a small delay
            setTimeout(() => {
                productsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 100);
        }
    };

    // Clear all filters
    const clearFilters = () => {
        setFilterProductType(null);
        setFilterPackSize(null);
    };

    // Table header style
    const thStyle: React.CSSProperties = {
        padding: '0.75rem 0.5rem',
        textAlign: 'left',
        fontWeight: '600',
        color: 'var(--foreground)',
        whiteSpace: 'nowrap',
        borderBottom: '1px solid var(--border)',
        cursor: 'pointer',
        userSelect: 'none',
        fontSize: '0.75rem',
    };

    const tdStyle: React.CSSProperties = {
        padding: '0.625rem 0.5rem',
        borderBottom: '1px solid var(--border)',
        color: 'var(--foreground)',
        whiteSpace: 'nowrap',
        fontSize: '0.8rem',
    };

    return (
        <div style={{ minHeight: '100vh', background: 'var(--background)' }}>
            {/* Header */}
            <header style={{
                background: 'linear-gradient(135deg, #14b8a6 0%, #06b6d4 100%)',
                padding: '2rem 0',
                position: 'relative',
                overflow: 'hidden',
            }}>
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
                    maxWidth: '1600px',
                    margin: '0 auto',
                    padding: '0 2rem',
                    position: 'relative',
                    zIndex: 1,
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
                                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                                    <polyline points="14 2 14 8 20 8" />
                                    <line x1="16" y1="13" x2="8" y2="13" />
                                    <line x1="16" y1="17" x2="8" y2="17" />
                                </svg>
                                Batch Production Dashboard
                            </h1>
                            <p style={{ color: 'rgba(255, 255, 255, 0.8)', fontSize: '1rem' }}>
                                Year-wise manufacturing data from {batches.length} file(s) • {allBatchItems.length} total batches
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
                {isLoading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
                        <svg className="animate-spin" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#14b8a6" strokeWidth="2">
                            <path d="M21 12a9 9 0 11-6.219-8.56" strokeLinecap="round" />
                        </svg>
                    </div>
                ) : (
                    <>
                        {/* Year Tabs */}
                        <div style={{ marginBottom: '2rem' }}>
                            <h2 style={{
                                fontSize: '1.25rem',
                                fontWeight: '600',
                                color: 'var(--foreground)',
                                marginBottom: '1rem',
                            }}>
                                📅 Select Year to View Details
                            </h2>
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                                gap: '1rem',
                            }}>
                                {yearSummaries.map(summary => (
                                    <button
                                        key={summary.year}
                                        onClick={() => setSelectedYear(selectedYear === summary.year ? null : summary.year)}
                                        style={{
                                            padding: '1.5rem',
                                            background: selectedYear === summary.year
                                                ? 'linear-gradient(135deg, #14b8a6 0%, #06b6d4 100%)'
                                                : 'var(--card)',
                                            border: selectedYear === summary.year
                                                ? 'none'
                                                : '1px solid var(--border)',
                                            borderRadius: 'var(--radius-lg)',
                                            cursor: 'pointer',
                                            textAlign: 'left',
                                            transition: 'all 0.2s ease',
                                            boxShadow: selectedYear === summary.year
                                                ? '0 8px 30px rgba(20, 184, 166, 0.3)'
                                                : 'var(--shadow-sm)',
                                        }}
                                    >
                                        <div style={{
                                            fontSize: '1.5rem',
                                            fontWeight: '700',
                                            color: selectedYear === summary.year ? 'white' : 'var(--foreground)',
                                            marginBottom: '0.5rem',
                                        }}>
                                            📆 {summary.yearDisplay}
                                        </div>
                                        <div style={{
                                            fontSize: '2rem',
                                            fontWeight: '800',
                                            color: selectedYear === summary.year ? 'white' : '#14b8a6',
                                        }}>
                                            {summary.totalBatches.toLocaleString()}
                                        </div>
                                        <div style={{
                                            fontSize: '0.875rem',
                                            color: selectedYear === summary.year ? 'rgba(255,255,255,0.8)' : 'var(--muted-foreground)',
                                        }}>
                                            batches manufactured
                                        </div>
                                        <div style={{
                                            display: 'flex',
                                            gap: '0.75rem',
                                            marginTop: '1rem',
                                            flexWrap: 'wrap',
                                        }}>
                                            {summary.totalLiters > 0 && (
                                                <div style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '0.5rem',
                                                    padding: '0.5rem 0.875rem',
                                                    borderRadius: 'var(--radius-md)',
                                                    background: selectedYear === summary.year
                                                        ? 'rgba(255, 255, 255, 0.2)'
                                                        : 'linear-gradient(135deg, rgba(59, 130, 246, 0.15) 0%, rgba(96, 165, 250, 0.1) 100%)',
                                                    backdropFilter: 'blur(4px)',
                                                    border: selectedYear === summary.year
                                                        ? '1px solid rgba(255, 255, 255, 0.3)'
                                                        : '1px solid rgba(59, 130, 246, 0.3)',
                                                }}>
                                                    <span style={{ fontSize: '1.25rem' }}>💧</span>
                                                    <span style={{
                                                        fontSize: '1.125rem',
                                                        fontWeight: '700',
                                                        color: selectedYear === summary.year ? 'white' : '#3b82f6',
                                                    }}>
                                                        {summary.totalLiters.toLocaleString(undefined, { maximumFractionDigits: 1 })} L
                                                    </span>
                                                </div>
                                            )}
                                            {summary.totalKg > 0 && (
                                                <div style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '0.5rem',
                                                    padding: '0.5rem 0.875rem',
                                                    borderRadius: 'var(--radius-md)',
                                                    background: selectedYear === summary.year
                                                        ? 'rgba(255, 255, 255, 0.2)'
                                                        : 'linear-gradient(135deg, rgba(236, 72, 153, 0.15) 0%, rgba(244, 114, 182, 0.1) 100%)',
                                                    backdropFilter: 'blur(4px)',
                                                    border: selectedYear === summary.year
                                                        ? '1px solid rgba(255, 255, 255, 0.3)'
                                                        : '1px solid rgba(236, 72, 153, 0.3)',
                                                }}>
                                                    <span style={{ fontSize: '1.25rem' }}>⚖️</span>
                                                    <span style={{
                                                        fontSize: '1.125rem',
                                                        fontWeight: '700',
                                                        color: selectedYear === summary.year ? 'white' : '#ec4899',
                                                    }}>
                                                        {summary.totalKg.toLocaleString(undefined, { maximumFractionDigits: 1 })} Kg
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Year Details */}
                        {selectedYearData && (
                            <div className="animate-fadeIn">
                                {/* Product Type Summary */}
                                <div style={{
                                    background: 'var(--card)',
                                    borderRadius: 'var(--radius-lg)',
                                    border: '1px solid var(--border)',
                                    padding: '1.5rem',
                                    marginBottom: '1.5rem',
                                }}>
                                    <h3 style={{
                                        fontSize: '1.125rem',
                                        fontWeight: '600',
                                        color: 'var(--foreground)',
                                        marginBottom: '1rem',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.5rem',
                                    }}>
                                        📊 Product Type Breakdown for {selectedYearData.yearDisplay}
                                    </h3>

                                    <div style={{
                                        display: 'grid',
                                        gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                                        gap: '1rem',
                                        marginBottom: '1.5rem',
                                    }}>
                                        {Object.entries(selectedYearData.productTypes)
                                            .sort((a, b) => b[1].count - a[1].count)
                                            .map(([type, data]) => {
                                                const typeColor = getProductTypeColor(type);
                                                const isActive = filterProductType === type;
                                                return (
                                                    <div
                                                        key={type}
                                                        onClick={() => handleProductTypeClick(type)}
                                                        style={{
                                                            padding: '1.25rem',
                                                            background: isActive
                                                                ? typeColor.light
                                                                : 'var(--muted)',
                                                            borderRadius: 'var(--radius-md)',
                                                            cursor: 'pointer',
                                                            borderTop: isActive
                                                                ? `2px solid ${typeColor.primary}`
                                                                : `2px solid transparent`,
                                                            borderRight: isActive
                                                                ? `2px solid ${typeColor.primary}`
                                                                : `2px solid transparent`,
                                                            borderBottom: isActive
                                                                ? `2px solid ${typeColor.primary}`
                                                                : `2px solid transparent`,
                                                            borderLeft: `4px solid ${typeColor.primary}`,
                                                            transition: 'all 0.2s ease',
                                                            boxShadow: isActive ? `0 4px 12px ${typeColor.border}` : 'none',
                                                        }}
                                                    >
                                                        <div style={{
                                                            fontSize: '0.9rem',
                                                            color: typeColor.primary,
                                                            marginBottom: '0.5rem',
                                                            fontWeight: '600',
                                                        }}>
                                                            {type}
                                                        </div>
                                                        <div style={{
                                                            fontSize: '2rem',
                                                            fontWeight: '800',
                                                            color: typeColor.primary,
                                                            marginBottom: '0.75rem',
                                                        }}>
                                                            {data.count.toLocaleString()}
                                                        </div>
                                                        {/* Volume Stats */}
                                                        <div style={{
                                                            display: 'flex',
                                                            flexDirection: 'row',
                                                            flexWrap: 'wrap',
                                                            gap: '0.5rem',
                                                            alignItems: 'center',
                                                        }}>
                                                            {data.liters > 0 && (
                                                                <div style={{
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    gap: '0.35rem',
                                                                    padding: '0.35rem 0.625rem',
                                                                    borderRadius: 'var(--radius-sm)',
                                                                    background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.15) 0%, rgba(96, 165, 250, 0.1) 100%)',
                                                                    border: '1px solid rgba(59, 130, 246, 0.25)',
                                                                }}>
                                                                    <span style={{ fontSize: '1rem' }}>💧</span>
                                                                    <span style={{
                                                                        fontSize: '0.95rem',
                                                                        fontWeight: '700',
                                                                        color: '#3b82f6',
                                                                    }}>
                                                                        {data.liters.toLocaleString(undefined, { maximumFractionDigits: 1 })} L
                                                                    </span>
                                                                </div>
                                                            )}
                                                            {data.kg > 0 && (
                                                                <div style={{
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    gap: '0.35rem',
                                                                    padding: '0.35rem 0.625rem',
                                                                    borderRadius: 'var(--radius-sm)',
                                                                    background: 'linear-gradient(135deg, rgba(236, 72, 153, 0.15) 0%, rgba(244, 114, 182, 0.1) 100%)',
                                                                    border: '1px solid rgba(236, 72, 153, 0.25)',
                                                                }}>
                                                                    <span style={{ fontSize: '1rem' }}>⚖️</span>
                                                                    <span style={{
                                                                        fontSize: '0.95rem',
                                                                        fontWeight: '700',
                                                                        color: '#ec4899',
                                                                    }}>
                                                                        {data.kg.toLocaleString(undefined, { maximumFractionDigits: 1 })} Kg
                                                                    </span>
                                                                </div>
                                                            )}
                                                            {/* Total Sum when both L and Kg exist */}
                                                            {data.liters > 0 && data.kg > 0 && (
                                                                <div style={{
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    gap: '0.35rem',
                                                                    padding: '0.35rem 0.625rem',
                                                                    borderRadius: 'var(--radius-sm)',
                                                                    background: 'linear-gradient(135deg, rgba(20, 184, 166, 0.15) 0%, rgba(34, 211, 238, 0.1) 100%)',
                                                                    border: '1px solid rgba(20, 184, 166, 0.3)',
                                                                }}>
                                                                    <span style={{ fontSize: '1rem' }}>📦</span>
                                                                    <span style={{
                                                                        fontSize: '0.85rem',
                                                                        fontWeight: '600',
                                                                        color: '#14b8a6',
                                                                    }}>
                                                                        Total: {(data.liters + data.kg).toLocaleString(undefined, { maximumFractionDigits: 1 })}
                                                                    </span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                    </div>

                                    {/* Pack Size Breakdown for Selected Product Type */}
                                    {expandedProductType && selectedYearData.packSizes[expandedProductType] && (
                                        <div style={{
                                            background: 'rgba(139, 92, 246, 0.05)',
                                            borderRadius: 'var(--radius-md)',
                                            padding: '1rem',
                                            marginTop: '1rem',
                                        }}>
                                            <h4 style={{
                                                fontSize: '1rem',
                                                fontWeight: '600',
                                                color: '#8b5cf6',
                                                marginBottom: '1rem',
                                            }}>
                                                📦 Pack Sizes for {expandedProductType}
                                            </h4>
                                            <div style={{
                                                display: 'grid',
                                                gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
                                                gap: '0.75rem',
                                            }}>
                                                {Object.entries(selectedYearData.packSizes[expandedProductType])
                                                    .sort((a, b) => b[1].count - a[1].count)
                                                    .map(([pack, data]) => {
                                                        const isActive = filterPackSize === pack;
                                                        return (
                                                            <div
                                                                key={pack}
                                                                onClick={() => handlePackSizeClick(pack)}
                                                                style={{
                                                                    padding: '0.75rem',
                                                                    background: isActive ? 'rgba(20, 184, 166, 0.15)' : 'var(--card)',
                                                                    borderRadius: 'var(--radius-sm)',
                                                                    borderTop: isActive ? '2px solid #14b8a6' : '1px solid var(--border)',
                                                                    borderRight: isActive ? '2px solid #14b8a6' : '1px solid var(--border)',
                                                                    borderBottom: isActive ? '2px solid #14b8a6' : '1px solid var(--border)',
                                                                    borderLeft: isActive ? '3px solid #14b8a6' : '1px solid var(--border)',
                                                                    cursor: 'pointer',
                                                                    transition: 'all 0.2s ease',
                                                                    boxShadow: isActive ? '0 2px 8px rgba(20, 184, 166, 0.2)' : 'none',
                                                                }}
                                                            >
                                                                <div style={{
                                                                    fontSize: '0.875rem',
                                                                    fontWeight: '600',
                                                                    color: isActive ? '#14b8a6' : 'var(--foreground)',
                                                                }}>
                                                                    {pack}
                                                                </div>
                                                                <div style={{
                                                                    fontSize: '1.25rem',
                                                                    fontWeight: '700',
                                                                    color: '#14b8a6',
                                                                }}>
                                                                    {data.count}
                                                                </div>
                                                                <div style={{
                                                                    fontSize: '0.7rem',
                                                                    color: 'var(--muted-foreground)',
                                                                }}>
                                                                    {data.liters > 0 && `${data.liters.toFixed(1)} L`}
                                                                    {data.liters > 0 && data.kg > 0 && ' / '}
                                                                    {data.kg > 0 && `${data.kg.toFixed(1)} Kg`}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Products Grouped by Item Code */}
                                <div
                                    ref={productsSectionRef}
                                    style={{
                                        background: 'var(--card)',
                                        borderRadius: 'var(--radius-lg)',
                                        border: '1px solid var(--border)',
                                        overflow: 'hidden',
                                    }}>
                                    <div style={{
                                        padding: '1rem 1.5rem',
                                        borderBottom: '1px solid var(--border)',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        flexWrap: 'wrap',
                                        gap: '1rem',
                                    }}>
                                        <div>
                                            <h3 style={{
                                                fontSize: '1rem',
                                                fontWeight: '600',
                                                color: 'var(--foreground)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.5rem',
                                                flexWrap: 'wrap',
                                            }}>
                                                📦 Products by Item Code for {selectedYearData.yearDisplay}
                                                {/* Active Filter Badges */}
                                                {filterProductType && (
                                                    <span style={{
                                                        padding: '0.25rem 0.5rem',
                                                        background: getProductTypeColor(filterProductType).light,
                                                        color: getProductTypeColor(filterProductType).primary,
                                                        borderRadius: 'var(--radius-sm)',
                                                        fontSize: '0.75rem',
                                                        fontWeight: '600',
                                                        border: `1px solid ${getProductTypeColor(filterProductType).border}`,
                                                    }}>
                                                        🏷️ {filterProductType}
                                                    </span>
                                                )}
                                                {filterPackSize && (
                                                    <span style={{
                                                        padding: '0.25rem 0.5rem',
                                                        background: 'rgba(20, 184, 166, 0.1)',
                                                        color: '#14b8a6',
                                                        borderRadius: 'var(--radius-sm)',
                                                        fontSize: '0.75rem',
                                                        fontWeight: '600',
                                                        border: '1px solid rgba(20, 184, 166, 0.3)',
                                                    }}>
                                                        📦 {filterPackSize}
                                                    </span>
                                                )}
                                            </h3>
                                            <p style={{
                                                fontSize: '0.8rem',
                                                color: 'var(--muted-foreground)',
                                                marginTop: '0.25rem',
                                            }}>
                                                {groupedByItemCode.length} unique products • {sortedItems.length} total batches
                                                {(filterProductType || filterPackSize) && ' (filtered)'}
                                            </p>
                                        </div>
                                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                            {/* Clear Filters Button */}
                                            {(filterProductType || filterPackSize) && (
                                                <button
                                                    onClick={clearFilters}
                                                    style={{
                                                        padding: '0.5rem 1rem',
                                                        background: 'rgba(239, 68, 68, 0.1)',
                                                        border: '1px solid rgba(239, 68, 68, 0.3)',
                                                        borderRadius: 'var(--radius-sm)',
                                                        color: '#ef4444',
                                                        fontSize: '0.8rem',
                                                        cursor: 'pointer',
                                                        fontWeight: '600',
                                                    }}
                                                >
                                                    ✕ Clear Filters
                                                </button>
                                            )}
                                            <button
                                                onClick={expandAll}
                                                style={{
                                                    padding: '0.5rem 1rem',
                                                    background: 'var(--muted)',
                                                    border: 'none',
                                                    borderRadius: 'var(--radius-sm)',
                                                    color: 'var(--foreground)',
                                                    fontSize: '0.8rem',
                                                    cursor: 'pointer',
                                                }}
                                            >
                                                Expand All
                                            </button>
                                            <button
                                                onClick={collapseAll}
                                                style={{
                                                    padding: '0.5rem 1rem',
                                                    background: 'var(--muted)',
                                                    border: 'none',
                                                    borderRadius: 'var(--radius-sm)',
                                                    color: 'var(--foreground)',
                                                    fontSize: '0.8rem',
                                                    cursor: 'pointer',
                                                }}
                                            >
                                                Collapse All
                                            </button>
                                        </div>
                                    </div>

                                    <div style={{ maxHeight: '700px', overflowY: 'auto' }}>
                                        {groupedByItemCode.map((group, groupIndex) => {
                                            const unitColor = getProductTypeColor(group.unit);
                                            return (
                                                <div key={group.itemCode}>
                                                    {/* Product Header Row - Clickable */}
                                                    <div
                                                        onClick={() => toggleItemCode(group.itemCode)}
                                                        style={{
                                                            padding: '1rem 1.5rem',
                                                            background: expandedItemCodes.has(group.itemCode)
                                                                ? unitColor.light
                                                                : groupIndex % 2 === 0 ? 'transparent' : 'var(--muted)',
                                                            borderBottom: '1px solid var(--border)',
                                                            borderLeft: `4px solid ${unitColor.primary}`,
                                                            cursor: 'pointer',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '1rem',
                                                            transition: 'background 0.2s ease',
                                                            flexWrap: 'wrap',
                                                        }}
                                                    >
                                                        {/* Expand/Collapse Arrow */}
                                                        <span style={{
                                                            fontSize: '1.2rem',
                                                            transition: 'transform 0.2s ease',
                                                            transform: expandedItemCodes.has(group.itemCode)
                                                                ? 'rotate(90deg)'
                                                                : 'rotate(0deg)',
                                                            color: unitColor.primary,
                                                        }}>
                                                            ▶
                                                        </span>

                                                        {/* Item Code */}
                                                        <div style={{
                                                            fontFamily: 'monospace',
                                                            fontWeight: '700',
                                                            fontSize: '1rem',
                                                            color: unitColor.primary,
                                                        }}>
                                                            {group.itemCode}
                                                        </div>

                                                        {/* Item Name */}
                                                        <div style={{
                                                            fontWeight: '500',
                                                            color: 'var(--foreground)',
                                                            maxWidth: '300px',
                                                            overflow: 'hidden',
                                                            textOverflow: 'ellipsis',
                                                            whiteSpace: 'nowrap',
                                                        }}>
                                                            {group.itemName || group.itemDetail}
                                                        </div>

                                                        {/* Pack & Unit */}
                                                        <div style={{
                                                            padding: '0.25rem 0.5rem',
                                                            background: unitColor.light,
                                                            color: unitColor.primary,
                                                            borderRadius: 'var(--radius-sm)',
                                                            fontSize: '0.75rem',
                                                            fontWeight: '600',
                                                            border: `1px solid ${unitColor.border}`,
                                                        }}>
                                                            {group.pack} • {group.unit}
                                                        </div>

                                                        {/* Batch Count */}
                                                        <div style={{
                                                            padding: '0.375rem 0.75rem',
                                                            background: `linear-gradient(135deg, ${unitColor.primary} 0%, ${unitColor.primary}dd 100%)`,
                                                            color: 'white',
                                                            borderRadius: 'var(--radius-full)',
                                                            fontSize: '0.875rem',
                                                            fontWeight: '700',
                                                        }}>
                                                            {group.batchCount} batch{group.batchCount !== 1 ? 'es' : ''}
                                                        </div>

                                                        {/* Total Volume - Highlighted */}
                                                        {group.totalLiters > 0 && (
                                                            <div style={{
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: '0.35rem',
                                                                padding: '0.4rem 0.75rem',
                                                                borderRadius: 'var(--radius-sm)',
                                                                background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.2) 0%, rgba(96, 165, 250, 0.15) 100%)',
                                                                border: '1px solid rgba(59, 130, 246, 0.4)',
                                                            }}>
                                                                <span style={{ fontSize: '1rem' }}>💧</span>
                                                                <span style={{
                                                                    fontSize: '1rem',
                                                                    fontWeight: '700',
                                                                    color: '#3b82f6',
                                                                }}>
                                                                    {group.totalLiters.toLocaleString(undefined, { maximumFractionDigits: 1 })} L
                                                                </span>
                                                            </div>
                                                        )}
                                                        {group.totalKg > 0 && (
                                                            <div style={{
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: '0.35rem',
                                                                padding: '0.4rem 0.75rem',
                                                                borderRadius: 'var(--radius-sm)',
                                                                background: 'linear-gradient(135deg, rgba(236, 72, 153, 0.2) 0%, rgba(244, 114, 182, 0.15) 100%)',
                                                                border: '1px solid rgba(236, 72, 153, 0.4)',
                                                            }}>
                                                                <span style={{ fontSize: '1rem' }}>⚖️</span>
                                                                <span style={{
                                                                    fontSize: '1rem',
                                                                    fontWeight: '700',
                                                                    color: '#ec4899',
                                                                }}>
                                                                    {group.totalKg.toLocaleString(undefined, { maximumFractionDigits: 1 })} Kg
                                                                </span>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Expanded Details - Individual Batch Rows */}
                                                    {expandedItemCodes.has(group.itemCode) && (
                                                        <div style={{
                                                            background: 'rgba(139, 92, 246, 0.03)',
                                                            borderBottom: '2px solid #8b5cf6',
                                                        }}>
                                                            <div style={{ overflowX: 'auto' }}>
                                                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                                                    <thead>
                                                                        <tr style={{ background: 'rgba(139, 92, 246, 0.1)' }}>
                                                                            <th style={thStyle}>#</th>
                                                                            <th style={thStyle}>Type</th>
                                                                            <th style={thStyle}>Batch No</th>
                                                                            <th style={thStyle}>UOM</th>
                                                                            <th style={thStyle}>Batch Size</th>
                                                                            <th style={thStyle}>Pack</th>
                                                                            <th style={thStyle}>Unit</th>
                                                                            <th style={thStyle}>Mfg Date</th>
                                                                            <th style={thStyle}>Exp Date</th>
                                                                            <th style={thStyle}>MRP</th>
                                                                            <th style={thStyle}>Conversion</th>
                                                                            <th style={thStyle}>Dept</th>
                                                                            <th style={thStyle}>Lic No</th>
                                                                            <th style={thStyle}>Loc ID</th>
                                                                            <th style={thStyle}>Year</th>
                                                                            <th style={thStyle}>Make</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody>
                                                                        {group.items.map((item, index) => (
                                                                            <tr
                                                                                key={`${item.sourceFileId}-${item.batchNumber}-${index}`}
                                                                                style={{
                                                                                    background: index % 2 === 0 ? 'transparent' : 'rgba(139, 92, 246, 0.05)',
                                                                                }}
                                                                            >
                                                                                <td style={tdStyle}>{item.srNo}</td>
                                                                                <td style={tdStyle}>
                                                                                    <span style={{
                                                                                        padding: '0.25rem 0.5rem',
                                                                                        borderRadius: 'var(--radius-sm)',
                                                                                        fontSize: '0.7rem',
                                                                                        fontWeight: '600',
                                                                                        background: item.type === 'Export'
                                                                                            ? 'rgba(16, 185, 129, 0.1)'
                                                                                            : 'rgba(59, 130, 246, 0.1)',
                                                                                        color: item.type === 'Export' ? '#10b981' : '#3b82f6',
                                                                                    }}>
                                                                                        {item.type}
                                                                                    </span>
                                                                                </td>
                                                                                <td style={{ ...tdStyle, fontFamily: 'monospace' }}>{item.batchNumber}</td>
                                                                                <td style={tdStyle}>{item.batchUom}</td>
                                                                                <td style={{ ...tdStyle, textAlign: 'right' }}>{item.batchSize}</td>
                                                                                <td style={tdStyle}>{item.pack}</td>
                                                                                <td style={tdStyle}>{item.unit}</td>
                                                                                <td style={tdStyle}>{item.mfgDate}</td>
                                                                                <td style={tdStyle}>{item.expiryDate}</td>
                                                                                <td style={{ ...tdStyle, textAlign: 'right' }}>
                                                                                    {item.mrpValue || <span style={{ color: 'var(--muted-foreground)' }}>—</span>}
                                                                                </td>
                                                                                <td style={tdStyle}>{item.conversionRatio}</td>
                                                                                <td style={{ ...tdStyle, maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                                    {item.department}
                                                                                </td>
                                                                                <td style={{ ...tdStyle, maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '0.7rem' }}>
                                                                                    {item.mfgLicNo}
                                                                                </td>
                                                                                <td style={{ ...tdStyle, textAlign: 'center' }}>{item.locationId}</td>
                                                                                <td style={tdStyle}>{item.year}</td>
                                                                                <td style={tdStyle}>{item.make}</td>
                                                                            </tr>
                                                                        ))}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        )}

                        {!selectedYear && yearSummaries.length > 0 && (
                            <div style={{
                                textAlign: 'center',
                                padding: '3rem',
                                color: 'var(--muted-foreground)',
                            }}>
                                <p style={{ fontSize: '1.125rem' }}>👆 Click on a year card above to view detailed breakdown</p>
                            </div>
                        )}

                        {yearSummaries.length === 0 && (
                            <div style={{
                                textAlign: 'center',
                                padding: '4rem',
                                color: 'var(--muted-foreground)',
                            }}>
                                <p style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>No batch data available</p>
                                <p>Upload batch XML files to see the dashboard</p>
                            </div>
                        )}
                    </>
                )}
            </main>
        </div>
    );
}
