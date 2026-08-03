import { describe, expect, it } from 'vitest';
import { getSiteContent, DEFAULT_VIDEOS_NAV_LABEL } from '@/lib/site-content';

describe('the /videos menu link', () => {
  it('is OFF by default, including on sites that used to get it automatically', () => {
    // It used to appear on its own as soon as a clip existed. Losing a nav item
    // nobody chose is a smaller surprise than a menu entry that can't be removed.
    expect(getSiteContent({}).videosPage.navEnabled).toBe(false);
    expect(getSiteContent(null).videosPage.navEnabled).toBe(false);
    expect(getSiteContent({ videosPage: {} }).videosPage.navEnabled).toBe(false);
  });

  it('only turns on for a real true, not any truthy value', () => {
    expect(getSiteContent({ videosPage: { navEnabled: 'yes' } }).videosPage.navEnabled).toBe(false);
    expect(getSiteContent({ videosPage: { navEnabled: 1 } }).videosPage.navEnabled).toBe(false);
    expect(getSiteContent({ videosPage: { navEnabled: true } }).videosPage.navEnabled).toBe(true);
  });

  it('defaults the label to Video Gallery', () => {
    expect(DEFAULT_VIDEOS_NAV_LABEL).toBe('Video Gallery');
    // Stored empty — the render falls back, so an owner who clears the field
    // gets the default back rather than a blank menu item.
    expect(getSiteContent({ videosPage: { navEnabled: true } }).videosPage.navLabel).toBe('');
  });

  it('keeps a renamed label, capped so it cannot break the header', () => {
    expect(getSiteContent({ videosPage: { navLabel: 'Watch our work' } }).videosPage.navLabel)
      .toBe('Watch our work');
    expect(getSiteContent({ videosPage: { navLabel: 'x'.repeat(80) } }).videosPage.navLabel)
      .toHaveLength(24);
  });

  it('survives a garbage blob', () => {
    expect(getSiteContent({ videosPage: 'nope' }).videosPage.navEnabled).toBe(false);
    expect(getSiteContent({ videosPage: [] }).videosPage.navLabel).toBe('');
  });
});
