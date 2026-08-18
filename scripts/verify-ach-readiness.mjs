import { readFile } from 'node:fs/promises';
import Stripe from 'stripe';

// Ask the PLATFORM account whether it can actually take an ACH bank debit.
//
// WHY THIS EXISTS. src/lib/payments.ts offers ACH automatically on every one-off
// payment of ACH_MIN_AMOUNT or more that is not a plan deposit. No feature flag,
// no capability read, and the marketing site promises bank transfer publicly. The
// largest payment this platform has ever taken is $125, so that branch has never
// executed once in production.
//
// It is a destination charge — transfer_data.destination is set, on a Stripe
// client carrying no stripeAccount header — so the Session and its Charge are
// created on the PLATFORM account and settled onward. `us_bank_account` therefore
// has to be active on the PLATFORM. The contractor's own capabilities do not
// enter into it. That distinction is the whole reason this script reads the
// account the key belongs to and nothing else.
//
// There is a fallback: if session creation fails with an error mentioning
// us_bank_account, payments.ts retries card-only so a large payment is never left
// un-payable. Do not rely on it. It is keyed on the TEXT of a Stripe error
// message (/us_bank_account/i), so a reworded error means no fallback and a
// thrown request instead — and even when it works, the customer is quietly denied
// the bank-transfer option the site advertised. This script exists so the answer
// is known before a real $1,000 invoice discovers it.
//
// Read-only. It retrieves the account and compares; it never writes to Stripe and
// never creates a Session, so running it costs nothing and charges nobody.
//
// Run:
//   node scripts/verify-ach-readiness.mjs
//   node scripts/verify-ach-readiness.mjs --json
//
// Exit codes follow scripts/verify-webhook-subscription.mjs:
//   0  ACH is active on the platform — payments at/over the threshold offer it
//   1  ACH is NOT active — every such payment silently falls back to card-only
//   2  inconclusive, because the key was not live. NOT a pass.

const JSON_OUT = process.argv.includes('--json');
const PRICING_MODULE = new URL('../src/lib/pricing.ts', import.meta.url);
const PAYMENTS_MODULE = new URL('../src/lib/payments.ts', import.meta.url);

// The capability Stripe gates ACH debit acceptance behind.
const ACH_CAPABILITY = 'us_bank_account_ach_payments';

async function loadEnv() {
  // Same tolerance as scripts/verify-webhook-subscription.mjs: this repo is
  // checked out as a worktree in some places and .env.local only exists in the
  // primary checkout.
  for (const candidate of ['../.env.local', '../../CLAUDE CODE FOLDER/.env.local']) {
    try {
      const contents = await readFile(new URL(candidate, import.meta.url), 'utf8');
      for (const line of contents.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const separator = trimmed.indexOf('=');
        if (separator < 1) continue;
        const key = trimmed.slice(0, separator).trim();
        if (!process.env[key]) {
          process.env[key] = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '');
        }
      }
      return;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
}

/**
 * The threshold, parsed out of the TypeScript module rather than duplicated here.
 * A second copy would drift from the one the rail actually reads, which is the
 * class of fault this script is meant to catch, not commit.
 */
async function achThreshold() {
  const source = (await readFile(PRICING_MODULE, 'utf8')).replace(/\r\n/g, '\n');
  const match = source.match(/export const ACH_MIN_AMOUNT = (\d+);/);
  if (!match) throw new Error('Could not find ACH_MIN_AMOUNT in pricing.ts. Refusing to guess the threshold.');
  return Number(match[1]);
}

/**
 * Confirm the rail still gates on that constant. If someone inlines a number in
 * payments.ts, the threshold this script reports becomes fiction — it would be
 * describing a constant nothing consults.
 */
async function railUsesThreshold() {
  const source = (await readFile(PAYMENTS_MODULE, 'utf8')).replace(/\r\n/g, '\n');
  return /payment\.amount >= ACH_MIN_AMOUNT/.test(source);
}

await loadEnv();
const secretKey = process.env.STRIPE_SECRET_KEY;
if (!secretKey) {
  console.error('No STRIPE_SECRET_KEY. This script reads the Stripe API and cannot run without one.');
  process.exit(1);
}

// Mode from the key's prefix, never from its value. Without this, "capability
// absent" on a test key reads identically to "capability absent in production",
// and acting on that confusion is how 2026-08-17 was lost.
const keyMode = /^(sk|rk)_live_/.test(secretKey)
  ? 'live'
  : /^(sk|rk)_test_/.test(secretKey)
    ? 'TEST'
    : 'unrecognised';

const threshold = await achThreshold();
const gatedOnConstant = await railUsesThreshold();

const stripe = new Stripe(secretKey, { apiVersion: process.env.STRIPE_API_VERSION || undefined });

let account;
try {
  // No argument: retrieve the account this key belongs to. That is the platform,
  // and the platform is the only account whose ACH capability decides this.
  account = await stripe.accounts.retrieve();
} catch (error) {
  console.error(`Could not retrieve the platform account: ${error.message}`);
  console.error('A restricted key needs the "Account: Read" permission for this.');
  process.exit(1);
}

const capability = account.capabilities?.[ACH_CAPABILITY] ?? 'absent';
// Stripe reports 'active' | 'inactive' | 'pending'. Only one of those can take a
// payment; 'pending' in particular must never read as a pass.
const achActive = capability === 'active';

const report = {
  keyMode,
  account: account.id,
  chargesEnabled: Boolean(account.charges_enabled),
  achCapability: capability,
  achActive,
  thresholdDollars: threshold,
  railGatedOnConstant: gatedOnConstant,
};

if (JSON_OUT) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`key mode          ${keyMode}`);
  console.log(`platform account  ${account.id}`);
  console.log(`charges enabled   ${report.chargesEnabled}`);
  console.log(`${ACH_CAPABILITY}  ${capability}`);
  console.log(`ACH offered at    $${threshold} and above (one-off payments, not plan deposits)`);
  if (!gatedOnConstant) {
    console.log('\nWARNING: payments.ts no longer gates on ACH_MIN_AMOUNT. The threshold above');
    console.log('is parsed from pricing.ts and may no longer be the one the rail applies.');
  }
  console.log('');
  // The verdict has to carry the mode. A bare "ACH is ACTIVE" above a later
  // "exit 2" is read as a pass by anyone skimming, and the whole point of this
  // file is that a confident wrong reading is worse than no reading.
  if (keyMode !== 'live') {
    console.log(`TEST ACCOUNT ONLY — ${account.id} reports ${ACH_CAPABILITY} ${capability}.`);
    console.log('This is not the live platform and proves nothing about it. Re-run with a');
    console.log('live key. Until then the production answer is UNKNOWN.');
  } else if (achActive) {
    console.log(`ACH is ACTIVE. Payments of $${threshold}+ will offer bank debit alongside card.`);
  } else {
    console.log(`ACH is NOT active (${capability}).`);
    console.log(`Every one-off payment of $${threshold}+ will attempt ACH, fail, and fall back to`);
    console.log('card-only via the error-message match in payments.ts. The customer is not');
    console.log('offered the bank transfer the marketing site advertises.');
  }
}

if (keyMode !== 'live') {
  if (!JSON_OUT) {
    console.log('\nThis key is not live, so this run says nothing about production. Exit 2.');
  }
  process.exit(2);
}

process.exit(achActive ? 0 : 1);
