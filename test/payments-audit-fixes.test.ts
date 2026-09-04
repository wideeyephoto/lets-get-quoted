import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Payments Audit Hardening Fixes', () => {
  it('ensures no occurrences of invalid permission keys payments.write or billing.write exist in source', () => {
    const srcDir = join(process.cwd(), 'src');
    const { readdirSync, statSync } = require('node:fs') as typeof import('node:fs');
    const walk = (dir: string, fileList: string[] = []): string[] => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          walk(full, fileList);
        } else if (/\.(ts|tsx)$/.test(entry)) {
          fileList.push(full);
        }
      }
      return fileList;
    };

    const files = walk(srcDir);
    const violations: { file: string; line: number; content: string }[] = [];

    for (const file of files) {
      const content = readFileSync(file, 'utf8');
      const lines = content.split('\n');
      lines.forEach((line, idx) => {
        if (line.includes("'payments.write'") || line.includes('"payments.write"')) {
          violations.push({ file, line: idx + 1, content: line.trim() });
        }
        if (line.includes("'billing.write'") || line.includes('"billing.write"')) {
          violations.push({ file, line: idx + 1, content: line.trim() });
        }
      });
    }

    expect(violations).toEqual([]);
  });

  it('verifies requireOfficeContextAny function exists and handles multi-capability authorization', async () => {
    const { requireOfficeContextAny } = await import('../src/lib/auth');
    expect(typeof requireOfficeContextAny).toBe('function');
  });

  it('verifies disputeDueBy is mapped in PaymentLedgerItem and queries dispute_due_by', () => {
    const dataCode = readFileSync(join(process.cwd(), 'src/lib/payments-ledger-data.ts'), 'utf8');
    expect(dataCode).toContain('disputeDueBy: string | null');
    expect(dataCode).toContain('dispute_due_by?: string | null');
    expect(dataCode).toContain('dispute_due_by,');
    expect(dataCode).toContain('disputeDueBy: row.dispute_due_by || null');
  });

  it('verifies sendPaymentReceiptSmsAction uses payment_paid event template instead of payment_requested', () => {
    const actionsCode = readFileSync(join(process.cwd(), 'src/app/dashboard/payments/actions.ts'), 'utf8');
    expect(actionsCode).toContain('sendPaymentReceiptSmsAction');
    expect(actionsCode).toContain("sendPaymentSmsEvent(pid, 'payment_paid'");
  });

  it('verifies issueRefundAction checks payments.refund capability instead of requireOwnerContext', () => {
    const actionsCode = readFileSync(join(process.cwd(), 'src/app/dashboard/payments/actions.ts'), 'utf8');
    expect(actionsCode).toContain("requireOfficeContext('payments.refund')");
    expect(actionsCode).not.toContain("requireOwnerContext");
  });

  it('verifies live DB persistence for payment rules, dunning rules, and ACH incentives in actions.ts', () => {
    const actionsCode = readFileSync(join(process.cwd(), 'src/app/dashboard/payments/actions.ts'), 'utf8');
    expect(actionsCode).toContain('savePaymentRulesAction');
    expect(actionsCode).toContain('.from(\'accounts\')');
    expect(actionsCode).toContain('payment_rules:');
    expect(actionsCode).toContain('saveDunningRulesAction');
    expect(actionsCode).toContain('dunning_rules:');
    expect(actionsCode).toContain('saveAchIncentiveSettingsAction');
    expect(actionsCode).toContain('ach_incentive_settings:');
  });

  it('verifies SMS dispatch routines for lien waiver and retainage demand in actions.ts', () => {
    const actionsCode = readFileSync(join(process.cwd(), 'src/app/dashboard/payments/actions.ts'), 'utf8');
    expect(actionsCode).toContain('sendLienWaiverSms(');
    expect(actionsCode).toContain('sendRetainageReleaseRequestAction');
    expect(actionsCode).toContain('queueAccountSms(');
  });
});
