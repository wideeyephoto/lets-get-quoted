import fs from 'node:fs';
import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto('http://localhost:3010/tools/estimate-generator', { waitUntil: 'networkidle' });
  await page.waitForSelector('[class*="estimateTopRow"]', { timeout: 15000 });

  // Click 'Use Example' button to populate sample items
  const exampleBtn = await page.getByRole('button', { name: 'Use Example' });
  if (await exampleBtn.isVisible()) {
    await exampleBtn.click();
    await page.waitForTimeout(500);
  }

  // Generate Letter PDF via Chromium print engine
  await page.pdf({
    path: 'artifacts/browser-print.pdf',
    format: 'letter',
    printBackground: true,
    preferCSSPageSize: true,
  });
  console.log('Saved artifacts/browser-print.pdf');

  // Now render that PDF to PNG using PDF.js
  const pdfBuffer = fs.readFileSync('artifacts/browser-print.pdf');
  const pdfBase64 = pdfBuffer.toString('base64');
  const renderPage = await browser.newPage({ viewport: { width: 1000, height: 1300 } });
  
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

  await renderPage.setContent(html);
  await renderPage.waitForFunction(() => window.rendered === true, { timeout: 15000 });
  await renderPage.screenshot({ path: 'artifacts/browser-print-preview.png', fullPage: true });
  console.log('Saved artifacts/browser-print-preview.png');

  await browser.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
