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

const artifactDir = 'C:\\Users\\brett\\.gemini\\antigravity-ide\\brain\\3d880b69-3469-488a-9f16-f7c2e5642bdc';

// Probe script for contrast and metrics
const PROBE = `(() => {
  const lin = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
  const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const parse = (s) => (s.match(/[\\d.]+/g) || []).map(Number);
  const over = (fg, bg) => {
    const a = fg[3] === undefined ? 1 : fg[3];
    return [0,1,2].map((i) => fg[i] * a + bg[i] * (1 - a));
  };
  window.__measureContrast = (el) => {
    if (!el) return null;
    const cs = getComputedStyle(el);
    let bg = null;
    for (let node = el; node; node = node.parentElement) {
      const parts = parse(getComputedStyle(node).backgroundColor);
      if (parts.length >= 3 && (parts[3] === undefined || parts[3] > 0.92)) { bg = parts.slice(0, 3); break; }
    }
    if (!bg) bg = [10, 16, 26]; // default dark bg
    const fg = over(parse(cs.color), bg);
    const [x, y] = [lum(fg), lum(bg)].sort((p, q) => q - p);
    const px = parseFloat(cs.fontSize);
    return { ratio: Number(((x + 0.05) / (y + 0.05)).toFixed(2)), px: Number(px.toFixed(1)), weight: cs.fontWeight };
  };
})()`;

console.log('2. Launching Playwright browser...');
const browser = await chromium.launch();

const audit = {
  url: 'http://localhost:3010/dashboard',
  desktop: {},
  mobile: {},
  contrastChecks: [],
  sectionsFound: [],
  metricsFound: [],
  priorityItems: [],
  todaySchedule: {},
  jobReadiness: {},
  crewStatus: {},
  cashPreview: {},
  salesPipeline: {},
  automations: {},
  quickLinks: []
};

// ==========================================
// A. DESKTOP VIEWPORT (1440x960)
// ==========================================
console.log('3. Running Desktop Audit...');
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 2 });
  await context.addCookies(cookies);
  const page = await context.newPage();
  await page.addInitScript(PROBE);

  const res = await page.goto('http://localhost:3010/dashboard', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('.workspace-shell', { timeout: 30000 });
  await page.waitForTimeout(1500);

  // Capture full screenshot and segmented screenshots
  await page.screenshot({ path: `${artifactDir}\\dashboard_desktop_full.png`, fullPage: true });
  await page.screenshot({ path: `${artifactDir}\\dashboard_desktop_above_fold.png` });

  const desktopData = await page.evaluate(() => {
    const pageTitle = document.title;
    const h1 = document.querySelector('h1')?.textContent.trim() || '';
    
    // Headings
    const headings = Array.from(document.querySelectorAll('h1, h2, h3')).map(h => ({
      tag: h.tagName,
      text: h.textContent.trim(),
      eyebrow: h.parentElement?.querySelector('.eyebrow')?.textContent.trim() || ''
    }));

    // Cards / Sections
    const sectionCards = Array.from(document.querySelectorAll('.workspace-section-card, section.panel')).map(s => {
      const heading = s.querySelector('h2, h3')?.textContent.trim() || 'Untitled Section';
      const eyebrow = s.querySelector('.eyebrow')?.textContent.trim() || '';
      return { eyebrow, heading, className: s.className };
    });

    // Metrics in "How the business is doing"
    const metricCards = Array.from(document.querySelectorAll('.workspace-metric-card')).map(m => ({
      label: m.querySelector('.workspace-metric-label')?.textContent.trim() || '',
      value: m.querySelector('.workspace-metric-value')?.textContent.trim() || '',
      note: m.querySelector('.workspace-metric-note')?.textContent.trim() || ''
    }));

    // Priorities
    const priorities = Array.from(document.querySelectorAll('.priority-item')).map(p => ({
      index: p.querySelector('.priority-index')?.textContent.trim() || '',
      title: p.querySelector('.priority-copy strong')?.textContent.trim() || '',
      detail: p.querySelector('.priority-copy span')?.textContent.trim() || '',
      cta: p.querySelector('.priority-cta')?.textContent.trim() || '',
      href: p.getAttribute('href')
    }));

    // Today's schedule
    const todayItems = Array.from(document.querySelectorAll('.today-job-card')).map(card => {
      return {
        text: card.textContent.trim().replace(/\s+/g, ' '),
        href: card.getAttribute('href')
      };
    });

    // 7-day glance
    const weekDays = Array.from(document.querySelectorAll('.week-glance-day')).map(d => ({
      date: d.querySelector('.week-glance-date')?.textContent.trim() || '',
      jobCount: d.querySelectorAll('.week-glance-job').length,
      isToday: d.classList.contains('today'),
      isQuiet: d.classList.contains('is-quiet')
    }));

    // Quick links
    const quickLinks = Array.from(document.querySelectorAll('.dash-quicklinks .actions a')).map(a => ({
      text: a.textContent.trim(),
      href: a.getAttribute('href')
    }));

    return {
      pageTitle,
      h1,
      headings,
      sectionCards,
      metricCards,
      priorities,
      todayItems,
      weekDays,
      quickLinks,
      scrollHeight: document.documentElement.scrollHeight
    };
  });

  audit.desktop = desktopData;
  await context.close();
}

