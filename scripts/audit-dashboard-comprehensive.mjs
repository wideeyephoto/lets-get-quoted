import { readFileSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';

const env = readFileSync('.env.local', 'utf8');
const pick = (k) => env.match(new RegExp(`^${k}=(.+)$`, 'm'))?.[1]?.trim().replace(/^['"]|['"]$/g, '');
const ref = new URL(pick('NEXT_PUBLIC_SUPABASE_URL')).hostname.split('.')[0];
const admin = createClient(pick('NEXT_PUBLIC_SUPABASE_URL'), pick('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
const anon = createClient(pick('NEXT_PUBLIC_SUPABASE_URL'), pick('NEXT_PUBLIC_SUPABASE_ANON_KEY'), { auth: { persistSession: false } });

const targetEmail = 'brett.arnold@live.com';
const { data: l, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email: targetEmail });
if (linkErr) {
  console.error('Magic link generation error:', linkErr);
  process.exit(1);
}

const { data: sess, error: otpErr } = await anon.auth.verifyOtp({ token_hash: l.properties.hashed_token, type: 'magiclink' });
if (otpErr) {
  console.error('OTP verify error:', otpErr);
  process.exit(1);
}

const payload = `base64-${Buffer.from(JSON.stringify({
  access_token: sess.session.access_token,
  refresh_token: sess.session.refresh_token,
  expires_at: sess.session.expires_at,
  expires_in: sess.session.expires_in,
  token_type: 'bearer',
  user: sess.session.user
})).toString('base64')}`;

const cookies = [];
for (let i = 0, n = 0; i < payload.length; i += 3180, n += 1) {
  cookies.push({
    name: `sb-${ref}-auth-token.${n}`,
    value: payload.slice(i, i + 3180),
    domain: 'localhost',
    path: '/',
    sameSite: 'Lax'
  });
}

const artifactDir = 'C:\\Users\\brett\\.gemini\\antigravity-ide\\brain\\3d880b69-3469-488a-9f16-f7c2e5642bdc';

const browser = await chromium.launch();

const auditResults = {
  desktop: {},
  mobile: {},
  consoleErrors: []
};

// 1. Desktop Audit (1440x900)
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addCookies(cookies);
  const page = await context.newPage();

  page.on('console', msg => {
    if (msg.type() === 'error') {
      auditResults.consoleErrors.push(`[Console Error]: ${msg.text()}`);
    }
  });
  page.on('pageerror', err => {
    auditResults.consoleErrors.push(`[Page Error]: ${err.message}`);
  });

  await page.goto('http://localhost:3011/dashboard', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('.workspace-shell, .priority-panel', { timeout: 30000 });
  await page.waitForTimeout(1500);

  await page.screenshot({ path: `${artifactDir}\\dashboard_desktop_full.png`, fullPage: true });
  await page.screenshot({ path: `${artifactDir}\\dashboard_desktop_viewport.png` });

  auditResults.desktop = await page.evaluate(() => {
    const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4')).map(h => ({
      tag: h.tagName,
      text: h.textContent.trim(),
      visible: h.offsetParent !== null || h.classList.contains('sr-only')
    }));

    const sections = Array.from(document.querySelectorAll('.workspace-section-card')).map(card => {
      const heading = card.querySelector('h2, h3')?.textContent.trim() || 'Untitled';
      const eyebrow = card.querySelector('.eyebrow')?.textContent.trim() || '';
      return { eyebrow, heading, classes: card.className };
    });

    const metrics = Array.from(document.querySelectorAll('.workspace-metric-card')).map(m => ({
      label: m.querySelector('.workspace-metric-label')?.textContent.trim() || '',
      value: m.querySelector('.workspace-metric-value')?.textContent.trim() || '',
      note: m.querySelector('.workspace-metric-note')?.textContent.trim() || ''
    }));

    const links = Array.from(document.querySelectorAll('a')).map(a => ({
      text: a.textContent.trim(),
      href: a.getAttribute('href'),
      target: a.getAttribute('target')
    })).filter(l => l.text && l.href);

    return {
      title: document.title,
      scrollHeight: document.documentElement.scrollHeight,
      headings,
      sections,
      metrics,
      linksCount: links.length,
      linksSample: links.slice(0, 15)
    };
  });
  await context.close();
}

// 2. Mobile Audit (390x844 - iPhone 14/15)
{
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true
  });
  await context.addCookies(cookies);
  const page = await context.newPage();

  await page.goto('http://localhost:3011/dashboard', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('.workspace-shell, .priority-panel', { timeout: 30000 });
  await page.waitForTimeout(1500);

  await page.screenshot({ path: `${artifactDir}\\dashboard_mobile_full.png`, fullPage: true });
  await page.screenshot({ path: `${artifactDir}\\dashboard_mobile_top.png` });

  auditResults.mobile = await page.evaluate(() => {
    const height = document.documentElement.scrollHeight;
    const priorityItems = Array.from(document.querySelectorAll('.priority-item')).map(el => {
      const rect = el.getBoundingClientRect();
      const text = el.querySelector('strong')?.textContent.trim() || '';
      return { text, height: Math.round(rect.height) };
    });

    const tapTargets = Array.from(document.querySelectorAll('button, a, summary, [role="button"]')).map(el => {
      const rect = el.getBoundingClientRect();
      return {
        tag: el.tagName,
        text: el.textContent.trim().slice(0, 30),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        isTooSmall: (rect.width < 40 || rect.height < 40) && rect.width > 0 && rect.height > 0
      };
    }).filter(t => t.isTooSmall && t.text);

    return {
      scrollHeight: height,
      screenMultiplier: (height / 844).toFixed(1),
      priorityItems,
      smallTouchTargets: tapTargets.slice(0, 10)
    };
  });
  await context.close();
}

await browser.close();

console.log(JSON.stringify(auditResults, null, 2));
