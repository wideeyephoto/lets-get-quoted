export function normalizeUsPhone(value: string): string | null {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (value.trim().startsWith('+') && digits.length >= 10 && digits.length <= 15) return `+${digits}`;
  return null;
}

export function displayPhone(value: string) {
  if (/^\+1\d{10}$/.test(value)) {
    return `(${value.slice(2, 5)}) ${value.slice(5, 8)}-${value.slice(8)}`;
  }
  return value;
}

export function formatPhoneDashes(value: string | null | undefined): string {
  if (!value) return '';
  const digits = value.replace(/\D/g, '');
  const tenDigits = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (tenDigits.length === 10) {
    return `${tenDigits.slice(0, 3)}-${tenDigits.slice(3, 6)}-${tenDigits.slice(6)}`;
  }
  return value;
}
