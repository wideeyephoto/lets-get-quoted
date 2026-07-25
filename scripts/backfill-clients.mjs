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

  const { rows: jobs } = await client.query(
    `select id, account_id, client_name, client_phone, client_email, address
     from jobs where client_id is null
     order by account_id, created_at asc`,
  );

  let linked = 0;
  let created = 0;
  let skipped = 0;

  for (const job of jobs) {
    const phone = normalizeUsPhone(job.client_phone);
    const email = (job.client_email || '').trim().toLowerCase() || null;
    const name = (job.client_name || '').trim();
    if (!phone && !email && !name) {
      skipped++;
      continue;
    }

    let clientId = null;
    if (phone) {
      const { rows } = await client.query('select id from clients where account_id=$1 and phone=$2 limit 1', [job.account_id, phone]);
      if (rows[0]) clientId = rows[0].id;
    }
    if (!clientId && email) {
      const { rows } = await client.query('select id from clients where account_id=$1 and email=$2 limit 1', [job.account_id, email]);
      if (rows[0]) clientId = rows[0].id;
    }

    if (!clientId) {
      const { rows } = await client.query(
        'insert into clients (account_id, name, phone, email, address) values ($1,$2,$3,$4,$5) returning id',
        [job.account_id, name || 'Client', phone, email, (job.address || '').trim() || null],
      );
      clientId = rows[0].id;
      created++;
    }

    await client.query('update jobs set client_id=$1 where id=$2', [clientId, job.id]);
    linked++;
  }

  console.log(`Backfill complete. Jobs linked: ${linked}, clients created: ${created}, skipped: ${skipped}.`);
  await client.end();
}

main().catch((error) => {
  console.error('Backfill failed:', error);
  process.exit(1);
});
