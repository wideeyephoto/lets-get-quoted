'use client';

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { calculateRoomSummary, formatSpatialTakeoffReport, type RoomSpatialScan, type RoomDimensionsSummary, type CustomTradeRates } from '@/lib/property-intel/room-spatial-intel';
import { MAX_ROOM_SCAN_BYTES, parseCustomScanJson } from '@/lib/property-intel/room-scan-validation';
import { RoomScanScene } from './RoomScanScene';
import { modalStackFor } from '@/components/modal-stack';
import styles from './room-scan-viewer.module.css';

export type RoomScanViewerProps = {
  scan?: RoomSpatialScan;
  target?: { kind: 'job' | 'lead'; id: string };
  className?: string;
  scope?: string | null;
  trade?: string | null;
  customRates?: CustomTradeRates;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  defaultOpen?: boolean;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  mode?: 'popup' | 'inline';
  isPromoted?: boolean;
  onApplyDimensions?: (summary: RoomDimensionsSummary) => void | Promise<void>;
};

export function RoomScanViewer(props: RoomScanViewerProps) {
  // Reset local state on navigation even when a parent reuses this component.
  const identity = props.target ? `${props.target.kind}:${props.target.id}` : JSON.stringify(props.scan ?? null);
  return <RoomScanSession key={identity} {...props} />;
}

