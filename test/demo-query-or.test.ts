import { describe, it, expect } from 'vitest';
import { createDemoSupabase } from '@/lib/demo-supabase';

// The demo's fixture client answers out of fixtures instead of Postgres so the
// logged-out demo can run the real dashboard builders unmodified. `or()` was
// the one builder method it did not implement, and on 2026-08-03 a query that
// uses it reached the dashboard home — so /demo returned 500 in production for
// four days. These tests are about the filter MEANING what it says: a stub that
// matched everything would have kept /demo up while showing rows a real query
// excludes, which is the worse failure of the two.

const rows = [
  { id: 'a', feedback_at: '2026-08-05T00:00:00.000Z', responded_at: '2026-08-05T00:00:00.000Z', rating: 5, status: 'sent' },
  { id: 'b', feedback_at: null, responded_at: '2026-08-06T00:00:00.000Z', rating: 2, status: 'sent' },
  { id: 'c', feedback_at: null, responded_at: '2026-01-01T00:00:00.000Z', rating: 1, status: 'draft' },
  { id: 'd', feedback_at: '2026-01-02T00:00:00.000Z', responded_at: null, rating: 4, status: 'sent' },
];

const client = createDemoSupabase({ review_invites: rows });
const ids = async (query: PromiseLike<{ data: unknown }>) =>
  ((await query).data as { id: string }[]).map((row) => row.id);

describe('the expression that broke /demo', () => {
  // Verbatim from countRecentPrivateFeedback in lib/reviews.ts: "feedback in
  // the window, OR feedback with no timestamp that was responded to in the
  // window" — the second arm exists for pre-migration rows.
  const cutoff = '2026-08-01T00:00:00.000Z';
  const expression = `feedback_at.gte.${cutoff},and(feedback_at.is.null,responded_at.gte.${cutoff})`;

  it('keeps the rows either arm matches', async () => {
    expect(await ids(client.from('review_invites').select('*').or(expression))).toEqual(['a', 'b']);
  });

  it('excludes the rows neither arm matches', async () => {
    // c: null feedback but responded long before the cutoff. d: feedback, but
    // dated before it. A stub that matched everything would return all four —
    // the exact silent widening the original note refused to ship.
    const kept = await ids(client.from('review_invites').select('*').or(expression));
    expect(kept).not.toContain('c');
    expect(kept).not.toContain('d');
  });

  it('counts the same way it filters', async () => {
    const { count } = await client
      .from('review_invites')
      .select('id', { count: 'exact', head: true })
      .not('feedback_at', 'is', null)
      .or(expression);
    // Only `a` has both a feedback_at and a match on the expression.
    expect(count).toBe(1);
  });
});

describe('the pieces of the expression language', () => {
  it('ORs the terms at the top level', async () => {
    expect(await ids(client.from('review_invites').select('*').or('id.eq.a,id.eq.d'))).toEqual(['a', 'd']);
  });

  it('ANDs inside an and() group', async () => {
    expect(await ids(client.from('review_invites').select('*').or('and(status.eq.sent,rating.gte.4)'))).toEqual(['a', 'd']);
  });

  it('nests groups', async () => {
    const kept = await ids(client.from('review_invites').select('*').or('and(status.eq.draft,rating.lte.1),and(status.eq.sent,rating.gte.5)'));
    expect(kept).toEqual(['a', 'c']);
  });

  it('reads a value that contains dots — every timestamp does', async () => {
    // The leaf splits on its first two dots only. Splitting on all of them
    // would make the operator "2026-08-05T00:00:00" and lose the value.
    expect(await ids(client.from('review_invites').select('*').or('feedback_at.eq.2026-08-05T00:00:00.000Z'))).toEqual(['a']);
  });

  it('treats is.null as the keyword, not the string', async () => {
    expect(await ids(client.from('review_invites').select('*').or('feedback_at.is.null'))).toEqual(['b', 'c']);
  });

  it('handles in, neq and negation', async () => {
    expect(await ids(client.from('review_invites').select('*').or('id.in.(a,c)'))).toEqual(['a', 'c']);
    expect(await ids(client.from('review_invites').select('*').or('status.neq.sent'))).toEqual(['c']);
    expect(await ids(client.from('review_invites').select('*').or('status.not.eq.sent'))).toEqual(['c']);
  });

  it('composes with the filters already on the chain', async () => {
    // or() is one more AND-ed filter, not a replacement for what came before.
    const kept = await ids(client.from('review_invites').select('*').eq('status', 'sent').or('rating.lte.2,rating.gte.5'));
    expect(kept).toEqual(['a', 'b']);
  });
});

describe('what it refuses to guess', () => {
  // The half of the original doctrine worth keeping: an operator this does not
  // model must stop, because widening the filter shows the demo rows the real
  // query excludes and nothing on the page would look wrong.
  it('throws on an operator it does not model, naming it and where to add it', () => {
    expect(() => client.from('review_invites').select('*').or('status.cs.{a}')).toThrow(/does not model the "cs" operator/);
    expect(() => client.from('review_invites').select('*').or('status.cs.{a}')).toThrow(/demo-supabase\.ts/);
  });

  it('throws on a malformed leaf rather than matching everything', () => {
    expect(() => client.from('review_invites').select('*').or('nonsense')).toThrow(/not a column\.operator\.value/);
    expect(() => client.from('review_invites').select('*').or('')).toThrow(/empty filter expression/);
  });
});
