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
let photoPaths = [];

try {
  const { data: account, error: accountError } = await admin.from('accounts').insert({ business_name: `Lead test ${suffix}` }).select('id').single();
  if (accountError) throw accountError;
  accountId = account.id;

  const { data: site, error: siteError } = await admin.from('sites').insert({
    account_id: accountId,
    company_name: `Lead test ${suffix}`,
    subdomain: `lead-test-${suffix}`,
    published: true,
    template: 'carbon',
    portal_mode: 'light',
  }).select('id').single();
  if (siteError) throw siteError;

  const form = new FormData();
  form.set('siteId', site.id);
  form.set('startedAt', String(Date.now() - 5000));
  form.set('name', 'Integration Test Homeowner');
  form.set('email', `homeowner-${suffix}@example.com`);
  form.set('phone', '(555) 010-2200');
  form.set('address', '100 Test Avenue');
  form.set('projectType', 'Renovation');
  form.set('message', 'Testing the public quote intake pipeline.');
  const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
  form.append('photos', new Blob([pixel], { type: 'image/png' }), 'project-photo.png');

  const response = await fetch('http://localhost:3010/api/public/leads', { method: 'POST', body: form, headers: { referer: `http://lead-test-${suffix}.localhost:3010/` } });
  const result = await response.json();
  assert(response.status === 201, `Lead endpoint returned ${response.status}: ${result.error || 'unknown error'}`);

  const { data: lead, error: leadError } = await admin.from('leads').select('*').eq('id', result.leadId).single();
  if (leadError) throw leadError;
  assert(lead.account_id === accountId, 'Lead was attached to the wrong account.');
  assert(lead.status === 'new', 'New lead did not enter the new stage.');
  assert(lead.email === `homeowner-${suffix}@example.com`, 'Lead email was not persisted.');
  assert(lead.project_type === 'Renovation', 'Project type was not persisted.');
  assert(lead.photo_paths.length === 1 && lead.photo_paths[0].startsWith(`${accountId}/`), 'Private photo path was not persisted.');
  photoPaths = lead.photo_paths;
  const { data: signedPhoto, error: signedPhotoError } = await admin.storage.from('lead-photos').createSignedUrl(photoPaths[0], 60);
  if (signedPhotoError) throw signedPhotoError;
  assert(Boolean(signedPhoto.signedUrl), 'Lead photo could not be signed for owner access.');

  const { data: job, error: jobError } = await admin.from('jobs').insert({
    account_id: accountId,
    ref: `J-${suffix}`,
    client_name: lead.name,
    client_phone: lead.phone,
    address: lead.address,
    scope: lead.message,
    status: 'new_lead',
    quoted_amount: 12500,
  }).select('id').single();
  if (jobError) throw jobError;
  const { error: convertError } = await admin.from('leads').update({ status: 'won', converted_job: job.id }).eq('id', lead.id);
  if (convertError) throw convertError;

  const { data: converted } = await admin.from('leads').select('status, converted_job').eq('id', lead.id).single();
  assert(converted.status === 'won' && converted.converted_job === job.id, 'Lead conversion linkage failed.');
  console.log('Lead intake and conversion smoke test passed.');
} finally {
  if (photoPaths.length) await admin.storage.from('lead-photos').remove(photoPaths);
  if (accountId) await admin.from('accounts').delete().eq('id', accountId);
}
