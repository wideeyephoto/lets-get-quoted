import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const base = process.env.TOUR_BASE_URL || 'http://localhost:3035';
const output = 'artifacts/job-lifecycle-tour';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const errors = [];
const telemetry = [];
const unexpectedWrites = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('request', (request) => {
  if (request.method() === 'POST' && !request.url().includes('/api/demo-tour/events')) unexpectedWrites.push(request.url());
});
// Capture analytics without filling the real aggregate funnel with verification traffic.
await context.route('**/api/demo-tour/events', (route) => {
  telemetry.push(route.request().postDataJSON());
  return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
});
const dialog = page.getByRole('dialog', { name: 'See the whole job come together.' });
const tab = (name) => dialog.getByRole('tab', { name: new RegExp(name) });
const open = () => page.getByRole('button', { name: 'See Platform Overview', exact: true }).first().click();
const waitOpen = () => dialog.waitFor({ state: 'visible' });
const waitClosed = () => dialog.waitFor({ state: 'hidden' });
try {
  await page.goto(`${base}/how-it-works`);
  await page.getByRole('heading', { level: 1 }).waitFor();
  const historyBefore = await page.evaluate(() => history.length);
  await open();
  await waitOpen();
  await dialog.getByRole('button', { name: 'Request an estimate' }).waitFor();
  assert.equal(await dialog.getByRole('tab').count(), 5);
  await page.screenshot({ path: `${output}/desktop-website.png` });
  await dialog.getByRole('button', { name: 'Request an estimate' }).click();
  await dialog.getByRole('button', { name: 'Analyze sample request' }).click();
  await dialog.getByRole('button', { name: 'See the qualified lead' }).click();
  assert.match(await dialog.innerText(), /98/);
  await dialog.getByRole('button', { name: 'Build the sample quote' }).click();
  await dialog.getByRole('checkbox').uncheck();
  assert.match(await dialog.innerText(), /\$1,450/);
  await dialog.getByRole('button', { name: 'Simulate sending quote' }).click();
  await dialog.getByText('Try the customer view on your phone').click();
  await dialog.getByAltText('Scan to try the sample customer approval on your phone').waitFor();
  assert.match(await dialog.getByRole('link', { name: 'Open the sample customer view' }).getAttribute('href'), /step=approve&upgrade=0/);
  await page.screenshot({ path: `${output}/desktop-quote.png` });
  await dialog.getByRole('button', { name: 'Review as homeowner' }).click();
  assert.equal(await dialog.getByRole('button', { name: 'Simulate $725 deposit', exact: true }).isDisabled(), true);
  await dialog.getByRole('button', { name: 'Apply sample signature' }).click();
  await dialog.getByRole('button', { name: 'Simulate $725 deposit', exact: true }).click();
  await dialog.getByRole('button', { name: 'Confirm sample booking' }).click();
  await dialog.getByText('Your sample job is connected').waitFor();
  await page.screenshot({ path: `${output}/desktop-booked.png` });
  await tab('Quote').click();
  await dialog.getByRole('checkbox').check();
  await tab('Approval & Booking').click();
  assert.equal(await dialog.getByRole('button', { name: 'Simulate $725 deposit', exact: true }).isDisabled(), true);
  assert.equal(await page.evaluate(() => history.length), historyBefore + 1);
  await page.goBack();
  await waitClosed();
  assert.equal(new URL(page.url()).searchParams.has('tour'), false);
  await open();
  await waitOpen();
  assert.equal(await tab('Approval & Booking').getAttribute('aria-selected'), 'true');
  await page.keyboard.press('Escape');
  await waitClosed();
  assert.equal(await page.getByRole('button', { name: 'See Platform Overview', exact: true }).first().evaluate((node) => node === document.activeElement), true);
  await open();
  await waitOpen();
  await dialog.getByRole('button', { name: 'Restart tour' }).click();
  assert.equal(await tab('Website').getAttribute('aria-selected'), 'true');
  await tab('Website').focus();
  await page.keyboard.press('End');
  assert.equal(await tab('Approval & Booking').getAttribute('aria-selected'), 'true');
  await page.keyboard.press('Home');
  assert.equal(await tab('Website').getAttribute('aria-selected'), 'true');
  // Native dialog must keep keyboard focus inside the modal.
  for (let index = 0; index < 18; index++) {
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => Boolean(document.activeElement?.closest('dialog'))), true);
  }
  await page.reload();
  await waitOpen();
  await dialog.getByRole('button', { name: 'Close tour', exact: true }).first().click();
  await waitClosed();
  for (const step of ['site', 'intake', 'lead', 'quote', 'approve', 'complete', '']) {
    await page.goto(`${base}/demo/tour${step ? '/' + step : ''}?upgrade=0`);
    await waitOpen();
    assert.equal(new URL(page.url()).pathname, '/how-it-works');
    assert.equal(new URL(page.url()).searchParams.get('step'), step === 'complete' ? 'approve' : step || 'site');
  }
  await dialog.getByRole('button', { name: 'Close tour', exact: true }).first().click();
  await waitClosed();
  assert.equal(new URL(page.url()).pathname, '/how-it-works');
  const layouts = [];
  for (const [width, height] of [[360, 740], [390, 844], [768, 1024], [1280, 650]]) {
    await page.setViewportSize({ width, height });
    await open();
    await waitOpen();
    for (const name of ['Website', 'Smart Intake', 'Qualified Lead', 'Quote', 'Approval & Booking']) {
      await tab(name).click();
      const geometry = await dialog.evaluate((node) => {
        const rect = node.getBoundingClientRect();
        const panel = node.querySelector('[role="tabpanel"]');
        return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, panelWidth: panel.clientWidth, panelScrollWidth: panel.scrollWidth, width: innerWidth, height: innerHeight };
      });
      assert.ok(geometry.left >= 0 && geometry.top >= 0 && geometry.right <= width + 1 && geometry.bottom <= height + 1, JSON.stringify(geometry));
      assert.ok(geometry.panelScrollWidth <= geometry.panelWidth + 1, JSON.stringify(geometry));
      layouts.push({ width, height, name, pass: true });
    }
    await page.screenshot({ path: `${output}/${width}-approval.png` });
    await page.keyboard.press('Escape');
    await waitClosed();
  }
  await page.goto(`${base}/demo`);
  await page.getByRole('heading', { level: 1 }).waitFor();
  assert.equal(await page.getByText(/Start 5.min tour|Take a 90.second tour/i).count(), 0);
  // Storage denial must not stop the tour, including its local choices.
  const restricted = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  await restricted.addInitScript(() => { Object.defineProperty(window, 'sessionStorage', { get() { throw new Error('Storage denied'); } }); });
  const isolated = await restricted.newPage();
  await isolated.goto(`${base}/how-it-works?tour=job-lifecycle&step=approve&upgrade=0`);
  const isolatedDialog = isolated.getByRole('dialog');
  await isolatedDialog.getByRole('button', { name: 'Apply sample signature' }).click();
  await isolatedDialog.getByRole('button', { name: 'Simulate $725 deposit', exact: true }).click();
  await isolatedDialog.getByRole('button', { name: 'Confirm sample booking' }).click();
  await isolatedDialog.getByText('Your sample job is connected').waitFor();
  await restricted.close();
  // Recover from a failed lazy chunk without trapping the visitor in the popup.
  const retryContext = await browser.newContext();
  await retryContext.route('**/api/demo-tour/events', (route) => route.fulfill({ status: 200, body: '{}' }));
  const retryPage = await retryContext.newPage();
  await retryPage.goto(`${base}/how-it-works`);
  await retryPage.getByRole('button', { name: 'See Platform Overview', exact: true }).first().waitFor();
  let failChunk = true;
  await retryPage.route('**/_next/static/chunks/**', (route) => failChunk ? route.abort() : route.continue());
  await retryPage.getByRole('button', { name: 'See Platform Overview', exact: true }).first().click();
  await retryPage.getByRole('button', { name: 'Retry', exact: true }).waitFor();
  failChunk = false;
  await retryPage.getByRole('button', { name: 'Retry', exact: true }).click();
  await retryPage.getByRole('button', { name: 'Request an estimate' }).waitFor();
  await retryContext.close();
  assert.deepEqual(errors, []);
  assert.deepEqual(unexpectedWrites, []);
  assert.ok(telemetry.some((event) => event.event_type === 'tour_completed' && event.tour_version === 2));
  await writeFile(`${output}/results.json`, JSON.stringify({ pass: true, layouts, errors, unexpectedWrites, analyticsEvents: telemetry.length }, null, 2));
  console.log(JSON.stringify({ pass: true, layouts: layouts.length, errors, unexpectedWrites, analyticsEvents: telemetry.length }));
} catch (error) {
  await page.screenshot({ path: `${output}/failure.png` });
  console.error(error);
  process.exitCode = 1;
} finally { await browser.close(); }
