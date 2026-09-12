import { describe, it, expect } from 'vitest';
import { SOCIAL_ICON_GLYPHS } from '@/lib/templates/social-icons.data';

describe('Social Icons Data', () => {
  it('loads icons', () => {
    expect(SOCIAL_ICON_GLYPHS).toBeDefined();
    expect(SOCIAL_ICON_GLYPHS.facebook).toBeDefined();
    expect(SOCIAL_ICON_GLYPHS.website).toBeDefined();
  });
});
