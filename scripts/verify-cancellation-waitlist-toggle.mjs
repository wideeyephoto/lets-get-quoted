import { readFile } from 'node:fs/promises';
import { Client } from 'pg';

for (const line of (await readFile('.env.local', 'utf8')).split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith('#') || !t.includes('=')) continue;
  const i = t.indexOf('=');
  const k = t.slice(0, i).trim();
  if (!process.env[k]) process.env[k] = t.slice(i + 1).trim().replace(/^['"]|['"]$/g, '');
}

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

// 1. Check column existence and default value
const colRes = await client.query(`
  select column_name, data_type, column_default, is_nullable
  from information_schema.columns
  where table_name = 'accounts' and column_name = 'cancellation_waitlist_enabled'
`);

if (colRes.rows.length === 0) {
  console.error('FAIL: cancellation_waitlist_enabled column does not exist on accounts');
  process.exit(1);
}

console.log('Column details:', colRes.rows[0]);

// 2. Check accounts table rows to verify default is false
const accRes = await client.query(`
  select id, business_name, cancellation_waitlist_enabled
  from accounts
  limit 5
`);

console.log(`Sample accounts (${accRes.rows.length}):`);
for (const row of accRes.rows) {
  console.log(`- ${row.id} (${row.business_name ?? 'unnamed'}): cancellation_waitlist_enabled = ${row.cancellation_waitlist_enabled}`);
  if (row.cancellation_waitlist_enabled !== false) {
    console.error(`FAIL: expected false default, got ${row.cancellation_waitlist_enabled}`);
    process.exit(1);
  }
}

await client.end();
console.log('SUCCESS: cancellation_waitlist_enabled is present and defaults to false.');
