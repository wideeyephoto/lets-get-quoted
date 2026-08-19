// Writing the thing a beat calls for.
//
// The model gets the beat, the trade and the season. It does NOT get the
// customer list, and it is not asked to decide who receives anything — audience
// is a database question with consent rules attached, and no part of it belongs
// to a language model.
//
// Everything it produces is a draft. Nothing here sends.

import type { Beat, Channel, ClimateZone } from '@/lib/marketing-calendar';
import { callModel } from '@/lib/ai-model-call';

export type MarketingDraft = {
  subject: string;
  /** Plain paragraphs. Rendered into the existing campaign email shell. */
  body: string[];
  /** One line, so the contractor can see the ask at a glance. */
  callToAction: string;
  /**
   * Two more subject lines for the same message.
   *
   * The subject is the entire open-or-delete decision and one draft only ever
   * produced one, so the contractor's real choice was "this, or write your
   * own". They come back in the same call and cost nothing extra.
   *
   * They are alternatives to CHOOSE between, not to test: we deliberately do
   * not track opens — that needs a tracking pixel and a vendor bill — so there
   * is no measurement here and the UI must not imply one.
   */
  subjectOptions: string[];
};

export type DraftInput = {
  beat: Beat;
  channel: Channel;
  businessName: string;
  trade: string | null;
  zone: ClimateZone;
  monthName: string;
  /**
   * The current year, passed in explicitly.
   *
   * A live run had the December "year in review" draft confidently thanking
   * people for 2023 and looking forward to 2024 — the model has no idea what
   * year it is, and that would have gone out in a real email. It gets told, and
   * is forbidden from naming any other.
   */
  year: number;
  /** Their own service area, so advice is local rather than generic. */
  serviceArea: string | null;
};

const INSTRUCTIONS = [
  'You write short marketing messages for a small home-services contractor. You are writing ONE message about ONE seasonal topic.',
  '',
  'Return JSON: {"subject":string,"subject_options":[string],"body":[string],"call_to_action":string}',
  '',
  '"subject_options" is TWO more subject lines for the same message, each taking a different angle — one plainer, one more specific. They must be genuine alternatives to "subject", not rewordings of it, and every rule below applies to them too.',
  '',
  'HOW IT SHOULD READ',
  '- Like the owner wrote it between jobs. Plain, direct, a bit dry. Not marketing department.',
  '- Useful even to somebody who never books: tell them the thing they should know. A message that is only an advert gets unsubscribed from.',
  '- Short. Three or four paragraphs of two to three sentences. People read these on a phone.',
  '',
  'RULES',
  '- Say why THIS MONTH. The whole reason for the message is timing; without it there is no reason to send it now.',
  '- No invented statistics, percentages, prices, guarantees or awards. If you do not know a number, do not use one.',
  '- Use ONLY the year you are given, and only if it helps. Never name any other year. You do not know what year it is and a wrong one goes out in a real email.',
  '- No fake urgency: no "limited slots", no countdowns, no "act now". A real deadline (the ground freezing) is fine. A manufactured one is not.',
  '- Never claim the contractor did anything specific for this reader — you do not know who they are.',
  '- Do not mention discounts or offers unless the topic given to you is one.',
  '- "call_to_action" is one sentence and asks for one thing.',
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

/** Exported so a test can pin the "json" requirement — see the Responses API trap. */
export function buildMarketingInput(input: DraftInput): string {
  return [
    `BUSINESS: ${input.businessName}`,
    input.trade ? `TRADE: ${input.trade}` : '',
    input.serviceArea ? `SERVICE AREA: ${input.serviceArea}` : '',
    `MONTH: ${input.monthName} ${input.year}`,
    `TOPIC: ${input.beat.title}`,
    `WHY THIS MONTH: ${input.beat.whyNow}`,
    input.channel === 'blog'
      ? 'FORMAT: a short post for their own website.'
      : 'FORMAT: an email to people who have used them before.',
    'Write it as JSON.',
  ].filter(Boolean).join('\n');
}

/** Words that only ever show up in copy nobody asked for. */
const BANNED = /\b(act now|limited time|limited slots|don'?t miss out|hurry|exclusive offer|guaranteed results|% off)\b/i;

/**
 * Any four-digit year that isn't the one we supplied.
 *
 * Belt-and-braces on top of the instruction, because a wrong year is a factual
 * error in something a contractor puts their name on — and a model that has been
 * told the year can still reach for a familiar one.
 */
function namesAWrongYear(text: string, year: number): boolean {
  return [...text.matchAll(/\b(19|20)\d{2}\b/g)].some((match) => Number(match[0]) !== year);
}

export function normalizeMarketingDraft(raw: unknown, year?: number): MarketingDraft | null {
  const record = (raw ?? {}) as Record<string, unknown>;
  const subject = String(record.subject ?? '').trim().slice(0, 160);
  const bodyRaw = Array.isArray(record.body) ? record.body : [];
  const body = bodyRaw.map((line) => String(line).trim()).filter(Boolean).slice(0, 8);
  const callToAction = String(record.call_to_action ?? '').trim().slice(0, 200);

  if (!subject || body.length === 0) return null;

  // Reject the whole draft rather than quietly editing it. A message with the
  // pressure filed off still had the pressure in it, and the contractor should
  // see a redraft rather than a sanitised version they didn't ask for.
  const whole = [subject, ...body, callToAction].join(' ');
  if (BANNED.test(whole)) return null;
  if (year !== undefined && namesAWrongYear(whole, year)) return null;

  // Alternative subjects are filtered, not gating: a bad extra subject drops
  // out on its own, where a bad one in `subject` throws the draft away. The
  // body is the expensive part and it passed — losing it because the model got
  // enthusiastic on option three would be the wrong trade.
  const optionsRaw = Array.isArray(record.subject_options) ? record.subject_options : [];
  const seen = new Set([subject.toLowerCase()]);
  const subjectOptions: string[] = [];
  for (const entry of optionsRaw) {
    const option = String(entry ?? '').trim().slice(0, 160);
    if (!option || seen.has(option.toLowerCase())) continue;
    if (BANNED.test(option)) continue;
    if (year !== undefined && namesAWrongYear(option, year)) continue;
    seen.add(option.toLowerCase());
    subjectOptions.push(option);
    if (subjectOptions.length === 2) break;
  }

  return { subject, body, callToAction, subjectOptions };
}

/**
 * Draft one beat. Returns null when it genuinely could not run or the output
 * failed the checks — the caller says "couldn't draft" rather than showing
 * something that reads like a considered answer.
 */
export async function draftMarketing(input: DraftInput): Promise<MarketingDraft | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await callModel({
      model: 'gpt-4o',
      // Higher than the money-adjacent features: this is prose, and the
      // failure mode of greedy decoding here is something that reads like
      // every other contractor's newsletter.
      temperature: 0.6,
      instructions: INSTRUCTIONS,
      input: buildMarketingInput(input),
      text: { format: { type: 'json_object' } },
    }, { accountId: null, kind: 'marketing_draft' });
    if (!response.ok) throw new Error(`OpenAI request failed: ${response.status}`);
    return normalizeMarketingDraft(JSON.parse(extractOutputText(await response.json())), input.year);
  } catch (error) {
    console.error('Marketing draft failed:', error instanceof Error ? error.message : error);
    return null;
  }
}
