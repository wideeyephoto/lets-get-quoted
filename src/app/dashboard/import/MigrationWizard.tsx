'use client';

import Link from 'next/link';
import { useRef, useState, type ChangeEvent } from 'react';
import { readImportFile } from '@/lib/read-import-file';
import type { ImportEntity } from '@/lib/import-classify';
import { classifyMigrationFiles, runMigration, type MigrationResult } from './actions';

type FileRow = { name: string; text: string; entity: ImportEntity | 'skip'; rowCount: number };

const ENTITY_OPTIONS: { value: ImportEntity | 'skip'; label: string }[] = [
  { value: 'clients', label: 'Clients' },
  { value: 'services', label: 'Services (price book)' },
  { value: 'jobs', label: 'Jobs' },
  { value: 'invoices', label: 'Invoices & payments' },
  { value: 'skip', label: '— Skip this file —' },
];
const ENTITY_LABEL: Record<string, string> = { clients: 'Clients', services: 'Services', jobs: 'Jobs', invoices: 'Invoices & payments' };

export default function MigrationWizard() {
  const [phase, setPhase] = useState<'select' | 'review' | 'running' | 'done'>('select');
  const [files, setFiles] = useState<FileRow[]>([]);
  const [results, setResults] = useState<MigrationResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function onFiles(e: ChangeEvent<HTMLInputElement>) {
    const list = Array.from(e.target.files ?? []);
    if (!list.length) return;
    setError(null);
    setBusy(true);
    try {
      const read = await Promise.all(list.map(async (f) => ({ name: f.name, text: await readImportFile(f) })));
      const classified = await classifyMigrationFiles(read);
      setFiles(read.map((r, i) => ({ name: r.name, text: r.text, entity: classified[i]?.entity ?? 'clients', rowCount: classified[i]?.rowCount ?? 0 })));
      setPhase('review');
    } catch {
      setError("We couldn't read one of those files. Use CSV, Excel (.xlsx), or vCard (.vcf).");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  function setEntity(i: number, entity: ImportEntity | 'skip') {
    setFiles((prev) => prev.map((f, idx) => (idx === i ? { ...f, entity } : f)));
  }

  async function importAll() {
    setBusy(true);
    setError(null);
    setPhase('running');
    try {
      const res = await runMigration(files.map((f) => ({ name: f.name, text: f.text, entity: f.entity })));
      setResults(res);
      setPhase('done');
    } catch {
      setError('The migration failed. Please try again.');
      setPhase('review');
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setPhase('select');
    setFiles([]);
    setResults([]);
    setError(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  const activeCount = files.filter((f) => f.entity !== 'skip').length;

  // ---- Done -----------------------------------------------------------------
  if (phase === 'done') {
    const totals = results.reduce(
      (a, r) => ({ imported: a.imported + r.imported, duplicates: a.duplicates + r.duplicates, skipped: a.skipped + r.skipped }),
      { imported: 0, duplicates: 0, skipped: 0 },
    );
    return (
      <section className="panel workspace-section-card" style={{ borderColor: '#16a34a', background: 'rgba(22, 163, 74, 0.06)' }}>
        <div className="section-heading workspace-section-heading">
          <p className="eyebrow" style={{ color: '#16a34a' }}>✓ Migration complete</p>
          <h2>{totals.imported} record{totals.imported === 1 ? '' : 's'} imported</h2>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="workspace-preview-table">
            <thead><tr><th>File</th><th>Imported as</th><th>Imported</th><th>Duplicates</th><th>Skipped / note</th></tr></thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={i}>
                  <td>{r.name}</td>
                  <td>{ENTITY_LABEL[r.entity] ?? r.entity}</td>
                  <td>{r.error ? <span className="muted">—</span> : r.imported}</td>
                  <td>{r.error ? <span className="muted">—</span> : r.duplicates}</td>
                  <td>{r.error ? <span style={{ color: '#f59e0b' }}>{r.error}</span> : r.skipped}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="workspace-card-copy" style={{ marginTop: '0.9rem' }}>
          {totals.imported} imported · {totals.duplicates} already on file · {totals.skipped} skipped. Importing jobs and invoices also filled in the matching customers.
        </p>
        <div className="workspace-inline-row">
          <Link href="/dashboard/jobs" className="btn primary">View your jobs →</Link>
          <Link href="/dashboard/clients" className="btn secondary">View clients</Link>
          <button type="button" className="btn secondary" onClick={reset}>Migrate more files</button>
        </div>
      </section>
    );
  }

  // ---- Review / running -----------------------------------------------------
  if (phase === 'review' || phase === 'running') {
    return (
      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading">
          <p className="eyebrow">Step 2</p>
          <h2>Confirm what each file is</h2>
        </div>
        <p className="workspace-card-copy" style={{ marginTop: 0 }}>
          We guessed the type of each file — change any that look wrong, or skip a file. On import we auto-match the
          columns for each and run them in the right order (clients → services → jobs → invoices).
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table className="workspace-preview-table">
            <thead><tr><th>File</th><th>~ Rows</th><th>Import as</th></tr></thead>
            <tbody>
              {files.map((f, i) => (
                <tr key={i}>
                  <td>{f.name}</td>
                  <td>{f.rowCount}</td>
                  <td>
                    <select value={f.entity} onChange={(e) => setEntity(i, e.target.value as ImportEntity | 'skip')} disabled={phase === 'running'}>
                      {ENTITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {error ? <p className="payment-banner muted">{error}</p> : null}
        <div className="workspace-inline-row">
          <button type="button" className="btn primary" onClick={importAll} disabled={busy || activeCount === 0}>
            {phase === 'running' ? 'Importing…' : `Import ${activeCount} file${activeCount === 1 ? '' : 's'}`}
          </button>
          <button type="button" className="btn secondary" onClick={reset} disabled={busy}>← Start over</button>
        </div>
      </section>
    );
  }

  // ---- Select ---------------------------------------------------------------
  return (
    <section className="panel workspace-section-card">
      <div className="section-heading workspace-section-heading">
        <p className="eyebrow">Step 1</p>
        <h2>Add your exports</h2>
      </div>
      <div className="form-grid">
        <div className="field full">
          <label htmlFor="mw-files">Choose files <span style={{ color: 'rgba(255,255,255,0.5)', fontWeight: 400 }}>— CSV, Excel (.xlsx), or vCard (.vcf). Pick several at once.</span></label>
          <input id="mw-files" ref={inputRef} type="file" multiple accept=".csv,.tsv,.txt,.xlsx,.xls,.vcf,text/csv,text/plain,text/vcard" onChange={onFiles} />
        </div>
        {busy ? <div className="field full"><p className="workspace-card-copy">Reading files…</p></div> : null}
        {error ? <div className="field full"><p className="payment-banner muted">{error}</p></div> : null}
      </div>
    </section>
  );
}
