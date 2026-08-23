import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AUTOMATION_COLUMNS } from '@/lib/automations';
import {
  CATALOGUE_SENDERS,
  SMS_CATALOGUE,
  senderLaneForAudience,
} from '@/lib/sms-catalogue';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');
const SMS = read('src', 'lib', 'sms.ts');

/**
 * The catalogue on the automations page claims to be EVERY text this app sends.
 * That claim is the whole value of the page — a list that is merely most of
 * them is worse than no list, because it reads as complete.
 */
describe('the outgoing-text catalogue covers every sender', () => {
  const senders = [...SMS.matchAll(/export async function (send[A-Za-z]*(?:Sms|SmsEvent|TextBack))\b/g)].map((m) => m[1]);

  it('finds the senders at all', () => {
    // Guards the regex above: if lib/sms is renamed or restructured this test
    // would otherwise pass by comparing two empty lists.
    expect(senders.length).toBeGreaterThan(25);
  });

  it('lists every sender in lib/sms', () => {
    const covered = new Set<string>(CATALOGUE_SENDERS);
    const missing = senders.filter((name) => !covered.has(name));
    expect(missing, `these senders have no catalogue entry: ${missing.join(', ')}`).toEqual([]);
  });

  it('and claims no sender that does not exist', () => {
    const real = new Set(senders);
    const ghosts = CATALOGUE_SENDERS.filter((name) => !real.has(name));
    expect(ghosts, `the catalogue names senders lib/sms does not have: ${ghosts.join(', ')}`).toEqual([]);
  });
});

describe('every catalogue entry', () => {
  it('has a unique id', () => {
    const ids = SMS_CATALOGUE.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  /**
   * A body built from a builder, not typed here. An entry whose body still
   * contains an unresolved placeholder means the sample data did not reach the
   * builder, and the page would be showing `${input.businessName}` to an owner.
   */
  it('renders a real message with the sample data filled in', () => {
    for (const entry of SMS_CATALOGUE) {
      expect(entry.body.length, `${entry.id} has no body`).toBeGreaterThan(20);
      expect(entry.body, `${entry.id} has an unresolved placeholder`).not.toMatch(/\$\{|\{\{/);
      expect(entry.body, `${entry.id} still says undefined`).not.toContain('undefined');
      expect(entry.body, `${entry.id} still says null`).not.toContain('null');
    }
  });

  it('says when it fires and who gets it', () => {
    for (const entry of SMS_CATALOGUE) {
      expect(entry.trigger.length, `${entry.id} has no trigger`).toBeGreaterThan(10);
      expect(entry.title.length, `${entry.id} has no title`).toBeGreaterThan(2);
    }
  });

  /**
   * A row that points at an automation has to point at a real one, or the link
   * on the page goes to a switch that is not there.
   */
  it('names a real automation when it claims to be one', () => {
    for (const entry of SMS_CATALOGUE) {
      if (entry.control.kind !== 'automation') continue;
      expect(
        Object.prototype.hasOwnProperty.call(AUTOMATION_COLUMNS, entry.control.key),
        `${entry.id} points at "${entry.control.key}", which is not an automation`,
      ).toBe(true);
    }
  });

  it('labels the three isolated sender lanes without treating every text as contractor traffic', () => {
    expect(senderLaneForAudience('customer')).toBe('contractor_dedicated');
    expect(senderLaneForAudience('lead')).toBe('contractor_dedicated');
    expect(senderLaneForAudience('owner')).toBe('lgq_shared');
    expect(senderLaneForAudience('crew')).toBe('lgq_dispatch');
  });

  /**
   * The opt-out line, which is the reason the number stays deliverable.
   *
   * TWO MESSAGES ARE EXEMPT, and they are listed here rather than skipped so
   * the exemption is a decision somebody can argue with instead of a gap
   * nobody noticed. Anything NEW that ships without one fails this test.
   *
   *   verification-code  A code the person asked for thirty seconds ago that
   *                      expires in ten minutes. There is no subscription to
   *                      opt out OF, and spending characters on STOP in a
   *                      160-character code message costs deliverability.
   *   inbox-reply        A reply you typed, in a thread the customer started.
   *                      Conversational rather than campaign traffic — the
   *                      customer texted first and can simply stop texting.
   *                      Every AUTOMATED message in the same thread carries the
   *                      line, so the opt-out is always one message away.
   */
  const NO_OPT_OUT = new Set(['verification-code', 'inbox-reply']);

  it('carries an opt-out line in every message to a customer or lead', () => {
    for (const entry of SMS_CATALOGUE) {
      if (entry.audience !== 'customer' && entry.audience !== 'lead') continue;
      if (NO_OPT_OUT.has(entry.id)) {
        expect(entry.body, `${entry.id} is on the exempt list but now carries STOP`).not.toContain('STOP');
        continue;
      }
      /**
       * Case-insensitive, and that is a finding rather than a convenience.
       * Every message in the app ends with "Reply STOP to opt out." as its own
       * sentence except the estimate-booked text, which folds it into
       * "Karen, reply STOP to opt out." Compliance-wise that is fine — the
       * STOP keyword is what carriers match, and it is there in capitals — but
       * it is the one message phrased differently from the other twenty-eight.
       * Asserting the keyword rather than the sentence keeps this test about
       * the thing that matters instead of pinning a wording inconsistency in
       * place as though it were intended.
       */
      expect(entry.body, `${entry.id} has no opt-out instruction`).toMatch(/reply STOP to opt out/i);
    }
  });
});
