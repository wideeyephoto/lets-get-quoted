'use client';

import { useEffect, useMemo, useState } from 'react';
// useFormState, not useActionState: this is React 18 (Next 14), where the hook
// still lives in react-dom. Same shape, same place EstimateOffers gets it.
import { useFormState, useFormStatus } from 'react-dom';
import {
  composeRescheduleMessage,
  DEFAULT_DISCOUNT_PERCENT,
  discountAmount,
  DISCOUNT_OPTIONS,
  draftRescheduleBody,
  dayWord,
  IDLE_RESCHEDULE_STATE,
  MAX_OFFER_BODY,
} from '@/lib/reschedule-offers';
import {
  sendRescheduleOfferAction,
  suggestRescheduleDaysAction,
  type RescheduleDaySuggestionView,
} from './reschedule-actions';

// "This stop is dragging the day sideways — ask them to move, and pay them to."
//
// The panel is deliberately in this order: what it costs YOU first, then what it
// costs THEM, then the words. The owner is about to give away real money, and
// the number that justifies it (the driving this saves) should be the first
// thing on screen — not a footnote under a message they have already half
// decided to send.

type Props = {
  jobId: string;
  stopLabel: string;
  dateKey: string;
  crewId: string | null;
  businessName: string;
  /** What today gets back if this stop leaves it — computed from the live order. */
  saved: { miles: number; minutes: number };
  onClose: () => void;
};

function Submit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn primary" disabled={disabled || pending}>
      {pending ? 'Sending…' : 'Send this text'}
    </button>
  );
}

