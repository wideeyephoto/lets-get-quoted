import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n');

describe('Quick Stops Settings UX Enhancements', () => {
  const CONFIGURATOR = read('src', 'app', 'dashboard', 'quick-stops', 'QuickStopConfigurator.tsx');
  const MODAL = read('src', 'app', 'dashboard', 'quick-stops', 'QuickStopCustomerPreviewModal.tsx');
  const CSS = read('src', 'app', 'globals.css');

  it('renders 1-click trade quick-start presets', () => {
    expect(CONFIGURATOR).toContain('1-Click Quick-Start Trade Presets');
    expect(CONFIGURATOR).toContain('TRADE_PRESETS');
    expect(CONFIGURATOR).toContain("'plumbing'");
    expect(CONFIGURATOR).toContain("'electrical'");
    expect(CONFIGURATOR).toContain("'hvac'");
    expect(CONFIGURATOR).toContain("'handyman'");
    expect(CONFIGURATOR).toContain('applyPreset');
  });

  it('embeds the live take-home and net fee calculator in section 4', () => {
    expect(CONFIGURATOR).toContain('Live Take-Home &amp; Fee Breakdown');
    expect(CONFIGURATOR).toContain('Direct Deposit via Stripe');
    expect(CONFIGURATOR).toContain('10% LGQ Platform Fee');
    expect(CONFIGURATOR).toContain('calculatorFee * 0.10');
    expect(CONFIGURATOR).toContain('calculatorFee * 0.029 + 0.30');
  });

  it('provides expand-all and collapse-all toolbar controls', () => {
    expect(CONFIGURATOR).toContain('qs-section-toolbar');
    expect(CONFIGURATOR).toContain('Expand all');
    expect(CONFIGURATOR).toContain('Collapse all');
    expect(CONFIGURATOR).toContain('expandAll');
    expect(CONFIGURATOR).toContain('collapseAll');
  });

  it('provides the customer experience preview modal', () => {
    expect(CONFIGURATOR).toContain('Preview Customer Experience');
    expect(CONFIGURATOR).toContain('<QuickStopCustomerPreviewModal');
    expect(MODAL).toContain('1. SMS / Message Offer');
    expect(MODAL).toContain('2. Payment Screen');
    expect(MODAL).toContain('3. Reserved Confirmation');
    expect(MODAL).toContain('Service and repair work is quoted &amp; invoiced separately on-site');
  });

  it('has responsive and interactive styles defined in globals.css', () => {
    expect(CSS).toContain('.qs-presets-strip');
    expect(CSS).toContain('.qs-calculator-card');
    expect(CSS).toContain('.qs-modal-overlay');
    expect(CSS).toContain('.qs-phone-frame');
  });
});
