// Read-only production verification for the AI Voice contractor-dispatch
// migration. This checks the hosted catalog and authorization surface without
// creating an admission, action, lead, job, or usage record.

import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

const scriptDir = dirname(fileURLToPath(import.meta.url));

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

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

await loadEnvFile();
assert(process.env.DATABASE_URL, 'DATABASE_URL is not set.');

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

try {
  await client.query("set statement_timeout = '15s'");
  await client.query('begin transaction read only');

  const { rows: [server] } = await client.query('show server_version');
  const { rows: columns } = await client.query(`
    select table_name, column_name
      from information_schema.columns
     where table_schema = 'public'
       and (table_name, column_name) in (
         ('crew', 'phone_verified'),
         ('crew', 'phone_verified_at'),
         ('crew', 'updated_at'),
         ('voice_call_admissions', 'caller_number'),
         ('voice_call_admissions', 'caller_kind'),
         ('leads', 'source_voice_provider_call_id'),
         ('leads', 'source_voice_action_id'),
         ('jobs', 'source_voice_provider_call_id')
       )
     order by table_name, column_name
  `);
  assert(columns.length === 8, `Expected 8 migration columns, found ${columns.length}.`);

  const { rows: constraints } = await client.query(`
    select c.conname, c.convalidated
      from pg_catalog.pg_constraint c
     where c.conrelid in (
       'public.crew'::pg_catalog.regclass,
       'public.voice_call_admissions'::pg_catalog.regclass,
       'public.leads'::pg_catalog.regclass,
       'public.jobs'::pg_catalog.regclass,
       'public.job_feed'::pg_catalog.regclass
     )
       and c.conname = any($1::text[])
     order by c.conname
  `, [[
    'crew_phone_verification_shape',
    'voice_call_admissions_caller_number_shape',
    'voice_call_admissions_caller_kind_shape',
    'leads_voice_provider_call_shape',
    'jobs_voice_provider_call_shape',
    'leads_voice_provider_call_unique',
    'jobs_voice_provider_call_unique',
       'leads_source_voice_action_id_fkey',
  ]]);
  assert(constraints.length === 8, `Expected 8 migration constraints, found ${constraints.length}.`);
  assert(constraints.every((row) => row.convalidated), 'One or more migration constraints are not validated.');

  const { rows: [security] } = await client.query(`
    select
      c.relrowsecurity,
      c.relforcerowsecurity,
      pg_catalog.has_function_privilege(
        'service_role',
        'public.apply_voice_contractor_action(uuid,text,text,text,uuid,uuid,jsonb)',
        'EXECUTE'
      ) as service_action_rpc,
      pg_catalog.has_function_privilege(
        'anon',
        'public.apply_voice_contractor_action(uuid,text,text,text,uuid,uuid,jsonb)',
        'EXECUTE'
      ) as anon_action_rpc,
      pg_catalog.has_function_privilege(
        'authenticated',
        'public.apply_voice_contractor_action(uuid,text,text,text,uuid,uuid,jsonb)',
        'EXECUTE'
      ) as authenticated_action_rpc,
      pg_catalog.has_function_privilege(
        'service_role',
        'public.claim_voice_call_admission_v2(uuid,text,text,integer,text,text)',
        'EXECUTE'
      ) as service_admission_rpc,
      pg_catalog.has_function_privilege(
        'anon',
        'public.claim_voice_call_admission_v2(uuid,text,text,integer,text,text)',
        'EXECUTE'
      ) as anon_admission_rpc,
      pg_catalog.has_function_privilege(
        'authenticated',
        'public.claim_voice_call_admission_v2(uuid,text,text,integer,text,text)',
        'EXECUTE'
      ) as authenticated_admission_rpc,
      pg_catalog.has_table_privilege('service_role', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') as service_table_any,
      pg_catalog.has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') as anon_table_any,
      pg_catalog.has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') as authenticated_table_any
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'voice_tool_actions'
  `);
  assert(security, 'voice_tool_actions is missing.');
  assert(security.relrowsecurity && security.relforcerowsecurity, 'voice_tool_actions is not force-RLS protected.');
  assert(security.service_action_rpc && security.service_admission_rpc, 'service_role lacks a required voice RPC grant.');
  assert(!security.anon_action_rpc && !security.authenticated_action_rpc, 'A browser role can invoke the contractor-action RPC.');
  assert(!security.anon_admission_rpc && !security.authenticated_admission_rpc, 'A browser role can invoke the admission RPC.');
  assert(!security.service_table_any && !security.anon_table_any && !security.authenticated_table_any, 'A non-owner role has direct voice_tool_actions table privileges.');

  const { rows: [counts] } = await client.query(`
    select
      (select pg_catalog.count(*)::integer from public.voice_tool_actions) as existing_actions,
      (select pg_catalog.count(*)::integer from public.crew
        where active = true and deleted_at is null and access_revoked_at is null
          and (phone_verified is not true or phone_verified_at is null)) as active_unverified_crew,
      (select pg_catalog.count(*)::integer from public.voice_call_admissions
        where admission_state = 'admitted'
          and admitted_at >= pg_catalog.now() - interval '15 minutes') as recent_active_admissions
  `);

  await client.query('commit');
  console.log(`PASS  hosted voice dispatch catalog on PostgreSQL ${server.server_version}`);
  console.log('PASS  8/8 columns and 8/8 validated constraints');
  console.log('PASS  RPC-only mutation surface with force RLS and no direct role grants');
  console.log(`INFO  existing action rows: ${counts.existing_actions}`);
  console.log(`INFO  active crew requiring phone re-verification: ${counts.active_unverified_crew}`);
  console.log(`INFO  admitted calls in the last 15 minutes: ${counts.recent_active_admissions}`);
} catch (error) {
  await client.query('rollback').catch(() => undefined);
  throw error;
} finally {
  await client.end();
}
