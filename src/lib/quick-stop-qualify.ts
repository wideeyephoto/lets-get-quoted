// Quick Stop qualification. Two layers, in order:
//   1. A DETERMINISTIC hard-exclusion screener (no AI) — the safety net. Unsafe
//      conditions (gas, CO, fire, live electrical, structural, flooding, sewage,
//      mold/asbestos, hazmat) and clearly-out-of-scope work (permit, excavation,
//      large replacement, multi-worker/day, special-order) are caught here so a
//      dangerous request can NEVER slip through on an AI miss.
//   2. An AI pass (only when nothing was screened out) that judges whether this
//      is a simple, single-technician, short visit and estimates its duration.
// The screener is pure and dependency-free so it can be unit-tested exhaustively.
import { QuickStopSettings } from './quick-stop';

export type QuickStopComplexity = 'simple' | 'moderate' | 'complex';

export type QuickStopExclusionRule = {
  key: string;
  label: string;
  unsafe: boolean;
  patterns: RegExp[];
  // Shown to the customer instead of booking options when unsafe.
  safety?: string;
};

// Ordered most-dangerous first. Patterns are intentionally conservative for the
// unsafe rules — a borderline gas/CO/fire mention SHOULD divert to safety copy.
export const QUICK_STOP_EXCLUSIONS: QuickStopExclusionRule[] = [
  {
    key: 'gas_leak',
    label: 'Possible gas leak',
    unsafe: true,
    patterns: [/\bgas (leak|smell|odou?r)\b/i, /\bsmell(s|ing)?\b[^.]*\bgas\b/i, /\bnatural gas\b[^.]*\bleak\b/i],
    safety:
      'If you smell gas or suspect a leak, treat it as an emergency: get everyone outside now, don’t switch anything on or off, and call 911 or your gas utility from a safe distance. This isn’t something to book online.',
  },
  {
    key: 'carbon_monoxide',
    label: 'Carbon monoxide concern',
    unsafe: true,
    patterns: [/\bcarbon monoxide\b/i, /\bco (alarm|detector) (going off|beeping|sounding)\b/i],
    safety:
      'A carbon monoxide alarm is an emergency. Get everyone into fresh air immediately and call 911. Don’t wait for a scheduled visit.',
  },
  {
    key: 'fire_smoke',
    label: 'Fire or smoke',
    unsafe: true,
    patterns: [/\b(on fire|caught fire|catching fire|flames?|smoke (coming|pouring)|burning smell|smells? burning)\b/i],
    safety: 'If there’s active fire or smoke, leave the building and call 911 right away.',
  },
  {
    key: 'electrical_hazard',
    label: 'Active electrical hazard',
    unsafe: true,
    patterns: [/\b(sparking|sparks|arcing|exposed (wire|wiring)|live wire|electrical fire|getting shocked|shock(ed|ing))\b/i],
    safety:
      'Sparking, arcing, or exposed live wiring is dangerous. Stay clear, shut the power off at the breaker only if you can do so safely, and call an emergency electrician or 911.',
  },
  {
    key: 'structural_failure',
    label: 'Structural failure',
    unsafe: true,
    patterns: [/\b(structural (failure|damage|collapse)|collaps(e|ed|ing)|sagging (roof|floor|ceiling)|foundation (failure|shifting))\b/i],
    safety:
      'Possible structural failure isn’t safe to occupy or to handle with a quick visit. Keep clear of the area and contact a structural engineer or emergency services.',
  },
  {
    key: 'uncontrolled_flooding',
    label: 'Uncontrolled flooding',
    unsafe: true,
    patterns: [/\b(flood(ing|ed)|water (pouring|gushing|everywhere)|uncontrolled water)\b/i],
    safety:
      'For active flooding, shut off the water at the main if you can reach it safely, and call an emergency plumber. If water is near electrical outlets or panels, stay clear and call 911.',
  },
  {
    key: 'sewage',
    label: 'Sewage remediation',
    unsafe: true,
    patterns: [/\b(raw sewage|sewage backup|sewer backup|septic (overflow|backup))\b/i],
    safety: 'A sewage backup is a health hazard that needs specialized remediation, not a short service visit. Please contact an emergency plumbing / remediation service.',
  },
  {
    key: 'mold_asbestos',
    label: 'Mold or asbestos',
    unsafe: true,
    patterns: [/\b(black mold|mold|mould|asbestos)\b/i],
    safety: 'Suspected mold or asbestos requires certified testing and remediation. This can’t be handled as a quick Quick Stop — please contact a licensed remediation specialist.',
  },
  {
    key: 'hazmat',
    label: 'Hazardous materials',
    unsafe: true,
    patterns: [/\b(hazardous material|hazmat|chemical spill|biohazard)\b/i],
    safety: 'Hazardous materials need specialized handling. Please contact the appropriate emergency or remediation service rather than booking a visit.',
  },
  // Non-unsafe: out of scope for a short single-tech visit. No safety copy.
  { key: 'permit_required', label: 'Permit-required work', unsafe: false, patterns: [/\b(permit|permitting|pull a permit|inspection required|code (upgrade|violation))\b/i] },
  { key: 'excavation', label: 'Excavation', unsafe: false, patterns: [/\b(excavat\w*|dig(ging)? (up|out|a trench)|trench(ing)?|backhoe)\b/i] },
  { key: 'large_replacement', label: 'Large replacement', unsafe: false, patterns: [/\b(re-?roof|whole[- ]house|full (replacement|rewire|repipe|reroof))\b/i, /\breplace\b[^.]{0,20}\b(roof|furnace|hvac|water heater|electrical panel|driveway|siding|windows)\b/i] },
  { key: 'multi_worker', label: 'Multi-worker job', unsafe: false, patterns: [/\b(two (guys|techs|technicians|workers)|multiple (workers|technicians)|crew of|needs? a crew)\b/i] },
  { key: 'multi_day', label: 'Multi-day job', unsafe: false, patterns: [/\b(multi(-| )?day|several days|couple of days|over (a )?few days|takes days)\b/i] },
  { key: 'special_order', label: 'Special-order materials', unsafe: false, patterns: [/\b(special[- ]order|custom (order|fabricat\w*)|order(ed)? (in )?parts|back[- ]?ordered)\b/i] },
];

