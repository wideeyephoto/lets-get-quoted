import Link from 'next/link';
import { AUDIENCE_DEFS, type Campaign, type CampaignAudience } from '@/lib/campaigns';

export const dynamic = 'force-dynamic';

// Fictional showcase data for "Evergreen Lawn & Landscape". Extends the real
// Campaign shape with the open/click metrics a real inbox report would show, so
// this read-only page mirrors the live /dashboard/campaigns history exactly.
type DemoCampaign = Campaign & { opened: number; clicked: number };

const DEMO_ACCOUNT = 'demo-evergreen';

function demoCampaign(
  overrides: Partial<DemoCampaign> & {
    id: string;
    channel: Campaign['channel'];
    audience: CampaignAudience;
    subject: string | null;
    body: string;
    recipient_count: number;
    created_at: string;
  },
): DemoCampaign {
  return {
    account_id: DEMO_ACCOUNT,
    email_sent: 0,
    sms_sent: 0,
    failed_count: 0,
    skipped_count: 0,
    opened: 0,
    clicked: 0,
    ...overrides,
  };
}

const DEMO_CAMPAIGNS: DemoCampaign[] = [
  demoCampaign({
    id: 'camp-refer',
    channel: 'email',
    audience: 'repeat',
    subject: 'Refer a neighbor, get $25 off',
    body: "Hi {name}, love how your yard's looking? Send a neighbor our way and we'll take $25 off your next mow — and give them 10% off their first visit.",
    recipient_count: 96,
    email_sent: 96,
    opened: 71,
    clicked: 22,
    created_at: '2026-07-14T14:05:00.000Z',
  }),
  demoCampaign({
    id: 'camp-mowing',
    channel: 'both',
    audience: 'past',
    subject: 'Reserve your weekly mowing spot',
    body: "Hi {name}, our weekly mowing routes for the season are filling fast. Reply to lock in your regular day before the calendar closes.",
    recipient_count: 188,
    email_sent: 172,
    sms_sent: 74,
    opened: 121,
    clicked: 39,
    skipped_count: 16,
    created_at: '2026-06-30T13:30:00.000Z',
  }),
  demoCampaign({
    id: 'camp-spring',
    channel: 'email',
    audience: 'past',
    subject: 'Spring cleanup is booking now',
    body: "Hi {name}, winter's over and the beds need it. We're booking spring cleanups — dethatching, edging, and a fresh mulch refresh. Grab a slot before the rush.",
    recipient_count: 240,
    email_sent: 240,
    opened: 146,
    clicked: 58,
    created_at: '2026-03-18T15:10:00.000Z',
  }),
  demoCampaign({
    id: 'camp-fall',
    channel: 'both',
    audience: 'lapsed',
    subject: 'Time for fall aeration & overseeding',
    body: "Hi {name}, it's been a while! Fall is the best time to aerate and overseed for a thicker lawn next spring. We'd love to get you back on the schedule.",
    recipient_count: 64,
    email_sent: 58,
    sms_sent: 21,
    opened: 33,
    clicked: 11,
    skipped_count: 6,
    failed_count: 1,
    created_at: '2026-05-22T16:45:00.000Z',
  }),
];

// Fictional reach per audience for the segment summary — how many reachable
// customers each segment would target on the next send.
const DEMO_REACH: Record<CampaignAudience, number> = {
  past: 240,
  repeat: 96,
  lapsed: 64,
  all: 312,
};

const CHANNEL_LABEL: Record<string, string> = { email: 'Email', sms: 'Text', both: 'Email + text' };

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function audienceLabel(id: string): string {
  return AUDIENCE_DEFS.find((audience) => audience.id === id)?.label ?? id;
}

function campaignSent(campaign: DemoCampaign): number {
  return campaign.email_sent + campaign.sms_sent;
}

function pct(part: number, whole: number): string {
  if (whole <= 0) return '0%';
  return `${Math.round((part / whole) * 100)}%`;
}

