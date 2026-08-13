import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The Reviews Command Center, as shipped.
 *
 * The arithmetic is tested against fixtures in review-activity.test.ts. What is
 * asserted here is that the SCREEN uses it — that the corrected denominator
 * actually reaches the bar the owner reads, that no label re-implements it, and
 * that the compliance and honesty rules survive an edit by somebody who has not
 * read src/lib/review-routing.ts.
 */

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').replace(/\r\n/g, '\n');
const stripJs = (source: string) =>
  source.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const stripCss = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '');

const dir = (name: string) => read('src', 'app', 'dashboard', 'reviews', name);

/* Comments stripped first: the files here deliberately quote the bug they fix
   ("divides by requests sent", "totalInvites"), so a bare toContain would match
   the explanation rather than the code. */
const SCREEN = stripJs(dir('ReviewsScreen.tsx'));
const PAGE = stripJs(dir('page.tsx'));
const ACTIONS = stripJs(dir('actions.ts'));
const DRAWER = stripJs(dir('ReviewDrawer.tsx'));
const FILTERS = stripJs(dir('ReviewFilters.tsx'));
const CSS = stripCss(dir('reviews.module.css'));
const DEMO = stripJs(read('src', 'app', 'demo', 'reviews', 'page.tsx'));
const LIB = stripJs(read('src', 'lib', 'review-activity.ts'));
const DATA = stripJs(read('src', 'lib', 'reviews.ts'));
const MIGRATION = read('migrations', '2026-08-18-review-command-center.sql');

/**
 * The body of sendReviewReminder alone.
 *
 * Bounded at the next top-level export rather than sliced to end-of-file:
 * `createReviewInvite` is defined further down reviews.ts, so an unbounded
 * slice reports the reminder as minting a new invite when it does no such
 * thing.
 */
function reminderFn(): string {
  const start = DATA.indexOf('export async function sendReviewReminder');
  expect(start).toBeGreaterThan(-1);
  const next = DATA.indexOf('\nexport ', start + 1);
  return DATA.slice(start, next === -1 ? undefined : next);
}

function ruleFor(selector: string): string {
  const start = CSS.search(new RegExp(`^[ \\t]*${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{`, 'm'));
  expect(start, `${selector} has no rule`).toBeGreaterThan(-1);
  return CSS.slice(start, CSS.indexOf('}', start));
}

/* ===========================================================================
   1. The corrected math reaches the screen
   ======================================================================== */
describe('the screen reads the distribution rather than recomputing it', () => {
  it('no longer divides a star count by the number of requests sent', () => {
    // The exact shape of the old bug, in the exact file it lived in.
    expect(SCREEN).not.toContain('totalInvites');
    expect(SCREEN).not.toMatch(/starCounts\[[^\]]+\]\s*\/\s*\w*[Tt]otal/);
    // And no local pct helper to drift from the tested one.
    expect(SCREEN).not.toMatch(/const pct\s*=/);
  });

  it('prints the count and percent straight off the computed bar', () => {
    expect(SCREEN).toContain('kpis.distribution.map');
    expect(SCREEN).toContain('{bar.count} · {bar.pct}%');
  });

  it('draws the bar to the same number it prints', () => {
    // The old bar was scaled to the tallest bar while the label divided by
    // requests sent, so the picture and the number disagreed with each other
    // as well as with the truth.
    expect(SCREEN).toContain('width: `${bar.pct}%`');
    expect(SCREEN).not.toContain('maxStar');
  });

  it('says out loud which denominator the percentages use', () => {
    expect(SCREEN).toMatch(/Share of the \{kpis\.rated\} rating/);
    expect(SCREEN).toMatch(/not of the\{' '\}\s*\{kpis\.sent\} request/);
  });

  it('keeps the response rate on requests sent', () => {
    expect(SCREEN).toContain('{kpis.responded} of {kpis.sent} asked responded.');
  });
});

/* ===========================================================================
   2. Honest naming
   ======================================================================== */
describe('the Google metric never claims a review was posted', () => {
  it('is labelled as page visits', () => {
    expect(SCREEN).toContain('Google page visits');
  });

  it('and keeps the sentence explaining why that is all we can know', () => {
    expect(SCREEN).toContain('Google does not report whether a review was posted.');
  });

  it('never calls it reviews received or reviews posted', () => {
    for (const wrong of ['Google reviews', 'reviews received', 'reviews posted']) {
      expect(SCREEN.toLowerCase(), wrong).not.toContain(wrong.toLowerCase());
    }
  });
});

/* ===========================================================================
   3. Compliance
   ======================================================================== */
