import { describe, it, expect } from 'vitest';
import { checkMyPay, checkSentence, hoursLabel, myPayStanding, toleranceFor, type MyPayLine, type MyPayRecord } from '@/lib/my-pay';
import { payDayView, type PayDaySettings } from '@/lib/pay-day';

const line = (over: Partial<MyPayLine> & { costId: string }): MyPayLine => ({
  jobId: null,
  description: 'Rough-in',
  loggedAt: '2026-07-28T14:00:00Z',
  hours: 8,
  rate: 36,
  amount: 288,
  ...over,
});

const settings: PayDaySettings = { delayDays: 5, weekday: null, chosen: true };

const payDay = (todayKey: string, over: { hasHours?: boolean; allPaid?: boolean } = {}) =>
  payDayView({
    periodEndKey: '2026-08-01',
    todayKey,
    settings,
    hasHours: over.hasHours ?? true,
    allPaid: over.allPaid ?? false,
  });

const formatDate = (key: string) => key;

describe('hoursLabel', () => {
  it('reads the way somebody says it out loud', () => {
    expect(hoursLabel(7.5)).toBe('7h 30m');
    expect(hoursLabel(8)).toBe('8h');
    expect(hoursLabel(0.25)).toBe('15m');
    expect(hoursLabel(0)).toBe('0h');
  });

  it('does not produce "7h 60m"', () => {
    // 7.999 rounds to 60 minutes, which has to carry rather than print.
    expect(hoursLabel(7.999)).toBe('8h');
  });

  it('survives nonsense rather than rendering NaN at somebody', () => {
    expect(hoursLabel(Number.NaN)).toBe('0h');
    expect(hoursLabel(-3)).toBe('0h');
  });
});

describe('myPayStanding', () => {
  const base = { loggedHours: 20, loggedAmount: 720, formatDate };

  it('is quiet while the period is still running', () => {
    const standing = myPayStanding({ ...base, record: null, periodOver: false, payDay: payDay('2026-07-30') });
    expect(standing.stage).toBe('open');
    expect(standing.headline).toBe('$720.00 so far');
    // A week that hasn't finished cannot be late, whatever the pay day says.
    expect(standing.tone).toBe('muted');
  });

  it('says what is waiting once the period has ended', () => {
    const standing = myPayStanding({ ...base, record: null, periodOver: true, payDay: payDay('2026-08-03') });
    expect(standing.stage).toBe('pending');
    expect(standing.detail).toContain('Not approved yet');
  });

  it('takes an overdue tone from the pay day', () => {
    const standing = myPayStanding({ ...base, record: null, periodOver: true, payDay: payDay('2026-08-10') });
    expect(standing.tone).toBe('alert');
    expect(standing.detail).toContain('days ago');
  });

  it('stays muted when there is nothing owed, however overdue the date', () => {
    const standing = myPayStanding({
      ...base,
      loggedHours: 0,
      loggedAmount: 0,
      record: null,
      periodOver: true,
      payDay: payDay('2026-08-10', { hasHours: false }),
    });
    expect(standing.tone).toBe('muted');
    expect(standing.detail).toBe('No hours logged in this period.');
  });

  it('shows the APPROVED amount once one exists, not the live total', () => {
    // The live entries say $720. What was agreed says $684. Showing the live
    // figure would quietly hide that they disagree, which is the one thing this
    // screen is for.
    const record: MyPayRecord = {
      status: 'approved',
      regularHours: 19,
      overtimeHours: 0,
      approvedAmount: 684,
      approvedAt: '2026-08-02T12:00:00Z',
      paidAmount: null,
      paymentDate: null,
      paymentMethod: null,
    };
    const standing = myPayStanding({ ...base, record, periodOver: true, payDay: payDay('2026-08-04') });
    expect(standing.stage).toBe('approved');
    expect(standing.amount).toBe(684);
    expect(standing.headline).toBe('$684.00 approved');
  });

  it('does not call money "paid" while it is only sent to payroll', () => {
    const record: MyPayRecord = {
      status: 'sent',
      regularHours: 19,
      overtimeHours: 0,
      approvedAmount: 684,
      approvedAt: '2026-08-02T12:00:00Z',
      paidAmount: null,
      paymentDate: null,
      paymentMethod: null,
    };
    const standing = myPayStanding({ ...base, record, periodOver: true, payDay: payDay('2026-08-06') });
    expect(standing.stage).toBe('sent');
    expect(standing.headline).toBe('$684.00 on the way');
    expect(standing.headline).not.toContain('Paid');
    // Never alert on a period whose money is already moving.
    expect(standing.tone).not.toBe('alert');
  });

  it('reports what was actually paid, not what was approved', () => {
    const record: MyPayRecord = {
      status: 'paid',
      regularHours: 19,
      overtimeHours: 0,
      approvedAmount: 684,
      approvedAt: '2026-08-02T12:00:00Z',
      paidAmount: 650,
      paymentDate: '2026-08-06',
      paymentMethod: 'check',
    };
    const standing = myPayStanding({ ...base, record, periodOver: true, payDay: payDay('2026-08-08', { allPaid: true }) });
    expect(standing.headline).toBe('Paid $650.00');
    expect(standing.detail).toContain('2026-08-06');
    expect(standing.detail).toContain('Check');
    expect(standing.tone).toBe('ok');
  });
});

