import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { jobWaitNote, primaryJobAction, type JobStage } from '@/lib/job-lifecycle';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8').split('\r\n').join('\n');

/**
 * The source with its comments removed.
 *
 * Every one of these files explains what USED to be there, in the words that
 * used to be there — "this was a window.confirm", "Client view not shared". An
 * assertion that a thing is GONE has to read the code, or it fails on the note
 * saying why it went.
 *
 * The `[^:]` guard keeps `https://` out of the line-comment pattern.
 */
const code = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const JOB_PAGE = read('src', 'app', 'dashboard', 'jobs', '[id]', 'page.tsx');
const MENU = read('src', 'app', 'dashboard', 'jobs', '[id]', 'JobActionMenu.tsx');
const COMPLETE = read('src', 'app', 'dashboard', 'jobs', '[id]', 'CompleteJobButton.tsx');
const BUILDER = read('src', 'app', 'dashboard', 'jobs', '[id]', 'QuoteBuilder.tsx');
const SCHEDULER = read('src', 'app', 'dashboard', 'leads', '[leadId]', 'LeadAvailabilityScheduler.tsx');
const LEAD_ACTIONS = read('src', 'app', 'dashboard', 'leads', 'actions.ts');

/**
 * THE HERO OFFERED EVERY CONTROL AT ONCE.
 *
 * Request payment, add expense, job started, mark complete — four buttons of
 * equal weight on a job whose crew was not booked until Thursday. Four equal
 * buttons is the same as no recommendation, and two of them (a payment ask, a
 * completion that can text a customer) are expensive to press by accident.
 */
describe('one next step, and a drawer for the rest', () => {
  it('has a sentence for every stage where nothing is the contractor’s move', () => {
    const base = { clientName: 'Dana Whitfield', scheduledLabel: 'Tue, Aug 18', reviewAlreadyRequested: false };
    const silent: JobStage[] = ['quote_sent', 'scheduled', 'settled'];

    for (const stage of silent) {
      // These are exactly the stages primaryJobAction declines to act on...
      const action = primaryJobAction(stage, {
        todayKey: '2026-08-12',
        scheduledFor: '2026-08-18',
        reviewConfigured: false,
        reviewAlreadyRequested: false,
      });
      expect(action, stage).toBeNull();
      // ...so each of them has to say something instead.
      expect(jobWaitNote(stage, base), stage).toBeTruthy();
    }
  });

  it('names the customer as the one being waited on', () => {
    const note = jobWaitNote('quote_sent', { clientName: 'Dana Whitfield', scheduledLabel: null, reviewAlreadyRequested: false });
    expect(note).toContain('Dana Whitfield');
    expect(note).toMatch(/approve/i);
  });

  it('falls back rather than leaving a hole where the name goes', () => {
    const note = jobWaitNote('quote_sent', { clientName: '   ', scheduledLabel: null, reviewAlreadyRequested: false });
    expect(note).toContain('the customer');
  });

  /** A booked job with no date to name has nothing honest to say. */
  it('says nothing about a booked day it does not have', () => {
    expect(jobWaitNote('scheduled', { clientName: 'Dana', scheduledLabel: null, reviewAlreadyRequested: false })).toBeNull();
  });

  it('stays quiet on the stages that do have an action', () => {
    for (const stage of ['pricing', 'approved', 'in_progress', 'complete'] as JobStage[]) {
      expect(jobWaitNote(stage, { clientName: 'Dana', scheduledLabel: 'Tue', reviewAlreadyRequested: false }), stage).toBeNull();
    }
  });

  it('does not offer the same action twice', () => {
    // Every menu entry that duplicates a possible primary is behind !isPrimary.
    for (const key of ['schedule', 'request_payment', 'start', 'complete', 'request_review']) {
      expect(JOB_PAGE, key).toContain(`!isPrimary('${key}')`);
    }
  });

  it('keeps the pricing route on the page, which it previously did not have', () => {
    // A job at the pricing stage led with "Request payment" and offered no way
    // to price it — 'price' is a key primaryJobAction returns and nothing here
    // rendered.
    expect(JOB_PAGE).toContain("primaryAction.key === 'schedule'");
    expect(JOB_PAGE).toContain('#quote-breakdown');
  });

  /** ?open=costs is linked from the schedule calendar, the focus pane, the
   *  smoothie view and the job tabs, and the modal behind it opens on mount —
   *  which a drawer that starts closed would never let it do. */
  it('opens itself for the deep link that lands inside it', () => {
    expect(JOB_PAGE).toContain("defaultOpen={searchParams.open === 'costs'}");
    expect(MENU).toContain('useState(defaultOpen)');
  });

  it('closes the drawer on Escape and on a press outside it', () => {
    expect(MENU).toContain("event.key === 'Escape'");
    expect(MENU).toContain("document.addEventListener('pointerdown', onPointerDown)");
    // Unmounted while closed, so nothing inside is tabbable behind it.
    expect(MENU).toContain('{open ? <div className="job-actions-pop"');
  });
});

