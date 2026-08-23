import { readFileSync, mkdirSync } from 'node:fs';
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
const authCookies = [];
for (let i = 0, n = 0; i < payload.length; i += 3180, n += 1) {
  authCookies.push({ name: `sb-${ref}-auth-token.${n}`, value: payload.slice(i, i + 3180), domain: 'localhost', path: '/', sameSite: 'Lax' });
}

const browser = await chromium.launch({ headless: true });

for (const theme of ['dark', 'light']) {
  console.log(`Capturing ${theme} theme...`);
  const cookies = [
    ...authCookies,
    { name: 'lgq-theme', value: theme, domain: 'localhost', path: '/', sameSite: 'Lax' }
  ];

  // Desktop
  const deskContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: theme
  });
  await deskContext.addCookies(cookies);
  const deskPage = await deskContext.newPage();
  await deskPage.goto('http://localhost:3010/dashboard', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await deskPage.waitForTimeout(1000);
  await deskPage.screenshot({ path: `${artifactDir}/desktop_${theme}_full.png`, fullPage: true });
  await deskPage.screenshot({ path: `${artifactDir}/desktop_${theme}_viewport.png`, fullPage: false });

  // Mobile
  const mobContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    colorScheme: theme
  });
  await mobContext.addCookies(cookies);
  const mobPage = await mobContext.newPage();
  await mobPage.goto('http://localhost:3010/dashboard', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await mobPage.waitForTimeout(1000);
  await mobPage.screenshot({ path: `${artifactDir}/mobile_${theme}_full.png`, fullPage: true });

  await deskContext.close();
  await mobContext.close();
}

// Also capture subpages in dark theme with proper domcontentloaded wait
const deskContext = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  colorScheme: 'dark'
});
await deskContext.addCookies([
  ...authCookies,
  { name: 'lgq-theme', value: 'dark', domain: 'localhost', path: '/', sameSite: 'Lax' }
]);
const deskPage = await deskContext.newPage();

const subRoutes = [
  { name: 'leads', path: '/dashboard/leads' },
  { name: 'schedule', path: '/dashboard/schedule' },
  { name: 'jobs', path: '/dashboard/jobs' },
  { name: 'clients', path: '/dashboard/clients' },
  { name: 'settings', path: '/dashboard/settings' },
  { name: 'automations', path: '/dashboard/automations' },
  { name: 'messages', path: '/dashboard/messages' },
  { name: 'cash_flow', path: '/dashboard/cash-flow' },
  { name: 'reviews', path: '/dashboard/reviews' },
  { name: 'crew', path: '/dashboard/crew' }
];

for (const route of subRoutes) {
  try {
    await deskPage.goto(`http://localhost:3010${route.path}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await deskPage.waitForTimeout(800);
    await deskPage.screenshot({ path: `${artifactDir}/subpage_${route.name}.png`, fullPage: false });
    console.log(`Captured subpage: ${route.name}`);
  } catch (e) {
    console.log(`Failed subpage ${route.name}:`, e.message);
  }
}

await browser.close();
console.log('Both themes and subpages captured successfully.');
