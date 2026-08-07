import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// `npm run dev`, pointed at STAGING instead of production.
//
// Next loads .env.local automatically and that is the production database, so
// running the dev server the normal way to look at the admin console means
// clicking around production with staff powers — restrict payouts, ban sessions,
// delete attachments — on real accounts. There is no warning when that happens;
// the pages look identical.
//
// Next skips any key already present in process.env, so setting them here wins
// over .env.local without touching that file. Nothing is copied, moved or
// swapped, so there is no state to restore afterwards and no way to leave the
// repo pointed somewhere it should not be.
//
//   node scripts/staging-dev.mjs
//
// PORT 3011, NOT 3010, and that is the point rather than an accident. `npm run
// dev` uses 3010 against production; this uses 3011 against staging. They can
// run side by side, and which database a tab is talking to is readable from the
// address bar instead of being something you have to remember.
const PORT = 3011;

async function readEnvFile(name) {
  const map = new Map();
  try {
    for (const line of (await readFile(resolve(ROOT, name), 'utf8')).split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const at = t.indexOf('=');
      if (at === -1) continue;
      const value = t.slice(at + 1).trim().replace(/^['"]|['"]$/g, '');
      if (value) map.set(t.slice(0, at).trim(), value);
    }
  } catch {
    return null;
  }
  return map;
}

const staging = await readEnvFile('.env.staging.local');
if (!staging) {
  console.error('No .env.staging.local. See scripts/staging-setup.mjs for what goes in it.');
  process.exit(1);
}
if (!staging.get('NEXT_PUBLIC_SUPABASE_URL') || !staging.get('SUPABASE_SERVICE_ROLE_KEY')) {
  console.error('.env.staging.local needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const primary = await readEnvFile('.env.local');
const primaryHost = primary?.get('NEXT_PUBLIC_SUPABASE_URL');
if (primaryHost && new URL(primaryHost).hostname === new URL(staging.get('NEXT_PUBLIC_SUPABASE_URL')).hostname) {
  console.error('REFUSING: .env.staging.local names the same Supabase project as .env.local.');
  process.exit(1);
}

// Everything from the staging file, plus placeholders for the third-party
// clients that throw at construction on a missing key. Deliberately fake: a dev
// server aimed at staging must not be able to send a text or an email to a real
// person, and a key that cannot authenticate is a stronger guarantee of that
// than remembering not to click the button.
const env = {
  ...process.env,
  RESEND_API_KEY: 're_staging_dev_placeholder',
  STRIPE_SECRET_KEY: 'sk_test_staging_dev_placeholder',
  TWILIO_ACCOUNT_SID: 'AC00000000000000000000000000000000',
  TWILIO_AUTH_TOKEN: 'staging-dev-placeholder',
};
for (const [key, value] of staging) env[key] = value;
// After the file, not before: the origin has to match the port this server is
// actually listening on, or every link the app builds for itself — magic links
// included — points at the production dev server on 3010.
env.NEXT_PUBLIC_APP_URL = `http://localhost:${PORT}`;

console.log('dev server -> STAGING');
console.log(`  supabase  ${new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname}`);
console.log(`  admins    ${env.ADMIN_EMAILS || '(none — /admin will 404)'}`);
console.log('  email/sms placeholder keys — nothing can be sent from here');
console.log(`\n  http://localhost:${PORT}/admin   (3010 stays production)`);
console.log('  Need a session? node scripts/staging-signin.mjs <your email>\n');

const child = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['next', 'dev', '-p', String(PORT)], {
  cwd: ROOT,
  env,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
child.on('exit', (code) => process.exit(code ?? 0));
