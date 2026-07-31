// Handing a pay period to a payroll provider.
//
// THE THING THIS GETS RIGHT THAT A PLAIN CSV DOES NOT. A payroll provider
// already knows what it pays a salaried employee. Putting that person in an
// hours import — with hours, or worse with their salary as an earnings line —
// pays them twice in one run. So the shape of a row depends on how the person
// is paid, not just on which provider is receiving it:
//
//   hourly    -> hours. The provider holds the rate and does the arithmetic.
//   salary    -> NOTHING. The provider pays them from the salary on file.
//                They are reported as deliberately excluded, with the reason,
//                rather than silently dropped.
//   day rate  -> a gross amount. The provider has no concept of a day rate, so
//                this is the one case where we send money rather than hours.
//
// WHAT WE CANNOT SEND, and the UI says so: tax, withholding, deductions,
// benefits, and W-2 vs 1099 classification. This product holds none of them.
// The file is gross hours and gross amounts; the provider computes the rest.
//
// ABOUT THE COLUMN NAMES. These follow each provider's standard import
// template. Both ADP and Paychex are configured per client, and any provider
// can be set up with a custom template, so the first import of a new account
// has to be eyeballed — `notes` says that on every export rather than implying
// a guarantee we can't make.
//
// Pure and client-safe: the download happens in the browser.

import type { CrewPayRow } from './crew-pay';
import type { PayType } from './pay-types';

export type PayrollProvider = 'generic' | 'gusto' | 'quickbooks' | 'adp' | 'paychex';

export const PAYROLL_PROVIDERS: PayrollProvider[] = ['generic', 'gusto', 'quickbooks', 'adp', 'paychex'];

export const PAYROLL_PROVIDER_LABEL: Record<PayrollProvider, string> = {
  generic: 'A spreadsheet (any provider, or a bookkeeper)',
  gusto: 'Gusto',
  quickbooks: 'QuickBooks Payroll',
  adp: 'ADP',
  paychex: 'Paychex',
};

/** Whether this provider matches on its own employee id rather than on a name. */
const NEEDS_PAYROLL_ID: Record<PayrollProvider, boolean> = {
  generic: false,
  gusto: false,
  quickbooks: false,
  // Both of these import against their own employee number and will reject or
  // mis-assign a row without one.
  adp: true,
  paychex: true,
};

export function normalizePayrollProvider(value: unknown): PayrollProvider {
  return PAYROLL_PROVIDERS.includes(value as PayrollProvider) ? (value as PayrollProvider) : 'generic';
}

export type ExportRow = {
  crewId: string | null;
  name: string;
  payrollId: string | null;
  payType: PayType;
  regularHours: number;
  overtimeHours: number;
  amount: number;
};

export type PayrollExport = {
  provider: PayrollProvider;
  filename: string;
  csv: string;
  /** Rows actually in the file. */
  included: number;
  /** Rows deliberately left out, each with the reason a person would accept. */
  excluded: Array<{ name: string; reason: string }>;
  /** Things to check before importing. Never empty — see the note about templates. */
  notes: string[];
  /** Things that will break the import if ignored. */
  problems: string[];
};

const round2 = (value: number) => Math.round((Number(value) || 0) * 100) / 100;

function csvCell(value: string | number): string {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(grid: (string | number)[][]): string {
  return grid.map((line) => line.map(csvCell).join(',')).join('\n');
}

function splitName(name: string): { first: string; last: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: '', last: '' };
  if (parts.length === 1) return { first: parts[0], last: '' };
  return { first: parts.slice(0, -1).join(' '), last: parts[parts.length - 1] };
}

/**
 * Which rows belong in a file that is going to pay people.
 *
 * Only approved-or-later. Draft hours are a number nobody has agreed to, and a
 * file that mixes them with approved ones is the file somebody pays from twice
 * — the same reason the generic export carries status columns.
 */
