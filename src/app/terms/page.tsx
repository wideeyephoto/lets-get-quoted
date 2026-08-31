import type { Metadata } from 'next';
import Link from 'next/link';
import { TERMS_EFFECTIVE_DATE } from '@/lib/terms';
import styles from '../legal.module.css';

// The PLATFORM's Terms of Service — the agreement between LETS GET QUOTED LLC
// and the contractor who signs up. Not to be confused with the Terms page a
// contractor publishes on their own website (SiteLegalPage), which is theirs and
// is about their trade work. Contractor sites are rewritten to /site/<subdomain>
// by middleware, so this route only ever serves letsgetquoted.com/terms.
export const metadata: Metadata = {
  title: 'Terms of Service',
  alternates: { canonical: 'https://letsgetquoted.com/terms' },
  description: 'The agreement between Let\'s Get Quoted and the contractors who use it.',
};

export default function TermsOfServicePage() {
  return (
    <main className={styles.legalShell} id="main-content">
      <header className={styles.legalHeader}>
        <p className="eyebrow">Legal</p>
        <h1>Terms of Service</h1>
        <p>
          These terms are an agreement between you and LETS GET QUOTED LLC, a Michigan limited liability company (&quot;Let&apos;s
          Get Quoted&quot;, &quot;we&quot;, &quot;us&quot;). They cover your use of our software, websites, AI tools, and related
          services (the &quot;Service&quot;). Please read them — by creating an account, subscribing, or using the Service you
          agree to them.
        </p>
        <span className={styles.effectiveDate}>Effective {TERMS_EFFECTIVE_DATE}</span>
      </header>

      <div className={styles.legalContent}>
        <section>
          <h2>1. Who may use the Service &amp; Account Authority</h2>
          <p>
            The Service is designed for commercial use by trade businesses, contractors, and their authorized personnel. You must
            be at least 18 years old and legally capable of entering a binding contract. If you accept these terms on behalf of a
            business entity, you represent and warrant that you have the authority to bind that entity, and &quot;you&quot; refers
            to that business.
          </p>
          <p>
            We authenticate accounts primarily through passwordless verification links and one-time passcodes sent to your
            registered email or phone number. You are responsible for safeguarding access to those credentials and for all actions
            taken under your account, including activities by invited office staff, crew members, and subcontractors.
          </p>
        </section>

        <section>
          <h2>2. Customer Data, Privacy &amp; Data Processing</h2>
          <p>
            <strong>The customer records you submit to the Service are yours, not ours.</strong> Homeowner names, phone numbers,
            physical addresses, service histories, job photos, quotes, and payment records remain your property. We process and
            store this information on your behalf solely to provide and operate the Service.
          </p>
          <p>
            With respect to customer personal information, you act as the Business / Data Controller, and Let&apos;s Get Quoted
            acts as a Service Provider / Data Processor. Our processing of customer personal data is subject to and governed by our{' '}
            <Link href="/dpa">Data Processing Addendum (DPA)</Link>, which is hereby incorporated into these Terms by reference.
          </p>
          <p>
            You are responsible for obtaining all necessary notices, permissions, and consents required by law from your customers
            and contacts before collecting or uploading their data to the Service. For additional details on our platform data
            practices, see our <Link href="/privacy">Privacy Policy</Link>.
          </p>
        </section>

        <section>
          <h2>3. Communications, SMS, Email &amp; Workforce Compliance</h2>
          <p>
            The Service enables you to transmit automated and manual communications to your customers, including SMS/MMS messages
            (appointment reminders, quotes, invoices, on-the-way notices, Quick Stop offers, and review requests) and commercial
            emails.
          </p>
          <ul>
            <li>
              <strong>SMS / TCPA Compliance &amp; Time Restrictions:</strong> Telecommunications laws (including the Telephone Consumer Protection Act
              and carrier 10DLC regulations) require recipient consent. Marketing messages require prior express written consent.
              You agree not to transmit messages to individuals who have not provided requisite consent or who have opted out.
              Automated marketing and non-emergency promotional communications are subject to calling and messaging quiet hours
              (between 8:00 AM and 9:00 PM local time at the called party&apos;s location pursuant to FCC TCPA regulations, or the account&apos;s registered local operating time zone where recipient location cannot be determined).
              Detailed message categories, quiet hours policies, and carrier terms are set forth in our <Link href="/sms-terms">SMS Terms</Link>.
            </li>
            <li>
              <strong>Email &amp; CAN-SPAM:</strong> When sending marketing or promotional emails through the Service, you are
              solely responsible for compliance with the CAN-SPAM Act and applicable laws, including providing accurate header
              information, clear sender identification, your valid physical postal address, and an operational unsubscribe
              mechanism.
            </li>
            <li>
              <strong>Crew GPS &amp; Workforce Compliance:</strong> The Service provides field crew management, GPS location
              tracking, dispatch coordination, and timekeeping tools. You are solely responsible for providing any legally
              mandated notices and obtaining necessary consents from your employees and subcontractors regarding GPS tracking,
              monitoring, and time recording. You remain exclusively responsible for wage-and-hour compliance, overtime
              calculations, worker classification (W-2 employee vs. 1099 independent contractor), and any payroll exports.
            </li>
          </ul>
        </section>

        <section>
          <h2>4. AI Tools, AI Copilot, Trade Companions &amp; Field Telephony</h2>
          <p>
            The Service incorporates generative artificial intelligence, multimodal analysis, and automated telephony
            tools, including our in-app and SMS assistant <strong>AI Copilot</strong> (and customizable trade companions including Sparky, Diesel, Echo, and Nova), our 24/7 AI Voice Receptionist/Dispatcher,
            and Text-to-Job field ingestion.
          </p>
          <ul>
            <li>
              <strong>AI Copilot Field Interactions &amp; Text-to-Job:</strong> Contractors may transmit job notes, voice memos,
              scope summaries, punch list tasks, and project photos to the AI Copilot via SMS, MMS, or in-app voice/chat to update job
              records and draft quotes.
            </li>
            <li>
              <strong>Sensitive Information &amp; Payment Card Restrictions:</strong> Standard carrier SMS/MMS is an unencrypted
              communication channel. <strong>You must NOT transmit unencrypted payment card numbers, CVVs, bank account credentials,
              Social Security numbers, or confidential financial credentials to the AI Copilot via SMS or voice notes.</strong> All customer
              payments must be collected exclusively through secure, PCI-compliant Stripe Connect checkout and invoice links
              provided by the platform.
            </li>
            <li>
              <strong>AI Caller Disclosure &amp; Recording:</strong> When using the AI Voice Receptionist or call recording
              features, the Service automatically announces to inbound callers that they are speaking with an AI assistant and
              that the call may be recorded and transcribed for quality and service delivery. You agree not to disable, alter, or
              circumvent these disclosures where required by applicable two-party or one-party consent wiretapping laws.
            </li>
            <li>
              <strong>No Emergency Calling (No 911):</strong> The AI Copilot, the AI Voice Receptionist, and platform telephony do NOT support
              911 or emergency service calling. You must not configure or represent the Service as an emergency dispatch system.
            </li>
            <li>
              <strong>Prohibition on Unlawful Outbound AI Calling:</strong> Under FCC regulations and the TCPA, AI-generated
              voices are classified as artificial/prerecorded voices. You agree not to use the Service to place unlawful automated
              or artificial-voice outbound telemarketing calls without requisite prior express written consent.
            </li>
            <li>
              <strong>Drafts &amp; Suggestions (Human Review Required):</strong> AI-generated quotes, line items, mathematical
              calculations, emails, text drafts, permit notes, and voice summaries generated by the AI Copilot are computer-generated
              suggestions. You are solely responsible for reviewing, verifying, and approving all AI-generated drafts, quotes,
              and schedule changes before communicating them to homeowners or third parties.
            </li>
          </ul>
        </section>

        <section>
          <h2>5. Payments, Fees &amp; Stripe Connect</h2>
          <p>
            Customer payment processing is facilitated through Stripe Connect. By connecting a payment processing account, you
            agree to and expressly incorporate the{' '}
            <a href="https://stripe.com/connect-account/legal" target="_blank" rel="noreferrer">
              Stripe Connected Account Agreement
            </a>{' '}
            (including the Stripe Services Agreement). You authorize Let&apos;s Get Quoted to share business, identity, and
            transactional information with Stripe to facilitate payment processing and fraud prevention.
          </p>
          <ul>
            <li>
              <strong>Merchant of Record &amp; Customer Relationship:</strong> You are the seller and merchant of record for all
              goods and services provided to your customers. Let&apos;s Get Quoted is not a party to any estimate, contract, quote,
              job, warranty, or dispute between you and your homeowner customers.
            </li>
            <li>
              <strong>Disputes, Chargebacks &amp; Balances:</strong> You are solely responsible for chargebacks, customer refunds,
              disputed transactions, negative account balances, processing fees, and resolving homeowner disputes. Platform fees
              and Stripe processing fees are deducted at transaction time.
            </li>
            <li>
              <strong>Platform Fees:</strong> Standard transaction platform fees are set forth on our{' '}
              <Link href="/pricing">pricing page</Link> and in our published billing catalog.
            </li>
            <li>
              <strong>Quick Stop Priority Visits:</strong> For same-day priority visits booked via the Quick Stop feature, a
              dedicated platform fee (currently 10%) applies to the priority visit reservation fee. The reservation fee purchases
              an expedited arrival window, not the completed repair or service. You configure your own cancellation and refund
              percentages for Quick Stop appointments in accordance with your published customer policies.
            </li>
            <li>
              <strong>Recurring Customer Payments &amp; CFPB Regulation E:</strong> When storing customer payment credentials or
              enrolling customers in recurring service agreements or installment plans, you are responsible for securing the
              appropriate consumer authorizations required under CFPB Regulation E and card network operating rules.
            </li>
          </ul>
        </section>

        <section>
          <h2>6. Subscriptions, Add-ons, Overages &amp; Billing Terms</h2>
          <p>
            <strong>Base Plans &amp; Renewals:</strong> Paid base subscription plans are billed in advance on a recurring monthly
            or annual basis. When you subscribe, you authorize Let&apos;s Get Quoted (via Stripe) to automatically charge your
            designated payment method at the beginning of each billing period at the rate specified at checkout until canceled. You
            may cancel at any time; cancellation takes effect at the end of the current paid billing period.
          </p>
          <ul>
            <li>
              <strong>One-Time Top-Ups vs. Recurring Add-ons:</strong> One-time credit packs (e.g., text credits, marketing email
              sends, AI intake credits) do not expire while your account remains active. In contrast, recurring capacity add-ons
              (e.g., additional office seats or crew seats) renew monthly alongside your base subscription until canceled.
            </li>
            <li>
              <strong>Monthly Allowances &amp; Non-Rollover:</strong> Monthly plan allowances (such as monthly included text
              segments, voice minutes, or storage) reset at each billing cycle and do not roll over to subsequent months.
            </li>
            <li>
              <strong>Usage Overages:</strong> If you exceed your plan&apos;s included capacity and have enabled overage allowances,
              overages are billed at the per-unit rates published in the billing catalog. You may configure spending caps in your
              dashboard settings.
            </li>
            <li>
              <strong>First annual base-plan guarantee.</strong> Once per verified business entity, you may convert your first annual base plan within 30 days after its initial charge. The refund equals the annual prepayment minus one normal month-to-month base charge for the selected plan. LGQ platform fees are not recalculated retroactively. Consumed add-ons, AI Voice Receptionist or carrier costs, Stripe fees, taxes, and custom work are excluded.
            </li>
            <li>
              <strong>Failed Payments &amp; Price Changes:</strong> We may suspend or downgrade access if recurring subscription
              charges fail. We will provide at least thirty (30) days&apos; advance notice of any subscription price adjustments
              before your next renewal.
            </li>
          </ul>
        </section>

        <section>
          <h2>7. Contractor Professional Responsibilities &amp; FTC Review Rules</h2>
          <p>
            You represent and warrant that you hold all required contractor licenses, trade certifications, insurance coverage, and
            permits necessary to perform the services you offer. You are solely responsible for all trade work, craftsmanship,
            warranties, and safety compliance.
          </p>
          <p>
            <strong>FTC Review Compliance (16 CFR Part 465):</strong> When utilizing customer review collection tools in the
            Service, you agree to comply with the Federal Trade Commission&apos;s Trade Regulation Rule on Consumer Reviews and
            Testimonials. You agree not to: (a) create, post, or solicit fake consumer reviews; (b) condition review requests on
            positive sentiment (review gating); (c) have employees, officers, or relatives post reviews without clear disclosure of
            their relationship; or (d) unlawfully suppress or withhold negative customer feedback.
          </p>
        </section>

        <section>
          <h2>8. Intellectual Property, Content Licenses &amp; DMCA</h2>
          <p>
            <strong>Platform IP:</strong> Let&apos;s Get Quoted and its licensors retain all right, title, and interest in and to the
            Service, including all software, user interfaces, documentation, visual designs, trademarks, and underlying algorithms.
            You may not reverse engineer, decompile, resell, or white-label the Service without our prior written authorization.
          </p>
          <p>
            <strong>Your Content &amp; Media:</strong> You grant us a non-exclusive, worldwide, royalty-free license to host,
            reproduce, format, and display text, images, logos, and content you upload solely to the extent necessary to provide the
            Service and deliver your published contractor website.
          </p>
          <p>
            <strong>DMCA / Copyright Infringement:</strong> We respect intellectual property rights and comply with the Digital
            Millennium Copyright Act (DMCA). If you believe material hosted on a contractor website published via our platform
            infringes your copyright, you may submit a takedown notice to our designated copyright agent at{' '}
            <Link href="/contact">our contact page</Link> with &ldquo;DMCA notice&rdquo; in the subject and the statutory DMCA information.
            We maintain a policy of terminating accounts of repeat infringers in appropriate circumstances.
          </p>
          <p>
            <strong>Feedback:</strong> If you submit feedback, suggestions, or feature requests, we may use and incorporate them
            without any obligation, compensation, or attribution to you.
          </p>
        </section>

        <section>
          <h2>9. Disclaimers of Professional Advice</h2>
          <p>
            <strong>The Service does NOT provide professional legal, tax, accounting, structural, or safety advice.</strong>
          </p>
          <p>
            Features such as automated tax worksheets, 1099 guidance summaries, payroll calculation estimates, legal contract
            templates, permit lookup tools, clean energy rebate directories, property and roof measurement estimators, weather
            reschedule alerts, and emergency triage notes are provided strictly for administrative and informational convenience.
            They do not replace licensed legal, tax, CPA, structural engineering, architectural, safety, or insurance advice. You
            must independently verify all calculations, legal compliance, and engineering specifications.
          </p>
        </section>

        <section>
          <h2>10. Disclaimer of Warranties, Limitation of Liability &amp; Indemnity</h2>
          <p>
            <strong>&quot;As Is&quot; Disclaimer:</strong> The Service is provided &quot;as is&quot; and &quot;as available&quot;.
            To the maximum extent permitted by law, Let&apos;s Get Quoted disclaims all warranties, express, statutory, or implied,
            including merchantability, fitness for a particular purpose, non-infringement, and uninterrupted availability.
          </p>
          <p>
            <strong>Consequential Damages:</strong> Neither party will be liable for any indirect, incidental, special,
            consequential, or punitive damages, or for lost profits, lost revenue, business interruption, or loss of data, even if
            advised of the possibility of such damages.
          </p>
          <p>
            <strong>Aggregate Liability Cap:</strong> Our total aggregate liability arising out of or related to these Terms or the
            Service will not exceed the greater of: (a) the total platform fees and subscription fees paid by you to Let&apos;s Get
            Quoted in the three (3) months preceding the event giving rise to the claim, or (b) one hundred US dollars ($100).
          </p>
          <p>
            <strong>Indemnification:</strong> You agree to defend, indemnify, and hold harmless Let&apos;s Get Quoted, its officers,
            directors, employees, and agents from and against all third-party claims, damages, losses, and reasonable legal fees
            arising from: (a) the trade work, services, or warranties you provide to homeowners; (b) communications or messages
            transmitted through your account (including TCPA, CAN-SPAM, or wiretapping claims); (c) content or media you publish;
            or (d) your violation of applicable laws or these Terms.
          </p>
        </section>

        <section>
          <h2>11. Term, Termination &amp; Data Retention</h2>
          <p>
            You may stop using the Service and request account closure at any time through your account settings. We may suspend or
            terminate your account for material breach of these terms, non-payment, legal necessity, or if continuing would expose
            users or providers to security or financial risks.
          </p>
          <p>
            <strong>Data Export &amp; Statutory Retention:</strong> The Service provides tools to export your core business data
            (customers, services, job records, and invoices). Because financial transactions, payments, and registered messaging
            records are subject to strict regulatory, accounting, tax, and anti-fraud retention obligations, underlying transaction
            and audit records are retained in accordance with our compliance data schedules even after an account is deactivated.
          </p>
          <p>
            Sections that by their nature should survive termination (including Sections 2, 4, 5, 8, 9, 10, 11, 12, and 13) will
            survive the termination of this agreement.
          </p>
        </section>

        <section>
          <h2>12. Governing Law, Dispute Resolution &amp; Jury Waiver</h2>
          <p>
            These Terms are governed by and construed under the laws of the State of Michigan, without giving effect to conflict of
            law principles. You and Let&apos;s Get Quoted agree to the exclusive jurisdiction and venue of the state and federal
            courts located in Michigan for any dispute arising out of or relating to the Service.
          </p>
          <p>
            <strong>Mutual Jury Trial Waiver:</strong> To the fullest extent permitted by law, each party knowingly, voluntarily,
            and irrevocably waives any right to a trial by jury in any action or proceeding arising out of or related to these
            Terms or the Service.
          </p>
          <p>
            <strong>Limitation Period:</strong> You agree that any claim or cause of action arising out of or related to the
            Service must be filed within one (1) year after such claim arose, or be forever barred.
          </p>
        </section>

        <section>
          <h2>13. Entire Agreement &amp; Miscellaneous</h2>
          <p>
            These Terms, together with the <Link href="/dpa">Data Processing Addendum</Link>, the{' '}
            <Link href="/privacy">Privacy Policy</Link>, the <Link href="/sms-terms">SMS Terms</Link>, the published Pricing
            Catalog, and any affirmative checkout consent disclosures, constitute the entire agreement between you and Let&apos;s
            Get Quoted regarding the Service.
          </p>
          <p>
            If any provision of these Terms is held invalid or unenforceable, that provision will be enforced to the maximum extent
            permissible, and the remaining provisions will remain in full force and effect. Neither party is an agent, partner, or
            legal representative of the other. You may not assign this agreement without our prior written consent; we may assign
            this agreement in connection with a merger, reorganization, or sale of assets.
          </p>
        </section>

        <section>
          <h2>14. Contact</h2>
          <p>
            Questions or notices regarding these Terms may be submitted through our <Link href="/contact">contact page</Link> or by
            written notice to LETS GET QUOTED LLC.
          </p>
        </section>
      </div>

      <nav className={styles.legalNav} aria-label="Legal pages">
        <Link href="/dpa">Data Processing Addendum</Link>
        <Link href="/privacy">Privacy Policy</Link>
        <Link href="/sms-terms">SMS Terms</Link>
        <Link href="/security">Security</Link>
        <Link href="/">Home</Link>
      </nav>
    </main>
  );
}