/**
 * THE LAST SCREEN BEFORE A JOB DISAPPEARS.
 *
 * A completed job drops out of every "what's left" list in the app, so anything
 * unfinished on it goes quiet at exactly the moment it stops being visible.
 */
describe('the completion preflight', () => {
  it('is a screen, not a window.confirm', () => {
    expect(code(COMPLETE)).not.toContain('window.confirm');
    expect(COMPLETE).toContain('role="dialog"');
    expect(COMPLETE).toContain('aria-modal="true"');
  });

  it('still only stops when there is something to say', () => {
    expect(COMPLETE).toContain('if (completeJobNeedsConfirm(input)) {');
    expect(COMPLETE).toContain('setChecking(true)');
  });

  /** A confirm is not a block. Every line on it is something a contractor can
   *  legitimately close a job over — see completionBlockers. */
  it('offers a way through, not only a way back', () => {
    expect(COMPLETE).toContain('Complete this job');
    expect(COMPLETE).toContain('Not yet');
  });

  it('decides the review send here rather than describing a switch elsewhere', () => {
    expect(COMPLETE).toContain('completeJobReviewSentence(input)');
    expect(COMPLETE).toContain('onToggleReview');
    expect(COMPLETE).toContain('Complete and send the review request');
  });

  /**
   * A ref, not state. The confirm button is a real submit, so its click and the
   * form's submit happen in one turn — a setState would not have landed by the
   * time onSubmit reads it and the preflight would reopen forever.
   */
  it('lets the confirmed submit through instead of re-opening on itself', () => {
    expect(COMPLETE).toContain('const confirmed = useRef(false)');
    expect(COMPLETE).toContain('if (confirmed.current) return;');
  });

  it('is wired to the structured list, not just the sentences', () => {
    expect(JOB_PAGE).toContain('preflight={completionPreflight({');
  });
});

/**
 * AN APPROVED QUOTE ARRIVED AS A FORM.
 *
 * Every line a text box, every price a number input, an AI drafting button on
 * top, and a Save that would rewrite an agreement somebody had already signed
 * off on. Nothing about that screen said "settled".
 */
describe('an approved quote reads as a document', () => {
  it('collapses to a summary until somebody chooses to revise', () => {
    expect(BUILDER).toContain('if (action && approved && !revising) {');
    expect(BUILDER).toContain('<ApprovedQuoteSummary');
    expect(BUILDER).toContain('Revise quote');
  });

  /** Not disabled inputs: a screen of greyed-out boxes reads as broken rather
   *  than as finished. */
  it('renders what the server holds, so cancelling cannot leave stale edits on show', () => {
    expect(BUILDER).toContain('items={initialItems}');
    expect(BUILDER).toContain('setRows(initialItems);');
  });

  it('will not save a revision that revises nothing', () => {
    expect(BUILDER).toContain('disabled={pending || (approved && !dirty)}');
    expect(BUILDER).toContain("const dirty = serializeRows(rows) !== savedSnapshot;");
  });

  /** Three different outcomes for the customer's approval, and the editor says
   *  which one this edit is — a blanket "editing changes what they see" is true
   *  of every keystroke and so gets read as decoration. */
  it('states what saving does to the approval, in the state it is actually in', () => {
    expect(BUILDER).toContain('Nothing has changed yet.');
    expect(BUILDER).toContain('The breakdown changed, the total didn&apos;t.');
    expect(BUILDER).toContain('Their approval covered the previous version.');
  });

  it('keeps the change order as the named alternative', () => {
    expect(BUILDER).toContain('Raise a change order');
    expect(BUILDER).toContain('approve only the difference');
  });
});

/**
 * A CLICK ON A CALENDAR SQUARE WAS A CONFIRMED VISIT.
 *
 * Duration hardcoded to 60 minutes, the note hardcoded to a sentence about the
 * UI it came from, and the address — the thing that decides whether this is a
 * twenty-minute drive or ninety — neither asked for nor shown.
 */
