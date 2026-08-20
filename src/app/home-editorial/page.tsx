import Link from 'next/link';
import { FLEX_PRICE, LOWEST_PLATFORM_FEE } from '@/lib/pricing';
import styles from './home-editorial.module.css';

/**
 * Homepage candidate: editorial.
 *
 * The other candidates argue by showing the product. This one argues by
 * explaining it, on the bet that a contractor deciding whether a tool is for
 * them reads more than they skim — so the page is one column at a readable
 * measure, and a visual appears only where prose would be slower.
 *
 * The headlines are the flagship tour's, verbatim, because the point of a set
 * of candidates is to vary one thing at a time. Supporting copy is trimmed and
 * re-broken to suit long-form setting, which is the licence this format needs.
 */

const APP = 'https://app.letsgetquoted.com/';

const included = [
  ['Website included', 'A complete contractor site, generated in one click and editable before it goes live.'],
  ['Smart Intake included', 'Every inquiry arrives as a project summary, not a name and a phone number.'],
  ['Back office included', 'Quotes, scheduling, crews and payments, already connected to the lead.'],
  ['Quick Stops included', 'Nearby work that fits a gap in the day, with the visit fee paid before it books.'],
];

const chapters = [
  {
    n: '01',
    kicker: 'One-click website',
    title: 'Go from no website to ready for business.',
    body: 'Three facts about the business — the name, the trade, the area it covers — are enough to generate a complete site: service pages, service-area pages, FAQs and the intake that feeds everything behind it. Nothing publishes until it has been read and edited.',
    proof: ['Your own domain', 'Built for the trades this platform covers', 'Everything editable before you publish'],
    from: 'Three business basics',
    to: 'A complete, editable site',
  },
  {
    n: '02',
    kicker: 'AI Smart Intake',
    title: 'Your website asks the questions a good estimator would.',
    body: 'A homeowner describes the problem and the site asks what follows from it — trade-specific questions, photos, timing, and where the work is. What reaches the contractor is a scoped request with the obvious follow-ups already answered.',
    proof: ['Trade-specific follow-up questions', 'Scored on fit, urgency, value and area', 'The same context carries into the quote'],
    from: 'One homeowner request',
    to: 'A prioritized lead with context',
  },
  {
    n: '03',
    kicker: 'Quick Stops',
    title: 'Get paid to fit nearby customers into today’s route.',
    body: 'When the day opens up, nearby requests that fit the route surface as offers. The contractor sets the arrival window and the price, and the homeowner pays before anything is booked. It is never automatic, and it is always declinable.',
    proof: ['Route-aware, never auto-booked', 'You set the window and the price', 'Nothing books until the homeowner pays'],
    from: 'A gap in today’s route',
    to: 'A paid priority visit you approved',
  },
];

const suite = [
  ['Quotes and e-sign', 'Itemised proposals with optional upgrades, approved in a browser.'],
  ['Scheduling', 'Arrival windows and capacity, so the promise made is the promise kept.'],
  ['Crew and labour', 'Assignments, a time clock, hours and estimated pay.'],
  ['Payments', 'Deposits, balances and payment plans, through Stripe.'],
  ['Recurring work', 'Repeat visits and saved cards, for revenue you can forecast.'],
  ['Cash flow', 'Money in and money out, before either of them moves.'],
  ['Texts and client portal', 'One thread and one portal per job, sharing a record.'],
  ['Reviews and growth', 'Follow-ups and review requests after the work is done.'],
];

const patchwork = [
  ['Website builder', 'Separate'],
  ['Lead form and inbox', 'Separate'],
  ['CRM and scheduling', 'Separate'],
  ['Payments and reviews', 'Separate'],
];

const connected = [
  ['Website and Smart Intake', 'Connected'],
  ['Lead and quote', 'Connected'],
  ['Schedule and crew', 'Connected'],
  ['Payment and growth', 'Connected'],
];

