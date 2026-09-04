import { describe, expect, it } from 'vitest';
import { missedCallStatus, missedCallTextBack, type MissedCallInput } from '@/lib/missed-call';

const base: MissedCallInput = {
  enabled: true,
  forwardNumber: '+12485550100',
  trackingNumber: '+12485550199',
  verifiedAt: '2026-08-01T15:00:00.000Z',
};

describe('the missed-call text-back message', () => {
  it('names the business and keeps the opt-out line', () => {
    const message = missedCallTextBack('BrokePipes');
    expect(message).toContain('BrokePipes');
    // Required on every automated text, and the settings preview shows it so an
    // owner can see it is handled without asking.
    expect(message).toContain('Reply STOP to opt out.');
  });

  it('never renders an empty business name at a caller', () => {
    expect(missedCallTextBack('')).toContain('at us!');
    expect(missedCallTextBack('   ')).toContain('at us!');
  });
});

describe('what the settings card says about the connection', () => {
  it('says setup needed with no tracking number, before anything else', () => {
    // Ordering matters: with no number at all, "calls aren't reaching you" would
    // describe a problem the contractor has not created yet.
    const status = missedCallStatus({ ...base, trackingNumber: null, forwardNumber: null, verifiedAt: null });
    expect(status.tone).toBe('setup');
  });

  it('shouts when a tracking number has nothing to ring', () => {
    // The live failure: callers hear a recording instead of a phone ringing.
    const status = missedCallStatus({ ...base, forwardNumber: null });
    expect(status.tone).toBe('error');
    expect(status.detail).toContain('callers hear a recording');
  });

  it('flags that failure even when the automation is switched off', () => {
    // The dial does not depend on the switch, so neither does this.
    expect(missedCallStatus({ ...base, enabled: false, forwardNumber: null }).tone).toBe('error');
  });

  it('will not claim connected just because somebody typed a number in a box', () => {
    // The number also has to have its Voice webhook pointed at us in Twilio,
    // which is invisible from here. A real call is the only evidence.
    const status = missedCallStatus({ ...base, verifiedAt: null });
    expect(status.tone).toBe('waiting');
    expect(status.label).toBe('Waiting for the first call');
  });

  it('says connected once a real call has arrived', () => {
    expect(missedCallStatus(base).tone).toBe('live');
    expect(missedCallStatus(base).detail).toContain('automatic text-back');
  });

  it('still says connected while paused, because the phone still rings', () => {
    const status = missedCallStatus({ ...base, enabled: false });
    expect(status.tone).toBe('live');
    expect(status.detail).toContain('still ring your phone');
    expect(status.detail).not.toContain('automatic text-back');
  });

  it('does not show error when AI Voice is active without a forward number', () => {
    const status = missedCallStatus({ ...base, forwardNumber: null, aiVoiceActive: true });
    expect(status.tone).toBe('setup');
    expect(status.label).toBe('Transfer number recommended');
    expect(status.detail).toContain('AI receptionist answers your calls');
  });

  it('indicates AI receptionist handles calls when connected with AI Voice active', () => {
    const status = missedCallStatus({ ...base, aiVoiceActive: true });
    expect(status.tone).toBe('live');
    expect(status.detail).toContain('AI receptionist answers calls');
  });

  it('has no "disconnected" state', () => {
    // A released or re-pointed number sends us nothing, and silence is
    // indistinguishable from a quiet week. A red warning that fires on a slow
    // Tuesday teaches people to ignore warnings.
    const tones = [
      missedCallStatus(base),
      missedCallStatus({ ...base, verifiedAt: null }),
      missedCallStatus({ ...base, forwardNumber: null }),
      missedCallStatus({ ...base, trackingNumber: null }),
    ].map((status) => status.tone);
    expect(tones).toEqual(['live', 'waiting', 'error', 'setup']);
  });
});
