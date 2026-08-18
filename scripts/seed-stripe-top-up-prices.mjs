import { readFile } from 'node:fs/promises';
import Stripe from 'stripe';

// Create the Stripe Prices for the published top-up SKUs.
//
// WHY THIS EXISTS. The appendix publishes eight top-up SKUs with settled prices,
// and its status table says "purchase/fulfillment not fully active". The code is
// blunter than that: TOP_UPS in catalog.ts has NO consumer anywhere. It is a
// price list nobody reads, so not one of these SKUs can be bought.
//
// The fulfillment substrate underneath is real and already in use --
// usage_credit_lots, workspace_usage_credit_balances, usage_reservations, with
// source_type separating the promotional, monthly-plan and purchased wallets and
// expires_at expressing "purchased credits never expire". What is missing is the
// front half: Stripe Prices, a checkout, and a handler that writes a lot on
// payment. This script is the first of those three.
//
// NO ENV BINDINGS, deliberately. The six plan Prices bind through six env vars,
// and a single stale one fails the whole load -- which is why bumping the catalog
// version forced all six to be recreated. Top-ups resolve by metadata search
// instead (lgq_top_up_id + lgq_catalog_version), so there is no binding to drift
// and adding a SKU needs no deploy.
//
// Nothing is hardcoded: every SKU, price and unit count is parsed from
// catalog.ts, which the appendix names as the canonical source.
//
// Idempotent by metadata search. A second run reuses and reports the same ids.
//
// Run:
//   node scripts/seed-stripe-top-up-prices.mjs --dry-run
//   node scripts/seed-stripe-top-up-prices.mjs             (test mode)
//   node scripts/seed-stripe-top-up-prices.mjs --live      (refuses without it)
//
// Exit codes: 0 all seeded SKUs satisfy the contract, 1 a failure, 2 wrong mode.

const DRY_RUN = process.argv.includes('--dry-run');
const WANT_LIVE = process.argv.includes('--live');
const CATALOG_MODULE = new URL('../src/lib/billing/catalog.ts', import.meta.url);

// Not every published SKU may be sold yet. Skipping silently would make this
// script read as "all eight are live", which is the exact confusion the
// appendix's own status key exists to prevent.
const WITHHELD = {
  office_user:
    'office seats are dark - no invite lifecycle, no last-owner protection, and an '
    + 'added office user would receive full owner authority (appendix section 6)',
  crew_user:
    'crew-seat entitlement sits behind its exact-1 rollout gate, so a purchased seat '
    + 'would enforce nothing until that gate is on',
};

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

/** SKUs and catalog version, parsed from the canonical module. */
async function catalog() {
  const source = (await readFile(CATALOG_MODULE, 'utf8')).replace(/\r\n/g, '\n');
  const version = source.match(/PRICING_CATALOG_VERSION = '([^']+)'/)?.[1];
  if (!version) throw new Error('Could not read PRICING_CATALOG_VERSION.');

  const block = source.match(/export const TOP_UPS[^=]*= \{\n([\s\S]*?)\n\} as const;/);
  if (!block) throw new Error('Could not find TOP_UPS in catalog.ts. Refusing to guess the SKUs.');

  const skus = [];
  for (const entry of block[1].matchAll(/^  ([a-z0-9_]+): \{\n([\s\S]*?)^  \},$/gm)) {
    const [, id, body] = entry;
    const field = (name) => body.match(new RegExp('^\\s+' + name + ': (.+?),$', 'm'))?.[1];
    const num = (name) => Number(String(field(name) ?? '').replace(/_/g, ''));
    skus.push({
      id,
      label: field('label')?.replace(/^'|'$/g, ''),
      priceCents: num('priceCents'),
      recurring: field('recurring') === 'true',
      resourceCode: field('resourceCode')?.replace(/^'|'$/g, ''),
      units: num('units'),
    });
  }
  if (skus.length === 0) throw new Error('Parsed no top-up SKUs. Refusing to report success.');
  return { version, skus };
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

