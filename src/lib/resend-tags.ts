/**
 * Reading a tag off a Resend webhook payload.
 *
 * THE BUG THIS EXISTS FOR: we send tags as an array of {name, value} pairs,
 * which is what the Resend send API takes. The webhook does not echo that
 * shape back — it delivers tags as a flat object, `{"kind": "invoice",
 * "account_id": "…"}`. So `event.data.tags.find(...)` threw "r.find is not a
 * function" on every single email.sent and email.delivered, before the
 * email_events upsert.
 *
 * That made it far more than a noisy log. The throw happened ahead of every
 * write in the handler, so:
 *
 *   - no email delivery was ever recorded, which is why the Command Center's
 *     "Failed emails" card read zero — nothing was written, not nothing failed;
 *   - maybeSuppress never ran, so a hard-bouncing address was never suppressed
 *     and kept being sent to on every campaign;
 *   - the webhook returned 500, so Resend retried, so each real event produced
 *     several identical failure rows.
 *
 * Both shapes are accepted here rather than picking the one seen in production,
 * because the array form is what the send API documents and a provider that
 * normalises its own payloads later should not break this again.
 */

export type ResendTags = unknown;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The value of one tag, or null.
 *
 * Values are coerced to string because the object form arrives straight from
 * JSON and a numeric tag would otherwise flow into a text column as a number.
 */
export function resendTagValue(tags: ResendTags, name: string): string | null {
  if (!tags) return null;

  // Webhook shape: a flat object keyed by tag name.
  if (isRecord(tags)) {
    const value = tags[name];
    if (value === null || value === undefined) return null;
    if (typeof value === 'object') return null;
    const asString = String(value).trim();
    return asString.length ? asString : null;
  }

  // Send-API shape: an array of {name, value}. Kept because it is what the
  // documented request format uses, and what a future payload might mirror.
  if (Array.isArray(tags)) {
    for (const entry of tags) {
      if (!isRecord(entry)) continue;
      if (entry.name !== name) continue;
      const value = entry.value;
      if (value === null || value === undefined || typeof value === 'object') return null;
      const asString = String(value).trim();
      return asString.length ? asString : null;
    }
  }

  return null;
}

/** The two tags this codebase actually reads, in one call. */
export function resendTags(tags: ResendTags): { kind: string; accountId: string | null } {
  return {
    kind: resendTagValue(tags, 'kind') ?? 'unknown',
    accountId: resendTagValue(tags, 'account_id'),
  };
}

/** `to` arrives as a string on some events and an array on others. */
export function resendRecipient(to: unknown): string | null {
  if (typeof to === 'string') return to.trim() || null;
  if (Array.isArray(to)) {
    const first = to.find((v) => typeof v === 'string' && v.trim());
    return typeof first === 'string' ? first.trim() : null;
  }
  return null;
}
