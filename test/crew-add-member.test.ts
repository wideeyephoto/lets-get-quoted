import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');

/**
 * Source with its prose removed, for assertions about what the CODE does.
 *
 * One regex for block comments and one for line comments, and no clever third
 * one for `{​/* … *​/}`: a JSX-comment pattern of the shape `\{\s*\/\*[\s\S]*?
 * \*\/\s*\}` looks right and is a trap. Non-greedy only reaches the first `*​/`
 * FOLLOWED BY a brace, so a jsdoc block inside a props type happily swallowed
 * two hundred lines of this component on the way to the next
 * `{​/* eslint-disable *​/}`. The block-comment rule below already removes the
 * comment part; the empty `{}` it leaves behind is harmless.
 */
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const DRAWER = read('src', 'app', 'dashboard', 'crew', 'AddCrewDrawer.tsx');
const DRAWER_CODE = stripComments(DRAWER);
const ROSTER = read('src', 'app', 'dashboard', 'crew', 'CrewRoster.tsx');
const ROSTER_CODE = stripComments(ROSTER);
const PAGE = read('src', 'app', 'dashboard', 'crew', 'page.tsx');
const PAGE_CODE = stripComments(PAGE);
const ACTIONS = read('src', 'app', 'dashboard', 'crew', 'actions.ts');
const ACTIONS_CODE = stripComments(ACTIONS);
const PAY_FIELDS = read('src', 'app', 'dashboard', 'crew', 'PayTypeFields.tsx');
const PAY_FIELDS_CODE = stripComments(PAY_FIELDS);
const SHELL = read('src', 'components', 'app-shell.tsx');
const SHELL_CODE = stripComments(SHELL);
const CSS = read('src', 'app', 'dashboard', 'crew', 'crew.module.css');

// Adding a crew member, end to end — the header button, the drawer it opens,
// the one save it can produce, and where the roster puts you afterwards.
//
// These read source rather than render it, the way app-shell-width and
// choice-reminders-panel do: this suite has no DOM. That is a real limit and
// worth naming. What a browser does with `useSearchParams` is not in doubt;
// what this file's code SAYS has been wrong before, and in the exact way these
// assertions pin down — a prop copied into useState, read once, ignored forever.
//
// EVERY assertion about an absent string runs against the comment-stripped
// source. This repo writes long comments that quote the strings being removed,
// and a bare toContain would happily match the explanation of the bug instead
// of the bug.

