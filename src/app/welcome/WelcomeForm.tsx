'use client';

import { useState, useEffect, useRef, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { completeFirstRunAction } from './actions';
import { seedSiteFromFirstRunAction } from './seed-actions';
import { resolveFirstRunPlaceAction } from './lookup-actions';
import { formatZipEcho, isFiveDigitZip } from '@/lib/welcome-zip-echo';
import { trackSignupConversion, updateGoogleConsent } from '@/lib/google-tag';
import TradeSearchSelect from '@/components/trade-search-select';
import WelcomePreviewCard from './WelcomePreviewCard';

type TradeOption = { slug: string; name: string };

export default function WelcomeForm({
  initialBusinessName,
  initialPostalCode,
  initialTrade = '',
  trades,
  planCode = null,
  billingInterval = null,
  goal = 'build_site',
  feature = null,
  city = null,
  next = null,
  returning = false,
}: {
  initialBusinessName: string;
  initialPostalCode: string;
  initialTrade?: string | null;
  trades: TradeOption[];
  planCode?: string | null;
  billingInterval?: string | null;
  goal?: string | null;
  feature?: string | null;
  city?: string | null;
  next?: string | null;
  returning?: boolean;
}) {
  const router = useRouter();
  const [businessName, setBusinessName] = useState(initialBusinessName);
  const [trade, setTrade] = useState(initialTrade || '');
  const [tradeSource, setTradeSource] = useState<'guessed' | 'typed' | 'url'>(
    initialTrade ? 'url' : 'typed',
  );
  const [postalCode, setPostalCode] = useState(initialPostalCode);
  const [resolvedPlace, setResolvedPlace] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [allowMeasurementCookies, setAllowMeasurementCookies] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);
  const [pending, startTransition] = useTransition();

  const zipCacheRef = useRef<Map<string, string | null>>(new Map());
  const zipSeqRef = useRef(0);

  // Echo 5-digit ZIP to verified city via same geocode call site generator uses (gated on !returning)
  useEffect(() => {
    if (returning) {
      setResolvedPlace(null);
      return;
    }

    const trimmed = postalCode.trim();
    if (!isFiveDigitZip(trimmed)) {
      setResolvedPlace(null);
      return;
    }

    const cached = zipCacheRef.current.get(trimmed);
    if (cached !== undefined) {
      setResolvedPlace(cached);
      return;
    }

    const seq = ++zipSeqRef.current;
    const timer = setTimeout(async () => {
      try {
        const result = await resolveFirstRunPlaceAction(trimmed);
        if (zipSeqRef.current !== seq) return;
        if (result.ok && result.place) {
          zipCacheRef.current.set(trimmed, result.place);
          setResolvedPlace(result.place);
        } else {
          zipCacheRef.current.set(trimmed, null);
          setResolvedPlace(null);
        }
      } catch {
        if (zipSeqRef.current === seq) {
          zipCacheRef.current.set(trimmed, null);
          setResolvedPlace(null);
        }
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [postalCode, returning]);

  let submitButtonText = 'Build my free site';
  if (goal === 'build_site') {
    submitButtonText = 'Build my website';
  } else if (goal === 'choose_plan' && planCode) {
    submitButtonText = `Continue to ${planCode === 'growth' ? 'Growth' : planCode === 'starter' ? 'Starter' : planCode === 'scale' ? 'Scale' : 'Plan'}`;
  } else if (goal === 'feature' && feature) {
    const featureLabels: Record<string, string> = {
      quick_stops: 'Quick Stops',
      ai_intake: 'AI Intake',
      ai_receptionist: 'AI Receptionist',
      quotes: 'Quotes',
      scheduling: 'Scheduling',
      crew: 'Crew App',
      payments: 'Payments',
      reviews: 'Reviews',
      cash_flow: 'Cash Flow',
    };
    submitButtonText = `Go to ${featureLabels[feature] || feature}`;
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await completeFirstRunAction({
        businessName,
        trade,
        postalCode,
        accepted,
        plan: planCode,
        billing: billingInterval,
        goal,
        feature,
        next,
        tradeSource: initialTrade ? 'url' : tradeSource,
        zipResolved: Boolean(resolvedPlace),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }

      // Explicit user preference for measurement cookies (persisted to storage)
      updateGoogleConsent(allowMeasurementCookies, true);

      if (result.signupConversionTransactionId) {
        trackSignupConversion(result.signupConversionTransactionId, allowMeasurementCookies);
      }
      setBuilding(true);
      const seeded = await seedSiteFromFirstRunAction();

      router.replace(
        result.planCheckoutPath
          ?? result.destinationPath
          ?? (seeded.ok && seeded.built ? '/welcome/site' : '/dashboard/sites'),
      );
      router.refresh();
    });
  }

  const zipEcho = formatZipEcho(resolvedPlace);

  const formElement = (
    <form className="auth-form" onSubmit={submit} noValidate>
      <label htmlFor="wf-business">
        What&apos;s your business called?
        <input
          id="wf-business"
          name="businessName"
          type="text"
          value={businessName}
          onChange={(event) => setBusinessName(event.target.value)}
          placeholder="e.g. Brookhaven Plumbing"
          autoComplete="organization"
          maxLength={80}
          autoFocus
          required
        />
      </label>
      <p className="welcome-hint">This is the name on your website, your quotes, and every text your customers get.</p>

      <label htmlFor="wf-trade">
        What kind of work do you do?
        <TradeSearchSelect
          id="wf-trade"
          name="trade"
          value={trade}
          onChange={(nextTrade) => {
            setTrade(nextTrade);
            if (!nextTrade) {
              setTradeSource('typed');
            }
          }}
          autoFillFromBusinessName={!initialTrade && !returning}
          onAutoFillChange={(autoFilled) => {
            setTradeSource(autoFilled ? 'guessed' : 'typed');
          }}
          businessName={businessName}
          initialTrade={initialTrade}
          placeholder="Search trade or specialty (e.g. Plumber, HVAC, Glass)…"
        />
      </label>
      <p className="welcome-hint">We use this to pick your starting design, your icons, and how the estimator prices work.</p>

      <label htmlFor="wf-zip">
        What ZIP do you work out of?
        <input
          id="wf-zip"
          name="postalCode"
          type="text"
          inputMode="numeric"
          value={postalCode}
          onChange={(event) => setPostalCode(event.target.value)}
          placeholder="e.g. 48226"
          autoComplete="postal-code"
          maxLength={10}
          required
        />
      </label>
      {zipEcho ? (
        <p className="welcome-hint welcome-zip-echo" aria-live="polite">
          <strong>{zipEcho.headline} </strong>
          {zipEcho.lead}
        </p>
      ) : (
        <p className="welcome-hint">
          {city
            ? `We have your city (${city}), but need your 5-digit ZIP for accurate permit requirements, tax rules, and local Google SEO.`
            : 'This is what lets us write your whole site about the actual towns you serve, not "your local area".'}
        </p>
      )}

      <label className="welcome-accept" htmlFor="wf-accept">
        <input
          id="wf-accept"
          name="accepted"
          type="checkbox"
          checked={accepted}
          onChange={(event) => setAccepted(event.target.checked)}
        />
        <span>
          I agree to the <a href="/terms" target="_blank" rel="noreferrer">Terms of Service</a> and the{' '}
          <a href="/privacy" target="_blank" rel="noreferrer">Privacy Policy</a>.
        </span>
      </label>

      <label className="welcome-accept" htmlFor="wf-consent" style={{ marginTop: '0.45rem', fontSize: '0.8rem', color: 'var(--muted)' }}>
        <input
          id="wf-consent"
          name="consent"
          type="checkbox"
          checked={allowMeasurementCookies}
          onChange={(event) => setAllowMeasurementCookies(event.target.checked)}
        />
        <span>
          Allow anonymous measurement and ad performance cookies to help us improve service (optional).
        </span>
      </label>

      {error && <p className="auth-message" role="alert">{error}</p>}

      {building && (
        <p className="welcome-building" role="status">
          <span className="welcome-spinner" aria-hidden="true" />
          Writing your website — services, FAQs, the towns you serve and your Google listing. This takes a few seconds.
        </p>
      )}

      <button className="btn primary" type="submit" disabled={pending}>
        {building ? 'Building your site…' : pending ? 'Setting up…' : `${submitButtonText} →`}
      </button>
    </form>
  );

  if (returning) {
    return formElement;
  }

  return (
    <div className="welcome-split">
      {formElement}
      <WelcomePreviewCard
        businessName={businessName}
        tradeSlug={trade}
        city={city}
        resolvedPlace={resolvedPlace}
      />
    </div>
  );
}

