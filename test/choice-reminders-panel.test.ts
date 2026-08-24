import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CRON_JOBS } from '@/lib/cron-jobs';
import { AUTOMATION_COLUMNS, AUTOMATION_LABELS } from '@/lib/automations';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');

const PANEL = read('src', 'app', 'dashboard', 'settings', 'ChoiceRemindersSection.tsx');
/** The panel with its prose taken out, for the assertions about what the CODE does. */
const PANEL_CODE = PANEL.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
/**
 * The page that RENDERS the card, which is no longer Settings.
 *
 * Automations moved out of Settings onto its own route in Grow — it is a
 * product, not an account setting — and the card moved with it. The component
 * itself still lives in the settings folder beside its server action, which is
 * why PANEL above is unchanged.
 */
const AUTOMATIONS_PAGE = read('src', 'app', 'dashboard', 'automations', 'page.tsx');
const ACTIONS = read('src', 'app', 'dashboard', 'settings', 'actions.ts');
const GLOBALS = read('src', 'app', 'globals.css');
const SWEEP = read('src', 'lib', 'choice-reminder-sweep.ts');
const MIGRATION = read('migrations', '2026-08-09-choice-reminders.sql');

// The panel is a React component in a suite with no DOM, so these assert against
// the source the way app-shell-width and job-sections-layout do. That is a real
// limit and worth naming: they prove the markup and the CSS say what they must,
// not that a browser painted it. What a browser would do with two columns and a
// disabled button is not in doubt; what the source says has been wrong before.

