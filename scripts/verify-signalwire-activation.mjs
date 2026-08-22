// Is this deployment actually able to send and receive a text through
// SignalWire, and if not, exactly which link in the chain is broken?
//
// READ-ONLY. Every provider call below is a GET. Nothing here mutates a number,
// a campaign, or an assignment -- activation is an operator decision and this
// script exists to tell that operator what they are about to walk into.
//
// WHY THIS EXISTS. The chain has nine links and eight of them fail SILENTLY:
//
//   - a credential under an env name the app cannot read looks set in a
//     dashboard and is invisible to the process (see checkEnvNames below --
//     this is not hypothetical, it is how the token was lost the first time)
//   - an incomplete credential set makes smsProviderConfig() return null, and
//     because an explicit LGQ_SMS_PROVIDER never falls back, the symptom is
//     "cannot send at all" while naming nothing
//   - a number can sit in a space, in a resource, and in a processed ORDER
//     while its campaign ASSIGNMENT is failed -- outbound is then filtered by
//     the carrier rather than refused by the provider, so the send looks fine
//   - an inbound webhook can point at an entirely different Supabase project
//   - the message handler can be swml_webhooks when the app speaks laml
//   - a lane flag that is absent reads exactly like a lane flag that is off
//
// IT IS A GATE, NOT A REPORT. It sets a non-zero exit code. scripts/
// check-schema-order.mjs prints its problems and exits 0 regardless, which
// makes it invisible in any pipeline; that mistake is not repeated here.

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------- env ------

/** A name the operating system, and therefore process.env, can actually hold. */
export const POSIX_ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Names that look like they were meant for this integration. */
export const MESSAGING_NAME_HINT = /signalwire|lgq_sms|lgq_signalwire|lgq_disable_outbound/i;

/**
 * Parse an env file into entries, KEEPING keys that are not legal env names.
 *
 * That is the entire point. A normal loader silently drops
 * `SIGNALWIRE-DEV-2=PT...` because it can never become process.env.SIGNALWIRE_DEV_2,
 * and dropping it is what makes the failure invisible: the value is right there
 * in the file, the operator can see it, and the app cannot.
 */
export function parseEnvEntries(contents) {
  const out = [];
  for (const raw of contents.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out.push({ key, value, readable: POSIX_ENV_NAME.test(key) });
  }
  return out;
}

/**
 * Credentials present under a name the app can never read.
 *
 * Returns the offending keys, never the values.
 */
export function unreadableMessagingNames(entries) {
  return entries
    .filter((e) => !e.readable && e.value.length > 0 && MESSAGING_NAME_HINT.test(e.key))
    .map((e) => e.key);
}

function loadEnv() {
  const entries = [];
  for (const name of ['.env.local', '.env']) {
    try {
      entries.push(...parseEnvEntries(readFileSync(resolve(__dirname, '..', name), 'utf8')));
    } catch {
      /* absent is fine */
    }
  }
  for (const { key, value, readable } of entries) {
    if (readable && process.env[key] === undefined) process.env[key] = value;
  }
  return entries;
}

// ------------------------------------------------------- pure predicates ---

/**
 * Does signalwireConfig() resolve? Mirrors src/lib/sms-provider.ts exactly.
 *
 * Restated rather than imported because this script must run with no build
 * step and no TypeScript. Restating a condition risks drift, so the test beside
 * it asserts this function and the real one agree on the same inputs.
 */
export function signalwireConfigResolves(env) {
  const space = (env.SIGNALWIRE_SPACE_URL || '').trim();
  const project = env.SIGNALWIRE_PROJECT_ID;
  const token = env.SIGNALWIRE_API_TOKEN;
  const pool = env.SIGNALWIRE_NUMBER_GROUP_ID;
  const from = env.SIGNALWIRE_FROM_NUMBER;
  const missing = [];
  if (!space) missing.push('SIGNALWIRE_SPACE_URL');
  if (!project) missing.push('SIGNALWIRE_PROJECT_ID');
  if (!token) missing.push('SIGNALWIRE_API_TOKEN');
  if (!pool && !from) missing.push('SIGNALWIRE_FROM_NUMBER or SIGNALWIRE_NUMBER_GROUP_ID');
  return { ok: missing.length === 0, missing };
}

