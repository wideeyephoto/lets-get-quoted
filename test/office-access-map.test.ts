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
      '/dashboard/schedule',
      '/dashboard/messages',
      '/dashboard/crew',
      '/dashboard/recurring',
      '/dashboard/services',
      '/dashboard/reviews',
      '/dashboard/rebook',
      '/dashboard/cash-flow',
      '/dashboard/reports',
      '/dashboard/insights',
      '/dashboard/settings',
      '/dashboard/automations',
      '/dashboard/sites',
      '/dashboard/quick-stops',
      '/dashboard/marketing',
      '/dashboard/import',
      '/dashboard/help',
      '/dashboard/voice-calls',
    ]);
  });

  it('lists only pages whose GUARD has actually been converted', () => {
    // THE OTHER HALF, and the one that turns a redirect loop into a test
    // failure. officeLandingPath SENDS people to these routes, so a page here
    // that still calls requireOwnerContext bounces them to /office-access, which
    // sends them straight back.
    //
    // Today that is avoided only by accident -- leads is first and every office
    // user holds leads.read, because capabilities are global and all thirteen are
    // enabled. This makes it structural instead.
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const { join } = require('node:path') as typeof import('node:path');
    for (const route of OFFICE_ROUTES) {
      const page = join(process.cwd(), 'src/app', route.href.replace('/dashboard', 'dashboard'), 'page.tsx');
      const source = readFileSync(page, 'utf8');
      expect(source, `${route.href} is on the list but its page never asks requireOfficeContext`)
        .toContain('requireOfficeContext(');
    }
  });

  it('asks for every capability a route actually needs', () => {
    // Leads reads only leads. When jobs is added it will need BOTH jobs.read and
    // clients.read -- jobs name a client on nearly every row, so a jobs screen
    // without clients.read is a list of work for nobody, which reads as broken
    // rather than as restricted. Asserted for whatever is on the list, so the
    // rule survives the list changing.
    const leads = OFFICE_ROUTES.find((r) => r.href === '/dashboard/leads');
    expect(leads?.requires).toEqual(['leads.read']);
    const jobs = OFFICE_ROUTES.find((r) => r.href === '/dashboard/jobs');
    if (jobs) {
      expect(jobs.requires).toContain('jobs.read');
      expect(jobs.requires).toContain('clients.read');
    }
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
      '/dashboard/payroll',
      '/dashboard/integrations',
      '/dashboard/stripe-merchant',
      '/dashboard/stripe-return',
    ]) {
      expect(officeRouteFor(path), path).toBeNull();
    }
  });
});

describe('deciding whether this person may open this path', () => {
  const all = ['leads.read', 'clients.read', 'jobs.read'];

  it('opens a route when every required capability is held', () => {
    expect(officeCanOpen('/dashboard/leads', all)).toBe(true);
    expect(officeCanOpen('/dashboard/leads/9', all)).toBe(true);
  });

  it('refuses a route when missing required capabilities', () => {
    // Clients requires clients.read, jobs requires jobs.read AND clients.read.
    expect(officeCanOpen('/dashboard/clients', ['leads.read'])).toBe(false);
    expect(officeCanOpen('/dashboard/jobs', ['leads.read'])).toBe(false);
    expect(officeCanOpen('/dashboard/jobs', ['jobs.read'])).toBe(false);
    expect(officeCanOpen('/dashboard/clients', all)).toBe(true);
    expect(officeCanOpen('/dashboard/jobs', all)).toBe(true);
  });

  it('needs EVERY capability a route names, not just one', () => {
    // Asserted against the routes actually on the list, so this keeps biting as
    // multi-capability routes are added. Every route must refuse a holder of all
    // but one of its requirements.
    for (const route of OFFICE_ROUTES) {
      for (const missing of route.requires) {
        const held = route.requires.filter((c) => c !== missing);
        expect(officeCanOpen(route.href, held), `${route.href} without ${missing}`).toBe(false);
      }
      expect(officeCanOpen(route.href, route.requires), route.href).toBe(true);
    }
  });

  it('refuses a path that is not on the list even to somebody holding everything', () => {
    // The map is an allowlist, not a filter over capabilities. Holding every
    // capability in the catalog still does not open unmapped pages.
    expect(officeCanOpen('/dashboard/payroll', OFFICE_CAPABILITY_KEYS)).toBe(false);
    expect(officeCanOpen('/dashboard/integrations', OFFICE_CAPABILITY_KEYS)).toBe(false);
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
    expect(officeLandingPath(['jobs.read', 'clients.read'])).toBe('/dashboard/clients');
  });

  it('never sends somebody to a page that would bounce them back', () => {
    // Holding only schedule.write opens nothing because schedule also requires jobs.read
    expect(officeLandingPath(['schedule.write'])).toBe('/office-access');
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
