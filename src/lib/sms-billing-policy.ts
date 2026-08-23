/**
 * Which outbound texts come out of a workspace's text-credit balance.
 *
 * WHY A CATEGORY AND NOT A BOOLEAN AT EACH CALL SITE. The exempt set is a
 * pricing decision, and pricing decisions change. Thirty-two call sites each
 * carrying their own `shouldBill: true` would mean re-reading thirty-two
 * functions every time the answer moves, and would let two texts of the same
 * kind disagree. A call site says what KIND of message it is - which is a fact
 * about the code and does not change - and this table says what that costs.
 *
 * WHY EVERY CALL SITE MUST PASS ONE. The context argument on
 * `sendProviderMessage` is required, not optional, so a new outbound message
 * cannot reach a carrier without someone having decided what it is. An optional
 * parameter would have made "unmetered" the default for every future caller,
 * which is the failure this exists to prevent.
 *
 * Pure: no I/O, no environment. `text-credit-usage.ts` decides whether metering
 * is switched on at all; this decides only what would be billed if it were.
 */

export type SmsBillingCategory =
  /**
   * The workspace texting its own customer: reminders, arrival notices, quotes,
   * campaigns, review asks, inbox replies. The thing text credits are sold for.
   */
  | 'customer_message'
  /**
   * Crew and subcontractor coordination. Still the workspace's own outbound
   * message and still a carrier segment, so billed on the same footing.
   */
  | 'crew_message'
  /**
   * A text to the OWNER'S own mobile telling them something happened in their
   * business - a high-value lead landed, a customer accepted.
   *
   * UNDECIDED. Costs the same at the carrier as any other segment, so exempting
   * it is a real cost the platform absorbs. But charging somebody a credit to be
   * told about their own business is hard to defend on a pricing page.
   */
  | 'owner_alert'
  /**
   * Pay links, payment confirmations, card-update dunning.
   *
   * UNDECIDED. Metering these means a contractor who ran out of texts also stops
   * being able to collect - at the moment they can least afford it, and the
   * moment LGQ earns its own platform fee.
   */
  | 'payment_message'
  /**
   * A one-time code verifying a LEAD's phone before intake submits.
   *
   * Exempt, and not really arguable: there is often no workspace relationship
   * yet, and refusing one does not save a credit, it blocks lead capture.
   */
  | 'verification';

/**
 * The current answer, and the only place to change it.
 *
 * The two `false` entries marked UNDECIDED are deliberately conservative:
 * exempt until somebody decides otherwise. Billing for something nobody agreed
 * to charge for is the harder mistake to undo - a customer notices a charge they
 * did not expect, and does not notice a charge that never came.
 */
const BILLABLE: Readonly<Record<SmsBillingCategory, boolean>> = Object.freeze({
  customer_message: true,
  crew_message: true,
  owner_alert: false, // UNDECIDED - see the category doc above
  payment_message: false, // UNDECIDED - see the category doc above
  verification: false,
});

/** Categories whose answer is a placeholder rather than a decision. */
export const UNDECIDED_CATEGORIES: readonly SmsBillingCategory[] = Object.freeze([
  'owner_alert',
  'payment_message',
]);

export type SmsSendContext = Readonly<{
  /**
   * The workspace whose balance pays for this. Null only where there genuinely
   * is not one - a lead verifying their phone before any workspace relationship
   * exists.
   */
  accountId: string | null;
  category: SmsBillingCategory;
}>;

/** Whether this particular send should hold and spend a text credit. */
export function billsTextCredits(context: SmsSendContext): boolean {
  return Boolean(context.accountId) && BILLABLE[context.category];
}
