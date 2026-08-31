import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { generateInvoicePdf } from '../src/emails/InvoicePdf.ts';
import { generatePermitApplicationPdf } from '../src/lib/permit-intel/permit-pdf-generator.ts';
import { generateLienWaiverPdf } from '../src/lib/lien-waiver-pdf.ts';
import { buildInsightsPdf } from '../src/lib/insights-export.ts';

const artifactDir = 'C:\\Users\\brett\\.gemini\\antigravity-ide\\brain\\c8e32158-4d20-43a6-9f3a-bf504d9f703e';
const edgeExe = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const chromeExe = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const browserExe = fs.existsSync(edgeExe) ? edgeExe : chromeExe;

function capturePdfScreenshot(pdfPath, outImgPath) {
  try {
    const formattedUrl = `file:///${pdfPath.replace(/\\/g, '/')}`;
    execSync(`"${browserExe}" --headless --disable-gpu --screenshot="${outImgPath}" --window-size=950,1280 "${formattedUrl}"`);
    console.log('✓ Screenshot generated at:', outImgPath);
  } catch (err) {
    console.error('Screenshot error for', pdfPath, err);
  }
}

async function main() {
  console.log('--- Generating Test PDFs for all system generators ---');

  // 1. Invoice PDF
  try {
    const invoicePdf = await generateInvoicePdf({
      businessName: 'Apex Trade Solutions',
      invoiceRef: 'INV-2026-089',
      clientName: 'Sarah Jenkins',
      jobRef: 'JOB-4820',
      total: 1850.00,
      subtotal: 2000.00,
      discountPercent: 10,
      discountAmount: 200.00,
      taxRate: 6,
      taxAmount: 108.00,
      items: [
        { description: 'Master Electrician Service & Panel Upgrade (200A)', amount: 1200.00 },
        { description: 'Whole-Home Surge Protector Spec Grade (Type 2)', amount: 350.00 },
        { description: 'Municipal Electrical Permit Acquisition & Inspection Fee', amount: 250.00 },
        { description: 'Dedicated EV Charger Circuit Conduit & NEMA 14-50 Receptacle', amount: 200.00 },
      ],
    });
    const invPath = path.join(artifactDir, 'invoice-sample.pdf');
    fs.writeFileSync(invPath, invoicePdf);
    console.log('✓ Invoice PDF written to:', invPath);
    capturePdfScreenshot(invPath, path.join(artifactDir, 'invoice-pdf-preview.png'));
  } catch (err) {
    console.error('Invoice PDF error:', err);
  }

  // 2. Permit Application PDF
  try {
    const permitPdf = await generatePermitApplicationPdf({
      authority: {
        name: 'City of Royal Oak Building Department',
        agencyName: 'Department of Community & Economic Development',
        department: 'Building, Plumbing, Electrical & Mechanical Division',
      },
      property: {
        streetAddress: '211 S Williams St',
        city: 'Royal Oak',
        state: 'MI',
        zip: '48067',
        occupancyType: 'Single Family Residential (R-3)',
        constructionType: 'Type V-B (Combustible Wood Frame)',
        parcelNumber: '25-15-200-014',
        ownerName: 'Sarah Jenkins',
        ownerPhone: '(555) 392-1084',
        ownerEmail: 'sarah.jenkins@example.com',
      },
      applicant: {
        companyName: 'Apex Trade Solutions LLC',
        contactName: 'David Miller',
        licenseNumber: 'LIC-21018942',
        licenseType: 'Residential Builder / Master Electrician',
        licenseExpiration: '2027-05-31',
        insuranceCarrier: 'Cincinnati Insurance Co',
        insurancePolicyNumber: 'CPP-940281-A',
        workersCompCarrier: 'Accident Fund of Michigan',
      },
      workScope: {
        projectTitle: '200A Service Upgrade & Roof Decking Repair',
        estimatedCost: 14500,
        detailedDescription: 'Tear off existing damaged roof covering down to sound decking. Replace rotted sheathing per 2015 MRC. Install ASTM D3462 dimensional shingles and ice barrier 24 inches inside wall line.',
        roofSquares: 24,
        newRoofCovering: 'Owens Corning Duration Architectural Shingles',
      },
      certification: {
        section23aNotice: 'Section 23a of the state construction code act of 1972, 1972 PA 230, MCL 125.1523a, prohibits a person from conspiring to circumvent the licensing requirements of this state relating to persons who are to perform work on a residential building or a residential structure. Violators of section 23a are subjected to civil fines.',
        applicantSignatureText: 'David Miller, Master Lic. #21018942',
        signatureDate: '2026-08-27',
      },
    });
    const permitPath = path.join(artifactDir, 'permit-sample.pdf');
    fs.writeFileSync(permitPath, permitPdf);
    console.log('✓ Permit Application PDF written to:', permitPath);
    capturePdfScreenshot(permitPath, path.join(artifactDir, 'permit-pdf-preview.png'));
  } catch (err) {
    console.error('Permit PDF error:', err);
  }

  // 3. Lien Waiver PDF
  try {
    const waiverPdf = await generateLienWaiverPdf({
      id: 'LW-2026-0042',
      title: 'CONDITIONAL WAIVER AND RELEASE ON PROGRESS PAYMENT',
      isConditional: true,
      claimantName: 'Apex Trade Solutions LLC',
      customerName: 'Sarah Jenkins',
      propertyAddress: '211 S Williams St, Royal Oak, MI 48067',
      paymentAmount: 4850.00,
      throughDate: '2026-08-27',
      legalBody: 'Upon receipt by the undersigned of a check from Sarah Jenkins in the sum of $4,850.00 payable to Apex Trade Solutions LLC and when the check has been properly endorsed and has been paid by the bank on which it is drawn, this document becomes effective to release any mechanic\'s lien, any stop payment notice, and any payment bond rights the undersigned has on the job of Sarah Jenkins located at 211 S Williams St, Royal Oak, MI 48067 to the following extent. This release covers a progress payment for all labor, services, equipment, or materials furnished to the jobsite through Aug 27, 2026 only and does not cover any retention withheld, extras for which no payment has been received, or items furnished after said date.',
    });
    const waiverPath = path.join(artifactDir, 'lien-waiver-sample.pdf');
    fs.writeFileSync(waiverPath, waiverPdf);
    console.log('✓ Lien Waiver PDF written to:', waiverPath);
    capturePdfScreenshot(waiverPath, path.join(artifactDir, 'lien-waiver-pdf-preview.png'));
  } catch (err) {
    console.error('Lien Waiver PDF error:', err);
  }

  // 4. Insights Export PDF
  try {
    const insightsPdf = await buildInsightsPdf(
      {
        period: { key: '30', label: 'Last 30 days', sentenceLabel: 'in the last 30 days', fromMs: 0, toMs: 0, days: 30, custom: false },
        kpis: {
          grossRevenue: { key: 'grossRevenue', label: 'Gross Revenue', value: 45000, format: 'money', delta: { pct: 14, direction: 'up' }, deltaUnit: '%', upIsGood: true, spark: [], hint: '' },
          netCollected: { key: 'netCollected', label: 'Net Collected', value: 38500.5, format: 'money', delta: { pct: 10, direction: 'up' }, deltaUnit: '%', upIsGood: true, spark: [], hint: '' },
          jobsCompleted: { key: 'jobsCompleted', label: 'Jobs Completed', value: 18, format: 'count', delta: { pct: 20, direction: 'up' }, deltaUnit: '%', upIsGood: true, spark: [], hint: '' },
          quoteConversion: { key: 'quoteConversion', label: 'Quote Conversion', value: 68, format: 'percent', delta: { pct: 6, direction: 'up' }, deltaUnit: 'pp', upIsGood: true, spark: [], hint: '' },
          outstandingBalance: { key: 'outstandingBalance', label: 'Outstanding Balance', value: 2450, format: 'money', delta: null, deltaUnit: '%', upIsGood: false, spark: [], hint: '', note: '2 unpaid invoices · current total, not a period change' },
          newCustomers: { key: 'newCustomers', label: 'New Customers', value: 11, format: 'count', delta: { pct: 15, direction: 'up' }, deltaUnit: '%', upIsGood: true, spark: [], hint: '' },
        },
        revenueTrend: {
          grouping: 'week',
          points: [
            { key: 'w1', label: 'Aug 1-7', current: 10200, previous: 8500 },
            { key: 'w2', label: 'Aug 8-14', current: 12400, previous: 9800 },
            { key: 'w3', label: 'Aug 15-21', current: 14100, previous: 11200 },
            { key: 'w4', label: 'Aug 22-27', current: 11820, previous: 9000 },
          ],
          total: 48520,
          previousTotal: 38500,
          hasData: true,
        },
        salesActivity: {
          stages: [
            { key: 'leads', label: 'Leads Received', count: 28 },
            { key: 'quotes_sent', label: 'Proposals Delivered', count: 24 },
            { key: 'jobs_paid', label: 'Paid & Completed', count: 18 },
          ],
        },
        scheduleUtilization: { configured: true, lookaheadDays: 21, workingDays: 18, bookedDays: 14, openDays: 4, utilizationPct: 78, estimatedOpportunity: 4800, avgJobValue: 1200 },
        paymentHealth: { overdueBalance: 1450, overdueCount: 2, avgDaysToCollect: 8, failedPayments: 0 },
        customerInsights: { totalClients: 64, repeatClients: 22, repeatRatePct: 34, inactiveClients: 6, inactiveThresholdDays: 90, activeMaintenancePlans: 8, maintenanceMonthly: 1200 },
        revenueByService: {
          slices: [
            { label: 'Roof Replacement & Tear-off', amount: 26400, pct: 55, count: 8 },
            { label: 'Electrical Service Upgrades', amount: 14200, pct: 29, count: 6 },
            { label: 'EV Charger & Secondary Circuits', amount: 7920, pct: 16, count: 4 },
          ],
          total: 48520,
          approximate: false,
          hasData: true,
        },
        marketingPerformance: {
          campaigns: [{ id: 'c1', channel: 'both', audience: 'all', sentAt: '2026-08-15T10:00:00.000Z', recipients: 180, emailSent: 150, smsQueued: 30, failed: 1, skipped: 2 }],
          totalRecipients: 180,
          hasData: true,
          tracksEngagement: true,
          tracksRevenue: true,
        },
        topOpportunities: [
          { id: 'collect-outstanding', icon: 'unpaid-invoices', title: 'Collect $2,450 in unpaid invoices', detail: '2 invoices are pending client walkthrough.', value: 2450, count: 2, priority: 'high', href: '/dashboard/jobs', cta: 'Open jobs' },
        ],
      },
      {
        businessName: 'Apex Trade Solutions',
        generatedLabel: 'Aug 27, 2026 at 12:20 PM EDT',
      }
    );
    const insightsPath = path.join(artifactDir, 'insights-sample.pdf');
    fs.writeFileSync(insightsPath, insightsPdf);
    console.log('✓ Insights PDF written to:', insightsPath);
    capturePdfScreenshot(insightsPath, path.join(artifactDir, 'insights-pdf-preview.png'));
  } catch (err) {
    console.error('Insights PDF error:', err);
  }

  console.log('--- Finished generating test PDFs ---');
}

main();
