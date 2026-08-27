import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

async function main() {
  const pdfFile = process.argv[2] || 'artifacts/sample-pdfkit.pdf';
  const outPng = process.argv[3] || 'artifacts/sample-pdfkit.png';

  const pdfBuffer = fs.readFileSync(pdfFile);
  const pdfBase64 = pdfBuffer.toString('base64');
  const browser = await chromium.launch();
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
  await page.screenshot({ path: outPng, fullPage: true });
  console.log(`Successfully captured ${outPng}`);
  await browser.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
