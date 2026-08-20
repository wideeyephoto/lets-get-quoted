// READ-ONLY audit of the live Stripe top-up Prices against catalog.ts.
//
//   node scripts/inspect-live-top-up-prices.mjs
//
// WHY THIS EXISTS. Top-ups do NOT bind through env vars -- they resolve at
// runtime by metadata search on lgq_top_up_id + lgq_catalog_version. That is a
// good design (no binding to drift, no deploy to add a SKU) with one sharp edge:
// nothing fails at build or boot when a Price is missing. The first symptom is a
// customer clicking Buy and getting an error.
//
// So before un-withholding a SKU, the question "does its live Price exist, and
// does it satisfy the same contract the seeder enforces" needs an answer read
// from Stripe rather than assumed from a document.
//
// Uses the read-only rk_live key in .env.live.local. Refuses anything else.
// Every call here is a retrieve/search. Nothing in this file writes.

import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Stripe from 'stripe';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const contents = await readFile(resolve(root, '.env.live.local'), 'utf8');
const secretKey = contents.split(/\r?\n/)
  .map((l) => l.trim())
  .find((l) => l.startsWith('STRIPE_SECRET_KEY='))
  ?.slice('STRIPE_SECRET_KEY='.length)
  .replace(/^['"]|['"]$/g, '');

if (!secretKey) throw new Error('No STRIPE_SECRET_KEY in .env.live.local.');
if (!/^rk_live_/.test(secretKey)) {
  // A write-capable key must never be the one this runs under, and a test key
  // would answer a different question while looking like it answered this one.
  throw new Error('Refusing: this script requires the read-only rk_live_ key.');
}

// Parsed from catalog.ts rather than restated, for the reason the seeder gives:
// two copies of the SKU list would eventually disagree.
const source = (await readFile(resolve(root, 'src/lib/billing/catalog.ts'), 'utf8'))
  .replace(/\r\n/g, '\n');
const version = source.match(/PRICING_CATALOG_VERSION = '([^']+)'/)?.[1];
if (!version) throw new Error('Could not read PRICING_CATALOG_VERSION.');

const block = source.match(/export const TOP_UPS[^=]*= \{\n([\s\S]*?)\n\} as const;/);
if (!block) throw new Error('Could not find TOP_UPS in catalog.ts.');

const skus = [];
for (const entry of block[1].matchAll(/^ {2}([a-z0-9_]+): \{\n([\s\S]*?)^ {2}\},$/gm)) {
  const [, id, body] = entry;
  const field = (name) => body.match(new RegExp('^\\s+' + name + ': (.+?),$', 'm'))?.[1];
  skus.push({
    id,
    label: field('label')?.replace(/^'|'$/g, ''),
    priceCents: Number(String(field('priceCents') ?? '').replace(/_/g, '')),
    recurring: field('recurring') === 'true',
    resourceCode: field('resourceCode')?.replace(/^'|'$/g, ''),
    units: Number(String(field('units') ?? '').replace(/_/g, '')),
  });
}

const withheldBlock = source.match(/export const TOP_UPS_WITHHELD[^=]*= Object\.freeze\(\{([\s\S]*?)\n\}\);/);
const withheld = new Set();
if (withheldBlock) {
  for (const entry of withheldBlock[1].split(/^ {2}(?=[a-z])/m)) {
    const id = entry.match(/^([a-z0-9_]+):/)?.[1];
    if (id) withheld.add(id);
  }
}

const stripe = new Stripe(secretKey, { apiVersion: process.env.STRIPE_API_VERSION || undefined });

console.log(`catalog version ${version}`);
console.log(`${skus.length} SKUs, ${withheld.size} withheld\n`);

for (const sku of skus) {
  const mark = withheld.has(sku.id) ? 'withheld' : 'SELLABLE';
  const found = await stripe.prices.search({
    query: `metadata['lgq_top_up_id']:'${sku.id}' AND metadata['lgq_catalog_version']:'${version}'`,
    limit: 10,
  });
  const live = found.data.filter((p) => p.active);

  if (live.length === 0) {
    console.log(`${mark}  ${sku.id.padEnd(20)} NO LIVE PRICE  ($${(sku.priceCents / 100).toFixed(2)}${sku.recurring ? '/mo' : ' one-time'})`);
    continue;
  }

  for (const price of live) {
    // Expanded because currency_options is only populated on request: a Price
    // can create cleanly and still carry a second currency nobody intended.
    const full = await stripe.prices.retrieve(price.id, { expand: ['currency_options'] });
    const codes = Object.keys(full.currency_options ?? {});
    const problems = [];
    if (full.livemode !== true) problems.push('not livemode');
    if (full.unit_amount !== sku.priceCents) problems.push(`unit_amount ${full.unit_amount} != ${sku.priceCents}`);
    if (full.currency !== 'usd') problems.push(`currency ${full.currency}`);
    if (full.tax_behavior !== 'exclusive') problems.push(`tax_behavior ${full.tax_behavior}`);
    if (Boolean(full.recurring) !== sku.recurring) problems.push('recurring mismatch');
    if (sku.recurring && full.recurring?.interval !== 'month') problems.push(`interval ${full.recurring?.interval}`);
    if (sku.recurring && full.recurring?.interval_count !== 1) problems.push('interval_count != 1');
    if (full.recurring?.trial_period_days != null) problems.push('trial_period_days set');
    if (codes.length !== 1 || codes[0] !== full.currency) problems.push(`currency_options [${codes.join(',')}]`);
    const wanted = {
      lgq_price_purpose: 'top_up',
      lgq_top_up_id: sku.id,
      lgq_resource_code: sku.resourceCode,
      lgq_units: String(sku.units),
      lgq_catalog_version: version,
    };
    for (const [k, v] of Object.entries(wanted)) {
      if (full.metadata?.[k] !== v) problems.push(`metadata.${k}=${full.metadata?.[k] ?? '(absent)'} != ${v}`);
    }
    const verdict = problems.length ? `CONTRACT FAILED: ${problems.join('; ')}` : 'contract ok';
    console.log(`${mark}  ${sku.id.padEnd(20)} ${full.id}  ${verdict}`);
  }
  if (live.length > 1) {
    console.log(`          ${sku.id}: ${live.length} active Prices match this SKU and version -- checkout picks one of them`);
  }
}
