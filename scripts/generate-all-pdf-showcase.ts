import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { generateInvoicePdf } from '../src/emails/InvoicePdf';
import { generatePermitApplicationPdf } from '../src/lib/permit-intel/permit-pdf-generator';
import { generateLienWaiverPdf } from '../src/lib/lien-waiver-pdf';
import { buildInsightsPdf } from '../src/lib/insights-export';

const artifactDir = 'C:\\Users\\brett\\.gemini\\antigravity-ide\\brain\\c8e32158-4d20-43a6-9f3a-bf504d9f703e';
const edgeExe = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const chromeExe = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const browserExe = fs.existsSync(edgeExe) ? edgeExe : chromeExe;

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount);
}

// 1. Leakage Calculator HTML Template
function generateLeakageHtml() {
  const revenue = 350000;
  const unbilledScopePct = 6;
  const supplyHouseHours = 4;
  const hourlyBillingRate = 95;
  const checkTripsPerMonth = 6;

  const annualScopeLoss = revenue * (unbilledScopePct / 100); // 21000
  const annualSupplyHouseLoss = supplyHouseHours * hourlyBillingRate * 50; // 19000
  const annualCheckChasingLoss = checkTripsPerMonth * 12 * (25 + 1.5 * hourlyBillingRate); // 12060
  const annualCashFlowCost = revenue * 0.025; // 8750
  const totalAnnualLeakage = annualScopeLoss + annualSupplyHouseLoss + annualCheckChasingLoss + annualCashFlowCost; // 60810
  const recoverableWithLGQ = totalAnnualLeakage * 0.85; // 51688.5

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Contractor Cash Flow & Profit Leakage Audit - Diagnostic Report</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Plus Jakarta Sans', -apple-system, sans-serif;
      background: #ffffff;
      color: #0f172a;
      padding: 32px 40px;
      line-height: 1.5;
    }
    .reportSheet { max-width: 800px; margin: 0 auto; }
    .reportHeader {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding-bottom: 14px;
      border-bottom: 2px solid #0f172a;
      margin-bottom: 16px;
    }
    .reportTitle { font-size: 22px; font-weight: 900; color: #0f172a; margin-bottom: 4px; }
    .reportSub { font-size: 11.5px; font-weight: 600; color: #64748b; }
    .metaCard {
      border: 1.5px solid #cbd5e1;
      background: #f8fafc;
      border-radius: 8px;
      padding: 8px 12px;
      text-align: right;
      min-width: 170px;
    }
    .docBadge {
      display: inline-block;
      font-size: 10px;
      font-weight: 900;
      background: #0f172a;
      color: #fff;
      padding: 3px 8px;
      border-radius: 4px;
      margin-bottom: 4px;
    }
    .metaRow { display: flex; justify-content: space-between; font-size: 10.5px; color: #475569; margin-top: 2px; }
    .summaryGrid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 16px; }
    .leakageBox { border: 1.5px solid #fecaca; background: #fef2f2; border-radius: 8px; padding: 12px 14px; }
    .recoveryBox { border: 1.5px solid #a7f3d0; background: #ecfdf5; border-radius: 8px; padding: 12px 14px; }
    .boxLabel { font-size: 10px; font-weight: 800; text-transform: uppercase; margin-bottom: 4px; display: block; }
    .valDanger { font-size: 22px; font-weight: 900; color: #b91c1c; }
    .valSuccess { font-size: 22px; font-weight: 900; color: #047857; }
    .boxSub { font-size: 10.5px; color: #475569; margin-top: 4px; display: block; }
    .blockTitle {
      font-size: 11px;
      font-weight: 900;
      text-transform: uppercase;
      color: #0f172a;
      background: #f1f5f9;
      padding: 6px 10px;
      border-radius: 4px;
      margin-bottom: 8px;
    }
    .sectionBlock { margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
    th { background: #f8fafc; color: #475569; border-bottom: 1.5px solid #cbd5e1; padding: 7px 10px; text-align: left; text-transform: uppercase; font-size: 10px; font-weight: 800; }
    td { padding: 7px 10px; border-bottom: 1px solid #e2e8f0; }
    .actionGrid { display: flex; flex-direction: column; gap: 6px; }
    .actionItem { font-size: 11px; background: #fafbfc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 7px 10px; }
    .footer { display: flex; justify-content: space-between; font-size: 9.5px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 8px; margin-top: 16px; }
  </style>
</head>
<body>
  <div class="reportSheet">
    <div class="reportHeader">
      <div>
        <h1 class="reportTitle">Contractor Cash Flow & Profit Leakage Audit</h1>
        <div class="reportSub">Executive Financial Diagnostic &amp; Profit Recovery Analysis</div>
      </div>
      <div class="metaCard">
        <div class="docBadge">AUDIT REPORT</div>
        <div class="metaRow"><span>REF #:</span><strong>AUD-2026-LEAK</strong></div>
        <div class="metaRow"><span>DATE:</span><strong>Aug 27, 2026</strong></div>
      </div>
    </div>

    <div class="summaryGrid">
      <div class="leakageBox">
        <span class="boxLabel" style="color: #b91c1c;">🚨 TOTAL ANNUAL PROFIT LEAKAGE</span>
        <div class="valDanger">${formatCurrency(totalAnnualLeakage)} / yr</div>
        <span class="boxSub">Drained across unbilled labor, scope creep, and paper check collection</span>
      </div>
      <div class="recoveryBox">
        <span class="boxLabel" style="color: #047857;">💰 RECOVERABLE WITH LET’S GET QUOTED</span>
        <div class="valSuccess">+${formatCurrency(recoverableWithLGQ)} / yr</div>
        <span class="boxSub">Reclaimed via automated deposits, 1-tap change orders &amp; mobile pay</span>
      </div>
    </div>

    <div class="sectionBlock">
      <div class="blockTitle">I. BASELINE OPERATIONAL PROFILE</div>
      <table>
        <thead>
          <tr><th>Operational Parameter</th><th style="text-align: right;">Baseline Value</th><th style="text-align: right;">Annualized Metric</th></tr>
        </thead>
        <tbody>
          <tr><td>Annual Gross Revenue</td><td style="text-align: right; font-weight: 700;">${formatCurrency(revenue)}</td><td style="text-align: right; color: #64748b;">100% Volume</td></tr>
          <tr><td>Unbilled Scope Creep / Extras Rate</td><td style="text-align: right; font-weight: 700;">${unbilledScopePct}% of projects</td><td style="text-align: right; color: #b91c1c; font-weight: 700;">-${formatCurrency(annualScopeLoss)}/yr</td></tr>
          <tr><td>Unbilled Supply House &amp; Parts Runs</td><td style="text-align: right; font-weight: 700;">${supplyHouseHours} hrs / week</td><td style="text-align: right; color: #b91c1c; font-weight: 700;">-${formatCurrency(annualSupplyHouseLoss)}/yr</td></tr>
          <tr><td>Target Hourly Labor Billing Rate</td><td style="text-align: right; font-weight: 700;">$${hourlyBillingRate} / hour</td><td style="text-align: right; color: #64748b;">50 Working Weeks</td></tr>
          <tr><td>In-Person Paper Check Pickup Trips</td><td style="text-align: right; font-weight: 700;">${checkTripsPerMonth} trips / month</td><td style="text-align: right; color: #b91c1c; font-weight: 700;">-${formatCurrency(annualCheckChasingLoss)}/yr</td></tr>
        </tbody>
      </table>
    </div>

    <div class="sectionBlock">
      <div class="blockTitle">II. ITEMIZED PROFIT LEAKAGE ANALYSIS</div>
      <table>
        <thead>
          <tr><th style="width: 48%;">Leakage Category</th><th style="width: 32%;">Root Cause</th><th style="width: 20%; text-align: right;">Annual Loss</th></tr>
        </thead>
        <tbody>
          <tr><td><strong>Unbilled Scope Creep &amp; Modifications</strong></td><td>Unsigned verbal requests, framing/fixture tweaks</td><td style="text-align: right; font-weight: 800;">${formatCurrency(annualScopeLoss)}</td></tr>
          <tr><td><strong>Supply House Traffic &amp; Travel</strong></td><td>Unbilled windshield hours &amp; technician downtime</td><td style="text-align: right; font-weight: 800;">${formatCurrency(annualSupplyHouseLoss)}</td></tr>
          <tr><td><strong>Paper Check Chasing &amp; Deposit Drives</strong></td><td>Vehicle gas, return trips, delayed deposit clearance</td><td style="text-align: right; font-weight: 800;">${formatCurrency(annualCheckChasingLoss)}</td></tr>
          <tr><td><strong>Net-30 Cash Flow Float &amp; Delayed Invoicing</strong></td><td>Carrying material expenses before final settlement</td><td style="text-align: right; font-weight: 800;">${formatCurrency(annualCashFlowCost)}</td></tr>
          <tr style="background: #f8fafc; border-top: 2px solid #0f172a;">
            <td><strong>TOTAL ANNUAL PROFIT EROSION</strong></td><td><strong>Combined Bottom-Line Impact</strong></td><td style="text-align: right; font-weight: 900; color: #b91c1c;">${formatCurrency(totalAnnualLeakage)}/yr</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="sectionBlock">
      <div class="blockTitle">III. STRATEGIC REVENUE RECOVERY PLAN</div>
      <div class="actionGrid">
        <div class="actionItem"><strong>1. 1-Tap Digital Change Orders:</strong> Require homeowner digital signature before performing extra work. Captures 100% of out-of-scope labor.</div>
        <div class="actionItem"><strong>2. Automated Upfront Deposits:</strong> Lock in 30%–50% materials deposit directly via Apple Pay/credit card before crew scheduling.</div>
        <div class="actionItem"><strong>3. Instant Text-to-Pay Settlement:</strong> Text signable invoices upon final walkthrough to eliminate paper check pickup drives and 30-day float.</div>
      </div>
    </div>

    <div class="footer">
      <div>✓ Prepared via Let’s Get Quoted • Financial Diagnostic Suite</div>
      <div>https://letsgetquoted.com/tools/leakage-calculator</div>
    </div>
  </div>
</body>
</html>`;
}

// 2. Hourly Rate Calculator HTML Template
function generateHourlyRateHtml() {
  const takeHomePay = 105000;
  const overhead = 24000;
  const weeksPerYear = 48;
  const totalHoursPerWeek = 40;
  const unbillableHours = 14;
  const helpersCount = 0;
  const helperWage = 0;
  const profitMargin = 20;

  const billableHoursPerWeek = totalHoursPerWeek - unbillableHours; // 26
  const annualBillableHours = billableHoursPerWeek * weeksPerYear; // 1248
  const totalOperatingCost = takeHomePay + overhead; // 129000
  const breakevenHourlyRate = totalOperatingCost / annualBillableHours; // 103.37
  const requiredHourlyRate = breakevenHourlyRate / (1 - profitMargin / 100); // 129.21
  const targetDayRate = requiredHourlyRate * 8; // 1033.65
  const grossRevenueTarget = requiredHourlyRate * annualBillableHours; // 161250

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Contractor True Hourly Rate & Margin Analysis - Benchmark Report</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Plus Jakarta Sans', -apple-system, sans-serif;
      background: #ffffff;
      color: #0f172a;
      padding: 32px 40px;
      line-height: 1.5;
    }
    .reportSheet { max-width: 800px; margin: 0 auto; }
    .reportHeader {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding-bottom: 14px;
      border-bottom: 2px solid #0f172a;
      margin-bottom: 16px;
    }
    .reportTitle { font-size: 22px; font-weight: 900; color: #0f172a; margin-bottom: 4px; }
    .reportSub { font-size: 11.5px; font-weight: 600; color: #64748b; }
    .metaCard {
      border: 1.5px solid #cbd5e1;
      background: #f8fafc;
      border-radius: 8px;
      padding: 8px 12px;
      text-align: right;
      min-width: 170px;
    }
    .docBadge {
      display: inline-block;
      font-size: 10px;
      font-weight: 900;
      background: #0f172a;
      color: #fff;
      padding: 3px 8px;
      border-radius: 4px;
      margin-bottom: 4px;
    }
    .metaRow { display: flex; justify-content: space-between; font-size: 10.5px; color: #475569; margin-top: 2px; }
    .summaryGrid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 16px; }
    .rateTargetBox { border: 1.5px solid #86efac; background: #f0fdf4; border-radius: 8px; padding: 12px 14px; }
    .dayRateBox { border: 1.5px solid #cbd5e1; background: #f8fafc; border-radius: 8px; padding: 12px 14px; }
    .boxLabel { font-size: 10px; font-weight: 800; text-transform: uppercase; margin-bottom: 4px; display: block; }
    .valPrimary { font-size: 22px; font-weight: 900; color: #15803d; }
    .valSecondary { font-size: 22px; font-weight: 900; color: #0f172a; }
    .boxSub { font-size: 10.5px; color: #475569; margin-top: 4px; display: block; }
    .blockTitle {
      font-size: 11px;
      font-weight: 900;
      text-transform: uppercase;
      color: #0f172a;
      background: #f1f5f9;
      padding: 6px 10px;
      border-radius: 4px;
      margin-bottom: 8px;
    }
    .sectionBlock { margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
    th { background: #f8fafc; color: #475569; border-bottom: 1.5px solid #cbd5e1; padding: 7px 10px; text-align: left; text-transform: uppercase; font-size: 10px; font-weight: 800; }
    td { padding: 7px 10px; border-bottom: 1px solid #e2e8f0; }
    .actionGrid { display: flex; flex-direction: column; gap: 6px; }
    .actionItem { font-size: 11px; background: #fafbfc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 7px 10px; }
    .footer { display: flex; justify-content: space-between; font-size: 9.5px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 8px; margin-top: 16px; }
  </style>
</head>
<body>
  <div class="reportSheet">
    <div class="reportHeader">
      <div>
        <h1 class="reportTitle">Contractor True Hourly Rate & Margin Analysis</h1>
        <div class="reportSub">Operating Cost Allocation &amp; Billable Pricing Benchmark Report</div>
      </div>
      <div class="metaCard">
        <div class="docBadge">RATE REPORT</div>
        <div class="metaRow"><span>REF #:</span><strong>RAT-2026-CALC</strong></div>
        <div class="metaRow"><span>DATE:</span><strong>Aug 27, 2026</strong></div>
      </div>
    </div>

    <div class="summaryGrid">
      <div class="rateTargetBox">
        <span class="boxLabel" style="color: #166534;">🎯 REQUIRED BILLABLE RATE</span>
        <div class="valPrimary">${formatCurrency(requiredHourlyRate)} / hr</div>
        <span class="boxSub" style="color: #166534;">Includes ${profitMargin}% profit margin, overhead &amp; helper burden</span>
      </div>
      <div class="dayRateBox">
        <span class="boxLabel" style="color: #475569;">📅 TARGET 8-HOUR DAY RATE</span>
        <div class="valSecondary">${formatCurrency(targetDayRate)} / day</div>
        <span class="boxSub">Breakeven (0% Margin): ${formatCurrency(breakevenHourlyRate)}/hr</span>
      </div>
    </div>

    <div class="sectionBlock">
      <div class="blockTitle">I. ANNUAL OPERATING &amp; COST STRUCTURE</div>
      <table>
        <thead>
          <tr><th>Operating Parameter</th><th style="text-align: right;">Baseline Specification</th><th style="text-align: right;">Annual Target</th></tr>
        </thead>
        <tbody>
          <tr><td>Target Owner Take-Home Pay</td><td style="text-align: right; font-weight: 700;">${weeksPerYear} Working Weeks / Year</td><td style="text-align: right; font-weight: 800;">${formatCurrency(takeHomePay)}/yr</td></tr>
          <tr><td>Annual Business Overhead (Truck, Ins, Tools, Lic)</td><td style="text-align: right; font-weight: 700;">Fixed Annual Expense</td><td style="text-align: right; font-weight: 800;">${formatCurrency(overhead)}/yr</td></tr>
          <tr><td>Net Profit Target (${profitMargin}%)</td><td style="text-align: right; font-weight: 700;">Target Net Margin Multiplier</td><td style="text-align: right; font-weight: 800; color: #15803d;">+${formatCurrency(grossRevenueTarget * (profitMargin / 100))}/yr</td></tr>
          <tr style="background: #f8fafc; border-top: 2px solid #0f172a;">
            <td><strong>ANNUAL GROSS REVENUE REQUIREMENT</strong></td><td style="text-align: right; font-weight: 800;"><strong>100% Target Output</strong></td><td style="text-align: right; font-weight: 900; color: #0f172a;">${formatCurrency(grossRevenueTarget)}/yr</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="sectionBlock">
      <div class="blockTitle">II. BILLABLE CAPACITY &amp; TIME EFFICIENCY</div>
      <table>
        <thead>
          <tr><th style="width: 45%;">Time Allocation Parameter</th><th style="width: 30%;">Weekly Distribution</th><th style="width: 25%; text-align: right;">Annual Hours</th></tr>
        </thead>
        <tbody>
          <tr><td><strong>Total Working Hours</strong></td><td>${totalHoursPerWeek} hrs / week</td><td style="text-align: right; font-weight: 700;">${totalHoursPerWeek * weeksPerYear} hrs/yr</td></tr>
          <tr><td><strong>Unbillable Time (Windshield, Bids, Supply)</strong></td><td style="color: #b91c1c; font-weight: 700;">-${unbillableHours} hrs / week</td><td style="text-align: right; color: #b91c1c; font-weight: 700;">-${unbillableHours * weeksPerYear} hrs/yr</td></tr>
          <tr style="background: #f8fafc;">
            <td><strong>True Billable Production Time</strong></td><td style="font-weight: 800; color: #15803d;">${billableHoursPerWeek} hrs / week</td><td style="text-align: right; font-weight: 900; color: #15803d;">${annualBillableHours} hrs/yr (65% efficiency)</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="sectionBlock">
      <div class="blockTitle">III. STRATEGIC PRICING EXECUTION</div>
      <div class="actionGrid">
        <div class="actionItem"><strong>1. Never Bill Flat 40 Hours:</strong> Factoring in ${unbillableHours} unbillable hours raises your required rate from ${formatCurrency(breakevenHourlyRate * (billableHoursPerWeek / totalHoursPerWeek))} to <strong>${formatCurrency(requiredHourlyRate)}/hr</strong>.</div>
        <div class="actionItem"><strong>2. Use 3-Tier Proposals:</strong> Presenting Good / Better / Best packages lifts average ticket sizes by 30%–50% without discount pressure.</div>
        <div class="actionItem"><strong>3. Upfront Deposit Locking:</strong> Collect 30% upfront materials deposits to maintain healthy cash flow throughout project execution.</div>
      </div>
    </div>

    <div class="footer">
      <div>✓ Prepared via Let’s Get Quoted • Contractor Rate &amp; Margin Diagnostics</div>
      <div>https://letsgetquoted.com/tools/hourly-rate-calculator</div>
    </div>
  </div>
</body>
</html>`;
}

// 3. Invoice HTML Preview
function generateInvoiceHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Apex Trade Solutions - Invoice INV-2026-089</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@500;700&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Plus Jakarta Sans', sans-serif; background: #ffffff; color: #0f172a; padding: 32px 40px; }
    .sheet { max-width: 800px; margin: 0 auto; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
    .company { font-size: 24px; font-weight: 900; color: #0f172a; margin-bottom: 4px; }
    .sub { font-size: 11.5px; color: #64748b; font-weight: 600; }
    .metaCard { border: 1.5px solid #cbd5e1; background: #f8fafc; border-radius: 8px; padding: 10px 14px; text-align: right; min-width: 190px; }
    .badge { display: inline-block; font-size: 10px; font-weight: 900; background: #0f172a; color: #fff; padding: 3px 8px; border-radius: 4px; margin-bottom: 6px; }
    .metaRow { display: flex; justify-content: space-between; font-size: 11px; color: #475569; margin-top: 3px; }
    .metaVal { font-weight: 800; color: #0f172a; font-family: 'JetBrains Mono', monospace; }
    .billTo { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px; }
    .billLabel { font-size: 10px; font-weight: 800; color: #64748b; text-transform: uppercase; margin-bottom: 4px; }
    .clientName { font-size: 15px; font-weight: 800; color: #0f172a; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    th { background: #f1f5f9; color: #1e293b; border-bottom: 2px solid #cbd5e1; padding: 8px 10px; font-size: 11px; font-weight: 800; text-align: left; text-transform: uppercase; }
    td { padding: 10px; border-bottom: 1px solid #e2e8f0; font-size: 12.5px; }
    .totalsGrid { display: flex; justify-content: flex-end; margin-bottom: 24px; }
    .totalsCard { width: 240px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; }
    .totRow { display: flex; justify-content: space-between; font-size: 12px; padding: 3px 0; color: #475569; }
    .totGrand { border-top: 2px solid #0f172a; margin-top: 8px; padding-top: 8px; font-size: 15px; font-weight: 900; color: #0f172a; }
    .paymentBlock { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; margin-bottom: 16px; font-size: 11px; color: #475569; }
    .footer { display: flex; justify-content: space-between; font-size: 9.5px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 8px; }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="header">
      <div>
        <div class="company">Apex Trade Solutions</div>
        <div class="sub">(555) 382-9011 • billing@apextrades.com • Lic # LIC-948201-A</div>
      </div>
      <div class="metaCard">
        <div class="badge">INVOICE</div>
        <div class="metaRow"><span>REF #:</span><span class="metaVal">INV-2026-089</span></div>
        <div class="metaRow"><span>JOB #:</span><span class="metaVal">JOB-4820</span></div>
        <div class="metaRow"><span>STATUS:</span><span style="color: #059669; font-weight: 800;">PAYMENT DUE</span></div>
      </div>
    </div>

    <div class="billTo">
      <div class="billLabel">BILL TO / CLIENT:</div>
      <div class="clientName">Sarah Jenkins</div>
      <div style="font-size: 12px; color: #475569; margin-top: 2px;">211 S Williams St, Royal Oak, MI 48067</div>
    </div>

    <table>
      <thead>
        <tr><th style="width: 75%;">Description / Scope Item</th><th style="width: 25%; text-align: right;">Amount</th></tr>
      </thead>
      <tbody>
        <tr><td><strong>Master Electrician Service &amp; Panel Upgrade (200A)</strong></td><td style="text-align: right; font-weight: 800;">$1,200.00</td></tr>
        <tr><td><strong>Whole-Home Surge Protector Spec Grade (Type 2)</strong></td><td style="text-align: right; font-weight: 800;">$350.00</td></tr>
        <tr><td><strong>Municipal Electrical Permit Acquisition &amp; Inspection Fee</strong></td><td style="text-align: right; font-weight: 800;">$250.00</td></tr>
        <tr><td><strong>Dedicated EV Charger Circuit Conduit &amp; NEMA 14-50 Receptacle</strong></td><td style="text-align: right; font-weight: 800;">$200.00</td></tr>
      </tbody>
    </table>

    <div class="totalsGrid">
      <div class="totalsCard">
        <div class="totRow"><span>Subtotal:</span><strong>$2,000.00</strong></div>
        <div class="totRow" style="color: #b91c1c;"><span>Discount (10%):</span><strong>-$200.00</strong></div>
        <div class="totRow"><span>Tax (6.00%):</span><span>$108.00</span></div>
        <div class="totRow totGrand"><span>Total Due:</span><span>$1,908.00</span></div>
      </div>
    </div>

    <div class="paymentBlock">
      <strong style="color: #0f172a; display: block; margin-bottom: 4px;">PAYMENT INSTRUCTIONS:</strong>
      Thank you for your business! Please make payment payable to Apex Trade Solutions. Digital card and ACH payments processed securely via Let's Get Quoted.
    </div>

    <div class="footer">
      <div>✓ Official Invoice • Generated via Let’s Get Quoted</div>
      <div>Invoice Reference: INV-2026-089</div>
    </div>
  </div>
</body>
</html>`;
}

// 4. Permit Application HTML Template
function generatePermitHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Uniform Permit Application Packet</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@500;700&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Plus Jakarta Sans', sans-serif; background: #ffffff; color: #0f172a; padding: 28px 36px; }
    .packet { border: 2px solid #0f172a; border-radius: 6px; padding: 20px 24px; position: relative; max-width: 800px; margin: 0 auto; }
    .innerBorder { border: 1px solid #cbd5e1; border-radius: 4px; padding: 18px 20px; }
    .header { text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 14px; }
    .agency { font-size: 15px; font-weight: 900; color: #0f172a; text-transform: uppercase; letter-spacing: 0.5px; }
    .dept { font-size: 11px; font-weight: 800; color: #475569; text-transform: uppercase; margin-top: 2px; }
    .statute { font-size: 9px; font-weight: 700; color: #64748b; margin-top: 3px; }
    .secTitle { font-size: 10px; font-weight: 900; color: #0f172a; background: #f1f5f9; padding: 4px 8px; border-radius: 3px; text-transform: uppercase; margin: 12px 0 8px; }
    .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px; font-size: 11px; }
    .fieldRow { display: flex; gap: 6px; }
    .fieldKey { font-weight: 800; color: #0f172a; white-space: nowrap; font-size: 10.5px; }
    .fieldVal { color: #334155; }
    .warningBox { background: #fef2f2; border: 1.5px solid #fecaca; border-radius: 6px; padding: 10px 14px; margin-top: 14px; }
    .warningTitle { font-size: 10px; font-weight: 900; color: #b91c1c; text-transform: uppercase; margin-bottom: 3px; }
    .warningText { font-size: 9px; color: #7f1d1d; line-height: 1.4; }
    .sigRow { display: grid; grid-template-columns: 2fr 1fr; gap: 24px; margin-top: 16px; padding-top: 10px; border-top: 1px dashed #cbd5e1; }
    .sigLine { border-bottom: 1.5px solid #0f172a; height: 28px; margin-bottom: 4px; }
    .sigLabel { font-size: 10px; font-weight: 800; color: #0f172a; }
  </style>
</head>
<body>
  <div class="packet">
    <div class="innerBorder">
      <div class="header">
        <div class="agency">City of Royal Oak Building Department</div>
        <div class="dept">Community Development Division · Building & Safety Inspection Bureau</div>
        <div class="statute">OFFICIAL UNIFORM PERMIT APPLICATION PACKET (MICHIGAN PUBLIC ACT 230)</div>
      </div>

      <div class="secTitle">I. PROPERTY & JOB SITE LOCATION</div>
      <div class="grid2">
        <div class="fieldRow"><span class="fieldKey">Street Address:</span><span class="fieldVal">211 S Williams St</span></div>
        <div class="fieldRow"><span class="fieldKey">Occupancy / Type:</span><span class="fieldVal">R-3 Residential · Type V-B</span></div>
        <div class="fieldRow"><span class="fieldKey">City / State / ZIP:</span><span class="fieldVal">Royal Oak, MI 48067</span></div>
        <div class="fieldRow"><span class="fieldKey">Parcel ID:</span><span class="fieldVal">25-15-200-014</span></div>
      </div>

      <div class="secTitle">II. PROPERTY OWNER IDENTIFICATION</div>
      <div class="grid2">
        <div class="fieldRow"><span class="fieldKey">Owner Name:</span><span class="fieldVal">Sarah Jenkins</span></div>
        <div class="fieldRow"><span class="fieldKey">Phone:</span><span class="fieldVal">(248) 555-0199</span></div>
        <div class="fieldRow"><span class="fieldKey">Email:</span><span class="fieldVal">s.jenkins@example.com</span></div>
        <div class="fieldRow"><span class="fieldKey">Owner Address:</span><span class="fieldVal">Same as Job Site</span></div>
      </div>

      <div class="secTitle">III. LICENSED CONTRACTOR & CREDENTIALS</div>
      <div class="grid2">
        <div class="fieldRow"><span class="fieldKey">Company:</span><span class="fieldVal">Apex Trade Solutions LLC</span></div>
        <div class="fieldRow"><span class="fieldKey">Licensee:</span><span class="fieldVal">Marcus Vance (Master Elec)</span></div>
        <div class="fieldRow"><span class="fieldKey">State License #:</span><span class="fieldVal">6201948201 (Master Electrician)</span></div>
        <div class="fieldRow"><span class="fieldKey">Expiration:</span><span class="fieldVal">2027-12-31 (Current Active)</span></div>
        <div class="fieldRow"><span class="fieldKey">Liability Policy:</span><span class="fieldVal">Auto-Owners Insurance (#POL-94820)</span></div>
        <div class="fieldRow"><span class="fieldKey">Worker's Comp:</span><span class="fieldVal">Accident Fund of MI (#WC-83921)</span></div>
      </div>

      <div class="secTitle">IV. PROJECT SCOPE & TECHNICAL SPECIFICATIONS</div>
      <div class="grid2">
        <div class="fieldRow"><span class="fieldKey">Project Title:</span><span class="fieldVal">Residential 200A Service Upgrade & EV Charger</span></div>
        <div class="fieldRow"><span class="fieldKey">Estimated Valuation:</span><span class="fieldVal"><strong>$4,500.00</strong></span></div>
      </div>
      <div style="font-size: 10.5px; color: #334155; margin-top: 6px; line-height: 1.4;">
        <strong>Detailed Scope:</strong> Removal of existing 100A split-bus load center. Installation of new 200A meter socket, copper service entrance conductors, 200A main breaker panel, two 8ft ground rods with #4 copper grounding electrode conductor, whole-home surge protective device, and dedicated 50A circuit to garage NEMA 14-50 EV receptacle.
      </div>

      <div class="warningBox">
        <div class="warningTitle">MICHIGAN PUBLIC ACT 230 OF 1972 STATUTORY WARNING:</div>
        <div class="warningText">
          Section 23a of the State Construction Code Act of 1972, Act No. 230 of the Public Acts of 1972, being Section 125.1523a of the Michigan Compiled Laws, prohibits a person from conspiring to circumvent the licensing requirements of this state relating to persons who are to perform work on a residential building or a residential structure. Violators of Section 23a are subject to civil fines.
        </div>
      </div>

      <div class="sigRow">
        <div>
          <div class="sigLine"></div>
          <div class="sigLabel">LICENSED CONTRACTOR / AUTHORIZED AGENT SIGNATURE</div>
        </div>
        <div>
          <div class="sigLine"></div>
          <div class="sigLabel">DATE</div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

// 5. Lien Waiver HTML Template
function generateLienWaiverHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Conditional Progress Lien Waiver</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Plus Jakarta Sans', sans-serif; background: #ffffff; color: #0f172a; padding: 32px 40px; }
    .waiver { border: 2px solid #334155; border-radius: 6px; padding: 22px 26px; max-width: 800px; margin: 0 auto; }
    .header { text-align: center; margin-bottom: 14px; }
    .title { font-size: 17px; font-weight: 900; color: #0f172a; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 3px; }
    .ref { font-size: 10px; color: #64748b; }
    .noticeBox { background: #f8fafc; border: 1.5px solid #cbd5e1; border-radius: 6px; padding: 10px 14px; margin-bottom: 16px; }
    .noticeTitle { font-size: 9px; font-weight: 900; color: #b91c1c; text-transform: uppercase; margin-bottom: 3px; }
    .noticeText { font-size: 8.5px; color: #334155; line-height: 1.45; }
    .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px; }
    .fieldBlock { display: flex; flex-direction: column; gap: 2px; }
    .fieldLabel { font-size: 9.5px; font-weight: 800; color: #0f172a; text-transform: uppercase; }
    .fieldValue { font-size: 12px; font-weight: 700; color: #1e293b; }
    .legalText { font-size: 9.5px; color: #334155; line-height: 1.5; margin: 12px 0 16px; border-top: 1px solid #e2e8f0; padding-top: 12px; }
    .sigBox { border: 1px solid #cbd5e1; background: #fafbfc; border-radius: 6px; padding: 12px 16px; margin-top: 14px; }
    .sigGrid { display: grid; grid-template-columns: 2fr 1fr; gap: 20px; margin-top: 8px; }
    .sigLine { border-bottom: 1.5px solid #0f172a; height: 26px; margin-bottom: 3px; }
    .sigLabel { font-size: 9.5px; font-weight: 800; color: #0f172a; }
  </style>
</head>
<body>
  <div class="waiver">
    <div class="header">
      <div class="title">Conditional Progress Lien Waiver & Release</div>
      <div class="ref">Document Reference: LW-2026-9812 • State of Michigan Statutory Format • Generated via Let's Get Quoted</div>
    </div>

    <div class="noticeBox">
      <div class="noticeTitle">STATUTORY NOTICE:</div>
      <div class="noticeText">
        THIS DOCUMENT WAIVES THE CLAIMANT'S LIEN, STOP PAYMENT NOTICE, AND PAYMENT BOND RIGHTS EFFECTIVE ON RECEIPT OF PAYMENT. DO NOT RELY ON THIS DOCUMENT UNLESS SATISFIED THAT THE CLAIMANT HAS RECEIVED PAYMENT.
      </div>
    </div>

    <div class="grid2">
      <div class="fieldBlock">
        <span class="fieldLabel">CLAIMANT (CONTRACTOR):</span>
        <span class="fieldValue">Apex Trade Solutions LLC</span>
      </div>
      <div class="fieldBlock">
        <span class="fieldLabel">JOB LOCATION & PROPERTY ADDRESS:</span>
        <span class="fieldValue">211 S Williams St, Royal Oak, MI 48067</span>
      </div>
      <div class="fieldBlock">
        <span class="fieldLabel">CUSTOMER / PROPERTY OWNER:</span>
        <span class="fieldValue">Sarah Jenkins</span>
      </div>
      <div class="fieldBlock">
        <span class="fieldLabel">WAIVER SUM & THROUGH-DATE:</span>
        <span class="fieldValue" style="color: #047857; font-size: 13px;">$1,908.00 • Through Aug 27, 2026</span>
      </div>
    </div>

    <div class="legalText">
      <strong>TERMS OF WAIVER AND RELEASE:</strong><br />
      Upon receipt by the undersigned of a check from Sarah Jenkins in the sum of $1,908.00 payable to Apex Trade Solutions LLC and when the check has been properly endorsed and has been paid by the bank on which it is drawn, this document becomes effective to release any mechanic's lien, stop payment notice, or bond right the undersigned has on the job of Sarah Jenkins located at 211 S Williams St, Royal Oak, MI 48067 to the following extent: This release covers a progress payment for all labor, services, equipment, or materials furnished to the jobsite through Aug 27, 2026 only, and does not cover any retention withheld, before or after the through-date.
    </div>

    <div class="sigBox">
      <div style="font-size: 10px; font-weight: 800; color: #0f172a; text-transform: uppercase;">EXECUTION & CERTIFICATION</div>
      <div class="sigGrid">
        <div>
          <div class="sigLine"></div>
          <div class="sigLabel">AUTHORIZED OFFICER SIGNATURE (Apex Trade Solutions LLC)</div>
        </div>
        <div>
          <div class="sigLine"></div>
          <div class="sigLabel">DATE</div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

// 6. Insights Export HTML Template
function generateInsightsHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Apex Trade Solutions — Business Performance Report</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Plus Jakarta Sans', sans-serif; background: #ffffff; color: #0f172a; padding: 32px 40px; }
    .sheet { max-width: 800px; margin: 0 auto; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 12px; border-bottom: 2px solid #0f172a; margin-bottom: 16px; }
    .title { font-size: 22px; font-weight: 900; color: #0f172a; }
    .period { font-size: 12px; font-weight: 700; color: #64748b; margin-top: 2px; }
    .metaCard { border: 1.5px solid #cbd5e1; background: #f8fafc; border-radius: 8px; padding: 8px 12px; text-align: right; }
    .kpiGrid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 18px; }
    .kpiCard { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 14px; }
    .kpiLabel { font-size: 10px; font-weight: 800; color: #64748b; text-transform: uppercase; margin-bottom: 4px; }
    .kpiVal { font-size: 20px; font-weight: 900; color: #0f172a; }
    .kpiDelta { font-size: 10.5px; font-weight: 800; color: #059669; margin-top: 2px; }
    .secTitle { font-size: 11px; font-weight: 900; text-transform: uppercase; color: #0f172a; background: #f1f5f9; padding: 5px 8px; border-radius: 4px; margin: 14px 0 8px; }
    table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
    th { background: #f8fafc; color: #475569; border-bottom: 1.5px solid #cbd5e1; padding: 6px 8px; font-size: 10px; font-weight: 800; text-transform: uppercase; text-align: left; }
    td { padding: 6px 8px; border-bottom: 1px solid #e2e8f0; }
    .footer { display: flex; justify-content: space-between; font-size: 9.5px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 8px; margin-top: 18px; }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="header">
      <div>
        <div class="title">Apex Trade Solutions</div>
        <div class="period">Executive Business Performance Report • Last 30 Days</div>
      </div>
      <div class="metaCard">
        <div style="font-size: 10px; font-weight: 900; background: #0f172a; color: #fff; padding: 2px 6px; border-radius: 3px; display: inline-block; margin-bottom: 3px;">KPI EXPORT</div>
        <div style="font-size: 10px; color: #64748b;">Generated: Aug 27, 2026</div>
      </div>
    </div>

    <div class="kpiGrid">
      <div class="kpiCard">
        <div class="kpiLabel">Gross Revenue Quoted</div>
        <div class="kpiVal">$142,500</div>
        <div class="kpiDelta">↑ +18% vs prior period</div>
      </div>
      <div class="kpiCard">
        <div class="kpiLabel">Net Cash Collected</div>
        <div class="kpiVal">$98,400</div>
        <div class="kpiDelta">↑ +24% vs prior period</div>
      </div>
      <div class="kpiCard">
        <div class="kpiLabel">Quote Win Rate</div>
        <div class="kpiVal">68.5%</div>
        <div class="kpiDelta">↑ +5.2pp conversion</div>
      </div>
    </div>

    <div class="secTitle">I. REVENUE COLLECTED OVER TIME</div>
    <table>
      <thead>
        <tr><th>Period</th><th style="text-align: right;">Collected</th><th style="text-align: right;">Previous Period</th><th style="text-align: right;">Growth</th></tr>
      </thead>
      <tbody>
        <tr><td>Week 1 (Aug 01 - Aug 07)</td><td style="text-align: right; font-weight: 700;">$24,200</td><td style="text-align: right; color: #64748b;">$19,500</td><td style="text-align: right; color: #059669; font-weight: 800;">+24.1%</td></tr>
        <tr><td>Week 2 (Aug 08 - Aug 14)</td><td style="text-align: right; font-weight: 700;">$28,600</td><td style="text-align: right; color: #64748b;">$21,300</td><td style="text-align: right; color: #059669; font-weight: 800;">+34.3%</td></tr>
        <tr><td>Week 3 (Aug 15 - Aug 21)</td><td style="text-align: right; font-weight: 700;">$22,100</td><td style="text-align: right; color: #64748b;">$20,800</td><td style="text-align: right; color: #059669; font-weight: 800;">+6.3%</td></tr>
        <tr><td>Week 4 (Aug 22 - Aug 27)</td><td style="text-align: right; font-weight: 700;">$23,500</td><td style="text-align: right; color: #64748b;">$17,800</td><td style="text-align: right; color: #059669; font-weight: 800;">+32.0%</td></tr>
        <tr style="background: #f8fafc; border-top: 2px solid #0f172a;">
          <td><strong>TOTAL REVENUE</strong></td><td style="text-align: right; font-weight: 900; color: #0f172a;">$98,400</td><td style="text-align: right; font-weight: 800; color: #64748b;">$79,400</td><td style="text-align: right; font-weight: 900; color: #059669;">+23.9%</td>
        </tr>
      </tbody>
    </table>

    <div class="secTitle">II. SCHEDULE CAPACITY & PAYMENT HEALTH</div>
    <table>
      <thead>
        <tr><th>Operational Indicator</th><th style="text-align: right;">Status / Metric</th><th style="text-align: right;">Benchmark Target</th></tr>
      </thead>
      <tbody>
        <tr><td>Schedule Utilization (Next 14 Days)</td><td style="text-align: right; font-weight: 700; color: #059669;">88.5% Booked</td><td style="text-align: right; color: #64748b;">&gt; 80% Healthy</td></tr>
        <tr><td>Average Days to Payment Settlement</td><td style="text-align: right; font-weight: 700; color: #059669;">1.8 Days</td><td style="text-align: right; color: #64748b;">&lt; 3 Days via LGQ Text-to-Pay</td></tr>
        <tr><td>Aged Receivables (30+ Days Past Due)</td><td style="text-align: right; font-weight: 800; color: #059669;">$0.00</td><td style="text-align: right; color: #64748b;">Zero delinquent float</td></tr>
      </tbody>
    </table>

    <div class="footer">
      <div>✓ Prepared via Let’s Get Quoted • Business Insights Engine</div>
      <div>https://letsgetquoted.com/dashboard/insights</div>
    </div>
  </div>
</body>
</html>`;
}

async function run() {
  console.log('Generating all PDFs and high-res screenshot previews...');

  // 1. Estimate Generator PDF & Screenshot
  execSync(`node scripts/generate-pdf-preview.mjs`);
  console.log('✓ Estimate Generator PDF & Image ready.');

  // 2. Leakage Calculator PDF & Screenshot
  const leakHtml = generateLeakageHtml();
  const leakHtmlPath = path.join(artifactDir, 'leakage-sample.html');
  const leakPdfPath = path.join(artifactDir, 'leakage-sample.pdf');
  const leakImgPath = path.join(artifactDir, 'leakage-pdf-preview.png');
  fs.writeFileSync(leakHtmlPath, leakHtml, 'utf8');
  execSync(`"${browserExe}" --headless --disable-gpu --run-all-compositor-stages-before-draw --print-to-pdf="${leakPdfPath}" "file:///${leakHtmlPath.replace(/\\/g, '/')}"`);
  execSync(`"${browserExe}" --headless --disable-gpu --screenshot="${leakImgPath}" --window-size=950,1280 "file:///${leakHtmlPath.replace(/\\/g, '/')}"`);
  console.log('✓ Leakage Calculator PDF & Image ready.');

  // 3. Hourly Rate Calculator PDF & Screenshot
  const hourlyHtml = generateHourlyRateHtml();
  const hourlyHtmlPath = path.join(artifactDir, 'hourly-rate-sample.html');
  const hourlyPdfPath = path.join(artifactDir, 'hourly-rate-sample.pdf');
  const hourlyImgPath = path.join(artifactDir, 'hourly-rate-pdf-preview.png');
  fs.writeFileSync(hourlyHtmlPath, hourlyHtml, 'utf8');
  execSync(`"${browserExe}" --headless --disable-gpu --run-all-compositor-stages-before-draw --print-to-pdf="${hourlyPdfPath}" "file:///${hourlyHtmlPath.replace(/\\/g, '/')}"`);
  execSync(`"${browserExe}" --headless --disable-gpu --screenshot="${hourlyImgPath}" --window-size=950,1280 "file:///${hourlyHtmlPath.replace(/\\/g, '/')}"`);
  console.log('✓ Hourly Rate Calculator PDF & Image ready.');

  // 4. Invoice PDF & Screenshot
  const invHtml = generateInvoiceHtml();
  const invHtmlPath = path.join(artifactDir, 'invoice-preview.html');
  const invImgPath = path.join(artifactDir, 'invoice-pdf-preview.png');
  fs.writeFileSync(invHtmlPath, invHtml, 'utf8');
  execSync(`"${browserExe}" --headless --disable-gpu --screenshot="${invImgPath}" --window-size=950,1280 "file:///${invHtmlPath.replace(/\\/g, '/')}"`);
  console.log('✓ Invoice PDF Preview ready.');

  // 5. Permit Application PDF Preview
  const permitHtml = generatePermitHtml();
  const permitHtmlPath = path.join(artifactDir, 'permit-preview.html');
  const permitImgPath = path.join(artifactDir, 'permit-pdf-preview.png');
  fs.writeFileSync(permitHtmlPath, permitHtml, 'utf8');
  execSync(`"${browserExe}" --headless --disable-gpu --screenshot="${permitImgPath}" --window-size=950,1280 "file:///${permitHtmlPath.replace(/\\/g, '/')}"`);
  console.log('✓ Permit Application PDF Preview ready.');

  // 6. Lien Waiver PDF Preview
  const lienHtml = generateLienWaiverHtml();
  const lienHtmlPath = path.join(artifactDir, 'lien-waiver-preview.html');
  const lienImgPath = path.join(artifactDir, 'lien-waiver-pdf-preview.png');
  fs.writeFileSync(lienHtmlPath, lienHtml, 'utf8');
  execSync(`"${browserExe}" --headless --disable-gpu --screenshot="${lienImgPath}" --window-size=950,1280 "file:///${lienHtmlPath.replace(/\\/g, '/')}"`);
  console.log('✓ Lien Waiver PDF Preview ready.');

  // 7. Insights Export PDF Preview
  const insHtml = generateInsightsHtml();
  const insHtmlPath = path.join(artifactDir, 'insights-preview.html');
  const insImgPath = path.join(artifactDir, 'insights-pdf-preview.png');
  fs.writeFileSync(insHtmlPath, insHtml, 'utf8');
  execSync(`"${browserExe}" --headless --disable-gpu --screenshot="${insImgPath}" --window-size=950,1280 "file:///${insHtmlPath.replace(/\\/g, '/')}"`);
  console.log('✓ Insights PDF Preview ready.');

  console.log('All PDF showcase files generated successfully!');
}

run();
