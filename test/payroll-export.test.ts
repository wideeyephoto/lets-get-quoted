import { describe, it, expect } from 'vitest';
import { buildPayrollExport, exportableRows, normalizePayrollProvider, type PayrollProvider } from '@/lib/payroll-export';
import type { CrewPayRow } from '@/lib/crew-pay';
import type { PayType } from '@/lib/pay-types';

// A CrewPayRow is wide and almost none of it matters here — the export reads
// about eight fields. Everything else is filled in so the type is satisfied.
function row(over: Partial<CrewPayRow> & { name: string }): CrewPayRow {
  return {
    crewId: `id-${over.name.replace(/\s+/g, '')}`,
    // No `name` here: `over` is typed to always carry one, and the `...over`
    // spread below already sets it. Writing it twice meant the first was dead.
    roleLabel: 'Crew',
    rate: 30,
    rateVaries: false,
    hours: 40,
    regularHours: 40,
    overtimeHours: 0,
    estimatedPay: 1200,
    jobIds: [],
    entryCount: 1,
    issues: [],
    entries: [],
    payType: 'hourly' as PayType,
    payBasis: 'Hours logged × rate',
    overtimePaid: true,
    workedDays: 5,
    payProblem: null,
    status: 'approved',
    review: 'approved',
    payment: 'unpaid',
    eligible: true,
    ineligibleReason: null,
    warnings: [],
    blockers: [],
    record: null,
    approvedAmount: 1200,
    paidAmount: null,
    adjustment: 0,
    payrollId: null,
    locked: false,
    paymentLabel: null,
    paymentDetail: null,
    ...over,
  } as CrewPayRow;
}

const opts = (provider: PayrollProvider) => ({
  provider,
  rangeLabel: 'Jul 26 – Aug 1',
  periodEndKey: '2026-08-01',
});

const lines = (csv: string) => csv.split('\n');
const header = (csv: string) => lines(csv)[0];

describe('exportableRows', () => {
  it('keeps only approved, unpaid, attributable rows', () => {
    const { rows, excluded } = exportableRows([
      row({ name: 'Approved Alice' }),
      row({ name: 'Draft Dan', review: 'draft', status: 'draft' }),
      row({ name: 'Paid Pat', payment: 'paid', status: 'paid' }),
      row({ name: 'Unassigned', crewId: null, eligible: false, ineligibleReason: 'Nobody attached.' }),
    ]);
    expect(rows.map((r) => r.name)).toEqual(['Approved Alice']);
    expect(excluded).toHaveLength(3);
  });

  it('says WHY a paid row is out, because that one would double-pay', () => {
    const { excluded } = exportableRows([row({ name: 'Paid Pat', payment: 'paid', status: 'paid' })]);
    expect(excluded[0].reason).toContain('twice');
  });
});

describe('salaried staff are never in an hours import', () => {
  // The whole reason this module exists. The provider already pays them from
  // the salary on file; a row here is a second payment in the same run.
  it('leaves them out and says so', () => {
    const result = buildPayrollExport(
      [row({ name: 'Sam Salary', payType: 'salary', payBasis: 'Salary $72,000.00/yr ÷ 52 weeks', estimatedPay: 1384.62 })],
      opts('gusto'),
    );
    expect(result.included).toBe(0);
    expect(result.excluded).toHaveLength(1);
    expect(result.excluded[0].reason).toContain('twice');
    expect(result.csv).not.toContain('Sam');
    expect(result.csv).not.toContain('1384.62');
  });

  it('still exports the hourly people beside them', () => {
    const result = buildPayrollExport(
      [row({ name: 'Sam Salary', payType: 'salary' }), row({ name: 'Holly Hourly' })],
      opts('gusto'),
    );
    expect(result.included).toBe(1);
    expect(result.csv).toContain('Holly');
  });
});

describe('day rate carries money, hours do not', () => {
  it('sends a gross amount and no hours', () => {
    const result = buildPayrollExport(
      [row({ name: 'Dee Day', payType: 'day_rate', overtimePaid: false, estimatedPay: 960, regularHours: 21, workedDays: 3 })],
      opts('generic'),
    );
    expect(result.included).toBe(1);
    const body = lines(result.csv)[1];
    expect(body).toContain('960.00');
    expect(body).toContain('Day rate');
    // The hours columns must be blank — a provider that reads both would pay
    // for the hours AND the amount.
    expect(body.split(',')[3]).toBe('');
    expect(body.split(',')[4]).toBe('');
  });

  it('explains why, since no provider has a day-rate concept', () => {
    const result = buildPayrollExport([row({ name: 'Dee Day', payType: 'day_rate', overtimePaid: false })], opts('adp'));
    expect(result.notes.some((note) => note.includes('day rate'))).toBe(true);
  });
});

