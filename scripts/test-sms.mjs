import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

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
  if (!condition) throw new Error(message);
}

await loadEnv();
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const suffix = randomUUID().slice(0, 8);
let accountId;

try {
  const { data: account, error: accountError } = await admin.from('accounts').insert({ business_name: `SMS test ${suffix}` }).select('id').single();
  if (accountError) throw accountError;
  accountId = account.id;

  const { data: job, error: jobError } = await admin.from('jobs').insert({
    account_id: accountId,
    ref: `SMS-${suffix}`,
    client_name: 'SMS Test Homeowner',
    client_phone: '+12485550117',
    status: 'new_lead',
    quoted_amount: 500,
  }).select('id').single();
  if (jobError) throw jobError;

  const { data: payment, error: paymentError } = await admin.from('payments').insert({
    account_id: accountId,
    job_id: job.id,
    kind: 'deposit',
    label: 'Test deposit',
    amount: 500,
    status: 'requested',
    homeowner_phone: '+12485550117',
    sms_consent: true,
    sms_consent_at: new Date().toISOString(),
  }).select('id, homeowner_phone, sms_consent').single();
  if (paymentError) throw paymentError;
  assert(payment.homeowner_phone === '+12485550117' && payment.sms_consent, 'Payment SMS snapshot was not persisted.');

  const { error: consentError } = await admin.from('sms_consent').insert({
    account_id: accountId,
    phone_number: '+12485550117',
    status: 'opted_in',
    source: 'payment_request',
    consented_at: new Date().toISOString(),
  });
  if (consentError) throw consentError;

  const event = {
    account_id: accountId,
    payment_id: payment.id,
    event_type: 'payment_requested',
    phone_number: '+12485550117',
    status: 'sent',
    body: 'Test payment link',
  };
  const { error: firstEventError } = await admin.from('sms_events').insert(event);
  if (firstEventError) throw firstEventError;
  const { error: duplicateError } = await admin.from('sms_events').insert(event);
  assert(duplicateError?.code === '23505', 'Duplicate payment lifecycle SMS was not blocked.');

  const { error: optOutError } = await admin.from('sms_consent').update({ status: 'opted_out', opted_out_at: new Date().toISOString() }).eq('account_id', accountId).eq('phone_number', '+12485550117');
  if (optOutError) throw optOutError;
  const { data: consent } = await admin.from('sms_consent').select('status, opted_out_at').eq('account_id', accountId).single();
  assert(consent.status === 'opted_out' && consent.opted_out_at, 'SMS STOP state was not persisted.');

  console.log('SMS consent and idempotency smoke test passed.');
} finally {
  if (accountId) await admin.from('accounts').delete().eq('id', accountId);
}
