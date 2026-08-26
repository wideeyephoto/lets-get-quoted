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
              A prospective homeowner in Royal Oak needs a paver patio and outdoor fire pit. They land on Evergreen&apos;s site.
            </p>
          </div>
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
            <Link href="/demo/tour/intake" className={styles.siteEstimateBtn} aria-label="Get Instant Estimate on Evergreen website">
              Get Instant Estimate &rarr;
            </Link>
          </div>
        </header>

        <section className={styles.siteHero}>
          <div className={styles.siteHeroInner}>
            <span className={styles.siteHeroBadge}>🌿 {DEMO_TOUR_CONTRACTOR.badge}</span>
            <h2 className={styles.siteHeroTitle}>
              Outdoor living spaces built to endure.<br />
              <em>Custom patios, walls &amp; plantings.</em>
            </h2>
            <p className={styles.siteHeroSub}>
              Serving {DEMO_TOUR_CONTRACTOR.serviceArea}. Transparent upfront pricing, zero hidden fees, and master craftsmen on every project.
            </p>

            <div className={styles.siteHeroCtaBox}>
              <h3>Ready to transform your outdoor space?</h3>
              <p>
                Answer 3 quick questions. Our AI estimator calculates your preliminary quote in 30 seconds.
              </p>
              <Link href="/demo/tour/intake" className={styles.sitePulseBtn} aria-label="Get My Instant Estimate">
                Get My Instant Estimate &rarr;
              </Link>
            </div>
          </div>
        </section>

        <section className={styles.siteServicesGrid}>
          <div className={styles.siteServiceCard}>
            <h4>🧱 Custom Paver Patios &amp; Walkways</h4>
            <p>
              Premium Unilock and Belgard pavers with commercial aggregate base compaction, precision jointing, and lifetime structural integrity.
            </p>
            <Link href="/demo/tour/intake" className={styles.siteServiceLink} aria-label="Get quote for Custom Paver Patios & Walkways">
              Get quote &rarr;
            </Link>
          </div>

          <div className={styles.siteServiceCard}>
            <h4>🔥 Built-in Fire Pits &amp; Seat Walls</h4>
            <p>
              Integrated curved seating walls, wood or gas stone fire pits, and outdoor entertainment focal points designed for Michigan seasons.
            </p>
            <Link href="/demo/tour/intake" className={styles.siteServiceLink} aria-label="Get quote for Built-in Fire Pits & Seat Walls">
              Get quote &rarr;
            </Link>
          </div>

          <div className={styles.siteServiceCard}>
            <h4>✨ Low-Voltage Landscape Lighting</h4>
            <p>
              Architectural step, wall, and path lighting with smart dusk-to-dawn controls for warmth, safety, and nighttime curb appeal.
            </p>
            <Link href="/demo/tour/intake" className={styles.siteServiceLink} aria-label="Get quote for Low-Voltage Landscape Lighting">
              Get quote &rarr;
            </Link>
          </div>
        </section>

        <section className={styles.siteReviews}>
          <div className={styles.siteReviewsInner}>
            <h3>What your neighbors say</h3>
            <span className={styles.siteReviewDisclaimer}>
              Illustrative demo reviews &middot; Evergreen Lawn &amp; Landscape (fictional sample)
            </span>
            <p style={{ color: '#4a5568', fontSize: '14px', margin: 0 }}>
              {DEMO_TOUR_CONTRACTOR.rating}
            </p>

            <div className={styles.siteReviewGrid}>
              <div className={styles.siteReviewCard}>
                <div className={styles.siteReviewStars}>★★★★★</div>
                <p className={styles.siteReviewText}>
                  &ldquo;Got an instant quote on Thursday night, patio installation completed the following week. Clean crew, zero mess.&rdquo;
                </p>
                <span className={styles.siteReviewAuthor}>David M. &middot; Royal Oak, MI</span>
              </div>
              <div className={styles.siteReviewCard}>
                <div className={styles.siteReviewStars}>★★★★★</div>
                <p className={styles.siteReviewText}>
                  &ldquo;The built-in fire pit and seat wall are incredible. Mike and Jamal were on time every morning and handled everything seamlessly.&rdquo;
                </p>
                <span className={styles.siteReviewAuthor}>Elena R. &middot; Ferndale, MI</span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
