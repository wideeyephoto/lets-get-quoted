import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

// Throwaway smoke test for the Stripe webhook handler (src/app/api/stripe/webhook/route.ts).
// Fabricates signed webhook payloads (no real Stripe Checkout/Connect account needed) and
// POSTs them at the local dev server, then asserts DB state. Requires the "Dev server" task
// running on port 3010. Cleans up all rows it creates.

const APP_URL = process.env.TEST_APP_URL || 'http://localhost:3010';

async function loadEnv() {
  const contents = await readFile(new URL('../.env.local', import.meta.url), 'utf8');
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator < 1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

await loadEnv();

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { typescript: true });
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
if (!webhookSecret) throw new Error('STRIPE_WEBHOOK_SECRET is not set in .env.local');

const suffix = randomUUID().slice(0, 8);
let accountId;

async function postWebhook(eventPayload) {
  const payload = JSON.stringify(eventPayload);
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret: webhookSecret });
  const res = await fetch(`${APP_URL}/api/stripe/webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'stripe-signature': header },
    body: payload,
  });
  return res;
}

function makeEvent(type, dataObject) {
  return {
    id: `evt_test_${randomUUID().slice(0, 12)}`,
    object: 'event',
    type,
    data: { object: dataObject },
  };
}

async function makeJobAndPayment({ withInvoice, invoiceAlreadySigned }) {
  const { data: job, error: jobError } = await admin
    .from('jobs')
    .insert({ account_id: accountId, ref: `WH-${suffix}-${randomUUID().slice(0, 4)}`, client_name: 'Webhook Test Homeowner', status: 'in_progress' })
    .select('id')
    .single();
  if (jobError) throw jobError;

  let invoiceId = null;
  if (withInvoice) {
    const { data: invoice, error: invoiceError } = await admin
      .from('invoices')
      .insert({
        account_id: accountId,
        job_id: job.id,
        ref: `INV-WH-${randomUUID().slice(0, 6)}`,
        status: invoiceAlreadySigned ? 'signed' : 'sent',
        total: 500,
        signed_at: invoiceAlreadySigned ? new Date('2020-01-01T00:00:00.000Z').toISOString() : null,
        signer_name: invoiceAlreadySigned ? 'Original Real Signer' : null,
      })
      .select('id')
      .single();
    if (invoiceError) throw invoiceError;
    invoiceId = invoice.id;
  }

  const { data: payment, error: paymentError } = await admin
    .from('payments')
    .insert({
      account_id: accountId,
      job_id: job.id,
      invoice_id: invoiceId,
      kind: 'deposit',
      label: 'Test deposit',
      amount: 500,
      status: 'requested',
      sms_consent: false,
    })
    .select('id')
    .single();
  if (paymentError) throw paymentError;

  return { jobId: job.id, invoiceId, paymentId: payment.id };
}

try {
  const { data: account, error: accountError } = await admin
    .from('accounts')
    .insert({ business_name: `Webhook test ${suffix}`, stripe_connect_id: `acct_test_${suffix}`, connect_onboarded: true })
    .select('id')
    .single();
  if (accountError) throw accountError;
  accountId = account.id;

  // --- Test A: checkout.session.completed marks payment + invoice paid ---
  const a = await makeJobAndPayment({ withInvoice: true, invoiceAlreadySigned: false });
  const sessionEventA = makeEvent('checkout.session.completed', {
    id: `cs_test_${suffix}`,
    object: 'checkout.session',
    payment_status: 'paid',
    payment_intent: `pi_test_${suffix}`,
    metadata: { payment_id: a.paymentId },
  });
  let res = await postWebhook(sessionEventA);
  assert(res.status === 200, `webhook POST A should 200, got ${res.status}`);

  let { data: paymentA } = await admin.from('payments').select('status, paid_at, stripe_payment_intent').eq('id', a.paymentId).single();
  assert(paymentA.status === 'paid', `payment A should be paid, got ${paymentA.status}`);
  assert(paymentA.stripe_payment_intent === `pi_test_${suffix}`, 'payment A should record the payment intent id');
  const firstPaidAt = paymentA.paid_at;

  let { data: invoiceA } = await admin.from('invoices').select('status, signed_at').eq('id', a.invoiceId).single();
  assert(invoiceA.status === 'paid', `invoice A should be paid, got ${invoiceA.status}`);
  assert(invoiceA.signed_at, 'invoice A should get a backfilled signed_at (was never actually signed)');
  const firstSignedAt = invoiceA.signed_at;

  // --- Test B: duplicate delivery of the SAME event is a no-op (idempotency fix) ---
  res = await postWebhook(sessionEventA);
  assert(res.status === 200, `duplicate webhook POST should still 200, got ${res.status}`);
  ({ data: paymentA } = await admin.from('payments').select('status, paid_at').eq('id', a.paymentId).single());
  assert(paymentA.paid_at === firstPaidAt, 'duplicate delivery must NOT overwrite paid_at');
  ({ data: invoiceA } = await admin.from('invoices').select('signed_at').eq('id', a.invoiceId).single());
  assert(invoiceA.signed_at === firstSignedAt, 'duplicate delivery must NOT overwrite the backfilled signed_at');
  console.log('PASS: checkout.session.completed idempotency (paid_at/signed_at stable on redelivery)');

  // --- Test C: a REAL prior e-signature's signed_at/signer_name must survive payment webhook ---
  const c = await makeJobAndPayment({ withInvoice: true, invoiceAlreadySigned: true });
  // Read back the pre-webhook value as Postgres/PostgREST actually formats it
  // (may differ textually from the JS ISO string used on insert) so the later
  // comparison isn't a false failure due to string-format drift.
  const { data: invoiceCBefore } = await admin.from('invoices').select('signed_at, signer_name').eq('id', c.invoiceId).single();
  const sessionEventC = makeEvent('checkout.session.completed', {
    id: `cs_test_c_${suffix}`,
    object: 'checkout.session',
    payment_status: 'paid',
    payment_intent: `pi_test_c_${suffix}`,
    metadata: { payment_id: c.paymentId },
  });
  res = await postWebhook(sessionEventC);
  assert(res.status === 200, `webhook POST C should 200, got ${res.status}`);
  const { data: invoiceC } = await admin.from('invoices').select('status, signed_at, signer_name').eq('id', c.invoiceId).single();
  assert(invoiceC.status === 'paid', `invoice C should be paid, got ${invoiceC.status}`);
  assert(invoiceC.signed_at === invoiceCBefore.signed_at, `invoice C real signed_at must be preserved, not overwritten by payment webhook (before=${invoiceCBefore.signed_at}, after=${invoiceC.signed_at})`);
  assert(invoiceC.signer_name === 'Original Real Signer', 'invoice C signer_name must be preserved');
  console.log('PASS: real e-signature signed_at/signer_name preserved through payment webhook');

  // --- Test D: charge.failed transitions a requested payment to failed ---
  const d = await makeJobAndPayment({ withInvoice: false });
  res = await postWebhook(makeEvent('charge.failed', { id: `ch_test_d_${suffix}`, object: 'charge', failure_message: 'Card declined.', metadata: { payment_id: d.paymentId } }));
  assert(res.status === 200, `webhook POST D should 200, got ${res.status}`);
  const { data: paymentD } = await admin.from('payments').select('status').eq('id', d.paymentId).single();
  assert(paymentD.status === 'failed', `payment D should be failed, got ${paymentD.status}`);
  console.log('PASS: charge.failed -> payment status failed');

  // --- Test E: checkout.session.expired transitions a processing payment to failed ---
  const e = await makeJobAndPayment({ withInvoice: false });
  await admin.from('payments').update({ status: 'processing', stripe_checkout_session: `cs_test_e_${suffix}` }).eq('id', e.paymentId);
  res = await postWebhook(makeEvent('checkout.session.expired', { id: `cs_test_e_${suffix}`, object: 'checkout.session', metadata: { payment_id: e.paymentId } }));
  assert(res.status === 200, `webhook POST E should 200, got ${res.status}`);
  const { data: paymentE } = await admin.from('payments').select('status').eq('id', e.paymentId).single();
  assert(paymentE.status === 'failed', `payment E should be failed, got ${paymentE.status}`);
  console.log('PASS: checkout.session.expired -> payment status failed');

  // --- Test F: charge.refunded transitions a paid payment to refunded ---
  const f = await makeJobAndPayment({ withInvoice: false });
  await admin.from('payments').update({ status: 'paid', paid_at: new Date().toISOString(), stripe_payment_intent: `pi_test_f_${suffix}` }).eq('id', f.paymentId);
  res = await postWebhook(makeEvent('charge.refunded', { id: `ch_test_f_${suffix}`, object: 'charge', amount_refunded: 50000, metadata: { payment_id: f.paymentId } }));
  assert(res.status === 200, `webhook POST F should 200, got ${res.status}`);
  const { data: paymentF } = await admin.from('payments').select('status').eq('id', f.paymentId).single();
  assert(paymentF.status === 'refunded', `payment F should be refunded, got ${paymentF.status}`);
  console.log('PASS: charge.refunded -> payment status refunded');

  // --- Test G: charge.dispute.created transitions a paid payment to disputed ---
  // Disputes carry no charge metadata, so the handler matches on the stored
  // payment intent id — not metadata.payment_id.
  const g = await makeJobAndPayment({ withInvoice: false });
  await admin.from('payments').update({ status: 'paid', paid_at: new Date().toISOString(), stripe_payment_intent: `pi_test_g_${suffix}` }).eq('id', g.paymentId);
  res = await postWebhook(makeEvent('charge.dispute.created', { id: `dp_test_g_${suffix}`, object: 'dispute', amount: 50000, reason: 'fraudulent', status: 'warning_needs_response', payment_intent: `pi_test_g_${suffix}` }));
  assert(res.status === 200, `webhook POST G (dispute created) should 200, got ${res.status}`);
  const { data: paymentG } = await admin.from('payments').select('status, disputed_at, dispute_reason').eq('id', g.paymentId).single();
  assert(paymentG.status === 'disputed', `payment G should be disputed, got ${paymentG.status}`);
  assert(paymentG.disputed_at, 'payment G should record disputed_at');
  assert(paymentG.dispute_reason === 'fraudulent', `payment G should record the dispute reason, got ${paymentG.dispute_reason}`);
  console.log('PASS: charge.dispute.created -> payment status disputed (matched by payment_intent)');

  // --- Test H: charge.dispute.closed (won) reverts the payment to paid ---
  res = await postWebhook(makeEvent('charge.dispute.closed', { id: `dp_test_g_${suffix}`, object: 'dispute', status: 'won', payment_intent: `pi_test_g_${suffix}` }));
  assert(res.status === 200, `webhook POST H (dispute won) should 200, got ${res.status}`);
  const { data: paymentGWon } = await admin.from('payments').select('status, dispute_status').eq('id', g.paymentId).single();
  assert(paymentGWon.status === 'paid', `payment G should revert to paid after a won dispute, got ${paymentGWon.status}`);
  assert(paymentGWon.dispute_status === 'won', 'payment G should record dispute_status won');
  console.log('PASS: charge.dispute.closed(won) -> payment reverts to paid');

  // --- Test I: charge.dispute.closed (lost) refunds the payment and voids its invoice ---
  const i = await makeJobAndPayment({ withInvoice: true, invoiceAlreadySigned: false });
  await admin.from('payments').update({ status: 'paid', paid_at: new Date().toISOString(), stripe_payment_intent: `pi_test_i_${suffix}` }).eq('id', i.paymentId);
  res = await postWebhook(makeEvent('charge.dispute.created', { id: `dp_test_i_${suffix}`, object: 'dispute', amount: 50000, reason: 'product_not_received', status: 'needs_response', payment_intent: `pi_test_i_${suffix}` }));
  assert(res.status === 200, `webhook POST I (dispute created) should 200, got ${res.status}`);
  res = await postWebhook(makeEvent('charge.dispute.closed', { id: `dp_test_i_${suffix}`, object: 'dispute', status: 'lost', payment_intent: `pi_test_i_${suffix}` }));
  assert(res.status === 200, `webhook POST I (dispute lost) should 200, got ${res.status}`);
  const { data: paymentILost } = await admin.from('payments').select('status, dispute_status').eq('id', i.paymentId).single();
  assert(paymentILost.status === 'refunded', `payment I should be refunded after a lost dispute, got ${paymentILost.status}`);
  assert(paymentILost.dispute_status === 'lost', 'payment I should record dispute_status lost');
  const { data: invoiceI } = await admin.from('invoices').select('status').eq('id', i.invoiceId).single();
  assert(invoiceI.status === 'void', `invoice I should be voided after a lost dispute, got ${invoiceI.status}`);
  console.log('PASS: charge.dispute.closed(lost) -> payment refunded + linked invoice voided');

  console.log('\nAll payment webhook flow tests passed.');
} finally {
  if (accountId) await admin.from('accounts').delete().eq('id', accountId);
}
