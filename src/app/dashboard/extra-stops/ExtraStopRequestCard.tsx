'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { EXTRA_STOP_STATUS_LABEL, type ExtraStopStatus } from '@/lib/extra-stop';
import {
  createExtraStopOfferAction,
  declineExtraStopAction,
  requestMoreInfoExtraStopAction,
  markEnRouteExtraStopAction,
  markArrivedExtraStopAction,
  completeExtraStopAction,
  cancelExtraStopByContractorAction,
} from './actions';

export type CardRequest = {
  id: string;
  status: ExtraStopStatus;
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
  arrival_start: string | null;
  arrival_end: string | null;
  response_deadline_at: string | null;
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

export default function ExtraStopRequestCard({ request, photoUrls, route, defaults }: {
  request: CardRequest;
  photoUrls: string[];
  route: CardRoute | null;
  defaults: CardDefaults;
}) {
  const [mode, setMode] = useState<'idle' | 'offer' | 'decline' | 'info' | 'cancel'>('idle');
  const [arriving, setArriving] = useState(false);
  const router = useRouter();
  const countdown = useCountdown(request.status === 'awaiting_contractor' ? request.response_deadline_at : null);
  const isOpen = request.status === 'awaiting_contractor' || request.status === 'more_information_requested';
  const isLive = request.status === 'confirmed' || request.status === 'en_route' || request.status === 'arrived';
  const availabilityText = request.availability.map((a) => String(a)).filter(Boolean).join(' · ');

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
      await markArrivedExtraStopAction(request.id, fd);
      router.refresh();
    } finally {
      setArriving(false);
    }
  }

  return (
    <section className="panel workspace-section-card" style={{ marginBottom: '1rem' }}>
      <div className="section-heading workspace-section-heading compact-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '.75rem' }}>
        <div>
          <p className="eyebrow">Extra Stop · {EXTRA_STOP_STATUS_LABEL[request.status]}</p>
          <h2 style={{ margin: 0 }}>{request.ai_summary || request.intake?.issue || 'Extra Stop request'}</h2>
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
                <form action={markEnRouteExtraStopAction.bind(null, request.id)}><button type="submit" className="btn secondary">Mark en route</button></form>
              ) : null}
              {request.status === 'confirmed' || request.status === 'en_route' ? (
                <button type="button" className="btn primary" onClick={handleArrived} disabled={arriving}>{arriving ? 'Recording…' : "I've Arrived"}</button>
              ) : null}
              <form action={completeExtraStopAction.bind(null, request.id)}><button type="submit" className="btn secondary">Mark complete</button></form>
              {request.status === 'confirmed' || request.status === 'en_route' ? (
                mode === 'cancel' ? (
                  <form action={cancelExtraStopByContractorAction.bind(null, request.id)} style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
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
            <form action={createExtraStopOfferAction.bind(null, request.id)} className="form-grid" style={{ marginTop: '1rem' }}>
              <div className="field"><label htmlFor={`ad-${request.id}`}>Arrival date</label><input id={`ad-${request.id}`} name="arrivalDate" type="date" defaultValue={request.arrival_date || todayKey()} required /></div>
              <div className="field"><label htmlFor={`vm-${request.id}`}>Visit minutes</label><input id={`vm-${request.id}`} name="visitMinutes" type="number" min="5" step="5" defaultValue={request.ai_visit_minutes ?? 30} /></div>
              <div className="field"><label htmlFor={`as-${request.id}`}>Window start</label><input id={`as-${request.id}`} name="arrivalStart" type="time" defaultValue={defaults.earliest} required /></div>
              <div className="field"><label htmlFor={`ae-${request.id}`}>Window end</label><input id={`ae-${request.id}`} name="arrivalEnd" type="time" defaultValue={defaults.latest} required /></div>
              <div className="field"><label htmlFor={`fee-${request.id}`}>Extra Stop fee ($)</label><input id={`fee-${request.id}`} name="fee" type="number" min={defaults.minFeeDollars} max={defaults.maxFeeDollars} step="5" defaultValue={defaults.minFeeDollars} required /><small className="field-hint">Allowed {money(defaults.minFeeDollars * 100)}–{money(defaults.maxFeeDollars * 100)}.</small></div>
              <div className="field"><label htmlFor={`df-${request.id}`}>Diagnostic fee ($, optional)</label><input id={`df-${request.id}`} name="diagnosticFee" type="number" min="0" step="5" placeholder="0" /></div>
              <div className="field full"><label htmlFor={`note-${request.id}`}>Note to customer (optional)</label><textarea id={`note-${request.id}`} name="note" rows={2} placeholder="I can be there between 3 and 5 today." /></div>
              <div className="field full" style={{ display: 'flex', gap: '.5rem' }}>
                <button type="submit" className="btn primary">Send Extra Stop Offer</button>
                <button type="button" className="btn secondary" onClick={() => setMode('idle')}>Cancel</button>
              </div>
            </form>
          ) : null}

          {mode === 'info' ? (
            <form action={requestMoreInfoExtraStopAction.bind(null, request.id)} className="form-grid" style={{ marginTop: '1rem' }}>
              <div className="field full"><label htmlFor={`info-${request.id}`}>What do you need to know?</label><textarea id={`info-${request.id}`} name="note" rows={2} required placeholder="Can you send a photo of the shutoff valve?" /></div>
              <div className="field full" style={{ display: 'flex', gap: '.5rem' }}>
                <button type="submit" className="btn primary">Request info</button>
                <button type="button" className="btn secondary" onClick={() => setMode('idle')}>Cancel</button>
              </div>
            </form>
          ) : null}

          {mode === 'decline' ? (
            <form action={declineExtraStopAction.bind(null, request.id)} className="form-grid" style={{ marginTop: '1rem' }}>
              <div className="field full"><label htmlFor={`dec-${request.id}`}>Reason (optional)</label><input id={`dec-${request.id}`} name="reason" placeholder="Too far off today's route" /></div>
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
