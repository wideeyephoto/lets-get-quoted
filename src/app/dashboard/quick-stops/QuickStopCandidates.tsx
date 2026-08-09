import Link from 'next/link';
import {
  CANDIDATE_AI_NOTE,
  CANDIDATE_QUERY_LIMIT,
  quickStopRuleReference,
  type CandidateReport,
} from '@/lib/quick-stop-candidates';
import type { ScreeningSummary } from '@/lib/quick-stop-screenings';

// "Possibly eligible work" — the demand panel.
//
// Server-rendered on purpose: it's a read of history with no state to hold, and
// the screener already ran on the server.
//
// WHY THE WORDING IS THIS CAREFUL. This panel used to head itself as work that
// could have been a Quick Stop and close by calling the product "$2,500 of
// same-day fees on work you were already doing" — three assertions the data does
// not support. It did not establish that the customer would have paid a same-day
// fee, that they wanted one, or that the work was short (most of the rows had no
// recorded length at all). Every number below now says what it is: a count of rows that
// passed a deterministic screen, and that count multiplied by a fee the owner
// set. The arithmetic is printed so it can be checked, and the rows that can't
// be judged are shown next to the ones that can rather than folded in with them.

const SHOW = 6;

function money(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString('en-US')}`;
}

function dayLabel(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  return at.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function snippet(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > 116 ? `${clean.slice(0, 115)}…` : clean;
}

export default function QuickStopCandidates({
  report,
  screenings,
  windowDays,
  minFeeCents,
  maxVisitMinutes,
  enabled,
  reachable,
}: {
  report: CandidateReport;
  screenings: ScreeningSummary;
  windowDays: number;
  minFeeCents: number;
  maxVisitMinutes: number;
  enabled: boolean;
  /** Past customers who could actually be told, by email or text. */
  reachable: number;
}) {
  const rules = quickStopRuleReference();
  const count = report.eligible.length;
  const unknown = report.unknownLength.length;
  // Only the strict bucket is priced. Rows with no recorded length are real
  // work and are shown, but nothing about them says they fit in a gap in the
  // day, so multiplying them by a fee would be inventing the one fact the
  // figure depends on.
  //
  // The FLOOR, not a best case. An owner who is told what this "could have
  // earned" and then earns less has been sold something; one who is told the
  // minimum and beats it has been informed.
  const floorCents = minFeeCents > 0 ? count * minFeeCents : 0;

  // Said out loud, always. Whatever this panel drops has to be a number the
  // owner can see and argue with — a history that silently shrinks while
  // claiming to have read all of it is the failure this rewrite exists to fix.
  const leftOut: string[] = [];
  if (report.removed.duplicates > 0) {
    leftOut.push(
      report.removed.duplicates === 1
        ? '1 lead that had already become a job (one booking, one record)'
        : `${report.removed.duplicates} leads that had already become jobs (one booking, one record)`,
    );
  }
  if (report.removed.alreadyQuickStop > 0) {
    leftOut.push(
      report.removed.alreadyQuickStop === 1
        ? '1 job that was already booked as a Quick Stop, so it was taken rather than missed'
        : `${report.removed.alreadyQuickStop} jobs already booked as Quick Stops, so they were taken rather than missed`,
    );
  }
  if (report.removed.testData > 0) {
    leftOut.push(
      report.removed.testData === 1
        ? '1 record that looks like test data'
        : `${report.removed.testData} records that look like test data`,
    );
  }
  const leftOutNote = leftOut.length > 0 ? <p className="es-demand-more">Left out before counting: {leftOut.join('; ')}.</p> : null;

  if (report.screened === 0) {
    return (
      <section className="panel workspace-section-card es-demand" id="quick-stop-demand">
        <div className="section-heading workspace-section-heading compact-heading">
          <p className="eyebrow">Demand</p>
          <h2>Possibly eligible work</h2>
        </div>
        <p className="empty-state">
          Nothing in the last {windowDays} days to look at yet. As leads and jobs come in, the ones short enough to slot
          into a day will be listed here.
        </p>
        {leftOutNote}
      </section>
    );
  }

  return (
    <section className="panel workspace-section-card es-demand" id="quick-stop-demand">
      <div className="section-heading workspace-section-heading compact-heading">
        <p className="eyebrow">Demand</p>
        <h2>Possibly eligible work</h2>
      </div>

      <div className="es-demand-lede">
        <p className="es-demand-headline">
          {/* "the {screened} we read", not "your last 90 days". Both queries stop
              at {CANDIDATE_QUERY_LIMIT} rows, so on a busy account the old
              sentence described a quarter the panel had never seen. */}
          <strong>{count}</strong> of the {report.screened} leads and jobs this panel could read — your last {windowDays}{' '}
          days, capped at the {CANDIDATE_QUERY_LIMIT} most recent leads and {CANDIDATE_QUERY_LIMIT} most recent jobs —
          {count === 1 ? ' was' : ' were'} the right shape for a Quick Stop: nothing that rules work out, and a recorded
          length inside
          {/* Named here so the length on every card can be read against something.
              A green "About 240 min" looks like a bug until you know the limit
              is 300 — and if 300 is more than you meant, that's worth noticing. */}
          {' '}
          <Link href="#quick-stop-setup">your {maxVisitMinutes} min visit limit</Link>.
          {floorCents > 0 ? (
            <>
              {' '}
              At your {money(minFeeCents)} floor, {count} × {money(minFeeCents)} is <strong>{money(floorCents)}</strong> —
              the most these visits could have carried in Quick Stop fees if every one had been asked for and taken. It is
              a size, not money you lost: nothing here says any of these customers wanted a same-day visit or would have
              paid for one.
            </>
          ) : null}
        </p>
        {leftOutNote}
        {unknown > 0 ? (
          <p className="es-demand-more">
            {/* The contradiction this replaced: these rows printed "No length
                recorded" on the card while the headline above multiplied them
                by the floor fee. Nothing in the app writes estimated_hours
                automatically, so on most accounts this is the bigger pile. */}
            Another {unknown} passed every rule but {unknown === 1 ? 'has' : 'have'} no length recorded, so{' '}
            {unknown === 1 ? 'it is' : 'they are'} listed below and left out of both numbers. Put an estimate on a job and
            it moves into the count.
          </p>
        ) : null}
        {!enabled && count + unknown > 0 ? (
          <p className="es-demand-warn">
            Quick Stops are switched off, so none of these could have been offered. Turn it on above and the next one can.
          </p>
        ) : null}

        {/* The other half, and the harder number: people who actually asked.
            Until this was recorded, an empty queue could mean nobody asked OR
            everybody asked and was turned away — opposite problems. */}
        {screenings.available && screenings.asked > 0 ? (
          <div className="es-demand-asked">
            <p>
              <strong>{screenings.asked}</strong> {screenings.asked === 1 ? 'person' : 'people'} actually asked through
              your booking page in this window.{' '}
              {screenings.turnedAway > 0 ? (
                <>
                  <strong>{screenings.turnedAway}</strong> {screenings.turnedAway === 1 ? 'was' : 'were'} turned away
                  {screenings.unsafe > 0 ? `, ${screenings.unsafe} of them sent to emergency help instead` : ''}.
                </>
              ) : (
                <>Every one of them got an offer.</>
              )}
            </p>
            {screenings.reasons.length > 0 ? (
              <div className="es-demand-chips">
                {screenings.reasons.slice(0, 4).map((reason) => (
                  <span className="es-demand-chip" key={reason.label}>
                    {reason.label} <b>{reason.count}</b>
                  </span>
                ))}
              </div>
            ) : null}
            {screenings.examples.length > 0 ? (
              <ul className="es-demand-asked-list">
                {screenings.examples.map((example, index) => (
                  <li key={`${example.at}-${index}`}>
                    <span>&ldquo;{snippet(example.issue)}&rdquo;</span>
                    <em>{example.label}</em>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="es-demand-cols">
        <div className="es-demand-col">
          <h3 className="es-demand-col-head is-yes">
            <span aria-hidden="true">✓</span> Possibly eligible
          </h3>
          {report.eligible.length === 0 ? (
            <p className="es-demand-none">
              Nothing in this window passed the screen with a length on it. That&rsquo;s a real answer, not a broken
              panel — some trades genuinely don&rsquo;t produce short single-visit work, and some accounts simply
              don&rsquo;t record how long a job took.
            </p>
          ) : (
            <ul className="es-demand-list">
              {report.eligible.slice(0, SHOW).map((item) => (
                <li key={`${item.source}-${item.id}`}>
                  <Link href={item.href} className="es-demand-item">
                    <span className="es-demand-item-top">
                      <strong>{item.clientName}</strong>
                      <span className="es-demand-meta">
                        {item.label} · {dayLabel(item.createdAt)}
                      </span>
                    </span>
                    <span className="es-demand-text">{snippet(item.text)}</span>
                    <span className="es-demand-tag is-yes">{item.lengthNote}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {report.eligible.length > SHOW ? (
            <p className="es-demand-more">+ {report.eligible.length - SHOW} more like these</p>
          ) : null}
        </div>

        {/* The third column, and on most accounts the longest one. It gets the
            same muted treatment as "wouldn't have" rather than the green, because
            "we don't know" is not a yes — but it is listed, and listed HERE
            rather than in a footnote, because these are the owner's real jobs and
            the fix for them is one field away. */}
        <div className="es-demand-col">
          <h3 className="es-demand-col-head is-no">
            <span aria-hidden="true">?</span> No length recorded
          </h3>
          {report.unknownLength.length === 0 ? (
            <p className="es-demand-none">Everything that passed the rules had a length on it.</p>
          ) : (
            <ul className="es-demand-list">
              {report.unknownLength.slice(0, SHOW).map((item) => (
                <li key={`${item.source}-${item.id}`}>
                  <Link href={item.href} className="es-demand-item">
                    <span className="es-demand-item-top">
                      <strong>{item.clientName}</strong>
                      <span className="es-demand-meta">
                        {item.label} · {dayLabel(item.createdAt)}
                      </span>
                    </span>
                    <span className="es-demand-text">{snippet(item.text)}</span>
                    <span className="es-demand-tag is-no">{item.lengthNote}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {report.unknownLength.length > SHOW ? (
            <p className="es-demand-more">+ {report.unknownLength.length - SHOW} more with no length</p>
          ) : null}
        </div>

        <div className="es-demand-col">
          <h3 className="es-demand-col-head is-no">
            <span aria-hidden="true">✕</span> Wouldn&rsquo;t have
          </h3>
          {report.excluded.length === 0 ? (
            <p className="es-demand-none">Nothing in this window was ruled out.</p>
          ) : (
            <ul className="es-demand-list">
              {report.excluded.slice(0, SHOW).map((item) => (
                <li key={`${item.source}-${item.id}`}>
                  <Link href={item.href} className="es-demand-item">
                    <span className="es-demand-item-top">
                      <strong>{item.clientName}</strong>
                      <span className="es-demand-meta">
                        {item.label} · {dayLabel(item.createdAt)}
                      </span>
                    </span>
                    <span className="es-demand-text">{snippet(item.text)}</span>
                    <span className={`es-demand-tag ${item.unsafe ? 'is-unsafe' : 'is-no'}`}>
                      {item.blockedBy.join(' · ')}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {report.excluded.length > SHOW ? (
            <p className="es-demand-more">+ {report.excluded.length - SHOW} more ruled out</p>
          ) : null}
        </div>
      </div>

      {report.topReasons.length > 0 ? (
        <div className="es-demand-reasons">
          <span className="es-demand-reasons-label">Most common reason work doesn&rsquo;t qualify</span>
          <div className="es-demand-chips">
            {report.topReasons.slice(0, 5).map((reason) => (
              <span className="es-demand-chip" key={reason.label}>
                {reason.label} <b>{reason.count}</b>
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {/* The gap this panel keeps pointing at is distribution, not the feature.
          The demand is in the account's own history; what's missing is that
          nobody has been told. Handing the draft to the campaign composer keeps
          the sending logic in one place — this page only knows WHY. */}
      {enabled && reachable > 0 ? (
        <div className="es-demand-tell">
          <div>
            <strong>Nobody knows you offer this</strong>
            <p>
              It&rsquo;s on your booking page and nowhere else, so the only people who find it are the ones already
              filling in a form. You have <strong>{reachable}</strong> past customer{reachable === 1 ? '' : 's'} you can
              reach by email or text — the people who already know whether they liked your work.
            </p>
          </div>
          {/* `extra-stop` is the value the composer actually reads. This link
              said `quick-stop`, which matched nothing, so the button that exists
              to hand over a written pitch opened an empty box. */}
          <Link href="/dashboard/marketing/campaigns?draft=extra-stop#new-campaign" className="btn primary">
            Write them about it →
          </Link>
        </div>
      ) : null}

      <details className="es-demand-rules">
        <summary>What never qualifies, and why</summary>
        <div className="es-demand-rules-body">
          <div>
            <h4>Never — the customer gets safety instructions instead of a price</h4>
            <p>
              These aren&rsquo;t &ldquo;not a fit&rdquo;. They&rsquo;re work nobody should be booking through a form, so
              the booking page stops and tells them what to do instead.
            </p>
            <ul>
              {rules.unsafe.map((label) => (
                <li key={label}>{label}</li>
              ))}
            </ul>
          </div>
          <div>
            <h4>Not a short visit — offered a normal booking instead</h4>
            <p>Real work, just not something that slots into a gap between two other stops.</p>
            <ul>
              {rules.outOfScope.map((label) => (
                <li key={label}>{label}</li>
              ))}
              <li>Anything you&rsquo;ve estimated at over {maxVisitMinutes} minutes</li>
            </ul>
          </div>
        </div>
      </details>

      <p className="es-demand-note">
        {CANDIDATE_AI_NOTE}
        {report.unjudged > 0 ? (
          <>
            {' '}
            {report.unjudged} {report.unjudged === 1 ? 'record had' : 'records had'} nothing written down to judge, so
            {report.unjudged === 1 ? " it isn't" : " they aren't"} counted either way.
          </>
        ) : null}
      </p>
    </section>
  );
}
