import type { Metadata } from 'next';
import Link from 'next/link';
import styles from '../legal.module.css';

export const metadata: Metadata = {
  title: 'SMS Terms & Conditions | Let\'s Get Quoted',
  description: 'Terms for Let\'s Get Quoted authentication and transactional payment text messages.',
};

export default function SmsTermsPage() {
  return (
    <main className={styles.legalShell}>
      <header className={styles.legalHeader}>
        <p className="eyebrow">Legal</p>
        <h1>SMS Terms &amp; Conditions</h1>
        <p>These terms govern passwordless authentication and transactional payment text messages sent through Let&apos;s Get Quoted.</p>
        <span className={styles.effectiveDate}>Effective July 15, 2026</span>
      </header>

      <div className={styles.legalContent}>
        <section>
          <h2>Program name and description</h2>
          <p>The <strong>Let&apos;s Get Quoted SMS Program</strong> sends two categories of messages:</p>
          <ul>
            <li><strong>Authentication messages:</strong> one-time passcodes requested by contractors to securely sign in.</li>
            <li><strong>Transactional payment messages:</strong> payment-request links and automatic updates when a homeowner&apos;s payment is received, unsuccessful, or refunded.</li>
          </ul>
          <p>These are service-related messages. The program does not send third-party advertising or sell mobile opt-in information for marketing.</p>
        </section>

        <section>
          <h2>Consent</h2>
          <p>Authentication messages are sent when a user enters a mobile number and requests a one-time sign-in code. Payment messages are sent when a contractor confirms that the homeowner agreed to receive transactional texts at the supplied mobile number.</p>
          <p>By opting in, you authorize Let&apos;s Get Quoted, the contractor you are working with, and their service providers to send automated transactional text messages to the number provided. Consent is not a condition of purchasing goods or services.</p>
        </section>

        <section className={styles.smsDisclosure}>
          <h2>Message frequency and charges</h2>
          <p><strong>Message frequency varies.</strong> Authentication users generally receive one message per requested sign-in code. Homeowners may receive a payment request and status updates associated with that payment.</p>
          <p><strong>Message and data rates may apply.</strong> Contact your wireless carrier for details about your messaging or data plan.</p>
        </section>

        <section>
          <h2>Opt-out and help</h2>
          <p>Reply <strong>STOP</strong> to opt out of transactional payment texts. After opting out, you will receive no additional payment texts unless you reply <strong>START</strong> to resume. Reply <strong>HELP</strong> for help, or contact <a href="mailto:hello@letsgetquoted.com">hello@letsgetquoted.com</a>.</p>
          <p>Authentication passcodes are sent only when requested. If you do not want authentication texts, do not request another code and use email sign-in instead.</p>
        </section>

        <section>
          <h2>Delivery and supported carriers</h2>
          <p>Message delivery is subject to carrier availability and is not guaranteed. Wireless carriers are not liable for delayed or undelivered messages. The program is intended for mobile numbers capable of receiving SMS in supported regions.</p>
        </section>

        <section>
          <h2>Privacy</h2>
          <p>Our use of mobile numbers and SMS consent is described in the <Link href="/privacy">Let&apos;s Get Quoted Privacy Policy</Link>. We do not share mobile phone numbers or SMS opt-in information with third parties or affiliates for their marketing or promotional purposes.</p>
        </section>

        <section>
          <h2>Changes and termination</h2>
          <p>We may change or discontinue the SMS program or these terms. Changes will be posted on this page with an updated effective date. You may terminate participation at any time using the opt-out instructions above.</p>
        </section>

        <section>
          <h2>Contact</h2>
          <p>For SMS support or questions about these terms, email <a href="mailto:hello@letsgetquoted.com">hello@letsgetquoted.com</a>.</p>
        </section>
      </div>

      <nav className={styles.legalNav} aria-label="Legal pages"><Link href="/privacy">Privacy Policy</Link><Link href="/">Home</Link></nav>
    </main>
  );
}