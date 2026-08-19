/**
 * What LGQ needs from a voice provider, and nothing about who it is.
 *
 * WHY AN INTERFACE HERE, WHEN `sms-provider.ts` ARGUES AGAINST ONE. That file
 * makes the case at length: a class per provider restates every agreement in
 * order to isolate the disagreements, so where two providers agree on 95% of a
 * REST surface, a struct of the differences is the smaller thing. It is right
 * about messaging. Twilio and SignalWire messaging share the same 2010-04-01
 * paths, the same form encoding and the same Basic auth.
 *
 * Voice agents share none of that. Measured, not assumed
 * (docs/ai-voice-v1-decisions.md §11): SignalWire AI Agents deliver ONE JSON
 * callback, at the end of the call, with no signature and no authentication
 * beyond Basic credentials embedded in a URL. Retell and Vapi differ on every
 * one of those, including how many callbacks arrive. A struct of differences
 * between things with nothing in common is just two things.
 *
 * So this module owns the vocabulary and no provider owns any of it. The types
 * below are written from what a CONTRACTOR'S BUSINESS needs — answer, qualify,
 * route, and tell me what it cost — rather than from any provider's payload.
 * If a new provider forces a change here rather than in its own adapter, the
 * seam is in the wrong place and that is the signal to move it.
 *
 * NOTHING HERE NAMES A HOST. The provider is reached by returning instructions
 * to a request it made, and its receipt arrives at a URL of ours, so LGQ never
 * dials out. `test/sms-provider.test.ts` asserts exactly one file under src/
 * names a provider host; this seam is designed to keep that true rather than to
 * argue with it.
 */

export type VoiceProviderId = 'signalwire';

/** An inbound call, as much of it as any provider can be relied on to say. */
export type InboundCall = Readonly<{
  /** The provider's id for this call. Everything downstream joins on it. */
  providerCallId: string;
  /** The number that was dialled — how LGQ finds the workspace. */
  toNumber: string;
  fromNumber: string | null;
}>;

/**
 * What LGQ decided to do with a call, expressed before any provider renders it.
 *
 * `unavailable` and `voicemail` are separate on purpose. A caller who reaches
 * voicemail has been handled the way the contractor configured; a caller who
 * reaches `unavailable` has hit something LGQ could not resolve, and conflating
 * the two would hide the second inside the first for ever.
 */
export type VoiceAnswerPlan =
  | Readonly<{
    kind: 'ai_agent';
    /** Where the provider posts the receipt. Always a URL LGQ owns. */
    receiptUrl: string;
    greeting: string;
    /** Minutes after which the agent must stop, whatever else is true. */
    capMinutes: number;
    /** Where to send the caller when the agent hands off. */
    transferTo: string | null;
  }>
  | Readonly<{
    kind: 'forward';
    /** The contractor's real line. */
    number: string;
    /** Shown to the contractor, so it stays their own number and not the caller's. */
    callerId: string;
    timeoutSeconds: number;
    /** Where the provider reports how the forward ended. */
    actionUrl: string;
  }>
  | Readonly<{ kind: 'voicemail'; message: string }>
  | Readonly<{ kind: 'unavailable'; message: string }>;

/** A rendered answer, ready to return to the provider's own request. */
export type VoiceAnswer = Readonly<{ body: string; contentType: string }>;

/**
 * The end-of-call receipt, normalised.
 *
 * Times are microseconds since the epoch, because that is what the measured
 * provider sends and narrowing them here would throw away precision LGQ has no
 * reason to lose. Any of them may be null: a receipt that cannot support a bill
 * must be recognisable as such rather than arriving as a plausible zero.
 */
export type VoiceReceipt = Readonly<{
  provider: VoiceProviderId;
  providerCallId: string;
  eventType: 'post_conversation';
  /** The provider's own tenancy identifiers, checked against ours on ingest. */
  projectId: string | null;
  spaceId: string | null;
  callStartMicros: number | null;
  callAnswerMicros: number | null;
  callEndMicros: number | null;
  /** The billable window. Strictly inside the answered window; see §11. */
  aiStartMicros: number | null;
  aiEndMicros: number | null;
  callerNumber: string | null;
  summary: string | null;
}>;

/** Why a payload was not accepted. Reported, never silently swallowed. */
export type VoiceReceiptRejection =
  | 'not_an_object'
  | 'missing_call_id'
  | 'call_id_disagreement'
  | 'unsupported_event_type';

export type VoiceReceiptParse =
  | Readonly<{ ok: true; receipt: VoiceReceipt }>
  | Readonly<{ ok: false; reason: VoiceReceiptRejection }>;

export interface VoiceProvider {
  readonly id: VoiceProviderId;

  /**
   * Read an inbound-call request. Returns null when the request is not one —
   * the caller decides what that means, because a webhook boundary and a test
   * harness want different things from a malformed request.
   */
  parseInboundCall(body: FormData | Record<string, unknown>): InboundCall | null;

  /** Render a decision into whatever this provider understands. */
  renderAnswer(plan: VoiceAnswerPlan): VoiceAnswer;

  /** Normalise an end-of-call receipt, or say why it is not one. */
  parseReceipt(payload: unknown): VoiceReceiptParse;
}
