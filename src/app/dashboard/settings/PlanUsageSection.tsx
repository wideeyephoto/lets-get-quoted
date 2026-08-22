import Link from 'next/link';
import type { ReactNode } from 'react';

type PlanUsageTone = 'good' | 'warn' | 'danger' | 'neutral';

export type PlanUsageSnapshot = {
  accessTier: string | null;
  trailingVolume: number;
  feeTier: {
    tier: number;
    rate: number;
    nextTier: { tier: number; rate: number; minVolume: number } | null;
    progressToNext: number | null;
    amountToNextTier: number | null;
  };
  accountCreditCents: number | null;
  messaging: {
    available: boolean;
    outboundLast30Days: number;
    inboundLast30Days: number;
    previous30Days: number;
    numberConfigured: boolean;
  };
  voice: {
    trackingNumberConfigured: boolean;
    forwardingNumberConfigured: boolean;
    routingVerified: boolean;
    missedCallTextBackEnabled: boolean;
  };
  payments: {
    connected: boolean;
    paused: boolean;
    restricted: boolean;
  };
};

type ActionRow = {
  title: string;
  description: string;
  tone: Exclude<PlanUsageTone, 'neutral'>;
  href: string;
  cta: string;
};

type SignalRow = {
  title: string;
  description: string;
  tone: PlanUsageTone;
  href: string;
  cta: string;
};

const quickLinks = [
  { anchor: '#plan', title: 'Overview', hint: 'Pricing and readiness at a glance.' },
  { anchor: '#plan-priority', title: 'Priority', hint: 'The next action worth taking.' },
  { anchor: '#plan-risk', title: 'Readiness', hint: 'See what is connected and verified.' },
  { anchor: '#usage-balances', title: 'Activity', hint: 'Real messaging activity, not allowances.' },
  { anchor: '#buy-credits', title: 'Credits', hint: 'Your current account-credit balance.' },
  { anchor: '#plan-alerts', title: 'Signals', hint: 'Important account conditions.' },
] as const;

const ACCESS_TIER_LABELS: Record<string, string> = {
  free: 'Free access',
  pro: 'Pro access',
  crew_plus: 'Crew Plus access',
};

function money(value: number) {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
}

function count(value: number) {
  return value.toLocaleString('en-US');
}

function accessTierLabel(value: string | null) {
  if (!value) return ACCESS_TIER_LABELS.free;
  return ACCESS_TIER_LABELS[value] ?? `${value.replace(/_/g, ' ')} access`;
}

function ToneDot({ tone }: { tone: PlanUsageTone }) {
  return <span className={`plan-usage-tone-dot is-${tone}`} aria-hidden="true" />;
}

function PlanLink({ href, className, children }: { href: string; className: string; children: ReactNode }) {
  // Same-page fragments must use a native anchor. Next's Link updates the hash
  // with pushState, which does not fire hashchange; SettingsTabs needs that
  // event to reveal a section that lives in a different tab.
  return href.startsWith('#')
    ? <a href={href} className={className}>{children}</a>
    : <Link href={href} className={className}>{children}</Link>;
}

function ReadinessItem({ ready, title, detail }: { ready: boolean; title: string; detail: string }) {
  return (
    <li className={`plan-usage-risk-item is-${ready ? 'good' : 'warn'}`}>
      <header>
        <ToneDot tone={ready ? 'good' : 'warn'} />
        <strong>{title}</strong>
        <span>{ready ? 'Ready' : 'Needs setup'}</span>
      </header>
      <p>{detail}</p>
    </li>
  );
}

