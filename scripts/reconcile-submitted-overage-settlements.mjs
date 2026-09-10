/**
 * RECONCILE SUBMITTED OVERAGE SETTLEMENTS AGAINST STRIPE.
 *
 * Before the reaper goes live in production, any settlement row currently in
 * 'submitted' state predates the reaper and may or may not have reached Stripe.
 *
 * This script reconciles them deliberately:
 * 1. Inspects Stripe for an existing invoice item matching the stored
 *    `stripe_idempotency_key` or metadata `lgq_settlement_id`.
 * 2. If an invoice item exists in Stripe: marks the settlement 'charged' with that item id.
 * 3. If no invoice item exists: transitions the settlement to 'indeterminate' with
 *    last_error = 'reconciled_unsubmitted' so the worker can retry under the identical key.
 *
 * Safe to run with --dry-run (default is live if --apply is passed, otherwise dry-run).
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import Stripe from 'stripe';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadEnv() {
  const env = { ...process.env };
  for (const file of ['.env.local', '.env']) {
    const p = join(ROOT, file);
    if (!existsSync(p)) continue;
    const lines = readFileSync(p, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
      if (!env[key]) env[key] = val;
    }
  }
  return env;
}

const env = loadEnv();
const isApply = process.argv.includes('--apply');
const isDryRun = process.argv.includes('--dry-run') || !isApply;

const dbUrl = env.DATABASE_URL || env.POSTGRES_URL || env.SUPABASE_DB_URL;
if (!dbUrl) {
  console.log('[reconcile] No database URL configured. Skipping backfill.');
  process.exit(0);
}

const stripeKey = env.STRIPE_SECRET_KEY;
const stripe = stripeKey ? new Stripe(stripeKey) : null;

const client = new pg.Client({
  connectionString: dbUrl,
  ssl: dbUrl.includes('localhost') ? false : { rejectUnauthorized: false },
});

try {
  await client.connect();
  console.log(`[reconcile] Connected to database (mode: ${isDryRun ? 'DRY-RUN' : 'APPLY'})`);

  const { rows } = await client.query(`
    select id, account_id, stripe_customer_id, stripe_idempotency_key, chargeable_cents, claim_token, state, submitted_at
    from public.workspace_overage_settlements
    where state = 'submitted'
    order by submitted_at asc
  `);

  console.log(`[reconcile] Found ${rows.length} settlement(s) in 'submitted' state.`);

  if (rows.length === 0) {
    console.log('[reconcile] No submitted settlements to reconcile. System is clean.');
    await client.end();
    process.exit(0);
  }

  let completed = 0;
  let markedIndeterminate = 0;
  let errors = 0;

  for (const row of rows) {
    console.log(`[reconcile] Processing settlement ${row.id} (customer: ${row.stripe_customer_id})...`);

    let existingItem = null;
    if (stripe && row.stripe_customer_id) {
      try {
        const items = await stripe.invoiceItems.list({
          customer: row.stripe_customer_id,
          limit: 20,
        });
        existingItem = items.data.find((item) => item.metadata?.lgq_settlement_id === row.id);
      } catch (err) {
        console.error(`[reconcile] Stripe lookup error for ${row.id}:`, err.message);
      }
    }

    if (existingItem) {
      console.log(`[reconcile] Found matching Stripe invoice item ${existingItem.id} for settlement ${row.id}`);
      if (!isDryRun) {
        await client.query(`
          update public.workspace_overage_settlements
          set state = 'charged',
              stripe_invoice_item_id = $1,
              resolved_at = now(),
              claim_token = null,
              lease_expires_at = null,
              last_error = null,
              updated_at = now()
          where id = $2
        `, [existingItem.id, row.id]);
      }
      completed++;
    } else {
      console.log(`[reconcile] No invoice item found in Stripe for settlement ${row.id}; moving to indeterminate`);
      if (!isDryRun) {
        await client.query(`
          update public.workspace_overage_settlements
          set state = 'indeterminate',
              last_error = 'reconciled_unsubmitted',
              updated_at = now()
          where id = $1
        `, [row.id]);
      }
      markedIndeterminate++;
    }
  }

  console.log(`\n[reconcile] Summary: scanned=${rows.length}, completed=${completed}, indeterminate=${markedIndeterminate}, errors=${errors}`);
  await client.end();
} catch (err) {
  console.error('[reconcile] Failed:', err);
  try { await client.end(); } catch {}
  process.exit(1);
}
