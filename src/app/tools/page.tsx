import type { Metadata } from 'next';
import Link from 'next/link';
import SiteFooter from '@/components/site-footer';
import { cspNonce } from '@/lib/csp-nonce';
import styles from './tools.module.css';

export const metadata: Metadata = {
  title: 'Free Contractor Tools & Calculators',
  description:
    'Free interactive business tools for trade contractors. Calculate true billable hourly rates, profit margins, and create instant itemized quotes with no signup required.',
  alternates: { canonical: 'https://letsgetquoted.com/tools' },
  openGraph: {
    title: 'Free Contractor Tools & Calculators',
    description:
      'Free trade calculators: True Hourly Rate & Margin Calculator, Instant Estimate Generator, and Competitor Fee Benchmark.',
    url: 'https://letsgetquoted.com/tools',
    type: 'website',
  },
};

export default async function ToolsHubPage() {
  const nonce = await cspNonce();

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Free Contractor Tools & Calculators',
    description:
      'Interactive tools designed to help trade contractors price jobs accurately, calculate billable hourly rates, and generate professional estimates.',
    url: 'https://letsgetquoted.com/tools',
    hasPart: [
      {
        '@type': 'SoftwareApplication',
        name: 'Contractor True Hourly Rate & Profit Margin Calculator',
        url: 'https://letsgetquoted.com/tools/hourly-rate-calculator',
        applicationCategory: 'BusinessApplication',
      },
      {
        '@type': 'SoftwareApplication',
        name: 'Free Contractor Estimate & Quote Generator',
        url: 'https://letsgetquoted.com/tools/estimate-generator',
        applicationCategory: 'BusinessApplication',
      },
      {
        '@type': 'SoftwareApplication',
        name: 'Contractor Cash Flow & Profit Leakage Audit Calculator',
        url: 'https://letsgetquoted.com/tools/leakage-calculator',
        applicationCategory: 'BusinessApplication',
      },
    ],
  };

  return (
    <div className={styles.page}>
      <script
        nonce={nonce}
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <main id="main-content">
        <section className={styles.hero}>
          <span className={styles.kicker}>Free Trade Utilities</span>
          <h1 className={styles.headline}>
            Free tools built to protect your <em>profit margin</em>.
          </h1>
          <p className={styles.subhead}>
            No credit card, no account required. Calculate your real billable hourly rate, generate client estimates,
            and discover how much you save by eliminating subscription bloat.
          </p>
        </section>

        <section className={styles.container}>
          <div className={styles.toolsGrid}>
            {/* Tool 1 */}
            <Link href="/tools/hourly-rate-calculator" className={styles.toolCard}>
              <div>
                <div className={styles.toolCardHeader}>
                  <div className={styles.toolIcon}>🧮</div>
                  <div>
                    <h2 className={styles.toolTitle}>Hourly Rate &amp; Margin Calculator</h2>
                    <span className={styles.toolBadge}>Interactive Tool</span>
                  </div>
                </div>
                <p className={styles.toolDesc}>
                  Account for unbillable drive time, van overhead, helper wages, and insurance to find your exact
                  required billable hourly rate and day rate.
                </p>
                <ul className={styles.toolFeatures}>
                  <li>
                    <span>✓</span> True billable rate factoring windshield time
                  </li>
                  <li>
                    <span>✓</span> Breakeven rate vs. profit target breakdown
                  </li>
                  <li>
                    <span>✓</span> 1-tap trade presets (Plumber, Electrician, Roofer)
                  </li>
                </ul>
              </div>
              <span className={styles.toolLink}>Open Calculator &rarr;</span>
            </Link>

            {/* Tool 2 */}
            <Link href="/tools/estimate-generator" className={styles.toolCard}>
              <div>
                <div className={styles.toolCardHeader}>
                  <div className={`${styles.toolIcon} ${styles.toolIconMint}`}>📝</div>
                  <div>
                    <h2 className={styles.toolTitle}>Instant Estimate Generator</h2>
                    <span className={styles.toolBadge}>Free Generator</span>
                  </div>
                </div>
                <p className={styles.toolDesc}>
                  Build and format clean, professional contractor estimates on the spot. Add labor, materials, tax, and
                  required deposits, then print or export to PDF.
                </p>
                <ul className={styles.toolFeatures}>
                  <li>
                    <span>✓</span> Itemized labor and material line items
                  </li>
                  <li>
                    <span>✓</span> Automatic tax &amp; deposit percentage calculator
                  </li>
                  <li>
                    <span>✓</span> 1-tap clean PDF / Print export
                  </li>
                </ul>
              </div>
              <span className={styles.toolLink}>Generate Estimate &rarr;</span>
            </Link>

            {/* Tool 3 */}
            <Link href="/tools/leakage-calculator" className={styles.toolCard}>
              <div>
                <div className={styles.toolCardHeader}>
                  <div className={styles.toolIcon}>💸</div>
                  <div>
                    <h2 className={styles.toolTitle}>Cash Flow &amp; Leakage Audit</h2>
                    <span className={styles.toolBadge}>Diagnostic Tool</span>
                  </div>
                </div>
                <p className={styles.toolDesc}>
                  Discover how much annual revenue slips away to unbilled change orders, supply house traffic, and
                  delayed paper check pickups.
                </p>
                <ul className={styles.toolFeatures}>
                  <li>
                    <span>✓</span> Scope creep &amp; extra material loss calculation
                  </li>
                  <li>
                    <span>✓</span> Unbilled supply house &amp; drive-time audit
                  </li>
                  <li>
                    <span>✓</span> Recoverable profit breakdown on Let’s Get Quoted
                  </li>
                </ul>
              </div>
              <span className={styles.toolLink}>Run Financial Audit &rarr;</span>
            </Link>

            {/* Tool 4 */}
            <Link href="/pricing#savings-calculator" className={styles.toolCard}>
              <div>
                <div className={styles.toolCardHeader}>
                  <div className={styles.toolIcon}>💰</div>
                  <div>
                    <h2 className={styles.toolTitle}>Competitor &amp; Lead Fee Calculator</h2>
                    <span className={styles.toolBadge}>Savings Benchmark</span>
                  </div>
                </div>
                <p className={styles.toolDesc}>
                  See how much you overpay each year in fixed software subscriptions (Jobber, Housecall Pro) and shared
                  lead broker waste (Angi, Thumbtack).
                </p>
                <ul className={styles.toolFeatures}>
                  <li>
                    <span>✓</span> Side-by-side Jobber &amp; Housecall Pro benchmark
                  </li>
                  <li>
                    <span>✓</span> Shared lead fee waste simulation
                  </li>
                  <li>
                    <span>✓</span> Real-time annual cash savings
                  </li>
                </ul>
              </div>
              <span className={styles.toolLink}>Compare Savings &rarr;</span>
            </Link>

            {/* Tool 4 */}
            <Link href="/features/ai-intake#sandbox" className={styles.toolCard}>
              <div>
                <div className={styles.toolCardHeader}>
                  <div className={`${styles.toolIcon} ${styles.toolIconMint}`}>⚡</div>
                  <div>
                    <h2 className={styles.toolTitle}>AI Lead Triage &amp; Route Matcher</h2>
                    <span className={styles.toolBadge}>Interactive Sandbox</span>
                  </div>
                </div>
                <p className={styles.toolDesc}>
                  Test how AI lead triage scores incoming homeowner requests (Emergency, Remodel, Quick Stop) and
                  simulates instant SMS dispatch notifications.
                </p>
                <ul className={styles.toolFeatures}>
                  <li>
                    <span>✓</span> Instant urgency &amp; budget qualification
                  </li>
                  <li>
                    <span>✓</span> Route-proximity matching along existing jobs
                  </li>
                  <li>
                    <span>✓</span> Simulated phone dispatch preview
                  </li>
                </ul>
              </div>
              <span className={styles.toolLink}>Test AI Sandbox &rarr;</span>
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
