// The deployed half of G5, which no local run can establish.
//
// scripts/verify-status-page-boundary.mjs proves the grants against a
// PostgreSQL it booted itself. That says nothing about the database this
// product actually talks to, or about what the rendered page shows. This probes
// the real deployment: the anonymous page, the anonymous Data API, the sitemap
// and the app-host redirect.
//
// READ-ONLY. It sends GETs with the public anon key and never writes. Point it
// at a host during the operator rehearsal, once per state:
//
//   node scripts/verify-deployed-status-page.mjs --host letsgetquoted.com \
//     --expect incident \
//     --require "Checkout failing" \
//     --forbid "ops@letsgetquoted.com" --forbid "the underlying cause"
//
// --expect  operational | incident | unavailable — the banner the page must show.
// --require text that MUST appear (the published title, the customer-facing body).
// --forbid  text that must NOT appear. Pass the fixture's root cause, owner and
//           external URL verbatim: that is what turns "the columns are not
//           granted" into "this deployment did not print them".
// --anon-key / NEXT_PUBLIC_SUPABASE_ANON_KEY and --supabase-url /
//           NEXT_PUBLIC_SUPABASE_URL enable the Data API half. Both are public
//           values; no service-role key is read and none should be supplied.
//
// Exits nonzero on the first failed check. A failure is never ambiguous: it
// names the check, what was expected, and what was seen.
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    host: { type: 'string' },
    expect: { type: 'string' },
    require: { type: 'string', multiple: true, default: [] },
    forbid: { type: 'string', multiple: true, default: [] },
    'anon-key': { type: 'string' },
    'supabase-url': { type: 'string' },
    'app-host': { type: 'string' },
    help: { type: 'boolean' },
  },
});

if (values.help || !values.host) {
  console.log('Usage: node scripts/verify-deployed-status-page.mjs --host <apex> [--expect operational|incident|unavailable]');
  console.log('       [--require <text>]... [--forbid <text>]... [--supabase-url <url> --anon-key <public anon key>]');
  console.log('Read-only. Probes the deployed /status page, the anonymous Data API, the sitemap and the app-host redirect.');
  process.exit(values.help ? 0 : 2);
}

const STATES = {
  operational: 'All Systems Operational',
  incident: 'Active Incident Ongoing',
  unavailable: 'Status Unavailable',
};
if (values.expect && !STATES[values.expect]) {
  console.error(`FAIL: --expect must be one of ${Object.keys(STATES).join(', ')}`);
  process.exit(2);
}

// A scheme may be given explicitly. Production is always https; accepting http
// is what lets this script be exercised against a local mock rather than only
// against the thing it is meant to check.
const scheme = /^http:\/\//.test(values.host) ? 'http' : 'https';
const apex = values.host.replace(/^https?:\/\//, '').replace(/\/+$/, '');
const appHost = (values['app-host'] || `app.${apex}`).replace(/^https?:\/\//, '');
const origin = `${scheme}://${apex}`;
const appOrigin = `${scheme}://${appHost}`;
const supabaseUrl = (values['supabase-url'] || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '');
const anonKey = values['anon-key'] || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

let passed = 0;
const failures = [];
const pass = (name) => { passed += 1; console.log(`PASS ${name}`); };
const fail = (name, detail) => { failures.push(`${name}: ${detail}`); console.log(`FAIL ${name} — ${detail}`); };

const get = (url, init) => fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(20000), ...init });

// 1. The page answers anonymously at all. 404 is the current production state
//    and is the thing this whole gate exists to change.
let html = '';
try {
  const res = await get(`${origin}/status`);
  if (res.status !== 200) fail('anonymous /status returns 200', `got HTTP ${res.status}`);
  else {
    html = await res.text();
    pass('anonymous /status returns 200');
  }
} catch (error) {
  fail('anonymous /status returns 200', error.message);
}

