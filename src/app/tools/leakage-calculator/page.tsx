'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import SiteFooter from '@/components/site-footer';
import { APP_SIGNUP_URL } from '@/components/marketing/links';
import styles from '../tools.module.css';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount);
}

const PRESETS = [
  {
    id: 'solo-remodeler',
    name: 'Solo Remodeler / Builder',
    revenue: 350000,
    unbilledScopePct: 6, // 6% scope creep unbilled
    supplyHouseHours: 4, // 4 hrs/wk at supply house
    hourlyBillingRate: 95,
    checkTripsPerMonth: 6, // 6 trips to pick up paper checks
  },
  {
    id: 'two-truck-service',
    name: '2-Truck Plumber / Electrician',
    revenue: 550000,
    unbilledScopePct: 4,
    supplyHouseHours: 6,
    hourlyBillingRate: 125,
    checkTripsPerMonth: 10,
  },
  {
    id: 'roofing-crew',
    name: 'Roofing Contractor (3-Man)',
    revenue: 850000,
    unbilledScopePct: 5,
    supplyHouseHours: 3,
    hourlyBillingRate: 110,
    checkTripsPerMonth: 8,
  },
  {
    id: 'solo-handyman',
    name: 'Solo Handyman / Painter',
    revenue: 140000,
    unbilledScopePct: 8,
    supplyHouseHours: 3,
    hourlyBillingRate: 75,
    checkTripsPerMonth: 4,
  },
];

