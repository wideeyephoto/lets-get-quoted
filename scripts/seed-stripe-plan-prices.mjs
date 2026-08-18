import { readFile } from 'node:fs/promises';
import Stripe from 'stripe';

// Create the six base-plan Prices that subscription checkout cannot start without.
//
// WHY THIS EXISTS. subscription-checkout-operation.ts calls
// loadVerifiedStripePlanPrices() before it can build a Session, and that function
// reads six env vars — STRIPE_PRICE_{SOLO,GROWTH,SCALE}_{MONTHLY,ANNUAL} — and
// fails the whole load if ANY one of them is missing or points at a Price that
// does not satisfy an exact contract. On 2026-08-17 none of the six were set and
// the test account contained zero active Prices, so subscription checkout could
// not have run for anybody. The gates being off hid that: nothing ever reached
// the code that would have complained.
//
// The contract is strict and worth stating, because a Price created by hand in
// the dashboard will almost certainly violate it. validatePrice() in
// stripe-plan-prices.ts requires, per binding: active, livemode matching the
// key, currency usd, type recurring, billing_scheme per_unit, unit_amount equal
// to the catalog cents, tax_behavior exclusive, no custom_unit_amount, no
// tiers_mode, no transform_quantity, recurring.interval_count 1,
// recurring.usage_type licensed, NO meter, NO trial_period_days, currency_options
// containing exactly the base currency echoing the same amount and tax behavior,
// and all four lgq_* metadata keys matching exactly.
//
// Nothing here is hardcoded. The bindings are parsed from stripe-plan-prices.ts
// and the amounts and catalog version from catalog.ts, for the same reason the
// other verify scripts parse their sources: a second copy of a number is a second
// thing to drift, and drift is what this file exists to prevent.
//
// Idempotent. It searches for a Price already carrying the exact metadata
// contract and reuses it rather than creating a duplicate, so a second run is a
// no-op that prints the same env lines.
//
// Run:
//   node scripts/seed-stripe-plan-prices.mjs            (test mode, default)
//   node scripts/seed-stripe-plan-prices.mjs --dry-run  (create nothing)
//   node scripts/seed-stripe-plan-prices.mjs --live     (refuses without this)
//
// Exit codes: 0 every binding is present and satisfies the contract,
//             1 something failed, 2 the key mode did not match the intent.

const DRY_RUN = process.argv.includes('--dry-run');
const WANT_LIVE = process.argv.includes('--live');
const BINDINGS_MODULE = new URL('../src/lib/billing/stripe-plan-prices.ts', import.meta.url);
const CATALOG_MODULE = new URL('../src/lib/billing/catalog.ts', import.meta.url);

async function loadEnv() {
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

/** The six bindings, read from the module that consumes them. */
async function bindings() {
  const source = (await readFile(BINDINGS_MODULE, 'utf8')).replace(/\r\n/g, '\n');
  const entries = [...source.matchAll(
    /key: '([a-z_]+)',\s*\n\s*planCode: '([a-z]+)',\s*\n\s*billingInterval: '([a-z]+)',\s*\n\s*envKey: '([A-Z_]+)',/g,
  )].map(([, key, planCode, billingInterval, envKey]) => ({ key, planCode, billingInterval, envKey }));
  if (entries.length === 0) throw new Error('Parsed no price bindings. Refusing to guess them.');
  return entries;
}

/** Catalog amounts and version, read from the catalog itself. */
async function catalog() {
  const source = (await readFile(CATALOG_MODULE, 'utf8')).replace(/\r\n/g, '\n');
  const version = source.match(/PRICING_CATALOG_VERSION = '([^']+)'/)?.[1];
  if (!version) throw new Error('Could not read PRICING_CATALOG_VERSION.');

  const plans = {};
  // Each plan block starts at "  <id>: {" and the FIRST monthly/annual pair in it
  // is the base plan's. A nested `voice:` block also carries monthlyPriceCents,
  // which is why this stops at the first match per plan rather than scanning on.
  for (const match of source.matchAll(/^ {2}([a-z]+): \{\n([\s\S]*?)^ {2}\},$/gm)) {
    const [, id, body] = match;
    const monthly = body.match(/^ {4}monthlyPriceCents: ([0-9_]+),/m)?.[1];
    const annual = body.match(/^ {4}annualPriceCents: ([0-9_]+),/m)?.[1];
    if (monthly && annual) {
      plans[id] = {
        monthly: Number(monthly.replace(/_/g, '')),
        annual: Number(annual.replace(/_/g, '')),
        name: body.match(/^ {4}name: '([^']+)',/m)?.[1] ?? id,
      };
    }
  }
  if (Object.keys(plans).length === 0) throw new Error('Parsed no plans from the catalog.');
  return { version, plans };
}