export default function DemoCampaignsPage() {
  const campaigns = DEMO_CAMPAIGNS;
  const totalSent = campaigns.reduce((sum, campaign) => sum + campaignSent(campaign), 0);
  const totalOpened = campaigns.reduce((sum, campaign) => sum + campaign.opened, 0);
  const totalClicked = campaigns.reduce((sum, campaign) => sum + campaign.clicked, 0);

  return (
    <main className="wide-shell workspace-shell">
      <section className="workspace-hero panel">
        <div className="workspace-hero-copy">
          <p className="eyebrow">Marketing</p>
          <h1 className="workspace-title">Reach past customers</h1>
          <p className="workspace-lead">
            Send a one-off email or text to the customers you&apos;ve already worked with — a seasonal offer, a
            &quot;we&apos;re booking again&quot; note, or a nudge to lapsed regulars. Texts go only to customers who opted in.
          </p>
        </div>
      </section>

      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading compact-heading">
          <p className="eyebrow">Your audience</p>
          <h2>Who you can reach</h2>
        </div>
        <div className="stat-ticker">
          {AUDIENCE_DEFS.map((audience) => (
            <div className="stat-ticker-item" key={audience.id}>
              <span className="stat-ticker-value">{DEMO_REACH[audience.id]}</span>
              <span className="stat-ticker-label">{audience.label}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="stat-ticker panel">
        <div className="stat-ticker-item">
          <span className="stat-ticker-value">{campaigns.length}</span>
          <span className="stat-ticker-label">Campaigns sent</span>
        </div>
        <div className="stat-ticker-item">
          <span className="stat-ticker-value">{totalSent}</span>
          <span className="stat-ticker-label">Messages delivered</span>
        </div>
        <div className="stat-ticker-item">
          <span className="stat-ticker-value">{pct(totalOpened, totalSent)}</span>
          <span className="stat-ticker-label">Avg opened</span>
        </div>
        <div className="stat-ticker-item">
          <span className="stat-ticker-value">{pct(totalClicked, totalSent)}</span>
          <span className="stat-ticker-label">Avg clicked</span>
        </div>
      </div>

      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading compact-heading">
          <p className="eyebrow">History</p>
          <h2>Past sends</h2>
        </div>
        <div className="campaign-history">
          {campaigns.map((campaign) => {
            const sent = campaignSent(campaign);
            return (
              <div key={campaign.id} className="campaign-history-row">
                <div className="campaign-history-main">
                  <strong>{campaign.subject || campaign.body.slice(0, 80)}</strong>
                  <span className="campaign-history-meta">
                    {CHANNEL_LABEL[campaign.channel] ?? campaign.channel} · {audienceLabel(campaign.audience)} · {formatDate(campaign.created_at)}
                  </span>
                </div>
                <div className="campaign-history-stats">
                  <span className="campaign-stat"><strong>{sent}</strong> sent</span>
                  <span className="muted">{campaign.opened} opened ({pct(campaign.opened, sent)})</span>
                  <span className="muted">{campaign.clicked} clicked ({pct(campaign.clicked, sent)})</span>
                  {campaign.email_sent > 0 && campaign.sms_sent > 0 ? (
                    <span className="muted">{campaign.email_sent} email · {campaign.sms_sent} text</span>
                  ) : null}
                  {campaign.skipped_count > 0 ? <span className="muted">{campaign.skipped_count} skipped</span> : null}
                  {campaign.failed_count > 0 ? <span className="campaign-stat-fail">{campaign.failed_count} failed</span> : null}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Mirrors the real Marketing page, where winning back a past customer is
          a section here rather than its own rail destination. */}
      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading compact-heading">
          <p className="eyebrow">Book again</p>
        </div>
        <p className="workspace-card-copy">
          Past customers who have gone a season without booking. They already know whether they liked
          the work, which makes them the cheapest send on this page.
        </p>
        <div className="marketing-actions">
          <Link href="/demo/rebook" className="btn secondary">Who&rsquo;s due to rebook</Link>
        </div>
      </section>

      <section className="panel workspace-section-card demo-locked-card">
        <div className="section-heading workspace-section-heading">
          <p className="eyebrow">Try it yourself</p>
          <h2>+ New campaign</h2>
        </div>
        <p className="workspace-card-copy">
          Pick a segment, write your message once, and send an email or text to every past customer at
          once — with opens and clicks tracked automatically. This demo account is read-only.
        </p>
        <Link href="/login" className="btn primary">
          Create free account
        </Link>
      </section>
    </main>
  );
}
