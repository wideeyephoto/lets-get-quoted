import { createHash, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';

import { createAdminClient } from '@/lib/auth';
import { logWebhookFailure } from '@/lib/webhook-failures';
import { signalwireVoiceProvider } from '@/lib/voice/signalwire';
import { settleVoiceReceipt } from '@/lib/voice/settlement';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Where the end-of-call receipt arrives.
 *
 * A DIFFERENT AUTHENTICATION POSTURE FROM EVERY OTHER WEBHOOK HERE, because the
 * provider offers nothing else. Measured against a live agent
 * (docs/ai-voice-v1-decisions.md §11): no signature header of any kind, no
 * signing secret anywhere in the dashboard, and the project API token neither
 * sent nor used to sign. Basic credentials embedded in the callback URL are the
 * only supported mechanism, and they stay readable there after saving.
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
 * ALWAYS 200 ON A DELIVERED RECEIPT IT ACCEPTED. The provider retries on 5xx and
 * there is exactly one receipt per call; a transient 500 here loses the only
 * record of what a call cost.
 */

const CREDENTIAL_ENV = 'LGQ_VOICE_RECEIPT_BASIC' as const;

function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  // Compare lengths without branching on the secret: unequal lengths still do
  // a full comparison against a same-length buffer.
  if (left.length !== right.length) {
    timingSafeEqual(left, left);
    return false;
  }
  return timingSafeEqual(left, right);
}

/**
 * The configured credential, or null when the endpoint is not set up.
 *
 * Absent means CLOSED, not open. An unset secret on an endpoint whose whole job
 * is to accept unsigned billing evidence would be the single worst default in
 * the product.
 */
function expectedCredential(): string | null {
  const raw = (process.env[CREDENTIAL_ENV] ?? '').trim();
  return raw.length > 0 && raw.includes(':') ? raw : null;
}

/**
 * A comparable fingerprint that reveals neither side.
 *
 * 32 bits of SHA-256. Enough to tell "these are the same string" from "these are
 * not" when both are written into a log an operator can read; nowhere near
 * enough to recover the input. This exists because a bare 401 leaves somebody
 * who set a Vercel Sensitive variable -- which is write-only, and cannot be read
 * back by anyone -- with no way to find out whether the value they think they
 * set is the value the build holds.
 */
function fingerprint(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex').slice(0, 8);
}

/** The username half. Not a secret, and usually where the mismatch is. */
function userPart(credential: string): string {
  const at = credential.indexOf(':');
  return at > 0 ? credential.slice(0, at) : '(none)';
}

/**
 * Why a credential was refused, in terms an operator can act on, with neither
 * side of it written down.
 */
function mismatchDetail(request: Request, expected: string): string {
  const header = request.headers.get('authorization') ?? '';
  const [scheme, encoded] = header.split(' ');
  if (!scheme || scheme.toLowerCase() !== 'basic' || !encoded) {
    return 'no Basic credentials were presented';
  }
  let presented = '';
  try {
    presented = Buffer.from(encoded, 'base64').toString('utf8');
  } catch {
    return 'the Authorization header was not valid base64';
  }
  if (!presented.includes(':')) return 'the decoded credential had no colon in it';

  const sameUser = userPart(presented) === userPart(expected);
  return sameUser
    ? `username matches, password differs (configured ${fingerprint(expected)}, presented ${fingerprint(presented)})`
    : `username differs: configured "${userPart(expected)}", presented "${userPart(presented)}"`;
}

function authorized(request: Request): boolean {
  const expected = expectedCredential();
  if (!expected) return false;

  const header = request.headers.get('authorization') ?? '';
  const [scheme, encoded] = header.split(' ');
  if (!scheme || scheme.toLowerCase() !== 'basic' || !encoded) return false;

  let presented: string;
  try {
    presented = Buffer.from(encoded, 'base64').toString('utf8');
  } catch {
    return false;
  }
  return constantTimeEquals(presented, expected);
}

export async function POST(request: Request) {
  // NOT CONFIGURED IS NOT THE SAME AS NOT AUTHORIZED, and collapsing them cost
  // an operator an afternoon. Both returned a bodyless 401, so "the variable
  // never reached the build" and "the password is wrong" were the same answer,
  // and the only way to tell them apart was to guess.
  //
  // 503 is the honest status and leaks nothing worth having: an attacker learns
  // the deployment has no secret set, which they already could not exploit,
  // while the person deploying learns the one thing they actually need.
  const expected = expectedCredential();
  if (!expected) {
    await logWebhookFailure({
      source: 'ai_voice',
      errorMessage: `Voice receipt endpoint has no ${CREDENTIAL_ENV} configured`,
    });
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }

  if (!authorized(request)) {
    // Terse and bodyless from here on. Which HALF of a credential was wrong, and
    // whether the username exists, stay unsaid.
    // The RESPONSE stays bodyless and says nothing. The detail goes to
    // webhook_failures, which only the service role can read -- so the person
    // deploying can find out what differs while a prober still learns nothing.
    await logWebhookFailure({
      source: 'ai_voice',
      errorMessage: `Voice receipt rejected: ${mismatchDetail(request, expected)}`,
    });
    return new NextResponse(null, { status: 401 });
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
  const admin = createAdminClient();

  try {
    const { data, error } = await admin.rpc('ingest_voice_event', {
      p_provider_call_id: receipt.providerCallId,
      p_event_type: receipt.eventType,
      p_provider_project_id: receipt.projectId,
      p_provider_space_id: receipt.spaceId,
      p_expected_project_id: process.env.SIGNALWIRE_PROJECT_ID || null,
      p_expected_space_id: process.env.SIGNALWIRE_SPACE_ID || null,
      p_payload: payload,
    });

    if (error) {
      // 23505 is a receipt that changed between deliveries; 22023 is one that
      // does not belong here. Neither is retryable, and returning 500 for either
      // would have the provider redeliver it for ever.
      const terminal = error.code === '23505' || error.code === '22023';
      await logWebhookFailure({
        source: 'ai_voice',
        referenceId: receipt.providerCallId,
        errorMessage: `ingest_voice_event failed (${error.code ?? 'unknown'}): ${error.message}`,
      });
      return NextResponse.json({ error: 'rejected' }, { status: terminal ? 400 : 500 });
    }

    const row = Array.isArray(data) ? data[0] : data;
    const inserted = Boolean(row?.inserted);
    const admitted = Boolean(row?.admitted);

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

    // A replay must not settle twice. The ledger's finalization key would refuse
    // it anyway, but there is no reason to ask.
    if (!inserted) return NextResponse.json({ ok: true, duplicate: true }, { status: 200 });

    const settlement = await settleVoiceReceipt(admin, receipt);
    if (settlement.reconcile) {
      await logWebhookFailure({
        source: 'ai_voice',
        referenceId: receipt.providerCallId,
        errorMessage: `Voice receipt needs reconciliation: ${settlement.reconcile}`,
      });
    }

    await admin
      .from('voice_events')
      .update({
        processing_status: settlement.reconcile ? 'failed' : 'processed',
        processed_at: settlement.reconcile ? null : new Date().toISOString(),
        last_error: settlement.reconcile,
      })
      .eq('provider_call_id', receipt.providerCallId);

    return NextResponse.json({ ok: true, minutes: settlement.minutes }, { status: 200 });
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
