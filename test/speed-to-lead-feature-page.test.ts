import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { metadata } from '@/app/features/speed-to-lead/page';
import { FOOTER_PRIMARY } from '@/components/marketing/footer-nav';

const read = (path: string) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
const strip = (source: string) =>
  source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

describe('speed-to-lead feature page & simulator integrity', () => {
  const pagePath = 'src/app/features/speed-to-lead/page.tsx';
  const simulatorPath = 'src/components/marketing/SpeedToLeadSimulator.tsx';
  const etaPagePath = 'src/app/features/eta/page.tsx';
  const sitemapPath = 'src/app/sitemap.ts';
  const catalogExplorerPath = 'src/app/features/FeaturesCatalogExplorer.tsx';
  const registerPath = 'docs/ftc-substantiation-register.md';

  it('1. declares correct canonical metadata, OpenGraph, and title', () => {
    expect(metadata.title).toContain('Speed-to-Lead');
    expect(metadata.alternates?.canonical).toBe('https://letsgetquoted.com/features/speed-to-lead');
    expect(metadata.openGraph?.url).toBe('https://letsgetquoted.com/features/speed-to-lead');
    expect(metadata.openGraph?.images).toBeDefined();
    expect(metadata.twitter?.images).toBeDefined();
  });

  it('2. page copy grounds response speed, TCPA quiet hours, and voice call bridge in product code', () => {
    const pageContent = strip(read(pagePath));

    // Response speed claims
    expect(pageContent).toMatch(/sub-60|under 60 seconds/i);
    expect(pageContent).toMatch(/12[–-]30\s*s/i);

    // Multi-jurisdiction quiet hours and state statutes
    expect(pageContent).toMatch(/quiet hours/i);
    expect(pageContent).toMatch(/8:00\s*AM/i);
    expect(pageContent).toMatch(/8:?00\s*PM/i);
    expect(pageContent).toMatch(/Florida\s+FTSA|Oklahoma\s+OTA|Maryland/i);

    // Voice bridge
    expect(pageContent).toMatch(/voice (?:call )?bridge/i);
    expect(pageContent).toMatch(/press 1 to connect/i);
  });

  it('3. simulator component imports and utilizes real functions from @/lib/ad-speed-to-lead', () => {
    const simContent = read(simulatorPath);

    expect(simContent).toMatch(/from\s+['"]@\/lib\/ad-speed-to-lead(-shared)?['"]/);
    expect(simContent).toContain('generateSpeedToLeadSms');
    expect(simContent).toContain('resolveRecipientTimeZoneWithSource');
    expect(simContent).toContain('getJurisdictionTcpaRules');
    expect(simContent).toContain('isWithinTcpaQuietHours');
    expect(simContent).toContain('getTcpaCompliantSendTime');
  });

  it('4. prohibits unqualified 100% deliverability claims adhering to FTC rules', () => {
    const pageContent = strip(read(pagePath));

    expect(pageContent).not.toMatch(/100%\s+deliverability/i);
    expect(pageContent).not.toMatch(/guarantee[ds]?\s+100%\s+delivery/i);
  });

  it('5. surfaces speed-to-lead and live-eta in FOOTER_PRIMARY', () => {
    const stlEntry = FOOTER_PRIMARY.find(([href]) => href === '/features/speed-to-lead');
    const etaEntry = FOOTER_PRIMARY.find(([href]) => href === '/features/live-eta');

    expect(stlEntry).toBeDefined();
    expect(stlEntry?.[1]).toBe('Speed-to-Lead');

    expect(etaEntry).toBeDefined();
    expect(etaEntry?.[1]).toBe('Live ETA');
  });

  it('6. includes speed-to-lead in XML sitemap FEATURE_SLUGS', () => {
    const sitemapContent = read(sitemapPath);
    expect(sitemapContent).toContain("'speed-to-lead'");
  });

  it('7. FeaturesCatalogExplorer deep links speed-to-lead-sms to /features/speed-to-lead', () => {
    const explorerContent = read(catalogExplorerPath);
    expect(explorerContent).toContain("'speed-to-lead-sms': '/features/speed-to-lead'");
    expect(explorerContent).toContain("'live-eta': '/features/live-eta'");
  });

  it('8. every internal href on /features/speed-to-lead resolves to a valid route on disk', () => {
    const pageContent = strip(read(pagePath));
    const simContent = read(simulatorPath);

    const hrefMatches = [...pageContent.matchAll(/href=["'](\/[^"']+|#[^"']+)["']/g)].map((m) => m[1]);

    for (const href of hrefMatches) {
      if (href.startsWith('#')) {
        const anchorId = href.slice(1);
        const hasAnchor = pageContent.includes(`id="${anchorId}"`) || simContent.includes(`id="${anchorId}"`);
        expect(hasAnchor, `Anchor ${href} not found in page or simulator`).toBe(true);
      } else {
        const cleanRoute = href.split('?')[0].split('#')[0];
        const routePath = join(process.cwd(), 'src', 'app', cleanRoute, 'page.tsx');
        expect(existsSync(routePath), `Route ${href} does not exist at ${routePath}`).toBe(true);
      }
    }
  });

  it('9. /features/eta companion route exists and points to /features/live-eta', () => {
    expect(existsSync(etaPagePath)).toBe(true);
    const etaContent = read(etaPagePath);
    expect(etaContent).toContain('LiveEtaFeaturePage');
    expect(etaContent).toContain('https://letsgetquoted.com/features/live-eta');
  });

  it('10. CLM-010 in FTC register lists /features/speed-to-lead in its Surface column', () => {
    const registerContent = read(registerPath);
    const clm010Line = registerContent.split('\n').find((line) => line.includes('CLM-010'));

    expect(clm010Line).toBeDefined();
    expect(clm010Line).toContain('/features/speed-to-lead');
  });
});
