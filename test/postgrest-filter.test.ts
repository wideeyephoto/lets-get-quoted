import { describe, it, expect } from 'vitest';
import { filterValue, ilikeAcross } from '@/lib/postgrest-filter';

describe('PostgREST filter escaping', () => {
  it('quotes a plain term so commas cannot open a new condition', () => {
    // Unescaped, this reads as two conditions: the caller's ilike, and an
    // attacker-chosen status.eq.won.
    const injected = 'a,status.eq.won';
    const built = ilikeAcross(['name'], injected);
    expect(built).toBe('name.ilike."%a,status.eq.won%"');
    // One condition, not two: the comma is inside the quoted value.
    expect(built.split('.ilike.').length - 1).toBe(1);
  });

  it('escapes embedded double quotes so the value cannot be closed early', () => {
    expect(filterValue('say "hi"')).toBe('"say \\"hi\\""');
  });

  it('escapes backslashes before quotes, not after', () => {
    // A naive quote-only escape leaves `\"` readable as an escaped quote.
    expect(filterValue('back\\slash')).toBe('"back\\\\slash"');
    expect(filterValue('trailing\\')).toBe('"trailing\\\\"');
  });

  it('keeps a legitimate search with punctuation working', () => {
    // The reason this escapes rather than strips: real names and addresses
    // contain commas, periods and apostrophes.
    expect(ilikeAcross(['name'], "O'Brien, John")).toBe('name.ilike."%O\'Brien, John%"');
    expect(ilikeAcross(['address'], '12 St. Mary\'s Rd.')).toBe('address.ilike."%12 St. Mary\'s Rd.%"');
  });

  it('builds one condition per column against the same needle', () => {
    expect(ilikeAcross(['name', 'phone', 'address'], 'smith')).toBe(
      'name.ilike."%smith%",phone.ilike."%smith%",address.ilike."%smith%"',
    );
  });

  it('neutralises parentheses, which group conditions in the filter grammar', () => {
    const built = ilikeAcross(['name'], 'x),or(id.eq.1');
    expect(built).toBe('name.ilike."%x),or(id.eq.1%"');
  });
});

describe('client IP derivation', () => {
  const h = (map: Record<string, string>) => ({ get: (n: string) => map[n.toLowerCase()] ?? null });

  it('prefers the platform header a caller cannot set', async () => {
    const { clientIpFrom } = await import('@/lib/rate-limit');
    // A spoofed x-forwarded-for must not win: rotating it would hand the caller
    // a fresh rate-limit bucket on every request.
    expect(clientIpFrom(h({
      'x-vercel-forwarded-for': '203.0.113.9',
      'x-forwarded-for': '1.1.1.1',
    }))).toBe('203.0.113.9');
  });

  it('falls back to x-forwarded-for, then x-real-ip, then a shared bucket', async () => {
    const { clientIpFrom } = await import('@/lib/rate-limit');
    expect(clientIpFrom(h({ 'x-forwarded-for': '198.51.100.4, 10.0.0.1' }))).toBe('198.51.100.4');
    expect(clientIpFrom(h({ 'x-real-ip': '198.51.100.7' }))).toBe('198.51.100.7');
    expect(clientIpFrom(h({}))).toBe('unknown');
  });
});

describe('quick pay session id', () => {
  it('is drawn from a CSPRNG, not Math.random', async () => {
    const { createMobileQuickPaySession } = await import('@/lib/mobile-quick-pay');
    const req = { accountId: 'acc_1', contractorName: 'C', serviceDescription: 'Repair', amountDollars: 120 };
    const ids = new Set(Array.from({ length: 200 }, () => createMobileQuickPaySession(req).sessionId));
    expect(ids.size).toBe(200);
    const [sample] = ids;
    // 18 random bytes as base64url is 24 characters; the old form was four.
    expect(sample!.replace('qpay_', '').length).toBeGreaterThanOrEqual(20);
  });
});
