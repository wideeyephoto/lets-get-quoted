import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  preferenceForToggles,
  togglesForPreference,
  smsFailureFallback,
  resolveClientChannel,
  CLIENT_CHANNEL_PREFERENCES,
  type ClientChannelPreference,
} from '@/lib/client-channel';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');
const TOGGLES = read('src', 'components', 'channel-toggles.tsx');
const LEAD_ACTIONS = read('src', 'app', 'dashboard', 'leads', 'actions.ts');
const JOB_ACTIONS = read('src', 'app', 'dashboard', 'jobs', 'actions.ts');
const BANNER = read('src', 'app', 'dashboard', 'jobs', '[id]', 'QuoteDeliveryBanner.tsx');
const CSS = read('src', 'app', 'globals.css');
const LITE = read('src', 'app', 'globals-lite.css');

/* --- two switches, four values --------------------------------------------- */

describe('the two toggles are the four preferences', () => {
  it('maps each way round', () => {
    expect(togglesForPreference('auto')).toEqual({ sms: true, email: true });
    expect(togglesForPreference('sms')).toEqual({ sms: true, email: false });
    expect(togglesForPreference('email')).toEqual({ sms: false, email: true });
    expect(togglesForPreference('off')).toEqual({ sms: false, email: false });

    expect(preferenceForToggles({ sms: true, email: true })).toBe('auto');
    expect(preferenceForToggles({ sms: true, email: false })).toBe('sms');
    expect(preferenceForToggles({ sms: false, email: true })).toBe('email');
    expect(preferenceForToggles({ sms: false, email: false })).toBe('off');
  });

  /**
   * The mapping has to be lossless in both directions, or a contractor who
   * opens a lead and presses nothing can still have their stored setting
   * rewritten by the round trip through the buttons.
   */
  it('round-trips every stored value untouched', () => {
    for (const preference of CLIENT_CHANNEL_PREFERENCES) {
      expect(preferenceForToggles(togglesForPreference(preference)), preference).toBe(preference);
    }
  });

  it('is exhaustive — four values, four combinations, no gaps', () => {
    const seen = new Set<ClientChannelPreference>();
    for (const sms of [true, false]) for (const email of [true, false]) seen.add(preferenceForToggles({ sms, email }));
    expect([...seen].sort()).toEqual([...CLIENT_CHANNEL_PREFERENCES].sort());
  });
});

/* --- the failed text now has somewhere to go ------------------------------- */

describe('a bounced text falls back to email', () => {
  const contact = { phone: '+12485550117', email: 'dana@example.com' };

  /**
   * THE REPORTED BUG. A quote was sent to a customer with both a mobile and an
   * email; the number was wrong; the send was recorded "failed" with a
   * perfectly good address sitting unused on the same row, and the customer
   * never learned a quote existed.
   */
  it('emails it when the contractor left email switched on', () => {
    expect(smsFailureFallback({ ...contact, preference: 'auto' })).toEqual({ channel: 'email', to: 'dana@example.com' });
  });

  /** "Text only" is an instruction, and a delivery failure is not permission. */
  it('does not email a customer set to text only', () => {
    expect(smsFailureFallback({ ...contact, preference: 'sms' })).toBeNull();
  });

  it('does not email a customer switched off entirely', () => {
    expect(smsFailureFallback({ ...contact, preference: 'off' })).toBeNull();
  });

  it('has nothing to offer when there is no address', () => {
    expect(smsFailureFallback({ phone: '+12485550117', email: null, preference: 'auto' })).toBeNull();
    expect(smsFailureFallback({ phone: '+12485550117', email: '   ', preference: 'auto' })).toBeNull();
  });

  /** It fires ONLY after a real send failed — never as a first choice. */
  it('is reached from the catch, not from the routing', () => {
    const block = LEAD_ACTIONS.slice(LEAD_ACTIONS.indexOf('Quote SMS failed for job'), LEAD_ACTIONS.indexOf('} else if (clientEmail) {'));
    expect(block).toContain('smsFailureFallback(');
    expect(block).toContain("delivery = 'sms_failed_emailed'");
  });

  /** Said plainly: the number on file is wrong, and the next reminder will go
   *  to the same place unless somebody fixes it. */
  it('tells the contractor it happened', () => {
    expect(BANNER).toContain("delivery === 'sms_failed_emailed'");
    expect(BANNER).toContain('worth checking the mobile number on file');
  });
});

/* --- Create job could only ever text --------------------------------------- */

describe('the client link on a new job routes like everything else', () => {
  /**
   * `if (sendClientText && phone) { …sms… }` with NO else. A job created for a
   * customer with an email address and no mobile sent nothing at all, and said
   * nothing about it. The control was even named for the channel.
   */
  it('sends the email when there is no textable number', () => {
    const block = JOB_ACTIONS.slice(JOB_ACTIONS.indexOf('export async function createJobAction'), JOB_ACTIONS.indexOf('export async function updateJobAction'));
    expect(block).toContain('resolveClientChannel({');
    expect(block).toContain("route.channel === 'email'");
    expect(block).toContain('sendClientQuoteEmail({');
    expect(block).toContain('smsFailureFallback(');
  });

  /** A send that quietly did nothing is the bug; arriving silently is the same
   *  bug wearing a redirect. */
  it('carries the outcome to the page that can explain it', () => {
    const block = JOB_ACTIONS.slice(JOB_ACTIONS.indexOf('export async function createJobAction'), JOB_ACTIONS.indexOf('export async function updateJobAction'));
    expect(block).toContain('delivery=${delivery}');
  });

  /** The customer asked for this link, so STOP moves it to email rather than
   *  cancelling it — the same rule the quote path follows. */
  it('treats the link as requested, not as marketing', () => {
    const block = JOB_ACTIONS.slice(JOB_ACTIONS.indexOf('export async function createJobAction'), JOB_ACTIONS.indexOf('export async function updateJobAction'));
    expect(block).toContain("kind: 'requested'");
  });
});

/* --- the control itself ---------------------------------------------------- */

describe('the toggles', () => {
  it('are two switches, not a dropdown', () => {
    expect(TOGGLES).toContain('role="switch"');
    expect(TOGGLES).toContain('aria-checked={available && on}');
    // Comments out first — this file's own docs explain what it replaced.
    const markup = TOGGLES.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(markup).not.toContain('<select');
  });

  /**
   * "Text" alone is a promise the form cannot keep. A channel with nothing to
   * send to is shown off AND disabled, saying which detail is missing — off and
   * cannot-be-on are different states.
   */
  it('name their own destination and refuse to switch on without one', () => {
    expect(TOGGLES).toContain('missing="No mobile on file"');
    expect(TOGGLES).toContain('missing="No email on file"');
    expect(TOGGLES).toContain('disabled={!available}');
    expect(CSS).toContain('.chan-toggle.is-missing');
  });

  it('ships to both sheets', () => {
    for (const rule of ['.chan-toggle', '.chan-toggles-row', '.chan-toggles-mirror']) {
      expect(CSS, rule).toContain(rule);
      expect(LITE, rule).toContain(rule);
    }
  });

  /** Both on is 'auto', which is text-first — so the promise only appears where
   *  it can actually be kept. */
  it('only promises the fallback where it can happen', () => {
    const preview = read('src', 'app', 'dashboard', 'leads', '[leadId]', 'QuoteDeliveryPreview.tsx');
    expect(preview).toContain("channel === 'auto' && phone && email");
    expect(resolveClientChannel({ phone: '+12485550117', email: 'a@b.com', preference: 'auto' }).channel).toBe('sms');
  });
});
