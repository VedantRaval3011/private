'use client';

import { useState, useEffect, useMemo } from 'react';
import styles from './page.module.css';
import type { MFCGroup, BatchStabilityRow, StabilityEntry, PhValue } from '@/types/retained-sample';

const STABILITY_MONTHS = [6, 12, 18, 24, 30, 36] as const;
type StabilityMonth = (typeof STABILITY_MONTHS)[number];
type IntervalStatus = 'completed' | 'overdue' | 'due-this-month' | 'future';

// ── Date utilities ────────────────────────────────────────
const MON_MAP: Record<string, number> = {
  JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
  JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
};

function parseMfgDate(raw: string): Date | null {
  if (!raw) return null;
  const m = raw.trim().match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/);
  if (m) {
    const day = parseInt(m[1], 10);
    const mon = MON_MAP[m[2].toUpperCase()];
    if (mon === undefined) return null;
    let yr = parseInt(m[3], 10);
    if (yr < 100) yr += yr >= 50 ? 1900 : 2000;
    return new Date(yr, mon, day);
  }
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

function monthsElapsedAsOf(mfgDate: Date, refDate: Date): number {
  let months =
    (refDate.getFullYear() - mfgDate.getFullYear()) * 12 +
    (refDate.getMonth() - mfgDate.getMonth());
  if (refDate.getDate() < mfgDate.getDate()) months--;
  return Math.max(0, months);
}

