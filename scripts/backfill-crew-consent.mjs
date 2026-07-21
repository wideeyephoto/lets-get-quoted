import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

// One-time backfill: seed a baseline opted-in sms_consent row for every active
// crew member's phone, so a later STOP has a row to flip. Idempotent — uses
// insert-if-absent (ignoreDuplicates), so it never overwrites an existing row
// (a prior opt-out is preserved) and is safe to re-run. New/edited crew get a
// baseline automatically via ensureSmsConsentBaseline; this covers crew that
// existed before that wiring. Run: node scripts/backfill-crew-consent.mjs

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

// Mirrors normalizeUsPhone in src/lib/phone.ts — must match how consent rows
// and the Twilio STOP handler store numbers, or the backfill won't line up.
function normalizeUsPhone(value) {
  const raw = String(value ?? '');
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (raw.trim().startsWith('+') && digits.length >= 10 && digits.length <= 15) return `+${digits}`;
  return null;
}

await loadEnv();

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: crew, error } = await admin.from('crew').select('account_id, phone').eq('active', true);
if (error) throw error;

let processed = 0;
let skipped = 0;
const now = new Date().toISOString();

for (const member of crew ?? []) {
  const normalized = normalizeUsPhone(member.phone);
  if (!normalized) {
    skipped += 1;
    continue;
  }
  const { error: upsertError } = await admin.from('sms_consent').upsert(
    {
      account_id: member.account_id,
      phone_number: normalized,
      status: 'opted_in',
      source: 'crew_backfill',
      consented_at: now,
      updated_at: now,
    },
    { onConflict: 'account_id,phone_number', ignoreDuplicates: true },
  );
  if (upsertError) {
    console.error(`Failed for account ${member.account_id} / ${normalized}:`, upsertError.message);
    continue;
  }
  processed += 1;
}

console.log(`Crew consent backfill complete: ${processed} active crew processed, ${skipped} skipped (unparseable phone).`);
