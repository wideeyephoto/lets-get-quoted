import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { inboxEmptyState, conversationLinkLabel } from '@/lib/inbox-view';
import { linkifyMessage, linkLabel } from '@/lib/message-linkify';
import { automationAnchorFor, AUTOMATION_ANCHORS } from '@/lib/nav-helpers';

// Newlines normalised: these files are checked out CRLF on Windows, and a
// multi-line assertion written with \n matches nothing there and everything on
// CI, which is the worst kind of green.
const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n');

/**
 * Source-as-text, the house convention for UI (see test/app-shell-width.test.ts):
 * the test environment is node with no DOM, and every screen below is either a
 * server component behind a Supabase session or a client component behind one.
 *
 * COMMENTS ARE STRIPPED FIRST, and that is not tidiness. This codebase writes
 * long WHY comments that quote the string being removed — "max-height: 30rem is
 * what made this a document", "/dashboard/settings#automations is a tab that no
 * longer exists" — so a bare `not.toContain` matches the explanation of the fix
 * and reports the fix as missing. Three previous tests in this suite were
 * written twice for exactly this reason.
 */
const stripJs = (source: string) =>
  source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
const stripCss = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '');

const PAGE = read('src', 'app', 'dashboard', 'messages', 'page.tsx');
const PAGE_CODE = stripJs(PAGE);
const SCROLLER = read('src', 'app', 'dashboard', 'messages', 'ScrollToLatest.tsx');
const SAVED = read('src', 'app', 'dashboard', 'messages', 'SavedReplies.tsx');
const AUTOMATIONS = read('src', 'app', 'dashboard', 'automations', 'page.tsx');
const CATALOGUE = stripJs(read('src', 'app', 'dashboard', 'automations', 'OutgoingTextCatalogue.tsx'));
const SHELL = read('src', 'components', 'app-shell.tsx');
const SHELL_CODE = stripJs(SHELL);
const MODAL = read('src', 'components', 'modal-dialog.tsx');
const CSS = stripCss(read('src', 'app', 'globals.css'));

/* ===========================================================================
   1. Searching the inbox
   ---------------------------------------------------------------------------
   Typing a customer's name and pressing Enter reloaded the unfiltered inbox and
   cleared the term, while the same ?q= typed into the address bar returned the
   one matching thread. The filtering was never the problem; the form was — no
   action, and no submit button, so it depended entirely on the browser choosing
   to implicitly submit a lone text field.
   ======================================================================== */
describe('the search form submits', () => {
  const form = PAGE_CODE.slice(PAGE_CODE.indexOf('<form className="inbox-search"'), PAGE_CODE.indexOf('inbox-filters'));

  it('names where it is going, instead of inheriting the current URL', () => {
    expect(form).toContain('action="/dashboard/messages"');
    expect(form).toContain('method="get"');
  });

  it('has a real submit control, so nothing rests on implicit submission', () => {
    expect(form).toContain('type="submit"');
    expect(form).toContain('inbox-search-go');
  });

  it('carries the active filter across the search', () => {
    expect(form).toContain('<input type="hidden" name="filter" value={filter} />');
  });

  /**
   * The destination is deliberately NOT the current URL: the current URL
   * carries ?thread=, and a search that keeps the open thread has decided the
   * answer before it looked.
   */
  it('drops the open thread rather than carrying it into the results', () => {
    expect(form).not.toContain('name="thread"');
  });

  it('offers a way back out of a search', () => {
    expect(form).toContain('inbox-search-clear');
    expect(form).toContain('aria-label="Clear search"');
  });

  it('is announced as a search landmark', () => {
    expect(form).toContain('role="search"');
  });
});

/* ===========================================================================
   2. What an empty list means
   ======================================================================== */
