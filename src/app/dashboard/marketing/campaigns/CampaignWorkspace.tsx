'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import CampaignComposer from '../CampaignComposer';
import CampaignHistory from '../CampaignHistory';
import { takeCampaignDraft } from '../campaign-handoff';
import MarketingCalendar from '../MarketingCalendar';
import RecommendedCampaigns from './RecommendedCampaigns';
import CampaignTemplateBrowser from './CampaignTemplateBrowser';
import type { Campaign } from '@/lib/campaign-audiences';
import type { CampaignDraft } from '@/lib/marketing-draft-data';
import type { CampaignRecommendations } from '@/lib/campaign-recommendations';
import type { CalendarView } from '@/lib/marketing-calendar-data';

type ComposerProps = React.ComponentProps<typeof CampaignComposer>;

const BLANK_DRAFT: CampaignDraft = {
  channel: 'email',
  audience: 'past',
  subject: '',
  subjectOptions: [],
  body: '',
  beatId: '',
};

/**
 * The recommendation cards, the template rails, the composer, and the
 * history, sharing a page.
 *
 * Same reasoning that kept the calendar and the composer together before: a
 * "reuse this campaign" that navigated would re-draft on arrival, so the words
 * in the box would not be the words the contractor had just read. Handing the
 * draft across in the browser removes the querystring there was to distrust.
 */
type CampaignTab = 'create' | 'calendar' | 'templates' | 'sent';