await loadEnv();
const secretKey = process.env.STRIPE_SECRET_KEY;
if (!secretKey) {
  console.error('No STRIPE_SECRET_KEY.');
  process.exit(1);
}

const keyMode = /^(sk|rk)_live_/.test(secretKey)
  ? 'live'
  : /^(sk|rk)_test_/.test(secretKey)
    ? 'test'
    : 'unrecognised';

// Mode has to be chosen deliberately in both directions. A live key without
// --live creates real, customer-visible products; --live with a test key would
// quietly seed the wrong account and report success.
if (keyMode === 'live' && !WANT_LIVE) {
  console.error('This is a LIVE key. Re-run with --live if you truly mean to create live products.');
  process.exit(2);
}
if (keyMode !== 'live' && WANT_LIVE) {
  console.error('--live was passed but the key is not live. Refusing.');
  process.exit(2);
}
if (keyMode === 'unrecognised') {
  console.error('Unrecognised key prefix. Refusing.');
  process.exit(2);
}

const { version, plans } = await catalog();
const defs = await bindings();
const stripe = new Stripe(secretKey, { apiVersion: process.env.STRIPE_API_VERSION || undefined });

console.log(`mode            ${keyMode}${DRY_RUN ? '  (dry run — creating nothing)' : ''}`);
console.log(`catalog version ${version}`);
console.log(`bindings        ${defs.length}\n`);

const metadataFor = (def) => ({
  lgq_price_purpose: 'base_plan',
  lgq_plan_code: def.planCode,
  lgq_billing_interval: def.billingInterval,
  lgq_catalog_version: version,
});

const sameMetadata = (actual, expected) =>
  Object.entries(expected).every(([k, v]) => actual?.[k] === v);

/** One product per plan, reused across its monthly and annual prices. */
const productCache = new Map();
async function productFor(planCode, planName) {
  if (productCache.has(planCode)) return productCache.get(planCode);
  const found = await stripe.products.search({
    query: `metadata['lgq_plan_code']:'${planCode}' AND metadata['lgq_price_purpose']:'base_plan'`,
    limit: 1,
  });
  let product = found.data[0];
  if (!product) {
    if (DRY_RUN) {
      productCache.set(planCode, { id: 'prod_DRYRUN' });
      return { id: 'prod_DRYRUN' };
    }
    product = await stripe.products.create({
      name: `Lets Get Quoted — ${planName}`,
      metadata: { lgq_price_purpose: 'base_plan', lgq_plan_code: planCode },
    });
    console.log(`  created product ${product.id} for ${planCode}`);
  }
  productCache.set(planCode, product);
  return product;
}

const results = [];
let failed = 0;

