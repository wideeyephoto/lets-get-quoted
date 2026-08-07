import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Get a signed-in session on the STAGING app without sending an email.
//
// The normal sign-in is a magic link: lib/magic-link.ts asks Supabase for a
// hashed token, builds ${APP_ORIGIN}/auth/magic-link-callback?token_hash=…, and
// mails it via Resend. Staging has no Resend key on purpose — this suite must
// not be able to send anything to anyone — so the email step is the only part
// that cannot run.
//
// It is also the only part that does not matter. This does exactly what that
// function does, minus the mail: same generateLink call, same callback route,
// same token. What comes out is the identical URL the email would have carried,
// printed instead of sent.
//
// It also makes sure the address can actually get somewhere once it lands:
// creates the auth user if this is their first sign-in, and gives them an owner
// membership on a staging account so /dashboard has something to show. Reaching
// /admin is separate — that is ADMIN_EMAILS in .env.staging.local, and this
// script says whether the address is on it.
//
//   node scripts/staging-signin.mjs you@example.com

const email = (process.argv[2] || '').trim().toLowerCase();
if (!email || !email.includes('@')) {
  console.error('Usage: node scripts/staging-signin.mjs <email>');
  process.exit(1);
}

const env = new Map();
for (const line of (await readFile(resolve(ROOT, '.env.staging.local'), 'utf8')).split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const at = t.indexOf('=');
  if (at === -1) continue;
  const v = t.slice(at + 1).trim().replace(/^['"]|['"]$/g, '');
  if (v) env.set(t.slice(0, at).trim(), v);
}

const url = env.get('NEXT_PUBLIC_SUPABASE_URL');
const serviceKey = env.get('SUPABASE_SERVICE_ROLE_KEY');
const appOrigin = (env.get('NEXT_PUBLIC_APP_URL') || 'http://localhost:3010').replace(/\/$/, '');
if (!url || !serviceKey) {
  console.error('.env.staging.local needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

// Guard, same spirit as staging-setup.mjs: this mints a live sign-in token, and
// minting one against production from a helper script is not something that
// should be one typo away.
const primary = await readFile(resolve(ROOT, '.env.local'), 'utf8').catch(() => '');
const primaryUrl = primary.split(/\r?\n/).find((l) => l.startsWith('NEXT_PUBLIC_SUPABASE_URL='))?.split('=')[1]?.trim();
if (primaryUrl && new URL(primaryUrl).hostname === new URL(url).hostname) {
  console.error('REFUSING: .env.staging.local points at the same Supabase project as .env.local.');
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

// 1. The auth user.
let userId = null;
const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
userId = list?.users?.find((u) => (u.email || '').toLowerCase() === email)?.id ?? null;
if (userId) {
  console.log(`user      existing (${userId})`);
} else {
  const { data: created, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (error) {
    console.error('Could not create the user:', error.message);
    process.exit(1);
  }
  userId = created.user.id;
  console.log(`user      created (${userId})`);
}

// 2. An account to own, so /dashboard is not an empty shell.
const { data: account } = await admin.from('accounts').select('id, business_name').order('created_at').limit(1).maybeSingle();
if (!account) {
  console.error('No accounts on staging — run scripts/staging-setup.mjs --apply and seed one first.');
  process.exit(1);
}
const { data: existingMembership } = await admin
  .from('memberships').select('id, role').eq('account_id', account.id).eq('user_id', userId).maybeSingle();
if (existingMembership) {
  console.log(`account   ${account.business_name} (already ${existingMembership.role})`);
} else {
  const { error } = await admin.from('memberships').insert({ account_id: account.id, user_id: userId, role: 'owner' });
  if (error) {
    console.error('Could not create the membership:', error.message);
    process.exit(1);
  }
  console.log(`account   ${account.business_name} (owner membership created)`);
}

// 3. Is this address allowed into /admin?
const allow = (env.get('ADMIN_EMAILS') || '').split(',').map((e) => e.trim().split(':')[0].trim().toLowerCase()).filter(Boolean);
console.log(`/admin    ${allow.includes(email) ? 'yes — on ADMIN_EMAILS' : 'NO — not on ADMIN_EMAILS in .env.staging.local, /admin will 404'}`);

// 4. The link itself — the same one the email would have contained.
const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
if (linkError || !link?.properties?.hashed_token) {
  console.error('Could not generate the magic link:', linkError?.message);
  process.exit(1);
}
const verify = new URL('/auth/magic-link-callback', appOrigin);
verify.searchParams.set('token_hash', link.properties.hashed_token);
verify.searchParams.set('next', '/admin');

console.log('\nOpen this in a browser (expires in about an hour, single use):\n');
console.log(verify.toString());
console.log('\nIf it fails, the dev server is probably not running against staging. Start it with:');
console.log('  node scripts/staging-dev.mjs');
