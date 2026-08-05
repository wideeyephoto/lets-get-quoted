'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import CampaignComposer from '../CampaignComposer';
import CampaignHistory from '../CampaignHistory';
import { takeCampaignDraft } from '../campaign-handoff';
import type { Campaign } from '@/lib/campaign-audiences';
import type { CampaignDraft } from '@/lib/marketing-draft-data';

type ComposerProps = React.ComponentProps<typeof CampaignComposer>;

/**
 * The composer and the history, sharing a page.
 *
 * Same reasoning that kept the calendar and the composer together before: a
 * "reuse this campaign" that navigated would re-draft on arrival, so the words
 * in the box would not be the words the contractor had just read. Handing the
 * draft across in the browser removes the querystring there was to distrust.
 */
export default function CampaignWorkspace({
  composer,
  campaigns,
  hasRecipients,
}: {
  composer: Omit<ComposerProps, 'initial'> & { initial?: ComposerProps['initial'] };
  campaigns: Campaign[];
  /** With nobody to send to, the composer is replaced by an explanation. */
  hasRecipients: boolean;
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
    requestAnimationFrame(() => {
      composerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, []);

  // A draft carried over from the Calendar screen. Read in an effect rather than
  // in an initialiser: sessionStorage does not exist on the server, and seeding
  // state from it during render would make the first client render disagree with
  // the HTML and throw a hydration mismatch.
  useEffect(() => {
    const carried = takeCampaignDraft();
    if (carried) onUseDraft(carried);
  }, [onUseDraft]);

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
      <section className="panel workspace-section-card" id="new-campaign" ref={composerRef}>
        <div className="section-heading workspace-section-heading compact-heading">
          <h2>New campaign</h2>
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

      {/* Only once there IS a history. An empty panel saying its own name and
          "nothing here yet" is a row of furniture explaining that it is empty. */}
      {campaigns.length > 0 ? (
        <CampaignHistory campaigns={campaigns} onReuse={hasRecipients ? onUseDraft : undefined} />
      ) : null}
    </>
  );
}
