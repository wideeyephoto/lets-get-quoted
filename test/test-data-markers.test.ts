import { describe, it, expect } from 'vitest';
import { looksLikeTestRecord, testRecordMarker } from '@/lib/test-data-markers';

describe('testRecordMarker — the three markers the delete script already trusts', () => {
  it('catches an @example.com address, whatever its case', () => {
    expect(testRecordMarker({ email: 'me@example.com' })).toBe('example.com email');
    expect(testRecordMarker({ email: '  Owner@EXAMPLE.COM ' })).toBe('example.com email');
  });

  it('leaves a real address alone, including one that merely mentions example', () => {
    expect(testRecordMarker({ email: 'damon@pryceplumbing.com' })).toBeNull();
    // Not the reserved domain — a real company that happens to be called this.
    expect(testRecordMarker({ email: 'sales@exampleworks.com' })).toBeNull();
  });

  it('catches the 555 exchange in any formatting', () => {
    expect(testRecordMarker({ phone: '(248) 555-0143' })).toBe('555 phone number');
    expect(testRecordMarker({ phone: '+1 248 555 0143' })).toBe('555 phone number');
    expect(testRecordMarker({ phone: '5550143' })).toBe('555 phone number');
  });

  it('does not condemn a real number that happens to contain 555', () => {
    // The rule is the EXCHANGE — digits four to six — not the digits appearing
    // somewhere. A contractor whose line ends 5551 is a real contractor.
    expect(testRecordMarker({ phone: '(313) 925-5551' })).toBeNull();
    expect(testRecordMarker({ phone: '555-248-0143' })).toBeNull();
  });

  it('catches the seeded job reference prefix and nothing else', () => {
    expect(testRecordMarker({ ref: 'J-DEMO-4' })).toBe('demo job reference');
    expect(testRecordMarker({ ref: 'j-demo-12' })).toBe('demo job reference');
    expect(testRecordMarker({ ref: 'J-1031' })).toBeNull();
  });
});

describe('testRecordMarker — placeholder names, and everything they must not catch', () => {
  it('catches a name that is nothing but placeholder', () => {
    expect(testRecordMarker({ name: 'Test' })).toBe('placeholder name');
    expect(testRecordMarker({ name: 'test test' })).toBe('placeholder name');
    expect(testRecordMarker({ name: 'Test User' })).toBe('placeholder name');
    expect(testRecordMarker({ name: 'Demo Customer' })).toBe('placeholder name');
    expect(testRecordMarker({ name: 'asdf' })).toBe('placeholder name');
    expect(testRecordMarker({ name: 'John Doe' })).toBe('placeholder name');
  });

  it('LEAVES ALONE a real person whose surname is Test', () => {
    // The whole reason the rule is "every token is placeholder or filler"
    // rather than "contains the word test". Test is a surname; so is Demo in
    // some spellings, and a customer losing their place in the owner's own
    // history is a worse failure than a test row surviving.
    expect(testRecordMarker({ name: 'Damon Test' })).toBeNull();
    expect(testRecordMarker({ name: 'Marie Demo' })).toBeNull();
    expect(testRecordMarker({ name: 'Test Valley Roofing' })).toBeNull();
  });

  it('leaves alone names that merely contain a placeholder inside a word', () => {
    // Whole words only.
    expect(testRecordMarker({ name: 'Testa' })).toBeNull();
    expect(testRecordMarker({ name: 'Protest Plumbing' })).toBeNull();
    expect(testRecordMarker({ name: 'Demolition Bros' })).toBeNull();
    expect(testRecordMarker({ name: 'Sampleton Heating' })).toBeNull();
  });

  it('never reads the description, where "test" is ordinary trade English', () => {
    // There is no field for it: only name, email, phone and ref are inspected,
    // so "test the sump pump before the rain" can never be a marker.
    expect(looksLikeTestRecord({ name: 'Marion Alcott' })).toBe(false);
  });

  it('needs an actual placeholder word, not just filler', () => {
    // Otherwise every business named after its initials disappears.
    expect(testRecordMarker({ name: 'ABC' })).toBeNull();
    expect(testRecordMarker({ name: 'ABC Plumbing' })).toBeNull();
    expect(testRecordMarker({ name: 'The Client Co' })).toBeNull();
  });

  it('is not fooled by shape alone', () => {
    // A short or unusual name is not evidence of anything.
    expect(testRecordMarker({ name: 'Ng' })).toBeNull();
    expect(testRecordMarker({ name: '1' })).toBeNull();
    expect(testRecordMarker({ name: 'X' })).toBeNull();
  });

  it('treats empty and missing fields as real', () => {
    expect(testRecordMarker({})).toBeNull();
    expect(testRecordMarker({ name: '', email: null, phone: undefined, ref: null })).toBeNull();
    expect(looksLikeTestRecord({ name: '   ' })).toBe(false);
  });
});

describe('looksLikeTestRecord', () => {
  it('is the marker as a boolean', () => {
    expect(looksLikeTestRecord({ email: 'me@example.com' })).toBe(true);
    expect(looksLikeTestRecord({ name: 'Damon Pryce', email: 'damon@pryce.com', phone: '(248) 300-0143', ref: 'J-1031' })).toBe(false);
  });

  it('checks the fields in a fixed order so the reason is stable', () => {
    // A row can carry two markers. The email is reported because it is the one
    // an owner can act on — the phone might be a real 555 in a test market.
    expect(testRecordMarker({ email: 'me@example.com', phone: '(248) 555-0143' })).toBe('example.com email');
  });
});
