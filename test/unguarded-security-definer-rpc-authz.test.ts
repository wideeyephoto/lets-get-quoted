import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Pentest finding F1 (docs/pentest-2026-09-14.md):
// soft_delete_entity_atomic, restore_entity_atomic and
// record_tenant_audit_event_atomic are SECURITY DEFINER (RLS-bypassing) writes
// keyed on a caller-supplied p_account_id. They were EXECUTE-able by the
// `authenticated` role with no authorization check, letting any logged-in
// contractor act across tenants over PostgREST.
//
// These are static assertions on the remediation migration, mirroring
// test/database-acl-security.test.ts and
// test/oracle-hardening-and-function-security.test.ts. A stronger runtime ACL
// sweep is documented in the report and SHOULD be added to the pg-backed suite
// (see the SQL at the bottom of this file); a static match on table grants is
// exactly what let F1 through.

describe('F1: unguarded SECURITY DEFINER RPC authorization', () => {
  const migrationPath = resolve(
    process.cwd(),
    'migrations/20260914170000_revoke_and_guard_unguarded_security_definer_rpcs.sql',
  );

  it('the remediation migration exists', () => {
    expect(existsSync(migrationPath)).toBe(true);
  });

  const sql = existsSync(migrationPath)
    ? readFileSync(migrationPath, 'utf8').replace(/\r\n/g, '\n').toLowerCase()
    : '';

  it('revokes execute from anon+authenticated on soft_delete_entity_atomic', () => {
    expect(sql).toMatch(
      /revoke execute on function public\.soft_delete_entity_atomic\([^)]*\)\s*from public, anon, authenticated;/,
    );
    // Not re-granted to authenticated anywhere in the migration.
    expect(sql).not.toMatch(
      /grant execute on function public\.soft_delete_entity_atomic\([^)]*\)[^;]*authenticated/,
    );
  });

  it('revokes execute from anon+authenticated on restore_entity_atomic', () => {
    expect(sql).toMatch(
      /revoke execute on function public\.restore_entity_atomic\([^)]*\)\s*from public, anon, authenticated;/,
    );
    expect(sql).not.toMatch(
      /grant execute on function public\.restore_entity_atomic\([^)]*\)[^;]*authenticated/,
    );
  });

  it('adds an is_member guard to record_tenant_audit_event_atomic (kept for authenticated inventory writes)', () => {
    expect(sql).toContain('create or replace function public.record_tenant_audit_event_atomic');
    expect(sql).toContain("if auth.role() = 'authenticated' and not public.is_member(p_account_id) then");
    expect(sql).toMatch(/raise exception 'record_tenant_audit_event_forbidden'/);
    // Still revoked from anon; still available to the roles the app uses.
    expect(sql).toMatch(
      /revoke execute on function public\.record_tenant_audit_event_atomic\([^)]*\)\s*from public, anon;/,
    );
    expect(sql).toMatch(
      /grant execute on function public\.record_tenant_audit_event_atomic\([^)]*\)\s*to authenticated, service_role;/,
    );
  });

  const schemaPath = resolve(process.cwd(), 'schema.sql');
  const schemaSql = existsSync(schemaPath)
    ? readFileSync(schemaPath, 'utf8').replace(/\r\n/g, '\n').toLowerCase()
    : '';

  it('schema.sql mirrors the remediation: soft_delete revoked, restore revoked, record_tenant_audit_event guarded', () => {
    expect(existsSync(schemaPath)).toBe(true);

    // soft_delete_entity_atomic revoked from public, anon, authenticated
    expect(schemaSql).toMatch(
      /revoke execute on function public\.soft_delete_entity_atomic\([^)]*\)\s*from public, anon, authenticated;/,
    );
    expect(schemaSql).toMatch(
      /grant execute on function public\.soft_delete_entity_atomic\([^)]*\)\s*to service_role;/,
    );

    // restore_entity_atomic revoked from public, anon, authenticated
    expect(schemaSql).toMatch(
      /revoke execute on function public\.restore_entity_atomic\([^)]*\)\s*from public, anon, authenticated;/,
    );
    expect(schemaSql).toMatch(
      /grant execute on function public\.restore_entity_atomic\([^)]*\)\s*to service_role;/,
    );

    // record_tenant_audit_event_atomic has internal is_member check and proper grants
    expect(schemaSql).toContain('create or replace function public.record_tenant_audit_event_atomic');
    expect(schemaSql).toContain("if auth.role() = 'authenticated' and not public.is_member(p_account_id) then");
    expect(schemaSql).toMatch(/raise exception 'record_tenant_audit_event_forbidden'/);
    expect(schemaSql).toMatch(
      /revoke execute on function public\.record_tenant_audit_event_atomic\([^)]*\)\s*from public, anon;/,
    );
    expect(schemaSql).toMatch(
      /grant execute on function public\.record_tenant_audit_event_atomic\([^)]*\)\s*to authenticated, service_role;/,
    );
  });
});


// ---------------------------------------------------------------------------
// RECOMMENDED runtime invariant (add to the pg17-backed suite). Any future
// authenticated-executable SECURITY DEFINER function that takes an account id
// but references no caller-authorization check must fail CI:
//
//   select p.proname
//   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
//   where n.nspname = 'public' and p.prosecdef
//     and has_function_privilege('authenticated', p.oid, 'EXECUTE')
//     and pg_get_function_identity_arguments(p.oid) ilike '%account_id%'
//     and pg_get_functiondef(p.oid) not ilike '%auth.uid()%'
//     and pg_get_functiondef(p.oid) not ilike '%auth.role()%'
//     and pg_get_functiondef(p.oid) not ilike '%is_member%'
//     and pg_get_functiondef(p.oid) not ilike '%is_owner%';
//   -- expected: zero rows
// ---------------------------------------------------------------------------

