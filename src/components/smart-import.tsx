'use client';

import Link from 'next/link';
import { useRef, useState, type ChangeEvent } from 'react';
import { readImportFile } from '@/lib/read-import-file';
import type { SmartImportPreview, CommitResult, FieldSources, MappedRow } from '@/lib/smart-import';
import { AiSparkleButton } from '@/components/ai';

type Ready = Extract<SmartImportPreview, { ok: true }>;

const COMBINED = '__combined__';

export type SmartImportProps = {
  fields: { key: string; label: string }[];
  noun: { one: string; many: string };
  analyze: (text: string) => Promise<SmartImportPreview>;
  runPreview: (text: string, sources: FieldSources, hasHeader: boolean) => Promise<{ sampleRows: MappedRow[]; totalRows: number }>;
  commit: (text: string, sources: FieldSources, hasHeader: boolean) => Promise<CommitResult>;
  doneHref: string;
  doneLabel: string;
};

export default function SmartImport({ fields, noun, analyze, runPreview, commit, doneHref, doneLabel }: SmartImportProps) {
  const [phase, setPhase] = useState<'upload' | 'preview' | 'done'>('upload');
  const [pasted, setPasted] = useState('');
  const [fileText, setFileText] = useState('');
  const [fileName, setFileName] = useState('');
  const [rawText, setRawText] = useState('');
  const [preview, setPreview] = useState<Ready | null>(null);
  const [sources, setSources] = useState<FieldSources>({});
  const [rows, setRows] = useState<MappedRow[]>([]);
  const [total, setTotal] = useState(0);
  const [result, setResult] = useState<{ imported: number; duplicates: number; skipped: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      setFileText('');
      setFileName('');
      return;
    }
    setError(null);
    setFileName(file.name);
    setBusy(true);
    try {
      setFileText(await readImportFile(file));
    } catch {
      setError("We couldn't read that file. Try a CSV, Excel (.xlsx), or vCard (.vcf).");
      setFileText('');
      setFileName('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    } finally {
      setBusy(false);
    }
  }

  async function analyzeNow() {
    setError(null);
    const text = (fileText || pasted).trim();
    if (!text) {
      setError('Choose a file or paste some rows first.');
      return;
    }
    setBusy(true);
    try {
      const res = await analyze(text);
      if (!res.ok) {
        setError(res.error === 'empty' ? 'Choose a file or paste some rows first.' : `We couldn't find any ${noun.many} in that.`);
        return;
      }
      setRawText(text);
      setPreview(res);
      setSources(res.sources);
      setRows(res.sampleRows);
      setTotal(res.totalRows);
      setPhase('preview');
    } catch {
      setError('Something went wrong reading that file. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function refresh(next: FieldSources) {
    if (!preview) return;
    try {
      const res = await runPreview(rawText, next, preview.hasHeader);
      setRows(res.sampleRows);
      setTotal(res.totalRows);
    } catch {
      /* keep the last good preview */
    }
  }

  function reassign(key: string, value: string) {
    if (value === COMBINED) return;
    const next: FieldSources = { ...sources, [key]: value === '' ? [] : [Number(value)] };
    setSources(next);
    void refresh(next);
  }

  function selectValue(key: string): string {
    const idxs = sources[key] ?? [];
    if (idxs.length === 0) return '';
    if (idxs.length === 1) return String(idxs[0]);
    return COMBINED;
  }

  async function confirmImport() {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      const res = await commit(rawText, sources, preview.hasHeader);
      if (res.error) {
        setError('Nothing to import — check the column matches above.');
        return;
      }
      setResult({ imported: res.imported, duplicates: res.duplicates, skipped: res.skipped });
      setPhase('done');
    } catch {
      setError('The import failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  function startOver() {
    setPhase('upload');
    setPreview(null);
    setRows([]);
    setTotal(0);
    setResult(null);
    setError(null);
    setPasted('');
    setFileText('');
    setFileName('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  // ---- Done -----------------------------------------------------------------
  if (phase === 'done' && result) {
    return (
      <section className="panel workspace-section-card" style={{ borderColor: '#16a34a', background: 'rgba(22, 163, 74, 0.06)' }}>
        <div className="section-heading workspace-section-heading">
          <p className="eyebrow" style={{ color: 'var(--good)' }}>✓ Import complete</p>
          <h2>{result.imported} {result.imported === 1 ? noun.one : noun.many} added</h2>
        </div>
        <p className="workspace-card-copy">
          {result.imported} new {result.imported === 1 ? noun.one : noun.many} imported
          {result.duplicates > 0 ? `, ${result.duplicates} already on file (skipped)` : ''}
          {result.skipped > 0 ? `, ${result.skipped} skipped` : ''}.
        </p>
        <div className="workspace-inline-row">
          <Link href={doneHref} className="btn primary">{doneLabel} →</Link>
          <button type="button" className="btn secondary" onClick={startOver}>Import another list</button>
        </div>
      </section>
    );
  }

  // ---- Preview & confirm ----------------------------------------------------
  if (phase === 'preview' && preview) {
    return (
      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading">
          <p className="eyebrow">Step 2</p>
          <h2>Check the matches</h2>
        </div>

        <p className="workspace-card-copy" style={{ marginTop: 0 }}>
          {preview.usedAi
            ? 'We matched your columns with AI — double-check them below and fix any that look off before importing.'
            : 'We matched your columns from their headings — double-check them below before importing.'}
        </p>

        <div className="form-grid">
          {fields.map(({ key, label }) => (
            <div className="field" key={key}>
              <label htmlFor={`map-${key}`}>{label}</label>
              <select id={`map-${key}`} value={selectValue(key)} onChange={(e) => reassign(key, e.target.value)}>
                <option value="">— Not imported —</option>
                {selectValue(key) === COMBINED ? (
                  <option value={COMBINED}>
                    Combined: {(sources[key] ?? []).map((i) => preview.columnLabels[i] ?? `Column ${i + 1}`).join(' + ')}
                  </option>
                ) : null}
                {preview.columnLabels.map((labelText, i) => (
                  <option value={i} key={i}>{labelText}</option>
                ))}
              </select>
            </div>
          ))}
        </div>

        <div style={{ overflowX: 'auto', marginTop: '1rem' }}>
          <table className="workspace-preview-table">
            <thead>
              <tr>{fields.map(({ key, label }) => <th key={key}>{label}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i}>
                  {fields.map(({ key }) => (
                    <td key={key}>{row[key] ?? <span className="muted">—</span>}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="workspace-card-copy" style={{ marginTop: '0.9rem' }}>
          {total > 0
            ? `Showing the first ${rows.length} of ${total} ${total === 1 ? noun.one : noun.many} ready to import. Already-on-file records are skipped automatically.`
            : `No importable rows with the current matches — pick the required column(s) above.`}
        </p>

        {error ? <p className="payment-banner muted">{error}</p> : null}

        <div className="workspace-inline-row">
          <button type="button" className="btn primary" onClick={confirmImport} disabled={busy || total === 0}>
            {busy ? 'Importing…' : `Import ${total} ${total === 1 ? noun.one : noun.many}`}
          </button>
          <button type="button" className="btn secondary" onClick={startOver} disabled={busy}>← Start over</button>
        </div>
      </section>
    );
  }

  // ---- Upload ---------------------------------------------------------------
  return (
    <section className="panel workspace-section-card">
      <div className="section-heading workspace-section-heading">
        <p className="eyebrow">Step 1</p>
        <h2>Upload or paste</h2>
      </div>

      <div className="form-grid">
        <div className="field full">
          <label htmlFor="si-file">Upload a file <span style={{ color: 'rgba(255,255,255,0.5)', fontWeight: 400 }}>— CSV, Excel (.xlsx), or vCard (.vcf)</span></label>
          <input id="si-file" ref={fileInputRef} type="file" accept=".csv,.tsv,.txt,.xlsx,.xls,.vcf,text/csv,text/plain,text/vcard" onChange={onFile} />
          {fileName ? <p className="workspace-card-copy" style={{ margin: '0.4rem 0 0' }}>Selected: {fileName}</p> : null}
        </div>
        <div className="field full">
          <label htmlFor="si-paste">…or paste rows</label>
          <textarea
            id="si-paste"
            rows={10}
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            placeholder={'Any columns, any order — we figure out the rest.'}
            style={{ fontFamily: 'ui-monospace, monospace', fontSize: '0.85rem' }}
          />
        </div>
        {error ? <div className="field full"><p className="payment-banner muted">{error}</p></div> : null}
        <div className="field full">
          <AiSparkleButton onClick={analyzeNow} loading={busy} loadingLabel="Analyzing with AI...">
            Analyze & preview
          </AiSparkleButton>
        </div>
      </div>
    </section>
  );
}
