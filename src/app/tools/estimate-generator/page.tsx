import type { Metadata } from 'next';
import Link from 'next/link';
import SiteFooter from '@/components/site-footer';
import { cspNonce } from '@/lib/csp-nonce';
import EstimateGeneratorClient from './EstimateGeneratorClient';
import styles from '../tools.module.css';

export const metadata: Metadata = {
  title: 'Free Contractor Estimate Generator | Let’s Get Quoted',
  description:
    'Create, itemize, and download professional contractor job estimates on the fly with live municipal permit calculations, tax & deposit formatting, and clean PDF export.',
  alternates: { canonical: 'https://letsgetquoted.com/tools/estimate-generator' },
  openGraph: {
    title: 'Free Contractor Estimate Generator | Let’s Get Quoted',
    description:
      'Build and export itemized contractor job estimates with labor, materials, municipal permit fees, tax, and deposit percentages.',
    url: 'https://letsgetquoted.com/tools/estimate-generator',
    type: 'website',
    siteName: "Let's Get Quoted",
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Free Contractor Estimate Generator | Let’s Get Quoted',
    description:
      'Build and export itemized contractor job estimates with labor, materials, municipal permit fees, tax, and deposit percentages.',
  },
};

export default async function EstimateGeneratorPage() {
  const nonce = await cspNonce();

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Free Contractor Quote & Estimate Generator',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    offers: {
      '@type': 'Offer',
      price: '0.00',
      priceCurrency: 'USD',
    },
    description:
      'Free contractor estimate generator tool to build itemized quotes with labor, materials, municipal building code fees, tax, deposits, and clean PDF export.',
    url: 'https://letsgetquoted.com/tools/estimate-generator',
  };

  return (
    <div className={styles.page}>
      <script
        nonce={nonce}
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <main id="main-content">
        {/* Hero Header */}
        <section className={styles.hero}>
          <span className={styles.kicker}>Free Contractor Tool</span>
          <h1 className={styles.headline}>
            Instant Contractor <em>Estimate Generator</em>
          </h1>
          <p className={styles.subhead}>
            Create, itemize, and format professional job estimates on the fly with live municipal building code &amp;
            permit intelligence. Print directly to PDF or copy a clean text summary.
          </p>
        </section>

        {/* Interactive Editor Client Component */}
        <EstimateGeneratorClient />

        {/* Rich SEO & Contractor Educational Content */}
        <section className={styles.seoSection}>
          <div className={styles.seoContainer}>
            {/* Step-by-Step Workflow */}
            <div className={styles.seoBlock}>
              <div className={styles.seoBlockHeader}>
                <span className={styles.seoKicker}>How It Works</span>
                <h2 className={styles.seoTitle}>How to Create a Professional Contractor Estimate in 4 Steps</h2>
                <p className={styles.seoLead}>
                  A professional estimate protects your profit margins, establishes clear project scope, and accelerates
                  client approval without back-and-forth negotiation.
                </p>
              </div>

              <div className={styles.stepsGrid}>
                <div className={styles.stepCard}>
                  <span className={styles.stepNumber}>1</span>
                  <h3 className={styles.stepTitle}>Enter Business &amp; Client Info</h3>
                  <p className={styles.stepText}>
                    Add your company name, license number, contact details, client name, and job site address. Your
                    draft automatically saves locally on your device.
                  </p>
                </div>

                <div className={styles.stepCard}>
                  <span className={styles.stepNumber}>2</span>
                  <h3 className={styles.stepTitle}>Itemize Labor, Materials &amp; Permits</h3>
                  <p className={styles.stepText}>
                    Break down the project scope with categorized line items. Our live permit engine automatically
                    identifies municipal permit fees and code citations for your trade.
                  </p>
                </div>

                <div className={styles.stepCard}>
                  <span className={styles.stepNumber}>3</span>
                  <h3 className={styles.stepTitle}>Configure Tax &amp; Deposit Schedule</h3>
                  <p className={styles.stepText}>
                    Set your local sales tax percentage and required upfront deposit (typically 20%–33%). Grand totals
                    and deposit amounts recalculate in real time.
                  </p>
                </div>

                <div className={styles.stepCard}>
                  <span className={styles.stepNumber}>4</span>
                  <h3 className={styles.stepTitle}>Export PDF or Send via SMS</h3>
                  <p className={styles.stepText}>
                    Export a clean, single-page printable PDF formatted without web buttons or borders, or copy a
                    formatted text breakdown ready to text or email.
                  </p>
                </div>
              </div>
            </div>

            {/* Essential Estimate Components Guide */}
            <div className={styles.seoBlock}>
              <div className={styles.seoBlockHeader}>
                <span className={styles.seoKicker}>Best Practices</span>
                <h2 className={styles.seoTitle}>What Every Trade Contractor Estimate Must Include</h2>
                <p className={styles.seoLead}>
                  Missing key clauses or vague scope descriptions lead to scope creep and unpaid invoices. Ensure your
                  written estimates include these six core elements:
                </p>
              </div>

              <div className={styles.guideGrid}>
                <div className={styles.guideCard}>
                  <div className={styles.guideIcon}>📋</div>
                  <h3 className={styles.guideTitle}>1. Detailed Scope &amp; Deliverables</h3>
                  <p className={styles.guideText}>
                    Explicitly specify what is included (e.g. tear-off, synthetic underlayment, cleanup) and what is
                    excluded (e.g. concealed rotted decking replacement billed separately).
                  </p>
                </div>

                <div className={styles.guideCard}>
                  <div className={styles.guideIcon}>🏛️</div>
                  <h3 className={styles.guideTitle}>2. Municipal Permits &amp; Inspections</h3>
                  <p className={styles.guideText}>
                    State whether permit acquisition and inspection fees are included in the price or billed at cost.
                    Showing code citations demonstrates authority and builds homeowner trust.
                  </p>
                </div>

                <div className={styles.guideCard}>
                  <div className={styles.guideIcon}>💳</div>
                  <h3 className={styles.guideTitle}>3. Staged Payment Terms</h3>
                  <p className={styles.guideText}>
                    Define clear milestones: upfront material deposit upon signing, progress draw upon rough-in
                    completion, and final balance upon client walkthrough.
                  </p>
                </div>

                <div className={styles.guideCard}>
                  <div className={styles.guideIcon}>⏳</div>
                  <h3 className={styles.guideTitle}>4. Validity Period (30-Day Window)</h3>
                  <p className={styles.guideText}>
                    With supply house material prices fluctuating, protect yourself by stating that quoted rates are
                    guaranteed for 30 days from issuance.
                  </p>
                </div>

                <div className={styles.guideCard}>
                  <div className={styles.guideIcon}>🛡️</div>
                  <h3 className={styles.guideTitle}>5. Workmanship &amp; Manufacturer Warranty</h3>
                  <p className={styles.guideText}>
                    Highlight your labor guarantee (e.g. 1-year workmanship warranty) alongside manufacturer material
                    warranties to overcome price resistance.
                  </p>
                </div>

                <div className={styles.guideCard}>
                  <div className={styles.guideIcon}>📝</div>
                  <h3 className={styles.guideTitle}>6. Change Order Protocol</h3>
                  <p className={styles.guideText}>
                    Specify that any additions or deviations from the written scope will be executed only upon written
                    authorization with agreed cost adjustments.
                  </p>
                </div>
              </div>
            </div>

            {/* Estimate vs Quote vs Bid Comparison */}
            <div className={styles.seoBlock}>
              <div className={styles.seoBlockHeader}>
                <span className={styles.seoKicker}>Pricing Terminology</span>
                <h2 className={styles.seoTitle}>Estimate vs. Quote vs. Bid: What’s the Difference?</h2>
                <p className={styles.seoLead}>
                  Trade contractors often use these terms interchangeably, but they represent very different legal and
                  commercial commitments:
                </p>
              </div>

              <div className={styles.comparisonWrapper}>
                <table className={styles.comparisonTable}>
                  <thead>
                    <tr>
                      <th>Document Type</th>
                      <th>Legal Status</th>
                      <th>When to Use</th>
                      <th>Price Flexibility</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>
                        <strong>Estimate</strong>
                      </td>
                      <td>Non-binding approximation</td>
                      <td>Early project discovery, ballpark feasibility, preliminary scopes</td>
                      <td>Can adjust based on hidden site conditions and material fluctuations</td>
                    </tr>
                    <tr>
                      <td>
                        <strong>Quote / Proposal</strong>
                      </td>
                      <td>Legally binding upon signature</td>
                      <td>Specific jobs with defined materials, measurements, and timelines</td>
                      <td>Fixed price guaranteed for the specified validity window (e.g. 30 days)</td>
                    </tr>
                    <tr>
                      <td>
                        <strong>Bid / Tender</strong>
                      </td>
                      <td>Formal competitive offer</td>
                      <td>Commercial contracts, public works, and general contractor subcontracts</td>
                      <td>Rigid, binding offer submitted under specific competitive tender rules</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Frequently Asked Questions */}
            <div className={styles.seoBlock}>
              <div className={styles.seoBlockHeader}>
                <span className={styles.seoKicker}>FAQ</span>
                <h2 className={styles.seoTitle}>Contractor Tax &amp; Deposit Guidelines</h2>
              </div>

              <div className={styles.faqGrid}>
                <div className={styles.faqCard}>
                  <h3 className={styles.faqQuestion}>Why do 3-tier (Good / Better / Best) estimates win more jobs?</h3>
                  <p className={styles.faqAnswer}>
                    Presenting single lump-sum quotes forces homeowners into a binary &quot;yes or no&quot; decision. Offering 3 packages (Standard, Recommended, and Premium) reframes the choice into &quot;which option is best for our home?&quot; Over 60% of homeowners choose the middle (Recommended) tier, increasing contractor average ticket sizes by 30% to 50%.
                  </p>
                </div>

                <div className={styles.faqCard}>
                  <h3 className={styles.faqQuestion}>How much deposit can a contractor legally charge?</h3>
                  <p className={styles.faqAnswer}>
                    In most US states, residential contractors commonly collect 20% to 33% upfront to purchase materials
                    and reserve crew schedule dates. However, some states enforce statutory caps (for example, California
                    limits initial home improvement deposits to 10% or $1,000, whichever is less). Always verify your
                    state licensing board rules.
                  </p>
                </div>

                <div className={styles.faqCard}>
                  <h3 className={styles.faqQuestion}>Do contractors charge sales tax on labor or only materials?</h3>
                  <p className={styles.faqAnswer}>
                    Sales tax rules vary by state and project classification. In capital improvement projects (such as a
                    full roof replacement or new HVAC installation), labor is often exempt from sales tax, while sales
                    tax is paid on materials at the distributor. In repair or maintenance services, both labor and
                    materials may be taxable in certain jurisdictions.
                  </p>
                </div>

                <div className={styles.faqCard}>
                  <h3 className={styles.faqQuestion}>How do itemized estimates help close jobs faster?</h3>
                  <p className={styles.faqAnswer}>
                    Homeowners distrust single lump-sum figures because they don&apos;t understand what they are paying for.
                    Itemizing scope into labor, spec-grade materials, and required municipal inspections demonstrates
                    professionalism, transparency, and value, reducing price objections by up to 40%.
                  </p>
                </div>

                <div className={styles.faqCard}>
                  <h3 className={styles.faqQuestion}>How do I convert an estimate into a signed quote with a deposit?</h3>
                  <p className={styles.faqAnswer}>
                    With Let’s Get Quoted, you can convert any estimate into an interactive mobile proposal sent straight
                    to your client’s phone via SMS. Homeowners can review the itemized scope, sign digitally, and pay
                    their deposit via Apple Pay or credit card in 30 seconds.
                  </p>
                </div>
              </div>
            </div>

            {/* Related Tools Cross-Links */}
            <div className={styles.seoBlock}>
              <div className={styles.seoBlockHeader}>
                <span className={styles.seoKicker}>More Business Tools</span>
                <h2 className={styles.seoTitle}>Explore Related Free Contractor Tools</h2>
                <p className={styles.seoLead}>
                  Free calculators and benchmarks built to protect your profit margin and eliminate software bloat.
                </p>
              </div>

              <div className={styles.crossToolsGrid}>
                <Link href="/tools/hourly-rate-calculator" className={styles.crossToolCard}>
                  <div>
                    <h3 className={styles.crossToolTitle}>🧮 Hourly Rate &amp; Margin Calculator</h3>
                    <p className={styles.crossToolDesc}>
                      Calculate your true required billable hourly rate factoring in unbillable windshield time, vehicle
                      overhead, helper wages, and target profit margin.
                    </p>
                  </div>
                  <span className={styles.crossToolLink}>Open Rate Calculator &rarr;</span>
                </Link>

                <Link href="/tools/leakage-calculator" className={styles.crossToolCard}>
                  <div>
                    <h3 className={styles.crossToolTitle}>💸 Cash Flow &amp; Leakage Audit</h3>
                    <p className={styles.crossToolDesc}>
                      Audit how much annual revenue slips away to unbilled change orders, supply house traffic, and
                      delayed paper check collections.
                    </p>
                  </div>
                  <span className={styles.crossToolLink}>Run Financial Audit &rarr;</span>
                </Link>

                <Link href="/pricing#savings-calculator" className={styles.crossToolCard}>
                  <div>
                    <h3 className={styles.crossToolTitle}>💰 Competitor &amp; Lead Fee Benchmark</h3>
                    <p className={styles.crossToolDesc}>
                      See how much you save each year by eliminating costly monthly software subscriptions like Jobber
                      and Housecall Pro.
                    </p>
                  </div>
                  <span className={styles.crossToolLink}>Compare Savings &rarr;</span>
                </Link>
              </div>
            </div>

            {/* Trade Solutions Cross-Links */}
            <div className={styles.seoBlock}>
              <div className={styles.seoBlockHeader}>
                <span className={styles.seoKicker}>By Trade</span>
                <h2 className={styles.seoTitle}>Pre-Configured Estimate Systems for Your Trade</h2>
                <p className={styles.seoLead}>
                  Discover dedicated websites, instant pricing calculators, and mobile quoting software tailored to your trade.
                </p>
              </div>

              <div className={styles.crossToolsGrid}>
                <Link href="/for/roofers" className={styles.crossToolCard}>
                  <div>
                    <h3 className={styles.crossToolTitle}>🏠 Roofers</h3>
                    <p className={styles.crossToolDesc}>
                      Roof square estimators, storm damage intake, and deposit-gated calendar scheduling.
                    </p>
                  </div>
                  <span className={styles.crossToolLink}>Explore Roofing Software &rarr;</span>
                </Link>

                <Link href="/for/plumbers" className={styles.crossToolCard}>
                  <div>
                    <h3 className={styles.crossToolTitle}>🔧 Plumbers</h3>
                    <p className={styles.crossToolDesc}>
                      24/7 emergency leak intake, water heater changeout proposals, and instant mobile deposits.
                    </p>
                  </div>
                  <span className={styles.crossToolLink}>Explore Plumbing Software &rarr;</span>
                </Link>

                <Link href="/for/electricians" className={styles.crossToolCard}>
                  <div>
                    <h3 className={styles.crossToolTitle}>⚡ Electricians</h3>
                    <p className={styles.crossToolDesc}>
                      200A panel upgrade scoping, EV charger installation estimates, and digital e-signatures.
                    </p>
                  </div>
                  <span className={styles.crossToolLink}>Explore Electrical Software &rarr;</span>
                </Link>

                <Link href="/for/hvac" className={styles.crossToolCard}>
                  <div>
                    <h3 className={styles.crossToolTitle}>❄️ HVAC Contractors</h3>
                    <p className={styles.crossToolDesc}>
                      Heat pump and AC changeout quotes with Good, Better, Best proposal tiering.
                    </p>
                  </div>
                  <span className={styles.crossToolLink}>Explore HVAC Software &rarr;</span>
                </Link>

                <Link href="/for/landscapers" className={styles.crossToolCard}>
                  <div>
                    <h3 className={styles.crossToolTitle}>🌿 Landscapers</h3>
                    <p className={styles.crossToolDesc}>
                      Hardscaping patio quotes, sod installation calculators, and recurring lawn care plans.
                    </p>
                  </div>
                  <span className={styles.crossToolLink}>Explore Landscaping Software &rarr;</span>
                </Link>

                <Link href="/for/remodelers" className={styles.crossToolCard}>
                  <div>
                    <h3 className={styles.crossToolTitle}>🔨 Remodelers</h3>
                    <p className={styles.crossToolDesc}>
                      Kitchen and bathroom remodeling bids with staged milestone payments and client portals.
                    </p>
                  </div>
                  <span className={styles.crossToolLink}>Explore Remodeling Software &rarr;</span>
                </Link>
              </div>

              <div style={{ textAlign: 'center', marginTop: '28px' }}>
                <Link href="/for" className={styles.btnSecondary} style={{ display: 'inline-block', padding: '12px 24px', borderRadius: '10px', background: 'rgba(174, 199, 211, 0.1)', color: '#f5f0e7', textDecoration: 'none', fontWeight: '700' }}>
                  Explore all 150 supported contractor trades &rarr;
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
