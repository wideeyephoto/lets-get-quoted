import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  TRACKING_LINK_HOURS,
  LOCATION_SHARE_MINUTES,
  ARRIVAL_GEOFENCE_METERS,
  ARRIVAL_WINDOW_CHOICES,
} from '@/lib/arrival';

/**
 * Gate for /features/live-eta and LiveEtaDemo.tsx.
 *
 * Asserts the marketing page and interactive demo against the actual product code
 * in @/lib/arrival to ensure zero marketing fiction or claim drift.
 */

const read = (path: string) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
const strip = (source: string) =>
  source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

describe('live-eta feature page & demo integrity', () => {
  const pagePath = 'src/app/features/live-eta/page.tsx';
  const demoPath = 'src/components/marketing/LiveEtaDemo.tsx';
  const crewPath = 'src/app/features/crew/page.tsx';
  const registerPath = 'docs/ftc-substantiation-register.md';

  it('1. durations and limits on the page and demo match arrival constants', () => {
    expect(TRACKING_LINK_HOURS).toBe(4);
    expect(LOCATION_SHARE_MINUTES).toBe(90);
    expect(ARRIVAL_GEOFENCE_METERS).toBe(150);
    expect(ARRIVAL_WINDOW_CHOICES).toEqual([30, 45, 60, 90]);

    const pageContent = strip(read(pagePath));
    const demoContent = strip(read(demoPath));

    // Page copy mentions 4 hours, 90 minutes, and 30, 45, 60 or 90
    expect(pageContent).toMatch(/four hours/i);
    expect(pageContent).toMatch(/90[- ]minute/i);
    expect(pageContent).toMatch(/30,\s*45,\s*60\s*(?:or\s*)?90\s*mins?/i);

    // Demo component directly references the exported constants
    expect(demoContent).toContain('TRACKING_LINK_HOURS');
    expect(demoContent).toContain('LOCATION_SHARE_MINUTES');
    expect(demoContent).toContain('ARRIVAL_GEOFENCE_METERS');
    expect(demoContent).toContain('ARRIVAL_WINDOW_CHOICES');
  });

  it('2. demo component imports from @/lib/arrival and contains no fictional hardcoded outputs', () => {
    const demoContent = read(demoPath);

    // Imports pure functions from @/lib/arrival
    expect(demoContent).toMatch(/from\s+['"]@\/lib\/arrival['"]/);
    expect(demoContent).toContain('arrivalWindowTimes');
    expect(demoContent).toContain('formatArrivalWindow');
    expect(demoContent).toContain('recalculateLiveArrivalTimes');
    expect(demoContent).toContain('buildArrivalMessage');
    expect(demoContent).toContain('applyPrecision');
    expect(demoContent).toContain('locationVisible');

    // Asserts no hardcoded fictional output strings
    expect(demoContent).not.toContain('"40.713, -74.006"');
    expect(demoContent).not.toContain("'40.713, -74.006'");
    expect(demoContent).not.toContain('"2:15 PM"');
    expect(demoContent).not.toContain("'2:15 PM'");
    expect(demoContent).not.toContain('"Marcus is on the way"');
    expect(demoContent).not.toContain("'Marcus is on the way'");
  });

  it('3. page copy never claims traffic awareness without fallback qualification', () => {
    const pageContent = strip(read(pagePath));

    // If the page mentions traffic, it must explicitly mention fallback estimation
    if (/traffic/i.test(pageContent)) {
      expect(pageContent).toMatch(/falls back to a straight-line estimate/i);
    }

    // Prohibit bare unqualified "traffic-aware" or "real-time traffic guarantees"
    expect(pageContent).not.toMatch(/100%\s+traffic/i);
    expect(pageContent).not.toMatch(/guaranteed\s+traffic/i);
  });

  it('4. page never claims background tracking, all-day location, or exact address pins', () => {
    const pageContent = strip(read(pagePath));

    // Must explicitly deny all-day tracking and background tracking
    expect(pageContent).toMatch(/no background location|foreground only/i);
    expect(pageContent).toMatch(/without tracking crew all day|nobody is being tracked all day|does my crew get tracked all day\?\s*no/i);

    // Must specify street-level or approximate (~100m) coordinates rather than exact
    expect(pageContent).toMatch(/~100\s*m(?:eters)?|street level|approximate/i);
    expect(pageContent).toMatch(/rather than an exact (?:parking spot|home number)/i);
    expect(pageContent).not.toMatch(/exact\s+(?:address|gps)\s+pin/i);
    expect(pageContent).not.toMatch(/all-day\s+(?:gps|location)\s+tracking/i);
  });

  it('5. every internal href on /features/live-eta resolves to a valid route on disk', () => {
    const pageContent = strip(read(pagePath));
    const demoContent = strip(read(demoPath));

    // Find all internal hrefs in page
    const hrefMatches = [...pageContent.matchAll(/href=["'](\/[^"']+|#[^"']+)["']/g)].map((m) => m[1]);

    for (const href of hrefMatches) {
      if (href.startsWith('#')) {
        // Anchor should exist in page or demo
        const anchorId = href.slice(1);
        const hasAnchor = pageContent.includes(`id="${anchorId}"`) || demoContent.includes(`id="${anchorId}"`);
        expect(hasAnchor, `Anchor ${href} not found in page or demo`).toBe(true);
      } else {
        // Route should exist on disk
        const cleanRoute = href.split('?')[0].split('#')[0];
        const routePath = join(process.cwd(), 'src', 'app', cleanRoute, 'page.tsx');
        expect(existsSync(routePath), `Route ${href} does not exist at ${routePath}`).toBe(true);
      }
    }

    // Demo tracking URL route resolves to src/app/track/[token]/page.tsx
    const trackRoute = join(process.cwd(), 'src', 'app', 'track', '[token]', 'page.tsx');
    expect(existsSync(trackRoute)).toBe(true);
  });

  it('6. CLM-012 in the FTC substantiation register lists /features/live-eta in its Surface column', () => {
    const registerContent = read(registerPath);
    const clm012Line = registerContent.split('\n').find((line) => line.includes('CLM-012'));

    expect(clm012Line).toBeDefined();
    expect(clm012Line).toContain('/features/live-eta');
  });

  it('7. /features/crew FAQ cross-links directly to /features/live-eta', () => {
    const crewContent = strip(read(crewPath));

    expect(crewContent).toMatch(/href=["']\/features\/live-eta["']/);
    expect(crewContent).toContain('Live ETA sharing has its own page.');
  });
});