describe('provider shapes', () => {
  const people = [row({ name: 'Holly Hourly', regularHours: 40, overtimeHours: 5, payrollId: '004821' })];

  it('gusto: one line per employee, hours in columns', () => {
    const result = buildPayrollExport(people, opts('gusto'));
    expect(header(result.csv)).toBe('Employee ID,First name,Last name,Regular hours,Overtime hours,Bonus');
    expect(lines(result.csv)[1]).toBe('004821,Holly,Hourly,40,5,');
  });

  it('quickbooks: one line per payroll item, so overtime is its own row', () => {
    const result = buildPayrollExport(people, opts('quickbooks'));
    expect(lines(result.csv)).toHaveLength(3);
    expect(result.csv).toContain('Regular Pay');
    expect(result.csv).toContain('Overtime Pay');
  });

  it('quickbooks: omits a zero-hour line rather than sending a 0', () => {
    const result = buildPayrollExport([row({ name: 'No OT', regularHours: 40, overtimeHours: 0 })], opts('quickbooks'));
    expect(result.csv).not.toContain('Overtime Pay');
    expect(lines(result.csv)).toHaveLength(2);
  });

  it('adp: keyed on File #, with the per-client fields left blank not guessed', () => {
    const result = buildPayrollExport(people, opts('adp'));
    expect(header(result.csv)).toContain('File #');
    const body = lines(result.csv)[1].split(',');
    expect(body[0]).toBe(''); // Co Code — per client, ours to leave alone
    expect(body[1]).toBe(''); // Batch ID
    expect(body[2]).toBe('004821');
  });

  it('paychex: one line per earnings code', () => {
    const result = buildPayrollExport(people, opts('paychex'));
    expect(result.csv).toContain('REG');
    expect(result.csv).toContain('OT');
  });

  it('splits a name into first and last without losing a middle one', () => {
    const result = buildPayrollExport([row({ name: 'Jean Luc Picard' })], opts('gusto'));
    expect(lines(result.csv)[1]).toContain('Jean Luc,Picard');
  });
});

describe('problems that would break the import', () => {
  it('names the crew with no payroll id, for providers that match on it', () => {
    const result = buildPayrollExport([row({ name: 'Holly Hourly', payrollId: null })], opts('adp'));
    expect(result.problems.join(' ')).toContain('Holly Hourly');
    expect(result.problems.join(' ')).toContain('employee id');
  });

  it('stays quiet about ids for providers that match on a name', () => {
    const result = buildPayrollExport([row({ name: 'Holly Hourly', payrollId: null })], opts('gusto'));
    expect(result.problems).toHaveLength(0);
  });

  it('shouts when the period has already gone to payroll once', () => {
    const result = buildPayrollExport([row({ name: 'Holly Hourly' })], { ...opts('gusto'), alreadySent: true });
    expect(result.problems.join(' ')).toContain('twice');
  });
});

describe('what the file never claims', () => {
  it('always says tax and deductions are the provider’s job', () => {
    for (const provider of ['generic', 'gusto', 'quickbooks', 'adp', 'paychex'] as PayrollProvider[]) {
      const result = buildPayrollExport([row({ name: 'Holly Hourly' })], opts(provider));
      expect(result.notes.some((note) => note.toLowerCase().includes('tax'))).toBe(true);
      // And that the column names are a standard template, not a promise.
      expect(result.notes.some((note) => note.includes('template'))).toBe(true);
    }
  });
});

describe('normalizePayrollProvider', () => {
  it('falls back to a plain spreadsheet for anything unknown', () => {
    expect(normalizePayrollProvider('gusto')).toBe('gusto');
    expect(normalizePayrollProvider('workday')).toBe('generic');
    expect(normalizePayrollProvider(null)).toBe('generic');
  });
});

describe('csv safety', () => {
  it('quotes a name containing a comma rather than shifting every column', () => {
    const result = buildPayrollExport([row({ name: 'Smith, Jr' })], opts('generic'));
    expect(result.csv).toContain('"Smith, Jr"');
  });
});
