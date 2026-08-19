// A last read of a campaign before it goes to everybody.
//
// The split is the same one Quote Guard uses, for the same reason: facts are
// computed here, in code, and the model is only ever allowed to say a thing is
// ABSENT. Nothing in this file asks an opinion of anything.
//
// The case for checking a campaign harder than a quote is that a quote goes to
// one person and you can follow it up. A campaign goes to your whole list at
// once, there is no unsend, and the damage — an unsubscribe, a spam complaint —
// is permanent and invisible. The expensive mistakes are all cheap to detect.
//
// Every finding says where it came from, because "your subject line is 94
// characters" and "this doesn't say why you're writing this month" deserve very
// different amounts of trust.

import { smsSegmentCount } from '@/lib/sms-segments';

export type CampaignFindingSource = 'check' | 'history' | 'ai';
export type CampaignFindingSeverity = 'high' | 'medium' | 'low';

export type CampaignFinding = {
  id: string;
  severity: CampaignFindingSeverity;
  title: string;
  detail: string;
  source: CampaignFindingSource;
};

export type GuardInput = {
  channel: 'email' | 'sms' | 'both';
  subject: string;
  body: string;
  /** How many people this actually reaches on the chosen channel. */
  reachCount: number;
  /** CAN-SPAM requires one on marketing email. Null means we have none. */
  mailingAddress: string | null;
  /** Days since the last campaign to this account's list, null if never. */
  daysSinceLastSend: number | null;
  /** Unsubscribes recorded since the last campaign went out. */
  unsubscribesSinceLastSend: number;
};

/** Most mail clients truncate a subject around here on a phone. */
export const SUBJECT_TRUNCATES_AT = 60;
/** Under this, an email reads as an advert with no substance. */
const THIN_EMAIL_BODY = 140;
/** Sending again inside this many days is worth a second thought. */
export const CROWDING_DAYS = 7;
/**
 * Characters the sender appends: the business-name prefix and the opt-out line.
 *
 * Approximate by design — the prefix is a workspace's own name — but its length
 * is stable and it is plain GSM-7, so it can never change which alphabet the
 * body already forced.
 */
const APPENDED_CHARACTERS = 40;

/**
 * Placeholders that look like ours but aren't.
 *
 * `{name}` is the only token the send path substitutes. Anything else in braces
 * is delivered to the customer exactly as typed — "Hi {first_name}," lands in
 * two hundred inboxes as literally that, and it is the single most embarrassing
 * way to send a mail merge.
 */
const PLACEHOLDER = /\{([a-z0-9_ .-]{1,30})\}/gi;

export function unknownPlaceholders(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(PLACEHOLDER)) {
    const token = match[1].trim().toLowerCase();
    if (token !== 'name') found.add(match[0]);
  }
  return [...found];
}

/** Words a spam filter scores, in the place it weighs them most. */
const SPAM_WORDS = /\b(free|winner|cash|guaranteed|risk[- ]free|act now|urgent|congratulations|click here|limited time)\b/i;

export function shoutiness(text: string): { caps: number; bangs: number } {
  const words = text.split(/\s+/).filter((word) => /[a-z]/i.test(word));
  const caps = words.filter((word) => word.length >= 3 && word === word.toUpperCase()).length;
  return { caps, bangs: (text.match(/!/g) ?? []).length };
}

/**
 * What this campaign will cost in text credits, per recipient.
 *
 * Delegates to the real segment counter rather than dividing by 160. The old
 * arithmetic assumed GSM-7 always, so a body containing one emoji or one curly
 * quote — the two most common ways a contractor's message leaves the GSM
 * alphabet — was warned about at 160 characters per segment and billed at 70.
 * The composer and the invoice now come from the same function.
 */
export function smsSegments(body: string): number {
  return smsSegmentCount(body + 'x'.repeat(APPENDED_CHARACTERS));
}

/**
 * Everything checkable without asking anyone.
 *
 * Pure, so the composer can run it on every keystroke and the contractor sees
 * the problem while they are still writing rather than after they press send.
 */