export default function LeakageCalculatorPage() {
  const [revenue, setRevenue] = useState(350000);
  const [unbilledScopePct, setUnbilledScopePct] = useState(6);
  const [supplyHouseHours, setSupplyHouseHours] = useState(4);
  const [hourlyBillingRate, setHourlyBillingRate] = useState(95);
  const [checkTripsPerMonth, setCheckTripsPerMonth] = useState(6);
  const [copied, setCopied] = useState(false);

  const calculations = useMemo(() => {
    // 1. Unbilled Scope Creep & Change Orders
    const annualScopeLoss = revenue * (unbilledScopePct / 100);

    // 2. Unbilled Supply House & Parts Runs (50 working weeks)
    const annualSupplyHouseLoss = supplyHouseHours * hourlyBillingRate * 50;

    // 3. Manual Paper Check Chasing (Avg 1.5 hrs per trip + gas ~ $25 gas/wear + 1.5 hrs * billing rate)
    const tripCost = 25 + 1.5 * hourlyBillingRate;
    const annualCheckChasingLoss = checkTripsPerMonth * 12 * tripCost;

    // 4. Net-30 Float & Delayed Deposit Carrying Cost (~2.5% of gross receivables locked)
    const annualCashFlowCost = revenue * 0.025;

    // Total annual profit leakage
    const totalAnnualLeakage =
      annualScopeLoss + annualSupplyHouseLoss + annualCheckChasingLoss + annualCashFlowCost;

    // Estimated recovery on Let's Get Quoted (automated digital change orders + upfront deposits + Apple Pay)
    const recoverableWithLGQ = totalAnnualLeakage * 0.85;

    return {
      annualScopeLoss,
      annualSupplyHouseLoss,
      annualCheckChasingLoss,
      annualCashFlowCost,
      totalAnnualLeakage,
      recoverableWithLGQ,
    };
  }, [revenue, unbilledScopePct, supplyHouseHours, hourlyBillingRate, checkTripsPerMonth]);

  const handlePreset = (preset: (typeof PRESETS)[number]) => {
    setRevenue(preset.revenue);
    setUnbilledScopePct(preset.unbilledScopePct);
    setSupplyHouseHours(preset.supplyHouseHours);
    setHourlyBillingRate(preset.hourlyBillingRate);
    setCheckTripsPerMonth(preset.checkTripsPerMonth);
  };

  const handleCopySummary = () => {
    const text = `=== CONTRACTOR CASH FLOW & LEAKAGE AUDIT ===
Gross Annual Revenue: ${formatCurrency(revenue)}
Estimated Annual Scope Creep Loss: ${formatCurrency(calculations.annualScopeLoss)}
Unbilled Parts / Supply Runs Loss: ${formatCurrency(calculations.annualSupplyHouseLoss)}
Paper Check Pickups & Drive Cost: ${formatCurrency(calculations.annualCheckChasingLoss)}
Cashflow Float & Late Invoice Cost: ${formatCurrency(calculations.annualCashFlowCost)}
---------------------------------------------
TOTAL ANNUAL PROFIT LEAKAGE: ${formatCurrency(calculations.totalAnnualLeakage)}/year
RECOVERABLE WITH LET'S GET QUOTED: ${formatCurrency(calculations.recoverableWithLGQ)}/year
Generated via https://letsgetquoted.com/tools/leakage-calculator`;

    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'Contractor Cash Flow & Profit Leakage Audit Calculator',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Any',
    offers: {
      '@type': 'Offer',
      price: '0.00',
      priceCurrency: 'USD',
    },
  };

  return (
    <main className={styles.page} id="main-content">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <div className={styles.heroEyebrow}>
            <span>💸</span> Free Contractor Financial Diagnostic
          </div>
          <h1 className={styles.heroTitle}>
            Contractor Cash Flow & <em>Profit Leakage</em> Audit.
          </h1>
          <p className={styles.heroSubtitle}>
            Unbilled change orders, supply house traffic, and chasing paper checks drain thousands from your bottom line every year. See exactly how much you can reclaim.
          </p>
        </div>
      </section>

      <section className={styles.calculatorSection}>
        {/* Print-Only Executive Report Sheet */}
        <div className={styles.printOnlyReport}>
          <div className={styles.printReportHeader}>
            <div>
              <h1 className={styles.printReportTitle}>Contractor Cash Flow & Profit Leakage Audit</h1>
              <div className={styles.printReportSub}>
                Executive Financial Diagnostic &amp; Profit Recovery Analysis
              </div>
            </div>
            <div className={styles.printMetaCard}>
              <div className={styles.printDocBadge}>AUDIT REPORT</div>
              <div className={styles.printMetaGrid}>
                <div className={styles.printMetaRow}>
                  <span className={styles.printMetaKey}>REF #:</span>
                  <span className={styles.printMetaVal}>AUD-2026-LEAK</span>
                </div>
                <div className={styles.printMetaRow}>
                  <span className={styles.printMetaKey}>DATE:</span>
                  <span className={styles.printMetaVal}>Aug 27, 2026</span>
                </div>
              </div>
            </div>
          </div>

          {/* Executive KPI Summary */}
          <div className={styles.printSummaryGrid}>
            <div className={styles.printLeakageBox}>
              <span className={styles.printBoxLabel}>🚨 TOTAL ANNUAL PROFIT LEAKAGE</span>
              <strong className={styles.printBoxValDanger}>{formatCurrency(calculations.totalAnnualLeakage)} / yr</strong>
              <span className={styles.printBoxSub}>Drained across unbilled labor, scope creep, and paper check collection</span>
            </div>
            <div className={styles.printRecoveryBox}>
              <span className={styles.printBoxLabel}>💰 RECOVERABLE WITH LET’S GET QUOTED</span>
              <strong className={styles.printBoxValSuccess}>+{formatCurrency(calculations.recoverableWithLGQ)} / yr</strong>
              <span className={styles.printBoxSub}>Reclaimed via automated deposits, 1-tap change orders &amp; mobile pay</span>
            </div>
          </div>

          {/* Baseline Operating Profile */}
          <div className={styles.printSectionBlock}>
            <h3 className={styles.printBlockTitle}>I. BASELINE OPERATIONAL PROFILE</h3>
            <table className={styles.printDataTable}>
              <thead>
                <tr>
                  <th>Operational Parameter</th>
                  <th style={{ textAlign: 'right' }}>Baseline Value</th>
                  <th style={{ textAlign: 'right' }}>Annualized Metric</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Annual Gross Revenue</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatCurrency(revenue)}</td>
                  <td style={{ textAlign: 'right', color: '#64748b' }}>100% Volume</td>
                </tr>
                <tr>
                  <td>Unbilled Scope Creep / Extras Rate</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{unbilledScopePct}% of projects</td>
                  <td style={{ textAlign: 'right', color: '#b91c1c', fontWeight: 700 }}>-{formatCurrency(calculations.annualScopeLoss)}/yr</td>
                </tr>
                <tr>
                  <td>Unbilled Supply House &amp; Parts Runs</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{supplyHouseHours} hrs / week</td>
                  <td style={{ textAlign: 'right', color: '#b91c1c', fontWeight: 700 }}>-{formatCurrency(calculations.annualSupplyHouseLoss)}/yr</td>
                </tr>
                <tr>
                  <td>Target Hourly Labor Billing Rate</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>${hourlyBillingRate} / hour</td>
                  <td style={{ textAlign: 'right', color: '#64748b' }}>50 Working Weeks</td>
                </tr>
                <tr>
                  <td>In-Person Paper Check Pickup Trips</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{checkTripsPerMonth} trips / month</td>
                  <td style={{ textAlign: 'right', color: '#b91c1c', fontWeight: 700 }}>-{formatCurrency(calculations.annualCheckChasingLoss)}/yr</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Itemized Loss Breakdown */}
          <div className={styles.printSectionBlock}>
            <h3 className={styles.printBlockTitle}>II. ITEMIZED PROFIT LEAKAGE ANALYSIS</h3>
            <table className={styles.printDataTable}>
              <thead>
                <tr>
                  <th style={{ width: '50%' }}>Leakage Category</th>
                  <th style={{ width: '30%' }}>Root Cause</th>
                  <th style={{ width: '20%', textAlign: 'right' }}>Annual Loss</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>Unbilled Scope Creep &amp; Modifications</strong></td>
                  <td>Unsigned verbal requests, framing/fixture tweaks</td>
                  <td style={{ textAlign: 'right', fontWeight: 800, color: '#0f172a' }}>{formatCurrency(calculations.annualScopeLoss)}</td>
                </tr>
                <tr>
                  <td><strong>Supply House Traffic &amp; Travel</strong></td>
                  <td>Unbilled windshield hours &amp; technician downtime</td>
                  <td style={{ textAlign: 'right', fontWeight: 800, color: '#0f172a' }}>{formatCurrency(calculations.annualSupplyHouseLoss)}</td>
                </tr>
                <tr>
                  <td><strong>Paper Check Chasing &amp; Deposit Drives</strong></td>
                  <td>Vehicle gas, return trips, delayed deposit clearance</td>
                  <td style={{ textAlign: 'right', fontWeight: 800, color: '#0f172a' }}>{formatCurrency(calculations.annualCheckChasingLoss)}</td>
                </tr>
                <tr>
                  <td><strong>Net-30 Cash Flow Float &amp; Delayed Invoicing</strong></td>
                  <td>Carrying material expenses before final settlement</td>
                  <td style={{ textAlign: 'right', fontWeight: 800, color: '#0f172a' }}>{formatCurrency(calculations.annualCashFlowCost)}</td>
                </tr>
                <tr style={{ background: '#f8fafc', borderTop: '2px solid #0f172a' }}>
                  <td><strong>TOTAL ANNUAL PROFIT EROSION</strong></td>
                  <td><strong>Combined Bottom-Line Impact</strong></td>
                  <td style={{ textAlign: 'right', fontWeight: 900, fontSize: 13, color: '#b91c1c' }}>{formatCurrency(calculations.totalAnnualLeakage)}/yr</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Strategic Action Plan */}
          <div className={styles.printSectionBlock}>
            <h3 className={styles.printBlockTitle}>III. STRATEGIC REVENUE RECOVERY PLAN</h3>
            <div className={styles.printActionGrid}>
              <div className={styles.printActionItem}>
                <strong>1. 1-Tap Digital Change Orders:</strong> Require homeowner digital signature before performing extra work. Captures 100% of out-of-scope labor.
              </div>
              <div className={styles.printActionItem}>
                <strong>2. Automated Upfront Deposits:</strong> Lock in 30%–50% materials deposit directly via Apple Pay/credit card before crew scheduling.
              </div>
              <div className={styles.printActionItem}>
                <strong>3. Instant Text-to-Pay Settlement:</strong> Text signable invoices upon final walkthrough to eliminate paper check pickup drives and 30-day float.
              </div>
            </div>
          </div>

          {/* Footer & Signature */}
          <div className={styles.printReportFooter}>
            <div>✓ Prepared via Let’s Get Quoted • Financial Diagnostic Suite</div>
            <div>https://letsgetquoted.com/tools/leakage-calculator</div>
          </div>
        </div>

        {/* Interactive Screen View */}
        <div className={`${styles.calcGrid} ${styles.screenOnly}`}>
          {/* Controls Column */}
          <div className={styles.controlsCol}>
            {/* Presets */}
            <div className={styles.card}>
              <span className={styles.label}>Quick Presets</span>
              <div className={styles.presetGrid}>
                {PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handlePreset(p)}
                    className={styles.presetBtn}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Input Sliders */}
            <div className={styles.card}>
              {/* Gross Revenue */}
              <div className={styles.inputGroup}>
                <div className={styles.inputHeader}>
                  <label htmlFor="leak-revenue" className={styles.label}>
                    Annual Gross Revenue
                  </label>
                  <span className={styles.valueDisplay}>{formatCurrency(revenue)}</span>
                </div>
                <input
                  id="leak-revenue"
                  type="range"
                  min={80000}
                  max={1500000}
                  step={10000}
                  value={revenue}
                  onChange={(e) => setRevenue(Number(e.target.value))}
                  className={styles.slider}
                />
              </div>

              {/* Unbilled Scope Creep */}
              <div className={styles.inputGroup}>
                <div className={styles.inputHeader}>
                  <label htmlFor="leak-scope" className={styles.label}>
                    Unbilled Scope Creep &amp; Extra Materials
                  </label>
                  <span className={styles.valueDisplay}>{unbilledScopePct}% of jobs</span>
                </div>
                <input
                  id="leak-scope"
                  type="range"
                  min={1}
                  max={15}
                  step={1}
                  value={unbilledScopePct}
                  onChange={(e) => setUnbilledScopePct(Number(e.target.value))}
                  className={styles.slider}
                />
                <span className={styles.microHint}>
                  Extra fixtures, framing tweaks, or extra coats done without a formal signed change order.
                </span>
              </div>

              {/* Supply House Hours */}
              <div className={styles.inputGroup}>
                <div className={styles.inputHeader}>
                  <label htmlFor="leak-supply" className={styles.label}>
                    Unbilled Supply House / Parts Runs
                  </label>
                  <span className={styles.valueDisplay}>{supplyHouseHours} hrs/week</span>
                </div>
                <input
                  id="leak-supply"
                  type="range"
                  min={1}
                  max={12}
                  step={1}
                  value={supplyHouseHours}
                  onChange={(e) => setSupplyHouseHours(Number(e.target.value))}
                  className={styles.slider}
                />
              </div>

              {/* Hourly Billing Rate */}
              <div className={styles.inputGroup}>
                <div className={styles.inputHeader}>
                  <label htmlFor="leak-rate" className={styles.label}>
                    Target Hourly Labor Rate
                  </label>
                  <span className={styles.valueDisplay}>${hourlyBillingRate}/hr</span>
                </div>
                <input
                  id="leak-rate"
                  type="range"
                  min={45}
                  max={200}
                  step={5}
                  value={hourlyBillingRate}
                  onChange={(e) => setHourlyBillingRate(Number(e.target.value))}
                  className={styles.slider}
                />
              </div>

              {/* Check Chasing Trips */}
              <div className={styles.inputGroup}>
                <div className={styles.inputHeader}>
                  <label htmlFor="leak-trips" className={styles.label}>
                    In-Person Check Collection Trips
                  </label>
                  <span className={styles.valueDisplay}>{checkTripsPerMonth} trips/month</span>
                </div>
                <input
                  id="leak-trips"
                  type="range"
                  min={0}
                  max={20}
                  step={1}
                  value={checkTripsPerMonth}
                  onChange={(e) => setCheckTripsPerMonth(Number(e.target.value))}
                  className={styles.slider}
                />
                <span className={styles.microHint}>
                  Driving back to finished jobsites to pick up paper checks or deposits.
                </span>
              </div>
            </div>
          </div>

          {/* Results Output Column */}
          <div className={styles.resultsCol}>
            <div className={styles.resultsCard}>
              {/* Primary Output */}
              <div className={styles.primaryMetric}>
                <span className={styles.metricLabel} style={{ color: '#ff6a24' }}>
                  🚨 Estimated Annual Profit Leakage
                </span>
                <span className={styles.metricBig} style={{ color: '#ff6a24' }}>
                  {formatCurrency(calculations.totalAnnualLeakage)}
                </span>
                <span className={styles.metricSub}>
                  Slipping away every year in unbilled labor, scope creep, and payment friction
                </span>
              </div>

              {/* Recovery Callout */}
              <div
                style={{
                  background: 'rgba(80, 227, 189, 0.08)',
                  border: '1px solid rgba(80, 227, 189, 0.25)',
                  borderRadius: 12,
                  padding: 16,
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: '#50e3bd' }}>
                  💰 Recoverable Profit With Let’s Get Quoted
                </div>
                <div style={{ fontSize: 26, fontWeight: 900, color: '#f5f0e7', marginTop: 4 }}>
                  +{formatCurrency(calculations.recoverableWithLGQ)}/yr
                </div>
                <div style={{ fontSize: 12, color: '#8fa6b5', marginTop: 4 }}>
                  Upfront deposit locking, 1-tap change orders, and instant Apple Pay checkout plug the leaks.
                </div>
              </div>

              {/* Itemized Leakage Breakdown */}
              <div className={styles.summaryList}>
                <div className={styles.summaryItem}>
                  <span>Unbilled Scope Creep</span>
                  <span className={styles.summaryValue}>{formatCurrency(calculations.annualScopeLoss)}/yr</span>
                </div>
                <div className={styles.summaryItem}>
                  <span>Unbilled Supply House Runs</span>
                  <span className={styles.summaryValue}>{formatCurrency(calculations.annualSupplyHouseLoss)}/yr</span>
                </div>
                <div className={styles.summaryItem}>
                  <span>Paper Check Chasing &amp; Trips</span>
                  <span className={styles.summaryValue}>{formatCurrency(calculations.annualCheckChasingLoss)}/yr</span>
                </div>
                <div className={styles.summaryItem}>
                  <span>Cash Flow Float &amp; Delayed Invoicing</span>
                  <span className={styles.summaryValue}>{formatCurrency(calculations.annualCashFlowCost)}/yr</span>
                </div>
              </div>

              {/* Utility Actions */}
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className={styles.toolActionBtn}
                  style={{ flex: 1, padding: 12 }}
                >
                  🖨️ Print / Save PDF
                </button>
                <button
                  type="button"
                  onClick={handleCopySummary}
                  className={styles.toolActionBtn}
                  style={{ flex: 1, padding: 12 }}
                >
                  {copied ? '✓ Report Copied!' : '📋 Copy Report'}
                </button>
              </div>

              {/* Signup Link */}
              <div className={styles.signupBox}>
                <a href={APP_SIGNUP_URL} className={styles.primaryCta}>
                  Plug The Leaks on Flex ($0/mo) &rarr;
                </a>
                <div className={styles.microHint} style={{ textAlign: 'center', marginTop: 6 }}>
                  No monthly fee · Automated deposits &amp; digital change orders included
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Cross-Link Hub */}
      <section style={{ maxWidth: 1000, margin: '40px auto 80px', padding: '0 16px', textAlign: 'center' }}>
        <h3 style={{ fontSize: 20, color: '#f5f0e7', marginBottom: 12 }}>Explore More Free Contractor Tools</h3>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 16, flexWrap: 'wrap' }}>
          <Link href="/tools/hourly-rate-calculator" className={styles.toolActionBtn}>
            🧮 Contractor True Hourly Rate Calculator &rarr;
          </Link>
          <Link href="/tools/estimate-generator" className={styles.toolActionBtn}>
            📄 Free Contractor Estimate Generator &rarr;
          </Link>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
