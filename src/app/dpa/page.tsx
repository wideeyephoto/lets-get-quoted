import type { Metadata } from 'next';
import Link from 'next/link';
import { TERMS_EFFECTIVE_DATE } from '@/lib/terms';
import styles from '../legal.module.css';

export const metadata: Metadata = {
  title: 'Data Processing Addendum (DPA)',
  description:
    'Data Processing Addendum between Let’s Get Quoted and contractors, governing the processing of customer personal information under US privacy laws including the CCPA.',
  alternates: { canonical: 'https://letsgetquoted.com/dpa' },
};

export default function DataProcessingAddendumPage() {
  return (
    <main className={styles.legalShell} id="main-content">
      <header className={styles.legalHeader}>
        <p className="eyebrow">Legal</p>
        <h1>Data Processing Addendum (DPA)</h1>
        <p>
          This Data Processing Addendum (&quot;DPA&quot;) supplements the <Link href="/terms">Terms of Service</Link> between
          LETS GET QUOTED LLC (&quot;Let&apos;s Get Quoted&quot;, &quot;Processor&quot;, &quot;Service Provider&quot;) and the
          business subscriber (&quot;Contractor&quot;, &quot;Controller&quot;, &quot;Business&quot;). It applies to the processing
          of Customer Personal Information in connection with the Service.
        </p>
        <span className={styles.effectiveDate}>Effective {TERMS_EFFECTIVE_DATE}</span>
      </header>

      <div className={styles.legalContent}>
        <section>
          <h2>1. Definitions and Roles</h2>
          <p>
            Capitalized terms used but not defined in this DPA have the meanings given in the Terms of Service or applicable
            Data Protection Laws (including the California Consumer Privacy Act of 2018, as amended by the California Privacy
            Rights Act, &quot;CCPA&quot;).
          </p>
          <ul>
            <li>
              <strong>Customer Personal Information:</strong> Any personal information or personal data relating to an identified
              or identifiable homeowner, consumer, employee, or subcontractor submitted to or processed by the Service on
              behalf of Contractor.
            </li>
            <li>
              <strong>Roles of the Parties:</strong> Contractor is the Business or Controller of Customer Personal Information.
              Let&apos;s Get Quoted is a Service Provider or Processor acting solely on Contractor&apos;s documented instructions.
            </li>
          </ul>
        </section>

        <section>
          <h2>2. Scope and Purpose of Processing</h2>
          <p>
            Let&apos;s Get Quoted processes Customer Personal Information only on behalf of Contractor and in accordance with
            Contractor&apos;s documented instructions, which include the Terms of Service, this DPA, and the configuration and
            use of features in the Service (including scheduling, quotes, invoices, payments, SMS/email messaging, AI voice
            reception, and job records).
          </p>
          <p>
            The duration of processing corresponds to the term of Contractor&apos;s account plus any retention required for
            legal, accounting, tax, security, or regulatory obligations.
          </p>
        </section>

        <section>
          <h2>3. Service Provider Statutory Restrictions (CCPA / US State Privacy Laws)</h2>
          <p>
            Pursuant to the CCPA and applicable US state privacy laws, Let&apos;s Get Quoted expressly agrees, certifies, and
            understands that it:
          </p>
          <ul>
            <li>
              <strong>Will not sell or share</strong> Customer Personal Information (as those terms are defined under the CCPA).
            </li>
            <li>
              <strong>Will not retain, use, or disclose</strong> Customer Personal Information for any purpose other than for the
              business purposes specified in the Terms of Service and this DPA, or as otherwise permitted by applicable law.
            </li>
            <li>
              <strong>Will not retain, use, or disclose</strong> Customer Personal Information outside of the direct business
              relationship between Let&apos;s Get Quoted and Contractor.
            </li>
            <li>
              <strong>Will not combine</strong> Customer Personal Information received from, or on behalf of, Contractor with
              personal information received from, or on behalf of, another person or source, except to the extent permitted
              under applicable service-provider regulations (such as fraud detection, security, or platform maintenance).
            </li>
            <li>
              Will notify Contractor immediately if Let&apos;s Get Quoted determines that it can no longer meet its obligations
              under applicable Data Protection Laws.
            </li>
          </ul>
        </section>

        <section>
          <h2>4. Confidentiality and Security Measures</h2>
          <p>
            Let&apos;s Get Quoted ensures that persons authorized to process Customer Personal Information (including employees,
            contractors, and subprocessors) are bound by appropriate obligations of confidentiality.
          </p>
          <p>
            Let&apos;s Get Quoted maintains reasonable technical, physical, and administrative security measures designed to protect
            Customer Personal Information against accidental or unlawful destruction, loss, alteration, unauthorized disclosure,
            or access, appropriate to the nature of the data processed.
          </p>
        </section>

        <section>
          <h2>5. Subprocessors</h2>
          <p>
            Contractor grants Let&apos;s Get Quoted general authorization to engage third-party subprocessors to support the
            provision of the Service (including cloud hosting, database infrastructure, telephony and messaging carriers, AI
            inference engines, and payment processors).
          </p>
          <p>
            Let&apos;s Get Quoted imposes contractual data-protection terms on each subprocessor that are no less restrictive than
            those in this DPA. Let&apos;s Get Quoted remains responsible for the performance of its subprocessors&apos; obligations.
          </p>
        </section>

        <section>
          <h2>6. Security Incident Notification</h2>
          <p>
            Let&apos;s Get Quoted will notify Contractor without undue delay upon confirming a Security Incident affecting Customer
            Personal Information. Let&apos;s Get Quoted will take reasonable steps to mitigate the effects of the incident and provide
            Contractor with information reasonably necessary for Contractor to meet its legal breach notification obligations.
          </p>
        </section>

        <section>
          <h2>7. Data Subject Requests and Assistance</h2>
          <p>
            Taking into account the nature of the processing, Let&apos;s Get Quoted provides tools within the Service (including
            data export, update, and suppression functions) to assist Contractor in responding to consumer requests to exercise
            their rights under Data Protection Laws (such as requests to access, correct, or delete personal information).
          </p>
          <p>
            If Let&apos;s Get Quoted receives a request directly from a Contractor&apos;s customer, Let&apos;s Get Quoted will advise
            the consumer to submit their request directly to the Contractor.
          </p>
        </section>

        <section>
          <h2>8. Deletion and Return of Customer Data</h2>
          <p>
            Upon termination of Contractor&apos;s account, Let&apos;s Get Quoted will delete or de-identify Customer Personal
            Information in accordance with its routine data deletion cycles, except to the extent that retention is required by
            applicable laws, accounting rules, tax regulations, anti-fraud measures, or security audits.
          </p>
        </section>

        <section>
          <h2>9. Audits and Compliance Verification</h2>
          <p>
            Upon Contractor&apos;s reasonable written request, Let&apos;s Get Quoted will make available information reasonably
            necessary to demonstrate compliance with this DPA, which may include security summaries, third-party attestations, or
            responses to written security questionnaires.
          </p>
        </section>

        <section>
          <h2>10. Precedence</h2>
          <p>
            In the event of any conflict between this DPA and the Terms of Service regarding the processing of Customer Personal
            Information, this DPA will control.
          </p>
        </section>
      </div>

      <nav className={styles.legalNav} aria-label="Legal pages">
        <Link href="/terms">Terms of Service</Link>
        <Link href="/privacy">Privacy Policy</Link>
        <Link href="/sms-terms">SMS Terms</Link>
        <Link href="/security">Security</Link>
        <Link href="/">Home</Link>
      </nav>
    </main>
  );
}