function dueDate(mfgDate: Date, stabilityMonth: number): Date {
  const d = new Date(mfgDate);
  d.setMonth(d.getMonth() + stabilityMonth);
  return d;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatMonthLabel(month: number, year: number): string {
  return `${String(month).padStart(2, '0')}/${String(year).slice(2)}`;
}

function getMaxShelfLife(groups: MFCGroup[]): number {
  let max = 24;
  for (const g of groups) {
    const sl = parseInt(g.shelfLife);
    if (!isNaN(sl) && sl > max) max = sl;
  }
  return Math.min(max, 48);
}

function generateTimelineMonths(maxMonths: number): Array<{ month: number; year: number }> {
  const today = new Date();
  const result: Array<{ month: number; year: number }> = [];
  for (let i = 0; i < maxMonths; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    result.push({ month: d.getMonth() + 1, year: d.getFullYear() });
  }
  return result;
}

function getIntervalStatus(
  mfgDate: Date,
  stabilityMonth: number,
  isFilled: boolean,
  _refDate: Date // Ignored to ensure statuses are based on real 'today' for compliance
): IntervalStatus {
  const dueD = dueDate(mfgDate, stabilityMonth);
  const now = new Date();
  const refYear = now.getFullYear();
  const refMon = now.getMonth();
  const dueYear = dueD.getFullYear();
  const dueMon = dueD.getMonth();

  const isDueFuture = dueYear > refYear || (dueYear === refYear && dueMon > refMon);
  const isDueThisMonth = dueYear === refYear && dueMon === refMon;

  if (isDueFuture) return 'future';
  if (isFilled) return 'completed';
  if (isDueThisMonth) return 'due-this-month';
  return 'overdue';
}

// ── pH limit validation ───────────────────────────────────
function parsePhLimit(limit: string): { min: number | null; max: number | null } {
  if (!limit) return { min: null, max: null };
  const s = limit.trim();
  // Range: "6.0 - 7.0", "6.0-7.0", or "6.0 to 7.0"
  const rangeMatch = s.match(/^(\d+(?:\.\d+)?)\s*(?:[-–]|to)\s*(\d+(?:\.\d+)?)$/i);
  if (rangeMatch) return { min: parseFloat(rangeMatch[1]), max: parseFloat(rangeMatch[2]) };
  // NMT (Not More Than)
  const nmtMatch = s.match(/^NMT\s*(\d+(?:\.\d+)?)/i);
  if (nmtMatch) return { min: null, max: parseFloat(nmtMatch[1]) };
  // NLT (Not Less Than)
  const nltMatch = s.match(/^NLT\s*(\d+(?:\.\d+)?)/i);
  if (nltMatch) return { min: parseFloat(nltMatch[1]), max: null };
  // ± tolerance: "6.5 ± 0.5"
  const pmMatch = s.match(/^(\d+(?:\.\d+)?)\s*[±]\s*(\d+(?:\.\d+)?)$/);
  if (pmMatch) {
    const center = parseFloat(pmMatch[1]);
    const tol = parseFloat(pmMatch[2]);
    return { min: center - tol, max: center + tol };
  }
  return { min: null, max: null };
}

function isPhOutOfRange(value: string, limit: string): boolean {
  if (!value || !limit) return false;
  const num = parseFloat(value);
  if (isNaN(num)) return false;
  const { min, max } = parsePhLimit(limit);
  if (min !== null && num < min) return true;
  if (max !== null && num > max) return true;
  return false;
}

// ── Global summary helpers ────────────────────────────────
function computeYearStats(
  groups: MFCGroup[],
  saved: EditState,
  year: number | null   // null = all years
): { fullyCompleted: number; pending: number; overdue: number; done: number } {
  let fullyCompleted = 0, pending = 0, overdue = 0, done = 0;
  const today = new Date();
  for (const group of groups) {
    const sl = parseInt(group.shelfLife);
    const requiredMonths = STABILITY_MONTHS.filter(m => isNaN(sl) || m <= sl);
    for (const batch of group.batches) {
      const mfgD = parseMfgDate(batch.mfgDate);
      if (year !== null) {
        if (!mfgD || mfgD.getFullYear() !== year) continue;
      }
      if (requiredMonths.length > 0 && requiredMonths.every(m =>
        cellIsFilled(saved[cellKey(batch.batchNumber, batch.itemCode, m)])
      )) fullyCompleted++;
      if (!mfgD) continue;
      for (const m of STABILITY_MONTHS) {
        const due = dueDate(mfgD, m);
        const dueYear = due.getFullYear();
        const dueMon  = due.getMonth(); // 0-indexed
        const todayYear = today.getFullYear();
        const todayMon  = today.getMonth(); // 0-indexed
        // Skip future intervals — they're scheduled, not actionable yet
        const isFuture = dueYear > todayYear || (dueYear === todayYear && dueMon > todayMon);
        if (isFuture) continue;

        const isFilled = cellIsFilled(saved[cellKey(batch.batchNumber, batch.itemCode, m)]);
        if (isFilled) {
          done++;
        } else {
          const isDueThisMonth = dueYear === todayYear && dueMon === todayMon;
          if (isDueThisMonth) pending++; // Due now, not yet filled
          else overdue++;               // Past deadline, not filled
        }
      }
    }
  }
  return { fullyCompleted, pending, overdue, done };
}

function computeMonthStats(
  groups: MFCGroup[],
  saved: EditState,
  refDate: Date,
  filterYear: number | null,
  filterMonth: number | null,
): { done: number; pending: number; overdue: number; fullyCompleted: number } {
  let done = 0, pending = 0, overdue = 0, fullyCompleted = 0;
  const today = new Date();
  const refYear = refDate.getFullYear();
  const refMon  = refDate.getMonth(); // 0-indexed

  for (const group of groups) {
    const sl = parseInt(group.shelfLife);
    const requiredMonths = STABILITY_MONTHS.filter(m => isNaN(sl) || m <= sl);
    for (const batch of group.batches) {
      const mfgD = parseMfgDate(batch.mfgDate);
      if (filterYear !== null) {
        if (!mfgD || mfgD.getFullYear() !== filterYear) continue;
      }
      if (requiredMonths.length > 0) {
        if (requiredMonths.every(m => cellIsFilled(saved[cellKey(batch.batchNumber, batch.itemCode, m)])))
          fullyCompleted++;
      }
      if (!mfgD) continue;
      for (const m of STABILITY_MONTHS) {
        const due = dueDate(mfgD, m);
        const key = cellKey(batch.batchNumber, batch.itemCode, m);
        const isFilled = cellIsFilled(saved[key]);

        if (filterMonth === null) {
          // All months: compare against real today — same semantics as Year Summary
          const dueYear = due.getFullYear();
          const dueMon  = due.getMonth();
          const todayYear = today.getFullYear();
          const todayMon  = today.getMonth();
          // Skip intervals not yet due; they're scheduled, not actionable
          const isFuture = dueYear > todayYear || (dueYear === todayYear && dueMon > todayMon);
          if (isFuture) continue;
          if (isFilled) done++;
          else if (dueYear === todayYear && dueMon === todayMon) pending++; // due this month
          else overdue++; // past due
        } else {
          // A specific month is selected — use it as the ceiling date.
          // Skip intervals that are not yet due as of the selected month.
          const dueYear = due.getFullYear();
          const dueMon  = due.getMonth(); // 0-indexed
          const isFuture = dueYear > refYear || (dueYear === refYear && dueMon > refMon);
          if (isFuture) continue;

          const isDueThisMonth = dueYear === refYear && dueMon === refMon;

          if (isFilled) {
            done++;
          } else if (isDueThisMonth) {
            // Due in the selected month, not yet filled → pending
            pending++;
          } else {
            // Due before the selected month and still not filled → overdue backlog
            overdue++;
          }
        }
      }
    }
  }
  return { done, pending, overdue, fullyCompleted };
}

interface CellEdit {
  phValues: Record<string, string>; // label → value  ('' label = single unlabelled pH)
  description: string;
}

function cellIsFilled(edit: CellEdit | undefined): boolean {
  if (!edit) return false;
  return Object.values(edit.phValues).some(Boolean) || !!edit.description;
}

// Convert stored PhValue[] → Record<string, string> for edit state
function phValuesToRecord(phValues: PhValue[]): Record<string, string> {
  const rec: Record<string, string> = {};
  for (const pv of phValues) rec[pv.label] = pv.value;
  return rec;
}

type EditState = Record<string, CellEdit>;
type SavingState = Record<string, boolean>;
type SaveStatusState = Record<string, 'saved' | 'error'>;

function cellKey(batchNumber: string, itemCode: string, month: number): string {
  return `${batchNumber}|${itemCode}:${month}`;
}

export default function RetainedSamplePage() {
  const [moreThan3, setMoreThan3] = useState<MFCGroup[]>([]);
  const [lessThan3, setLessThan3] = useState<MFCGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState>({});
  const [savedState, setSavedState] = useState<EditState>({}); // snapshot of last-saved values
  const [saving, setSaving] = useState<SavingState>({});
  const [saveStatus, setSaveStatus] = useState<SaveStatusState>({});
  const [expandedMFCs, setExpandedMFCs] = useState<Set<string>>(new Set());
  const [primaryOpen, setPrimaryOpen] = useState(true);
  const [secondaryOpen, setSecondaryOpen] = useState(true);
  const [unlockedCells, setUnlockedCells] = useState<Set<string>>(new Set());
  const [pwModal, setPwModal] = useState<{ cellKey: string } | null>(null);
  const [pwInput, setPwInput] = useState('');
  const [pwError, setPwError] = useState(false);
  type SortKey = 'mfc-asc' | 'mfc-desc' | 'batches-desc' | 'batches-asc' | 'intervals-desc' | 'intervals-asc' | 'shelf-life-desc' | 'shelf-life-asc';
  const [primarySort, setPrimarySort] = useState<SortKey | null>(null);
  const [secondarySort, setSecondarySort] = useState<SortKey | null>(null);
  const [showOutOfRangeOnly, setShowOutOfRangeOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // ── Timeline Filter State ────────────────────────────────
  const [selectedMonth, setSelectedMonth] = useState<{ month: number; year: number } | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<'fully-completed' | 'completed' | 'pending' | 'overdue' | null>(null);

  useEffect(() => {
    if (!selectedStatus) return;
    const t = setTimeout(() => {
      const first = document.querySelector('[data-mfc-card]') as HTMLElement | null;
      first?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
    return () => clearTimeout(t);
  }, [selectedStatus]);

  // ── Derived values ───────────────────────────────────────
  const { filteredMoreThan3, filteredLessThan3 } = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return { filteredMoreThan3: moreThan3, filteredLessThan3: lessThan3 };

    const filterGroup = (group: MFCGroup) => {
      const groupMatches = 
        group.mfcNo.toLowerCase().includes(q) ||
        (group.productName || '').toLowerCase().includes(q) ||
        (group.productCode || '').toLowerCase().includes(q) ||
        (group.genericName || '').toLowerCase().includes(q);

      if (groupMatches) return group;

      const matchingBatches = group.batches.filter(b => 
        b.batchNumber.toLowerCase().includes(q) ||
        (b.itemCode || '').toLowerCase().includes(q)
      );

      if (matchingBatches.length > 0) {
        return { ...group, batches: matchingBatches };
      }
      return null;
    };

    return {
      filteredMoreThan3: moreThan3.map(filterGroup).filter(Boolean) as MFCGroup[],
      filteredLessThan3: lessThan3.map(filterGroup).filter(Boolean) as MFCGroup[],
    };
  }, [moreThan3, lessThan3, searchQuery]);

  const allGroups = useMemo(() => [...filteredMoreThan3, ...filteredLessThan3], [filteredMoreThan3, filteredLessThan3]);

  const maxShelfLife = useMemo(() => getMaxShelfLife(allGroups), [allGroups]);

  const timelineMonths = useMemo(() => generateTimelineMonths(maxShelfLife), [maxShelfLife]);

  const uniqueYears = useMemo(() => {
    const years = new Set<number>();
    for (const group of allGroups) {
      for (const batch of group.batches) {
        const d = parseMfgDate(batch.mfgDate);
        if (d) years.add(d.getFullYear());
      }
    }
    return Array.from(years).sort((a, b) => b - a);
  }, [allGroups]);

  const visibleTimelineMonths = useMemo(() => {
    return timelineMonths;
  }, [timelineMonths]);

  const refDate = useMemo(() => {
    if (!selectedMonth) return new Date();
    return new Date(selectedMonth.year, selectedMonth.month - 1, 1);
  }, [selectedMonth]);

  const yearStats = useMemo(
    () => computeYearStats(allGroups, savedState, selectedYear),
    [allGroups, savedState, selectedYear]
  );

  const monthStats = useMemo(
    () => computeMonthStats(allGroups, savedState, refDate, selectedYear, selectedMonth?.month ?? null),
    [allGroups, savedState, refDate, selectedYear, selectedMonth]
  );

  // Compute batches that have out-of-range pH saved
  const outOfRangeBatchKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const group of allGroups) {
      for (const batch of group.batches) {
        const hasOOR = STABILITY_MONTHS.some((m) => {
          const saved = savedState[cellKey(batch.batchNumber, batch.itemCode, m)];
          if (!saved) return false;
          return batch.phParams.some((param) => {
            const val = saved.phValues[param.label] ?? '';
            return !!val && isPhOutOfRange(val, param.limit);
          });
        });
        if (hasOOR) keys.add(batch.batchNumber);
      }
    }
    return keys;
  }, [allGroups, savedState]);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/retained-sample');
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to load data');

      setMoreThan3(json.data.moreThan3);
      setLessThan3(json.data.lessThan3);

      const initialEdits: EditState = {};
      const groups: MFCGroup[] = [...json.data.moreThan3, ...json.data.lessThan3];
      for (const group of groups) {
        for (const batch of group.batches) {
          for (const entry of batch.stabilityEntries as StabilityEntry[]) {
            // Prefer phValues array; fall back to legacy single pH field
            let phRecord: Record<string, string> = {};
            if (entry.phValues && entry.phValues.length > 0) {
              phRecord = phValuesToRecord(entry.phValues);
            } else if (entry.pH) {
              phRecord = { '': entry.pH };
            }
            const cellEdit = { phValues: phRecord, description: entry.description };
            initialEdits[cellKey(batch.batchNumber, batch.itemCode, entry.month)] = cellEdit;
          }
        }
      }
      setEditState(initialEdits);
      setSavedState(initialEdits);
      setExpandedMFCs(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  function toggleMFC(mfcNo: string) {
    setExpandedMFCs((prev) => {
      const next = new Set(prev);
      if (next.has(mfcNo)) next.delete(mfcNo);
      else next.add(mfcNo);
      return next;
    });
  }

  // field = 'description' | a pH label ('' for unlabelled, 'IP', 'USP', etc.)
  function handleEdit(batchNumber: string, itemCode: string, month: number, field: string, value: string) {
    const key = cellKey(batchNumber, itemCode, month);
    setEditState((prev) => {
      const cell = prev[key] || { phValues: {}, description: '' };
      if (field === 'description') {
        return { ...prev, [key]: { ...cell, description: value } };
      }
      return { ...prev, [key]: { ...cell, phValues: { ...cell.phValues, [field]: value } } };
    });
    setSaveStatus((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  async function handleSave(group: MFCGroup, batchNumber: string, itemCode: string, month: StabilityMonth) {
    const key = cellKey(batchNumber, itemCode, month);
    const edit = editState[key] || { phValues: {}, description: '' };
    setSaving((prev) => ({ ...prev, [key]: true }));
    try {
      const phValuesArr = Object.entries(edit.phValues).map(([label, value]) => ({ label, value }));
      const res = await fetch('/api/retained-sample', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mfcNo: group.mfcNo,
          productCode: group.productCode,
          productName: group.productName,
          batchNumber,
          month,
          pH: edit.phValues[''] || '',   // legacy compat: unlabelled pH
          phValues: phValuesArr,
          description: edit.description,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Save failed');
      setSavedState((prev) => ({ ...prev, [key]: edit }));
      setSaveStatus((prev) => ({ ...prev, [key]: 'saved' }));
      setTimeout(() => {
        setSaveStatus((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
      }, 2500);
    } catch {
      setSaveStatus((prev) => ({ ...prev, [key]: 'error' }));
    } finally {
      setSaving((prev) => ({ ...prev, [key]: false }));
    }
  }

  function handleMonthClick(m: { month: number; year: number }) {
    if (selectedMonth?.month === m.month && selectedMonth?.year === m.year) {
      setSelectedMonth(null);
    } else {
      setSelectedMonth(m);
      setSelectedYear(null);
    }
  }

  function handleYearClick(year: number) {
    if (selectedYear === year) {
      setSelectedYear(null);
    } else {
      setSelectedYear(year);
      setSelectedMonth(null);
    }
  }

  function clearFilter() {
    setSelectedMonth(null);
    setSelectedYear(null);
  }

  // ── Admin password unlock ────────────────────────────────
  function requestUnlock(key: string) {
    setPwInput('');
    setPwError(false);
    setPwModal({ cellKey: key });
  }

  function submitPassword() {
    if (pwInput === 'admin@retain') {
      setUnlockedCells((prev) => new Set(prev).add(pwModal!.cellKey));
      setPwModal(null);
    } else {
      setPwError(true);
    }
  }

  // ── Stability Cell ───────────────────────────────────────
  function renderStabilityCell(
    group: MFCGroup,
    batch: BatchStabilityRow,
    month: StabilityMonth,
    intervalStatus: IntervalStatus
  ) {
    const key = cellKey(batch.batchNumber, batch.itemCode, month);
    const edit = editState[key] || { phValues: {}, description: '' };
    const isFilled = cellIsFilled(savedState[key]);
    const isSaving = saving[key];
    const cellSaveStatus = saveStatus[key];
    const isLocked = intervalStatus === 'future' && !unlockedCells.has(key);

    // If COA has pH params, use those labels; otherwise show one unlabelled input
    const phParams = batch.phParams.length > 0
      ? batch.phParams
      : [{ label: '', result: '', limit: '' }];
    const hasNoCOA = batch.phParams.length === 0;

    // Warn if any entered pH is outside its limit (but still allow save)
    const hasOutOfRange = phParams.some((param) => {
      const val = edit.phValues[param.label] ?? '';
      return !hasNoCOA && isPhOutOfRange(val, param.limit);
    });

    const tdClass = [
      styles.tdBase,
      styles.tdStability,
      intervalStatus === 'overdue' ? styles.tdOverdue : '',
      intervalStatus === 'due-this-month' ? styles.tdDuePending : '',
      intervalStatus === 'completed' ? styles.tdDueFilled : '',
      intervalStatus === 'future' ? styles.tdFuture : '',
    ].filter(Boolean).join(' ');

    const btnClass =
      cellSaveStatus === 'saved'
        ? `${styles.saveBtn} ${styles.saveBtnSaved}`
        : cellSaveStatus === 'error'
          ? `${styles.saveBtn} ${styles.saveBtnError}`
          : `${styles.saveBtn} ${styles.saveBtnDefault}`;

    return (
      <td key={month} className={tdClass}>
        {intervalStatus === 'overdue' && (
          <div className={styles.overdueTag}>✗ Overdue</div>
        )}
        {intervalStatus === 'due-this-month' && (
          <div className={styles.dueTag}>⚠ Due — fill now</div>
        )}
        {intervalStatus === 'completed' && (
          <div className={styles.doneTag}>✓ Completed</div>
        )}
        {intervalStatus === 'future' && isFilled && (
          <div className={styles.doneTag}>✓ Filled</div>
        )}
        <div className={styles.cellInner}>
          {isLocked ? (
            <div className={styles.lockOverlay}>
              <span className={styles.lockIcon}>🔒</span>
              <span className={styles.lockText}>Not due yet</span>
              <button className={styles.unlockBtn} onClick={() => requestUnlock(key)}>
                Enter as Admin
              </button>
            </div>
          ) : (
            <>
              {phParams.map((param) => {
                const inputVal = edit.phValues[param.label] ?? '';
                const disabled = hasNoCOA;
                const outOfRange = !disabled && !!inputVal && isPhOutOfRange(inputVal, param.limit);
                return (
                  <div key={param.label} className={styles.phBlock}>
                    <div className={styles.phRow}>
                      <span className={styles.phLabel}>
                        pH{param.label ? <span className={styles.phStdTag}>({param.label})</span> : null}
                      </span>
                      <input
                        type="text"
                        value={inputVal}
                        onChange={(e) => handleEdit(batch.batchNumber, batch.itemCode, month, param.label, e.target.value)}
                        placeholder={disabled ? 'N/A' : (param.limit || 'e.g. 6.4')}
                        disabled={disabled}
                        className={`${styles.phInput} ${disabled ? styles.phInputDisabled : ''} ${outOfRange ? styles.phInputError : ''}`}
                      />
                    </div>
                    {param.limit && !disabled && (
                      <span className={styles.phLimitHint}>Limit: {param.limit}</span>
                    )}
                    {outOfRange && (
                      <span className={styles.phError}>Out of range</span>
                    )}
                  </div>
                );
              })}
              <textarea
                value={edit.description}
                onChange={(e) => handleEdit(batch.batchNumber, batch.itemCode, month, 'description', e.target.value)}
                placeholder="Observation…"
                rows={2}
                className={styles.descInput}
              />
            </>
          )}
          {!isLocked && (
            <>
              {hasOutOfRange && (
                <div className={styles.phOutOfRangeWarning}>
                  ⚠ pH out of limit — saving anyway
                </div>
              )}
              <button
                onClick={() => handleSave(group, batch.batchNumber, batch.itemCode, month)}
                disabled={isSaving}
                className={btnClass}
              >
                {isSaving ? 'Saving…' : cellSaveStatus === 'saved' ? '✓ Saved' : cellSaveStatus === 'error' ? '✗ Error' : 'Save'}
              </button>
            </>
          )}
        </div>
      </td>
    );
  }

  // ── MFC Group ────────────────────────────────────────────
  function renderMFCGroup(group: MFCGroup, index: number = 0) {
    const isExpanded = expandedMFCs.has(group.mfcNo);

    // Filter batches by active filter (month or year)
    const batchesByTime = selectedMonth
      ? group.batches.filter((batch) => {
          const mfgD = parseMfgDate(batch.mfgDate);
          if (!mfgD) return false;
          return STABILITY_MONTHS.some((m) => {
            const isFilled = cellIsFilled(savedState[cellKey(batch.batchNumber, batch.itemCode, m)]);
            return getIntervalStatus(mfgD, m, isFilled, refDate) !== 'future';
          });
        })
      : selectedYear
        ? group.batches.filter((batch) => {
            const mfgD = parseMfgDate(batch.mfgDate);
            if (!mfgD) return false;
            return mfgD.getFullYear() === selectedYear;
          })
        : group.batches;

    // Filter by out-of-range pH
    const batchesAfterOOR = showOutOfRangeOnly
      ? batchesByTime.filter((b) => outOfRangeBatchKeys.has(b.batchNumber))
      : batchesByTime;

    // Filter further by status
    const sl = parseInt(group.shelfLife);
    const requiredMonths = STABILITY_MONTHS.filter(m => isNaN(sl) || m <= sl);
    const batchesToShow = selectedStatus
      ? batchesAfterOOR.filter((batch) => {
          if (selectedStatus === 'fully-completed') {
            return requiredMonths.length > 0 && requiredMonths.every(m =>
              cellIsFilled(savedState[cellKey(batch.batchNumber, batch.itemCode, m)])
            );
          }
          const mfgD = parseMfgDate(batch.mfgDate);
          if (!mfgD) return false;
          return STABILITY_MONTHS.some((m) => {
            const isFilled = cellIsFilled(savedState[cellKey(batch.batchNumber, batch.itemCode, m)]);
            const s = getIntervalStatus(mfgD, m, isFilled, refDate);
            if (selectedStatus === 'completed') return s === 'completed';
            if (selectedStatus === 'pending')   return s === 'due-this-month';
            if (selectedStatus === 'overdue')   return s === 'overdue';
            return false;
          });
        })
      : batchesAfterOOR;

    if ((selectedMonth || selectedYear || selectedStatus || showOutOfRangeOnly) && batchesToShow.length === 0) return null;

    const totalBatches = batchesToShow.length;
    const withCOA = batchesToShow.filter((b) => b.coaFound).length;
    const withPH = batchesToShow.filter((b) => b.zeroMonthPH).length;
    const stabilityComplete = batchesToShow.filter(
      (b) => b.stabilityEntries.length === STABILITY_MONTHS.length
    ).length;

    // ── Due-date computation (uses refDate) ───────────────
    const batchDue = new Map<string, Set<number>>();
    for (const batch of batchesToShow) {
      const mfgD = parseMfgDate(batch.mfgDate);
      if (!mfgD) continue;
      const elapsed = monthsElapsedAsOf(mfgD, refDate);
      const due = new Set<number>();
      for (const m of STABILITY_MONTHS) {
        if (elapsed >= m) due.add(m);
      }
      batchDue.set(batch.batchNumber, due);
    }

    type DueInfo = { total: number; filled: number; dueDate: Date | null };
    const monthSummary = new Map<number, DueInfo>();
    for (const m of STABILITY_MONTHS) {
      let total = 0, filled = 0;
      let earliest: Date | null = null;
      for (const batch of batchesToShow) {
        if (!batchDue.get(batch.batchNumber)?.has(m)) continue;
        total++;
        const key = cellKey(batch.batchNumber, batch.itemCode, m);
        const ed = editState[key];
        if (cellIsFilled(ed)) filled++;
        const mfgD = parseMfgDate(batch.mfgDate);
        if (mfgD) {
          const d = dueDate(mfgD, m);
          if (!earliest || d < earliest) earliest = d;
        }
      }
      if (total > 0) monthSummary.set(m, { total, filled, dueDate: earliest });
    }

    const totalPending = Array.from(monthSummary.values()).reduce((s, v) => s + (v.total - v.filled), 0);

    const pendingMonths = new Set(
      Array.from(monthSummary.entries())
        .filter(([, v]) => v.filled < v.total)
        .map(([m]) => m)
    );

    const bannerTitle = selectedMonth
      ? `📅 Stability intervals due as of ${formatMonthLabel(selectedMonth.month, selectedMonth.year)}`
      : '📅 Stability intervals due as of today';

    return (
      <div
        key={group.mfcNo}
        className={styles.mfcCard}
        data-mfc-card
      >
        <div className={styles.accentBar} />

        <button onClick={() => toggleMFC(group.mfcNo)} className={styles.mfcToggle}>
          <div className={styles.serialNo}>#{index + 1}</div>
          <div className={`${styles.expandIcon} ${isExpanded ? styles.expandIconOpen : ''}`}>▶</div>

          <div className={styles.mfcIdentity}>
            <div className={styles.mfcNoChip}>{group.mfcNo}</div>
            <div className={styles.mfcNames}>
              <span className={styles.mfcProduct}>{group.productName}</span>
              {group.genericName && group.genericName !== 'N/A' && (
                <span className={styles.mfcGeneric}>{group.genericName}</span>
              )}
            </div>
          </div>

          <div className={styles.mfcSummary}>
            <span className={`${styles.badge} ${styles.badgeBatch}`}>
              📦 {totalBatches} Batch{totalBatches !== 1 ? 'es' : ''}
            </span>
            <span className={`${styles.badge} ${withCOA === totalBatches ? styles.badgeGreen : withCOA > 0 ? styles.badgeOrange : styles.badgeRed}`}>
              🧪 COA: {withCOA}/{totalBatches}
            </span>
            {withCOA > 0 && withPH < withCOA && (
              <span className={`${styles.badge} ${styles.badgeOrange}`}>
                ⚗️ pH: {withPH}/{withCOA}
              </span>
            )}
{stabilityComplete > 0 && (
              <span className={`${styles.badge} ${styles.badgeGreen}`}>
                ✓ Complete: {stabilityComplete}
              </span>
            )}
            {totalPending > 0 && (
              <span className={`${styles.badge} ${styles.badgeDue}`}>
                ⚠ {totalPending} interval{totalPending !== 1 ? 's' : ''} due
              </span>
            )}
            {group.shelfLife && group.shelfLife !== 'N/A' && (
              <span className={`${styles.badge} ${styles.badgeShelf}`}>
                ⏱ {group.shelfLife} months
              </span>
            )}
          </div>

          <span className={styles.mfcChevron}>{isExpanded ? '▲' : '▼'}</span>
        </button>

        {isExpanded && (
          <>
            {monthSummary.size > 0 && (
              <div className={styles.dueBanner}>
                <div className={styles.dueBannerTitle}>{bannerTitle}</div>
                <div className={styles.dueBannerItems}>
                  {Array.from(monthSummary.entries()).map(([m, info]) => {
                    const allFilled = info.filled === info.total;
                    return (
                      <div
                        key={m}
                        className={`${styles.dueBannerItem} ${allFilled ? styles.dueBannerItemDone : styles.dueBannerItemPending}`}
                      >
                        <span className={styles.dueBannerMonth}>{m}M</span>
                        <span className={styles.dueBannerDetail}>
                          {allFilled
                            ? `All ${info.total} filled ✓`
                            : `${info.filled}/${info.total} filled — ${info.total - info.filled} pending`}
                        </span>
                        {info.dueDate && (
                          <span className={styles.dueBannerDate}>since {formatDate(info.dueDate)}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.colBatchNo}>Batch No</th>
                    <th className={styles.colItemCode}>Item Code</th>
                    <th className={styles.colMeta}>Mfg Date</th>
                    <th className={styles.colMeta}>Expiry Date</th>
                    <th className={styles.colProductCode}>Product Code</th>
                    <th className={styles.colProductName}>Product Name</th>
                    <th className={styles.colMonth}>0 Month (COA)</th>
                    {requiredMonths.map((m) => (
                      <th
                        key={m}
                        className={[
                          styles.colMonth,
                          styles.center,
                          pendingMonths.has(m) ? styles.thDuePending : '',
                          monthSummary.has(m) && !pendingMonths.has(m) ? styles.thDueFilled : '',
                        ].filter(Boolean).join(' ')}
                      >
                        {m} Months
                        {pendingMonths.has(m) && <span className={styles.thDueTag}>DUE</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {batchesToShow.length === 0 ? (
                    <tr>
                      <td colSpan={7 + requiredMonths.length} className={styles.noRows}>No batches found</td>
                    </tr>
                  ) : (
                    batchesToShow.map((batch, idx) => {
                      const mfgD = parseMfgDate(batch.mfgDate);
                      return (
                        <tr
                          key={`${batch.batchNumber}:${batch.itemCode}`}
                          className={idx % 2 === 0 ? styles.rowEven : styles.rowOdd}
                        >
                          <td className={`${styles.tdBase} ${styles.tdBatch}`}>
                            <div className={styles.batchNum}>{batch.batchNumber}</div>
                          </td>
                          <td className={`${styles.tdBase} ${styles.tdItemCode}`}>
                            <div className={styles.itemCodeChip}>{batch.itemCode || '—'}</div>
                          </td>
                          <td className={`${styles.tdBase} ${styles.tdMeta}`}>
                            <span className={styles.metaText}>{batch.mfgDate || '—'}</span>
                          </td>
                          <td className={`${styles.tdBase} ${styles.tdMeta}`}>
                            <span className={`${styles.metaText} ${batch.expiryDate && batch.expiryDate !== 'N/A' ? styles.expiryText : ''}`}>
                              {batch.expiryDate && batch.expiryDate !== 'N/A' ? batch.expiryDate : '—'}
                            </span>
                          </td>
                          <td className={`${styles.tdBase} ${styles.tdMeta}`}>
                            <span className={styles.metaText}>{group.productCode || '—'}</span>
                          </td>
                          <td className={`${styles.tdBase} ${styles.tdProductName}`}>
                            <span className={styles.productNameText}>{group.productName || '—'}</span>
                          </td>
                          <td className={`${styles.tdBase} ${styles.tdCoa}`}>
                            {!batch.coaFound ? (
                              <span className={styles.coaEmpty}>No COA data</span>
                            ) : (
                              <>
                                {batch.phParams.length === 0 ? (
                                  <span className={styles.coaNoPh}>pH not found in COA</span>
                                ) : (
                                  batch.phParams.map((param) => (
                                    <div key={param.label} className={styles.coaPhRow}>
                                      <span className={styles.coaLabel}>
                                        pH{param.label ? <span className={styles.phStdTag}>({param.label})</span> : null}
                                      </span>
                                      <span className={styles.coaPhValue}>{param.result}</span>
                                      {param.limit && (
                                        <span className={styles.coaPhLimit}>{param.limit}</span>
                                      )}
                                    </div>
                                  ))
                                )}
                                {batch.zeroMonthDescription && (
                                  <div className={styles.coaDesc}>{batch.zeroMonthDescription}</div>
                                )}
                              </>
                            )}
                          </td>
                          {requiredMonths.map((m) => {
                            const isFilled = cellIsFilled(savedState[cellKey(batch.batchNumber, batch.itemCode, m)]);
                            const intervalStatus = mfgD
                              ? getIntervalStatus(mfgD, m, isFilled, refDate)
                              : 'future';
                            return renderStabilityCell(group, batch, m, intervalStatus);
                          })}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    );
  }

  // ── Loading ──────────────────────────────────────────────
  if (loading) {
    return (
      <div className={styles.centered}>
        <div className={styles.loadingText}>
          <div className={styles.spinner} />
          Loading stability data…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.centered}>
        <div className={styles.errorBox}>
          <p className={styles.errorText}>{error}</p>
          <button className={styles.retryBtn} onClick={fetchData}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  // ── Main Page ────────────────────────────────────────────
  function groupIntervalsDue(group: MFCGroup): number {
    let pending = 0;
    for (const batch of group.batches) {
      const mfgD = parseMfgDate(batch.mfgDate);
      if (!mfgD) continue;
      for (const m of STABILITY_MONTHS) {
        const isFilled = cellIsFilled(savedState[cellKey(batch.batchNumber, batch.itemCode, m)]);
        const s = getIntervalStatus(mfgD, m, isFilled, refDate);
        if (s === 'overdue' || s === 'due-this-month') pending++;
      }
    }
    return pending;
  }

  function sortGroups(groups: MFCGroup[], key: SortKey | null): MFCGroup[] {
    if (!key) return groups;
    return [...groups].sort((a, b) => {
      if (key === 'mfc-asc') return a.mfcNo.localeCompare(b.mfcNo);
      if (key === 'mfc-desc') return b.mfcNo.localeCompare(a.mfcNo);
      if (key === 'batches-desc') return b.batches.length - a.batches.length;
      if (key === 'batches-asc') return a.batches.length - b.batches.length;
      if (key === 'intervals-desc') return groupIntervalsDue(b) - groupIntervalsDue(a);
      if (key === 'intervals-asc') return groupIntervalsDue(a) - groupIntervalsDue(b);
      if (key === 'shelf-life-desc') return parseInt(b.shelfLife || '0') - parseInt(a.shelfLife || '0');
      if (key === 'shelf-life-asc') return parseInt(a.shelfLife || '0') - parseInt(b.shelfLife || '0');
      return 0;
    });
  }

  const sortedMoreThan3 = sortGroups(filteredMoreThan3, primarySort);
  const sortedLessThan3 = sortGroups(filteredLessThan3, secondarySort);

  const primaryRendered = sortedMoreThan3.map((g, i) => renderMFCGroup(g, i)).filter(Boolean);
  const secondaryRendered = sortedLessThan3.map((g, i) => renderMFCGroup(g, i)).filter(Boolean);

  return (
    <div className={styles.page}>
      {/* ── Admin password modal ── */}
      {pwModal && (
        <div className={styles.pwBackdrop} onClick={() => setPwModal(null)}>
          <div className={styles.pwModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.pwTitle}>🔒 Admin Access Required</div>
            <p className={styles.pwSubtitle}>This interval is not due yet. Enter the admin password to override.</p>
            <input
              type="password"
              value={pwInput}
              onChange={(e) => { setPwInput(e.target.value); setPwError(false); }}
              onKeyDown={(e) => e.key === 'Enter' && submitPassword()}
              placeholder="Enter password"
              autoFocus
              className={`${styles.pwInput} ${pwError ? styles.pwInputError : ''}`}
            />
            {pwError && <span className={styles.pwErrorMsg}>Incorrect password</span>}
            <div className={styles.pwActions}>
              <button className={styles.pwCancelBtn} onClick={() => setPwModal(null)}>Cancel</button>
              <button className={styles.pwConfirmBtn} onClick={submitPassword}>Unlock</button>
            </div>
          </div>
        </div>
      )}
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerInner}>
          <div>
            <h1 className={styles.headerTitle}>Retained Sample Stability</h1>
            <p className={styles.headerSubtitle}>
              Track pH and observations across stability intervals — grouped by MFC
            </p>
          </div>
          <div className={styles.headerBtns}>
            {outOfRangeBatchKeys.size > 0 && (
              <button
                className={`${styles.outOfRangeFilterBtn} ${showOutOfRangeOnly ? styles.outOfRangeFilterBtnActive : ''}`}
                onClick={() => setShowOutOfRangeOnly(p => !p)}
              >
                ⚠ pH Out of Range ({outOfRangeBatchKeys.size})
              </button>
            )}
            <button className={styles.refreshBtn} onClick={fetchData}>
              ↺ Refresh
            </button>
          </div>
        </div>
      </div>

      <div className={styles.content}>
        {/* ── Global Timeline Filter ─────────────────────── */}
        <div className={styles.timelineSection}>
          <div className={styles.timelineHeader}>
            <div className={styles.timelineTitleRow}>
              <span className={styles.timelineIcon}>📅</span>
              <span className={styles.timelineTitle}>Global Stability Timeline</span>
              {(selectedMonth || selectedYear) && (
                <span className={styles.timelineActiveBadge}>
                  {selectedMonth
                    ? `Month: ${formatMonthLabel(selectedMonth.month, selectedMonth.year)}`
                    : `Year: ${String(selectedYear).slice(2)}`}
                </span>
              )}
            </div>
            
            <div className={styles.timelineSearchWrap}>
              <span className={styles.timelineSearchIcon}>🔍</span>
              <input 
                type="text" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by Batch, MFC, Item Code..."
                className={styles.timelineSearchInput}
              />
            </div>

            <div className={styles.timelineActions}>
              {(
                [
                  { key: 'fully-completed', label: 'Fully Completed', dot: styles.legendFullyCompleted, active: styles.statusBtnFullyCompleted },
                  { key: 'completed',       label: 'Done',            dot: styles.legendCompleted,      active: styles.statusBtnCompleted       },
                  { key: 'pending',         label: 'Pending',         dot: styles.legendDue,            active: styles.statusBtnPending         },
                  { key: 'overdue',         label: 'Overdue',         dot: styles.legendOverdue,        active: styles.statusBtnOverdue         },
                ] as const
              ).map(({ key, label, dot, active }) => (
                <button
                  key={key}
                  className={[
                    styles.statusFilterBtn,
                    selectedStatus === key ? active : '',
                  ].filter(Boolean).join(' ')}
                  onClick={() => setSelectedStatus(prev => prev === key ? null : key)}
                >
                  <span className={`${styles.legendDot} ${dot}`} />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Year quick filter */}
          <div className={styles.timelineRow}>
            <span className={styles.timelineLabel}>YEAR:</span>
            <div className={styles.yearBtns}>
              <button
                className={`${styles.yearBtn} ${!selectedYear ? styles.yearBtnActive : ''}`}
                onClick={clearFilter}
              >
                All
              </button>
              {uniqueYears.map((y) => (
                <button
                  key={y}
                  className={`${styles.yearBtn} ${selectedYear === y ? styles.yearBtnActive : ''}`}
                  onClick={() => handleYearClick(y)}
                >
                  {String(y).slice(2)}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.summaryRow}>
            <span className={styles.summaryLabel}>
              {selectedYear ? `Year Summary` : `All Years`}
            </span>
            <button
              className={`${styles.summaryChip} ${styles.summaryChipFullyCompleted} ${selectedStatus === 'fully-completed' ? styles.summaryChipActive : ''}`}
              onClick={() => setSelectedStatus(p => p === 'fully-completed' ? null : 'fully-completed')}
            >
              ✅ Fully Completed: <strong>{yearStats.fullyCompleted}</strong>
            </button>
            <button
              className={`${styles.summaryChip} ${styles.summaryChipGreen} ${selectedStatus === 'completed' ? styles.summaryChipActive : ''}`}
              onClick={() => setSelectedStatus(p => p === 'completed' ? null : 'completed')}
            >
              🟢 Done: <strong>{yearStats.done}</strong>
            </button>
            <button
              className={`${styles.summaryChip} ${styles.summaryChipOrange} ${selectedStatus === 'pending' ? styles.summaryChipActive : ''}`}
              onClick={() => setSelectedStatus(p => p === 'pending' ? null : 'pending')}
            >
              🟠 Pending: <strong>{yearStats.pending}</strong>
            </button>
            <button
              className={`${styles.summaryChip} ${styles.summaryChipRed} ${selectedStatus === 'overdue' ? styles.summaryChipActive : ''}`}
              onClick={() => setSelectedStatus(p => p === 'overdue' ? null : 'overdue')}
            >
              🔴 Overdue: <strong>{yearStats.overdue}</strong>
            </button>
          </div>

          {/* Month buttons */}
          <div className={styles.timelineRow}>
            <span className={styles.timelineLabel}>MONTHS:</span>
            <div className={styles.monthScroll}>
              <button
                className={`${styles.monthBtn} ${!selectedMonth ? styles.monthBtnActive : ''}`}
                onClick={() => setSelectedMonth(null)}
              >
                All
              </button>
              {visibleTimelineMonths.map((m) => {
                const isActive = selectedMonth?.month === m.month && selectedMonth?.year === m.year;
                const today = new Date();
                const isCurrentMonth = m.month === today.getMonth() + 1 && m.year === today.getFullYear();
                return (
                  <button
                    key={`${m.year}-${m.month}`}
                    className={[
                      styles.monthBtn,
                      isActive ? styles.monthBtnActive : '',
                      isCurrentMonth && !isActive ? styles.monthBtnCurrent : '',
                    ].filter(Boolean).join(' ')}
                    onClick={() => handleMonthClick(m)}
                    title={isCurrentMonth ? 'Current month' : ''}
                  >
                    {formatMonthLabel(m.month, m.year)}
                    {isCurrentMonth && <span className={styles.currentDot} />}
                  </button>
                );
              })}
            </div>
          </div>

          <div className={styles.summaryRow}>
            <span className={styles.summaryLabel}>
              {selectedMonth ? `Month Summary` : `Global Summary`}
            </span>
            <button
              className={`${styles.summaryChip} ${styles.summaryChipFullyCompleted} ${selectedStatus === 'fully-completed' ? styles.summaryChipActive : ''}`}
              onClick={() => setSelectedStatus(p => p === 'fully-completed' ? null : 'fully-completed')}
            >
              ✅ Fully Completed: <strong>{monthStats.fullyCompleted}</strong>
            </button>
            <button
              className={`${styles.summaryChip} ${styles.summaryChipGreen} ${selectedStatus === 'completed' ? styles.summaryChipActive : ''}`}
              onClick={() => setSelectedStatus(p => p === 'completed' ? null : 'completed')}
            >
              🟢 Done: <strong>{monthStats.done}</strong>
            </button>
            <button
              className={`${styles.summaryChip} ${styles.summaryChipOrange} ${selectedStatus === 'pending' ? styles.summaryChipActive : ''}`}
              onClick={() => setSelectedStatus(p => p === 'pending' ? null : 'pending')}
            >
              🟠 Pending: <strong>{monthStats.pending}</strong>
            </button>
            <button
              className={`${styles.summaryChip} ${styles.summaryChipRed} ${selectedStatus === 'overdue' ? styles.summaryChipActive : ''}`}
              onClick={() => setSelectedStatus(p => p === 'overdue' ? null : 'overdue')}
            >
              🔴 Overdue: <strong>{monthStats.overdue}</strong>
            </button>
          </div>
        </div>

        {/* ── Section 1 — 3+ batches ─────────────────────── */}
        <section className={styles.section}>
          <button className={styles.sectionHeading} onClick={() => setPrimaryOpen((o) => !o)}>
            <div className={styles.sectionIconPrimary}>🔥</div>
            <div className={styles.sectionTitleBlock}>
              <h2 className={styles.sectionTitle}>MFCs with 3+ Batches</h2>
              <p className={styles.sectionSubtitle}>Primary MFCs with significant production volume</p>
            </div>
            <span className={`${styles.sectionBadge} ${styles.badgePrimary}`}>
              {primaryRendered.length} MFC{primaryRendered.length !== 1 ? 's' : ''}
              {(selectedMonth || selectedYear || searchQuery) && primaryRendered.length !== moreThan3.length ? ` (of ${moreThan3.length})` : ''}
            </span>
            <span className={`${styles.sectionBadge} ${styles.badgeBatchCount}`}>
              {filteredMoreThan3.reduce((s, g) => s + g.batches.length, 0)} Batches
            </span>
            <span className={styles.sectionChevron}>{primaryOpen ? '▲' : '▼'}</span>
          </button>

          {primaryOpen && (
            <>
              <div className={styles.sortBar}>
                <span className={styles.sortLabel}>Sort by:</span>
                {(
                  [
                    { id: 'mfc', label: 'MFC' },
                    { id: 'batches', label: 'Batches' },
                    { id: 'intervals', label: 'Intervals' },
                    { id: 'shelf-life', label: 'Shelf Life' },
                  ] as const
                ).map(({ id, label }) => {
                  const isAsc = primarySort === `${id}-asc`;
                  const isDesc = primarySort === `${id}-desc`;
                  const isActive = isAsc || isDesc;
                  
                  let icon = '';
                  if (id === 'mfc') {
                    if (isAsc) icon = ' A→Z';
                    if (isDesc) icon = ' Z→A';
                  } else {
                    if (isAsc) icon = ' ↑';
                    if (isDesc) icon = ' ↓';
                  }

                  const handleClick = () => {
                    if (isAsc) setPrimarySort(`${id}-desc` as SortKey);
                    else if (isDesc) setPrimarySort(null);
                    else setPrimarySort(`${id}-asc` as SortKey);
                  };

                  return (
                    <button
                      key={id}
                      className={`${styles.sortBtn} ${isActive ? styles.sortBtnActive : ''}`}
                      onClick={handleClick}
                    >
                      {label}{icon}
                    </button>
                  );
                })}
              </div>

              {primaryRendered.length === 0 ? (
                <div className={styles.emptySection}>
                  {selectedMonth
                    ? `No stability testing scheduled for ${formatMonthLabel(selectedMonth.month, selectedMonth.year)}`
                    : selectedYear
                      ? `No stability testing scheduled for ${selectedYear}`
                      : 'No MFCs with 3 or more batches'}
                </div>
              ) : (
                primaryRendered
              )}
            </>
          )}
        </section>

        {/* ── Section 2 — 1–2 batches ────────────────────── */}
        <section className={styles.section}>
          <button className={styles.sectionHeading} onClick={() => setSecondaryOpen((o) => !o)}>
            <div className={styles.sectionIconSecondary}>📋</div>
            <div className={styles.sectionTitleBlock}>
              <h2 className={styles.sectionTitle}>MFCs with 1–2 Batches</h2>
              <p className={styles.sectionSubtitle}>MFCs with limited production batches</p>
            </div>
            <span className={`${styles.sectionBadge} ${styles.badgeSecondary}`}>
              {secondaryRendered.length} MFC{secondaryRendered.length !== 1 ? 's' : ''}
              {(selectedMonth || selectedYear || searchQuery) && secondaryRendered.length !== lessThan3.length ? ` (of ${lessThan3.length})` : ''}
            </span>
            <span className={`${styles.sectionBadge} ${styles.badgeBatchCount}`}>
              {filteredLessThan3.reduce((s, g) => s + g.batches.length, 0)} Batches
            </span>
            <span className={styles.sectionChevron}>{secondaryOpen ? '▲' : '▼'}</span>
          </button>

          {secondaryOpen && (
            <>
              <div className={styles.sortBar}>
                <span className={styles.sortLabel}>Sort by:</span>
                {(
                  [
                    { id: 'mfc', label: 'MFC' },
                    { id: 'batches', label: 'Batches' },
                    { id: 'intervals', label: 'Intervals' },
                    { id: 'shelf-life', label: 'Shelf Life' },
                  ] as const
                ).map(({ id, label }) => {
                  const isAsc = secondarySort === `${id}-asc`;
                  const isDesc = secondarySort === `${id}-desc`;
                  const isActive = isAsc || isDesc;
                  
                  let icon = '';
                  if (id === 'mfc') {
                    if (isAsc) icon = ' A→Z';
                    if (isDesc) icon = ' Z→A';
                  } else {
                    if (isAsc) icon = ' ↑';
                    if (isDesc) icon = ' ↓';
                  }

                  const handleClick = () => {
                    if (isAsc) setSecondarySort(`${id}-desc` as SortKey);
                    else if (isDesc) setSecondarySort(null);
                    else setSecondarySort(`${id}-asc` as SortKey);
                  };

                  return (
                    <button
                      key={id}
                      className={`${styles.sortBtn} ${isActive ? styles.sortBtnActive : ''}`}
                      onClick={handleClick}
                    >
                      {label}{icon}
                    </button>
                  );
                })}
              </div>

              {secondaryRendered.length === 0 ? (
                <div className={styles.emptySection}>
                  {selectedMonth
                    ? `No stability testing scheduled for ${formatMonthLabel(selectedMonth.month, selectedMonth.year)}`
                    : selectedYear
                      ? `No stability testing scheduled for ${selectedYear}`
                      : 'No MFCs with fewer than 3 batches'}
                </div>
              ) : (
                secondaryRendered
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
