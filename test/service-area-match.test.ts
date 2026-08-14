import { describe, expect, it, vi } from 'vitest';
import { canonicalPlace, matchesServedCity, serviceAreaVerdict } from '@/lib/service-area-match';

describe('Smart Intake service-area matching', () => {
  const cities = ['Maplewood', 'Royal Oak, MI', 'Cedar City'];

  it('normalizes city labels without turning neighboring names into matches', () => {
    expect(canonicalPlace('48067 · Royal Oak, MI')).toBe('royal oak');
    expect(matchesServedCity('Royal Oak, MI', cities)).toBe(true);
    expect(matchesServedCity('Royal Oak MI', cities)).toBe(true);
    expect(matchesServedCity('Royal Oak, MD', cities)).toBe(false);
    expect(matchesServedCity('Oak Park', cities)).toBe(false);
  });

  it('treats a named town as exact published-list membership', async () => {
    await expect(serviceAreaVerdict('Maplewood', cities)).resolves.toBe(true);
    await expect(serviceAreaVerdict('Springfield', cities)).resolves.toBe(false);
  });

  it('resolves a ZIP before comparing it with the published cities', async () => {
    const resolveZip = vi.fn(async () => 'Royal Oak, MI');
    await expect(serviceAreaVerdict('48067', cities, resolveZip)).resolves.toBe(true);
    expect(resolveZip).toHaveBeenCalledWith('48067');
  });

  it('can resolve an address or neighborhood without treating lookup failure as outside', async () => {
    const resolveLocation = vi.fn(async () => 'Royal Oak, MI');
    await expect(serviceAreaVerdict('Woodward and 11 Mile', cities, resolveLocation)).resolves.toBe(true);
    expect(resolveLocation).toHaveBeenCalledWith('Woodward and 11 Mile');
  });

  it('stays unknown when a ZIP cannot be resolved', async () => {
    await expect(serviceAreaVerdict('99999', cities, async () => null)).resolves.toBeNull();
    await expect(serviceAreaVerdict('99999', cities, async () => { throw new Error('lookup failed'); })).resolves.toBeNull();
  });

  it('stays unknown when the contractor has no configured cities', async () => {
    await expect(serviceAreaVerdict('Maplewood', [])).resolves.toBeNull();
  });
});
