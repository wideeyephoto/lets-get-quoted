import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('audit findings remediation', () => {
  it('ensures InsuranceSection does not nest forms (ConfirmActionButton form is outside the save form)', () => {
    const src = readFileSync('src/app/dashboard/settings/InsuranceSection.tsx', 'utf8');
    
    // Save form should end before ConfirmActionButton
    const saveFormIndex = src.indexOf('<form action={saveAction}');
    const saveFormEndIndex = src.indexOf('</form>', saveFormIndex);
    const confirmButtonIndex = src.indexOf('<ConfirmActionButton', saveFormIndex);

    expect(saveFormIndex).toBeGreaterThan(-1);
    expect(saveFormEndIndex).toBeGreaterThan(-1);
    expect(confirmButtonIndex).toBeGreaterThan(-1);
    // ConfirmActionButton must be rendered AFTER </form>
    expect(confirmButtonIndex).toBeGreaterThan(saveFormEndIndex);
  });

  it('ensures DedicatedNumberWizard step tabs trigger validation instead of silent no-ops', () => {
    const src = readFileSync('src/app/dashboard/messages/dedicated-number/DedicatedNumberWizard.tsx', 'utf8');

    // Tab 2 click handler must call goToStep2 without inverted boolean guard
    expect(src).not.toContain('!validateStep1()');
    expect(src).not.toContain('!validateStep2()');

    // Tab 2 and Tab 3 clicks on Step 1 must invoke validation
    expect(src).toContain('goToStep2();');
    expect(src).toContain('const err1 = validateStep1();');
    expect(src).toContain('const err2 = validateStep2();');
  });

  it('ensures /dashboard/stripe-return handles refresh errors gracefully with fallback redirect', () => {
    const src = readFileSync('src/app/dashboard/stripe-return/page.tsx', 'utf8');

    // Must have try/catch around refreshStripeStatusAction and redirect to settings on failure
    expect(src).toContain('try {');
    expect(src).toContain('await refreshStripeStatusAction();');
    expect(src).toContain('catch');
    expect(src).toContain("redirect('/dashboard/settings#payments');");
    expect(src).toContain("redirect('/dashboard');");
  });
});
