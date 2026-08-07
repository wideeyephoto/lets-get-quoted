import { createAdminClient } from './auth';

export type WebhookSource = 'stripe' | 'twilio_inbound' | 'twilio_status' | 'resend';

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
