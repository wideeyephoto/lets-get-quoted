/** The registered sender for LGQ account and dispatch campaigns. */
export const LGQ_SMS_BRAND = "Let's Get Quoted";

export function isLgqSmsPurpose(purpose: string | null): boolean {
  return purpose === 'lgq_shared' || purpose === 'lgq_dispatch';
}

export function hasLgqSmsIdentity(body: string): boolean {
  return /^Let['’]s Get Quoted(?: support)?:\s/.test(body);
}

/** Only use for platform-authored copy; workspace names belong in the data. */
export function lgqSmsText(body: string): string {
  if (!body.trim()) return '';
  return hasLgqSmsIdentity(body) ? body : `${LGQ_SMS_BRAND}: ${body}`;
}

/** Carrier review on 2026-09-10 explicitly excluded these from Account & Support. */
export function lgqSmsDeliveryHold(input: {
  senderPurpose: string;
  messageKind: string;
  body: string;
}): string | null {
  if (input.senderPurpose === 'lgq_shared'
      && ['owner-voice-call-notification', 'owner-voice-emergency-alert'].includes(input.messageKind)) {
    return 'sms_campaign_scope_review';
  }
  // Covers already queued bodies and database-authored replies as well as new
  // templates. Never silently rewrite a persisted intent after consent/billing.
  if (isLgqSmsPurpose(input.senderPurpose) && !hasLgqSmsIdentity(input.body)) {
    return 'sms_brand_identity_review';
  }
  return null;
}
