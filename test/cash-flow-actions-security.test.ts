import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Cash Flow Least Privilege & Write Action Security', () => {
  it('verifies cash-flow actions require payments.collect instead of reports.read for writes', () => {
    const actionsContent = readFileSync(
      join(process.cwd(), 'src/app/dashboard/cash-flow/actions.ts'),
      'utf8',
    );

    // Write actions must require payments.collect
    expect(actionsContent).toContain("requireOfficeContext('payments.collect')");
    expect(actionsContent).not.toContain("requireOfficeContext('reports.read')");
  });

  it('verifies migration 20260825150000 replaces FOR ALL policies with separate SELECT and INSERT/UPDATE/DELETE', () => {
    const migrationContent = readFileSync(
      join(
        process.cwd(),
        'migrations/20260825150000_office_member_capabilities_and_least_privilege.sql',
      ),
      'utf8',
    );

    expect(migrationContent).toContain('create policy scheduled_payments_select on public.scheduled_payments');
    expect(migrationContent).toContain('create policy scheduled_payments_insert on public.scheduled_payments');
    expect(migrationContent).toContain('create policy scheduled_payments_update on public.scheduled_payments');
    expect(migrationContent).toContain('create policy scheduled_payments_delete on public.scheduled_payments');

    // Make sure reports.read is only in select policy and not in write policies
    expect(migrationContent).toContain("create policy scheduled_payments_insert on public.scheduled_payments\n  for insert\n  to authenticated\n  with check (\n    public.office_can(account_id, 'payments.collect')\n  );");
  });
});