if (html) {
  // 2. The banner the operator expects. Asserting the state is what makes this
  //    a rehearsal step rather than a liveness check.
  if (values.expect) {
    const wanted = STATES[values.expect];
    const others = Object.entries(STATES).filter(([key]) => key !== values.expect);
    if (!html.includes(wanted)) fail(`page shows "${values.expect}"`, `"${wanted}" not present`);
    else {
      const bleed = others.filter(([, text]) => html.includes(text)).map(([key]) => key);
      if (bleed.length) fail(`page shows only "${values.expect}"`, `also shows ${bleed.join(', ')}`);
      else pass(`page shows "${values.expect}" and no other state`);
    }
  }

  for (const needle of values.require) {
    if (html.includes(needle)) pass(`page shows required text: ${JSON.stringify(needle)}`);
    else fail('page shows required text', `${JSON.stringify(needle)} not present`);
  }

  // 3. The leak check. The grant is meant to make these unreachable; this is
  //    the evidence that the deployed page did not print them anyway.
  for (const needle of values.forbid) {
    if (html.includes(needle)) fail('page withholds internal text', `${JSON.stringify(needle)} IS PRESENT on the public page`);
    else pass(`page withholds internal text: ${JSON.stringify(needle)}`);
  }

  // Column names leaking as rendered labels would mean a raw row reached the page.
  const named = ['root_cause', 'external_url', 'created_by', 'affected_services'].filter((column) => html.includes(column));
  if (named.length) fail('page names no internal column', `found ${named.join(', ')}`);
  else pass('page names no internal column');
}

// 4. The sitemap has to claim it, or nothing will ever crawl it.
try {
  const res = await get(`${origin}/sitemap.xml`);
  const body = res.status === 200 ? await res.text() : '';
  if (res.status !== 200) fail('sitemap lists /status', `sitemap returned HTTP ${res.status}`);
  else if (!body.includes(`${origin}/status`)) fail('sitemap lists /status', 'entry absent');
  else pass('sitemap lists /status');
} catch (error) {
  fail('sitemap lists /status', error.message);
}

// 5. The app host must hand the URL back to the apex rather than answer as a
//    second copy of it.
try {
  const res = await get(`${appOrigin}/status`);
  const location = res.headers.get('location') || '';
  if (res.status !== 308) fail('app host redirects /status to the apex', `got HTTP ${res.status}`);
  else if (!location.startsWith(`${origin}/status`)) fail('app host redirects /status to the apex', `redirected to ${location || '(no Location)'}`);
  else pass('app host 308s /status to the apex');
} catch (error) {
  fail('app host redirects /status to the apex', error.message);
}

// 6. The hosted grant itself, through the public Data API. This is the check the
//    local PostgreSQL run cannot stand in for: it asks the real database.
if (supabaseUrl && anonKey) {
  const rest = (query) => get(`${supabaseUrl}/rest/v1/platform_incidents?${query}`, {
    headers: { apikey: anonKey, authorization: `Bearer ${anonKey}` },
  });
  const refusedByGrant = (status, body) =>
    status === 401 || status === 403 || /permission denied|does not exist/i.test(body);

  for (const [label, query] of [
    ['select=*', 'select=*'],
    ['root_cause', 'select=root_cause'],
    ['owner', 'select=owner'],
    ['created_by', 'select=created_by'],
    ['external_url', 'select=external_url'],
  ]) {
    try {
      const res = await rest(query);
      const body = await res.text();
      if (refusedByGrant(res.status, body)) pass(`Data API refuses anonymous ${label}`);
      else fail(`Data API refuses anonymous ${label}`, `HTTP ${res.status}: ${body.slice(0, 180)}`);
    } catch (error) {
      fail(`Data API refuses anonymous ${label}`, error.message);
    }
  }

  // And the read the page depends on still works, or the page is broken in the
  // other direction.
  try {
    const res = await rest('select=id,kind,title,published&published=eq.false&limit=1');
    const body = await res.text();
    if (res.status !== 200) fail('Data API allows the public column read', `HTTP ${res.status}: ${body.slice(0, 180)}`);
    else if (body.trim() !== '[]') fail('Data API hides unpublished rows', `unpublished row returned: ${body.slice(0, 180)}`);
    else pass('Data API allows the public column read and returns no unpublished row');
  } catch (error) {
    fail('Data API allows the public column read', error.message);
  }
} else {
  console.log('SKIP Data API checks — pass --supabase-url and --anon-key (both public values) to include them.');
}

console.log('');
if (failures.length) {
  console.log(`FAILED — ${passed} passed, ${failures.length} failed:`);
  for (const line of failures) console.log(`  ${line}`);
  process.exitCode = 1;
} else {
  console.log(`OK — ${passed} checks passed against ${origin} at ${new Date().toISOString()}.`);
}
