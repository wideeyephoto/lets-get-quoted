import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const reel = readFileSync('src/components/demo/BathToShowerReel.tsx', 'utf8');
const reelPage = readFileSync('src/app/demo/reel/bath-to-shower/page.tsx', 'utf8');
const demoChrome = readFileSync('src/components/demo/DemoChromeShell.tsx', 'utf8');

describe('bath-to-shower vertical reel', () => {
  it('tells the complete five-scene lead-to-booked story', () => {
    expect(reel).toContain('data-reel-scene="lead-arrival"');
    expect(reel).toContain('data-reel-scene="contractor-scope"');
    expect(reel).toContain('data-reel-scene="quote-builder"');
    expect(reel).toContain('data-reel-scene="customer-preview"');
    expect(reel).toContain('data-reel-scene="deposit-booked"');
  });

  it('keeps the project pricing consistent from quote through deposit', () => {
    expect(reel).toContain("price: '$1,650'");
    expect(reel).toContain("price: '$2,950'");
    expect(reel).toContain("price: '$3,500'");
    expect(reel).toContain('$8,100');
    expect(reel).toContain('$810 received');
  });

  it('uses the matched project imagery and deterministic capture controls', () => {
    expect(existsSync('public/demo/bath-to-shower/before.png')).toBe(true);
    expect(existsSync('public/demo/bath-to-shower/after.png')).toBe(true);
    expect(reel).toContain("const BEFORE_IMAGE = '/demo/bath-to-shower/before.png'");
    expect(reel).toContain("const AFTER_IMAGE = '/demo/bath-to-shower/after.png'");
    expect(reelPage).toContain("searchParams?.autoplay");
    expect(reelPage).toContain("searchParams?.scene");
  });

  it('renders without the dashboard demo chrome', () => {
    expect(demoChrome).toContain("pathname?.startsWith('/demo/reel')");
    expect(demoChrome).toContain('isStandaloneReel');
  });
});
