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
  sendEtaSmsQuickStopAction,
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
  requested_date?: string | null;
  arrival_start: string | null;
  arrival_end: string | null;
  response_deadline_at: string | null;
  payment_deadline_at?: string | null;
  offer_sent_at?: string | null;
  paid_at?: string | null;
  en_route_at?: string | null;
  arrived_at?: string | null;
  completed_at?: string | null;
  canceled_at?: string | null;
  contractor_note?: string | null;
  cancel_reason?: string | null;
  proposed_arrival_date: string | null;
  proposed_arrival_start: string | null;
  proposed_arrival_end: string | null;
  diagnostic_conversion: 'proposed' | 'approved' | 'declined' | null;
  diagnostic_proposed_cents: number | null;
  created_at: string;
  updated_at?: string;
};

export type CardRoute = {
  detourMiles: number | null;
  detourMinutes: number | null;
  routeExtensionMinutes: number | null;
  anchorLabel: string | null;
  recommendedStart?: string | null;
  recommendedEnd?: string | null;
};

export type CardDefaults = { earliest: string; latest: string; minFeeDollars: number; maxFeeDollars: number };

function money(cents: number | null): string {
  if (cents == null) return '—';
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function formatTime12(time24: string): string {
  if (!time24) return '';
  const [hStr, mStr] = time24.split(':');
  const h = Number(hStr);
  const m = Number(mStr || 0);
  if (!Number.isFinite(h)) return time24;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${m !== 0 ? `:${String(m).padStart(2, '0')}` : ''} ${period}`;
}

export function playQuickStopAlertChime() {
  try {
    if (typeof window === 'undefined') return;
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const now = ctx.currentTime;

    // Gentle tone 1: 587.33 Hz (D5)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now);
    gain1.gain.setValueAtTime(0.15, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.35);

    // Harmonious tone 2: 880.00 Hz (A5)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880.0, now + 0.12);
    gain2.gain.setValueAtTime(0.2, now + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.12);
    osc2.stop(now + 0.55);
  } catch {
    // AudioContext blocked or not supported
  }
}

function useCountdown(deadlineIso: string | null): { text: string | null; isUrgent: boolean; ms: number } {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!deadlineIso) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [deadlineIso]);
  if (!deadlineIso) return { text: null, isUrgent: false, ms: 0 };
  const ms = new Date(deadlineIso).getTime() - now;
  if (ms <= 0) return { text: 'passed', isUrgent: true, ms: 0 };
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return {
    text: `${mins}:${String(secs).padStart(2, '0')}`,
    isUrgent: ms < 10 * 60 * 1000,
    ms,
  };
}

const todayKey = () => new Date().toISOString().slice(0, 10);
const addDaysKey = (key: string, days: number) => {
  const [year, month, day] = key.split('-').map(Number);
  const at = new Date(Date.UTC(year, (month || 1) - 1, day || 1));
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
};

export default function QuickStopRequestCard({
  request,
  photoUrls,
  route,
  defaults,
  readOnly = false,
}: {
  request: CardRequest;
  photoUrls: string[];
  route: CardRoute | null;
  defaults: CardDefaults;
  readOnly?: boolean;
}) {
  const [mode, setMode] = useState<'idle' | 'offer' | 'decline' | 'info' | 'cancel' | 'window' | 'diag'>('idle');
  const [arriving, setArriving] = useState(false);
  const [etaSending, setEtaSending] = useState(false);
  const [etaSent, setEtaSent] = useState(false);

  // Recommendation & Form state values for offer mode
  const initialDate = request.requested_date || request.arrival_date || todayKey();
  const [offerDate, setOfferDate] = useState(initialDate);
  const [offerMinutes, setOfferMinutes] = useState(request.ai_visit_minutes ?? 30);
  const [offerStart, setOfferStart] = useState(defaults.earliest || '14:00');
  const [offerEnd, setOfferEnd] = useState(defaults.latest || '16:00');
  const [offerFee, setOfferFee] = useState(
    defaults.minFeeDollars > 0 ? defaults.minFeeDollars : 145,
  );
  const [diagFee, setDiagFee] = useState('');
  const [offerNote, setOfferNote] = useState('');

  const router = useRouter();
  const countdown = useCountdown(request.status === 'awaiting_contractor' ? request.response_deadline_at : null);
  const isOpen = !readOnly && (request.status === 'awaiting_contractor' || request.status === 'more_information_requested');
  const isLive = !readOnly && (request.status === 'confirmed' || request.status === 'en_route' || request.status === 'arrived');
  const availabilityText = request.availability.map((a) => String(a)).filter(Boolean).join(' · ');

  const requestedDayLabel = (() => {
    const key = request.requested_date;
    if (!key) return 'Today';
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

  // Real-time polling when awaiting customer payment so the status automatically updates to Confirmed upon Stripe payment
  useEffect(() => {
    if (readOnly || request.status !== 'awaiting_customer_payment') return;
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        router.refresh();
      }
    }, 12000);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        router.refresh();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [readOnly, request.status, router]);

  // Deterministic recommended offer
  const recommendedDate = request.requested_date || request.arrival_date || todayKey();
  const recommendedMinutes = request.ai_visit_minutes || 35;
  const recommendedStart = route?.recommendedStart || defaults.earliest || '14:00';
  const recommendedEnd = route?.recommendedEnd || defaults.latest || '16:00';
  const recommendedFee = Math.max(defaults.minFeeDollars, 145);

  function applyRecommendation() {
    setOfferDate(recommendedDate);
    setOfferMinutes(recommendedMinutes);
    setOfferStart(recommendedStart);
    setOfferEnd(recommendedEnd);
    setOfferFee(recommendedFee);
    setMode('offer');
  }

  async function handleSendEta(mins: number = 15) {
    setEtaSending(true);
    try {
      await sendEtaSmsQuickStopAction(request.id, mins);
      setEtaSent(true);
      setTimeout(() => setEtaSent(false), 5000);
      router.refresh();
    } catch {
      // Ignored
    } finally {
      setEtaSending(false);
    }
  }

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

  const auditTimeline = [
    request.created_at && {
      icon: '📝',
      label: 'Request received from customer',
      time: new Date(request.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
      date: new Date(request.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    },
    request.offer_sent_at && {
      icon: '💬',
      label: `Offer sent (${money(request.fee_cents)})`,
      time: new Date(request.offer_sent_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
      date: new Date(request.offer_sent_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    },
    request.paid_at && {
      icon: '💳',
      label: 'Customer paid fee (Confirmed)',
      time: new Date(request.paid_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
      date: new Date(request.paid_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    },
    request.en_route_at && {
      icon: '🚗',
      label: 'Marked en route',
      time: new Date(request.en_route_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
      date: new Date(request.en_route_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    },
    request.arrived_at && {
      icon: '📍',
      label: 'Arrived on site',
      time: new Date(request.arrived_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
      date: new Date(request.arrived_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    },
    request.completed_at && {
      icon: '✓',
      label: 'Visit completed',
      time: new Date(request.completed_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
      date: new Date(request.completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    },
    request.canceled_at && {
      icon: '✕',
      label: `Canceled${request.cancel_reason ? `: ${request.cancel_reason}` : ''}`,
      time: new Date(request.canceled_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
      date: new Date(request.canceled_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    },
  ].filter(Boolean) as Array<{ icon: string; label: string; time: string; date: string }>;

  return (
    <section className="panel workspace-section-card" style={{ marginBottom: '1rem' }}>
      <div
        className="section-heading workspace-section-heading compact-heading"
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '.75rem', flexWrap: 'wrap' }}
      >
        <div>
          <p className="eyebrow">Quick Stop · {QUICK_STOP_STATUS_LABEL[request.status]}</p>
          <h2 style={{ margin: 0 }}>{request.ai_summary || request.intake?.issue || 'Quick Stop request'}</h2>
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
          {isOpen ? (
            <button
              type="button"
              onClick={playQuickStopAlertChime}
              className="btn ghost"
              style={{ minHeight: '32px', padding: '0.2rem 0.5rem', fontSize: '0.75rem', color: 'var(--muted)' }}
              title="Test request notification chime"
            >
              🔔 Test alert
            </button>
          ) : null}
          {countdown.text ? (
            <span
              style={{
                whiteSpace: 'nowrap',
                fontWeight: 800,
                fontSize: '.8rem',
                padding: '.25rem .6rem',
                borderRadius: 999,
                border: '1px solid',
                borderColor: countdown.text === 'passed' || countdown.isUrgent ? 'rgba(255,122,33,.6)' : 'rgba(255,209,102,.5)',
                color: countdown.text === 'passed' || countdown.isUrgent ? '#ff9a52' : '#ffd166',
                background: countdown.isUrgent && countdown.text !== 'passed' ? 'rgba(255,122,33,.12)' : 'transparent',
              }}
            >
              {countdown.text === 'passed' ? 'Response window passed' : `⏱ ${countdown.text} to respond`}
            </span>
          ) : null}
        </div>
      </div>

      {/* Recommended Offer Banner for Open Requests */}
      {isOpen && mode === 'idle' ? (
        <div
          className="qs-recommended-offer-banner"
          style={{
            background: 'rgba(255, 122, 33, 0.08)',
            border: '1px solid rgba(255, 122, 33, 0.28)',
            borderRadius: '10px',
            padding: '0.85rem 1rem',
            marginTop: '0.85rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.65rem',
          }}
        >
          <div>
            <strong style={{ color: '#ff9a52', fontSize: '0.9rem', display: 'block' }}>
              Recommended: {requestedDayLabel}, {formatTime12(recommendedStart)}–{formatTime12(recommendedEnd)} · ${recommendedFee}
            </strong>
            <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: 'var(--muted)' }}>
              ~{recommendedMinutes}-minute visit · {route?.anchorLabel ? `slotted after ${route.anchorLabel}` : route?.detourMinutes != null ? `${route.detourMinutes}-min route impact` : 'fits schedule'}
            </p>
          </div>
          <button
            type="button"
            className="btn primary"
            style={{ minHeight: '44px', fontSize: '0.84rem', padding: '0.4rem 0.95rem' }}
            onClick={applyRecommendation}
          >
            ⚡ Use recommendation
          </button>
        </div>
      ) : null}

      <div className="form-grid" style={{ marginTop: '.75rem' }}>
        <div className="field">
          <label>Customer</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <p className="job-meta" style={{ margin: 0 }}>
              <strong>{request.client_name}</strong>
              {request.client_phone ? ` · ${request.client_phone}` : ''}
              {request.client_email ? ` · ${request.client_email}` : ''}
            </p>
            {request.client_phone ? (
              <div style={{ display: 'inline-flex', gap: '0.35rem', marginLeft: 'auto' }}>
                <a
                  href={`tel:${request.client_phone}`}
                  className="btn secondary"
                  style={{ minHeight: '36px', padding: '0.2rem 0.55rem', fontSize: '0.78rem', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                  title={`Call ${request.client_name}`}
                >
                  📞 Call
                </a>
                <a
                  href={`sms:${request.client_phone}`}
                  className="btn secondary"
                  style={{ minHeight: '36px', padding: '0.2rem 0.55rem', fontSize: '0.78rem', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                  title={`Text ${request.client_name}`}
                >
                  💬 Text
                </a>
              </div>
            ) : null}
          </div>
        </div>

        <div className="field">
          <label>Address</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <p className="job-meta" style={{ margin: 0, flex: 1 }}>{request.address || '—'}</p>
            {request.address ? (
              <div style={{ display: 'inline-flex', gap: '0.35rem' }}>
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(request.address)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn secondary"
                  style={{ minHeight: '36px', padding: '0.2rem 0.55rem', fontSize: '0.78rem', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                  title="Navigate with Google Maps"
                >
                  🗺️ Google Maps
                </a>
                <a
                  href={`https://maps.apple.com/?daddr=${encodeURIComponent(request.address)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn secondary"
                  style={{ minHeight: '36px', padding: '0.2rem 0.55rem', fontSize: '0.78rem', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                  title="Navigate with Apple Maps"
                >
                  🧭 Apple Maps
                </a>
              </div>
            ) : null}
          </div>
        </div>

        <div className="field">
          <label>Est. visit</label>
          <p className="job-meta" style={{ margin: 0 }}>
            {request.ai_visit_minutes ? `~${request.ai_visit_minutes} min` : '—'}
            {request.ai_complexity ? ` · ${request.ai_complexity}` : ''}
            {request.ai_confidence != null ? ` · ${Math.round(request.ai_confidence * 100)}% conf.` : ''}
          </p>
        </div>

        <div className="field">
          <label>Day requested</label>
          <p className="job-meta" style={{ margin: 0 }}>{requestedDayLabel}</p>
        </div>

        <div className="field">
          <label>Customer availability</label>
          <p className="job-meta" style={{ margin: 0 }}>{availabilityText || '—'}</p>
        </div>

        {request.intake?.startedWhen || request.intake?.worsening || request.intake?.propertyType ? (
          <div className="field full">
            <label>Details</label>
            <p className="job-meta" style={{ margin: 0 }}>
              {[
                request.intake?.propertyType && `Property: ${request.intake.propertyType}`,
                request.intake?.startedWhen && `Started: ${request.intake.startedWhen}`,
                request.intake?.worsening && `Worsening: ${request.intake.worsening}`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
        ) : null}

        {route && route.detourMiles != null ? (
          <div className="field full">
            <label>Route impact</label>
            <p className="job-meta" style={{ margin: 0 }}>
              {route.detourMiles} mi{route.anchorLabel ? ` from ${route.anchorLabel}` : ''}
              {route.detourMinutes != null ? ` · ~${route.detourMinutes} min added drive` : ''}
              {route.routeExtensionMinutes != null ? ` · +${route.routeExtensionMinutes} min total route` : ''}
            </p>
          </div>
        ) : null}
      </div>

      {photoUrls.length ? (
        <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', marginTop: '.5rem' }}>
          {photoUrls.map((url, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={url}
              alt={`Issue photo ${i + 1}`}
              style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 8, border: '1px solid rgba(255,255,255,.12)' }}
            />
          ))}
        </div>
      ) : null}

      {/* Sent / confirmed / live states */}
      {!isOpen ? (
        <>
          <p className="payment-banner muted" style={{ marginTop: '1rem' }}>
            {request.arrival_date
              ? `Offered ${request.arrival_date}, ${request.arrival_start}–${request.arrival_end} · fee ${money(request.fee_cents)}${
                  request.diagnostic_fee_cents ? ` + ${money(request.diagnostic_fee_cents)} diagnostic` : ''
                }.`
              : 'No live actions for this request.'}
          </p>

          {isLive ? (
            <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'center', marginTop: '1rem' }}>
              {request.status === 'confirmed' ? (
                <form action={markEnRouteQuickStopAction.bind(null, request.id)} style={{ flex: '1 1 140px' }}>
                  <button type="submit" className="btn primary" style={{ minHeight: '44px', width: '100%' }}>
                    🚗 Mark en route
                  </button>
                </form>
              ) : null}

              {request.status === 'confirmed' || request.status === 'en_route' ? (
                <button
                  type="button"
                  className="btn primary"
                  onClick={handleArrived}
                  disabled={arriving}
                  style={{ minHeight: '44px', flex: '1 1 140px' }}
                >
                  {arriving ? 'Recording…' : "📍 I've Arrived"}
                </button>
              ) : null}

              {(request.status === 'confirmed' || request.status === 'en_route') && request.client_phone ? (
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => handleSendEta(15)}
                  disabled={etaSending || etaSent}
                  style={{ minHeight: '44px', flex: '1 1 140px' }}
                >
                  {etaSending ? 'Sending…' : etaSent ? '✓ 15m ETA Sent' : '💬 Send 15m ETA'}
                </button>
              ) : null}

              <form action={completeQuickStopAction.bind(null, request.id)} style={{ flex: '1 1 140px' }}>
                <button type="submit" className="btn secondary" style={{ minHeight: '44px', width: '100%' }}>
                  ✓ Mark complete
                </button>
              </form>

              {request.status === 'confirmed' || request.status === 'en_route' ? (
                <button type="button" className="btn secondary" onClick={() => setMode('window')} style={{ minHeight: '44px' }}>
                  Propose new window
                </button>
              ) : null}

              <button type="button" className="btn secondary" onClick={() => setMode('diag')} style={{ minHeight: '44px' }}>
                Convert to diagnostic
              </button>

              {request.status === 'confirmed' || request.status === 'en_route' ? (
                mode === 'cancel' ? (
                  <form action={cancelQuickStopByContractorAction.bind(null, request.id)} style={{ display: 'flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap', marginTop: '0.5rem', width: '100%' }}>
                    <input name="reason" placeholder="Reason for cancellation (optional)" style={{ minHeight: '44px', flex: 1 }} />
                    <button type="submit" className="btn secondary" style={{ minHeight: '44px' }}>
                      Confirm cancel (full refund)
                    </button>
                    <button type="button" className="btn ghost" onClick={() => setMode('idle')} style={{ minHeight: '44px' }}>
                      Back
                    </button>
                  </form>
                ) : (
                  <button type="button" className="btn ghost" onClick={() => setMode('cancel')} style={{ minHeight: '44px', color: 'var(--muted)' }}>
                    Cancel &amp; refund
                  </button>
                )
              ) : null}
            </div>
          ) : null}

          {isLive && request.proposed_arrival_date ? (
            <p className="payment-banner muted" style={{ marginTop: '.75rem' }}>
              Proposed new window {request.proposed_arrival_date}, {request.proposed_arrival_start}–{request.proposed_arrival_end} — awaiting the customer.
            </p>
          ) : null}

          {isLive && request.diagnostic_conversion === 'proposed' ? (
            <p className="payment-banner muted" style={{ marginTop: '.75rem' }}>
              Diagnostic conversion proposed ({money(request.diagnostic_proposed_cents)}) — awaiting the customer.
            </p>
          ) : null}

          {request.diagnostic_conversion === 'approved' ? (
            <p className="payment-banner success" style={{ marginTop: '.75rem' }}>
              Diagnostic conversion approved{request.diagnostic_proposed_cents ? ` (${money(request.diagnostic_proposed_cents)} total)` : ''}.
            </p>
          ) : null}

          {request.diagnostic_conversion === 'declined' ? (
            <p className="payment-banner muted" style={{ marginTop: '.75rem' }}>
              The customer declined the diagnostic conversion.
            </p>
          ) : null}

          {isLive && mode === 'window' ? (
            <form action={proposeRevisedWindowQuickStopAction.bind(null, request.id)} className="form-grid" style={{ marginTop: '1rem' }}>
              <div className="field">
                <label htmlFor={`pd-${request.id}`}>New date</label>
                <input id={`pd-${request.id}`} name="proposedDate" type="date" defaultValue={request.arrival_date || request.requested_date || todayKey()} required />
              </div>
              <div className="field">
                <label htmlFor={`ps-${request.id}`}>Start</label>
                <input id={`ps-${request.id}`} name="proposedStart" type="time" defaultValue={request.arrival_start ?? '08:00'} required />
              </div>
              <div className="field">
                <label htmlFor={`pe-${request.id}`}>End</label>
                <input id={`pe-${request.id}`} name="proposedEnd" type="time" defaultValue={request.arrival_end ?? '20:00'} required />
              </div>
              <div className="field full" style={{ display: 'flex', gap: '.5rem' }}>
                <button type="submit" className="btn primary" style={{ minHeight: '44px' }}>
                  Propose window (customer must accept)
                </button>
                <button type="button" className="btn secondary" onClick={() => setMode('idle')} style={{ minHeight: '44px' }}>
                  Cancel
                </button>
              </div>
            </form>
          ) : null}

          {isLive && mode === 'diag' ? (
            <form action={proposeDiagnosticConversionAction.bind(null, request.id)} className="form-grid" style={{ marginTop: '1rem' }}>
              <div className="field">
                <label htmlFor={`dt-${request.id}`}>Diagnostic total ($)</label>
                <input id={`dt-${request.id}`} name="diagnosticTotal" type="number" min="1" step="5" required />
                <small className="field-hint">The Quick Stop fee already paid applies as a deposit; the customer is billed only the difference.</small>
              </div>
              <div className="field full">
                <label htmlFor={`dn-${request.id}`}>Note (optional)</label>
                <textarea id={`dn-${request.id}`} name="note" rows={2} placeholder="Found the leak is behind the wall — needs a proper diagnostic." />
              </div>
              <div className="field full" style={{ display: 'flex', gap: '.5rem' }}>
                <button type="submit" className="btn primary" style={{ minHeight: '44px' }}>
                  Propose conversion (customer must approve)
                </button>
                <button type="button" className="btn secondary" onClick={() => setMode('idle')} style={{ minHeight: '44px' }}>
                  Cancel
                </button>
              </div>
            </form>
          ) : null}
        </>
      ) : (
        <>
          {mode === 'idle' ? (
            <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', marginTop: '1rem' }}>
              <button type="button" className="btn primary" onClick={() => setMode('offer')} style={{ minHeight: '44px' }}>
                Create Custom Offer
              </button>
              <button type="button" className="btn secondary" onClick={() => setMode('info')} style={{ minHeight: '44px' }}>
                Request More Information
              </button>
              <button type="button" className="btn secondary" onClick={() => setMode('decline')} style={{ minHeight: '44px' }}>
                Decline
              </button>
            </div>
          ) : null}

          {mode === 'offer' ? (
            <form action={createQuickStopOfferAction.bind(null, request.id)} className="form-grid" style={{ marginTop: '1rem' }}>
              <div className="field">
                <label htmlFor={`ad-${request.id}`}>Arrival date</label>
                <input
                  id={`ad-${request.id}`}
                  name="arrivalDate"
                  type="date"
                  value={offerDate}
                  onChange={(e) => setOfferDate(e.target.value)}
                  required
                />
              </div>

              <div className="field">
                <label htmlFor={`vm-${request.id}`}>Visit minutes</label>
                <input
                  id={`vm-${request.id}`}
                  name="visitMinutes"
                  type="number"
                  min="5"
                  step="5"
                  value={offerMinutes}
                  onChange={(e) => setOfferMinutes(Number(e.target.value))}
                />
              </div>

              <div className="field">
                <label htmlFor={`as-${request.id}`}>Window start</label>
                <input
                  id={`as-${request.id}`}
                  name="arrivalStart"
                  type="time"
                  value={offerStart}
                  onChange={(e) => setOfferStart(e.target.value)}
                  required
                />
              </div>

              <div className="field">
                <label htmlFor={`ae-${request.id}`}>Window end</label>
                <input
                  id={`ae-${request.id}`}
                  name="arrivalEnd"
                  type="time"
                  value={offerEnd}
                  onChange={(e) => setOfferEnd(e.target.value)}
                  required
                />
              </div>

              <div className="field full">
                <label htmlFor={`fee-${request.id}`}>Priority visit fee ($)</label>
                <input
                  id={`fee-${request.id}`}
                  name="fee"
                  type="number"
                  min={defaults.minFeeDollars}
                  max={defaults.maxFeeDollars}
                  step="5"
                  value={offerFee}
                  onChange={(e) => setOfferFee(Number(e.target.value))}
                  required
                />
                <small className="field-hint">
                  Allowed {money(defaults.minFeeDollars * 100)}–{money(defaults.maxFeeDollars * 100)}. A 10% platform fee applies to the visit fee; invoice service work separately.
                </small>
              </div>

              {/* Collapsed Advanced Options: Diagnostic fee & Note */}
              <div className="field full">
                <details style={{ marginTop: '0.25rem', padding: '0.5rem 0' }}>
                  <summary style={{ cursor: 'pointer', fontSize: '0.85rem', color: 'var(--muted)', userSelect: 'none' }}>
                    + Add diagnostic fee or customer note
                  </summary>
                  <div className="form-grid" style={{ marginTop: '0.75rem' }}>
                    <div className="field">
                      <label htmlFor={`df-${request.id}`}>Diagnostic fee ($, optional)</label>
                      <input
                        id={`df-${request.id}`}
                        name="diagnosticFee"
                        type="number"
                        min="0"
                        step="5"
                        placeholder="0"
                        value={diagFee}
                        onChange={(e) => setDiagFee(e.target.value)}
                      />
                    </div>
                    <div className="field full">
                      <label htmlFor={`note-${request.id}`}>Note to customer (optional)</label>
                      <textarea
                        id={`note-${request.id}`}
                        name="note"
                        rows={2}
                        placeholder="I can be there between 2 and 4 PM."
                        value={offerNote}
                        onChange={(e) => setOfferNote(e.target.value)}
                      />
                    </div>
                  </div>
                </details>
              </div>

              <div className="field full" style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
                <button type="submit" className="btn primary" style={{ minHeight: '44px' }}>
                  Send Quick Stop Offer
                </button>
                <button type="button" className="btn secondary" onClick={() => setMode('idle')} style={{ minHeight: '44px' }}>
                  Cancel
                </button>
              </div>
            </form>
          ) : null}

          {mode === 'info' ? (
            <form action={requestMoreInfoQuickStopAction.bind(null, request.id)} className="form-grid" style={{ marginTop: '1rem' }}>
              <div className="field full">
                <label htmlFor={`info-${request.id}`}>What do you need to know?</label>
                <textarea id={`info-${request.id}`} name="note" rows={2} required placeholder="Can you send a photo of the shutoff valve?" />
              </div>
              <div className="field full" style={{ display: 'flex', gap: '.5rem' }}>
                <button type="submit" className="btn primary" style={{ minHeight: '44px' }}>
                  Request info
                </button>
                <button type="button" className="btn secondary" onClick={() => setMode('idle')} style={{ minHeight: '44px' }}>
                  Cancel
                </button>
              </div>
            </form>
          ) : null}

          {mode === 'decline' ? (
            <form action={declineQuickStopAction.bind(null, request.id)} className="form-grid" style={{ marginTop: '1rem' }}>
              <div className="field full">
                <label htmlFor={`dec-${request.id}`}>Reason (optional)</label>
                <input id={`dec-${request.id}`} name="reason" placeholder="Too far off the route that day" />
              </div>
              <div className="field full" style={{ display: 'flex', gap: '.5rem' }}>
                <button type="submit" className="btn primary" style={{ minHeight: '44px' }}>
                  Decline request
                </button>
                <button type="button" className="btn secondary" onClick={() => setMode('idle')} style={{ minHeight: '44px' }}>
                  Cancel
                </button>
              </div>
            </form>
          ) : null}
        </>
      )}

      {/* Communication & Touchpoint Audit Trail */}
      {auditTimeline.length > 0 ? (
        <details className="qs-touchpoint-history" style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid var(--edge-t10, rgba(255,255,255,0.08))' }}>
          <summary style={{ cursor: 'pointer', fontSize: '0.82rem', color: 'var(--muted)', userSelect: 'none', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span>🕒 Activity &amp; Communication Log</span>
            <small style={{ marginLeft: 'auto', opacity: 0.75 }}>{auditTimeline.length} events</small>
          </summary>
          <div style={{ marginTop: '0.65rem', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
            {auditTimeline.map((item, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem', color: 'var(--muted)' }}>
                <span aria-hidden="true" style={{ fontSize: '0.85rem' }}>{item.icon}</span>
                <span style={{ color: 'var(--text)' }}>{item.label}</span>
                <span style={{ marginLeft: 'auto', fontSize: '0.74rem', opacity: 0.7 }}>
                  {item.date} · {item.time}
                </span>
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </section>
  );
}
