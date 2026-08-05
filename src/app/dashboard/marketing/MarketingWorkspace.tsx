'use client';

import { useCallback, useRef, useState } from 'react';
import Link from 'next/link';
import MarketingCalendar from './MarketingCalendar';
import CampaignComposer from './CampaignComposer';
import CampaignHistory from './CampaignHistory';
import type { Campaign } from '@/lib/campaign-audiences';
import type { CampaignDraft } from '@/lib/marketing-draft-data';
import type { CalendarView } from './actions';

type ComposerProps = React.ComponentProps<typeof CampaignComposer>;

/**
 * The calendar, the composer and the history, on one page.
 *
 * They were two destinations linked to each other in both directions, and the
 * handoff between them was a page load that RE-DRAFTED the topic on arrival —
 * so the words in the box were never the words the contractor had just read and
 * approved. Sharing a page removes the reason that existed: there is no
 * querystring to distrust when the draft is already in the browser.
 */
export default function MarketingWorkspace({
  view,
  composer,
  campaigns,
  hasRecipients,
  blog,
  rebook,
}: {
  view: CalendarView;
  composer: Omit<ComposerProps, 'initial'> & { initial?: ComposerProps['initial'] };
  campaigns: Campaign[];
  /** With nobody to send to, the composer is replaced by an explanation. */
  hasRecipients: boolean;
  /** Null when the account has no website to post to. */
  blog: { total: number; live: number; drafts: number; latest: string | null } | null;
  /** Past customers overdue for another job; the list itself is its own page. */
  rebook: { days: number; due: number; reachable: number; uninvited: number };
}) {
  const [handedOver, setHandedOver] = useState<CampaignDraft | null>(null);
  // Bumped on every handoff. The composer keeps its own state for the subject
  // and body, so a new draft has to REMOUNT it — pushing new props at a live
  // component would leave the old text in the box.
  const [fill, setFill] = useState(0);
  const composerRef = useRef<HTMLElement | null>(null);

  const onUseDraft = useCallback((draft: CampaignDraft) => {
    setHandedOver(draft);
    setFill((current) => current + 1);
    // After the remount, so the composer is its new height before we scroll.
    requestAnimationFrame(() => {
      composerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, []);

  const initial = handedOver
    ? {
        channel: handedOver.channel,
        audience: handedOver.audience,
        subject: handedOver.subject,
        subjectOptions: handedOver.subjectOptions,
        body: handedOver.body,
        // An empty topic means "not from a topic" — see CampaignHistory.
        beatId: handedOver.beatId || undefined,
      }
    : composer.initial;

  return (
    <>
      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading compact-heading">
          <p className="eyebrow">What&apos;s worth saying</p>
        </div>
        <MarketingCalendar view={view} onUseDraft={hasRecipients ? onUseDraft : undefined} />
      </section>

      <section className="panel workspace-section-card" id="new-campaign" ref={composerRef}>
        <div className="section-heading workspace-section-heading compact-heading">
          <p className="eyebrow">New campaign</p>
        </div>
        {hasRecipients ? (
          <CampaignComposer key={fill} {...composer} initial={initial} />
        ) : (
          <p className="empty-state">
            No clients yet. Once you&apos;ve created jobs or taken leads, your customers show up here and you can
            reach them in a couple of taps. <Link href="/dashboard/clients">See your clients →</Link>
          </p>
        )}
      </section>

      {/* The cheapest send on this page: people who already hired you once.
          It was a rail destination of its own, which made winning back a
          customer feel like a separate discipline rather than the most obvious
          thing to send this week. The list and the sending stay on their own
          page — this is the reason to go there. */}
      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading compact-heading">
          <p className="eyebrow">Book again</p>
        </div>
        <p className="workspace-card-copy">
          {rebook.due === 0
            ? `Nobody is ${rebook.days}+ days overdue right now. When a past customer goes quiet for a season, they show up here — they already know whether they liked the work, which makes them the cheapest send on this page.`
            : rebook.uninvited > 0
              ? `${rebook.uninvited} past ${rebook.uninvited === 1 ? 'customer has' : 'customers have'} gone ${rebook.days}+ days without booking and ${rebook.uninvited === 1 ? 'has' : 'have'} not been asked back yet. They already know whether they liked the work.`
              : `${rebook.due} past ${rebook.due === 1 ? 'customer is' : 'customers are'} ${rebook.days}+ days overdue, and all the reachable ones have already been invited. Asking twice is how you get blocked.`}
          {rebook.due > 0 && rebook.reachable < rebook.due
            ? ` ${rebook.due - rebook.reachable} of them ${rebook.due - rebook.reachable === 1 ? 'has' : 'have'} no phone or email on file.`
            : ''}
        </p>
        <div className="marketing-actions">
          <Link href="/dashboard/rebook" className={`btn ${rebook.uninvited > 0 ? 'primary' : 'secondary'}`}>
            {rebook.uninvited > 0 ? `Send your booking link to ${rebook.uninvited}` : 'Who’s due to rebook'}
          </Link>
        </div>
      </section>

      {/* The other half of marketing: what you publish rather than what you
          send. The same seasonal topics feed both, so the blog belongs on this
          page and not buried in the website builder's section list. */}
      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading compact-heading">
          <p className="eyebrow">Blog</p>
        </div>
        {!blog ? (
          <p className="empty-state">
            You need a website before you can post to it. <Link href="/dashboard/sites">Set one up →</Link>
          </p>
        ) : (
          <>
            <p className="workspace-card-copy">
              {blog.total === 0
                ? 'No posts yet. A few genuinely useful articles give Google more local pages to rank, and give past customers a reason to come back — it is the slowest marketing here and the one that compounds.'
                : `${blog.live} live · ${blog.drafts} ${blog.drafts === 1 ? 'draft' : 'drafts'}${blog.latest ? ` · last published ${blog.latest}` : ''}.`}
            </p>
            <div className="marketing-actions">
              <Link href="/dashboard/marketing/blog" className="btn secondary">
                {blog.total === 0 ? 'Write your first post' : 'Write & edit posts'}
              </Link>
            </div>
          </>
        )}
      </section>

      <CampaignHistory campaigns={campaigns} onReuse={hasRecipients ? onUseDraft : undefined} />
    </>
  );
}
