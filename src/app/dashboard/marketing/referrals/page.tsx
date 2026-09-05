import { requireOwnerContext } from '@/lib/auth';
import { getLeadTriage, type LeadTriage } from '@/lib/leads';
import { buildReferralQueue, quickStopReferralStatus, type ReferralQueueLead, type ReferralRow } from '@/lib/referral-queue';
import { isReferralConfigured } from '@/lib/referral';
import { applyTestRecordFilter } from '@/lib/test-records';
import SaveButton from '@/components/save-button';
import MarketingNav from '../MarketingNav';
import { setReferralRewardAction, settleReferralAction, unsettleReferralAction } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Referrals' };

/**
 * Who sent you work, and who you still owe for it.
 *
 * The page holds no state of its own. Every row is derived from leads the board
 * already loads: triage.referredBy says who sent them, leads.status says
 * whether the work was won, and leads.referral_settled_at says whether the
 * referrer has been thanked. There is no referrals table because there is
 * nothing one would know that those three do not.
 *
 * THE REWARD IS TEXT, AND THAT IS THE PRODUCT DECISION. Nothing here moves
 * money. Home-services referral rewards are gift cards, cash and a discount
 * agreed on the phone, and there is no client-scoped ledger in this schema to
 * spend a number out of. So the engine makes the debt visible and undeniable,
 * and the owner says when they have settled it.
 */

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function ReferralTable({
  rows,
  action,
  actionLabel,
}: {
  rows: ReferralRow[];
  action?: (formData: FormData) => Promise<void>;
  actionLabel?: string;
}) {
  return (
    <div className="mkt-perf-table-wrap">
      <table className="mkt-perf-table">
        <thead>
          <tr>
            <th scope="col">Referred by</th>
            <th scope="col">Who they sent</th>
            <th scope="col">First got in touch</th>
            <th scope="col">{action ? '' : 'Thanked'}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.leadIds[0]}>
              <td>{row.referrerName}</td>
              <td>
                {row.referredName}
                {/* One person, two inquiries, one debt — say so rather than
                    showing them twice or silently collapsing to one. */}
                {row.leadIds.length > 1 ? <span className="mkt-perf-muted"> · {row.leadIds.length} inquiries</span> : null}
              </td>
              <td>{formatDay(row.introducedAt)}</td>
              <td>
                {action && actionLabel ? (
                  <form action={action}>
                    <input type="hidden" name="leadIds" value={row.leadIds.join(',')} />
                    <input type="hidden" name="stopIds" value={row.stopIds.join(',')} />
                    <SaveButton className="btn" pendingLabel="Saving…" savedLabel="Done ✓">
                      {actionLabel}
                    </SaveButton>
                  </form>
                ) : row.settledAt ? (
                  formatDay(row.settledAt)
                ) : (
                  <span className="mkt-perf-muted">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function ReferralsPage() {
  const { supabase, accountId } = await requireOwnerContext();

  // The referred leads only, and only the columns the queue reads.
  //
  // NOT listLeads: that is select('*') with no limit over every lead the account
  // has ever had, and this is the first page that structurally needs all of that
  // history — a referral made two years ago that books today is the thing it
  // exists to surface. Filtering in the database keeps that affordable, and if a
  // row cap is ever configured it matters more than affordability: truncation
  // drops the OLDEST rows, and this list sorts oldest-first, so the debts that
  // have been outstanding longest would be the ones to vanish.
  // BOTH RAILS. A referral link lands on a booking page that offers two paths,
  // and only one of them makes a lead — a Quick Stop is an extra_stop_requests
  // row that never becomes one. Its referrer rides in that row's `intake` blob
  // the way a lead's rides in `triage`, so this is two narrow reads rather than
  // a join, and the queue collapses them by person afterwards.
  // SEEDED ROWS ARE EXCLUDED, like every other owner-facing list.
  //
  // These are narrow reads rather than listLeads() -- that one is select(*)
  // with no limit -- and the cost of hand-rolling a read is that it does not
  // inherit the conventions the shared one carries. test_marker arrived after
  // this page was first written and defaults to ON everywhere else, so without
  // this the first probe script to stamp a referred lead puts a debt in front
  // of the owner for a customer who does not exist. A fake name on a list is
  // noise; a fake name on the list of people you owe money to is worse.
  const [{ data: leadRows, error: leadsError }, { data: stopRows, error: stopsError }, { data: accountRow }] = await Promise.all([
    applyTestRecordFilter(
      supabase
        .from('leads')
        .select('id, name, phone, email, status, client_id, created_at, referral_settled_at, triage')
        .eq('account_id', accountId)
        .is('deleted_at', null)
        .not('triage->>referredBy', 'is', null),
    ).order('created_at', { ascending: false }),
    applyTestRecordFilter(
      supabase
        .from('extra_stop_requests')
        .select('id, client_name, client_phone, client_email, status, client_id, created_at, referral_settled_at, intake')
        .eq('account_id', accountId)
        .not('intake->>referredBy', 'is', null),
    ).order('created_at', { ascending: false }),
    supabase.from('accounts').select('referral_reward').eq('id', accountId).maybeSingle(),
  ]);

  const reward = ((accountRow?.referral_reward as string | null) ?? '').trim();

  // The jsonb predicates above say the key is PRESENT; these say it is a string
  // worth trusting. Both, because they answer different questions.
  type ReferredLeadRow = ReferralQueueLead & { triage: LeadTriage | null };
  const referredBy = new Map<string, string>();
  const referred: ReferralQueueLead[] = ((leadRows ?? []) as unknown as ReferredLeadRow[]).filter((lead) => {
    const who = getLeadTriage(lead).referredBy;
    if (!who) return false;
    referredBy.set(lead.id, who);
    return true;
  });

  type StopRow = {
    id: string;
    client_name: string | null;
    client_phone: string | null;
    client_email: string | null;
    status: string;
    client_id: string | null;
    created_at: string;
    referral_settled_at: string | null;
    intake: { referredBy?: unknown } | null;
  };
  for (const stop of (stopRows ?? []) as unknown as StopRow[]) {
    const who = stop.intake?.referredBy;
    if (typeof who !== 'string' || !who) continue;
    referredBy.set(stop.id, who);
    referred.push({
      id: stop.id,
      source: 'quick_stop',
      name: stop.client_name,
      phone: stop.client_phone,
      email: stop.client_email,
      // Normalised into the lead vocabulary here, so the queue knows one
      // lifecycle rather than two. A Quick Stop is won once the customer has
      // paid the offer, which is what moves it to confirmed.
      status: quickStopReferralStatus(stop.status),
      client_id: stop.client_id,
      created_at: stop.created_at,
      referral_settled_at: stop.referral_settled_at,
    });
  }

  // One round trip for the referrers' names, and only when there are any.
  const referrerIds = [...new Set([...referredBy.values()])];
  const names = new Map<string, string>();
  if (referrerIds.length > 0) {
    // No marker filter here, and deliberately: this is a name lookup scoped to
    // ids that already came off the two filtered reads above, so it cannot add a
    // row to the queue. Filtering it could only blank a name.
    const { data: clientRows } = await supabase.from('clients').select('id, name').eq('account_id', accountId).in('id', referrerIds);
    for (const row of clientRows ?? []) names.set(row.id as string, (row.name as string) || '');
  }

  const queue = buildReferralQueue(
    referred,
    (lead) => referredBy.get(lead.id) ?? null,
    (clientId) => names.get(clientId) || null,
  );

  return (
    <main className="wide-shell workspace-shell">
      <MarketingNav />

      <section className="workspace-hero panel marketing-hero">
        <div className="workspace-hero-copy">
          <p className="eyebrow">Marketing · Referrals</p>
          <h1 className="workspace-title">Who sent you work</h1>
          <p className="workspace-lead">
            Every customer who sends someone your way gets their own link. When that person books, they show up here — so you can say thank
            you, and so you know it worked.
          </p>
        </div>
      </section>

      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading compact-heading">
          <h2>What you offer</h2>
        </div>
        <p className="workspace-details-copy">
          In your own words. It goes out with every referral link. Leave it empty and no referral links are sent at all.
        </p>
        <form action={setReferralRewardAction} className="form-grid">
          <div className="field full">
            <label htmlFor="reward">Your thank-you</label>
            <input id="reward" name="reward" type="text" maxLength={120} defaultValue={reward} placeholder="$50 off your next service" />
          </div>
          <SaveButton className="btn primary" pendingLabel="Saving…" savedLabel="Saved ✓">
            Save offer
          </SaveButton>
        </form>
        {!isReferralConfigured() ? (
          // The true thing rather than a vague one: signing is off at the
          // environment level, so links cannot be issued or checked at all, and
          // an offer saved here would promise something nothing can track yet.
          <p className="workspace-details-copy">
            Referral tracking isn&apos;t switched on for this environment yet, so links can&apos;t be issued. Anything already recorded here
            stays.
          </p>
        ) : null}
      </section>

      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading compact-heading">
          <h2>Owed a thank-you ({queue.owed.length})</h2>
        </div>
        {leadsError || stopsError ? (
          // An empty list and a failed read look identical, and one of them is a
          // page quietly telling the owner they owe nobody.
          <p className="empty-state">
            Couldn&apos;t load your referrals just now. If this keeps happening, the referrals migration may not have been run yet.
          </p>
        ) : queue.owed.length === 0 ? (
          <p className="empty-state">Nothing outstanding. Referred customers who book will land here.</p>
        ) : (
          <ReferralTable rows={queue.owed} action={settleReferralAction} actionLabel="Mark as thanked" />
        )}
      </section>

      {queue.waiting.length > 0 ? (
        <section className="panel workspace-section-card">
          <div className="section-heading workspace-section-heading compact-heading">
            <h2>Introduced, not booked yet ({queue.waiting.length})</h2>
          </div>
          <p className="workspace-details-copy">
            Nothing is owed until the work is won. These are here so you know the referral arrived at all.
          </p>
          <ReferralTable rows={queue.waiting} />
        </section>
      ) : null}

      {queue.thanked.length > 0 ? (
        <section className="panel workspace-section-card">
          <div className="section-heading workspace-section-heading compact-heading">
            <h2>Thanked ({queue.thanked.length})</h2>
          </div>
          <ReferralTable rows={queue.thanked} action={unsettleReferralAction} actionLabel="Reopen" />
        </section>
      ) : null}
    </main>
  );
}
