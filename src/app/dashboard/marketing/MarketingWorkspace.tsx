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

      {/* Two tiles, not two full-width panels. Rebook and the blog are the other
          two ways to reach somebody, and each was carrying a paragraph to say
          what a number says: how many people, how many posts. Side by side they
          read as "the other things you could do", which is what they are. */}
      <section className="marketing-more">
        <article className="panel marketing-tile">
          <p className="eyebrow">Book again</p>
          <strong className="marketing-tile-figure">
            {rebook.uninvited > 0 ? rebook.uninvited : rebook.due > 0 ? rebook.due : 'Nobody'}
          </strong>
          <p className="marketing-tile-note">
            {rebook.uninvited > 0
              ? `past ${rebook.uninvited === 1 ? 'customer' : 'customers'} ${rebook.days}+ days quiet, not yet asked`
              : rebook.due > 0
                ? `${rebook.days}+ days quiet — all reachable ones already invited`
                : `is ${rebook.days}+ days overdue right now`}
          </p>
          <Link href="/dashboard/rebook" className={`btn ${rebook.uninvited > 0 ? 'primary' : 'secondary'}`}>
            {rebook.uninvited > 0 ? 'Send booking links' : 'Who’s due'}
          </Link>
        </article>

        <article className="panel marketing-tile">
          <p className="eyebrow">Blog</p>
          {!blog ? (
            <>
              <strong className="marketing-tile-figure">—</strong>
              <p className="marketing-tile-note">No website to post to yet</p>
              <Link href="/dashboard/sites" className="btn secondary">Set one up</Link>
            </>
          ) : (
            <>
              <strong className="marketing-tile-figure">{blog.live}</strong>
              <p className="marketing-tile-note">
                live{blog.drafts > 0 ? ` · ${blog.drafts} ${blog.drafts === 1 ? 'draft' : 'drafts'}` : ''}
                {blog.latest ? ` · last ${blog.latest}` : ''}
              </p>
              <Link href="/dashboard/marketing/blog" className="btn secondary">
                {blog.total === 0 ? 'Write your first' : 'Write & edit'}
              </Link>
            </>
          )}
        </article>
      </section>

      {/* Only once there IS a history. An empty panel saying its own name and
          "nothing here yet" is a row of furniture explaining that it is empty. */}
      {campaigns.length > 0 ? (
        <CampaignHistory campaigns={campaigns} onReuse={hasRecipients ? onUseDraft : undefined} />
      ) : null}
    </>
  );
}
