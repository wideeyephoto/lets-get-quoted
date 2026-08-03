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

// A business number ready to put on a page: the href and the words, from
// whatever the owner typed into the site builder.
//
// `sites.phone` is a free-text field, so it arrives as "(248) 555-0191",
// "248-555-0191" or bare "2485631234" depending on the day. Rendering it raw is
// fine in a footer and not fine on a call button, where "2485631234" reads as a
// broken page at the exact moment somebody is deciding whether to trust it.
// Normalize to E.164 for both; anything unparseable (an extension, a non-US
// number) passes through exactly as typed rather than being mangled.
export function phoneLink(value: string): { href: string; text: string } {
  const e164 = normalizeUsPhone(value);
  return e164 ? { href: `tel:${e164}`, text: displayPhone(e164) } : { href: `tel:${value}`, text: value };
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