export type ScreenResult = {
  matched: QuickStopExclusionRule[];
  unsafe: boolean;
  safety: string | null;
  labels: string[];
};

// Deterministic first line of defense. Scans the combined intake text against
// every rule; returns all matches, whether any are unsafe, and the safety copy
// for the first unsafe match. Pure — no I/O, no AI.
export function screenHardExclusions(text: string): ScreenResult {
  const hay = (text ?? '').toString();
  const matched = QUICK_STOP_EXCLUSIONS.filter((rule) => rule.patterns.some((p) => p.test(hay)));
  const firstUnsafe = matched.find((r) => r.unsafe);
  return {
    matched,
    unsafe: Boolean(firstUnsafe),
    safety: firstUnsafe?.safety ?? null,
    labels: matched.map((r) => r.label),
  };
}

export type QuickStopQualifyInput = {
  issue: string;
  startedWhen?: string;
  worsening?: string;
  propertyType?: string;
  availability?: string;
  // Site context, to sharpen the AI's read of the trade.
  businessName?: string;
  trade?: string;
  serviceArea?: string;
};

export type QuickStopQualifyOptions = {
  maxVisitMinutes: number;
  categories: string[]; // allowed; empty = all
  requireAiApproval: boolean;
  apiKey?: string | null;
};

