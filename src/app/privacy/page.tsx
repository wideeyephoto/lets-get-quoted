import type { Metadata } from 'next';
import Link from 'next/link';
import styles from '../legal.module.css';

export const metadata: Metadata = {
  title: 'Privacy Policy | Let\'s Get Quoted',
  description: 'Privacy practices for Let\'s Get Quoted, including our transactional SMS program.',
};

export default function PrivacyPolicyPage() {
  return (
    <main className={styles.legalShell}>
      <header className={styles.legalHeader}>
        <p className="eyebrow">Legal</p>
        <h1>Privacy Policy</h1>
        <p>This policy explains how Let&apos;s Get Quoted collects, uses, protects, and shares information when contractors and homeowners use our services.</p>
        <span className={styles.effectiveDate}>Effective July 15, 2026</span>
      </header>

      <div className={styles.legalContent}>
        <section>
          <h2>Information we collect</h2>
          <p>We collect information that contractors and homeowners provide directly, including names, business information, email addresses, telephone numbers, project details, addresses, uploaded images, job records, invoices, and payment-request information.</p>
          <p>We also collect authentication, device, browser, usage, and transaction information needed to operate, secure, diagnose, and improve the service. Payment card details are collected and processed by Stripe and are not stored by Let&apos;s Get Quoted.</p>
        </section>

        <section>
          <h2>How we use information</h2>
          <ul>
            <li>Provide passwordless account access and secure contractor workspaces.</li>
            <li>Capture project inquiries and connect homeowners with the contractor they contacted.</li>
            <li>Create and deliver invoices, payment requests, receipts, and payment-status updates.</li>
            <li>Prevent fraud, secure accounts, troubleshoot the service, and comply with legal obligations.</li>
            <li>Communicate about the service and respond to support requests.</li>
          </ul>
        </section>

        <section className={styles.smsDisclosure}>
          <h2>Mobile information and SMS privacy</h2>
          <p><strong>We do not sell, rent, or share mobile phone numbers, SMS opt-in data, or SMS consent with third parties or affiliates for their marketing or promotional purposes.</strong></p>
          <p>Mobile information may be shared only with service providers that help us deliver and support the requested messaging service, such as telecommunications carriers, messaging platforms, authentication providers, and contractors involved in the homeowner&apos;s requested project. Those providers may use the information only to perform services on our behalf or as required by law.</p>
          <p>Consent to receive text messages is not a condition of purchasing goods or services. Message frequency varies based on account login attempts and payment activity. Message and data rates may apply. Reply <strong>STOP</strong> to opt out of transactional payment texts, <strong>START</strong> to resume, or <strong>HELP</strong> for help.</p>
        </section>

        <section>
          <h2>When we disclose information</h2>
          <p>We may disclose information to hosting, database, authentication, email, SMS, payment, analytics, and security providers that process information under our instructions. We may also disclose information when legally required, to protect users or the service, during a business transaction, or with the user&apos;s direction and consent.</p>
          <p>Contractors receive information submitted by homeowners to that contractor&apos;s website or payment workflow. Each contractor is responsible for its own use of homeowner information.</p>
        </section>

        <section>
          <h2>Data retention and security</h2>
          <p>We retain information for as long as needed to provide the service, satisfy contractual and legal requirements, resolve disputes, and maintain business records. We use administrative, technical, and organizational safeguards designed to protect information, but no system can guarantee absolute security.</p>
        </section>

        <section>
          <h2>Your choices</h2>
          <p>You may request access, correction, or deletion of personal information by contacting us. Certain records may be retained where required for legal, security, accounting, or fraud-prevention purposes.</p>
          <p>To stop payment-related text messages, reply STOP. To stop authentication texts, do not request additional codes. You may still use email-based sign-in where available.</p>
        </section>

        <section>
          <h2>Children and policy changes</h2>
          <p>The service is intended for adults and is not directed to children under 13. We may update this policy as our services or legal obligations change. The effective date above identifies the latest version.</p>
        </section>

        <section>
          <h2>Contact us</h2>
          <p>Questions or privacy requests can be sent to <a href="mailto:hello@letsgetquoted.com">hello@letsgetquoted.com</a>.</p>
        </section>
      </div>

      <nav className={styles.legalNav} aria-label="Legal pages"><Link href="/sms-terms">SMS Terms</Link><Link href="/">Home</Link></nav>
    </main>
  );
}