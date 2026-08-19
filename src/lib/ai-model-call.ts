import 'server-only';

import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  billsAiWritingDrafts,
  type AiWritingContext,
} from '@/lib/ai-writing-policy';
import {
  aiWritingMode,
  beginAiWritingUsage,
  commitAiWritingUsage,
  releaseAiWritingUsage,
  type AiWritingLease,
} from '@/lib/billing/ai-writing-usage';

/**
 * The one egress point for model calls, and therefore the one place an AI
 * writing draft can be spent.
 *
 * WHY THIS EXISTS. Ten modules each held their own copy of the same
 * `fetch('https://api.openai.com/v1/responses', ...)` — same endpoint, same
 * headers, differing only in the body. That is fine until something has to be
 * true of every model call, and then it is ten places to remember. Drafts are
 * sold per generation, so metering is exactly that kind of thing.
 *
 * `context` is REQUIRED, not optional, for the reason `sendProviderMessage`'s is:
 * an optional argument would make "unbilled" the default for every module nobody
 * has written yet. Because it is required, a new model call cannot be made until
 * someone says what kind of generation it is, and `ai-writing-policy.ts` says
 * what that kind costs.
 *
 * The body is passed through verbatim. This wrapper owns the endpoint, the
 * headers and the billing; it deliberately owns nothing about the prompt, the
 * model, the temperature or the response shape, all of which are the calling
 * module's business and differ for good reasons.
 */

/** What the OpenAI responses endpoint is given, minus the parts this owns. */
export type ModelRequestBody = Readonly<Record<string, unknown>>;

export class AiNotConfiguredError extends Error {
  constructor() {
    super('AI generation is not configured yet.');
    this.name = 'AiNotConfiguredError';
  }
}

export class AiDraftsExhaustedError extends Error {
  constructor() {
    super('This workspace is out of AI writing drafts. Buy a top-up to keep drafting.');
    this.name = 'AiDraftsExhaustedError';
  }
}

/**
 * Calls the model and returns the raw `Response`.
 *
 * Raw, so each module keeps its own parsing — several of them read the response
 * differently on purpose, and a shared parser would have to grow a flag for each
 * of those differences.
 */
export async function callModel(
  body: ModelRequestBody,
  context: AiWritingContext,
): Promise<Response> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new AiNotConfiguredError();

  // Dark by default: no service-role client and no ledger round trip when the
  // meter is off, so a generation costs exactly what it cost before.
  const mode = aiWritingMode();
  let ledger: SupabaseClient | null = null;
  let lease: AiWritingLease | null = null;

  if (mode !== 'off' && billsAiWritingDrafts(context) && context.accountId) {
    const { createAdminClient } = await import('@/lib/auth');
    ledger = createAdminClient();
    const decision = await beginAiWritingUsage(ledger, {
      accountId: context.accountId,
      generationKey: randomUUID(),
    }, { mode });
    if (decision.outcome === 'refused') throw new AiDraftsExhaustedError();
    if (decision.outcome === 'allowed') lease = decision.lease;
  }

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    });

    // A draft is spent when the model produced one. An HTTP error produced
    // nothing, and the caller is about to treat it as a failure, so it must not
    // also be charged for.
    if (ledger && lease) {
      if (response.ok) await commitAiWritingUsage(ledger, lease);
      else await releaseAiWritingUsage(ledger, lease, `provider_status_${response.status}`);
    }
    return response;
  } catch (error) {
    if (ledger && lease) await releaseAiWritingUsage(ledger, lease, 'request_failed');
    throw error;
  }
}
