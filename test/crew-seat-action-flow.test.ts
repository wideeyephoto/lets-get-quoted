import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n');
const ACTIONS = read('src', 'app', 'dashboard', 'crew', 'actions.ts');
const DRAWER = read('src', 'app', 'dashboard', 'crew', 'AddCrewDrawer.tsx');
const ROSTER = read('src', 'app', 'dashboard', 'crew', 'CrewRoster.tsx');
const GATE = read('src', 'lib', 'billing', 'crew-seat-entitlement.ts');
const ENV = read('.env.example');

describe('crew-seat server action flow', () => {
  it('is dark and server-only by default', () => {
    expect(ENV).toContain('LGQ_CREW_SEAT_ENTITLEMENT_GATE_ENABLED=0');
    expect(GATE).toContain("import 'server-only'");
    expect(GATE).toContain("env[CREW_SEAT_ENTITLEMENT_FLAG] === '1'");
    expect(ENV).not.toContain('NEXT_PUBLIC_LGQ_CREW_SEAT');
    expect(ACTIONS).not.toContain('NEXT_PUBLIC_LGQ_CREW_SEAT');
  });

  it('routes add/reactivation through the selector without changing other crew writes', () => {
    expect(ACTIONS).toContain('createCrewMemberForSeatGate(supabase, createAdminClient, accountId');
    expect(ACTIONS).toContain('setCrewActiveForSeatGate(supabase, createAdminClient, accountId, crewId, active)');
    expect(ACTIONS).toContain('await updateCrewMember(supabase, accountId, crewId');
    expect(ACTIONS).toContain('await deleteArchivedCrewMember(supabase, accountId, crewId)');
  });

  it('returns the gate sentence into the existing accessible drawer error', () => {
    expect(ACTIONS).toContain("status: 'error'");
    expect(ACTIONS).toContain("error instanceof Error ? error.message : 'That crew member could not be saved. Try again.'");
    expect(DRAWER).toContain("state.status === 'error'");
    expect(DRAWER).toContain('role="alert"');
    expect(DRAWER).toContain('{state.message}');
  });

  it('keeps a reactivation refusal out of the opaque Server Action error boundary', () => {
    const actionStart = ACTIONS.indexOf('export async function setCrewActiveAction(');
    const ownerContext = ACTIONS.indexOf('await requireOwnerContext()', actionStart);
    const mutationTry = ACTIONS.indexOf('try {', ownerContext);

    expect(actionStart).toBeGreaterThan(-1);
    // requireOwnerContext redirects by throwing a Next sentinel. It must stay
    // outside the catch that turns an entitlement refusal into form state.
    expect(ownerContext).toBeGreaterThan(actionStart);
    expect(ownerContext).toBeLessThan(mutationTry);
    expect(ACTIONS).toContain("console.error('setCrewActiveAction failed:', error)");
    expect(ACTIONS).toContain("status: 'error'");
    expect(ACTIONS).toContain("error instanceof Error ? error.message : 'That crew member could not be updated. Try again.'");
    expect(ROSTER).toContain('useFormState(action, CREW_ACTIVE_ACTION_IDLE)');
    expect(ROSTER).toContain("state.status === 'error'");
    expect(ROSTER).toContain('className={styles.crewActiveError} role="alert"');
    expect(ROSTER.match(/<CrewActiveForm row=\{row\} surface="(?:menu|drawer)" \/>/g)).toHaveLength(2);
  });
});
