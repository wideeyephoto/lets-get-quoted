import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { quoteUpdatedText } from '@/lib/sms-templates';
import { SMS_CATALOGUE, CATALOGUE_SENDERS } from '@/lib/sms-catalogue';

/**
 * Two gaps in the quote builder, and they are the same gap from both sides.
 *
 *   NOTHING WAS KEPT. A quote is typed in one sitting, often on a phone in a
 *   driveway, and it lived in React state only — a reload, a back button or a
 *   tab the OS reclaimed took the pricing with it and left no evidence it had
 *   ever existed.
 *
 *   NOTHING WAS SAID. Editing a quote the homeowner already has and pressing
 *   Save changed the number on their own page and notified nobody. They come
 *   back to a link they have already read and the total is different, with no
 *   message anywhere saying so.
 *
 * The dangerous fix for the first is a background save to the SERVER, because
 * that is the second problem happening on a timer: it rewrites what somebody is
 * reading because a finger brushed a keypad. So the draft is kept in the
 * browser and the send is a button. Both halves are asserted here.
 */

const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const strip = (s: string) =>
  s
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const BUILDER = strip(read('src/app/dashboard/jobs/[id]/QuoteBuilder.tsx'));
const ACTIONS = strip(read('src/app/dashboard/jobs/actions.ts'));
const NOTIFY = ACTIONS.slice(
  ACTIONS.indexOf('export async function saveQuoteItemsAndNotifyAction'),
  ACTIONS.indexOf('export async function draftQuoteAction'),
);
const JOB_PAGE = strip(read('src/app/dashboard/jobs/[id]/page.tsx'));

describe('the text a homeowner gets when their quote changes', () => {
  it('says which way the number moved, and what it is now', () => {
    // "Your quote has been updated" on its own is the sentence that makes
    // somebody open a link fearing the worst. Which way it went costs eight
    // words.
    const up = quoteUpdatedText({ businessName: 'Evergreen', jobRef: 'J-1009', link: 'lgq.co/x', total: '$3,300.00', direction: 'up' });
    expect(up).toContain('went up to $3,300.00');
    const down = quoteUpdatedText({ businessName: 'Evergreen', jobRef: 'J-1009', link: 'lgq.co/x', total: '$2,100.00', direction: 'down' });
    expect(down).toContain('came down to $2,100.00');
    const same = quoteUpdatedText({ businessName: 'Evergreen', jobRef: 'J-1009', link: 'lgq.co/x', total: '$2,100.00', direction: 'same' });
    expect(same).toContain('is now $2,100.00');
  });

  it('names the sender first and carries the opt-out line', () => {
    const text = quoteUpdatedText({ businessName: 'Evergreen', jobRef: 'J-1009', link: 'lgq.co/x', total: '$1.00' });
    expect(text.startsWith('Evergreen here —')).toBe(true);
    expect(text).toContain('Reply STOP to opt out.');
    expect(text).toContain('lgq.co/x');
  });

  it('says nothing about a total it does not have', () => {
    // A job can carry a price that was never itemized, and "the total is now
    // $0.00" would be a lie told confidently.
    const text = quoteUpdatedText({ businessName: 'Evergreen', jobRef: 'J-1009', link: 'lgq.co/x', total: null });
    expect(text).not.toMatch(/total/i);
    expect(text).toContain('has been updated.');
  });

  it('is on the page that lists every text we send', () => {
    // A message a contractor's number sends under their name, that they cannot
    // read anywhere, is the thing that catalogue exists to prevent.
    const entry = SMS_CATALOGUE.find((row) => row.id === 'quote-updated');
    expect(entry, 'no catalogue entry for the updated-quote text').toBeDefined();
    expect(entry?.control.kind).toBe('manual');
    expect(entry?.body).toContain('has been updated');
    expect(CATALOGUE_SENDERS).toContain('sendQuoteUpdatedSms');
  });
});

