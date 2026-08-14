import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  MAX_BACKDATE_HOURS,
  OFFLINE_NOTE,
  resolveOfflineTime,
  withOfflineNote,
} from '@/lib/field-submissions';
import { MAX_SHIFT_HOURS } from '@/lib/time-clock';

const ROOT = resolve(__dirname, '..');
const sw = readFileSync(resolve(ROOT, 'public/sw.js'), 'utf8');

const NOW = new Date('2026-08-14T17:00:00Z');
const agoHours = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000).toISOString();

describe('times reported by a phone that was out of signal', () => {
  it('keeps the moment the work actually stopped, not the moment it sent', () => {
    // The entire point of queueing a clock-out: stamping the replay time would
    // turn a 3pm finish into a 7pm one, and pay four hours nobody worked.
    const clocked = agoHours(4);
    const resolved = resolveOfflineTime(clocked, NOW);
    expect(resolved?.at).toBe(clocked);
    expect(resolved?.fromPhone).toBe(true);
  });

  it('REFUSES a backdate past the window rather than clamping to it', () => {
    // This is the fix, and the distinction is the whole of it. Clamping turned
    // the most absurd input the endpoint could receive — "1999" — into a
    // clock-in exactly MAX_BACKDATE_HOURS ago, which is the largest claim the
    // endpoint was willing to grant. An out-of-range timestamp is evidence of a
    // broken or hostile client, and the honest answer to it is no.
    expect(resolveOfflineTime(agoHours(MAX_BACKDATE_HOURS + 1), NOW)).toBeNull();
    expect(resolveOfflineTime('1999-01-01T00:00:00.000Z', NOW)).toBeNull();
    // The edge itself is still usable — a full day's queue is a real thing.
    expect(resolveOfflineTime(agoHours(MAX_BACKDATE_HOURS - 0.1), NOW)).not.toBeNull();
  });

  it('never lets a queued replay outlive what the app calls a plausible shift', () => {
    // Below MAX_SHIFT_HOURS on purpose: a replay must not be able to produce a
    // shift that openShiftFlag would have called implausible had it watched it.
    expect(MAX_BACKDATE_HOURS).toBeLessThan(MAX_SHIFT_HOURS);
  });

  it('clamps the future instead, because clamping down can only shrink a claim', () => {
    const future = new Date(NOW.getTime() + 3 * 3_600_000).toISOString();
    expect(resolveOfflineTime(future, NOW)?.at).toBe(NOW.toISOString());
  });

  it('treats a couple of minutes of disagreement as clock skew, not as offline', () => {
    // Every phone's clock is a little wrong. Marking every ordinary submission
    // "sent from offline" would make the marker mean nothing.
    const skewed = new Date(NOW.getTime() - 90_000).toISOString();
    expect(resolveOfflineTime(skewed, NOW)?.fromPhone).toBe(false);
  });

  it('uses server time when no timestamp was sent at all', () => {
    // Absent is the ordinary online case — nothing is being asserted.
    expect(resolveOfflineTime(undefined, NOW)).toEqual({ at: NOW.toISOString(), fromPhone: false });
    expect(resolveOfflineTime(null, NOW)).toEqual({ at: NOW.toISOString(), fromPhone: false });
  });

  it('refuses a timestamp that is not a time, rather than quietly using now', () => {
    // Silently substituting the server's clock for junk hides a broken client.
    expect(resolveOfflineTime('half four', NOW)).toBeNull();
    expect(resolveOfflineTime(1234, NOW)).toBeNull();
  });
});

describe('a shift whose start the server did not witness says so', () => {
  it('marks the clock-in itself, not only the clock-out', () => {
    // A shift that opened offline and closed in signal would otherwise look
    // measured — and under required clocking, "measured" is the entire claim.
    const route = readFileSync(resolve(ROOT, 'src/app/field/api/queue/route.ts'), 'utf8');
    expect(route).toMatch(/when\.fromPhone \? OFFLINE_NOTE : undefined/);
  });

  it('keeps the marker when the clock-out overwrites the note', () => {
    const route = readFileSync(resolve(ROOT, 'src/app/field/api/queue/route.ts'), 'utf8');
    expect(route).toMatch(/entry\.note \?\? ''\)\.includes\(OFFLINE_NOTE\)/);
  });

  it('and the database refuses a backdated shift even without the endpoint', () => {
    // cost_crew_insert and time_entry_crew_insert answer PostgREST directly,
    // so "the endpoint checks it" is only ever true of the endpoint.
    const schema = readFileSync(resolve(ROOT, 'schema.sql'), 'utf8');
    expect(schema).toMatch(/a shift cannot start more than 13 hours ago/);
    expect(schema).toMatch(/a shift cannot start in the future/);
  });
});

