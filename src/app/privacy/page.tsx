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
              <strong>AI Voice &amp; Telephony Data:</strong> Inbound and outbound call metadata (calling numbers, call duration,
              timestamps), audio recordings where enabled, and machine-generated transcripts created by our AI Voice Receptionist.
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
              Power generative AI features (including automated drafting, estimate calculations, call transcription, and inquiry
              triage) through secure enterprise API endpoints.
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
          <h2>4. Data Sharing and Subprocessors</h2>
          <p>
            We share personal information only with authorized service providers and subprocessors that process data under strict
            contractual instructions to help us deliver the Service, including:
          </p>
          <ul>
            <li>Cloud hosting and database infrastructure providers (e.g., Supabase / AWS).</li>
            <li>Payment processors (Stripe, Inc. under Stripe Connect).</li>
            <li>Telephony and SMS communication carriers (e.g., SignalWire).</li>
            <li>Artificial intelligence inference platforms (e.g., OpenAI, Google GenAI) operating under zero-data-retention or
              no-training enterprise agreements for business data.</li>
            <li>Transactional email delivery providers (e.g., Resend).</li>
          </ul>
          <p>
            For contractors processing personal data subject to state privacy regulations (such as the CCPA), our{' '}
            <Link href="/dpa">Data Processing Addendum (DPA)</Link> governs our obligations as a Service Provider / Data
            Processor.
          </p>
        </section>

        <section>
          <h2>5. Data Retention, Security &amp; Legal Holds</h2>
          <p>
            We retain personal information for as long as your account remains active and as necessary to fulfill the business
            purposes outlined in this policy.
          </p>
          <p>
            <strong>Financial &amp; Compliance Records:</strong> Records related to payment transactions, invoices, tax summaries,
            carrier 10DLC registrations, and messaging logs are retained for minimum statutory periods to comply with applicable
            tax laws, financial reporting regulations, and carrier anti-spam requirements, even after an account is deactivated.
          </p>
          <p>
            We employ administrative, technical, and organizational security controls designed to protect information from
            unauthorized access, loss, or alteration.
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
            If you have questions about this Privacy Policy or wish to submit a privacy inquiry, please reach out via our{' '}
            <Link href="/contact">contact page</Link> or email privacy@letsgetquoted.com.
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