describe('save and tell them', () => {
  it('reads the old total before it writes the new one', () => {
    // Otherwise "went up" is decided by comparing the new number with itself.
    const before = NOTIFY.indexOf('const previousTotal');
    const write = NOTIFY.indexOf('await saveQuoteItems(');
    expect(before).toBeGreaterThan(-1);
    expect(before).toBeLessThan(write);
    expect(NOTIFY).toContain("total > previousTotal ? 'up'");
  });

  it('reports what actually happened, never a hopeful success', () => {
    // A provider failure after the save is a real outcome with a real fix —
    // send them the link yourself — and it must not be reported as "texted".
    expect(NOTIFY).toContain("delivery: 'failed'");
    expect(NOTIFY).toContain('the text did not go through');
    expect(NOTIFY).toContain("delivery: 'none'");
    // And the save still stands: ok stays true when only the send failed.
    expect(NOTIFY).toMatch(/ok: true,\s*\n\s*total,\s*\n\s*delivery: 'failed'/);
  });

  it('honours the customer’s channel and their STOP', () => {
    expect(NOTIFY).toContain('resolveClientChannel(');
    expect(NOTIFY).toContain('isPhoneOptedOut(');
    // 'requested' — this is the quote they asked for arriving again, so STOP
    // takes the phone out and an emailed copy still goes.
    expect(NOTIFY).toContain("kind: 'requested'");
    expect(NOTIFY).toContain('await jobMessageChannel(');
  });

  it('leaves a trail on the job, not only in a toast', () => {
    expect(NOTIFY).toContain('Updated quote texted to client');
    expect(NOTIFY).toContain('Updated quote emailed to client');
    expect(NOTIFY).toContain("visibility: 'client'");
  });

  it('is wired to the builder on the job page only', () => {
    expect(JOB_PAGE).toContain('notifyAction={saveQuoteItemsAndNotifyAction.bind(null, job.id)}');
    // The lead form has no saved job to notify anybody about.
    const LEAD = read('src/app/dashboard/leads/[leadId]/LeadQuoteFields.tsx');
    expect(LEAD).not.toContain('notifyAction');
  });

  it('keeps plain Save exactly as it was', () => {
    // "I am not finished yet" is a real state, and the button that meant it
    // must not quietly start texting people.
    expect(BUILDER).toContain('Save quote');
    expect(BUILDER).toContain("'Save & text the client'");
    expect(ACTIONS).toContain('export async function saveQuoteItemsAction');
    const plain = ACTIONS.slice(
      ACTIONS.indexOf('export async function saveQuoteItemsAction'),
      ACTIONS.indexOf('export type QuoteNotifyResult'),
    );
    expect(plain).not.toMatch(/send\w*Sms|sendClientQuoteEmail/);
  });

  it('says which button does what, before either is pressed', () => {
    expect(BUILDER).toContain('Save keeps it to yourself.');
  });
});

describe('the draft that survives the tab closing', () => {
  it('never writes the quote to the server on a timer', () => {
    // THE LINE THIS FEATURE MUST NOT CROSS. saveQuoteItems recomputes the job's
    // quoted amount, and once a quote has been sent that number is on a page
    // the homeowner can be looking at. A background save is the notification
    // bug happening automatically.
    const autosave = BUILDER.slice(BUILDER.indexOf('const storageKey ='), BUILDER.indexOf('function clearStoredDraft'));
    expect(autosave).toContain('window.localStorage.setItem');
    expect(autosave).not.toContain('action(');
    expect(autosave).not.toContain('notifyAction');
  });

  it('offers the stored draft rather than applying it', () => {
    // It is older than what the server has, it may be another device's idea of
    // this job, and nobody asked for it.
    expect(BUILDER).toContain('Unsaved changes from {ago(stored.at)}');
    expect(BUILDER).toContain('Restore them');
    expect(BUILDER).toContain('Discard');
    expect(BUILDER).toContain('Nothing was sent to the client.');
    // The read effect sets state; it does not call setRows.
    const readEffect = BUILDER.slice(BUILDER.indexOf('window.localStorage.getItem'), BUILDER.indexOf('}, [storageKey]);'));
    expect(readEffect).not.toContain('setRows(');
  });

  it('compares what the server stores, not the row ids', () => {
    // Row ids are minted from Date.now() and change on every add and every
    // applied draft, so a plain stringify calls two identical quotes different
    // — and every reload would offer to restore an edit nobody made.
    expect(BUILDER).toContain('function serializeRows');
    const fn = BUILDER.slice(BUILDER.indexOf('function serializeRows'), BUILDER.indexOf('function ago('));
    expect(fn).not.toContain('row.id');
    for (const field of ['row.label', 'row.amount', 'row.kind', 'row.selected', 'row.recommended', 'row.frequency']) {
      expect(fn, field).toContain(field);
    }
  });

  it('forgets the draft once it is really saved, and only then', () => {
    expect(BUILDER).toMatch(/if \(res\.ok\) clearStoredDraft\(\);/);
    // A failed save still has work worth keeping: every call is guarded.
    const calls = [...BUILDER.matchAll(/([^\n]*)clearStoredDraft\(\)/g)]
      .map((m) => m[1].trim())
      .filter((line) => !line.startsWith('function'));
    expect(calls).toEqual(['if (res.ok)', 'if (res.ok)']);
    expect(BUILDER).toContain('if (current === savedRef.current)');
  });

  it('survives a browser that will not store anything', () => {
    // Private mode, a full quota, storage switched off. The builder still
    // works; it just cannot promise to remember.
    // The read, the write, the clear, and the Discard button — four places
    // that touch storage, four places that must not throw a quote screen away.
    const touches = [...BUILDER.matchAll(/window\.localStorage\.(getItem|setItem|removeItem)/g)].length;
    expect(touches).toBeGreaterThanOrEqual(4);
    const autosave = BUILDER.slice(BUILDER.indexOf('const storageKey ='), BUILDER.indexOf('function cleanRows'));
    expect([...autosave.matchAll(/catch \{/g)].length).toBeGreaterThanOrEqual(3);
  });

  it('is keyed to a job, and absent where there is no job yet', () => {
    expect(BUILDER).toContain('const storageKey = autosaveKey ? `lgq.quote-draft.${autosaveKey}` : null;');
    expect(JOB_PAGE).toContain('autosaveKey={job.id}');
    const LEAD = read('src/app/dashboard/leads/[leadId]/LeadQuoteFields.tsx');
    expect(LEAD).not.toContain('autosaveKey');
  });
});
