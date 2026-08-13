import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LAUNCH_DETAIL, LAUNCH_HEADLINE, LAUNCH_LABEL, isLaunchBannerEnabled } from '@/lib/launch-status';
import { OWN_CHROME_MARKETING_ROUTES } from '@/lib/marketing-chrome';

/**
 * The "Coming Summer 2026" notice.
 *
 * Two things are worth a test here and neither is the wording. The first is
 * COVERAGE: this has to be on every public page, and the public site draws its
 * header two different ways — so the assertion is that both ways carry it. The
 * second is CONTAINMENT: it must not appear on a contractor's own website, in
 * the dashboard, or on any link a homeowner was sent, and the easiest way for
 * that to go wrong is somebody adding it to a shared component later.
 */

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n');
const stripJs = (source: string) =>
  source.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const BANNER = stripJs(read('src', 'components', 'marketing', 'launch-banner.tsx'));
const BANNER_CSS = read('src', 'components', 'marketing', 'launch-banner.module.css').replace(/\/\*[\s\S]*?\*\//g, '');
const HEADER_LAYOUT = stripJs(read('src', 'components', 'flagship', 'public-header-layout.tsx'));
const APP_SHELL = stripJs(read('src', 'components', 'app-shell.tsx'));

/** Every page that renders <SiteHeader /> itself rather than through the slot. */
const DIRECT_HEADER_FILES = [
  ['src', 'app', 'features', 'page.tsx'],
  ['src', 'app', 'features-flagship', 'page.tsx'],
  ['src', 'app', 'how-it-works', 'page.tsx'],
  ['src', 'components', 'flagship', 'flagship-home.tsx'],
  ['src', 'components', 'marketing', 'feature-detail-layout.tsx'],
];

const originalFlag = process.env.NEXT_PUBLIC_LAUNCH_BANNER;
afterEach(() => {
  if (originalFlag === undefined) delete process.env.NEXT_PUBLIC_LAUNCH_BANNER;
  else process.env.NEXT_PUBLIC_LAUNCH_BANNER = originalFlag;
});

describe('what the banner says', () => {
  it('names the season and the year', () => {
    expect(LAUNCH_LABEL).toBe('Coming Summer 2026');
    expect(LAUNCH_HEADLINE).toContain('Summer 2026');
  });

  it('names the specific thing that is not connected, rather than being vague', () => {
    // A contractor is deciding whether to run their livelihood on this. "We're
    // polishing things" at this moment reads as something being hidden.
    expect(LAUNCH_DETAIL).toMatch(/text messaging/i);
    expect(LAUNCH_DETAIL).toMatch(/not sending yet/i);
    // And it says what DOES work, or the banner is just a closed sign.
    expect(LAUNCH_DETAIL).toMatch(/everything else is live/i);
  });

  it('never claims a text will be delivered', () => {
    expect(LAUNCH_DETAIL).not.toMatch(/\bwill send\b/i);
  });
});

describe('turning it off', () => {
  it('is on by default, so shipping the flag is not a prerequisite', () => {
    delete process.env.NEXT_PUBLIC_LAUNCH_BANNER;
    expect(isLaunchBannerEnabled()).toBe(true);
  });

  it('goes away on one environment variable', () => {
    process.env.NEXT_PUBLIC_LAUNCH_BANNER = 'off';
    expect(isLaunchBannerEnabled()).toBe(false);
  });

  it('is tied to messaging being connected, not to a date passing', () => {
    // A date comparison would remove the notice on schedule whether or not the
    // sentence it makes had become true.
    const source = read('src', 'lib', 'launch-status.ts');
    expect(source).not.toMatch(/new Date\(/);
    expect(source).toContain('NEXT_PUBLIC_LAUNCH_BANNER');
  });

  it('renders nothing at all when it is off, rather than an empty bar', () => {
    expect(BANNER).toContain('if (!isLaunchBannerEnabled()) return null;');
  });
});

describe('where it appears', () => {
  it('is on every page that mounts the shared public header layout', () => {
    expect(HEADER_LAYOUT).toContain('<LaunchBanner />');
    // After the slot, not inside it: the slot is a fixed-height spacer and
    // anything inside it is clipped.
    expect(HEADER_LAYOUT.indexOf('<SiteHeaderSlot />')).toBeLessThan(HEADER_LAYOUT.indexOf('<LaunchBanner />'));
  });

  it('covers the routes that use that layout', () => {
    // Nine of them, and each is on the own-chrome list. If a route is added to
    // one and not the other it either gets two headers or none.
    for (const route of ['/pricing', '/faq', '/founder', '/contact', '/for', '/security', '/resources']) {
      expect(OWN_CHROME_MARKETING_ROUTES, route).toContain(route);
      expect(read('src', 'app', route.slice(1), 'layout.tsx')).toContain('public-header-layout');
    }
  });

  it('is on every page that renders the header directly, with the offset', () => {
    for (const parts of DIRECT_HEADER_FILES) {
      const source = stripJs(read(...parts));
      expect(source, parts.join('/')).toContain('<LaunchBanner offsetHeader />');
      expect(source, parts.join('/')).toContain("from '@/components/marketing/launch-banner'");
      // Immediately after the header, so it is the first thing under it.
      expect(source.indexOf('<SiteHeader />')).toBeLessThan(source.indexOf('<LaunchBanner offsetHeader />'));
    }
  });

  it('reserves the fixed header’s height only in the direct case', () => {
    // The slot pages already have an 82px spacer; adding another 82 there would
    // be a bar of empty navy nobody could explain.
    expect(BANNER_CSS).toContain('.offsetHeader');
    expect(BANNER_CSS).toMatch(/\.offsetHeader\s*\{\s*margin-top: 82px/);
    expect(BANNER_CSS).toMatch(/max-width: 760px[\s\S]{0,120}margin-top: 68px/);
    expect(HEADER_LAYOUT).not.toContain('offsetHeader');
  });
});

describe('where it must never appear', () => {
  it('is not in the app shell, which is also the chrome on invoices and payment pages', () => {
    // Somebody about to pay a bill does not need to be told the product is
    // unfinished, and saying so there costs the contractor the payment.
    expect(APP_SHELL).not.toContain('LaunchBanner');
  });

  it('is not on a contractor’s own published website', () => {
    // Their site is theirs. Our launch status is not their announcement.
    const templates = read('src', 'lib', 'templates', 'index.ts');
    expect(templates).not.toContain('launch-banner');
    expect(read('src', 'lib', 'templates', 'SiteHeaderUtilityBar.tsx')).not.toContain('LaunchBanner');
  });

  it('is not on the token-bearing pages a homeowner is sent', () => {
    for (const parts of [
      ['src', 'app', 'sub', '[token]', 'page.tsx'],
      ['src', 'app', 'schedule', '[token]', 'page.tsx'],
      ['src', 'app', 'review', '[token]', 'page.tsx'],
    ]) {
      expect(read(...parts), parts.join('/')).not.toContain('LaunchBanner');
    }
  });
});

describe('the banner itself', () => {
  it('is a status, not an alert — it is a standing fact, not something that just happened', () => {
    expect(BANNER).toContain('role="status"');
    expect(BANNER).not.toContain('role="alert"');
  });

  it('has no dismiss control, so it cannot be missed on the one visit that matters', () => {
    expect(BANNER).not.toContain('<button');
    expect(BANNER).not.toContain('onClick');
  });

  it('is a server component — nothing here needs hydrating', () => {
    expect(BANNER).not.toContain("'use client'");
  });

  it('keeps the detail readable on a phone rather than hiding it', () => {
    const mobile = BANNER_CSS.slice(BANNER_CSS.indexOf('@media (max-width: 640px)'));
    expect(mobile).toContain('.detail');
    expect(mobile).not.toMatch(/\.detail\s*\{\s*display: none/);
  });

  it('puts dark ink on the gold badge, which cannot carry light text at AA', () => {
    expect(BANNER_CSS).toMatch(/\.badge[\s\S]{0,240}background: #ffd166/);
    expect(BANNER_CSS).toMatch(/\.badge[\s\S]{0,240}color: #180c02/);
  });
});