describe('checkMyPay', () => {
  const approvedAt = '2026-08-02T12:00:00Z';

  it('says nothing when the approval matches what was logged', () => {
    const entries = [line({ costId: 'a' }), line({ costId: 'b', hours: 4, amount: 144 })];
    const check = checkMyPay({ logged: entries, approved: entries, approvedAt });
    expect(check.clean).toBe(true);
    expect(checkSentence(check)).toBeNull();
    expect(check.approvedHours).toBe(12);
  });

  it('flags a shift that was logged before approval and left out of it', () => {
    const logged = [line({ costId: 'a' }), line({ costId: 'b', hours: 6, loggedAt: '2026-07-30T14:00:00Z' })];
    const check = checkMyPay({ logged, approved: [line({ costId: 'a' })], approvedAt });
    expect(check.notIncluded.map((entry) => entry.costId)).toEqual(['b']);
    expect(check.clean).toBe(false);
    expect(checkSentence(check)).toContain('not in it');
  });

  it('does NOT flag work logged after the approval was made', () => {
    // Normal, not a problem — and calling it a problem every week would teach
    // somebody to ignore this screen.
    const logged = [line({ costId: 'a' }), line({ costId: 'c', loggedAt: '2026-08-03T09:00:00Z' })];
    const check = checkMyPay({ logged, approved: [line({ costId: 'a' })], approvedAt });
    expect(check.loggedAfter.map((entry) => entry.costId)).toEqual(['c']);
    expect(check.notIncluded).toHaveLength(0);
    expect(check.clean).toBe(true);
  });

  it('flags an entry whose hours moved after it was approved', () => {
    const check = checkMyPay({
      logged: [line({ costId: 'a', hours: 6, amount: 216 })],
      approved: [line({ costId: 'a', hours: 8, amount: 288 })],
      approvedAt,
    });
    expect(check.adjusted).toHaveLength(1);
    expect(check.adjusted[0].nowHours).toBe(6);
    expect(checkSentence(check)).toContain('changed after it was approved');
  });

  it('flags an entry whose RATE moved, even when the hours did not', () => {
    const check = checkMyPay({
      logged: [line({ costId: 'a', rate: 30, amount: 240 })],
      approved: [line({ costId: 'a', rate: 36, amount: 288 })],
      approvedAt,
    });
    expect(check.adjusted).toHaveLength(1);
  });

  it('flags an approved entry whose labor row has been deleted', () => {
    const check = checkMyPay({ logged: [], approved: [line({ costId: 'a' })], approvedAt });
    expect(check.removed).toHaveLength(1);
    expect(checkSentence(check)).toContain('been removed');
  });

  it('treats a frozen line that lost its cost id as removed', () => {
    const orphan = { ...line({ costId: 'x' }), costId: null };
    const check = checkMyPay({ logged: [line({ costId: 'a' })], approved: [orphan], approvedAt });
    expect(check.removed).toHaveLength(1);
  });

  it('compares nothing until there is an approval to compare against', () => {
    const check = checkMyPay({ logged: [line({ costId: 'a' })], approved: [], approvedAt: null });
    expect(check.clean).toBe(true);
    expect(check.notIncluded).toHaveLength(0);
    expect(check.loggedAfter).toHaveLength(0);
    expect(check.loggedHours).toBe(8);
  });

  it('calls an unmatched entry "logged later" when there is no approval time to judge by', () => {
    // The harmless reading is the safer one to assert.
    const check = checkMyPay({ logged: [line({ costId: 'z' })], approved: [line({ costId: 'a' })], approvedAt: null });
    expect(check.loggedAfter).toHaveLength(1);
    expect(check.notIncluded).toHaveLength(0);
  });

  it('lists every mismatch in one sentence', () => {
    const check = checkMyPay({
      logged: [line({ costId: 'a', hours: 6, amount: 216 }), line({ costId: 'b', loggedAt: '2026-07-29T09:00:00Z' })],
      approved: [line({ costId: 'a', hours: 8 }), line({ costId: 'gone' })],
      approvedAt,
    });
    const sentence = checkSentence(check) ?? '';
    expect(sentence).toContain('not in it');
    expect(sentence).toContain('changed');
    expect(sentence).toContain('removed');
    expect(sentence.endsWith('Worth asking about before payday.')).toBe(true);
  });
});

