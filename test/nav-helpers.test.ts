import { describe, it, expect } from 'vitest';
import { isSectionNew, markNavSeen, parseNavSeen, resolveTabForHash, shouldAutoOpenCreate, settingsTabEvent, SETTINGS_TAB_EVENT } from '@/lib/nav-helpers';

// Mirrors the real settings tab config (id + the section ids each tab owns).
const TABS = [
  { id: 'account' },
  { id: 'payments', anchors: ['deposits'] },
  { id: 'automations', anchors: ['reviews', 'followups', 'reminders', 'daily-digest'] },
  { id: 'business', anchors: ['marketing-address', 'finances'] },
];

describe('resolveTabForHash', () => {
  it('matches a tab by its own id (with or without leading #)', () => {
    expect(resolveTabForHash(TABS, '#payments')).toBe('payments');
    expect(resolveTabForHash(TABS, 'account')).toBe('account');
  });

  it('resolves a deep-link anchor to the tab that owns it', () => {
    // The real deep links: #reviews / #daily-digest from other pages & emails,
    // #finances from the tax-year links, #deposits from Payments.
    expect(resolveTabForHash(TABS, '#reviews')).toBe('automations');
    expect(resolveTabForHash(TABS, '#daily-digest')).toBe('automations');
    expect(resolveTabForHash(TABS, '#reminders')).toBe('automations');
    expect(resolveTabForHash(TABS, '#finances')).toBe('business');
    expect(resolveTabForHash(TABS, '#marketing-address')).toBe('business');
    expect(resolveTabForHash(TABS, '#deposits')).toBe('payments');
  });

  it('returns null for empty, missing, or unknown hashes', () => {
    expect(resolveTabForHash(TABS, '')).toBeNull();
    expect(resolveTabForHash(TABS, '#')).toBeNull();
    expect(resolveTabForHash(TABS, null)).toBeNull();
    expect(resolveTabForHash(TABS, undefined)).toBeNull();
    expect(resolveTabForHash(TABS, '#nope')).toBeNull();
  });
});

describe('shouldAutoOpenCreate', () => {
  it('opens when the list is empty regardless of the flag', () => {
    expect(shouldAutoOpenCreate(0, undefined)).toBe(true);
    expect(shouldAutoOpenCreate(0, '1')).toBe(true);
  });

  it('opens when the URL flag is present (?new / ?add)', () => {
    expect(shouldAutoOpenCreate(12, '1')).toBe(true);
    expect(shouldAutoOpenCreate(12, '')).toBe(true);
  });

  it('stays closed with items and no flag', () => {
    expect(shouldAutoOpenCreate(12, undefined)).toBe(false);
    expect(shouldAutoOpenCreate(1, undefined)).toBe(false);
  });
});

describe('nav "New" badges', () => {
  const OLD = '2026-08-01T10:00:00.000Z';
  const NEW = '2026-08-02T10:00:00.000Z';

  describe('isSectionNew', () => {
    it('is new when something arrived after the last visit', () => {
      expect(isSectionNew(NEW, OLD)).toBe(true);
    });

    it('is not new when the last visit came after the newest arrival', () => {
      expect(isSectionNew(OLD, NEW)).toBe(false);
      // Same instant: seen it.
      expect(isSectionNew(NEW, NEW)).toBe(false);
    });

    it('counts never-visited as new — you have not seen what you never opened', () => {
      expect(isSectionNew(NEW, undefined)).toBe(true);
      expect(isSectionNew(NEW, null)).toBe(true);
      expect(isSectionNew(NEW, '')).toBe(true);
    });

    it('shows nothing when the section is empty', () => {
      expect(isSectionNew(null, undefined)).toBe(false);
      expect(isSectionNew(undefined, OLD)).toBe(false);
      expect(isSectionNew('', OLD)).toBe(false);
    });

    it('resolves garbage to NOT new, so a badge is never unclearable', () => {
      // A badge you cannot clear is worse than a missing one: the only way to
      // make it go away would be to stop looking at the rail.
      expect(isSectionNew('not a date', OLD)).toBe(false);
      expect(isSectionNew(NEW, 'not a date')).toBe(false);
    });
  });

  describe('markNavSeen', () => {
    it('records the newest arrival at the moment of the visit', () => {
      expect(markNavSeen({}, '/dashboard/leads', NEW)).toEqual({ '/dashboard/leads': NEW });
    });

    it('only ever moves forward', () => {
      // A visit made while the status poll still holds a stale, older "newest"
      // must not rewind the mark and re-raise the badge for something already seen.
      const seen = { '/dashboard/leads': NEW };
      expect(markNavSeen(seen, '/dashboard/leads', OLD)).toBe(seen);
      expect(markNavSeen(seen, '/dashboard/leads', NEW)).toBe(seen);
    });

    it('returns the SAME object when nothing changed', () => {
      // Identity is the signal the caller uses to skip a storage write and a
      // re-render on every 60s poll.
      const seen = { '/dashboard/jobs': NEW };
      expect(markNavSeen(seen, '/dashboard/jobs', null)).toBe(seen);
      expect(markNavSeen(seen, '/dashboard/jobs', 'nonsense')).toBe(seen);
    });

    it('keeps other sections untouched', () => {
      const seen = { '/dashboard/jobs': OLD };
      expect(markNavSeen(seen, '/dashboard/leads', NEW)).toEqual({ '/dashboard/jobs': OLD, '/dashboard/leads': NEW });
    });
  });

  describe('parseNavSeen', () => {
    it('reads a stored map', () => {
      expect(parseNavSeen(JSON.stringify({ '/dashboard/leads': NEW }))).toEqual({ '/dashboard/leads': NEW });
    });

    it('survives anything at all in that storage slot', () => {
      for (const raw of [null, undefined, '', 'not json', '[]', '"a string"', '42', 'null']) {
        expect(parseNavSeen(raw), String(raw)).toEqual({});
      }
    });

    it('drops entries that are not timestamps', () => {
      expect(parseNavSeen(JSON.stringify({ a: 1, b: null, c: '', d: NEW }))).toEqual({ d: NEW });
    });
  });
});

describe('settingsTabEvent', () => {
  it('carries the hash without the leading #', () => {
    expect(settingsTabEvent('#automations').detail).toBe('automations');
    expect(settingsTabEvent('automations').detail).toBe('automations');
  });

  it('uses one agreed event name on both ends', () => {
    expect(settingsTabEvent('automations').type).toBe(SETTINGS_TAB_EVENT);
  });

  it('resolves to a real tab, so the link and the tabs agree', () => {
    // The bug this fixes: the sidebar linked to #automations and the tab
    // switched only on a fresh mount. Next navigates with pushState, which
    // never fires hashchange, and clicking the tab writes #automations into the
    // URL — so from inside Settings there was often no URL change at all.
    const tabs = [{ id: 'account' }, { id: 'payments' }, { id: 'automations' }, { id: 'business' }];
    expect(resolveTabForHash(tabs, settingsTabEvent('#automations').detail)).toBe('automations');
  });
});
