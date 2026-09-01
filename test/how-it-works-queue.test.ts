import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');

const stripJs = (src: string) =>
  src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const PAGE = stripJs(read('src/app/how-it-works/page.tsx'));
const SHOWCASE = stripJs(read('src/app/how-it-works/workflow-showcase.tsx'));
const NAV = stripJs(read('src/app/how-it-works/section-nav.tsx'));

describe('how-it-works page structure and metadata', () => {
  it('renders standard SEO metadata with canonical and title', () => {
    expect(PAGE).toContain("canonical: 'https://letsgetquoted.com/how-it-works'");
    expect(PAGE).toContain("title: { absolute: titleWithBrand('How It Works — Website Request to Paid Job') }");
  });

  it('includes section navigation with expected sections', () => {
    expect(PAGE).toContain("id: 'workflow'");
    expect(PAGE).toContain("id: 'control'");
    expect(PAGE).toContain("id: 'field'");
    expect(PAGE).toContain("id: 'automations'");
    expect(PAGE).toContain("id: 'faq'");
  });

  it('renders the 5 connected workflow stages in the showcase component', () => {
    const stageNumbers = [...SHOWCASE.matchAll(/number:\s*'(\d+)'/g)].map((m) => m[1]);
    expect(stageNumbers).toEqual(['01', '02', '03', '04', '05']);

    const stageNavs = [...SHOWCASE.matchAll(/nav:\s*'([^']+)'/g)].map((m) => m[1]);
    expect(stageNavs).toEqual(['Website', 'Smart Intake', 'Quote & deposit', 'Schedule & run', 'Invoice & pay']);
  });

  it('provides deep links from each showcase stage to relevant product features', () => {
    const targets = [
      '/features/website-builder',
      '/features/ai-intake',
      '/features/quotes',
      '/features/scheduling',
      '/features/payments',
    ];
    for (const href of targets) {
      expect(SHOWCASE).toContain(`href: '${href}'`);
    }
  });

  it('renders automations rail and related feature links', () => {
    expect(PAGE).toContain('AUTOMATIONS');
    expect(PAGE).toContain('RELATED_FEATURES');
    expect(PAGE).toContain('FAQS');
    expect(PAGE).toContain('/features/quick-stops');
    expect(PAGE).toContain('/features/recurring');
    expect(PAGE).toContain('/features/reviews');
    expect(PAGE).toContain('/features/cash-flow');
  });

  it('renders final CTA and pricing summary', () => {
    expect(PAGE).toContain('PUBLIC_PRICING_SUMMARY');
    expect(PAGE).toContain('Build my free website');
    expect(PAGE).toContain('Explore the live demo');
  });
});
