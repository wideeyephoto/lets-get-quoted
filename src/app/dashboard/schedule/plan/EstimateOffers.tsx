'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useFormState, useFormStatus } from 'react-dom';
import {
  composeOfferMessage,
  ESTIMATE_VISIT_OPTIONS,
  HOLD_MINUTE_OPTIONS,
  MAX_OFFER_BODY,
  OFFER_STATUS_LABEL,
  type OfferStatus,
} from '@/lib/estimate-offers';
import { IDLE_OFFER_STATE, releaseEstimateOfferAction, sendEstimateOfferAction } from './offer-actions';

// "You've got a hole at 1 PM and a lead ten minutes off your route."
//
// The whole panel is built around one rule: nothing reaches a homeowner that the
// contractor hasn't read. The suggestion is ours, the wording is theirs, and the
// preview shows the exact string that will arrive on the phone — envelope
// included — because a preview of a different message is worse than none.

export type OfferSuggestionView = {
  leadId: string;
  leadName: string;
  projectType: string | null;
  address: string | null;
  detourMiles: number;
  /** Extra driving only — what "off your route" means. */
  detourMinutes: number;
  /** Extra driving plus the visit — what the day actually grows by. */
  addedMinutes: number;
  afterStopLabel: string | null;
  beforeStopLabel: string | null;
  windowStart: string;
  windowEnd: string;
  arrivalTime: string;
  windowLabel: string;
  afterStopId: string | null;
  defaultBody: string;
};

export type OfferView = {
  id: string;
  leadId: string;
  leadName: string;
  windowLabel: string;
  status: OfferStatus;
  holding: boolean;
  minutesLeft: number;
  expiresLabel: string;
  replyBody: string | null;
  arrivalLabel: string;
};

function SubmitButton({ children, className = 'btn primary', pendingLabel }: { children: React.ReactNode; className?: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending}>
      {pending ? pendingLabel : children}
    </button>
  );
}

function milesLabel(miles: number): string {
  return miles < 0.1 ? 'on your way past' : `${miles.toFixed(1)} mi off your route`;
}

