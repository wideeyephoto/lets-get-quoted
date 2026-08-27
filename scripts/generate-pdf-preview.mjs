import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const artifactDir = 'C:\\Users\\brett\\.gemini\\antigravity-ide\\brain\\c8e32158-4d20-43a6-9f3a-bf504d9f703e';

// Build standalone HTML template reflecting the exact perfected PDF layout
const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Apex Trade Solutions - Estimate EST-2026-104</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@500;700&display=swap');

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #ffffff;
      color: #0f172a;
      padding: 32px 40px;
      -webkit-font-smoothing: antialiased;
      line-height: 1.5;
    }

    .estimateSheet {
      max-width: 800px;
      margin: 0 auto;
      background: #ffffff;
    }

    /* Top Row: Business Branding Header + Estimate Metadata */
    .estimateTopRow {
      display: flex;
      flex-direction: row;
      justify-content: space-between;
      align-items: flex-start;
      gap: 20px;
      padding-bottom: 16px;
      border-bottom: 2px solid #0f172a;
      margin-bottom: 16px;
    }

    .printHeaderCompany {
      display: flex;
      flex-direction: column;
      flex: 1;
    }

    .printCompanyName {
      font-size: 24px;
      font-weight: 900;
      color: #0f172a;
      letter-spacing: -0.5px;
      margin: 0 0 4px 0;
      line-height: 1.15;
    }

    .printCompanyContact {
      font-size: 11.5px;
      font-weight: 600;
      color: #475569;
      line-height: 1.4;
    }

    .printMetaCard {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      border: 1.5px solid #cbd5e1;
      border-radius: 8px;
      padding: 10px 14px;
      background: #f8fafc;
      min-width: 190px;
      text-align: right;
    }

    .printDocBadge {
      display: inline-block;
      font-size: 11px;
      font-weight: 900;
      letter-spacing: 0.8px;
      text-transform: uppercase;
      background: #0f172a;
      color: #ffffff;
      padding: 3px 8px;
      border-radius: 4px;
      margin-bottom: 6px;
    }

    .printMetaGrid {
      display: flex;
      flex-direction: column;
      gap: 3px;
      width: 100%;
    }

    .printMetaRow {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      font-size: 11px;
      color: #475569;
    }

    .printMetaKey {
      font-weight: 700;
      color: #64748b;
      font-size: 10px;
    }

    .printMetaVal {
      font-weight: 800;
      color: #0f172a;
      font-family: 'JetBrains Mono', monospace;
    }

    /* Client & Job Site Section */
    .printClientSection {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 20px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 12px 16px;
      margin-bottom: 16px;
    }

    .printClientCol {
      flex: 1;
    }

    .printSectionLabel {
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      color: #64748b;
      display: block;
      margin-bottom: 4px;
    }

    .printClientName {
      font-size: 15px;
      font-weight: 800;
      color: #0f172a;
      margin-bottom: 2px;
    }

    .printClientAddr {
      font-size: 12.5px;
      color: #334155;
      font-weight: 500;
    }

    .printProjectTrade {
      font-size: 13px;
      font-weight: 800;
      color: #ea580c;
    }

    .printProjectNotes {
      font-size: 11px;
      color: #64748b;
      font-style: italic;
    }

    /* Scope of Work Table */
    .estimateTable {
      width: 100%;
      margin: 14px 0;
      border-collapse: collapse;
    }

    .estimateTable th {
      background: #f1f5f9;
      color: #1e293b;
      border-bottom: 2px solid #cbd5e1;
      padding: 8px 10px;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      text-align: left;
    }

    .estimateTable td {
      border-bottom: 1px solid #e2e8f0;
      padding: 10px;
      font-size: 12.5px;
      color: #0f172a;
    }

    .printItemTitle {
      font-size: 13px;
      font-weight: 700;
      color: #0f172a;
    }

    .printCategoryPill {
      display: inline-block;
      font-size: 10px;
      font-weight: 750;
      color: #334155;
      background: #e2e8f0;
      border-radius: 4px;
      padding: 2px 7px;
    }

    .categoryLabor { background: #e0f2fe; color: #0369a1; }
    .categoryMaterial { background: #fef3c7; color: #92400e; }
    .categoryEquipment { background: #f3e8ff; color: #6b21a8; }
    .categoryPermit { background: #dcfce7; color: #15803d; }
    .categoryDiscount { background: #fee2e2; color: #b91c1c; }

    /* Terms, Milestones & Totals Grid */
    .termsAndTotalsGrid {
      display: grid;
      grid-template-columns: 1.2fr 0.8fr;
      gap: 18px;
      margin-top: 14px;
    }

    .printTermsBlock {
      border: 1px solid #e2e8f0;
      background: #fafbfc;
      border-radius: 8px;
      padding: 10px 14px;
      margin-bottom: 10px;
    }

    .printTermsContent {
      font-size: 11px;
      line-height: 1.45;
      color: #334155;
      margin: 4px 0 0 0;
    }

    .milestoneScheduleBox {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 10px 14px;
      margin-top: 10px;
    }

    .milestoneRow {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11.5px;
      color: #475569;
      padding: 5px 0;
      border-bottom: 1px dashed #e2e8f0;
    }

    .milestoneRow:last-child {
      border-bottom: none;
    }

    .totalsBox {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 12px 16px;
    }

    .totalLine {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 12.5px;
      padding: 4px 0;
      color: #475569;
    }

    .totalGrand {
      border-top: 2px solid #0f172a;
      margin-top: 8px;
      padding-top: 8px;
      font-size: 15px;
      font-weight: 900;
      color: #0f172a;
    }

    .depositLine {
      background: #ecfdf5;
      border: 1px solid #a7f3d0;
      border-radius: 6px;
      padding: 6px 10px;
      margin-top: 8px;
      color: #065f46;
      font-weight: 800;
      font-size: 12px;
    }

    /* Client Authorization & Acceptance Section */
    .acceptanceSection {
      margin-top: 20px;
      padding-top: 14px;
      border-top: 1.5px solid #0f172a;
    }

    .acceptanceNotice {
      font-size: 10.5px;
      color: #475569;
      margin-bottom: 14px;
      line-height: 1.4;
    }

    .signatureGrid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
    }

    .signatureCol {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .signatureLine {
      border-bottom: 1.5px solid #0f172a;
      height: 28px;
      margin-bottom: 4px;
    }

    .signatureLabel {
      font-size: 10.5px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #0f172a;
    }

    .signatureMetaRow {
      display: flex;
      justify-content: space-between;
      font-size: 9.5px;
      color: #64748b;
      font-weight: 600;
      margin-top: 4px;
    }

    /* Document Footer */
    .printFooter {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 9.5px;
      font-weight: 600;
      color: #94a3b8;
      border-top: 1px solid #e2e8f0;
      padding-top: 8px;
      margin-top: 16px;
    }

    @media print {
      @page {
        margin: 0.35in;
        size: auto;
      }
      body {
        padding: 0;
      }
      .estimateSheet, .estimateTopRow, .printClientSection, .estimateTable tr, .totalsBox, .termsAndTotalsGrid, .milestoneScheduleBox, .acceptanceSection, .printFooter {
        break-inside: avoid !important;
        page-break-inside: avoid !important;
      }
    }
  </style>
</head>
<body>
  <div class="estimateSheet">
    <!-- Top Row: Business Branding Header + Estimate Metadata -->
    <div class="estimateTopRow">
      <div class="printHeaderCompany">
        <h1 class="printCompanyName">Apex Trade Solutions</h1>
        <div class="printCompanyContact">
          (555) 382-9011 &bull; service@apextrades.com &bull; License # LIC-948201-A
        </div>
      </div>

      <div class="printMetaCard">
        <div class="printDocBadge">ESTIMATE</div>
        <div class="printMetaGrid">
          <div class="printMetaRow">
            <span class="printMetaKey">REF #:</span>
            <span class="printMetaVal">EST-2026-104</span>
          </div>
          <div class="printMetaRow">
            <span class="printMetaKey">DATE:</span>
            <span class="printMetaVal">Aug 27, 2026</span>
          </div>
          <div class="printMetaRow">
            <span class="printMetaKey">VALIDITY:</span>
            <span class="printMetaVal">30 Days</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Client & Job Site Specification Section -->
    <div class="printClientSection">
      <div class="printClientCol">
        <span class="printSectionLabel">PREPARED FOR:</span>
        <div class="printClientName">Sarah Jenkins</div>
        <div class="printClientAddr">211 S Williams St, Royal Oak, MI 48067</div>
      </div>
      <div class="printClientCol" style="text-align: right;">
        <span class="printSectionLabel">TRADE / SCOPE SPECIFICATION:</span>
        <div class="printProjectTrade">ROOFING SERVICE</div>
        <div class="printProjectNotes">Pitch Spec: 6/12 Architectural Tear-off &amp; Rebuild</div>
      </div>
    </div>

    <!-- Scope of Work Table -->
    <table class="estimateTable">
      <thead>
        <tr>
          <th style="width: 48%;">Description</th>
          <th style="width: 14%;">Category</th>
          <th style="width: 10%; text-align: center;">Qty</th>
          <th style="width: 14%; text-align: right;">Unit Price ($)</th>
          <th style="width: 14%; text-align: right;">Total</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>
            <span class="printItemTitle">Initial Diagnostic &amp; Site Roof Inspection</span>
          </td>
          <td><span class="printCategoryPill categoryLabor">Labor</span></td>
          <td style="text-align: center;">1</td>
          <td style="text-align: right;">$125.00</td>
          <td style="text-align: right; font-weight: 800; color: #0f172a;">$125.00</td>
        </tr>
        <tr>
          <td>
            <span class="printItemTitle">Parts &amp; Replacement Materials (Heavy-Duty Spec Underlayment)</span>
          </td>
          <td><span class="printCategoryPill categoryMaterial">Material</span></td>
          <td style="text-align: center;">1</td>
          <td style="text-align: right;">$280.00</td>
          <td style="text-align: right; font-weight: 800; color: #0f172a;">$280.00</td>
        </tr>
        <tr>
          <td>
            <span class="printItemTitle">System Installation, Calibration &amp; Safety Leak Test</span>
          </td>
          <td><span class="printCategoryPill categoryLabor">Labor</span></td>
          <td style="text-align: center;">3</td>
          <td style="text-align: right;">$95.00</td>
          <td style="text-align: right; font-weight: 800; color: #0f172a;">$285.00</td>
        </tr>
      </tbody>
    </table>

    <!-- Terms, Milestones & Totals Grid -->
    <div class="termsAndTotalsGrid">
      <div>
        <div class="printTermsBlock">
          <span class="printSectionLabel">TERMS, CONDITIONS &amp; WARRANTY:</span>
          <p class="printTermsContent">
            Estimate valid for 30 days. 30% deposit required upon authorization to order materials and reserve crew dates. Workmanship backed by standard contractor warranty. Any scope deviations require written change order approval.
          </p>
        </div>

        <div class="milestoneScheduleBox">
          <span class="printSectionLabel">💳 PAYMENT SCHEDULE &amp; MILESTONES:</span>
          <div class="milestoneRow">
            <span>Stage 1: Initial Deposit (Upon Authorization)</span>
            <strong style="color: #0f172a;">$224.57 (30%)</strong>
          </div>
          <div class="milestoneRow">
            <span>Stage 2: Progress Milestone (Rough-in / Material Delivery)</span>
            <strong style="color: #0f172a;">$299.42 (40%)</strong>
          </div>
          <div class="milestoneRow">
            <span>Stage 3: Final Payment (Upon Completion &amp; Walkthrough)</span>
            <strong style="color: #0f172a;">$224.57 (30%)</strong>
          </div>
        </div>
      </div>

      <div class="totalsBox">
        <div class="totalLine">
          <span>Subtotal:</span>
          <strong style="color: #0f172a; font-size: 14px;">$690.00</strong>
        </div>
        <div class="totalLine">
          <span>Sales Tax (8.25%):</span>
          <span>$58.56</span>
        </div>
        <div class="totalLine totalGrand">
          <span>Total Estimate:</span>
          <span>$748.56</span>
        </div>
        <div class="totalLine depositLine">
          <span>Deposit Required (30%):</span>
          <span style="font-weight: 900;">$224.57</span>
        </div>
      </div>
    </div>

    <!-- Authorized Client Signature & Acceptance Block -->
    <div class="acceptanceSection">
      <div class="acceptanceNotice">
        <strong>Authorization &amp; Acceptance of Scope:</strong> By signing below, the client agrees to the specified scope of work, total pricing, and payment terms outlined in this estimate and authorizes the contractor to proceed as scheduled.
      </div>
      <div class="signatureGrid">
        <div class="signatureCol">
          <div class="signatureLine"></div>
          <div class="signatureLabel">Authorized Client / Homeowner Signature</div>
          <div class="signatureMetaRow">
            <span>Print Name: _____________________</span>
            <span>Date: ____________</span>
          </div>
        </div>
        <div class="signatureCol">
          <div class="signatureLine"></div>
          <div class="signatureLabel">Contractor Representative Signature</div>
          <div class="signatureMetaRow">
            <span>Authorized Rep: _________________</span>
            <span>Date: ____________</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Professional Document Footer -->
    <div class="printFooter">
      <div>&check; Thank you for the opportunity to earn your business!</div>
      <div>Prepared via Let’s Get Quoted &bull; Instant Contractor Estimate</div>
    </div>
  </div>
</body>
</html>`;

const tempHtmlPath = path.join(artifactDir, 'estimate-sample.html');
const pdfPath = path.join(artifactDir, 'estimate-sample.pdf');
const imgPath = path.join(artifactDir, 'estimate-pdf-preview.png');

fs.writeFileSync(tempHtmlPath, html, 'utf8');

const edgeExe = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const chromeExe = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const browserExe = fs.existsSync(edgeExe) ? edgeExe : chromeExe;

console.log('Generating PDF and high-res image preview using:', browserExe);

// 1. Generate PDF
try {
  execSync(`"${browserExe}" --headless --disable-gpu --run-all-compositor-stages-before-draw --print-to-pdf="${pdfPath}" "file:///${tempHtmlPath.replace(/\\\\/g, '/')}"`);
  console.log('PDF generated at:', pdfPath);
} catch (err) {
  console.error('Error generating PDF:', err);
}

// 2. Generate Image Preview
try {
  execSync(`"${browserExe}" --headless --disable-gpu --screenshot="${imgPath}" --window-size=950,1280 "file:///${tempHtmlPath.replace(/\\\\/g, '/')}"`);
  console.log('Screenshot preview generated at:', imgPath);
} catch (err) {
  console.error('Error generating Screenshot:', err);
}