describe('the Choice reminders card', () => {
  it('is the panel the automations page renders, in the follow-through group', () => {
    expect(AUTOMATIONS_PAGE).toMatch(/id="selections"[\s\S]{0,200}title="Choice reminders"/);
    expect(AUTOMATIONS_PAGE).toContain('subtitle="Follow up when clients have selections waiting"');
    expect(AUTOMATIONS_PAGE).toContain('<ChoiceRemindersSection');
  });

  it('gets its expand/collapse control from the card, not from a second widget', () => {
    // AutomationCard is a native <details>/<summary> with a caret, which is also
    // what makes #selections deep-link and open. The panel adds no rival
    // collapse of its own around the whole thing.
    expect(AUTOMATIONS_PAGE).toMatch(/<details className="automation-card" id=\{id\} name=\{group\}>/);
    expect(AUTOMATIONS_PAGE).toContain('className="automation-caret"');
    expect(PANEL_CODE).not.toMatch(/<details[^>]*className="choice-card"/);
  });

  it('has exactly one enablement control, and it is the card header switch', () => {
    // The Review requests card carried a checkbox writing the same column as the
    // switch above it, rendered from a stale value, and turning the switch off
    // then pressing Save turned the automation back on. One boolean, one control.
    expect(AUTOMATIONS_PAGE).toMatch(
      /toggle=\{\{ on: selectionRemindersEnabled, action: toggleAutomationAction\.bind\(null, 'selections'\), enableBlocked: !customerTextingReady/,
    );
    expect(PANEL_CODE).not.toMatch(/type="checkbox"/);
    expect(PANEL_CODE).not.toMatch(/role="switch"/);
    // The panel receives `enabled` to render state, and never writes it — the
    // column is named in a comment and nowhere in the code.
    expect(PANEL_CODE).toContain('enabled,');
    expect(PANEL_CODE).not.toContain('selection_reminders_enabled');
    expect(PANEL_CODE).not.toContain('toggleAutomationAction');
  });

  it('states the four settings the card is specified to show', () => {
    for (const label of ['Reminder schedule', 'Eligible choices', 'Message grouping', 'Stops automatically']) {
      expect(PANEL, `missing the "${label}" row`).toContain(`<strong`);
      expect(PANEL, `missing the "${label}" row`).toContain(label);
    }
  });

  it('makes the schedule the one editable setting', () => {
    expect(PANEL).toContain('<summary>Edit schedule</summary>');
    // The other three are facts read from shared constants, so the panel cannot
    // claim an eligibility or a stop rule the sweep does not implement.
    expect(PANEL).toContain('{CHOICE_ELIGIBILITY_LABEL}');
    expect(PANEL).toContain('{CHOICE_STOP_LABEL}');
    expect(PANEL).toContain('{choiceGroupingLabel(grouping)}');
  });

  it('previews the message through the sender’s own function', () => {
    // Not a transcription. Four previews in this app have drifted from their
    // sender already; every one was found by a person reading both.
    expect(PANEL).toContain('choiceReminderPreview({ businessName, template: body })');
    expect(PANEL).not.toMatch(/Hi Sarah, you have 2 choices/);
  });

  it('offers Edit message, Send a test and Save changes', () => {
    expect(PANEL).toContain('Edit message');
    expect(PANEL).toContain('Send a test');
    expect(PANEL).toMatch(/\{saveLabel\}/);
    expect(PANEL).toMatch(/const saveLabel = save === 'saving' \? 'Saving…' : save === 'saved' \? 'Saved ✓' : 'Save changes'/);
  });
});

describe('the save button', () => {
  it('is disabled until the form is actually modified', () => {
    expect(PANEL).toMatch(/disabled=\{!dirty \|\| save === 'saving'\}/);
    expect(PANEL).toContain('const dirty = current !== stored;');
  });

  it('compares against what the server holds, not against a mounted snapshot', () => {
    // A baseline taken once at mount goes stale the moment a revalidation lands,
    // which leaves the form permanently "dirty" and the button permanently live.
    expect(PANEL).toMatch(/const stored = useMemo\(/);
    expect(PANEL).toMatch(/\[offsetsKey, hour, template\]/);
  });

  it('syncs from the schedule VALUE, never from the array identity', () => {
    // `offsets` is a fresh array on every server render. An effect depending on
    // it directly fires on every revalidation of the settings page — including
    // ones this form did not cause, such as flipping the card's own switch — and
    // would reset whatever was half-typed underneath the contractor.
    expect(PANEL).toMatch(/const offsetsKey = useMemo\(\(\) => normalizeChoiceOffsets\(offsets\)\.join\(','\), \[offsets\]\)/);
    expect(PANEL).not.toMatch(/useEffect\([^)]*\}, \[offsets\]\)/);
  });

  it('adopts what it submitted, so a normalised-away edit still goes clean', () => {
    // The effects re-sync from the props, and props only change when the STORED
    // value changes. Pick "2 days later" twice, or add trailing whitespace to
    // the message, and the server normalises the submission straight back to
    // what the row already held — no prop moves, no effect fires, and Save
    // would stay enabled forever over a form that is already saved.
    expect(PANEL).toContain('const payloadOffsets = normalizeChoiceOffsets(slots.filter((slot) => slot !== \'\'));');
    expect(PANEL).toMatch(/setSlots\(asSlots\(payloadOffsets\)\);\s*\n\s*setBody\(payloadBody\);/);
    // And the same normalised values are what get sent, so local and stored
    // cannot disagree about what was saved.
    expect(PANEL).toMatch(/payloadOffsets\.forEach\(\(offset, index\) => form\.set\(`choiceOffset\$\{index \+ 1\}`, String\(offset\)\)\)/);
    expect(PANEL).toMatch(/form\.set\('choiceTemplate', payloadBody\)/);
  });

  it('is disabled rather than hidden', () => {
    // "Nothing to save" and "the button has moved" must not be the same picture,
    // and a control that appears under the pointer as you type is a misclick.
    expect(PANEL).not.toMatch(/hidden=\{!dirty/);
    expect(GLOBALS).toContain('.choice-card .choice-foot .btn.primary:disabled');
  });

  it('takes the server value back after a save', () => {
    // The server normalises: pick "2 days later" twice and it stores [2]. Without
    // this the form would keep showing two rows the sweep does not have.
    expect(PANEL).toMatch(/useEffect\(\(\) => \{ setSlots\(asSlots\(offsetsKey\.split\(','\)\.map\(Number\)\)\); \}, \[offsetsKey\]\)/);
    expect(PANEL).toMatch(/useEffect\(\(\) => \{ setSendHour\(String\(hour\)\); \}, \[hour\]\)/);
    expect(PANEL).toMatch(/useEffect\(\(\) => \{ setBody\(template \?\? DEFAULT_CHOICE_REMINDER_TEMPLATE\); \}, \[template\]\)/);
  });
});

describe('loading, success and failure', () => {
  it('has all three states, announced politely', () => {
    expect(PANEL).toMatch(/type SaveState = 'idle' \| 'saving' \| 'saved' \| 'error'/);
    expect(PANEL).toMatch(/aria-live="polite"/);
    expect(PANEL).toMatch(/save === 'saving' \? 'Saving…' : save === 'saved' \? '✓ Saved' : save === 'error' \? 'Couldn’t save' : ''/);
  });

  it('marks the in-flight button busy', () => {
    expect(PANEL).toMatch(/aria-busy=\{save === 'saving'\}/);
    expect(PANEL).toMatch(/aria-busy=\{testing\}/);
  });

  it('shows WHY a save was refused, not just that it was', () => {
    // "You left out {link}" is something the contractor can fix in the box in
    // front of them. A thrown server action gives them nowhere to read it.
    expect(PANEL).toContain('setProblem(');
    expect(PANEL).toMatch(/\{problem \?\? \(enabled/);
    expect(ACTIONS).toMatch(/if \(!check\.ok\) return \{ ok: false, message: check\.message \}/);
  });

  it('clears a refusal as soon as the contractor starts fixing it', () => {
    // The client-side guard returns before any submit, so nothing else would
    // ever reset it — "Couldn’t save" and a stale reason would sit there
    // contradicting a form that is now perfectly valid.
    expect(PANEL).toContain('function clearRefusal()');
    expect(PANEL).toMatch(/onChange=\{\(event\) => \{ clearRefusal\(\); setBody\(event\.target\.value\); \}\}/);
    expect(PANEL).toMatch(/onChange=\{\(event\) => \{ clearRefusal\(\); setSendHour\(event\.target\.value\); \}\}/);
    expect(PANEL).toMatch(/onChange=\{\(event\) => \{\s*\n\s*clearRefusal\(\);/);
  });

  it('reports the outcome of a test send instead of failing silently', () => {
    expect(PANEL).toContain('setTestNote(');
    expect(PANEL).toMatch(/role="status"/);
  });

  it('colours success green and failure red, and neither is the resting state', () => {
    expect(GLOBALS).toContain('.choice-card .choice-save-saved { color: var(--good); }');
    expect(GLOBALS).toContain('.choice-card .choice-save-error { color: var(--bad); }');
  });
});

describe('validation', () => {
  it('refuses to submit a message the sweep could not send', () => {
    expect(PANEL).toMatch(/if \(!templateCheck\.ok\) \{/);
    expect(PANEL).toContain("const templateCheck = validateChoiceTemplate(body);");
  });

  it('and the server checks again, because a server action is a public endpoint', () => {
    expect(ACTIONS).toContain('const check = validateChoiceTemplate(raw);');
    expect(ACTIONS).toContain('normalizeChoiceOffsets(offsets)');
    expect(ACTIONS).toContain("normalizeChoiceReminderHour(formData.get('choiceHour'))");
  });

  it('ties the error to the field for a screen reader, not just to a colour', () => {
    expect(PANEL).toMatch(/aria-invalid=\{!templateCheck\.ok\}/);
    expect(PANEL).toMatch(/aria-describedby="choice-template-help choice-template-error"/);
    expect(PANEL).toMatch(/id="choice-template-error" className="choice-invalid" role="alert"/);
    // The red border is driven by the same attribute the screen reader reads, so
    // the two cannot get out of step.
    expect(GLOBALS).toContain(".choice-card .choice-editor textarea[aria-invalid='true']");
  });

  it('caps the message at the length the validator enforces', () => {
    expect(PANEL).toContain('maxLength={CHOICE_TEMPLATE_MAX}');
  });
});

describe('accessibility', () => {
  it('labels every control', () => {
    expect(PANEL).toMatch(/htmlFor="choice-template"/);
    expect(PANEL).toMatch(/id="choice-template"/);
    // A fieldset with a legend, so the three selects read as one schedule rather
    // than three unrelated dropdowns.
    expect(PANEL).toContain('<legend>Send a reminder</legend>');
  });

  it('starts each accessible name with the label you can actually see', () => {
    // WCAG 2.5.3, Label in Name. An aria-label overrides the wrapping <label>,
    // so one that does not contain the visible word leaves somebody using voice
    // control unable to say the thing in front of them.
    expect(PANEL).toContain("const SLOT_LABELS = ['First', 'Then', 'And then'] as const;");
    expect(PANEL).toContain('<span>{SLOT_LABELS[index]}</span>');
    expect(PANEL).toMatch(/aria-label=\{`\$\{SLOT_LABELS\[index\]\} — days after the needed-by date`\}/);
    expect(PANEL).toMatch(/<span>At<\/span>/);
    expect(PANEL).toContain('aria-label="At — the hour of the day reminders are sent"');
  });

  it('tells assistive tech what the Edit message button does', () => {
    expect(PANEL).toMatch(/aria-expanded=\{editingMessage\}/);
    expect(PANEL).toMatch(/aria-controls="choice-message-editor"/);
    expect(PANEL).toMatch(/id="choice-message-editor"/);
    // hidden, not display:none via a class — it keeps the editor out of the tab
    // order and out of the accessibility tree while folded.
    expect(PANEL).toMatch(/hidden=\{!editingMessage\}/);
    // And the CSS has to let `hidden` win. `.choice-editor { display: grid }` is
    // an author rule on the very element carrying the attribute, and an author
    // rule always beats the UA stylesheet's `[hidden] { display: none }` — so
    // without this the editor is permanently open and aria-expanded lies.
    expect(GLOBALS).toContain('.choice-card .choice-editor[hidden] { display: none; }');
  });

  it('gives everything focusable a visible focus ring', () => {
    // Including the two link-shaped buttons and the fold. A form that can be
    // filled in from the keyboard but not navigated by eye while doing it is not
    // keyboard-accessible.
    expect(GLOBALS).toContain('.choice-card :is(button, select, summary, textarea, a):focus-visible');
    expect(GLOBALS).toMatch(/\.choice-card :is\(button, select, summary, textarea, a\):focus-visible \{\s*outline: 2px solid var\(--accent\);/);
  });

  it('and does not reshape the controls while doing it', () => {
    // That selector is (0,2,1), which beats `.btn { border-radius: 999px }` and
    // the textarea's own 10px — so a border-radius here squared off the pill
    // buttons as you tabbed through them. The outline follows the element's own
    // corners without being told.
    const ring = GLOBALS.slice(GLOBALS.indexOf('.choice-card :is(button, select, summary, textarea, a):focus-visible'));
    expect(ring.slice(0, ring.indexOf('}'))).not.toContain('border-radius');
  });

  it('leaves the disabled fade to the theme, which cares about paper', () => {
    // `:root[data-theme='light'] .btn:disabled` raises opacity to 0.72 because
    // 0.45 is unreadable printed. A rule here at (0,5,0) would beat it.
    expect(GLOBALS).toContain('.choice-card .choice-foot .btn.primary:disabled { cursor: not-allowed; }');
  });

  it('uses real buttons rather than clickable spans', () => {
    expect(PANEL).not.toMatch(/<span[^>]*onClick/);
    expect(PANEL).not.toMatch(/<div[^>]*onClick/);
  });

  it('marks decoration as decoration', () => {
    expect(PANEL).toMatch(/className="choice-phone-avatar" aria-hidden="true"/);
  });
});

describe('the layout', () => {
  it('is two columns', () => {
    expect(PANEL).toContain('className="choice-grid"');
    expect(GLOBALS).toMatch(/\.choice-card \.choice-grid \{ display: grid; grid-template-columns: 1fr 1fr;/);
  });

  it('stacks on a narrow screen, at the same breakpoint as its neighbours', () => {
    // The whole tab reflows as one thing rather than card by card.
    expect(GLOBALS).toMatch(/@media \(max-width: 900px\) \{\s*\.choice-card \.choice-grid \{ grid-template-columns: 1fr;/);
    expect(GLOBALS).toMatch(/@media \(max-width: 900px\) \{\s*\.followup-card \.followup-grid \{ grid-template-columns: 1fr;/);
  });

  it('wraps its footer rather than overflowing it', () => {
    expect(GLOBALS).toMatch(/\.choice-card \.choice-foot \{[^}]*flex-wrap: wrap;/);
    expect(GLOBALS).toMatch(/\.choice-card \.choice-actions \{[^}]*flex-wrap: wrap;/);
  });

  it('lets the preview keep the newlines that make it a list', () => {
    // The message is genuinely multi-line — a bullet per choice. Without this
    // the preview would render as one run-on sentence and stop being a preview.
    expect(GLOBALS).toMatch(/\.choice-card \.choice-bubble \{[\s\S]*?white-space: pre-wrap;/);
    expect(GLOBALS).toMatch(/\.choice-card \.choice-bubble \{[\s\S]*?overflow-wrap: anywhere;/);
  });
});

describe('the look', () => {
  it('wears a thin orange outer border and rounded corners', () => {
    expect(GLOBALS).toMatch(/\.choice-card \{[\s\S]*?border-radius: 20px;[\s\S]*?border: 1px solid var\(--cedge-orange-12\);/);
  });

  it('is green when on and muted when off — never red', () => {
    // An automation you have not switched on is a choice, not a fault. Painting
    // it as a fault trains people to stop reading the colour.
    expect(GLOBALS).toMatch(/\.choice-card \.choice-state \{[\s\S]*?color: var\(--good\);/);
    expect(GLOBALS).toContain('.choice-card.is-paused .choice-state { color: var(--mute-t60); }');
  });

  it('uses the app’s own muted-text and border tokens rather than new colours', () => {
    expect(GLOBALS).toMatch(/\.choice-card \.choice-fact > span \{[^}]*color: var\(--mute-t50\);/);
    expect(GLOBALS).toMatch(/\.choice-card \.choice-fact \{[\s\S]*?border: 1px solid var\(--edge-t12\);/);
  });

  it('lets the secondary notes actually be quieter than the values above them', () => {
    // `.choice-card .choice-fact > span` is (0,2,1). A bare `.choice-fact-note`
    // class is (0,2,0) and loses both declarations to it, so the note has to
    // qualify the type selector to win.
    expect(GLOBALS).toContain('.choice-card .choice-fact > span.choice-fact-note');
  });

  it('puts the orange on the actions', () => {
    expect(GLOBALS).toMatch(/\.choice-card \.choice-edit > summary \{[\s\S]*?color: var\(--accent-ink\);/);
    expect(GLOBALS).toMatch(/\.choice-card \.choice-edit-message \{[\s\S]*?color: var\(--accent-ink\);/);
    expect(PANEL).toContain('className="btn primary"');
    // The secondary variant that actually has a base rule. `.btn.ghost`, which
    // the other cards' test buttons wear, is styled only inside
    // `.selection-chosen` and renders as a plain `.btn` everywhere else.
    expect(PANEL).toContain('className="btn secondary"');
    expect(GLOBALS).toContain('.btn.secondary {');
  });

  it('introduces no new colour literals — every value is a token', () => {
    const block = GLOBALS.slice(GLOBALS.indexOf('.choice-card {'), GLOBALS.indexOf('.automation-preview-bubble {'));
    expect(block.length).toBeGreaterThan(1000);
    expect(block, 'a raw hex colour crept in').not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});

describe('the settings are really persisted, and really acted on', () => {
  it('has a column for each of the four things the panel owns', () => {
    for (const column of [
      'selection_reminders_enabled',
      'selection_reminder_offsets',
      'selection_reminder_hour',
      'selection_reminder_template',
      'selection_reminder_grouping',
    ]) {
      expect(MIGRATION, `${column} is not persisted`).toContain(column);
    }
  });

  it('tracks every field the ledger is specified to track', () => {
    for (const column of ['stage', 'due_on', 'scheduled_at', 'sent_at', 'channel', 'status', 'failure_reason', 'attempts']) {
      expect(MIGRATION, `the ledger does not track ${column}`).toMatch(new RegExp(`\\b${column}\\b`));
    }
  });

  it('guards duplicates in the database, not only in the code', () => {
    // The unique index IS the idempotency guarantee: the sweep claims by
    // inserting and treats 23505 as "somebody already has this one". A guard
    // that lives only in application logic is one deploy away from a race.
    expect(MIGRATION).toContain('create unique index if not exists selection_reminders_job_stage_idx');
    expect(MIGRATION).toContain('create unique index if not exists selection_reminders_choice_stage_idx');
    expect(SWEEP).toContain("if (error?.code !== '23505') continue;");
  });

  it('compares AND swaps on attempts when re-taking a stalled claim', () => {
    // Asserted against the source because a real race cannot be staged in a
    // single-threaded fake. Guarding on status alone is not a compare-and-swap
    // when the status being written is the status being compared: rescuing a
    // stalled `pending` row writes 'pending' over 'pending', so under READ
    // COMMITTED the second updater re-checks against the row the first just
    // wrote, still sees 'pending', and both send. `attempts` always moves.
    expect(SWEEP).toMatch(/\.eq\('status', status\)\s*\n\s*\.eq\('attempts', attempts\)\s*\n\s*\.select\('id'\)/);
    expect(SWEEP).toContain("attempts: attempts + 1,");
  });

  it('treats a cancelled stage as revivable, and a sent one as final', () => {
    // The unique index has no status column, so a row nothing can revive blocks
    // its (job, needed-by, stage) forever. `sent` blocking it is the point;
    // `cancelled` blocking it silently costs a customer a reminder they are owed
    // the moment a cleared needed-by date is put back.
    expect(SWEEP).toContain("const RECLAIMABLE = new Set(['failed', 'pending', 'cancelled']);");
    expect(SWEEP).not.toMatch(/RECLAIMABLE = new Set\(\[[^\]]*'sent'/);
  });

  it('claims before sending, never after', () => {
    const claimAt = SWEEP.indexOf('const claimed = await claimReminder');
    const sendAt = SWEEP.indexOf('await sendSelectionRequestSms');
    expect(claimAt).toBeGreaterThan(-1);
    expect(sendAt).toBeGreaterThan(claimAt);
  });

  it('runs hourly, because the send hour belongs to the account and not to the cron', () => {
    const spec = CRON_JOBS.find((job) => job.job === 'selection-chase');
    expect(spec?.schedule).toBe('0 * * * *');
    // test/cron-jobs.test.ts already asserts this registry agrees with
    // vercel.json, so pinning it here pins both.
  });

  it('keeps its automation key and its label', () => {
    expect(AUTOMATION_COLUMNS.selections).toBe('selection_reminders_enabled');
    expect(AUTOMATION_LABELS.selections).toBe('Choice reminders');
  });
});

describe('authorization', () => {
  it('gates both the settings change and the test send on an authorized context', () => {
    const settings = ACTIONS.slice(ACTIONS.indexOf('export async function updateChoiceReminderSettingsAction'));
    expect(settings.slice(0, 400)).toMatch(/await require(?:Owner|Office)Context\(/);
    const test = ACTIONS.slice(ACTIONS.indexOf('export async function sendChoiceReminderTestAction'));
    expect(test.slice(0, 400)).toMatch(/await require(?:Owner|Office)Context\(/);
  });

  it('scopes every write to the caller’s own account', () => {
    const settings = ACTIONS.slice(
      ACTIONS.indexOf('export async function updateChoiceReminderSettingsAction'),
      ACTIONS.indexOf('export async function sendChoiceReminderTestAction'),
    );
    expect(settings).toMatch(/\.update\(\{[\s\S]*?\}\)\s*\.eq\('id', accountId\)/);
  });

  it('sends the test to the owner, never to a customer', () => {
    const test = ACTIONS.slice(ACTIONS.indexOf('export async function sendChoiceReminderTestAction'));
    expect(test).toContain('getAccountOwnerEmail(admin, accountId)');
    expect(test).toContain('recipientEmail: ownerEmail');
  });

  it('leaves a settings-history line, so "who changed what it says" has an answer', () => {
    const settings = ACTIONS.slice(ACTIONS.indexOf('export async function updateChoiceReminderSettingsAction'));
    expect(settings.slice(0, 3000)).toContain("kind: 'automation_settings_changed'");
  });
});
