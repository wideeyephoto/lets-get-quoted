/**
 * One-off repair: point a subscription's consent metadata at the acceptance the
 * plan-change operation actually holds.
 *
 * WHY THIS EXISTS. `planChangeMetadata` used to leave the consent keys alone on
 * a plan change, on the reasoning that rewriting them would risk losing the
 * acceptance trail. True for the consent VERSION and TEXT DIGEST, which are the
 * same pinned artifact either way. False for the acceptance ID, which moves: a
 * plan change mints its own single-use consent. So the ledger row held the new
 * acceptance while Stripe still advertised the original checkout's, and
 * `bindingMatchesContext` compares those two directly -- every event for that
 * subscription failed `provider_object_contract_mismatch`, terminally, after the
 * card had already been charged.
 *
 * The code is fixed (`bc95a605`), but a fix cannot retroactively change metadata
 * Stripe already stores. This repairs the one subscription caught by it.
 *
 * NOT a general tool. It refuses anything but the exact subscription and account
 * below, and refuses a live key outright. Delete it once the row is repaired
 * rather than generalising it -- a script that can rewrite consent evidence on
 * any subscription is not something to leave lying around.
 *
 *   node scripts/repair-plan-change-consent-metadata.mjs          # report only
 *   node scripts/repair-plan-change-consent-metadata.mjs --write  # repair
 */

import { readFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');

// Pinned. The point is that this cannot be aimed at anything else.
const ACCOUNT = 'acct_1TtDcSPqTgiW6iRM';
const SUBSCRIPTION = 'sub_1U5hxLPqTgiW6iRM2f12RKn0';
const KEY = 'lgq_recurring_consent_acceptance_id';
const WANT = 'dadbb6bc-9d66-4350-9efa-5cade442f44a';

const write = process.argv.includes('--write');

const env = await readFile(resolve(REPO, '.env.local'), 'utf8');
const secret = env.match(/^STRIPE_SECRET_KEY=(.+)$/m)?.[1]?.trim().replace(/^['"]|['"]$/g, '');
if (!secret) {
  console.error('STRIPE_SECRET_KEY is not in .env.local');
  process.exit(2);
}
if (!secret.startsWith('sk_test_')) {
  console.error('Refusing: STRIPE_SECRET_KEY is not a test key. This must never touch live.');
  process.exit(2);
}

async function api(path, body) {
  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${secret}`,
      ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    ...(body ? { body } : {}),
  });
  const json = await response.json();
  if (!response.ok) throw new Error(`${path} -> ${response.status} ${json.error?.message}`);
  return json;
}

const account = await api('/account');
console.log(`account: ${account.id} (${account.settings?.dashboard?.display_name ?? '?'})`);
if (account.id !== ACCOUNT) {
  console.error(`Refusing: expected ${ACCOUNT}.`);
  process.exit(2);
}

const before = await api(`/subscriptions/${SUBSCRIPTION}`);
const beforeKeys = Object.keys(before.metadata).sort();
console.log(`\nsubscription: ${before.id}  status=${before.status}`);
console.log(`plan metadata: ${before.metadata.lgq_plan_code} / ${before.metadata.lgq_billing_interval}`);
console.log(`${KEY}:\n  now:  ${before.metadata[KEY]}\n  want: ${WANT}`);

if (before.metadata[KEY] === WANT) {
  console.log('\nAlready correct. Nothing to do.');
  process.exit(0);
}
if (!write) {
  console.log('\nReport only. Re-run with --write to repair.');
  process.exit(0);
}

// Stripe MERGES metadata: sending one key updates that key and leaves the rest
// untouched. Sending the whole object risks dropping one of the other nine.
const after = await api(
  `/subscriptions/${SUBSCRIPTION}`,
  new URLSearchParams({ [`metadata[${KEY}]`]: WANT }).toString(),
);

const afterKeys = Object.keys(after.metadata).sort();
const lost = beforeKeys.filter((k) => !afterKeys.includes(k));
console.log(`\nafter: ${after.metadata[KEY]}`);
console.log(`metadata keys: ${beforeKeys.length} -> ${afterKeys.length}${lost.length ? ` (LOST: ${lost.join(', ')})` : ' (none lost)'}`);
console.log(`price still: ${after.items.data[0].price.id}`);

if (after.metadata[KEY] !== WANT || lost.length) {
  console.error('\nRepair did not land cleanly.');
  process.exit(1);
}
console.log('\nRepaired. Next: requeue the five events and run the projection worker in TEST mode.');
