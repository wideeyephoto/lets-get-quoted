import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { createAdminClient } from '@/lib/auth';
import { logWebhookFailure } from '@/lib/webhook-failures';
import { suppressEmail, suppressionReasonFor } from '@/lib/email-suppression';
import { resendRecipient, resendTags, resendTagValue } from '@/lib/resend-tags';

export const dynamic = 'force-dynamic';

// Resend signs webhooks the Svix way (svix-id/svix-timestamp/svix-signature
// headers, HMAC-SHA256 over "id.timestamp.body"). There's no svix package
// installed and verifying three headers is ~20 lines, so this hand-rolls it
// rather than adding a dependency for one function.
function verifyResendSignature(rawBody: string, headers: Headers, secret: string): boolean {
  const svixId = headers.get('svix-id');
  const svixTimestamp = headers.get('svix-timestamp');
  const svixSignature = headers.get('svix-signature');
  if (!svixId || !svixTimestamp || !svixSignature) return false;

  // Bounds how long a captured payload stays replayable.
  const timestampSeconds = Number(svixTimestamp);
  if (!Number.isFinite(timestampSeconds) || Math.abs(Date.now() / 1000 - timestampSeconds) > 300) {
    return false;
  }

  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;
  const expected = crypto.createHmac('sha256', secretBytes).update(signedContent).digest('base64');

  // svix-signature can carry multiple space-separated "v1,<base64>" values
  // (secret rotation) — a match against any one of them is valid.
  return svixSignature.split(' ').some((part) => {
    const [version, signature] = part.split(',');
    if (version !== 'v1' || !signature) return false;
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });
}

type ResendWebhookEvent = {
  type: string;
  created_at?: string;
  data: {
    email_id?: string;
    to?: string[] | string;
    // Deliberately `unknown`. This was typed as an array of {name, value} —
    // the shape the SEND api takes — and the webhook delivers a flat object
    // instead, so the type was asserting something false about runtime data and
    // TypeScript happily let .find through. See lib/resend-tags.ts.
    tags?: unknown;
    // `type` decides whether we ever send here again. Resend passes Amazon SES's
    // classification through: Permanent means the address does not exist,
    // Transient means it was busy or full, Undetermined means the far end did
    // not say. Only Permanent is a reason to stop.
    bounce?: { message?: string; type?: string; subType?: string } | null;
    // Resend's pre-delivery failure event is operational, not automatically a
    // recipient opt-out: quota, API-key, and domain-verification failures all
    // use this same shape, so its reason is recorded but never suppressed.
    failed?: { reason?: string } | null;
    // Resend emits this after it refuses a send because the recipient is
    // already on its account-level suppression list. Mirror it into our
    // account-scoped suppression list when the send carried an account tag.
    suppressed?: { message?: string; type?: string } | null;
    [key: string]: unknown;
  };
};

const STATUS_BY_EVENT: Record<string, string> = {
  'email.sent': 'sent',
  'email.delivered': 'delivered',
  'email.delivery_delayed': 'delayed',
  'email.bounced': 'bounced',
  'email.complained': 'complained',
  'email.failed': 'failed',
  'email.suppressed': 'suppressed',
};

