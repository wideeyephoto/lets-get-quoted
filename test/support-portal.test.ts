import { describe, it, expect } from 'vitest';
import { isNoteVisibility, visibilityFromForm } from '@/lib/support-cases';
import {
  BODY_MAX,
  CUSTOMER_STATUS_LABEL,
  CUSTOMER_STATUS_NOTE,
  SUBJECT_MAX,
  SUPPORT_ERROR_MESSAGE,
  canCustomerReply,
  nextStatusAfterCustomerReply,
  validateSupportInput,
} from '@/lib/support-portal';
import type { CaseStatus } from '@/lib/support-cases';

const STATUSES: CaseStatus[] = ['open', 'pending', 'resolved', 'closed'];

describe('note visibility — the one that must not be got wrong', () => {
  it('knows the two values and nothing else', () => {
    expect(isNoteVisibility('internal')).toBe(true);
    expect(isNoteVisibility('customer')).toBe(true);
    expect(isNoteVisibility('public')).toBe(false);
    expect(isNoteVisibility('')).toBe(false);
    expect(isNoteVisibility(undefined)).toBe(false);
    expect(isNoteVisibility(null)).toBe(false);
  });

  // The whole safety argument in one test. A note is written ABOUT the customer
  // who would read it, so every malformed, missing or hostile value has to land
  // on 'internal'. There is no input that turns a mistake into a disclosure.
  it('falls back to internal for anything it does not recognise', () => {
    expect(visibilityFromForm(undefined)).toBe('internal');
    expect(visibilityFromForm(null)).toBe('internal');
    expect(visibilityFromForm('')).toBe('internal');
    expect(visibilityFromForm('Customer')).toBe('internal');
    expect(visibilityFromForm('CUSTOMER')).toBe('internal');
    expect(visibilityFromForm(' customer ')).toBe('internal');
    expect(visibilityFromForm('public')).toBe('internal');
    expect(visibilityFromForm('true')).toBe('internal');
    expect(visibilityFromForm('1')).toBe('internal');
  });

  it('passes the exact value through when it is one of the two', () => {
    expect(visibilityFromForm('customer')).toBe('customer');
    expect(visibilityFromForm('internal')).toBe('internal');
  });
});

describe('what the contractor is told', () => {
  it('has a word and an explanation for every status', () => {
    for (const status of STATUSES) {
      expect(CUSTOMER_STATUS_LABEL[status], `no label for ${status}`).toBeTruthy();
      expect(CUSTOMER_STATUS_NOTE[status], `no note for ${status}`).toBeTruthy();
    }
  });

  // 'open' and 'pending' are a queue's words. They say nothing about who owes
  // whom something, which is the only question somebody checking on their own
  // request is asking.
  // Only the two live ones need translating. 'Resolved' and 'Closed' mean the
  // same thing in both vocabularies, and inventing a different word for them
  // would be a difference with nothing behind it.
  it('says who is holding the ball, not what the queue calls it', () => {
    expect(CUSTOMER_STATUS_LABEL.open).toBe('With support');
    expect(CUSTOMER_STATUS_LABEL.pending).toBe('Waiting on you');
    expect(CUSTOMER_STATUS_LABEL.open.toLowerCase()).not.toBe('open');
    expect(CUSTOMER_STATUS_LABEL.pending.toLowerCase()).not.toBe('pending');
  });
});

describe('replying', () => {
  it('stays open until the case is closed', () => {
    expect(canCustomerReply('open')).toBe(true);
    expect(canCustomerReply('pending')).toBe(true);
    // "That didn't actually fix it" has to have somewhere to go.
    expect(canCustomerReply('resolved')).toBe(true);
    expect(canCustomerReply('closed')).toBe(false);
  });

  // A reply always puts the ball back with support. Leaving a case 'pending'
  // after the customer has answered is how a queue loses somebody: staff filter
  // for what they are waiting on, and the answer sits in a case that still
  // claims to be waiting on them.
  it('moves the case back to support', () => {
    expect(nextStatusAfterCustomerReply('pending')).toBe('open');
    expect(nextStatusAfterCustomerReply('resolved')).toBe('open');
  });

  it('does not churn a case that is already open', () => {
    expect(nextStatusAfterCustomerReply('open')).toBeNull();
  });

  // Closed never reaches this — canCustomerReply stops it first — but if the
  // order of those two checks ever changed, reopening would be the safer of
  // the two mistakes.
  it('would reopen rather than silently swallow a reply on a closed case', () => {
    expect(nextStatusAfterCustomerReply('closed')).toBe('open');
  });
});

describe('what they typed', () => {
  it('accepts an ordinary request', () => {
    expect(validateSupportInput({ subject: 'Payouts stopped', body: 'Since Tuesday.' })).toBeNull();
  });

  it('needs a title when one is being asked for', () => {
    expect(validateSupportInput({ subject: '', body: 'Something' })).toBe('subject');
    expect(validateSupportInput({ subject: '   ', body: 'Something' })).toBe('subject');
  });

  // A reply has no subject field, so an absent subject is fine — but an EMPTY
  // one is a form that was rendered with the field and came back blank.
  it('does not demand a title from a reply', () => {
    expect(validateSupportInput({ body: 'Here is the invoice number.' })).toBeNull();
  });

  it('always needs something to say', () => {
    expect(validateSupportInput({ subject: 'Help', body: '' })).toBe('body');
    expect(validateSupportInput({ subject: 'Help', body: '\n  \t ' })).toBe('body');
    expect(validateSupportInput({ body: '' })).toBe('body');
  });

  it('refuses more than it can store', () => {
    expect(validateSupportInput({ subject: 'a'.repeat(SUBJECT_MAX + 1), body: 'x' })).toBe('too_long');
    expect(validateSupportInput({ subject: 'ok', body: 'x'.repeat(BODY_MAX + 1) })).toBe('too_long');
  });

  it('allows exactly the limit', () => {
    expect(validateSupportInput({ subject: 'a'.repeat(SUBJECT_MAX), body: 'x'.repeat(BODY_MAX) })).toBeNull();
  });

  it('has a sentence for every error it can return', () => {
    const errors = ['subject', 'body', 'too_long', 'rate', 'closed', 'not_found', 'failed'] as const;
    for (const error of errors) {
      expect(SUPPORT_ERROR_MESSAGE[error], `no message for ${error}`).toBeTruthy();
    }
  });
});
