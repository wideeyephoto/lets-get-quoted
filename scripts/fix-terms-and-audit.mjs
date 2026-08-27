import { readFileSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';

const env = readFileSync('.env.local', 'utf8');
const pick = (k) => env.match(new RegExp(`^${k}=(.+)$`, 'm'))?.[1]?.trim().replace(/^['"]|['"]$/g, '');
const ref = new URL(pick('NEXT_PUBLIC_SUPABASE_URL')).hostname.split('.')[0];
const admin = createClient(pick('NEXT_PUBLIC_SUPABASE_URL'), pick('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
const anon = createClient(pick('NEXT_PUBLIC_SUPABASE_URL'), pick('NEXT_PUBLIC_SUPABASE_ANON_KEY'), { auth: { persistSession: false } });

// Ensure account has latest terms version accepted ('2026-08-28')
const targetEmail = 'brett.arnold@live.com';
const { data: userData } = await admin.auth.admin.listUsers();
const user = userData.users.find(u => u.email === targetEmail);
if (!user) throw new Error('User not found: ' + targetEmail);

const { data: member } = await admin.from('memberships').select('account_id').eq('user_id', user.id).single();
if (member) {
  await admin.from('accounts').update({
    terms_accepted_at: new Date().toISOString(),
    terms_version: '2026-08-28'
  }).eq('id', member.account_id);
  console.log('Terms version 2026-08-28 set for account:', member.account_id);
}

const { data: l } = await admin.auth.admin.generateLink({ type: 'magiclink', email: targetEmail });
const { data: sess } = await anon.auth.verifyOtp({ token_hash: l.properties.hashed_token, type: 'magiclink' });

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

const audit = {};

// DESKTOP (1440x960)
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 2 });
  await ctx.addCookies(cookies);
  const page = await ctx.newPage();

  console.log('Navigating to http://localhost:3010/dashboard on Desktop...');
  const res = await page.goto('http://localhost:3010/dashboard', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForSelector('.workspace-shell, .priority-panel', { timeout: 120000 });
  await page.waitForTimeout(2000);

  console.log('Desktop URL:', page.url());
  console.log('Saving desktop screenshots...');
  await page.screenshot({ path: `${artifactDir}\\dashboard_desktop_full.png`, fullPage: true });
  await page.screenshot({ path: `${artifactDir}\\dashboard_desktop_top.png` });

  audit.desktop = await page.evaluate(() => {
    const pageTitle = document.title;
    const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4')).map(h => ({
      tag: h.tagName,
      text: h.textContent.trim(),
      eyebrow: h.parentElement?.querySelector('.eyebrow')?.textContent.trim() || ''
    }));

    const sections = Array.from(document.querySelectorAll('.workspace-section-card, section.panel')).map(s => ({
      heading: s.querySelector('h2, h3')?.textContent.trim() || '',
      eyebrow: s.querySelector('.eyebrow')?.textContent.trim() || '',
      className: s.className,
      textPreview: s.textContent.trim().slice(0, 140).replace(/\s+/g, ' ')
    }));

    const metrics = Array.from(document.querySelectorAll('.workspace-metric-card')).map(m => ({
      label: m.querySelector('.workspace-metric-label')?.textContent.trim() || '',
      value: m.querySelector('.workspace-metric-value')?.textContent.trim() || '',
      note: m.querySelector('.workspace-metric-note')?.textContent.trim() || ''
    }));

    const priorities = Array.from(document.querySelectorAll('.priority-item')).map(p => ({
      index: p.querySelector('.priority-index')?.textContent.trim() || '',
      title: p.querySelector('.priority-copy strong')?.textContent.trim() || '',
      detail: p.querySelector('.priority-copy span')?.textContent.trim() || '',
      cta: p.querySelector('.priority-cta')?.textContent.trim() || '',
      href: p.getAttribute('href')
    }));

    const quickLinks = Array.from(document.querySelectorAll('.dash-quicklinks a')).map(a => ({
      text: a.textContent.trim(),
      href: a.getAttribute('href')
    }));

    const automations = {
      summaryText: document.querySelector('.dash-automations-summary')?.textContent.trim().replace(/\s+/g, ' ') || '',
      badges: Array.from(document.querySelectorAll('.automation-status-row .status-badge, .automation-status-row a')).map(b => b.textContent.trim()),
      metrics: Array.from(document.querySelectorAll('.dash-results-grid .workspace-metric-card')).map(m => ({
        label: m.querySelector('.workspace-metric-label')?.textContent.trim() || '',
        value: m.querySelector('.workspace-metric-value')?.textContent.trim() || ''
      }))
    };

    return { pageTitle, headings, sections, metrics, priorities, quickLinks, automations, scrollHeight: document.documentElement.scrollHeight };
  });
  await ctx.close();
}

// MOBILE (390x844 iPhone 14/15)
{
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true
  });
  await ctx.addCookies(cookies);
  const page = await ctx.newPage();

  console.log('Navigating to http://localhost:3010/dashboard on Mobile...');
  await page.goto('http://localhost:3010/dashboard', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForSelector('.workspace-shell, .priority-panel', { timeout: 120000 });
  await page.waitForTimeout(2000);

  console.log('Saving mobile screenshots...');
  await page.screenshot({ path: `${artifactDir}\\dashboard_mobile_full.png`, fullPage: true });
  await page.screenshot({ path: `${artifactDir}\\dashboard_mobile_top.png` });

  audit.mobile = await page.evaluate(() => {
    const height = document.documentElement.scrollHeight;
    const screens = (height / 844).toFixed(1);

    const mobileBar = {
      present: !!document.querySelector('.sidenav-mobilebar'),
      hasNewButton: !!document.querySelector('.mobilebar-new'),
      hasPlanButton: !!document.querySelector('.mobilebar-plan'),
      hasNavToggle: !!document.querySelector('.nav-toggle')
    };

    const priorityHeights = Array.from(document.querySelectorAll('.priority-item')).map(el => {
      const rect = el.getBoundingClientRect();
      return Math.round(rect.height);
    });

    return { height, screens, mobileBar, priorityHeights };
  });
  await ctx.close();
}

await browser.close();
writeFileSync(`${artifactDir}\\audit_results.json`, JSON.stringify(audit, null, 2));
console.log('Audit completed successfully!');