export default function PlanUsageSection({ snapshot }: { snapshot: PlanUsageSnapshot }) {
  const messageTotal = snapshot.messaging.outboundLast30Days + snapshot.messaging.inboundLast30Days;
  const payoutReady = snapshot.payments.connected && !snapshot.payments.paused && !snapshot.payments.restricted;
  const voiceReady = snapshot.voice.trackingNumberConfigured
    && snapshot.voice.forwardingNumberConfigured
    && snapshot.voice.routingVerified;
  const readinessChecks = [
    payoutReady,
    snapshot.messaging.numberConfigured,
    snapshot.voice.trackingNumberConfigured && snapshot.voice.forwardingNumberConfigured,
    snapshot.voice.routingVerified,
  ];
  const readinessPercent = Math.round((readinessChecks.filter(Boolean).length / readinessChecks.length) * 100);
  const issueCount = readinessChecks.filter((ready) => !ready).length;
  const tierProgress = Math.round((snapshot.feeTier.progressToNext ?? 1) * 100);

  const actions: ActionRow[] = [];
  if (!snapshot.payments.connected) {
    actions.push({
      title: 'Finish payout setup',
      description: 'Connect Stripe before accepting online card or bank payments.',
      tone: 'danger',
      href: '#payouts',
      cta: 'Open payouts',
    });
  } else if (snapshot.payments.paused || snapshot.payments.restricted) {
    actions.push({
      title: 'Review payout status',
      description: 'Your payout connection exists, but money movement currently needs attention.',
      tone: 'danger',
      href: '#payouts',
      cta: 'Review payouts',
    });
  }
  if (!snapshot.messaging.numberConfigured) {
    actions.push({
      title: 'Finish messaging setup',
      description: 'Assign a messaging number so replies route to the correct account.',
      tone: 'warn',
      href: '/dashboard/messages?setup=1',
      cta: 'Set up messaging',
    });
  }
  if (!snapshot.voice.trackingNumberConfigured || !snapshot.voice.forwardingNumberConfigured) {
    actions.push({
      title: 'Complete call routing',
      description: 'Add the tracking and forwarding numbers required for calls and missed-call follow-up.',
      tone: 'warn',
      href: '/dashboard/automations#missed-call',
      cta: 'Open call settings',
    });
  } else if (!snapshot.voice.routingVerified) {
    actions.push({
      title: 'Verify the voice route',
      description: 'Place one test call to confirm the provider webhook and forwarding path are live.',
      tone: 'warn',
      href: '/dashboard/automations#missed-call',
      cta: 'Review call setup',
    });
  }

  const visibleActions = actions.slice(0, 3);
  const signals: SignalRow[] = [
    {
      title: 'Payments',
      description: payoutReady
        ? 'Stripe is connected and payouts are available.'
        : 'Payments or payouts need attention before every money flow is available.',
      tone: payoutReady ? 'good' : 'danger',
      href: '#payouts',
      cta: 'Review payments',
    },
    {
      title: 'Messaging',
      description: snapshot.messaging.available
        ? `${count(messageTotal)} messages were recorded in the last 30 days.`
        : 'Messaging activity is temporarily unavailable on this page.',
      tone: snapshot.messaging.available ? (snapshot.messaging.numberConfigured ? 'good' : 'warn') : 'neutral',
      href: '/dashboard/messages',
      cta: 'Open messages',
    },
    {
      title: 'Call handling',
      description: voiceReady
        ? `Call routing is verified${snapshot.voice.missedCallTextBackEnabled ? ' and missed-call text-back is on' : ''}.`
        : 'Call routing is not fully configured and verified yet.',
      tone: voiceReady ? 'good' : 'warn',
      href: '/dashboard/automations#missed-call',
      cta: 'Open call settings',
    },
  ];

  return (
    <>
      <section className="panel workspace-section-card plan-usage-hero plan-usage-section-anchor" id="plan">
        <div className="plan-usage-hero-head">
          <div>
            <p className="eyebrow">Plan at a glance</p>
            <h2>Your pricing, activity, and setup</h2>
          </div>
          <div className="plan-usage-status-row">
            <span className="plan-usage-status is-good">Usage-based · no subscription</span>
            <span className="plan-usage-update">Live account data</span>
          </div>
        </div>

        <p className="workspace-details-copy plan-usage-hero-copy">
          See what you pay, what your account used recently, and which setup item deserves attention. Message and
          voice activity are shown as activity—not as invented monthly limits.
        </p>

        <div className="plan-usage-hero-stats">
          <span>Setup readiness <strong>{readinessPercent}%</strong></span>
          <span>Platform fee <strong>{(snapshot.feeTier.rate * 100).toFixed(2)}%</strong></span>
          <span>Last 30 days <strong>{snapshot.messaging.available ? count(messageTotal) : 'Unavailable'}</strong></span>
          <span>{issueCount === 0 ? 'No setup blockers' : `${issueCount} setup item${issueCount === 1 ? '' : 's'} to review`}</span>
        </div>

        <nav className="plan-usage-quick-nav" aria-label="Plan shortcuts">
          <ul className="plan-usage-quick-links">
            {quickLinks.map((link) => (
              <li key={link.anchor}>
                <a href={link.anchor}>
                  <strong>{link.title}</strong>
                  <span>{link.hint}</span>
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="plan-usage-kpi-grid">
          <article className="plan-usage-kpi-card">
            <strong>{accessTierLabel(snapshot.accessTier)}</strong>
            <p>Feature access</p>
            <small>No monthly software renewal</small>
          </article>
          <article className="plan-usage-kpi-card">
            <strong>{(snapshot.feeTier.rate * 100).toFixed(2)}%</strong>
            <p>Current platform fee</p>
            <small>Applied only when a customer pays you</small>
          </article>
          <article className="plan-usage-kpi-card">
            <strong>{money(snapshot.trailingVolume)}</strong>
            <p>Trailing 12-month volume</p>
            <small>Determines your fee tier</small>
          </article>
          <article className="plan-usage-kpi-card">
            <strong>{snapshot.accountCreditCents == null ? 'Unavailable' : money(snapshot.accountCreditCents / 100)}</strong>
            <p>Account credits</p>
            <small>Your current billing-credit ledger balance</small>
          </article>
          <article className="plan-usage-kpi-card">
            <strong>{payoutReady ? 'Ready' : 'Needs attention'}</strong>
            <p>Payment collection</p>
            <small>{payoutReady ? 'Stripe connection is available' : 'Review payout setup or restrictions'}</small>
          </article>
        </div>
      </section>

      <section className="panel workspace-section-card plan-usage-section-anchor" id="plan-priority">
        <div className="workspace-section-heading compact-heading">
          <p className="eyebrow">Priority now</p>
          <h2>{visibleActions.length === 0 ? 'Everything important is ready' : 'Recommended next actions'}</h2>
        </div>
        <p className="workspace-details-copy plan-usage-copy">
          Ordered by impact so the first item is the one to handle first.
        </p>
        <ul className="plan-usage-priority-list">
          {visibleActions.length === 0 ? (
            <li className="plan-usage-priority-item is-good">
              <ToneDot tone="good" />
              <div>
                <strong>No urgent setup work</strong>
                <p>Payments, messaging ownership, and call routing are ready. Keep an eye on the signals below.</p>
              </div>
            </li>
          ) : visibleActions.map((action) => (
            <li key={action.title} className={`plan-usage-priority-item is-${action.tone}`}>
              <ToneDot tone={action.tone} />
              <div>
                <strong>{action.title}</strong>
                <p>{action.description}</p>
                <PlanLink href={action.href} className="plan-usage-priority-action">{action.cta}</PlanLink>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel workspace-section-card plan-usage-section-anchor" id="plan-risk">
        <div className="workspace-section-heading compact-heading">
          <p className="eyebrow">Readiness</p>
          <h2>Core services</h2>
        </div>
        <p className="workspace-details-copy plan-usage-copy">
          These checks reflect configuration and verified traffic—not estimated availability.
        </p>
        <ul className="plan-usage-risk-list">
          <ReadinessItem ready={payoutReady} title="Payments and payouts" detail={payoutReady ? 'Connected and available.' : 'Connection, restriction, or payout state needs attention.'} />
          <ReadinessItem ready={snapshot.messaging.numberConfigured} title="Messaging ownership" detail={snapshot.messaging.numberConfigured ? 'A dedicated account number is configured.' : 'No account messaging number is configured yet.'} />
          <ReadinessItem ready={snapshot.voice.trackingNumberConfigured && snapshot.voice.forwardingNumberConfigured} title="Call routing" detail={snapshot.voice.trackingNumberConfigured && snapshot.voice.forwardingNumberConfigured ? 'Tracking and forwarding numbers are configured.' : 'A tracking or forwarding number is still missing.'} />
          <ReadinessItem ready={snapshot.voice.routingVerified} title="Live-call verification" detail={snapshot.voice.routingVerified ? 'A real inbound call has verified the route.' : 'The route has not yet been verified by a real inbound call.'} />
        </ul>
      </section>

      <section className="panel workspace-section-card plan-usage-section-anchor" id="usage-balances">
        <div className="workspace-section-heading compact-heading">
          <p className="eyebrow">Recent activity</p>
          <h2>Messaging and call setup</h2>
        </div>
        <p className="workspace-details-copy plan-usage-intro">
          A rolling 30-day view stays useful mid-month and avoids implying a balance or reset that does not exist.
        </p>
        <div className="plan-usage-balance-grid">
          <article className="plan-usage-balance-card">
            <header className="plan-usage-balance-head"><ToneDot tone="good" /><span>Messages sent</span></header>
            <strong className="plan-usage-activity-value">{snapshot.messaging.available ? count(snapshot.messaging.outboundLast30Days) : '—'}</strong>
            <p className="plan-usage-balance-note">Outbound messages recorded in the last 30 days.</p>
          </article>
          <article className="plan-usage-balance-card">
            <header className="plan-usage-balance-head"><ToneDot tone="neutral" /><span>Messages received</span></header>
            <strong className="plan-usage-activity-value">{snapshot.messaging.available ? count(snapshot.messaging.inboundLast30Days) : '—'}</strong>
            <p className="plan-usage-balance-note">Inbound customer replies recorded in the last 30 days.</p>
          </article>
          <article className="plan-usage-balance-card">
            <header className="plan-usage-balance-head"><ToneDot tone="neutral" /><span>Previous period</span></header>
            <strong className="plan-usage-activity-value">{snapshot.messaging.available ? count(snapshot.messaging.previous30Days) : '—'}</strong>
            <p className="plan-usage-balance-note">All messages in the preceding 30-day window.</p>
          </article>
          <article className="plan-usage-balance-card">
            <header className="plan-usage-balance-head"><ToneDot tone={voiceReady ? 'good' : 'warn'} /><span>Call handling</span></header>
            <strong className="plan-usage-activity-value is-text">{voiceReady ? 'Verified' : 'Setup needed'}</strong>
            <p className="plan-usage-balance-note">{snapshot.voice.missedCallTextBackEnabled ? 'Missed-call text-back is enabled.' : 'Missed-call text-back is off.'}</p>
          </article>
        </div>
      </section>

      <section className="panel workspace-section-card plan-usage-section-anchor" id="buy-credits">
        <div className="plan-usage-actions-head">
          <div className="workspace-section-heading compact-heading">
            <p className="eyebrow">Account credits</p>
            <h2>{snapshot.accountCreditCents == null ? 'Balance unavailable' : `${money(snapshot.accountCreditCents / 100)} available`}</h2>
          </div>
          <a href="#payments" className="btn secondary">Review payments</a>
        </div>
        <div className="plan-usage-credit-callout">
          <strong>No credit package is required.</strong>
          <p>
            Let&apos;s Get Quoted has no monthly software subscription and this build does not sell message or voice
            bundles. Any account credit issued to you is shown here as a billing-credit ledger balance; purchasing
            additional credits is not enabled in this build.
          </p>
        </div>
      </section>

      <section className="panel workspace-section-card plan-usage-section-anchor" id="plan-alerts">
        <div className="workspace-section-heading compact-heading">
          <p className="eyebrow">Signals</p>
          <h2>What the account is telling you</h2>
        </div>
        <ul className="plan-usage-alert-list">
          {signals.map((signal) => (
            <li key={signal.title} className={`plan-usage-alert is-${signal.tone}`}>
              <ToneDot tone={signal.tone} />
              <div>
                <h3>{signal.title}</h3>
                <p>{signal.description}</p>
                <PlanLink href={signal.href} className="plan-usage-alert-action">{signal.cta}</PlanLink>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel workspace-section-card plan-usage-section-anchor" id="plan-actions">
        <div className="plan-usage-actions-head">
          <div className="workspace-section-heading compact-heading">
            <p className="eyebrow">Manage</p>
            <h2>Go straight to the real controls</h2>
          </div>
          <div className="workspace-inline-row">
            <a href="#payments" className="btn primary">Payments</a>
            <Link href="/dashboard/messages?setup=1" className="btn secondary">Messaging</Link>
            <Link href="/dashboard/automations#missed-call" className="btn secondary">Call settings</Link>
          </div>
        </div>
        {snapshot.feeTier.nextTier ? (
          <div className="plan-usage-tier-progress">
            <div className="plan-usage-meter-head">
              <span className="plan-usage-meter-text">Progress to Tier {snapshot.feeTier.nextTier.tier}</span>
              <span className="plan-usage-meter-number">{tierProgress}%</span>
            </div>
            <div className="plan-usage-meter-track" role="img" aria-label={`${tierProgress}% of the way to fee tier ${snapshot.feeTier.nextTier.tier}`}>
              <span className="plan-usage-meter-fill is-good" style={{ width: `${tierProgress}%` }} />
            </div>
            <p className="plan-usage-balance-note">
              {money(snapshot.feeTier.amountToNextTier ?? 0)} more in trailing 12-month volume moves new payments to {(snapshot.feeTier.nextTier.rate * 100).toFixed(2)}%.
            </p>
          </div>
        ) : (
          <p className="workspace-details-copy plan-usage-copy">You are already on the lowest platform-fee tier.</p>
        )}
      </section>
    </>
  );
}
