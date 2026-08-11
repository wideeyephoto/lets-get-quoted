import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * PROOF THAT REFUSES TO BE FAKED.
 *
 * The audit asked for one reusable proof component. The component is here; what
 * it is NOT wired to is the point of this file.
 *
 * There is no real customer to show. All five published sites in the database
 * are test accounts — "My Business", "BIGFATPIPEGUYS", a landscaper whose
 * account is named after a fencing company — and there is no testimonial anyone
 * has given permission to quote.
 *
 * And the eight 2160x1350 product captures sitting in /public/features turned
 * out to be STALE. review-routing.jpg shows a "Reputation & feedback" screen
 * reading "Turn review-gating on in Settings", with 36 happy customers "routed
 * to a public review" and private feedback "kept off Google" — a feature this
 * product has since removed on policy grounds, and one /features/reviews now
 * explicitly promises is impossible. Publishing it as evidence would have put a
 * screenshot advertising review gating directly underneath a headline reading
 * "More reviews, without gaming the reviews."
 *
 * stripe-payments.jpg is not a payments screen either; it is Insights.
 *
 * So the component ships unwired, and these tests hold both lines: the customer
 * slot renders nothing without a story, and the stale captures stay off the
 * pages until somebody re-captures them.
 */

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');
const COMPONENT = read('src', 'components', 'marketing', 'real-proof.tsx');

describe('the customer slot cannot be filled with nothing', () => {
  it('returns null rather than a placeholder', () => {
    // Not a greyed-out card, not "trusted by contractors like you". A page with
    // no proof should look like a page with no proof.
    expect(COMPONENT).toMatch(/if \(!story\) return null;/);
  });

  it('asks for the parts that make a story checkable', () => {
    for (const field of ['business', 'trade', 'siteUrl', 'quote', 'attribution']) {
      expect(COMPONENT, `CustomerStory is missing ${field}`).toMatch(new RegExp(`\\b${field}\\??:`));
    }
  });

  it('makes the measured result optional, because an unmeasured one is not a result', () => {
    expect(COMPONENT).toMatch(/result\?:/);
  });

  it('links the site rather than naming it, since the link is the checkable part', () => {
    expect(COMPONENT).toMatch(/href=\{story\.siteUrl\}/);
    expect(COMPONENT).toContain('rel="noopener noreferrer"');
  });
});

describe('the stale captures are not on any page', () => {
  /** Captures of a previous build. See the file header for what is wrong with them. */
  const STALE = [
    'ai-smart-intake',
    'client-esignature',
    'hosted-website',
    'online-booking',
    'payment-plans',
    'recurring-plans',
    'review-routing',
    'stripe-payments',
  ];

  it('they are still in /public, so re-capturing is a swap and not a hunt', () => {
    for (const name of STALE) {
      expect(existsSync(join(process.cwd(), 'public', 'features', `${name}.jpg`)), name).toBe(true);
    }
  });

  it.each(STALE)('%s.jpg is rendered by no page', (name) => {
    // `/features/<name>.jpg` is the path RealProof builds. A feature ID of the
    // same name lives in lib/features.ts and is not an image reference.
    const pages = ['website-builder', 'ai-intake', 'quotes', 'scheduling', 'client-portal', 'quick-stops', 'crew', 'recurring', 'payments', 'cash-flow', 'reviews', 'back-office'];
    for (const slug of pages) {
      const source = read('src', 'app', 'features', slug, 'page.tsx');
      expect(source, `${slug} renders the stale ${name}`).not.toMatch(new RegExp(`image=["']${name}["']`));
      expect(source, `${slug} references /features/${name}.jpg`).not.toContain(`/features/${name}.jpg`);
    }
  });

  it('the reviews page still says the thing the stale capture contradicts', () => {
    // If this promise ever goes, the capture becomes publishable again — and
    // that would be the wrong reason to publish it.
    const reviews = read('src', 'app', 'features', 'reviews', 'page.tsx');
    expect(reviews).toContain('No review gating');
    expect(reviews).toMatch(/screening by star rating breaks Google/i);
  });
});

describe('the component itself', () => {
  it('does not preload a 2160px capture ahead of the hero', () => {
    // The prop, not the word — the comment above it explains why it is absent.
    expect(COMPONENT).not.toMatch(/^\s*priority\b/m);
    expect(COMPONENT).toContain('sizes=');
  });

  it('reserves the box, so nothing shifts when the capture arrives', () => {
    expect(COMPONENT).toMatch(/width=\{width\}/);
    expect(COMPONENT).toMatch(/height=\{height\}/);
  });

  it('is exported from the marketing barrel, ready to wire', () => {
    const barrel = read('src', 'components', 'marketing', 'index.ts');
    expect(barrel).toContain("export { default as RealProof, CustomerProof } from './real-proof'");
  });
});
