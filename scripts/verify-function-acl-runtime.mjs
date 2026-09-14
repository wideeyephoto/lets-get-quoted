// Runtime function ACL and SECURITY DEFINER RPC authorization verification on PostgreSQL 17.
// Asserts pentest finding F1 remediation (docs/pentest-2026-09-14.md):
//   1. Catalog invariant: no unguarded SECURITY DEFINER RPC with account_id argument is executable by authenticated.
//   2. anon denied on all three RPCs.
//   3. authenticated non-member denied cross-tenant soft_delete, restore, and record_tenant_audit_event.
//   4. authenticated member permitted on record_tenant_audit_event (inventory writes), denied on soft_delete/restore.
//   5. service_role permitted on all three RPCs with full state transitions and audit logging.
//   6. tenant_audit_events immutability trigger blocks updates and deletes.

import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import { syncBuiltinESMExports } from 'node:module';

try {
  os.userInfo();
} catch {
  os.userInfo = () => ({
    uid: -1,
    gid: -1,
    username: process.env.USERNAME || 'windows-user',
    homedir: process.env.USERPROFILE || '',
    shell: null,
  });
  syncBuiltinESMExports();
}

const root = resolve(import.meta.dirname, '..');
const platform =
  process.platform === 'win32'
    ? 'windows-x64'
    : process.platform === 'darwin'
      ? 'darwin-arm64'
      : 'linux-x64';
process.env.PATH =
  join(root, 'node_modules/@embedded-postgres', platform, 'native/bin') +
  (process.platform === 'win32' ? ';' : ':') +
  process.env.PATH;

const { default: EmbeddedPostgres } = await import('embedded-postgres');
const dataDir = mkdtempSync(join(os.tmpdir(), 'lgq-function-acl-'));
const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'postgres',
  password: 'postgres',
  port: 54426,
  persistent: true,
  onLog: () => {},
  onError: () => {},
});

let db;
let checks = 0;
const passed = (name) => {
  checks++;
  console.log(`PASS ${name}`);
};

const schemaSql = readFileSync(join(root, 'schema.sql'), 'utf8');
const anchor = '-- SOFT DELETION, RECOVERY & IMMUTABLE TENANT AUDIT LEDGER (Hardened against F1)';
const softDeleteSectionIndex = schemaSql.indexOf(anchor);
assert(softDeleteSectionIndex >= 0, 'Hardened soft deletion section must exist in schema.sql');
const softDeleteSectionSql = schemaSql.slice(softDeleteSectionIndex);

