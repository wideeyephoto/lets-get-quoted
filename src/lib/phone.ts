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