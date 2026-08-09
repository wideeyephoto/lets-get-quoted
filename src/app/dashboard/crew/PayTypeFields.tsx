'use client';

import { useState } from 'react';
import {
  NOMINAL_ANNUAL_HOURS,
  NOMINAL_DAY_HOURS,
  PAY_TYPES,
  PAY_TYPE_HELP,
  PAY_TYPE_LABEL,
  type PayType,
} from '@/lib/pay-types';

// How this person is paid, on the crew form.
//
// ONE AMOUNT FIELD, AND IT IS THE ONLY ONE THAT EXISTS. All three used to be
// rendered at once — "Hourly rate", "Salary" and "Day rate" side by side, all
// enabled, all posted — which invited filling in two of them and wondering
// which one won. They were then hidden with the `hidden` attribute rather than
// unmounted, on the theory that the action wanted every field on every submit.
// It never did: payFromForm reads only the amount belonging to the chosen type
// and always has. `hidden` also does not stop a field being filled in — a
// browser autofill, or a value typed before the type was switched, stayed in
// the DOM and was still submitted.
//
// So the non-matching fields are UNMOUNTED now. `positiveAmount` of a missing
// field is null, which is exactly what the action already did with a field it
// meant to ignore, and hourlyRate falling to 0 for a salaried person is what
// makes payColumns derive their costing rate instead (lib/pay-types).
//
// The derived costing rate is shown as it is typed. A salaried person's time
// still has to land on the jobs they worked, and the number that does it is
// computed rather than asked for — so it is stated here, with the arithmetic,
// instead of appearing later as a rate nobody entered.

function money(value: number): string {
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Their number in the payroll provider.
 *
 * Its own component because it is not compensation — it is a bookkeeping
 * reference, and the add form files it under "Advanced" well away from the
 * rate, while the edit form still wants it inline. One definition so the hint
 * explaining why ADP needs it cannot drift between the two.
 */
export function PayrollIdField({ idPrefix, payrollId = '' }: { idPrefix: string; payrollId?: string }) {
  return (
    <div className="field">
      <label htmlFor={`payrollId-${idPrefix}`}>Payroll ID (optional)</label>
      <input
        id={`payrollId-${idPrefix}`}
        name="payrollId"
        defaultValue={payrollId}
        placeholder="e.g. 004821"
      />
      {/* Providers match on their own id, never on a name — and a name match
          breaks the first time somebody is "Michael" in one system and "Mike"
          in the other. */}
      <p className="hint">Their employee number in your payroll provider. ADP and Paychex won&apos;t match a row without it.</p>
    </div>
  );
}

export default function PayTypeFields({
  idPrefix,
  payType: initialPayType = 'hourly',
  hourlyRate = '',
  annualSalary = '',
  dayRate = '',
  payrollId = '',
  showPayrollId = true,
}: {
  /** Keeps ids unique — this renders once per crew row plus once for the add form. */
  idPrefix: string;
  payType?: PayType;
  hourlyRate?: number | string;
  annualSalary?: number | string;
  dayRate?: number | string;
  payrollId?: string;
  /** False when the caller files the payroll id somewhere else (the add drawer's Advanced section). */
  showPayrollId?: boolean;
}) {
  const [payType, setPayType] = useState<PayType>(initialPayType);
  const [salary, setSalary] = useState(String(annualSalary ?? ''));
  const [daily, setDaily] = useState(String(dayRate ?? ''));

  const salaryNumber = Number(salary);
  const dailyNumber = Number(daily);
  const derived =
    payType === 'salary' && Number.isFinite(salaryNumber) && salaryNumber > 0
      ? { rate: salaryNumber / NOMINAL_ANNUAL_HOURS, sum: `${money(salaryNumber)} ÷ ${NOMINAL_ANNUAL_HOURS} h` }
      : payType === 'day_rate' && Number.isFinite(dailyNumber) && dailyNumber > 0
        ? { rate: dailyNumber / NOMINAL_DAY_HOURS, sum: `${money(dailyNumber)} ÷ ${NOMINAL_DAY_HOURS} h` }
        : null;

  return (
    <>
      <div className="field">
        <label htmlFor={`payType-${idPrefix}`}>How they&apos;re paid</label>
        <select
          id={`payType-${idPrefix}`}
          name="payType"
          value={payType}
          onChange={(event) => setPayType(event.target.value as PayType)}
        >
          {PAY_TYPES.map((option) => (
            <option key={option} value={option}>
              {PAY_TYPE_LABEL[option]}
            </option>
          ))}
        </select>
        <p className="hint">{PAY_TYPE_HELP[payType]}</p>
      </div>

      {payType === 'hourly' ? (
        <div className="field">
          <label htmlFor={`hourlyRate-${idPrefix}`}>Hourly rate ($)</label>
          <input
            id={`hourlyRate-${idPrefix}`}
            name="hourlyRate"
            type="number"
            min="0"
            step="0.01"
            placeholder="28"
            defaultValue={hourlyRate}
          />
        </div>
      ) : null}

      {payType === 'salary' ? (
        <div className="field">
          <label htmlFor={`annualSalary-${idPrefix}`}>Salary ($ per year)</label>
          <input
            id={`annualSalary-${idPrefix}`}
            name="annualSalary"
            type="number"
            min="0"
            step="0.01"
            placeholder="72000"
            value={salary}
            onChange={(event) => setSalary(event.target.value)}
          />
        </div>
      ) : null}

      {payType === 'day_rate' ? (
        <div className="field">
          <label htmlFor={`dayRate-${idPrefix}`}>Day rate ($ per day)</label>
          <input
            id={`dayRate-${idPrefix}`}
            name="dayRate"
            type="number"
            min="0"
            step="0.01"
            placeholder="320"
            value={daily}
            onChange={(event) => setDaily(event.target.value)}
          />
        </div>
      ) : null}

      {showPayrollId ? <PayrollIdField idPrefix={idPrefix} payrollId={payrollId} /> : null}

      {derived ? (
        <p className="field full hint">
          Their time will cost jobs <strong>{money(derived.rate)}/h</strong> ({derived.sum}). Their pay doesn&apos;t
          depend on this — it&apos;s how their hours land on a job&apos;s costs.
        </p>
      ) : null}
    </>
  );
}