export default function CampaignWorkspace({
  composer,
  campaigns,
  hasRecipients,
  recommendations,
  view,
  initialTab,
  emailTheme,
  websiteTemplate,
  businessName,
  accent,
  logoUrl,
  onOpenEmailTemplateModal,
}: {
  composer: Omit<ComposerProps, 'initial'> & { initial?: ComposerProps['initial'] };
  campaigns: Campaign[];
  /** With nobody to send to, the composer is replaced by an explanation. */
  hasRecipients: boolean;
  /** null when there are no recipients to build recommendations from. */
  recommendations: CampaignRecommendations | null;
  view: CalendarView;
  initialTab?: CampaignTab;
  emailTheme?: string | null;
  websiteTemplate?: string | null;
  businessName?: string;
  accent?: string | null;
  logoUrl?: string | null;
  onOpenEmailTemplateModal?: () => void;
}) {
  const normalizeTab = (tab?: string | null): CampaignTab => {
    if (tab === 'calendar' || tab === 'seasonal') return 'calendar';
    if (tab === 'templates' || tab === 'starters') return 'templates';
    if (tab === 'sent' || tab === 'history') return 'sent';
    return 'create';
  };

  const [activeTab, setActiveTab] = useState<CampaignTab>(() => normalizeTab(initialTab));
  const [handedOver, setHandedOver] = useState<CampaignDraft | null>(null);
  const [fill, setFill] = useState(0);
  const [dirty, setDirty] = useState(false);
  const composerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hash = window.location.hash.replace(/^#/, '');
    if (hash === 'seasonal' || hash === 'calendar') {
      setActiveTab('calendar');
    }
  }, []);

  const applyDraft = useCallback(
    (draft: CampaignDraft, opts?: { skipConfirm?: boolean }) => {
      if (dirty && !opts?.skipConfirm && !window.confirm('You have unsaved changes in the current draft. Replace it?')) {
        return;
      }
      setHandedOver(draft);
      setFill((current) => current + 1);
      setActiveTab('create');
      requestAnimationFrame(() => {
        composerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    },
    [dirty],
  );

  useEffect(() => {
    const carried = takeCampaignDraft();
    if (carried) applyDraft(carried, { skipConfirm: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const initial = handedOver
    ? {
        channel: handedOver.channel,
        audience: handedOver.audience,
        subject: handedOver.subject,
        subjectOptions: handedOver.subjectOptions,
        body: handedOver.body,
        beatId: handedOver.beatId || undefined,
        templateName: handedOver.templateName,
        templateExplanation: handedOver.templateExplanation,
        sendTimeHint: handedOver.sendTimeHint,
      }
    : composer.initial;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* 4 Internal Views Sub-Nav */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.4rem',
          background: 'rgba(255, 255, 255, 0.04)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '10px',
          padding: '0.3rem',
          width: 'fit-content',
          flexWrap: 'wrap',
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTab('create')}
          style={{
            padding: '0.45rem 0.95rem',
            fontSize: '0.82rem',
            fontWeight: 700,
            borderRadius: '7px',
            background: activeTab === 'create' ? 'var(--accent, #f97316)' : 'transparent',
            color: activeTab === 'create' ? '#ffffff' : 'var(--muted)',
            border: 'none',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          ✍️ Create
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('calendar')}
          style={{
            padding: '0.45rem 0.95rem',
            fontSize: '0.82rem',
            fontWeight: 700,
            borderRadius: '7px',
            background: activeTab === 'calendar' ? 'var(--accent, #f97316)' : 'transparent',
            color: activeTab === 'calendar' ? '#ffffff' : 'var(--muted)',
            border: 'none',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          📅 Calendar
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('templates')}
          style={{
            padding: '0.45rem 0.95rem',
            fontSize: '0.82rem',
            fontWeight: 700,
            borderRadius: '7px',
            background: activeTab === 'templates' ? 'var(--accent, #f97316)' : 'transparent',
            color: activeTab === 'templates' ? '#ffffff' : 'var(--muted)',
            border: 'none',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          📋 Templates
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('sent')}
          style={{
            padding: '0.45rem 0.95rem',
            fontSize: '0.82rem',
            fontWeight: 700,
            borderRadius: '7px',
            background: activeTab === 'sent' ? 'var(--accent, #f97316)' : 'transparent',
            color: activeTab === 'sent' ? '#ffffff' : 'var(--muted)',
            border: 'none',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          📨 Sent ({campaigns.length})
        </button>
      </div>

      {/* 1. Create View */}
      {activeTab === 'create' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {hasRecipients && recommendations ? (
            <RecommendedCampaigns cards={recommendations.recommended} onSelect={applyDraft} />
          ) : null}

          <section className="panel workspace-section-card" id="new-campaign" ref={composerRef}>
            <div className="section-heading workspace-section-heading compact-heading">
              <div>
                <p className="eyebrow">Message Composer</p>
                <h2>New Campaign</h2>
              </div>
            </div>
            {hasRecipients ? (
              <CampaignComposer
                key={fill}
                {...composer}
                initial={initial}
                onDirtyChange={setDirty}
                emailTheme={emailTheme}
                websiteTemplate={websiteTemplate}
                businessName={businessName}
                accent={accent}
                logoUrl={logoUrl}
                onOpenEmailTemplateModal={onOpenEmailTemplateModal}
                allTemplates={recommendations?.all ?? []}
                onSelectDraft={applyDraft}
              />
            ) : (
              <p className="empty-state">
                No clients yet. Once you&apos;ve created jobs or taken leads, your customers show up here and you can
                reach them in a couple of taps. <Link href="/dashboard/clients">See your clients →</Link>
              </p>
            )}
          </section>
        </div>
      ) : null}

      {/* 2. Calendar View */}
      {activeTab === 'calendar' ? (
        <section className="panel workspace-section-card" id="seasonal">
          <div className="section-heading workspace-section-heading compact-heading">
            <div>
              <p className="eyebrow">Yearly Timeline</p>
              <h2>Seasonal Recommendations &amp; Send Dates</h2>
            </div>
          </div>
          <MarketingCalendar view={view} onUseDraft={hasRecipients ? applyDraft : undefined} />
        </section>
      ) : null}

      {/* 3. Templates View */}
      {activeTab === 'templates' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {hasRecipients && recommendations ? (
            <>
              <CampaignTemplateBrowser
                all={recommendations.all}
                onSelect={applyDraft}
              />
              <div className="workspace-scratch-row">
                <button type="button" className="btn ghost" onClick={() => applyDraft(BLANK_DRAFT)}>
                  Start from scratch
                </button>
              </div>
            </>
          ) : (
            <section className="panel workspace-section-card">
              <p className="empty-state">Add customers to unlock goal-based campaign templates.</p>
            </section>
          )}
        </div>
      ) : null}

      {/* 4. Sent View */}
      {activeTab === 'sent' ? (
        <div>
          {campaigns.length > 0 ? (
            <CampaignHistory campaigns={campaigns} onReuse={hasRecipients ? applyDraft : undefined} />
          ) : (
            <section className="panel workspace-section-card">
              <p className="empty-state">No sent campaigns yet. When you send emails or texts, full delivery and conversion stats appear here.</p>
            </section>
          )}
        </div>
      ) : null}
    </div>
  );
}