describe('the marker on an entry whose times came from a phone', () => {
  it('is added only when the times really did come from the phone', () => {
    expect(withOfflineNote('Ran the gable end', false)).toBe('Ran the gable end');
    expect(withOfflineNote('Ran the gable end', true)).toBe(`Ran the gable end · ${OFFLINE_NOTE}`);
  });

  it('stands alone when there was no note', () => {
    expect(withOfflineNote(null, true)).toBe(OFFLINE_NOTE);
    expect(withOfflineNote('   ', true)).toBe(OFFLINE_NOTE);
    expect(withOfflineNote(null, false)).toBeNull();
  });
});

// The service worker is a plain script with no module boundary, so these are
// contract checks on the file rather than unit tests of its functions. They
// exist because every one of them was WRONG in the version that shipped, and
// each is invisible until somebody is standing in a basement.
describe('the field service worker', () => {
  it('caches something at all', () => {
    expect(sw).toMatch(/caches\.open/);
    // The exact shape of the old worker: a fetch handler that existed purely so
    // the app would count as installable, and passed every request through
    // untouched. "A fetch handler must exist" is true; doing nothing in it is
    // what left a crew member with a white screen.
    expect(sw).not.toMatch(/addEventListener\('fetch',\s*\(\)\s*=>\s*\{\s*\}\)/);
  });

  it('precaches an offline fallback at install rather than fetching it when needed', () => {
    expect(sw).toMatch(/addEventListener\('install'/);
    expect(sw).toMatch(/cache\.addAll\(\[OFFLINE_URL/);
  });

  it('serves /field pages network-first with a cached fallback', () => {
    expect(sw).toMatch(/pageFirstFromNetwork/);
    expect(sw).toMatch(/request\.mode === 'navigate'/);
  });

  it('never caches the router\'s flight payloads under a page URL', () => {
    // Only navigations are cached; an RSC fetch is mode 'cors'/'same-origin'.
    const fetchHandler = sw.slice(sw.indexOf("addEventListener('fetch'"));
    expect(fetchHandler).toMatch(/request\.mode === 'navigate'/);
  });

  it('holds a failed write instead of losing it, and replays it later', () => {
    expect(sw).toMatch(/indexedDB\.open/);
    expect(sw).toMatch(/addEventListener\('sync'/);
    expect(sw).toMatch(/drainQueue/);
  });

  it('answers a held write with 202, not with a success', () => {
    expect(sw).toMatch(/queued: true[\s\S]{0,120}status: 202/);
  });

  it('drops a write the server refused rather than retrying it forever', () => {
    expect(sw).toMatch(/status >= 400 && [\s\S]{0,30}status < 500/);
  });

  it('stops draining at the first failure so a clock-out cannot land before its clock-in', () => {
    const drain = sw.slice(sw.indexOf('async function drainQueue'), sw.indexOf('addEventListener(\'sync\''));
    expect(drain).toMatch(/break;/);
  });

  it('empties the cached pages when somebody signs out', () => {
    // Cached /field pages are customer addresses and phone numbers.
    expect(sw).toMatch(/\/auth\/signout/);
    expect(sw).toMatch(/forgetEverything/);
  });

  it('and when the session behind them has gone, which is the commoner case', () => {
    // Nobody signs out of an app that lives on their home screen. A session
    // that expired, or access an owner revoked, both arrive here instead.
    expect(sw).toMatch(/response\.status === 401 \|\| response\.status === 403 \|\| redirectedToLogin\(response\)/);
    expect(sw).toMatch(/function redirectedToLogin/);
  });

  it('and when the crew member switches to a different business', () => {
    // Every cached page belongs to the account being left; serving one offline
    // afterwards shows account A's customers under account B's name.
    expect(sw).toMatch(/'\/field\/choose'[\s\S]{0,80}forgetPages/);
  });

  it('keeps the queue through an account change — those writes are still owed', () => {
    const forgetPages = sw.slice(sw.indexOf('async function forgetPages'), sw.indexOf('async function forgetEverything'));
    expect(forgetPages).not.toMatch(/emptyQueue/);
  });
});

describe('what gets pulled into the cache before it is needed', () => {
  it('does not push My pay onto every device', () => {
    // The most sensitive page the field app has and the least useful without
    // signal. Opening it still caches it; nobody who never looks carries it.
    const page = readFileSync(resolve(ROOT, 'src/app/field/page.tsx'), 'utf8');
    const warm = page.slice(page.indexOf('<FieldOfflineWarm'), page.indexOf('<FieldOfflineWarm') + 300);
    expect(warm).toMatch(/'\/field'/);
    expect(warm).not.toMatch(/'\/field\/pay'/);
  });

  it('navigates an existing window to the notification target instead of just focusing it', () => {
    // Focusing any open /field window landed a "new job assigned" tap on
    // whatever screen happened to be open — usually yesterday's job.
    const click = sw.slice(sw.indexOf("addEventListener('notificationclick'"));
    expect(click).toMatch(/client\.navigate\(targetUrl\)/);
  });
});
