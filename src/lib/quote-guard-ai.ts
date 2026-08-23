// The half of Quote Guard that reads.
//
// The model gets the customer's description and the quote's LABELS. It does not
// get the prices, and it is not asked for any. Everything it can return is the
// name of something it believes is missing — the arithmetic in quote-guard.ts
// owns every number, and a suggestion with a price attached is a suggestion a
// contractor might send without checking.
//
// It also never sees the customer's name, address or phone. A quote review has
// no use for them, and the cheapest way to not leak something is to not send it.

import type { QuoteFinding } from '@/lib/quote-guard';
import { callModel } from '@/lib/ai-model-call';

export type OmissionContext = {
  trade: string | null;
  /** What the customer asked for, in their words. */
  scope: string;
  /** Just the labels. No amounts. */
  labels: string[];
  estimatedHours: number | null;
};

type RawOmission = { id?: unknown; title?: unknown; why?: unknown; confidence?: unknown };

const INSTRUCTIONS = [
  'You are a senior estimator reviewing a contractor’s quote before it is sent, looking ONLY for work that is missing.',
  '',
  'You will be given the customer’s description of the job and the list of line labels on the quote. You will NOT be given prices, and you must never produce one.',
  '',
  'Return JSON: {"omissions":[{"id":string,"title":string,"why":string,"confidence":"high"|"medium"|"low"}]}',
  '',
  'WHAT TO LOOK FOR',
  '- Something the customer explicitly mentioned that no line covers.',
  '- Demolition or tear-out, on jobs that plainly require removing what is there first.',
  '- Haul-away and disposal, where the work obviously generates debris.',
  '- Permits or inspection, where the work typically requires one in US residential construction.',
  '- Access and protection the job implies: floor protection, moving furniture, scaffolding, a dumpster.',
  '- A quantity on a line that looks wrong for the job described.',
  '',
  'RULES',
  '- Only flag something ABSENT. Never comment on price, margin, or whether a figure is high or low — you have not been shown any prices and cannot know.',
  '- A line whose label plausibly covers the work is NOT missing. "Full bathroom remodel" already includes demolition; do not flag it. Prefer silence over a finding the contractor has to dismiss.',
  '- Return an EMPTY array when nothing is genuinely missing. A review that always finds something gets ignored, and then it finds nothing.',
  '- "why" quotes or points at the part of the customer’s description that made you think so. If you cannot point at anything, do not raise it.',
  '- "confidence" is high only when the customer said it outright or the trade makes it unavoidable. Trade convention alone is medium. A hunch is low.',
  '- Never mention the customer’s name, address or phone number.',
  '- At most 5 omissions, best first.',
  'Output nothing except the JSON object.',
].join('\n');

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

const MONEY = /(\$\s?\d|\d+\s?(dollars|usd)\b)/i;

/**
 * Turn the model's output into findings, dropping anything that strayed.
 *
 * The money filter is the boundary made real rather than merely instructed: a
 * suggestion that names a price is discarded whole, because the instruction not
 * to produce one is a request and this is a rule.
 */
export function toOmissionFindings(raw: unknown): QuoteFinding[] {
  const record = (raw ?? {}) as { omissions?: unknown };
  const list = Array.isArray(record.omissions) ? record.omissions : [];
  const findings: QuoteFinding[] = [];

  for (const entry of list.slice(0, 5)) {
    const item = entry as RawOmission;
    const title = String(item?.title ?? '').trim();
    const why = String(item?.why ?? '').trim();
    if (!title || !why) continue;
    if (MONEY.test(title) || MONEY.test(why)) continue;

    const confidence = String(item?.confidence ?? 'low').toLowerCase();
    findings.push({
      id: `ai:${String(item?.id ?? title).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}`,
      // Never 'high'. The model's best guess about a missing line sits below an
      // arithmetic certainty, and topping the list with a suspicion is how the
      // real findings get scrolled past.
      severity: confidence === 'high' ? 'medium' : 'low',
      title,
      detail: why,
      source: 'ai',
    });
  }
  return findings;
}

/**
 * Ask what's missing. Returns an empty list — not null — when it can't run, so
 * the caller shows the deterministic findings rather than an error: a quote with
 * no API key still gets its arithmetic checked.
 */
/**
 * Exported so the "json" requirement can be pinned by a test.
 *
 * The Responses API rejects `text.format: json_object` outright unless the word
 * appears in the INPUT — having it in the instructions is not enough. That 400
 * is caught and returns an empty list, which means the whole omission check
 * would fail on every single quote while the panel carried on looking like it
 * had run. A silent 100% failure is exactly the bug a test should own.
 */
export function buildOmissionInput(context: OmissionContext): string {
  return [
    context.trade ? `TRADE: ${context.trade}` : '',
    `WHAT THE CUSTOMER ASKED FOR:\n${context.scope.slice(0, 2000)}`,
    context.estimatedHours ? `The contractor estimates about ${context.estimatedHours} hours.` : '',
    `LINES ON THE QUOTE:\n${context.labels.map((label) => `- ${label}`).join('\n')}`,
    'What is missing? Answer as JSON.',
  ].filter(Boolean).join('\n\n');
}

export async function findOmissions(context: OmissionContext): Promise<QuoteFinding[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || !context.scope.trim() || context.labels.length === 0) return [];

  const input = buildOmissionInput(context);

  try {
    const response = await callModel({
      model: 'gpt-4o',
      // Low but not zero: noticing an unstated dependency is exactly the kind
      // of leap greedy decoding skips, and that leap is the whole feature.
      temperature: 0.2,
      instructions: INSTRUCTIONS,
      input,
      text: { format: { type: 'json_object' } },
    }, { accountId: null, kind: 'guard' });
    if (!response.ok) throw new Error(`OpenAI request failed: ${response.status}`);
    return toOmissionFindings(JSON.parse(extractOutputText(await response.json())));
  } catch (error) {
    console.error('Quote guard omission check failed:', error instanceof Error ? error.message : error);
    return [];
  }
}
