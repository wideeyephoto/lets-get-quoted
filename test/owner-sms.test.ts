import { describe, it, expect, vi, beforeEach } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Two texting questions that were being answered as one.
 *
 *   1. May LGQ text the OWNER about their own account?
 *   2. May this contractor text THEIR CUSTOMERS from a number of their own?
 *
 * Separate storage, separate consent, separate answers — and the tests below
 * exist mostly to stop them collapsing back into each other, because the
 * collapsed version looks fine on a screen and is wrong in the two places it
 * matters: it tells somebody they are set up for customer texting because they
 * typed their own mobile into a box, and it reports a state when what actually
 * happened is that a query failed.
 */

/* -------------------------------------------------------------------------
   The reads, with the database stubbed
   ---------------------------------------------------------------------- */

type Row = Record<string, unknown> | null;
type Reply = { data: Row; error: { message: string } | null };

const replies = new Map<string, Reply>();

/**
 * The thinnest thing that answers the PostgREST builder the loaders use:
 * .from(t).select(...).eq(...).eq(...).maybeSingle(). Keyed by table, so one
 * test can make the account read succeed and the consent read fail — which is
 * the case the "half an answer is not an answer" rule is written for.
 */
vi.mock('@/lib/auth', () => ({
  createAdminClient: () => ({
    from(table: string) {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => replies.get(table) ?? { data: null, error: null },
      };
      return chain;
    },
  }),
}));

const {
  aggregateChip,
  canSaveOwnerAlerts,
  loadOwnerAlerts,
  loadRegistration,
  ownerAlertChip,
  registrationChip,
  validateOwnerAlerts,
  REGISTRATION_STATUSES,
} = await import('@/lib/owner-sms');

const {
  needsOwnerSmsConsent,
  OWNER_SMS_CONSENT_LABEL,
  OWNER_SMS_DISCLOSURE,
  OWNER_SMS_DISCLOSURE_VERSION,
} = await import('@/lib/owner-sms-disclosure');

beforeEach(() => replies.clear());

describe('reading the owner’s notification settings', () => {
  it('reports the number, the switch and the consent together', async () => {
    replies.set('accounts', { data: { alert_phone: '(248) 555-0100', high_value_sms_enabled: true }, error: null });
    replies.set('sms_consent', {
      data: { status: 'opted_in', consented_at: '2026-08-01T00:00:00Z', disclosure_version: OWNER_SMS_DISCLOSURE_VERSION },
      error: null,
    });

    const alerts = await loadOwnerAlerts('acc-1');
    expect(alerts).toEqual({
      kind: 'ok',
      // Normalized, because that is the shape the consent ledger stores.
      phone: '+12485550100',
      enabled: true,
      consent: 'opted_in',
      consentedAt: '2026-08-01T00:00:00Z',
      consentVersion: OWNER_SMS_DISCLOSURE_VERSION,
    });
  });

  /* A consent written before the wording was versioned. Not the same as no
     consent, and not good enough to show a carrier either — so it is carried
     through as null rather than smoothed into the current version. */
  it('carries a pre-versioning consent through as null', async () => {
    replies.set('accounts', { data: { alert_phone: '+12485550100', high_value_sms_enabled: true }, error: null });
    replies.set('sms_consent', { data: { status: 'opted_in', consented_at: '2026-08-01T00:00:00Z' }, error: null });
    const alerts = await loadOwnerAlerts('acc-1');
    expect(alerts.kind === 'ok' && alerts.consent).toBe('opted_in');
    expect(alerts.kind === 'ok' && alerts.consentVersion).toBeNull();
  });

  /* A number with no consent row is what EVERY account looked like before this
     shipped, and it is why a STOP from an owner did nothing — the inbound
     handler only UPDATEs. It is a real state, not an error. */
  it('tells a number with no consent row apart from one that is opted in', async () => {
    replies.set('accounts', { data: { alert_phone: '+12485550100', high_value_sms_enabled: true }, error: null });
    replies.set('sms_consent', { data: null, error: null });
    const alerts = await loadOwnerAlerts('acc-1');
    expect(alerts.kind === 'ok' && alerts.consent).toBe('none');
  });

  it('does not go looking for consent on a number that does not exist', async () => {
    replies.set('accounts', { data: { alert_phone: null, high_value_sms_enabled: false }, error: null });
    // Deliberately an ERROR on the consent table: if it were read, this would
    // come back unavailable rather than a clean empty state.
    replies.set('sms_consent', { data: null, error: { message: 'boom' } });
    expect(await loadOwnerAlerts('acc-1')).toEqual({
      kind: 'ok', phone: null, enabled: false, consent: 'none', consentedAt: null, consentVersion: null,
    });
  });

  /**
   * HALF AN ANSWER IS NOT AN ANSWER. A number whose consent state could not be
   * read is not "a number that is fine" — reporting it as set up is the exact
   * failure this module is written against.
   */
  it('is unavailable when either read fails, not partially populated', async () => {
    replies.set('accounts', { data: null, error: { message: 'timeout' } });
    expect(await loadOwnerAlerts('acc-1')).toEqual({ kind: 'unavailable' });

    replies.clear();
    replies.set('accounts', { data: { alert_phone: '+12485550100', high_value_sms_enabled: true }, error: null });
    replies.set('sms_consent', { data: null, error: { message: 'timeout' } });
    expect(await loadOwnerAlerts('acc-1')).toEqual({ kind: 'unavailable' });
  });
});

