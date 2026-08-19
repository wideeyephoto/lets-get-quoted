/**
 * Which model calls come out of a workspace's AI-writing draft balance.
 *
 * The price book sells "AI writing drafts" at 25/50/250/500 without saying which
 * generations count, and the answer changes the effective value of every plan.
 * Ten modules in this codebase call a model; they are not all the same thing. A
 * quote draft is the product the allowance is named after. A guard that reads a
 * quote back and says "this has no price on line 4" is a safety check the
 * contractor did not ask for and would be annoyed to pay for. Receipt OCR is
 * transcription. The blog generator writes LGQ's own marketing.
 *
 * Same shape as `sms-billing-policy.ts`, for the same reason: a call site states
 * what KIND of generation it is - a fact about the code that does not change -
 * and one table says what that costs. Ten call sites each carrying their own
 * boolean would mean re-reading ten modules every time the pricing answer moves.
 */

export type AiWritingKind =
  /** The quote draft itself. What the allowance is named after. */
  | 'quote_draft'
  /** A change order drafted against an existing job. Same product, later. */
  | 'change_order_draft'
  /** Marketing copy the contractor asked for and will send. */
  | 'marketing_draft'
  /**
   * Turning a messy spreadsheet or contact export into structured rows.
   *
   * UNDECIDED. It is real model work the contractor asked for, which argues for
   * counting it. But charging drafts to import data the customer already owns
   * makes onboarding cost money, and onboarding is where a workspace is most
   * likely to abandon.
   */
  | 'import_assist'
  /**
   * Generating the example copy for a contractor's own website.
   *
   * UNDECIDED, for the same reason as import assistance: it is real model work
   * the contractor asked for, but it happens during setup, and charging drafts
   * to fill in your own website is charging for onboarding.
   */
  | 'site_copy'
  /**
   * A guard that reads finished work back and reports what is missing or risky.
   *
   * Exempt. The contractor did not ask for it, it runs whether they want it or
   * not, and billing a safety check is how a safety check gets switched off.
   */
  | 'guard'
  /** Qualifying an inbound Quick Stop request. Routing, not writing. */
  | 'qualifier'
  /** Reading a receipt photo into numbers. Transcription, not writing. */
  | 'transcription'
  /**
   * LGQ's own blog content.
   *
   * Exempt, and this one is not arguable: billing a contractor for marketing
   * copy that LGQ publishes on its own site would be charging them for our work.
   */
  | 'platform_content';

/**
 * The current answer, and the only place to change it.
 *
 * `import_assist` is deliberately conservative: exempt until somebody decides
 * otherwise. Billing for something nobody agreed to charge for is the harder
 * mistake to undo.
 */
const BILLABLE: Readonly<Record<AiWritingKind, boolean>> = Object.freeze({
  quote_draft: true,
  change_order_draft: true,
  marketing_draft: true,
  import_assist: false, // UNDECIDED - see the kind doc above
  site_copy: false, // UNDECIDED - see the kind doc above
  guard: false,
  qualifier: false,
  transcription: false,
  platform_content: false,
});

/** Kinds whose answer is a placeholder rather than a decision. */
export const UNDECIDED_KINDS: readonly AiWritingKind[] = Object.freeze([
  'import_assist',
  'site_copy',
]);

export type AiWritingContext = Readonly<{
  /**
   * The workspace whose balance pays for this. Null where the call genuinely has
   * no workspace behind it - LGQ's own blog - or where the account has not been
   * threaded to the module yet. `aiWritingCallsRequiringAccount` lists the
   * second case so it cannot be mistaken for the first.
   */
  accountId: string | null;
  kind: AiWritingKind;
}>;

/**
 * Modules whose kind BILLS but which have no `accountId` in scope yet.
 *
 * Empty, and worth keeping empty. The failure mode it guards against is silent:
 * a billable generation with a null account simply does not bill, and looks
 * identical to one that is exempt on purpose. If a module is ever added that
 * bills by kind before its account is threaded, name it here rather than
 * leaving the gap to be discovered from a revenue report.
 */
export const AI_WRITING_CALLS_REQUIRING_ACCOUNT: readonly string[] = Object.freeze([]);

/** Whether this particular generation should hold and spend a draft credit. */
export function billsAiWritingDrafts(context: AiWritingContext): boolean {
  return Boolean(context.accountId) && BILLABLE[context.kind];
}
