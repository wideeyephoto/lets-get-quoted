import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

describe('Client Detail Tabs & Smoothie View Enhancements', () => {
  it('verifies Money / Payments renders paymentList and paymentRow instead of defs', () => {
    const tabsSrc = readFileSync('src/app/dashboard/clients/ClientDetailTabs.tsx', 'utf8');
    expect(tabsSrc).toContain('styles.paymentList');
    expect(tabsSrc).toContain('styles.paymentRow');
    expect(tabsSrc).toContain('styles.paymentHead');
    expect(tabsSrc).toContain('styles.paymentMeta');
    expect(tabsSrc).toContain('styles.paymentAmount');
  });

  it('verifies focus.module.css defines paymentList and paymentRow flex styles', () => {
    const css = readFileSync('src/app/dashboard/focus.module.css', 'utf8');
    expect(css).toContain('.paymentList {');
    expect(css).toContain('.paymentRow {');
    expect(css).toContain('.paymentHead {');
    expect(css).toContain('.paymentMeta {');
    expect(css).toContain('.paymentAmount {');
  });

  it('verifies ClientSmoothieView removes duplicate contactLine above action buttons', () => {
    const smoothieSrc = readFileSync('src/app/dashboard/clients/ClientSmoothieView.tsx', 'utf8');
    expect(smoothieSrc).not.toContain('styles.commsNote');
  });

  it('verifies field-intake-hint.module.css styles popover with theme support', () => {
    const css = readFileSync('src/components/field-intake-hint.module.css', 'utf8');
    expect(css).toContain("data-theme='light'");
    expect(css).toContain("data-theme='dim'");
    expect(css).toContain('.saveContactBtn');
  });
});