export type QuickStopQualification = {
  eligible: boolean;
  unsafe: boolean;
  summary: string;
  visitMinutes: number | null;
  complexity: QuickStopComplexity | null;
  confidence: number; // 0..1
  exclusions: string[]; // human labels of what disqualified it
  safety: string | null; // safety instructions when unsafe
  reason: string | null; // plain-language why-not (non-safety)
  /**
   * Which layer produced this verdict. Not decoration: it decides whether
   * answering more questions could change the outcome. A screener verdict
   * never can — see quickStopFollowUps.
   */
  decidedBy: 'screener' | 'ai' | 'unavailable';
};

function shortSummary(issue: string): string {
  return issue.trim().replace(/\s+/g, ' ').slice(0, 140);
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

/**
 * The verdict the deterministic layer reaches on its own — or null when it found
 * nothing to object to and the AI has to decide.
 *
 * Split out of qualifyQuickStop because it is now needed twice: once at the
 * front of a fresh qualification, and again when a REMEMBERED verdict is held up
 * against the text as it finally stands. See reaffirmQualification.
 */
export function screenerVerdict(text: string, issue: string): QuickStopQualification | null {
  const screen = screenHardExclusions(text);
  if (screen.unsafe) {
    return {
      eligible: false,
      unsafe: true,
      summary: shortSummary(issue),
      visitMinutes: null,
      complexity: null,
      confidence: 1,
      exclusions: screen.labels,
      safety: screen.safety,
      reason: null,
      decidedBy: 'screener',
    };
  }
  if (screen.matched.length) {
    return {
      eligible: false,
      unsafe: false,
      summary: shortSummary(issue),
      visitMinutes: null,
      complexity: null,
      confidence: 1,
      exclusions: screen.labels,
      safety: null,
      reason: `This looks like ${screen.labels[0].toLowerCase()}, which is outside what a Quick Stop covers.`,
      decidedBy: 'screener',
    };
  }
  return null;
}

/**
 * Hold a remembered verdict up against the text as it finally stands.
 *
 * A signed token skips the AI pass, not the safety net. Between "check if this
 * qualifies" and "send the request" the customer types their availability —
 * free text the screener reads and the AI is never shown — so the fuller text
 * can trip a rule the shorter one didn't ("only Saturdays, and it'll want two
 * guys"). The screener therefore runs again here.
 *
 * The account's visit-minute limit is re-applied too, so an approval cannot
 * outlive the one number it might now exceed. The category list is not
 * re-checked: the AI's category isn't carried on the verdict, and it was
 * already gated when the verdict was made.
 */
export function reaffirmQualification(
  cached: QuickStopQualification,
  text: string,
  opts: Pick<QuickStopQualifyOptions, 'maxVisitMinutes'>,
): QuickStopQualification {
  const screened = screenerVerdict(text, cached.summary);
  if (screened) return screened;

  if (cached.eligible && cached.visitMinutes != null && cached.visitMinutes > opts.maxVisitMinutes) {
    // Same label as the live path, so the owner's insights panel counts both
    // under one heading rather than splitting them.
    return {
      ...cached,
      eligible: false,
      exclusions: [`Longer than your ${opts.maxVisitMinutes}-minute Quick Stop limit`],
      reason: `This looks longer than a ${opts.maxVisitMinutes}-minute visit, which is as long as this contractor's route can spare.`,
    };
  }

  return cached;
}

// Main entry. Runs the screener, then (only if clear) the AI pass. Fails CLOSED:
// if the AI is required but unavailable or incoherent, the request is not
// eligible for Quick Stop (it can still fall back to standard booking upstream).
export async function qualifyQuickStop(
  input: QuickStopQualifyInput,
  opts: QuickStopQualifyOptions,
): Promise<QuickStopQualification> {
  const issue = (input.issue ?? '').toString().trim();
  const text = [input.issue, input.startedWhen, input.worsening, input.propertyType, input.availability]
    .filter(Boolean)
    .join(' \n ');

  const screened = screenerVerdict(text, issue);
  if (screened) return screened;

  const apiKey = opts.apiKey ?? process.env.OPENAI_API_KEY ?? null;
  if (!apiKey) {
    // No AI available: honor the setting. When approval is required we can't
    // verify simplicity, so we don't offer Quick Stop.
    return {
      eligible: !opts.requireAiApproval,
      unsafe: false,
      summary: shortSummary(issue),
      visitMinutes: null,
      complexity: null,
      confidence: 0,
      exclusions: [],
      safety: null,
      reason: opts.requireAiApproval ? 'Couldn’t verify this job automatically.' : null,
      decidedBy: 'unavailable',
    };
  }

  const categoryLine = opts.categories.length
    ? `The contractor ONLY accepts Quick Stops in these categories: ${opts.categories.join(', ')}. Set category to the closest one, or "other" if none fit.`
    : 'There is no category restriction.';
  const businessLine = input.businessName || input.trade
    ? `The business is "${input.businessName || 'a local contractor'}"${input.trade ? `, a ${input.trade}` : ''}${input.serviceArea ? ` serving ${input.serviceArea}` : ''}.`
    : '';

  const instructions =
    'You screen a home-services job to decide if it qualifies as an "Quick Stop": a simple, clearly-defined task that ONE technician can reasonably inspect or handle in a single short visit today. ' +
    businessLine +
    ' ' +
    categoryLine +
    ' Respond with strict json only: {"summary":"<one plain sentence naming the job>","visit_minutes":<integer>,"complexity":"simple|moderate|complex","category":"<short tag>","one_tech_ok":true|false,"multiple_jobs":true|false,"confidence":<0..1>,"reason":"<short why-not, or empty>"}. ' +
    'visit_minutes = realistic on-site minutes for one tech. multiple_jobs = true if the request bundles several unrelated tasks. one_tech_ok = false if it truly needs more than one person. Be conservative: if it is ambiguous, large, or likely to exceed a short visit, mark complexity "complex" and one_tech_ok honestly.';
  const inputText =
    `Issue: ${input.issue || '(none)'}\nWhen it started: ${input.startedWhen || '(unknown)'}\n` +
    `Getting worse: ${input.worsening || '(unknown)'}\nProperty type: ${input.propertyType || '(unknown)'}\n\nRespond with json only.`;

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0,
        instructions,
        input: inputText,
        text: { format: { type: 'json_object' } },
      }),
    });
    if (!response.ok) throw new Error(`OpenAI request failed: ${response.status}`);
    const payload = await response.json();
    const parsed = JSON.parse(extractOutputText(payload)) as {
      summary?: unknown;
      visit_minutes?: unknown;
      complexity?: unknown;
      category?: unknown;
      one_tech_ok?: unknown;
      multiple_jobs?: unknown;
      confidence?: unknown;
      reason?: unknown;
    };

    const summary = typeof parsed.summary === 'string' && parsed.summary.trim() ? parsed.summary.trim().slice(0, 160) : shortSummary(issue);
    const visitMinutes = Number.isFinite(Number(parsed.visit_minutes)) ? Math.max(1, Math.round(Number(parsed.visit_minutes))) : null;
    const complexity: QuickStopComplexity =
      parsed.complexity === 'simple' || parsed.complexity === 'moderate' || parsed.complexity === 'complex' ? parsed.complexity : 'moderate';
    const category = typeof parsed.category === 'string' ? parsed.category.trim().toLowerCase() : '';
    const oneTechOk = parsed.one_tech_ok !== false;
    const multipleJobs = parsed.multiple_jobs === true;
    const confidence = Number.isFinite(Number(parsed.confidence)) ? Math.min(1, Math.max(0, Number(parsed.confidence))) : 0.5;

    // Gate the AI verdict against the account's hard limits.
    const exclusions: string[] = [];
    if (visitMinutes != null && visitMinutes > opts.maxVisitMinutes) exclusions.push(`Longer than your ${opts.maxVisitMinutes}-minute Quick Stop limit`);
    if (multipleJobs) exclusions.push('Multiple unrelated jobs');
    if (!oneTechOk) exclusions.push('Needs more than one technician');
    if (complexity === 'complex') exclusions.push('Too complex for a short visit');
    if (opts.categories.length && category && category !== 'other' && !opts.categories.includes(category)) {
      exclusions.push('Outside your accepted Quick Stop categories');
    }

    const eligible = exclusions.length === 0;
    return {
      eligible,
      unsafe: false,
      summary,
      visitMinutes,
      complexity,
      confidence,
      exclusions,
      safety: null,
      reason: eligible ? null : (typeof parsed.reason === 'string' && parsed.reason.trim() ? parsed.reason.trim().slice(0, 160) : exclusions[0]),
      decidedBy: 'ai',
    };
  } catch (error) {
    console.error('Quick Stop qualification failed:', error);
    // Fail closed when approval is required.
    return {
      eligible: !opts.requireAiApproval,
      unsafe: false,
      summary: shortSummary(issue),
      visitMinutes: null,
      complexity: null,
      confidence: 0,
      exclusions: [],
      safety: null,
      reason: opts.requireAiApproval ? 'Couldn’t verify this job automatically.' : null,
      decidedBy: 'unavailable',
    };
  }
}