describe('review solicitation stays Google-compliant', () => {
  it('keeps the explanation on the page, moved into a disclosure rather than deleted', () => {
    // It used to be four lines of policy above the numbers on every visit. It
    // is one keystroke away now; it is not gone.
    expect(SCREEN).toContain('<details className={styles.policy}>');
    expect(SCREEN).toContain('Why every customer gets both options');
    expect(SCREEN).toMatch(/Google prohibits sending only happy customers/);
    expect(SCREEN).toMatch(/it&apos;s your Business Profile/);
  });

  it('says the rating decides nothing about what the customer was shown', () => {
    expect(SCREEN).toMatch(/decides nothing about what the\s+customer was shown/);
  });

  it('the routing function still cannot see a rating', () => {
    // The structural guarantee behind all of the above. If this ever takes a
    // rating, the copy on this page becomes a lie.
    const routing = read('src', 'lib', 'review-routing.ts');
    expect(routing).toContain('export function reviewRoutes(input: { googleUrl: string | null | undefined })');
  });

  it('the private-feedback ordering is triage, and says so where it is defined', () => {
    // Sorting worst-first is fine. Diverting anybody there is not, and the two
    // are easy to confuse when reading the sort function alone.
    const raw = read('src', 'lib', 'review-activity.ts');
    expect(raw).toMatch(/NOT a gate and not a hidden queue/);
  });
});

/* ===========================================================================
   4. No fake actions
   ======================================================================== */
