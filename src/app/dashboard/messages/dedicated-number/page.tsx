import { randomUUID } from 'node:crypto';
import Link from 'next/link';
import type { InputHTMLAttributes } from 'react';
import { requireOwnerContext } from '@/lib/auth';
import { buildStandardContractorCampaignPayload } from '@/lib/messaging-contractor-campaign-template';
import { loadMessagingRegistrationApplication } from '@/lib/messaging-number-provisioning';
import { submitDedicatedNumberApplicationAction } from './actions';
import PersistedApplicationForm, { ApplicationDraftLifecycle } from './PersistedApplicationForm';
import styles from './registration.module.css';

export const metadata = { title: 'Dedicated business texting application' };
export const dynamic = 'force-dynamic';

const STATUS_COPY: Record<string, string> = {
  submitted: 'Submitted for staff review',
  under_review: 'Under review',
  action_required: 'Needs information from you',
  approved: 'Approved for number selection',
  rejected: 'Not approved — you may correct and resubmit',
  provisioning: 'Carrier provisioning in progress',
  active: 'Active',
  suspended: 'Suspended',
};

const RESULT_COPY = {
  done: {
    submitted: 'Application submitted for staff review. No number was purchased and no charge was added.',
  },
  error: {
    invalid: 'Check the application fields and try again. Your entries were kept in this browser session.',
    save_failed: 'We could not confirm that the application was saved. No purchase or charge was started. Your entries remain in this browser session; refresh before trying again.',
  },
} as const;

