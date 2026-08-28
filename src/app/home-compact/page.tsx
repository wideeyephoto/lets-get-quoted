import Link from 'next/link';
import HeroDashboard from '@/components/hero-dashboard';
import ExampleFrame from '@/components/marketing/example-frame';
import { PLAN_PRICE_OPTIONS } from '@/lib/pricing';
import styles from './home-compact.module.css';

/**
 * Homepage candidate: compact.
 *
 * One and a half screens. The bet is that a contractor who lands here decides
 * almost immediately, and that the six screens the other candidates spend
 * making the case are mostly being scrolled past — so this page carries only
 * what someone deciding in ten seconds would actually use: what it is, who it
 * is for, four proofs, the price, and the button.
 *
 * The headline is the flagship tour's, verbatim. Everything under it is cut to
 * fit, which is the whole point of the format rather than a compromise in it.
 */

const APP = 'https://app.letsgetquoted.com/';

function Tick() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const proof = [
  'Website included',
  'Leads arrive qualified',
  'Quote, schedule and collect',
  'Paid priority visits nearby',
];

export default function HomeCompactPage() {
  return (
    <div className={styles.root}>
      <header className={styles.bar}>
        <Link href="/" className={styles.wordmark}>
          Let’s Get <em>Quoted</em>
        </Link>
        <Link href="/features" className={styles.barLink}>
          See everything included →
        </Link>
      </header>

      <main className={styles.fold}>
        <div>
          <p className={styles.kicker}>Software for contractors &amp; home-service pros</p>
          <h1 className={styles.headline}>
            <span>Build the website.</span>
            <span>Win better jobs.</span>
            <em>Run everything behind it.</em>
          </h1>
          <p className={styles.lede}>
            A professional site in minutes, an intake that qualifies every request before you call,
            and one record that carries the job from quote to payment.
          </p>

          <ul className={styles.proof}>
            {proof.map((p) => (
              <li key={p}>
                <Tick />
                {p}
              </li>
            ))}
          </ul>

          <div className={styles.actions}>
            <a className={styles.primary} href={APP}>
              Build my free site <span aria-hidden="true">→</span>
            </a>
            <Link className={styles.secondary} href="/how-it-works">
              How it works
            </Link>
          </div>
          <p className={styles.fine}>
            Flex starts at $0/month + 1.25% · No card required
          </p>
        </div>

        <div>
          <div className={styles.panel}>
            <p className={styles.mark} aria-hidden="true">
              <sup>$</sup>0
            </p>
            <p className={styles.markCaption} aria-hidden="true">
              Flex monthly base
            </p>
            <span className="sr-only">Flex has a $0 monthly base price.</span>

            <hr className={styles.panelRule} />

            <h2 className={styles.panelTitle}>Start on Flex. Upgrade when the math works.</h2>
            <p className={styles.panelBody}>
              Flex is $0/month plus 1.25%. Paid plans lower the LGQ platform fee and include more
              capacity. Stripe costs are separate.
            </p>
            <ul className={styles.tiers} aria-label="LGQ base plans and platform fees">
              {PLAN_PRICE_OPTIONS.map((plan) => (
                <li key={plan.id}>
                  {plan.platformFee} <span aria-hidden="true">·</span> {plan.name} · {plan.monthlyPrice}
                </li>
              ))}
            </ul>
          </div>

          {/* `plain` because HeroDashboard already draws its own card chrome —
              the frame here is only supplying the marker and the caption. */}
          <ExampleFrame
            label="the dashboard on a working morning"
            variant="plain"
            className={styles.demo}
          >
            <HeroDashboard />
          </ExampleFrame>
        </div>
      </main>

      <footer className={styles.foot}>
        <div>
          <p style={{ margin: '0 0 4px', fontSize: '12px', color: '#94a3b8', fontWeight: 500 }}>
            Built thoughtfully, for thoughtful contractors
          </p>
          <span>© 2026 Let’s Get Quoted</span>
        </div>
        <nav className={styles.footLinks} aria-label="Footer">
          <Link href="/features">Features</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/founder">Founder</Link>
          <Link href="/contact">Contact</Link>
        </nav>
      </footer>
    </div>
  );
}
