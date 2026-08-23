import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';

const artifactDir = 'C:/Users/brett/.gemini/antigravity-ide/brain/2efe8169-c886-4d63-9101-7998b0436b3f';
mkdirSync(artifactDir, { recursive: true });

const env = readFileSync('.env.local', 'utf8');
const pick = (k) => env.match(new RegExp(`^${k}=(.+)$`, 'm'))?.[1]?.trim().replace(/^['"]|['"]$/g, '');
const ref = new URL(pick('NEXT_PUBLIC_SUPABASE_URL')).hostname.split('.')[0];
const admin = createClient(pick('NEXT_PUBLIC_SUPABASE_URL'), pick('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
const anon = createClient(pick('NEXT_PUBLIC_SUPABASE_URL'), pick('NEXT_PUBLIC_SUPABASE_ANON_KEY'), { auth: { persistSession: false } });

// Generate auth cookies
const { data: l } = await admin.auth.admin.generateLink({ type: 'magiclink', email: 'brett.arnold@live.com' });
const { data: sess } = await anon.auth.verifyOtp({ token_hash: l.properties.hashed_token, type: 'magiclink' });
const payload = `base64-${Buffer.from(JSON.stringify({ access_token: sess.session.access_token, refresh_token: sess.session.refresh_token, expires_at: sess.session.expires_at, expires_in: sess.session.expires_in, token_type: 'bearer', user: sess.session.user })).toString('base64')}`;
const cookies = [];
for (let i = 0, n = 0; i < payload.length; i += 3180, n += 1) {
  cookies.push({ name: `sb-${ref}-auth-token.${n}`, value: payload.slice(i, i + 3180), domain: 'localhost', path: '/', sameSite: 'Lax' });
}

const auditData = {
  desktop: {},
  mobile: {},
  a11yIssues: [],
  touchTargetIssues: [],
  contrastIssues: [],
  pages: {}
};

const browser = await chromium.launch({ headless: true });

// 1. DESKTOP RUN (1440x900)
console.log('--- RUNNING DESKTOP AUDIT ---');
const deskContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await deskContext.addCookies(cookies);
const deskPage = await deskContext.newPage();

await deskPage.goto('http://localhost:3010/dashboard', { waitUntil: 'networkidle', timeout: 30000 });
await deskPage.waitForTimeout(1000);

// Capture full page and above fold
await deskPage.screenshot({ path: `${artifactDir}/desktop_full.png`, fullPage: true });
await deskPage.screenshot({ path: `${artifactDir}/desktop_viewport.png`, fullPage: false });

// Capture individual key sections if present
const sections = [
  { name: 'nav_sidebar', sel: '.sidenav, nav.workspace-sidenav, aside' },
  { name: 'priority_panel', sel: '.priority-panel, [class*="priority"]' },
  { name: 'metrics_cards', sel: '.workspace-metrics-grid, [class*="metric"]' },
  { name: 'week_glance', sel: '.week-glance, [class*="week"]' },
  { name: 'automation_status', sel: '.automations-summary, [class*="automation"]' },
  { name: 'stripe_banner', sel: '.stripe-alert-banner, [class*="stripe-banner"]' }
];

for (const sec of sections) {
  try {
    const el = await deskPage.$(sec.sel);
    if (el) {
      await el.screenshot({ path: `${artifactDir}/component_${sec.name}.png` });
      console.log(`Captured ${sec.name}`);
    }
  } catch (e) {
    console.log(`Could not capture ${sec.name}:`, e.message);
  }
}

// 2. MOBILE RUN (390x844)
console.log('--- RUNNING MOBILE AUDIT ---');
const mobContext = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true
});
await mobContext.addCookies(cookies);
const mobPage = await mobContext.newPage();

await mobPage.goto('http://localhost:3010/dashboard', { waitUntil: 'networkidle', timeout: 30000 });
await mobPage.waitForTimeout(1000);

await mobPage.screenshot({ path: `${artifactDir}/mobile_full.png`, fullPage: true });
await mobPage.screenshot({ path: `${artifactDir}/mobile_viewport.png`, fullPage: false });

// Test mobile menu trigger
try {
  const menuBtn = await mobPage.$('.nav-toggle, [aria-label*="menu" i], button[class*="toggle"]');
  if (menuBtn) {
    await menuBtn.click();
    await mobPage.waitForTimeout(400);
    await mobPage.screenshot({ path: `${artifactDir}/mobile_menu_open.png` });
    console.log('Captured mobile menu open');
  }
} catch (e) {
  console.log('Mobile menu toggle error:', e.message);
}

// 3. TABLET RUN (768x1024)
console.log('--- RUNNING TABLET AUDIT ---');
const tabContext = await browser.newContext({
  viewport: { width: 768, height: 1024 },
  deviceScaleFactor: 2
});
await tabContext.addCookies(cookies);
const tabPage = await tabContext.newPage();
await tabPage.goto('http://localhost:3010/dashboard', { waitUntil: 'networkidle', timeout: 30000 });
await tabPage.waitForTimeout(1000);
await tabPage.screenshot({ path: `${artifactDir}/tablet_full.png`, fullPage: true });

// 4. SUBPAGES SNAPSHOT
const subRoutes = [
  { name: 'leads', path: '/dashboard/leads' },
  { name: 'schedule', path: '/dashboard/schedule' },
  { name: 'jobs', path: '/dashboard/jobs' },
  { name: 'clients', path: '/dashboard/clients' },
  { name: 'settings', path: '/dashboard/settings' },
  { name: 'automations', path: '/dashboard/automations' }
];

for (const route of subRoutes) {
  try {
    await deskPage.goto(`http://localhost:3010${route.path}`, { waitUntil: 'networkidle', timeout: 20000 });
    await deskPage.waitForTimeout(600);
    await deskPage.screenshot({ path: `${artifactDir}/subpage_${route.name}.png`, fullPage: false });
    console.log(`Captured subpage: ${route.name}`);
  } catch (e) {
    console.log(`Failed capturing subpage ${route.name}:`, e.message);
  }
}

// 5. DOM & UX/UI INSPECTION ON DASHBOARD
await deskPage.goto('http://localhost:3010/dashboard', { waitUntil: 'networkidle', timeout: 30000 });
const pageMetrics = await deskPage.evaluate(() => {
  const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6')).map(h => ({
    tag: h.tagName,
    text: h.innerText.trim(),
    fontSize: window.getComputedStyle(h).fontSize,
    fontWeight: window.getComputedStyle(h).fontWeight,
    color: window.getComputedStyle(h).color
  }));

  const buttons = Array.from(document.querySelectorAll('button, a.btn, a[role="button"]')).map(b => {
    const rect = b.getBoundingClientRect();
    const cs = window.getComputedStyle(b);
    return {
      text: b.innerText.trim() || b.getAttribute('aria-label') || 'unlabelled',
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      bg: cs.backgroundColor,
      color: cs.color,
      cursor: cs.cursor,
      borderRadius: cs.borderRadius
    };
  });

  const cards = Array.from(document.querySelectorAll('[class*="card"], [class*="panel"], section, article')).map(c => {
    const cs = window.getComputedStyle(c);
    const rect = c.getBoundingClientRect();
    return {
      className: c.className,
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      bg: cs.backgroundColor,
      border: cs.border,
      borderRadius: cs.borderRadius,
      padding: cs.padding
    };
  });

  // Check horizontal overflow
  const docWidth = document.documentElement.scrollWidth;
  const winWidth = window.innerWidth;
  const hasOverflow = docWidth > winWidth;

  return {
    title: document.title,
    headings,
    buttonsCount: buttons.length,
    buttonsSample: buttons.slice(0, 15),
    cardsCount: cards.length,
    cardsSample: cards.slice(0, 10),
    hasOverflow,
    docWidth,
    winWidth
  };
});

writeFileSync(`${artifactDir}/audit_metrics.json`, JSON.stringify(pageMetrics, null, 2));

console.log('--- AUDIT COMPLETE ---');
console.log('Title:', pageMetrics.title);
console.log('Headings:', pageMetrics.headings);

await browser.close();
