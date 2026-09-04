'use client';

import React, { useState, useEffect, useRef } from 'react';
import type { ExpenseRow } from '@/lib/expense-ledger';
import type { Cost, CostType } from '@/lib/jobs';
import { type CostSource, SELECTABLE_COST_SOURCES, COST_SOURCE_LABEL } from '@/lib/cost-truth';
import { updateCostAction, deleteCostAction, readReceiptAction } from '@/app/dashboard/jobs/actions';

interface ExpenseDetailDrawerProps {
  expense: ExpenseRow | null;
  onClose: () => void;
  onUpdate: (updatedRow: ExpenseRow) => void;
  onDelete: (id: string) => void;
  jobs: Array<{ id: string; ref: string; clientName: string; status: string }>;
  crew: Array<{ id: string; name: string; role_label: string | null; hourly_rate: number }>;
  suppliers: string[];
  accountTimeZone?: string;
  canManageCosts?: boolean;
}

interface DraftState {
  jobId: string;
  type: CostType;
  description: string;
  amount: string | number;
  supplier: string;
  costSource: CostSource;
  receiptUrl: string;
  crewId: string;
  hours: string | number;
  rate: string | number;
}

function isSafeHttpUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const trimmed = url.trim().toLowerCase();
  return trimmed.startsWith('https://') || trimmed.startsWith('http://');
}

function formatDate(iso: string, timeZone?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  try {
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: timeZone || undefined,
    });
  } catch {
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }
}