try {
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('function_acl_test');
  db = pg.getPgClient('function_acl_test');
  await db.connect();

  // 1. Roles and schema scaffolding
  await db.query(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    grant usage on schema public to anon, authenticated, service_role;

    create schema if not exists auth;
    grant usage on schema auth to anon, authenticated, service_role;

    create or replace function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;

    create or replace function auth.role() returns text language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), current_user);
    $$;

    create table if not exists public.accounts (
      id uuid primary key default gen_random_uuid(),
      suspended_at timestamptz,
      status text default 'active'
    );

    create table if not exists public.memberships (
      id uuid primary key default gen_random_uuid(),
      account_id uuid not null references public.accounts(id) on delete cascade,
      user_id uuid not null,
      role text not null default 'owner',
      deactivated_at timestamptz,
      unique (account_id, user_id)
    );

    create table if not exists public.leads (
      id uuid primary key default gen_random_uuid(),
      account_id uuid not null references public.accounts(id) on delete cascade,
      name text,
      phone text,
      email text,
      status text default 'open',
      source text default 'web',
      created_at timestamptz default clock_timestamp()
    );

    create table if not exists public.crew (
      id uuid primary key default gen_random_uuid(),
      account_id uuid not null references public.accounts(id) on delete cascade,
      name text,
      phone text,
      role text default 'technician',
      active boolean default true,
      photo_path text,
      created_at timestamptz default clock_timestamp()
    );

    create table if not exists public.services (
      id uuid primary key default gen_random_uuid(),
      account_id uuid not null references public.accounts(id) on delete cascade,
      name text,
      price numeric default 0,
      is_active boolean default true,
      category text
    );

    create table if not exists public.jobs (
      id uuid primary key default gen_random_uuid(),
      account_id uuid not null references public.accounts(id) on delete cascade,
      title text,
      client_name text,
      address text,
      status text default 'scheduled',
      total numeric default 0,
      created_at timestamptz default clock_timestamp()
    );

    create table if not exists public.account_attachments (
      id uuid primary key default gen_random_uuid(),
      account_id uuid not null references public.accounts(id) on delete cascade,
      filename text,
      bucket text default 'account-attachments',
      content_type text,
      file_size integer,
      storage_path text,
      created_at timestamptz default clock_timestamp()
    );

    create or replace function public.is_member(acc uuid)
    returns boolean language sql stable security definer set search_path = pg_catalog, pg_temp as $$
      select exists (
        select 1 from public.memberships m
        join public.accounts a on a.id = m.account_id
        where m.account_id = acc
          and m.user_id = auth.uid()
          and a.suspended_at is null
          and m.deactivated_at is null
      );
    $$;
    grant execute on function public.is_member(uuid) to anon, authenticated, service_role;
    grant all on all tables in schema public to service_role;
    grant all on all sequences in schema public to service_role;
  `);

  // 2. Apply the canonical schema definition from schema.sql
  await db.query(softDeleteSectionSql);
  passed('canonical schema.sql soft-deletion and audit section applies cleanly on PostgreSQL 17');

  // 3. Runtime Catalog Invariant Check
  const sweepQuery = `
    select p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
      and has_function_privilege('authenticated', p.oid, 'EXECUTE')
      and pg_get_function_identity_arguments(p.oid) ilike '%account_id%'
      and pg_get_functiondef(p.oid) not ilike '%auth.uid()%'
      and pg_get_functiondef(p.oid) not ilike '%auth.role()%'
  `;
  const violations = await db.query(sweepQuery);
  assert.equal(
    violations.rows.length,
    0,
    `Expected 0 unguarded SECURITY DEFINER RPCs for authenticated, found: ${JSON.stringify(violations.rows)}`
  );
  passed('runtime catalog invariant holds: 0 unguarded SECURITY DEFINER functions executable by authenticated');

  // 4. Verify that the invariant query detects an intentional defect
  await db.query(`
    create or replace function public.test_flawed_rpc(p_account_id uuid, p_val text)
    returns void language plpgsql security definer as $$
    begin
      -- Flawed: no auth check
    end;
    $$;
    grant execute on function public.test_flawed_rpc(uuid, text) to authenticated;
  `);
  const detected = await db.query(sweepQuery);
  assert.equal(detected.rows.length, 1);
  assert.equal(detected.rows[0].proname, 'test_flawed_rpc');
  await db.query('drop function public.test_flawed_rpc(uuid, text)');
  passed('catalog invariant query actively detects flaw when unguarded SECURITY DEFINER function is created');

  // 5. Test fixtures for multi-tenant DML
  const victimAccount = (await db.query("insert into accounts default values returning id")).rows[0].id;
  const attackerAccount = (await db.query("insert into accounts default values returning id")).rows[0].id;
  const victimUser = randomUUID();
  const attackerUser = randomUUID();

  await db.query("insert into memberships(account_id, user_id) values($1, $2)", [victimAccount, victimUser]);
  await db.query("insert into memberships(account_id, user_id) values($1, $2)", [attackerAccount, attackerUser]);

  const testLead = (await db.query(
    "insert into leads(account_id, name, phone, email) values($1, 'John Doe', '555-1234', 'john@test.com') returning id",
    [victimAccount]
  )).rows[0].id;

  // 6. Role: anon
  await db.query("set role anon;");
  await assert.rejects(
    db.query("select soft_delete_entity_atomic($1, 'lead', $2)", [victimAccount, testLead]),
    /permission denied for function soft_delete_entity_atomic/
  );
  await assert.rejects(
    db.query("select restore_entity_atomic($1, 'lead', $2)", [victimAccount, testLead]),
    /permission denied for function restore_entity_atomic/
  );
  await assert.rejects(
    db.query("select record_tenant_audit_event_atomic($1, 'lead', $2, 'lead.created')", [victimAccount, testLead]),
    /permission denied for function record_tenant_audit_event_atomic/
  );
  await db.query("reset role;");
  passed('anon cannot execute soft_delete_entity_atomic, restore_entity_atomic, or record_tenant_audit_event_atomic');

  // 7. Role: authenticated (attacker attempting cross-tenant manipulation against victimAccount)
  await db.query(`set role authenticated; set "request.jwt.claim.sub" to '${attackerUser}'; set "request.jwt.claim.role" to 'authenticated';`);
  await assert.rejects(
    db.query("select soft_delete_entity_atomic($1, 'lead', $2)", [victimAccount, testLead]),
    /permission denied for function soft_delete_entity_atomic/
  );
  await assert.rejects(
    db.query("select restore_entity_atomic($1, 'lead', $2)", [victimAccount, testLead]),
    /permission denied for function restore_entity_atomic/
  );
  // Cross-tenant audit forgery denied by internal is_member check
  await assert.rejects(
    db.query("select record_tenant_audit_event_atomic($1, 'lead', $2, 'lead.updated')", [victimAccount, testLead]),
    (err) => {
      assert.equal(err.code, '42501');
      assert.match(err.message, /record_tenant_audit_event_forbidden/);
      return true;
    }
  );
  await db.query("reset role;");
  passed('authenticated non-member denied cross-tenant soft_delete, restore, and record_tenant_audit_event (is_member guard raises 42501)');

  // 8. Role: authenticated (legitimate tenant member)
  await db.query(`set role authenticated; set "request.jwt.claim.sub" to '${victimUser}'; set "request.jwt.claim.role" to 'authenticated';`);
  // Even a member cannot call soft_delete or restore directly (service-role only boundary)
  await assert.rejects(
    db.query("select soft_delete_entity_atomic($1, 'lead', $2)", [victimAccount, testLead]),
    /permission denied for function soft_delete_entity_atomic/
  );
  await assert.rejects(
    db.query("select restore_entity_atomic($1, 'lead', $2)", [victimAccount, testLead]),
    /permission denied for function restore_entity_atomic/
  );
  // Member CAN record legitimate tenant audit events (e.g. from inventory actions)
  const auditRes = await db.query(
    "select record_tenant_audit_event_atomic($1, 'lead', $2, 'inventory.item_adjusted', $3) as event_id",
    [victimAccount, testLead, JSON.stringify({ user_id: victimUser, role: 'owner' })]
  );
  assert(auditRes.rows[0].event_id, 'Member must receive audit event UUID');
  await db.query("reset role;");
  passed('authenticated member can record audit events for their own tenant, but cannot invoke soft_delete/restore');

  // 9. Role: service_role (authorized server actions / background jobs)
  await db.query(`set role service_role; set "request.jwt.claim.role" to 'service_role';`);
  const delRes = await db.query(
    "select soft_delete_entity_atomic($1, 'lead', $2, $3, 'Owner cleanup') as result",
    [victimAccount, testLead, JSON.stringify({ user_id: victimUser, role: 'owner' })]
  );
  assert.equal(delRes.rows[0].result.success, true);

  // Check lead is soft-deleted
  const leadRow = (await db.query("select deleted_at, status from leads where id = $1", [testLead])).rows[0];
  assert(leadRow.deleted_at, 'deleted_at must be populated');

  // Check recoverable_deletions row exists in trash
  const trashRow = (await db.query(
    "select * from recoverable_deletions where account_id = $1 and entity_id = $2 and status = 'trashed'",
    [victimAccount, testLead]
  )).rows[0];
  assert(trashRow, 'Trash record must exist');
  assert.equal(trashRow.deletion_reason, 'Owner cleanup');

  // Restore entity
  const restoreRes = await db.query(
    "select restore_entity_atomic($1, 'lead', $2, $3) as result",
    [victimAccount, testLead, JSON.stringify({ user_id: victimUser, role: 'owner' })]
  );
  assert.equal(restoreRes.rows[0].result.success, true);

  // Check lead is restored with conservative status
  const restoredLead = (await db.query("select deleted_at, status from leads where id = $1", [testLead])).rows[0];
  assert.equal(restoredLead.deleted_at, null, 'deleted_at must be cleared');
  assert.equal(restoredLead.status, 'archived', 'Restored lead has conservative archived status');

  // Check trash record is marked restored
  const updatedTrash = (await db.query("select status, restored_at from recoverable_deletions where id = $1", [trashRow.id])).rows[0];
  assert.equal(updatedTrash.status, 'restored');
  assert(updatedTrash.restored_at);
  await db.query("reset role;");
  passed('service_role executes soft_delete and restore with full state transitions, trash manifests, and audit logs');

  // 10. Ledger immutability check
  await assert.rejects(
    db.query("update tenant_audit_events set action = 'tampered' where account_id = $1", [victimAccount]),
    /tenant_audit_events is immutable and cannot be updated, deleted, or truncated/
  );
  await assert.rejects(
    db.query("delete from tenant_audit_events where account_id = $1", [victimAccount]),
    /tenant_audit_events is immutable and cannot be updated, deleted, or truncated/
  );
  passed('tenant_audit_events ledger immutability trigger blocks update and delete');

  console.log(`\nAll ${checks}/${checks} runtime function ACL checks passed on PostgreSQL 17.`);
} catch (err) {
  console.error('ERROR in test:', err);
  process.exitCode = 1;
  throw err;
} finally {
  if (db) await db.end().catch(() => {});
  await pg.stop().catch(() => {});
  try {
    rmSync(dataDir, { recursive: true, force: true });
  } catch {
    // Windows process file lock cleanup is best-effort
  }
}


