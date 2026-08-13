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

beforeEach(() => replies.clear());

describe('reading the owner’s notification settings', () => {
  it('reports the number, the switch and the consent together', async () => {
    replies.set('accounts', { data: { alert_phone: '(248) 555-0100', high_value_sms_enabled: true }, error: null });
    replies.set('sms_consent', { data: { status: 'opted_in', consented_at: '2026-08-01T00:00:00Z' }, error: null });

    const alerts = await loadOwnerAlerts('acc-1');
    expect(alerts).toEqual({
      kind: 'ok',
      // Normalized, because that is the shape the consent ledger stores.
      phone: '+12485550100',
      enabled: true,
      consent: 'opted_in',
      consentedAt: '2026-08-01T00:00:00Z',
    });
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
      kind: 'ok', phone: null, enabled: false, consent: 'none', consentedAt: null,
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

const okAlerts = (over: Partial<{ phone: string | null; enabled: boolean; consent: 'opted_in' | 'opted_out' | 'none' }> = {}) =>
  ({ kind: 'ok' as const, phone: '+12485550100', enabled: true, consent: 'opted_in' as const, consentedAt: null, ...over });

describe('the owner-alert chip', () => {
  it('only says Ready when something would actually arrive', () => {
    expect(ownerAlertChip(okAlerts()).label).toBe('Ready');
    expect(ownerAlertChip(okAlerts({ phone: null })).label).toBe('Setup needed');
    expect(ownerAlertChip(okAlerts({ enabled: false })).label).toBe('Off');
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
  /**
   * "Not started" is an accusation — it says the contractor has something to
   * do. They do not: nobody can begin until the provider confirms the process.
   */
  it('calls not_started "Coming soon" and claims no availability', () => {
    const chip = registrationChip({ kind: 'ok', status: 'not_started', assignedNumber: null, detail: null });
    expect(chip.label).toBe('Coming soon');
    expect(chip.label).not.toBe('Not started');
    expect(chip.detail).toContain('provider');
    for (const claim of ['Ready', 'Approved', 'Active', 'Enabled']) {
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
    expect(narrow).toContain('.msg-setup-chips { display: none; }');
    expect(narrow).toContain('.msg-setup-chips.is-compact { display: flex; }');
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
    expect(modal).toContain("event.key === 'Escape'");
    expect(modal).toContain("document.body.style.overflow = 'hidden'");
    expect(modal).toContain("toggleAttribute('inert', true)");
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
    expect(STRIP).toContain('Customer texting');
    const at = CSS.indexOf('\n.msg-setup-sections {');
    const base = CSS.slice(at, CSS.indexOf('}', at));
    // One column by default; two only where there is room.
    expect(base).not.toContain('grid-template-columns');
    expect(CSS).toContain('.msg-setup-sections { grid-template-columns: repeat(2, minmax(0, 1fr))');
  });
});

describe('the consent capture', () => {
  /**
   * ALL FIVE DISCLOSURES, AT THE BOX. This is what "Standard rates apply." was
   * standing in for on the automations page: frequency, rates, STOP, HELP, and
   * that agreeing is not a condition of buying anything.
   */
  it('says all five things next to the checkbox', () => {
    const terms = FORM.slice(FORM.indexOf('msg-setup-terms'), FORM.indexOf('</p>', FORM.indexOf('msg-setup-terms')));
    expect(terms).toContain('Message frequency varies');
    expect(terms).toContain('rates may apply');
    expect(terms).toContain('Reply STOP');
    expect(terms).toContain('HELP');
    expect(terms).toContain('not a condition of purchase');
    expect(terms).toContain('/sms-terms');
    expect(terms).toContain('/privacy');
  });

  /* Consent that arrives pre-ticked is not consent. Only somebody who has
     already given it gets a checked box — and that row is written by this form
     and nothing else. */
  it('is unchecked the first time', () => {
    expect(FORM).toContain("const alreadyConsented = consent === 'opted_in';");
    expect(FORM).toContain('defaultChecked={alreadyConsented}');
  });

  /**
   * THE LEDGER ROW IS THE POINT. The inbound STOP handler only UPDATEs, so a
   * number with no sms_consent row could not be suppressed — which is why owner
   * alert texts said "Reply STOP" and then ignored it.
   */
  it('writes a consent row the STOP handler can flip', () => {
    expect(ACTIONS).toContain("ensureSmsConsentBaseline(accountId, normalized, 'owner_alerts')");
  });

  /* ensureSmsConsentBaseline and NOT recordSmsConsent: the former never
     overwrites, so pressing Save cannot silently opt somebody back in after
     they texted STOP. Only a START from their own handset can do that. */
  it('cannot re-opt-in somebody who stopped, by pressing Save', () => {
    const action = ACTIONS.slice(ACTIONS.indexOf('saveOwnerAlertsAction'));
    const body = action.slice(0, action.indexOf('\nexport '));
    expect(body).not.toContain('recordSmsConsent');
    const baseline = SMS.slice(SMS.indexOf('export async function ensureSmsConsentBaseline'));
    expect(baseline.slice(0, baseline.indexOf('\nexport '))).toContain('ignoreDuplicates: true');
  });

  it('refuses to save when the settings could not be read', () => {
    expect(ACTIONS).toContain("if (current.kind === 'unavailable')");
    expect(STRIP).toContain('disabled={!canSaveOwnerAlerts(setup.alerts)}');
  });
});

describe('customer texting claims nothing it cannot do', () => {
  /* A "Start registration" button would open a form nobody can file — the
     provider has not confirmed the process for managed accounts. */
  it('offers no submit button while nobody can register', () => {
    const section = STRIP.slice(STRIP.indexOf('Customer texting'));
    for (const fake of ['Start registration', 'Submit registration', '<button', 'Register now']) {
      expect(section, fake).not.toContain(fake);
    }
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
