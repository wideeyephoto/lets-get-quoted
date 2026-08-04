'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { completeFirstRunAction } from './actions';
import { seedSiteFromFirstRunAction } from './seed-actions';

type TradeOption = { slug: string; name: string };

export default function WelcomeForm({
  initialBusinessName,
  initialPostalCode,
  trades,
}: {
  initialBusinessName: string;
  initialPostalCode: string;
  trades: TradeOption[];
}) {
  const router = useRouter();
  const [businessName, setBusinessName] = useState(initialBusinessName);
  const [trade, setTrade] = useState('');
  const [postalCode, setPostalCode] = useState(initialPostalCode);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      // Two steps on purpose. Acceptance is a fast database write and must not
      // be held hostage by a model call; building the site takes several seconds
      // and can fail. Splitting them means a slow OpenAI day costs a spinner
      // instead of making signup look broken.
      const result = await completeFirstRunAction({ businessName, trade, postalCode, accepted });
      if (!result.ok) {
        setError(result.error);
        return;
      }

      setBuilding(true);
      // Deliberately not awaited into a failure path: whatever happens next, the
      // account exists and the terms are accepted. A site that didn't build is a
      // button press away, and trapping someone on this screen over it would be
      // far worse than landing them in the builder with a note.
      const seeded = await seedSiteFromFirstRunAction();

      // replace, not push — first run is not somewhere Back should return to.
      router.replace(seeded.ok && seeded.built ? '/dashboard/sites?built=1' : '/dashboard/sites');
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
      <p className="welcome-hint">This is what lets us write your whole site about the actual towns you serve, not &ldquo;your local area&rdquo;.</p>

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
        {building ? 'Building your site…' : pending ? 'Setting up…' : 'Start setting up'}
      </button>
    </form>
  );
}
