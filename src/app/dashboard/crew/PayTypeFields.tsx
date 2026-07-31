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
// One amount field is shown at a time, because "Hourly rate" and "Salary" and
// "Day rate" being on screen together invites filling in two of them and
// wondering which one won. The hidden ones stay MOUNTED but empty rather than
// unmounted, so the form always posts the same fields and the action can read
// only the one belonging to the chosen type.
//
// The derived costing rate is shown as it is typed. A salaried person's time
// still has to land on the jobs they worked, and the number that does it is
// computed rather than asked for — so it is stated here, with the arithmetic,
// instead of appearing later as a rate nobody entered.

function money(value: number): string {
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function PayTypeFields({
  idPrefix,
  payType: initialPayType = 'hourly',
  hourlyRate = '',
  annualSalary = '',
  dayRate = '',
}: {
  /** Keeps ids unique — this renders once per crew row plus once for the add form. */
  idPrefix: string;
  payType?: PayType;
  hourlyRate?: number | string;
  annualSalary?: number | string;
  dayRate?: number | string;
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

      <div className="field" hidden={payType !== 'hourly'}>
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

      <div className="field" hidden={payType !== 'salary'}>
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

      <div className="field" hidden={payType !== 'day_rate'}>
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

      {derived ? (
        <p className="field full hint">
          Their time will cost jobs <strong>{money(derived.rate)}/h</strong> ({derived.sum}). Their pay doesn&apos;t
          depend on this — it&apos;s how their hours land on a job&apos;s costs.
        </p>
      ) : null}
    </>
  );
}