describe('reading the registration', () => {
  /**
   * NO ROW IS NOT AN ERROR. Rows are created when a registration begins and
   * none have begun, so every account today has no row — and that means
   * not_started, which is a real answer.
   */
  it('reads a missing row as not_started', async () => {
    replies.set('messaging_registrations', { data: null, error: null });
    expect(await loadRegistration('acc-1')).toEqual({
      kind: 'ok', status: 'not_started', assignedNumber: null, detail: null,
    });
  });

  /**
   * A read that ERRORS is the different thing, and it is also what a missing
   * TABLE looks like — which is how this survives the migration not having been
   * applied yet. It says it cannot tell rather than announcing that nobody has
   * registered.
   */
  it('is unavailable when the table cannot be read', async () => {
    replies.set('messaging_registrations', { data: null, error: { message: 'relation does not exist' } });
    expect(await loadRegistration('acc-1')).toEqual({ kind: 'unavailable' });
  });

  it('refuses a status it does not recognize rather than guessing', async () => {
    replies.set('messaging_registrations', { data: { status: 'pending_vetting' }, error: null });
    expect(await loadRegistration('acc-1')).toEqual({ kind: 'unavailable' });
  });

  /**
   * A NUMBER IS ONLY EVER REPORTED ALONGSIDE AN APPROVAL. Provisioning can put
   * one on a row that is still in review; showing it would tell a contractor
   * they have a working number days before they do.
   */
  it('withholds an assigned number until the registration is approved', async () => {
    replies.set('messaging_registrations', { data: { status: 'in_review', assigned_number: '+12485550199' }, error: null });
    const pending = await loadRegistration('acc-1');
    expect(pending.kind === 'ok' && pending.assignedNumber).toBeNull();

    replies.set('messaging_registrations', { data: { status: 'approved', assigned_number: '+12485550199' }, error: null });
    const live = await loadRegistration('acc-1');
    expect(live.kind === 'ok' && live.assignedNumber).toBe('+12485550199');
  });

  /* There is deliberately no 'unavailable' member: that is not something an
     account IS, and storing a read failure as a value is how "we could not
     check" becomes "we checked and it is fine". */
  it('has no stored status meaning "we could not check"', () => {
    expect(REGISTRATION_STATUSES).not.toContain('unavailable');
    expect([...REGISTRATION_STATUSES]).toEqual([
      'not_started', 'submitted', 'in_review', 'approved', 'action_required', 'rejected',
    ]);
  });
});

/* -------------------------------------------------------------------------
   What the strip says
   ---------------------------------------------------------------------- */

const okAlerts = (
  over: Partial<{
    phone: string | null;
    enabled: boolean;
    consent: 'opted_in' | 'opted_out' | 'none';
    consentVersion: string | null;
  }> = {},
) => ({
  kind: 'ok' as const,
  phone: '+12485550100',
  enabled: true,
  consent: 'opted_in' as const,
  consentedAt: null,
  // Current by default, so every other case in this file is testing the thing
  // it names rather than accidentally testing a stale disclosure.
  consentVersion: OWNER_SMS_DISCLOSURE_VERSION as string | null,
  ...over,
});

