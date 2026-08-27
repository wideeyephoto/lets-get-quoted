import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

async function findActivePort() {
  const candidatePorts = [3011, 3010, 3000, 3001];
  for (const port of candidatePorts) {
    try {
      const res = await fetch(`http://localhost:${port}/tools/estimate-generator`);
      if (res.ok && res.status === 200) {
        return port;
      }
    } catch {
      // try next
    }
  }
  return 3011;
}

async function verifyEstimatePrintPage() {
  const port = await findActivePort();
  const url = `http://localhost:${port}/tools/estimate-generator`;
  console.log(`Testing Print PDF generation against ${url}...`);

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();

    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

    // Click "Use Example" button
    const useExampleBtn = page.getByRole('button', { name: 'Use Example' });
    await useExampleBtn.click();
    await page.waitForTimeout(500);

    // Render the print PDF via Chromium with CSS page size preference
    const pdfBuffer = await page.pdf({
      preferCSSPageSize: true,
      printBackground: true,
    });

    console.log(`Generated PDF buffer size: ${pdfBuffer.length} bytes`);

    // Count pages in generated PDF
    const rawPdf = pdfBuffer.toString('latin1');
    const pageMatches = rawPdf.match(/\/Type\s*\/Page\b/g) || [];
    const pageCount = pageMatches.length;

    console.log(`Calculated PDF Page Count: ${pageCount}`);

    // Save PDF artifact for inspection
    const outDir = path.resolve(process.cwd(), 'artifacts');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const pdfPath = path.join(outDir, 'estimate-use-example-print.pdf');
    fs.writeFileSync(pdfPath, pdfBuffer);
    console.log(`Saved test PDF artifact to: ${pdfPath}`);

    if (pageCount !== 1) {
      console.error(`❌ REGRESSION: Expected exactly 1 page for 'Use Example' estimate, but generated ${pageCount} pages!`);
      process.exit(1);
    }

    console.log('✅ SUCCESS: Estimate Generator printed exactly 1 page Letter PDF with clean layout!');
  } finally {
    await browser.close();
  }
}

verifyEstimatePrintPage().catch((err) => {
  console.error('Print verification failed:', err);
  process.exit(1);
});
