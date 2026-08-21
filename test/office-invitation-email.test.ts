import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * An invitation that nobody is told about is not an invitation.
 *
 * The action minted a link and handed it to the OWNER to pass on themselves, so
 * the only thing between an employee and their account was a copy-paste into
 * some other app. It now emails the person being invited.
 *
 * THE PART THAT MATTERS MORE THAN THE SEND: the outcome is reported. The
 * invitation row exists and the link is valid whether or not the message left,
 * so a failed send must neither throw the invitation away nor be dressed up as a
 * success. An owner told "emailed" when nothing was emailed waits for a reply
 * that cannot come — and the link is shown exactly once.
 */
const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8').replace(/\r\n/g, '\n');

const stripComments = (source: string) => source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .split('\n')
  .filter((line) => !/^\s*\/\//.test(line))
  .join('\n');

/** Every line that logs, so an assertion about logging cannot catch other code. */
const logLines = (source: string) => source.split('\n').filter((line) => line.includes('console.'));

describe('the invited person is actually told', () => {
  const ACTIONS = stripComments(read('src/app/dashboard/settings/office-team-actions.ts'));
  const EMAIL = stripComments(read('src/lib/email.ts'));

  /** The invitation sender's body, signature to the next top-level export. */
  const sender = (() => {
    const at = EMAIL.indexOf('export async function sendOfficeInvitationEmail');
    expect(at, 'sendOfficeInvitationEmail not found').toBeGreaterThan(-1);
    const next = EMAIL.indexOf('\nexport ', at + 1);
    return EMAIL.slice(at, next === -1 ? EMAIL.length : next);
  })();

  it('sends an invitation email', () => {
    expect(EMAIL).toContain('export async function sendOfficeInvitationEmail');
    expect(ACTIONS).toContain('await sendOfficeInvitationEmail(');
  });

  it('keeps the invitation when the send fails', () => {
    // The row is already written by the time we try to send, so throwing here
    // would discard a working invitation over a mail problem.
    const at = ACTIONS.indexOf('let emailed = false;');
    expect(at).toBeGreaterThan(-1);
    const block = ACTIONS.slice(at, at + 900);
    expect(block).toContain('try {');
    expect(block).toContain('} catch (error) {');
    expect(block).toContain('emailed = true;');
  });

  it('reports the outcome instead of assuming it', () => {
    expect(ACTIONS).toContain('emailed: boolean;');
    expect(ACTIONS).toContain('return { link, email, resent: false, emailed };');
  });

  it('the screen says which of the two happened', () => {
    const UI = stripComments(read('src/app/dashboard/settings/OfficeTeamSection.tsx'));
    expect(UI).toContain('emailed: result.emailed');
    expect(UI).toContain('{issued.emailed ? (');
    // Both branches still surface the link, because it is shown once either way.
    expect(UI).toContain('<code>{issued.link}</code>');
  });

  it('refuses to claim a send with no provider configured', () => {
    // Same contract as sendClientQuoteEmail: a primary channel whose outcome is
    // reported must throw rather than return quietly, or the caller reports a
    // false success.
    expect(sender).toContain('RESEND_API_KEY');
    expect(sender).toContain("throw new Error('Email provider is not configured.')");
    expect(sender).toContain('if (result.error)');
  });

  it('never writes the link to a log', () => {
    // The link IS the credential — the database keeps only its hash, and that is
    // undone the moment the plaintext lands in a log line.
    //
    // Scoped to LOG LINES rather than a window of characters: the first version
    // sliced 300 chars after the catch and caught the legitimate
    // `return { link, ... }` below it, which hands the invitation back to the
    // screen rather than writing it anywhere.
    for (const line of logLines(sender).concat(logLines(ACTIONS))) {
      expect(line, `a log line names the invite link: ${line.trim()}`)
        .not.toMatch(/\blink\b|inviteUrl/);
    }
  });
});
