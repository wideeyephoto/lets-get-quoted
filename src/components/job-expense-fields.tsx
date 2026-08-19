'use client';

import { useEffect, useState } from 'react';
import type { CrewMember } from '@/lib/crew';
import type { CostType } from '@/lib/jobs';
import { COST_SOURCE_LABEL, COST_SOURCE_NOTE, SELECTABLE_COST_SOURCES, type CostSource } from '@/lib/cost-truth';
import { describeReceiptRead, type ReceiptRead } from '@/lib/receipt-read';

type JobExpenseFieldsProps = {
  crew: CrewMember[];
  /** Server action that turns a receipt photo into a draft. Never saves. */
  onReadReceipt: (dataUrl: string) => Promise<{ ok: true; read: ReceiptRead } | { ok: false; error: string }>;
};

type ScanState =
  | { state: 'idle' }
  | { state: 'reading' }
  | { state: 'done'; read: ReceiptRead }
  | { state: 'error'; message: string };

const DESCRIPTION_PRESETS = [
  'Additional material charge',
  'Permit fee',
  'Change order',
  'Dump fee',
];

// Explicit expense type instead of guessing from a magic description string, so
// Subcontractor and Other are reachable (they were unreachable before) and the
// margin breakdown buckets each cost correctly. 'receipt' stays valid in the DB
// but isn't offered here.
const TYPE_OPTIONS: { value: CostType; label: string }[] = [
  { value: 'material', label: 'Materials' },
  { value: 'sub', label: 'Subcontractor' },
  { value: 'labor', label: 'Labor' },
  { value: 'other', label: 'Other' },
];

export default function JobExpenseFields({ crew, onReadReceipt }: JobExpenseFieldsProps) {
  const [type, setType] = useState<CostType>('material');
  const [description, setDescription] = useState('');
  const isLabor = type === 'labor';
  // Hours typed after the fact are a recollection; a material spend usually has
  // a receipt behind it. Defaulting each to its likely truth means the honest
  // answer is also the one that takes no clicks.
  const [source, setSource] = useState<CostSource>('receipt');
  useEffect(() => {
    setSource(isLabor ? 'estimated' : 'receipt');
  }, [isLabor]);

  const [supplier, setSupplier] = useState('');
  const [amount, setAmount] = useState('');
  const [scan, setScan] = useState<ScanState>({ state: 'idle' });

  async function scanReceipt(file: File) {
    setScan({ state: 'reading' });
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Could not open that file.'));
        reader.readAsDataURL(file);
      });
      const result = await onReadReceipt(dataUrl);
      if (!result.ok) {
        setScan({ state: 'error', message: result.error });
        return;
      }
      // Fill only what was actually read. A field the model returned null for is
      // left alone rather than blanked — the person may have already typed it,
      // and overwriting their input with "nothing" is the worst outcome here.
      const { read } = result;
      if (read.supplier) setSupplier(read.supplier);
      if (read.total !== null) setAmount(String(read.total));
      if (!description && read.lines.length > 0) {
        setDescription(read.lines.length === 1 ? read.lines[0].description : `${read.supplier ?? 'Supplies'} — ${read.lines.length} items`);
      }
      setSource('receipt');
      setScan({ state: 'done', read });
    } catch (error) {
      setScan({ state: 'error', message: error instanceof Error ? error.message : 'Could not read that photo.' });
    }
  }

  const verdict = scan.state === 'done' ? describeReceiptRead(scan.read) : null;

  return (
    <>
      {!isLabor ? (
        <div className="field full receipt-scan">
          <label htmlFor="receipt-photo">Scan a receipt</label>
          <input
            id="receipt-photo"
            type="file"
            accept="image/*"
            capture="environment"
            disabled={scan.state === 'reading'}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) void scanReceipt(file);
              event.currentTarget.value = '';
            }}
          />
          {/* Says what it did and what it didn't. Filling a form silently from a
              photo is how a misread total ends up in somebody's books unchecked. */}
          {scan.state === 'reading' ? <small className="field-hint">Reading…</small> : null}
          {scan.state === 'error' ? <small className="field-hint is-error">{scan.message}</small> : null}
          {verdict ? <small className={`field-hint${verdict.tone === 'ok' ? '' : ' is-error'}`}>{verdict.message}</small> : null}
          {scan.state !== 'done' && scan.state !== 'reading' ? (
            <small className="field-hint">Fills in the supplier and total. You check them, then save.</small>
          ) : null}
        </div>
      ) : null}

      <div className="field">
        <label htmlFor="cost-type">Expense type</label>
        <select id="cost-type" name="type" value={type} onChange={(event) => setType(event.currentTarget.value as CostType)}>
          {TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {/* Where the number came from, asked at the moment it's entered rather
          than reconstructed later. "Receipt" and "I think it was about $400"
          are both legitimate ways to record a cost — what isn't legitimate is a
          margin that can't tell you which one it was built from. */}
      <div className="field">
        <label htmlFor="cost-source">Where this figure came from</label>
        <select
          id="cost-source"
          name="costSource"
          value={source}
          onChange={(event) => setSource(event.currentTarget.value as CostSource)}
        >
          {SELECTABLE_COST_SOURCES.map((option) => (
            <option key={option} value={option}>
              {COST_SOURCE_LABEL[option]}
            </option>
          ))}
        </select>
        <small className="field-hint">{COST_SOURCE_NOTE[source]}</small>
      </div>

      <div className="field">
        <label htmlFor="description">Description</label>
        <input
          id="description"
          name="description"
          required
          placeholder={isLabor ? 'Framing crew - 2 days' : 'Architectural shingles - Owens Corning Duration'}
          list="cost-description-presets"
          value={description}
          onChange={(event) => setDescription(event.currentTarget.value)}
        />
        <datalist id="cost-description-presets">
          {DESCRIPTION_PRESETS.map((preset) => (
            <option key={preset} value={preset} />
          ))}
        </datalist>
        <div className="quick-add-buttons" aria-label="Quick add:">
          <span>Quick add:</span>
          {DESCRIPTION_PRESETS.map((preset) => (
            <button key={preset} type="button" onClick={() => setDescription(preset)}>
              {preset}
            </button>
          ))}
        </div>
      </div>

      {!isLabor ? (
        <>
          <div className="field money-field">
            <label htmlFor="amount">Amount ($)</label>
            <div className="currency-input">
              <span aria-hidden="true">$</span>
              <input
                id="amount"
                name="amount"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                required
                placeholder="450.00"
                value={amount}
                onChange={(event) => setAmount(event.currentTarget.value)}
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="supplier">Supplier</label>
            <input
              id="supplier"
              name="supplier"
              placeholder="Ferguson Plumbing Supply"
              value={supplier}
              onChange={(event) => setSupplier(event.currentTarget.value)}
            />
          </div>
        </>
      ) : (
        <div className="cost-form-row">
          <div className="field">
            <label htmlFor="hours">Hours</label>
            <input id="hours" name="hours" type="number" min="0" step="0.25" required placeholder="32" />
          </div>
          <div className="field">
            <label htmlFor="rate">Rate $/hr</label>
            <input id="rate" name="rate" type="number" min="0" step="0.01" required placeholder="45" />
          </div>
          <div className="field">
            <label htmlFor="crewId">Crew member</label>
            <select id="crewId" name="crewId" defaultValue="">
              <option value="">- Unassigned -</option>
              {crew.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div className="field full">
        <label htmlFor="supplier">Notes</label>
        <textarea id="supplier" name="supplier" placeholder="Optional notes for this expense" />
      </div>
    </>
  );
}
