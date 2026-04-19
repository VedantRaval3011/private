'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import styles from './page.module.css';

// ── Sort types ────────────────────────────────────────────────────────────────

type SortKey = 'action' | 'mfcNo' | 'productName' | 'batchNumber' | 'itemCode' | 'month' | 'pH' | 'description' | 'actor' | 'timestamp';
type SortDir = 'asc' | 'desc';

// ── Types ─────────────────────────────────────────────────────────────────────

interface PhValue {
  label: string;
  value: string;
}

interface Actor {
  name: string;
  username: string;
}

interface AuditEvent {
  id: string;
  mfcNo: string;
  productCode: string;
  productName: string;
  batchNumber: string;
  itemCode: string;
  month: number;
  action: 'created' | 'edited';
  pH: string;
  phValues: PhValue[];
  description: string;
  timestamp: string;
  actor?: Actor;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTimestamp(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function formatDateOnly(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function displayPhValues(ph: string, phValues: PhValue[]): string {
  if (phValues && phValues.length > 0) {
    return phValues.map((p) => (p.label ? `${p.label}: ${p.value}` : p.value)).filter((s) => s.trim()).join(' | ');
  }
  return ph || '—';
}

function getActorDisplay(actor?: Actor): string {
  if (!actor) return 'System';
  return actor.name || actor.username || 'Unknown';
}

// ── Sort helpers ──────────────────────────────────────────────────────────────

function getSortValue(event: AuditEvent, key: SortKey): string | number {
  switch (key) {
    case 'action':      return event.action;
    case 'mfcNo':       return event.mfcNo;
    case 'productName': return event.productName || '';
    case 'batchNumber': return event.batchNumber;
    case 'itemCode':    return event.itemCode || '';
    case 'month':       return event.month;
    case 'pH':          return displayPhValues(event.pH, event.phValues);
    case 'description': return event.description || '';
    case 'actor':       return getActorDisplay(event.actor);
    case 'timestamp':   return event.timestamp || '';
  }
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  return (
    <span className={styles.sortIcon} aria-hidden>
      <svg width="8" height="12" viewBox="0 0 8 12" fill="currentColor">
        <path
          d="M4 0L7.4641 4.5H0.535898L4 0Z"
          className={active && dir === 'asc' ? styles.sortArrowActive : styles.sortArrow}
        />
        <path
          d="M4 12L0.535898 7.5H7.4641L4 12Z"
          className={active && dir === 'desc' ? styles.sortArrowActive : styles.sortArrow}
        />
      </svg>
    </span>
  );
}

// ── Stats Bar ─────────────────────────────────────────────────────────────────

function StatsBar({ events }: { events: AuditEvent[] }) {
  const created = events.filter((e) => e.action === 'created').length;
  const edited  = events.filter((e) => e.action === 'edited').length;
  const uniqueMfcs    = new Set(events.map((e) => e.mfcNo)).size;
  const uniqueBatches = new Set(events.map((e) => e.batchNumber)).size;
  const uniqueActors  = new Set(events.map((e) => e.actor?.username || 'system')).size;

  return (
    <div className={styles.statsBar}>
      <div className={styles.statCard}>
        <span className={styles.statValue}>{events.length}</span>
        <span className={styles.statLabel}>Total Events</span>
      </div>
      <div className={`${styles.statCard} ${styles.statCreated}`}>
        <span className={styles.statValue}>{created}</span>
        <span className={styles.statLabel}>Created</span>
      </div>
      <div className={`${styles.statCard} ${styles.statEdited}`}>
        <span className={styles.statValue}>{edited}</span>
        <span className={styles.statLabel}>Edited</span>
      </div>
      <div className={styles.statCard}>
        <span className={styles.statValue}>{uniqueMfcs}</span>
        <span className={styles.statLabel}>MFCs</span>
      </div>
      <div className={styles.statCard}>
        <span className={styles.statValue}>{uniqueBatches}</span>
        <span className={styles.statLabel}>Batches</span>
      </div>
      <div className={styles.statCard}>
        <span className={styles.statValue}>{uniqueActors}</span>
        <span className={styles.statLabel}>Users</span>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const MONTHS = [6, 12, 18, 24, 30, 36] as const;

export default function RetainedSampleAuditLogsPage() {
  const [allEvents, setAllEvents]   = useState<AuditEvent[]>([]);
  const [isLoading, setIsLoading]   = useState(true);
  const [error, setError]           = useState<string | null>(null);

  // ── Filters ──────────────────────────────────────────────
  const [searchMfc,    setSearchMfc]    = useState('');
  const [searchBatch,  setSearchBatch]  = useState('');
  const [searchActor,  setSearchActor]  = useState('');
  const [filterMonth,  setFilterMonth]  = useState<string>('');
  const [filterAction, setFilterAction] = useState<string>('');
  const [filterFrom,   setFilterFrom]   = useState('');
  const [filterTo,     setFilterTo]     = useState('');

  // ── Sort ─────────────────────────────────────────────────
  const [sortKey, setSortKey] = useState<SortKey | null>('timestamp');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  // ── Expanded rows ─────────────────────────────────────────
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const fetchLogs = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res  = await fetch('/api/retained-sample/audit-logs');
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to load');
      setAllEvents(json.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  // ── Client-side filtering ─────────────────────────────────
  const filtered = useMemo(() => {
    return allEvents.filter((e) => {
      if (searchMfc   && !e.mfcNo.toLowerCase().includes(searchMfc.toLowerCase()))              return false;
      if (searchBatch && !e.batchNumber.toLowerCase().includes(searchBatch.toLowerCase()))      return false;
      if (searchActor && !(
        e.actor?.name?.toLowerCase().includes(searchActor.toLowerCase()) ||
        e.actor?.username?.toLowerCase().includes(searchActor.toLowerCase())
      )) return false;
      if (filterMonth  && e.month !== Number(filterMonth))  return false;
      if (filterAction && e.action !== filterAction)        return false;
      if (filterFrom && e.timestamp && new Date(e.timestamp) < new Date(filterFrom))            return false;
      if (filterTo   && e.timestamp && new Date(e.timestamp) > new Date(filterTo + 'T23:59:59')) return false;
      return true;
    });
  }, [allEvents, searchMfc, searchBatch, searchActor, filterMonth, filterAction, filterFrom, filterTo]);

  // ── Client-side sorting ───────────────────────────────────
  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    return [...filtered].sort((a, b) => {
      const av = getSortValue(a, sortKey);
      const bv = getSortValue(b, sortKey);
      let cmp = 0;
      if (typeof av === 'number' && typeof bv === 'number') {
        cmp = av - bv;
      } else {
        cmp = String(av).localeCompare(String(bv));
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  const hasFilters = searchMfc || searchBatch || searchActor || filterMonth || filterAction || filterFrom || filterTo;

  function clearFilters() {
    setSearchMfc('');
    setSearchBatch('');
    setSearchActor('');
    setFilterMonth('');
    setFilterAction('');
    setFilterFrom('');
    setFilterTo('');
  }

  function toggleRow(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // ── Render ────────────────────────────────────────────────

  return (
    <div className={styles.page}>

      {/* ── Header ── */}
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.headerLeft}>
            <Link href="/retained-sample" className={styles.backBtn}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              Retained Sample
            </Link>
            <div>
              <h1 className={styles.headerTitle}>Audit Logs — Retained Sample</h1>
              <p className={styles.headerSubtitle}>Full history of all stability entries: who created or edited what, for which MFC &amp; batch</p>
            </div>
          </div>
          <button
            className={styles.refreshBtn}
            onClick={fetchLogs}
            disabled={isLoading}
          >
            {isLoading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </header>

      <div className={styles.body}>

        {/* ── Stats bar ── */}
        {!isLoading && !error && <StatsBar events={filtered} />}

        {/* ── Filters ── */}
        <div className={styles.filtersPanel}>
          <div className={styles.filtersRow}>
            {/* MFC search */}
            <div className={styles.filterGroup}>
              <label className={styles.filterLabel}>MFC No.</label>
              <input
                type="text"
                className={styles.filterInput}
                placeholder="e.g. MFC001"
                value={searchMfc}
                onChange={(e) => setSearchMfc(e.target.value)}
              />
            </div>

            {/* Batch search */}
            <div className={styles.filterGroup}>
              <label className={styles.filterLabel}>Batch No.</label>
              <input
                type="text"
                className={styles.filterInput}
                placeholder="e.g. B2401"
                value={searchBatch}
                onChange={(e) => setSearchBatch(e.target.value)}
              />
            </div>

            {/* Actor search */}
            <div className={styles.filterGroup}>
              <label className={styles.filterLabel}>User</label>
              <input
                type="text"
                className={styles.filterInput}
                placeholder="Name or username"
                value={searchActor}
                onChange={(e) => setSearchActor(e.target.value)}
              />
            </div>

            {/* Month filter */}
            <div className={styles.filterGroup}>
              <label className={styles.filterLabel}>Month</label>
              <select
                className={styles.filterSelect}
                value={filterMonth}
                onChange={(e) => setFilterMonth(e.target.value)}
              >
                <option value="">All months</option>
                {MONTHS.map((m) => (
                  <option key={m} value={m}>{m} months</option>
                ))}
              </select>
            </div>

            {/* Action filter */}
            <div className={styles.filterGroup}>
              <label className={styles.filterLabel}>Action</label>
              <select
                className={styles.filterSelect}
                value={filterAction}
                onChange={(e) => setFilterAction(e.target.value)}
              >
                <option value="">All actions</option>
                <option value="created">Created</option>
                <option value="edited">Edited</option>
              </select>
            </div>

            {/* Date range */}
            <div className={styles.filterGroup}>
              <label className={styles.filterLabel}>From</label>
              <input
                type="date"
                className={styles.filterInput}
                value={filterFrom}
                onChange={(e) => setFilterFrom(e.target.value)}
              />
            </div>
            <div className={styles.filterGroup}>
              <label className={styles.filterLabel}>To</label>
              <input
                type="date"
                className={styles.filterInput}
                value={filterTo}
                onChange={(e) => setFilterTo(e.target.value)}
              />
            </div>

            {hasFilters && (
              <div className={styles.filterGroup} style={{ justifyContent: 'flex-end', alignSelf: 'flex-end' }}>
                <button className={styles.clearBtn} onClick={clearFilters}>
                  Clear filters
                </button>
              </div>
            )}
          </div>

          {!isLoading && (
            <p className={styles.resultCount}>
              Showing <strong>{filtered.length}</strong> of <strong>{allEvents.length}</strong> events
            </p>
          )}
        </div>

        {/* ── Content ── */}
        {isLoading ? (
          <div className={styles.loadingState}>
            <div className={styles.spinner} />
            <p>Loading audit logs…</p>
          </div>
        ) : error ? (
          <div className={styles.errorState}>
            <p>{error}</p>
            <button onClick={fetchLogs} className={styles.retryBtn}>Retry</button>
          </div>
        ) : filtered.length === 0 ? (
          <div className={styles.emptyState}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity=".35">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
            <p>No audit events found{hasFilters ? ' matching your filters' : ''}.</p>
          </div>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  {(
                    [
                      ['action',      'thAction',  'Action'],
                      ['mfcNo',       'thMfc',     'MFC No.'],
                      ['productName', 'thProduct', 'Product'],
                      ['batchNumber', 'thBatch',   'Batch No.'],
                      ['itemCode',    'thItem',    'Item Code'],
                      ['month',       'thMonth',   'Month'],
                      ['pH',          'thPh',      'pH / Values'],
                      ['description', 'thDesc',    'Description'],
                      ['actor',       'thUser',    'Done By'],
                      ['timestamp',   'thTime',    'Timestamp'],
                    ] as [SortKey, string, string][]
                  ).map(([key, thClass, label]) => (
                    <th key={key} className={styles[thClass as keyof typeof styles]}>
                      <button
                        className={`${styles.thBtn} ${sortKey === key ? styles.thBtnActive : ''}`}
                        onClick={() => handleSort(key)}
                        title={`Sort by ${label}`}
                      >
                        {label}
                        <SortIcon active={sortKey === key} dir={sortDir} />
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((event) => {
                  const isExpanded = expandedIds.has(event.id);
                  const phDisplay  = displayPhValues(event.pH, event.phValues);

                  return (
                    <tr
                      key={event.id}
                      className={`${styles.row} ${isExpanded ? styles.rowExpanded : ''}`}
                      onClick={() => toggleRow(event.id)}
                      title="Click to expand details"
                    >
                      {/* Action badge */}
                      <td className={styles.tdAction}>
                        <span className={`${styles.actionBadge} ${event.action === 'created' ? styles.badgeCreated : styles.badgeEdited}`}>
                          {event.action === 'created' ? 'Created' : 'Edited'}
                        </span>
                      </td>

                      {/* MFC */}
                      <td className={styles.tdMfc}>
                        <span className={styles.mfcTag}>{event.mfcNo}</span>
                      </td>

                      {/* Product */}
                      <td className={styles.tdProduct}>
                        <span className={styles.productName}>{event.productName || '—'}</span>
                        {event.productCode && (
                          <span className={styles.productCode}>{event.productCode}</span>
                        )}
                      </td>

                      {/* Batch */}
                      <td className={styles.tdBatch}>
                        <code className={styles.code}>{event.batchNumber}</code>
                      </td>

                      {/* Item code */}
                      <td className={styles.tdItem}>
                        {event.itemCode ? <code className={styles.code}>{event.itemCode}</code> : <span className={styles.muted}>—</span>}
                      </td>

                      {/* Month */}
                      <td className={styles.tdMonth}>
                        <span className={styles.monthBadge}>{event.month}M</span>
                      </td>

                      {/* pH */}
                      <td className={styles.tdPh}>
                        {phDisplay !== '—' ? (
                          <span className={styles.phValue}>{phDisplay}</span>
                        ) : (
                          <span className={styles.muted}>—</span>
                        )}
                      </td>

                      {/* Description */}
                      <td className={styles.tdDesc}>
                        {event.description ? (
                          <span className={styles.descText} title={event.description}>
                            {isExpanded ? event.description : (event.description.length > 60 ? event.description.slice(0, 60) + '…' : event.description)}
                          </span>
                        ) : (
                          <span className={styles.muted}>—</span>
                        )}
                      </td>

                      {/* Actor */}
                      <td className={styles.tdUser}>
                        <div className={styles.actorCell}>
                          <span className={styles.actorAvatar}>
                            {getActorDisplay(event.actor).charAt(0).toUpperCase()}
                          </span>
                          <div>
                            <span className={styles.actorName}>{getActorDisplay(event.actor)}</span>
                            {event.actor?.username && event.actor.username !== getActorDisplay(event.actor) && (
                              <span className={styles.actorUsername}>@{event.actor.username}</span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Timestamp */}
                      <td className={styles.tdTime}>
                        <span className={styles.timestamp}>{formatTimestamp(event.timestamp)}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
