import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Admin Discounts & Perks portal', () => {
  it('includes /admin/discounts in AdminNav for all active staff members without permission gating', () => {
    const navContent = readFileSync(
      join(process.cwd(), 'src', 'app', 'admin', 'AdminNav.tsx'),
      'utf8',
    );
    expect(navContent).toMatch(/\{\s*href:\s*['"]\/admin\/discounts['"],\s*label:\s*['"]Discounts & Perks['"]\s*\}/);
  });

  it('protects /admin/discounts behind requireAdmin() and publishes full F&F guidelines', () => {
    const pageContent = readFileSync(
      join(process.cwd(), 'src', 'app', 'admin', 'discounts', 'page.tsx'),
      'utf8',
    );

    // Auth gate check
    expect(pageContent).toContain('await requireAdmin()');

    // Pricing & discount checks
    expect(pageContent).toContain('$15.60'); // Solo VIP
    expect(pageContent).toContain('$51.60'); // Growth VIP
    expect(pageContent).toContain('0.75%');  // Flex take rate
    expect(pageContent).toContain('ff_vip_60_lifetime');
    expect(pageContent).toContain('ff_flex_40');

    // SOP & Guardrails
    expect(pageContent).toContain('Continuous Active Billing');
    expect(pageContent).toContain('Strictly Non-Transferable');
    expect(pageContent).toContain('Mandatory Feedback Protocol');
  });

  it('provides interactive calculator and outreach copy templates in DiscountsInteractive', () => {
    const interactiveContent = readFileSync(
      join(process.cwd(), 'src', 'app', 'admin', 'discounts', 'DiscountsInteractive.tsx'),
      'utf8',
    );

    expect(interactiveContent).toContain('0.0125');
    expect(interactiveContent).toContain('0.0075');
    expect(interactiveContent).toContain('Annual Savings');
    expect(interactiveContent).toContain('Short SMS / Text Message');
    expect(interactiveContent).toContain('Formal Email / Deep Pitch');
    expect(interactiveContent).toContain('Flex Tier Contractor Pitch');
  });

  it('exposes setFlexPlatformFeeAction in account actions guarded by money.plan permission', () => {
    const actionsContent = readFileSync(
      join(process.cwd(), 'src', 'app', 'admin', 'accounts', '[id]', 'actions.ts'),
      'utf8',
    );

    expect(actionsContent).toContain('export async function setFlexPlatformFeeAction');
    expect(actionsContent).toContain("requirePermission('money.plan')");
    expect(actionsContent).toContain('targetBps !== 75 && targetBps !== 125');
    expect(actionsContent).toContain("was.plan_code !== 'flex'");
    expect(actionsContent).toContain("action: 'account_update_platform_fee'");
  });
});
