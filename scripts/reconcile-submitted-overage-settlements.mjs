/** Read provider evidence first. A failed/empty/incomplete scan never enables retry. */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import pg from 'pg';
import Stripe from 'stripe';

const requestOptions = { timeout: 20_000, maxNetworkRetries: 0 };

export function verifiedItem(row, item, accountId, livemode) {
  return typeof item?.id === 'string' && /^ii_[A-Za-z0-9]{8,}$/.test(item.id) && !item.deleted
    && item.customer === row.stripe_customer_id && item.currency === 'usd'
    && item.amount === Number(row.chargeable_cents) && item.livemode === row.livemode && item.livemode === livemode
    && item.metadata?.lgq_settlement_id === row.id && item.metadata?.lgq_account_id === row.account_id
    && (!row.stripe_account_id || row.stripe_account_id === accountId);
}

export async function inspectSettlement(stripe, row, scope, maxPages = 100) {
  if (!stripe || !row.stripe_customer_id || typeof row.livemode !== 'boolean' || row.livemode !== scope.livemode
    || (row.stripe_account_id && row.stripe_account_id !== scope.accountId)) return { status: 'unresolved', reason: 'provider_scope_missing' };
  try {
    const matches = new Map();
    if (row.stripe_invoice_item_id) {
      const item = await stripe.invoiceItems.retrieve(row.stripe_invoice_item_id, {}, requestOptions);
      if (!verifiedItem(row,item,scope.accountId,scope.livemode)) return { status: 'unresolved', reason: 'stored_item_mismatch' };
      matches.set(item.id,item);
    }
    // Also scan when an ID is known, to detect duplicates rather than accepting
    // the first valid match. Omitting pending includes attached and pending items.
    let cursor;
    for (let page = 0; page < maxPages; page += 1) {
      const items = await stripe.invoiceItems.list({ customer: row.stripe_customer_id, limit: 100,
        ...(cursor ? { starting_after: cursor } : {}) }, requestOptions);
      if (!Array.isArray(items.data) || typeof items.has_more !== 'boolean') throw new Error('Malformed provider page');
      for (const item of items.data) {
        if (item.metadata?.lgq_settlement_id === row.id) matches.set(item.id,item);
      }
      if (!items.has_more) {
        if (matches.size > 1) return { status: 'unresolved', reason: 'duplicate_items', itemIds: [...matches.keys()] };
        if (!matches.size) return { status: 'unresolved', reason: 'no_matching_item' };
        const item = [...matches.values()][0];
        if (!verifiedItem(row,item,scope.accountId,scope.livemode)) return { status: 'unresolved', reason: 'item_mismatch' };
        return { status: 'matched', item };
      }
      const next = items.data.at(-1)?.id;
      if (!next || next === cursor) throw new Error('Pagination did not advance');
      cursor = next;
    }
    return { status: 'unresolved', reason: 'incomplete_pagination' };
  } catch { return { status: 'error', reason: 'stripe_lookup_failed' }; }
}

export async function reconcileRows({ rows, stripe, db, scope, apply = false }) {
  const report = { scanned: rows.length, matched: 0, applied: 0, unresolved: 0, errors: 0, entries: [] };
  for (const row of rows) {
    let result = row.lease_expires_at && Date.parse(row.lease_expires_at) > Date.now()
      ? { status: 'unresolved', reason: 'active_lease' } : await inspectSettlement(stripe,row,scope);
    if (result.status === 'matched') {
      report.matched += 1;
      if (apply) {
        try {
          const applied = await db.query('select public.reconcile_overage_invoice_item($1,$2,$3::jsonb,$4) as applied',
            [row.id,row.revision,JSON.stringify(result.item),scope.accountId]);
          if (applied.rows[0]?.applied !== true) result = { status: 'unresolved', reason: 'concurrent_change' };
          else report.applied += 1;
        } catch { result = { status: 'error', reason: 'apply_failed' }; }
      }
    }
    if (result.status === 'unresolved') report.unresolved += 1;
    if (result.status === 'error') report.errors += 1;
    report.entries.push({ settlementId: row.id, revision: row.revision, status: result.status,
      reason: result.reason, invoiceItemId: result.item?.id, duplicateItemIds: result.itemIds });
  }
  return report;
}

async function main() {
  const args = process.argv.slice(2);
  const option = (name) => args.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length+1);
  const mode = option('--mode');
  const accountId = option('--stripe-account');
  const manifest = option('--manifest');
  const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.SUPABASE_DB_URL;
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!databaseUrl || !stripeKey || !['test','live'].includes(mode) || !accountId || !manifest) {
    throw new Error('Required: database URL, STRIPE_SECRET_KEY, --mode=test|live --stripe-account=acct_... --manifest=path [--apply]');
  }
  if (args.includes('--apply') && args.includes('--dry-run')) throw new Error('Choose either --apply or --dry-run');
  const stripe = new Stripe(stripeKey, requestOptions);
  const [account,balance] = await Promise.all([stripe.accounts.retrieve(null,{},requestOptions),stripe.balance.retrieve({},requestOptions)]);
  if (account.id !== accountId || balance.livemode !== (mode==='live')) throw new Error('Stripe scope mismatch');
  const url = new URL(databaseUrl);
  const local = ['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  // Do not permit URL sslmode settings to override certificate verification.
  for (const name of ['sslmode','sslcert','sslkey','sslrootcert']) url.searchParams.delete(name);
  const db = new pg.Client({ connectionString: url.toString(), ssl: local ? false : {
    rejectUnauthorized: true, ...(process.env.PGSSLROOTCERT ? { ca: readFileSync(process.env.PGSSLROOTCERT,'utf8') } : {}),
  } });
  await db.connect();
  try {
    const { rows } = await db.query(`select * from public.workspace_overage_settlements
      where state in ('submitted','indeterminate') or (state='failed' and attempt_count>0)
      order by first_submitted_at nulls first,id`);
    const report = await reconcileRows({ rows,stripe,db,scope:{ accountId,livemode:mode==='live' },apply:args.includes('--apply') });
    writeFileSync(resolve(manifest),JSON.stringify({ generatedAt:new Date().toISOString(), mode,accountId,apply:args.includes('--apply'),...report },null,2));
    console.log(JSON.stringify({ scanned:report.scanned,matched:report.matched,applied:report.applied,unresolved:report.unresolved,errors:report.errors }));
    if (report.errors || report.unresolved) process.exitCode=1;
  } finally { await db.end(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => { console.error('Overage reconciliation failed; verify configuration, scope, and connectivity.'); process.exitCode=1; });
}
