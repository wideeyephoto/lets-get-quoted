'use client';

import { useState } from 'react';
import { AUDIENCE_DEFS, type CampaignAudience, type Reach } from '@/lib/campaign-audiences';
import type { CalendarView } from '@/lib/marketing-calendar-data';
import { EMAIL_THEMES, normalizeEmailTheme, type EmailThemeId } from '@/emails/brand';
import MarketingNav from '../MarketingNav';
import CampaignWorkspace from './CampaignWorkspace';
import EmailTemplatePickerModal from './EmailTemplatePickerModal';

/**
 * The Campaigns screen, given its data.
 *
 * Split out of page.tsx for the same reason InsightsScreen was: the logged-out
 * demo renders THIS, not a copy of it. Before this, /demo/campaigns was a
 * 235-line hand-drawn page with no marketing nav at all — so a prospect could
 * not see that Marketing has four sections, and the recommended-starters
 * redesign never reached them.
 */

type Props = {
  campaigns: Parameters<typeof CampaignWorkspace>[0]['campaigns'];
  hasRecipients: boolean;
  recommendations: Parameters<typeof CampaignWorkspace>[0]['recommendations'];
  view: CalendarView;
  reach: Record<CampaignAudience, Reach>;
  mailingAddress: string | null;
  replyEmailReady?: boolean;
  customerTextingReady?: boolean;
  daysSinceLastSend: number | null;
  unsubscribesSinceLastSend: number;
  availableEmailCredits?: number | null;
  availableSmsCredits?: number | null;
  draft?: Parameters<typeof CampaignWorkspace>[0]['composer']['initial'];
  searchParams: {
    emailSent?: string;
    smsQueued?: string;
    recipients?: string;
    skipped?: string;
    failed?: string;
    test?: string;
    draft?: string;
    tab?: string;
    channel?: string;
  };
  basePath?: string;
  /** See MarketingNav — the demo lists only the sections it has built. */
  navOnly?: string[];
  emailTheme?: string | null;
  websiteTemplate?: string | null;
  businessName?: string;
  accent?: string | null;
  logoUrl?: string | null;
};

export default function CampaignsScreen({
  campaigns,
  hasRecipients,
  recommendations,
  view,
  reach,
  mailingAddress,
  replyEmailReady = true,
  customerTextingReady = true,
  daysSinceLastSend,
  unsubscribesSinceLastSend,
  availableEmailCredits,
  availableSmsCredits,
  draft,
  searchParams,
  basePath = '/dashboard',
  navOnly,
  emailTheme: initialEmailTheme,
  websiteTemplate,
  businessName,
  accent,
  logoUrl,
}: Props) {
  const [currentEmailTheme, setCurrentEmailTheme] = useState<EmailThemeId>(() =>
    normalizeEmailTheme(initialEmailTheme)
  );
  const [isEmailTemplateModalOpen, setIsEmailTemplateModalOpen] = useState(false);

  const emailSent = searchParams.emailSent ? Number(searchParams.emailSent) : 0;
  const smsQueued = searchParams.smsQueued ? Number(searchParams.smsQueued) : 0;
  const hasOutcome = searchParams.emailSent !== undefined || searchParams.smsQueued !== undefined;

  return (
    <main className="wide-shell workspace-shell">
      <MarketingNav basePath={basePath} only={navOnly} />

      <section className="workspace-header-compact">
        <p className="eyebrow">Direct Messaging</p>
        <h1 className="workspace-title">Email &amp; Text</h1>
        <p className="workspace-lead">Stay in touch with customers, fill schedule gaps, and win back past quotes.</p>
      </section>

      {searchParams.test === '1' ? (
        <section
          className="panel workspace-section-card flash-banner flash-info"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.75rem',
          }}
        >
          <p style={{ margin: 0 }}>Test email sent to your inbox. Take a look, then send the real thing when it&apos;s ready.</p>
          <button
            type="button"
            className="btn ghost"
            style={{
              fontSize: '0.82rem',
              padding: '0.35rem 0.75rem',
              background: 'rgba(255, 255, 255, 0.08)',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
            }}
            onClick={() => setIsEmailTemplateModalOpen(true)}
          >
            <span>🎨</span>
            <span>Change email template ({EMAIL_THEMES.find((t) => t.id === currentEmailTheme)?.name || 'Studio'})</span>
          </button>
        </section>
      ) : null}

      {hasOutcome ? (
        <section className="panel workspace-section-card flash-banner flash-success">
          <p>
            Campaign accepted across {searchParams.recipients ?? 0}{' '}
            {Number(searchParams.recipients) === 1 ? 'customer' : 'customers'}: <strong>{emailSent}</strong>{' '}
            {emailSent === 1 ? 'email sent' : 'emails sent'} and <strong>{smsQueued}</strong>{' '}
            {smsQueued === 1 ? 'text queued' : 'texts queued'}.
            {Number(searchParams.skipped) > 0 ? ` ${searchParams.skipped} skipped (not reachable).` : ''}
            {Number(searchParams.failed) > 0 ? ` ${searchParams.failed} failed before acceptance.` : ''}
          </p>
        </section>
      ) : null}

      <CampaignWorkspace
        campaigns={campaigns}
        hasRecipients={hasRecipients}
        recommendations={recommendations}
        view={view}
        initialTab={searchParams.tab as any}
        emailTheme={currentEmailTheme}
        websiteTemplate={websiteTemplate}
        businessName={businessName}
        accent={accent}
        logoUrl={logoUrl}
        onOpenEmailTemplateModal={() => setIsEmailTemplateModalOpen(true)}
        composer={{
          audiences: AUDIENCE_DEFS,
          reach,
          initial: draft,
          mailingAddress,
          replyEmailReady,
          customerTextingReady,
          daysSinceLastSend,
          unsubscribesSinceLastSend,
          availableEmailCredits,
          availableSmsCredits,
        }}
      />

      <EmailTemplatePickerModal
        isOpen={isEmailTemplateModalOpen}
        onClose={() => setIsEmailTemplateModalOpen(false)}
        currentTheme={currentEmailTheme}
        websiteTemplate={websiteTemplate}
        businessName={businessName}
        accent={accent}
        logoUrl={logoUrl}
        onThemeSaved={(newTheme) => setCurrentEmailTheme(newTheme)}
      />
    </main>
  );
}
