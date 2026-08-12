import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PAGE = readFileSync(join(process.cwd(), 'src/app/pay/[id]/page.tsx'), 'utf8');
const PAYMENTS = readFileSync(join(process.cwd(), 'src/lib/payments.ts'), 'utf8');

/**
 * The public payment page is the last thing a homeowner looks at before they
 * type a card number into it. Everything on it should read like it was written
 * for them, not like a row.
 */
describe('the payment page shows words, not stored values', () => {
  it('never prints the raw status enum', () => {
    // It used to render {payment.status} directly, so a $3,500 charge was
    // labelled with a lowercase "requested" in the same weight as the amount.
    expect(PAGE).not.toMatch(/\{payment\.status\}/);
    expect(PAGE).toContain('STATUS_LABEL[payment.status] ?? payment.status');
  });

  it('labels every status the type allows, so none can fall through', () => {
    const union = PAYMENTS.match(/export type PaymentStatus =([^;]+);/)?.[1] ?? '';
    const statuses = [...union.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(statuses.length).toBeGreaterThan(4);

    const block = PAGE.slice(PAGE.indexOf('const STATUS_LABEL'), PAGE.indexOf('};', PAGE.indexOf('const STATUS_LABEL')));
    for (const status of statuses) {
      expect(block, status).toContain(`${status}: '`);
    }
  });

  it('capitalizes in the markup rather than with a CSS transform', () => {
    // A transform leaves the raw enum in the DOM, which is what gets read
    // aloud, copied, and pasted into an email asking what it means.
    const block = PAGE.slice(PAGE.indexOf('const STATUS_LABEL'), PAGE.indexOf('};', PAGE.indexOf('const STATUS_LABEL')));
    for (const [, label] of block.matchAll(/: '([A-Za-z ]+)'/g)) {
      expect(label[0], label).toBe(label[0].toUpperCase());
    }
  });
});