export default function RescheduleOffer({ jobId, stopLabel, dateKey, crewId, businessName, saved, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<RescheduleDaySuggestionView[]>([]);
  const [clientName, setClientName] = useState<string | null>(null);
  const [quotedAmount, setQuotedAmount] = useState(0);

  const [chosen, setChosen] = useState<string | null>(null);
  const [discount, setDiscount] = useState<number>(DEFAULT_DISCOUNT_PERCENT);
  // Null until the owner types: the draft is regenerated as they change the day
  // or the discount, and an edit has to stop that from overwriting their words.
  const [edited, setEdited] = useState<string | null>(null);

  const [state, action] = useFormState(sendRescheduleOfferAction, IDLE_RESCHEDULE_STATE);

  useEffect(() => {
    let cancelled = false;
    suggestRescheduleDaysAction({ jobId, fromDate: dateKey })
      .then((result) => {
        if (cancelled) return;
        if (!result.ok) {
          setLoadError(result.message);
        } else {
          setSuggestions(result.suggestions);
          setClientName(result.clientName);
          setQuotedAmount(result.quotedAmount);
          setChosen(result.suggestions[0]?.dateKey ?? null);
        }
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoadError('Could not work out which days would suit. Try again in a moment.');
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [jobId, dateKey]);

  const selected = suggestions.find((suggestion) => suggestion.dateKey === chosen) ?? null;

  const draft = useMemo(() => {
    if (!selected) return '';
    return draftRescheduleBody({
      clientName,
      fromWord: dayWord(dateKey, dateKey),
      toWord: dayWord(selected.dateKey, dateKey),
      windowLabel: selected.windowLabel,
      discountPercent: discount,
    });
  }, [selected, clientName, dateKey, discount]);

  const body = edited ?? draft;
  const cost = discountAmount(quotedAmount, discount);

  return (
    <div className="resched-panel" role="dialog" aria-label={`Ask ${stopLabel} to move day`}>
      <div className="resched-head">
        <div>
          <p className="eyebrow">Ask them to move</p>
          <h3>{stopLabel}</h3>
        </div>
        <button type="button" className="resched-close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>

      {/* The case for doing this at all, before anything about the money. */}
      <p className="resched-saving">
        Taking this off today saves <strong>{saved.minutes} min</strong> of driving
        {saved.miles >= 0.1 ? <> and <strong>{saved.miles.toFixed(1)} mi</strong></> : null}.
      </p>

      {loading ? <p className="resched-loading">Looking for a day you&rsquo;re already over that way…</p> : null}

      {loadError ? <p className="payment-banner muted resched-alert">{loadError}</p> : null}

      {!loading && !loadError && suggestions.length === 0 ? (
        <p className="payment-banner muted resched-alert">
          Nothing in the next three weeks puts you near this address, so there&rsquo;s no honest reason to offer them a
          move. Leave it where it is.
        </p>
      ) : null}

      {selected ? (
        <form action={action} className="resched-form">
          <input type="hidden" name="jobId" value={jobId} />
          <input type="hidden" name="fromDate" value={dateKey} />
          <input type="hidden" name="crewId" value={crewId ?? ''} />
          <input type="hidden" name="toDate" value={selected.dateKey} />
          <input type="hidden" name="windowStart" value={selected.windowStart} />
          <input type="hidden" name="windowEnd" value={selected.windowEnd} />
          <input type="hidden" name="arrivalTime" value={selected.arrivalTime} />
          <input type="hidden" name="savedMiles" value={saved.miles.toFixed(2)} />
          <input type="hidden" name="savedMinutes" value={String(saved.minutes)} />
          <input type="hidden" name="body" value={body} />

          <fieldset className="resched-days">
            <legend>Move them to</legend>
            {suggestions.map((suggestion) => (
              <label key={suggestion.dateKey} className={`resched-day${suggestion.dateKey === chosen ? ' is-on' : ''}`}>
                <input
                  type="radio"
                  name="day"
                  value={suggestion.dateKey}
                  checked={suggestion.dateKey === chosen}
                  onChange={() => {
                    setChosen(suggestion.dateKey);
                    setEdited(null);
                  }}
                />
                <span className="resched-day-main">
                  <strong>{suggestion.dayLabel}</strong>
                  <small>{suggestion.windowLabel}</small>
                </span>
                <span className="resched-day-near">{suggestion.nearLabel}</span>
              </label>
            ))}
          </fieldset>

          <fieldset className="resched-discount">
            <legend>Off the job</legend>
            <div className="resched-discount-row">
              {DISCOUNT_OPTIONS.map((option) => (
                <label key={option} className={`resched-chip${option === discount ? ' is-on' : ''}`}>
                  <input
                    type="radio"
                    name="discountPercent"
                    value={option}
                    checked={option === discount}
                    onChange={() => {
                      setDiscount(option);
                      setEdited(null);
                    }}
                  />
                  {option}%
                </label>
              ))}
            </div>
            {/* What it costs, in the money it will actually come off. A percent
                on its own is easy to agree to; $870 is the number the owner
                should be deciding about. */}
            {quotedAmount > 0 ? (
              <p className="resched-cost">
                That&rsquo;s <strong>${cost.toLocaleString()}</strong> off ${quotedAmount.toLocaleString()} — taken off
                their invoice automatically when you bill it.
              </p>
            ) : (
              <p className="resched-cost">
                There&rsquo;s no quoted amount on this job yet, so the discount is recorded and comes off whatever you
                bill.
              </p>
            )}
          </fieldset>

          <label className="resched-body">
            <span>What they&rsquo;ll read</span>
            <textarea
              rows={4}
              value={body}
              maxLength={MAX_OFFER_BODY}
              onChange={(event) => setEdited(event.target.value)}
            />
          </label>

          {/* The exact string that gets sent, not the body — a preview of a
              different message than the one we send is not a preview. */}
          <p className="resched-preview">{composeRescheduleMessage(businessName, body)}</p>

          {state.message ? (
            <p className={`payment-banner ${state.ok ? 'success' : 'warning'} resched-alert`} role="status">
              {state.message}
            </p>
          ) : null}

          <div className="resched-actions">
            <Submit disabled={!body.trim()} />
            <button type="button" className="btn secondary" onClick={onClose}>
              Not now
            </button>
          </div>
          <p className="resched-note">
            Nothing moves until they say yes. Until then this stop stays on today&rsquo;s route.
          </p>
        </form>
      ) : null}
    </div>
  );
}
