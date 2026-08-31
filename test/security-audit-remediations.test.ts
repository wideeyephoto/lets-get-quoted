import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Security and Audit Remediations Regression Suite', () => {
  const rootDir = process.cwd();

  it('verifies ThemeTuner is completely removed from root layout', () => {
    const layoutContent = readFileSync(join(rootDir, 'src/app/layout.tsx'), 'utf8');
    expect(layoutContent).not.toContain('ThemeTuner');
  });

  it('verifies migrations 150000 and 160000 drop both singular and plural quick_stop_priority_zone policies', () => {
    const m15 = readFileSync(
      join(rootDir, 'migrations/20260830150000_harden_all_direct_auth_policies_against_suspension.sql'),
      'utf8'
    );
    expect(m15).toContain('drop policy if exists quick_stop_priority_zone_owner on public.quick_stop_priority_zones;');
    expect(m15).toContain('drop policy if exists quick_stop_priority_zones_owner on public.quick_stop_priority_zones;');

    const m16 = readFileSync(
      join(rootDir, 'migrations/20260830160000_enterprise_closure_and_rls_hardening.sql'),
      'utf8'
    );
    expect(m16).toContain('drop policy if exists quick_stop_priority_zone_owner on public.quick_stop_priority_zones;');
    expect(m16).toContain('drop policy if exists quick_stop_priority_zones_owner on public.quick_stop_priority_zones;');
  });

  it('verifies GoogleTag suppresses execution on sensitive token and credential routes', () => {
    const googleTagContent = readFileSync(join(rootDir, 'src/components/google-tag.tsx'), 'utf8');
    expect(googleTagContent).toMatch(/(?:\(await headers\(\)\)|headerList)\.get\('x-pathname'\)/);
    expect(googleTagContent).toContain("'/track'");
    expect(googleTagContent).toContain("'/office-invite'");
    expect(googleTagContent).toContain("'/portal'");
    expect(googleTagContent).toContain("'/auth'");
    expect(googleTagContent).toContain("'/quick-stop'");
    expect(googleTagContent).toContain("'/unsubscribe'");
    expect(googleTagContent).toContain("isSensitivePath");
  });

  it('verifies staff and crew auth sanitize wildcard characters on .ilike lookups', () => {
    const authContent = readFileSync(join(rootDir, 'src/lib/auth.ts'), 'utf8');
    expect(authContent).toContain("email.trim().toLowerCase().replace(/[%_\\\\]/g, '\\\\$&')");

    const crewAuthContent = readFileSync(join(rootDir, 'src/lib/crew-auth.ts'), 'utf8');
    expect(crewAuthContent).toContain("normalized.replace(/[%_\\\\]/g, '\\\\$&')");
  });

  it('verifies Stripe webhook scrubs cardholder PII from last_payment_error logs', () => {
    const webhookContent = readFileSync(join(rootDir, 'src/app/api/stripe/webhook/route.ts'), 'utf8');
    expect(webhookContent).toContain('code: err?.code');
    expect(webhookContent).toContain('decline_code: err?.decline_code');
    expect(webhookContent).toContain('message: err?.message');
    expect(webhookContent).not.toContain('paymentIntent.last_payment_error)');
  });

  it('verifies Privacy Policy includes RentCast subprocessor disclosure', () => {
    const privacyContent = readFileSync(join(rootDir, 'src/app/privacy/page.tsx'), 'utf8');
    expect(privacyContent).toContain('RentCast, Inc.');
  });

  it('verifies client merge repoints warranties and updateClient retains raw unparseable phone input', () => {
    const actionsContent = readFileSync(join(rootDir, 'src/app/dashboard/clients/actions.ts'), 'utf8');
    expect(actionsContent).toContain("'warranties'");

    const clientsContent = readFileSync(join(rootDir, 'src/lib/clients.ts'), 'utf8');
    expect(clientsContent).toContain('normalizeUsPhone(input.phone) ?? input.phone.trim()');
  });

  it('verifies crew-auth respects account suspension', () => {
    const crewAuthContent = readFileSync(join(rootDir, 'src/lib/crew-auth.ts'), 'utf8');
    expect(crewAuthContent).toContain("accountRow?.suspended_at");
    expect(crewAuthContent).toContain("reason: 'suspended'");
    expect(crewAuthContent).toContain("redirect('/account-suspended')");
  });
});
