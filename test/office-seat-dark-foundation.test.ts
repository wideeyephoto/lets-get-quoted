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
