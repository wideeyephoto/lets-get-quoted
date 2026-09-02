import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';

const imgBase64 = fs.readFileSync('public/images/ai-vision/electrical-panel.jpg').toString('base64');
const imgSrc = 'data:image/jpeg;base64,' + imgBase64;

const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Smart Intake Qualification Visual</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
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
      top: -100px;
      left: 100px;
      width: 900px;
      height: 700px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(255, 106, 36, 0.22) 0%, transparent 65%);
      filter: blur(80px);
      pointer-events: none;
    }
    .glow-mint {
      position: absolute;
      bottom: -100px;
      right: 150px;
      width: 950px;
      height: 750px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(80, 227, 189, 0.18) 0%, transparent 65%);
      filter: blur(80px);
      pointer-events: none;
    }

    /* Subtle grid mesh */
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
      padding: 48px 64px 44px;
      display: flex;
      flex-direction: column;
      gap: 36px;
    }

    /* Top Navigation / Status Header */
    .top-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: rgba(11, 26, 36, 0.75);
      border: 1px solid rgba(255, 106, 36, 0.3);
      border-radius: 18px;
      padding: 18px 32px;
      backdrop-filter: blur(20px);
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
    }
    .top-left {
      display: flex;
      align-items: center;
      gap: 18px;
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
      font-size: 20px;
      font-weight: 850;
      color: #f8fafc;
      letter-spacing: 0.02em;
    }
    .top-subtitle {
      font-size: 14px;
      color: #94a3b8;
      font-weight: 550;
    }
    .top-right {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .status-badge {
      display: flex;
      align-items: center;
      gap: 8px;
      background: rgba(80, 227, 189, 0.12);
      border: 1px solid rgba(80, 227, 189, 0.4);
      color: #50e3bd;
      font-size: 14px;
      font-weight: 800;
      padding: 8px 18px;
      border-radius: 30px;
      letter-spacing: 0.03em;
    }
    .status-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #50e3bd;
      box-shadow: 0 0 10px #50e3bd;
    }

    /* Main Split Screen Flow */
    .flow-split {
      display: grid;
      grid-template-columns: 1fr 50px 1.15fr;
      gap: 24px;
      flex: 1;
      align-items: stretch;
    }

    /* Card Panels */
    .panel {
      background: linear-gradient(160deg, rgba(14, 34, 46, 0.92) 0%, rgba(8, 22, 30, 0.96) 100%);
      border-radius: 24px;
      border: 1px solid rgba(255, 255, 255, 0.12);
      padding: 34px 38px;
      display: flex;
      flex-direction: column;
      gap: 22px;
      box-shadow: 0 25px 60px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.15);
      position: relative;
    }

    .panel-homeowner {
      border-color: rgba(255, 106, 36, 0.4);
    }
    .panel-contractor {
      border-color: rgba(80, 227, 189, 0.45);
    }

    .panel-badge-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .panel-type-tag {
      font-size: 12px;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      padding: 5px 12px;
      border-radius: 6px;
    }
    .tag-homeowner {
      background: rgba(255, 106, 36, 0.16);
      color: #ff9e58;
      border: 1px solid rgba(255, 106, 36, 0.35);
    }
    .tag-contractor {
      background: rgba(80, 227, 189, 0.15);
      color: #50e3bd;
      border: 1px solid rgba(80, 227, 189, 0.4);
    }
    .panel-step-label {
      font-size: 13px;
      color: #94a3b8;
      font-weight: 600;
    }

    .panel-title {
      font-size: 26px;
      font-weight: 850;
      color: #ffffff;
      line-height: 1.25;
    }

    /* Homeowner Questions & Answers */
    .question-block {
      background: rgba(4, 15, 22, 0.7);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 14px;
      padding: 16px 20px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .q-label {
      font-size: 13px;
      color: #7dd3fc;
      font-weight: 750;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .q-answer {
      font-size: 16px;
      font-weight: 700;
      color: #ffffff;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .q-radio {
      width: 18px;
      height: 18px;
      border-radius: 50%;
      border: 5px solid #ff6a24;
      background: #ffffff;
    }

    /* Photo Upload Area in Form */
    .photo-upload-box {
      background: rgba(4, 15, 22, 0.7);
      border: 1px solid rgba(255, 106, 36, 0.28);
      border-radius: 16px;
      padding: 16px 20px;
      display: flex;
      gap: 20px;
      align-items: center;
    }
    .photo-thumb-wrap {
      position: relative;
      width: 140px;
      height: 110px;
      border-radius: 10px;
      overflow: hidden;
      border: 2px solid rgba(255, 106, 36, 0.5);
      flex-shrink: 0;
    }
    .photo-thumb-wrap img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .photo-tag {
      position: absolute;
      bottom: 0;
      inset-inline: 0;
      background: rgba(0, 0, 0, 0.85);
      font-size: 10px;
      font-weight: 800;
      color: #ff9e58;
      text-align: center;
      padding: 3px 4px;
    }
    .photo-meta {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .photo-title {
      font-size: 15px;
      font-weight: 800;
      color: #ffffff;
    }
    .photo-desc {
      font-size: 13px;
      color: #94a3b8;
      line-height: 1.4;
    }
    .photo-ai-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      color: #50e3bd;
      font-weight: 750;
      background: rgba(80, 227, 189, 0.12);
      padding: 3px 8px;
      border-radius: 4px;
      border: 1px solid rgba(80, 227, 189, 0.3);
      width: fit-content;
    }

    /* Verification Box */
    .verification-box {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: rgba(16, 185, 129, 0.08);
      border: 1px solid rgba(16, 185, 129, 0.35);
      border-radius: 14px;
      padding: 14px 20px;
    }
    .verified-user {
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .verified-name {
      font-size: 15px;
      font-weight: 800;
      color: #ffffff;
    }
    .verified-location {
      font-size: 13px;
      color: #a7f3d0;
    }
    .verified-pill {
      font-size: 12px;
      font-weight: 850;
      color: #10b981;
      background: rgba(16, 185, 129, 0.16);
      padding: 6px 12px;
      border-radius: 20px;
      border: 1px solid rgba(16, 185, 129, 0.4);
    }

    /* Estimate Banner */
    .estimate-range-banner {
      margin-top: auto;
      background: linear-gradient(135deg, rgba(255, 106, 36, 0.18) 0%, rgba(255, 106, 36, 0.06) 100%);
      border: 1px solid rgba(255, 106, 36, 0.45);
      border-radius: 16px;
      padding: 18px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .est-label {
      font-size: 12px;
      font-weight: 850;
      color: #ff9e58;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .est-aside {
      font-size: 12px;
      color: #cbd5e1;
    }
    .est-amount {
      font-size: 30px;
      font-weight: 900;
      color: #ffffff;
      letter-spacing: -0.5px;
    }

    /* Center Connector Conduit */
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

    /* Contractor Scored Brief Components */
    .brief-score-hero {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: rgba(4, 18, 26, 0.85);
      border: 1px solid rgba(80, 227, 189, 0.35);
      border-radius: 16px;
      padding: 18px 22px;
    }
    .score-badge-main {
      font-size: 26px;
      font-weight: 900;
      color: #50e3bd;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .score-sub {
      font-size: 13px;
      color: #94a3b8;
      font-weight: 600;
    }
    .score-tier-pill {
      font-size: 14px;
      font-weight: 900;
      color: #ffffff;
      background: linear-gradient(135deg, #ea580c 0%, #c2410c 100%);
      padding: 7px 16px;
      border-radius: 8px;
      box-shadow: 0 4px 14px rgba(234, 88, 12, 0.4);
    }

    /* Qualification Rules Grid */
    .rules-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }
    .rule-item {
      background: rgba(15, 34, 46, 0.7);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 12px;
      padding: 12px 16px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .rule-title {
      font-size: 11.5px;
      font-weight: 850;
      color: #7dd3fc;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .rule-value {
      font-size: 14px;
      font-weight: 750;
      color: #f1f5f9;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .check-green {
      color: #50e3bd;
      font-weight: 900;
    }

    /* Diagnostic AI Summary Box */
    .ai-diagnostic-card {
      background: rgba(6, 20, 28, 0.9);
      border-left: 4px solid #50e3bd;
      border-radius: 0 14px 14px 0;
      padding: 18px 22px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .ai-head {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      font-weight: 850;
      color: #50e3bd;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .ai-body {
      font-size: 14.5px;
      line-height: 1.5;
      color: #cbd5e1;
      font-weight: 550;
    }

    .line-items-preview {
      background: rgba(4, 15, 22, 0.75);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 13px;
      padding: 13px 18px;
      display: flex;
      flex-direction: column;
      gap: 7px;
    }
    .preview-header {
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      font-weight: 850;
      color: #7dd3fc;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .item-row {
      display: flex;
      justify-content: space-between;
      font-size: 13px;
      color: #e2e8f0;
      font-weight: 600;
      padding-bottom: 4px;
      border-bottom: 1px dashed rgba(255, 255, 255, 0.08);
    }
    .item-row:last-child {
      border-bottom: none;
      padding-bottom: 0;
    }

    /* Action Buttons in Brief */
    .action-row {
      margin-top: auto;
      display: flex;
      gap: 14px;
    }
    .btn-primary {
      flex: 1.2;
      background: linear-gradient(135deg, #ff6a24 0%, #d94f06 100%);
      color: #ffffff;
      font-size: 16px;
      font-weight: 850;
      border: none;
      border-radius: 12px;
      padding: 16px;
      text-align: center;
      box-shadow: 0 8px 22px rgba(255, 106, 36, 0.38);
    }
    .btn-secondary {
      flex: 1;
      background: rgba(255, 255, 255, 0.08);
      color: #e2e8f0;
      font-size: 15px;
      font-weight: 750;
      border: 1px solid rgba(255, 255, 255, 0.16);
      border-radius: 12px;
      padding: 16px;
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
      <div class="top-left">
        <span class="brand-pill">Let's Get Quoted</span>
        <div>
          <div class="top-title">✦ SMART INTAKE QUALIFICATION ENGINE · TRADE-SPECIFIC SCOPE TO CONTRACTOR BRIEF</div>
          <div class="top-subtitle">Collects exact electrical trade specs, attached photos, and verified customer contact before phone calls</div>
        </div>
      </div>
      <div class="top-right">
        <div class="status-badge">
          <span class="status-dot"></span>
          <span>94% Service Fit · Royal Oak In-Territory</span>
        </div>
      </div>
    </div>

    <!-- Main Split -->
    <div class="flow-split">
      <!-- Left: Homeowner View -->
      <div class="panel panel-homeowner">
        <div class="panel-badge-row">
          <span class="panel-type-tag tag-homeowner">1 · Homeowner Experience (Your Website)</span>
          <span class="panel-step-label">Step 3 of 4 · Photo &amp; Scope Details</span>
        </div>

        <h2 class="panel-title">Contractor Website Smart Intake Form</h2>

        <!-- Question 1: Trade Scope -->
        <div class="question-block">
          <span class="q-label">Trade-Specific Scope Selection</span>
          <div class="q-answer">
            <span class="q-radio"></span>
            200A Main Service Upgrade + Level 2 EV Charger
          </div>
        </div>

        <!-- Question 2: Trade Sub-question -->
        <div class="question-block">
          <span class="q-label">Current Service Configuration</span>
          <div class="q-answer">
            100A Zinsco panel in basement (frequently tripping, no space left)
          </div>
        </div>

        <!-- Photo Upload Box with Real Photo -->
        <div class="photo-upload-box">
          <div class="photo-thumb-wrap">
            <img src="${imgSrc}" alt="Zinsco 100A panel photo uploaded by customer" />
            <span class="photo-tag">PHOTO ATTACHED</span>
          </div>
          <div class="photo-meta">
            <div class="photo-title">breaker-panel-interior.jpg (2.4 MB)</div>
            <div class="photo-desc">Homeowner snapped breaker box inside laundry room.</div>
            <div class="photo-ai-badge">✓ AI Vision: 100A Zinsco Panel Detected</div>
          </div>
        </div>

        <!-- Question 3: Timeline & Urgency -->
        <div class="question-block">
          <span class="q-label">Project Timeline &amp; Urgency</span>
          <div class="q-answer">
            ⚡ Within 30 days (Tesla delivery scheduled next week)
          </div>
        </div>

        <!-- Verification Box -->
        <div class="verification-box">
          <div class="verified-user">
            <span class="verified-name">Taylor Vance · (248) 555-0198</span>
            <span class="verified-location">📍 124 Main St, Royal Oak, MI</span>
          </div>
          <span class="verified-pill">✓ SMS Verified Phone</span>
        </div>

        <!-- Homeowner Range -->
        <div class="estimate-range-banner">
          <div>
            <div class="est-label">Preliminary Instant Estimate Range</div>
            <div class="est-aside">Generated from your price rules · Scope subject to review</div>
          </div>
          <div class="est-amount">$8,000–$9,500</div>
        </div>
      </div>

      <!-- Center Connector -->
      <div class="center-conduit">
        <div class="conduit-line"></div>
        <div class="conduit-badge">⚡</div>
        <div class="conduit-line"></div>
      </div>

      <!-- Right: Contractor Brief -->
      <div class="panel panel-contractor">
        <div class="panel-badge-row">
          <span class="panel-type-tag tag-contractor">2 · Contractor Priority Inbox (Live Job Record)</span>
          <span class="panel-step-label">Instant Notification &middot; 1.8s Response</span>
        </div>

        <h2 class="panel-title">Organized, Scored Contractor Brief</h2>

        <!-- Score Banner -->
        <div class="brief-score-hero">
          <div>
            <div class="score-badge-main">
              <span>⚡ 94% Service Fit</span>
            </div>
            <div class="score-sub">Matches 200A panel replacement playbook</div>
          </div>
          <div class="score-tier-pill">🔥 HOT LEAD · PRIORITY</div>
        </div>

        <!-- Rules Checklist -->
        <div class="rules-grid">
          <div class="rule-item">
            <span class="rule-title">1. Service Area Match</span>
            <span class="rule-value"><span class="check-green">✓</span> Royal Oak (Core Zone · 3.8 mi)</span>
          </div>
          <div class="rule-item">
            <span class="rule-title">2. Minimum Job Size</span>
            <span class="rule-value"><span class="check-green">✓</span> $8,000 &gt; $500 Minimum</span>
          </div>
          <div class="rule-item">
            <span class="rule-title">3. Excluded Work Check</span>
            <span class="rule-value"><span class="check-green">✓</span> No knob &amp; tube detected</span>
          </div>
          <div class="rule-item">
            <span class="rule-title">4. Phone Verified</span>
            <span class="rule-value"><span class="check-green">✓</span> Real homeowner confirmed</span>
          </div>
        </div>

        <!-- AI Diagnostic Box -->
        <div class="ai-diagnostic-card">
          <div class="ai-head">
            <span>🤖 AI Diagnostics &amp; Scope Summary</span>
          </div>
          <div class="ai-body">
            Customer is purchasing an EV and needs 48A circuit. Existing 100A Zinsco panel is maxed out and obsolete. Needs 200A copper feeder upgrade, Square D 40-space panel, and whole-home surge protector. Quote draft #2081 pre-assembled with your saved Price Book line items.
          </div>
        <!-- Pre-Staged Price Book Line Items -->
        <div class="line-items-preview">
          <div class="preview-header">
            <span>Pre-Staged Price Book Items</span>
            <span style="color:#50e3bd; font-weight:900;">$8,950.00 Total</span>
          </div>
          <div class="item-row">
            <span>• 200A Square D QO Main Breaker Panel &amp; Service Disconnect</span>
            <span>$2,850.00</span>
          </div>
          <div class="item-row">
            <span>• 48A Level 2 Tesla Wall Connector Dedicated 60A Circuit</span>
            <span>$1,450.00</span>
          </div>
          <div class="item-row">
            <span>• Type 2 Whole-Home Surge Protection System</span>
            <span>$450.00</span>
          </div>
          <div class="item-row">
            <span>• City Permit, Utility Coordination &amp; Master Electrician Labor</span>
            <span>$4,200.00</span>
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="action-row">
          <div class="btn-primary">⚡ Send Pre-Staged Quote ($8,950) →</div>
          <div class="btn-secondary">📅 Offer 3 Arrival Windows</div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;

fs.writeFileSync('scripts/render-smart-intake.html', htmlContent, 'utf8');
console.log('Saved scripts/render-smart-intake.html');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 2160, height: 1350 });

  const filePath = 'file:///' + path.resolve('scripts/render-smart-intake.html').replace(/\\\\/g, '/');
  console.log('Loading ' + filePath);
  await page.goto(filePath, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  const outputPath = 'public/features/smart-intake-qualification.png';
  await page.screenshot({ path: outputPath, fullPage: true });
  console.log('Saved ' + outputPath);

  await browser.close();
})();
