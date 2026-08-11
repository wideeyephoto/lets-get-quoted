'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { QUICK_STOP_STATUS_LABEL, type QuickStopStatus } from '@/lib/quick-stop';
import {
  createQuickStopOfferAction,
  declineQuickStopAction,
  requestMoreInfoQuickStopAction,
  markEnRouteQuickStopAction,
  markArrivedQuickStopAction,
  completeQuickStopAction,
  cancelQuickStopByContractorAction,
  proposeRevisedWindowQuickStopAction,
  proposeDiagnosticConversionAction,
} from './actions';

export type CardRequest = {
  id: string;
  status: QuickStopStatus;
  client_name: string;
  client_phone: string | null;
  client_email: string | null;
  address: string | null;
  intake: { issue?: string; startedWhen?: string; worsening?: string; propertyType?: string } | null;
  ai_summary: string | null;
  ai_visit_minutes: number | null;
  ai_complexity: string | null;
  ai_confidence: number | null;
  availability: unknown[];
  fee_cents: number | null;
  diagnostic_fee_cents: number | null;
  arrival_date: string | null;
  /** The day the CUSTOMER asked for. Null on rows from before this existed. */
  requested_date?: string | null;
  arrival_start: string | null;
  arrival_end: string | null;
  response_deadline_at: string | null;
  proposed_arrival_date: string | null;
  proposed_arrival_start: string | null;
  proposed_arrival_end: string | null;
  diagnostic_conversion: 'proposed' | 'approved' | 'declined' | null;
  diagnostic_proposed_cents: number | null;
  created_at: string;
};

export type CardRoute = {
  detourMiles: number | null;
  detourMinutes: number | null;
  routeExtensionMinutes: number | null;
  anchorLabel: string | null;
};

export type CardDefaults = { earliest: string; latest: string; minFeeDollars: number; maxFeeDollars: number };

function money(cents: number | null): string {
  if (cents == null) return '—';
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function useCountdown(deadlineIso: string | null): string | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!deadlineIso) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [deadlineIso]);
  if (!deadlineIso) return null;
  const ms = new Date(deadlineIso).getTime() - now;
  if (ms <= 0) return 'passed';
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

const todayKey = () => new Date().toISOString().slice(0, 10);
const addDaysKey = (key: string, days: number) => {
  const [year, month, day] = key.split('-').map(Number);
  const at = new Date(Date.UTC(year, (month || 1) - 1, day || 1));
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
};

