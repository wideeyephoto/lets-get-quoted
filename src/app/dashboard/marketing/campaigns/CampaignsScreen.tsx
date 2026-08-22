import Link from 'next/link';
import { AUDIENCE_DEFS, type CampaignAudience, type Reach } from '@/lib/campaigns';
import type { CalendarView } from '@/lib/marketing-calendar-data';
import MarketingNav from '../MarketingNav';
import CampaignWorkspace from './CampaignWorkspace';

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
  daysSinceLastSend: number | null;
  unsubscribesSinceLastSend: number;
  draft?: Parameters<typeof CampaignWorkspace>[0]['composer']['initial'];
  searchParams: { emailSent?: string; smsQueued?: string; recipients?: string; skipped?: string; failed?: string; test?: string; draft?: string };
  basePath?: string;
  /** See MarketingNav — the demo lists only the sections it has built. */
  navOnly?: string[];
};

export default function CampaignsScreen({
  campaigns,
  hasRecipients,
  recommendations,
  view,
  reach,
  mailingAddress,
  daysSinceLastSend,
  unsubscribesSinceLastSend,
  draft,
  searchParams,
  basePath = '/dashboard',
  navOnly,
}: Props) {
  const emailSent = searchParams.emailSent ? Number(searchParams.emailSent) : 0;
  const smsQueued = searchParams.smsQueued ? Number(searchParams.smsQueued) : 0;
  const hasOutcome = searchParams.emailSent !== undefined || searchParams.smsQueued !== undefined;

  return (
    <main className="wide-shell workspace-shell">
      <MarketingNav basePath={basePath} only={navOnly} />

      <section className="workspace-header-compact">
        <h1 className="workspace-title">Campaigns</h1>
        <p className="workspace-lead">Stay in touch with customers and keep your schedule full.</p>
      </section>

      {searchParams.test === '1' ? (
        <section className="panel workspace-section-card flash-banner flash-info">
          <p>Test email sent to your inbox. Take a look, then send the real thing when it&apos;s ready.</p>
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

      {!mailingAddress ? (
        <section className="panel workspace-section-card flash-banner flash-warn">
          <p>
            Marketing email needs a physical postal address by law, and you don&apos;t have one on file — anything
            you write here can&apos;t be emailed until you add it.{' '}
            <Link href={`${basePath}/settings`}>Add your mailing address →</Link>
          </p>
        </section>
      ) : null}

      <CampaignWorkspace
        campaigns={campaigns}
        hasRecipients={hasRecipients}
        recommendations={recommendations}
        view={view}
        composer={{
          audiences: AUDIENCE_DEFS,
          reach,
          initial: draft,
          mailingAddress,
          daysSinceLastSend,
          unsubscribesSinceLastSend,
        }}
      />
    </main>
  );
}
