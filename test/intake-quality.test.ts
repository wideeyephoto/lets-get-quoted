import { describe, it, expect } from 'vitest';
import { intakeQuality, groupStatus, type IntakeQualityInput } from '@/lib/intake-quality';

// The panel beside the tick boxes claims things about lead quality. Those claims
// have to move when the settings do — a panel that always reads "Strong impact"
// is a graphic, and the only reason it sits next to the switches is so a
// contractor can watch a claim change when they flip one.

const bare: IntakeQualityInput = {
  askTimeline: false,
  serviceAreaGate: false,
  phoneVerification: false,
  minJobAmount: 0,
  exclusionCount: 0,
  emailField: 'off',
  fullyBooked: false,
};

const tuned: IntakeQualityInput = {
  askTimeline: true,
  serviceAreaGate: true,
  phoneVerification: true,
  minJobAmount: 500,
  exclusionCount: 2,
  emailField: 'required',
  fullyBooked: false,
};

describe('intakeQuality', () => {
  it('scores a fully-tuned intake High and an untouched one Low', () => {
    expect(intakeQuality(tuned).score).toBe('High');
    expect(intakeQuality(bare).score).toBe('Low');
  });

  it('will not call an intake High while anything is outright missing', () => {
    // Filters hard, sets expectations, but never asks for an email and doesn't
    // verify the number. Two strengths and one real gap is not a high-quality
    // intake, and calling it one is the flattery this panel exists to avoid.
    const noReach = intakeQuality({ ...tuned, emailField: 'off', phoneVerification: false });
    expect(noReach.signals.find((s) => s.key === 'response')!.tone).toBe('weak');
    expect(noReach.score).not.toBe('High');
  });

  it('moves a signal the moment its own setting moves', () => {
    const before = intakeQuality({ ...bare, askTimeline: true });
    const after = intakeQuality({ ...bare, askTimeline: true, serviceAreaGate: true });
    expect(before.signals[0].tone).toBe('medium');
    expect(after.signals[0].tone).toBe('strong');
    expect(after.filtersOn).toBe(2);
  });

  it('says what is wrong rather than praising nothing', () => {
    const signals = intakeQuality(bare).signals;
    expect(signals[0].title).toBe('Nothing is qualifying your leads');
    expect(signals[1].title).toBe('You haven’t said which jobs you want');
    expect(signals[2].title).toBe('You only have an unverified phone number');
    expect(signals.every((s) => s.label === 'Low impact')).toBe(true);
  });

  it('counts the filters it names, so the wording cannot drift from the number', () => {
    const q = intakeQuality({ ...bare, askTimeline: true, phoneVerification: true });
    expect(q.filtersOn).toBe(2);
    expect(q.filtersTotal).toBe(3);
    expect(q.signals[0].detail).toContain('2 of 3 lead filters');
  });

  it('reads an optional email as collecting one — it is still asked for', () => {
    const optional = intakeQuality({ ...bare, emailField: 'optional' });
    const off = intakeQuality({ ...bare, emailField: 'off' });
    expect(optional.signals[2].tone).toBe('medium');
    expect(off.signals[2].tone).toBe('weak');
  });

  it('pluralises an exclusion count rather than saying "1 excluded job types"', () => {
    expect(intakeQuality({ ...bare, exclusionCount: 1 }).signals[1].detail).toContain('1 excluded job type —');
    expect(intakeQuality({ ...bare, exclusionCount: 3 }).signals[1].detail).toContain('3 excluded job types');
  });
});

describe('groupStatus', () => {
  it('counts what is set rather than asserting it', () => {
    const status = groupStatus(tuned);
    expect(status.asks).toBe('Essentials complete');
    expect(status.filters).toBe('3 of 3 filters enabled');
    expect(status.preferences).toBe('2 of 3 set');
  });

  it('says "Phone only" when the intake never asks for an email', () => {
    expect(groupStatus({ ...tuned, emailField: 'off' }).asks).toBe('Phone only');
  });

  it('calls job preferences Optional while none are set, because they are', () => {
    expect(groupStatus(bare).preferences).toBe('Optional');
    expect(groupStatus(bare).filters).toBe('0 of 3 filters enabled');
  });
});
