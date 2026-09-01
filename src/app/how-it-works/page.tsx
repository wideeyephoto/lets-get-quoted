import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';

import LaunchBanner from '@/components/marketing/launch-banner';
import { APP_SIGNUP_URL, DEMO_URL } from '@/components/marketing/links';
import { SiteFooter, SiteHeader } from '@/components/flagship/site-chrome';
import flagshipStyles from '@/components/flagship/flagship.module.css';
import { FLEX_PRICE, PUBLIC_PRICING_SUMMARY } from '@/lib/pricing';
import { titleWithBrand } from '@/lib/seo/marketing-seo';

import styles from './how-it-works.module.css';
import SectionNav, { type NavSection } from './section-nav';
import WorkflowShowcase from './workflow-showcase';

export const metadata: Metadata = {
  title: { absolute: titleWithBrand('How It Works — Website Request to Paid Job') },
  description:
    'See how Let’s Get Quoted connects a contractor website, Smart Intake, quotes, scheduling, crews, invoices, payments, and repeat work in one job record.',
  alternates: { canonical: 'https://letsgetquoted.com/how-it-works' },
  openGraph: {
    title: 'How It Works · Website Request to Paid Job',
    description:
      'Follow one contractor job through website intake, quoting, scheduling, field work, invoicing, and payment.',
    url: 'https://letsgetquoted.com/how-it-works',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'How Let’s Get Quoted Works',
    description: 'One connected contractor workflow, from website request to paid job.',
  },
};

const NAV_SECTIONS: NavSection[] = [
  { id: 'workflow', label: 'Workflow' },
  { id: 'control', label: 'Your control' },
  { id: 'field', label: 'Field + portal' },
  { id: 'automations', label: 'Automations' },
  { id: 'faq', label: 'FAQ' },
];

const AUTOMATIONS = [
  {
    number: '01',
    title: 'Quote follow-up',
    body: 'Follow up automatically on an unapproved quote, then stop after the reminder limit you set.',
  },
  {
    number: '02',
    title: 'Appointment reminder + on-my-way',
    body: 'Remind the customer before the visit, then send an arrival update when the tech leaves.',
  },
  {
    number: '03',
    title: 'Review request',
    body: 'When work is complete, offer every customer the same two choices: post a public review or share private feedback.',
  },
  {
    number: '04',
    title: 'Rebook + recurring',
    body: 'Invite the customer back, or set weekly, every-other-week, or monthly visits from the same record.',
  },
];

const RELATED_FEATURES = [
  {
    eyebrow: 'QUICK STOPS',
    title: 'Offer paid priority visits along routes you already drive.',
    body: 'You set the priority fee and arrival window. The customer pays that fee before the visit is booked; the service itself is charged separately.',
    href: '/features/quick-stops',
    cta: 'Explore Quick Stops',
  },
  {
    eyebrow: 'RECURRING WORK',
    title: 'Turn a finished job into the next scheduled visit.',
    body: 'Each weekly, every-other-week, or monthly cycle creates a real scheduled job and itemized charge.',
    href: '/features/recurring',
    cta: 'Explore recurring work',
  },
  {
    eyebrow: 'REVIEWS + REBOOKING',
    title: 'Ask properly. Then ask the customer back.',
    body: 'Every customer gets the same public-review and private-feedback choices. Rebook past customers separately with consent-aware email or SMS.',
    href: '/features/reviews',
    cta: 'Explore reviews and rebooking',
  },
  {
    eyebrow: 'CASH FLOW',
    title: 'See the difficult week before it arrives.',
    body: 'Read deposits, balances, payroll, and bills by date, then export QuickBooks-ready CSV files for your accountant.',
    href: '/features/cash-flow',
    cta: 'Explore cash flow',
  },
];