export function checkCampaign(input: GuardInput): CampaignFinding[] {
  const findings: CampaignFinding[] = [];
  const wantEmail = input.channel === 'email' || input.channel === 'both';
  const wantSms = input.channel === 'sms' || input.channel === 'both';
  const body = input.body.trim();
  const subject = input.subject.trim();

  // --- Things that stop the send outright -----------------------------------

  if (input.reachCount === 0) {
    findings.push({
      id: 'no-reach',
      severity: 'high',
      title: 'Nobody would receive this',
      detail: 'No one in this audience is reachable on the channel you picked. Try a different audience, or a different channel.',
      source: 'check',
    });
  }

  if (wantEmail && !subject) {
    findings.push({
      id: 'no-subject',
      severity: 'high',
      title: 'No subject line',
      detail: 'An email needs one, and it is the only part most people read before deciding.',
      source: 'check',
    });
  }

  if (wantEmail && !input.mailingAddress) {
    findings.push({
      id: 'no-mailing-address',
      severity: 'high',
      title: 'No mailing address on file',
      detail: 'US anti-spam law requires a physical postal address in marketing email. Add yours in Settings — the send is blocked until you do.',
      source: 'check',
    });
  }

  // --- Things that waste the send -------------------------------------------

  const strays = unknownPlaceholders(body).concat(wantEmail ? unknownPlaceholders(subject) : []);
  if (strays.length > 0) {
    findings.push({
      id: 'unknown-placeholder',
      severity: 'high',
      title: `${strays.slice(0, 3).join(', ')} won't be filled in`,
      detail: `Only {name} gets replaced. Everything else is sent exactly as typed, so ${input.reachCount} ${input.reachCount === 1 ? 'person' : 'people'} would receive it with the braces still in it.`,
      source: 'check',
    });
  }

  if (wantEmail && subject.length > SUBJECT_TRUNCATES_AT) {
    findings.push({
      id: 'subject-long',
      severity: 'low',
      title: `Subject is ${subject.length} characters`,
      detail: `Phones cut it off around ${SUBJECT_TRUNCATES_AT}. The part that makes someone open it should be at the front.`,
      source: 'check',
    });
  }

  if (wantEmail && body.length > 0 && body.length < THIN_EMAIL_BODY) {
    findings.push({
      id: 'thin-body',
      severity: 'medium',
      title: 'Very short for an email',
      detail: 'Two lines with an ask reads as an advert. Something the reader can use — even if they never book — is what stops the next one being deleted unopened.',
      source: 'check',
    });
  }

  if (wantSms) {
    const segments = smsSegments(body);
    if (segments > 2) {
      findings.push({
        id: 'sms-long',
        severity: 'medium',
        title: `Each text costs ${segments} segments`,
        detail: `You are billed per segment per person, so this send is ${segments}× the price of a single-segment text. Long texts also get read less.`,
        source: 'check',
      });
    }
  }

  const shout = shoutiness(`${wantEmail ? subject : ''} ${body}`);
  if (shout.caps >= 2 || shout.bangs >= 3) {
    findings.push({
      id: 'shouty',
      severity: 'medium',
      title: 'Reads as shouting',
      detail: 'Capitalised words and rows of exclamation marks are what spam filters score hardest. This one is more likely to land in junk than in an inbox.',
      source: 'check',
    });
  }

  if (wantEmail && SPAM_WORDS.test(subject)) {
    findings.push({
      id: 'spam-words',
      severity: 'medium',
      title: 'Subject uses words filters watch for',
      detail: 'Words like "free", "guaranteed" and "act now" are weighted heaviest in the subject line. Saying the same thing plainly gets delivered more often.',
      source: 'check',
    });
  }

  // --- Things only the account's own history knows --------------------------

  if (input.daysSinceLastSend !== null && input.daysSinceLastSend <= CROWDING_DAYS) {
    const when = input.daysSinceLastSend === 0
      ? 'earlier today'
      : `${input.daysSinceLastSend} day${input.daysSinceLastSend === 1 ? '' : 's'} ago`;
    findings.push({
      id: 'sent-recently',
      severity: 'high',
      title: `You messaged this list ${when}`,
      detail: 'Frequency is what makes people unsubscribe — far more than anything in the message. If both were worth sending, they were probably worth sending as one.',
      source: 'history',
    });
  }

  if (input.unsubscribesSinceLastSend > 0) {
    findings.push({
      id: 'recent-unsubscribes',
      severity: input.unsubscribesSinceLastSend >= 5 ? 'medium' : 'low',
      title: `${input.unsubscribesSinceLastSend} ${input.unsubscribesSinceLastSend === 1 ? 'person' : 'people'} unsubscribed after your last send`,
      detail: 'An unsubscribe is permanent — that customer cannot be emailed again, by any campaign, ever. Worth knowing before you spend more of the list.',
      source: 'history',
    });
  }

  return findings;
}

/** Highest severity first, then the deterministic ones ahead of the model's. */
const SEVERITY_ORDER: Record<CampaignFindingSeverity, number> = { high: 0, medium: 1, low: 2 };
const SOURCE_ORDER: Record<CampaignFindingSource, number> = { check: 0, history: 1, ai: 2 };

export function rankFindings(findings: CampaignFinding[]): CampaignFinding[] {
  return [...findings].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || SOURCE_ORDER[a.source] - SOURCE_ORDER[b.source],
  );
}

/** Whether anything found is serious enough to be worth a confirm. */
export function hasBlockingFinding(findings: CampaignFinding[]): boolean {
  return findings.some((finding) => finding.severity === 'high');
}