if (keyMode === 'live' && !WANT_LIVE) {
  console.error('This is a LIVE key. Re-run with --live to create real, customer-visible products.');
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

const { version, skus } = await catalog();
const stripe = new Stripe(secretKey, { apiVersion: process.env.STRIPE_API_VERSION || undefined });

console.log(`mode            ${keyMode}${DRY_RUN ? '  (dry run - creating nothing)' : ''}`);
console.log(`catalog version ${version}`);
console.log(`SKUs in catalog ${skus.length}, withheld ${Object.keys(WITHHELD).length}\n`);

const metadataFor = (sku) => ({
  lgq_price_purpose: 'top_up',
  lgq_top_up_id: sku.id,
  lgq_resource_code: sku.resourceCode,
  lgq_units: String(sku.units),
  lgq_catalog_version: version,
});
const sameMetadata = (actual, expected) =>
  Object.entries(expected).every(([k, v]) => actual?.[k] === v);

const results = [];
let failed = 0;

for (const sku of skus) {
  if (WITHHELD[sku.id]) {
    console.log(`${sku.id.padEnd(22)} WITHHELD - ${WITHHELD[sku.id]}`);
    continue;
  }
  const wanted = metadataFor(sku);
  const cadence = sku.recurring ? 'month' : 'one-time';

  const found = await stripe.prices.search({
    query: `metadata['lgq_top_up_id']:'${sku.id}' AND metadata['lgq_catalog_version']:'${version}'`,
    limit: 10,
  });
  let price = found.data.find((p) => (
    p.active && p.currency === 'usd' && p.unit_amount === sku.priceCents
    && Boolean(p.recurring) === sku.recurring && sameMetadata(p.metadata, wanted)
  ));

  if (price) {
    console.log(`${sku.id.padEnd(22)} reused  ${price.id}  $${(sku.priceCents / 100).toFixed(2)} ${cadence}`);
  } else if (DRY_RUN) {
    console.log(`${sku.id.padEnd(22)} WOULD CREATE  $${(sku.priceCents / 100).toFixed(2)} ${cadence}  (${sku.units} ${sku.resourceCode})`);
    continue;
  } else {
    const product = await stripe.products.create({
      name: `Lets Get Quoted - ${sku.label}`,
      metadata: { lgq_price_purpose: 'top_up', lgq_top_up_id: sku.id },
    });
    price = await stripe.prices.create({
      product: product.id,
      currency: 'usd',
      unit_amount: sku.priceCents,
      tax_behavior: 'exclusive',
      ...(sku.recurring
        ? { recurring: { interval: 'month', interval_count: 1, usage_type: 'licensed' } }
        : {}),
      metadata: wanted,
    });
    console.log(`${sku.id.padEnd(22)} created ${price.id}  $${(sku.priceCents / 100).toFixed(2)} ${cadence}`);
  }

  // Read back the way a verifier would, with currency_options expanded - it is
  // only populated on request, so a Price can create cleanly and still be wrong.
  const verify = await stripe.prices.retrieve(price.id, { expand: ['currency_options'] });
  const options = verify.currency_options ?? {};
  const codes = Object.keys(options);
  const problems = [];
  if (verify.active !== true) problems.push('inactive');
  if (verify.livemode !== (keyMode === 'live')) problems.push('livemode mismatch');
  if (verify.unit_amount !== sku.priceCents) problems.push(`unit_amount ${verify.unit_amount}`);
  if (verify.tax_behavior !== 'exclusive') problems.push(`tax_behavior ${verify.tax_behavior}`);
  if (Boolean(verify.recurring) !== sku.recurring) problems.push('recurring mismatch');
  if (sku.recurring && verify.recurring?.interval_count !== 1) problems.push('interval_count');
  if (verify.recurring?.trial_period_days != null) problems.push('trial_period_days set');
  if (codes.length !== 1 || codes[0] !== verify.currency) problems.push(`currency_options [${codes.join(',')}]`);
  if (!sameMetadata(verify.metadata, wanted)) problems.push('metadata');
  if (problems.length > 0) {
    console.log(`  CONTRACT FAILED: ${problems.join(', ')}`);
    failed += 1;
  }
  results.push([sku.id, price.id, sku.resourceCode, sku.units]);
}

console.log('\nSeeded SKUs - resolve these at runtime by metadata, not by env var:\n');
for (const [id, priceId, resource, units] of results) {
  console.log(`  ${id.padEnd(22)} ${priceId}  grants ${units} ${resource}`);
}

if (DRY_RUN) {
  console.log('\nDry run. Nothing was created.');
  process.exit(0);
}
if (failed > 0) {
  console.log(`\n${failed} SKU(s) do not satisfy the contract.`);
  process.exit(1);
}
console.log('\nAll seeded SKUs satisfy the contract.');
