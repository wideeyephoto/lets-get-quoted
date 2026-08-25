import Link from 'next/link';
import DemoTourBar from '@/components/demo/DemoTourBar';
import { TOUR_STEPS, DEMO_TOUR_CONTRACTOR } from '@/lib/demo-tour-data';
import styles from '../tour.module.css';

export const metadata = {
  title: 'Step 1: Contractor Website — Live Evaluation Tour',
};

export default function DemoTourSitePage() {
  const currentStep = TOUR_STEPS[0];

  return (
    <div className={styles.tourContainer}>
      <DemoTourBar currentStep={currentStep} />

      {/* Perspective Context Banner */}
      <div className={styles.perspectiveHero}>
        <div className={styles.perspectiveHeroInner}>
          <div className={styles.perspectiveInfo}>
            <span className={styles.perspectiveTag}>👤 Homeowner Perspective · Step 1 of 6</span>
            <h1 className={styles.perspectiveHeading}>Homeowner visits your live contractor website</h1>
            <p className={styles.perspectiveSub}>
              A prospect in Maplewood needs a 200A panel upgrade and EV charger. They land on Timberline&apos;s site.
            </p>
          </div>
          <Link href="/demo/tour/intake" className={styles.tourNextActionBtn}>
            Try AI Intake (Next) &rarr;
          </Link>
        </div>
      </div>

      {/* Realistic Fixture-Backed Public Contractor Website */}
      <div className={styles.siteWrapper}>
        <header className={styles.siteNav}>
          <div className={styles.siteBrand}>
            {DEMO_TOUR_CONTRACTOR.name.split(' ')[0]} <span>{DEMO_TOUR_CONTRACTOR.name.split(' ').slice(1).join(' ')}</span>
          </div>
          <div className={styles.siteNavLinks}>
            <span className={styles.sitePhone}>{DEMO_TOUR_CONTRACTOR.phone}</span>
            <Link href="/demo/tour/intake" className={styles.siteEstimateBtn}>
              Get Instant Estimate &rarr;
            </Link>
          </div>
        </header>

        <section className={styles.siteHero}>
          <div className={styles.siteHeroInner}>
            <span className={styles.siteHeroBadge}>⚡ {DEMO_TOUR_CONTRACTOR.badge}</span>
            <h2 className={styles.siteHeroTitle}>
              Modern power for modern homes.<br />
              <em>200A upgrades &amp; EV chargers.</em>
            </h2>
            <p className={styles.siteHeroSub}>
              Serving {DEMO_TOUR_CONTRACTOR.serviceArea}. Transparent upfront pricing, zero hidden fees, and dedicated master electricians on every project.
            </p>

            <div className={styles.siteHeroCtaBox}>
              <h3>Ready to power your next stage?</h3>
              <p>
                Answer 3 quick questions. Our AI estimator calculates your preliminary quote in 30 seconds.
              </p>
              <Link href="/demo/tour/intake" className={styles.sitePulseBtn}>
                Get My Instant Estimate &rarr;
              </Link>
            </div>
          </div>
        </section>

        <section className={styles.siteServicesGrid}>
          <div className={styles.siteServiceCard}>
            <h4>⚡ 200-Amp Heavy-Up Upgrades</h4>
            <p>
              Replace outdated or overloaded 100A panels with clean 40-space Square D or Eaton breakers, fully bonded to NEC 2023 code.
            </p>
            <Link href="/demo/tour/intake" className={styles.siteServiceLink}>
              Get quote &rarr;
            </Link>
          </div>

          <div className={styles.siteServiceCard}>
            <h4>🚗 Level 2 EV Charger Circuits</h4>
            <p>
              Dedicated 50A/60A high-output circuits for Tesla Wall Connectors, ChargePoint, and all NEMA 14-50 home chargers.
            </p>
            <Link href="/demo/tour/intake" className={styles.siteServiceLink}>
              Get quote &rarr;
            </Link>
          </div>

          <div className={styles.siteServiceCard}>
            <h4>🛡️ Whole-Home Surge Protection</h4>
            <p>
              Protect thousands of dollars in sensitive EV electronics, heat pumps, and home appliances from grid spikes.
            </p>
            <Link href="/demo/tour/intake" className={styles.siteServiceLink}>
              Get quote &rarr;
            </Link>
          </div>
        </section>

        <section className={styles.siteReviews}>
          <div className={styles.siteReviewsInner}>
            <h3>What your neighbors say</h3>
            <p style={{ color: '#4a5568', fontSize: '14px', margin: 0 }}>
              {DEMO_TOUR_CONTRACTOR.rating}
            </p>

            <div className={styles.siteReviewGrid}>
              <div className={styles.siteReviewCard}>
                <div className={styles.siteReviewStars}>★★★★★</div>
                <p className={styles.siteReviewText}>
                  &ldquo;Got an instant quote on Thursday night, panel upgrade completed by Tuesday. Clean wiring and zero mess.&rdquo;
                </p>
                <span className={styles.siteReviewAuthor}>David M. &middot; Maplewood, NJ</span>
              </div>
              <div className={styles.siteReviewCard}>
                <div className={styles.siteReviewStars}>★★★★★</div>
                <p className={styles.siteReviewText}>
                  &ldquo;They handled the town inspection and permit seamlessly. The EV charger charges our car in 5 hours flat.&rdquo;
                </p>
                <span className={styles.siteReviewAuthor}>Elena R. &middot; South Orange, NJ</span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
