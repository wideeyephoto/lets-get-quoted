import { describe, expect, it } from 'vitest';
import { INITIAL_JOB_TOUR_STATE, jobTourTotals, restoreJobTourState, updateJobTourState } from '@/lib/job-lifecycle-tour';

describe('Compact public job lifecycle', () => {
  it('keeps quote, deposit and remaining balance consistent for both upgrade choices', () => {
    expect(jobTourTotals(true)).toEqual({ subtotal: 1450, upgrade: 320, total: 1770, deposit: 725, balance: 1045 });
    expect(jobTourTotals(false)).toEqual({ subtotal: 1450, upgrade: 0, total: 1450, deposit: 725, balance: 725 });
  });
  it('does not turn a skipped approval step into a signature, payment or booking', () => {
    const preview = updateJobTourState(INITIAL_JOB_TOUR_STATE, { step: 'approve' });
    expect(preview.signed).toBe(false);
    expect(preview.depositSimulated).toBe(false);
    expect(preview.booked).toBe(false);
  });
  it('requires signature before simulated payment and payment before booking', () => {
    const attempted = updateJobTourState(INITIAL_JOB_TOUR_STATE, { depositSimulated: true, booked: true });
    expect(attempted.depositSimulated).toBe(false);
    expect(attempted.booked).toBe(false);
    const signed = updateJobTourState(attempted, { signed: true });
    const paid = updateJobTourState(signed, { depositSimulated: true });
    expect(updateJobTourState(paid, { booked: true }).booked).toBe(true);
  });
  it('invalidates approval and its result when the visitor changes the quote amount', () => {
    const previous = { ...INITIAL_JOB_TOUR_STATE, intakeAnalyzed: true, quoteSent: true, signed: true, depositSimulated: true, booked: true };
    const next = updateJobTourState(previous, { upgradeSelected: false });
    expect(next).toMatchObject({ intakeAnalyzed: true, upgradeSelected: false, quoteSent: false, signed: false, depositSimulated: false, booked: false });
    expect(previous.booked).toBe(true);
  });
  it('restores valid progress but rejects malformed storage and impossible paid states', () => {
    for (const raw of [null, '{', 'null', 'false']) expect(restoreJobTourState(raw)).toEqual(INITIAL_JOB_TOUR_STATE);
    expect(restoreJobTourState('{"signed":"false","depositSimulated":true,"booked":true,"step":"bogus"}')).toMatchObject({ signed: false, depositSimulated: false, booked: false, step: 'site' });
    const saved = { ...INITIAL_JOB_TOUR_STATE, step: 'quote', signed: true, depositSimulated: true, booked: true };
    expect(restoreJobTourState(JSON.stringify(saved))).toEqual(saved);
  });
});