for (const def of defs) {
  const plan = plans[def.planCode];
  if (!plan) {
    console.log(`${def.envKey}: no catalog entry for ${def.planCode} — SKIPPED`);
    failed += 1;
    continue;
  }
  const amount = def.billingInterval === 'monthly' ? plan.monthly : plan.annual;
  const interval = def.billingInterval === 'monthly' ? 'month' : 'year';
  const wanted = metadataFor(def);

  // Reuse an existing contract-carrying Price rather than creating a duplicate.
  const search = await stripe.prices.search({
    query: `metadata['lgq_price_purpose']:'base_plan' AND metadata['lgq_plan_code']:'${def.planCode}'`
      + ` AND metadata['lgq_billing_interval']:'${def.billingInterval}'`
      + ` AND metadata['lgq_catalog_version']:'${version}'`,
    limit: 10,
  });
  let price = search.data.find((p) => (
    p.active && p.currency === 'usd' && p.unit_amount === amount
    && p.recurring?.interval === interval && p.recurring?.interval_count === 1
    && sameMetadata(p.metadata, wanted)
  ));

  if (price) {
    console.log(`${def.envKey.padEnd(28)} reused  ${price.id}  $${(amount / 100).toFixed(2)}/${interval}`);
  } else if (DRY_RUN) {
    console.log(`${def.envKey.padEnd(28)} WOULD CREATE  $${(amount / 100).toFixed(2)}/${interval}`);
    results.push([def.envKey, 'price_DRYRUN']);
    continue;
  } else {
    const product = await productFor(def.planCode, plan.name);
    price = await stripe.prices.create({
      product: product.id,
      currency: 'usd',
      unit_amount: amount,
      // Exclusive is required by the contract: tax is added on top, never
      // assumed to be inside the amount the catalog publishes.
      tax_behavior: 'exclusive',
      recurring: { interval, interval_count: 1, usage_type: 'licensed' },
      metadata: wanted,
    });
    console.log(`${def.envKey.padEnd(28)} created ${price.id}  $${(amount / 100).toFixed(2)}/${interval}`);
  }

  // Read back with currency_options expanded, the way the app verifies it. A
  // Price that creates cleanly can still fail the contract on this field.
  const verify = await stripe.prices.retrieve(price.id, { expand: ['currency_options'] });
  const options = verify.currency_options ?? {};
  const codes = Object.keys(options);
  const problems = [];
  if (verify.active !== true) problems.push('inactive');
  if (verify.livemode !== (keyMode === 'live')) problems.push('livemode mismatch');
  if (verify.type !== 'recurring') problems.push(`type ${verify.type}`);
  if (verify.billing_scheme !== 'per_unit') problems.push(`billing_scheme ${verify.billing_scheme}`);
  if (verify.unit_amount !== amount) problems.push(`unit_amount ${verify.unit_amount}`);
  if (verify.tax_behavior !== 'exclusive') problems.push(`tax_behavior ${verify.tax_behavior}`);
  if (verify.custom_unit_amount != null) problems.push('custom_unit_amount set');
  if (verify.tiers_mode != null) problems.push('tiers_mode set');
  if (verify.transform_quantity != null) problems.push('transform_quantity set');
  if (verify.recurring?.usage_type !== 'licensed') problems.push('usage_type');
  if (verify.recurring?.meter != null) problems.push('meter set');
  if (verify.recurring?.trial_period_days != null) problems.push('trial_period_days set');
  if (codes.length !== 1 || codes[0] !== verify.currency) problems.push(`currency_options [${codes.join(',')}]`);
  else {
    const base = options[verify.currency];
    if (base?.unit_amount !== verify.unit_amount) problems.push('currency_options amount');
    if (base?.tax_behavior !== verify.tax_behavior) problems.push('currency_options tax_behavior');
  }
  if (!sameMetadata(verify.metadata, wanted)) problems.push('metadata');

  if (problems.length > 0) {
    console.log(`  CONTRACT FAILED: ${problems.join(', ')}`);
    failed += 1;
  }
  results.push([def.envKey, price.id]);
}

console.log('\nEnvironment variables — all six are required; a missing one fails the whole load:\n');
for (const [key, id] of results) console.log(`${key}=${id}`);

if (DRY_RUN) {
  console.log('\nDry run. Nothing was created.');
  process.exit(0);
}
if (failed > 0) {
  console.log(`\n${failed} binding(s) do not satisfy the contract.`);
  process.exit(1);
}
console.log('\nAll bindings satisfy the price contract.');