export default async function DedicatedNumberApplicationPage({
  searchParams,
}: {
  searchParams: { done?: string; error?: string };
}) {
  const { supabase, accountId, userEmail } = await requireOwnerContext();
  const [application, accountResult, siteResult] = await Promise.all([
    loadMessagingRegistrationApplication(supabase, accountId),
    supabase.from('accounts').select('business_name').eq('id', accountId).maybeSingle(),
    supabase.from('sites').select('company_name, phone, custom_domain, subdomain').eq('account_id', accountId).limit(1).maybeSingle(),
  ]);
  const site = siteResult.data;
  const account = accountResult.data;
  const carrierBindingRetained = Boolean(
    application?.providerBrandId
    || application?.providerCampaignId
    || application?.providerNumberId,
  );
  const canSubmit = !application || (
    (application.status === 'action_required' || application.status === 'rejected')
    && !carrierBindingRetained
  );
  const submissionKey = `messaging-application:${randomUUID()}`;
  const draftStorageKey = `lgq:dedicated-number-application:${accountId}`;
  const publicRoot = (process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'letsgetquoted.com').replace(/^https?:\/\//, '');
  const suggestedWebsite = site?.custom_domain
    ? `https://${site.custom_domain}`
    : site?.subdomain
      ? `https://${site.subdomain}.${publicRoot}`
      : '';

  const suggestedBrand = site?.company_name ?? account?.business_name ?? 'Your Business';
  const standardTemplate = buildStandardContractorCampaignPayload({
    legalBusinessName: application?.legalBusinessName ?? suggestedBrand,
    dbaName: application?.dbaName ?? site?.company_name ?? null,
    websiteUrl: suggestedWebsite || 'https://example.com',
    supportEmail: userEmail ?? 'support@example.com',
    supportPhone: site?.phone ?? '+12485550140',
  });

  const defaults = {
    legalBusinessName: application?.legalBusinessName ?? site?.company_name ?? account?.business_name ?? '',
    dbaName: application?.dbaName ?? site?.company_name ?? '',
    businessType: application?.businessType ?? 'llc',
    websiteUrl: application?.websiteUrl ?? suggestedWebsite,
    businessEmail: application?.businessEmail ?? userEmail ?? '',
    businessPhone: application?.businessPhone ?? site?.phone ?? '',
    authorizedContactName: application?.authorizedContactName ?? '',
    authorizedContactTitle: application?.authorizedContactTitle ?? '',
    authorizedContactEmail: application?.authorizedContactEmail ?? userEmail ?? '',
    authorizedContactPhone: application?.authorizedContactPhone ?? site?.phone ?? '',
    messagingSupportEmail: application?.messagingSupportEmail ?? userEmail ?? '',
    messagingSupportPhone: application?.messagingSupportPhone ?? site?.phone ?? '',
    addressLine1: application?.addressLine1 ?? '',
    addressLine2: application?.addressLine2 ?? '',
    city: application?.city ?? '',
    region: application?.region ?? 'MI',
    postalCode: application?.postalCode ?? '',
    desiredAreaCode: application?.desiredAreaCode ?? '248',
    messagingUseCase: application?.messagingUseCase ?? standardTemplate.description,
    estimatedMonthlyMessages: application?.estimatedMonthlyMessages ?? 500,
    optInDescription: application?.optInDescription ?? standardTemplate.optInDescription,
    optInEvidenceUrl: application?.optInEvidenceUrl ?? (suggestedWebsite ? `${suggestedWebsite}/#quote` : 'https://example.com/#quote'),
    sampleMessages: (application?.sampleMessages && application.sampleMessages.length >= 2)
      ? application.sampleMessages
      : standardTemplate.sampleMessages,
    privacyPolicyUrl: application?.privacyPolicyUrl ?? (suggestedWebsite ? `${suggestedWebsite}/privacy` : 'https://example.com/privacy'),
    termsUrl: application?.termsUrl ?? (suggestedWebsite ? `${suggestedWebsite}/terms` : 'https://example.com/terms'),
  };
  const submissionConfirmed = searchParams.done === 'submitted'
    && application?.status === 'submitted';
  // A database commit can outlive a lost RPC response. If this fresh server
  // read sees a durable, non-editable application, it outranks the redirect's
  // uncertain `save_failed` hint and agrees with the draft-clearing lifecycle.
  const durableApplicationObserved = searchParams.error === 'save_failed'
    && Boolean(application && !canSubmit);
  const doneMessage = submissionConfirmed
    ? RESULT_COPY.done.submitted
    : durableApplicationObserved
      ? 'The application has a durable record. Its current status below is authoritative; no number was purchased and no charge was added.'
      : null;
  const errorMessage = !canSubmit
    ? null
    : searchParams.error === 'invalid'
    ? RESULT_COPY.error.invalid
    : searchParams.error === 'save_failed'
      ? RESULT_COPY.error.save_failed
      : null;

  return (
    <main className={`wide-shell workspace-shell ${styles.shell}`}>
      <ApplicationDraftLifecycle storageKey={draftStorageKey} clear={Boolean(application && !canSubmit)} />
      <header className={styles.header}>
        <Link href="/dashboard/messages?setup=1#texting-setup" className={styles.back}>← Back to Messages</Link>
        <p className={styles.eyebrow}>Dedicated Number &amp; AI Voice</p>
        <h1>Get Your Dedicated Business Number</h1>
        <p>
          A dedicated local phone number enables 2-way customer texting from your Let&rsquo;s Get Quoted inbox and is required for our AI Voice Receptionist plans.
          Let&rsquo;s Get Quoted handles 10DLC mobile carrier brand and campaign registration for you with verified deliverability.
          Submitting does not charge you; carrier registration, number lease, and usage rates will be displayed for your explicit acceptance before any charges are incurred.
        </p>
      </header>

      {doneMessage ? <p className={`${styles.banner} ${styles.success}`}>{doneMessage}</p> : null}
      {errorMessage ? <p className={`${styles.banner} ${styles.error}`}>{errorMessage}</p> : null}

      {application ? (
        <section className={styles.statusCard}>
          <span>Application status</span>
          <strong>{STATUS_COPY[application.status] ?? application.status}</strong>
          <small>Revision {application.revision} · submitted {new Date(application.submittedAt).toLocaleDateString('en-US')}</small>
          {application.statusDetail ? <p>{application.statusDetail}</p> : null}
          {application.purchasedNumber ? <p>Number: <b>{application.purchasedNumber}</b></p> : null}
          {application.status === 'action_required' && carrierBindingRetained ? (
            <p>
              Your reviewed business identity remains locked to the existing carrier registration. Do not submit replacement
              identity information here; LGQ staff must reverify that exact carrier record or start an explicit new registration.
            </p>
          ) : null}
        </section>
      ) : null}

      {!canSubmit ? (
        <section className={styles.card}>
          <h2>What happens next</h2>
          <ol>
            <li>LGQ staff checks the business identity, consent flow, and sample messages.</li>
            <li>The carrier reviews the downstream brand and campaign.</li>
            <li>Only after approval does an MFA-authorized operator select a number and confirm any carrier cost.</li>
            <li>The number stays inactive until its inbound webhook and individual campaign assignment both verify successfully.</li>
          </ol>
          <p>
            We will put a clear request here if anything needs correction. LGQ intentionally does not collect or retain a full EIN in
            this owner-readable application. MFA-authorized staff verify it separately and retain only the last four digits plus a
            nonsecret verification reference in restricted compliance storage. Please do not send tax IDs by ordinary email.
          </p>
        </section>
      ) : (
        <PersistedApplicationForm
          action={submitDedicatedNumberApplicationAction}
          className={styles.form}
          storageKey={draftStorageKey}
        >
          <input type="hidden" name="submissionKey" value={submissionKey} />

          {/* Hidden 10DLC compliance payloads automatically managed by LGQ platform */}
          <input type="hidden" name="messagingUseCase" value={defaults.messagingUseCase} />
          <input type="hidden" name="optInDescription" value={defaults.optInDescription} />
          <input type="hidden" name="optInEvidenceUrl" value={defaults.optInEvidenceUrl} />
          <input type="hidden" name="messagingSupportEmail" value={defaults.messagingSupportEmail} />
          <input type="hidden" name="messagingSupportPhone" value={defaults.messagingSupportPhone} />
          <input type="hidden" name="estimatedMonthlyMessages" value={String(defaults.estimatedMonthlyMessages)} />
          <input type="hidden" name="sampleMessage1" value={defaults.sampleMessages[0] ?? ''} />
          <input type="hidden" name="sampleMessage2" value={defaults.sampleMessages[1] ?? ''} />
          <input type="hidden" name="sampleMessage3" value={defaults.sampleMessages[2] ?? ''} />
          <input type="hidden" name="privacyPolicyUrl" value={defaults.privacyPolicyUrl} />
          <input type="hidden" name="termsUrl" value={defaults.termsUrl} />

          {/* Step 1: Business Identity */}
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <span className={styles.stepBadge}>Step 1</span>
              <div>
                <h2>Business identity</h2>
                <p className={styles.subtext}>US mobile carriers require verified business entity details for 10DLC brand registration.</p>
              </div>
            </div>
            <div className={styles.grid}>
              <Field label="Legal business name" name="legalBusinessName" value={defaults.legalBusinessName} required />
              <Field label="DBA / public name" name="dbaName" value={defaults.dbaName} />
              <label>
                <span>Business type</span>
                <select name="businessType" defaultValue={defaults.businessType} required>
                  <option value="sole_proprietor">Sole proprietor</option>
                  <option value="llc">LLC</option>
                  <option value="corporation">Corporation</option>
                  <option value="partnership">Partnership</option>
                  <option value="nonprofit">Nonprofit</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <Field label="Business website" name="websiteUrl" type="url" value={defaults.websiteUrl} placeholder="https://example.com" required />
              <Field label="Business email" name="businessEmail" type="email" value={defaults.businessEmail} required />
              <Field label="Business phone" name="businessPhone" type="tel" value={defaults.businessPhone} required />
              <Field label="Street address" name="addressLine1" value={defaults.addressLine1} required />
              <Field label="Suite / unit" name="addressLine2" value={defaults.addressLine2} />
              <Field label="City" name="city" value={defaults.city} required />
              <Field label="State" name="region" value={defaults.region} maxLength={2} required />
              <Field label="ZIP code" name="postalCode" value={defaults.postalCode} required />
            </div>
          </section>

          {/* Step 2: Authorized Contact & Number Preferences */}
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <span className={styles.stepBadge}>Step 2</span>
              <div>
                <h2>Authorized contact &amp; number preferences</h2>
                <p className={styles.subtext}>The authorized contact for messaging registration and your desired local area code.</p>
              </div>
            </div>
            <div className={styles.grid}>
              <Field label="Full name" name="authorizedContactName" value={defaults.authorizedContactName} required />
              <Field label="Title" name="authorizedContactTitle" value={defaults.authorizedContactTitle} placeholder="Owner / Manager" required />
              <Field label="Email" name="authorizedContactEmail" type="email" value={defaults.authorizedContactEmail} required />
              <Field label="Phone (E.164)" name="authorizedContactPhone" type="tel" value={defaults.authorizedContactPhone} placeholder="+12485550140" required />
              <Field label="Preferred area code" name="desiredAreaCode" value={defaults.desiredAreaCode} inputMode="numeric" maxLength={3} required />
            </div>
            <p className={styles.note}>
              Carrier vetting requires tax-identity verification. LGQ intentionally does not collect or store a full EIN here.
              MFA-authorized staff verify it out of band and retain only its last four digits and a nonsecret case reference in a
              service-only record that this owner page cannot read.
            </p>
          </section>

          {/* Step 3: Platform Managed Carrier Compliance (10DLC) */}
          <section className={`${styles.card} ${styles.complianceCard}`}>
            <div className={styles.cardHeader}>
              <span className={styles.stepBadge}>Step 3</span>
              <div>
                <div className={styles.complianceHeaderRow}>
                  <h2>Platform-managed carrier compliance (10DLC)</h2>
                  <span className={styles.badgePill}>100% Automated by LGQ</span>
                </div>
                <p className={styles.subtext}>
                  Because Let&rsquo;s Get Quoted runs your website quote forms, 2-way inbox, and transactional notifications,
                  we automatically handle carrier vetting, campaign registration, and compliance rules on your behalf.
                </p>
              </div>
            </div>

            <div className={styles.featuresGrid}>
              <div className={styles.featureItem}>
                <div className={styles.featureIcon}>✓</div>
                <div>
                  <strong>Customer Care &amp; Transactional Operations</strong>
                  <p>Pre-configured for estimate delivery, appointment dispatch, 2-way homeowner replies, and invoices. No spam or marketing blasts.</p>
                </div>
              </div>
              <div className={styles.featureItem}>
                <div className={styles.featureIcon}>✓</div>
                <div>
                  <strong>Active Website Opt-In Consent</strong>
                  <p>Your Let&rsquo;s Get Quoted website quote form automatically displays carrier-mandated SMS consent disclosures.</p>
                </div>
              </div>
              <div className={styles.featureItem}>
                <div className={styles.featureIcon}>✓</div>
                <div>
                  <strong>Automated STOP &amp; HELP Handlers</strong>
                  <p>Instant carrier-compliant opt-out and help auto-responders are active on your dedicated business number.</p>
                </div>
              </div>
              <div className={styles.featureItem}>
                <div className={styles.featureIcon}>✓</div>
                <div>
                  <strong>Linked Privacy Policy &amp; Terms</strong>
                  <p>Automatically references your active Let&rsquo;s Get Quoted site policies for carrier auditing.</p>
                </div>
              </div>
            </div>

            <details className={styles.complianceDetails}>
              <summary>View pre-configured carrier registration details</summary>
              <div className={styles.detailsContent}>
                <div className={styles.detailRow}>
                  <span>Use Case / Campaign Scope</span>
                  <p>{defaults.messagingUseCase}</p>
                </div>
                <div className={styles.detailRow}>
                  <span>Opt-In Consent Flow</span>
                  <p>{defaults.optInDescription}</p>
                </div>
                <div className={styles.detailRow}>
                  <span>Opt-In Evidence URL</span>
                  <p><code>{defaults.optInEvidenceUrl}</code></p>
                </div>
                <div className={styles.detailRow}>
                  <span>Sample Customer Care Messages</span>
                  <ul>
                    {defaults.sampleMessages.map((msg, i) => (
                      <li key={i}>{msg}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </details>
          </section>

          {/* Submission & Attestation */}
          <section className={styles.card}>
            <label className={styles.attestation}>
              <input type="checkbox" name="attested" required />
              <span>
                I confirm this information is accurate; recipients provide their phone numbers and consent; messages identify my business;
                opt-outs will be honored; and purchased contact lists will not be used.
              </span>
            </label>
            <button type="submit" className="btn primary">Submit Application for Review</button>
            <p className={styles.note}>Submission creates an application only. It does not purchase a number or add a charge.</p>
          </section>
        </PersistedApplicationForm>
      )}
    </main>
  );
}

function Field({ label, name, value, ...props }: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  name: string;
  value: string;
}) {
  return (
    <label>
      <span>{label}</span>
      <input name={name} defaultValue={value} {...props} />
    </label>
  );
}