describe('opening the add-crew drawer', () => {
  it('derives its open state from the URL, never from a useState initializer', () => {
    // THE ORIGINAL DEFECT. `openAdd` arrived as a prop and became
    // `useState(openAdd)`. A useState argument is read once, at mount; the
    // header link is a soft navigation and CrewRoster has no key, so React
    // reused the instance and the new prop went nowhere. The button did
    // nothing. Neither of the two shapes that produce that — a state seeded
    // from the prop, or an effect copying it across — may come back.
    expect(ROSTER_CODE).not.toMatch(/useState\(\s*openAdd\s*\)/);
    expect(ROSTER_CODE).not.toContain('setAddOpen');
    expect(ROSTER_CODE).not.toContain('addOpen');

    // The drawer subscribes to the URL instead, so a soft navigation re-renders
    // it with the new answer.
    expect(DRAWER_CODE).toContain("useSearchParams } from 'next/navigation'");
    expect(DRAWER_CODE).toMatch(/const open = searchParams\.get\('add'\) === '1'/);
    // No second copy of the truth to drift from the first.
    expect(DRAWER_CODE).not.toMatch(/useState\(\s*open\s*\)/);
    expect(DRAWER_CODE).not.toMatch(/setOpen\(/);
  });

  it('closes by removing the parameter, so closing cannot fight the URL', () => {
    expect(DRAWER_CODE).toContain("next.delete('add')");
    expect(DRAWER_CODE).toMatch(/router\.replace\([\s\S]{0,80}scroll: false/);
  });

  it('is opened by one href, and every trigger uses it', () => {
    // The page header, the sidebar's New menu and the roster's own empty state
    // must agree — a trigger pointing at a fragment the drawer does not read is
    // how "+ Add crew member" ended up as a link to nothing.
    //
    // The tab is called People now that the same roster holds subcontractors,
    // so the href names that. ?tab=crew is still honoured (see normalizeTab in
    // the crew page) for every bookmark made before the rename — but nothing we
    // ship should be written against the alias.
    const href = '/dashboard/crew?tab=people&add=1';
    expect(ROSTER_CODE).toContain(`export const ADD_CREW_HREF = '${href}'`);
    expect(PAGE_CODE).toContain(`employeeHref="${href}"`);
    expect(SHELL_CODE).toContain(`{ href: '${href}', icon: '/dashboard/crew', label: 'New crew member' }`);
    // The dangling fragment is gone with the panel it used to scroll to.
    expect(PAGE_CODE).not.toContain('#add-crew');
    expect(SHELL_CODE).not.toContain('/dashboard/crew?add=1');
    expect(ROSTER_CODE).not.toContain('id="add-crew"');
  });

  it('has a twin for the other kind of person, on its own parameter', () => {
    // Two drawers, one parameter, mutually exclusive by construction — so there
    // is no state to get out of step and no way for both to be open at once.
    const subHref = '/dashboard/crew?tab=people&add=sub';
    expect(ROSTER_CODE).toContain(`export const ADD_SUBCONTRACTOR_HREF = '${subHref}'`);
    expect(PAGE_CODE).toContain(`subcontractorHref="${subHref}"`);
    expect(SHELL_CODE).toContain(`{ href: '${subHref}', icon: '/dashboard/crew', label: 'New subcontractor' }`);
  });

  it('is dismissible, traps focus while open, and hands focus back on close', () => {
    expect(DRAWER_CODE).toMatch(/aria-modal="true"/);
    // Escape from inside the panel, and from wherever focus has wandered to.
    expect(DRAWER_CODE).toMatch(/event\.key === 'Escape'[\s\S]{0,120}requestClose\(\)/);
    expect(DRAWER_CODE).toMatch(/document\.addEventListener\('keydown', onKey\)/);
    // The backdrop.
    expect(DRAWER_CODE).toMatch(/drawerScrim\} onClick=\{requestClose\}/);
    // The trap.
    expect(DRAWER_CODE).toMatch(/event\.key !== 'Tab'/);
    expect(DRAWER_CODE).toContain('last.focus()');
    expect(DRAWER_CODE).toContain('first.focus()');
    // And back where they came from — captured at open, because the trigger can
    // be the page header, the empty state or the sidebar.
    expect(DRAWER_CODE).toContain('openerRef.current = document.activeElement');
    expect(DRAWER_CODE).toContain('opener?.focus?.()');
    // …except after a save, where the roster is moving focus to the new card.
    expect(DRAWER_CODE).toContain('skipRestoreRef');
  });
});

describe('saving from the drawer', () => {
  it('cannot be submitted twice, because SaveButton owns the pending state', () => {
    // SaveButton disables itself off useFormStatus. A hand-rolled submit button
    // here would be a second, unsynchronised answer to "is this in flight".
    expect(DRAWER_CODE).toContain("import SaveButton from '@/components/save-button'");
    expect(DRAWER_CODE).not.toMatch(/<button[^>]*type="submit"/);
  });

  it('offers the two outcomes over one set of fields', () => {
    expect(DRAWER_CODE).toMatch(/name="intent"\s*\n?\s*value="invite"/);
    expect(DRAWER_CODE).toMatch(/name="intent"\s*\n?\s*value="save"/);
    expect(DRAWER).toContain('Save and invite');
    expect(DRAWER).toContain('Save without inviting');
    expect(ACTIONS_CODE).toContain("formData.get('intent') === 'invite'");
    // The invitation cannot take the crew member down with it.
    expect(ACTIONS_CODE).toMatch(/sendCrewMagicLink[\s\S]{0,200}catch/);
  });

  it('returns a result instead of throwing, so the form can say what happened', () => {
    // The shape lives in lib/crew-add-state and is re-exported here. It cannot
    // be DECLARED in this file: a 'use server' module may only export async
    // functions, and the idle constant beside the type is an object — which
    // failed the build's page-data collection, naming an unrelated route, after
    // tsc, lint and "Compiled successfully" had all passed.
    expect(ACTIONS_CODE).toContain("export type { CreateCrewState } from '@/lib/crew-add-state'");
    expect(read('src', 'lib', 'crew-add-state.ts')).toContain('export type CreateCrewState');
    expect(ACTIONS_CODE).toMatch(/createCrewAction\(\s*_previous: CreateCrewState,\s*formData: FormData\s*\): Promise<CreateCrewState>/);
    expect(ACTIONS_CODE).toContain("status: 'added'");
    // The id is what lets the roster find the new card.
    expect(ACTIONS_CODE).toMatch(/id: member\.id/);
    expect(ACTIONS_CODE).toMatch(/message: `\$\{member\.name\} was added to your crew\./);
    // Bad input is a value, not an exception.
    expect(ACTIONS_CODE).not.toContain('Name and phone are required to add a crew member');
    expect(ACTIONS_CODE).toMatch(/return \{ status: 'error'/);
    // And the roster, the Active count and the stat ticker are all on this
    // route, so one revalidate is what makes the new person appear.
    expect(ACTIONS_CODE.slice(0, ACTIONS_CODE.indexOf('export async function updateCrewAction'))).toContain(
      "revalidatePath('/dashboard/crew')",
    );
    expect(DRAWER_CODE).toContain('useFormState(createCrewAction, CREATE_CREW_IDLE)');
  });

  it('closes, clears and names the person on success', () => {
    expect(DRAWER_CODE).toMatch(/state\.status !== 'added'/);
    expect(DRAWER_CODE).toContain('formRef.current?.reset()');
    expect(DRAWER_CODE).toMatch(/onAdded\(\{ id: state\.id, name: state\.name, message: state\.message \}\)/);
    expect(DRAWER_CODE).toMatch(/onAdded\([\s\S]{0,60}\);\s*\n\s*close\(\);/);

    // The roster announces them in a live region that is already mounted, and
    // takes the owner to their card.
    expect(ROSTER_CODE).toMatch(/role="status" aria-live="polite"/);
    expect(ROSTER_CODE).toContain('{added.message}');
    expect(ROSTER_CODE).toContain('document.querySelector<HTMLElement>(`[data-crew-row="${added.id}"]`)');
    expect(ROSTER_CODE).toContain('node.focus({ preventScroll: true })');
    // Every layout can be the one on screen, so every layout carries the hook
    // and the highlight.
    expect(ROSTER_CODE.match(/data-crew-row=\{row\.id\}/g)?.length).toBe(4);
    expect(ROSTER_CODE.match(/justAdded=\{row\.id === added\?\.id\}/g)?.length).toBe(5);
    expect(CSS).toContain('.justAdded {');
  });

  it('warns before a half-filled form is thrown away, and offers a way out', () => {
    expect(DRAWER).toContain('Cancel');
    expect(DRAWER_CODE).toMatch(/if \(dirty\) \{\s*\n\s*setConfirmDiscard\(true\)/);
    expect(DRAWER).toContain('Discard this crew member?');
    // Leaving the PAGE is a different exit, and only UnsavedGuard catches a
    // client-side navigation — it fires no beforeunload at all.
    expect(DRAWER_CODE).toContain("import UnsavedGuard from '@/components/unsaved-guard'");
    expect(DRAWER_CODE).toMatch(/<UnsavedGuard\s+formId=\{formId\}/);
  });
});

describe('the fields the drawer asks for', () => {
  it('is grouped into four sections rather than one flat list', () => {
    for (const section of ['Basics', 'Field app', 'Compensation', 'Advanced']) {
      expect(DRAWER).toContain(`<legend>${section}</legend>`);
    }
    expect(DRAWER_CODE.match(/className=\{styles\.addSection\}/g)?.length).toBe(4);
    // Compensation is the pay type and its rate; the payroll id is filed under
    // Advanced, which is why PayTypeFields can be told to leave it out.
    expect(DRAWER_CODE).toContain('<PayTypeFields idPrefix={formId} showPayrollId={false} />');
    expect(DRAWER_CODE).toMatch(/<legend>Advanced<\/legend>[\s\S]{0,200}<PayrollIdField/);
    expect(DRAWER_CODE).toMatch(/<legend>Advanced<\/legend>[\s\S]{0,900}type="file"/);
  });

  it('says why the phone number is the required one, in the terms the code makes true', () => {
    // Not "it's required": assigning somebody to a job texts them, and a
    // customer picking a time texts them. Both go through deliverCrewSms.
    expect(DRAWER).toMatch(/We text this number when you assign them a job or a customer books a time/);
    expect(ACTIONS_CODE).toContain("message: 'Enter a mobile number — it is how they are told about a job.'");
    // Ten digits is what normalizeUsPhone needs to produce anything sendable.
    expect(ACTIONS_CODE).toMatch(/replace\(\/\\D\/g, ''\)\.length < 10/);
  });

  it('formats the number as it is typed, rebuilding from the digits', () => {
    // Asserted as source, not behaviour — this suite has no DOM and the
    // function lives in a client component that imports a server action. What
    // matters is that it lays the whole thing out from the digits each time
    // (so backspacing over punctuation works) and leaves "+" numbers alone.
    expect(DRAWER_CODE).toContain('export function formatPhoneAsTyped(value: string): string');
    expect(DRAWER_CODE).toMatch(/if \(value\.trim\(\)\.startsWith\('\+'\)\) return value/);
    expect(DRAWER_CODE).toContain("return `(${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`");
    expect(DRAWER_CODE).toContain('onChange={(event) => setPhone(formatPhoneAsTyped(event.target.value))}');
  });

  it('picks a role from a list, with an explicit way to name a new one', () => {
    // Free text is what turned one typed "QA Tester" into a permanent filter
    // category. Naming a new role is still possible — just never accidental.
    expect(DRAWER_CODE).not.toMatch(/<input[^>]*name="roleLabel"[^>]*placeholder/);
    expect(DRAWER_CODE).toMatch(/<select\s*\n?\s*id=\{`\$\{formId\}-role`\}/);
    expect(DRAWER_CODE).toContain('<option value={NEW_ROLE}>+ Add a new role…</option>');
    expect(DRAWER_CODE).toMatch(/role === NEW_ROLE \? \(/);
    // One input carries the answer whichever control produced it.
    expect(DRAWER_CODE).toContain('<input type="hidden" name="roleLabel" value={roleValue} />');
    expect(DRAWER_CODE.match(/name="roleLabel"/g)?.length).toBe(1);
    // Seeded with the roles this account already uses.
    expect(ROSTER_CODE).toContain('<AddCrewDrawer roles={roles} onAdded={handleAdded} />');
    expect(DRAWER_CODE).toMatch(/new Set\(\[\.\.\.roles\.filter\(Boolean\), \.\.\.SEED_ROLES\]\)/);
  });

  it('previews the photo, states what it will accept, and can take it back off', () => {
    expect(DRAWER).toContain('JPG, PNG, WebP or AVIF, up to 4 MB.');
    expect(DRAWER_CODE).toContain('URL.createObjectURL(file)');
    expect(DRAWER_CODE).toContain('URL.revokeObjectURL(previous)');
    expect(DRAWER).toContain('Remove photo');
    expect(DRAWER_CODE).toContain("photoRef.current.value = ''");
  });
});

describe('the compensation fields', () => {
  it('renders only the amount belonging to the chosen pay type', () => {
    // All three used to render at once, all enabled and all submitted, hidden
    // only by the `hidden` attribute — which does not stop a field being
    // filled in or posted.
    expect(PAY_FIELDS_CODE).not.toMatch(/hidden=\{payType !==/);
    expect(PAY_FIELDS_CODE).toMatch(/\{payType === 'hourly' \? \([\s\S]{0,400}name="hourlyRate"/);
    expect(PAY_FIELDS_CODE).toMatch(/\{payType === 'salary' \? \([\s\S]{0,400}name="annualSalary"/);
    expect(PAY_FIELDS_CODE).toMatch(/\{payType === 'day_rate' \? \([\s\S]{0,400}name="dayRate"/);
    for (const field of ['name="hourlyRate"', 'name="annualSalary"', 'name="dayRate"']) {
      expect(PAY_FIELDS_CODE.match(new RegExp(field, 'g'))?.length).toBe(1);
    }
  });

  it('still reads only the matching amount on the server', () => {
    // Unmounting is safe because payFromForm already discarded the others: a
    // missing field is null, which is what it did with an ignored one anyway.
    expect(ACTIONS_CODE).toContain("annualSalary: payType === 'salary' ? positiveAmount(formData.get('annualSalary')) : null");
    expect(ACTIONS_CODE).toContain("dayRate: payType === 'day_rate' ? positiveAmount(formData.get('dayRate')) : null");
  });
});

describe('what the roster looks like afterwards', () => {
  it('has no second "add crew member" form pinned below the list', () => {
    // The duplicate CTA — a collapsed toggle roughly three thousand pixels
    // below the header button, wrapping a form nothing could open.
    expect(ROSTER_CODE).not.toContain('styles.addPanel');
    expect(ROSTER_CODE).not.toContain('styles.addToggle');
    expect(ROSTER_CODE).not.toContain('createCrewAction');
    expect(CSS).not.toContain('.addPanel {');
    expect(CSS).not.toContain('.addToggle {');
    // One drawer, mounted once, and never on the read-only demo.
    expect(ROSTER_CODE.match(/<AddCrewDrawer/g)?.length).toBe(1);
    expect(ROSTER_CODE).toMatch(/readOnly \? null : \(\s*\n\s*<Suspense fallback=\{null\}>/);
  });

  it('prints one person\'s pay to the cent, the way Hours & pay does', () => {
    // "$305" here and "$304.50" on the next tab, from the same figure, is what
    // makes an app look like it cannot add up.
    expect(PAGE_CODE).toContain("import { payMoney } from '@/lib/crew-pay'");
    expect(PAGE_CODE).toContain('periodPayLabel: payMoney(bucket?.pay ?? 0)');
    expect(PAGE_CODE).not.toContain('formatMoney');
    // Whole dollars stay right for a crew-wide headline in the Focus rail.
    expect(ROSTER_CODE).toContain('return `$${Math.round(amount).toLocaleString(\'en-US\')}`');
    expect(ROSTER_CODE).toMatch(/money\(totals\.periodPay\)/);
  });
});
