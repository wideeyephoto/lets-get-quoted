import { describe, expect, it } from 'vitest';

import {
  OFFICE_NO_ACCESS_PATH,
  OFFICE_ROUTES,
  officeCanOpen,
  officeLandingPath,
  officeRouteFor,
  officeRoutesFor,
} from '@/lib/office-access';
import { OFFICE_CAPABILITY_KEYS } from '@/lib/office-permissions';

/**
 * The opt-in list of dashboard surfaces an office user may open.
 *
 * `requireOwnerContext` has 492 call sites and every one means "owner, nobody
 * else". Nothing about that changes: this map is the allowlist, and a page not
 * named in it is unreachable by omission. These tests are mostly about that
 * default holding in the right direction.
 */
describe('what an office user may open', () => {
  it('names only capabilities that exist', () => {
    // A typo would silently make a route unreachable forever: every() over a
    // capability nobody holds is always false, and nothing else would complain.
    for (const route of OFFICE_ROUTES) {
      for (const capability of route.requires) {
        expect(OFFICE_CAPABILITY_KEYS, `${route.href} needs ${capability}`).toContain(capability);
      }
    }
  });

  it('requires at least one capability per route', () => {
    // An empty `requires` passes every() vacuously, so the route would open for
    // an office user holding nothing at all.
    for (const route of OFFICE_ROUTES) {
      expect(route.requires.length, route.href).toBeGreaterThan(0);
    }
  });

  it('lists only pages whose tables have actually been wired', () => {
    // The map follows the database and never leads it. quotes.read,
    // invoices.read and payments.read are enabled in the catalog, but those
    // tables still carry is_owner policies -- so those pages would render empty
    // with no way for the person to know why.
    expect(OFFICE_ROUTES.map((r) => r.href)).toEqual([
      '/dashboard/leads',
      '/dashboard/clients',
      '/dashboard/jobs',
    ]);
  });

  it('gives jobs both capabilities it actually needs', () => {
    // Jobs name a client on nearly every row. A jobs screen without clients.read
    // is a list of work for nobody, which reads as broken rather than as
    // restricted.
    const jobs = OFFICE_ROUTES.find((r) => r.href === '/dashboard/jobs');
    expect(jobs?.requires).toContain('jobs.read');
    expect(jobs?.requires).toContain('clients.read');
  });
});

describe('matching a path to a route', () => {
  it('matches the page itself and anything beneath it', () => {
    expect(officeRouteFor('/dashboard/leads')?.href).toBe('/dashboard/leads');
    expect(officeRouteFor('/dashboard/leads/42')?.href).toBe('/dashboard/leads');
  });

  it('does not match a lookalike path', () => {
    // The permissive direction is the dangerous one: a startsWith without the
    // separator would make every path with the right prefix reachable.
    expect(officeRouteFor('/dashboard/leadsource')).toBeNull();
    expect(officeRouteFor('/dashboard/leads-archive')).toBeNull();
    expect(officeRouteFor('/dashboard/clientsx')).toBeNull();
  });

  it('returns null for everything not on the list', () => {
    for (const path of [
      '/dashboard',
      '/dashboard/settings',
      '/dashboard/crew',
      '/dashboard/payroll',
      '/dashboard/cash-flow',
      '/dashboard/insights',
      '/dashboard/sites',
    ]) {
      expect(officeRouteFor(path), path).toBeNull();
    }
  });
});

describe('deciding whether this person may open this path', () => {
  const all = ['leads.read', 'clients.read', 'jobs.read'];

  it('opens a route when every required capability is held', () => {
    expect(officeCanOpen('/dashboard/leads', all)).toBe(true);
    expect(officeCanOpen('/dashboard/jobs/9', all)).toBe(true);
  });

  it('refuses when one of two required capabilities is missing', () => {
    // Jobs needs both. Holding jobs.read alone must not be enough, or the
    // second requirement is decorative.
    expect(officeCanOpen('/dashboard/jobs', ['jobs.read'])).toBe(false);
    expect(officeCanOpen('/dashboard/jobs', ['clients.read'])).toBe(false);
    expect(officeCanOpen('/dashboard/jobs', ['jobs.read', 'clients.read'])).toBe(true);
  });

  it('refuses a path that is not on the list even to somebody holding everything', () => {
    // The map is an allowlist, not a filter over capabilities. Holding every
    // capability in the catalog still does not open Settings.
    expect(officeCanOpen('/dashboard/settings', OFFICE_CAPABILITY_KEYS)).toBe(false);
    expect(officeCanOpen('/dashboard/payroll', OFFICE_CAPABILITY_KEYS)).toBe(false);
  });

  it('refuses everything to somebody holding nothing', () => {
    for (const route of OFFICE_ROUTES) {
      expect(officeCanOpen(route.href, []), route.href).toBe(false);
    }
  });
});

describe('where an office user lands', () => {
  it('goes to their first permitted page', () => {
    expect(officeLandingPath(['leads.read', 'clients.read'])).toBe('/dashboard/leads');
    expect(officeLandingPath(['clients.read'])).toBe('/dashboard/clients');
  });

  it('goes to the holding page when they hold nothing that opens anything', () => {
    expect(officeLandingPath([])).toBe(OFFICE_NO_ACCESS_PATH);
    // Holds a real capability, but not one that opens a wired page. The holding
    // page is still the honest answer -- better than a screen that renders empty.
    expect(officeLandingPath(['quotes.read', 'payments.read'])).toBe(OFFICE_NO_ACCESS_PATH);
  });

  it('never lands somebody on a page they cannot open', () => {
    // The property that matters, checked across every subset rather than the
    // three cases above: whatever officeLandingPath returns, officeCanOpen must
    // agree, or the redirect loops.
    const caps = ['leads.read', 'clients.read', 'jobs.read'];
    for (let mask = 0; mask < 8; mask += 1) {
      const held = caps.filter((_, i) => (mask & (1 << i)) !== 0);
      const landing = officeLandingPath(held);
      if (landing === OFFICE_NO_ACCESS_PATH) {
        expect(officeRoutesFor(held), JSON.stringify(held)).toHaveLength(0);
      } else {
        expect(officeCanOpen(landing, held), JSON.stringify(held)).toBe(true);
      }
    }
  });
});
