import type { SupabaseClient } from '@supabase/supabase-js';
import { listServices } from '@/lib/services';
import { parseQuoteItems } from '@/lib/jobs';
import { getSiteContent } from '@/lib/site-content';
import { callModel } from '@/lib/ai-model-call';
import {
  formatPriceBook, formatQuoteHistory, reconcileDraft, MAX_DRAFT_LINES, MAX_HISTORY_JOBS,
  type HistoricalQuote, type PriceBookEntry, type QuoteDraft, type RawDraft,
} from '@/lib/quote-draft';

// The model call behind "Draft this quote".
//
// The model decides WHAT the work is and which of the owner's services each
// line maps to. It does NOT get the last word on price — reconcileDraft snaps
// every matched line to the price book, and anything it priced itself comes
// back flagged. See lib/quote-draft for that boundary.

export type DraftContext = {
  /** Whose AI-writing balance this draft is charged to. */
  accountId: string;
  scope: string;
  trade: string | null;
  estimatedHours: number | null;
  services: PriceBookEntry[];
  history: HistoricalQuote[];
};

/**
 * Everything the drafter needs, in one place.
 *
 * Deliberately does NOT load the client's name, phone, email or address. None
 * of them make a price better, and the less that leaves the building the
 * better — see formatQuoteHistory.
 */
export async function loadDraftContext(
  supabase: SupabaseClient,
  accountId: string,
  jobId: string,
): Promise<DraftContext | null> {
  const { data: job } = await supabase
    .from('jobs')
    .select('id, scope, estimated_hours')
    .eq('account_id', accountId)
    .eq('id', jobId)
    .maybeSingle();
  if (!job) return null;

  const [services, { data: site }, { data: past }] = await Promise.all([
    listServices(supabase, accountId, { activeOnly: true }),
    // The trade lives in the website's content, not on the account — it's the
    // owner's own words for what they do ("window cleaning", "roofing"), which
    // is exactly the context that stops a drain job being priced like a remodel.
    supabase.from('sites').select('content').eq('account_id', accountId).limit(1).maybeSingle(),
    // Recent priced work, newest first — what this business actually charges,
    // which beats what the trade charges nationally every time.
    supabase
      .from('jobs')
      .select('scope, quoted_amount, quote_items')
      .eq('account_id', accountId)
      .neq('id', jobId)
      .gt('quoted_amount', 0)
      .order('created_at', { ascending: false })
      .limit(MAX_HISTORY_JOBS * 2),
  ]);

  const history: HistoricalQuote[] = (past ?? []).map((row) => ({
    scope: (row.scope as string | null) ?? null,
    total: Number(row.quoted_amount) || 0,
    lines: parseQuoteItems(row.quote_items).map((item) => ({ label: item.label, amount: Number(item.amount) || 0 })),
  }));

  return {
    accountId,
    scope: ((job.scope as string | null) ?? '').trim(),
    trade: getSiteContent(site?.content as Record<string, unknown> | null).trade.trim() || null,
    estimatedHours: job.estimated_hours == null ? null : Number(job.estimated_hours),
    services: services.map((service) => ({
      id: service.id,
      name: service.name,
      unitPrice: Number(service.unit_price) || 0,
      unit: service.unit,
      description: service.description,
    })),
    history,
  };
}

function extractOutputText(payload: unknown): string {
  const record = payload as { output_text?: unknown; output?: unknown[] };
  if (typeof record?.output_text === 'string') return record.output_text;
  const message = record?.output?.find(
    (item): item is { type: string; content?: unknown[] } => (item as { type?: string })?.type === 'message',
  );
  const textPart = message?.content?.find(
    (part): part is { type: string; text?: string } => (part as { type?: string })?.type === 'output_text',
  );
  return textPart?.text ?? '{}';
}