export default function EstimateOffers({
  dateKey,
  crewId,
  businessName,
  suggestions,
  offers,
  emptyReason,
}: {
  dateKey: string;
  crewId: string | null;
  businessName: string;
  suggestions: OfferSuggestionView[];
  offers: OfferView[];
  emptyReason: string | null;
}) {
  const router = useRouter();
  const [openLeadId, setOpenLeadId] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [sendState, sendAction] = useFormState(sendEstimateOfferAction, IDLE_OFFER_STATE);
  const [releaseState, releaseAction] = useFormState(releaseEstimateOfferAction, IDLE_OFFER_STATE);

  const waiting = offers.filter((offer) => offer.holding);
  const settled = offers.filter((offer) => !offer.holding);

  // While a slot is held the answer can arrive at any second, and the page that
  // shows the countdown is exactly where the contractor is sitting. Polling stops
  // the moment nothing is waiting.
  useEffect(() => {
    if (waiting.length === 0) return;
    const timer = setInterval(() => router.refresh(), 20000);
    return () => clearInterval(timer);
  }, [waiting.length, router]);

  // A successful send closes the draft — the offer now lives in the waiting list.
  useEffect(() => {
    if (sendState.ok) setOpenLeadId(null);
  }, [sendState.ok, sendState.message]);

  const open = suggestions.find((suggestion) => suggestion.leadId === openLeadId) ?? null;
  const preview = useMemo(() => composeOfferMessage(businessName, body || (open?.defaultBody ?? '')), [businessName, body, open]);
  const characters = (body || open?.defaultBody || '').trim().length;

  if (suggestions.length === 0 && offers.length === 0 && !emptyReason) return null;

  return (
    <section className="panel plan-panel offer-panel">
      <div className="offer-head">
        <h2>Fill a gap with a nearby lead</h2>
        <p>
          Leads waiting on you who happen to sit close to today&apos;s route. We draft the text, you send it, and the
          slot is held while they reply. We only ever ask a lead once.
        </p>
      </div>

      {sendState.message ? (
        <p className={`plan-flash ${sendState.ok ? 'good' : 'warn'}`}>{sendState.message}</p>
      ) : null}
      {releaseState.message ? (
        <p className={`plan-flash ${releaseState.ok ? 'good' : 'warn'}`}>{releaseState.message}</p>
      ) : null}

      {waiting.length > 0 ? (
        <ul className="offer-waiting">
          {waiting.map((offer) => (
            <li key={offer.id}>
              <div className="offer-waiting-copy">
                <strong>
                  Holding {offer.windowLabel} for {offer.leadName}
                </strong>
                <small>
                  Waiting on their reply — the slot is yours until {offer.expiresLabel} ({offer.minutesLeft} min).
                  Nothing is on your calendar until they say yes.
                </small>
              </div>
              <form action={releaseAction}>
                <input type="hidden" name="offerId" value={offer.id} />
                <SubmitButton className="btn ghost" pendingLabel="Releasing…">
                  Release the slot
                </SubmitButton>
              </form>
            </li>
          ))}
        </ul>
      ) : null}

      {settled.length > 0 ? (
        <ul className="offer-settled">
          {settled.map((offer) => (
            <li key={offer.id} data-status={offer.status}>
              <span className="offer-status" data-status={offer.status}>
                {OFFER_STATUS_LABEL[offer.status]}
              </span>
              <div>
                <strong>
                  <Link href={`/dashboard/leads/${offer.leadId}`}>{offer.leadName}</Link>
                </strong>
                <small>
                  {offer.status === 'accepted'
                    ? `On your day at ${offer.arrivalLabel} — you promised ${offer.windowLabel}.`
                    : offer.status === 'accepted_late'
                      ? `Said yes after the hold ran out, so nothing was booked. They still want an estimate.`
                      : offer.status === 'declined'
                        ? `Offered ${offer.windowLabel}. They still have an open request — this only rules out today.`
                        : offer.status === 'canceled'
                          ? `You took the slot back. They were never told, so a late reply still reaches you.`
                          : `Offered ${offer.windowLabel}, no answer before the hold ran out.`}
                </small>
                {/* Their actual words, not our summary of them — "no thanks, we
                    went with someone else" and "not this week" mean different
                    things about whether to follow up. */}
                {offer.replyBody && offer.replyBody !== 'YES' ? (
                  <small className="offer-said">They said: &ldquo;{offer.replyBody}&rdquo;</small>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {suggestions.length === 0 ? (
        emptyReason ? <p className="offer-empty">{emptyReason}</p> : null
      ) : (
        <ul className="offer-suggestions">
          {suggestions.map((suggestion) => {
            const isOpen = suggestion.leadId === openLeadId;
            return (
              <li key={suggestion.leadId} data-open={isOpen || undefined}>
                <div className="offer-suggestion-head">
                  <div className="offer-suggestion-copy">
                    <strong>
                      <Link href={`/dashboard/leads/${suggestion.leadId}`}>{suggestion.leadName}</Link>
                      {suggestion.projectType ? <span className="offer-chip">{suggestion.projectType}</span> : null}
                    </strong>
                    <small>
                      {suggestion.address ?? 'No address on file'} · {milesLabel(suggestion.detourMiles)} ·{' '}
                      about {suggestion.addedMinutes} min added to the day, visit included
                    </small>
                    <small className="offer-slot">
                      Free {suggestion.windowLabel}
                      {suggestion.afterStopLabel ? ` — after ${suggestion.afterStopLabel}` : ' — before your first stop'}
                      {suggestion.beforeStopLabel ? `, before ${suggestion.beforeStopLabel}` : ', to the end of your day'}
                    </small>
                  </div>
                  <button
                    type="button"
                    className={isOpen ? 'btn ghost' : 'btn secondary'}
                    onClick={() => {
                      setOpenLeadId(isOpen ? null : suggestion.leadId);
                      setBody(isOpen ? '' : suggestion.defaultBody);
                    }}
                  >
                    {isOpen ? 'Close' : 'Write the text'}
                  </button>
                </div>

                {isOpen ? (
                  <form action={sendAction} className="offer-draft">
                    <input type="hidden" name="leadId" value={suggestion.leadId} />
                    <input type="hidden" name="dateKey" value={dateKey} />
                    <input type="hidden" name="crewId" value={crewId ?? ''} />
                    <input type="hidden" name="windowStart" value={suggestion.windowStart} />
                    <input type="hidden" name="windowEnd" value={suggestion.windowEnd} />
                    <input type="hidden" name="arrivalTime" value={suggestion.arrivalTime} />
                    <input type="hidden" name="afterStopId" value={suggestion.afterStopId ?? ''} />
                    <input type="hidden" name="detourMiles" value={String(suggestion.detourMiles)} />
                    <input type="hidden" name="detourMinutes" value={String(suggestion.detourMinutes)} />

                    <label className="field">
                      <span>What you want to say</span>
                      <textarea
                        name="body"
                        rows={3}
                        value={body}
                        maxLength={MAX_OFFER_BODY}
                        onChange={(event) => setBody(event.target.value)}
                      />
                      <small className={characters > MAX_OFFER_BODY ? 'warn' : undefined}>
                        {characters} of {MAX_OFFER_BODY} characters
                      </small>
                    </label>

                    <div className="offer-draft-row">
                      <label className="field">
                        <span>Hold the slot for</span>
                        <select name="holdMinutes" defaultValue={45}>
                          {HOLD_MINUTE_OPTIONS.map((minutes) => (
                            <option key={minutes} value={minutes}>
                              {minutes} minutes
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field">
                        <span>Time on site</span>
                        <select name="visitMinutes" defaultValue={30}>
                          {ESTIMATE_VISIT_OPTIONS.map((minutes) => (
                            <option key={minutes} value={minutes}>
                              {minutes} minutes
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    {/* The exact string that lands on their phone. The YES/NO line
                        and the opt-out line are ours and can't be edited away —
                        without them a reply has nothing to answer. */}
                    <div className="offer-preview">
                      <span>They will receive</span>
                      <p>{preview}</p>
                    </div>

                    <div className="form-actions">
                      <SubmitButton pendingLabel="Sending…">Send it and hold the slot</SubmitButton>
                      <button type="button" className="btn ghost" onClick={() => setOpenLeadId(null)}>
                        Not now
                      </button>
                    </div>
                  </form>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
