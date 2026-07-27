import Link from 'next/link';
import { formatMoney, type Job } from '@/lib/jobs';
import { formatPhoneDashes } from '@/lib/phone';
import { DEMO_JOBS } from '@/lib/demo-data';

export const dynamic = 'force-dynamic';

// Demo-only mapping: turn a finished lawn & landscape job into the natural
// next service to pitch, with a rough ticket value. Kept inline here so the
// shared demo dataset (src/lib/demo-data.ts) stays untouched.
type Suggestion = { service: string; value: number };

const REBOOK_SUGGESTIONS: { match: RegExp; suggestion: Suggestion }[] = [
  { match: /paver patio|patio/i, suggestion: { service: 'Seasonal bed maintenance & paver re-sanding', value: 1250 } },
  { match: /landscape design|landscape install|plantings/i, suggestion: { service: 'Spring cleanup & mulch refresh', value: 1450 } },
  { match: /retaining wall/i, suggestion: { service: 'Bed edging & drainage tune-up', value: 980 } },
  { match: /sod|new lawn|hydroseed/i, suggestion: { service: 'Fall aeration & overseeding', value: 650 } },
  { match: /irrigation/i, suggestion: { service: 'Irrigation winterization & spring start-up', value: 420 } },
  { match: /tree|shrub/i, suggestion: { service: 'Pruning & seasonal bed maintenance', value: 780 } },
  { match: /drain|regrade|drainage/i, suggestion: { service: 'Spring cleanup & drainage inspection', value: 560 } },
  { match: /lighting/i, suggestion: { service: 'Lighting tune-up & seasonal bulb refresh', value: 340 } },
];

const DEFAULT_SUGGESTION: Suggestion = { service: 'Seasonal cleanup & lawn health package', value: 500 };

function suggestNext(scope: string | null): Suggestion {
  if (!scope) return DEFAULT_SUGGESTION;
  return REBOOK_SUGGESTIONS.find((entry) => entry.match.test(scope))?.suggestion ?? DEFAULT_SUGGESTION;
}

// Shorten the job scope into a plain past-service label for the card.
function pastServiceLabel(scope: string | null): string {
  if (!scope) return 'Past project';
  const firstClause = scope.split(/[—(.]/)[0].trim();
  return firstClause || scope;
}

function completionDate(job: Job): string {
  return job.scheduled_for ?? job.created_at;
}

function daysSince(value: string): number {
  const then = new Date(value).getTime();
  return Math.max(0, Math.round((Date.now() - then) / 86_400_000));
}

function agoLabel(days: number): string {
  if (days < 45) return `${days} days ago`;
  const months = Math.round(days / 30);
  if (months < 18) return `${months} months ago`;
  return `${(days / 365).toFixed(1)} years ago`;
}

function shortDate(value: string): string {
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function DemoRebookPage() {
  const candidates = DEMO_JOBS
    .filter((job) => job.status === 'complete')
    .map((job) => {
      const completedAt = completionDate(job);
      const suggestion = suggestNext(job.scope);
      return {
        job,
        completedAt,
        days: daysSince(completedAt),
        pastService: pastServiceLabel(job.scope),
        suggestion,
      };
    })
    .sort((a, b) => b.days - a.days);

  const pipelineValue = candidates.reduce((sum, c) => sum + c.suggestion.value, 0);

  return (
    <main className="wide-shell workspace-shell">
      <section className="workspace-hero panel">
        <div className="workspace-hero-copy">
          <p className="eyebrow">Book again</p>
          <h1 className="workspace-title">Win back past customers</h1>
          <p className="workspace-lead">
            These are customers you&apos;ve worked with before who haven&apos;t booked in a while. Send them your booking
            link in a tap — texting opted-in mobiles, emailing the rest — and turn a finished job into the next one.
          </p>
        </div>
      </section>

      <div className="stat-ticker panel">
        <div className="stat-ticker-item">
          <span className="stat-ticker-value">{candidates.length}</span>
          <span className="stat-ticker-label">Due to rebook</span>
        </div>
        <div className="stat-ticker-item">
          <span className="stat-ticker-value">{formatMoney(pipelineValue)}</span>
          <span className="stat-ticker-label">Estimated rebook value</span>
        </div>
      </div>

      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading compact-heading rebook-heading">
          <p className="eyebrow">Due to rebook · finished jobs worth a follow-up</p>
        </div>

        <div className="rebook-list">
          {candidates.map(({ job, completedAt, days, pastService, suggestion }) => (
            <div key={job.id} className="rebook-row">
              <div className="rebook-row-main">
                <div className="rebook-row-head">
                  <span className="rebook-name">{job.client_name}</span>
                  <span className="rebook-ago">Last job {agoLabel(days)}</span>
                </div>
                <p className="rebook-row-meta">
                  {pastService} · {formatMoney(job.quoted_amount)}
                  {job.client_phone ? ` · 📱 ${formatPhoneDashes(job.client_phone)}` : ''}
                  {` · completed ${shortDate(completedAt)}`}
                </p>
                <p className="rebook-row-meta">
                  Suggested next: <strong>{suggestion.service}</strong> · est. {formatMoney(suggestion.value)}
                </p>
              </div>
              <div className="rebook-row-actions">
                <button type="button" className="btn secondary" disabled>
                  Send booking link
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="panel workspace-section-card demo-locked-card">
        <div className="section-heading workspace-section-heading">
          <p className="eyebrow">Try it yourself</p>
          <h2>Send booking links in one tap</h2>
        </div>
        <p className="workspace-card-copy">
          Once you&apos;re signed in, one tap texts opted-in mobiles and emails the rest your live booking link —
          turning finished jobs into repeat work. This demo account is read-only.
        </p>
        <Link href="/login" className="btn primary">
          Create free account
        </Link>
      </section>
    </main>
  );
}
