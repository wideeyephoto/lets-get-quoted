'use client';

import { useMemo, useState } from 'react';

type FormattedCurrencyInputProps = {
  id: string;
  name: string;
  placeholder?: string;
  required?: boolean;
};

function normalizeCurrencyText(value: string): string {
  const cleaned = value.replace(/[^\d.]/g, '');
  const hasDecimal = cleaned.includes('.');
  const [dollars = '', ...rest] = cleaned.split('.');
  const cents = rest.join('').slice(0, 2);
  const normalizedDollars = dollars.replace(/^0+(?=\d)/, '');

  if (!normalizedDollars && !cents) return hasDecimal ? '0.' : '';
  if (hasDecimal) return `${normalizedDollars || '0'}.${cents}`;
  return normalizedDollars;
}

function formatCurrencyText(value: string): string {
  if (!value) return '';

  const [dollars, cents] = value.split('.');
  const formattedDollars = Number(dollars || 0).toLocaleString('en-US');
  return `$${formattedDollars}${cents != null ? `.${cents}` : ''}`;
}

export default function FormattedCurrencyInput({ id, name, placeholder, required = false }: FormattedCurrencyInputProps) {
  const [amount, setAmount] = useState('');
  const displayValue = useMemo(() => formatCurrencyText(amount), [amount]);

  return (
    <>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        value={displayValue}
        onChange={(event) => setAmount(normalizeCurrencyText(event.currentTarget.value))}
        placeholder={placeholder}
        required={required}
        autoComplete="off"
      />
      <input type="hidden" name={name} value={amount} />
    </>
  );
}