export default function ExpenseDetailDrawer({
  expense,
  onClose,
  onUpdate,
  onDelete,
  jobs,
  crew,
  suppliers,
  accountTimeZone = 'America/New_York',
  canManageCosts = true,
}: ExpenseDetailDrawerProps) {
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // AI receipt scan state
  const [scanStatus, setScanStatus] = useState<'idle' | 'reading' | 'done' | 'error'>('idle');
  const [scanMessage, setScanMessage] = useState<string | null>(null);

  const lastSavedRef = useRef<DraftState | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  // Initialize draft when expense changes
  useEffect(() => {
    if (!expense) {
      setDraft(null);
      lastSavedRef.current = null;
      setSaveStatus('idle');
      setErrorMessage(null);
      setScanStatus('idle');
      setScanMessage(null);
      return;
    }

    const initial: DraftState = {
      jobId: expense.job_id || '',
      type: expense.type || 'material',
      description: expense.description || '',
      amount: expense.amount !== undefined && expense.amount !== null ? String(expense.amount) : '',
      supplier: expense.supplier || '',
      costSource: expense.cost_source || 'estimated',
      receiptUrl: expense.receipt_url || '',
      crewId: expense.crew_id || '',
      hours: expense.hours !== undefined && expense.hours !== null ? String(expense.hours) : '',
      rate: expense.rate !== undefined && expense.rate !== null ? String(expense.rate) : '',
    };

    setDraft(initial);
    lastSavedRef.current = { ...initial };
    setSaveStatus('idle');
    setErrorMessage(null);
  }, [expense]);

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  // Close on Escape
  useEffect(() => {
    if (!expense) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [expense, onClose]);

  // Autosave executor
  const performSave = async (dataToSave: DraftState) => {
    if (!expense || !canManageCosts) return;

    const desc = dataToSave.description.trim();
    if (!desc) return;

    const isLabor = dataToSave.type === 'labor';
    const hrs = Number(dataToSave.hours);
    const rt = Number(dataToSave.rate);
    const amt = Number(dataToSave.amount);

    if (isLabor) {
      if (!dataToSave.hours || !dataToSave.rate || hrs <= 0 || rt <= 0) {
        return; // Incomplete labor input, do not send invalid request
      }
    } else {
      if (!dataToSave.amount || amt <= 0) {
        return; // Incomplete amount input, do not send invalid request
      }
    }

    // Check if anything actually changed from lastSaved
    if (lastSavedRef.current) {
      const prev = lastSavedRef.current;
      if (
        prev.jobId === dataToSave.jobId &&
        prev.type === dataToSave.type &&
        prev.description === dataToSave.description &&
        prev.amount === dataToSave.amount &&
        prev.supplier === dataToSave.supplier &&
        prev.costSource === dataToSave.costSource &&
        prev.receiptUrl === dataToSave.receiptUrl &&
        prev.crewId === dataToSave.crewId &&
        prev.hours === dataToSave.hours &&
        prev.rate === dataToSave.rate
      ) {
        return;
      }
    }

    setSaveStatus('saving');
    setErrorMessage(null);

    try {
      const formData = new FormData();
      formData.set('jobId', dataToSave.jobId || 'overhead');
      formData.set('type', dataToSave.type);
      formData.set('description', desc);
      formData.set('costSource', dataToSave.costSource);

      if (isLabor) {
        formData.set('hours', String(hrs));
        formData.set('rate', String(rt));
        if (dataToSave.crewId) formData.set('crewId', dataToSave.crewId);
      } else {
        formData.set('amount', String(amt));
      }

      if (dataToSave.supplier.trim()) {
        formData.set('supplier', dataToSave.supplier.trim());
      }
      if (dataToSave.receiptUrl.trim()) {
        formData.set('receiptUrl', dataToSave.receiptUrl.trim());
      }

      const updated = (await updateCostAction(expense.job_id, expense.id, formData)) as Cost;
      lastSavedRef.current = { ...dataToSave };

      const matchedJob = jobs.find((j) => j.id === dataToSave.jobId);
      const matchedCrew = crew.find((c) => c.id === dataToSave.crewId);

      const newExpenseRow: ExpenseRow = {
        ...expense,
        ...updated,
        job_id: dataToSave.jobId || null,
        job_ref: matchedJob?.ref || null,
        job_client_name: matchedJob?.clientName || null,
        job_status: matchedJob?.status || null,
        crew_name: matchedCrew ? matchedCrew.name : (updated.crew_name || expense.crew_name),
        crew_role_label: matchedCrew ? matchedCrew.role_label : (updated.crew_role_label || expense.crew_role_label),
      };

      onUpdate(newExpenseRow);
      setSaveStatus('saved');

      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => {
        setSaveStatus('idle');
      }, 2500);
    } catch (err) {
      setSaveStatus('error');
      setErrorMessage(err instanceof Error ? err.message : 'Failed to save changes');
    }
  };

  // Immediate save for dropdowns
  const handleDropdownChange = (key: keyof DraftState, value: string) => {
    if (!draft) return;
    const nextDraft = { ...draft, [key]: value };

    // When toggling to/from labor, adjust sensible source default
    if (key === 'type') {
      if (value === 'labor' && draft.costSource === 'receipt') {
        nextDraft.costSource = 'clocked';
      } else if (value !== 'labor' && draft.costSource === 'clocked') {
        nextDraft.costSource = 'receipt';
      }
    }

    // When selecting a crew member, auto-populate hourly rate if not yet set
    if (key === 'crewId') {
      const member = crew.find((c) => c.id === value);
      if (member && member.hourly_rate > 0 && (!draft.rate || Number(draft.rate) === 0)) {
        nextDraft.rate = String(member.hourly_rate);
      }
    }

    setDraft(nextDraft);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    void performSave(nextDraft);
  };

  // Debounced save for text/number inputs
  const handleTextChange = (key: keyof DraftState, value: string) => {
    if (!draft) return;
    const nextDraft = { ...draft, [key]: value };
    setDraft(nextDraft);

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      void performSave(nextDraft);
    }, 450);
  };

  // Flush on blur
  const handleBlur = () => {
    if (!draft) return;
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    void performSave(draft);
  };

  // AI receipt scanner
  const handleScanReceipt = async (file: File) => {
    setScanStatus('reading');
    setScanMessage(null);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Could not open file.'));
        reader.readAsDataURL(file);
      });

      const result = await readReceiptAction(dataUrl);
      if (!result.ok) {
        setScanStatus('error');
        setScanMessage(result.error);
        return;
      }

      const { read } = result;
      if (!draft) return;

      const nextDraft = { ...draft };
      if (read.supplier) nextDraft.supplier = read.supplier;
      if (read.total !== null) nextDraft.amount = String(read.total);
      if (read.lines.length > 0) {
        nextDraft.description =
          read.lines.length === 1
            ? read.lines[0].description
            : `${read.supplier ?? 'Supplies'} — ${read.lines.length} items`;
      }
      nextDraft.costSource = 'receipt';
      if (nextDraft.type === 'labor') nextDraft.type = 'material';

      setDraft(nextDraft);
      setScanStatus('done');
      setScanMessage(`Extracted ${read.supplier || 'receipt'}: $${(read.total || 0).toFixed(2)}`);
      void performSave(nextDraft);
    } catch (err) {
      setScanStatus('error');
      setScanMessage(err instanceof Error ? err.message : 'Could not scan receipt photo');
    }
  };

  // Delete handler
  const handleDelete = async () => {
    if (!expense || !canManageCosts) return;
    const confirmed = window.confirm(
      `Delete "${draft?.description || 'this expense'}"? This cannot be undone.`
    );
    if (!confirmed) return;

    setIsDeleting(true);
    try {
      await deleteCostAction(expense.job_id, expense.id);
      onDelete(expense.id);
      onClose();
    } catch (err) {
      setIsDeleting(false);
      alert(err instanceof Error ? err.message : 'Could not delete expense');
    }
  };

  if (!expense || !draft) return null;

  const isLabor = draft.type === 'labor';
  const hoursNum = Number(draft.hours) || 0;
  const rateNum = Number(draft.rate) || 0;
  const wagesComputed = Math.round(hoursNum * rateNum * 100) / 100;
  const currentTotal = isLabor ? wagesComputed : Number(draft.amount) || 0;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1100,
        background: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        justifyContent: 'flex-end',
      }}
      onClick={onClose}
    >
      <div
        ref={drawerRef}
        style={{
          width: '100%',
          maxWidth: '540px',
          height: '100%',
          background: '#0e171b',
          borderLeft: '1px solid rgba(255, 255, 255, 0.12)',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '-10px 0 30px rgba(0, 0, 0, 0.6)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drawer Header */}
        <div
          style={{
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'rgba(255, 255, 255, 0.02)',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#fff', fontWeight: 650 }}>
                Expense Details
              </h3>
              {/* Autosave badge */}
              {saveStatus === 'saving' && (
                <span
                  style={{
                    fontSize: '0.78rem',
                    color: '#facc15',
                    background: 'rgba(250, 204, 21, 0.12)',
                    padding: '0.15rem 0.5rem',
                    borderRadius: '999px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                  }}
                >
                  <span
                    style={{
                      display: 'inline-block',
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      background: '#facc15',
                    }}
                  />
                  Saving…
                </span>
              )}
              {saveStatus === 'saved' && (
                <span
                  style={{
                    fontSize: '0.78rem',
                    color: '#4ade80',
                    background: 'rgba(74, 222, 128, 0.12)',
                    padding: '0.15rem 0.5rem',
                    borderRadius: '999px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.3rem',
                  }}
                >
                  ✓ Saved
                </span>
              )}
              {saveStatus === 'error' && (
                <span
                  style={{
                    fontSize: '0.78rem',
                    color: '#f87171',
                    background: 'rgba(248, 113, 113, 0.15)',
                    padding: '0.15rem 0.5rem',
                    borderRadius: '999px',
                  }}
                >
                  ⚠ Save failed
                </span>
              )}
              {saveStatus === 'idle' && (
                <span style={{ fontSize: '0.75rem', color: 'var(--muted, #94a3b8)' }}>
                  Autosaves on edit
                </span>
              )}
            </div>
            <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.82rem', color: 'var(--muted, #94a3b8)' }}>
              Logged on {formatDate(expense.created_at, accountTimeZone)} • Total: ${currentTotal.toFixed(2)}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close drawer"
            style={{
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '6px',
              color: '#cbd5e1',
              cursor: 'pointer',
              padding: '0.4rem 0.65rem',
              fontSize: '1rem',
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        {/* Drawer Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {errorMessage && (
            <div
              style={{
                padding: '0.75rem 1rem',
                borderRadius: '8px',
                background: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#f87171',
                fontSize: '0.85rem',
              }}
            >
              {errorMessage}
            </div>
          )}

          {/* AI Receipt Scanner Card */}
          {canManageCosts && (
            <div
              style={{
                padding: '0.9rem 1rem',
                background: 'rgba(255, 209, 102, 0.05)',
                borderRadius: '8px',
                border: '1px solid rgba(255, 209, 102, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '0.75rem',
              }}
            >
              <div>
                <strong style={{ display: 'block', fontSize: '0.88rem', color: '#ffd166' }}>
                  AI Receipt &amp; Invoice Scanner
                </strong>
                <span style={{ fontSize: '0.78rem', color: 'var(--muted, #cbd5e1)' }}>
                  Upload a photo to auto-extract items, supplier &amp; totals.
                </span>
              </div>
              <label style={{ cursor: 'pointer' }}>
                <span
                  className="btn secondary"
                  style={{
                    fontSize: '0.82rem',
                    padding: '0.35rem 0.75rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    pointerEvents: scanStatus === 'reading' ? 'none' : 'auto',
                  }}
                >
                  <span style={{ color: '#ffd166' }}>✦</span>
                  <span>{scanStatus === 'reading' ? 'Analyzing Photo…' : 'Scan Receipt'}</span>
                </span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  style={{ display: 'none' }}
                  disabled={scanStatus === 'reading'}
                  onChange={(e) => {
                    const file = e.currentTarget.files?.[0];
                    if (file) void handleScanReceipt(file);
                    e.currentTarget.value = '';
                  }}
                />
              </label>
              {scanStatus === 'reading' && (
                <div style={{ width: '100%', fontSize: '0.82rem', color: '#ffd166' }}>
                  ✨ Reading receipt details with AI vision…
                </div>
              )}
              {scanMessage && (
                <div
                  style={{
                    width: '100%',
                    fontSize: '0.8rem',
                    color: scanStatus === 'error' ? '#f87171' : '#4ade80',
                  }}
                >
                  {scanMessage}
                </div>
              )}
            </div>
          )}

          {/* 1. Job Assignment */}
          <div className="field">
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.35rem' }}>
              Job Assignment
            </label>
            <select
              value={draft.jobId}
              onChange={(e) => handleDropdownChange('jobId', e.target.value)}
              disabled={!canManageCosts}
              style={{
                width: '100%',
                padding: '0.55rem 0.75rem',
                borderRadius: '6px',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                background: '#132127',
                color: '#fff',
                fontSize: '0.88rem',
              }}
            >
              <option value="">General Overhead (Rent, Truck, Tools, Fuel)</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.ref} — {j.clientName} ({j.status})
                </option>
              ))}
            </select>
          </div>

          {/* 2. Expense Category */}
          <div className="field">
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.35rem' }}>
              Category
            </label>
            <select
              value={draft.type}
              onChange={(e) => handleDropdownChange('type', e.target.value)}
              disabled={!canManageCosts}
              style={{
                width: '100%',
                padding: '0.55rem 0.75rem',
                borderRadius: '6px',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                background: '#132127',
                color: '#fff',
                fontSize: '0.88rem',
              }}
            >
              <option value="material">Materials &amp; Supplies</option>
              <option value="labor">Labor &amp; Wages</option>
              <option value="sub">Subcontractor</option>
              <option value="receipt">Receipt Slip</option>
              <option value="other">Other Overhead</option>
            </select>
          </div>

          {/* 3. Description */}
          <div className="field">
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.35rem' }}>
              Item / Description <span style={{ color: '#f87171' }}>*</span>
            </label>
            <input
              type="text"
              value={draft.description}
              onChange={(e) => handleTextChange('description', e.target.value)}
              onBlur={handleBlur}
              disabled={!canManageCosts}
              placeholder="e.g. 2x4 Lumber, Dump fee, Tools..."
              required
              style={{
                width: '100%',
                padding: '0.55rem 0.75rem',
                borderRadius: '6px',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                background: '#132127',
                color: '#fff',
                fontSize: '0.88rem',
              }}
            />
          </div>

          {/* 4. Amount or Labor breakdown */}
          {isLabor ? (
            <div
              style={{
                padding: '1rem',
                borderRadius: '8px',
                background: 'rgba(168, 85, 247, 0.07)',
                border: '1px solid rgba(168, 85, 247, 0.2)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.85rem',
              }}
            >
              <strong style={{ fontSize: '0.85rem', color: '#c084fc' }}>Labor Details</strong>
              <div className="field">
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#cbd5e1', marginBottom: '0.25rem' }}>
                  Crew Member
                </label>
                <select
                  value={draft.crewId}
                  onChange={(e) => handleDropdownChange('crewId', e.target.value)}
                  disabled={!canManageCosts}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    borderRadius: '6px',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    background: '#132127',
                    color: '#fff',
                    fontSize: '0.85rem',
                  }}
                >
                  <option value="">Select Crew Member or Sub</option>
                  {crew.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.role_label ? `(${c.role_label})` : ''} — ${c.hourly_rate}/hr
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div className="field">
                  <label style={{ display: 'block', fontSize: '0.8rem', color: '#cbd5e1', marginBottom: '0.25rem' }}>
                    Hours
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    value={draft.hours}
                    onChange={(e) => handleTextChange('hours', e.target.value)}
                    onBlur={handleBlur}
                    disabled={!canManageCosts}
                    placeholder="8.0"
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      borderRadius: '6px',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      background: '#132127',
                      color: '#fff',
                      fontSize: '0.85rem',
                    }}
                  />
                </div>
                <div className="field">
                  <label style={{ display: 'block', fontSize: '0.8rem', color: '#cbd5e1', marginBottom: '0.25rem' }}>
                    Hourly Rate ($/hr)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={draft.rate}
                    onChange={(e) => handleTextChange('rate', e.target.value)}
                    onBlur={handleBlur}
                    disabled={!canManageCosts}
                    placeholder="30.00"
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.75rem',
                      borderRadius: '6px',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      background: '#132127',
                      color: '#fff',
                      fontSize: '0.85rem',
                    }}
                  />
                </div>
              </div>

              <div style={{ fontSize: '0.82rem', color: '#c084fc', display: 'flex', justifyContent: 'space-between', borderTop: '1px solid rgba(168, 85, 247, 0.2)', paddingTop: '0.5rem' }}>
                <span>Calculated Wages:</span>
                <strong>${wagesComputed.toFixed(2)}</strong>
              </div>
            </div>
          ) : (
            <div className="field">
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.35rem' }}>
                Amount ($) <span style={{ color: '#f87171' }}>*</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={draft.amount}
                onChange={(e) => handleTextChange('amount', e.target.value)}
                onBlur={handleBlur}
                disabled={!canManageCosts}
                placeholder="0.00"
                required
                style={{
                  width: '100%',
                  padding: '0.55rem 0.75rem',
                  borderRadius: '6px',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  background: '#132127',
                  color: '#fff',
                  fontSize: '0.88rem',
                }}
              />
            </div>
          )}

          {/* 5. Supplier / Vendor */}
          <div className="field">
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.35rem' }}>
              Supplier / Vendor / Payee
            </label>
            <input
              type="text"
              list="drawer-suppliers-list"
              value={draft.supplier}
              onChange={(e) => handleTextChange('supplier', e.target.value)}
              onBlur={handleBlur}
              disabled={!canManageCosts}
              placeholder="e.g. Home Depot, ABC Supply..."
              style={{
                width: '100%',
                padding: '0.55rem 0.75rem',
                borderRadius: '6px',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                background: '#132127',
                color: '#fff',
                fontSize: '0.88rem',
              }}
            />
            <datalist id="drawer-suppliers-list">
              {suppliers.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>

          {/* 6. Provenance Source */}
          <div className="field">
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.35rem' }}>
              Provenance Source
            </label>
            <select
              value={draft.costSource}
              onChange={(e) => handleDropdownChange('costSource', e.target.value)}
              disabled={!canManageCosts}
              style={{
                width: '100%',
                padding: '0.55rem 0.75rem',
                borderRadius: '6px',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                background: '#132127',
                color: '#fff',
                fontSize: '0.88rem',
              }}
            >
              {SELECTABLE_COST_SOURCES.map((source) => (
                <option key={source} value={source}>
                  {COST_SOURCE_LABEL[source] || source}
                </option>
              ))}
              {isLabor && <option value="clocked">Clocked Time</option>}
              {expense.cost_source === 'unspecified' && (
                <option value="unspecified">Unspecified (Historical)</option>
              )}
            </select>
          </div>

          {/* 7. Receipt Link */}
          <div className="field">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
              <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#cbd5e1' }}>
                Receipt / Invoice Link (URL)
              </label>
              {isSafeHttpUrl(draft.receiptUrl) && (
                <a
                  href={draft.receiptUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontSize: '0.78rem',
                    color: '#60a5fa',
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.2rem',
                  }}
                >
                  🧾 Open receipt ↗
                </a>
              )}
            </div>
            <input
              type="url"
              value={draft.receiptUrl}
              onChange={(e) => handleTextChange('receiptUrl', e.target.value)}
              onBlur={handleBlur}
              disabled={!canManageCosts}
              placeholder="https://..."
              style={{
                width: '100%',
                padding: '0.55rem 0.75rem',
                borderRadius: '6px',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                background: '#132127',
                color: '#fff',
                fontSize: '0.88rem',
              }}
            />
          </div>

          {/* Audit trail summary */}
          <div
            style={{
              padding: '0.75rem 1rem',
              borderRadius: '6px',
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.06)',
              fontSize: '0.78rem',
              color: 'var(--muted, #94a3b8)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.25rem',
            }}
          >
            <div>Logged By: <strong style={{ color: '#cbd5e1' }}>{expense.crew_name || 'Owner / Office'}</strong></div>
            <div>Recorded Date: <strong style={{ color: '#cbd5e1' }}>{formatDate(expense.created_at, accountTimeZone)}</strong></div>
            <div>Database ID: <code style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{expense.id}</code></div>
          </div>
        </div>

        {/* Drawer Footer */}
        <div
          style={{
            padding: '1rem 1.5rem',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'rgba(255, 255, 255, 0.02)',
          }}
        >
          {canManageCosts ? (
            <button
              type="button"
              className="btn secondary"
              disabled={isDeleting}
              onClick={handleDelete}
              style={{
                color: '#f87171',
                borderColor: 'rgba(248, 113, 113, 0.3)',
                padding: '0.45rem 0.85rem',
                fontSize: '0.85rem',
              }}
            >
              {isDeleting ? 'Deleting…' : '🗑 Delete Expense'}
            </button>
          ) : (
            <div />
          )}

          <button
            type="button"
            className="btn primary"
            onClick={onClose}
            style={{ padding: '0.45rem 1.25rem', fontSize: '0.85rem' }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}