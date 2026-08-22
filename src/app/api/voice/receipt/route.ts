import { NextResponse } from 'next/server';

import { createAdminClient } from '@/lib/auth';
import { logWebhookFailure } from '@/lib/webhook-failures';
import {
  signalWireVoiceScope,
  verifyVoiceReceiptAuthorization,
  VOICE_RECEIPT_BASIC_ENV,
} from '@/lib/voice/auth';
import {
  minimizeSignalWireVoiceReceiptPayload,
  signalwireVoiceProvider,
} from '@/lib/voice/signalwire';
import {
  ingestVoiceEvent,
  processVoiceReceipt,
  VoiceReceiptProcessingRpcError,
} from '@/lib/voice/receipt-processing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Where the end-of-call receipt arrives.
 *
 * A DIFFERENT AUTHENTICATION POSTURE FROM EVERY OTHER WEBHOOK HERE, because the
 * provider offers nothing else. Measured against a live agent
 * (docs/ai-voice-v1-decisions.md §11): no signature header of any kind, no
 * signing secret anywhere in the dashboard, and the project API token neither
 * sent nor used to sign. SignalWire's AI method instead accepts dedicated
 * post-prompt username/password fields and sends them as HTTP Basic auth. The
 * reusable credential therefore never appears in a callback URL or a log.
 *
 * So this route does not pretend a signature exists. It checks four things,
 * none of which is sufficient alone:
 *
 *   1. Basic credentials, dedicated to this endpoint and used nowhere else.
 *   2. The payload names OUR project and space (checked in the ingest RPC).
 *   3. The call id matches an admission LGQ made — the one that actually
 *      matters, because a receipt for a call LGQ never admitted is inert.
 *   4. Replay is byte-identical or refused, and settlement is idempotent.
 *
 * A leaked credential therefore buys an attacker the ability to restate a call
 * they already caused, bounded by a hold LGQ took at admission. It does not buy
 * them the ability to invent one.
 *
 * STATUS CODES ARE A DIAGNOSTIC SURFACE TOO. 503 means this deployment has no
 * credential configured; 401 means the one presented did not match. They were
 * the same code once, and an operator could not tell a missing environment
 * variable from a wrong password.
 *
 * 200 MEANS FINISHED OR DELIBERATELY INERT. A claimed attempt that throws, is
 * still inside its backoff, or is owned by another delivery returns 503 so the
 * provider keeps one retry alive. Processed, ignored, and exhausted events are
 * stable no-ops and return 200.
 */

