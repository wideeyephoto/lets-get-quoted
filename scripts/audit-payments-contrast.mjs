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

console.log('2. Launching Playwright browser for /dashboard/payments contrast audit across all themes...');
const browser = await chromium.launch({ headless: true });

const themes = ['dark', 'dim', 'light', 'sunlight', 'parchment', 'onyx', 'clarity', 'monochrome'];
const allResults = {};

for (const theme of themes) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addCookies(cookies);
  const page = await context.newPage();

  try {
    await page.goto('http://localhost:3010/dashboard/payments', { waitUntil: 'networkidle', timeout: 25000 });
    await page.evaluate((th) => {
      document.documentElement.setAttribute('data-theme', th);
      document.documentElement.dataset.theme = th;
      localStorage.setItem('theme', th);
    }, theme);
    await page.waitForTimeout(600);

    await page.screenshot({ path: `c:/dev/payments-${theme}.png` });

    const audit = await page.evaluate(() => {
      const lin = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
      const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
      const parse = (s) => (s.match(/[\d.]+/g) || []).map(Number);
      const over = (fg, bg) => {
        const a = fg[3] === undefined ? 1 : fg[3];
        return [0, 1, 2].map((i) => Math.round(fg[i] * a + bg[i] * (1 - a)));
      };

      const issues = [];
      const seen = new Set();
      const elements = Array.from(document.querySelectorAll('main *'));

      for (const el of elements) {
        if (!el || el.children.length > 3) continue; // leaf or near-leaf elements
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.1) continue;

        const text = (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' ? (el.value || el.placeholder || '') : el.textContent || '').trim();
        if (!text || text.length > 80) continue;

        let bg = null;
        for (let node = el; node; node = node.parentElement) {
          const bgCs = getComputedStyle(node);
          const parts = parse(bgCs.backgroundColor);
          if (parts.length >= 3 && (parts[3] === undefined || parts[3] > 0.8)) {
            bg = parts.slice(0, 3);
            break;
          }
        }
        if (!bg) {
          const bodyParts = parse(getComputedStyle(document.body).backgroundColor);
          bg = bodyParts.length >= 3 ? bodyParts.slice(0, 3) : [15, 17, 23];
        }

        const fgRaw = parse(cs.color);
        if (fgRaw.length < 3) continue;
        const fg = over(fgRaw, bg);

        const [x, y] = [lum(fg), lum(bg)].sort((p, q) => q - p);
        const ratio = Number(((x + 0.05) / (y + 0.05)).toFixed(2));
        const px = parseFloat(cs.fontSize) || 14;
        const isLarge = px >= 24 || (px >= 18.5 && (parseInt(cs.fontWeight, 10) >= 700 || cs.fontWeight === 'bold'));
        const minRatio = isLarge ? 3.0 : 4.5;

        if (ratio < minRatio) {
          const key = `${el.tagName}:${text.slice(0, 25)}:${ratio}`;
          if (!seen.has(key)) {
            seen.add(key);
            issues.push({
              tag: el.tagName.toLowerCase(),
              text: text.slice(0, 50),
              ratio,
              minRatio,
              fg: `rgb(${fg.join(',')})`,
              bg: `rgb(${bg.join(',')})`,
              fontSize: `${px.toFixed(1)}px`,
              selector: el.className ? `.${el.className.split(' ').join('.')}` : el.tagName.toLowerCase()
            });
          }
        }
      }

      return {
        totalElements: elements.length,
        issueCount: issues.length,
        issues: issues.slice(0, 20)
      };
    });

    allResults[theme] = audit;
    console.log(`\n=== Theme: ${theme.toUpperCase()} === (${audit.issueCount} contrast issues)`);
    for (const iss of audit.issues) {
      console.log(`  [FAIL] <${iss.tag}> "${iss.text}" -> ${iss.ratio}:1 (min ${iss.minRatio}:1) | fg: ${iss.fg} on bg: ${iss.bg} (${iss.selector})`);
    }
  } catch (e) {
    console.error(`Theme ${theme} error:`, e.message);
  } finally {
    await context.close();
  }
}

await browser.close();
