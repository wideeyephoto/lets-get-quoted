import { createAdminClient } from './auth';

/**
 * MUST stay in step with the CHECK constraint on webhook_failures.source.
 *
 * These names are provider-NEUTRAL because the constraint used to name Twilio,
 * which made it the one place a change of SMS provider fails at the database
 * rather than at a comment — and fails invisibly, since logWebhookFailure
 * swallows its own insert error. Writing an unlisted value here does not throw:
 * the failure log just quietly stops logging failures, during the exact window
 * somebody is watching it.
 *
 * 'twilio_inbound' and 'twilio_status' remain because existing rows carry them
 * and the Command Center renders the raw value. Nothing writes them any more.
 * test/sms-provider.test.ts parses the constraint out of schema.sql and checks
 * this union against it.
 */
export type WebhookSource =
  | 'stripe'
  | 'resend'
  | 'sms_inbound'
  | 'sms_status'
  | 'sms_voice'
  | 'ai_voice'
  | 'twilio_inbound'
  | 'twilio_status';

export interface WebhookFailureInput {
  source: WebhookSource;
  eventType?: string | null;
  referenceId?: string | null;
  errorMessage: string;
  payloadExcerpt?: string | null;
}

const EXCERPT_MAX = 500;

// Records a webhook that failed signature verification or threw while
// handling a delivered event. Best-effort by contract, same as
// logAdminAction: a webhook route's job is to acknowledge the provider fast,
// so a failure to LOG a failure must never turn into a second failure that
// makes the route itself throw or hang.
export async function logWebhookFailure(input: WebhookFailureInput): Promise<void> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from('webhook_failures').insert({
      source: input.source,
      event_type: input.eventType ?? null,
      reference_id: input.referenceId ?? null,
      error_message: input.errorMessage,
      payload_excerpt: input.payloadExcerpt ? input.payloadExcerpt.slice(0, EXCERPT_MAX) : null,
    });
    if (error) console.error('logWebhookFailure insert failed:', error);
  } catch (err) {
    console.error('logWebhookFailure threw (non-fatal):', err);
  }
}