function errorReasonFor(event: ResendWebhookEvent, status: string): string | null {
  const reason = status === 'bounced'
    ? event.data.bounce?.message
    : status === 'failed'
      ? event.data.failed?.reason
      : status === 'suppressed'
        ? event.data.suppressed?.message ?? event.data.suppressed?.type
        : null;
  return typeof reason === 'string' && reason.trim() ? reason.trim() : null;
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const secret = process.env.RESEND_WEBHOOK_SECRET;

  if (!secret) {
    console.error('RESEND_WEBHOOK_SECRET is not configured; rejecting Resend webhook');
    // Logged, not just console.error'd. This is the likeliest webhook failure
    // there is — it is the state between registering the endpoint at Resend and
    // the env var reaching a deployment — and it was the one state the Webhook
    // failures panel could not show. Every other branch here writes a row, so an
    // empty panel read as "no webhook problems" while every delivery was being
    // rejected with a 500.
    //
    // Resend retries, so a sustained misconfiguration writes repeat rows. That
    // is the right trade: identical rows read as one problem in the panel, and
    // the alternative is silence about a webhook that is dropping every event.
    await logWebhookFailure({
      source: 'resend',
      errorMessage: 'RESEND_WEBHOOK_SECRET is not set — every delivery is being rejected',
      payloadExcerpt: rawBody.slice(0, 500),
    });
    return NextResponse.json({ error: 'Webhook not configured.' }, { status: 500 });
  }

  if (!verifyResendSignature(rawBody, request.headers, secret)) {
    console.error('Resend webhook signature verification failed');
    await logWebhookFailure({
      source: 'resend',
      errorMessage: 'Signature verification failed',
      payloadExcerpt: rawBody.slice(0, 500),
    });
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 400 });
  }

  let event: ResendWebhookEvent;
  try {
    event = JSON.parse(rawBody);
  } catch (err) {
    console.error('Resend webhook payload was not valid JSON:', err);
    await logWebhookFailure({
      source: 'resend',
      errorMessage: err instanceof Error ? err.message : 'Invalid JSON payload',
      payloadExcerpt: rawBody.slice(0, 500),
    });
    return NextResponse.json({ error: 'Invalid payload.' }, { status: 400 });
  }

  const status = STATUS_BY_EVENT[event.type];
  if (!status) {
    // Event types we don't track (email.clicked, email.opened, ...) — ack and
    // move on, nothing to record.
    return NextResponse.json({ received: true });
  }

  const admin = createAdminClient();
  try {
    const providerId = event.data.email_id;
    if (!providerId) throw new Error(`Resend ${event.type} event carried no email_id`);

    // Through resendTags rather than .find, because the webhook does NOT echo
    // the array-of-pairs shape we send — it delivers a flat object. Calling
    // .find on it threw before every write in this handler, so no email
    // delivery was ever recorded and no bouncing address was ever suppressed.
    const { kind, accountId } = resendTags(event.data.tags);
    const recipient = resendRecipient(event.data.to);

    const domainNoticeId = resendTagValue(event.data.tags, 'domain_failure_notice_id');
    if (domainNoticeId) {
      const boundRecipient = operationalSingleRecipient(event.data.to);
      if (kind !== 'sending_domain_failed' || !accountId || !boundRecipient
        || !unambiguousDomainNoticeTags(event.data.tags)
        || resendTagValue(event.data.tags, 'delivery_scope')
        || (event.data.cc && (!Array.isArray(event.data.cc) || event.data.cc.length))
        || (event.data.bcc && (!Array.isArray(event.data.bcc) || event.data.bcc.length))) {
        throw new Error('Domain failure callback has an invalid binding');
      }
      // Validate against the immutable snapshot before changing delivery history
      // or suppression. The signed tag alone is insufficient evidence.
      const { data: result, error: confirmError } = await admin.rpc('confirm_email_domain_failure_notice', {
        p_id: domainNoticeId, p_account_id: accountId, p_recipient: boundRecipient, p_provider_id: providerId,
        p_status: status, p_occurred_at: event.created_at ?? new Date().toISOString(),
        p_event_id: request.headers.get('svix-id'),
      });
      if (!confirmError && (result === 'missing' || result === 'unprepared')) {
        const { error: quarantineError } = await admin.from('webhook_failures').insert({
          source: 'resend', event_type: event.type, reference_id: providerId,
          error_message: 'DOMAIN_NOTICE_QUARANTINE: missing notice or snapshot; review legacy sending, deletion or environment routing.',
          payload_excerpt: JSON.stringify({ notice_id: domainNoticeId, account_id: accountId, provider_id: providerId,
            svix_id: request.headers.get('svix-id'), binding_state: result }),
        });
        if (quarantineError) throw new Error('Could not retain domain failure callback quarantine');
        return NextResponse.json({ received: true, quarantined: true }, { status: 202 });
      }
      if (confirmError || result !== 'confirmed') throw new Error('Could not reconcile domain failure callback');
    }

    // Upsert keyed by provider_id. Resend is at-least-once and explicitly does
    // not guarantee delivery order, so the database trigger installed with
    // this projector rejects an older/lower lifecycle state in one step. Doing
    // that in SQL also closes the race between two concurrent webhook calls.
    const { error } = await admin.from('email_events').upsert(
      {
        account_id: accountId,
        kind,
        recipient: recipient ?? 'unknown',
        provider_id: providerId,
        status,
        error_reason: errorReasonFor(event, status),
        occurred_at: event.created_at ?? new Date().toISOString(),
      },
      { onConflict: 'provider_id' },
    );
    if (error?.code === '23503' && accountId && error.message.includes('email_events_account_id_fkey')) {
      // A signed event can belong to a deleted workspace or another environment
      // sharing this provider. Never reassign it or run tenant side effects.
      // Persist an actionable quarantine before acknowledging the permanent
      // routing failure; a failed audit write remains retryable.
      const { error: quarantineError } = await admin.from('webhook_failures').insert({
        source: 'resend',
        event_type: event.type,
        reference_id: providerId,
        error_message: `EMAIL_ACCOUNT_QUARANTINE: workspace ${accountId} is absent in this database; delivery event requires routing review.`,
        payload_excerpt: JSON.stringify({
          svix_id: request.headers.get('svix-id'),
          provider_id: providerId,
          original_account_id: accountId,
          event_type: event.type,
          occurred_at: event.created_at ?? null,
          provider_reason: errorReasonFor(event, status),
        }),
      });
      if (quarantineError) throw new Error(`Could not persist email routing quarantine: ${quarantineError.message}`);
      return NextResponse.json({ received: true, quarantined: true }, { status: 202 });
    }
    if (error) throw new Error(error.message);

    const lifecycleSendId = resendTagValue(event.data.tags, 'lifecycle_send_id');
    if (kind === 'contractor_lifecycle' && lifecycleSendId) {
      if (!accountId || !recipient) throw new Error('Lifecycle callback is missing its workspace or recipient');
      const { data: confirmed, error: confirmError } = await admin.rpc('confirm_contractor_lifecycle_send', {
        p_id: lifecycleSendId, p_account_id: accountId, p_recipient: recipient, p_provider_id: providerId,
      });
      if (confirmError || confirmed !== true) throw new Error('Could not reconcile lifecycle send callback');
    }

    const documentSendId = resendTagValue(event.data.tags, 'document_send_id');
    if ((kind === 'client_quote' || kind === 'invoice') && documentSendId) {
      const phase = resendTagValue(event.data.tags, 'send_phase');
      if (!accountId || !recipient || !phase) throw new Error('Document callback is missing its binding');
      const { data: confirmed, error: confirmError } = await admin.rpc('confirm_document_email_send', {
        p_id: documentSendId, p_account_id: accountId, p_recipient: recipient, p_provider_id: providerId, p_phase: phase,
      });
      if (!confirmError && confirmed === false) {
        const { data: intent, error: intentError } = await admin.from('document_email_sends')
          .select('id').eq('id', documentSendId).maybeSingle();
        if (intentError) throw new Error('Could not inspect missing document send');
        if (!intent) {
          // Deleted documents cascade their ledger. Retain an actionable
          // routing record instead of endlessly retrying an absent intent.
          const { error: quarantineError } = await admin.from('webhook_failures').insert({
            source: 'resend', event_type: event.type, reference_id: providerId,
            error_message: 'DOCUMENT_SEND_QUARANTINE: document send is absent; check deletion or environment routing.',
            payload_excerpt: JSON.stringify({ document_send_id: documentSendId, account_id: accountId,
              provider_id: providerId, send_phase: phase, svix_id: request.headers.get('svix-id') }),
          });
          if (quarantineError) throw new Error('Could not retain missing document send callback');
          await maybeSuppress(admin, { status, accountId, recipient, bounce: event.data.bounce ?? null });
          return NextResponse.json({ received: true, quarantined: true }, { status: 202 });
        }
      }
      if (confirmError || confirmed !== true) throw new Error('Could not reconcile document send callback');
    }

    // Recording the bounce was never the point — not sending again was.
    //
    // Until now this handler wrote email_events and stopped there, and
    // suppressEmail was reachable only from the two human unsubscribe routes.
    // So a hard-bouncing address stayed on the list and was re-sent to on every
    // campaign, forever, and the only thing between a contractor's list and a
    // mailbox-provider reputation hit was a syntactic placeholder check.
    let suppressionScope = kind === 'platform_campaign' || kind === 'platform_campaign_test'
      || resendTagValue(event.data.tags, 'delivery_scope') === 'platform_transactional' ? 'platform' : accountId;
    const unscopedReason = suppressionReasonFor({ status, bounceType: event.data.bounce?.type });
    if (!suppressionScope && unscopedReason) {
      const singleRecipient = operationalSingleRecipient(event.data.to);
      if (!singleRecipient) throw new Error('Operational callback requires one verified recipient');
      const { data: retained, error: evidenceError } = await admin.rpc('record_operational_callback_evidence', {
        p_provider_id: providerId, p_recipient: singleRecipient, p_reason: unscopedReason,
        p_event_id: request.headers.get('svix-id'), p_occurred_at: event.created_at ?? new Date().toISOString(),
      });
      if (evidenceError || retained !== true) throw new Error('Operational callback evidence could not be retained');
      suppressionScope = await operationalCallbackScope(admin, providerId, event.data.to);
    }
    await maybeSuppress(admin, { status, accountId: suppressionScope,
      recipient, bounce: event.data.bounce ?? null });
  } catch (err) {
    console.error(`Resend webhook handler threw for event ${event.type}:`, err);
    await logWebhookFailure({
      source: 'resend',
      eventType: event.type,
      referenceId: event.data.email_id ?? null,
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: 'Webhook handler error.' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

/** Bind legacy untagged operations callbacks to an accepted, saved destination. */
async function operationalCallbackScope(admin: ReturnType<typeof createAdminClient>, providerId: string, to: unknown): Promise<'platform' | null> {
  const { data, error } = await admin.from('operational_alert_deliveries').select('provider_id, payload')
    .eq('provider_id', providerId).maybeSingle();
  if (error || data === undefined) throw new Error('Operational callback binding could not be checked');
  if (!data) return null; // Unknown/early callbacks cannot establish platform scope.
  const saved = data.payload;
  const recipient = operationalSingleRecipient(to);
  if (data.provider_id !== providerId || !recipient || recipient !== operationalSingleRecipient(saved?.to)
    || (saved?.cc && (!Array.isArray(saved.cc) || saved.cc.length))
    || (saved?.bcc && (!Array.isArray(saved.bcc) || saved.bcc.length))
    || resendTagValue(saved?.tags, 'account_id')) {
    throw new Error('Operational callback recipient binding does not match');
  }
  return 'platform';
}

function operationalSingleRecipient(value: unknown): string | null {
  const values = typeof value === 'string' ? [value] : value;
  if (!Array.isArray(values) || values.length !== 1 || typeof values[0] !== 'string'
    || !/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(values[0])) return null;
  return values[0].toLowerCase();
}

function unambiguousDomainNoticeTags(tags: unknown): boolean {
  return ['kind', 'account_id', 'domain_failure_notice_id'].every(name => {
    const values = Array.isArray(tags)
      ? tags.filter(entry => entry && typeof entry === 'object' && entry.name === name).map(entry => entry.value)
      : tags && typeof tags === 'object' ? [(tags as Record<string, unknown>)[name]] : [];
    return values.length === 1 && typeof values[0] === 'string' && values[0] === resendTagValue(tags, name);
  });
}

/**
 * Stop sending to an address that told us to stop.
 *
 * Three signals, and only three:
 *
 *   complained  — always. A spam complaint is an explicit "never again", and
 *                 continuing costs the sending domain's reputation for every
 *                 other contractor on it, not just this one.
 *   bounced     — only when Resend classifies it Permanent. A Transient bounce
 *                 is a full or briefly unreachable mailbox, and suppressing on
 *                 one would silently cut a real customer off from their quotes
 *                 and invoices over a bad afternoon. Undetermined is treated as
 *                 transient: the far end did not say, and guessing wrong in
 *                 that direction is the expensive one.
 *   suppressed  — always. Resend already refused this address because it is on
 *                 the provider account's suppression list; mirroring that
 *                 decision prevents another application send attempt.
 *
 * Deliberately AFTER the idempotent email_events write. If an account-scoped
 * suppression write fails, throw so the route returns 500 and Resend retries;
 * acknowledging it would permanently lose the safety action. The event upsert
 * is replay-safe, so repeating it is harmless.
 */
async function maybeSuppress(
  admin: ReturnType<typeof createAdminClient>,
  input: {
    status: string;
    accountId: string | null;
    recipient: string | null;
    bounce: { message?: string; type?: string } | null;
  },
): Promise<void> {
  if (!input.recipient || input.recipient === 'unknown') return;

  const reason = suppressionReasonFor({ status: input.status, bounceType: input.bounce?.type });
  if (!reason) return;

  // email_suppression is account-scoped, so an untagged send has nowhere to
  // record this. Say so out loud — silently skipping would mean the one send
  // that most needs suppressing is the one that never gets it.
  const maskedRecipient = input.recipient.replace(/^(.)(.*)(@.*)$/, (_, a, b, c) => `${a}***${c}`);
  if (!input.accountId) {
    console.error(
      `Resend ${input.status} for ${maskedRecipient} carried no account_id tag — cannot suppress. Tag the send.`,
    );
    return;
  }

  const ok = await suppressEmail(admin, input.accountId, input.recipient, reason);
  if (!ok) {
    throw new Error(
      `Account-scoped email suppression persistence failed for ${maskedRecipient} on account ${input.accountId}`,
    );
  }
}
