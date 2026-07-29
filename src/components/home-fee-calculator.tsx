'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { platformFeeForVolume, marginalTierForVolume } from '@/lib/pricing';
import { emailFeeEstimateAction } from '@/app/lead-capture-actions';

const money = (n: number) => '$' + Math.round(n).toLocaleString('en-US');

// Rough card-processing estimate (percent only; the per-charge 30¢ can't be
// figured without a job count). Framed as an estimate, and noted to drop on ACH.
const STRIPE_PCT = 2.9;
// A representative field-service CRM subscription, for the "billed either way" contrast.
const CRM_MONTHLY = 299;

type SendState = 'idle' | 'sending' | 'sent' | 'error';

// Lightweight inline fee calculator + soft "email me my numbers" capture for the
// homepage pricing section. Uses the canonical @/lib/pricing math so it can never
// disagree with the full calculator on /pricing.
export default function HomeFeeCalculator() {
  const [volume, setVolume] = useState(250_000);
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState(''); // honeypot
  const [state, setState] = useState<SendState>('idle');
  const [error, setError] = useState('');

  const stats = useMemo(() => {
    const platformFee = platformFeeForVolume(volume);
    const tier = marginalTierForVolume(volume);
    const effectiveRate = volume > 0 ? (platformFee / volume) * 100 : 0;
    const stripeEst = volume * (STRIPE_PCT / 100);
    return { platformFee, tier, effectiveRate, stripeEst, crmYearly: CRM_MONTHLY * 12 };
  }, [volume]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state === 'sending') return;
    setState('sending');
    setError('');
    const res = await emailFeeEstimateAction({ email, volume, company });
    if (res.ok) {
      setState('sent');
    } else {
      setState('error');
      setError(res.error || 'Something went wrong.');
    }
  }

  return (
    <div className="hcalc">
      <div className="hcalc-slider">
        <label className="hcalc-slabel" htmlFor="hcalc-volume">
          How much do you collect through the platform a year?
        </label>
        <output className="hcalc-svalue" htmlFor="hcalc-volume">{money(volume)}</output>
        <input
          id="hcalc-volume"
          type="range"
          min={0}
          max={1_000_000}
          step={5_000}
          value={volume}
          onChange={(event) => setVolume(Number(event.target.value))}
        />
        <div className="hcalc-ends"><span>$0</span><span>$1M+</span></div>
      </div>

      <div className="hcalc-out">
        <div className="hcalc-stat hcalc-stat-lead">
          <span className="hcalc-l">You&rsquo;d pay us</span>
          <strong>{money(stats.platformFee)}<em>/yr</em></strong>
          <span className="hcalc-n">
            {stats.effectiveRate.toFixed(2)}% blended &middot; {stats.tier.rate} on your next dollar &middot; only when a
            homeowner pays you
          </span>
        </div>
        <div className="hcalc-vs">
          <div className="hcalc-stat">
            <span className="hcalc-l">Stripe card processing (est.)</span>
            <strong>~{money(stats.stripeEst)}<em>/yr</em></strong>
            <span className="hcalc-n">You pay this with any tool &mdash; near $0 on bank/ACH deposits.</span>
          </div>
          <div className="hcalc-stat hcalc-stat-crm">
            <span className="hcalc-l">A typical CRM subscription</span>
            <strong>{money(stats.crmYearly)}<em>/yr</em></strong>
            <span className="hcalc-n">$299/mo, billed every month &mdash; even the ones you book nothing &mdash; and Stripe&rsquo;s still on top.</span>
          </div>
        </div>
      </div>

      {state === 'sent' ? (
        <p className="hcalc-sent" role="status">
          Sent! Check your inbox for your breakdown. No spam, no card &mdash; come back whenever you&rsquo;re ready.
        </p>
      ) : (
        <form className="hcalc-capture" onSubmit={handleSubmit}>
          <label className="hcalc-clabel" htmlFor="hcalc-email">Not ready? Email me these numbers</label>
          <div className="hcalc-crow">
            <input
              id="hcalc-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="you@company.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
            {/* honeypot — hidden from real users */}
            <input
              type="text"
              name="company"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              className="hcalc-hp"
              value={company}
              onChange={(event) => setCompany(event.target.value)}
            />
            <button type="submit" className="btn primary" disabled={state === 'sending'}>
              {state === 'sending' ? 'Sending…' : 'Email me my numbers'}
            </button>
          </div>
          {state === 'error' ? <p className="hcalc-err" role="alert">{error}</p> : null}
          <p className="hcalc-fine">
            We&rsquo;ll send your breakdown and nothing else. <Link href="/pricing">See the full calculator &rarr;</Link>
          </p>
        </form>
      )}
    </div>
  );
}