/* --- asking for the answer that would have qualified them ------------------
   The scoping questions are optional, and a blank one reaches the model as
   "(unknown)". So a request could be turned away for being ambiguous when the
   ambiguity was three empty boxes, and the customer was told "not a fit" with
   no hint that answering them might change it.

   These name the questions that are actually IN the AI's prompt (see
   `inputText` below — `availability` is deliberately absent, it only feeds the
   deterministic screener), so the flow can never point at a box that wouldn't
   have made a difference. */

export type QuickStopScopeAnswers = {
  startedWhen?: string | null;
  worsening?: string | null;
  propertyType?: string | null;
};

export const QUICK_STOP_SCOPE_QUESTIONS: { key: keyof QuickStopScopeAnswers; label: string }[] = [
  { key: 'startedWhen', label: 'When did it start?' },
  { key: 'worsening', label: 'Is it getting worse?' },
  { key: 'propertyType', label: 'Property type' },
];

export function unansweredScopeQuestions(answers: QuickStopScopeAnswers): { key: keyof QuickStopScopeAnswers; label: string }[] {
  return QUICK_STOP_SCOPE_QUESTIONS.filter((question) => !(answers[question.key] ?? '').toString().trim());
}

/**
 * The questions worth going back for, given a verdict that said no.
 *
 * Empty in three cases, each for its own reason:
 *   · eligible — there is nothing to fix.
 *   · unsafe — a gas leak stays a gas leak. The safety instructions are the
 *     answer, and inviting another attempt at the form would undermine them.
 *   · decided by the screener — it matches patterns in the combined text, and
 *     more text can only ADD matches, never clear one. Offering a retry there
 *     would be offering something that cannot work.
 */
export function quickStopFollowUps(
  qualification: Pick<QuickStopQualification, 'eligible' | 'unsafe' | 'decidedBy'>,
  answers: QuickStopScopeAnswers,
): { key: keyof QuickStopScopeAnswers; label: string }[] {
  if (qualification.eligible || qualification.unsafe) return [];
  if (qualification.decidedBy !== 'ai') return [];
  return unansweredScopeQuestions(answers);
}

// Convenience: pull the qualify options straight off a normalized settings object.
export function qualifyOptionsFromSettings(settings: QuickStopSettings, apiKey?: string | null): QuickStopQualifyOptions {
  return {
    maxVisitMinutes: settings.maxVisitMinutes,
    categories: settings.categories,
    requireAiApproval: settings.requireAiApproval,
    apiKey,
  };
}
