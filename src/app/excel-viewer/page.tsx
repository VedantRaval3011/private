'use client';

import { useEffect, useMemo, useState } from 'react';
import styles from './page.module.css';

type ExcelFileInfo = { name: string; size: number; modifiedAt: string };
type PreviewPayload = {
  file: string;
  sheets: string[];
  activeSheet: string;
  columns: string[];
  rows: Array<Record<string, unknown> & { __rowId: number }>;
};

type ColumnKind = 'text' | 'number' | 'date';
type SortDir = 'asc' | 'desc' | null;

type TextFilter = { kind: 'text'; mode: 'contains' | 'equals'; value: string };
type NumberFilter = { kind: 'number'; min: string; max: string };
type DateFilter = { kind: 'date'; from: string; to: string };
type ColumnFilter = TextFilter | NumberFilter | DateFilter;

function toDisplay(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

function tryParseNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const s = toDisplay(v).trim();
  if (!s) return null;
  // avoid treating codes like "00123" as numbers unless they clearly contain decimals
  if (/^0\d+$/.test(s)) return null;
  const n = Number(s.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function tryParseDate(v: unknown): Date | null {
  if (v instanceof Date && !isNaN(v.getTime())) return v;
  const s = toDisplay(v).trim();
  if (!s) return null;

  // dd-mm-yyyy / dd/mm/yyyy / dd-mm-yy
  const m1 = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (m1) {
    const dd = parseInt(m1[1], 10);
    const mm = parseInt(m1[2], 10);
    let yy = parseInt(m1[3], 10);
    if (yy < 100) yy += yy >= 50 ? 1900 : 2000;
    const d = new Date(yy, mm - 1, dd);
    if (!isNaN(d.getTime())) return d;
  }

  const d2 = new Date(s);
  if (!isNaN(d2.getTime())) return d2;
  return null;
}

function inferColumnKind(rows: PreviewPayload['rows'], col: string): ColumnKind {
  const sample = rows.slice(0, 50).map(r => r[col]).filter(v => toDisplay(v).trim() !== '');
  if (sample.length === 0) return 'text';

  let num = 0;
  let date = 0;
  for (const v of sample) {
    if (tryParseNumber(v) !== null) num++;
    if (tryParseDate(v) !== null) date++;
  }
  // Prefer date only if strong signal; otherwise number; else text.
  if (date / sample.length >= 0.75) return 'date';
  if (num / sample.length >= 0.75) return 'number';
  return 'text';
}

function rowMatchesGlobal(row: Record<string, unknown>, columns: string[], q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  for (const c of columns) {
    const v = toDisplay(row[c]).toLowerCase();
    if (v.includes(needle)) return true;
  }
  return false;
}

function rowMatchesColumnFilter(row: Record<string, unknown>, col: string, f: ColumnFilter | undefined): boolean {
  if (!f) return true;
  if (f.kind === 'text') {
    const val = toDisplay(row[col]).trim();
    const needle = f.value.trim();
    if (!needle) return true;
    if (f.mode === 'equals') return val.toLowerCase() === needle.toLowerCase();
    return val.toLowerCase().includes(needle.toLowerCase());
  }
  if (f.kind === 'number') {
    const n = tryParseNumber(row[col]);
    if (n === null) return false;
    const min = f.min.trim() ? Number(f.min) : null;
    const max = f.max.trim() ? Number(f.max) : null;
    if (min !== null && Number.isFinite(min) && n < min) return false;
    if (max !== null && Number.isFinite(max) && n > max) return false;
    return true;
  }
  // date
  const d = tryParseDate(row[col]);
  if (!d) return false;
  const from = f.from ? new Date(f.from) : null;
  const to = f.to ? new Date(f.to) : null;
  if (from && !isNaN(from.getTime()) && d < from) return false;
  if (to && !isNaN(to.getTime()) && d > to) return false;
  return true;
}

export default function ExcelViewerPage() {
  const [files, setFiles] = useState<ExcelFileInfo[]>([]);
  const [selectedFile, setSelectedFile] = useState<string>('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [preview, setPreview] = useState<PreviewPayload | null>(null);
  const [sheet, setSheet] = useState<string>('');

  const [globalQuery, setGlobalQuery] = useState('');
  const [showFilters, setShowFilters] = useState(true);
  const [columnKinds, setColumnKinds] = useState<Record<string, ColumnKind>>({});
  const [filters, setFilters] = useState<Record<string, ColumnFilter | undefined>>({});

  const [sortBy, setSortBy] = useState<string>('');
  const [sortDir, setSortDir] = useState<SortDir>(null);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Load file list once
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setError(null);
        const res = await fetch('/api/excel/files');
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'Failed to load excel files');
        if (cancelled) return;
        setFiles(data.files || []);
        const first = (data.files?.[0]?.name as string | undefined) ?? '';
        setSelectedFile(first);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Failed to load excel files');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load preview when file/sheet changes
  useEffect(() => {
    if (!selectedFile) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ file: selectedFile });
        if (sheet) params.set('sheet', sheet);
        const res = await fetch(`/api/excel/preview?${params.toString()}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'Failed to load workbook');
        if (cancelled) return;
        setPreview(data);
        setSheet(data.activeSheet);

        // Infer column kinds and initialize default filters
        const kinds: Record<string, ColumnKind> = {};
        const nextFilters: Record<string, ColumnFilter | undefined> = {};
        for (const c of data.columns || []) {
          const k = inferColumnKind(data.rows || [], c);
          kinds[c] = k;
          if (!filters[c]) {
            nextFilters[c] =
              k === 'number'
                ? ({ kind: 'number', min: '', max: '' } as NumberFilter)
                : k === 'date'
                  ? ({ kind: 'date', from: '', to: '' } as DateFilter)
                  : ({ kind: 'text', mode: 'contains', value: '' } as TextFilter);
          } else {
            nextFilters[c] = filters[c];
          }
        }
        setColumnKinds(kinds);
        setFilters(nextFilters);

        // Reset sort if column no longer exists
        if (sortBy && !(data.columns || []).includes(sortBy)) {
          setSortBy('');
          setSortDir(null);
        }
        setPage(1);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Failed to load workbook');
        setPreview(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFile, sheet]);

  const filteredSorted = useMemo(() => {
    if (!preview) return [];
    const cols = preview.columns || [];

    // filter
    let out = preview.rows.filter(r => {
      if (!rowMatchesGlobal(r, cols, globalQuery)) return false;
      for (const c of cols) {
        if (!rowMatchesColumnFilter(r, c, filters[c])) return false;
      }
      return true;
    });

    // sort
    if (sortBy && sortDir) {
      const k = columnKinds[sortBy] ?? 'text';
      out = [...out].sort((a, b) => {
        const av = a[sortBy];
        const bv = b[sortBy];
        let cmp = 0;
        if (k === 'number') {
          const an = tryParseNumber(av);
          const bn = tryParseNumber(bv);
          cmp = (an ?? Number.NEGATIVE_INFINITY) - (bn ?? Number.NEGATIVE_INFINITY);
        } else if (k === 'date') {
          const ad = tryParseDate(av)?.getTime() ?? 0;
          const bd = tryParseDate(bv)?.getTime() ?? 0;
          cmp = ad - bd;
        } else {
          cmp = toDisplay(av).localeCompare(toDisplay(bv), undefined, { numeric: true, sensitivity: 'base' });
        }
        return sortDir === 'asc' ? cmp : -cmp;
      });
    }

    return out;
  }, [preview, globalQuery, filters, sortBy, sortDir, columnKinds]);

  const pageCount = useMemo(() => {
    return Math.max(1, Math.ceil(filteredSorted.length / pageSize));
  }, [filteredSorted.length, pageSize]);

  const paged = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredSorted.slice(start, start + pageSize);
  }, [filteredSorted, page, pageSize]);

  const badgeText = useMemo(() => {
    if (!preview) return '';
    return `File: ${preview.file} / Sheet: ${preview.activeSheet} / Rows: ${preview.rows.length.toLocaleString()}`;
  }, [preview]);

  const columns = preview?.columns || [];

  function toggleSort(col: string) {
    if (sortBy !== col) {
      setSortBy(col);
      setSortDir('asc');
      return;
    }
    if (sortDir === 'asc') setSortDir('desc');
    else if (sortDir === 'desc') {
      setSortDir(null);
      setSortBy('');
    } else setSortDir('asc');
  }

  function resetFilters() {
    if (!preview) return;
    setGlobalQuery('');
    const next: Record<string, ColumnFilter | undefined> = {};
    for (const c of preview.columns) {
      const k = columnKinds[c] ?? 'text';
      next[c] =
        k === 'number'
          ? ({ kind: 'number', min: '', max: '' } as NumberFilter)
          : k === 'date'
            ? ({ kind: 'date', from: '', to: '' } as DateFilter)
            : ({ kind: 'text', mode: 'contains', value: '' } as TextFilter);
    }
    setFilters(next);
    setPage(1);
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div>
            <div className={styles.title}>Excel Viewer</div>
            <div className={styles.subtitle}>Browse Excel files in the server `excel/` folder</div>
          </div>
          {preview && <span className={styles.pill}>{badgeText}</span>}
        </div>
      </header>

      <main className={styles.main}>
        <div className={styles.controls}>
          <div className={styles.field} style={{ gridColumn: 'span 4' }}>
            <div className={styles.label}>File</div>
            <select
              className={styles.select}
              value={selectedFile}
              onChange={(e) => {
                setSelectedFile(e.target.value);
                setSheet('');
                setPage(1);
              }}
            >
              {files.map(f => (
                <option key={f.name} value={f.name}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.field} style={{ gridColumn: 'span 3' }}>
            <div className={styles.label}>Sheet</div>
            <select
              className={styles.select}
              value={sheet}
              onChange={(e) => {
                setSheet(e.target.value);
                setPage(1);
              }}
              disabled={!preview}
            >
              {(preview?.sheets || []).map(s => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.field} style={{ gridColumn: 'span 3' }}>
            <div className={styles.label}>Global search</div>
            <input
              className={styles.input}
              placeholder="Search across all columns..."
              value={globalQuery}
              onChange={(e) => {
                setGlobalQuery(e.target.value);
                setPage(1);
              }}
            />
          </div>

          <div className={styles.field} style={{ gridColumn: 'span 2' }}>
            <div className={styles.label}>Actions</div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button className={styles.btn} type="button" onClick={() => setShowFilters(v => !v)}>
                {showFilters ? 'Hide filters' : 'Show filters'}
              </button>
              <button className={styles.btn} type="button" onClick={resetFilters} disabled={!preview}>
                Reset
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className={styles.filtersPanel} style={{ borderColor: 'rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.06)' }}>
            <div style={{ fontWeight: 700, marginBottom: '0.25rem' }}>Error</div>
            <div className={styles.muted}>{error}</div>
          </div>
        )}

        {showFilters && preview && columns.length > 0 && (
          <div className={styles.filtersPanel}>
            <div className={styles.muted} style={{ marginBottom: '0.5rem' }}>
              Column filters (auto-detected type: text/number/date)
            </div>
            <div className={styles.filtersGrid}>
              {columns.map((c) => {
                const k = columnKinds[c] ?? 'text';
                const f = filters[c];
                return (
                  <div key={c} className={styles.field}>
                    <div className={styles.label}>{c}</div>
                    {k === 'text' && f?.kind === 'text' && (
                      <div className={styles.filterRow}>
                        <input
                          className={styles.miniInput}
                          value={f.value}
                          onChange={(e) => {
                            setFilters(prev => ({ ...prev, [c]: { ...f, value: e.target.value } }));
                            setPage(1);
                          }}
                          placeholder="Type…"
                        />
                      </div>
                    )}
                    {k === 'number' && f?.kind === 'number' && (
                      <div className={styles.filterRow}>
                        <input
                          className={styles.miniInput}
                          value={f.min}
                          onChange={(e) => {
                            setFilters(prev => ({ ...prev, [c]: { ...f, min: e.target.value } }));
                            setPage(1);
                          }}
                          placeholder="min"
                        />
                        <input
                          className={styles.miniInput}
                          value={f.max}
                          onChange={(e) => {
                            setFilters(prev => ({ ...prev, [c]: { ...f, max: e.target.value } }));
                            setPage(1);
                          }}
                          placeholder="max"
                        />
                      </div>
                    )}
                    {k === 'date' && f?.kind === 'date' && (
                      <div className={styles.filterRow}>
                        <input
                          className={styles.miniInput}
                          type="date"
                          value={f.from}
                          onChange={(e) => {
                            setFilters(prev => ({ ...prev, [c]: { ...f, from: e.target.value } }));
                            setPage(1);
                          }}
                        />
                        <input
                          className={styles.miniInput}
                          type="date"
                          value={f.to}
                          onChange={(e) => {
                            setFilters(prev => ({ ...prev, [c]: { ...f, to: e.target.value } }));
                            setPage(1);
                          }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className={styles.tableWrap}>
          <div className={styles.tableHeader}>
            <div className={styles.muted}>
              {loading ? 'Loading…' : `Showing ${filteredSorted.length.toLocaleString()} result(s)`}
              {sortBy && sortDir && ` • Sorted by ${sortBy} (${sortDir})`}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
              <span className={styles.muted}>Page size</span>
              <select
                className={styles.miniSelect}
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
              >
                {[10, 25, 50, 100].map(n => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
          </div>

          {!preview || columns.length === 0 ? (
            <div className={styles.empty}>Select a file to view its data.</div>
          ) : filteredSorted.length === 0 ? (
            <div className={styles.empty}>No rows match your filters.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    {columns.map((c) => {
                      const active = sortBy === c ? sortDir : null;
                      return (
                        <th
                          key={c}
                          className={styles.th}
                          onClick={() => toggleSort(c)}
                          title="Click to sort (asc/desc/off)"
                        >
                          {c}
                          {active === 'asc' ? ' ▲' : active === 'desc' ? ' ▼' : ''}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {paged.map((r) => (
                    <tr key={r.__rowId} className={styles.row}>
                      {columns.map((c) => (
                        <td key={c} className={styles.td} title={toDisplay(r[c])}>
                          {toDisplay(r[c])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {preview && filteredSorted.length > 0 && (
            <div className={styles.pager}>
              <div className={styles.muted}>
                Page {page} of {pageCount}
              </div>
              <div className={styles.pagerBtns}>
                <button className={styles.btn} type="button" onClick={() => setPage(1)} disabled={page <= 1}>
                  First
                </button>
                <button className={styles.btn} type="button" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>
                  Prev
                </button>
                <button className={styles.btn} type="button" onClick={() => setPage(p => Math.min(pageCount, p + 1))} disabled={page >= pageCount}>
                  Next
                </button>
                <button className={styles.btn} type="button" onClick={() => setPage(pageCount)} disabled={page >= pageCount}>
                  Last
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