describe('the owner-alert chip', () => {
  it('only says Ready when something would actually arrive', () => {
    expect(ownerAlertChip(okAlerts()).label).toBe('Ready');
    expect(ownerAlertChip(okAlerts({ phone: null })).label).toBe('Setup needed');
    expect(ownerAlertChip(okAlerts({ enabled: false })).label).toBe('Off');
  });

  /**
   * A NUMBER IS NOT PERMISSION. Both of these reported Ready before, because
   * the only question asked was whether a number existed — so a legacy account
   * whose mobile was typed into the old settings page (which never asked for
   * consent) looked identical to one that had properly agreed.
   */
  it('says Consent needed for a number with no consent row', () => {
    const chip = ownerAlertChip(okAlerts({ consent: 'none' }));
    expect(chip.label).toBe('Consent needed');
    expect(chip.tone).toBe('attention');
  });

  it('says Consent needed when they agreed to superseded wording', () => {
    const chip = ownerAlertChip(okAlerts({ consentVersion: '2026-01-01-owner-alerts-v1' }));
    expect(chip.label).toBe('Consent needed');
    expect(chip.tone).toBe('attention');
    expect(ownerAlertChip(okAlerts({ consentVersion: null })).label).toBe('Consent needed');
  });

  /* Consent outranks the switch: whether we MAY text is a different question
     from whether they currently want a particular alert. */
  it('reports missing consent even when alerts are switched off', () => {
    expect(ownerAlertChip(okAlerts({ consent: 'none', enabled: false })).label).toBe('Consent needed');
  });

  /* Somebody who replied STOP is not getting their lead alerts, and a page that
     says Ready is lying to them about why their phone is quiet. */
  it('says Stopped rather than Ready for a number that opted out', () => {
    const chip = ownerAlertChip(okAlerts({ consent: 'opted_out' }));
    expect(chip.label).toBe('Stopped');
    expect(chip.tone).toBe('attention');
    expect(chip.detail).toContain('START');
  });

  it('says Unavailable, never a state, when the read failed', () => {
    const chip = ownerAlertChip({ kind: 'unavailable' });
    expect(chip.label).toBe('Unavailable');
    expect(chip.tone).toBe('unknown');
    expect(chip.label).not.toBe('Setup needed');
  });
});

describe('the customer-texting chip', () => {
  it('calls not_started Available and separates applying from activation', () => {
    const chip = registrationChip({ kind: 'ok', status: 'not_started', assignedNumber: null, detail: null });
    expect(chip.label).toBe('Available');
    expect(chip.label).not.toBe('Not started');
    expect(chip.detail).toContain('Dedicated business numbers');
    expect(chip.detail).toContain('Required for AI Voice');
    for (const claim of ['Ready', 'Approved', 'Active', 'Enabled', 'Private beta']) {
      expect(chip.label, claim).not.toBe(claim);
    }
  });

  it('maps every other stored status to something a person can act on', () => {
    const at = (status: string, detail: string | null = null) =>
      registrationChip({ kind: 'ok', status: status as never, assignedNumber: null, detail });
    expect(at('approved').label).toBe('Approved');
    expect(at('submitted').label).toBe('Under review');
    expect(at('in_review').label).toBe('Under review');
    expect(at('action_required', 'Your EIN did not match.').detail).toBe('Your EIN did not match.');
    expect(at('rejected').label).toBe('Action required');
  });

  it('says Unavailable rather than Coming soon when the read failed', () => {
    expect(registrationChip({ kind: 'unavailable' }).label).toBe('Unavailable');
  });
});

describe('the one chip a phone has room for', () => {
  /**
   * IT HAS TO BE THE WORST OF THE TWO. A summary reporting "Ready" while the
   * other half says "Action required" hides the only thing it exists to
   * surface — and the strip is the only place a phone shows either.
   */
  it('reports the more severe half, not the first one', () => {
    const stopped = okAlerts({ consent: 'opted_out' });
    const coming = { kind: 'ok' as const, status: 'not_started' as const, assignedNumber: null, detail: null };
    expect(aggregateChip(stopped, coming).tone).toBe('attention');
    expect(aggregateChip(stopped, coming).label).toBe('Needs attention');

    const approved = { kind: 'ok' as const, status: 'approved' as const, assignedNumber: null, detail: null };
    expect(aggregateChip(okAlerts(), approved).label).toBe('Ready');
    expect(aggregateChip(okAlerts(), coming).label).toBe('In progress');
  });

  /* Not knowing outranks everything, including a problem: a page that shows
     "Needs attention" while half of it failed to load is still guessing. */
  it('lets Unavailable outrank a real problem', () => {
    expect(aggregateChip(okAlerts({ consent: 'opted_out' }), { kind: 'unavailable' }).label).toBe('Unavailable');
    expect(aggregateChip({ kind: 'unavailable' }, { kind: 'ok', status: 'approved', assignedNumber: null, detail: null }).label)
      .toBe('Unavailable');
  });
});

