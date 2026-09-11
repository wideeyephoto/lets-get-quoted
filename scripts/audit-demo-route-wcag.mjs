// Real-browser WCAG AA sweep against this app's own /demo/* routes, across the
// four primary dashboard themes (Dark, Workbench=light, Light=sunlight, Dim).
//
// WHY DEMO ROUTES. LAUNCH_CHECKLIST.md section 10's own baseline audit (2026-08-31)
// ran against live authenticated production with a real account, found 200/200
// page/mode combinations failing, and was marked fixed on local CSS patches that
// were never re-verified against that baseline -- the section's own text says so.
// This repo has no re-runnable accessibility check at all. Re-running the
// original audit needs a live Supabase project and a seeded account; absent
// those, /demo/* is the best available proxy: it renders the same shared chrome,
// many of the same CSS Modules and page components, with synthetic fixture data
// and no auth required. It is a proxy, not a rerun -- dynamic-ID authenticated
// surfaces with no demo twin (a real invoice, a real statement, Voice/Calls,
// imports, Managed Ads' authenticated variant, reports) are not covered.
//
// Usage:
//   npm run dev                              # in one terminal
//   npm run audit:demo-wcag                  # in another
//   npm run audit:demo-wcag -- --base-url http://localhost:3010 --out results.json
//
// Exits 1 if any violation is found (see --allow below), 0 otherwise, so this
// can gate CI once the current backlog is worked down.
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    'base-url': { type: 'string' },
    out: { type: 'string' },
    // Rule ids to report but not fail the exit code on, e.g. while a known
    // backlog is worked down: --allow color-contrast
    allow: { type: 'string', multiple: true, default: [] },
    help: { type: 'boolean' },
  },
});

if (values.help) {
  console.log('Usage: node scripts/audit-demo-route-wcag.mjs [--base-url <url>] [--out <file>] [--allow <ruleId>]...');
  console.log('Requires the dev server already running (npm run dev). Sweeps every /demo/* route');
  console.log('across the four primary themes with a real Chromium + axe-core, WCAG 2.0/2.1 A/AA.');
  process.exit(0);
}

const BASE = values['base-url'] || process.env.AUDIT_BASE_URL || 'http://localhost:3010';
const OUT = values.out || process.env.AUDIT_OUT || 'wcag-demo-audit-results.json';
const ALLOWED_RULES = new Set(values.allow);

// The four THEME_CHOICES values from src/lib/theme.ts, by their internal
// data-theme value -- 'Workbench' and 'Light' are display labels for the
// internal 'light' and 'sunlight' enum members, not literal cookie values.
const THEMES = [
  { label: 'Dark', value: 'dark' },
  { label: 'Workbench', value: 'light' },
  { label: 'Light', value: 'sunlight' },
  { label: 'Dim', value: 'dim' },
];

// Every static /demo page.tsx route, plus one instance of each dynamic route
// using a fixture ID confirmed live on a running dev server. Re-derive with:
//   find src/app/demo -name page.tsx | sed 's#src/app##; s#/page.tsx##'
const ROUTES = [
  '/demo', '/demo/automations', '/demo/marketing/campaigns', '/demo/cash-flow',
  '/demo/clients', '/demo/clients/demo-client-1', '/demo/crew', '/demo/customize',
  '/demo/email-themes', '/demo/insights', '/demo/jobs', '/demo/jobs/job-9',
  '/demo/leads', '/demo/leads/lead-1', '/demo/marketing', '/demo/marketing/ads',
  '/demo/marketing/blog', '/demo/marketing/blog/demo-post-1',
  '/demo/marketing/email-theme', '/demo/marketing/links',
  '/demo/marketing/performance', '/demo/marketing/referrals', '/demo/messages',
  '/demo/payroll', '/demo/quick-stops', '/demo/rebook', '/demo/recurring',
  '/demo/reviews', '/demo/schedule', '/demo/schedule/booking',
  '/demo/schedule/plan', '/demo/services', '/demo/settings', '/demo/sites',
  '/demo/sms-quote', '/demo/tour', '/demo/tour/approve', '/demo/tour/complete',
  '/demo/tour/intake', '/demo/tour/lead', '/demo/tour/quote', '/demo/tour/site',
];

