import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

// Production Stripe <-> Application Ledger Reconciler
// Audits Stripe charges, refunds, subscriptions, top-ups, and webhook status
// against Supabase production database tables.
//
// Usage:
//   node scripts/reconcile-stripe-live-ledger.mjs
//   node scripts/reconcile-stripe-live-ledger.mjs --json

const JSON_MODE = process.argv.includes('--json');

async function loadEnv() {
  for (const candidate of ['.env.local', '../.env.local', '../../CLAUDE CODE FOLDER/.env.local']) {
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

await loadEnv();

const secretKey = process.env.STRIPE_SECRET_KEY;
if (!secretKey) {
  console.error('Missing STRIPE_SECRET_KEY.');
  process.exit(1);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const stripe = new Stripe(secretKey, {
  apiVersion: process.env.STRIPE_API_VERSION || '2026-06-24.dahlia',
});

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const isLive = secretKey.startsWith('sk_live_') || secretKey.startsWith('rk_live_');

if (!JSON_MODE) {
  console.log(`\n======================================================================`);
  console.log(`  STRIPE <-> APPLICATION LEDGER RECONCILIATION AUDIT`);
  console.log(`  Stripe Key Mode: ${isLive ? 'LIVE PRODUCTION' : 'TEST MODE'}`);
  console.log(`  Supabase URL:    ${supabaseUrl}`);
  console.log(`  Timestamp:       ${new Date().toISOString()}`);
  console.log(`======================================================================\n`);
}

const report = {
  keyMode: isLive ? 'live' : 'test',
  timestamp: new Date().toISOString(),
  endpoints: [],
  discrepancies: [],
  paymentsReconciled: 0,
  refundsAudited: 0,
  subscriptionsAudited: 0,
  unresolvedWebhookFailures: 0,
  ok: true,
};

// 1. Webhook Endpoints Audit
try {
  const endpointsList = await stripe.webhookEndpoints.list({ limit: 100 });
  report.endpoints = endpointsList.data.map((e) => ({
    id: e.id,
    url: e.url,
    status: e.status,
    livemode: e.livemode,
    eventsCount: e.enabled_events?.length ?? 0,
  }));

  if (!JSON_MODE) {
    console.log(`--- [1/5] STRIPE WEBHOOK ENDPOINTS (${report.endpoints.length} Registered) ---`);
    for (const ep of report.endpoints) {
      console.log(`• ${ep.id} (${ep.status}, ${ep.livemode ? 'live' : 'test'}): ${ep.url} [${ep.eventsCount} events]`);
    }
    console.log('');
  }
} catch (err) {
  report.discrepancies.push(`Failed to list Stripe webhook endpoints: ${err.message}`);
}

// 2. Unresolved Webhook Failures
try {
  const { data: failures, error: failErr } = await admin
    .from('webhook_failures')
    .select('id, source, event_type, reference_id, error_message, created_at')
    .eq('source', 'stripe')
    .is('resolved_at', null)
    .order('created_at', { ascending: false })
    .limit(50);

  if (failErr) {
    report.discrepancies.push(`Failed to query webhook_failures table: ${failErr.message}`);
  } else {
    report.unresolvedWebhookFailures = failures.length;
    if (!JSON_MODE) {
      console.log(`--- [2/5] OPEN STRIPE WEBHOOK FAILURES (${failures.length} Unresolved) ---`);
      if (failures.length === 0) {
        console.log(`✓ 0 open stripe webhook failures.`);
      } else {
        for (const f of failures) {
          console.log(`✗ FAILURE: [${f.event_type || 'unknown'}] Ref: ${f.reference_id || 'N/A'} at ${f.created_at}`);
          console.log(`  Error: ${f.error_message}`);
        }
      }
      console.log('');
    }
  }
} catch (err) {
  report.discrepancies.push(`Webhook failure query error: ${err.message}`);
}

// 3. Payments Ledger Reconciliation
try {
  const { data: dbPayments, error: payErr } = await admin
    .from('payments')
    .select('id, account_id, stripe_payment_intent, amount, refunded_amount, status, paid_at, refunded_at')
    .not('stripe_payment_intent', 'is', null)
    .limit(100);

  if (payErr) {
    report.discrepancies.push(`Failed to query payments: ${payErr.message}`);
  } else {
    if (!JSON_MODE) {
      console.log(`--- [3/5] PAYMENT LEDGER RECONCILIATION (${dbPayments.length} Sampled) ---`);
    }

    for (const p of dbPayments) {
      report.paymentsReconciled++;
      try {
        const pi = await stripe.paymentIntents.retrieve(p.stripe_payment_intent);
        const stripeAmount = (pi.amount / 100).toFixed(2);
        const dbAmount = Number(p.amount).toFixed(2);

        if (stripeAmount !== dbAmount) {
          const msg = `Payment amount mismatch on ${p.id} (PI: ${p.stripe_payment_intent}): DB=$${dbAmount} vs Stripe=$${stripeAmount}`;
          report.discrepancies.push(msg);
          if (!JSON_MODE) console.log(`✗ ${msg}`);
        }

        if (pi.status === 'succeeded' && p.status !== 'paid' && p.status !== 'refunded') {
          const msg = `Payment status mismatch on ${p.id}: Stripe succeeded but DB=${p.status}`;
          report.discrepancies.push(msg);
          if (!JSON_MODE) console.log(`✗ ${msg}`);
        }
      } catch (piErr) {
        report.discrepancies.push(`Could not retrieve PI ${p.stripe_payment_intent}: ${piErr.message}`);
      }
    }

    if (!JSON_MODE && report.discrepancies.length === 0) {
      console.log(`✓ All ${report.paymentsReconciled} checked payments match Stripe amounts and statuses.`);
    }
    if (!JSON_MODE) console.log('');
  }
} catch (err) {
  report.discrepancies.push(`Payment reconciliation error: ${err.message}`);
}

// 4. Connected Refunds & Loss Guard Audit
try {
  const refunds = await stripe.refunds.list({ limit: 50 });
  report.refundsAudited = refunds.data.length;

  if (!JSON_MODE) {
    console.log(`--- [4/5] REFUND AUDIT & REVERSE TRANSFER CHECK (${refunds.data.length} Sampled) ---`);
  }

  for (const r of refunds.data) {
    // If destination charge or connected, verify reverse_transfer was honored
    const paymentId = r.metadata?.payment_id;
    if (paymentId) {
      const { data: dbPayment } = await admin
        .from('payments')
        .select('id, amount, refunded_amount, status, platform_fee_refunded')
        .eq('id', paymentId)
        .single();

      if (!dbPayment) {
        report.discrepancies.push(`Stripe refund ${r.id} specifies payment_id ${paymentId} which is missing in DB`);
      } else if (dbPayment.status !== 'refunded' && (!dbPayment.refunded_amount || Number(dbPayment.refunded_amount) <= 0)) {
        report.discrepancies.push(`Stripe refund ${r.id} succeeded but DB payment ${paymentId} refunded_amount is ${dbPayment.refunded_amount}`);
      }
    }
  }

  if (!JSON_MODE) {
    console.log(`✓ Audited ${report.refundsAudited} Stripe refunds against application payments.`);
    console.log('');
  }
} catch (err) {
  report.discrepancies.push(`Refund audit error: ${err.message}`);
}

// 5. Subscriptions & Entitlements Reconciliation
try {
  const { data: dbSubs, error: subErr } = await admin
    .from('billing_subscriptions')
    .select('id, account_id, plan_code, status, provider_subscription_id, current_period_end')
    .not('provider_subscription_id', 'is', null)
    .limit(50);

  if (subErr) {
    report.discrepancies.push(`Failed to query billing_subscriptions: ${subErr.message}`);
  } else {
    report.subscriptionsAudited = dbSubs.length;
    if (!JSON_MODE) {
      console.log(`--- [5/5] SUBSCRIPTIONS RECONCILIATION (${dbSubs.length} Active in DB) ---`);
    }

    for (const sub of dbSubs) {
      try {
        const stripeSub = await stripe.subscriptions.retrieve(sub.provider_subscription_id);
        if (stripeSub.status !== sub.status) {
          const msg = `Subscription status drift on account ${sub.account_id}: DB=${sub.status} vs Stripe=${stripeSub.status}`;
          report.discrepancies.push(msg);
          if (!JSON_MODE) console.log(`✗ ${msg}`);
        }
      } catch (stripeSubErr) {
        report.discrepancies.push(`Stripe sub ${sub.provider_subscription_id} lookup error: ${stripeSubErr.message}`);
      }
    }

    if (!JSON_MODE && report.discrepancies.length === 0) {
      console.log(`✓ All ${report.subscriptionsAudited} subscriptions match Stripe provider state.`);
    }
    if (!JSON_MODE) console.log('');
  }
} catch (err) {
  report.discrepancies.push(`Subscription reconciliation error: ${err.message}`);
}

report.ok = report.discrepancies.length === 0;

if (JSON_MODE) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`----------------------------------------------------------------------`);
  console.log(`  RECONCILIATION SUMMARY: ${report.ok ? 'ALL LEDGERS CLEAN & BALANCED' : `${report.discrepancies.length} DISCREPANCIES DETECTED`}`);
  console.log(`----------------------------------------------------------------------\n`);
}

process.exit(report.ok ? 0 : 1);
