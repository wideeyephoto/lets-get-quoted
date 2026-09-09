import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Tests for Phase 4: Welcome site reveal routing & priority rules.
 *
 * Traps guarded:
 * - A reveal that intercepts planCheckoutPath is a reveal that eats a purchase.
 * - An account with an unwritten site must never be shown an empty template.
 */

describe('Welcome Site Reveal Destination Logic', () => {
  function resolvePostFirstRunRoute({
    planCheckoutPath,
    destinationPath,
    seeded,
  }: {
    planCheckoutPath: string | null;
    destinationPath: string | null;
    seeded: { ok: boolean; built: boolean };
  }): string {
    return (
      planCheckoutPath ??
      destinationPath ??
      (seeded.ok && seeded.built ? '/welcome/site' : '/dashboard/sites')
    );
  }

  it('plan checkout strictly wins over the reveal', () => {
    const route = resolvePostFirstRunRoute({
      planCheckoutPath: '/checkout/growth-annual',
      destinationPath: null,
      seeded: { ok: true, built: true },
    });
    expect(route).toBe('/checkout/growth-annual');
  });

  it('feature/goal destination strictly wins over the reveal', () => {
    const route = resolvePostFirstRunRoute({
      planCheckoutPath: null,
      destinationPath: '/dashboard/quick-stops',
      seeded: { ok: true, built: true },
    });
    expect(route).toBe('/dashboard/quick-stops');
  });

  it('default path with a successful build routes to the reveal (/welcome/site)', () => {
    const route = resolvePostFirstRunRoute({
      planCheckoutPath: null,
      destinationPath: null,
      seeded: { ok: true, built: true },
    });
    expect(route).toBe('/welcome/site');
  });

  it('failed or unbuilt seed routes straight to builder (/dashboard/sites)', () => {
    const routeFailed = resolvePostFirstRunRoute({
      planCheckoutPath: null,
      destinationPath: null,
      seeded: { ok: false, built: false },
    });
    expect(routeFailed).toBe('/dashboard/sites');

    const routeAlreadyWritten = resolvePostFirstRunRoute({
      planCheckoutPath: null,
      destinationPath: null,
      seeded: { ok: true, built: false },
    });
    expect(routeAlreadyWritten).toBe('/dashboard/sites');
  });

  it('WelcomeForm source code strictly enforces this exact evaluation order', () => {
    const formCode = readFileSync('src/app/welcome/WelcomeForm.tsx', 'utf8');
    expect(formCode).toMatch(
      /result\.planCheckoutPath\s*\?\?\s*result\.destinationPath\s*\?\?\s*\(seeded\.ok\s*&&\s*seeded\.built\s*\?\s*['"]\/welcome\/site['"]\s*:\s*['"]\/dashboard\/sites['"]\)/,
    );
  });

  it('site reveal page redirects unwritten site to builder', () => {
    const pageCode = readFileSync('src/app/welcome/site/page.tsx', 'utf8');
    expect(pageCode).toContain('siteIsUnwritten(site)');
    expect(pageCode).toContain("redirect('/dashboard/sites')");
  });
});
