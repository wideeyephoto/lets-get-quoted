import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Modern Quote & Deposit Visual</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      width: 2160px;
      height: 1350px;
      overflow: hidden;
      background: #06131c;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #e2e8f0;
      position: relative;
    }

    /* Ambient atmospheric background glows */
    .glow-orange {
      position: absolute;
      top: -80px;
      left: 120px;
      width: 950px;
      height: 750px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(255, 106, 36, 0.25) 0%, transparent 65%);
      filter: blur(85px);
      pointer-events: none;
    }
    .glow-mint {
      position: absolute;
      bottom: -80px;
      right: 120px;
      width: 950px;
      height: 750px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(80, 227, 189, 0.22) 0%, transparent 65%);
      filter: blur(85px);
      pointer-events: none;
    }
    .grid-mesh {
      position: absolute;
      inset: 0;
      background-image: 
        linear-gradient(rgba(255, 255, 255, 0.035) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255, 255, 255, 0.035) 1px, transparent 1px);
      background-size: 54px 54px;
      pointer-events: none;
    }

    .container {
      position: relative;
      width: 100%;
      height: 100%;
      padding: 38px 56px 36px;
      display: flex;
      flex-direction: column;
      gap: 24px;
    }

    /* Top Bar */
    .top-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: rgba(11, 26, 36, 0.85);
      border: 1px solid rgba(255, 106, 36, 0.35);
      border-radius: 18px;
      padding: 16px 32px;
      backdrop-filter: blur(20px);
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
    }
    .brand-pill {
      background: #ff6a24;
      color: #ffffff;
      font-size: 14px;
      font-weight: 900;
      letter-spacing: 0.1em;
      padding: 6px 14px;
      border-radius: 8px;
      text-transform: uppercase;
    }
    .top-title {
      font-size: 21px;
      font-weight: 850;
      color: #f8fafc;
      letter-spacing: 0.02em;
    }
    .top-subtitle {
      font-size: 14px;
      color: #94a3b8;
      font-weight: 550;
    }
    .status-badge {
      display: flex;
      align-items: center;
      gap: 8px;
      background: rgba(80, 227, 189, 0.14);
      border: 1px solid rgba(80, 227, 189, 0.45);
      color: #50e3bd;
      font-size: 14px;
      font-weight: 850;
      padding: 8px 18px;
      border-radius: 30px;
    }
    .status-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #50e3bd;
      box-shadow: 0 0 10px #50e3bd;
    }

    /* Split Screen */
    .flow-split {
      display: grid;
      grid-template-columns: 1.25fr 44px 1fr;
      gap: 22px;
      flex: 1;
      align-items: stretch;
    }

    .panel {
      background: linear-gradient(160deg, rgba(14, 34, 46, 0.94) 0%, rgba(8, 22, 30, 0.98) 100%);
      border-radius: 24px;
      border: 1px solid rgba(255, 255, 255, 0.12);
      padding: 28px 34px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      box-shadow: 0 25px 60px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.15);
      position: relative;
    }
    .panel-builder { border-color: rgba(255, 106, 36, 0.45); }
    .panel-approval { border-color: rgba(80, 227, 189, 0.5); }

    .panel-badge-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .panel-type-tag {
      font-size: 13px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      padding: 5px 14px;
      border-radius: 6px;
    }
    .tag-builder {
      background: rgba(255, 106, 36, 0.18);
      color: #ff9e58;
      border: 1px solid rgba(255, 106, 36, 0.4);
    }
    .tag-approval {
      background: rgba(80, 227, 189, 0.16);
      color: #50e3bd;
      border: 1px solid rgba(80, 227, 189, 0.45);
    }
    .panel-step-label {
      font-size: 13px;
      color: #94a3b8;
      font-weight: 650;
    }
    .panel-title {
      font-size: 26px;
      font-weight: 850;
      color: #ffffff;
      letter-spacing: -0.3px;
    }

    /* Header info block inside panel */
    .job-meta-strip {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: rgba(4, 15, 22, 0.75);
      border: 1px solid rgba(255, 255, 255, 0.09);
      border-radius: 12px;
      padding: 12px 18px;
    }
    .meta-user {
      font-size: 15px;
      font-weight: 800;
      color: #ffffff;
    }
    .meta-sub {
      font-size: 12.5px;
      color: #94a3b8;
    }
    .meta-verified-tag {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      background: rgba(104, 224, 189, 0.12);
      border: 1px solid rgba(104, 224, 189, 0.35);
      color: #8ff0d1;
      font-size: 12px;
      font-weight: 800;
      padding: 4px 10px;
      border-radius: 6px;
    }

    /* Line Items Table */
    .line-items-container {
      display: flex;
      flex-direction: column;
      gap: 9px;
    }
    .line-item-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: rgba(4, 15, 22, 0.8);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 12px;
      padding: 12px 18px;
      gap: 16px;
    }
    .item-left {
      display: flex;
      align-items: center;
      gap: 12px;
      flex: 1;
    }
    .item-bullet {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #ff6a24;
      flex-shrink: 0;
    }
    .item-name {
      font-size: 15px;
      font-weight: 750;
      color: #ffffff;
    }
    .item-detail {
      font-size: 12px;
      color: #94a3b8;
      margin-top: 2px;
    }
    .item-right {
      display: flex;
      align-items: center;
      gap: 14px;
      flex-shrink: 0;
    }
    .item-price {
      font-size: 16px;
      font-weight: 850;
      color: #ffffff;
    }
    .item-pill {
      font-size: 11px;
      font-weight: 850;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      padding: 4px 10px;
      border-radius: 6px;
      background: rgba(255, 255, 255, 0.08);
      color: #cbd5e1;
      border: 1px solid rgba(255, 255, 255, 0.12);
    }

    /* Upgrade Section */
    .upgrades-box {
      background: linear-gradient(135deg, rgba(255, 106, 36, 0.14) 0%, rgba(255, 106, 36, 0.04) 100%);
      border: 1px solid rgba(255, 106, 36, 0.38);
      border-radius: 14px;
      padding: 14px 18px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .upgrades-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .upgrades-title {
      font-size: 12.5px;
      font-weight: 850;
      color: #ff9e58;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .upgrades-note {
      font-size: 12px;
      color: #94a3b8;
    }
    .upgrade-option {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: rgba(4, 15, 22, 0.85);
      border: 1px solid rgba(255, 106, 36, 0.3);
      border-radius: 10px;
      padding: 11px 16px;
    }
    .upgrade-name {
      font-size: 14.5px;
      font-weight: 750;
      color: #ffffff;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .upgrade-tag {
      background: rgba(255, 106, 36, 0.22);
      color: #ff9e58;
      font-size: 10.5px;
      font-weight: 850;
      padding: 2px 7px;
      border-radius: 4px;
      border: 1px solid rgba(255, 106, 36, 0.4);
    }
    .upgrade-price {
      font-size: 15px;
      font-weight: 850;
      color: #ff9e58;
    }

    /* Live Total Strip */
    .quote-total-strip {
      margin-top: auto;
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: linear-gradient(135deg, rgba(255, 106, 36, 0.2) 0%, rgba(255, 106, 36, 0.06) 100%);
      border: 1px solid rgba(255, 106, 36, 0.45);
      border-radius: 14px;
      padding: 15px 22px;
    }
    .total-labels {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .total-title {
      font-size: 12px;
      font-weight: 850;
      color: #ff9e58;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .total-breakdown {
      font-size: 12px;
      color: #cbd5e1;
    }
    .total-sum {
      font-size: 32px;
      font-weight: 900;
      color: #ffffff;
      letter-spacing: -0.5px;
    }

    /* Center Conduit */
    .center-conduit {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 16px;
      position: relative;
    }
    .conduit-line {
      width: 2px;
      height: 100%;
      background: linear-gradient(180deg, transparent, #ff6a24, #50e3bd, transparent);
      position: relative;
    }
    .conduit-badge {
      background: #0d222f;
      border: 2px solid #50e3bd;
      color: #50e3bd;
      width: 44px;
      height: 44px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      font-size: 18px;
      box-shadow: 0 0 20px rgba(80, 227, 189, 0.5);
      z-index: 2;
    }

    /* Right Panel (Homeowner Approval & Stripe) */
    .approval-status-hero {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: rgba(4, 18, 26, 0.88);
      border: 1px solid rgba(80, 227, 189, 0.4);
      border-radius: 15px;
      padding: 16px 22px;
    }
    .approval-badge-main {
      font-size: 24px;
      font-weight: 900;
      color: #50e3bd;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .approval-sub {
      font-size: 13px;
      color: #94a3b8;
      font-weight: 600;
    }
    .approved-pill {
      font-size: 13px;
      font-weight: 900;
      color: #ffffff;
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      padding: 7px 16px;
      border-radius: 8px;
      box-shadow: 0 4px 14px rgba(16, 185, 129, 0.4);
      letter-spacing: 0.05em;
    }

    /* Terms Card */
    .terms-box {
      background: rgba(4, 15, 22, 0.75);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 13px;
      padding: 14px 18px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .terms-header {
      font-size: 12px;
      font-weight: 850;
      color: #7dd3fc;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .terms-choice {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 14.5px;
      font-weight: 750;
      color: #ffffff;
    }
    .radio-mint {
      width: 16px;
      height: 16px;
      border-radius: 50%;
      border: 4px solid #50e3bd;
      background: #ffffff;
    }
    .terms-sub {
      font-size: 12px;
      color: #94a3b8;
      margin-left: 26px;
    }

    /* E-Signature Box */
    .signature-card {
      background: rgba(6, 20, 28, 0.9);
      border: 1px solid rgba(80, 227, 189, 0.35);
      border-radius: 13px;
      padding: 15px 18px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .sig-label {
      font-size: 11.5px;
      font-weight: 850;
      color: #7dd3fc;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }
    .sig-script-box {
      background: rgba(255, 255, 255, 0.04);
      border: 1px dashed rgba(80, 227, 189, 0.4);
      border-radius: 8px;
      padding: 10px 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .sig-name {
      font-size: 22px;
      font-family: "Georgia", serif;
      font-style: italic;
      font-weight: bold;
      color: #ffffff;
    }
    .sig-badge {
      font-size: 11.5px;
      font-weight: 800;
      color: #50e3bd;
      background: rgba(80, 227, 189, 0.12);
      padding: 4px 8px;
      border-radius: 4px;
    }
    .sig-meta-row {
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      color: #94a3b8;
      font-weight: 600;
    }

    /* Stripe Deposit Receipt */
    .deposit-cleared-banner {
      background: linear-gradient(135deg, rgba(80, 227, 189, 0.15) 0%, rgba(80, 227, 189, 0.04) 100%);
      border: 1px solid rgba(80, 227, 189, 0.45);
      border-radius: 13px;
      padding: 14px 18px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .deposit-info {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .dep-title {
      font-size: 14.5px;
      font-weight: 850;
      color: #ffffff;
    }
    .dep-sub {
      font-size: 12px;
      color: #a7f3d0;
    }
    .dep-amount {
      font-size: 22px;
      font-weight: 900;
      color: #50e3bd;
    }

    /* Actions */
    .action-row {
      margin-top: auto;
      display: flex;
      gap: 14px;
    }
    .btn-primary {
      flex: 1.3;
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      color: #ffffff;
      font-size: 16px;
      font-weight: 850;
      border: none;
      border-radius: 12px;
      padding: 15px;
      text-align: center;
      box-shadow: 0 8px 22px rgba(16, 185, 129, 0.38);
    }
    .btn-secondary {
      flex: 1;
      background: rgba(255, 255, 255, 0.08);
      color: #e2e8f0;
      font-size: 15px;
      font-weight: 750;
      border: 1px solid rgba(255, 255, 255, 0.16);
      border-radius: 12px;
      padding: 15px;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="glow-orange"></div>
  <div class="glow-mint"></div>
  <div class="grid-mesh"></div>

  <div class="container">
    <!-- Top Bar -->
    <div class="top-bar">
      <div style="display:flex; align-items:center; gap:18px;">
        <span class="brand-pill">Let's Get Quoted</span>
        <div>
          <div class="top-title">✦ ITEMIZED QUOTE BUILDER &amp; HOMEOWNER APPROVAL ENGINE</div>
          <div class="top-subtitle">Priced from your saved Price Book · Interactive upgrades · Typed e-signature &amp; Stripe deposit</div>
        </div>
      </div>
      <div class="status-badge">
        <span class="status-dot"></span>
        <span>Quote #2081 · Connected to Taylor Vance</span>
      </div>
    </div>

    <!-- Main Split -->
    <div class="flow-split">
      <!-- Left: Quote Builder -->
      <div class="panel panel-builder">
        <div class="panel-badge-row">
          <span class="panel-type-tag tag-builder">Contractor Quote Builder</span>
          <span class="panel-step-label">Step 1 of 2 · Price Book Lines &amp; Upgrades</span>
        </div>

        <h2 class="panel-title">Itemized Price Book Scope</h2>

        <!-- Job Meta Strip -->
        <div class="job-meta-strip">
          <div>
            <div class="meta-user">Taylor Vance · 124 Main St, Royal Oak, MI</div>
            <div class="meta-sub">200A Service Upgrade + Tesla Wall Connector</div>
          </div>
          <span class="meta-verified-tag">✓ All Lines In Price Book</span>
        </div>

        <!-- 4 Line Items -->
        <div class="line-items-container">
          <div class="line-item-row">
            <div class="item-left">
              <span class="item-bullet"></span>
              <div>
                <div class="item-name">200A Square D QO Main Breaker Panel &amp; Service Disconnect</div>
                <div class="item-detail">40 spaces, copper bus, outdoor rated, includes permits &amp; utility disconnect</div>
              </div>
            </div>
            <div class="item-right">
              <span class="item-price">$2,850.00</span>
              <span class="item-pill">INCLUDED</span>
            </div>
          </div>

          <div class="line-item-row">
            <div class="item-left">
              <span class="item-bullet"></span>
              <div>
                <div class="item-name">48A Level 2 Tesla Wall Connector Dedicated 60A Circuit</div>
                <div class="item-detail">Heavy-gauge copper run (up to 40 ft), NEMA conduit, hardwired &amp; load-tested</div>
              </div>
            </div>
            <div class="item-right">
              <span class="item-price">$1,450.00</span>
              <span class="item-pill">INCLUDED</span>
            </div>
          </div>

          <div class="line-item-row">
            <div class="item-left">
              <span class="item-bullet"></span>
              <div>
                <div class="item-name">Type 2 Whole-Home Surge Protection System</div>
                <div class="item-detail">Eaton CHSP Ultra unit, panel integrated, protects sensitive EV electronics</div>
              </div>
            </div>
            <div class="item-right">
              <span class="item-price">$450.00</span>
              <span class="item-pill">INCLUDED</span>
            </div>
          </div>

          <div class="line-item-row">
            <div class="item-left">
              <span class="item-bullet"></span>
              <div>
                <div class="item-name">Licensed Master Electrician Labor &amp; DTE Utility Coordination</div>
                <div class="item-detail">Code compliance guarantee, rough &amp; final inspections, old Zinsco panel disposal</div>
              </div>
            </div>
            <div class="item-right">
              <span class="item-price">$4,200.00</span>
              <span class="item-pill">INCLUDED</span>
            </div>
          </div>
        </div>

        <!-- Optional Upgrades Box -->
        <div class="upgrades-box">
          <div class="upgrades-header">
            <span class="upgrades-title">⭐ Optional Upgrades (Updates Homeowner Total)</span>
            <span class="upgrades-note">Customer picks; price updates live</span>
          </div>
          <div class="upgrade-option">
            <span class="upgrade-name">
              <span>Generator Interlock Kit &amp; 30A Outdoor Inlet</span>
              <span class="upgrade-tag">RECOMMENDED</span>
            </span>
            <span class="upgrade-price">+$850.00 [PRE-SELECTED]</span>
          </div>
        </div>

        <!-- Live Total -->
        <div class="quote-total-strip">
          <div class="total-labels">
            <div class="total-title">Approved Quote Total</div>
            <div class="total-breakdown">Base $8,950.00 + Generator Upgrade $850.00</div>
          </div>
          <div class="total-sum">$9,800.00</div>
        </div>
      </div>

      <!-- Conduit -->
      <div class="center-conduit">
        <div class="conduit-line"></div>
        <div class="conduit-badge">✓</div>
        <div class="conduit-line"></div>
      </div>

      <!-- Right: Homeowner Approval & Deposit -->
      <div class="panel panel-approval">
        <div class="panel-badge-row">
          <span class="panel-type-tag tag-approval">Homeowner Approval &amp; Deposit</span>
          <span class="panel-step-label">Signed on Mobile · E-Signature</span>
        </div>

        <h2 class="panel-title">Approved &amp; Deposit Funded</h2>

        <!-- Approval Hero Banner -->
        <div class="approval-status-hero">
          <div>
            <div class="approval-badge-main">
              <span>✓ Quote Approved</span>
            </div>
            <div class="approval-sub">Accepted scope with recommended upgrade</div>
          </div>
          <div class="approved-pill">APPROVED &middot; E-SIGNED</div>
        </div>

        <!-- Payment Terms Box -->
        <div class="terms-box">
          <span class="terms-header">Selected Payment Terms</span>
          <div class="terms-choice">
            <span class="radio-mint"></span>
            25% Deposit Now ($2,450.00) · Balance Due on Completion ($7,350.00)
          </div>
          <div class="terms-sub">⚡ Funds processed via Stripe on instant payout schedule</div>
        </div>

        <!-- Typed E-Signature -->
        <div class="signature-card">
          <span class="sig-label">Typed Homeowner E-Signature</span>
          <div class="sig-script-box">
            <span class="sig-name">Taylor Vance</span>
            <span class="sig-badge">✓ Legal Signature</span>
          </div>
          <div class="sig-meta-row">
            <span>Timestamp: Tue, May 18 · 2:14 PM EDT</span>
            <span>IP: 73.182.xx.xx (Verified)</span>
          </div>
        </div>

        <!-- Stripe Deposit Cleared -->
        <div class="deposit-cleared-banner">
          <div class="deposit-info">
            <div class="dep-title">💳 Deposit Funded &amp; Locked</div>
            <div class="dep-sub">Cleared via Stripe · Apple Pay (Visa ending in 8042)</div>
          </div>
          <div class="dep-amount">$2,450.00</div>
        </div>

        <!-- Actions -->
        <div class="action-row">
          <div class="btn-primary">📅 Schedule Crew &amp; Arrival Windows →</div>
          <div class="btn-secondary">📄 View PDF Copy</div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;

fs.writeFileSync('scripts/render-quote.html', html, 'utf8');
console.log('Saved scripts/render-quote.html');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 2160, height: 1350 });

  const filePath = 'file:///' + path.resolve('scripts/render-quote.html').replace(/\\/g, '/');
  console.log('Loading ' + filePath);
  await page.goto(filePath, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  const outputPath = 'public/features/quote-builder-modern.png';
  await page.screenshot({ path: outputPath, fullPage: true });
  console.log('Saved ' + outputPath);

  await browser.close();
})();