const FAQS = [
  {
    question: 'Can I use a domain I already own?',
    answer:
      'Yes. Start on the included LGQ subdomain, then connect a domain you own whenever you are ready. Smart Intake is built into the LGQ website.',
  },
  {
    question: 'Where do the requests come from?',
    answer:
      'Each request comes through the website built for your business and stays in your account. Let’s Get Quoted is contractor business software—not a marketplace that buys, shares, or resells leads.',
  },
  {
    question: 'Is the preliminary estimate a price I have to honor?',
    answer:
      'No. When Smart Intake can produce one, it is a preliminary range based on the homeowner’s answers and your pricing setup. You review the scope and set the final quote; if no range is available, the homeowner can still submit the request.',
  },
  {
    question: 'What happens to lower-fit requests?',
    answer:
      'They stay visible on your lead board. A lower score changes the alert, not your access to the request, and nothing is discarded.',
  },
  {
    question: 'Does this work for a solo operator and a crew?',
    answer:
      'Yes. A solo operator can run the workflow personally. As the team grows, the same job record supports crew assignment, field access, hours, materials, and owner-only margin.',
  },
  {
    question: 'Does my customer need an account or app?',
    answer:
      'No. The homeowner receives a private job link and can also reply through ordinary SMS. There is no password or app to install.',
  },
  {
    question: 'Where does payment go?',
    answer:
      'Payments move through your connected Stripe account on Stripe’s payout schedule. LGQ does not hold your funds or see card numbers.',
  },
  {
    question: 'Are the 0%-interest plans financing?',
    answer:
      'No. They are installment plans with no interest, credit check, or upfront financing advance. You receive the deposit and each installment as it is charged.',
  },
  {
    question: 'What fees apply?',
    answer: `${PUBLIC_PRICING_SUMMARY} The LGQ fee applies only to the discount-adjusted service subtotal successfully collected through LGQ. Taxes, tips, refunds, credits, and Stripe costs are excluded. Stripe processing and payment-infrastructure costs are separate.`,
  },
  {
    question: 'Can I import existing customers and job history?',
    answer:
      'You can bulk-import an existing customer list. Historical jobs, quotes, messages, and payments require a separate migration review because support varies by record type and source.',
  },
];

function Check({ children }: { children: ReactNode }) {
  return (
    <li>
      <span aria-hidden="true">✓</span>
      {children}
    </li>
  );
}

