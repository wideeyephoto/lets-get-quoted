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
  onOcrFile?: (dataUrl: string) => Promise<{ ok: true; csv: string; count: number } | { ok: false; error: string }>;
  ocrLabel?: string;
  doneHref: string;
  doneLabel: string;
};

export default function SmartImport({ fields, noun, analyze, runPreview, commit, onOcrFile, ocrLabel, doneHref, doneLabel }: SmartImportProps) {
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
  const [ocrLoading, setOcrLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  async function handleOcrImage(file: File) {
    if (!onOcrFile) return;
    setError(null);
    setFileName(file.name);
    setBusy(true);
    setOcrLoading(true);

    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('Failed to read image file'));
        reader.readAsDataURL(file);
      });

      const ocrRes = await onOcrFile(dataUrl);
      if (!ocrRes.ok) {
        setError(ocrRes.error || "We couldn't read that image with AI OCR.");
        setFileText('');
        setFileName('');
        if (fileInputRef.current) fileInputRef.current.value = '';
        if (cameraInputRef.current) cameraInputRef.current.value = '';
        return;
      }

      const csv = ocrRes.csv;
      setFileText(csv);
      setFileName(`📷 OCR: ${file.name} (${ocrRes.count} ${ocrRes.count === 1 ? noun.one : noun.many} extracted)`);

      // Run analyze immediately on OCR result
      const analyzeRes = await analyze(csv);
      if (!analyzeRes.ok) {
        setError(analyzeRes.error === 'empty' ? 'No items found in OCR scan.' : `We couldn't structure any ${noun.many} from that photo.`);
        return;
      }
      setRawText(csv);
      setPreview(analyzeRes);
      setSources(analyzeRes.sources);
      setRows(analyzeRes.sampleRows);
      setTotal(analyzeRes.totalRows);
      setPhase('preview');
    } catch {
      setError('Something went wrong processing that photo. Please try a CSV or high-contrast image.');
      setFileText('');
      setFileName('');
    } finally {
      setBusy(false);
      setOcrLoading(false);
    }
  }

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      setFileText('');
      setFileName('');
      return;
    }

    const isImage = file.type.startsWith('image/') || /\.(png|jpe?g|webp|bmp|gif|heic)$/i.test(file.name);
    if (isImage && onOcrFile) {
      await handleOcrImage(file);
      return;
    }

    setError(null);
    setFileName(file.name);
    setBusy(true);
    try {
      setFileText(await readImportFile(file));
    } catch {
      setError("We couldn't read that file. Try a CSV, Excel (.xlsx), vCard (.vcf), or photo.");
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
        {onOcrFile ? (
          <div className="field full" style={{ padding: '1rem', border: '1px dashed var(--accent, #6366f1)', borderRadius: '8px', background: 'rgba(99, 102, 241, 0.05)', marginBottom: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div>
                <strong style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-bright, #fff)' }}>
                  <span>📷</span> {ocrLabel || 'Photo / Document AI OCR Scanner'}
                </strong>
                <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: 'var(--muted, rgba(255,255,255,0.7))' }}>
                  Snap a photo or upload an image of your paper rate sheet, laminated menu, or catalog. AI OCR extracts items, prices, units, and descriptions automatically.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => cameraInputRef.current?.click()}
                  disabled={busy}
                  style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                >
                  <span>📸</span> Take Photo
                </button>
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={busy}
                  style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                >
                  <span>🖼️</span> Upload Photo
                </button>
              </div>
            </div>
            <input
              id="si-camera"
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={onFile}
              style={{ display: 'none' }}
            />
          </div>
        ) : null}

        {ocrLoading ? (
          <div className="field full" style={{ padding: '0.85rem', borderRadius: '6px', background: 'rgba(99, 102, 241, 0.12)', border: '1px solid rgba(99, 102, 241, 0.3)', textAlign: 'center' }}>
            <p style={{ margin: 0, fontWeight: 500, color: 'var(--accent-glow, #a5b4fc)' }}>
              ⚡ Scanning photo & transcribing line items with AI OCR… Please hold on.
            </p>
          </div>
        ) : null}

        <div className="field full">
          <label htmlFor="si-file">
            Upload a spreadsheet or photo{' '}
            <span style={{ color: 'rgba(255,255,255,0.5)', fontWeight: 400 }}>
              — CSV, Excel (.xlsx), vCard (.vcf){onOcrFile ? ', or Photo / Scan (JPG, PNG, WebP)' : ''}
            </span>
          </label>
          <input
            id="si-file"
            ref={fileInputRef}
            type="file"
            accept={onOcrFile ? '.csv,.tsv,.txt,.xlsx,.xls,.vcf,.png,.jpg,.jpeg,.webp,text/csv,text/plain,text/vcard,image/png,image/jpeg,image/webp' : '.csv,.tsv,.txt,.xlsx,.xls,.vcf,text/csv,text/plain,text/vcard'}
            onChange={onFile}
            disabled={busy}
          />
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
            disabled={busy}
          />
        </div>

        {error ? <div className="field full"><p className="payment-banner muted">{error}</p></div> : null}

        <div className="field full">
          <AiSparkleButton onClick={analyzeNow} loading={busy} loadingLabel={ocrLoading ? 'Scanning with AI OCR...' : 'Analyzing with AI...'}>
            Analyze & preview
          </AiSparkleButton>
        </div>
      </div>
    </section>
  );
}
