'use client';

import { useState, useMemo, useEffect } from 'react';
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
    icon: '🔨',
    revenue: 350000,
    unbilledScopePct: 6,
    supplyHouseHours: 4,
    hourlyBillingRate: 95,
    checkTripsPerMonth: 6,
  },
  {
    id: 'two-truck-service',
    name: '2-Truck Plumber / Electrician',
    icon: '⚡',
    revenue: 550000,
    unbilledScopePct: 4,
    supplyHouseHours: 6,
    hourlyBillingRate: 125,
    checkTripsPerMonth: 10,
  },
  {
    id: 'roofing-crew',
    name: 'Roofing Contractor (3-Man)',
    icon: '🏠',
    revenue: 850000,
    unbilledScopePct: 5,
    supplyHouseHours: 3,
    hourlyBillingRate: 110,
    checkTripsPerMonth: 8,
  },
  {
    id: 'solo-handyman',
    name: 'Solo Handyman / Painter',
    icon: '🎨',
    revenue: 140000,
    unbilledScopePct: 8,
    supplyHouseHours: 3,
    hourlyBillingRate: 75,
    checkTripsPerMonth: 4,
  },
];

const STORAGE_KEY = 'lgq_leakage_calc_v2';

export default function LeakageCalculatorPage() {
  const [revenue, setRevenue] = useState(350000);
  const [unbilledScopePct, setUnbilledScopePct] = useState(6);
  const [supplyHouseHours, setSupplyHouseHours] = useState(4);
  const [hourlyBillingRate, setHourlyBillingRate] = useState(95);
  const [checkTripsPerMonth, setCheckTripsPerMonth] = useState(6);
  const [activePresetId, setActivePresetId] = useState<string>('solo-remodeler');

  const [downloadingPdf, setDownloadingPdf] = useState(false);
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
        if (typeof parsed.revenue === 'number') setRevenue(parsed.revenue);
        if (typeof parsed.unbilledScopePct === 'number') setUnbilledScopePct(parsed.unbilledScopePct);
        if (typeof parsed.supplyHouseHours === 'number') setSupplyHouseHours(parsed.supplyHouseHours);
        if (typeof parsed.hourlyBillingRate === 'number') setHourlyBillingRate(parsed.hourlyBillingRate);
        if (typeof parsed.checkTripsPerMonth === 'number') setCheckTripsPerMonth(parsed.checkTripsPerMonth);
        if (typeof parsed.activePresetId === 'string') setActivePresetId(parsed.activePresetId);
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
          revenue,
          unbilledScopePct,
          supplyHouseHours,
          hourlyBillingRate,
          checkTripsPerMonth,
          activePresetId,
        }),
      );
    } catch {
      // quiet fallback
    }
  }, [revenue, unbilledScopePct, supplyHouseHours, hourlyBillingRate, checkTripsPerMonth, activePresetId]);

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

    // Percentage of revenue leaked
    const leakagePercentOfGross = revenue > 0 ? (totalAnnualLeakage / revenue) * 100 : 0;

    // Proportional breakdown percentages for distribution bar
    const total = Math.max(1, totalAnnualLeakage);
    const scopePct = (annualScopeLoss / total) * 100;
    const supplyPct = (annualSupplyHouseLoss / total) * 100;
    const checkPct = (annualCheckChasingLoss / total) * 100;
    const floatPct = (annualCashFlowCost / total) * 100;

    return {
      annualScopeLoss,
      annualSupplyHouseLoss,
      annualCheckChasingLoss,
      annualCashFlowCost,
      totalAnnualLeakage,
      recoverableWithLGQ,
      leakagePercentOfGross,
      scopePct,
      supplyPct,
      checkPct,
      floatPct,
    };
  }, [revenue, unbilledScopePct, supplyHouseHours, hourlyBillingRate, checkTripsPerMonth]);

  const handlePreset = (preset: (typeof PRESETS)[number]) => {
    setActivePresetId(preset.id);
    setRevenue(preset.revenue);
    setUnbilledScopePct(preset.unbilledScopePct);
    setSupplyHouseHours(preset.supplyHouseHours);
    setHourlyBillingRate(preset.hourlyBillingRate);
    setCheckTripsPerMonth(preset.checkTripsPerMonth);
  };

  const handleCustomAdjustment = () => {
    setActivePresetId('custom');
  };

  const handleDownloadPdf = async () => {
    try {
      setDownloadingPdf(true);
      const res = await fetch('/api/tools/leakage-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: {
            revenue,
            unbilledScopePct,
            supplyHouseHours,
            hourlyBillingRate,
            checkTripsPerMonth,
            referenceNumber: 'AUD-2026-LEAK',
            reportDate: new Date().toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            }),
          },
          calculations,
        }),
      });

      if (!res.ok) {
        throw new Error('Server error generating PDF');
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Contractor-Profit-Leakage-Audit.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch {
      // Fallback to browser print if server generation fails
      window.print();
    } finally {
      setDownloadingPdf(false);
    }
  };

  const handleCopySummary = () => {
    const text = `=== CONTRACTOR CASH FLOW & PROFIT LEAKAGE AUDIT ===
Gross Annual Revenue: ${formatCurrency(revenue)}
--------------------------------------------------
1. Unbilled Scope Creep & Extra Materials: -${formatCurrency(calculations.annualScopeLoss)}/yr (${unbilledScopePct}% of projects)
2. Supply House Windshield Hours: -${formatCurrency(calculations.annualSupplyHouseLoss)}/yr (${supplyHouseHours} hrs/wk @ $${hourlyBillingRate}/hr)
3. Paper Check Pickups & Drive Costs: -${formatCurrency(calculations.annualCheckChasingLoss)}/yr (${checkTripsPerMonth} trips/mo)
4. Net-30 Float & Delayed Invoicing: -${formatCurrency(calculations.annualCashFlowCost)}/yr
--------------------------------------------------
TOTAL ESTIMATED ANNUAL PROFIT LEAKAGE: ${formatCurrency(calculations.totalAnnualLeakage)} / yr (${calculations.leakagePercentOfGross.toFixed(1)}% of Revenue)
RECOVERABLE WITH LET'S GET QUOTED: +${formatCurrency(calculations.recoverableWithLGQ)} / yr
Audit Report Link: https://letsgetquoted.com/tools/leakage-calculator`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
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
          toolName: 'Profit Leakage & Cash Flow Audit',
          summary: `Gross: ${formatCurrency(revenue)}, Leakage: ${formatCurrency(calculations.totalAnnualLeakage)}/yr (${calculations.leakagePercentOfGross.toFixed(1)}%), Recoverable: ${formatCurrency(calculations.recoverableWithLGQ)}/yr`,
          calculations,
        }),
      }).catch(() => null);
      setEmailSent(true);
    } finally {
      setEmailSending(false);
    }
  };

  const formattedCurrentDate = new Date().toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

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
    description:
      'Free contractor profit leakage calculator that measures bottom-line losses from unbilled scope creep, supply house trips, paper check chasing, and late invoicing float.',
  };

  return (
    <main className={styles.page} id="main-content">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <div className={styles.kicker}>
            <span>💸</span> Free Contractor Financial Diagnostic
          </div>
          <h1 className={styles.headline}>
            Contractor Cash Flow &amp; <em>Profit Leakage</em> Audit.
          </h1>
          <p className={styles.subhead}>
            Unbilled change orders, supply house traffic, and chasing paper checks drain thousands from your bottom line every year.
            Calculate your exact profit erosion and see how much you can reclaim.
          </p>
        </div>
      </section>

      <section className={styles.calculatorSection}>
        {/* ==========================================================================
            Print-Only Executive Report Sheet (Rendered during window.print() / PDF export)
            ========================================================================== */}
        <div className={styles.printOnlyReport}>
          <div className={styles.printReportHeader}>
            <div>
              <h1 className={styles.printReportTitle}>Contractor Cash Flow &amp; Profit Leakage Audit</h1>
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
                  <span className={styles.printMetaVal}>{formattedCurrentDate}</span>
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
            <div className={styles.printBlockTitle}>I. BASELINE OPERATIONAL PROFILE</div>
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
                  <td style={{ textAlign: 'right', color: '#64748b' }}>100% Volume Base</td>
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
            <div className={styles.printBlockTitle}>II. ITEMIZED PROFIT LEAKAGE ANALYSIS</div>
            <table className={styles.printDataTable}>
              <thead>
                <tr>
                  <th style={{ width: '45%' }}>Leakage Category</th>
                  <th style={{ width: '35%' }}>Root Cause Mechanism</th>
                  <th style={{ width: '20%', textAlign: 'right' }}>Annual Loss</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>Unbilled Scope Creep &amp; Modifications</strong></td>
                  <td>Unsigned verbal requests, framing/fixture tweaks</td>
                  <td style={{ textAlign: 'right', fontWeight: 800, color: '#b91c1c' }}>{formatCurrency(calculations.annualScopeLoss)}</td>
                </tr>
                <tr>
                  <td><strong>Supply House Traffic &amp; Travel</strong></td>
                  <td>Unbilled windshield hours &amp; technician downtime</td>
                  <td style={{ textAlign: 'right', fontWeight: 800, color: '#b91c1c' }}>{formatCurrency(calculations.annualSupplyHouseLoss)}</td>
                </tr>
                <tr>
                  <td><strong>Paper Check Chasing &amp; Deposit Drives</strong></td>
                  <td>Vehicle fuel, return site visits, delayed check clearance</td>
                  <td style={{ textAlign: 'right', fontWeight: 800, color: '#b91c1c' }}>{formatCurrency(calculations.annualCheckChasingLoss)}</td>
                </tr>
                <tr>
                  <td><strong>Net-30 Cash Flow Float &amp; Delayed Invoicing</strong></td>
                  <td>Carrying material expenses before final settlement</td>
                  <td style={{ textAlign: 'right', fontWeight: 800, color: '#b91c1c' }}>{formatCurrency(calculations.annualCashFlowCost)}</td>
                </tr>
                <tr style={{ background: '#fef2f2', borderTop: '2px solid #0f172a' }}>
                  <td><strong>TOTAL ANNUAL PROFIT EROSION</strong></td>
                  <td><strong>Combined Bottom-Line Impact</strong></td>
                  <td style={{ textAlign: 'right', fontWeight: 900, fontSize: '12px', color: '#b91c1c' }}>{formatCurrency(calculations.totalAnnualLeakage)}/yr</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Strategic Action Plan */}
          <div className={styles.printSectionBlock}>
            <div className={styles.printBlockTitle}>III. STRATEGIC REVENUE RECOVERY PLAN (POWERED BY LET’S GET QUOTED)</div>
            <div className={styles.printActionGrid}>
              <div className={styles.printActionItem}>
                <strong>1. 1-Tap Digital Change Orders:</strong> Require homeowner digital signature from mobile before performing extra work. Captures 100% of out-of-scope labor.
              </div>
              <div className={styles.printActionItem}>
                <strong>2. Automated Upfront Deposits:</strong> Lock in 30%–50% materials deposit directly via Apple Pay/credit card before crew scheduling to eliminate out-of-pocket cash float.
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

        {/* ==========================================================================
            Interactive Screen View
            ========================================================================== */}
        <div className={`${styles.leakGrid} ${styles.screenOnly}`}>
          {/* Controls Column */}
          <div className={styles.controlsStack}>
            {/* Presets Card */}
            <div className={styles.presetsContainer}>
              <div className={styles.presetsHeader}>
                <span className={styles.presetsTitle}>
                  <span>⚡</span> Quick Trade Presets
                </span>
                <span className={styles.presetsBadge}>
                  {activePresetId === 'custom' ? 'Customized Inputs' : 'Preset Loaded'}
                </span>
              </div>
              <div className={styles.presetChipsList}>
                {PRESETS.map((p) => {
                  const isActive = activePresetId === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handlePreset(p)}
                      className={`${styles.presetChip} ${isActive ? styles.presetChipActive : ''}`}
                    >
                      <span>{p.icon}</span> {p.name}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Input Controls */}
            {/* 1. Annual Gross Revenue */}
            <div className={styles.controlCard}>
              <div className={styles.controlHeader}>
                <label htmlFor="leak-revenue" className={styles.controlLabel}>
                  <span className={styles.controlIcon}>💼</span> Annual Gross Revenue
                </label>
                <span className={styles.controlValueBadge}>{formatCurrency(revenue)}</span>
              </div>
              <input
                id="leak-revenue"
                type="range"
                min={80000}
                max={1500000}
                step={10000}
                value={revenue}
                onChange={(e) => {
                  setRevenue(Number(e.target.value));
                  handleCustomAdjustment();
                }}
                className={styles.controlSlider}
                aria-label="Annual Gross Revenue slider"
              />
              <div className={styles.stepperContainer}>
                <button
                  type="button"
                  onClick={() => {
                    setRevenue((r) => Math.max(80000, r - 10000));
                    handleCustomAdjustment();
                  }}
                  className={styles.stepperBtnModern}
                  aria-label="Decrease revenue by 10k"
                >
                  −
                </button>
                <div className={styles.stepperInputWrapper}>
                  <input
                    type="number"
                    min={80000}
                    max={1500000}
                    step={10000}
                    value={revenue}
                    onChange={(e) => {
                      setRevenue(Math.max(0, Number(e.target.value) || 0));
                      handleCustomAdjustment();
                    }}
                    className={styles.stepperInputModern}
                    aria-label="Annual Gross Revenue direct numeric entry"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setRevenue((r) => Math.min(1500000, r + 10000));
                    handleCustomAdjustment();
                  }}
                  className={styles.stepperBtnModern}
                  aria-label="Increase revenue by 10k"
                >
                  +
                </button>
              </div>
              <span className={styles.controlHint}>
                Total annual top-line contracting sales volume before overhead and expenses.
              </span>
            </div>

            {/* 2. Unbilled Scope Creep */}
            <div className={styles.controlCard}>
              <div className={styles.controlHeader}>
                <label htmlFor="leak-scope" className={styles.controlLabel}>
                  <span className={styles.controlIcon}>📐</span> Unbilled Scope Creep &amp; Extras
                </label>
                <span className={styles.controlValueBadge}>{unbilledScopePct}% of projects</span>
              </div>
              <input
                id="leak-scope"
                type="range"
                min={1}
                max={15}
                step={1}
                value={unbilledScopePct}
                onChange={(e) => {
                  setUnbilledScopePct(Number(e.target.value));
                  handleCustomAdjustment();
                }}
                className={styles.controlSlider}
                aria-label="Unbilled Scope Creep slider"
              />
              <div className={styles.stepperContainer}>
                <button
                  type="button"
                  onClick={() => {
                    setUnbilledScopePct((s) => Math.max(1, s - 1));
                    handleCustomAdjustment();
                  }}
                  className={styles.stepperBtnModern}
                  aria-label="Decrease scope creep percentage"
                >
                  −
                </button>
                <div className={styles.stepperInputWrapper}>
                  <input
                    type="number"
                    min={1}
                    max={15}
                    step={1}
                    value={unbilledScopePct}
                    onChange={(e) => {
                      setUnbilledScopePct(Math.min(15, Math.max(1, Number(e.target.value) || 1)));
                      handleCustomAdjustment();
                    }}
                    className={styles.stepperInputModern}
                    aria-label="Scope creep percentage entry"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setUnbilledScopePct((s) => Math.min(15, s + 1));
                    handleCustomAdjustment();
                  }}
                  className={styles.stepperBtnModern}
                  aria-label="Increase scope creep percentage"
                >
                  +
                </button>
              </div>
              <span className={styles.controlHint}>
                Extra framing tweaks, added fixtures, or extra paint coats done verbally without a signed change order.
              </span>
            </div>

            {/* 3. Supply House Hours */}
            <div className={styles.controlCard}>
              <div className={styles.controlHeader}>
                <label htmlFor="leak-supply" className={styles.controlLabel}>
                  <span className={styles.controlIcon}>🚚</span> Supply House &amp; Parts Runs
                </label>
                <span className={styles.controlValueBadge}>{supplyHouseHours} hrs / week</span>
              </div>
              <input
                id="leak-supply"
                type="range"
                min={1}
                max={12}
                step={1}
                value={supplyHouseHours}
                onChange={(e) => {
                  setSupplyHouseHours(Number(e.target.value));
                  handleCustomAdjustment();
                }}
                className={styles.controlSlider}
                aria-label="Supply house hours slider"
              />
              <div className={styles.stepperContainer}>
                <button
                  type="button"
                  onClick={() => {
                    setSupplyHouseHours((h) => Math.max(1, h - 1));
                    handleCustomAdjustment();
                  }}
                  className={styles.stepperBtnModern}
                  aria-label="Decrease supply house hours"
                >
                  −
                </button>
                <div className={styles.stepperInputWrapper}>
                  <input
                    type="number"
                    min={1}
                    max={12}
                    step={1}
                    value={supplyHouseHours}
                    onChange={(e) => {
                      setSupplyHouseHours(Math.min(12, Math.max(1, Number(e.target.value) || 1)));
                      handleCustomAdjustment();
                    }}
                    className={styles.stepperInputModern}
                    aria-label="Supply house hours entry"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSupplyHouseHours((h) => Math.min(12, h + 1));
                    handleCustomAdjustment();
                  }}
                  className={styles.stepperBtnModern}
                  aria-label="Increase supply house hours"
                >
                  +
                </button>
              </div>
              <span className={styles.controlHint}>
                Windshield driving time to pickup materials and parts that are never billed directly to client invoices.
              </span>
            </div>

            {/* 4. Hourly Billing Rate */}
            <div className={styles.controlCard}>
              <div className={styles.controlHeader}>
                <label htmlFor="leak-rate" className={styles.controlLabel}>
                  <span className={styles.controlIcon}>⏱️</span> Target Hourly Labor Rate
                </label>
                <span className={styles.controlValueBadge}>${hourlyBillingRate} / hr</span>
              </div>
              <input
                id="leak-rate"
                type="range"
                min={45}
                max={200}
                step={5}
                value={hourlyBillingRate}
                onChange={(e) => {
                  setHourlyBillingRate(Number(e.target.value));
                  handleCustomAdjustment();
                }}
                className={styles.controlSlider}
                aria-label="Hourly billing rate slider"
              />
              <div className={styles.stepperContainer}>
                <button
                  type="button"
                  onClick={() => {
                    setHourlyBillingRate((r) => Math.max(45, r - 5));
                    handleCustomAdjustment();
                  }}
                  className={styles.stepperBtnModern}
                  aria-label="Decrease hourly rate"
                >
                  −
                </button>
                <div className={styles.stepperInputWrapper}>
                  <input
                    type="number"
                    min={45}
                    max={200}
                    step={5}
                    value={hourlyBillingRate}
                    onChange={(e) => {
                      setHourlyBillingRate(Math.min(200, Math.max(45, Number(e.target.value) || 45)));
                      handleCustomAdjustment();
                    }}
                    className={styles.stepperInputModern}
                    aria-label="Hourly billing rate entry"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setHourlyBillingRate((r) => Math.min(200, r + 5));
                    handleCustomAdjustment();
                  }}
                  className={styles.stepperBtnModern}
                  aria-label="Increase hourly rate"
                >
                  +
                </button>
              </div>
              <span className={styles.controlHint}>
                Your standard billable rate used to calculate lost technician opportunity cost.
              </span>
            </div>

            {/* 5. Check Chasing Trips */}
            <div className={styles.controlCard}>
              <div className={styles.controlHeader}>
                <label htmlFor="leak-trips" className={styles.controlLabel}>
                  <span className={styles.controlIcon}>🚙</span> In-Person Check Collection Trips
                </label>
                <span className={styles.controlValueBadge}>{checkTripsPerMonth} trips / month</span>
              </div>
              <input
                id="leak-trips"
                type="range"
                min={0}
                max={20}
                step={1}
                value={checkTripsPerMonth}
                onChange={(e) => {
                  setCheckTripsPerMonth(Number(e.target.value));
                  handleCustomAdjustment();
                }}
                className={styles.controlSlider}
                aria-label="Check collection trips slider"
              />
              <div className={styles.stepperContainer}>
                <button
                  type="button"
                  onClick={() => {
                    setCheckTripsPerMonth((t) => Math.max(0, t - 1));
                    handleCustomAdjustment();
                  }}
                  className={styles.stepperBtnModern}
                  aria-label="Decrease check collection trips"
                >
                  −
                </button>
                <div className={styles.stepperInputWrapper}>
                  <input
                    type="number"
                    min={0}
                    max={20}
                    step={1}
                    value={checkTripsPerMonth}
                    onChange={(e) => {
                      setCheckTripsPerMonth(Math.min(20, Math.max(0, Number(e.target.value) || 0)));
                      handleCustomAdjustment();
                    }}
                    className={styles.stepperInputModern}
                    aria-label="Check collection trips entry"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setCheckTripsPerMonth((t) => Math.min(20, t + 1));
                    handleCustomAdjustment();
                  }}
                  className={styles.stepperBtnModern}
                  aria-label="Increase check collection trips"
                >
                  +
                </button>
              </div>
              <span className={styles.controlHint}>
                Driving back to finished jobsites to pick up paper checks or deposits in person.
              </span>
            </div>
          </div>

          {/* Results Output Column */}
          <div className={styles.resultsCol}>
            <div className={styles.leakResultsCard}>
              {/* Status Ribbon */}
              <div className={styles.resultsStatusBadge}>
                <span className={styles.statusDot} />
                <span>Audit Complete • High Profit Recovery Potential</span>
              </div>

              {/* Primary Output Hero */}
              <div className={styles.primaryLeakHero}>
                <span className={styles.primaryLeakLabel}>
                  🚨 Estimated Annual Profit Leakage
                </span>
                <span className={styles.primaryLeakVal}>
                  {formatCurrency(calculations.totalAnnualLeakage)}
                </span>
                <span className={styles.primaryLeakSub}>
                  Slipping away every year in unbilled labor, scope creep, and payment friction ({calculations.leakagePercentOfGross.toFixed(1)}% of Gross Revenue).
                </span>
              </div>

              {/* Recovery Callout Hero */}
              <div className={styles.recoverableHero}>
                <div className={styles.recoverableTopRow}>
                  <span>💰 Recoverable With Let’s Get Quoted</span>
                </div>
                <div className={styles.recoverableVal}>
                  +{formatCurrency(calculations.recoverableWithLGQ)} / yr
                </div>
                <div className={styles.recoverableSub}>
                  Plug 85%+ of leakage instantly through automated workflows.
                </div>
                <div className={styles.recoverableBullets}>
                  <span className={styles.recoverableBullet}>✓ 1-Tap Mobile Change Orders</span>
                  <span className={styles.recoverableBullet}>✓ Upfront Deposit Locking</span>
                  <span className={styles.recoverableBullet}>✓ Instant Apple Pay Settlement</span>
                </div>
              </div>

              {/* Proportional Distribution Bar */}
              <div className={styles.leakDistSection}>
                <div className={styles.leakDistHeader}>
                  <span>Profit Erosion Breakdown</span>
                  <span>100% Total Loss</span>
                </div>
                <div className={styles.leakDistBar}>
                  <div
                    className={styles.distSegmentScope}
                    style={{ width: `${calculations.scopePct}%` }}
                    title={`Scope Creep: ${Math.round(calculations.scopePct)}%`}
                  />
                  <div
                    className={styles.distSegmentSupply}
                    style={{ width: `${calculations.supplyPct}%` }}
                    title={`Supply Runs: ${Math.round(calculations.supplyPct)}%`}
                  />
                  <div
                    className={styles.distSegmentCheck}
                    style={{ width: `${calculations.checkPct}%` }}
                    title={`Check Trips: ${Math.round(calculations.checkPct)}%`}
                  />
                  <div
                    className={styles.distSegmentFloat}
                    style={{ width: `${calculations.floatPct}%` }}
                    title={`Net-30 Float: ${Math.round(calculations.floatPct)}%`}
                  />
                </div>
                <div className={styles.distLegendGrid}>
                  <div className={styles.distLegendItem}>
                    <span className={styles.distDotScope} />
                    <span>Scope Creep ({Math.round(calculations.scopePct)}%)</span>
                  </div>
                  <div className={styles.distLegendItem}>
                    <span className={styles.distDotSupply} />
                    <span>Supply Runs ({Math.round(calculations.supplyPct)}%)</span>
                  </div>
                  <div className={styles.distLegendItem}>
                    <span className={styles.distDotCheck} />
                    <span>Check Pickups ({Math.round(calculations.checkPct)}%)</span>
                  </div>
                  <div className={styles.distLegendItem}>
                    <span className={styles.distDotFloat} />
                    <span>Cash Float ({Math.round(calculations.floatPct)}%)</span>
                  </div>
                </div>
              </div>

              {/* Itemized Leakage Breakdown */}
              <div className={styles.itemizedLossList}>
                <div className={styles.itemizedLossRow}>
                  <div className={styles.itemizedLeft}>
                    <span className={styles.itemizedIcon}>📐</span>
                    <div>
                      <span className={styles.itemizedTitle}>Unbilled Scope Creep</span>
                      <span className={styles.itemizedDesc}>Unsigned verbal extras &amp; mods</span>
                    </div>
                  </div>
                  <span className={styles.itemizedLossVal}>
                    -{formatCurrency(calculations.annualScopeLoss)}/yr
                  </span>
                </div>

                <div className={styles.itemizedLossRow}>
                  <div className={styles.itemizedLeft}>
                    <span className={styles.itemizedIcon}>🚚</span>
                    <div>
                      <span className={styles.itemizedTitle}>Supply House Runs</span>
                      <span className={styles.itemizedDesc}>Unbilled windshield travel</span>
                    </div>
                  </div>
                  <span className={styles.itemizedLossVal}>
                    -{formatCurrency(calculations.annualSupplyHouseLoss)}/yr
                  </span>
                </div>

                <div className={styles.itemizedLossRow}>
                  <div className={styles.itemizedLeft}>
                    <span className={styles.itemizedIcon}>🚙</span>
                    <div>
                      <span className={styles.itemizedTitle}>Paper Check Chasing</span>
                      <span className={styles.itemizedDesc}>Drive time, gas &amp; return visits</span>
                    </div>
                  </div>
                  <span className={styles.itemizedLossVal}>
                    -{formatCurrency(calculations.annualCheckChasingLoss)}/yr
                  </span>
                </div>

                <div className={styles.itemizedLossRow}>
                  <div className={styles.itemizedLeft}>
                    <span className={styles.itemizedIcon}>⏳</span>
                    <div>
                      <span className={styles.itemizedTitle}>Net-30 Carrying Float</span>
                      <span className={styles.itemizedDesc}>Uncollected deposits &amp; lag</span>
                    </div>
                  </div>
                  <span className={styles.itemizedLossVal}>
                    -{formatCurrency(calculations.annualCashFlowCost)}/yr
                  </span>
                </div>
              </div>

              {/* Action Buttons Stack */}
              <div className={styles.actionBtnsStack}>
                <button
                  type="button"
                  onClick={handleDownloadPdf}
                  disabled={downloadingPdf}
                  className={styles.btnDownloadPdf}
                >
                  <span>📥</span> {downloadingPdf ? 'Generating PDF...' : 'Download Official PDF Audit Report'}
                </button>
                <div className={styles.secondaryBtnsRow}>
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className={styles.btnSecondaryAction}
                  >
                    <span>🖨️</span> Print / Save PDF
                  </button>
                  <button
                    type="button"
                    onClick={handleCopySummary}
                    className={styles.btnSecondaryAction}
                  >
                    <span>{copied ? '✓' : '📋'}</span> {copied ? 'Report Copied!' : 'Copy Summary'}
                  </button>
                </div>
              </div>

              {/* Email Audit Report Section */}
              <div className={styles.emailReportBox}>
                <label htmlFor="leak-email" className={styles.emailReportLabel}>
                  <span>📧</span> Email full diagnostic audit to yourself:
                </label>
                <div className={styles.emailReportRow}>
                  <input
                    id="leak-email"
                    type="email"
                    value={emailAddress}
                    onChange={(e) => setEmailAddress(e.target.value)}
                    placeholder="contractor@example.com"
                    className={styles.emailReportInput}
                    aria-label="Email address for diagnostic report"
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
                    ✓ Diagnostic audit dispatched to {emailAddress}!
                  </span>
                ) : null}
              </div>

              {/* Signup Link */}
              <div className={styles.signupBox}>
                <a href={APP_SIGNUP_URL} className={styles.primaryCta}>
                  Plug The Leaks on Flex ($0/mo) &rarr;
                </a>
                <div className={styles.microHint} style={{ textAlign: 'center', marginTop: 8 }}>
                  No monthly software fee · Automated deposit locking &amp; digital change orders included
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Educational Deep Dive Section */}
      <section className={styles.eduDeepDive}>
        <h2 className={styles.eduTitle}>Where Contractors Lose $50,000+ Every Year</h2>
        <p className={styles.eduSubtitle}>
          Profit leakage doesn&apos;t happen from major catastrophes—it drains slowly from daily operational habits.
          Here is how modern trade contractors eliminate each leak.
        </p>

        <div className={styles.eduGrid}>
          <div className={styles.eduCard}>
            <span className={styles.eduIcon}>📐</span>
            <h3 className={styles.eduCardHeading}>1. Unbilled Scope Creep</h3>
            <p className={styles.eduCardText}>
              A homeowner asks for &ldquo;one quick change&rdquo; while you are on site. Without a formal change order signed on the spot,
              contractors forget to bill or eat the cost to avoid conflict.
            </p>
            <div className={styles.eduCardSolution}>
              ✓ Fix: Send 1-tap change orders via SMS before swinging a hammer.
            </div>
          </div>

          <div className={styles.eduCard}>
            <span className={styles.eduIcon}>🚚</span>
            <h3 className={styles.eduCardHeading}>2. Supply House Windshield Time</h3>
            <p className={styles.eduCardText}>
              Spending 4–6 hours every week sitting in traffic and waiting at parts counters drains hundreds of billable hours each year
              that never appear on customer invoices.
            </p>
            <div className={styles.eduCardSolution}>
              ✓ Fix: Factor procurement allowance into initial quote templates.
            </div>
          </div>

          <div className={styles.eduCard}>
            <span className={styles.eduIcon}>🚙</span>
            <h3 className={styles.eduCardHeading}>3. Paper Check Pickups</h3>
            <p className={styles.eduCardText}>
              Driving 30 minutes across town just to pick up a paper check or deposit burns gasoline, vehicle depreciation, and billable time
              while adding days of deposit float.
            </p>
            <div className={styles.eduCardSolution}>
              ✓ Fix: Text instant payment links with Apple Pay &amp; credit cards.
            </div>
          </div>

          <div className={styles.eduCard}>
            <span className={styles.eduIcon}>⏳</span>
            <h3 className={styles.eduCardHeading}>4. Net-30 Float &amp; Late Invoices</h3>
            <p className={styles.eduCardText}>
              Fronting thousands in materials out-of-pocket before receiving a deposit puts your cash flow at extreme risk and drains 2%–3% in
              carrying costs and credit interest.
            </p>
            <div className={styles.eduCardSolution}>
              ✓ Fix: Enforce required 30%–50% upfront deposits upon quote acceptance.
            </div>
          </div>
        </div>
      </section>

      {/* Cross-Link Hub */}
      <section className={styles.hideOnPrint} style={{ maxWidth: 1000, margin: '60px auto 80px', padding: '0 20px', textAlign: 'center' }}>
        <h3 style={{ fontSize: 20, color: '#f5f0e7', marginBottom: 16 }}>Explore More Free Contractor Tools</h3>
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