/* -------------------------------------------------------------------------
   The form
   ---------------------------------------------------------------------- */

describe('what the dialog will not accept', () => {
  const fields = (over: Partial<{ phone: string; enabled: boolean; consented: boolean }> = {}) =>
    ({ phone: '(248) 555-0100', enabled: true, consented: true, ...over });

  it('takes a valid number with consent', () => {
    expect(validateOwnerAlerts(fields())).toEqual([]);
  });

  /* Consent is the thing that makes the number legal to hold for this purpose,
     so it is refused before the number is even looked at. */
  it('refuses to switch alerts on without the box ticked', () => {
    const errors = validateOwnerAlerts(fields({ consented: false }));
    expect(errors.map((one) => one.field)).toContain('consent');
  });

  it('refuses alerts with no number, and a number that cannot be texted', () => {
    expect(validateOwnerAlerts(fields({ phone: '' })).map((one) => one.field)).toContain('phone');
    expect(validateOwnerAlerts(fields({ phone: '555' })).map((one) => one.field)).toContain('phone');
  });

  /* Alerts off is not a licence to store rubbish: a number nothing can ever
     text is worse in the box than out of it. */
  it('still rejects an unparseable number when alerts are off', () => {
    expect(validateOwnerAlerts(fields({ enabled: false, consented: false, phone: 'call me' }))).toHaveLength(1);
    expect(validateOwnerAlerts(fields({ enabled: false, consented: false, phone: '' }))).toEqual([]);
  });

  /* A form that accepts a submission it cannot store leaves somebody believing
     they are set up. If the read failed the write will fail too. */
  it('cannot be saved at all when the settings could not be read', () => {
    expect(canSaveOwnerAlerts({ kind: 'unavailable' })).toBe(false);
    expect(canSaveOwnerAlerts(okAlerts())).toBe(true);
  });
});

/* -------------------------------------------------------------------------
   How it is wired up
   ---------------------------------------------------------------------- */

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n');
const stripJs = (source: string) =>
  source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const INBOX = stripJs(read('src', 'app', 'dashboard', 'messages', 'page.tsx'));
