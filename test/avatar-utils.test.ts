import { describe, it, expect } from 'vitest';
import { getClientInitials, getAvatarColor } from '../src/lib/avatar-utils';

describe('Customer Avatar Initials & Deterministic Color Utilities', () => {
  it('extracts two-letter initials from full customer names', () => {
    expect(getClientInitials('John Doe')).toBe('JD');
    expect(getClientInitials('Alice Smith-Johnson')).toBe('AS');
    expect(getClientInitials('Sarah')).toBe('SA');
    expect(getClientInitials('')).toBe('??');
  });

  it('returns deterministic color palettes consistently for the same name', () => {
    const color1 = getAvatarColor('Apex Roofing Co');
    const color2 = getAvatarColor('Apex Roofing Co');
    expect(color1.bg).toBe(color2.bg);
    expect(color1.color).toBe(color2.color);
  });
});