export default function HowItWorksPage() {
  return (
    <div className={styles.page}>
      <div className={flagshipStyles.root}>
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <SiteHeader />
      </div>
      <LaunchBanner offsetHeader />
      <SectionNav sections={NAV_SECTIONS} />

      <main id="main-content">
      <section className={styles.hero} aria-labelledby="how-title">
        <div className={styles.heroGlowOne} aria-hidden="true" />
        <div className={styles.heroGlowTwo} aria-hidden="true" />
        <div className={styles.shell}>
          <div className={styles.heroLayout}>
            <div className={styles.heroCopy}>
              <p className={styles.heroEyebrow}>
                <span aria-hidden="true">✦</span> FROM WEBSITE REQUEST TO PAID JOB
              </p>
              <h1 id="how-title">
                Turn website visitors into <em>paid jobs.</em>
              </h1>
              <p className={styles.heroLede}>
                Launch a contractor website, qualify each request, then quote, schedule, update,
                invoice, and get paid from one connected job record.
              </p>
              <div className={styles.heroActions}>
                <a className={styles.primaryButton} href={APP_SIGNUP_URL}>
                  Build my free website <span aria-hidden="true">→</span>
                </a>
                <a className={styles.secondaryButton} href="#workflow">
                  Follow one job to payment
                </a>
              </div>
              <p className={styles.heroPricing}>
                Flex is {FLEX_PRICE.monthlyPrice}. Its {FLEX_PRICE.platformFee} LGQ fee applies to
                the discount-adjusted service subtotal successfully collected through LGQ; Stripe
                costs are separate.
              </p>
              <ul className={styles.assuranceList} aria-label="How the workflow stays in your control">
                <Check>Requests come through the website built for your business</Check>
                <Check>You set the fit rules and final price</Check>
                <Check>One record follows the job through payment</Check>
              </ul>
            </div>

            <aside className={styles.heroJob} aria-label="Illustrative electrical job moving through Let’s Get Quoted">
              <div className={styles.heroJobTop}>
                <span>ILLUSTRATIVE JOB · SAMPLE #2081</span>
                <strong>HOT</strong>
              </div>
              <div className={styles.heroJobTitle}>
                <div>
                  <small>ELECTRICAL</small>
                  <h2>Panel upgrade + EV charger</h2>
                </div>
                <span>$8,000–$9,500</span>
              </div>
              <dl className={styles.heroJobFacts}>
                <div>
                  <dt>Location</dt>
                  <dd><span aria-hidden="true">✓</span> Inside service area</dd>
                </div>
                <div>
                  <dt>Timeline</dt>
                  <dd><span aria-hidden="true">✓</span> Within 30 days</dd>
                </div>
                <div>
                  <dt>Contact</dt>
                  <dd><span aria-hidden="true">✓</span> Phone verified</dd>
                </div>
              </dl>
              <ol className={styles.heroJourney} aria-label="Illustrative job stages">
                {['Request', 'Quote', 'Scheduled', 'Work', 'Paid'].map((label, index) => (
                  <li key={label} data-current={index === 0 ? 'true' : undefined}>
                    <span aria-hidden="true">{index + 1}</span>
                    <strong>{label}</strong>
                  </li>
                ))}
              </ol>
              <p className={styles.heroJobStatus}>
                <span aria-hidden="true">●</span> Needs response
              </p>
            </aside>
          </div>
          <p className={styles.heroDisclosure}>
            Illustrative electrical job · Fictional business, customer, dates, settings, and amounts.
            Illustrates product workflow, not a customer result.
          </p>
        </div>
      </section>

      <section className={styles.workflowSection} id="workflow" aria-labelledby="workflow-title">
        <div className={styles.shell}>
          <div className={styles.sectionIntro}>
            <p className={styles.kicker}>ONE JOB · FIVE CONNECTED STAGES</p>
            <h2 id="workflow-title">See what carries forward at every handoff.</h2>
            <p>Follow one illustrative electrical job from request to payment. Product screens use separate demo data.</p>
          </div>

          <WorkflowShowcase />

          <aside className={styles.firstStepCta} aria-labelledby="first-step-title">
            <div>
              <p className={styles.kicker}>TRY STEP ONE</p>
              <h3 id="first-step-title">See your contractor website before you publish.</h3>
            </div>
            <div>
              <p>
                Enter your business name, trade, and service area. Review the generated pages and
                Smart Intake, then publish when you are ready.
              </p>
              <div className={styles.firstStepActions}>
                <a className={styles.primaryButton} href={APP_SIGNUP_URL}>
                  Create my site preview <span aria-hidden="true">→</span>
                </a>
                <Link href="/pricing">See pricing and fees</Link>
              </div>
            </div>
          </aside>
        </div>
      </section>

      <section className={styles.controlSection} id="control" aria-labelledby="control-title">
        <div className={styles.shell}>
          <div className={styles.controlLayout}>
            <div className={styles.controlCopy}>
              <p className={styles.kickerLight}>YOU STAY IN CONTROL</p>
              <h2 id="control-title">See what needs attention first. Keep every request.</h2>
              <p>
                Your intake rules shape the score and alerts. The Priority inbox surfaces new
                requests, overdue follow-ups, and quotes awaiting action; lower-fit requests stay
                on the board. You still review the scope and set the final price.
              </p>
              <Link className={styles.lightLink} href="/features/ai-intake">
                See exactly what Smart Intake asks <span aria-hidden="true">→</span>
              </Link>
            </div>
            <dl className={styles.controlProof}>
              <div>
                <dt><span>01</span> Your rules</dt>
                <dd>Set service area, minimum job size, excluded work, timing, and the high-value threshold.</dd>
              </div>
              <div>
                <dt><span>02</span> Nothing discarded</dt>
                <dd>A lower score changes the alert—not your access to the request.</dd>
              </div>
              <div>
                <dt><span>03</span> Estimate, not quote</dt>
                <dd>The homeowner sees a preliminary range. You decide the final scope and price.</dd>
              </div>
            </dl>
          </div>
        </div>
      </section>

      <section className={styles.fieldSection} id="field" aria-labelledby="field-title">
        <div className={styles.shell}>
          <div className={styles.sectionIntro}>
            <p className={styles.kicker}>UPDATE ONCE · KEEP EVERYONE CURRENT</p>
            <h2 id="field-title">Fast in the field. Clear for the homeowner.</h2>
            <p>Text-to-Job keeps the job record current. The private portal keeps the homeowner informed.</p>
          </div>

          <div className={styles.fieldGrid}>
            <article className={styles.fieldCard}>
              <div className={styles.cardLabel}>
                <span aria-hidden="true">↗</span> TEXT-TO-JOB WITH SPARKY · ILLUSTRATIVE
              </div>
              <h3>Update the job while you are still on site.</h3>
              <p>
                Text or send a voice memo, attach a photo, or draft an on-site change order. Sparky
                matches the update to the right job and texts back what changed.
              </p>
              <figure className={styles.phoneDemo} aria-labelledby="phone-demo-caption">
                <figcaption id="phone-demo-caption">Illustrative Text-to-Job conversation</figcaption>
                <div className={styles.phoneTop}>
                  <span>9:41</span>
                  <strong>Sparky</strong>
                  <span aria-hidden="true">•••</span>
                </div>
                <div className={styles.outgoingMessage}>
                  Add a $350 change order to Taylor’s panel job. Extra conduit run.
                  <span>▧ 1 photo</span>
                </div>
                <div className={styles.incomingMessage}>
                  <span aria-hidden="true">✓</span>
                  <p>
                    Added a $350 change order to <strong>Panel upgrade + EV charger</strong>. The
                    change-order approval is ready to send.
                  </p>
                </div>
                <div className={styles.phoneComposer}>Message Sparky… <span aria-hidden="true">→</span></div>
              </figure>
              <ul className={styles.microList}>
                <Check>Notes and photos filed with the job</Check>
                <Check>Ambiguous customer matches confirmed first</Check>
                <Check>Approved change orders carry into the updated invoice</Check>
              </ul>
              <Link className={styles.inlineLink} href="/features/text-to-job">
                Explore Text-to-Job <span aria-hidden="true">→</span>
              </Link>
            </article>

            <article className={styles.fieldCard}>
              <div className={styles.cardLabel}>
                <span aria-hidden="true">◎</span> HOMEOWNER PORTAL · ILLUSTRATIVE
              </div>
              <h3>One private link for the whole job.</h3>
              <p>
                The homeowner can review the signed quote, check the schedule, message you, and
                pay—without an app or password.
              </p>
              <figure className={styles.portalDemo} aria-labelledby="portal-demo-caption">
                <figcaption id="portal-demo-caption">Illustrative private homeowner portal</figcaption>
                <div className={styles.portalBrand}>
                  <strong>HARBOR ELECTRIC</strong>
                  <span>Private project portal</span>
                </div>
                <div className={styles.portalTitle}>
                  <small>PANEL UPGRADE + EV CHARGER</small>
                  <strong>Everything is on schedule.</strong>
                </div>
                <ol className={styles.portalTimeline}>
                  <li data-done="true"><span aria-hidden="true">✓</span> Quote approved</li>
                  <li data-current="true"><span aria-hidden="true">●</span> Tue, Mar 11 · 9–11 AM</li>
                  <li><span aria-hidden="true">○</span> Balance due after work</li>
                </ol>
                <div className={styles.portalActions}>
                  <span>Message contractor</span>
                  <span>View signed quote</span>
                </div>
              </figure>
              <ul className={styles.microList}>
                <Check>Replies work through ordinary SMS</Check>
                <Check>Messages stay attached to the right job</Check>
                <Check>Payments use the connected Stripe account</Check>
              </ul>
              <Link className={styles.inlineLink} href="/features/client-portal">
                Explore the client portal <span aria-hidden="true">→</span>
              </Link>
            </article>
          </div>
          <p className={styles.fieldDisclosure}>
            Fictional business, customer, messages, dates, and amounts. Illustrates product workflow,
            not a customer result.
          </p>
        </div>
      </section>

      <section className={styles.marginSection} aria-labelledby="margin-title">
        <div className={styles.shell}>
          <div className={styles.marginCard}>
            <div className={styles.marginCopy}>
              <p className={styles.kickerLight}>CREW + JOB COSTING</p>
              <h2 id="margin-title">See job margin before you invoice.</h2>
              <p>
                The assigned crew sees the address, scope, photos, and any customer contact details
                you allow. Hours and materials logged from the field update the same job record—and
                its margin.
              </p>
              <ul className={styles.darkCheckList}>
                <Check>The job on the crew’s phone</Check>
                <Check>Hours and materials logged on site</Check>
                <Check>Margin visible to the owner before invoicing</Check>
              </ul>
              <Link className={styles.lightLink} href="/features/crew">
                Explore crew and job costing <span aria-hidden="true">→</span>
              </Link>
            </div>

            <aside className={styles.marginProof} aria-label="Illustrative job economics">
              <div className={styles.marginProofHead}>
                <div>
                  <span>ILLUSTRATIVE JOB ECONOMICS</span>
                  <strong>Panel upgrade + EV charger</strong>
                </div>
                <span>SAMPLE #2081</span>
              </div>
              <dl>
                <div><dt>Approved job revenue</dt><dd>$8,950</dd></div>
                <div><dt>Logged labor · Mike + Tanya · 13.5h</dt><dd>−$1,650</dd></div>
                <div><dt>Logged materials</dt><dd>−$3,900</dd></div>
                <div className={styles.marginTotal}><dt>Job margin before overhead</dt><dd>$3,400</dd></div>
              </dl>
              <p>Fictional job, crew names, and amounts. Illustrates job-costing math, not a customer result. Margin is approved job revenue minus logged labor and materials, before overhead.</p>
            </aside>
          </div>
        </div>
      </section>

      <section className={styles.automationSection} id="automations" aria-labelledby="automation-title">
        <div className={styles.shell}>
          <div className={styles.sectionIntro}>
            <p className={styles.kicker}>BEFORE, DURING, AND AFTER THE JOB</p>
            <h2 id="automation-title">Let routine follow-up happen on time.</h2>
            <p>Choose the reminders you want. Each one uses the quote, appointment, or customer record already in LGQ.</p>
          </div>
          <ol className={styles.automationRail}>
            {AUTOMATIONS.map((item) => (
              <li key={item.number}>
                <span>{item.number}</span>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className={styles.completionSection} aria-labelledby="completion-title">
        <div className={styles.shell}>
          <div className={styles.completionLayout}>
            <div className={styles.completionCopy}>
              <p className={styles.kicker}>THE ILLUSTRATIVE JOB · COMPLETE AND PAID</p>
              <h2 id="completion-title">The same request becomes a quoted, scheduled, paid job.</h2>
              <p>
                After payment, the signed quote, invoice, messages, and receipt remain together in
                the customer history—ready when the customer books again.
              </p>
              <ol className={styles.jobTimeline}>
                <li>
                  <span>MAR 03</span>
                  <div><strong>Request reviewed</strong><small>Scope, photos, timing, service-area fit, and preliminary range captured</small></div>
                </li>
                <li>
                  <span>MAR 04</span>
                  <div><strong>Quote signed + deposit paid</strong><small>Final scope and price approved with a typed signature</small></div>
                </li>
                <li>
                  <span>MAR 11</span>
                  <div><strong>Work completed</strong><small>$350 extra-conduit change approved; completion triggers the review request</small></div>
                </li>
                <li>
                  <span>MAR 12</span>
                  <div><strong>Final balance paid</strong><small>Payment reached the connected Stripe account and the receipt was sent</small></div>
                </li>
              </ol>
            </div>

            <div className={styles.paidReceiptWrap}>
              <article className={styles.paidReceipt} aria-label="Illustrative paid job summary">
                <div className={styles.paidReceiptTop}>
                  <span>ILLUSTRATIVE JOB SUMMARY</span>
                  <span>SAMPLE #2081</span>
                </div>
                <small>FICTIONAL BUSINESS · HARBOR ELECTRIC</small>
                <h3>Panel upgrade + EV charger</h3>
                <dl>
                  <div><dt>Quote signed</dt><dd>✓ MAR 04</dd></div>
                  <div><dt>Deposit paid</dt><dd>✓ MAR 04</dd></div>
                  <div><dt>Work complete</dt><dd>✓ MAR 11</dd></div>
                  <div><dt>Final balance</dt><dd>✓ PAID MAR 12</dd></div>
                </dl>
                <div className={styles.paidTotal}>
                  <span>Total collected</span>
                  <strong>$8,950</strong>
                </div>
                <span className={styles.paidStamp}>PAID</span>
              </article>
              <p className={styles.sampleDisclosure}>
                Fictional business, job, dates, settings, and amounts. Illustrates product workflow,
                not a customer result.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.relatedSection} aria-labelledby="related-title">
        <div className={styles.shell}>
          <div className={styles.relatedIntro}>
            <div>
              <p className={styles.kickerLight}>BEYOND THE FIRST JOB</p>
              <h2 id="related-title">Keep more work connected.</h2>
            </div>
            <p>Use the same customer and job history for priority visits, recurring work, reviews, and financial reporting.</p>
          </div>
          <div className={styles.relatedGrid}>
            {RELATED_FEATURES.map((feature) => (
              <article key={feature.eyebrow}>
                <span>{feature.eyebrow}</span>
                <h3>{feature.title}</h3>
                <p>{feature.body}</p>
                <Link href={feature.href}>{feature.cta} <span aria-hidden="true">→</span></Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.faqSection} id="faq" aria-labelledby="faq-title">
        <div className={styles.shell}>
          <div className={styles.faqLayout}>
            <div className={styles.faqIntro}>
              <p className={styles.kicker}>STRAIGHT ANSWERS</p>
              <h2 id="faq-title">What contractors want to know before getting started.</h2>
              <p>Lead ownership, estimates, crews, payments, imports, and fees—plainly explained.</p>
            </div>
            <div className={styles.faqList}>
              {FAQS.map((faq, index) => (
                <details key={faq.question} open={index === 0}>
                  <summary>
                    <span>{faq.question}</span>
                    <span aria-hidden="true">+</span>
                  </summary>
                  <p>{faq.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className={styles.finalCta} aria-labelledby="final-title">
        <div className={styles.shell}>
          <div className={styles.finalLayout}>
            <div>
              <p className={styles.kickerLight}>BUILD YOUR WEBSITE FREE</p>
              <h2 id="final-title">Start with the website. Run the next job in one place.</h2>
            </div>
            <div>
              <p>
                Build your contractor website, set your intake rules, and keep the work connected
                from first request through final payment.
              </p>
              <div className={styles.finalActions}>
                <a className={styles.primaryButton} href={APP_SIGNUP_URL}>
                  Build my free website <span aria-hidden="true">→</span>
                </a>
                <Link className={styles.lightLink} href={DEMO_URL}>Explore the live demo</Link>
              </div>
              <small>{PUBLIC_PRICING_SUMMARY} Stripe processing and payment-infrastructure costs are separate.</small>
            </div>
          </div>
        </div>
      </section>
      </main>

      <div className={flagshipStyles.root}>
        <SiteFooter />
      </div>
    </div>
  );
}
