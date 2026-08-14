import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  MAX_BACKDATE_HOURS,
  OFFLINE_NOTE,
  resolveOfflineTime,
  withOfflineNote,
} from '@/lib/field-submissions';

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
    expect(resolved.at).toBe(clocked);
    expect(resolved.fromPhone).toBe(true);
  });

  it('refuses the future outright', () => {
    const future = new Date(NOW.getTime() + 3 * 3_600_000).toISOString();
    expect(resolveOfflineTime(future, NOW).at).toBe(NOW.toISOString());
  });

  it('clamps a backdate no real shift outlives', () => {
    const ancient = agoHours(MAX_BACKDATE_HOURS + 10);
    const resolved = resolveOfflineTime(ancient, NOW);
    expect(Date.parse(resolved.at)).toBe(NOW.getTime() - MAX_BACKDATE_HOURS * 3_600_000);
  });

  it('treats a couple of minutes of disagreement as clock skew, not as offline', () => {
    // Every phone's clock is a little wrong. Marking every ordinary submission
    // "sent from offline" would make the marker mean nothing.
    const skewed = new Date(NOW.getTime() - 90_000).toISOString();
    expect(resolveOfflineTime(skewed, NOW).fromPhone).toBe(false);
  });

  it('falls back to server time when the phone sends nothing usable', () => {
    expect(resolveOfflineTime(undefined, NOW)).toEqual({ at: NOW.toISOString(), fromPhone: false });
    expect(resolveOfflineTime('half four', NOW)).toEqual({ at: NOW.toISOString(), fromPhone: false });
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

  it('navigates an existing window to the notification target instead of just focusing it', () => {
    // Focusing any open /field window landed a "new job assigned" tap on
    // whatever screen happened to be open — usually yesterday's job.
    const click = sw.slice(sw.indexOf("addEventListener('notificationclick'"));
    expect(click).toMatch(/client\.navigate\(targetUrl\)/);
  });
});
