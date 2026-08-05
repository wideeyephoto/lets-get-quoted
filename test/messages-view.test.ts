import { describe, it, expect } from 'vitest';
import { MESSAGES_VIEWS, normalizeMessagesView, type MessagesView } from '@/lib/dashboard-views';

// How the text inbox is dressed, read from a cookie on every render. A cookie
// is user-editable and can also be left over from a value we no longer ship, so
// this is the only thing between a junk string and an inbox that renders in
// neither dressing.

describe('normalizeMessagesView', () => {
  it('keeps every dressing the page actually has', () => {
    for (const view of MESSAGES_VIEWS) {
      expect(normalizeMessagesView(view), view).toBe(view);
    }
  });

  it('opens on Classic for anyone who has never chosen', () => {
    // The load-bearing case. Slate repaints every bubble on the page, so it has
    // to be something you pick — an owner who never opens the gear must find
    // the inbox exactly as they left it.
    expect(normalizeMessagesView(undefined)).toBe('classic');
    expect(normalizeMessagesView(null)).toBe('classic');
    expect(normalizeMessagesView('')).toBe('classic');
  });

  it('falls back rather than trusting a hand-edited cookie', () => {
    for (const junk of ['SLATE', 'dark', 'blue', '{}', '../../etc', 0, true, {}, []]) {
      expect(normalizeMessagesView(junk), String(junk)).toBe('classic');
    }
  });

  it('is case-sensitive on purpose', () => {
    // Not a nicety: the cookie is only ever written by normalizeMessagesView
    // itself, so a differently-cased value did not come from us.
    expect(normalizeMessagesView('Slate')).toBe('classic');
  });

  it('has no view outside the two the page can render', () => {
    const rendered: MessagesView[] = ['classic', 'slate'];
    expect([...MESSAGES_VIEWS].sort()).toEqual([...rendered].sort());
  });
});