describe('rounding tolerance', () => {
  it('does not report the account rounding rule as a discrepancy', () => {
    // 7.9 logged, approved at 8 — which is exactly what the quarter-hour rule
    // does to it. That is the rule working, not somebody gaining six minutes.
    const check = checkMyPay({
      logged: [line({ costId: 'a', hours: 7.9 })],
      approved: [line({ costId: 'a', hours: 8 })],
      approvedAt: '2026-08-02T12:00:00Z',
      tolerance: toleranceFor('quarter'),
    });
    expect(check.adjusted).toHaveLength(0);
    expect(check.clean).toBe(true);
  });

  it('flags a gap wider than the rule could have produced', () => {
    // Quarter-hour rounding can move an entry by at most 0.125. A 0.15 gap is
    // something else, and has to survive the tolerance.
    const check = checkMyPay({
      logged: [line({ costId: 'a', hours: 7.9 })],
      approved: [line({ costId: 'a', hours: 7.75 })],
      approvedAt: '2026-08-02T12:00:00Z',
      tolerance: toleranceFor('quarter'),
    });
    expect(check.adjusted).toHaveLength(1);
  });

  it('still catches a difference bigger than rounding can explain', () => {
    const check = checkMyPay({
      logged: [line({ costId: 'a', hours: 7.5 })],
      approved: [line({ costId: 'a', hours: 8 })],
      approvedAt: '2026-08-02T12:00:00Z',
      tolerance: toleranceFor('quarter'),
    });
    expect(check.adjusted).toHaveLength(1);
  });

  it('is tight when the account rounds nothing', () => {
    // The same pair the quarter-hour rule forgives is a real difference here,
    // because with no rounding rule nothing could have moved it.
    const check = checkMyPay({
      logged: [line({ costId: 'a', hours: 7.9 })],
      approved: [line({ costId: 'a', hours: 8 })],
      approvedAt: '2026-08-02T12:00:00Z',
      tolerance: toleranceFor('none'),
    });
    expect(check.adjusted).toHaveLength(1);
  });
});
