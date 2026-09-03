import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

describe('Lead Queue Header Source and Sort Popup Toggles', () => {
  it('verifies Sort and Source are organized into a 2-row layout in Lead Queue header', () => {
    const smoothieSrc = readFileSync('src/app/dashboard/leads/LeadSmoothieView.tsx', 'utf8');

    // Toolbar does not have select sort or select source
    expect(smoothieSrc).not.toContain('id="smoothie-sort"');
    expect(smoothieSrc).not.toContain('id="smoothie-channel"');

    // Queue header has 2-row container
    expect(smoothieSrc).toContain('styles.queueHeadTwoRows');
    expect(smoothieSrc).toContain('styles.queueHeadTop');
    expect(smoothieSrc).toContain('styles.queueHeadActions');

    // Source popup toggle in Row 2
    expect(smoothieSrc).toContain('title="Filter leads by source"');
    expect(smoothieSrc).toContain('LEAD_CHANNELS');
    expect(smoothieSrc).toContain('styles.sortMenuLeft');

    // Sort popup toggle in Row 2
    expect(smoothieSrc).toContain('title="Sort leads"');
    expect(smoothieSrc).toContain('styles.sortPopupWrap');
    expect(smoothieSrc).toContain('styles.sortToggleBtn');
    expect(smoothieSrc).toContain('styles.filterIcon');
    expect(smoothieSrc).toContain('styles.sortCurrentLabel');
    expect(smoothieSrc).toContain('aria-haspopup="menu"');

    // Menus
    expect(smoothieSrc).toContain('styles.sortMenu');
    expect(smoothieSrc).toContain('role="menu"');
    expect(smoothieSrc).toContain('styles.sortMenuItem');
    expect(smoothieSrc).toContain('role="menuitemradio"');
  });

  it('verifies smoothie.module.css styles 2-row queueHead, queueHeadTop, and popup menus', () => {
    const css = readFileSync('src/app/dashboard/smoothie.module.css', 'utf8');
    expect(css).toContain('.queueHeadTwoRows');
    expect(css).toContain('.queueHeadTop');
    expect(css).toContain('.queueHeadActions');
    expect(css).toContain('.sortToggleLabelGroup');
    expect(css).toContain('.sortMenuLeft');
    expect(css).toContain('.sortPopupWrap');
    expect(css).toContain('.sortToggleBtn');
    expect(css).toContain('.filterIcon');
    expect(css).toContain('.sortMenu');
    expect(css).toContain('.sortMenuItem');
  });
});
