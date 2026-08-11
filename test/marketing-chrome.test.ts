import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
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

/**
 * ONE NAV LIST, THREE SURFACES.
 *
 * The header, the mobile drawer and the footer all render the same NAV array —
 * which is the whole reason a link can be added in one place and appear in all
 * three. It is also why a regression here is a regression everywhere at once,
 * and why the desktop nav being right proves nothing about the phone: the
 * header's <nav> is display:none below 1024px and the drawer replaces it.
 *
 * Measured at eight widths from 390 to 1440 when Website was added: six items
 * in the header down to 1100, six in the drawer below that, seven in the footer
 * (it appends Sign in), no overlap with the brand or the CTA at any of them.
 */
describe('the marketing nav', () => {
  const CHROME = readFileSync('src/components/flagship/site-chrome.tsx', 'utf8').replace(/\r\n/g, '\n');
  const NAV_BLOCK = CHROME.slice(CHROME.indexOf('const NAV = ['), CHROME.indexOf('] as const;'));
  const entries = [...NAV_BLOCK.matchAll(/\['([^']+)', '([^']+)'\]/g)].map((m) => ({ href: m[1], label: m[2] }));

  it('is one list, not three', () => {
    // Three separate arrays is how the header once said "Product" where the
    // footer said "Features" and the page was titled "Features".
    expect(entries.length).toBeGreaterThan(4);
    expect(CHROME.match(/NAV\.map\(/g)?.length).toBe(3);
  });

  it('carries a website link, and names the destination', () => {
    // Matched on the DESTINATION, not the exact words: the label is marketing
    // copy and has now changed twice ("Website" -> "Website + video" ->
    // "Website"). What must not change silently is that the nav reaches the
    // builder at all, and that the label says what is at the end of it — a nav
    // label names a page, not the feature of it we happen to be pushing.
    const website = entries.find((entry) => entry.href === '/features/website-builder');
    expect(website, 'nothing in NAV reaches the website builder').toBeDefined();
    expect(website?.label).toMatch(/website/i);
  });

  it('points every entry at a route that exists on disk', () => {
    for (const { href, label } of entries) {
      expect(existsSync(`src/app${href}/page.tsx`), `${label} -> ${href}`).toBe(true);
    }
  });

  it('renders that one list in the header, the drawer and the footer', () => {
    expect(CHROME).toContain('<nav aria-label="Main navigation">');
    expect(CHROME).toContain('<div className="site-menu" id="site-menu" hidden={!open}>');
    expect(CHROME).toContain('className="footer-links"');
    // A closed drawer must be out of the tab order, not merely invisible.
    expect(CHROME).toContain('hidden={!open}');
  });
});
