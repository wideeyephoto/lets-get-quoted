import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const simulator = readFileSync('src/components/marketing/SmsQuoteSimulator.tsx', 'utf8');
const demoChrome = readFileSync('src/components/demo/DemoChromeShell.tsx', 'utf8');
const page = readFileSync('src/app/demo/sms-quote/page.tsx', 'utf8');

describe('bath-to-shower quote demo', () => {
  it('keeps the lead, scope, quote, and deposit in one scenario', () => {
    expect(simulator).toContain("id: 'bath-to-shower'");
    expect(simulator).toContain('60-inch Low-Threshold Shower Conversion');
    expect(simulator).toContain('Demolition, haul-away & plumbing prep: $1,650');
    expect(simulator).toContain("total: '$8,100.00'");
    expect(simulator).toContain("deposit: '$810.00'");
  });

  it('ships matched before and proposed-after project photos', () => {
    expect(existsSync('public/demo/bath-to-shower/before.png')).toBe(true);
    expect(existsSync('public/demo/bath-to-shower/after.png')).toBe(true);
    expect(simulator).toContain("beforePhoto: '/demo/bath-to-shower/before.png'");
    expect(simulator).toContain("afterPhoto: '/demo/bath-to-shower/after.png'");
  });

  it('renders the marketing simulator without the dashboard demo rail', () => {
    expect(demoChrome).toContain("pathname?.startsWith('/demo/sms-quote')");
    expect(demoChrome).toContain('isTour || isStandaloneSimulator');
    expect(page).toContain('chromeStyles.root');
  });
});