/** Mirrors smsProviderConfig(): an explicit selector never falls back. */
export function resolveProvider(env, signalwireOk, twilioOk) {
  const requested = (env.LGQ_SMS_PROVIDER || '').trim().toLowerCase();
  const available = [twilioOk ? 'twilio' : null, signalwireOk ? 'signalwire' : null].filter(Boolean);
  if (requested === 'twilio' || requested === 'signalwire') {
    return available.includes(requested)
      ? { provider: requested, reason: 'explicitly selected and configured' }
      : { provider: null, reason: `LGQ_SMS_PROVIDER=${requested} but its credentials are incomplete -- this refuses rather than falling back, so nothing can send` };
  }
  if (requested) {
    return { provider: null, reason: `LGQ_SMS_PROVIDER=${requested} is not a provider name; a typo is treated as an explicit choice, never as unset` };
  }
  return available.length
    ? { provider: available[0], reason: 'inferred from the credentials present (incumbent first)' }
    : { provider: null, reason: 'no provider has a complete credential set' };
}

export const CALLBACK_TOKEN_SHAPE = /^[A-Za-z0-9_-]{32,128}$/;

/** The exact URLs the provisioning code will accept, and nothing else. */
export function expectedWebhooks(appUrl) {
  let origin;
  try {
    const u = new URL(appUrl);
    if (u.protocol !== 'https:' || u.username || u.password || u.search || u.hash) return null;
    origin = u.origin;
  } catch {
    return null;
  }
  return { inbound: `${origin}/api/sms/inbound`, status: `${origin}/api/sms/status`, origin };
}

/** The Supabase project ref inside a supabase.co URL, or null. */
export function supabaseRefOf(url) {
  const m = /^https:\/\/([a-z0-9]+)\.supabase\.co/i.exec(url || '');
  return m ? m[1] : null;
}

// ------------------------------------------------------------ reporting ----

const results = [];
const record = (level, name, detail) => { results.push({ level, name, detail }); };
const pass = (n, d) => record('PASS', n, d);
const fail = (n, d) => record('FAIL', n, d);
const warn = (n, d) => record('WARN', n, d);
const info = (n, d) => record('INFO', n, d);

// ------------------------------------------------------------- provider ----

function api(env) {
  const space = (env.SIGNALWIRE_SPACE_URL || '').replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const auth = 'Basic ' + Buffer.from(`${env.SIGNALWIRE_PROJECT_ID}:${env.SIGNALWIRE_API_TOKEN}`).toString('base64');
  return async (path) => {
    const res = await fetch(`https://${space}${path}`, { headers: { Authorization: auth } });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* html error page */ }
    return { status: res.status, json, text };
  };
}

/** --app-url=https://app.example.com, for running this from a laptop. */
export function appUrlArg(argv) {
  const hit = argv.find((a) => a.startsWith('--app-url='));
  return hit ? hit.slice('--app-url='.length) : null;
}

