import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { SELLABLE_TOP_UP_IDS } from '@/lib/billing/catalog';

function run(...args: string[]) {
  return spawnSync(process.execPath, ['scripts/seed-stripe-top-up-prices.mjs', ...args], {
    cwd: process.cwd(), encoding: 'utf8', timeout: 10_000,
    env: { ...process.env, STRIPE_SECRET_KEY: '' },
  });
}

describe('preparing named Prices without changing the catalog', () => {
  it('plans only the named SKUs offline with their real amount and cadence', () => {
    const result = run('--prepare-skus=ai_voice_flex,voice_minutes_100', '--dry-run');
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('ai_voice_flex PLAN $69.00 month (100 voice_minutes)');
    expect(result.stdout).toContain('voice_minutes_100 PLAN $35.00 one-time (100 voice_minutes)');
    expect(result.stdout).not.toContain('sales remain withheld');
    expect(result.stdout).not.toContain('office_user');
    expect(SELLABLE_TOP_UP_IDS).toContain('ai_voice_flex');
    expect(SELLABLE_TOP_UP_IDS).toContain('voice_minutes_100');
  });

  it.each(['', 'typo', 'crew_user', 'ai_voice_flex,typo'])(
    'refuses invalid preparation selection %s before loading credentials', (selection) => {
      const result = run(`--prepare-withheld=${selection}`, '--dry-run');
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('Preparation requires a named withheld SKU');
      expect(result.stdout).not.toContain('PLAN');
    },
  );

  it('refuses a misspelled dry-run flag instead of creating live Prices', () => {
    const result = run('--dryrun', '--prepare-withheld=ai_voice_flex');
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Unknown argument');
  });

  it('plans all released SKUs offline', () => {
    const result = run('--dry-run');
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).not.toContain('WITHHELD -');
    expect(result.stdout.match(/ PLAN /g)).toHaveLength(12);
    expect(result.stdout).toContain('No credentials read, no Stripe requests');
  });
});
