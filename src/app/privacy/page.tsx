import type { Metadata } from 'next';
import Link from 'next/link';
import { TERMS_EFFECTIVE_DATE } from '@/lib/terms';
import styles from '../legal.module.css';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description:
    'Privacy practices for Let\'s Get Quoted, including customer data protection, AI processing, voice transcripts, GPS, and mobile SMS consent.',
  alternates: { canonical: 'https://letsgetquoted.com/privacy' },
};

export default function PrivacyPolicyPage() {
  return (
    <main className={styles.legalShell} id="main-content">
      <header className={styles.legalHeader}>
        <p className="eyebrow">Legal</p>
        <h1>Privacy Policy</h1>
        <p>
          Let&apos;s Get Quoted is operated by LETS GET QUOTED LLC, a Michigan limited liability company. This Privacy Policy
          explains how Let&apos;s Get Quoted collects, uses, protects, and shares information when contractors, crew members, and
          homeowners use our platform, websites, AI reception tools, and messaging services.
        </p>
        <span className={styles.effectiveDate}>Effective {TERMS_EFFECTIVE_DATE}</span>
      </header>

      <div className={styles.legalContent}>
        <section>
          <h2>1. Information We Collect</h2>
          <p>We collect information in several ways depending on how you interact with the Service:</p>
          <ul>
            <li>
              <strong>Contractor Business &amp; Registration Information:</strong> Legal business name, trade type, physical
              address, business telephone numbers, Employer Identification Number (EIN) or tax identifiers submitted for 10DLC
              carrier registration, billing address, and authorized user credentials.
            </li>
            <li>
              <strong>Customer Records &amp; Project Data:</strong> Homeowner contact details (names, phone numbers, email
              addresses, service locations), project inquiries, job notes, quotes, invoices, payment requests, uploaded project
              photos, and customer correspondence submitted by or on behalf of contractors.
            </li>
            <li>
              <strong>AI Copilot Text, Photo &amp; Voice Memo Data:</strong> Text messages, voice recordings, material receipts, and site
              photos transmitted to the AI Copilot via SMS, MMS, or in-app voice to update job files, sort photos, and draft quotes.
              <em>Users must not transmit unencrypted credit card numbers, CVVs, or Social Security numbers via SMS.</em>
            </li>
            <li>
              <strong>AI Voice &amp; Telephony Data:</strong> Inbound and outbound call metadata (calling numbers, call duration,
              timestamps), audio recordings where enabled, and machine-generated transcripts created by our 24/7 AI Voice Dispatcher.
            </li>
            <li>
              <strong>Workforce, GPS &amp; Dispatch Information:</strong> Crew member names, phone numbers, roles, timeclock
              records, and device GPS location data transmitted for route dispatch and arrival window updates.
            </li>
            <li>
              <strong>Technical &amp; Usage Data:</strong> IP addresses, browser and device types, authentication tokens, system
              event logs, and operational telemetry used for platform security, fraud prevention, and service diagnostics.
            </li>
          </ul>
          <p>
            Payment card details are entered directly into and processed by Stripe via Stripe Connect; Let&apos;s Get Quoted does
            not store full credit card numbers or CVVs on our servers.
          </p>
        </section>

        <section>
          <h2>2. How We Use Information</h2>
          <ul>
            <li>Provide, operate, and maintain contractor workspaces, scheduling tools, and published websites.</li>
            <li>Process customer inquiries, quote requests, appointment bookings, and Quick Stop priority reservations.</li>
            <li>
              Power AI Copilot and generative AI features (including automated quote drafting, estimate calculations, photo tagging, call transcription, and inquiry
              triage) through secure API endpoints with provider commitments not to train public models on customer business data.
            </li>
            <li>Deliver automated and transactional SMS/MMS messages, voice calls, and transactional/marketing emails.</li>
            <li>Verify business identity and register messaging brand profiles with carrier 10DLC registries.</li>
            <li>Prevent fraud, secure accounts, detect unauthorized access, and satisfy legal and tax accounting rules.</li>
          </ul>
        </section>

        <section className={styles.smsDisclosure}>
          <h2>3. Mobile Information and SMS Privacy</h2>
          <p>
            <strong>
              We do not sell, rent, or share mobile phone numbers, SMS opt-in data, or SMS consent records with third parties or
              affiliates for their marketing or promotional purposes.
            </strong>
          </p>
          <p>
            Mobile numbers and opt-in records are shared strictly with verified telecommunications providers, downstream carriers,
            and messaging platforms (such as SignalWire) solely to deliver the text messages and voice calls requested by you or
            your customers.
          </p>
          <p>
            Consent to receive text messages is not a condition of purchasing goods or services. Message frequency varies
            depending on the notifications you or your customers opt into (including sign-in codes, appointment reminders, quote
            follow-ups, invoices, Quick Stop notices, crew assignments, and marketing campaigns). For full details, see our{' '}
            <Link href="/sms-terms">SMS Terms</Link>. Recipients can reply <strong>STOP</strong> at any time to opt out,{' '}
            <strong>START</strong> to resume, or <strong>HELP</strong> for assistance.
          </p>
        </section>

        <section>
          <h2>4. Data Sharing, Subprocessors &amp; AI Zero-Retention Policy</h2>
          <p>
            We share personal information only with authorized service providers and subprocessors that process data under strict
            contractual instructions to help us deliver the Service, including:
          </p>
          <ul>
            <li><strong>Hosting and Serverless Compute:</strong> Vercel, Inc. (global edge network, secure serverless execution).</li>
            <li><strong>Database &amp; Cloud Storage:</strong> Supabase, Inc. / AWS (PostgreSQL database with Row Level Security, encrypted in transit via TLS 1.3 and at rest with AES-256).</li>
            <li><strong>Payment Processing:</strong> Stripe, Inc. (PCI-DSS Level 1 certified payments, deposits, and merchant payouts under Stripe Connect).</li>
            <li><strong>Telephony &amp; Voice Communications:</strong> SignalWire, Inc. (carrier 10DLC messaging, programmable SIP, and real-time voice dispatching).</li>
            <li><strong>Accounting Integrations:</strong> Intuit Inc. (bi-directional QuickBooks sync for customers, invoices, and payments, where authorized by contractor).</li>
            <li><strong>Artificial Intelligence Inference Platforms:</strong> Google LLC (Google Gemini API) and OpenAI, LLC. All AI inference is conducted exclusively through paid enterprise API tiers with strict zero-data-retention and non-training guarantees: customer data, prompts, job notes, photos, and voice transcripts are never used to train public foundation models.</li>
            <li><strong>Transactional Email Delivery:</strong> Resend, Inc. (DKIM/SPF-signed transactional and notification emails).</li>
            <li><strong>Property Intelligence:</strong> RentCast, Inc. (address-level structural and valuation baselines for estimating).</li>
            <li><strong>Mapping &amp; Geocoding:</strong> Google Maps Platform (server-side geocoding and browser mapping with referrer restrictions).</li>
          </ul>
          <p>
            For contractors processing personal data subject to state privacy regulations (such as the CCPA), our{' '}
            <Link href="/dpa">Data Processing Addendum (DPA)</Link> governs our obligations as a Service Provider / Data
            Processor.
          </p>
        </section>

        <section>
          <h2>5. Data Retention, Storage Security &amp; Deletion Lifecycle</h2>
          <p>
            We retain personal information for as long as your account remains active and as necessary to fulfill the business
            purposes outlined in this policy.
          </p>
          <p>
            <strong>Media &amp; Photo Storage Security:</strong> Homeowner project photos, material receipts, and site videos are
            stored in encrypted, tenant-isolated storage buckets (`job-photos`, `lead-photos`, `site-videos`, `site-images`,
            `insurance-proof`, `crew-photos`, `account-attachments`). Direct object access is protected by Row Level Security and
            short-lived cryptographically signed URLs.
          </p>
          <p>
            <strong>Account Deletion &amp; 30-Day Grace Period:</strong> When a contractor requests account closure, a 30-day soft
            deletion grace period begins. During this quarantine window, public sites and scheduling links are deactivated while
            account owners retain the ability to restore their workspace or complete full DSAR data exports. Following the grace
            period, our automated account closure orchestrator permanently and irreversibly purges all relational database records
            across all registered schema tables and deletes all associated assets from storage buckets.
          </p>
          <p>
            <strong>Financial &amp; Compliance Records:</strong> Records related to processed Stripe payments, finalized invoices,
            carrier 10DLC registrations, and TCPA consent timestamps are retained for statutory minimum periods to comply with
            tax reporting, financial audits, and carrier anti-spam regulations.
          </p>
        </section>

        <section>
          <h2>6. Your Rights and Choices</h2>
          <p>
            Depending on your jurisdiction, you or your customers may have the right to request access to, correction of, or
            deletion of personal information, or to opt out of certain communications.
          </p>
          <ul>
            <li>
              <strong>Contractors:</strong> You may update your profile, manage team access, configure overage caps, and export
              customer, service, job, and invoice records directly in your dashboard.
            </li>
            <li>
              <strong>Homeowners / Consumers:</strong> If you are a customer of a contractor using Let&apos;s Get Quoted, please
              contact the contractor directly with privacy requests, as they are the Data Controller of your records. You can opt
              out of text messages at any time by replying STOP.
            </li>
          </ul>
        </section>

        <section>
          <h2>7. Contact Us</h2>
          <p>
            If you have questions about this Privacy Policy or wish to submit a privacy inquiry, please use our{' '}
            <Link href="/contact">contact page</Link> and include &ldquo;Privacy request&rdquo; in the subject.
          </p>
        </section>
      </div>

      <nav className={styles.legalNav} aria-label="Legal pages">
        <Link href="/terms">Terms of Service</Link>
        <Link href="/dpa">Data Processing Addendum</Link>
        <Link href="/sms-terms">SMS Terms</Link>
        <Link href="/security">Security</Link>
        <Link href="/">Home</Link>
      </nav>
    </main>
  );
}
