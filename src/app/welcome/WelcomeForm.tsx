'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { completeFirstRunAction } from './actions';
import { seedSiteFromFirstRunAction } from './seed-actions';
import { trackSignupConversion } from '@/lib/google-tag';

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
}) {
  const router = useRouter();
  const [businessName, setBusinessName] = useState(initialBusinessName);
  const [trade, setTrade] = useState(initialTrade || '');
  const [postalCode, setPostalCode] = useState(initialPostalCode);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);
  const [pending, startTransition] = useTransition();

  let submitButtonText = 'Build my free site';
  if (goal === 'build_site') {
    submitButtonText = 'Build my website';
  } else if (goal === 'choose_plan' && planCode) {
    submitButtonText = `Continue to ${planCode === 'growth' ? 'Growth' : planCode === 'starter' ? 'Starter' : planCode === 'scale' ? 'Scale' : 'Plan'}`;
  } else if (goal === 'feature' && feature) {
    const featureLabels: Record<string, string> = {
      quick_stops: 'Quick Stops',
      ai_intake: 'AI Intake',
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
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }

      if (result.signupConversionTransactionId) {
        trackSignupConversion(result.signupConversionTransactionId);
      }
      setBuilding(true);
      const seeded = await seedSiteFromFirstRunAction();

      router.replace(
        result.planCheckoutPath
          ?? result.destinationPath
          ?? (seeded.ok && seeded.built ? '/dashboard/sites?built=1' : '/dashboard/sites'),
      );
      router.refresh();
    });
  }

  return (
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
        <select id="wf-trade" name="trade" value={trade} onChange={(event) => setTrade(event.target.value)}>
          <option value="">Something else</option>
          {trades.map((option) => (
            <option key={option.slug} value={option.slug}>{option.name}</option>
          ))}
        </select>
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
      <p className="welcome-hint">
        {city
          ? `We have your city (${city}), but need your 5-digit ZIP for accurate permit requirements, tax rules, and local Google SEO.`
          : 'This is what lets us write your whole site about the actual towns you serve, not "your local area".'}
      </p>

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
}
