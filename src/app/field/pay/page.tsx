import Link from 'next/link';
import { createAdminClient } from '@/lib/auth';
import { formatKeyDay } from '@/lib/crew-pay';
import { requireCrewContext } from '@/lib/crew-auth';
import { loadMyPay } from '@/lib/my-pay-data';
import { checkSentence, hoursLabel, methodLabel, money, type MyPayLine } from '@/lib/my-pay';
import { getOpenShift } from '@/lib/time-clock-data';
import FieldHeader from '../FieldHeader';
import FieldFooter from '../FieldFooter';

// What a crew member has coming, and whether it's right.
//
// Read-only on purpose. Nothing here lets somebody edit their own hours — the
// entries are logged from the job page, where the work is, and changing them
// after an approval is the owner's call. This screen exists so a disagreement
// happens on Wednesday over a shift somebody can still remember, rather than on
// payday against a number that's already been paid.

export const dynamic = 'force-dynamic';

function dayLabel(iso: string): string {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function EntryRow({ line, note, showMoney }: { line: MyPayLine; note?: string; showMoney: boolean }) {
  return (
    <li className="mypay-entry">
      <div className="mypay-entry-main">
        <strong>{line.description || 'Labor'}</strong>
        <span className="mypay-entry-when">{dayLabel(line.loggedAt)}</span>
        {note ? <span className="mypay-entry-note">{note}</span> : null}
      </div>
      <div className="mypay-entry-figures">
        <strong>{hoursLabel(line.hours)}</strong>
        {/* Only hourly staff are paid per entry. Putting a figure on each line
            for a salaried or day-rate person invites adding them up, and the
            total would not be what they're paid — it would be the cost their
            time put on those jobs, which is a different question entirely. */}
        {showMoney ? <span>{line.rate > 0 ? money(line.amount) : 'No rate'}</span> : null}
      </div>
    </li>
  );
}

export default async function MyPayPage() {
  const { supabase, accountId, crew, businessName, businesses, logoUrl, navLogoTop } = await requireCrewContext();
  const admin = createAdminClient();

  const [view, openShift] = await Promise.all([
    loadMyPay(supabase, admin, accountId, crew),
    getOpenShift(supabase, accountId, crew.id),
  ]);

  const { standing, check, logged, approved, history, payDay } = view;
  const problem = checkSentence(check);
  // Once an approval exists it is the thing being paid, so it is the thing to
  // show. Before that, the live entries are all there is.
  const showing = approved.length > 0 ? approved : logged;
  // The flag card above names what moved; this marks it again in the row where
  // it's read, so somebody scanning the list doesn't have to hold the warning
  // in their head while they look for the line it was about.
  const noteFor = new Map<string, string>();
  for (const { approved: line, nowHours } of check.adjusted) {
    if (line.costId) noteFor.set(line.costId, `Now logged as ${hoursLabel(nowHours)}`);
  }
  for (const line of check.removed) {
    if (line.costId) noteFor.set(line.costId, 'The entry behind this is gone');
  }

  return (
    <>
      <FieldHeader
        businessName={businessName}
        crewName={crew.name}
        backHref="/field"
        switchable={businesses.length > 1}
        logoUrl={logoUrl}
        navLogoTop={navLogoTop}
      />
      <main className="field-main">
        <h1 className="field-greeting">My pay</h1>

        <section className={`mypay-standing tone-${standing.tone}`}>
          <span className="mypay-stage">{view.period.rangeLabel}</span>
          <strong className="mypay-amount">{standing.headline}</strong>
          <p className="mypay-detail">{standing.detail}</p>
          <p className="mypay-rate">
            {view.payType === 'hourly' ? (
              view.rate > 0 ? (
                <>Your rate is {money(view.rate)}/h</>
              ) : (
                <>No hourly rate is set for you yet — ask your manager, or your hours will total nothing.</>
              )
            ) : (
              // Salary and day rate: say the basis, because the amount above
              // deliberately isn't the timesheet total and looks wrong without it.
              <>
                {view.rateLabel}
                {view.payBasis ? ` · ${view.payBasis}` : ''}
              </>
            )}
          </p>
        </section>

        {openShift ? (
          <p className="mypay-live">
            You&apos;re on the clock right now. That time isn&apos;t counted here until you clock out.
          </p>
        ) : null}

        {problem ? (
          <section className="mypay-flag">
            <strong>Worth checking</strong>
            <p>{problem}</p>
            {check.notIncluded.length > 0 ? (
              <ul className="mypay-flag-list">
                {check.notIncluded.map((line) => (
                  <li key={line.costId ?? line.loggedAt}>
                    {dayLabel(line.loggedAt)} · {line.description || 'Labor'} · {hoursLabel(line.hours)} — not in the approved total
                  </li>
                ))}
              </ul>
            ) : null}
            {check.adjusted.length > 0 ? (
              <ul className="mypay-flag-list">
                {check.adjusted.map(({ approved: line, nowHours }) => (
                  <li key={line.costId ?? line.loggedAt}>
                    {dayLabel(line.loggedAt)} · {line.description || 'Labor'} · approved at {hoursLabel(line.hours)}, now {hoursLabel(nowHours)}
                  </li>
                ))}
              </ul>
            ) : null}
            {check.removed.length > 0 ? (
              <ul className="mypay-flag-list">
                {check.removed.map((line) => (
                  <li key={line.costId ?? line.loggedAt}>
                    {dayLabel(line.loggedAt)} · {line.description || 'Labor'} · {hoursLabel(line.hours)} — the entry behind this is gone
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ) : null}

        <section className="field-section">
          <h2 className="field-section-title">
            {/* For anyone not paid by the hour these entries are the WORK, not
                the arithmetic behind the amount — calling them "what was
                approved" would imply they add up to it, and they don't. */}
            {view.payType !== 'hourly' ? 'Work logged' : approved.length > 0 ? 'What was approved' : 'This period'} ·{' '}
            {hoursLabel(approved.length > 0 ? check.approvedHours : check.loggedHours)}
          </h2>
          {showing.length === 0 ? (
            <p className="field-empty">
              Nothing logged in this period yet. Clock in from a job, or log your time on the job page.
            </p>
          ) : (
            <ul className="mypay-entries">
              {showing.map((line) => (
                <EntryRow
                  key={line.costId ?? `${line.loggedAt}-${line.hours}`}
                  line={line}
                  note={line.costId ? noteFor.get(line.costId) : undefined}
                  showMoney={view.payType === 'hourly'}
                />
              ))}
            </ul>
          )}
        </section>

        {check.loggedAfter.length > 0 ? (
          <section className="field-section">
            <h2 className="field-section-title">Logged since it was approved</h2>
            <p className="mypay-aside">
              These came in after your pay for this period was agreed, so they aren&apos;t in the amount above. They&apos;ll go
              into the next one.
            </p>
            <ul className="mypay-entries">
              {check.loggedAfter.map((line) => (
                <EntryRow key={line.costId ?? `${line.loggedAt}-later`} line={line} showMoney={view.payType === 'hourly'} />
              ))}
            </ul>
          </section>
        ) : null}

        <section className="field-section">
          <h2 className="field-section-title">Paid before</h2>
          {history.length === 0 ? (
            <p className="field-empty">
              {view.payAvailable
                ? 'Nothing recorded as paid yet. Once a period is paid it shows up here.'
                : 'Payment tracking isn’t switched on for this business yet.'}
            </p>
          ) : (
            <ul className="mypay-history">
              {history.map((row) => (
                <li key={row.id}>
                  <div>
                    <strong>{money(row.amount)}</strong>
                    <span>{row.rangeLabel} · {hoursLabel(row.hours)}</span>
                  </div>
                  <span className="mypay-history-when">
                    {row.paymentDate ? formatKeyDay(row.paymentDate) : '—'}
                    {row.paymentMethod ? ` · ${methodLabel(row.paymentMethod)}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="mypay-foot">
          Hours are counted {view.rules.periodMode === 'monthly' ? 'monthly' : view.rules.periodMode === 'biweekly' ? 'every two weeks' : 'weekly'}
          {payDay.dateLabel ? `, and this period is due ${payDay.dateLabel}` : ''}. Something look wrong? Talk to whoever
          runs your schedule — this screen is read-only.
        </p>

        <Link href="/field" className="mypay-back">‹ Back to my jobs</Link>
      </main>
      <FieldFooter navLogoTop={navLogoTop} />
    </>
  );
}