export async function POST(request: Request) {
  // NOT CONFIGURED IS NOT THE SAME AS NOT AUTHORIZED, and collapsing them cost
  // an operator an afternoon. Both returned a bodyless 401, so "the variable
  // never reached the build" and "the password is wrong" were the same answer,
  // and the only way to tell them apart was to guess.
  //
  // 503 is the honest status and leaks nothing worth having: an attacker learns
  // the deployment has no secret set, which they already could not exploit,
  // while the person deploying learns the one thing they actually need.
  const auth = verifyVoiceReceiptAuthorization(request);
  if (!auth.ok && auth.reason === 'not_configured') {
    await logWebhookFailure({
      source: 'ai_voice',
      errorMessage: `Voice receipt endpoint has no valid ${VOICE_RECEIPT_BASIC_ENV} configured`,
    });
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }

  if (!auth.ok) {
    // Store only a fixed reason code. Usernames, password fingerprints and the
    // Authorization value are reusable authentication material or useful
    // probes and do not belong in logs.
    await logWebhookFailure({
      source: 'ai_voice',
      errorMessage: `Voice receipt authentication failed: ${auth.reason}`,
    });
    return new NextResponse(null, { status: 401 });
  }

  const providerScope = signalWireVoiceScope();
  if (!providerScope) {
    await logWebhookFailure({
      source: 'ai_voice',
      errorMessage: 'Voice receipt project/space scope is missing or invalid',
    });
    return NextResponse.json({ error: 'provider_scope_not_configured' }, { status: 503 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    await logWebhookFailure({ source: 'ai_voice', errorMessage: 'Voice receipt was not JSON' });
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const parsed = signalwireVoiceProvider.parseReceipt(payload);
  if (!parsed.ok) {
    await logWebhookFailure({
      source: 'ai_voice',
      errorMessage: `Voice receipt rejected: ${parsed.reason}`,
    });
    // 400, not 500: the provider must not retry a payload that can never parse.
    return NextResponse.json({ error: parsed.reason }, { status: 400 });
  }

  const receipt = parsed.receipt;
  const minimizedPayload = minimizeSignalWireVoiceReceiptPayload(payload, receipt);
  const admin = createAdminClient();

  try {
    let inbox;
    try {
      inbox = await ingestVoiceEvent(admin, {
        providerCallId: receipt.providerCallId,
        eventType: receipt.eventType,
        providerProjectId: receipt.projectId,
        providerSpaceId: receipt.spaceId,
        expectedProjectId: providerScope.projectId,
        expectedSpaceId: providerScope.spaceId,
        payload: minimizedPayload,
      });
    } catch (error) {
      // 23505 is either immutable-payload drift or an INSERT race. The helper
      // retries once, so an identical concurrent delivery becomes a normal
      // replay while changed input receives 23505 again. 22023 still means the
      // receipt does not belong here. Neither is retryable.
      const code = error instanceof VoiceReceiptProcessingRpcError
        ? error.rpcCode
        : null;
      const terminal = code === '23505' || code === '22023';
      await logWebhookFailure({
        source: 'ai_voice',
        referenceId: receipt.providerCallId,
        errorMessage: `ingest_voice_event failed (${code ?? 'unknown'}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      });
      return NextResponse.json({ error: 'rejected' }, { status: terminal ? 400 : 500 });
    }

    const { inserted, admitted, voiceEventId } = inbox;

    // Stored, attributed to nobody, settled not at all. This is the shape of a
    // forged receipt and of a genuine misconfiguration, and they are worth
    // telling apart later — so it is logged rather than silently accepted.
    if (!admitted) {
      await logWebhookFailure({
        source: 'ai_voice',
        referenceId: receipt.providerCallId,
        errorMessage: 'Voice receipt for a call this deployment never admitted',
      });
      return NextResponse.json({ ok: true, settled: false }, { status: 200 });
    }

    // Ingest deduplicates immutable evidence; this claim decides whether that
    // evidence still has unfinished work. A duplicate after a transient failure
    // therefore resumes, while processed/ignored rows remain no-ops.
    const processing = await processVoiceReceipt(admin, voiceEventId, receipt);

    if (processing.status === 'processed') {
      return NextResponse.json({
        ok: true,
        minutes: processing.minutes,
        ...(inserted ? {} : { duplicate: true }),
      }, { status: 200 });
    }

    if (processing.status === 'processed_before' || processing.status === 'ignored') {
      return NextResponse.json({ ok: true, duplicate: true }, { status: 200 });
    }

    if (processing.status === 'busy' || processing.status === 'deferred') {
      return NextResponse.json(
        { error: 'processing_pending' },
        {
          status: 503,
          headers: { 'Retry-After': String(processing.retryAfterSeconds ?? 5) },
        },
      );
    }

    if (processing.status === 'exhausted') {
      await logWebhookFailure({
        source: 'ai_voice',
        referenceId: receipt.providerCallId,
        errorMessage: 'Voice receipt processing attempts are exhausted',
      });
      return NextResponse.json({ ok: true, settled: false }, { status: 200 });
    }

    // Every non-failure variant returned above. Keep the explicit guard so a
    // newly added claim state fails closed instead of being mistaken for a
    // settlement result.
    if (processing.status !== 'retryable_failure'
        && processing.status !== 'terminal_failure') {
      throw new Error(`Unhandled voice receipt processing status: ${processing.status}`);
    }

    await logWebhookFailure({
      source: 'ai_voice',
      referenceId: receipt.providerCallId,
      errorMessage: processing.error instanceof Error
        ? `Voice receipt processing failed (${processing.reason}): ${processing.error.message}`
        : `Voice receipt needs reconciliation: ${processing.reason}`,
    });

    if (processing.status === 'retryable_failure') {
      return NextResponse.json(
        { error: 'processing_failed' },
        {
          status: 500,
          headers: processing.retryAfterSeconds === null
            ? undefined
            : { 'Retry-After': String(processing.retryAfterSeconds) },
        },
      );
    }
    return NextResponse.json({ ok: true, settled: false }, { status: 200 });
  } catch (error) {
    console.error('Voice receipt handler threw:', error);
    await logWebhookFailure({
      source: 'ai_voice',
      referenceId: receipt.providerCallId,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    // 500 here IS correct: an unexpected throw may be transient, and there is
    // exactly one receipt per call, so a retry is the only way to get it back.
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
