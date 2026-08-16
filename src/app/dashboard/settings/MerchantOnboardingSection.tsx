import type {
  MerchantOnboardingFeedbackCode,
  MerchantOnboardingSurface,
} from '@/lib/billing/merchant-onboarding-entrypoint';
import { startStripeMerchantOnboardingAction } from './merchant-actions';

const FEEDBACK: Partial<Record<MerchantOnboardingFeedbackCode, string>> = {
  rollout_disabled: 'This Stripe setup flow is not enabled in this environment.',
  rate_limited: 'Stripe setup is temporarily limited. Wait ten minutes, then try again.',
  profile_incomplete: 'Add a verified email address before starting Stripe setup.',
  setup_in_progress: 'Stripe setup is already starting. Refresh this page in a moment.',
  setup_review_required: 'LGQ is safely reviewing the first setup attempt and will not create a duplicate Stripe account.',
  configuration_unavailable: 'Stripe Merchant setup is not configured for this workspace.',
  temporarily_unavailable: 'Stripe setup could not be opened. Nothing changed; try again shortly.',
  verification_unavailable: 'Stripe returned you to LGQ, but the latest readiness check could not be confirmed yet.',
  merchant_pending: 'Stripe saved your setup. More information or verification may still be required.',
  merchant_restricted: 'Stripe saved your setup, but the account still needs attention before it can accept payments.',
  merchant_ready: 'Stripe verified this account for direct payments and payouts.',
  merchant_disabled: 'Stripe reports that this account is disabled. Contact support before trying to accept payments.',
};

const STATUS: Record<
  MerchantOnboardingSurface['status'],
  Readonly<{ label: string; detail: string; badgeClass?: string }>
> = {
  not_started: {
    label: 'Not started',
    detail: 'Create the contractor-owned Stripe account used by LGQ’s upcoming direct-payment flow.',
  },
  pending: {
    label: 'Setup incomplete',
    detail: 'Continue on Stripe to provide the remaining business, identity, or payout information.',
  },
  restricted: {
    label: 'Action needed',
    detail: 'Stripe needs more information before card payments and payouts can both be enabled.',
  },
  ready: {
    label: 'Verified',
    detail: 'Stripe confirmed full Dashboard access, card payments, payouts, Stripe-collected processing fees, and Stripe loss responsibility.',
    badgeClass: 'linked',
  },
  disabled: {
    label: 'Disabled',
    detail: 'This Stripe account cannot be used for the direct-payment flow. Contact LGQ support.',
  },
  unavailable: {
    label: 'Status unavailable',
    detail: 'LGQ could not prove the current Stripe readiness facts, so this account is not shown as ready.',
  },
};

function formatCheckedAt(value: string | null): string | null {
  if (!value) return null;
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
  });
}

export default function MerchantOnboardingSection({
  surface,
  feedback,
}: {
  surface: MerchantOnboardingSurface;
  feedback?: string;
}) {
  const status = STATUS[surface.status];
  const feedbackMessage = feedback && Object.prototype.hasOwnProperty.call(FEEDBACK, feedback)
    ? FEEDBACK[feedback as MerchantOnboardingFeedbackCode]
    : null;
  const canOnboard = surface.status === 'not_started'
    || surface.status === 'pending'
    || surface.status === 'restricted';
  const checkedAt = formatCheckedAt(surface.checkedAt);

  return (
    <section className="panel workspace-section-card" id="merchant-payments">
      <div className="section-heading workspace-section-heading compact-heading">
        <p className="eyebrow">Upcoming direct payments</p>
        <h2>Stripe Merchant account</h2>
      </div>
      <p className="workspace-details-copy" style={{ marginTop: '0.5rem', marginBottom: '1rem' }}>
        This full Stripe Dashboard account is built for direct charges: Stripe deducts its processing
        fees from the contractor and remains responsible for connected-account losses. LGQ&apos;s separate
        published platform fee still applies.
      </p>

      <div className="sign-in-methods-list">
        <div className="sign-in-method-row">
          <div className="method-info">
            <span className="method-icon method-icon-stripe" aria-hidden="true">S</span>
            <div>
              <span className="method-name">Stripe Merchant</span>
              <span className="method-detail">{status.detail}</span>
            </div>
          </div>
          <div className="actions">
            <span className={`sign-in-method-badge${status.badgeClass ? ` ${status.badgeClass}` : ''}`}>
              {status.label}
            </span>
            {canOnboard ? (
              <form action={startStripeMerchantOnboardingAction}>
                <button type="submit" className="btn secondary">
                  {surface.status === 'not_started' ? 'Start Stripe setup' : 'Continue Stripe setup'}
                </button>
              </form>
            ) : surface.status === 'ready' ? (
              <a href="https://dashboard.stripe.com" target="_blank" rel="noreferrer" className="btn secondary">
                Manage on Stripe
              </a>
            ) : null}
          </div>
        </div>
      </div>

      {checkedAt ? (
        <p className="field-hint" style={{ marginTop: '0.75rem' }}>
          Readiness last verified {checkedAt}.
        </p>
      ) : null}
      {feedbackMessage ? (
        <p className="workspace-card-copy" style={{ color: 'var(--gold-ink)', marginTop: '0.85rem' }} role="status">
          {feedbackMessage}
        </p>
      ) : null}
      <p className="field-hint" style={{ marginTop: '0.85rem' }}>
        Completing this setup does not switch existing homeowner payment links. LGQ activates the direct-payment
        rail separately only after its billing rollout is ready.
      </p>
    </section>
  );
}
