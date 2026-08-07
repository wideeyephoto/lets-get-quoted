import type { Metadata } from 'next';
import Link from 'next/link';
import styles from '../legal.module.css';

export const metadata: Metadata = {
  title: 'SMS Terms & Conditions',
  description:
    'Terms for text messages sent through Let’s Get Quoted: sign-in codes, appointment reminders, quotes and invoices, scheduling, crew notifications, and marketing.',
  alternates: { canonical: 'https://letsgetquoted.com/sms-terms' },
};

/**
 * WHAT CHANGED AND WHY.
 *
 * This page used to describe exactly two message categories — authentication
 * codes and transactional payment texts. The product sends far more than that:
 * appointment reminders, quote follow-ups, review requests, scheduling and
 * arrival-window messages, Quick Stop offers, crew assignments, rebook invites
 * and marketing campaigns. A disclosure that omits most of what is actually
 * sent is not a disclosure.
 *
 * The categories below were enumerated from the senders in src/lib/sms.ts
 * rather than from memory, so this page and the code can be checked against
 * each other. If you add a sender, add it here.
 *
 * NOT LEGAL ADVICE, and this file has not been through counsel. It is an
 * accurate description of what the software does, written so a lawyer has
 * something true to review.
 */
export default function SmsTermsPage() {
  return (
    <main className={styles.legalShell}>
      <header className={styles.legalHeader}>
        <p className="eyebrow">Legal</p>
        <h1>SMS Terms &amp; Conditions</h1>
        <p>
          Let&apos;s Get Quoted is operated by LETS GET QUOTED LLC, a Michigan limited liability company. These terms
          govern every text message sent through the Let&apos;s Get Quoted platform &mdash; both messages we send to
          contractors who use the software, and messages contractors send to their own customers through it.
        </p>
        <span className={styles.effectiveDate}>Effective August 6, 2026</span>
      </header>

      <div className={styles.legalContent}>
        <section>
          <h2>Who sends what</h2>
          <p>
            Two different relationships run over the same messaging service, and it matters which one you are in.
          </p>
          <ul>
            <li>
              <strong>Messages we send you</strong> &mdash; if you are a contractor with an account, or a crew member
              on one. Sign-in codes and crew notifications come from Let&apos;s Get Quoted.
            </li>
            <li>
              <strong>Messages a contractor sends you</strong> &mdash; if you are a homeowner or customer. Reminders,
              quotes, invoices and scheduling texts are sent by the contractor you are working with, using our
              platform. The contractor decides what is sent and to whom; we provide the software that sends it.
            </li>
          </ul>
        </section>

        <section>
          <h2>Message categories</h2>
          <p>
            <strong>Account and authentication</strong> &mdash; one-time passcodes for passwordless sign-in, requested
            by you at the moment you sign in. Also one-time codes sent to a customer verifying their own mobile number
            on a contractor&apos;s public form.
          </p>
          <p>
            <strong>Job and appointment</strong> &mdash; appointment reminders ahead of a scheduled visit, arrival
            window updates and on-the-way notices, scheduling options to choose from, job updates the contractor
            posts, and the link to your own job page.
          </p>
          <p>
            <strong>Quotes and invoices</strong> &mdash; quote follow-ups on a quote you have been sent, payment
            requests, confirmation when a payment is received, notice when a payment fails or a saved card is
            declined, and refund confirmations.
          </p>
          <p>
            <strong>Same-day work (Quick Stops)</strong> &mdash; an offer of a paid same-day visit in response to a
            request you made, and confirmation once it is paid for.
          </p>
          <p>
            <strong>Crew</strong> &mdash; job assignments, schedule changes and sign-in links, sent to crew members
            added to a contractor&apos;s account by that contractor.
          </p>
          <p>
            <strong>Review requests</strong> &mdash; a single request after a completed job, offering both a public
            review page and a private note to the contractor. The same options are offered to every customer.
          </p>
          <p>
            <strong>Marketing</strong> &mdash; campaigns and &ldquo;book us again&rdquo; invitations a contractor
            chooses to send to their past customers. These are the only promotional messages in the program, and they
            are the ones that require prior express written consent. Everything above is transactional: it relates to
            work you have already requested, booked or paid for.
          </p>
        </section>

        <section>
          <h2>Consent</h2>
          <p>
            Sign-in codes are sent only when you enter a mobile number and request one. Customer-facing texts are sent
            only to numbers where the contractor has recorded that the customer agreed to be contacted; the platform
            records that consent per number and refuses to send without it.
          </p>
          <p>
            <strong>If you are a contractor, obtaining that consent is your responsibility.</strong> We provide the
            opt-out machinery &mdash; STOP, START and HELP handling, per-number opt-out enforcement, and unsubscribe
            links on marketing email &mdash; but we cannot obtain permission on your behalf, and we do not verify that
            you have it. Sending marketing texts without prior express written consent is your legal exposure, not
            ours.
          </p>
          <p>Consent is not a condition of purchasing any goods or services.</p>
        </section>

        <section className={styles.smsDisclosure}>
          <h2>Message frequency and charges</h2>
          <p>
            <strong>Message frequency varies</strong> and depends on the work in progress. As a guide: one message per
            sign-in code you request; typically one appointment reminder per scheduled visit; up to three follow-ups
            on an unanswered quote; one review request per completed job; and marketing messages only as often as your
            contractor chooses to send them.
          </p>
          <p>
            <strong>Message and data rates may apply.</strong> Contact your wireless carrier for details about your
            messaging or data plan.
          </p>
        </section>

        <section>
          <h2>Opt-out and help</h2>
          <p>
            Reply <strong>STOP</strong> to any message to opt out. Opting out stops all further messages to that number
            from that contractor, marketing and transactional alike &mdash; including appointment reminders, so you may
            stop hearing about visits you have booked. Reply <strong>START</strong> to resume. Reply{' '}
            <strong>HELP</strong> for help, or reach us through our <Link href="/contact">contact page</Link>.
          </p>
          <p>
            Sign-in passcodes are sent only when requested, so there is nothing to opt out of &mdash; if you would
            rather not receive them, use email sign-in instead.
          </p>
        </section>

        <section>
          <h2>Delivery and supported carriers</h2>
          <p>
            Message delivery is subject to carrier availability and is not guaranteed. Wireless carriers are not liable
            for delayed or undelivered messages. The program is intended for mobile numbers capable of receiving SMS in
            supported regions.
          </p>
        </section>

        <section>
          <h2>Messaging providers and data sharing</h2>
          <p>
            Text messages are delivered through Twilio Inc., our messaging provider, acting as a service provider on
            our behalf. Delivering a message requires sharing the recipient&apos;s mobile number and the message
            content with them.
          </p>
          <p>
            We do not sell mobile phone numbers, and we do not share mobile numbers or SMS opt-in information with
            third parties or affiliates for their own marketing or promotional purposes. Our wider handling of this
            data is described in the <Link href="/privacy">Privacy Policy</Link>.
          </p>
        </section>

        <section>
          <h2>Changes and termination</h2>
          <p>
            We may change or discontinue the SMS program or these terms. Changes will be posted on this page with an
            updated effective date. You may terminate participation at any time using the opt-out instructions above.
          </p>
        </section>

        <section>
          <h2>Contact</h2>
          <p>
            For SMS support or questions about these terms, reach us through our <Link href="/contact">contact page</Link>.
          </p>
        </section>
      </div>

      <nav className={styles.legalNav} aria-label="Legal pages">
        <Link href="/privacy">Privacy Policy</Link>
        <Link href="/terms">Terms of Service</Link>
        <Link href="/">Home</Link>
      </nav>
    </main>
  );
}
