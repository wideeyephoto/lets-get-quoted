// Read-only hosted catalog verification for the AI Voice provisioning and
// staff step-up migrations. No rows are created or changed.

import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const migrationNames = [
  '20260903231235_ai_voice_number_provisioning.sql',
  '20260903232815_voice_staff_step_up_authorization.sql',
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function loadEnvFile() {
  for (const fileName of ['.env.local', '.env']) {
    try {
      const contents = await readFile(resolve(scriptDir, '..', fileName), 'utf8');
      for (const line of contents.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const separator = trimmed.indexOf('=');
        if (separator === -1) continue;
        const key = trimmed.slice(0, separator).trim();
        const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '');
        if (key && !process.env[key]) process.env[key] = value;
      }
    } catch {
      // Continue to the next supported environment file.
    }
  }
}

const migrations = await Promise.all(migrationNames.map((name) =>
  readFile(resolve(scriptDir, '..', 'migrations', name), 'utf8')));
const migrationSql = migrations.join('\n').replace(/\r\n/g, '\n');
const expectedTables = [...migrationSql.matchAll(
  /create table if not exists public\.([a-z0-9_]+)/gi,
)].map((match) => match[1]);
const expectedIndexes = [...migrationSql.matchAll(
  /create (?:unique )?index if not exists ([a-z0-9_]+)/gi,
)].map((match) => match[1]);
const expectedServiceRpcs = [...migrationSql.matchAll(
  /grant execute on function\s+(public\.[^(;]+\([^;]+?\))\s+to service_role;/gis,
)].map((match) => match[1].replace(/\s+/g, ''));
const expectedServiceReadTables = new Set([...migrationSql.matchAll(
  /grant select on table public\.([a-z0-9_]+) to service_role;/gi,
)].map((match) => match[1]));

assert(expectedTables.length === 11, `Expected 11 protected tables in migration source, found ${expectedTables.length}.`);
assert(expectedIndexes.length >= 25, `Expected at least 25 migration indexes, found ${expectedIndexes.length}.`);
assert(expectedServiceRpcs.length >= 25, `Expected at least 25 service RPC grants, found ${expectedServiceRpcs.length}.`);

await loadEnvFile();
assert(process.env.DATABASE_URL, 'DATABASE_URL is not set.');

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

try {
  await client.query("set statement_timeout = '20s'");
  await client.query('begin transaction read only');

  const { rows: [server] } = await client.query('show server_version');
  const { rows: tables } = await client.query(`
    select c.relname, c.relrowsecurity, c.relforcerowsecurity
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname = any($1::text[])
       and c.relkind = 'r'
     order by c.relname
  `, [expectedTables]);
  assert(tables.length === expectedTables.length,
    `Expected ${expectedTables.length} hosted tables, found ${tables.length}.`);
  assert(tables.every((row) => row.relrowsecurity && row.relforcerowsecurity),
    'One or more AI Voice tables are not protected by enabled and forced RLS.');

  const directPrivileges = [];
  for (const table of expectedTables) {
    for (const role of ['service_role', 'anon', 'authenticated']) {
      for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) {
        const { rows: [row] } = await client.query(
          'select pg_catalog.has_table_privilege($1, $2, $3) as allowed',
          [role, `public.${table}`, privilege],
        );
        const isExpectedRead = role === 'service_role'
          && privilege === 'SELECT'
          && expectedServiceReadTables.has(table);
        if (row.allowed && !isExpectedRead) directPrivileges.push(`${role}:${table}:${privilege}`);
        if (!row.allowed && isExpectedRead) directPrivileges.push(`missing:${role}:${table}:${privilege}`);
      }
    }
  }
  assert(directPrivileges.length === 0,
    `Unexpected direct table privileges: ${directPrivileges.join(', ')}.`);

  const { rows: indexes } = await client.query(`
    select c.relname
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind = 'i'
       and c.relname = any($1::text[])
  `, [expectedIndexes]);
  assert(indexes.length === expectedIndexes.length,
    `Expected ${expectedIndexes.length} hosted indexes, found ${indexes.length}.`);

  for (const signature of expectedServiceRpcs) {
    const { rows: [row] } = await client.query(`
      select
        pg_catalog.to_regprocedure($1) is not null as exists,
        pg_catalog.has_function_privilege('service_role', $1, 'EXECUTE') as service_allowed,
        pg_catalog.has_function_privilege('anon', $1, 'EXECUTE') as anon_allowed,
        pg_catalog.has_function_privilege('authenticated', $1, 'EXECUTE') as authenticated_allowed
    `, [signature]);
    assert(row.exists, `Hosted RPC is missing: ${signature}.`);
    assert(row.service_allowed, `service_role lacks EXECUTE on ${signature}.`);
    assert(!row.anon_allowed && !row.authenticated_allowed,
      `A browser role can execute ${signature}.`);
  }

  const { rows: [counts] } = await client.query(`
    select
      (select pg_catalog.count(*)::integer from public.voice_number_inventory) as inventory_rows,
      (select pg_catalog.count(*)::integer from public.voice_number_purchase_authorizations) as purchase_authorizations,
      (select pg_catalog.count(*)::integer from public.voice_staff_step_up_challenges) as step_up_challenges
  `);

  await client.query('commit');
  console.log(`PASS  hosted AI Voice release catalog on PostgreSQL ${server.server_version}`);
  console.log(`PASS  ${expectedTables.length}/${expectedTables.length} tables force RLS; browser writes/reads and service writes denied`);
  console.log(`PASS  ${expectedIndexes.length}/${expectedIndexes.length} migration indexes present`);
  console.log(`PASS  ${expectedServiceRpcs.length}/${expectedServiceRpcs.length} service-only RPC grants`);
  console.log(`INFO  voice inventory rows: ${counts.inventory_rows}`);
  console.log(`INFO  purchase authorizations: ${counts.purchase_authorizations}`);
  console.log(`INFO  staff step-up challenges: ${counts.step_up_challenges}`);
} catch (error) {
  await client.query('rollback').catch(() => undefined);
  throw error;
} finally {
  await client.end();
}
