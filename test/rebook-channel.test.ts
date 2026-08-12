import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  REBOOK_CHANNEL_LABEL,
  previewFirstName,
  rebookBlockReason,
  rebookChannelFor,
  rebookInviteEmailContent,
  rebookReachSplit,
} from '@/lib/rebook-message';
import { rebookInviteText } from '@/lib/sms-templates';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').split('\r\n').join('\n');
const SCREEN = read('src', 'app', 'dashboard', 'rebook', 'RebookScreen.tsx');
const EMAIL = read('src', 'lib', 'email.ts');
const REBOOK = read('src', 'lib', 'rebook.ts');

const both = { smsReady: true, hasEmail: true };
const emailOnly = { smsReady: false, hasEmail: true };
const neither = { smsReady: false, hasEmail: false };
const live = { bookingUrl: 'https://x.example/book', mailingAddress: '1 Main St, Royal Oak MI' };

/**
 * "SEND BOOKING LINK" TO EVERYONE, AND NO CLUE WHICH MESSAGE THEY GET.
 *
 * A text and a marketing email are different messages with different rules, and
 * one of them does not send at all when the business has no postal address on
 * file. The page looked identical either way.
 */
describe('which way the win-back nudge leaves', () => {
  it('follows the same rule the sender does: opted-in mobile first, email second', () => {
    expect(rebookChannelFor(both, live)).toBe('sms');
    expect(rebookChannelFor(emailOnly, live)).toBe('email');
    expect(rebookChannelFor(neither, live)).toBe('none');
  });

  /**
   * THE CASE THE PAGE COULD NOT SEE. deliverRebookInvite refuses the email
   * branch without a mailing address — a marketing email has to carry a
   * physical one — so an email-only customer looked reachable, the button
   * looked live, and the send came back "no opted-in phone or reachable
   * email", which is not what was wrong.
   */
  it('knows an email cannot go out without a business postal address', () => {
    const noAddress = { bookingUrl: live.bookingUrl, mailingAddress: null };
    expect(rebookChannelFor(emailOnly, noAddress)).toBe('none');
    expect(rebookBlockReason(emailOnly, noAddress)).toBe('Add your business mailing address');
    // The text half is unaffected — an SMS carries no postal address.
    expect(rebookChannelFor(both, noAddress)).toBe('sms');
  });

  it('is the same branch as deliverRebookInvite, not a second guess at it', () => {
    // If that function's order ever changes, this is the line that has to move.
    const branch = REBOOK.slice(REBOOK.indexOf('async function deliverRebookInvite'), REBOOK.indexOf('export async function sendRebookInvite'));
    expect(branch).toContain('if (canText && phone) {');
    expect(branch).toContain('} else if (client.email && mailingAddress && !(await isEmailSuppressed');
  });

  it('says nothing can go anywhere without a published booking page', () => {
    const unpublished = { bookingUrl: null, mailingAddress: live.mailingAddress };
    expect(rebookChannelFor(both, unpublished)).toBe('none');
    expect(rebookBlockReason(both, unpublished)).toBe('Publish your booking page');
  });

  it('names the two reasons a customer is simply unreachable', () => {
    expect(rebookBlockReason(neither, live)).toBe('No opted-in mobile or email');
    expect(rebookBlockReason(both, live)).toBeNull();
    expect(rebookBlockReason(emailOnly, live)).toBeNull();
  });

  /** "12 reachable" over a book that is 11 emails and one text is a different
   *  afternoon from the reverse. */
  it('splits the count by channel for the bulk row', () => {
    expect(rebookReachSplit([both, both, emailOnly, neither], live)).toEqual({ sms: 2, email: 1, none: 1 });
  });

  it('labels each channel for the row chip', () => {
    expect(REBOOK_CHANNEL_LABEL.sms).toBe('Text');
    expect(REBOOK_CHANNEL_LABEL.email).toBe('Email');
    expect(REBOOK_CHANNEL_LABEL.none).toBe('Not reachable');
  });
});

/**
 * The page showed no preview at all — one button, and whatever it sent was
 * discovered by sending it.
 */
describe('the message, shown before it goes', () => {
  it('renders the text exactly as the sender builds it', () => {
    const body = rebookInviteText({ businessName: 'Northline', clientName: 'Dana', url: 'https://x.example/book' });
    expect(body).toContain('Northline');
    expect(body).toContain('https://x.example/book');
    // Required on every marketing text, so it belongs in the preview too.
    expect(body).toContain('Reply STOP to opt out');
    expect(SCREEN).toContain('const smsBody = rebookInviteText({');
  });

  /** One definition. A preview built from a second copy of the copy tells the
   *  truth until the first edit. */
  it('takes the email wording from the same function the sender uses', () => {
    const content = rebookInviteEmailContent({ businessName: 'Northline', clientName: 'Dana' });
    expect(content.subject).toBe('Ready to book Northline again?');
    expect(content.heading).toContain('Dana');
    expect(content.ctaLabel).toBeTruthy();
    expect(EMAIL).toContain('const content = rebookInviteEmailContent(input);');
    expect(EMAIL).toContain('subject: content.subject,');
    expect(SCREEN).toContain('rebookInviteEmailContent({ businessName, clientName: sampleName })');
  });

  /** A preview headed "there, it has been a while!" is a preview of a bug. */
  it('greets a real first name, and never a phone number', () => {
    expect(previewFirstName('Dana Whitfield')).toBe('Dana');
    expect(previewFirstName('2485550117')).toBe('Dana');
    expect(previewFirstName('')).toBe('Dana');
    expect(previewFirstName(null)).toBe('Dana');
  });

  it('names the channel on the button rather than on neither', () => {
    expect(SCREEN).toContain("{channel === 'sms' ? 'Text booking link' : 'Email booking link'}");
    expect(SCREEN).not.toContain('>Send booking link<');
  });

  it('says the email half is switched off when there is no postal address', () => {
    expect(SCREEN).toContain('No email can go out yet.');
    expect(SCREEN).toContain('Add your mailing address');
  });
});