const STRIP = stripJs(read('src', 'app', 'dashboard', 'messages', 'MessagingSetup.tsx'));
const FORM = stripJs(read('src', 'app', 'dashboard', 'messages', 'OwnerAlertsForm.tsx'));
const ACTIONS = stripJs(read('src', 'app', 'dashboard', 'messages', 'actions.ts'));
const AUTOMATIONS = stripJs(read('src', 'app', 'dashboard', 'automations', 'page.tsx'));
const SETTINGS_ACTIONS = stripJs(read('src', 'app', 'dashboard', 'settings', 'actions.ts'));
const SMS = stripJs(read('src', 'lib', 'sms.ts'));
const DISCLOSURE = stripJs(read('src', 'lib', 'owner-sms-disclosure.ts'));
const MODAL = stripJs(read('src', 'components', 'modal-dialog.tsx'));
const MODAL_STACK = stripJs(read('src', 'components', 'modal-stack.ts'));
const CSS = read('src', 'app', 'globals.css').replace(/\/\*[\s\S]*?\*\//g, '');

describe('the strip, in the inbox', () => {
  /**
   * BETWEEN THE HEADER AND THE CONVERSATIONS, and nowhere else. Not in the
   * header row — that already carries search, four filters and New message —
   * and not in the customer context rail, where a carrier registration has
   * nothing to do with the person you are talking to.
   */
  it('sits between the inbox header and the conversation list', () => {
    const afterHeader = INBOX.indexOf('</header>');
    const layout = INBOX.indexOf('inbox-layout');
    const strip = INBOX.indexOf('<MessagingSetup');
    expect(strip).toBeGreaterThan(afterHeader);
    expect(strip).toBeLessThan(layout);
    // And not inside the header's tools — that row already carries search, four
    // filters and New message, and it is the row that has to stay usable on a
    // laptop. Sliced from the opening tag, not from the top of the file, or
    // this catches the import statement instead.
    const header = INBOX.slice(INBOX.indexOf('<header className="inbox-header">'), afterHeader);
    expect(header).not.toContain('<MessagingSetup');
  });

  /* Measured at 511x648: an expanded panel here pushes the first conversation
     off the screen, and conversations are what the page is for. */
  it('is one row at rest, with a floor rather than a fixed height', () => {
    const at = CSS.indexOf('\n.msg-setup-strip {');
    expect(at).toBeGreaterThan(-1);
    const strip = CSS.slice(at, CSS.indexOf('}', at));
    const min = /min-height:\s*(\d+)px/.exec(strip);
    expect(min, '.msg-setup-strip has no min-height').not.toBeNull();
    expect(Number(min![1])).toBeGreaterThanOrEqual(64);
    expect(Number(min![1])).toBeLessThanOrEqual(72);
    // A chip that wraps on a narrow laptop must be allowed to; clipping it
    // would hide the one word somebody is meant to read.
    expect(strip).not.toMatch(/(^|[^-\w])height:/);
    expect(strip).not.toContain('overflow: hidden');
  });

  it('is a real button, so the whole row is operable and focusable', () => {
    expect(STRIP).toContain('triggerClassName="msg-setup-strip"');
    expect(CSS).toContain('.msg-setup-strip:focus-visible');
    expect(STRIP).not.toContain('<div onClick');
  });

  /* One chip on a phone, two on a desktop — swapped in CSS rather than
     branched in the markup, so there is one source of truth for which exists. */
  it('swaps two chips for the aggregate below 720', () => {
    const narrow = CSS.slice(CSS.indexOf('@media (max-width: 720px)', CSS.indexOf('.msg-setup')));
    expect(narrow).toMatch(/\.msg-setup-chips\s*\{\s*display:\s*none;/);
    expect(narrow).toMatch(/\.msg-setup-chips\.is-compact\s*\{\s*display:\s*flex;/);
    expect(STRIP).toContain('aggregateChip');
  });

  /* Landing here from automations must not park the row under the fixed
     mobile navigation. */
  it('offsets the anchor from the top of the viewport', () => {
    const at = CSS.indexOf('\n.msg-setup {');
    expect(CSS.slice(at, CSS.indexOf('}', at))).toContain('scroll-margin-top');
    expect(STRIP).toContain('id="texting-setup"');
  });
});

describe('the dialog', () => {
  /* defaultOpen is INITIAL state only, which is exactly right: a server action
     revalidating the inbox underneath must not shove it back open after
     somebody has closed it. */
  it('opens on ?setup=1 and only on ?setup=1', () => {
    expect(INBOX).toContain("openOnLoad={searchParams.setup === '1'}");
    expect(STRIP).toContain('defaultOpen={openOnLoad}');
    // Not "because consent is missing" and not "because a query failed".
    expect(STRIP).not.toMatch(/defaultOpen=\{[^}]*(consent|unavailable|error)/);
  });

  it('reuses the app modal rather than growing a second one', () => {
    expect(STRIP).toContain("import ModalDialog from '@/components/modal-dialog'");
    const modal = read('src', 'components', 'modal-dialog.tsx');
    // Escape, backdrop, scroll lock and inert siblings all still there.
    expect(modal).toContain('modalStackFor(document).register');
    expect(MODAL_STACK).toContain("event.key !== 'Escape'");
    expect(MODAL_STACK).toContain("documentRef.body.style.overflow = 'hidden'");
    expect(MODAL_STACK).toContain("toggleAttribute('inert', true)");
  });

  /**
   * A VALIDATION ERROR MUST NOT CLOSE THE DIALOG. CloseOnSuccess fires on the
   * pending true→false edge, and a rejected save produces the same edge as an
   * accepted one — so a form using it reports "saved" by vanishing whether or
   * not anything was.
   */
  it('does not close itself on the pending edge', () => {
    expect(FORM).not.toContain('CloseOnSuccess');
    expect(FORM).toContain('useFormState');
  });

  it('keeps the two sections apart, and stacks them on a phone', () => {
    expect(STRIP).toContain('Your Let&rsquo;s Get Quoted notifications');
    expect(STRIP).toContain('Your customer texting number');
    const at = CSS.indexOf('\n.msg-setup-sections {');
    const base = CSS.slice(at, CSS.indexOf('}', at));
    // One column by default; two only where there is room.
    expect(base).not.toContain('grid-template-columns');
    expect(CSS).toMatch(/\.msg-setup-sections\s*\{\s*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  });
});

describe('the consent capture', () => {
  /**
   * THE WORDING IS EVIDENCE, so it is asserted character for character.
   *
   * These two sentences go to the carriers as a 10DLC screenshot. A test that
   * checked for "contains STOP" would pass against a paraphrase, and the
   * paraphrase is what a reviewer would compare against the campaign filing.
   */
  it('uses the exact registered checkbox wording', () => {
    expect(OWNER_SMS_CONSENT_LABEL).toBe(
      'I agree to receive recurring transactional account, billing, support, and quote-request alert texts from Let’s Get Quoted at the mobile number above.',
    );
  });

  it('uses the exact registered disclosure', () => {
    expect(OWNER_SMS_DISCLOSURE).toBe(
      'Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help. Consent is not a condition of purchase. See our SMS Terms and Privacy Policy.',
    );
  });

  /* Rendered from the constants, never retyped — otherwise the assertions above
     pin a module nobody displays. */
  it('renders those constants rather than a copy of them', () => {
    expect(FORM).toContain('{OWNER_SMS_CONSENT_LABEL}');
    expect(FORM).toContain('{OWNER_SMS_DISCLOSURE_LEAD}');
    expect(FORM).not.toContain('Message frequency varies');
  });

  it('keeps both links pointed where they were', () => {
    const terms = FORM.slice(FORM.indexOf('msg-setup-terms'), FORM.indexOf('</p>', FORM.indexOf('msg-setup-terms')));
    expect(terms).toContain('OWNER_SMS_TERMS_HREF');
    expect(terms).toContain('OWNER_SMS_PRIVACY_HREF');
    expect(DISCLOSURE).toContain("OWNER_SMS_TERMS_HREF = '/sms-terms'");
    expect(DISCLOSURE).toContain("OWNER_SMS_PRIVACY_HREF = '/privacy'");
  });

  /**
   * UNCHECKED. ALWAYS. NO "already agreed" EXCEPTION.
   *
   * It used to be pre-ticked for anyone with an opted-in row. A pre-ticked box
   * is the textbook example of what does not count as consent, and this one
   * gets photographed for a carrier submission.
   */
  it('never pre-ticks the box, for anybody', () => {
    expect(FORM).toContain('defaultChecked={false}');
    expect(FORM).not.toContain('defaultChecked={alreadyConsented}');
    // Nothing may reach the checkbox's checked state from stored consent.
    const checkbox = FORM.slice(FORM.indexOf('id="alertsConsent"'), FORM.indexOf('</label>', FORM.indexOf('id="alertsConsent"')));
    expect(checkbox).not.toMatch(/defaultChecked=\{(?!false\})/);
  });

  it('shows stored consent as a sentence instead, so state is still visible', () => {
    expect(FORM).toContain('consentIsCurrent');
    expect(FORM).toContain('Consent recorded');
  });

  /* Neither typing a number nor flipping the alert switch is agreement. */
  it('will not enable alerts without an affirmative tick', () => {
    const errors = validateOwnerAlerts({ phone: '(248) 555-0100', enabled: true, consented: false });
    expect(errors.map((one) => one.field)).toContain('consent');
  });

  it('will not enable alerts on an unusable number even with the tick', () => {
    const errors = validateOwnerAlerts({ phone: 'call me', enabled: true, consented: true });
    expect(errors.map((one) => one.field)).toContain('phone');
  });

  /**
   * THE VERSION IS WHAT MAKES THE LEDGER WORTH ANYTHING. "They consented" is
   * not the question a carrier asks; "they consented to THIS" is.
   */
  it('stamps the ledger with the disclosure they were shown', () => {
    expect(ACTIONS).toContain('recordOwnerSmsConsent(accountId, normalized, OWNER_SMS_DISCLOSURE_VERSION)');
    expect(SMS).toContain('disclosure_version: disclosureVersion');
  });

  it('treats any other version, and no version, as needing consent again', () => {
    expect(needsOwnerSmsConsent(OWNER_SMS_DISCLOSURE_VERSION)).toBe(false);
    expect(needsOwnerSmsConsent(null)).toBe(true);
    expect(needsOwnerSmsConsent('2026-01-01-owner-alerts-v1')).toBe(true);
  });

  /**
   * STOP STILL WINS, and now it has to survive a function that CAN overwrite.
   *
   * The old writer was insert-if-absent, so re-opt-in was impossible by
   * construction. This one updates, because re-agreeing to new wording is the
   * point — so the suppression has to be explicit, and it is the update's own
   * WHERE clause rather than a read followed by a write. A read-then-write
   * leaves a window in which a STOP arriving between the two statements is
   * silently undone.
   */
  it('cannot re-opt-in somebody who stopped, by pressing Save', () => {
    const writer = SMS.slice(SMS.indexOf('export async function recordOwnerSmsConsent'));
    const body = writer.slice(0, writer.indexOf('\nexport '));
    expect(body).toContain(".neq('status', 'opted_out')");
    // The guard is in the statement, not in a prior branch.
    expect(body.indexOf(".neq('status', 'opted_out')")).toBeLessThan(body.indexOf('.insert('));
    // An opted-out row reports back as suppressed rather than as a write.
    expect(body).toContain("'opted_out' ? 'suppressed'");
  });

  it('tells the owner when their tick was refused by an earlier STOP', () => {
    expect(ACTIONS).toContain("outcome === 'suppressed'");
    expect(ACTIONS).toContain('replied STOP');
  });

  it('refuses to save when the settings could not be read', () => {
    expect(ACTIONS).toContain("if (current.kind === 'unavailable')");
    expect(STRIP).toContain('disabled={!canSaveOwnerAlerts(setup.alerts)}');
  });
});

describe('the description matches the traffic that is registered', () => {
  /* A description narrower than the permission above it is the mismatch a
     carrier reviewer looks for. Same four categories, same order, as the
     consent label. */
  it('names account, billing, support and quote-request notifications', () => {
    const lead = STRIP.slice(STRIP.indexOf('msg-setup-lead'), STRIP.indexOf('</p>', STRIP.indexOf('msg-setup-lead')));
    for (const category of ['account', 'billing', 'support', 'quote-request']) {
      expect(lead, `the intro should name ${category}`).toContain(category);
    }
  });

  /* The single most common misreading of this dialog. */
  it('says out loud that this does not text customers', () => {
    expect(STRIP).toContain('This does not authorize texts to your customers');
  });

  /**
   * THE PLATFORM CAMPAIGN IS NOT A CONTRACTOR CAMPAIGN. A shared LGQ sender is
   * reserved for LGQ account traffic; an application link may collect vetting
   * evidence, but the setup dialog itself cannot send or purchase anything.
   */
  it('states the carrier boundary and keeps provider mutations off this dialog', () => {
    expect(STRIP).toContain('Your customer texting number');
    expect(STRIP).toContain('shared numbers are reserved for LGQ account, billing, support');
    expect(STRIP).toContain('carrier-approved');
    const numberSection = STRIP.slice(STRIP.indexOf('Your customer texting number'));
    expect(numberSection).not.toContain('<button');
    expect(numberSection).not.toContain('<input');
    expect(numberSection).not.toContain('<form');
  });
});

describe('the screenshot must not leak the inbox behind it', () => {
  /**
   * This dialog is photographed for a carrier submission, over a page listing
   * customer names, mobile numbers and message text. The ordinary scrim —
   * rgba(4,10,18,0.66) with a 3px blur — leaves all three legible.
   */
  it('opens with the obscuring backdrop', () => {
    expect(STRIP).toContain('obscureBackdrop');
    expect(MODAL).toContain("obscureBackdrop ? ' is-private' : ''");
  });

  it('leaves the base class on and registers the exact backdrop as the active portal', () => {
    expect(MODAL).toContain('app-modal-backdrop${obscureBackdrop');
    expect(MODAL).toContain('const backdrop = backdropRef.current');
    expect(MODAL).toContain('backdrop,');
    expect(MODAL_STACK).toContain('child === top.backdrop');
    expect(MODAL_STACK).toContain('restoreOwnedElement(child)');
  });

  /**
   * OPACITY CARRIES IT, BLUR ONLY HELPS. backdrop-filter is unsupported or
   * switched off often enough that a privacy property resting on it would
   * quietly evaporate on the machines least likely to be checked.
   */
  it('is opaque enough on its own, without the filter', () => {
    const rule = CSS.slice(CSS.indexOf('.app-modal-backdrop.is-private'));
    const block = rule.slice(0, rule.indexOf('}'));
    const alpha = Number(/rgba\([^)]*?,\s*([\d.]+)\s*\)/.exec(block)?.[1]);
    expect(alpha).toBeGreaterThanOrEqual(0.95);
    expect(block).toContain('backdrop-filter');
  });

  it('prefixes the filter for Safari, on both backdrops', () => {
    const privateRule = CSS.slice(CSS.indexOf('.app-modal-backdrop.is-private'));
    expect(privateRule.slice(0, privateRule.indexOf('}'))).toContain('-webkit-backdrop-filter');
    const base = CSS.slice(CSS.indexOf('.app-modal-backdrop {'));
    expect(base.slice(0, base.indexOf('}'))).toContain('-webkit-backdrop-filter');
  });
});

describe('the dedicated number claims nothing it cannot do', () => {
  /* Dedicated number registration collects a vetted application, but this compact setup
     surface still cannot directly purchase or assign a provider number without review. */
  it('links to the application without turning setup into a purchase surface', () => {
    const section = STRIP.slice(STRIP.indexOf('Your customer texting number'));
    expect(section).toContain('/dashboard/messages/dedicated-number');
    expect(section).toContain('Applying does not');
    for (const fake of ['Purchase number', 'Buy number', 'Assign campaign']) expect(section).not.toContain(fake);
  });

  /* accounts.sms_number is inbound ROUTING. Conflating "we route this number to
     you" with "you may text customers" is the inference the table exists to
     stop. */
  it('never derives approval from accounts.sms_number', () => {
    const owner = read('src', 'lib', 'owner-sms.ts');
    expect(owner).not.toContain("select('sms_number");
    expect(STRIP).not.toContain('sms_number');
    expect(owner).toContain("from('messaging_registrations')");
  });

  it('ships the migration that backs it, and mirrors it into schema.sql', () => {
    expect(existsSync(join(process.cwd(), 'migrations', '2026-08-19-messaging-registration.sql'))).toBe(true);
    const schema = read('schema.sql');
    expect(schema).toContain('create table if not exists messaging_registrations');
    // SELECT only: an owner who could write their own row could set it to
    // approved and start texting customers on that basis.
    expect(schema).toContain('create policy messaging_registration_read on messaging_registrations for select');
    expect(schema).not.toContain('messaging_registrations for all');
  });
});

describe('automations reports, and no longer collects', () => {
  it('has no phone input left on it', () => {
    expect(AUTOMATIONS).not.toContain('name="alertPhone"');
    expect(AUTOMATIONS).not.toContain('name="highValueSmsEnabled"');
    expect(AUTOMATIONS).not.toContain('Standard rates apply');
  });

  it('links to the dialog rather than duplicating it', () => {
    expect(AUTOMATIONS).toContain('/dashboard/messages?setup=1#texting-setup');
    // Read through the same chip, so the two pages cannot hold two opinions
    // about one account.
    expect(AUTOMATIONS).toContain('ownerAlertChip(await loadOwnerAlerts(accountId))');
  });

  /**
   * THE DESTRUCTIVE WRITE THIS AVOIDS. updateIntakeSettingsAction used to read
   * highValueSmsEnabled and alertPhone from the form. With the fields moved,
   * formData.get returns null — and an unchecked checkbox is indistinguishable
   * from an absent one — so every save of "estimate pricing posture" would have
   * silently cleared the owner's number and switched their alerts off.
   */
  it('no longer writes columns its form does not render', () => {
    const action = SETTINGS_ACTIONS.slice(SETTINGS_ACTIONS.indexOf('export async function updateIntakeSettingsAction'));
    const body = action.slice(0, action.indexOf('\nexport '));
    expect(body).not.toContain('alert_phone');
    expect(body).not.toContain('high_value_sms_enabled');
    expect(body).not.toContain("formData.get('alertPhone')");
  });
});

describe('owner alert texts honor STOP', () => {
  /**
   * They did not. Both senders skipped the ledger — the comments said so — and
   * the inbound handler only UPDATEs existing rows, so an alert_phone that had
   * never been baselined had nothing to flip. The body appends "Reply STOP to
   * opt out", so it told people they could stop it and then did not.
   */
  it('checks the ledger in both of them', () => {
    for (const sender of ['sendOwnerHighValueLeadSms', 'sendOwnerEstimateAcceptedSms']) {
      const at = SMS.indexOf(`export async function ${sender}`);
      expect(at, sender).toBeGreaterThan(-1);
      const body = SMS.slice(at, SMS.indexOf('\nexport ', at + 1));
      expect(body, `${sender} does not check consent`).toContain('isPhoneOptedOut(input.accountId');
      expect(body, `${sender} takes no accountId`).toContain('accountId: string');
    }
  });

  /* isPhoneOptedOut fails closed, which for a lead alert means an owner
     occasionally misses one rather than a person who said stop being texted. */
  it('fails closed when the ledger cannot be read', () => {
    const at = SMS.indexOf('export async function isPhoneOptedOut');
    expect(SMS.slice(at, SMS.indexOf('\n}', at))).toContain('return true;');
  });

  it('passes the account through from every caller', () => {
    for (const [file, ...path] of [
      ['leads route', 'src', 'app', 'api', 'public', 'leads', 'route.ts'],
      ['estimate offers', 'src', 'lib', 'estimate-offers-data.ts'],
      ['reschedule offers', 'src', 'lib', 'reschedule-offers-data.ts'],
    ] as const) {
      const source = read(...(path as unknown as string[]));
      expect(source, `${file} does not pass accountId`).toMatch(/accountId: (site\.account_id|offer\.account_id)/);
    }
  });
});