function RoomScanSession({ scan: initialScan, target, className = '', mode = 'popup', defaultOpen = false,
  isOpen: controlledIsOpen, onOpenChange, onApplyDimensions, collapsible = false, defaultCollapsed = false }: RoomScanViewerProps) {
  const [scan, setScan] = useState<RoomSpatialScan | null>(() => {
    if (target || !initialScan) return null;
    try { return parseCustomScanJson(JSON.stringify(initialScan)); } catch { return null; }
  });
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const [collapsed, setCollapsed] = useState(collapsible && defaultCollapsed);
  const [mounted, setMounted] = useState(false);
  const [busy, setBusy] = useState<'loading' | 'importing' | 'applying' | null>(target ? 'loading' : null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [loadFailed, setLoadFailed] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(true);
  const importingRef = useRef(false);
  const dialogId = useId();
  const isStudioOpen = controlledIsOpen ?? internalOpen;
  const endpoint = target ? `/api/room-scans?kind=${target.kind}&id=${encodeURIComponent(target.id)}` : null;
  const summary = useMemo(() => scan ? calculateRoomSummary(scan) : null, [scan]);
  const changeOpen = useCallback((open: boolean) => {
    if (controlledIsOpen === undefined) setInternalOpen(open);
    onOpenChange?.(open);
  }, [controlledIsOpen, onOpenChange]);
  const closeStudio = useCallback(() => changeOpen(false), [changeOpen]);

  useEffect(() => { mountedRef.current = true; setMounted(true); return () => { mountedRef.current = false; }; }, []);
  useEffect(() => {
    if (!endpoint) return;
    const controller = new AbortController();
    setBusy('loading');
    setLoadFailed(false);
    setError(null);
    void (async () => {
      try {
        const response = await fetch(endpoint, { signal: controller.signal, cache: 'no-store' });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'Could not load the saved scan.');
        const loaded = body.scan ? parseCustomScanJson(JSON.stringify(body.scan)) : null;
        if (!controller.signal.aborted) setScan(loaded);
      } catch (e) {
        if (!controller.signal.aborted) { setError(e instanceof Error ? e.message : 'Could not load the saved scan.'); setLoadFailed(true); }
      } finally { if (!controller.signal.aborted) setBusy(null); }
    })();
    return () => controller.abort();
  }, [endpoint, retry]);

  useEffect(() => {
    if (!isStudioOpen || !mounted || mode !== 'popup' || !backdropRef.current) return;
    return modalStackFor(document).register({ id: dialogId, backdrop: backdropRef.current,
      trigger: triggerRef.current, requestClose: closeStudio,
      focusInitial: () => backdropRef.current?.querySelector<HTMLButtonElement>('button')?.focus(), setTopmost: () => {} });
  }, [isStudioOpen, mounted, mode, dialogId, closeStudio]);

  async function importFile(file: File) {
    if (busy || importingRef.current || loadFailed) return;
    importingRef.current = true;
    setError(null); setMessage(null); setBusy('importing');
    try {
      if (!file.name.toLowerCase().endsWith('.json')) throw new Error('Choose an LGQ normalized scan JSON file.');
      if (file.size > MAX_ROOM_SCAN_BYTES) throw new Error('Scan JSON must be 1 MB or smaller.');
      const raw = await file.text();
      let imported = parseCustomScanJson(raw);
      if (endpoint) {
        const response = await fetch(endpoint, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(imported) });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'Could not save this scan.');
        imported = parseCustomScanJson(JSON.stringify(body.scan));
      }
      if (mountedRef.current) {
        setScan(imported);
        setMessage(target?.kind === 'lead'
          ? 'Scan saved to this lead. AI quote drafts can use it after conversion to a job.'
          : endpoint ? 'Scan saved. The next AI quote draft will use these room measurements.' : 'Scan loaded for this session.');
      }
    } catch (e) {
      if (mountedRef.current) setError(e instanceof Error ? e.message : 'Could not import this scan.');
    } finally {
      importingRef.current = false;
      if (mountedRef.current) { setBusy(null); if (fileRef.current) fileRef.current.value = ''; }
    }
  }

  async function copyReport() {
    if (!scan || !summary) return;
    setError(null);
    try { await navigator.clipboard.writeText(formatSpatialTakeoffReport(scan, summary)); setMessage('Dimensions copied.'); }
    catch { setError('Clipboard access failed. Download the CSV instead.'); }
  }

  function downloadCsv() {
    if (!scan || !summary) return;
    const cell = (value: string | number) => `"${String(value).replace(/^[=+@\-\t\r]/, "'$&").replace(/"/g, '""')}"`;
    const rows = [
      ['Room', scan.title], ['Source', scan.device], ['Capture time', scan.scannedAt],
      ['Note', 'Imported dimensions; confirm critical spans on site before ordering.'],
      ['Metric', 'Quantity', 'Unit'], ['Floor Area', summary.floorAreaSqFt, 'sq ft'],
      ['Net Paintable Walls', summary.netPaintableWallSqFt, 'sq ft'],
      ['Baseboard Trim', summary.baseboardLinearFt, 'lin ft'], ['Perimeter', summary.perimeterLinearFt, 'lin ft'],
      ['Ceiling Height', summary.ceilingHeightFt, 'ft'], ['Openings Area', summary.openingsAreaSqFt, 'sq ft'],
    ];
    const url = URL.createObjectURL(new Blob([rows.map(row => row.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = 'room-takeoff.csv';
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage('CSV downloaded.');
  }

  async function applyDimensions() {
    if (!summary || !onApplyDimensions) return;
    setBusy('applying'); setError(null);
    try { await onApplyDimensions(summary); if (mountedRef.current) setMessage('Dimensions applied.'); }
    catch { if (mountedRef.current) setError('Could not apply dimensions. Try again.'); }
    finally { if (mountedRef.current) setBusy(null); }
  }

  const importButton = <button type="button" className={styles.btnSecondary} disabled={Boolean(busy) || loadFailed} onClick={() => fileRef.current?.click()}>{scan ? 'Replace Scan' : '📁 Import Scan'}</button>;
  const content = <div className={`${mode === 'popup' ? styles.studioInnerContent : styles.container} ${className}`}>
    <div className={styles.header}>
      <div className={styles.headerLeft}><span className={styles.studioBadge}>✦ LiDAR Studio</span><h3 id={`${dialogId}-title`} className={styles.headerTitle}>Room measurements</h3></div>
      <div className={styles.controlsWrap}>
        {importButton}
        {mode === 'popup' && <button type="button" className={styles.btnSecondary} onClick={() => setFullscreen(!fullscreen)}>{fullscreen ? 'Exit Fullscreen' : '⛶ Fullscreen'}</button>}
        {mode === 'popup' ? <button type="button" className={styles.studioCloseBtn} onClick={closeStudio}>✕ Close Studio</button>
          : collapsible && <button type="button" className={styles.btnSecondary} onClick={() => setCollapsed(true)}>Collapse</button>}
      </div>
    </div>
    <input ref={fileRef} type="file" accept=".json,application/json" hidden aria-label="Import room scan JSON" onChange={e => { const file = e.target.files?.[0]; if (file) void importFile(file); }} />
    {busy && <p className={styles.scanNotice} role="status">{busy === 'loading' ? 'Loading saved scan…' : busy === 'importing' ? 'Validating and saving scan…' : 'Applying dimensions…'}</p>}
    {error && <div className={styles.scanError} role="alert">{error} {loadFailed && <button type="button" className={styles.btnSecondary} onClick={() => setRetry(value => value + 1)}>Retry</button>}</div>}
    {message && <p className={styles.scanNotice} role="status">{message}</p>}
    {!scan && !busy && !loadFailed && <div className={styles.scanEmpty} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const file = e.dataTransfer.files[0]; if (file) void importFile(file); }}>
      <h4>No room scan attached</h4>
      <p>Import measured room geometry to view the room and calculate flooring, wall area, and baseboard quantities.</p>
      {importButton}
    </div>}
    <p className={styles.scanNotice}>Accepts LGQ normalized scan JSON (inches, up to 1 MB). Native Apple RoomPlan, Polycam, USDZ, and raw point clouds need conversion before import. <a href="/docs/room-scan-format.json" download>Download format example</a></p>
    {scan && summary && <>
      <h4 className={styles.scanNotice}>{scan.title}</h4>
      <RoomScanScene key={JSON.stringify(scan)} scan={scan} />
      <div className={styles.metricsGrid}>
        {[
          ['Floor Surface', summary.floorAreaSqFt, 'sq ft', 'Imported floor polygon'],
          ['Net Paintable Walls', summary.netPaintableWallSqFt, 'sq ft', `Excludes ${summary.openingsAreaSqFt} sq ft openings`],
          ['Baseboard Trim', summary.baseboardLinearFt, 'lin ft', 'Door and passage widths deducted'],
          ['Ceiling Height', summary.ceilingHeightFt, 'ft', 'Flat ceiling'],
        ].map(([label, value, unit, note]) => <div className={styles.metricCard} key={label}><span className={styles.metricLabel}>{label}</span><div className={styles.metricValue}>{value} <span className={styles.metricUnit}>{unit}</span></div><span className={styles.metricSubtext}>{note}</span></div>)}
      </div>
      <p className={styles.scanNotice}>{scan.device} · {scan.scannedAt}. Imported measurements; confirm critical spans on site before ordering. {target?.kind === 'lead' ? 'Saved to this lead for the linked job.' : target ? 'Saved for the next AI quote draft.' : 'Session preview; this scan is not saved to a job.'}</p>
      <div className={styles.actionsBar}><div className={styles.actionsRight}>
        <button type="button" className={styles.btnSecondary} onClick={() => void copyReport()}>📋 Copy Dimensions</button>
        <button type="button" className={styles.btnSecondary} onClick={downloadCsv}>📥 Download CSV</button>
        {onApplyDimensions && <button type="button" className={styles.btnApply} disabled={Boolean(busy)} onClick={() => void applyDimensions()}>Apply Dimensions</button>}
      </div></div>
    </>}
  </div>;

  if (mode === 'inline') return collapsed ? <button type="button" className={styles.btnSecondary} onClick={() => setCollapsed(false)}>Open LiDAR Studio</button> : content;
  return <>
    <button type="button" ref={triggerRef} className={`${styles.studioPopupLinkCard} ${styles.scanLauncher} ${className}`} onClick={() => changeOpen(true)}
      aria-haspopup="dialog" aria-expanded={isStudioOpen} aria-controls={dialogId}>
      <span className={styles.studioBadge}>✦ LiDAR Studio</span>
      <strong>3D Room Spatial Intel &amp; LiDAR Takeoffs</strong>
      <span>{busy === 'loading' ? 'Loading saved scan…' : loadFailed ? 'Saved scan unavailable — open to retry' : scan && summary ? `${scan.title} · ${summary.floorAreaSqFt} sq ft floor` : 'No room scan attached — import measured geometry'}</span>
      <span>Launch LiDAR Studio ↗</span>
    </button>
    {isStudioOpen && mounted && createPortal(<div ref={backdropRef} className={styles.studioModalBackdrop} onClick={e => { if (e.target === e.currentTarget) closeStudio(); }} role="presentation">
      <div id={dialogId} className={`${styles.studioModalDialog} ${fullscreen ? styles.fullscreenModal : ''}`} role="dialog" aria-modal="true" aria-labelledby={`${dialogId}-title`}>{content}</div>
    </div>, document.body)}
  </>;
}