describe('every control is either real or visibly disabled with a reason', () => {
  it('assign is rendered disabled and explained, not wired to nothing', () => {
    expect(DRAWER).toMatch(/<button[\s\S]{0,200}disabled[\s\S]{0,80}Assign/);
    expect(DRAWER).toContain('aria-describedby="assign-why"');
    expect(DRAWER).toMatch(/id="assign-why"/);
    expect(DRAWER).toMatch(/not built yet/);
  });

  it('copy review link is disabled with copy when there is no link to copy', () => {
    expect(SCREEN).toContain('aria-describedby="no-review-link"');
    expect(SCREEN).toMatch(/id="no-review-link"/);
    expect(SCREEN).toMatch(/no review link to copy yet/);
  });

  it('the three live actions exist and each re-derives the account', () => {
    for (const action of ['remindReviewAction', 'setResolvedAction', 'setRemindersStoppedAction']) {
      expect(ACTIONS, action).toContain(`export async function ${action}`);
    }
    // One requireOwnerContext per action, no exceptions.
    expect(ACTIONS.match(/await requireOwnerContext\(\)/g)).toHaveLength(3);
  });

  it('and every write is scoped by account_id as well as by id', () => {
    // The id arrives in a form body. On its own it is not evidence of anything.
    const writes = DATA.match(/\.from\('review_invites'\)\s*\.update\([\s\S]{0,400}?maybeSingle\(\)|\.from\('review_invites'\)\s*\.update\([\s\S]{0,400}?;/g) ?? [];
    expect(writes.length).toBeGreaterThan(0);
    for (const write of writes) {
      if (!write.includes(".eq('id'")) continue;
      expect(write, write.slice(0, 90)).toContain(".eq('account_id', accountId)");
    }
  });
});

/* ===========================================================================
   5. Reminders reuse the invite
   ======================================================================== */
describe('a reminder is a reminder, not a second request', () => {
  it('resends the same token instead of minting a new invite', () => {
    // The one-tap ask on the job page calls createReviewInvite. If the reminder
    // did too, one customer would become two rows and the response rate would
    // quietly divide by a bigger number than the count of people asked.
    const reminder = reminderFn();
    expect(reminder).not.toContain('createReviewInvite');
    expect(reminder).toContain('/review/${invite.token as string}');
  });

  it('counts the reminder only after the send succeeded', () => {
    const reminder = reminderFn();
    // Incrementing first would burn one of three reminders on a provider outage.
    expect(reminder.indexOf('await sendReviewRequestSms')).toBeLessThan(reminder.indexOf('reminders_sent: sent'));
  });

  it('honours the same consent gates as the first send', () => {
    const reminder = reminderFn();
    for (const guard of ['isPhoneOptedOut', 'isEmailSuppressed', 'resolveMarketingMailingAddress', 'preference_off']) {
      expect(reminder, guard).toContain(guard);
    }
  });

  it('the migration backs every column the reminder logic writes', () => {
    for (const column of ['resolved_at', 'reminders_sent', 'last_reminded_at', 'reminders_stopped_at']) {
      expect(MIGRATION, column).toContain(`add column if not exists ${column}`);
    }
    expect(MIGRATION).toContain('create index if not exists review_invites_account_created_idx');
  });

  it('keeps the owner-stop separate from the customer STOP', () => {
    // sms_consent is the customer's decision and covers every message to that
    // number. Nothing on this page may clear it.
    expect(MIGRATION).toMatch(/NOT the same thing[\s\S]{0,200}sms_consent/);
    expect(DATA).not.toMatch(/delete[\s\S]{0,40}sms_consent/);
  });
});

/* ===========================================================================
   6. The drawer
   ======================================================================== */
describe('the details drawer', () => {
  it('takes its open state from the URL, never from useState seeded with a prop', () => {
    // A documented past bug in this codebase: useState's initial value is read
    // once, so the drawer keeps showing the first row it was opened with.
    expect(DRAWER).toContain("searchParams.get('open')");
    expect(DRAWER).not.toMatch(/useState\(\s*(open|row|props)/);
  });

  it('is opaque, so the table underneath cannot bleed through the text', () => {
    const rule = ruleFor('.drawer');
    expect(rule).toContain('background: var(--bg-2)');
    expect(rule).not.toContain('backdrop-filter');
    expect(rule).not.toMatch(/background:\s*rgba/);
  });

  it('is a modal dialog with a label, and traps focus', () => {
    expect(DRAWER).toContain('role="dialog"');
    expect(DRAWER).toContain('aria-modal="true"');
    expect(DRAWER).toContain('aria-labelledby="review-drawer-title"');
    expect(DRAWER).toContain("event.key !== 'Tab'");
    expect(DRAWER).toContain("event.key === 'Escape'");
    // The trap is a real wrap, not just a keydown listener that does nothing.
    expect(DRAWER).toContain('last.focus()');
    expect(DRAWER).toContain('first.focus()');
  });

  it('returns focus to whatever opened it', () => {
    expect(DRAWER).toContain('openerRef.current?.focus?.()');
  });

  it('goes full screen on a phone', () => {
    const phone = CSS.slice(CSS.indexOf('@media (max-width: 560px)'));
    expect(phone).toContain('width: 100vw');
  });

  it('has a sticky header and a real close target', () => {
    expect(ruleFor('.drawerHead')).toContain('position: sticky');
    expect(ruleFor('.drawerClose')).toContain('width: 44px');
    expect(DRAWER).toContain('aria-label="Close details"');
  });

  it('builds its timeline only from events that actually happened', () => {
    // Every entry is conditional on the timestamp that recorded it, so a gap is
    // silence rather than a hole in the logging.
    for (const stamp of ['row.lastRemindedAt', 'row.googleClickedAt', 'row.feedbackAt', 'row.resolvedAt']) {
      expect(DRAWER, stamp).toContain(`...(${stamp}`);
    }
  });
});

/* ===========================================================================
   7. Layout, filters and tabs
   ======================================================================== */
describe('the layout', () => {
  it('uses the shared four-up metric grid rather than a second grid system', () => {
    expect(SCREEN).toContain('workspace-metric-grid four-up');
    expect(CSS).not.toContain('grid-template-columns: repeat(4');
  });

  it('has four KPI cards and a comparison on each', () => {
    expect(SCREEN.match(/<article className="workspace-metric-card/g)).toHaveLength(4);
    expect(SCREEN.match(/<Delta kpi=/g)).toHaveLength(4);
  });

  it('renders no comparison at all when there is no previous period', () => {
    // A grey zero reads as "no change". "All time" has no earlier data, which
    // is a different thing.
    expect(SCREEN).toContain('if (kpi.delta === null) return null;');
  });

  it('carries all five filters', () => {
    for (const name of ['q', 'range', 'status', 'rating', 'channel']) {
      expect(FILTERS, name).toContain(`name="${name}"`);
    }
  });

  it('filters through a real GET form, so the view stays in the URL', () => {
    expect(FILTERS).toContain('method="get"');
    expect(FILTERS).toContain('<button type="submit"');
    // The JS is enhancement; Apply works without it.
    expect(FILTERS).toContain('requestSubmit');
  });

  it('keeps the tab when the filters change', () => {
    expect(FILTERS).toContain('<input type="hidden" name="tab" value={tab} />');
  });

  it('has the three tabs and marks the current one for assistive tech too', () => {
    expect(SCREEN).toContain('ACTIVITY_TABS.map');
    expect(SCREEN).toContain("aria-current={tab === name ? 'page' : undefined}");
    // Not colour alone.
    expect(ruleFor('.tabOn')).toContain('border-bottom-color');
    expect(ruleFor('.tabOn')).toContain('font-weight: 800');
  });
});

/* ===========================================================================
   8. The table, and the phone
   ======================================================================== */
describe('the activity table', () => {
  it('has the ten columns the brief asked for', () => {
    const head = SCREEN.slice(SCREEN.indexOf('<thead>'), SCREEN.indexOf('</thead>'));
    expect(head.match(/<th scope="col">/g)).toHaveLength(10);
  });

  it('is a real table: scoped headers, a row header and a caption', () => {
    expect(SCREEN).toContain('<th scope="row"');
    expect(SCREEN).toContain('<caption>');
  });

  it('scrolls inside its own box rather than making the page scroll sideways', () => {
    expect(ruleFor('.tableWrap')).toContain('overflow-x: auto');
    // Reachable and announced, because a scroll container that only a mouse can
    // reach is a wall.
    expect(SCREEN).toContain('tabIndex={0}');
    expect(SCREEN).toContain('aria-label="Review requests, scrollable"');
  });

  it('swaps to cards on a phone instead of shrinking ten columns', () => {
    const phone = CSS.slice(CSS.indexOf('@media (max-width: 720px)'));
    expect(phone).toContain('.phoneOnly { display: grid; }');
    expect(phone).toContain('.desktopOnly { display: none; }');
    // Never both at once.
    expect(ruleFor('.phoneOnly')).toContain('display: none');
  });

  it('never leaves a star rating as glyphs alone', () => {
    // "★★★☆☆" is punctuation to a screen reader.
    expect(SCREEN).toContain('<span className="sr-only">{row.rating} of 5</span>');
  });

  it('marks unresolved private feedback with an edge rather than colour alone', () => {
    expect(SCREEN).toContain('row.feedback && !row.resolvedAt ? styles.needsYou');
    expect(ruleFor('.needsYou')).toContain('box-shadow: inset');
  });
});

/* ===========================================================================
   9. States
   ======================================================================== */
describe('empty, honest states', () => {
  it('tells "never asked anybody" apart from "nothing matches these filters"', () => {
    expect(SCREEN).toContain('const neverAsked = totalEver === 0;');
    expect(SCREEN).toContain('No review requests yet.');
    expect(SCREEN).toContain('No review requests match these filters.');
  });

  it('draws no trend rather than a flat line of zeroes', () => {
    expect(SCREEN).toContain('trend.length === 0');
    expect(SCREEN).toMatch(/no trend to draw/);
  });

  it('says so when there is nothing to break down', () => {
    expect(SCREEN).toContain('kpis.rated === 0');
    expect(SCREEN).toMatch(/nothing to break down/);
  });

  it('describes the trend in words for anyone who cannot see the bars', () => {
    expect(SCREEN).toContain('role="img"');
    expect(SCREEN).toContain('aria-label={trendLabel(trend)}');
  });

  it('announces the result of an action', () => {
    expect(DRAWER).toContain('aria-live="polite"');
    expect(DRAWER).toContain('role="status"');
  });
});

/* ===========================================================================
   10. The demo still renders the same screen
   ======================================================================== */
describe('the logged-out demo', () => {
  it('reuses the page component rather than a hand-drawn copy', () => {
    expect(DEMO).toContain("from '@/app/dashboard/reviews/ReviewsScreen'");
    expect(DEMO).toContain('readOnly');
  });

  it('computes its numbers with the same pure builder as the real page', () => {
    // Two implementations agree right up until one of them is edited.
    expect(DEMO).toContain('buildActivityView');
    expect(PAGE).toContain('buildActivityView');
    expect(DEMO).toContain('loadReviewActivity');
  });

  it('shows all time, because the fixture is not anchored to today', () => {
    expect(DEMO).toContain("range: 'all'");
  });

  it('takes the write actions off the drawer but changes no number', () => {
    expect(DRAWER).toContain('readOnly ? (');
    expect(DEMO).not.toContain('kpis');
  });
});

/* ===========================================================================
   11. Auth and URL safety
   ======================================================================== */
describe('the page itself', () => {
  it('is owner-scoped before it reads anything', () => {
    expect(PAGE).toContain('await requireOwnerContext()');
    expect(PAGE.indexOf('requireOwnerContext')).toBeLessThan(PAGE.indexOf('loadReviewActivity'));
  });

  it('looks the drawer row up against the account, not straight out of the URL', () => {
    expect(PAGE).toContain('getReviewActivityRow(supabase, accountId, openId)');
  });

  it('stamps one timestamp for the whole render', () => {
    // Calling new Date() inside the view would let the window boundary move
    // between the KPI cards and the table.
    expect(PAGE).toContain('const nowIso = new Date().toISOString();');
    expect(LIB).not.toMatch(/Date\.now\(\)/);
  });

  it('preserves the saved URL: /dashboard/reviews still renders with no params', () => {
    // Every filter has a default, so a bookmark with no query is a valid view.
    expect(LIB).toContain('export const EMPTY_FILTERS');
    expect(LIB).toContain("range: '30d'");
  });
});