describe('booking an estimate visit reviews it first', () => {
  it('proposes rather than books', () => {
    expect(SCHEDULER).toContain('onClick={(event) => openReview(event, day)}');
    expect(SCHEDULER).toContain('<BookingReview');
    // The day forms no longer submit anything.
    expect(SCHEDULER).not.toContain('<form action={scheduleVisitAction} className={styles.availabilityForm}');
  });

  it('asks for the four things that make a visit real', () => {
    expect(SCHEDULER).toContain('name="quoteVisitTime"');
    expect(SCHEDULER).toContain('name="quoteVisitDuration"');
    expect(SCHEDULER).toContain('name="quoteVisitAddress"');
    expect(SCHEDULER).toContain('name="quoteVisitSmsConsent"');
  });

  it('stops hardcoding the duration and the note', () => {
    expect(SCHEDULER).not.toContain('value="60" />');
    expect(SCHEDULER).not.toContain('Booked from the lead availability snapshot.');
  });

  it('will not text a lead with no mobile on it', () => {
    expect(SCHEDULER).toContain('disabled={!leadPhone.trim()}');
  });

  it('keeps the address on the lead instead of only on the visit', () => {
    expect(LEAD_ACTIONS).toContain("const submittedAddress = optionalText(formData.get('quoteVisitAddress'));");
    expect(LEAD_ACTIONS).toContain("if (!visitAddress) throw new Error('Add the project address before booking the visit.');");
    // One column. updateLeadDetails writes the whole record from its input and
    // nulls anything absent, which would wipe the phone, email and message off
    // a lead in the middle of booking a visit to it.
    const region = LEAD_ACTIONS.slice(
      LEAD_ACTIONS.indexOf('if (submittedAddress && submittedAddress !== lead.address)'),
      LEAD_ACTIONS.indexOf("if (formData.get('quoteVisitSmsConsent')"),
    );
    expect(region).toContain(".from('leads')");
    expect(code(region)).not.toContain('updateLeadDetails');
  });

  it('confirms to the address being booked, not the one on file', () => {
    expect(LEAD_ACTIONS).toContain('address: visitAddress,');
  });
});

/**
 * THREE TRUTHS ABOUT ONE JOB, ALL ON SCREEN AT ONCE.
 *
 * "Client view not shared" sat under a feed full of rows badged "Client
 * visible", for a customer who had been sent a quote and approved it. All three
 * were true of different things: the quote reached them by whatever route sent
 * it, the rows are MARKED for a feed, and the feed itself needs a link nobody
 * had made.
 */
describe('quote access and client page access are named separately', () => {
  /**
   * WHERE THE ANSWER LIVES NOW. A whole card used to say this at the foot of
   * the feed — a heading, a paragraph, and a status line — under a feed whose
   * every row already carries an "In Job Feed" badge. It is said once, in the
   * pipeline step at the top of the page, which is where the rest of "where is
   * this job" is answered.
   */
  it('says whether the page is shared exactly once, in the pipeline', () => {
    const badges = read('src', 'lib', 'job-badges.ts');
    expect(badges).toContain("activeClientLinkCount > 0 ? 'Client page shared' : 'Client page not shared yet'");
    // And not a second time in prose under the feed.
    expect(code(JOB_PAGE)).not.toContain('Client page not shared yet');
    expect(code(JOB_PAGE)).not.toContain('Client view not shared');
    expect(code(JOB_PAGE)).not.toContain('Create client view link');
  });

  /**
   * ONE DESTINATION, ONE NAME, ONE PRESS.
   *
   * Three labels stood on one button — "Client View", "Open their Job Feed",
   * "Share client Job Feed" — and two of them took two presses: the first
   * minted a link and came back to the job page, and only then did a real link
   * appear.
   */
  it('names the destination and goes there', () => {
    expect(JOB_PAGE).toContain('(live page)');
    expect(code(JOB_PAGE)).not.toContain('Open their Job Feed');
    expect(code(JOB_PAGE)).not.toContain('Share client Job Feed');
    expect(read('src', 'app', 'dashboard', 'jobs', 'actions.ts')).toContain('redirect(`/client/jobs/${token}`)');
  });

  /** One link, beside the heading it belongs to — not a card at the foot of
   *  the feed explaining that the client page exists. */
  it('is a door and nothing else', () => {
    const row = JOB_PAGE.slice(
      JOB_PAGE.indexOf('<div className="job-feed-title-row">'),
      JOB_PAGE.indexOf('</div>', JOB_PAGE.indexOf('job-feed-title-row')),
    );
    expect(row).toContain('(live page)');
    expect(row).toContain('<h2>Job Feed</h2>');
    expect(code(JOB_PAGE)).not.toContain('job-feed-share-strip');
    expect(code(JOB_PAGE)).not.toContain('job-feed-share-foot');
  });

  /**
   * The form sits BESIDE the h2, never inside it. Minting is a write, so it
   * has to be a submit rather than an anchor — and a <form> is flow content,
   * which a heading may not contain: the browser closes the h2 around it and
   * the layout comes apart.
   */
  it('keeps the form out of the heading', () => {
    const heading = JOB_PAGE.slice(JOB_PAGE.indexOf('<h2>Job Feed</h2>'));
    expect(heading.indexOf('<h2>Job Feed</h2>')).toBeLessThan(heading.indexOf('<form'));
    expect(JOB_PAGE).not.toMatch(/<h2>[^<]*<form/);
  });
});
