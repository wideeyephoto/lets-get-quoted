import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { toClientFeed, type FeedEventLike } from '@/lib/client-feed';

/**
 * Fixing an update you already posted.
 *
 * The interesting rule is the one about what CANNOT be edited. A job feed is a
 * record — a payment taken, a quote approved, work started, an invoice sent —
 * and a record you can rewrite is not a record. Only rows somebody typed
 * themselves may be changed, and the guard is a where clause rather than the UI
 * declining to draw a button.
 */

const strip = (source: string) =>
  source
    .replace(/\r\n/g, '\n')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const read = (...parts: string[]) => strip(readFileSync(join(process.cwd(), ...parts), 'utf8'));

const actions = read('src', 'app', 'dashboard', 'jobs', 'actions.ts');
const jobPage = read('src', 'app', 'dashboard', 'jobs', '[id]', 'page.tsx');
const clientPage = read('src', 'app', 'client', 'jobs', '[token]', 'page.tsx');
const css = readFileSync(join(process.cwd(), 'src', 'app', 'globals.css'), 'utf8').replace(/\r\n/g, '\n');
const lite = readFileSync(join(process.cwd(), 'src', 'app', 'globals-lite.css'), 'utf8').replace(/\r\n/g, '\n');

const editBlock = actions.slice(
  actions.indexOf('export async function editJobFeedUpdateAction'),
  actions.indexOf('export async function createClientJobLinkAction'),
);

const event = (over: Partial<FeedEventLike> = {}): FeedEventLike => ({
  id: 'e1',
  kind: 'job_update',
  title: 'Crew arrived',
  body: 'Started on the north wall.',
  amount: null,
  action_url: null,
  created_at: '2026-08-14T10:00:00.000Z',
  ...over,
});

/* --- what may be edited ----------------------------------------------------- */

describe('only an update somebody typed can be rewritten', () => {
  it('scopes the write to job_update in the query, not in the markup', () => {
    // The UI offering the button on one kind is a convention. This is the rule.
    expect(editBlock).toContain(".eq('kind', 'job_update')");
    expect(editBlock).toContain(".eq('account_id', accountId)");
    expect(editBlock).toContain(".eq('job_id', jobId)");
    expect(editBlock).toContain(".eq('id', eventId)");
  });

  it('reads the owner’s own session rather than trusting an id', () => {
    expect(editBlock).toContain('await requireOwnerContext()');
  });

  it('will not save an update with nothing in the title', () => {
    expect(editBlock).toContain("if (!title) throw new Error('An update needs a title.');");
    expect(editBlock).toContain('.slice(0, 120)');
  });

  it('is offered on job_update alone', () => {
    expect(jobPage).toContain("{event.kind === 'job_update' ? (");
    const control = jobPage.slice(jobPage.indexOf("{event.kind === 'job_update' ? ("), jobPage.indexOf('{canCancelInvoice'));
    expect(control).toContain('editJobFeedUpdateAction.bind(null, job.id, event.id)');
  });

  it('sits with the Undo controls rather than somewhere else on the row', () => {
    const badges = jobPage.slice(jobPage.indexOf('<div className="feed-badge-row">'), jobPage.indexOf('</div>', jobPage.indexOf('status-badge status-new_lead')));
    expect(badges).toContain('feed-edit');
    expect(badges).toContain('Undo');
    expect(css).toContain('.feed-edit[open] { flex: 1 0 100%; }');
  });
});

/* --- what it changes, and what it cannot ------------------------------------ */

describe('the edit says what it cannot fix', () => {
  it('names the text that has already gone', () => {
    // Editing changes this page and the customer's, not the message on their
    // phone. A contractor believing otherwise is worse than no edit at all.
    expect(jobPage).toContain('that text has already gone');
  });

  it('can move an update between internal and client-visible', () => {
    expect(editBlock).toContain("formData.get('clientVisible') === 'on' ? 'client' : 'internal'");
    expect(jobPage).toContain('name="clientVisible"');
  });

  it('gives a newly-visible update a date without re-dating one already read', () => {
    // published_at is what a client-visible row is ordered by. Re-stamping an
    // update somebody read last week would reorder their page under them.
    expect(editBlock).toContain(".is('published_at', null)");
    expect(editBlock).toContain("if (visibility === 'client')");
  });

  it('still saves the correction on a database without the stamp column', () => {
    // Losing the "edited" marker for a deploy window is a shame; refusing to
    // fix a typo the customer is reading is worse.
    expect(editBlock).toContain('delete patch.edited_at;');
    expect(editBlock).toContain('const { error: retryError } = await scoped();');
  });
});

/* --- the edit is visible ----------------------------------------------------- */

describe('an edit is marked, on both pages', () => {
  it('is stamped when it happens', () => {
    expect(editBlock).toContain('edited_at: new Date().toISOString()');
  });

  it('reaches the customer’s feed rather than only the contractor’s', () => {
    const [item] = toClientFeed([event({ edited_at: '2026-08-14T12:00:00.000Z' })]);
    expect(item.editedAt).toBe('2026-08-14T12:00:00.000Z');
  });

  it('is null for a row nobody has touched, which is every existing one', () => {
    const [item] = toClientFeed([event()]);
    expect(item.editedAt).toBeNull();
  });

  it('is rendered on both pages', () => {
    expect(jobPage).toContain('{event.edited_at ?');
    expect(clientPage).toContain('{event.editedAt ?');
    expect(css).toContain('.feed-edited');
    // The client page loads the lite sheet; a marker that landed only in
    // globals.css would never reach a homeowner.
    expect(lite).toContain('.feed-edited');
  });
});
