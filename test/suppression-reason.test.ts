import { describe, it, expect } from 'vitest';
import { suppressionReasonFor } from '@/lib/email-suppression';

// The Resend webhook recorded bounces into email_events and stopped there, so a
// hard-bouncing address was re-sent to on every campaign forever. This is the
// decision that fixes it, and it is wrong in both directions if got wrong:
// suppress a transient bounce and a real customer silently stops receiving
// their quotes; miss a permanent one and the sending domain's reputation pays
// for it, for every contractor sharing that domain.

describe('a complaint always stops the sending', () => {
  it('does not care what else is on the event', () => {
    expect(suppressionReasonFor({ status: 'complained' })).toBe('complaint');
    expect(suppressionReasonFor({ status: 'complained', bounceType: 'Transient' })).toBe('complaint');
  });
});

describe('a provider-suppressed send stays suppressed locally', () => {
  it('mirrors Resend account-level suppression into the tagged workspace', () => {
    expect(suppressionReasonFor({ status: 'suppressed' })).toBe('provider_suppressed');
  });
});

describe('a bounce stops it only when the provider says permanent', () => {
  it('suppresses a permanent bounce', () => {
    expect(suppressionReasonFor({ status: 'bounced', bounceType: 'Permanent' })).toBe('hard_bounce');
  });

  it('is not fooled by case or padding from the provider', () => {
    expect(suppressionReasonFor({ status: 'bounced', bounceType: 'permanent' })).toBe('hard_bounce');
    expect(suppressionReasonFor({ status: 'bounced', bounceType: ' PERMANENT ' })).toBe('hard_bounce');
  });

  // A full or briefly unreachable mailbox. Cutting somebody off over one bad
  // afternoon is the expensive mistake, and it is silent.
  it('leaves a transient bounce alone', () => {
    expect(suppressionReasonFor({ status: 'bounced', bounceType: 'Transient' })).toBeNull();
  });

  // The far end did not say. Treating a maybe as a no is the costly guess.
  it('treats undetermined as transient', () => {
    expect(suppressionReasonFor({ status: 'bounced', bounceType: 'Undetermined' })).toBeNull();
  });

  it('does nothing when the provider sent no classification at all', () => {
    expect(suppressionReasonFor({ status: 'bounced' })).toBeNull();
    expect(suppressionReasonFor({ status: 'bounced', bounceType: null })).toBeNull();
    expect(suppressionReasonFor({ status: 'bounced', bounceType: '' })).toBeNull();
  });
});

describe('every other lifecycle event is left alone', () => {
  it('never suppresses on a successful send', () => {
    for (const status of ['sent', 'delivered', 'delayed', 'failed', 'unknown', '']) {
      expect(suppressionReasonFor({ status }), `${status} should not suppress`).toBeNull();
    }
  });

  // A delayed message that carries a bounce object from an earlier attempt must
  // not be read as a bounce.
  it('reads the status, not the presence of a bounce object', () => {
    expect(suppressionReasonFor({ status: 'delayed', bounceType: 'Permanent' })).toBeNull();
    expect(suppressionReasonFor({ status: 'delivered', bounceType: 'Permanent' })).toBeNull();
  });
});
