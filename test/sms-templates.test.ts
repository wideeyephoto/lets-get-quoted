import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { reviewPillState } from '@/lib/job-detail-labels';
import {
  campaignText,
  crewAssignmentText,
  paymentText,
  quickStopConfirmedText,
  verificationCodeText,
  withOptOut,
} from '@/lib/sms-templates';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');
const SMS = read('src', 'lib', 'sms.ts');

/**
 * The words of a text message live in lib/sms-templates; lib/sms only sends
 * them. This is the invariant the whole split exists for, and it is the one
 * worth a test: two previews had already drifted from the senders they claimed
 * to show before the builders existed, and nothing failed when they did.
 */
describe('no message is written inline in the sender', () => {
  /**
   * A template literal in lib/sms that reads like a sentence to a customer. The
   * file legitimately still has literals — log lines, the Twilio URL — so the
   * test looks for prose rather than for backticks.
   */
  it('leaves no customer-facing prose in lib/sms', () => {
    const literals = SMS.match(/`[^`]*`/g) ?? [];
    const prose = literals.filter((raw) => {
      const text = raw.slice(1, -1);
      if (text.length < 40) return false;
      // Log lines and URLs are not messages.
      if (/^https?:/.test(text.trim())) return false;
      if (/failed|skipping|error/i.test(text)) return false;
      // The tell: an outgoing text says one of these to somebody.
      return /Reply STOP|Reply HELP|Hi \$\{|thanks|Thank you/i.test(text);
    });
    expect(prose, `these bodies belong in sms-templates: ${prose.join(' | ')}`).toEqual([]);
  });

  it('and imports its words from the templates module', () => {
    expect(SMS).toMatch(/from '@\/lib\/sms-templates'/);
  });
});

/**
 * Spot-checks on the extracted builders. Not every message — the guard above is
 * what keeps the set complete — but one from each shape the extraction had to
 * preserve: an optional clause, a branch, a bare envelope, and one with no
 * opt-out line at all.
 */
describe('the extracted builders', () => {
  it('keeps an optional clause optional', () => {
    const withUrl = quickStopConfirmedText({ businessName: 'Evergreen', whenLabel: 'today 2-4pm', statusUrl: 'https://x.co/a' });
    const without = quickStopConfirmedText({ businessName: 'Evergreen', whenLabel: 'today 2-4pm' });
    expect(withUrl).toContain('Manage or cancel: https://x.co/a.');
    expect(without).not.toContain('Manage or cancel');
    // The clause is the ONLY difference.
    expect(without).toBe(withUrl.replace(' Manage or cancel: https://x.co/a.', ''));
  });

  it('drops the schedule sentence when a job has no date', () => {
    const base = { crewName: 'Mike', businessName: 'Evergreen', jobRef: 'J-1001', clientName: 'Karen', address: null };
    expect(crewAssignmentText({ ...base, scheduledFor: null })).not.toContain('Scheduled');
    expect(crewAssignmentText({ ...base, scheduledFor: '2026-08-12' })).toContain('Scheduled');
  });

  it('branches the four payment texts and asks for HELP as well as STOP', () => {
    const base = { contractor: 'Evergreen', label: 'deposit', amount: 500, link: 'https://x.co/p' } as const;
    const requested = paymentText({ ...base, eventType: 'payment_requested' });
    const refunded = paymentText({ ...base, eventType: 'payment_refunded' });
    expect(requested).toContain('requested a deposit of');
    expect(refunded).toContain('A refund of');
    // A money message carries both keywords; every other family carries STOP only.
    for (const message of [requested, refunded]) {
      expect(message).toContain('Reply STOP to opt out or HELP for help.');
    }
  });

  /**
   * A code the person asked for thirty seconds ago, expiring in ten minutes, is
   * the one outgoing text with no opt-out line — there is nothing to opt out of.
   */
  it('leaves the verification code without an opt-out line', () => {
    expect(verificationCodeText({ businessName: 'Evergreen', code: '481920' })).not.toContain('STOP');
  });

  it('adds the envelope to a message somebody else composed', () => {
    expect(withOptOut('On my way.')).toBe('On my way. Reply STOP to opt out.');
    expect(campaignText({ businessName: 'Evergreen', body: 'Booking spring cleanups now.' })).toBe(
      'Evergreen: Booking spring cleanups now. Reply STOP to opt out.',
    );
  });
});

/**
 * The review pill's blocked state used to send owners to Settings for a field
 * that has never been there — it is linked in the website builder's Customer
 * reviews card, which is where resolveAccountReviewUrl reads it from.
 */
describe('the review pill points at the right page', () => {
  const blocked = { clientName: 'Karen', autoReviewRequest: true, reviewUrlConfigured: false, alreadyRequested: false, channel: 'text' } as const;

  it('offers a way to fix the missing review link', () => {
    const state = reviewPillState({ ...blocked, sendReview: null });
    expect(state.canAsk).toBe(false);
    if (state.canAsk) return;
    expect(state.fix?.href).toBe('/dashboard/sites#google-business-profile');
    expect(state.reason).not.toContain('Settings');
  });

  // The anchor has to exist, or the link scrolls nowhere.
  it('and the builder carries that anchor', () => {
    expect(read('src', 'app', 'dashboard', 'sites', 'WebsiteBuilder.tsx')).toContain('id="google-business-profile"');
  });

  /**
   * The other two blocked states are facts about this job, not errands — there
   * is no page that fixes "already asked" — so they carry no link.
   */
  it('offers no fix for the states nothing can fix', () => {
    for (const input of [
      { ...blocked, reviewUrlConfigured: true, alreadyRequested: true },
      { ...blocked, reviewUrlConfigured: true, channel: null },
    ] as const) {
      const state = reviewPillState({ ...input, sendReview: null });
      expect(state.canAsk).toBe(false);
      if (state.canAsk) continue;
      expect(state.fix).toBeUndefined();
    }
  });
});