export function exportableRows(rows: CrewPayRow[]): { rows: CrewPayRow[]; excluded: Array<{ name: string; reason: string }> } {
  const included: CrewPayRow[] = [];
  const excluded: Array<{ name: string; reason: string }> = [];
  for (const row of rows) {
    if (!row.eligible || !row.crewId) {
      excluded.push({ name: row.name, reason: row.ineligibleReason ?? 'Nobody is attached to these hours, so there is nobody to pay.' });
      continue;
    }
    if (row.review !== 'approved') {
      excluded.push({ name: row.name, reason: 'Not approved yet — approve the hours before sending them to payroll.' });
      continue;
    }
    if (row.payment === 'paid') {
      excluded.push({ name: row.name, reason: 'Already marked paid for this period. Sending it again would pay them twice.' });
      continue;
    }
    included.push(row);
  }
  return { rows: included, excluded };
}

/**
 * Build the file.
 *
 * `rows` should already be the approved set — pass them through exportableRows
 * first. This function still reports salaried staff as excluded, because that
 * exclusion is about how they are PAID rather than about their status, and the
 * owner has to be told either way.
 */
export function buildPayrollExport(
  rows: CrewPayRow[],
  options: { provider: PayrollProvider; rangeLabel: string; periodEndKey: string; alreadySent?: boolean },
): PayrollExport {
  const provider = options.provider;
  const excluded: Array<{ name: string; reason: string }> = [];
  const problems: string[] = [];

  const payable: ExportRow[] = [];
  for (const row of rows) {
    if (row.payType === 'salary') {
      // The whole point. Their salary is already on file with the provider.
      excluded.push({
        name: row.name,
        reason: `Salaried — ${PAYROLL_PROVIDER_LABEL[provider]} pays them from the salary on file. Putting them in an hours import would pay them twice.`,
      });
      continue;
    }
    payable.push({
      crewId: row.crewId,
      name: row.name,
      payrollId: row.payrollId ?? null,
      payType: row.payType,
      regularHours: round2(row.regularHours),
      overtimeHours: round2(row.overtimeHours),
      amount: round2(row.estimatedPay),
    });
  }

  const missingIds = payable.filter((row) => !row.payrollId).map((row) => row.name);
  if (NEEDS_PAYROLL_ID[provider] && missingIds.length > 0) {
    problems.push(
      `${missingIds.length === 1 ? 'One crew member has' : `${missingIds.length} crew members have`} no ${PAYROLL_PROVIDER_LABEL[provider]} employee id: ${missingIds.join(', ')}. ${PAYROLL_PROVIDER_LABEL[provider]} matches on that id, not on a name, so those rows won't land. Add it on the crew member.`,
    );
  }

  if (options.alreadySent) {
    problems.push('This period has already been sent to payroll once. Importing it again would pay everybody in it twice.');
  }

  const notes: string[] = [
    `Column names follow ${PAYROLL_PROVIDER_LABEL[provider]}'s standard import template. Accounts set up with a custom template may need the headers renamed — worth checking the first time.`,
    'Gross hours and amounts only. Tax, withholding, deductions and benefits are your provider’s job — this product holds none of them.',
  ];
  const dayRateCount = payable.filter((row) => row.payType === 'day_rate').length;
  if (dayRateCount > 0) {
    notes.push(
      `${dayRateCount === 1 ? 'One crew member is' : `${dayRateCount} crew members are`} on a day rate, so they carry a gross amount rather than hours — no provider has a concept of a day rate.`,
    );
  }

  const slug = options.rangeLabel.replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
  return {
    provider,
    filename: `payroll-${provider}-${slug || options.periodEndKey}.csv`,
    csv: gridFor(provider, payable, options),
    included: payable.length,
    excluded,
    notes,
    problems,
  };
}

