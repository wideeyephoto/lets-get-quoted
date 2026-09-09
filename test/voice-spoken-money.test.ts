import { describe, expect, it } from 'vitest';
import { spokenUsd } from '@/lib/voice/spoken-money';

describe('stored USD amounts for voice readback', () => {
  it.each([
    [2300, 'two thousand three hundred dollars'],
    ['2300.00', 'two thousand three hundred dollars'],
    ['1.01', 'one dollar and one cent'],
    ['0.09', 'zero dollars and nine cents'],
    ['21.5', 'twenty one dollars and fifty cents'],
    ['-12.99', 'minus twelve dollars and ninety nine cents'],
    ['-0.00', 'zero dollars'],
    ['1000101.10', 'one million one hundred one dollars and ten cents'],
    ['9999999999.99', 'nine billion nine hundred ninety nine million nine hundred ninety nine thousand nine hundred ninety nine dollars and ninety nine cents'],
  ])('preserves %s as an unambiguous spoken amount', (value, expected) => {
    expect(spokenUsd(value)).toBe(expected);
  });

  it.each([null, undefined, '', ' ', 'NaN', Number.NaN, Infinity, '1e3', '$2300.00', '1.005', 1.005, '90071992547409.92', {}, true])('does not fabricate an amount for %j', value => {
    expect(spokenUsd(value)).toBeNull();
  });
});
