import { describe, it, expect } from 'vitest';
import {
  INVITE_EXPIRY_MINUTES,
  fieldAppDetail,
  fieldAppState,
  needsInvite,
  timeAgo,
  type InviteFields,
} from '@/lib/crew-invite';

const NOW = new Date('2026-08-14T12:00:00Z');
const ago = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString();
const ahead = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000).toISOString();

describe('field-app state — the five situations the roster could not tell apart', () => {
  it('has nowhere to send an invitation without an email', () => {
    expect(fieldAppState({}, NOW)).toBe('no-email');
    expect(fieldAppState({ email: '' }, NOW)).toBe('no-email');
  });

  it('separates "never asked" from "asked, still waiting"', () => {
    const member: InviteFields = { email: 'mike@example.com' };
    expect(fieldAppState(member, NOW)).toBe('not-invited');
    expect(fieldAppState({ ...member, invited_at: ago(5), invite_expires_at: ahead(55) }, NOW)).toBe('invited');
  });

  it('knows when the link died — the state that used to read as "Not invited"', () => {
    // The whole bug: the owner had pressed the button, the crew member had had
    // an email, and the roster showed the same word it shows for somebody
    // nobody has ever contacted.
    const expired = { email: 'mike@example.com', invited_at: ago(3 * 24 * 60), invite_expires_at: ago(3 * 24 * 60 - 60) };
    expect(fieldAppState(expired, NOW)).toBe('expired');
  });

  it('falls back to the token lifetime for a row invited before the expiry column existed', () => {
    const legacy = { email: 'mike@example.com', invited_at: ago(INVITE_EXPIRY_MINUTES + 1) };
    expect(fieldAppState(legacy, NOW)).toBe('expired');
    const fresh = { email: 'mike@example.com', invited_at: ago(INVITE_EXPIRY_MINUTES - 10) };
    expect(fieldAppState(fresh, NOW)).toBe('invited');
  });

  it('a signed-in user outranks the invitation that got them there', () => {
    const linked = { email: 'mike@example.com', user_id: 'u1', invited_at: ago(999), invite_expires_at: ago(900) };
    expect(fieldAppState(linked, NOW)).toBe('linked');
  });

  it('revocation outranks EVERYTHING, including a live session', () => {
    // An owner who has just cut somebody's access must not read "Field app" on
    // the row they cut.
    const revoked = { email: 'mike@example.com', user_id: 'u1', access_revoked_at: ago(10) };
    expect(fieldAppState(revoked, NOW)).toBe('revoked');
  });

  it('reads an un-migrated row exactly as the old three-state model did', () => {
    // No invite columns at all: the behaviour before this existed, unchanged.
    expect(fieldAppState({ email: 'a@b.com', user_id: 'u1' }, NOW)).toBe('linked');
    expect(fieldAppState({ email: 'a@b.com' }, NOW)).toBe('not-invited');
    expect(fieldAppState({}, NOW)).toBe('no-email');
  });
});

describe('needsInvite — which states the button is the fix for', () => {
  it('covers never-invited and expired, and nothing else', () => {
    expect(needsInvite('not-invited')).toBe(true);
    // The one that mattered: pressing invite again IS the fix, and the roster
    // used not to offer it because the state did not exist.
    expect(needsInvite('expired')).toBe(true);
    expect(needsInvite('invited')).toBe(false);
    expect(needsInvite('linked')).toBe(false);
    expect(needsInvite('no-email')).toBe(false);
    expect(needsInvite('revoked')).toBe(false);
  });
});

describe('the detail line', () => {
  it('names the date rather than repeating the state', () => {
    const detail = fieldAppDetail({ email: 'a@b.com', invited_at: ago(5), invite_expires_at: ahead(55) }, NOW);
    expect(detail).toMatch(/Invited/);
    expect(detail).toMatch(/expires/);
  });

  it('says when somebody last signed in', () => {
    expect(fieldAppDetail({ email: 'a@b.com', user_id: 'u1', last_signed_in_at: ago(60 * 26) }, NOW)).toMatch(/Last signed in yesterday/);
  });

  it('does not claim a linked member never signed in when the column predates them', () => {
    // "Never signed in" would be a claim about a fact nobody recorded.
    const detail = fieldAppDetail({ email: 'a@b.com', user_id: 'u1' }, NOW);
    expect(detail).not.toMatch(/never/i);
    expect(detail).toMatch(/predates/);
  });

  it('counts repeat invitations only once there have been repeats', () => {
    const once = fieldAppDetail({ email: 'a@b.com', invited_at: ago(500), invite_count: 1 }, NOW);
    expect(once).not.toMatch(/invites sent/);
    const thrice = fieldAppDetail({ email: 'a@b.com', invited_at: ago(500), invite_count: 3 }, NOW);
    expect(thrice).toMatch(/3 invites sent/);
  });

  it('marks a revoked member with when it happened', () => {
    expect(fieldAppDetail({ email: 'a@b.com', access_revoked_at: ago(60 * 24 * 2) }, NOW)).toMatch(/Access removed 2 days ago/);
  });
});

describe('timeAgo', () => {
  it('reads like somebody saying it out loud', () => {
    expect(timeAgo(ago(0), NOW)).toBe('just now');
    expect(timeAgo(ago(40), NOW)).toBe('40 minutes ago');
    expect(timeAgo(ago(60), NOW)).toBe('an hour ago');
    expect(timeAgo(ago(60 * 26), NOW)).toBe('yesterday');
    expect(timeAgo(ago(60 * 24 * 5), NOW)).toBe('5 days ago');
    expect(timeAgo(ago(60 * 24 * 30), NOW)).toBe('4 weeks ago');
    expect(timeAgo(ago(60 * 24 * 200), NOW)).toBe('7 months ago');
  });

  it('never reports the future as elapsed time', () => {
    // Clock skew between a phone and the server, not time travel.
    expect(timeAgo(ahead(10), NOW)).toBe('just now');
  });

  it('answers nothing for a missing or unparseable stamp', () => {
    expect(timeAgo(null, NOW)).toBeNull();
    expect(timeAgo(undefined, NOW)).toBeNull();
    expect(timeAgo('sometime', NOW)).toBeNull();
  });
});
