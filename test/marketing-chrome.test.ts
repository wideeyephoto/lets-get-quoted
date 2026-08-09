import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isOwnChromeRoute, OWN_CHROME_MARKETING_ROUTES } from '@/lib/marketing-chrome';

/**
 * The homepage is now a marketing page that draws its own header, so '/' is on
 * the own-chrome list. Every other entry on that list also claims its subtree —
 * that is what gives /features its five detail pages — and '/' has no subtree
 * that is not the entire application.
 *
 * Get that wrong and the failure is total and silent: /dashboard, /login and
 * every other route render with no chrome at all, and the homepage, which is
 * the only page anybody would think to check, looks perfect.
 */
describe('isOwnChromeRoute', () => {
  it('claims the homepage', () => {
    expect(isOwnChromeRoute('/')).toBe(true);
  });

  // The whole reason this module exists.
  it('does NOT claim the rest of the application', () => {
    for (const path of [
      '/dashboard',
      '/dashboard/leads',
      '/dashboard/jobs/abc',
      '/login',
      '/welcome',
      '/demo',
      '/client/jobs/token',
      '/site/acme',
      '/admin/accounts',
    ]) {
      expect(isOwnChromeRoute(path), `${path} must keep its chrome`).toBe(false);
    }
  });

  it('claims a listed route and its subtree', () => {
    expect(isOwnChromeRoute('/features')).toBe(true);
    expect(isOwnChromeRoute('/features/website-builder')).toBe(true);
    expect(isOwnChromeRoute('/features/quick-stops')).toBe(true);
  });

  // '/features' must not swallow '/features-flagship' by prefix — they are
  // separate entries on purpose, and the trailing slash is what separates them.
  it('does not let one entry swallow a sibling by prefix', () => {
    expect(OWN_CHROME_MARKETING_ROUTES).toContain('/features-flagship');
    expect(isOwnChromeRoute('/features-flagship')).toBe(true);
    // A route that merely starts with a listed one is not part of it.
    expect(isOwnChromeRoute('/foundering')).toBe(false);
    expect(isOwnChromeRoute('/how-it-works-really')).toBe(false);
  });

  /**
   * The whole public site draws one header now, so every page a visitor can
   * reach from the nav or the footer is on the list. These used to be the
   * shell's job and the shell drew a different bar — see the note beside them
   * in the module.
   */
  it('claims the rest of the public marketing site', () => {
    for (const path of [
      '/for',
      '/for/plumbing',
      '/pricing',
      '/faq',
      '/security',
      '/resources',
      '/resources/how-to-price-a-job',
      '/contact',
      '/privacy',
      '/terms',
      '/sms-terms',
    ]) {
      expect(isOwnChromeRoute(path), `${path} must draw its own header`).toBe(true);
    }
  });

  /**
   * The pairing this whole thing turns on.
   *
   * A route that mounts PublicHeaderLayout draws the site header itself. If it
   * is NOT also on the own-chrome list, AppShell draws its bar too and the page
   * gets two headers; the reverse — on the list, no layout — leaves the page
   * with none. Neither is visible from either file on its own, so read the
   * layouts off disk and check them against the list.
   */
  it('every route that mounts PublicHeaderLayout is on the list', () => {
    const appDir = join(process.cwd(), 'src', 'app');
    const mounted = readdirSync(appDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .filter((entry) => {
        try {
          return readFileSync(join(appDir, entry.name, 'layout.tsx'), 'utf8').includes(
            'public-header-layout',
          );
        } catch {
          return false;
        }
      })
      .map((entry) => `/${entry.name}`);

    // If this is 0 the check has quietly stopped checking anything.
    expect(mounted.length).toBeGreaterThan(5);
    for (const route of mounted) {
      expect(isOwnChromeRoute(route), `${route} mounts the header but is not own-chrome`).toBe(true);
    }
  });

  it('leaves the homepage candidates that still want the shell alone', () => {
    // /home-next is deliberately absent — it renders inside the app chrome.
    expect(isOwnChromeRoute('/home-next')).toBe(false);
    expect(isOwnChromeRoute('/home-compare')).toBe(false);
  });

  it('claims the previous homepage and the remaining candidates', () => {
    expect(isOwnChromeRoute('/home-classic')).toBe(true);
    expect(isOwnChromeRoute('/home-editorial')).toBe(true);
    expect(isOwnChromeRoute('/home-compact')).toBe(true);
  });
});