function gridFor(
  provider: PayrollProvider,
  rows: ExportRow[],
  options: { rangeLabel: string; periodEndKey: string },
): string {
  if (provider === 'gusto') {
    // Gusto's payroll CSV: hours per earning type, keyed on employee. Money
    // columns are for one-off extras, which is exactly what a day rate is from
    // Gusto's point of view — it has no other way to represent one.
    return toCsv([
      ['Employee ID', 'First name', 'Last name', 'Regular hours', 'Overtime hours', 'Bonus'],
      ...rows.map((row) => {
        const { first, last } = splitName(row.name);
        const dayRate = row.payType === 'day_rate';
        return [
          row.payrollId ?? '',
          first,
          last,
          dayRate ? '' : row.regularHours,
          dayRate ? '' : row.overtimeHours,
          dayRate ? row.amount.toFixed(2) : '',
        ];
      }),
    ]);
  }

  if (provider === 'quickbooks') {
    // QuickBooks imports time as one line per employee per payroll item, so a
    // person with overtime is two lines rather than two columns.
    const grid: (string | number)[][] = [['Employee', 'Payroll item', 'Hours', 'Amount', 'Date']];
    for (const row of rows) {
      if (row.payType === 'day_rate') {
        grid.push([row.name, 'Contractor payment', '', row.amount.toFixed(2), options.periodEndKey]);
        continue;
      }
      if (row.regularHours > 0) grid.push([row.name, 'Regular Pay', row.regularHours, '', options.periodEndKey]);
      if (row.overtimeHours > 0) grid.push([row.name, 'Overtime Pay', row.overtimeHours, '', options.periodEndKey]);
    }
    return toCsv(grid);
  }

  if (provider === 'adp') {
    // ADP paydata, keyed on File # — the employee number, not the name. Co Code
    // and Batch ID are per-client and deliberately left blank rather than
    // guessed; the notes tell the owner to fill them in.
    return toCsv([
      ['Co Code', 'Batch ID', 'File #', 'Employee Name', 'Reg Hours', 'O/T Hours', 'Earnings 3 Code', 'Earnings 3 Amount'],
      ...rows.map((row) => {
        const dayRate = row.payType === 'day_rate';
        return [
          '',
          '',
          row.payrollId ?? '',
          row.name,
          dayRate ? '' : row.regularHours,
          dayRate ? '' : row.overtimeHours,
          dayRate ? 'OTH' : '',
          dayRate ? row.amount.toFixed(2) : '',
        ];
      }),
    ]);
  }

  if (provider === 'paychex') {
    // Paychex Flex time import: one line per earnings component.
    const grid: (string | number)[][] = [['Employee ID', 'Employee Name', 'Earnings Code', 'Hours', 'Amount']];
    for (const row of rows) {
      const id = row.payrollId ?? '';
      if (row.payType === 'day_rate') {
        grid.push([id, row.name, 'OTH', '', row.amount.toFixed(2)]);
        continue;
      }
      if (row.regularHours > 0) grid.push([id, row.name, 'REG', row.regularHours, '']);
      if (row.overtimeHours > 0) grid.push([id, row.name, 'OT', row.overtimeHours, '']);
    }
    return toCsv(grid);
  }

  // Generic: everything on one line, with the pay type spelled out so whoever
  // opens it can see why a day-rate row carries money and an hourly one does not.
  return toCsv([
    ['Employee ID', 'Crew member', 'Paid as', 'Regular hours', 'Overtime hours', 'Gross amount', 'Pay period'],
    ...rows.map((row) => [
      row.payrollId ?? '',
      row.name,
      row.payType === 'day_rate' ? 'Day rate' : 'Hourly',
      row.payType === 'day_rate' ? '' : row.regularHours,
      row.payType === 'day_rate' ? '' : row.overtimeHours,
      row.amount.toFixed(2),
      options.rangeLabel,
    ]),
  ]);
}

/** One line summarising what happened, for the toast and the history entry. */
export function exportSummary(result: PayrollExport): string {
  const people = `${result.included} ${result.included === 1 ? 'crew member' : 'crew members'}`;
  const left = result.excluded.length > 0 ? `, ${result.excluded.length} left out` : '';
  return `${PAYROLL_PROVIDER_LABEL[result.provider]}: ${people}${left}.`;
}
