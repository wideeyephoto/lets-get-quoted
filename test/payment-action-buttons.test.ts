import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The contractor's own controls on a payment row: refund, retry, mark failed,
 * mark paid, cancel.
 *
 * Two of them behaved in ways nobody would have chosen deliberately, and both
 * only show up in use rather than in review.
 */

const BUTTONS = readFileSync(
  join(process.cwd(), 'src/app/dashboard/jobs/[id]/PaymentActionButtons.tsx'), 'utf8');

/**
 * Executable lines only.
 *
 * These handlers explain themselves at length, and the explanations necessarily
 * quote the code they are about -- so an assertion about the ORDER of two
 * statements finds them in the prose first. The retry assertion below failed
 * exactly that way before this existed.
 */
const CODE = BUTTONS
  .split('\n')
  .filter((line) => {
    const t = line.trimStart();
    return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
  })
  .join('\n');

describe('the irreversible action asks before it acts', () => {
  it('confirms a refund', () => {
    // Mark paid, mark failed and cancel all confirmed. Refund did not -- and it
    // is the only one of the five that moves real money out of the contractor's
    // balance, which Stripe will not give back.
    const handler = CODE.slice(CODE.indexOf('const handleRefund'), CODE.indexOf('const handleMarkFailed'));
    expect(handler).toContain('window.confirm');
    expect(handler).toContain('cannot be undone');
  });

  it('names the amount in the confirmation', () => {
    // "Are you sure?" is not a question anybody answers carefully. The figure is
    // the whole point, especially since the panel PRE-FILLS the full remaining
    // balance -- so the default action behind one click was a complete refund.
    const handler = CODE.slice(CODE.indexOf('const handleRefund'), CODE.indexOf('const handleMarkFailed'));
    expect(handler).toContain('formatUsd(remaining)');
    expect(handler).toContain('formatUsd(value)');
  });

  it('distinguishes a full refund from a partial one in the wording', () => {
    // "Refund the full remaining $4,200" and "Refund $500 of $4,200" are
    // different decisions and should not read the same.
    const handler = CODE.slice(CODE.indexOf('const handleRefund'), CODE.indexOf('const handleMarkFailed'));
    expect(handler).toContain('the full remaining');
    expect(handler).toMatch(/isFull\s*$|isFull\r?\n/m);
  });

  it('still keeps the prefill, because a full refund is the common case', () => {
    // The fix is to say the number out loud, not to make the ordinary case
    // harder. Removing the prefill would be the wrong lesson.
    expect(BUTTONS).toContain("setRefundInput(remaining > 0 ? remaining.toFixed(2) : '')");
  });

  it('leaves the reversible actions confirming as they were', () => {
    for (const phrase of [
      'Mark this payment as paid by',
      'Mark this payment as failed?',
      'Cancel this payment request?',
    ]) {
      expect(BUTTONS, phrase).toContain(phrase);
    }
  });
});

describe('retry opens the tab inside the gesture that asked for it', () => {
  it('opens the window before awaiting, not after', () => {
    // window.open is only reliably allowed in the task a user gesture started.
    // Running it after `await onRetry(...)` puts it outside, where every
    // mainstream popup blocker may refuse -- silently, returning null.
    const handler = CODE.slice(CODE.indexOf('const handleRetry'), CODE.indexOf('const handleCancel'));
    const openAt = handler.indexOf("window.open('', '_blank')");
    const awaitAt = handler.indexOf('await onRetry');
    expect(openAt).toBeGreaterThan(-1);
    expect(awaitAt).toBeGreaterThan(-1);
    expect(openAt, 'window.open must come first').toBeLessThan(awaitAt);
  });

  it('does not ignore a blocked popup', () => {
    // The old code discarded the return value, so a blocked retry looked exactly
    // like a working one: spinner stops, no tab, no error, and no way for the
    // contractor to tell whether a link had been created at all.
    const handler = CODE.slice(CODE.indexOf('const handleRetry'), CODE.indexOf('const handleCancel'));
    expect(handler).toContain('if (popup)');
    expect(handler).toContain('window.location.href = url');
  });

  it('closes the blank tab when the link never arrives', () => {
    // Otherwise a failed retry leaves a blank page open with no explanation.
    const handler = CODE.slice(CODE.indexOf('const handleRetry'), CODE.indexOf('const handleCancel'));
    expect(handler).toContain('popup?.close()');
  });
});

describe('the tab it opens cannot reach back', () => {
  it('severs window.opener by hand, since noopener is unavailable here', () => {
    // `noopener` makes window.open return null, and the whole point of opening
    // early is to hold the reference and navigate it after the await. So the
    // link is cut manually instead -- otherwise the Stripe checkout tab keeps a
    // handle on the dashboard and could navigate it. Reverse tabnabbing.
    const handler = CODE.slice(CODE.indexOf('const handleRetry'), CODE.indexOf('const handleCancel'));
    expect(handler).toContain('popup.opener = null');
    const openAt = handler.indexOf("window.open('', '_blank')");
    const severAt = handler.indexOf('popup.opener = null');
    expect(severAt, 'sever before anything else happens').toBeGreaterThan(openAt);
    expect(severAt).toBeLessThan(handler.indexOf('await onRetry'));
  });

  it('is the same rule the rest of the app already follows', () => {
    // Not a new opinion: SocialLinks carries the identical note, and the one
    // other real window.open in the app passes 'noopener' outright.
    const social = readFileSync(join(process.cwd(), 'src/lib/templates/SocialLinks.tsx'), 'utf8');
    expect(social).toContain('window.opener');
    const builder = readFileSync(join(process.cwd(), 'src/app/dashboard/sites/WebsiteBuilder.tsx'), 'utf8');
    expect(builder).toContain("'noopener'");
  });
});
