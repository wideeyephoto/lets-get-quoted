export function normalizeUsPhone(value: string): string | null {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (value.trim().startsWith('+') && digits.length >= 10 && digits.length <= 15) return `+${digits}`;
  return null;
}

/**
 * A US number the way a person writes one. Anything else, untouched.
 *
 * Normalizes first rather than pattern-matching the raw string. Supabase's auth
 * user stores a phone as bare digits — "12485550117", no plus — so the old
 * `/^\+1\d{10}$/` test missed it and Login & security printed the digit run at
 * a customer. The same applied to any 10-digit value that had not been through
 * normalizeUsPhone on its way in.
 */
export function displayPhone(value: string) {
  const e164 = normalizeUsPhone(value);
  if (e164 && /^\+1\d{10}$/.test(e164)) {
    return `(${e164.slice(2, 5)}) ${e164.slice(5, 8)}-${e164.slice(8)}`;
  }
  return value;
}

export function formatUsPhone(value?: string | null): string {
  if (!value) return '';
  return displayPhone(value);
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
