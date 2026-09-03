import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

describe('Customer Queue Header Sort Popup Toggle', () => {
  it('verifies Sort is moved from toolbar into Customer Queue header', () => {
    const smoothieSrc = readFileSync('src/app/dashboard/clients/ClientSmoothieView.tsx', 'utf8');

    // Toolbar does not have select sort
    expect(smoothieSrc).not.toContain('id="client-smoothie-sort"');

    // Queue header has sort popup toggle button with filter icon
    expect(smoothieSrc).toContain('styles.sortPopupWrap');
    expect(smoothieSrc).toContain('styles.sortToggleBtn');
    expect(smoothieSrc).toContain('styles.filterIcon');
    expect(smoothieSrc).toContain('styles.sortCurrentLabel');
    expect(smoothieSrc).toContain('aria-haspopup="menu"');
    expect(smoothieSrc).toContain('title="Sort customers"');

    // Queue header has the popup menu
    expect(smoothieSrc).toContain('styles.sortMenu');
    expect(smoothieSrc).toContain('role="menu"');
    expect(smoothieSrc).toContain('styles.sortMenuItem');
    expect(smoothieSrc).toContain('role="menuitemradio"');
  });

  it('verifies clients-page.module.css removes unused sortWrap references', () => {
    const css = readFileSync('src/app/dashboard/clients/clients-page.module.css', 'utf8');
    expect(css).not.toContain('.sortWrap');
    expect(css).toContain('grid-template-columns: minmax(14rem, 1fr) auto auto;');
  });

  it('verifies smoothie.module.css styles the sort popup and filter icon', () => {
    const css = readFileSync('src/app/dashboard/smoothie.module.css', 'utf8');
    expect(css).toContain('.sortPopupWrap');
    expect(css).toContain('.sortToggleBtn');
    expect(css).toContain('.filterIcon');
    expect(css).toContain('.sortMenu');
    expect(css).toContain('.sortMenuItem');
  });
});