export default function HomeEditorialPage() {
  // `rate` is already a formatted string ("1.25%"); ratePct is the number to
  // compare on. Read rather than retyped so the page cannot drift from the
  // rates /pricing publishes.

  return (
    <div className={styles.root}>
      <header className={styles.bar}>
        <Link href="/" className={styles.wordmark}>
          Let’s Get <em>Quoted</em>
        </Link>
        <nav className={styles.barNav} aria-label="Main">
          <Link href="/features">Product</Link>
          <Link href="/how-it-works">How it works</Link>
          <Link href="/for">For your trade</Link>
          <Link href="/pricing">Pricing</Link>
        </nav>
        <a className={styles.barCta} href={APP}>
          Build my free site
        </a>
      </header>

      <main>
        <section className={`${styles.hero} ${styles.column}`}>
          <p className={styles.kicker}>Software for contractors and home-service pros</p>
          <h1 className={styles.headline}>
            <span>Build the website.</span>
            <span>Win better jobs.</span>
            <span>Run everything behind it.</span>
          </h1>
          <p className={styles.lede}>
            Launch a professional site in minutes. The intake behind it qualifies every request,
            tells you which one to call first, and keeps that context attached to the job from the
            quote through to the payment.
          </p>
          <p className={styles.orient}>
            Not a lead marketplace, and not somewhere homeowners shop for quotes. This is the
            software a contracting business runs on — you own the site, the customers and the
            work.
          </p>
          <div className={styles.actions}>
            <a className={styles.primary} href={APP}>
              Build my free site <span aria-hidden="true">→</span>
            </a>
            <Link className={styles.secondary} href="/features">
              See what’s included
            </Link>
          </div>
          <p className={styles.fine}>
            Flex starts at $0/month + 1.25% · No card required
          </p>
        </section>

        <section className={`${styles.section} ${styles.sectionLine}`} aria-labelledby="included-t">
          <div className={styles.column}>
            <h2 className={styles.chapterTitle} id="included-t">
              All of it, from the first day.
            </h2>
            <p className={styles.chapterBody}>
              There is no starter tier to grow out of and no feature held back for a larger plan.
              The one-truck account opens with the same product as the crew doing seven figures.
            </p>
            <dl className={styles.included} style={{ marginTop: '2.25rem' }}>
              {included.map(([title, body]) => (
                <div key={title}>
                  <dt>{title}</dt>
                  <dd className={styles.includedBody}>{body}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className={`${styles.section} ${styles.sectionLine}`} aria-labelledby="adv-t">
          <div className={styles.column}>
            <p className={styles.kicker}>Three advantages</p>
            <h2 className={styles.chapterTitle} id="adv-t">
              Three things your ordinary website can’t give you.
            </h2>
            <p className={styles.chapterBody}>
              A better first impression, better-qualified leads, and revenue hiding inside a route
              you already drive.
            </p>

            {chapters.map((c) => (
              <article className={styles.chapter} key={c.n}>
                <span className={styles.chapterNum}>
                  {c.n} — {c.kicker}
                </span>
                <h3 className={styles.chapterTitle}>{c.title}</h3>
                <p className={styles.chapterBody}>{c.body}</p>
                <div className={styles.handoff}>
                  <span>
                    <span className={styles.handoffLabel}>Start with</span>
                    <b>{c.from}</b>
                  </span>
                  <span className={styles.handoffArrow} aria-hidden="true">
                    →
                  </span>
                  <span>
                    <span className={styles.handoffLabel}>Get</span>
                    <b>{c.to}</b>
                  </span>
                </div>
                <ul className={styles.proof}>
                  {c.proof.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section className={`${styles.section} ${styles.sectionLine}`} aria-labelledby="suite-t">
          <div className={styles.column}>
            <p className={styles.kicker}>The rest of the job</p>
            <h2 className={styles.chapterTitle} id="suite-t">
              One system from quote to review.
            </h2>
            <p className={styles.chapterBody}>
              The website is the front door. Everything behind it is already connected to the lead
              that came through it.
            </p>
            <ol className={styles.index}>
              {suite.map(([title, body], i) => (
                <li className={styles.indexRow} key={title}>
                  <span className={styles.indexNum}>{String(i + 1).padStart(2, '0')}</span>
                  <span className={styles.indexTitle}>{title}</span>
                  <p className={styles.indexBody}>{body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className={`${styles.section} ${styles.sectionLine}`} aria-labelledby="vs-t">
          <div className={`${styles.column} ${styles.wide}`}>
            <div className={styles.column} style={{ padding: 0 }}>
              <p className={styles.kicker}>Built in, not bolted on</p>
              <h2 className={styles.chapterTitle} id="vs-t">
                Every handoff stays connected.
              </h2>
              <p className={styles.chapterBody}>
                One login and one customer record, from the first question a homeowner types to the
                final payment.
              </p>
            </div>
            <div className={styles.versus}>
              <div className={styles.versusCard}>
                <p className={styles.versusLabel}>The patchwork</p>
                <ul className={styles.versusList}>
                  {patchwork.map(([k, v]) => (
                    <li key={k}>
                      <span>{k}</span>
                      <b>{v}</b>
                    </li>
                  ))}
                </ul>
                <p className={styles.versusNote}>
                  More logins, more retyping, and more places for a lead to stall.
                </p>
              </div>
              <div className={`${styles.versusCard} ${styles.connected}`}>
                <p className={styles.versusLabel}>Let’s Get Quoted</p>
                <ul className={styles.versusList}>
                  {connected.map(([k, v]) => (
                    <li key={k}>
                      <span>{k}</span>
                      <b>{v}</b>
                    </li>
                  ))}
                </ul>
                <p className={styles.versusNote}>
                  One job record, moving forward from the first click to paid.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className={`${styles.section} ${styles.sectionLine}`} aria-labelledby="price-t">
          <div className={`${styles.column} ${styles.price}`}>
            <p className={styles.priceMark} aria-hidden="true">
              <sup>$</sup>0
            </p>
            <p className={styles.priceCaption} aria-hidden="true">
              Flex monthly base
            </p>
            <span className="sr-only">Flex has a $0 monthly base price.</span>
            <h2 className={styles.chapterTitle} id="price-t" style={{ marginTop: '2.5rem' }}>
              Start on Flex. Upgrade when the math works.
            </h2>
            <p className={styles.chapterBody}>
              Flex is {FLEX_PRICE.monthlyPrice} plus {FLEX_PRICE.platformFee}. Paid plans lower the
              LGQ platform fee as far as {LOWEST_PLATFORM_FEE} and include more capacity. Stripe
              costs are separate.
            </p>
            <div className={styles.actions} style={{ justifyContent: 'center' }}>
              <Link className={styles.secondary} href="/pricing">
                See the full pricing
              </Link>
            </div>
          </div>
        </section>

        <section className={`${styles.close} ${styles.sectionLine}`}>
          <div className={styles.column}>
            <h2 className={styles.closeTitle}>
              One truck or ten crews. Your next stage starts here.
            </h2>
            <p className={styles.chapterBody}>
              Launch the site, connect the work, and give a growing business one place to run.
            </p>
            <div className={styles.actions}>
              <a className={styles.primary} href={APP}>
                Create my account <span aria-hidden="true">→</span>
              </a>
            </div>
            <p className={styles.fine}>Flex starts at $0/month · No card to start · Cancel anytime from Settings</p>
          </div>
        </section>

        <div className={`${styles.column} ${styles.wide}`}>
          <div className={styles.foot}>
            <span>© 2026 Let’s Get Quoted</span>
            <nav className={styles.footLinks} aria-label="Footer">
              <Link href="/features">Features</Link>
              <Link href="/how-it-works">How it works</Link>
              <Link href="/pricing">Pricing</Link>
              <Link href="/founder">Founder</Link>
              <Link href="/contact">Contact</Link>
              <Link href="/privacy">Privacy</Link>
            </nav>
          </div>
        </div>
      </main>
    </div>
  );
}
