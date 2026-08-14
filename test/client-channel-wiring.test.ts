import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');

const CHANNEL = read('src', 'lib', 'client-channel.ts');
const CHANNEL_DATA = read('src', 'lib', 'client-channel-data.ts');
const LEADS = read('src', 'lib', 'leads.ts');
const LEAD_ACTIONS = read('src', 'app', 'dashboard', 'leads', 'actions.ts');
const LEAD_PAGE = read('src', 'app', 'dashboard', 'leads', '[leadId]', 'page.tsx');
const PREVIEW = read('src', 'app', 'dashboard', 'leads', '[leadId]', 'QuoteDeliveryPreview.tsx');
const TOGGLES = read('src', 'components', 'channel-toggles.tsx');
const JOB_PAGE = read('src', 'app', 'dashboard', 'jobs', '[id]', 'page.tsx');
const JOB_ACTIONS = read('src', 'app', 'dashboard', 'jobs', 'actions.ts');
const CHOICE_SWEEP = read('src', 'lib', 'choice-reminder-sweep.ts');
const ARRIVAL_SWEEP = read('src', 'lib', 'arrival-sweep.ts');
const REMINDERS = read('src', 'lib', 'reminders.ts');
const MIGRATION = read('migrations', '2026-08-10-client-message-channel.sql');
const SCHEMA = read('schema.sql');

/**
 * The preference is worth nothing if it stops at the form.
 *
 * These are source assertions, not behavioural ones: every path below reaches
 * for Twilio, Resend or the service-role client. What is being pinned is that
 * each one asks, and asks the SAME function — the failure this replaces was
 * five call sites each deciding "can I text this person" their own way.
 */

describe('the preference is stored, not inferred', () => {
  it('lives on the lead as triage.messageChannel', () => {
    expect(LEADS).toContain('messageChannel?:');
    expect(LEADS).toContain('messageChannel: normalizeClientChannelPreference(triage.messageChannel)');
  });

  it('and on the job, where the automations look', () => {
    expect(MIGRATION).toContain('add column if not exists message_channel text not null default \'auto\'');
    expect(MIGRATION).toContain("check (message_channel in ('auto', 'sms', 'email', 'off'))");
    expect(SCHEMA).toContain('alter table jobs add column if not exists message_channel');
  });

  it('travels from the lead to the job at conversion', () => {
    const convert = LEADS.slice(
      LEADS.indexOf('export async function convertLeadToJob('),
      LEADS.indexOf('export async function unconvertLeadFromJob('),
    );
    expect(convert).toContain('getLeadTriage(lead).messageChannel');
    expect(convert).toContain('message_channel: channel');
  });

  /**
   * This code ships ahead of its migration. An INSERT or SELECT naming a column
   * that does not exist fails the whole statement, so every write is conditional
   * and every read is in its own query that swallows the error.
   */
  it('never names the column on a write that has to succeed', () => {
    const convert = LEADS.slice(LEADS.indexOf('export async function convertLeadToJob('));
    // Skipped entirely for the default, so a pre-migration database is untouched.
    expect(convert).toContain("if (channel !== 'auto')");
    expect(convert).toContain('console.error');
  });

  it('reads it in a query that can fail on its own', () => {
    expect(CHANNEL_DATA).toContain("select('id, message_channel')");
    expect(CHANNEL_DATA).toMatch(/if \(error \|\| !data\) return channels;/);
  });
});

