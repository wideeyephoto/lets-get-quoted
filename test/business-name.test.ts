import { describe, it, expect } from 'vitest';
import { BUSINESS_NAME_FALLBACK, pickBusinessName } from '@/lib/business-name';
import { PLACEHOLDER_BUSINESS_NAME } from '@/lib/terms';

// A business name lives in two columns and only one of them is maintained.
// accounts.business_name is written once at signup as "My Business"; every
// rename after that lands in sites.company_name. On the live database every
// account still reads "My Business" — so any code path that trusted the account
// column introduced a contractor to their own customer under a placeholder.
//
// These are the rules that stop that happening again.

describe('pickBusinessName', () => {
  it('prefers the site, because that is the name the owner maintains', () => {
    expect(pickBusinessName({ company_name: 'BrokePipes' }, { business_name: 'Something Old' })).toBe('BrokePipes');
  });

  it('treats the signup placeholder as absent wherever it appears', () => {
    // This is the whole bug in one assertion: the account column is populated,
    // and populated with a value nobody chose.
    expect(pickBusinessName({ company_name: 'BrokePipes' }, { business_name: PLACEHOLDER_BUSINESS_NAME })).toBe('BrokePipes');
    expect(pickBusinessName({ company_name: PLACEHOLDER_BUSINESS_NAME }, { business_name: 'BrokePipes' })).toBe('BrokePipes');
    expect(pickBusinessName({ company_name: PLACEHOLDER_BUSINESS_NAME }, { business_name: PLACEHOLDER_BUSINESS_NAME }))
      .toBe(BUSINESS_NAME_FALLBACK);
  });

  it('falls back to the account only when the site has nothing usable', () => {
    expect(pickBusinessName({ company_name: '' }, { business_name: 'BrokePipes' })).toBe('BrokePipes');
    expect(pickBusinessName({ company_name: '   ' }, { business_name: 'BrokePipes' })).toBe('BrokePipes');
    expect(pickBusinessName(null, { business_name: 'BrokePipes' })).toBe('BrokePipes');
    expect(pickBusinessName(undefined, { business_name: 'BrokePipes' })).toBe('BrokePipes');
  });

  it('never names Let’s Get Quoted when it knows nothing', () => {
    // A homeowner reading a text about their own appointment should see the
    // contractor they hired or a neutral word — never the software that sent it.
    for (const empty of [null, undefined, { company_name: null }, { company_name: '' }]) {
      const name = pickBusinessName(empty, null);
      expect(name, JSON.stringify(empty)).toBe('Your contractor');
      expect(name).not.toMatch(/Let/i);
    }
  });

  it('lets a caller pick the wording that fits the sentence', () => {
    // "we couldn't reach your contractor" reads wrong mid-sentence; some callers
    // want "your business" or lowercase.
    expect(pickBusinessName(null, null, 'your business')).toBe('your business');
    expect(pickBusinessName({ company_name: 'BrokePipes' }, null, 'your business')).toBe('BrokePipes');
  });

  it('trims, because a trailing space is not a name', () => {
    expect(pickBusinessName({ company_name: '  BrokePipes  ' }, null)).toBe('BrokePipes');
  });
});
