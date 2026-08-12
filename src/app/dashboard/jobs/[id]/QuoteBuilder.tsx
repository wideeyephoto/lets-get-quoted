'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import type { QuoteItem, QuoteItemKind, QuoteSubscriptionFrequency } from '@/lib/jobs';
import type { DraftSource, SerializedDraft } from '@/lib/quote-draft';
import { guardSummary, type FindingSource, type QuoteFinding } from '@/lib/quote-guard';

type Row = QuoteItem;

export type PriceBookItem = { id: string; name: string; unitPrice: number; unit: string };

const UNIT_SUFFIX: Record<string, string> = { hour: '/hr', sqft: '/sqft', visit: '/visit', job: '/job' };
const FREQ_LABEL: Record<QuoteSubscriptionFrequency, string> = { weekly: '/wk', biweekly: '/2wk', monthly: '/mo' };
const FREQ_OPTIONS: { id: QuoteSubscriptionFrequency; label: string }[] = [
  { id: 'weekly', label: 'Weekly' },
  { id: 'biweekly', label: 'Every 2 weeks' },
  { id: 'monthly', label: 'Monthly' },
];

function formatUsd(amount: number): string {
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

/**
 * A stable fingerprint of the quote as the SERVER would see it.
 *
 * Row ids are generated from Date.now() and change every time a line is added
 * or an AI draft is applied, so JSON.stringify(rows) says "different" for two
 * quotes that are word for word the same. This compares what is actually
 * saved — and it is the thing that decides whether a stored draft is offered,
 * so a false difference is a restore prompt for an edit nobody made.
 */
function serializeRows(rows: Row[]): string {
  return JSON.stringify(
    rows
      .filter((row) => row.label.trim().length > 0)
      .map((row) => [
        row.label.trim(),
        Math.max(0, Number(row.amount) || 0),
        row.kind,
        row.selected ? 1 : 0,
        row.recommended ? 1 : 0,
        row.frequency ?? '',
        row.termCycles ?? 0,
        row.prepayDiscountPercent ?? 0,
      ]),
  );
}

/** "just now" / "6 minutes ago" / "2 hours ago". Rendered client-side only. */
function ago(at: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

// Owner-facing itemized quote editor on the job page. Rows are either base
// (always billed) or optional add-ons the client can accept. The running total
// mirrors what the client will see; Save persists the items and recomputes the
// job's quoted amount server-side.
export default function QuoteBuilder({
  action,
  notifyAction,
  autosaveKey,
  draftAction,
  reviewAction,
  initialItems,
  quotedAmount = 0,
  services = [],
  onItemsChange,
  approved = false,
  approvedTotal = 0,
  clientLabel = 'the customer',
  changeOrderHref,
  printHref,
}: {
  // Job page: persists on its own Save button. Lead form: omit action and pass
  // onItemsChange to feed a parent <form> (the form's submit does the saving).
  action?: (items: QuoteItem[], options?: { revision?: boolean }) => Promise<{ ok: boolean; total: number; message?: string; needsRevision?: boolean }>;
  /**
   * The customer has already agreed to this quote. Editing it is then a
   * revision of a live agreement rather than work on a draft, and the builder
   * says so before it saves. See saveQuoteItemsAction.
   */
  approved?: boolean;
  /** What they agreed to, for the sentence that names it. */
  approvedTotal?: number;
  clientLabel?: string;
  /** The cleaner route for extra work: bill the difference, not the whole job. */
  changeOrderHref?: string;
  /**
   * The printable estimate. Passed IN rather than left in the page's section
   * heading so that the three things you can do to a quote sit on one row
   * instead of one being up in the title bar and two buried below. Absent on
   * the lead form, which has no job to print yet.
   */
  printHref?: string;
  // AI drafting, where a job's scope exists to draft from. Absent on the lead
  // form, which has no saved job yet.
  draftAction?: () => Promise<
    { ok: true; draft: SerializedDraft } | { ok: false; reason: string; message: string }
  >;
  // Reads the quote as it stands right now. Saves nothing — so it can be run
  // over unsaved edits, which is the only moment it's actually useful.
  reviewAction?: (
    lines: { id: string; label: string; amount: number; kind: QuoteItemKind; selected: boolean }[],
  ) => Promise<{ ok: true; findings: QuoteFinding[]; aiRan: boolean } | { ok: false; message: string }>;
  /**
   * Save AND tell the homeowner the quote changed.
   *
   * The gap it closes: editing a quote that has already gone out and pressing
   * Save changed the number on the client's own page and notified nobody. Save
   * on its own stays, because "I am not finished yet" is a real state — this is
   * the other button, for when you are.
   */
  notifyAction?: (items: QuoteItem[]) => Promise<{
    ok: boolean;
    total: number;
    delivery: 'sms' | 'email' | 'none' | 'failed';
    message: string;
  }>;
  /**
   * Where the unsaved draft is kept, and the reason it can be kept at all.
   *
   * A quote is typed in one sitting on a phone in a driveway, and until now
   * every one of them lived in React state only: a reload, a back button, a
   * tab the OS reclaimed, and twenty minutes of pricing was gone with no trace
   * that anything had existed. Pass the job id and edits are written to this
   * browser as you type. Omitted — the lead form, which has no job yet — there
   * is no autosave, because there is nothing stable to key it to.
   */
  autosaveKey?: string;
  initialItems: QuoteItem[];
  /**
   * What the job says it is worth right now, itemized or not.
   *
   * An empty builder does NOT mean the job is worth nothing. A quote can be set
   * straight on the job — from a lead's estimate, or typed into the header —
   * without anybody breaking it into lines, and `saveQuoteItems` deliberately
   * leaves `quoted_amount` alone when the list is empty (src/lib/jobs.ts). Left
   * out, the summary below printed "Quote total $0.00" under a header reading
   * $2,790 on the same screen, next to a Save button. Nothing was actually
   * going to be zeroed, but there is no way to know that by looking.
   */
  quotedAmount?: number;
  services?: PriceBookItem[];
  onItemsChange?: (items: QuoteItem[]) => void;
}) {
  const idCounter = useRef(0);
  const nextId = () => `qi-${Date.now().toString(36)}-${(idCounter.current += 1)}`;
  const [rows, setRows] = useState<Row[]>(initialItems);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [subDraft, setSubDraft] = useState<{ open: boolean; label: string; amount: string; frequency: QuoteSubscriptionFrequency; term: string; discount: string }>({ open: false, label: '', amount: '', frequency: 'monthly', term: '', discount: '' });
  // The AI draft, held for review. It is never applied on arrival — see runDraft.
  const [draft, setDraft] = useState<SerializedDraft | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [review, setReview] = useState<{ findings: QuoteFinding[]; aiRan: boolean } | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  // Report every edit up to a parent in live mode, without re-firing when the
  // parent hands us a new callback identity.
  const onItemsChangeRef = useRef(onItemsChange);
  onItemsChangeRef.current = onItemsChange;
  useEffect(() => {
    onItemsChangeRef.current?.(rows);
  }, [rows]);

  /* ---------------------------------------------------------------------
     THE DRAFT THAT SURVIVES THE TAB CLOSING.

     A quote is typed in one sitting, often on a phone in a driveway, and until
     now it lived in React state only: a reload, a back button, or a tab the OS
     reclaimed took twenty minutes of pricing with it and left no evidence it
     had ever existed.

     WHAT IS DELIBERATELY NOT HAPPENING HERE. It does not auto-save to the
     SERVER. saveQuoteItems recomputes the job's quoted amount, and once a quote
     has been sent that number is on a page the homeowner can be looking at —
     so a background save would rewrite what somebody is reading, on a timer,
     because a finger brushed a keypad. What a contractor asked for is not
     losing work; what they did not ask for is their customer watching the price
     change while they think about it. So the browser keeps the draft and the
     person still decides when it becomes real.

     AND IT IS NEVER APPLIED WITHOUT BEING OFFERED. A stored draft that silently
     overwrote what the server has would be worse than losing it: it is older,
     it may be from a different device's idea of this job, and nobody asked. It
     is shown, with its age, and restored by pressing the button.
     --------------------------------------------------------------------- */
  const storageKey = autosaveKey ? `lgq.quote-draft.${autosaveKey}` : null;
  /** The last state we know the server has. Everything is diffed against it. */
  const savedRef = useRef(serializeRows(initialItems));
  const [stored, setStored] = useState<{ rows: Row[]; at: number } | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Read once, on mount. Offered rather than applied — see above.
  useEffect(() => {
    if (!storageKey) return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { rows?: Row[]; at?: number };
      if (!Array.isArray(parsed.rows)) return;
      // Identical to what the server already has is not a draft, it is noise.
      if (serializeRows(parsed.rows) === savedRef.current) {
        window.localStorage.removeItem(storageKey);
        return;
      }
      setStored({ rows: parsed.rows, at: Number(parsed.at) || Date.now() });
    } catch {
      // A corrupt or unreadable entry is not worth an error on a quote screen.
    }
  }, [storageKey]);

  // And written as you type, debounced. Cleared the moment the rows match what
  // the server has, so a contractor who undoes their own edit is not offered a
  // restore of the thing they just undid.
  useEffect(() => {
    if (!storageKey) return;
    const current = serializeRows(rows);
    const timer = window.setTimeout(() => {
      try {
        if (current === savedRef.current) {
          window.localStorage.removeItem(storageKey);
          setSavedAt(null);
          return;
        }
        const at = Date.now();
        window.localStorage.setItem(storageKey, JSON.stringify({ rows, at }));
        setSavedAt(at);
      } catch {
        // Private mode, a full quota, a browser with storage switched off. The
        // builder still works; it just cannot promise to remember.
      }
    }, 700);
    return () => window.clearTimeout(timer);
  }, [rows, storageKey]);

  function clearStoredDraft() {
    savedRef.current = serializeRows(rows);
    setSavedAt(null);
    setStored(null);
    if (storageKey) {
      try {
        window.localStorage.removeItem(storageKey);
      } catch {
        // Nothing to do about it, and nothing depends on it.
      }
    }
  }

  function updateRow(id: string, patch: Partial<Row>) {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
    setResult(null);
  }

  function addRow(kind: QuoteItemKind) {
    setRows((current) => [...current, { id: nextId(), label: '', amount: 0, kind, selected: kind === 'base', recommended: false }]);
    setResult(null);
  }

  function addFromService(serviceId: string) {
    const service = services.find((item) => item.id === serviceId);
    if (!service) return;
    setRows((current) => [...current, { id: nextId(), label: service.name, amount: service.unitPrice, kind: 'base', selected: true, recommended: false }]);
    setResult(null);
  }

  function removeRow(id: string) {
    setRows((current) => current.filter((row) => row.id !== id));
    setResult(null);
  }

  // Order is what the client reads top to bottom, so it's a pricing decision:
  // the thing you want accepted should not be stuck at the bottom just because
  // it was typed last.
  function moveRow(id: string, direction: -1 | 1) {
    setRows((current) => {
      const index = current.findIndex((row) => row.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setResult(null);
  }

  function addSubscription() {
    const label = subDraft.label.trim();
    const amount = Math.max(0, Number(subDraft.amount) || 0);
    if (!label || amount <= 0) return;
    const termCycles = Math.max(0, Math.floor(Number(subDraft.term) || 0));
    const prepayDiscountPercent = Math.min(100, Math.max(0, Number(subDraft.discount) || 0));
    setRows((current) => [...current, { id: nextId(), label, amount, kind: 'subscription', selected: true, recommended: false, frequency: subDraft.frequency, termCycles, prepayDiscountPercent }]);
    setSubDraft({ open: false, label: '', amount: '', frequency: 'monthly', term: '', discount: '' });
    setResult(null);
  }

  // Compact summary shown under a subscription row: its term and pay-in-full offer.
  function subCaption(row: Row): string {
    const parts: string[] = [];
    const term = row.termCycles ?? 0;
    if (term > 0) parts.push(`Ends after ${term} payment${term === 1 ? '' : 's'}`);
    const discount = row.prepayDiscountPercent ?? 0;
    if (term > 0 && discount > 0) {
      const full = (Number(row.amount) || 0) * term * (1 - discount / 100);
      parts.push(`pay in full ${formatUsd(full)} (save ${discount}%)`);
    }
    return parts.join(' · ');
  }

  // One-off total excludes subscriptions — they bill separately on their cadence.
  const total = rows.reduce((sum, row) => (row.kind === 'subscription' ? sum : row.kind === 'base' || row.selected ? sum + (Number(row.amount) || 0) : sum), 0);
  const addonTotal = rows
    .filter((row) => row.kind === 'addon')
    .reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  const subscriptionRows = rows.filter((row) => row.kind === 'subscription' && row.label.trim());
  // Nothing billable today, but a real recurring commitment.
  const planOnly = total === 0 && subscriptionRows.length > 0;
  // Nothing itemized, but the job carries a price. The summary reports the
  // job's number in this state, not the empty list's zero.
  const unitemized = rows.length === 0 && quotedAmount > 0;

  // Fetch a draft and hold it for review. Deliberately never writes into `rows`
  // on its own: a quote is a number somebody sends to a customer, and it should
  // only ever get there because a person put it there.
  async function runDraft() {
    if (!draftAction) return;
    setDrafting(true);
    setDraftError(null);
    setDraft(null);
    try {
      const result = await draftAction();
      if (result.ok) setDraft(result.draft);
      else setDraftError(result.message);
    } catch {
      setDraftError('Could not reach the drafter. Try again in a moment.');
    } finally {
      setDrafting(false);
    }
  }

  // Read the quote AS IT STANDS, including edits that haven't been saved. The
  // moment worth checking a quote is just before it goes out, not after it's
  // been persisted — so this deliberately sends the rows rather than a job id.
  async function runReview() {
    if (!reviewAction) return;
    setReviewing(true);
    setReviewError(null);
    setReview(null);
    try {
      const result = await reviewAction(
        rows
          .filter((row) => row.label.trim())
          .map((row) => ({
            id: row.id,
            label: row.label.trim(),
            amount: Math.max(0, Number(row.amount) || 0),
            kind: row.kind,
            selected: row.selected,
          })),
      );
      if (result.ok) setReview({ findings: result.findings, aiRan: result.aiRan });
      else setReviewError(result.message);
    } catch {
      setReviewError('Could not run the check. Try again in a moment.');
    } finally {
      setReviewing(false);
    }
  }

  // Applying is an explicit act with two explicit shapes — add to what's there,
  // or replace it. There is no third, quieter option.
  function applyDraft(mode: 'append' | 'replace') {
    if (!draft) return;
    const incoming = draft.items.map((item, index) => ({ ...item, id: `${item.id}-${Date.now().toString(36)}-${index}` }));
    setRows((current) => (mode === 'replace' ? incoming : [...current, ...incoming]));
    setDraft(null);
    setResult(null);
  }

  function cleanRows() {
    return rows
      .map((row) => ({ ...row, label: row.label.trim(), amount: Math.max(0, Number(row.amount) || 0) }))
      .filter((row) => row.label.length > 0);
  }

  /**
   * `revision` is only ever true after the confirm below. The server refuses a
   * save against an approved quote without it — see saveQuoteItemsAction — so
   * this is the moment the contractor is told, in figures, that they are about
   * to change a document somebody has already agreed to.
   */
  function save(revision = false) {
    if (!action) return;
    if (approved && !revision) {
      const message =
        `This quote has already been approved${approvedTotal > 0 ? ` at ${formatUsd(approvedTotal)}` : ''}.\n\n` +
        `Saving changes what ${clientLabel} sees, and their approval covered the previous version. ` +
        `They will get a note on their job page saying the total changed.\n\n` +
        `For extra work on top of an agreed price, a change order is cleaner — it asks them to approve just the difference.`;
      if (!window.confirm(message)) return;
    }
    const clean = cleanRows();
    startTransition(async () => {
      const res = await action(clean, revision || approved ? { revision: true } : undefined);
      setResult({ ok: res.ok, message: res.ok ? `Saved. Quote total ${formatUsd(res.total)}.` : res.message || 'Could not save the quote.' });
      // Only on a real save: a failed one still has work worth keeping.
      if (res.ok) clearStoredDraft();
    });
  }

  // Save and tell them. The result carries what ACTUALLY happened — a provider
  // failure comes back as a warning with the fix, never as a quiet success.
  function saveAndNotify() {
    if (!notifyAction) return;
    const clean = cleanRows();
    startTransition(async () => {
      const res = await notifyAction(clean);
      setResult({ ok: res.ok && res.delivery !== 'failed' && res.delivery !== 'none', message: res.message });
      if (res.ok) clearStoredDraft();
    });
  }

  return (
    <div className="quote-builder">
      {/* Offered, never applied. See the autosave block above for why. */}
      {stored ? (
        <div className="quote-restore-bar">
          <p>
            <strong>Unsaved changes from {ago(stored.at)}.</strong> They were kept in this browser
            when you left. Nothing was sent to the client.
          </p>
          <div className="quote-restore-actions">
            <button
              type="button"
              className="btn secondary"
              onClick={() => {
                setRows(stored.rows);
                setStored(null);
                setResult(null);
              }}
            >
              Restore them
            </button>
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                setStored(null);
                if (storageKey) {
                  try {
                    window.localStorage.removeItem(storageKey);
                  } catch {
                    // Nothing depends on it.
                  }
                }
              }}
            >
              Discard
            </button>
          </div>
        </div>
      ) : null}

      {/* ONE ROW UNDER THE HEADING, NOT TWO STACKED BARS.
          These were two full-width blocks, each a button beside a two-line
          explanation of what it did — a hundred words of instruction above a
          quote that had not been written yet, and the first thing on the
          screen every time the page loaded. They are tools, and tools belong on
          a toolbar: quiet, on one line, with the print button that was already
          up in the heading.

          The explanations move onto the buttons as titles rather than
          disappearing. What they were mostly doing was reassuring somebody that
          the AI would not send anything — and that promise is now kept
          structurally rather than claimed: nothing an action produces is
          applied until it is reviewed and accepted in the panel below. */}
      {draftAction || reviewAction || printHref ? (
        <div className="quote-head-actions">
          <div className="quote-head-tools">
            {draftAction ? (
              <button
                type="button"
                className="quote-tool"
                onClick={runDraft}
                disabled={drafting}
                title="Builds line items from this job’s scope, priced from your price book. You review everything before it goes anywhere."
              >
                <IconSpark />
                {drafting ? 'Drafting…' : 'Draft from scope'}
              </button>
            ) : null}
            {reviewAction ? (
              /* Present but disabled with nothing to check, rather than
                 appearing out of nowhere when the first line is typed. A
                 control that materialises is one you have to notice; one that
                 wakes up is one you were already looking at. */
              <button
                type="button"
                className="quote-tool"
                onClick={runReview}
                disabled={reviewing || rows.length === 0}
                title={
                  rows.length === 0
                    ? 'Add a line item first — there is nothing to check yet.'
                    : 'Checks the margin against your floor, compares it to similar jobs you’ve done, and looks for work the description mentions that isn’t priced here.'
                }
              >
                <IconLens />
                {reviewing ? 'Checking…' : 'Check before sending'}
              </button>
            ) : null}
          </div>
          {printHref ? (
            <a href={printHref} className="quote-print">
              <IconPrinter />
              Print estimate
            </a>
          ) : null}
        </div>
      ) : null}

      {draftError ? <p className="quote-draft-error">{draftError}</p> : null}
      {reviewError ? <p className="quote-draft-error">{reviewError}</p> : null}

      {review ? <QuoteReview review={review} onDismiss={() => setReview(null)} /> : null}

      {draft ? (
        <DraftReview
          draft={draft}
          hasRows={rows.length > 0}
          onApply={applyDraft}
          onDiscard={() => setDraft(null)}
        />
      ) : null}

      {rows.length === 0 ? (
        <p className="empty-state">No line items yet. Add what&apos;s included, then optional add-ons the client can accept.</p>
      ) : (
        <div className="quote-builder-rows">
          {rows.map((row, index) => (
            <div className={`quote-builder-row quote-builder-row-${row.kind}`} key={row.id}>
              <input
                type="text"
                className="quote-builder-label"
                value={row.label}
                placeholder={row.kind === 'subscription' ? 'e.g. Maintenance Plan' : row.kind === 'base' ? 'e.g. Tear-off and haul-away' : 'e.g. Upgrade to architectural shingles'}
                onChange={(event) => updateRow(row.id, { label: event.target.value })}
                aria-label="Line item description"
              />
              <div className="quote-builder-amount">
                <span aria-hidden="true">$</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={row.amount === 0 ? '' : row.amount}
                  placeholder="0"
                  onChange={(event) => updateRow(row.id, { amount: Number(event.target.value) })}
                  aria-label="Line item price"
                />
              </div>
              <div className="quote-builder-controls">
                {row.kind === 'subscription' ? (
                  <>
                    <span className="quote-builder-subtag">Recurring</span>
                    <select
                      value={row.frequency ?? 'monthly'}
                      onChange={(event) => updateRow(row.id, { frequency: event.target.value as QuoteSubscriptionFrequency })}
                      aria-label="Billing frequency"
                    >
                      {FREQ_OPTIONS.map((option) => (
                        <option key={option.id} value={option.id}>{option.label}</option>
                      ))}
                    </select>
                  </>
                ) : (
                  <>
                    <select
                      value={row.kind}
                      onChange={(event) => {
                        const kind = event.target.value as QuoteItemKind;
                        updateRow(row.id, { kind, selected: kind === 'base' ? true : row.selected });
                      }}
                      aria-label="Line item type"
                    >
                      <option value="base">Included</option>
                      <option value="addon">Optional add-on</option>
                    </select>
                  </>
                )}
                <span className="quote-builder-move">
                  <button
                    type="button"
                    onClick={() => moveRow(row.id, -1)}
                    disabled={index === 0}
                    aria-label={`Move "${row.label.trim() || 'this item'}" up`}
                  >↑</button>
                  <button
                    type="button"
                    onClick={() => moveRow(row.id, 1)}
                    disabled={index === rows.length - 1}
                    aria-label={`Move "${row.label.trim() || 'this item'}" down`}
                  >↓</button>
                </span>
                <button type="button" className="quote-builder-remove" onClick={() => removeRow(row.id)} aria-label="Remove line item">×</button>
              </div>

              {/* Add-on options get their own line. Sharing the controls row with
                  the type dropdown and the remove button left four controls
                  fighting one `auto` column — the price box collapsed to about
                  the width of its own "$", on the row whose price matters most.
                  A second line also leaves room to say what the two options DO,
                  which the labels alone never did. */}
              {row.kind === 'addon' ? (
                <div className="quote-builder-addon-options">
                  <label className="quote-builder-preselect">
                    <input
                      type="checkbox"
                      checked={row.selected}
                      onChange={(event) => updateRow(row.id, { selected: event.target.checked })}
                    />
                    <span>Pre-checked</span>
                  </label>
                  <label className={`quote-builder-recommend${row.recommended ? ' is-on' : ''}`}>
                    <input
                      type="checkbox"
                      checked={row.recommended}
                      onChange={(event) => updateRow(row.id, { recommended: event.target.checked })}
                    />
                    <span>★ Recommend</span>
                  </label>
                  <small className="quote-builder-addon-note">
                    Pre-checked starts ticked on the client&apos;s quote — they can untick it. Recommend adds a gold star beside it.
                  </small>
                </div>
              ) : null}
              {row.kind === 'subscription' && ((row.termCycles ?? 0) > 0 || (row.prepayDiscountPercent ?? 0) > 0) ? (
                <p className="quote-builder-subcaption">{subCaption(row)}</p>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {/* Sits with the line items, above the add buttons — a new plan is another
          row in the quote, and appearing BELOW the "+ Add subscription" button
          read as a separate thing that had nothing to do with the list. */}
      {subDraft.open ? <SubscriptionDraft draft={subDraft} setDraft={setSubDraft} onAdd={addSubscription} /> : null}

      <div className="quote-builder-actions">
        <button type="button" className="btn secondary" onClick={() => addRow('base')} disabled={pending}>+ Included item</button>
        <button type="button" className="btn secondary" onClick={() => addRow('addon')} disabled={pending}>+ Optional add-on</button>
        <button type="button" className="btn secondary quote-builder-add-sub" onClick={() => setSubDraft((current) => ({ ...current, open: true }))} disabled={pending}>+ Add subscription</button>
        {services.length > 0 ? (
          <select
            className="quote-book-picker"
            value=""
            disabled={pending}
            onChange={(event) => {
              if (event.target.value) addFromService(event.target.value);
              event.target.value = '';
            }}
            aria-label="Add a line item from your price book"
          >
            <option value="">+ From price book…</option>
            {services.map((service) => (
              <option key={service.id} value={service.id}>
                {service.name} — {formatUsd(service.unitPrice)}{service.unit && service.unit !== 'each' ? ` ${UNIT_SUFFIX[service.unit] ?? service.unit}` : ''}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      <div className="quote-builder-summary">
        {/* A plan-only quote genuinely has nothing due up front, so the total is
            $0 — but labelled "Quote total" that reads as an empty, broken quote
            rather than "$99/mo, nothing today". Name what the number IS.

            Same principle for an un-itemized job: the number is the job's
            quoted amount, so say that, rather than reporting $0.00 for a job
            the rest of the page prices in the thousands. */}
        <div className="quote-builder-total">
          <span>{unitemized ? 'Quoted amount' : planOnly ? 'Due up front' : 'Quote total'}</span>
          <strong>{formatUsd(unitemized ? quotedAmount : total)}</strong>
        </div>
        {unitemized ? (
          <p className="quote-builder-note">
            Set on the job rather than itemized here. Adding lines below replaces it with
            their total — leaving this empty keeps it exactly as it is.
          </p>
        ) : null}
        {addonTotal > 0 ? (
          <p className="quote-builder-note">Up to {formatUsd(addonTotal)} more if the client accepts every add-on.</p>
        ) : null}
        {subscriptionRows.length > 0 ? (
          <p className="quote-builder-note quote-builder-sub-note">
            {planOnly ? '' : 'Plus '}
            {subscriptionRows.map((row) => `${formatUsd(Number(row.amount) || 0)}${FREQ_LABEL[row.frequency ?? 'monthly']}`).join(' + ')}
            {planOnly ? ' on a recurring plan — nothing is charged today.' : ' in recurring plans, billed separately.'}
          </p>
        ) : null}
      </div>

      {/* AN AGREEMENT, NOT A DRAFT. Said before the buttons, because the whole
          point is that the person editing knows which of the two they are
          looking at. */}
      {action && approved ? (
        <div className="quote-approved-lock">
          <p>
            <strong>{clientLabel} has approved this quote{approvedTotal > 0 ? ` at ${formatUsd(approvedTotal)}` : ''}.</strong>{' '}
            Editing it changes what they see, and their approval covered the previous version.
          </p>
          {changeOrderHref ? (
            <a className="btn secondary compact" href={changeOrderHref}>
              Raise a change order instead
            </a>
          ) : null}
        </div>
      ) : null}

      {action ? (
        <div className="quote-builder-save">
          <button type="button" className="btn primary" onClick={() => save()} disabled={pending}>
            {pending ? 'Saving…' : approved ? 'Save revised quote' : 'Save quote'}
          </button>
          {notifyAction ? (
            <button type="button" className="btn secondary" onClick={saveAndNotify} disabled={pending}>
              {pending ? 'Saving…' : 'Save & text the client'}
            </button>
          ) : null}
          {result ? (
            <small className={`review-request-hint ${result.ok ? 'is-ok' : 'is-error'}`}>{result.message}</small>
          ) : null}
          {/* Two buttons need one sentence saying which is which, or the
              difference is discovered by pressing the wrong one. */}
          {notifyAction && !result ? (
            <small className="quote-builder-note quote-save-note">
              Save keeps it to yourself. Save &amp; text sends them the updated total and the link.
            </small>
          ) : null}
          {savedAt !== null ? (
            <small className="quote-builder-note quote-autosave-note">
              Draft kept in this browser · nothing has been sent
            </small>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

const SOURCE_LABEL: Record<DraftSource, string> = {
  'price-book': 'Your price',
  history: 'From past jobs',
  estimate: 'Check this price',
};

// Where a finding came from, named on the finding itself. "Your margin is 8%"
// and "this might need a permit" deserve different amounts of trust, and a
// contractor can only weigh them if the panel says which is which.
const FINDING_SOURCE_LABEL: Record<FindingSource, string> = {
  math: 'From your numbers',
  history: 'From your past jobs',
  ai: 'Suggestion — check it',
};

function QuoteReview({
  review,
  onDismiss,
}: {
  review: { findings: QuoteFinding[]; aiRan: boolean };
  onDismiss: () => void;
}) {
  const summary = guardSummary(review.findings);
  return (
    <section className={`quote-review is-${summary.tone}`} aria-label="Quote check">
      <div className="quote-review-head">
        <strong>{summary.message}</strong>
        <button type="button" className="btn ghost" onClick={onDismiss}>
          Dismiss
        </button>
      </div>

      {review.findings.length > 0 ? (
        <ul className="quote-review-list">
          {review.findings.map((finding) => (
            <li key={finding.id} className={`quote-review-item is-${finding.severity}`}>
              <div className="quote-review-item-head">
                <strong>{finding.title}</strong>
                <span className="quote-review-source">{FINDING_SOURCE_LABEL[finding.source]}</span>
              </div>
              <p>{finding.detail}</p>
            </li>
          ))}
        </ul>
      ) : null}

      {/* Nothing here is a blocker, and saying so is the honest framing: this
          catches what it can check, which is not the same as everything. */}
      <p className="quote-review-foot">
        Nothing here stops you sending the quote.
        {review.aiRan ? '' : ' The description check didn’t run — add a scope of work to include it.'}
      </p>
    </section>
  );
}

// The draft, held for review.
//
// Built around one question the owner has before they'll trust any of it:
// whose number is this? Every line says, and the ones that aren't theirs are
// the ones that stand out — not the other way round.
function DraftReview({
  draft,
  hasRows,
  onApply,
  onDiscard,
}: {
  draft: SerializedDraft;
  hasRows: boolean;
  onApply: (mode: 'append' | 'replace') => void;
  onDiscard: () => void;
}) {
  // Nothing to price. Say what's missing instead of showing an empty quote,
  // which would read as "this job is worth nothing".
  if (draft.needsMoreInfo || draft.items.length === 0) {
    return (
      <div className="quote-draft-panel is-thin">
        <p className="quote-draft-title">Not enough in the scope to draft a quote</p>
        {draft.questions.length > 0 ? (
          <>
            <p className="quote-draft-sub">Worth asking the customer:</p>
            <ul className="quote-draft-questions">
              {draft.questions.map((question) => <li key={question}>{question}</li>)}
            </ul>
          </>
        ) : (
          <p className="quote-draft-sub">Add more detail to the scope of work and try again.</p>
        )}
        <div className="quote-draft-actions">
          <button type="button" className="btn ghost" onClick={onDiscard}>Close</button>
        </div>
      </div>
    );
  }

  return (
    <div className="quote-draft-panel">
      <div className="quote-draft-head">
        <p className="quote-draft-title">Draft quote — {formatUsd(draft.total)}</p>
        <p className="quote-draft-confidence">{draft.confidence}</p>
      </div>

      {draft.summary ? <p className="quote-draft-sub">{draft.summary}</p> : null}

      <ul className="quote-draft-lines">
        {draft.items.map((item, index) => {
          const source = draft.provenance[index]?.source ?? 'estimate';
          const note = draft.provenance[index]?.note;
          return (
            <li key={item.id} className={`quote-draft-line source-${source}`}>
              <div className="quote-draft-line-top">
                <span className="quote-draft-line-label">
                  {item.label}
                  {item.kind === 'addon' ? <em className="quote-draft-addon">optional</em> : null}
                </span>
                <span className="quote-draft-line-amount">{formatUsd(item.amount)}</span>
              </div>
              <span className={`quote-draft-source source-${source}`}>{SOURCE_LABEL[source]}</span>
              {note ? <span className="quote-draft-note">{note}</span> : null}
            </li>
          );
        })}
      </ul>

      {draft.assumptions.length > 0 ? (
        <div className="quote-draft-assumptions">
          {/* The most useful thing on the panel: what it had to guess. */}
          <p className="quote-draft-sub">It assumed:</p>
          <ul>
            {draft.assumptions.map((assumption) => <li key={assumption}>{assumption}</li>)}
          </ul>
        </div>
      ) : null}

      <div className="quote-draft-actions">
        <button type="button" className="btn primary" onClick={() => onApply(hasRows ? 'append' : 'replace')}>
          {hasRows ? 'Add these lines' : 'Use these lines'}
        </button>
        {hasRows ? (
          <button type="button" className="btn secondary" onClick={() => onApply('replace')}>
            Replace what I have
          </button>
        ) : null}
        <button type="button" className="btn ghost" onClick={onDiscard}>Discard</button>
      </div>
      <small className="quote-draft-foot">Nothing is saved until you press Save quote.</small>
    </div>
  );
}

type SubDraft = { open: boolean; label: string; amount: string; frequency: QuoteSubscriptionFrequency; term: string; discount: string };

// The recurring-plan composer. Pulled out of the main render so it can sit up
// with the line items rather than trailing the add buttons.
//
// Every field carries a real label now. These were four placeholder-only inputs,
// and a placeholder disappears the moment you type — so "is this box the term or
// the discount?" had no answer once either was filled, on the one control that
// decides how long a customer gets billed.
function SubscriptionDraft({
  draft,
  setDraft,
  onAdd,
}: {
  draft: SubDraft;
  setDraft: (update: (current: SubDraft) => SubDraft) => void;
  onAdd: () => void;
}) {
  return (
    <div className="quote-builder-subpop">
      <p className="quote-builder-subpop-title">Add a recurring subscription / service plan</p>
      <label className="quote-builder-subfield">
        <span>Plan name</span>
        <input
          className="quote-builder-label"
          type="text"
          placeholder="Service Plan, Maintenance Plan, Warranty…"
          value={draft.label}
          onChange={(event) => setDraft((current) => ({ ...current, label: event.target.value }))}
        />
      </label>
      <div className="quote-builder-subpop-row">
        <label className="quote-builder-subfield">
          <span>Price per payment</span>
          <div className="quote-builder-amount">
            <span aria-hidden="true">$</span>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="0"
              value={draft.amount}
              onChange={(event) => setDraft((current) => ({ ...current, amount: event.target.value }))}
            />
          </div>
        </label>
        <label className="quote-builder-subfield">
          <span>Billed</span>
          <select
            value={draft.frequency}
            onChange={(event) => setDraft((current) => ({ ...current, frequency: event.target.value as QuoteSubscriptionFrequency }))}
          >
            {FREQ_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="quote-builder-subpop-row two">
        <label className="quote-builder-subfield">
          <span># of payments</span>
          <input type="number" min="0" step="1" placeholder="Leave blank to bill indefinitely" value={draft.term} onChange={(event) => setDraft((current) => ({ ...current, term: event.target.value }))} />
          <small>Leave blank for an indefinite recurring plan — it bills until someone cancels.</small>
        </label>
        <label className="quote-builder-subfield">
          <span>Pay-in-full discount</span>
          <input type="number" min="0" max="100" step="1" placeholder="Optional — e.g. 10" value={draft.discount} onChange={(event) => setDraft((current) => ({ ...current, discount: event.target.value }))} />
          <small>A % off if they pay the whole term up front. Needs a number of payments above.</small>
        </label>
      </div>
      <div className="quote-builder-subpop-actions">
        <button type="button" className="btn ghost" onClick={() => setDraft(() => ({ open: false, label: '', amount: '', frequency: 'monthly', term: '', discount: '' }))}>Cancel</button>
        <button type="button" className="btn primary" onClick={onAdd} disabled={!draft.label.trim() || !(Number(draft.amount) > 0)}>Add plan</button>
      </div>
    </div>
  );
}

/**
 * The toolbar's three glyphs.
 *
 * Line art rather than the ✨ and 🔍 that were sitting inside the button
 * labels: an emoji is a font, it renders at a different weight and color on
 * every platform, and it cannot take the muted grey these buttons are set in.
 * currentColor throughout, so they dim with the label when a button is
 * disabled.
 */
function IconSpark() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3.5 13.6 8 18 9.6 13.6 11.2 12 15.7 10.4 11.2 6 9.6 10.4 8Z" />
      <path d="M18.5 15.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7ZM5.5 15.5l.5 1.4 1.4.5-1.4.5-.5 1.4-.5-1.4L3.6 17.4l1.4-.5Z" />
    </svg>
  );
}

function IconLens() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m15.5 15.5 4.5 4.5" />
    </svg>
  );
}

function IconPrinter() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 9V3.5h10V9" />
      <path d="M5 9h14a2 2 0 0 1 2 2v5h-4M6 16H2v-5a2 2 0 0 1 2-2" />
      <rect x="7" y="13.5" width="10" height="7" rx="1" />
    </svg>
  );
}
