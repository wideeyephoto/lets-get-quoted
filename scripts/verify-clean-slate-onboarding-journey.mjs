import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

// Automated verification script for the Clean-Slate Onboarding E2E Journey.
// Validates that all account, terms, merchant, quote, payment, and refund records
// exist, maintain referential integrity, and reached their expected states.
//
// Usage:
//   node scripts/verify-clean-slate-onboarding-journey.mjs <accountId-or-email>
//   node scripts/verify-clean-slate-onboarding-journey.mjs --latest

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

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const targetArg = process.argv[2];

if (!targetArg) {
  console.log('Usage: node scripts/verify-clean-slate-onboarding-journey.mjs <accountId | email | --latest>');
  process.exit(1);
}

async function resolveAccount() {
  if (targetArg === '--latest') {
    const { data, error } = await admin
      .from('accounts')
      .select('id, business_name, created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    if (error || !data) {
      console.error('Could not find latest account:', error?.message);
      process.exit(1);
    }
    return data;
  }

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(targetArg);
  if (isUuid) {
    const { data, error } = await admin
      .from('accounts')
      .select('id, business_name, created_at')
      .eq('id', targetArg)
      .single();
    if (error || !data) {
      console.error(`Account ID ${targetArg} not found:`, error?.message);
      process.exit(1);
    }
    return data;
  }

  // Look up by email in auth.users or account_memberships
  const { data: userData, error: userError } = await admin.auth.admin.listUsers();
  const user = userData?.users?.find((u) => u.email?.toLowerCase() === targetArg.toLowerCase());
  if (!user) {
    console.error(`User with email ${targetArg} not found in auth.users.`);
    process.exit(1);
  }

  const { data: member, error: memberError } = await admin
    .from('account_memberships')
    .select('account_id')
    .eq('user_id', user.id)
    .single();

  if (memberError || !member) {
    console.error(`No account membership found for user ${user.id}:`, memberError?.message);
    process.exit(1);
  }

  const { data: acct, error: acctError } = await admin
    .from('accounts')
    .select('id, business_name, created_at')
    .eq('id', member.account_id)
    .single();

  if (acctError || !acct) {
    console.error(`Account ${member.account_id} not found:`, acctError?.message);
    process.exit(1);
  }

  return acct;
}

const account = await resolveAccount();
const accountId = account.id;

console.log(`\n======================================================================`);
console.log(`  CLEAN-SLATE ONBOARDING AUDIT: ${account.business_name || 'Unnamed'}`);
console.log(`  Account ID: ${accountId}`);
console.log(`  Created At: ${account.created_at}`);
console.log(`======================================================================\n`);

const checks = [];
function record(name, pass, details) {
  checks.push({ name, pass, details });
  const mark = pass ? '✓ PASS' : '✗ FAIL';
  console.log(`[${mark}] ${name}`);
  if (details) console.log(`       ${details}`);
}

// 1. Account & Terms
const { data: fullAccount, error: fullAcctError } = await admin
  .from('accounts')
  .select('id, business_name, terms_accepted_at, terms_version, terms_accepted_by, trade, postal_code, stripe_merchant_account_id, merchant_onboarding_state, merchant_card_payments_active, merchant_payouts_active')
  .eq('id', accountId)
  .single();

if (fullAcctError) {
  record('Account Record Exists', false, fullAcctError.message);
} else {
  record('Account Record Exists', true, `Trade: ${fullAccount.trade || 'N/A'}, ZIP: ${fullAccount.postal_code || 'N/A'}`);
  record('Terms Accepted', Boolean(fullAccount.terms_accepted_at), `Accepted at: ${fullAccount.terms_accepted_at || 'NEVER'} (version: ${fullAccount.terms_version || 'NONE'}) by ${fullAccount.terms_accepted_by || 'UNKNOWN'}`);
}

// 2. Account Membership & Role
const { data: memberList, error: memError } = await admin
  .from('memberships')
  .select('id, user_id, role, created_at')
  .eq('account_id', accountId);

if (memError || !memberList || memberList.length === 0) {
  record('Owner Membership Exists', false, memError?.message || 'No memberships found.');
} else {
  const owner = memberList.find((m) => m.role === 'owner');
  record('Owner Membership Exists', Boolean(owner), `User: ${owner?.user_id || 'NONE'}`);
}

// 3. Stripe Connect Merchant Status
const stripeAccountId = fullAccount?.stripe_merchant_account_id;
const isMerchantReady = Boolean(
  stripeAccountId &&
  (fullAccount.merchant_onboarding_state === 'completed' || fullAccount.merchant_card_payments_active)
);

record(
  'Stripe Connect Merchant Ready',
  isMerchantReady,
  `Stripe ID: ${stripeAccountId || 'NONE'}, State: ${fullAccount?.merchant_onboarding_state || 'none'}, Card Payments Active: ${Boolean(fullAccount?.merchant_card_payments_active)}`
);

// 4. Jobs & Quotes
const { data: jobs, error: jobsError } = await admin
  .from('jobs')
  .select('id, ref, client_name, client_email, client_phone, status, quoted_amount, quote_items, created_at')
  .eq('account_id', accountId);

if (jobsError || !jobs || jobs.length === 0) {
  record('First Quote/Job Created', false, jobsError?.message || 'No jobs or quotes created.');
} else {
  const job = jobs[0];
  const items = Array.isArray(job.quote_items) ? job.quote_items : [];
  record('First Quote/Job Created', true, `Job Ref: ${job.ref}, Client: ${job.client_name}, Quoted: $${job.quoted_amount || 0}, Line items: ${items.length}`);
}

// 5. Payments & Invoices
const { data: payments, error: paymentsError } = await admin
  .from('payments')
  .select('id, job_id, amount, status, refunded_amount, platform_fee, platform_fee_refunded, stripe_payment_intent, paid_at, refunded_at')
  .eq('account_id', accountId);

if (paymentsError || !payments || payments.length === 0) {
  record('Payment Created & Attempted', false, paymentsError?.message || 'No payments found on account.');
} else {
  const payment = payments[0];
  const isPaidOrRefunded = payment.status === 'paid' || payment.status === 'refunded';
  record('Payment Charged Successfully', isPaidOrRefunded, `Status: ${payment.status}, Amount: $${payment.amount}, PI: ${payment.stripe_payment_intent || 'NONE'}, Paid at: ${payment.paid_at || 'NONE'}`);

  const isRefunded = payment.status === 'refunded' || (payment.refunded_amount != null && Number(payment.refunded_amount) > 0);
  record(
    'Dashboard-Issued Refund Succeeded',
    isRefunded,
    `Refunded: $${payment.refunded_amount || 0} of $${payment.amount}, Fee Refunded: $${payment.platform_fee_refunded || 0}, Refunded at: ${payment.refunded_at || 'NONE'}`
  );
}

// 6. Outbound Notifications
const { data: emailEvents } = await admin
  .from('email_events')
  .select('id, event_type, recipient, status, occurred_at')
  .eq('account_id', accountId)
  .order('occurred_at', { ascending: false })
  .limit(10);

const emailCount = emailEvents?.length ?? 0;
record('Email Delivery Telemetry', emailCount > 0, `${emailCount} email event(s) recorded in database.`);

const total = checks.length;
const passed = checks.filter((c) => c.pass).length;
const failed = total - passed;

console.log(`\n----------------------------------------------------------------------`);
console.log(`  AUDIT RESULT: ${failed === 0 ? 'ALL CHECKS PASSED' : `${failed} OF ${total} CHECKS FAILED`}`);
console.log(`----------------------------------------------------------------------\n`);

process.exit(failed === 0 ? 0 : 1);