// Pinned to the pre-installed revision rather than the version Playwright's npm
// package expects, per this environment's own browser setup: the two can drift
// (the installed chromium-1194 vs. an expected chromium_headless_shell-1234),
// and re-downloading is neither necessary nor always possible here. Falls back
// to Playwright's own resolution elsewhere, since the pin is an environment
// workaround, not a general requirement.
const PINNED_CHROMIUM = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const launchOptions = process.env.PLAYWRIGHT_BROWSERS_PATH ? { executablePath: PINNED_CHROMIUM } : {};
const browser = await chromium.launch(launchOptions).catch(() => chromium.launch());

const results = [];
let totalViolationInstances = 0;
let failingInstances = 0;

for (const theme of THEMES) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addCookies([{ name: 'lgq-theme', value: theme.value, domain: new URL(BASE).hostname, path: '/' }]);

  for (const route of ROUTES) {
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 300)); });
    page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`.slice(0, 300)));

    let httpStatus = null;
    let renderedTheme = null;
    try {
      const resp = await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle', timeout: 30000 });
      httpStatus = resp?.status() ?? null;
      renderedTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
      await page.waitForTimeout(150); // settle async-rendered content, matching the original audit's note on this

      const axeResults = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();

      for (const violation of axeResults.violations) {
        totalViolationInstances += violation.nodes.length;
        if (!ALLOWED_RULES.has(violation.id)) failingInstances += violation.nodes.length;
        results.push({
          theme: theme.label,
          route,
          httpStatus,
          renderedTheme,
          ruleId: violation.id,
          impact: violation.impact,
          help: violation.help,
          helpUrl: violation.helpUrl,
          nodeCount: violation.nodes.length,
          sampleTargets: violation.nodes.slice(0, 3).map((n) => n.target.join(' ')),
          sampleSummary: violation.nodes[0]?.failureSummary?.slice(0, 400) ?? null,
        });
      }
      if (consoleErrors.length) {
        results.push({ theme: theme.label, route, httpStatus, renderedTheme, ruleId: 'console-error', impact: 'info', nodeCount: consoleErrors.length, sampleTargets: [], sampleSummary: consoleErrors[0] });
      }
    } catch (err) {
      failingInstances += 1;
      results.push({ theme: theme.label, route, httpStatus, renderedTheme, ruleId: 'load-failure', impact: 'critical', nodeCount: 1, sampleTargets: [], sampleSummary: String(err).slice(0, 400) });
    } finally {
      await page.close();
    }
  }
  await context.close();
  console.log(`Theme ${theme.label} (${theme.value}): done.`);
}

await browser.close();

const byRule = new Map();
for (const r of results) {
  if (r.ruleId === 'console-error') continue;
  const key = r.ruleId;
  if (!byRule.has(key)) byRule.set(key, { ruleId: key, impact: r.impact, help: r.help, helpUrl: r.helpUrl, occurrences: 0, nodeInstances: 0, routes: new Set() });
  const entry = byRule.get(key);
  entry.occurrences += 1;
  entry.nodeInstances += r.nodeCount;
  entry.routes.add(`${r.route} [${r.theme}]`);
}

const summary = [...byRule.values()]
  .sort((a, b) => b.nodeInstances - a.nodeInstances)
  .map((e) => ({ ...e, routes: [...e.routes].slice(0, 8) }));

await writeFile(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), baseUrl: BASE, routeCount: ROUTES.length, themeCount: THEMES.length, totalViolationInstances, summary, raw: results }, null, 2));

console.log(`\n${ROUTES.length} routes x ${THEMES.length} themes = ${ROUTES.length * THEMES.length} page loads.`);
console.log(`${totalViolationInstances} total violation instances across ${summary.length} distinct rules.`);
for (const e of summary) {
  console.log(`\n[${e.impact}] ${e.ruleId} (${e.nodeInstances} instances, ${e.occurrences} page/theme combos) — ${e.help}`);
  console.log(`  e.g. ${e.routes.slice(0, 4).join(', ')}`);
}
console.log(`\nFull results: ${OUT}`);

if (failingInstances > 0) {
  console.log(`\nFAIL: ${failingInstances} violation instance(s) outside --allow.`);
  process.exitCode = 1;
} else {
  console.log('\nOK: no violations outside --allow.');
}
