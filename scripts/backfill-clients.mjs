import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function loadEnvFile() {
  for (const fileName of ['.env.local', '.env']) {
    try {
      const contents = await readFile(resolve(__dirname, '..', fileName), 'utf8');
      for (const line of contents.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const i = trimmed.indexOf('=');
        if (i === -1) continue;
        const key = trimmed.slice(0, i).trim();
        const value = trimmed.slice(i + 1).trim().replace(/^['"]|['"]$/g, '');
        if (key && !process.env[key]) process.env[key] = value;
      }
    } catch {
      // ignore missing files
    }
  }
}

// Mirrors src/lib/phone.ts normalizeUsPhone so backfilled clients dedupe with
// clients created by the app going forward.
function normalizeUsPhone(value) {
  if (!value) return null;
  const digits = String(value).replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

async function main() {
  await loadEnvFile();
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL is not set.');
    process.exit(1);
  }

  const client = new Client({ connectionString });
  await client.connect();

  const totals = { linked: 0, created: 0, skipped: 0 };

  // Find-or-create the client for one contact, dedup by phone then email.
  async function resolveClientId(accountId, name, rawPhone, rawEmail, rawAddress) {
    const phone = normalizeUsPhone(rawPhone);
    const email = (rawEmail || '').trim().toLowerCase() || null;
    const cleanName = (name || '').trim();
    if (!phone && !email && !cleanName) return null;

    if (phone) {
      const { rows } = await client.query('select id from clients where account_id=$1 and phone=$2 limit 1', [accountId, phone]);
      if (rows[0]) return rows[0].id;
    }
    if (email) {
      const { rows } = await client.query('select id from clients where account_id=$1 and email=$2 limit 1', [accountId, email]);
      if (rows[0]) return rows[0].id;
    }
    const { rows } = await client.query(
      'insert into clients (account_id, name, phone, email, address) values ($1,$2,$3,$4,$5) returning id',
      [accountId, cleanName || 'Client', phone, email, (rawAddress || '').trim() || null],
    );
    totals.created++;
    return rows[0].id;
  }

  const { rows: jobs } = await client.query(
    `select id, account_id, client_name, client_phone, client_email, address
     from jobs where client_id is null order by account_id, created_at asc`,
  );
  for (const job of jobs) {
    const clientId = await resolveClientId(job.account_id, job.client_name, job.client_phone, job.client_email, job.address);
    if (!clientId) { totals.skipped++; continue; }
    await client.query('update jobs set client_id=$1 where id=$2', [clientId, job.id]);
    totals.linked++;
  }

  const { rows: leads } = await client.query(
    `select id, account_id, name, phone, email, address
     from leads where client_id is null order by account_id, created_at asc`,
  );
  for (const lead of leads) {
    const clientId = await resolveClientId(lead.account_id, lead.name, lead.phone, lead.email, lead.address);
    if (!clientId) { totals.skipped++; continue; }
    await client.query('update leads set client_id=$1 where id=$2', [clientId, lead.id]);
    totals.linked++;
  }

  console.log(`Backfill complete. Records linked: ${totals.linked}, clients created: ${totals.created}, skipped: ${totals.skipped}.`);
  await client.end();
}

main().catch((error) => {
  console.error('Backfill failed:', error);
  process.exit(1);
});
