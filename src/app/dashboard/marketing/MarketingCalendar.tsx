'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { AUDIENCE_LABEL, CHANNEL_LABEL, CLIMATE_LABEL, SMS_EXCLUSION_NOTE, type Audience, type Channel } from '@/lib/marketing-calendar';
import type { MarketingDraft } from '@/lib/marketing-draft';
import type { CampaignDraft } from '@/lib/marketing-draft-data';
import { createBlogPostFromBeatAction, campaignDraftForBeatAction, draftMarketingAction, type CalendarView } from './actions';

/**
 * The months ahead, and what's worth saying in them.
 *
 * Every draft here is a draft. There is no send button on this page, and that's
 * deliberate: sending goes through the campaign machinery below, which has the
 * unsubscribe list, the postal address and the suppression rules that make a
 * marketing email lawful. Shortcutting that from here would be the fastest way
 * to get a contractor's domain blocked.
 */
export default function MarketingCalendar({
  view,
  onUseDraft,
}: {
  view: CalendarView;
  /**
   * Hands a topic to the composer further down the same page. Absent when there
   * is nobody to send to — then a topic can still become a blog post, which
   * needs no customer list at all.
   */
  onUseDraft?: (draft: CampaignDraft) => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, MarketingDraft>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [posted, setPosted] = useState<Record<string, { id: string; title: string }>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function write(beatId: string, channel: Channel) {
    setBusy(`write:${beatId}`);
    setErrors((current) => ({ ...current, [beatId]: '' }));
    startTransition(async () => {
      const result = await draftMarketingAction(beatId, channel);
      if (result.ok) setDrafts((current) => ({ ...current, [beatId]: result.draft }));
      else setErrors((current) => ({ ...current, [beatId]: result.message }));
      setBusy(null);
    });
  }

  function createPost(beatId: string) {
    setBusy(`post:${beatId}`);
    setErrors((current) => ({ ...current, [beatId]: '' }));
    startTransition(async () => {
      const result = await createBlogPostFromBeatAction(beatId);
      if (result.ok) setPosted((current) => ({ ...current, [beatId]: { id: result.postId, title: result.title } }));
      else setErrors((current) => ({ ...current, [beatId]: result.message }));
      setBusy(null);
    });
  }

  /**
   * Hand the topic to the composer.
   *
   * When the contractor has already drafted it, the text they READ is what goes
   * in the box. Asking the server to write it again would put different words
   * there from the ones they just approved — the old behaviour, and a genuinely
   * confusing one. Only an un-drafted topic needs a round trip.
   */
  function handOverToComposer(beatId: string) {
    if (!onUseDraft) return;
    const drafted = drafts[beatId];
    if (drafted) {
      onUseDraft({
        channel: 'email',
        audience: 'all',
        subject: drafted.subject,
        subjectOptions: drafted.subjectOptions,
        body: [...drafted.body, drafted.callToAction].filter(Boolean).join('\n\n'),
        beatId,
      });
      return;
    }
    setBusy(`send:${beatId}`);
    startTransition(async () => {
      const draft = await campaignDraftForBeatAction(beatId);
      if (draft) onUseDraft(draft);
      else setErrors((current) => ({ ...current, [beatId]: 'Could not draft that just now. Try again.' }));
      setBusy(null);
    });
  }

  return (
    <>
      <p className="marketing-context">
        Timed for <strong>{CLIMATE_LABEL[view.zone].toLowerCase()}</strong>
        {view.state ? ` (${view.state})` : ''}
        {view.trade ? ` and ${view.trade.toLowerCase()}` : ''}.
        {/* Said out loud rather than assumed. A contractor in Phoenix being
            offered furnace content should be able to see why. */}
        {!view.state ? (
          <>
            {' '}We couldn&apos;t work out your state from your mailing address, so this assumes four seasons —{' '}
            <Link href="/dashboard/settings">add it in Settings</Link> and the calendar shifts to match.
          </>
        ) : null}
      </p>

      {view.planned.length === 0 ? (
        <p className="empty-state">
          Nothing seasonal for your trade in the next few months. That&apos;s a real answer, not an empty one — a
          calendar that invents something for every month is a calendar of things nobody needed to read.
        </p>
      ) : (
        <div className="marketing-list">
          {view.planned.map((entry) => {
            const draft = drafts[entry.beatId];
            const error = errors[entry.beatId];
            const writing = pending && busy === `write:${entry.beatId}`;
            const posting = pending && busy === `post:${entry.beatId}`;
            const handing = pending && busy === `send:${entry.beatId}`;

            const canEmail = entry.channels.includes('email');
            const canBlog = entry.channels.includes('blog');
            // A post made in this session wins over the one loaded with the page.
            const madeNow = posted[entry.beatId];
            const postTitle = madeNow?.title ?? entry.postedTitle;
            const postId = madeNow?.id ?? entry.postedId;
            const isDone = Boolean(entry.sentAt) || Boolean(postTitle);

            return (
              <article key={entry.beatId} className={`marketing-beat${isDone ? ' is-done' : ''}`}>
                <header className="marketing-beat-head">
                  <div>
                    <span className="marketing-month">{entry.monthName}</span>
                    <strong>{entry.title}</strong>
                  </div>
                  <span className="marketing-beat-meta">
                    {CHANNEL_LABEL[entry.channel]} · {AUDIENCE_LABEL[entry.audience as Audience]}
                    {/* The number turns a suggestion into a decision. Absent
                        rather than guessed where we genuinely can't segment. */}
                    {entry.reach !== null ? <> · <strong>{entry.reach}</strong> reachable by email</> : null}
                  </span>
                </header>

                {entry.reach === null ? (
                  <p className="marketing-beat-note">
                    We can&apos;t count this audience yet — nothing here tracks when a customer&apos;s service is
                    next due, so pick who receives it in the composer below.
                  </p>
                ) : null}

                {/* What you already did about this topic. Without it the card in
                    October looks exactly as untouched as it did in September. */}
                {entry.sentAt ? (
                  <p className="marketing-beat-state">
                    ✓ Emailed {new Date(entry.sentAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    {entry.sentTo > 0 ? ` to ${entry.sentTo} ${entry.sentTo === 1 ? 'customer' : 'customers'}` : ''}.
                  </p>
                ) : null}
                {postTitle ? (
                  <p className="marketing-beat-state">
                    {/* Straight to THIS post on Marketing → Blog. It used to
                        point at /dashboard/sites, which was where posts were
                        edited before the blog moved — so the one link on a card
                        that says "review and publish it" landed on a page with
                        nothing to review. */}
                    ✓ Draft on your website: “{postTitle}” —{' '}
                    <Link href={postId ? `/dashboard/marketing/blog/${encodeURIComponent(postId)}` : '/dashboard/marketing/blog'}>
                      review and publish it
                    </Link>.
                  </p>
                ) : null}

                <p className="marketing-why">{entry.whyNow}</p>

                {draft ? (
                  <div className="marketing-draft">
                    <strong>{draft.subject}</strong>
                    {draft.body.map((paragraph, index) => (
                      <p key={index}>{paragraph}</p>
                    ))}
                    {draft.callToAction ? <p className="marketing-cta">{draft.callToAction}</p> : null}
                    <div className="marketing-actions">
                      <button
                        type="button"
                        className="btn ghost"
                        onClick={() => {
                          void navigator.clipboard?.writeText(
                            [draft.subject, '', ...draft.body, '', draft.callToAction].join('\n'),
                          );
                          setCopied(entry.beatId);
                        }}
                      >
                        {copied === entry.beatId ? 'Copied ✓' : 'Copy it'}
                      </button>
                      <button type="button" className="btn ghost" onClick={() => write(entry.beatId, entry.channel)} disabled={writing}>
                        {writing ? 'Writing…' : 'Write another'}
                      </button>
                      {canEmail && onUseDraft ? (
                        <button type="button" className="btn secondary" onClick={() => handOverToComposer(entry.beatId)} disabled={handing}>
                          {handing ? 'Loading…' : 'Use it in a campaign'}
                        </button>
                      ) : null}
                      {canBlog ? (
                        <button type="button" className="btn secondary" onClick={() => createPost(entry.beatId)} disabled={posting}>
                          {posting ? 'Writing the post…' : 'Create blog post'}
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <div className="marketing-actions">
                    {/* "Write it" only exists where there's an email to write.
                        On a blog-only topic it produced a short note whose only
                        use was the clipboard, sitting next to a button that
                        makes a real post — two actions, one obviously worse. */}
                    {canEmail ? (
                      <button type="button" className="btn secondary" onClick={() => write(entry.beatId, 'email')} disabled={writing}>
                        {writing ? 'Writing…' : '✨ Write it'}
                      </button>
                    ) : null}
                    {canBlog ? (
                      <button
                        type="button"
                        className={`btn ${canEmail ? 'ghost' : 'secondary'}`}
                        onClick={() => createPost(entry.beatId)}
                        disabled={posting}
                      >
                        {posting ? 'Writing the post…' : 'Create blog post'}
                      </button>
                    ) : null}
                    {error ? <small className="marketing-error">{error}</small> : null}
                  </div>
                )}

                {draft && error ? <small className="marketing-error">{error}</small> : null}
              </article>
            );
          })}
        </div>
      )}

      {/* The reason there is no "text them" option, stated where somebody would
          go looking for it. */}
      <p className="marketing-sms-note">{SMS_EXCLUSION_NOTE}</p>
    </>
  );
}
