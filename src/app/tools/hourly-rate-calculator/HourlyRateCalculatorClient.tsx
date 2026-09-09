'use client';

import { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import SiteFooter from '@/components/site-footer';
import { APP_SIGNUP_URL } from '@/components/marketing/links';
import styles from '../tools.module.css';

type Preset = {
  name: string;
  takeHomePay: number;
  overhead: number;
  unbillableHours: number;
  helpersCount: number;
  helperWage: number;
  profitMargin: number;
};

const PRESETS: Preset[] = [
  {
    name: 'Solo Plumber / Electrician',
    takeHomePay: 105000,
    overhead: 24000,
    unbillableHours: 14,
    helpersCount: 0,
    helperWage: 0,
    profitMargin: 20,
  },
  {
    name: '2-Truck HVAC / Tech',
    takeHomePay: 135000,
    overhead: 42000,
    unbillableHours: 12,
    helpersCount: 1,
    helperWage: 26,
    profitMargin: 22,
  },
  {
    name: 'Roofing Crew (3-Man)',
    takeHomePay: 160000,
    overhead: 60000,
    unbillableHours: 10,
    helpersCount: 2,
    helperWage: 24,
    profitMargin: 25,
  },
  {
    name: 'Solo Handyman / Painter',
    takeHomePay: 78000,
    overhead: 14000,
    unbillableHours: 12,
    helpersCount: 0,
    helperWage: 0,
    profitMargin: 18,
  },
];

const STORAGE_KEY = 'lgq_hourly_rate_calc_v1';

function formatCurrency(num: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(num);
}

export default function HourlyRateCalculatorPage() {
  const [takeHomePay, setTakeHomePay] = useState<number>(100000);
  const [overhead, setOverhead] = useState<number>(25000);
  const [weeksPerYear, setWeeksPerYear] = useState<number>(48);
  const [totalHoursPerWeek, setTotalHoursPerWeek] = useState<number>(40);
  const [unbillableHours, setUnbillableHours] = useState<number>(14);
  const [helpersCount, setHelpersCount] = useState<number>(0);
  const [helperWage, setHelperWage] = useState<number>(24);
  const [profitMargin, setProfitMargin] = useState<number>(20);
  const [copied, setCopied] = useState(false);
  const [emailAddress, setEmailAddress] = useState('');
  const [emailSending, setEmailSending] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  // Restore draft from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.takeHomePay === 'number') setTakeHomePay(parsed.takeHomePay);
        if (typeof parsed.overhead === 'number') setOverhead(parsed.overhead);
        if (typeof parsed.weeksPerYear === 'number') setWeeksPerYear(parsed.weeksPerYear);
        if (typeof parsed.totalHoursPerWeek === 'number') setTotalHoursPerWeek(parsed.totalHoursPerWeek);
        if (typeof parsed.unbillableHours === 'number') setUnbillableHours(parsed.unbillableHours);
        if (typeof parsed.helpersCount === 'number') setHelpersCount(parsed.helpersCount);
        if (typeof parsed.helperWage === 'number') setHelperWage(parsed.helperWage);
        if (typeof parsed.profitMargin === 'number') setProfitMargin(parsed.profitMargin);
      }
    } catch {
      // quiet fallback
    }
  }, []);

  // Save changes to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          takeHomePay,
          overhead,
          weeksPerYear,
          totalHoursPerWeek,
          unbillableHours,
          helpersCount,
          helperWage,
          profitMargin,
        }),
      );
    } catch {
      // quiet fallback
    }
  }, [
    takeHomePay,
    overhead,
    weeksPerYear,
    totalHoursPerWeek,
    unbillableHours,
    helpersCount,
    helperWage,
    profitMargin,
  ]);

  const applyPreset = (preset: Preset) => {
    setTakeHomePay(preset.takeHomePay);
    setOverhead(preset.overhead);
    setUnbillableHours(preset.unbillableHours);
    setHelpersCount(preset.helpersCount);
    setHelperWage(preset.helperWage);
    setProfitMargin(preset.profitMargin);
  };

  const results = useMemo(() => {
    const billableHoursPerWeek = Math.max(5, totalHoursPerWeek - unbillableHours);
    const annualBillableHours = billableHoursPerWeek * weeksPerYear;

    // Helper annual wages with 15% estimated payroll tax & burden
    const helperAnnualCost = helpersCount * (helperWage * totalHoursPerWeek * weeksPerYear * 1.15);

    // Total required annual operating cost
    const totalOperatingCost = takeHomePay + overhead + helperAnnualCost;

    // Breakeven rate (just covers costs with 0% margin)
    const breakevenHourlyRate = totalOperatingCost / Math.max(100, annualBillableHours);

    // Required billable hourly rate with profit margin
    const marginMultiplier = 1 - profitMargin / 100;
    const requiredHourlyRate = marginMultiplier > 0 ? breakevenHourlyRate / marginMultiplier : breakevenHourlyRate;

    // Day rate (assuming 8 billable equivalent hours)
    const targetDayRate = requiredHourlyRate * 8;

    // Annual gross revenue target
    const grossRevenueTarget = requiredHourlyRate * annualBillableHours;

    // Distribution percentages
    const laborPercent = ((takeHomePay + helperAnnualCost) / grossRevenueTarget) * 100;
    const overheadPercent = (overhead / grossRevenueTarget) * 100;
    const profitPercent = profitMargin;

    return {
      billableHoursPerWeek,
      annualBillableHours,
      breakevenHourlyRate,
      requiredHourlyRate,
      targetDayRate,
      grossRevenueTarget,
      laborPercent: Math.max(0, Math.min(100, laborPercent)),
      overheadPercent: Math.max(0, Math.min(100, overheadPercent)),
      profitPercent: Math.max(0, Math.min(100, profitPercent)),
    };
  }, [
    takeHomePay,
    overhead,
    weeksPerYear,
    totalHoursPerWeek,
    unbillableHours,
    helpersCount,
    helperWage,
    profitMargin,
  ]);

  const handleCopyReport = () => {
    const text = `=== CONTRACTOR HOURLY RATE & MARGIN BENCHMARK ===
Target Take-Home Pay: ${formatCurrency(takeHomePay)}/yr
Annual Operating Overhead: ${formatCurrency(overhead)}/yr
Weekly Unbillable Hours: ${unbillableHours} hrs/week
Target Profit Margin: ${profitMargin}%
--------------------------------------------------
REQUIRED BILLABLE RATE: ${formatCurrency(results.requiredHourlyRate)}/hr
TARGET 8-HOUR DAY RATE: ${formatCurrency(results.targetDayRate)}/day
BREAKEVEN RATE (0% Margin): ${formatCurrency(results.breakevenHourlyRate)}/hr
ANNUAL GROSS TARGET: ${formatCurrency(results.grossRevenueTarget)}/year
Generated via https://letsgetquoted.com/tools/hourly-rate-calculator`;

    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  const handleEmailReport = async () => {
    if (!emailAddress || !emailAddress.includes('@')) return;
    try {
      setEmailSending(true);
      await fetch('/api/tools/email-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: emailAddress,
          toolName: 'True Hourly Rate & Margin Benchmark',
          summary: `Required: ${formatCurrency(results.requiredHourlyRate)}/hr, Day Rate: ${formatCurrency(results.targetDayRate)}, Breakeven: ${formatCurrency(results.breakevenHourlyRate)}/hr, Gross: ${formatCurrency(results.grossRevenueTarget)}/yr`,
          calculations: results,
        }),
      }).catch(() => null);
      setEmailSent(true);
    } finally {
      setEmailSending(false);
    }
  };

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Contractor True Hourly Rate & Profit Margin Calculator',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    offers: {
      '@type': 'Offer',
      price: '0.00',
      priceCurrency: 'USD',
    },
    description:
      'Free contractor rate calculator that accounts for unbillable drive time, overhead, helper wages, and target profit margins.',
  };

  return (
    <div className={styles.page}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <main id="main-content">
        <section className={styles.hero}>
          <span className={styles.kicker}>Free Contractor Tool</span>
          <h1 className={styles.headline}>
            Contractor True Hourly Rate &amp; <em>Margin Calculator</em>
          </h1>
          <p className={styles.subhead}>
            Most contractors undercharge because they divide overhead by 40 billable hours. In reality, windshield time
            and bidding leave only 20–26 billable hours a week. Calculate your true required rate below.
          </p>
        </section>

        <section className={styles.container}>
          <div className={styles.calcCard}>
            {/* Quick Presets */}
            <div className={styles.presetsRow}>
              <span className={styles.presetsLabel}>Quick Presets:</span>
              {PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => applyPreset(preset)}
                  className={styles.presetBtn}
                >
                  {preset.name}
                </button>
              ))}
            </div>

            <div className={styles.calcGrid}>
              {/* Inputs Form */}
              <div className={styles.formSection}>
                {/* Desired Take Home */}
                <div className={styles.inputGroup}>
                  <div className={styles.inputHeader}>
                    <label htmlFor="take-home" className={styles.inputLabel}>
                      Target Annual Owner Pay / Take-Home:
                    </label>
                    <span className={styles.inputValueDisplay}>{formatCurrency(takeHomePay)}</span>
                  </div>
                  <input
                    id="take-home"
                    type="range"
                    min={40000}
                    max={250000}
                    step={5000}
                    value={takeHomePay}
                    onChange={(e) => setTakeHomePay(Number(e.target.value))}
                    className={styles.slider}
                    aria-label="Target Annual Owner Pay slider"
                  />
                  <div className={styles.stepperRow}>
                    <button
                      type="button"
                      onClick={() => setTakeHomePay((p) => Math.max(40000, p - 5000))}
                      className={styles.stepperBtn}
                      aria-label="Decrease take-home pay by 5k"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min={40000}
                      max={250000}
                      step={5000}
                      value={takeHomePay}
                      onChange={(e) => setTakeHomePay(Math.max(0, Number(e.target.value) || 0))}
                      className={styles.stepperInput}
                      aria-label="Target Annual Owner Pay numeric entry"
                    />
                    <button
                      type="button"
                      onClick={() => setTakeHomePay((p) => Math.min(250000, p + 5000))}
                      className={styles.stepperBtn}
                      aria-label="Increase take-home pay by 5k"
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* Annual Overhead */}
                <div className={styles.inputGroup}>
                  <div className={styles.inputHeader}>
                    <label htmlFor="overhead" className={styles.inputLabel}>
                      Annual Overhead (Van, Insurance, Gas, Tools, Software):
                    </label>
                    <span className={styles.inputValueDisplay}>{formatCurrency(overhead)}</span>
                  </div>
                  <input
                    id="overhead"
                    type="range"
                    min={5000}
                    max={100000}
                    step={2500}
                    value={overhead}
                    onChange={(e) => setOverhead(Number(e.target.value))}
                    className={styles.slider}
                    aria-label="Annual Overhead slider"
                  />
                  <div className={styles.stepperRow}>
                    <button
                      type="button"
                      onClick={() => setOverhead((o) => Math.max(5000, o - 2500))}
                      className={styles.stepperBtn}
                      aria-label="Decrease overhead by 2.5k"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min={5000}
                      max={100000}
                      step={2500}
                      value={overhead}
                      onChange={(e) => setOverhead(Math.max(0, Number(e.target.value) || 0))}
                      className={styles.stepperInput}
                      aria-label="Annual Overhead numeric entry"
                    />
                    <button
                      type="button"
                      onClick={() => setOverhead((o) => Math.min(100000, o + 2500))}
                      className={styles.stepperBtn}
                      aria-label="Increase overhead by 2.5k"
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* Working Weeks & Hours */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div className={styles.inputGroup}>
                    <div className={styles.inputHeader}>
                      <label htmlFor="total-hours" className={styles.inputLabel}>
                        Total Work Hrs / Wk:
                      </label>
                      <span className={styles.inputValueDisplay}>{totalHoursPerWeek} hrs</span>
                    </div>
                    <input
                      id="total-hours"
                      type="range"
                      min={30}
                      max={60}
                      step={1}
                      value={totalHoursPerWeek}
                      onChange={(e) => setTotalHoursPerWeek(Number(e.target.value))}
                      className={styles.slider}
                      aria-label="Total work hours slider"
                    />
                    <div className={styles.stepperRow}>
                      <button
                        type="button"
                        onClick={() => setTotalHoursPerWeek((h) => Math.max(30, h - 1))}
                        className={styles.stepperBtn}
                        aria-label="Decrease total hours per week"
                      >
                        −
                      </button>
                      <input
                        type="number"
                        min={30}
                        max={60}
                        step={1}
                        value={totalHoursPerWeek}
                        onChange={(e) => setTotalHoursPerWeek(Math.min(60, Math.max(30, Number(e.target.value) || 30)))}
                        className={styles.stepperInput}
                        aria-label="Total work hours entry"
                      />
                      <button
                        type="button"
                        onClick={() => setTotalHoursPerWeek((h) => Math.min(60, h + 1))}
                        className={styles.stepperBtn}
                        aria-label="Increase total hours per week"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <div className={styles.inputGroup}>
                    <div className={styles.inputHeader}>
                      <label htmlFor="weeks-year" className={styles.inputLabel}>
                        Work Weeks / Yr:
                      </label>
                      <span className={styles.inputValueDisplay}>{weeksPerYear} wks</span>
                    </div>
                    <input
                      id="weeks-year"
                      type="range"
                      min={40}
                      max={52}
                      step={1}
                      value={weeksPerYear}
                      onChange={(e) => setWeeksPerYear(Number(e.target.value))}
                      className={styles.slider}
                      aria-label="Work weeks per year slider"
                    />
                    <div className={styles.stepperRow}>
                      <button
                        type="button"
                        onClick={() => setWeeksPerYear((w) => Math.max(40, w - 1))}
                        className={styles.stepperBtn}
                        aria-label="Decrease weeks per year"
                      >
                        −
                      </button>
                      <input
                        type="number"
                        min={40}
                        max={52}
                        step={1}
                        value={weeksPerYear}
                        onChange={(e) => setWeeksPerYear(Math.min(52, Math.max(40, Number(e.target.value) || 40)))}
                        className={styles.stepperInput}
                        aria-label="Work weeks per year entry"
                      />
                      <button
                        type="button"
                        onClick={() => setWeeksPerYear((w) => Math.min(52, w + 1))}
                        className={styles.stepperBtn}
                        aria-label="Increase weeks per year"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>

                {/* Unbillable Hours per Week */}
                <div className={styles.inputGroup}>
                  <div className={styles.inputHeader}>
                    <label htmlFor="unbillable" className={styles.inputLabel}>
                      Unbillable Hours / Week (Windshield, Bids, Supply Runs):
                    </label>
                    <span className={styles.inputValueDisplay}>{unbillableHours} hrs/wk</span>
                  </div>
                  <input
                    id="unbillable"
                    type="range"
                    min={0}
                    max={25}
                    step={1}
                    value={unbillableHours}
                    onChange={(e) => setUnbillableHours(Number(e.target.value))}
                    className={styles.slider}
                    aria-label="Unbillable hours slider"
                  />
                  <div className={styles.stepperRow}>
                    <button
                      type="button"
                      onClick={() => setUnbillableHours((u) => Math.max(0, u - 1))}
                      className={styles.stepperBtn}
                      aria-label="Decrease unbillable hours"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min={0}
                      max={25}
                      step={1}
                      value={unbillableHours}
                      onChange={(e) => setUnbillableHours(Math.min(25, Math.max(0, Number(e.target.value) || 0)))}
                      className={styles.stepperInput}
                      aria-label="Unbillable hours entry"
                    />
                    <button
                      type="button"
                      onClick={() => setUnbillableHours((u) => Math.min(25, u + 1))}
                      className={styles.stepperBtn}
                      aria-label="Increase unbillable hours"
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* Profit Margin */}
                <div className={styles.inputGroup}>
                  <div className={styles.inputHeader}>
                    <label htmlFor="profit" className={styles.inputLabel}>
                      Target Net Profit Margin:
                    </label>
                    <span className={styles.inputValueDisplay}>{profitMargin}%</span>
                  </div>
                  <input
                    id="profit"
                    type="range"
                    min={5}
                    max={40}
                    step={1}
                    value={profitMargin}
                    onChange={(e) => setProfitMargin(Number(e.target.value))}
                    className={styles.slider}
                    aria-label="Target profit margin slider"
                  />
                  <div className={styles.stepperRow}>
                    <button
                      type="button"
                      onClick={() => setProfitMargin((m) => Math.max(5, m - 1))}
                      className={styles.stepperBtn}
                      aria-label="Decrease profit margin"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min={5}
                      max={40}
                      step={1}
                      value={profitMargin}
                      onChange={(e) => setProfitMargin(Math.min(40, Math.max(5, Number(e.target.value) || 5)))}
                      className={styles.stepperInput}
                      aria-label="Profit margin entry"
                    />
                    <button
                      type="button"
                      onClick={() => setProfitMargin((m) => Math.min(40, m + 1))}
                      className={styles.stepperBtn}
                      aria-label="Increase profit margin"
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* Helpers & Crew */}
                <div className={styles.inputGroup}>
                  <div className={styles.inputHeader}>
                    <label htmlFor="helpers" className={styles.inputLabel}>
                      Additional Helpers / Apprentices:
                    </label>
                    <span className={styles.inputValueDisplay}>
                      {helpersCount} {helpersCount === 1 ? 'Helper' : 'Helpers'}
                    </span>
                  </div>
                  <input
                    id="helpers"
                    type="range"
                    min={0}
                    max={4}
                    step={1}
                    value={helpersCount}
                    onChange={(e) => setHelpersCount(Number(e.target.value))}
                    className={styles.slider}
                    aria-label="Additional helpers slider"
                  />
                  <div className={styles.stepperRow}>
                    <button
                      type="button"
                      onClick={() => setHelpersCount((c) => Math.max(0, c - 1))}
                      className={styles.stepperBtn}
                      aria-label="Decrease helpers count"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min={0}
                      max={4}
                      step={1}
                      value={helpersCount}
                      onChange={(e) => setHelpersCount(Math.min(4, Math.max(0, Number(e.target.value) || 0)))}
                      className={styles.stepperInput}
                      aria-label="Helpers count entry"
                    />
                    <button
                      type="button"
                      onClick={() => setHelpersCount((c) => Math.min(4, c + 1))}
                      className={styles.stepperBtn}
                      aria-label="Increase helpers count"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>

              {/* Outputs Box */}
              <div className={styles.resultsBox}>
                <div className={styles.rateDisplay}>
                  <span className={styles.rateLabel}>Required Billable Rate</span>
                  <div className={styles.rateNumber}>
                    {formatCurrency(results.requiredHourlyRate)}
                    <span className={styles.ratePer}> / hr</span>
                  </div>
                </div>

                <div className={styles.metricRows}>
                  <div className={styles.metricCard}>
                    <span className={styles.metricCardLabel}>Breakeven Rate (0% Profit)</span>
                    <span className={styles.metricCardVal}>{formatCurrency(results.breakevenHourlyRate)}/hr</span>
                  </div>
                  <div className={styles.metricCard}>
                    <span className={styles.metricCardLabel}>Target 8-Hour Day Rate</span>
                    <span className={styles.metricCardVal}>{formatCurrency(results.targetDayRate)}</span>
                  </div>
                  <div className={styles.metricCard}>
                    <span className={styles.metricCardLabel}>Actual Billable Hours</span>
                    <span className={styles.metricCardVal}>
                      {results.billableHoursPerWeek} hrs/wk ({results.annualBillableHours} yr)
                    </span>
                  </div>
                  <div className={styles.metricCard}>
                    <span className={styles.metricCardLabel}>Annual Gross Target</span>
                    <span className={styles.metricCardVal}>{formatCurrency(results.grossRevenueTarget)}</span>
                  </div>
                </div>

                {/* Revenue Distribution Bar */}
                <div className={styles.distBarWrapper}>
                  <span className={styles.distBarLabel}>Gross Revenue Distribution:</span>
                  <div className={styles.distBar}>
                    <div
                      className={styles.distLabor}
                      style={{ width: `${results.laborPercent}%` }}
                      title="Owner & Helper Labor"
                    />
                    <div
                      className={styles.distOverhead}
                      style={{ width: `${results.overheadPercent}%` }}
                      title="Overhead"
                    />
                    <div
                      className={styles.distProfit}
                      style={{ width: `${results.profitPercent}%` }}
                      title="Net Profit"
                    />
                  </div>
                  <div className={styles.distLegend}>
                    <div className={styles.distLegendItem}>
                      <span className={`${styles.distDot} ${styles.dotLabor}`} />
                      <span>Labor ({Math.round(results.laborPercent)}%)</span>
                    </div>
                    <div className={styles.distLegendItem}>
                      <span className={`${styles.distDot} ${styles.dotOverhead}`} />
                      <span>Overhead ({Math.round(results.overheadPercent)}%)</span>
                    </div>
                    <div className={styles.distLegendItem}>
                      <span className={`${styles.distDot} ${styles.dotProfit}`} />
                      <span>Profit ({Math.round(results.profitPercent)}%)</span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleCopyReport}
                  style={{
                    width: '100%',
                    padding: '0.65rem 1rem',
                    marginBottom: '1rem',
                    background: copied ? '#15803d' : '#27272a',
                    color: '#fff',
                    border: '1px solid #3f3f46',
                    borderRadius: '8px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                >
                  {copied ? '✓ Rate Breakdown Copied to Clipboard!' : '📋 Copy Rate & Margin Breakdown'}
                </button>

                {/* Optional Un-gated Email Audit Report */}
                <div className={styles.emailReportBox} style={{ marginBottom: '1.25rem' }}>
                  <label htmlFor="hourly-email" className={styles.emailReportLabel}>
                    <span>📧</span> Email full rate benchmark to yourself:
                  </label>
                  <div className={styles.emailReportRow}>
                    <input
                      id="hourly-email"
                      type="email"
                      value={emailAddress}
                      onChange={(e) => setEmailAddress(e.target.value)}
                      placeholder="contractor@example.com"
                      className={styles.emailReportInput}
                      aria-label="Email address for rate benchmark report"
                    />
                    <button
                      type="button"
                      onClick={handleEmailReport}
                      disabled={emailSending || !emailAddress}
                      className={styles.emailReportBtn}
                    >
                      {emailSending ? 'Sending...' : emailSent ? '✓ Sent!' : 'Send Report'}
                    </button>
                  </div>
                  {emailSent ? (
                    <span className={styles.emailReportSuccess}>
                      ✓ Rate benchmark report summary dispatched to {emailAddress}!
                    </span>
                  ) : null}
                </div>

                {/* Callout to Let's Get Quoted */}
                <div className={styles.calloutCta}>
                  <h3 className={styles.calloutTitle}>Lock In Your Margin on Every Quote</h3>
                  <p className={styles.calloutText}>
                    Send interactive quotes with deposits, payment plans, and zero fixed monthly software fees.
                  </p>
                  <Link href={APP_SIGNUP_URL} className={styles.calloutBtn}>
                    Start Free on Flex ($0/mo) &rarr;
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
