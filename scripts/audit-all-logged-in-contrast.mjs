import { readFileSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';

const env = readFileSync('.env.local', 'utf8');
const pick = (k) => env.match(new RegExp(`^${k}=(.+)$`, 'm'))?.[1]?.trim().replace(/^['"]|['"]$/g, '');
const ref = new URL(pick('NEXT_PUBLIC_SUPABASE_URL')).hostname.split('.')[0];
const admin = createClient(pick('NEXT_PUBLIC_SUPABASE_URL'), pick('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
const anon = createClient(pick('NEXT_PUBLIC_SUPABASE_URL'), pick('NEXT_PUBLIC_SUPABASE_ANON_KEY'), { auth: { persistSession: false } });

console.log('1. Authenticating test owner (brett.arnold@live.com)...');
const { data: l } = await admin.auth.admin.generateLink({ type: 'magiclink', email: 'brett.arnold@live.com' });
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

const DASHBOARD_ROUTES = [
  { path: '/dashboard', name: 'Command Center / Home' },
  { path: '/dashboard/leads', name: 'Leads' },
  { path: '/dashboard/messages', name: 'Customer Messages' },
  { path: '/dashboard/jobs', name: 'Jobs' },
  { path: '/dashboard/schedule', name: 'Schedule' },
  { path: '/dashboard/crew', name: 'Crew & Labor' },
  { path: '/dashboard/clients', name: 'Clients' },
  { path: '/dashboard/text-to-job', name: 'Text-to-Job' },
  { path: '/dashboard/quick-stops', name: 'Quick Stops' },
  { path: '/dashboard/schedule/booking', name: 'Online Booking' },
  { path: '/dashboard/voice-calls', name: '24/7 AI Receptionist' },
  { path: '/dashboard/insights', name: 'Reports & Insights' },
  { path: '/dashboard/recurring', name: 'Recurring Jobs' },
  { path: '/dashboard/services', name: 'Price Book' },
  { path: '/dashboard/cash-flow', name: 'Cash Flow' },
  { path: '/dashboard/expenses', name: 'Expenses Ledger' },
  { path: '/dashboard/automations', name: 'Automations' },
  { path: '/dashboard/marketing', name: 'Marketing' },
  { path: '/dashboard/marketing/blog', name: 'Blog' },
  { path: '/dashboard/reviews', name: 'Reviews' },
  { path: '/dashboard/sites', name: 'Website' },
  { path: '/dashboard/settings', name: 'Account Settings' }
];

console.log('2. Launching Playwright browser for Page-by-Page Contrast Audit...');
const browser = await chromium.launch();

const results = [];

for (const theme of ['light']) {
  console.log(`\n======================================================`);
  console.log(`RUNNING CONTRAST AUDIT FOR THEME: ${theme.toUpperCase()} (Workbench)`);
  console.log(`======================================================\n`);

  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addCookies(cookies);

  for (const route of DASHBOARD_ROUTES) {
    const page = await context.newPage();
    const url = `http://localhost:3010${route.path}`;
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.evaluate((th) => {
        document.documentElement.setAttribute('data-theme', th);
        localStorage.setItem('theme', th);
      }, theme);
      await page.waitForTimeout(600);

      const pageAudit = await page.evaluate(() => {
        const lin = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
        const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
        const parse = (s) => (s.match(/[\d.]+/g) || []).map(Number);
        const over = (fg, bg) => {
          const a = fg[3] === undefined ? 1 : fg[3];
          return [0, 1, 2].map((i) => fg[i] * a + bg[i] * (1 - a));
        };

        const issues = [];
        const seen = new Set();

        const elements = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, p, span, a, button, label, input, select, textarea, th, td, strong, em, b, small'));

        for (const el of elements) {
          if (!el) continue;
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) continue;
          const cs = getComputedStyle(el);
          if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.1) continue;

          const text = (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' ? (el.value || el.placeholder || '') : el.textContent || '').trim();
          if (!text || text.length > 100) continue;

          let bg = null;
          for (let node = el; node; node = node.parentElement) {
            const parts = parse(getComputedStyle(node).backgroundColor);
            if (parts.length >= 3 && (parts[3] === undefined || parts[3] > 0.92)) {
              bg = parts.slice(0, 3);
              break;
            }
          }
          if (!bg) {
            // Default background based on theme attribute
            bg = [15, 17, 23]; // dark shell ground
          }

          const fgRaw = parse(cs.color);
          if (fgRaw.length < 3) continue;
          const fg = over(fgRaw, bg);

          const [x, y] = [lum(fg), lum(bg)].sort((p, q) => q - p);
          const ratio = Number(((x + 0.05) / (y + 0.05)).toFixed(2));
          const px = parseFloat(cs.fontSize) || 14;
          const isLarge = px >= 24 || (px >= 18.5 && (parseInt(cs.fontWeight, 10) >= 700 || cs.fontWeight === 'bold'));
          const minRatio = isLarge ? 3.0 : 4.5;

          const isBloodRedInput = (el.tagName === 'INPUT' || el.tagName === 'SELECT') && (cs.backgroundColor.includes('rgb(220') || cs.backgroundColor.includes('rgb(185') || cs.backgroundColor.includes('rgb(200'));

          if (ratio < minRatio || isBloodRedInput) {
            const key = `${el.tagName}:${text.slice(0, 30)}:${ratio}`;
            if (!seen.has(key)) {
              seen.add(key);
              issues.push({
                tag: el.tagName.toLowerCase(),
                text: text.slice(0, 45),
                ratio,
                minRatio,
                fg: cs.color,
                bg: `rgb(${bg.join(',')})`,
                fontSize: `${px.toFixed(1)}px`,
                isBloodRedInput,
                selector: el.className ? `.${el.className.split(' ').join('.')}` : el.tagName.toLowerCase()
              });
            }
          }
        }

        return {
          title: document.title,
          elementCount: elements.length,
          issues: issues.slice(0, 10) // top issues
        };
      });

      console.log(`[${pageAudit.issues.length === 0 ? 'PASS' : 'WARN'}] ${route.path.padEnd(28)} - ${route.name.padEnd(24)} (${pageAudit.issues.length} issues found)`);
      if (pageAudit.issues.length > 0) {
        for (const iss of pageAudit.issues) {
          console.log(`    ⚠️  <${iss.tag}> "${iss.text}" -> ratio: ${iss.ratio}:1 (min ${iss.minRatio}:1) | fg: ${iss.fg} on bg: ${iss.bg}`);
        }
      }

      results.push({
        route: route.path,
        name: route.name,
        theme,
        issueCount: pageAudit.issues.length,
        issues: pageAudit.issues
      });
    } catch (err) {
      console.log(`[ERR ] ${route.path.padEnd(28)} - Failed to load: ${err.message}`);
    } finally {
      await page.close();
    }
  }

  await context.close();
}

await browser.close();

const totalIssues = results.reduce((acc, r) => acc + r.issueCount, 0);
console.log(`\n======================================================`);
console.log(`AUDIT COMPLETE: ${results.length} pages audited | Total Contrast Violations: ${totalIssues}`);
console.log(`======================================================\n`);