// ==========================================
// B. MOBILE VIEWPORT (390x844 iPhone 14/15)
// ==========================================
console.log('4. Running Mobile Audit...');
{
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true
  });
  await context.addCookies(cookies);
  const page = await context.newPage();
  await page.addInitScript(PROBE);

  await page.goto('http://localhost:3010/dashboard', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('.workspace-shell', { timeout: 30000 });
  await page.waitForTimeout(1500);

  await page.screenshot({ path: `${artifactDir}\\dashboard_mobile_full.png`, fullPage: true });
  await page.screenshot({ path: `${artifactDir}\\dashboard_mobile_top.png` });

  const mobileData = await page.evaluate(() => {
    const height = document.documentElement.scrollHeight;
    const screens = (height / 844).toFixed(1);

    // Check tap targets
    const interactive = Array.from(document.querySelectorAll('a, button, summary, input, select')).map(el => {
      const rect = el.getBoundingClientRect();
      const text = el.textContent.trim().slice(0, 30);
      return {
        tag: el.tagName,
        text,
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        meets44px: rect.width >= 44 && rect.height >= 44,
        visible: rect.width > 0 && rect.height > 0 && el.offsetParent !== null
      };
    }).filter(i => i.visible && !i.meets44px && i.text);

    // Check horizontal overflows
    const horizontalOverflows = Array.from(document.querySelectorAll('*')).filter(el => {
      return el.scrollWidth > document.documentElement.clientWidth + 2;
    }).map(el => ({
      tag: el.tagName,
      className: el.className,
      scrollWidth: el.scrollWidth,
      clientWidth: document.documentElement.clientWidth
    })).slice(0, 5);

    // Mobile bar presence
    const mobileBar = {
      present: !!document.querySelector('.sidenav-mobilebar'),
      hasNewButton: !!document.querySelector('.mobilebar-new'),
      hasPlanButton: !!document.querySelector('.mobilebar-plan'),
      hasNavToggle: !!document.querySelector('.nav-toggle')
    };

    return {
      height,
      screens,
      smallTouchTargets: interactive.slice(0, 10),
      horizontalOverflows,
      mobileBar
    };
  });

  audit.mobile = mobileData;
  await context.close();
}

await browser.close();

console.log('5. Audit Completed! Writing summary...');
writeFileSync(`${artifactDir}\\audit_raw_data.json`, JSON.stringify(audit, null, 2));
console.log('Raw data written to audit_raw_data.json');
