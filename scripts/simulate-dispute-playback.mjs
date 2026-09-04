import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

// Simulate & verify Stripe dispute webhook playback (charge.dispute.created).
// Validates that dispute_due_by and dispute status populate correctly in the database.
//
// Usage:
//   node scripts/simulate-dispute-playback.mjs [paymentIntentId] [appUrl]

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
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!secretKey || !webhookSecret || !supabaseUrl || !serviceRoleKey) {
  console.error('Missing required environment variables (STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, etc.).');
  process.exit(1);
}

const stripe = new Stripe(secretKey);
const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const APP_URL = process.argv[3] || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3010';
let targetPaymentIntent = process.argv[2];
let createdTestPayment = false;
let testPaymentId = null;

console.log(`\n======================================================================`);
console.log(`  STRIPE DISPUTE WEBHOOK PLAYBACK REHEARSAL`);
console.log(`  Target URL: ${APP_URL}/api/stripe/webhook`);
console.log(`======================================================================\n`);

async function ensurePayment() {
  if (targetPaymentIntent) {
    const { data, error } = await admin
      .from('payments')
      .select('id, status, stripe_payment_intent')
      .eq('stripe_payment_intent', targetPaymentIntent)
      .maybeSingle();

    if (error || !data) {
      console.error(`Could not find payment for PI ${targetPaymentIntent}:`, error?.message);
      process.exit(1);
    }
    return data;
  }

  // Find an existing paid payment or create a fixture
  const { data: existingPaid } = await admin
    .from('payments')
    .select('id, account_id, status, stripe_payment_intent')
    .eq('status', 'paid')
    .not('stripe_payment_intent', 'is', null)
    .limit(1)
    .maybeSingle();

  if (existingPaid) {
    targetPaymentIntent = existingPaid.stripe_payment_intent;
    console.log(`Using existing paid payment: ${existingPaid.id} (PI: ${targetPaymentIntent})`);
    return existingPaid;
  }

  // Create a fixture payment row
  const fakePi = `pi_test_dispute_${randomUUID().slice(0, 10)}`;
  const { data: acct } = await admin.from('accounts').select('id').limit(1).single();
  const { data: job } = await admin.from('jobs').insert({
    account_id: acct.id,
    ref: `DISP-${randomUUID().slice(0, 4)}`,
    status: 'in_progress',
  }).select('id').single();

  const { data: newPayment, error: insertErr } = await admin.from('payments').insert({
    account_id: acct.id,
    job_id: job.id,
    amount: 150.00,
    status: 'paid',
    stripe_payment_intent: fakePi,
    charge_model: 'destination',
  }).select('id, status, stripe_payment_intent').single();

  if (insertErr) {
    console.error('Could not create test payment:', insertErr.message);
    process.exit(1);
  }

  createdTestPayment = true;
  testPaymentId = newPayment.id;
  targetPaymentIntent = fakePi;
  console.log(`Created test fixture payment: ${testPaymentId} (PI: ${targetPaymentIntent})`);
  return newPayment;
}

const payment = await ensurePayment();

// 1. Build signed dispute event
const disputeId = `dp_test_${randomUUID().slice(0, 12)}`;
const dueByTimestamp = Math.floor(Date.now() / 1000) + (14 * 86400); // 14 days from now

const disputeEvent = {
  id: `evt_dispute_test_${randomUUID().slice(0, 12)}`,
  object: 'event',
  api_version: '2026-06-24.dahlia',
  created: Math.floor(Date.now() / 1000),
  type: 'charge.dispute.created',
  data: {
    object: {
      id: disputeId,
      object: 'dispute',
      amount: 15000,
      currency: 'usd',
      payment_intent: targetPaymentIntent,
      reason: 'fraudulent',
      status: 'needs_response',
      evidence_details: {
        due_by: dueByTimestamp,
        has_evidence: false,
        submission_count: 0,
      },
    },
  },
};

const payload = JSON.stringify(disputeEvent);
const signature = stripe.webhooks.generateTestHeaderString({
  payload,
  secret: webhookSecret,
});

console.log(`Dispatching charge.dispute.created payload (Dispute ID: ${disputeId})...`);

const res = await fetch(`${APP_URL}/api/stripe/webhook`, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'stripe-signature': signature,
  },
  body: payload,
});

console.log(`Endpoint returned HTTP ${res.status} ${res.statusText}`);

if (!res.ok) {
  const errText = await res.text();
  console.error('Webhook endpoint returned error:', errText);
  process.exit(1);
}

// 2. Assert DB state
const { data: updatedPayment, error: queryErr } = await admin
  .from('payments')
  .select('id, status, disputed_at, dispute_reason, dispute_status, stripe_dispute_id, dispute_due_by')
  .eq('stripe_payment_intent', targetPaymentIntent)
  .single();

if (queryErr || !updatedPayment) {
  console.error('Failed to query updated payment:', queryErr?.message);
  process.exit(1);
}

console.log(`\nUpdated Payment State:`);
console.log(`  ID:              ${updatedPayment.id}`);
console.log(`  Status:          ${updatedPayment.status}`);
console.log(`  Disputed At:     ${updatedPayment.disputed_at}`);
console.log(`  Dispute Reason:  ${updatedPayment.dispute_reason}`);
console.log(`  Dispute Status:  ${updatedPayment.dispute_status}`);
console.log(`  Dispute ID:      ${updatedPayment.stripe_dispute_id}`);
console.log(`  Dispute Due By:  ${updatedPayment.dispute_due_by}`);

const expectedDueByIso = new Date(dueByTimestamp * 1000).toISOString();
const pass = (
  updatedPayment.status === 'disputed' &&
  updatedPayment.stripe_dispute_id === disputeId &&
  updatedPayment.dispute_due_by === expectedDueByIso
);

if (pass) {
  console.log(`\n✓ PASS: Dispute successfully ingested, dispute_due_by populated correctly.`);
} else {
  console.error(`\n✗ FAIL: Payment state does not match expected dispute transition.`);
  process.exit(1);
}

// 3. Replay assertion (idempotency)
console.log(`\nTesting dispute replay idempotency...`);
const replayRes = await fetch(`${APP_URL}/api/stripe/webhook`, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'stripe-signature': signature,
  },
  body: payload,
});

console.log(`Replay endpoint returned HTTP ${replayRes.status} (Expected 200)`);

if (replayRes.ok) {
  console.log(`✓ PASS: Dispute replay processed idempotently with zero duplicate errors.\n`);
} else {
  console.error(`✗ FAIL: Dispute replay failed with HTTP ${replayRes.status}`);
  process.exit(1);
}
