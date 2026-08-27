import { describe, expect, it } from 'vitest';
import { assessImageQuality } from '@/lib/client-photo-quality';

describe('Client-side photo quality assessment', () => {
  it('returns default non-dark/non-blurry for non-image files', async () => {
    const textFile = new File(['hello'], 'document.pdf', { type: 'application/pdf' });
    const result = await assessImageQuality(textFile);
    expect(result.isDark).toBe(false);
    expect(result.isBlurry).toBe(false);
    expect(result.tip).toBeNull();
  });
});