describe('the quote send', () => {
  it('decides through resolveClientChannel rather than three booleans', () => {
    expect(LEAD_ACTIONS).toContain('resolveClientChannel({');
    expect(LEAD_ACTIONS).toContain("kind: 'requested'");
    // The booleans it replaces.
    expect(LEAD_ACTIONS).not.toContain('const willText =');
    expect(LEAD_ACTIONS).not.toContain('const willEmail =');
  });

  it('checks the STOP list, which it never used to', () => {
    expect(LEAD_ACTIONS).toContain('await isPhoneOptedOut(accountId, leadPhone)');
  });

  /**
   * There are now five ways for a quote not to go out, and the banner used to
   * give one explanation for all of them: "this lead has no mobile number or
   * email on file". For a client set to email-only, with a mobile right there on
   * the record, that sends the owner hunting for a detail that is not missing.
   */
  it('tells the owner WHICH way it failed to send', () => {
    expect(LEAD_ACTIONS).toContain("let delivery: string | null = willDeliver ? 'no_contact' : route.reason;");
    const banner = read('src', 'app', 'dashboard', 'jobs', '[id]', 'QuoteDeliveryBanner.tsx');
    for (const reason of ['no_contact', 'preference_off', 'opted_out', 'no_mobile', 'no_email']) {
      expect(banner).toContain(`${reason}:`);
    }
  });

  it('writes the preference down before the job exists', () => {
    // The triage write carries the quote draft as well now, so it is a named
    // object rather than an inline literal — see LeadQuoteDraft. What is under
    // test is unchanged: the preference is on the row before anything can throw.
    const convert = LEAD_ACTIONS.slice(LEAD_ACTIONS.indexOf('export async function convertLeadAction('));
    const buildAt = convert.indexOf('const nextTriage = { ...getLeadTriage(lead), messageChannel, quoteDraft }');
    const storeAt = convert.indexOf('.update({ triage: nextTriage,');
    const jobAt = convert.indexOf('await convertLeadToJob(');
    expect(buildAt).toBeGreaterThan(-1);
    expect(storeAt).toBeGreaterThan(buildAt);
    expect(jobAt).toBeGreaterThan(storeAt);
  });

  /**
   * Start-date options used to be recorded only when the quote could be
   * delivered, so an owner with no way to reach the client automatically had the
   * three dates they had just picked thrown away — on the one page whose purpose
   * is a link they were about to hand over themselves.
   */
  it('records start-date options without needing to deliver anything', () => {
    expect(LEAD_ACTIONS).toContain('if (quickBooking.hasInput) {');
  });

  /**
   * The separate "text just the dates" send is still there for the no-text-quote
   * path — but it now fires on its own consent box being TICKED rather than on
   * the quote box being unticked, which are different questions. Reading one as
   * the other is what made it fire at a client the owner had switched off.
   */
  it('texts the dates on their own only when explicitly asked to', () => {
    expect(LEAD_ACTIONS).toContain("formData.get('quoteScheduleSmsConsent') === 'on'");
    expect(LEAD_ACTIONS).not.toContain('quickBooking.hasInput && !sendClientText');
    // And a STOP reply is not something the owner can tick past.
    expect(LEAD_ACTIONS).toMatch(/if \(optedOut\) throw new Error\(/);
  });
});

describe('the preview on the lead page', () => {
  it('is the same call the send makes', () => {
    expect(PREVIEW).toContain('clientChannelPreview(');
    expect(CHANNEL).toContain('export function clientChannelPreview(');
  });

  it('follows the switches, because it owns them', () => {
    expect(PREVIEW).toContain('<ChannelToggles');
    expect(PREVIEW).toContain('onChange={setChannel}');
    expect(PREVIEW).toContain('preference: channel');
    expect(PREVIEW).toContain('aria-live="polite"');
  });

  /**
   * The one thing that must survive the switch from a tick-box to two toggles:
   * QuoteStartDateCalendar watches #sendClientTextCheckbox by id and listens
   * for 'change'. Deleting it would have left its scheduling-consent box
   * rendering on the path where the quote text already carries consent.
   */
  it('keeps the element the start-date calendar watches', () => {
    expect(PREVIEW).toContain('legacyCheckboxId="sendClientTextCheckbox"');
    expect(PREVIEW).toContain('legacyCheckboxName="sendClientText"');
    expect(TOGGLES).toContain("dispatchEvent(new Event('change'");
    expect(read('src', 'app', 'dashboard', 'leads', '[leadId]', 'QuoteStartDateCalendar.tsx'))
      .toContain("getElementById('sendClientTextCheckbox')");
  });

  it('submits a stored preference alongside it', () => {
    expect(TOGGLES).toContain('<input type="hidden" name={name} value={value} />');
    expect(LEAD_ACTIONS).toContain("formData.get('messageChannel')");
  });

  it('replaced the hardcoded paragraph entirely', () => {
    expect(LEAD_PAGE).toContain('<QuoteDeliveryPreview');
    expect(LEAD_PAGE).not.toContain('📱 A text');
    expect(LEAD_PAGE).not.toContain('No phone or email on file');
  });
});

describe('the job page', () => {
  it('offers the setting where the automations will read it', () => {
    expect(JOB_PAGE).toContain('<ClientChannelField');
    expect(read('src', 'app', 'dashboard', 'jobs', '[id]', 'ClientChannelField.tsx')).toContain('<ChannelToggles');
    expect(JOB_ACTIONS).toContain("const rawChannel = formData.get('messageChannel');");
    // Absent field never resets somebody's choice.
    expect(JOB_ACTIONS).toContain('if (rawChannel !== null) {');
  });

  it('shows a chip only when the answer is not the obvious one', () => {
    expect(JOB_PAGE).toContain('clientChannelChip(clientContact)');
    expect(JOB_PAGE).toContain('{clientChannelNote ?');
  });
});

describe('every automatic message asks first', () => {
  it('choice reminders', () => {
    expect(CHOICE_SWEEP).toContain('loadJobMessageChannels(');
    expect(CHOICE_SWEEP).toContain('resolveClientChannel({');
    expect(CHOICE_SWEEP).toContain("kind: 'automatic'");
    expect(CHOICE_SWEEP).toContain("failure_reason: route.reason === 'opted_out'");
  });

  it('the morning-of confirmation', () => {
    expect(ARRIVAL_SWEEP).toContain('loadJobMessageChannels(');
    expect(ARRIVAL_SWEEP).toContain('canTextClient({');
  });

  it('appointment reminders', () => {
    expect(REMINDERS).toContain('jobMessageChannel(admin, job.account_id, job.id)');
    expect(REMINDERS).toContain("kind: 'automatic'");
  });

  it('the review request', () => {
    const deliver = JOB_ACTIONS.slice(JOB_ACTIONS.indexOf('async function deliverJobReviewRequest('));
    expect(deliver).toContain('resolveClientChannel({');
    expect(deliver).toContain("kind: 'automatic'");
    // And it no longer emails its way around a STOP.
    expect(deliver).toContain("} else if (route.channel === 'email' && job.client_email) {");
    expect(deliver).toContain("} else if (route.reason === 'opted_out') {");
  });

  /**
   * The line between the two. An automation decided to send; a press did not.
   * "No automatic messages" says what it governs, so an owner pressing "on my
   * way" or "send this choice request" is still the owner's business.
   */
  it('and the ones a person pressed are left alone', () => {
    expect(read('src', 'lib', 'arrival-send.ts')).not.toContain('client-channel');
    expect(read('src', 'lib', 'selection-notify.ts')).not.toContain('client-channel');
  });
});
