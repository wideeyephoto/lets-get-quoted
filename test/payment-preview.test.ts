import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { paymentText } from '@/lib/sms-templates';

/**
 * The preview on the button that asks somebody for money.
 *
 * WHAT WAS MISSING. The quote builder has had a Preview since it shipped — you
 * can read the client's own approval screen before you send it. The invoice and
 * the payment link had none. An owner filled in a type, an amount and a note,
 * ticked a box reading "text the secure payment link", and pressed a button
 * whose entire effect happened on somebody else's phone. The first time anybody
 * read that message was after it had gone.
 *
 * THE FAILURE THIS GUARDS. A preview that lies is worse than no preview,
 * because it is believed. The body here is built by the same function the
 * sender calls; a hand-typed one has drifted from the real message twice in
 * this codebase already.
 */

const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const strip = (s: string) =>
  s
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const PREVIEW = strip(read('src/app/dashboard/jobs/[id]/PaymentPreview.tsx'));
const JOB_PAGE = strip(read('src/app/dashboard/jobs/[id]/page.tsx'));
const CSS = read('src/app/globals.css');

describe('the message is the real message', () => {
  it('is built by the sender’s own function, never typed', () => {
    expect(PREVIEW).toContain("import { paymentText } from '@/lib/sms-templates'");
    expect(PREVIEW).toContain("eventType: 'payment_requested'");
    // No hand-written copy of the sentence anywhere in the component.
    expect(PREVIEW).not.toContain('Pay securely:');
    expect(PREVIEW).not.toContain('requested a');
    // And it renders money with the app's own formatter, not a second one --
    // the EXACT one, because this previews a message whose figure becomes the
    // amount charged, and it used to alias the rounding formatter.
    expect(PREVIEW).toContain('const money = formatMoneyExact;');
  });

  it('shows the words a homeowner will actually read', () => {
    const body = paymentText({
      contractor: 'Evergreen Lawn & Landscape',
      label: 'Deposit request',
      amount: 2125,
      link: 'lgq.co/p/1048',
      eventType: 'payment_requested',
    });
    expect(body).toContain('Evergreen Lawn & Landscape requested a Deposit request of $2,125.');
    expect(body).toContain('Reply STOP to opt out or HELP for help.');
  });

  it('falls back to the payment type when there is no note, like the action does', () => {
    expect(PREVIEW).toContain("const label = draft.label || KIND_LABEL[draft.kind] || 'payment';");
  });

  it('counts what a carrier counts', () => {
    // Billed and delivered per segment: 160 on GSM-7, 70 the moment one
    // character forces UCS-2 — which a pasted smart quote does without looking
    // like it did.
    expect(PREVIEW).toContain('function segments');
    expect(PREVIEW).toContain('unicode ? 70 : 160');
    expect(PREVIEW).toContain('unicode ? 67 : 153');
    expect(PREVIEW).toMatch(/a special character makes each one shorter/);
  });

  it('says plainly when nothing is going to be sent', () => {
    // The consent box is unticked by default, so the commonest state of this
    // form sends no text at all — and a preview of a message that will not be
    // sent is a trap unless it says so.
    expect(PREVIEW).toContain('Nothing will be texted.');
    expect(PREVIEW).toContain("willText: data.get('sendSms') != null");
  });

  it('does not pretend to know the link', () => {
    // The real address carries a payment id that does not exist until the
    // request is created.
    expect(PREVIEW).toContain('/pay/…');
    expect(PREVIEW).toContain('a one-off address for this request');
  });
});

describe('the invoice panel', () => {
  it('shows the lines and the charges, not just the number already on screen', () => {
    for (const bit of ['preview-doc-lines', 'Subtotal', 'Discount (', 'Tax (', 'Balance', 'Paid so far']) {
      expect(PREVIEW, bit).toContain(bit);
    }
  });

  it('is loaded from the invoice itself, with its real totals', () => {
    expect(JOB_PAGE).toContain('await getInvoiceWithItems(supabase, accountId, jobInvoice.id)');
    expect(JOB_PAGE).toContain('computeInvoiceTotals(');
    // A job with no invoice costs no query.
    expect(JOB_PAGE).toContain('jobInvoice ? await getInvoiceWithItems');
  });

  it('says what happens when there is no invoice yet', () => {
    expect(PREVIEW).toContain('No invoice exists yet.');
  });

  it('does not let the request be mistaken for the whole balance', () => {
    expect(PREVIEW).toMatch(/of it, not the whole balance/);
  });
});

describe('it reads the form rather than mirroring it', () => {
  it('takes its values from the live form at the moment it opens', () => {
    // Mirroring five fields into React state means the preview can disagree
    // with the form it is previewing, which is the bug it exists to prevent.
    expect(PREVIEW).toContain('new FormData(form)');
    expect(PREVIEW).toContain('document.getElementById(formId)');
    expect(JOB_PAGE).toContain('id="payment-request-form"');
    expect(JOB_PAGE).toContain('formId="payment-request-form"');
  });

  it('is a real dialog a keyboard can leave', () => {
    expect(PREVIEW).toContain('role="dialog"');
    expect(PREVIEW).toContain('aria-modal="true"');
    expect(PREVIEW).toContain("event.key === 'Escape'");
    expect(PREVIEW).toContain('closeRef.current?.focus()');
    expect(PREVIEW).toContain('role="tablist"');
  });

  it('cannot grow taller than the screen it is on', () => {
    // The invoice panel grows with the line items, and a dialog running off the
    // bottom hides its own close button.
    expect(CSS).toMatch(/\.preview-dialog \{[^}]*max-height: min\(86vh, 760px\)/);
    expect(CSS).toMatch(/\.preview-body \{[^}]*overflow-y: auto/);
  });
});
