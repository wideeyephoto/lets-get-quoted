import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function read(...parts: string[]): string {
  return readFileSync(join(process.cwd(), ...parts), 'utf8');
}

describe('office-seat foundation stays dark', () => {
  it('documents an exact-off default and all activation blockers', () => {
    const env = read('.env.example');
    const docs = read('docs', 'office-seat-activation.md');

    expect(env).toContain('LGQ_OFFICE_SEAT_ENTITLEMENT_GATE_ENABLED=0');
    expect(docs).toContain('invitation creation, expiry, acceptance, resend, and cancellation');
    expect(docs).toContain('full owner authority or narrower');
    expect(docs).toContain('removal, suspension, and any reactivation lifecycle');
    expect(docs).toContain('promoting an existing crew membership');
    expect(docs).toContain('one-owner-workspace-per-user database constraint');
    expect(docs).toContain('last-owner rule');
    expect(docs).toContain('revoked from `public`, `anon`, `authenticated`, and `service_role`');
    expect(docs).toContain('separate activation migration');
  });

  it('does not wire the RPC into existing owner bootstrap or crew linking', () => {
    const auth = read('src', 'lib', 'auth.ts');
    const crewAuth = read('src', 'lib', 'crew-auth.ts');
    const rpc = 'create_office_user_membership_with_seat_entitlement';

    expect(auth).not.toContain('office-seat-entitlement');
    expect(auth).not.toContain(rpc);
    expect(auth).toContain("role: 'owner'");
    expect(auth).toContain("admin.from('memberships').insert");
    expect(crewAuth).not.toContain('office-seat-entitlement');
    expect(crewAuth).not.toContain(rpc);
    expect(crewAuth).toContain("role: 'crew'");
  });
});

describe('office users are their own role, not a second owner', () => {
  // The collision this fixes is demonstrated end to end against a real
  // PostgreSQL 17 by scripts/verify-office-seat-collision.mjs (npm run
  // test:pg17:office-collision). These assertions are the cheap half: they run
  // in the default suite and catch a migration edited back toward the old shape.
  const enumMigration = () => read('migrations', '20260819090000_office_role_value.sql');
  const roleMigration = () => read('migrations', '20260819090100_office_seat_uses_office_role.sql');

  it('adds the enum value in a file of its own', () => {
    const sql = enumMigration();
    expect(sql).toContain("add value if not exists 'office'");
    // PostgreSQL refuses to let the adding transaction USE the new label, so a
    // combined migration fails at apply time with production half-changed.
    // Nothing else may join this file.
    expect(sql).not.toMatch(/create (or replace )?(function|index|table|trigger)/i);
    expect(sql).not.toMatch(/^s*begin;/mi);
  });

  it('refuses to apply before the enum value exists', () => {
    expect(roleMigration()).toContain('Apply 20260819090000_office_role_value.sql first');
  });

  it('creates office users as office, and counts them alongside owners', () => {
    const sql = roleMigration();
    expect(sql).toContain("values (p_account_id, p_user_id, 'office')");
    expect(sql).toContain("and m.role in ('owner', 'office')");
    // The founder still occupies a seat. Changing that silently makes every
    // plan one seat more generous, which is pricing, not a fix.
    expect(sql).toContain('intentionally not excluded');
  });

  it('leaves is_owner() alone, because 63 policies mean it', () => {
    const sql = roleMigration();
    expect(sql).not.toMatch(/create (or replace )?function public.is_owner/i);
    // The superset predicate exists so opening a surface is one line in one
    // place -- but it must not arrive already wired to anything.
    expect(sql).toContain('create or replace function public.has_office_access');
    expect(sql).not.toMatch(/create policy[sS]*has_office_access/i);
  });

  it('still grants the seat RPC to nobody, and proves it before committing', () => {
    const sql = roleMigration();
    expect(sql).toContain(
      'revoke all on function public.create_office_user_membership_with_seat_entitlement(uuid, uuid)',
    );
    expect(sql).not.toMatch(
      /grant execute on function public.create_office_user_membership_with_seat_entitlement/i,
    );
    expect(sql).toContain('seat RPC is reachable by:');
  });

  it('stops a workspace being left with no owner', () => {
    const sql = roleMigration();
    expect(sql).toContain('workspace_requires_one_owner');
    expect(sql).toContain('create trigger guard_last_owner_trigger');
    expect(sql).toContain('before delete or update on public.memberships');
    // Closing the business must still work: the cascade arrives after the
    // parent row is gone, which is how the guard tells the two apart.
    expect(sql).toContain('select 1 from public.accounts a where a.id = old.account_id');
  });

  it('records the correction where the next person will look for it', () => {
    const docs = read('docs', 'office-seat-activation.md');
    expect(docs).toContain('this foundation cannot function as built');
    expect(docs).toContain('It is every invitation, in one');
    expect(docs).toContain('scripts/verify-office-seat-collision.mjs');
  });
});
