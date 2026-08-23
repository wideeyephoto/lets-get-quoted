import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  UNDECIDED_CATEGORIES,
  billsTextCredits,
  type SmsBillingCategory,
} from '@/lib/sms-billing-policy';

/**
 * What comes out of a workspace's text-credit balance.
 *
 * These are pricing assertions, not implementation ones. Each says what a
 * contractor is charged for, so changing one should require deciding to.
 */

const src = readFileSync(join(process.cwd(), 'src/lib/sms-billing-policy.ts'), 'utf8')
  .replace(/\r\n/g, '\n');
const code = src.split('\n').filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line)).join('\n');

const ACCOUNT = '11111111-1111-4111-8111-111111111111';
const bills = (category: SmsBillingCategory, accountId: string | null = ACCOUNT) =>
  billsTextCredits({ accountId, category });

describe('what a workspace pays for', () => {
  it('charges for texts to its own customers', () => {
    expect(bills('customer_message')).toBe(true);
  });

  it('charges for crew and subcontractor coordination', () => {
    // Still the workspace's own outbound message, still a carrier segment.
    expect(bills('crew_message')).toBe(true);
  });

  it('never charges without a workspace to charge', () => {
    // Only genuinely platform-scoped traffic is accountless. Public-site lead
    // verification is tenant-scoped and passes the site's account id.
    for (const category of ['customer_message', 'crew_message'] as SmsBillingCategory[]) {
      expect(bills(category, null)).toBe(false);
    }
  });

  it('exempts a lead verification code', () => {
    expect(bills('verification')).toBe(false);
  });
});

describe('the answers that are placeholders, not decisions', () => {
  it('does not yet charge an owner to hear about their own business', () => {
    // UNDECIDED. Costs the same at the carrier as any other segment, so
    // exempting it is a real cost the platform absorbs.
    expect(bills('owner_alert')).toBe(false);
  });

  it('does not yet charge for pay links and card-update dunning', () => {
    // UNDECIDED. Metering these means a contractor who ran out of texts also
    // stops being able to collect.
    expect(bills('payment_message')).toBe(false);
  });

  it('names both of them as undecided rather than leaving it to a comment', () => {
    // So a reader of the table can tell a settled `false` from a placeholder.
    expect([...UNDECIDED_CATEGORIES].sort()).toEqual(['owner_alert', 'payment_message']);
    for (const category of UNDECIDED_CATEGORIES) expect(bills(category)).toBe(false);
  });

  it('defaults an undecided category to exempt, never to billed', () => {
    // Billing for something nobody agreed to charge for is the harder mistake
    // to undo: a customer notices a charge they did not expect, and does not
    // notice one that never came.
    for (const category of UNDECIDED_CATEGORIES) {
      expect(code).toMatch(new RegExp(`${category}:\\s*false`));
    }
  });
});

describe('the shape that keeps it honest', () => {
  it('decides billing in one table and nowhere else', () => {
    // Thirty-two call sites each carrying their own boolean would let two texts
    // of the same kind disagree.
    expect(code.match(/const BILLABLE/g) ?? []).toHaveLength(1);
    expect(code).not.toContain('process.env');
  });

  it('is required at the egress point, so nothing can send unclassified', () => {
    const provider = readFileSync(join(process.cwd(), 'src/lib/sms-provider.ts'), 'utf8');
    // Not `context?:` - an optional argument would make unmetered the default
    // for every caller nobody has written yet.
    expect(provider).toContain('context: SmsSendContext,');
    expect(provider).not.toContain('context?: SmsSendContext');
  });
});
