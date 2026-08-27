import fs from 'node:fs';
import { chromium } from 'playwright';

async function generatePdfFromApi(payload, outPdfPath) {
  const res = await fetch('http://localhost:3011/api/tools/estimate-pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error(`API error: ${res.statusText}`);
  const arrayBuf = await res.arrayBuffer();
  fs.writeFileSync(outPdfPath, Buffer.from(arrayBuf));
  console.log(`Saved PDF: ${outPdfPath}`);
}

async function renderPdfToPng(browser, pdfPath, pngPath) {
  const pdfBuffer = fs.readFileSync(pdfPath);
  const pdfBase64 = pdfBuffer.toString('base64');
  const page = await browser.newPage({ viewport: { width: 1000, height: 1300 } });
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
      <style>body { margin: 0; background: #525659; display: flex; justify-content: center; padding: 20px; }</style>
    </head>
    <body>
      <canvas id="pdf-canvas" style="box-shadow: 0 4px 12px rgba(0,0,0,0.3); background: #fff;"></canvas>
      <script>
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        const pdfData = atob('${pdfBase64}');
        const loadingTask = pdfjsLib.getDocument({ data: pdfData });
        loadingTask.promise.then(pdf => {
          pdf.getPage(1).then(page => {
            const viewport = page.getViewport({ scale: 1.5 });
            const canvas = document.getElementById('pdf-canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const ctx = canvas.getContext('2d');
            page.render({ canvasContext: ctx, viewport: viewport }).promise.then(() => {
              window.rendered = true;
            });
          });
        });
      </script>
    </body>
    </html>
  `;

  await page.setContent(html);
  await page.waitForFunction(() => window.rendered === true, { timeout: 15000 });
  await page.screenshot({ path: pngPath, fullPage: true });
  console.log(`Captured PNG: ${pngPath}`);
  await page.close();
}

async function main() {
  const browser = await chromium.launch();

  // Test Case 1: Standard Sample Estimate (3 items)
  const case1 = {
    estimate: {
      contractorName: 'Apex Trade Solutions',
      contractorPhone: '(555) 382-9011',
      contractorEmail: 'service@apextrades.com',
      contractorLicense: 'LIC #948201-A',
      clientName: 'Sarah Jenkins',
      clientAddress: '211 S Williams St, Royal Oak, MI',
      estimateNumber: 'EST-2026-104',
      estimateDate: '2026-08-27',
      selectedTrade: 'roofing',
      taxRate: 6.0,
      depositPct: 30,
      discountAmount: 0,
      milestonesEnabled: false,
      terms: 'Estimate valid for 30 days. Deposit required upon authorization to schedule crew and order materials. Workmanship backed by standard warranty.',
      items: [
        { id: '1', description: 'Initial Diagnostic & Site Inspection', type: 'Labor', quantity: 1, unitPrice: 125 },
        { id: '2', description: 'Parts & Replacement Materials (Heavy-Duty Spec)', type: 'Material', quantity: 1, unitPrice: 280 },
        { id: '3', description: 'System Installation, Calibration & Safety Test', type: 'Labor', quantity: 2, unitPrice: 150 }
      ]
    },
    totals: {
      subtotal: 705,
      discountTotal: 0,
      taxAmount: 42.30,
      grandTotal: 747.30,
      depositDue: 224.19
    }
  };

  // Test Case 2: 5-Item Detailed Scope with Permit
  const case2 = {
    estimate: {
      contractorName: 'Apex Trade Solutions',
      contractorPhone: '(555) 382-9102',
      contractorEmail: 'estimates@apextrades.com',
      contractorLicense: 'LIC-MI-884920',
      estimateNumber: 'EST-2026-104',
      estimateDate: '2026-08-27',
      clientName: 'Sarah & Mark Jenkins',
      clientAddress: '1482 Crestview Lane, Ann Arbor, MI',
      selectedTrade: 'Roofing',
      taxRate: 6,
      depositPct: 30,
      discountAmount: 0,
      milestonesEnabled: false,
      terms: 'Estimate valid for 30 days. 30% deposit due prior to material delivery. Balance payable upon final customer walkthrough and inspection. All workmanship backed by 5-year contractor guarantee.',
      items: [
        { id: '1', description: 'Complete tear-off of existing asphalt shingles & haul-away disposal', type: 'Labor', quantity: 24, unitPrice: 125 },
        { id: '2', description: 'Architectural dimensional shingles (50-yr warranty, dual-layer fiberglass)', type: 'Material', quantity: 24, unitPrice: 185 },
        { id: '3', description: 'Synthetic water-resistant underlayment, ice & water shield eaves barrier', type: 'Material', quantity: 6, unitPrice: 95 },
        { id: '4', description: 'Continuous ridge vent ventilation system & starter strip shingles', type: 'Material', quantity: 1, unitPrice: 650 },
        { id: '5', description: 'City Building & Roofing Permit Application Fee with Final Inspection', type: 'Permit', quantity: 1, unitPrice: 175 }
      ]
    },
    totals: {
      subtotal: 8840,
      discountTotal: 0,
      taxAmount: 530.40,
      grandTotal: 9370.40,
      depositDue: 2811.12
    }
  };

  // Test Case 3: Milestones enabled
  const case3 = {
    estimate: {
      contractorName: 'Vanguard Electrical & HVAC',
      contractorPhone: '(555) 729-4100',
      contractorEmail: 'quotes@vanguardtrades.com',
      contractorLicense: 'EC-993821',
      estimateNumber: 'EST-2026-219',
      estimateDate: '2026-08-27',
      clientName: 'David & Emily Miller',
      clientAddress: '408 Walnut Ridge Dr, Grand Rapids, MI',
      selectedTrade: 'heat_pump',
      taxRate: 6,
      depositPct: 30,
      discountAmount: 250,
      milestonesEnabled: true,
      terms: 'Estimate valid for 30 days. 3-stage milestone draw schedule. Change orders require written mutual approval. 10-year compressor warranty included.',
      items: [
        { id: '1', description: '4-Ton Inverter Cold-Climate Heat Pump System (20 SEER2 / 10 HSPF2)', type: 'Equipment', quantity: 1, unitPrice: 6200 },
        { id: '2', description: 'Multi-Zone Air Handler & High-Efficiency Duct Transition Fabrication', type: 'Material', quantity: 1, unitPrice: 2400 },
        { id: '3', description: '200A Electrical Subpanel Feed & Dedicated 40A Disconnect Run', type: 'Labor', quantity: 1, unitPrice: 1150 },
        { id: '4', description: 'Municipal Mechanical & Electrical Permits with County Inspection', type: 'Permit', quantity: 1, unitPrice: 225 },
        { id: '5', description: 'Seasonal Efficiency Promotion Discount', type: 'Discount', isDiscount: true, quantity: 1, unitPrice: 250 }
      ]
    },
    totals: {
      subtotal: 9975,
      discountTotal: 250,
      taxAmount: 583.50,
      grandTotal: 10308.50,
      depositDue: 3092.55,
      milestones: [
        { name: 'Initial Deposit (Upon Authorization)', amount: 3092.55, percentage: 30 },
        { name: 'Equipment Delivery & Rough-in Stage', amount: 4123.40, percentage: 40 },
        { name: 'Final Commissioning & Inspection', amount: 3092.55, percentage: 30 }
      ]
    }
  };

  await generatePdfFromApi(case1, 'artifacts/preview-case1-sample.pdf');
  await renderPdfToPng(browser, 'artifacts/preview-case1-sample.pdf', 'artifacts/preview-case1-sample.png');

  await generatePdfFromApi(case2, 'artifacts/preview-case2-roofing.pdf');
  await renderPdfToPng(browser, 'artifacts/preview-case2-roofing.pdf', 'artifacts/preview-case2-roofing.png');

  await generatePdfFromApi(case3, 'artifacts/preview-case3-milestones.pdf');
  await renderPdfToPng(browser, 'artifacts/preview-case3-milestones.pdf', 'artifacts/preview-case3-milestones.png');

  await browser.close();
  console.log('All PDF visual previews generated successfully!');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