describe('an empty list says which kind of empty', () => {
  it('a brand-new account is told what will happen', () => {
    const state = inboxEmptyState({ total: 0, filter: 'all', query: '' });
    expect(state.title).toBe('No conversations yet');
    expect(state.body).toContain('When a customer texts you');
    // Nothing to clear — there is no filter on and no search term.
    expect(state.clear).toBe(false);
  });

  it('an empty Unread tab is good news, not a missing inbox', () => {
    const state = inboxEmptyState({ total: 12, filter: 'unread', query: '' });
    expect(state.title).toBe('You’re all caught up');
    expect(state.title).not.toContain('No conversations yet');
    expect(state.clear).toBe(true);
  });

  it('an empty Needs reply tab says who it was waiting on', () => {
    expect(inboxEmptyState({ total: 12, filter: 'reply', query: '' }).title).toBe('Nothing is waiting on you');
  });

  it('a search that found nothing repeats the term back', () => {
    const state = inboxEmptyState({ total: 12, filter: 'all', query: 'Kendra' });
    expect(state.title).toContain('Kendra');
    expect(state.body).toContain('names, numbers and the last message');
  });

  it('the search beats the filter, because it is the narrower of the two', () => {
    expect(inboxEmptyState({ total: 12, filter: 'unread', query: 'Kendra' }).title).toContain('Kendra');
  });

  it('is rendered inside the list, not instead of the whole page', () => {
    const list = PAGE_CODE.slice(PAGE_CODE.indexOf('inbox-list'), PAGE_CODE.indexOf('inbox-thread"'));
    expect(list).toContain('conversations.length === 0');
    expect(list).toContain('inbox-empty');
    // The old shape swapped the entire workspace for one panel, so mistyping a
    // name reorganised the page around the mistake.
    expect(PAGE_CODE).not.toMatch(/conversations\.length === 0 \? \(\s*<section className="panel/);
  });
});

/* ===========================================================================
   3. Opening a thread at the newest message
   ======================================================================== */
describe('a thread opens on the latest message', () => {
  /**
   * On a phone the thread pane is display:none until a conversation is picked,
   * and a hidden element has no scrollHeight — so the one write in the old
   * version happened against zero and the reader landed three weeks back.
   */
  it('measures after layout, not after paint', () => {
    expect(SCROLLER).toContain('useLayoutEffect');
    expect(SCROLLER).toContain('typeof window === \'undefined\' ? useEffect : useLayoutEffect');
  });

  it('pins again when a photo finishes loading', () => {
    // `load` does not bubble; the capture flag is what makes one listener enough.
    expect(SCROLLER).toContain("scroller.addEventListener('load', onLoad, true)");
    expect(SCROLLER).toContain('requestAnimationFrame(pin)');
  });

  it('but stops the moment the reader scrolls back', () => {
    expect(SCROLLER).toContain('if (stick) scroller.scrollTop = scroller.scrollHeight');
    expect(SCROLLER).toContain('AT_BOTTOM_SLACK');
  });

  it('starts again at the bottom of the next thread', () => {
    expect(SCROLLER).toContain('}, [threadKey]);');
  });
});

/* ===========================================================================
   4. The inbox as a workspace
   ---------------------------------------------------------------------------
   Measured at 1440x900: the reply box began at y≈909 — one row below the fold —
   and the page ran on for thousands more pixels of saved replies and message
   reference. At 320px the whole thing was over 16,000px tall.
   ======================================================================== */
describe('the inbox is framed by the viewport', () => {
  // From the workspace block onward. `.inbox-slate .inbox-messages` and
  // `.inbox-thread-list` are each defined twice — once for the Slate dressing
  // higher up, once here — and a slice from the top of the file finds the
  // dressing, passes on the wrong rule, and tells you nothing.
  const WORKSPACE = CSS.slice(CSS.indexOf('.inbox-slate.workspace-shell {'));
  const ruleFor = (selector: string) => {
    const at = WORKSPACE.indexOf(`${selector} {`);
    expect(at, selector).toBeGreaterThan(-1);
    return WORKSPACE.slice(at, WORKSPACE.indexOf('}', at));
  };

  it('the shell is a column and the layout takes what is left', () => {
    expect(CSS).toContain('.inbox-slate.workspace-shell {');
    expect(ruleFor('.inbox-slate.workspace-shell')).toContain('flex-direction: column');
    const body = ruleFor('.inbox-slate .inbox-layout');
    // flex-basis 0 is the load-bearing part: the thread's content is unbounded,
    // so anything that lets it set the box's size gives back the tall page.
    expect(body).toContain('flex: 1 1 0');
    expect(body).toContain('min-height: 24rem');
  });

  it('exactly one thing inside the thread scrolls', () => {
    const body = ruleFor('.inbox-slate .inbox-messages');
    expect(body).toContain('flex: 1 1 0');
    expect(body).toContain('min-height: 0');
    // The 30rem cap is what made this a document: dead space under the thread
    // on a tall screen, an overrun composer on a short one.
    expect(body).toContain('max-height: none');
  });

  it('and the composer is not one of them', () => {
    expect(WORKSPACE).toContain('.inbox-slate .inbox-thread-head,\n.inbox-slate .inbox-reply-area { flex: none; }');
  });

  it('the conversation list scrolls inside its own panel', () => {
    const body = ruleFor('.inbox-slate .inbox-thread-list');
    expect(body).toContain('overflow-y: auto');
    expect(body).toContain('min-height: 0');
  });

  /**
   * 100vh on a phone is the viewport with the URL bar collapsed, so a frame
   * built from it hides its last row — here, the reply box — until you scroll.
   */
  it('uses the live viewport height on a phone', () => {
    expect(CSS).toContain('.app-main-sidenav .inbox-slate.wide-shell { min-height: calc(100dvh - 4.4rem); }');
  });
});

/* ===========================================================================
   5. One pane at a time, and no half-selected third
   ---------------------------------------------------------------------------
   At 726px the first conversation looked selected and ITS customer details
   appeared below the list, while the messages stayed hidden.
   ======================================================================== */
describe('the customer column is really hidden when it is meant to be', () => {
  const narrow = CSS.slice(CSS.indexOf('@media (max-width: 1180px)'));
  const block = narrow.slice(0, narrow.indexOf('@media (max-width: 820px)'));

  /**
   * A media query adds no specificity. `.inbox-context { display: none }` in
   * here was overruled by `.inbox-context { display: grid }` further down the
   * file — same specificity, later wins — so the column was never hidden at any
   * width. It wrapped instead: three children, two tracks, third on a new row.
   */
  it('out-specifies the base rule instead of merely coming before it', () => {
    expect(block).toContain('.inbox-layout > .inbox-context { display: none; }');
    expect(block).not.toMatch(/^\s*\.inbox-context \{ display: none; \}/m);
  });

  /**
   * And it is not rendered at all without a thread. With no conversation open
   * it drew "this number isn't in your customer book yet" beside a number that
   * did not exist — the same half-selected third pane, one level down.
   */
  it('is not rendered at all when nothing is selected', () => {
    expect(PAGE_CODE).toContain('{activePhone ? (\n          <aside className="panel workspace-section-card inbox-context">');
  });

  it('the base rule that beat it is still there, and still later in the file', () => {
    // If this ever stops being true the fix above is load-bearing for nothing,
    // and somebody should be told rather than left with a mystery selector.
    expect(CSS.indexOf('.inbox-context { display: grid;')).toBeGreaterThan(CSS.indexOf('@media (max-width: 1180px)'));
  });
});

/* ===========================================================================
   6. What left the page
   ======================================================================== */
describe('the message catalogue moved to the switches it describes', () => {
  it('is gone from the inbox', () => {
    expect(PAGE_CODE).not.toContain('OutgoingTextCatalogue');
  });

  it('and is on Automations, closed', () => {
    expect(AUTOMATIONS).toContain('<OutgoingTextCatalogue />');
    expect(CATALOGUE).toContain('<details className="workspace-details sms-cat-details" id="outgoing-texts">');
    // No `open`: 32 messages written out in full is ~10,000px, and the point of
    // moving it was to stop a long thing sitting open under a short one.
    expect(CATALOGUE).not.toMatch(/<details[^>]*sms-cat-details[^>]*\sopen/);
  });

  it('deep links still open it, because OpenAnchoredCard forces a <details>', () => {
    expect(AUTOMATIONS).toContain('<OpenAnchoredCard />');
    expect(CATALOGUE).toContain('id="outgoing-texts"');
  });

  /**
   * Every "switch it off" link in it pointed at /dashboard/settings#automations
   * — a tab that stopped existing when Automations became a page — so all eight
   * landed on the first tab of Settings with no automation in sight.
   */
  it('its switch links point at cards that exist', () => {
    expect(CATALOGUE).not.toContain('/dashboard/settings#automations');
    expect(CATALOGUE).toContain('automationAnchorFor(control.key)');
    expect(CATALOGUE).toContain('`/dashboard/automations#${anchor}`');
  });

  it('and the one key whose anchor is spelled differently is translated', () => {
    // The switch is stored in a column called `booking`; the card is anchored
    // `booking-availability`.
    expect(automationAnchorFor('booking')).toBe('booking-availability');
    for (const key of ['reviews', 'followups', 'reminders', 'arrival', 'selections', 'missed-call', 'extra-stop']) {
      expect(automationAnchorFor(key), key).toBe(key);
      expect(AUTOMATION_ANCHORS as readonly string[]).toContain(key);
    }
    // A key with no card of its own falls back to the page, never to a dead
    // fragment.
    expect(automationAnchorFor('quote-confirmation')).toBeNull();
  });
});

describe('saved replies live in the composer', () => {
  it('the manager is beside the box it writes into', () => {
    const composer = PAGE_CODE.slice(PAGE_CODE.indexOf('inbox-reply-area'), PAGE_CODE.indexOf('inbox-context'));
    expect(composer).toContain('<SavedReplies');
    expect(composer).toContain('createAction={createTemplateAction}');
    expect(composer).toContain('deleteAction={deleteTemplateAction}');
    expect(composer).toContain('id="reply-body"');
  });

  it('and nowhere else on the page', () => {
    expect(PAGE_CODE).not.toContain('template-manager');
    expect(PAGE_CODE).not.toContain('template-add-form');
  });

  /**
   * Moving the manager into the composer would otherwise have taken it away
   * from the one account most likely to want it: a new one, with nobody to
   * reply to yet and time to write the replies.
   */
  it('is still reachable with no conversation open — without dead chips', () => {
    const blank = PAGE_CODE.slice(PAGE_CODE.indexOf('Pick a conversation to read and reply'));
    expect(blank.slice(0, blank.indexOf('</div>'))).toContain('canInsert={false}');
    expect(SAVED).toContain('canInsert = true');
    // A chip whose only job is to fill a textarea that is not on the page.
    expect(SAVED).toContain('{canInsert\n          ? templates.map');
  });

  it('opens in place rather than pushing the box off the screen', () => {
    expect(SAVED).toContain('aria-expanded={managing}');
    expect(SAVED).toContain('aria-controls="inbox-saved-manager"');
    const manager = CSS.slice(CSS.indexOf('.inbox-saved-manager {'));
    expect(manager.slice(0, manager.indexOf('}'))).toContain('overflow-y: auto');
  });
});

/* ===========================================================================
   7. Long links
   ======================================================================== */
describe('a texted link is readable in a bubble', () => {
  it('shows what the link is, not its id', () => {
    expect(linkLabel('https://letsgetquoted.com/q/8f2a1c9d4e7b6a5f')).toBe('letsgetquoted.com/q/…');
  });

  it('drops www, which is never the informative part', () => {
    expect(linkLabel('https://www.example.com/pay/abc')).toBe('example.com/pay/…');
  });

  it('leaves a bare host alone — there is nothing to elide', () => {
    expect(linkLabel('https://example.com')).toBe('example.com');
    expect(linkLabel('https://example.com/')).toBe('example.com');
  });

  it('marks a host-plus-query as shortened, because the query is dropped', () => {
    expect(linkLabel('https://example.com?token=abc')).toBe('example.com/…');
  });

  it('cuts a long first segment rather than overrunning', () => {
    const label = linkLabel('https://example.com/a-very-long-marketing-slug-that-keeps-going', 24);
    expect(label.length).toBeLessThanOrEqual(24);
    expect(label.endsWith('…')).toBe(true);
  });

  it('splits a message into text and links, in order', () => {
    const segments = linkifyMessage('Your quote: https://letsgetquoted.com/q/8f2a1c is ready');
    expect(segments.map((s) => s.kind)).toEqual(['text', 'link', 'text']);
    expect(segments[0]).toEqual({ kind: 'text', text: 'Your quote: ' });
    expect(segments[1]).toMatchObject({ href: 'https://letsgetquoted.com/q/8f2a1c' });
    expect(segments[2]).toEqual({ kind: 'text', text: ' is ready' });
  });

  it('never swallows the full stop at the end of a sentence', () => {
    const segments = linkifyMessage('Pay here: https://example.com/pay/abc.');
    expect(segments[1]).toMatchObject({ href: 'https://example.com/pay/abc' });
    expect(segments[2]).toEqual({ kind: 'text', text: '.' });
  });

  it('leaves a message with no link as one run of text', () => {
    expect(linkifyMessage('On my way — about 20 minutes')).toEqual([
      { kind: 'text', text: 'On my way — about 20 minutes' },
    ]);
  });

  it('does not invent links out of prose', () => {
    expect(linkifyMessage('Call me at 3pm or visit us at 14 Main St').every((s) => s.kind === 'text')).toBe(true);
  });

  it('handles nothing at all', () => {
    expect(linkifyMessage('')).toEqual([]);
    expect(linkifyMessage(null)).toEqual([]);
  });

  it('is stateless between calls — a /g regex that is not would skip every other message', () => {
    const body = 'a https://example.com/x b';
    expect(linkifyMessage(body)).toEqual(linkifyMessage(body));
  });

  it('and the bubble renders the segments as real anchors', () => {
    expect(PAGE_CODE).toContain('function MessageBody(');
    expect(PAGE_CODE).toContain('linkifyMessage(body)');
    expect(PAGE_CODE).toContain('rel="noopener noreferrer"');
    // The whole URL survives, in the href and in the hover title.
    expect(PAGE_CODE).toContain('title={segment.href}');
  });
});

/* ===========================================================================
   8. Reaching the inbox with a keyboard
   ======================================================================== */
describe('a conversation row says what it is', () => {
  it('names itself concisely instead of reading its own preview aloud', () => {
    expect(conversationLinkLabel({ name: 'Kendra Willis', unread: 3, when: 'Aug 4, 12:02 PM' }))
      .toBe('Kendra Willis, 3 unread, Aug 4, 12:02 PM');
    expect(conversationLinkLabel({ name: 'Kendra Willis', unread: 0, when: 'Aug 4, 12:02 PM' }))
      .toBe('Kendra Willis, Aug 4, 12:02 PM');
  });

  it('and the list uses it, and marks the open one', () => {
    expect(PAGE_CODE).toContain('aria-label={conversationLinkLabel({');
    expect(PAGE_CODE).toContain("aria-current={conversation.phone === activePhone ? 'page' : undefined}");
    // The badge is inside the link's own label now, so announcing it twice
    // would be the verbosity this was meant to remove.
    expect(PAGE_CODE).toContain('<span className="inbox-unread" aria-hidden="true">');
  });
});

describe('the rail says which row you are on', () => {
  it('in more than colour', () => {
    expect(SHELL_CODE).toContain("aria-current={active ? 'page' : undefined}");
  });
});

/* ===========================================================================
   9. The closed drawer
   ---------------------------------------------------------------------------
   Translated off-screen, all 25 of its links and buttons stayed in the tab
   order and in the accessibility tree.
   ======================================================================== */
describe('the mobile drawer is only there when it is open', () => {
  const rule = CSS.slice(CSS.indexOf('.sidenav {\n    width: 264px;'));
  const closed = rule.slice(0, rule.indexOf('}'));

  it('is removed from the tab order when closed, not merely moved', () => {
    expect(closed).toContain('transform: translateX(-100%)');
    expect(closed).toContain('visibility: hidden');
  });

  it('still slides, because visibility is held until the transform finishes', () => {
    expect(closed).toContain('transition: transform 0.24s ease, visibility 0s linear 0.24s');
    const open = CSS.slice(CSS.indexOf('.sidenav.open {'));
    const body = open.slice(0, open.indexOf('}'));
    expect(body).toContain('visibility: visible');
    expect(body).toContain('transition: transform 0.24s ease, visibility 0s;');
  });
});

describe('the open drawer is modal to a keyboard too', () => {
  it('agrees with the stylesheet about what a drawer is', () => {
    expect(SHELL_CODE).toContain("const DRAWER_QUERY = '(max-width: 1080px)'");
    // It was 900 here and 1080 in the CSS, so between those widths the drawer
    // opened over a page that was still scrolling under it.
    expect(SHELL_CODE).not.toContain("matchMedia('(max-width: 900px)')");
    expect(CSS).toContain('@media (max-width: 1080px)');
  });

  it('makes what it covers unreachable', () => {
    expect(SHELL_CODE).toContain("el.toggleAttribute('inert', true)");
    expect(SHELL_CODE).toContain('[mainRef.current, mobileBarRef.current]');
  });

  it('wraps Tab at both ends of the rail', () => {
    expect(SHELL_CODE).toContain("if (event.key !== 'Tab'");
    expect(SHELL_CODE).toContain('last.focus();');
    expect(SHELL_CODE).toContain('first.focus();');
    // Shift+Tab from outside the rail lands at the END of it, not nowhere.
    expect(SHELL_CODE).toContain('!railRef.current.contains(active)');
  });

  it('gives it back when the drawer closes or the window widens', () => {
    expect(SHELL_CODE).toContain("el.toggleAttribute('inert', false)");
    expect(SHELL_CODE).toContain("drawer.addEventListener('change', sync)");
  });

  it('and the refs it needs are actually on the elements', () => {
    expect(SHELL).toContain('<header className="sidenav-mobilebar" ref={mobileBarRef}>');
    expect(SHELL).toMatch(/app-main-alerted[\s\S]{0,40}ref=\{mainRef\}/);
  });
});

/* ===========================================================================
   10. One business, one name
   ---------------------------------------------------------------------------
   The audited screen showed three: "Let's Get Quoted" (ours, in the rail's
   wordmark), "My Business" (the signup placeholder in accounts.business_name)
   and "BrokePipes" (the real name, in sites.company_name). lib/business-name
   exists to settle this and the inbox was one of the call sites that had not
   been moved onto it.
   ======================================================================== */
describe('the inbox signs texts with the same name as everything else', () => {
  const ACTIONS = stripJs(read('src', 'app', 'dashboard', 'messages', 'actions.ts'));
  const STATUS = stripJs(read('src', 'app', 'api', 'account', 'status', 'route.ts'));

  it('replying uses the ladder, not the raw account column', () => {
    expect(ACTIONS).toContain('loadBusinessName(supabase, accountId)');
    expect(ACTIONS).not.toContain("select('business_name')");
  });

  it('and never introduces the contractor as us', () => {
    expect(ACTIONS).not.toContain("Let's Get Quoted contractor");
  });

  it('both send paths, not just the reply', () => {
    expect(ACTIONS.match(/loadBusinessName\(supabase, accountId\)/g)).toHaveLength(2);
  });

  it('the rail reads it the same way, so it cannot say something else', () => {
    expect(STATUS).toContain("pickBusinessName(site, account, '')");
    expect(STATUS).not.toContain('site?.company_name || account?.business_name');
  });
});

describe('a modal traps focus by making everything else inert', () => {
  it('marks the body’s other children, so the portal survives', () => {
    expect(MODAL).toContain("!el.classList.contains('app-modal-backdrop')");
    expect(MODAL).toContain("inerted.forEach((el) => el.toggleAttribute('inert', true))");
    expect(MODAL).toContain("inerted.forEach((el) => el.toggleAttribute('inert', false))");
  });

  it('runs once the portal exists, which defaultOpen would otherwise miss', () => {
    expect(MODAL).toContain('}, [open, mounted]);');
  });
});
