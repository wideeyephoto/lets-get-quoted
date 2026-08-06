import Link from 'next/link';
import ActionIcon from '@/components/action-icon';
import StartCampaignButton from './StartCampaignButton';
import type { Opportunity } from '@/lib/insights-metrics';
import type { CampaignDraft } from '@/lib/marketing-draft-data';

// The "do this next" list, ranked by money at stake (the engine sorts it). Every
// row is a real signal with a real count behind it — never a permanent checklist
// that reads as advice whether or not it applies — and every row links to the
// records it's about, so it can be acted on without leaving to go hunt. The one
// exception is the fill-schedule row, whose CTA opens the campaign composer with
// a server-built draft instead of navigating; it shares the exact draft the
// Schedule Utilization card uses, so the two can't drift. Server-only apart from
// that one button island.

const PRIORITY_LABEL: Record<Opportunity['priority'], string> = {
  high: 'Do first',
  medium: 'Worth doing',
  low: 'When you can',
};

export default function TopOpportunities({
  opportunities,
  fillDraft,
  basePath = '/dashboard',
  readOnly = false,
}: {
  opportunities: Opportunity[];
  fillDraft: CampaignDraft;
  basePath?: string;
  /** The demo has no campaign to start, so the row links instead. */
  readOnly?: boolean;
}) {
  // Opportunity hrefs are built in insights-metrics against /dashboard, which is
  // right for the app and wrong inside the demo. Re-pointing them here keeps the
  // metric library free of any knowledge that a demo exists.
  const href = (target: string) =>
    basePath === '/dashboard' ? target : target.replace(/^\/dashboard\/marketing\/campaigns/, `${basePath}/campaigns`).replace(/^\/dashboard/, basePath);
  return (
    <section className="panel ins-card ins-opps-card">
      <p className="ins-card-head">
        <span className="ins-chip is-opp" aria-hidden="true">◎</span> Top opportunities
        <span className="ins-card-sub">ranked by money at stake</span>
      </p>

      {opportunities.length === 0 ? (
        <p className="ins-empty-note">
          Nothing needs chasing right now — no unpaid invoices, no open quotes, no gaps in the schedule. When
          something does, the highest-value move to make shows up here.
        </p>
      ) : (
        <ul className="ins-opps">
          {opportunities.map((opp) => (
            <li className="ins-opp" key={opp.id}>
              <span className={`ins-opp-icon is-${opp.priority}`} aria-hidden="true">
                <ActionIcon name={opp.icon} />
              </span>
              <div className="ins-opp-body">
                <div className="ins-opp-titlerow">
                  <strong className="ins-opp-title">{opp.title}</strong>
                  <span className={`ins-opp-pri is-${opp.priority}`}>{PRIORITY_LABEL[opp.priority]}</span>
                </div>
                <span className="ins-opp-detail">{opp.detail}</span>
              </div>
              {opp.campaign === 'fill-schedule' && !readOnly ? (
                <StartCampaignButton
                  draft={fillDraft}
                  className="ins-opp-cta"
                  ariaLabel="Start a schedule-filler campaign to past customers"
                >
                  {opp.cta} →
                </StartCampaignButton>
              ) : (
                <Link className="ins-opp-cta" href={opp.campaign === 'fill-schedule' ? `${basePath}/campaigns` : href(opp.href)}>
                  {opp.cta} →
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
