'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from '../leads.module.css';

type PreviewFrequency = 'weekly' | 'biweekly' | 'monthly';
type PreviewItem = { id: string; label: string; amount: number; kind: 'base' | 'addon' | 'subscription'; selected: boolean; recommended: boolean; frequency: PreviewFrequency; termCycles: number; prepayDiscountPercent: number };
type PreviewSchedule = { date: string; time: string | null };
type PreviewDeposit =
  | { terms: 'deposit'; value: number; unit: 'percent' | 'fixed'; timing: 'before_schedule' | 'before_work' }
  | { terms: 'plan'; pct: number; count: number; freq: PreviewFrequency };
type PreviewHours = { show: boolean; value: number };

const FREQ_SUFFIX: Record<PreviewFrequency, string> = { weekly: '/wk', biweekly: '/2wk', monthly: '/mo' };
const FREQ_WORD: Record<PreviewFrequency, string> = { weekly: 'weekly', biweekly: 'every 2 weeks', monthly: 'monthly' };

function formatUsd(amount: number): string {
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function fmtDate(dateKey: string): string {
  return new Date(`${dateKey}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function fmtTime(time: string | null): string {
  if (!time) return 'Flexible time';
  const [h, m] = time.split(':').map(Number);
  if (!Number.isFinite(h)) return 'Flexible time';
  const d = new Date();
  d.setHours(h, m || 0, 0, 0);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

// The term + pay-in-full line shown under a subscription, as the client sees it.
function subCaption(item: PreviewItem): string {
  const parts: string[] = [];
  if (item.termCycles > 0) parts.push(`${item.termCycles} payments`);
  if (item.termCycles > 0 && item.prepayDiscountPercent > 0) {
    const full = item.amount * item.termCycles * (1 - item.prepayDiscountPercent / 100);
    parts.push(`or ${formatUsd(full)} up front — save ${item.prepayDiscountPercent}%`);
  }
  return parts.join(' · ');
}

// Reads the live itemized quote from the hidden #quoteItems field the lead form
// keeps in sync, dropping unlabeled rows (which the server drops too).
function readItems(): PreviewItem[] {
  const el = document.getElementById('quoteItems') as HTMLInputElement | null;
  if (!el?.value) return [];
  try {
    const parsed = JSON.parse(el.value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item.label === 'string' && item.label.trim() && Number.isFinite(Number(item.amount)))
      .map((item) => ({
        id: String(item.id ?? Math.random()),
        label: String(item.label).trim(),
        amount: Math.max(0, Number(item.amount) || 0),
        kind: item.kind === 'addon' ? 'addon' : item.kind === 'subscription' ? 'subscription' : 'base',
        selected: item.kind === 'addon' ? Boolean(item.selected) : true,
        recommended: Boolean(item.recommended),
        frequency: (item.frequency === 'weekly' ? 'weekly' : item.frequency === 'biweekly' ? 'biweekly' : 'monthly') as PreviewFrequency,
        termCycles: Math.max(0, Math.floor(Number(item.termCycles) || 0)),
        prepayDiscountPercent: Math.min(100, Math.max(0, Number(item.prepayDiscountPercent) || 0)),
      }));
  } catch {
    return [];
  }
}

// The three optional start-date options the contractor set (hidden inputs the
// QuoteStartDateCalendar writes). Scoped to the send-quote form so it never
// picks up a stray field elsewhere on the page.
function readSchedule(scope: ParentNode): PreviewSchedule[] {
  const out: PreviewSchedule[] = [];
  for (let i = 1; i <= 3; i++) {
    const date = (scope.querySelector(`input[name="quoteScheduleDate${i}"]`) as HTMLInputElement | null)?.value?.trim();
    const time = (scope.querySelector(`input[name="quoteScheduleTime${i}"]`) as HTMLInputElement | null)?.value?.trim();
    if (date) out.push({ date, time: time || null });
  }
  return out;
}

function readDeposit(scope: ParentNode): PreviewDeposit | null {
  const terms = (scope.querySelector('input[name="paymentTerms"]:checked') as HTMLInputElement | null)?.value ?? 'full';
  if (terms === 'deposit') {
    const value = Number((scope.querySelector('input[name="depositValue"]') as HTMLInputElement | null)?.value) || 0;
    if (value <= 0) return null;
    const unit = (scope.querySelector('select[name="depositUnit"]') as HTMLSelectElement | null)?.value === 'fixed' ? 'fixed' : 'percent';
    const timing = (scope.querySelector('select[name="depositTiming"]') as HTMLSelectElement | null)?.value === 'before_work' ? 'before_work' : 'before_schedule';
    return { terms: 'deposit', value, unit, timing };
  }
  if (terms === 'plan') {
    const pct = Math.min(99, Math.max(1, Number((scope.querySelector('input[name="planDepositPercent"]') as HTMLInputElement | null)?.value) || 50));
    const count = Math.max(1, Number((scope.querySelector('input[name="planInstallments"]') as HTMLInputElement | null)?.value) || 4);
    const raw = (scope.querySelector('select[name="planFrequency"]') as HTMLSelectElement | null)?.value;
    const freq: PreviewFrequency = raw === 'weekly' || raw === 'biweekly' ? raw : 'monthly';
    return { terms: 'plan', pct, count, freq };
  }
  return null;
}

function readHours(scope: ParentNode): PreviewHours {
  const show = Boolean((scope.querySelector('input[name="showHoursToClient"]') as HTMLInputElement | null)?.checked);
  const value = Number((scope.querySelector('input[name="estimatedHours"]') as HTMLInputElement | null)?.value) || 0;
  return { show, value };
}

// A plain-language line for the payment terms, as the client will read it.
function describeDeposit(deposit: PreviewDeposit, total: number): string {
  if (deposit.terms === 'deposit') {
    const amount = Math.min(deposit.unit === 'percent' ? (total * deposit.value) / 100 : deposit.value, total);
    const when = deposit.timing === 'before_work' ? 'before work starts' : 'before scheduling';
    return `Deposit of ${formatUsd(amount)} due ${when}; the balance is billed after.`;
  }
  const depositAmount = (total * deposit.pct) / 100;
  return `Payment plan: ${formatUsd(depositAmount)} (${deposit.pct}%) deposit now, then ${deposit.count} ${FREQ_WORD[deposit.freq]} payment${deposit.count === 1 ? '' : 's'} for the balance. 0% interest.`;
}

// Shows the contractor exactly what their client sees when the quote lands — the
// branded approval screen with line items, optional upsells, ongoing plans, the
// payment terms, estimated time (when shown), and the start-date options — reusing
// the real client quote-document markup/styles so the preview matches production.
export default function QuotePreviewButton({
  businessName,
  clientName,
}: {
  businessName: string;
  clientName: string;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<PreviewItem[]>([]);
  // Live add-on selection so the preview toggles exactly like the client's
  // screen — showing the contractor that clients can add or remove upsells.
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [schedule, setSchedule] = useState<PreviewSchedule[]>([]);
  const [deposit, setDeposit] = useState<PreviewDeposit | null>(null);
  const [hours, setHours] = useState<PreviewHours>({ show: false, value: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  // Portals need a DOM to aim at, so nothing is rendered into one until after
  // hydration — server and first client render stay identical.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  function openPreview() {
    // Scope the non-#quoteItems reads to the send-quote form so a duplicate field
    // name elsewhere on the page (e.g. the edit modal's hours input) can't leak in.
    const scope: ParentNode = btnRef.current?.closest('form') ?? document;
    const next = readItems();
    setItems(next);
    setSelected(Object.fromEntries(next.filter((item) => item.kind === 'addon').map((item) => [item.id, item.selected])));
    setSchedule(readSchedule(scope));
    setDeposit(readDeposit(scope));
    setHours(readHours(scope));
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const baseItems = items.filter((item) => item.kind === 'base');
  const addonItems = items.filter((item) => item.kind === 'addon');
  const subscriptionItems = items.filter((item) => item.kind === 'subscription');
  const total = baseItems.reduce((sum, item) => sum + item.amount, 0) + addonItems.filter((item) => selected[item.id]).reduce((sum, item) => sum + item.amount, 0);

  // RENDER THE POPUP INTO document.body, NOT WHERE THE BUTTON SITS.
  //
  // The button lives inside the send-quote <section className="panel">, and
  // .panel carries backdrop-filter: blur(20px). A non-none backdrop-filter makes
  // that element the containing block for any position:fixed descendant — so
  // "fixed; inset: 0" stopped meaning the viewport and started meaning the
  // panel's box. The overlay was laid out 500-odd pixels above the top of the
  // screen (its title bar and close button off-screen entirely) and then
  // clipped by the panel's own overflow: hidden.
  //
  // Chrome let you scroll to what was left and tap it, so it merely looked
  // misplaced. Safari refuses to hit-test through the clip, so on an iPad the
  // popup opened and then answered nothing — not the close button, not the
  // add-on toggles, not a tap on the backdrop. It reads exactly like a freeze,
  // but the page is fine; the controls are somewhere you can't reach.
  //
  // A portal to <body> puts the overlay outside every panel, which is what the
  // other modals in the app already do (ModalDialog, ImagePickerModal).
  const modal = open ? (
    <div className={styles.modalBackdrop} role="dialog" aria-modal="true" aria-label="Quote preview" onClick={() => setOpen(false)}>
          <section className={styles.quotePreviewCard} onClick={(event) => event.stopPropagation()}>
            <div className={styles.quotePreviewBar}>
              <span><span aria-hidden="true">👁</span> Preview — what your client sees</span>
              <button type="button" className={styles.modalCloseButton} onClick={() => setOpen(false)} aria-label="Close preview">x</button>
            </div>
            <div className={styles.quotePreviewStage}>
              <div className={styles.quotePreviewHero}>
                <p className="eyebrow">{businessName}</p>
                <h3>{clientName || 'Your client'}</h3>
              </div>
              <p className={styles.quotePreviewHeading}>Approve your quote</p>
              {baseItems.length === 0 && addonItems.length === 0 && subscriptionItems.length === 0 ? (
                <p className={styles.quotePreviewNote}>Add line items and they’ll show here exactly as your client sees them.</p>
              ) : (
                <>
                <div className="quote-document">
                  {baseItems.length > 0 ? (
                    <div className="quote-doc-group">
                      <p className="quote-doc-group-label">Included in your quote</p>
                      <ul className="quote-doc-list">
                        {baseItems.map((item) => (
                          <li className="quote-doc-line" key={item.id}>
                            <span className="quote-doc-line-label">{item.label}</span>
                            <span className="quote-doc-line-amount">{formatUsd(item.amount)}</span>
                          </li>
                        ))}
                      </ul>
                      {hours.show && hours.value > 0 ? (
                        <p className="quote-doc-sub-note">Estimated time: {hours.value} {hours.value === 1 ? 'hour' : 'hours'}.</p>
                      ) : null}
                    </div>
                  ) : null}
                  {addonItems.length > 0 ? (
                    <div className="quote-doc-group">
                      <p className="quote-doc-group-label">Optional add-ons</p>
                      <ul className="quote-doc-list quote-doc-addons">
                        {addonItems.map((item) => {
                          const isOn = Boolean(selected[item.id]);
                          return (
                            <li className={`quote-doc-addon${isOn ? ' is-selected' : ''}`} key={item.id}>
                              <label className="quote-doc-addon-hit">
                                <input
                                  className="quote-doc-addon-input"
                                  type="checkbox"
                                  checked={isOn}
                                  onChange={(event) => setSelected((current) => ({ ...current, [item.id]: event.target.checked }))}
                                />
                                <span className="quote-doc-addon-name">
                                  {item.label}
                                  {item.recommended ? <span className="quote-doc-badge">★ Recommended</span> : null}
                                </span>
                                <span className="quote-doc-addon-price">+{formatUsd(item.amount)}</span>
                                <span className="quote-doc-addon-btn" aria-hidden="true">{isOn ? '✓ Added' : '+ Add'}</span>
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ) : null}
                  {subscriptionItems.length > 0 ? (
                    <div className="quote-doc-group">
                      <p className="quote-doc-group-label">Ongoing plans</p>
                      <ul className="quote-doc-list">
                        {subscriptionItems.map((item) => (
                          <li className="quote-doc-line" key={item.id}>
                            <span className="quote-doc-line-label">{item.label}{subCaption(item) ? <small className="quote-doc-subline">{subCaption(item)}</small> : null}</span>
                            <span className="quote-doc-line-amount">{formatUsd(item.amount)}{FREQ_SUFFIX[item.frequency]}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  <div className="quote-doc-total">
                    <span>Your total{subscriptionItems.length > 0 ? ' today' : ''}</span>
                    <strong>{formatUsd(total)}</strong>
                  </div>
                  {deposit ? (
                    <p className="quote-doc-sub-note quote-doc-deposit-note">{describeDeposit(deposit, total)}</p>
                  ) : null}
                  <button type="button" className="btn primary" disabled>Approve quote</button>
                  {schedule.length > 0 ? (
                    <div className="quote-doc-group quote-doc-schedule">
                      <p className="quote-doc-group-label">Choose your start date</p>
                      <ul className="quote-doc-list">
                        {schedule.map((option, index) => (
                          <li className="quote-doc-line" key={`${option.date}-${index}`}>
                            <span className="quote-doc-line-label">Option {index + 1} — {fmtDate(option.date)}</span>
                            <span className="quote-doc-line-amount">{fmtTime(option.time)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
                {addonItems.length > 0 ? (
                  <p className={styles.quotePreviewNote}>Add-ons are interactive here, exactly like your client sees — toggle one to watch the total update.</p>
                ) : null}
                {subscriptionItems.length > 0 ? (
                  <p className={styles.quotePreviewNote}>Recurring plans bill separately on their own schedule — the client signs up when they approve.</p>
                ) : null}
                {schedule.length > 0 ? (
                  <p className={styles.quotePreviewNote}>The client taps a start date to approve and book in one step.</p>
                ) : null}
                </>
              )}
            </div>
          </section>
    </div>
  ) : null;

  return (
    <>
      <button ref={btnRef} type="button" className={`btn ghost ${styles.previewQuoteBtn}`} onClick={openPreview}>
        <span aria-hidden="true">👁</span> Preview
      </button>
      {mounted && modal ? createPortal(modal, document.body) : null}
    </>
  );
}