export default function QuickStopRequestCard({ request, photoUrls, route, defaults, readOnly = false }: {
  request: CardRequest;
  photoUrls: string[];
  route: CardRoute | null;
  defaults: CardDefaults;
  /**
   * The logged-out demo.
   *
   * Every action on this card — offer, decline, ask for more, en route,
   * arrived, complete, cancel, propose a new window, convert to diagnostic —
   * hangs off one of the two flags below, either directly or through the `mode`
   * state that only those buttons can change. Clearing both is therefore the
   * whole guard, rather than nine separate ones that can each be forgotten.
   *
   * The request itself still renders in full: what the customer asked for, when
   * they asked, the detour it would cost and the fee. That is what a prospect
   * needs to see; being able to accept it is not.
   */
  readOnly?: boolean;
}) {
  const [mode, setMode] = useState<'idle' | 'offer' | 'decline' | 'info' | 'cancel' | 'window' | 'diag'>('idle');
  const [arriving, setArriving] = useState(false);
  const router = useRouter();
  const countdown = useCountdown(request.status === 'awaiting_contractor' ? request.response_deadline_at : null);
  const isOpen = !readOnly && (request.status === 'awaiting_contractor' || request.status === 'more_information_requested');
  const isLive = !readOnly && (request.status === 'confirmed' || request.status === 'en_route' || request.status === 'arrived');
  const availabilityText = request.availability.map((a) => String(a)).filter(Boolean).join(' · ');
  // Requests made before the day picker existed genuinely meant today — that was
  // the only thing the form could ask for — so they say so rather than "—".
  const requestedDayLabel = (() => {
    const key = request.requested_date;
    if (!key) return 'Today (asked before days could be picked)';
    if (key === todayKey()) return 'Today';
    const [year, month, day] = key.split('-').map(Number);
    const label = new Date(Date.UTC(year, (month || 1) - 1, day || 1)).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
    return key === addDaysKey(todayKey(), 1) ? `Tomorrow · ${label}` : label;
  })();

  // "I've Arrived" captures the browser location when granted, then records it.
  async function handleArrived() {
    setArriving(true);
    const fd = new FormData();
    await new Promise<void>((resolve) => {
      if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve();
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          fd.set('lat', String(pos.coords.latitude));
          fd.set('lng', String(pos.coords.longitude));
          resolve();
        },
        () => resolve(),
        { timeout: 8000, enableHighAccuracy: true },
      );
    });
    try {
      await markArrivedQuickStopAction(request.id, fd);
      router.refresh();
    } finally {
      setArriving(false);
    }
  }

  return (
    <section className="panel workspace-section-card" style={{ marginBottom: '1rem' }}>
      {/* flexWrap, because the countdown chip beside the title is nowrap by
          necessity — "⏱ 41:59 to respond" broken across two lines is not a
          countdown any more. Without somewhere to go it pushed the whole page
          9px wider than a phone. */}
      <div className="section-heading workspace-section-heading compact-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '.75rem', flexWrap: 'wrap' }}>
        <div>
          <p className="eyebrow">Quick Stop · {QUICK_STOP_STATUS_LABEL[request.status]}</p>
          <h2 style={{ margin: 0 }}>{request.ai_summary || request.intake?.issue || 'Quick Stop request'}</h2>
        </div>
        {countdown ? (
          <span style={{ whiteSpace: 'nowrap', fontWeight: 800, fontSize: '.8rem', padding: '.25rem .6rem', borderRadius: 999, border: '1px solid', borderColor: countdown === 'passed' ? 'rgba(255,122,33,.5)' : 'rgba(255,209,102,.5)', color: countdown === 'passed' ? '#ff9a52' : '#ffd166' }}>
            {countdown === 'passed' ? 'Response window passed' : `⏱ ${countdown} to respond`}
          </span>
        ) : null}
      </div>

      <div className="form-grid" style={{ marginTop: '.75rem' }}>
        <div className="field"><label>Customer</label><p className="job-meta" style={{ margin: 0 }}>{request.client_name}{request.client_phone ? ` · ${request.client_phone}` : ''}{request.client_email ? ` · ${request.client_email}` : ''}</p></div>
        <div className="field"><label>Address</label><p className="job-meta" style={{ margin: 0 }}>{request.address || '—'}</p></div>
        <div className="field"><label>Est. visit</label><p className="job-meta" style={{ margin: 0 }}>{request.ai_visit_minutes ? `~${request.ai_visit_minutes} min` : '—'}{request.ai_complexity ? ` · ${request.ai_complexity}` : ''}{request.ai_confidence != null ? ` · ${Math.round(request.ai_confidence * 100)}% conf.` : ''}</p></div>
        {/* The day they asked for, said plainly. Without it the availability text
            ("any time after 2") is a window with no day attached, and the offer
            form's date silently becomes the thing that decides it. */}
        <div className="field"><label>Day requested</label><p className="job-meta" style={{ margin: 0 }}>{requestedDayLabel}</p></div>
        <div className="field"><label>Customer availability</label><p className="job-meta" style={{ margin: 0 }}>{availabilityText || '—'}</p></div>
        {request.intake?.startedWhen || request.intake?.worsening || request.intake?.propertyType ? (
          <div className="field full"><label>Details</label><p className="job-meta" style={{ margin: 0 }}>
            {[request.intake?.propertyType && `Property: ${request.intake.propertyType}`, request.intake?.startedWhen && `Started: ${request.intake.startedWhen}`, request.intake?.worsening && `Worsening: ${request.intake.worsening}`].filter(Boolean).join(' · ')}
          </p></div>
        ) : null}
        {route && route.detourMiles != null ? (
          <div className="field full"><label>Route impact</label><p className="job-meta" style={{ margin: 0 }}>
            {route.detourMiles} mi{route.anchorLabel ? ` from ${route.anchorLabel}` : ''}
            {route.detourMinutes != null ? ` · ~${route.detourMinutes} min added drive` : ''}
            {route.routeExtensionMinutes != null ? ` · +${route.routeExtensionMinutes} min total route` : ''}
          </p></div>
        ) : null}
      </div>

      {photoUrls.length ? (
        <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', marginTop: '.5rem' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {photoUrls.map((url, i) => <img key={i} src={url} alt={`Issue photo ${i + 1}`} style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 8, border: '1px solid rgba(255,255,255,.12)' }} />)}
        </div>
      ) : null}

      {/* Sent / confirmed / live states. */}
      {!isOpen ? (
        <>
          <p className="payment-banner muted" style={{ marginTop: '1rem' }}>
            {request.arrival_date ? `Offered ${request.arrival_date}, ${request.arrival_start}–${request.arrival_end} · fee ${money(request.fee_cents)}${request.diagnostic_fee_cents ? ` + ${money(request.diagnostic_fee_cents)} diagnostic` : ''}.` : 'No live actions for this request.'}
          </p>
          {isLive ? (
            <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'center', marginTop: '1rem' }}>
              {request.status === 'confirmed' ? (
                <form action={markEnRouteQuickStopAction.bind(null, request.id)}><button type="submit" className="btn secondary">Mark en route</button></form>
              ) : null}
              {request.status === 'confirmed' || request.status === 'en_route' ? (
                <button type="button" className="btn primary" onClick={handleArrived} disabled={arriving}>{arriving ? 'Recording…' : "I've Arrived"}</button>
              ) : null}
              <form action={completeQuickStopAction.bind(null, request.id)}><button type="submit" className="btn secondary">Mark complete</button></form>
              {request.status === 'confirmed' || request.status === 'en_route' ? (
                <button type="button" className="btn secondary" onClick={() => setMode('window')}>Propose new window</button>
              ) : null}
              <button type="button" className="btn secondary" onClick={() => setMode('diag')}>Convert to diagnostic</button>
              {request.status === 'confirmed' || request.status === 'en_route' ? (
                mode === 'cancel' ? (
                  <form action={cancelQuickStopByContractorAction.bind(null, request.id)} style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
                    <input name="reason" placeholder="Reason (optional)" />
                    <button type="submit" className="btn secondary">Confirm cancel (full refund)</button>
                    <button type="button" className="btn secondary" onClick={() => setMode('idle')}>Back</button>
                  </form>
                ) : (
                  <button type="button" className="btn secondary" onClick={() => setMode('cancel')}>Cancel &amp; refund</button>
                )
              ) : null}
            </div>
          ) : null}

          {isLive && request.proposed_arrival_date ? (
            <p className="payment-banner muted" style={{ marginTop: '.75rem' }}>Proposed new window {request.proposed_arrival_date}, {request.proposed_arrival_start}–{request.proposed_arrival_end} — awaiting the customer.</p>
          ) : null}
          {isLive && request.diagnostic_conversion === 'proposed' ? (
            <p className="payment-banner muted" style={{ marginTop: '.75rem' }}>Diagnostic conversion proposed ({money(request.diagnostic_proposed_cents)}) — awaiting the customer.</p>
          ) : null}
          {request.diagnostic_conversion === 'approved' ? (
            <p className="payment-banner success" style={{ marginTop: '.75rem' }}>Diagnostic conversion approved{request.diagnostic_proposed_cents ? ` (${money(request.diagnostic_proposed_cents)} total)` : ''}.</p>
          ) : null}
          {request.diagnostic_conversion === 'declined' ? (
            <p className="payment-banner muted" style={{ marginTop: '.75rem' }}>The customer declined the diagnostic conversion.</p>
          ) : null}

          {isLive && mode === 'window' ? (
            <form action={proposeRevisedWindowQuickStopAction.bind(null, request.id)} className="form-grid" style={{ marginTop: '1rem' }}>
              <div className="field"><label htmlFor={`pd-${request.id}`}>New date</label><input id={`pd-${request.id}`} name="proposedDate" type="date" defaultValue={request.arrival_date || request.requested_date || todayKey()} required /></div>
              <div className="field"><label htmlFor={`ps-${request.id}`}>Start</label><input id={`ps-${request.id}`} name="proposedStart" type="time" defaultValue={request.arrival_start ?? '08:00'} required /></div>
              <div className="field"><label htmlFor={`pe-${request.id}`}>End</label><input id={`pe-${request.id}`} name="proposedEnd" type="time" defaultValue={request.arrival_end ?? '20:00'} required /></div>
              <div className="field full" style={{ display: 'flex', gap: '.5rem' }}>
                <button type="submit" className="btn primary">Propose window (customer must accept)</button>
                <button type="button" className="btn secondary" onClick={() => setMode('idle')}>Cancel</button>
              </div>
            </form>
          ) : null}

          {isLive && mode === 'diag' ? (
            <form action={proposeDiagnosticConversionAction.bind(null, request.id)} className="form-grid" style={{ marginTop: '1rem' }}>
              <div className="field"><label htmlFor={`dt-${request.id}`}>Diagnostic total ($)</label><input id={`dt-${request.id}`} name="diagnosticTotal" type="number" min="1" step="5" required /><small className="field-hint">The Quick Stop fee already paid applies as a deposit; the customer is billed only the difference.</small></div>
              <div className="field full"><label htmlFor={`dn-${request.id}`}>Note (optional)</label><textarea id={`dn-${request.id}`} name="note" rows={2} placeholder="Found the leak is behind the wall — needs a proper diagnostic." /></div>
              <div className="field full" style={{ display: 'flex', gap: '.5rem' }}>
                <button type="submit" className="btn primary">Propose conversion (customer must approve)</button>
                <button type="button" className="btn secondary" onClick={() => setMode('idle')}>Cancel</button>
              </div>
            </form>
          ) : null}
        </>
      ) : (
        <>
          {mode === 'idle' ? (
            <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', marginTop: '1rem' }}>
              <button type="button" className="btn primary" onClick={() => setMode('offer')}>Create Offer</button>
              <button type="button" className="btn secondary" onClick={() => setMode('info')}>Request More Information</button>
              <button type="button" className="btn secondary" onClick={() => setMode('decline')}>Decline</button>
            </div>
          ) : null}

          {mode === 'offer' ? (
            <form action={createQuickStopOfferAction.bind(null, request.id)} className="form-grid" style={{ marginTop: '1rem' }}>
              <div className="field"><label htmlFor={`ad-${request.id}`}>Arrival date</label><input id={`ad-${request.id}`} name="arrivalDate" type="date" defaultValue={request.arrival_date || request.requested_date || todayKey()} required /></div>
              <div className="field"><label htmlFor={`vm-${request.id}`}>Visit minutes</label><input id={`vm-${request.id}`} name="visitMinutes" type="number" min="5" step="5" defaultValue={request.ai_visit_minutes ?? 30} /></div>
              <div className="field"><label htmlFor={`as-${request.id}`}>Window start</label><input id={`as-${request.id}`} name="arrivalStart" type="time" defaultValue={defaults.earliest} required /></div>
              <div className="field"><label htmlFor={`ae-${request.id}`}>Window end</label><input id={`ae-${request.id}`} name="arrivalEnd" type="time" defaultValue={defaults.latest} required /></div>
              <div className="field"><label htmlFor={`fee-${request.id}`}>Priority visit fee ($)</label><input id={`fee-${request.id}`} name="fee" type="number" min={defaults.minFeeDollars} max={defaults.maxFeeDollars} step="5" defaultValue={defaults.minFeeDollars} required /><small className="field-hint">Allowed {money(defaults.minFeeDollars * 100)}–{money(defaults.maxFeeDollars * 100)}. This reserves the visit — invoice the work separately.</small></div>
              <div className="field"><label htmlFor={`df-${request.id}`}>Diagnostic fee ($, optional)</label><input id={`df-${request.id}`} name="diagnosticFee" type="number" min="0" step="5" placeholder="0" /></div>
              <div className="field full"><label htmlFor={`note-${request.id}`}>Note to customer (optional)</label><textarea id={`note-${request.id}`} name="note" rows={2} placeholder="I can be there between 3 and 5." /></div>
              <div className="field full" style={{ display: 'flex', gap: '.5rem' }}>
                <button type="submit" className="btn primary">Send Quick Stop Offer</button>
                <button type="button" className="btn secondary" onClick={() => setMode('idle')}>Cancel</button>
              </div>
            </form>
          ) : null}

          {mode === 'info' ? (
            <form action={requestMoreInfoQuickStopAction.bind(null, request.id)} className="form-grid" style={{ marginTop: '1rem' }}>
              <div className="field full"><label htmlFor={`info-${request.id}`}>What do you need to know?</label><textarea id={`info-${request.id}`} name="note" rows={2} required placeholder="Can you send a photo of the shutoff valve?" /></div>
              <div className="field full" style={{ display: 'flex', gap: '.5rem' }}>
                <button type="submit" className="btn primary">Request info</button>
                <button type="button" className="btn secondary" onClick={() => setMode('idle')}>Cancel</button>
              </div>
            </form>
          ) : null}

          {mode === 'decline' ? (
            <form action={declineQuickStopAction.bind(null, request.id)} className="form-grid" style={{ marginTop: '1rem' }}>
              <div className="field full"><label htmlFor={`dec-${request.id}`}>Reason (optional)</label><input id={`dec-${request.id}`} name="reason" placeholder="Too far off the route that day" /></div>
              <div className="field full" style={{ display: 'flex', gap: '.5rem' }}>
                <button type="submit" className="btn primary">Decline request</button>
                <button type="button" className="btn secondary" onClick={() => setMode('idle')}>Cancel</button>
              </div>
            </form>
          ) : null}
        </>
      )}
    </section>
  );
}