export function buildDraftInstructions(context: DraftContext): string {
  const book = formatPriceBook(context.services);
  const history = formatQuoteHistory(context.history);

  return [
    `You draft an itemized quote for a ${context.trade || 'home services'} contractor to review before they send it.`,
    'You are drafting FOR THE CONTRACTOR, not for their customer: be specific and practical, not reassuring.',
    '',
    book
      ? `THIS CONTRACTOR'S PRICE BOOK — use these services wherever the work matches one:\n${book}`
      : 'This contractor has not set up a price book, so you will have to estimate every line.',
    '',
    history ? `WHAT THEY HAVE CHARGED RECENTLY (their real quotes):\n${history}` : '',
    '',
    'Return STRICT JSON only:',
    '{"lines":[{"label":"<what the line is>","service":"<exact price-book name, or omit>","quantity":<number|null>,',
    '"amount":<number>,"kind":"base"|"addon","priced_from":"book"|"history"|"estimate","note":"<short, optional>"}],',
    '"summary":"<one sentence for the contractor>","assumptions":["<what you had to assume>"],',
    '"needs_more_info":true|false,"questions":["<what to ask the customer>"]}',
    '',
    'RULES:',
    '- ITEMIZE. Break the work into the parts a customer would expect to see priced separately — that is the entire point of this draft. A single line for a big job is a failure: the contractor could have typed one number themselves.',
    `  A quick service call is 1-2 lines. Substantial work (a replacement, a repipe, a re-roof) is 4-8 lines covering the real components a tradesperson knows it takes: access and demolition, materials, labour, fixtures or units, permits and inspection where that trade requires them, and making good afterwards. Never more than ${MAX_DRAFT_LINES}.`,
    '- Do NOT pad. Every line must be work somebody actually does on this job; if you would struggle to justify it to the customer, leave it out. A line the contractor has to delete costs them more attention than one they have to add.',
    '- When a line matches a price-book service, put that service name in "service" EXACTLY as written above, and set "quantity" (hours, sqft, or how many of that flat job). The contractor\'s own price will be applied — your "amount" is only a sanity check.',
    '- When nothing in the book matches, omit "service" and price it yourself. Set priced_from to "history" whenever you leaned on their recent quotes above — including scaling one of them up or down — and "estimate" only when you priced it from general knowledge of the trade. Be honest about this; the contractor is shown which is which.',
    '- Prefer their own numbers over national averages. These are the prices this business actually gets in its own market.',
    '- Put genuinely optional work in "kind":"addon". Do not invent add-ons to make the quote look thorough.',
    '- "assumptions" is where you say what you could not tell from the description — the contractor reads this before sending, so it is the most useful field you produce. Say what you assumed about size, access, materials and condition.',
    '- Set needs_more_info true and return questions with NO lines only when the description is too vague to price at all. A thin description with an obvious most-likely job should still be drafted, with the assumption stated.',
    '- Never include the customer\'s name or address in any label.',
    'Output nothing except the JSON object.',
  ].filter(Boolean).join('\n');
}

/**
 * Draft a quote. Returns null when it genuinely could not run — no API key, a
 * provider failure, unparseable output — so the caller can say "couldn't draft"
 * rather than showing an empty quote that looks like a considered answer.
 */
export async function draftQuote(context: DraftContext): Promise<QuoteDraft | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || !context.scope) return null;

  const input = [
    `JOB TO QUOTE:\n${context.scope.slice(0, 2000)}`,
    context.estimatedHours ? `The contractor estimates about ${context.estimatedHours} hours of work.` : '',
    'Draft the quote as JSON.',
  ].filter(Boolean).join('\n\n');

  try {
    const response = await callModel({
      model: 'gpt-4o',
      // Low but not zero: quoting benefits from recognizing that a job needs a
      // line nobody wrote down, which greedy decoding tends to skip.
      temperature: 0.2,
      instructions: buildDraftInstructions(context),
      input,
      text: { format: { type: 'json_object' } },
    }, { accountId: context.accountId, kind: 'quote_draft' });
    if (!response.ok) throw new Error(`OpenAI request failed: ${response.status}`);

    const raw = JSON.parse(extractOutputText(await response.json())) as RawDraft;
    return reconcileDraft(raw, context.services);
  } catch (error) {
    console.error('Quote draft failed:', error instanceof Error ? error.message : error);
    return null;
  }
}
