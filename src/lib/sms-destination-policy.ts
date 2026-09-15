import { parsePhoneNumberFromString } from 'libphonenumber-js/min';

export class SmsDestinationNotSupportedError extends Error {
  override readonly name = 'SmsDestinationNotSupportedError';

  constructor() {
    super('SMS destinations are limited to supported US and Canada numbers.');
  }
}

/**
 * +1 is shared with Caribbean nations and territories; it is not a US/Canada
 * allowlist. Use pinned numbering-plan metadata, with no default country that
 * could turn an unknown destination into a US number. This checks the supported
 * destination, not consent, carrier reachability, or who owns the handset.
 */
export function assertSupportedSmsDestination(phoneNumber: string): void {
  if (!/^\+1\d{10}$/.test(phoneNumber)) throw new SmsDestinationNotSupportedError();
  const parsed = parsePhoneNumberFromString(phoneNumber, { extract: false });
  if (!parsed || parsed.number !== phoneNumber || !parsed.isPossible()
      || (parsed.country !== 'US' && parsed.country !== 'CA')) {
    throw new SmsDestinationNotSupportedError();
  }
}