async function main() {
  const entries = loadEnv();
  const env = process.env;
  const appUrl = appUrlArg(process.argv.slice(2)) || env.NEXT_PUBLIC_APP_URL || '';
  const hooks = expectedWebhooks(appUrl);
  if (!hooks) {
    info('app origin', `${JSON.stringify(appUrl)} is not a bare production HTTPS origin; webhook URLs cannot be compared exactly. Pass --app-url= to check them.`);
  }

  // 1. Names the app cannot read -------------------------------------------
  const unreadable = unreadableMessagingNames(entries);
  if (unreadable.length) {
    fail('env names', `${unreadable.length} messaging credential(s) under a name process.env can never hold: ${unreadable.join(', ')}. A hyphen or a lowercase-only name looks set in a dashboard and is invisible to the app.`);
  } else {
    pass('env names', 'every messaging credential uses a legal environment variable name');
  }

  // 2. Provider resolution ---------------------------------------------------
  const sw = signalwireConfigResolves(env);
  const twilioOk = Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_MESSAGING_SERVICE_SID);
  if (sw.ok) pass('signalwire config', 'all required credentials present');
  else fail('signalwire config', `signalwireConfig() returns null -- missing ${sw.missing.join(', ')}`);

  const resolved = resolveProvider(env, sw.ok, twilioOk);
  if (resolved.provider === 'signalwire') pass('provider resolution', resolved.reason);
  else if (resolved.provider) warn('provider resolution', `resolves to ${resolved.provider}, not signalwire -- ${resolved.reason}`);
  else fail('provider resolution', resolved.reason);

  if (!sw.ok) return finish();

  // 3. Credentials actually authenticate ------------------------------------
  const get = api(env);
  const numbers = await get('/api/relay/rest/phone_numbers');
  if (numbers.status !== 200) {
    fail('credentials', `GET /api/relay/rest/phone_numbers returned ${numbers.status}. A 404 here means the path is wrong; a 401 means the token or project is.`);
    return finish();
  }
  pass('credentials', `authenticated against ${env.SIGNALWIRE_SPACE_URL}`);

  // 4. The sending number ----------------------------------------------------
  const want = (env.SIGNALWIRE_FROM_NUMBER || '').trim();
  const list = (numbers.json && numbers.json.data) || [];
  const number = want ? list.find((n) => n.number === want) : null;

  if (want && !number) {
    fail('sending number', `SIGNALWIRE_FROM_NUMBER=${want} is not in this space (${list.length} number(s) present)`);
  } else if (number) {
    pass('sending number', `${number.number} present in the space`);

    // The dialect is wrong or right on its own terms -- nothing about it
    // depends on which origin we expect to be called back at.
    if (number.message_handler === 'laml_webhooks') {
      pass('message handler', 'laml_webhooks, which is the dialect the app parses');
    } else {
      fail('message handler', `${JSON.stringify(number.message_handler)} -- the app requires laml_webhooks. Repointing the URL alone delivers a payload our route cannot read.`);
    }

    const actual = number.message_request_url || '';
    const ref = supabaseRefOf(actual);
    const ours = supabaseRefOf(env.NEXT_PUBLIC_SUPABASE_URL || '');

    // A webhook aimed at somebody else's Supabase project is wrong no matter
    // what this machine thinks the app origin is, so it is judged first and
    // unconditionally. This is the check that answers "does that resource
    // actually target production".
    if (ref && ours && ref !== ours) {
      fail('inbound webhook', `points at Supabase project ${ref}, which is NOT ours (${ours}): ${actual}`);
    } else if (hooks) {
      if (actual === hooks.inbound) pass('inbound webhook', actual);
      else fail('inbound webhook', `expected ${hooks.inbound}, found ${JSON.stringify(actual)}`);
    } else {
      // No production origin to compare against -- say so, and show the value
      // rather than skipping the check and reporting nothing.
      warn('inbound webhook', `cannot be compared: pass --app-url=https://app.example.com or set NEXT_PUBLIC_APP_URL to a production origin. Currently ${JSON.stringify(actual)}`);
    }

    if (number.call_handler && number.call_handler !== 'laml_webhooks') {
      info('voice handler', `call_handler=${number.call_handler} -- voice does not route to this app`);
    }
  } else {
    warn('sending number', 'no SIGNALWIRE_FROM_NUMBER set; a Number Group is in use, which this check does not inspect');
  }

  // 5. Signing key -----------------------------------------------------------
  if ((env.SIGNALWIRE_SIGNING_KEY || '').trim()) {
    pass('signing key', 'present, so signed inbound callbacks can be verified');
  } else {
    fail('signing key', 'SIGNALWIRE_SIGNING_KEY absent -- both webhook routes fail closed and every inbound callback will 403');
  }

  // 6. 10DLC registration ----------------------------------------------------
  const brands = await get('/api/relay/rest/registry/beta/brands');
  const brand = ((brands.json && brands.json.data) || [])[0];
  if (!brand) {
    fail('brand', 'no 10DLC brand in this space');
    return finish();
  }
  if (brand.state === 'completed') pass('brand', `${brand.name} -- ${brand.state}`);
  else fail('brand', `${brand.name} -- state ${brand.state}, needs completed`);

  const campaigns = await get(`/api/relay/rest/registry/beta/brands/${brand.id}/campaigns`);
  const campaign = ((campaigns.json && campaigns.json.data) || [])[0];
  if (!campaign) {
    fail('campaign', 'the brand has no campaign');
    return finish();
  }
  if (campaign.state === 'active') pass('campaign', `${campaign.name} -- ${campaign.state}`);
  else fail('campaign', `${campaign.name} -- state ${campaign.state}, needs active`);

  // 7. The assignment, which is the link that fails while everything else
  //    looks healthy. A processed ORDER is not an assigned NUMBER.
  const assigned = await get(`/api/relay/rest/registry/beta/campaigns/${campaign.id}/numbers`);
  const rows = (assigned.json && assigned.json.data) || [];
  const mine = want ? rows.find((r) => r.phone_number && r.phone_number.number === want) : rows[0];
  if (!mine) {
    fail('campaign assignment', `${want || 'the number'} is not attached to campaign ${campaign.id} at all -- outbound A2P will be carrier-filtered`);
  } else if (mine.state === 'failed') {
    fail('campaign assignment', `assignment ${mine.id} is FAILED (updated ${mine.updated_at}). The number is not attached to the active campaign, so outbound will be filtered even though the provider accepts the send.`);
  } else if (mine.state === 'assigned' || mine.state === 'completed') {
    pass('campaign assignment', `${mine.state}`);
  } else {
    warn('campaign assignment', `state ${mine.state}`);
  }

  // 8. Whether a retry could learn anything ---------------------------------
  const token = (env.LGQ_SIGNALWIRE_10DLC_CALLBACK_TOKEN || '').trim();
  if (!CALLBACK_TOKEN_SHAPE.test(token)) {
    fail('10DLC callback token', 'LGQ_SIGNALWIRE_10DLC_CALLBACK_TOKEN must be 32-128 chars of [A-Za-z0-9_-] before a status callback can be registered');
  } else {
    pass('10DLC callback token', 'well formed');
  }

  const blind = [
    ['campaign', campaign.status_callback_url],
    ['assignment', mine && mine.status_callback_url],
  ].filter(([, v]) => !v);
  if (blind.length) {
    fail('10DLC status callback', `no status_callback_url on: ${blind.map(([k]) => k).join(', ')}. The failure reason exists NOWHERE else -- it is never stored on the object and the dashboard has no page for it -- so a retry without this learns nothing.`);
  } else {
    pass('10DLC status callback', 'registered, so a retry will report its reason');
  }

  // 9. Release switches ------------------------------------------------------
  if (env.LGQ_DISABLE_OUTBOUND_SMS === '1') warn('kill switch', 'LGQ_DISABLE_OUTBOUND_SMS=1 -- nothing will send while this is set');
  else info('kill switch', 'LGQ_DISABLE_OUTBOUND_SMS is not set');

  for (const [lane, name] of [
    ['lgq_shared', 'LGQ_SMS_SHARED_ENABLED'],
    ['lgq_dispatch', 'LGQ_SMS_DISPATCH_ENABLED'],
    ['contractor_dedicated', 'LGQ_SMS_CONTRACTOR_MESSAGING_ENABLED'],
  ]) {
    info(`lane ${lane}`, env[name] === '1' ? `${name}=1 (open)` : `${name} not set (closed -- absent and off are the same thing here)`);
  }

  const canary = (env.LGQ_SMS_CANARY_ACCOUNT_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const validCanary = canary.filter((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id));
  if (canary.length && validCanary.length !== canary.length) {
    fail('canary list', `${canary.length - validCanary.length} of ${canary.length} entries are not valid UUIDs and are silently dropped by smsCanaryAccounts()`);
  } else {
    info('canary list', canary.length ? `${validCanary.length} workspace(s)` : 'empty -- no workspace is allow-listed');
  }

  return finish();
}

function finish() {
  const width = Math.max(...results.map((r) => r.name.length));
  for (const r of results) {
    console.log(`${r.level.padEnd(4)}  ${r.name.padEnd(width)}  ${r.detail}`);
  }
  const failures = results.filter((r) => r.level === 'FAIL');
  console.log('');
  console.log(`${results.filter((r) => r.level === 'PASS').length} passed, ${failures.length} failed, ${results.filter((r) => r.level === 'WARN').length} warnings`);
  if (failures.length) {
    console.log('');
    console.log('NOT READY. Blocking:');
    failures.forEach((f) => console.log(`  - ${f.name}: ${f.detail}`));
  }
  // A gate, not a report.
  process.exitCode = failures.length ? 1 : 0;
  return failures.length;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
